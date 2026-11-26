#![allow(clippy::print_stdout)]
//! The checks that only Windows can answer, run by hand on Windows after a change to how a child
//! is started or stopped there. Each stage prints one `PASS <n> …` or `FAIL <n> …` line.
//!
//! 1. Win32: the fake CLI gets an argv holding the system prompt and the sandbox settings intact.
//!    1b. A child that ends at once starts and reports its exit code, every time (a child that
//!    ended before it could join its job is kept, not turned into a failure to start).
//! 2. Win32: killing a `tree` fake kills its child and grandchild (they leave `tasklist`).
//! 3. WSL: the Linux fake CLI, started through `wsl.exe`, gets its argv and an env value passed by
//!    `WSLENV`, and the value is not in its argv.
//! 4. WSL: the real `claude` answers `--version`, then `initialize` and `mcp_status` (no user
//!    message, so no model is called); 5 seconds after it is closed, no process in the
//!    distribution carries the launch's mark.
//!    4b. The same `claude`, killed with `destroy_forcibly` while stdin is still open (no chance to
//!    end by itself): 5 seconds later, no process in the distribution carries the mark.
//!    4c. The Linux fake CLI in `tree` mode (a child and a grandchild in Linux), killed the same
//!    way: 5 seconds later, none of them carries the mark. Whatever is left is listed and killed.
//!
//! `--hold` starts a `tree` fake, prints this process's pid, the child's and the grandchild's,
//! one per line, and sleeps: killing this process must take both with it (the job's handle
//! closes). Run it with `Start-Process -RedirectStandardOutput` and `taskkill /F` inside one
//! `powershell.exe`, waiting until the file holds the 3 pid lines (starting takes seconds): when a
//! `powershell.exe` started from WSL ends, what it started ends with it.
//!
//! `windows_smoke [--win-fake <path>] [--wsl-fake <linux path>] [--distro <name>] [--hold]`

#[cfg(not(windows))]
fn main() {}

#[cfg(windows)]
fn main() -> std::process::ExitCode {
    smoke::main()
}

#[cfg(windows)]
mod smoke {
    use std::collections::BTreeSet;
    use std::future::Future;
    use std::path::PathBuf;
    use std::process::ExitCode;
    use std::sync::Arc;
    use std::time::{Duration, Instant};

    use closta_model::AgentEvent;
    use closta_providers::claude::launch::env::SecretEnv;
    use closta_providers::claude::launch::spawn::{NativeProgram, NativeSpawner};
    use closta_providers::claude::launch::spec::{LaunchSpec, SANDBOX_SETTINGS, TOOL_USE_PROMPT};
    use closta_providers::claude::launch::version::check_version_within;
    use closta_providers::claude::launch::wsl::{WslLocation, WslProgram, WslSpawner};
    use closta_providers::claude::launch::{Launch, LaunchError};
    use closta_providers::claude::process::{AgentProcess, ProcessFailure, ProcessSpawner};
    use closta_providers::claude::protocol::{decode, encode};
    use futures_lite::{StreamExt, future};

    const FAKE_EXE: &str = "closta-fake-claude.exe";
    /// How many times stage 1b starts a child that ends at once.
    const QUICK_EXITS: usize = 20;
    const QUICK_EXIT_CODE: i32 = 3;
    const DEFAULT_DISTRO: &str = "Ubuntu-26.04";
    const SECRET_NAME: &str = "CLOSTA_SMOKE_SECRET";
    const SECRET_VALUE: &str = "s3cret value 日本";
    const MARK_NAME: &str = "CLOSTA_SMOKE_MARK";
    /// How long one stage may take before it fails.
    const STAGE_LIMIT: Duration = Duration::from_secs(30);
    /// How long killed processes get to leave `tasklist`.
    const GONE_WITHIN: Duration = Duration::from_secs(5);
    /// How long `claude` gets, once closed, before the distribution is searched for the mark.
    const SETTLE: Duration = Duration::from_secs(5);
    /// How long `--hold` sleeps at most, so that a hold nobody kills still ends.
    const HOLD_LIMIT: Duration = Duration::from_secs(120);
    /// Each fake that sleeps ends by itself after this, should a stage fail to kill it.
    const FAKE_LIFETIME_SECS: &str = "60";
    /// The Linux folder the WSL stages run in.
    const WSL_FOLDER: &str = "/tmp";

    struct Options {
        win_fake: PathBuf,
        wsl_fake: Option<String>,
        distro: String,
        hold: bool,
    }

    type Outcome = Result<String, String>;
    type Lines = futures_lite::stream::Boxed<Result<String, ProcessFailure>>;

    pub(super) fn main() -> ExitCode {
        let options = match options() {
            Ok(options) => options,
            Err(problem) => {
                println!("FAIL 0 {problem}");
                return ExitCode::FAILURE;
            }
        };
        if options.hold {
            return hold(&options);
        }
        let mut passed = true;
        let mut report = |stage: &str, outcome: Outcome| match outcome {
            Ok(note) => println!("PASS {stage} {note}"),
            Err(problem) => {
                passed = false;
                println!("FAIL {stage} {problem}");
            }
        };
        report("1", win32_argv(&options));
        report("1b", win32_quick_exit(&options));
        report("2", win32_tree(&options));
        match &options.wsl_fake {
            Some(wsl_fake) => report("3", wsl_argv(&options, wsl_fake)),
            None => println!("SKIP 3 no --wsl-fake was given"),
        }
        report("4", wsl_real_claude(&options));
        report("4b", wsl_real_claude_killed(&options));
        match &options.wsl_fake {
            Some(wsl_fake) => report("4c", wsl_tree_killed(&options, wsl_fake)),
            None => println!("SKIP 4c no --wsl-fake was given"),
        }
        println!("INFO {}", missing_folder(true));
        println!("INFO {}", missing_folder(false));
        if passed {
            ExitCode::SUCCESS
        } else {
            ExitCode::FAILURE
        }
    }

    fn options() -> Result<Options, String> {
        let mut win_fake = None;
        let mut wsl_fake = None;
        let mut distro = DEFAULT_DISTRO.to_owned();
        let mut hold = false;
        let mut args = std::env::args().skip(1);
        while let Some(arg) = args.next() {
            let mut value = || args.next().ok_or(format!("{arg} needs a value"));
            match arg.as_str() {
                "--win-fake" => win_fake = Some(PathBuf::from(value()?)),
                "--wsl-fake" => wsl_fake = Some(value()?),
                "--distro" => distro = value()?,
                "--hold" => hold = true,
                _ => return Err(format!("unknown argument {arg}")),
            }
        }
        let win_fake = match win_fake {
            Some(path) => path,
            None => default_win_fake()?,
        };
        Ok(Options {
            win_fake,
            wsl_fake,
            distro,
            hold,
        })
    }

    /// `closta-fake-claude.exe` next to this program, or in the folder above: cargo puts an
    /// example in `target\debug\examples` and the bin in `target\debug`.
    fn default_win_fake() -> Result<PathBuf, String> {
        let me =
            std::env::current_exe().map_err(|error| format!("no path of this program: {error}"))?;
        let beside = me.with_file_name(FAKE_EXE);
        if beside.is_file() {
            return Ok(beside);
        }
        Ok(me
            .parent()
            .and_then(|folder| folder.parent())
            .map_or(beside, |above| above.join(FAKE_EXE)))
    }

    fn env(pairs: &[(&str, &str)]) -> SecretEnv {
        let mut env = SecretEnv::default();
        for (name, value) in pairs {
            env.insert(*name, *value);
        }
        env
    }

    /// The arguments of a sandboxed launch: the system prompt and the `--settings` JSON among them.
    fn sandboxed_args() -> Result<Vec<String>, String> {
        let mut spec = LaunchSpec::new(&uuid::Uuid::new_v4().to_string());
        spec.sandbox = true;
        spec.permission_prompt_tool_stdio = true;
        let args = Launch::of(&spec)
            .map_err(|error| format!("no launch: {error}"))?
            .args;
        if !args.iter().any(|arg| arg == TOOL_USE_PROMPT)
            || !args.iter().any(|arg| arg == SANDBOX_SETTINGS)
        {
            return Err("the launch lacks the prompt or the settings".to_owned());
        }
        Ok(args)
    }

    fn native(options: &Options) -> Arc<dyn ProcessSpawner> {
        Arc::new(NativeSpawner::new(
            NativeProgram::Path(options.win_fake.clone()),
            BTreeSet::new(),
        ))
    }

    fn wsl(options: &Options, program: WslProgram) -> Arc<dyn ProcessSpawner> {
        let location = WslLocation {
            distro: options.distro.clone(),
            linux_path: WSL_FOLDER.to_owned(),
        };
        Arc::new(WslSpawner::new(location, program, BTreeSet::new()))
    }

    /// `work`, or `None` once `limit` has passed.
    async fn within<T>(limit: Duration, work: impl Future<Output = T>) -> Option<T> {
        future::or(async { Some(work.await) }, async {
            async_io::Timer::after(limit).await;
            None
        })
        .await
    }

    /// Starts `launch` off this thread, as the app does.
    fn spawn(
        spawner: &Arc<dyn ProcessSpawner>,
        launch: Launch,
    ) -> Result<Box<dyn AgentProcess>, String> {
        let spawner = Arc::clone(spawner);
        future::block_on(blocking::unblock(move || spawner.spawn(&launch)))
            .map_err(|failure| format!("not started: {failure}"))
    }

    /// Every stdout line until the process ends, with stderr drained alongside.
    fn all_lines(mut process: Box<dyn AgentProcess>) -> Result<Vec<String>, String> {
        let lines = process.take_stdout_lines();
        let drain = process.take_stderr_drain();
        let reading = async {
            let Some(mut lines) = lines else {
                return Err("no stdout".to_owned());
            };
            let mut read = Vec::new();
            while let Some(line) = lines.next().await {
                read.push(line.map_err(|failure| format!("stdout failed: {failure:?}"))?);
            }
            Ok(read)
        };
        let draining = async {
            if let Some(drain) = drain {
                drain.await;
            }
            future::pending().await
        };
        future::block_on(within(STAGE_LIMIT, future::race(reading, draining)))
            .unwrap_or_else(|| Err(format!("no end within {STAGE_LIMIT:?}")))
    }

    /// The one JSON line of the fake CLI's `argv` mode.
    fn echoed(lines: &[String]) -> Result<serde_json::Value, String> {
        let [line] = lines else {
            return Err(format!("{} lines instead of one", lines.len()));
        };
        serde_json::from_str(line).map_err(|error| format!("not JSON: {error}"))
    }

    fn argv_of(echo: &serde_json::Value) -> Vec<String> {
        echo["argv"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|arg| arg.as_str().map(str::to_owned))
            .collect()
    }

    fn win32_argv(options: &Options) -> Outcome {
        let args = sandboxed_args()?;
        let launch = Launch {
            args: args.clone(),
            env: env(&[("CLOSTA_FAKE_MODE", "argv")]),
            cwd: None,
        };
        let echo = echoed(&all_lines(spawn(&native(options), launch)?)?)?;
        if argv_of(&echo) != args {
            return Err("the argv arrived changed".to_owned());
        }
        Ok(format!(
            "win32 argv: {} arguments intact, the prompt and the settings among them",
            args.len()
        ))
    }

    /// Starts a child that ends at once, [`QUICK_EXITS`] times: each must start and end with its
    /// own exit code, whether or not it ended before it could join its job.
    fn win32_quick_exit(options: &Options) -> Outcome {
        let code = QUICK_EXIT_CODE.to_string();
        for round in 1..=QUICK_EXITS {
            let launch = Launch {
                args: Vec::new(),
                env: env(&[
                    ("CLOSTA_FAKE_MODE", "exit"),
                    ("CLOSTA_FAKE_EXIT", code.as_str()),
                ]),
                cwd: None,
            };
            let process = spawn(&native(options), launch)
                .map_err(|problem| format!("round {round}: {problem}"))?;
            match future::block_on(within(STAGE_LIMIT, process.wait())) {
                Some(Ok(ended)) if ended == QUICK_EXIT_CODE => {}
                other => return Err(format!("round {round}: ended with {other:?}")),
            }
        }
        Ok(format!(
            "win32 quick exit: {QUICK_EXITS} starts, each ended with {QUICK_EXIT_CODE}"
        ))
    }

    /// Whether `tasklist` lists `pid`.
    fn listed(pid: u32) -> Result<bool, String> {
        let output = std::process::Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/NH"])
            .output()
            .map_err(|error| format!("tasklist did not run: {error}"))?;
        let text = String::from_utf8_lossy(&output.stdout);
        let pid = pid.to_string();
        Ok(text
            .lines()
            .any(|line| line.split_whitespace().nth(1) == Some(pid.as_str())))
    }

    fn gone_within(pids: &[u32], limit: Duration) -> Result<bool, String> {
        let end = Instant::now() + limit;
        loop {
            let mut any = false;
            for pid in pids {
                any = any || listed(*pid)?;
            }
            if !any {
                return Ok(true);
            }
            if Instant::now() >= end {
                return Ok(false);
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    }

    /// A `tree` fake that stays, its pid and its grandchild's, read from its first line.
    fn start_tree(options: &Options) -> Result<(Box<dyn AgentProcess>, Lines, u32, u32), String> {
        let launch = Launch {
            args: Vec::new(),
            env: env(&[
                ("CLOSTA_FAKE_MODE", "tree"),
                ("CLOSTA_FAKE_LIFETIME_SECS", FAKE_LIFETIME_SECS),
            ]),
            cwd: None,
        };
        let mut process = spawn(&native(options), launch)?;
        let child = process.id().ok_or("no pid")?;
        let mut lines = process.take_stdout_lines().ok_or("no stdout")?;
        let first = future::block_on(within(STAGE_LIMIT, lines.next()));
        let grandchild = match first {
            Some(Some(Ok(line))) => line
                .trim()
                .parse::<u32>()
                .map_err(|_| "the first line is not a pid".to_owned())?,
            _ => return Err("no pid line from the tree".to_owned()),
        };
        Ok((process, lines, child, grandchild))
    }

    fn win32_tree(options: &Options) -> Outcome {
        let (process, lines, child, grandchild) = start_tree(options)?;
        if !listed(child)? || !listed(grandchild)? {
            return Err("the child or the grandchild is not running".to_owned());
        }
        process.destroy_forcibly();
        let code = future::block_on(within(STAGE_LIMIT, process.wait()));
        drop(lines);
        drop(process);
        if !gone_within(&[child, grandchild], GONE_WITHIN)? {
            return Err(format!("pid {child} or {grandchild} is still in tasklist"));
        }
        Ok(format!(
            "win32 tree: child {child} and grandchild {grandchild} gone (exit {code:?})"
        ))
    }

    fn wsl_argv(options: &Options, wsl_fake: &str) -> Outcome {
        let args = sandboxed_args()?;
        let launch = Launch {
            args: args.clone(),
            env: env(&[
                ("CLOSTA_FAKE_MODE", "argv"),
                ("CLOSTA_FAKE_ECHO_ENV", SECRET_NAME),
                (SECRET_NAME, SECRET_VALUE),
            ]),
            cwd: None,
        };
        let spawner = wsl(options, WslProgram::Path(wsl_fake.to_owned()));
        let echo = echoed(&all_lines(spawn(&spawner, launch)?)?)?;
        let argv = argv_of(&echo);
        if argv != args {
            return Err("the argv arrived changed".to_owned());
        }
        if echo["env"][SECRET_NAME].as_str() != Some(SECRET_VALUE) {
            return Err("the env value did not arrive as it was".to_owned());
        }
        if argv.iter().any(|arg| arg.contains("s3cret")) {
            return Err("the env value is in the argv".to_owned());
        }
        if echo["cwd"].as_str() != Some(WSL_FOLDER) {
            return Err("the fake did not run in the folder".to_owned());
        }
        Ok(format!(
            "wsl argv: {} arguments intact, the env value passed by WSLENV and not in argv",
            argv.len()
        ))
    }

    fn wsl_real_claude(options: &Options) -> Outcome {
        let mark = uuid::Uuid::new_v4().to_string();
        let mut spec = LaunchSpec::new(&uuid::Uuid::new_v4().to_string());
        spec.permission_prompt_tool_stdio = true;
        let mut launch = Launch::of(&spec).map_err(|error| format!("no launch: {error}"))?;
        launch
            .args
            .extend(["--strict-mcp-config", "--setting-sources", ""].map(str::to_owned));
        launch.env.insert(MARK_NAME, mark.as_str());
        let spawner = wsl(options, WslProgram::Claude);

        let checking = {
            let spawner = Arc::clone(&spawner);
            let launch = launch.version_check();
            blocking::unblock(move || spawner.spawn(&launch))
        };
        let version = future::block_on(check_version_within(checking, STAGE_LIMIT))
            .map_err(|failure| format!("claude --version failed: {failure:?}"))?;

        let mut process = spawn(&spawner, launch)?;
        let mut lines = process.take_stdout_lines().ok_or("no stdout")?;
        let drain = process.take_stderr_drain().ok_or("no stderr")?;
        let process: Arc<dyn AgentProcess> = Arc::from(process);
        let talk = async {
            process
                .write_stdin(encode::initialize("i1", &[], true))
                .await
                .map_err(|error| format!("initialize not written: {error}"))?;
            process
                .write_stdin(encode::mcp_status("m1"))
                .await
                .map_err(|error| format!("mcp_status not written: {error}"))?;
            let mut answered = BTreeSet::new();
            while answered.len() < 2 {
                let line = lines
                    .next()
                    .await
                    .ok_or("stdout ended before both answers")?
                    .map_err(|failure| format!("stdout failed: {failure:?}"))?;
                if let AgentEvent::ControlResponse {
                    request_id: Some(id),
                    ..
                } = decode(&line)
                    && (id == "i1" || id == "m1")
                {
                    answered.insert(id);
                }
            }
            process.destroy();
            process
                .wait()
                .await
                .map_err(|error| format!("no exit code: {error}"))
        };
        let draining = async {
            drain.await;
            future::pending().await
        };
        let ended = future::block_on(within(STAGE_LIMIT, future::race(talk, draining)));
        process.destroy_forcibly();
        drop(process);
        let code = ended
            .ok_or_else(|| format!("claude did not answer and end within {STAGE_LIMIT:?}"))??;

        none_left_after_kill(&options.distro, &mark)?;
        Ok(format!(
            "wsl claude {version}: initialize and mcp_status answered, exit {code}, none left after {SETTLE:?}"
        ))
    }

    /// A `claude` with the mark, killed while running: no stdin closed, no chance to end by itself.
    fn wsl_real_claude_killed(options: &Options) -> Outcome {
        let mark = uuid::Uuid::new_v4().to_string();
        let mut spec = LaunchSpec::new(&uuid::Uuid::new_v4().to_string());
        spec.permission_prompt_tool_stdio = true;
        let mut launch = Launch::of(&spec).map_err(|error| format!("no launch: {error}"))?;
        launch
            .args
            .extend(["--strict-mcp-config", "--setting-sources", ""].map(str::to_owned));
        launch.env.insert(MARK_NAME, mark.as_str());
        let mut process = spawn(&wsl(options, WslProgram::Claude), launch)?;
        let mut lines = process.take_stdout_lines().ok_or("no stdout")?;
        let drain = process.take_stderr_drain().ok_or("no stderr")?;
        // Answered `initialize` means claude is up, with whatever it starts at its start.
        let ready = async {
            process
                .write_stdin(encode::initialize("i1", &[], true))
                .await
                .map_err(|error| format!("initialize not written: {error}"))?;
            loop {
                let line = lines
                    .next()
                    .await
                    .ok_or("stdout ended before the answer")?
                    .map_err(|failure| format!("stdout failed: {failure:?}"))?;
                if let AgentEvent::ControlResponse {
                    request_id: Some(id),
                    ..
                } = decode(&line)
                    && id == "i1"
                {
                    return Ok::<(), String>(());
                }
            }
        };
        let draining = async {
            drain.await;
            future::pending().await
        };
        let answered = future::block_on(within(STAGE_LIMIT, future::race(ready, draining)));
        process.destroy_forcibly();
        let code = future::block_on(within(STAGE_LIMIT, process.wait()));
        drop(lines);
        drop(process);
        answered.ok_or_else(|| format!("claude did not answer within {STAGE_LIMIT:?}"))??;
        none_left_after_kill(&options.distro, &mark)?;
        Ok(format!(
            "wsl claude killed with stdin open: wsl.exe exit {code:?}, none left after {SETTLE:?}"
        ))
    }

    /// The Linux fake in `tree` mode with the mark, killed while its child and grandchild run.
    fn wsl_tree_killed(options: &Options, wsl_fake: &str) -> Outcome {
        let mark = uuid::Uuid::new_v4().to_string();
        let launch = Launch {
            args: Vec::new(),
            env: env(&[
                ("CLOSTA_FAKE_MODE", "tree"),
                ("CLOSTA_FAKE_LIFETIME_SECS", FAKE_LIFETIME_SECS),
                (MARK_NAME, mark.as_str()),
            ]),
            cwd: None,
        };
        let spawner = wsl(options, WslProgram::Path(wsl_fake.to_owned()));
        let mut process = spawn(&spawner, launch)?;
        let mut lines = process.take_stdout_lines().ok_or("no stdout")?;
        let first = future::block_on(within(STAGE_LIMIT, lines.next()));
        let before = marked_processes(&options.distro, &mark)?;
        process.destroy_forcibly();
        let code = future::block_on(within(STAGE_LIMIT, process.wait()));
        drop(lines);
        drop(process);
        let Some(Some(Ok(grandchild))) = first else {
            return Err("no pid line from the tree".to_owned());
        };
        let running = before.lines().count();
        none_left_after_kill(&options.distro, &mark)?;
        Ok(format!(
            "wsl tree killed: {running} marked processes ran (grandchild {}), wsl.exe exit {code:?}, none left after {SETTLE:?}",
            grandchild.trim()
        ))
    }

    /// Waits [`SETTLE`] after a close or a kill, then fails listing what in the distribution still carries `mark` (pid and
    /// name), after killing it so that nothing outlives the run.
    fn none_left_after_kill(distro: &str, mark: &str) -> Result<(), String> {
        std::thread::sleep(SETTLE);
        let left = marked_processes(distro, mark)?;
        if left.is_empty() {
            return Ok(());
        }
        let pids: Vec<&str> = left
            .lines()
            .map(|line| line.split(' ').next().unwrap_or(""))
            .collect();
        let kill = format!("kill -9 {} 2>/dev/null", pids.join(" "));
        _ = std::process::Command::new("wsl.exe")
            .args(["-d", distro, "--exec", "/bin/sh", "-c", &kill])
            .output();
        Err(format!(
            "left in WSL {SETTLE:?} after the kill (now killed): {}",
            left.lines().collect::<Vec<_>>().join(", ")
        ))
    }

    /// The processes in the distribution whose environment holds the mark, one `<pid> <name>` a
    /// line.
    fn marked_processes(distro: &str, mark: &str) -> Result<String, String> {
        let script = format!(
            "for f in $(grep -l \"{MARK_NAME}={mark}\" /proc/[0-9]*/environ 2>/dev/null); do \
             p=${{f#/proc/}}; p=${{p%/environ}}; echo \"$p $(cat /proc/$p/comm 2>/dev/null)\"; done"
        );
        let output = std::process::Command::new("wsl.exe")
            .args(["-d", distro, "--exec", "/bin/sh", "-c", &script])
            .output()
            .map_err(|error| format!("wsl.exe did not run: {error}"))?;
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_owned())
    }

    /// What a user would be told when the working folder is missing, with `claude.exe` on the
    /// Windows `PATH` as it is (`claude_on_path`) or with no `PATH` at all (claude not installed).
    /// Nothing starts: only the failure is shown.
    fn missing_folder(claude_on_path: bool) -> String {
        let mut spawner = NativeSpawner::new(NativeProgram::Claude, BTreeSet::new());
        if !claude_on_path {
            let without_path = std::env::vars_os()
                .filter(|(name, _)| !name.eq_ignore_ascii_case("PATH"))
                .collect();
            spawner = spawner.with_inherited(without_path);
        }
        let launch = Launch {
            args: vec!["--version".to_owned()],
            env: SecretEnv::default(),
            cwd: Some(r"C:\closta-smoke-no-such-folder".to_owned()),
        };
        let case = if claude_on_path {
            "a missing folder, claude.exe on PATH"
        } else {
            "a missing folder, no claude installed"
        };
        match spawner.spawn(&launch) {
            Ok(process) => {
                process.destroy_forcibly();
                format!("{case}: it started")
            }
            Err(failure) => {
                let kind = match failure {
                    LaunchError::WorkingDirectoryMissing { .. } => "WorkingDirectoryMissing",
                    LaunchError::CommandNotFound => "CommandNotFound",
                    LaunchError::ScriptOnly => "ScriptOnly",
                    _ => "another failure",
                };
                format!("{case}: {kind} ({failure})")
            }
        }
    }

    fn hold(options: &Options) -> ExitCode {
        let (process, _lines, child, grandchild) = match start_tree(options) {
            Ok(started) => started,
            Err(problem) => {
                println!("FAIL 5 {problem}");
                return ExitCode::FAILURE;
            }
        };
        println!("{}", std::process::id());
        println!("{child}");
        println!("{grandchild}");
        std::thread::sleep(HOLD_LIMIT);
        drop(process);
        ExitCode::SUCCESS
    }
}
