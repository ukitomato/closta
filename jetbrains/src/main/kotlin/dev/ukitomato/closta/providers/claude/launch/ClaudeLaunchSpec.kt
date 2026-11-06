package dev.ukitomato.closta.providers.claude.launch

/**
 * The parameters needed to launch one `claude` process. Pure data — no `com.intellij`, no process
 * creation. [toArgv] builds the command line; [env] carries secrets/auth **out of argv** (they must never be
 * world-readable through `ps` / `/proc/<pid>/cmdline`). The actual spawn is a [ProcessSpawner]
 * (native, or the WSL one, which hands [env] to WSL through interop).
 */
data class ClaudeLaunchSpec(
    val sessionId: String,
    val permissionMode: String? = null,
    val model: String? = null,
    /** The effort level the session starts with: adds `--effort <level>`. A level is never changed live. */
    val effort: String? = null,
    /**
     * The saved session to open instead of starting a new one: adds `--resume=<id>` and leaves out
     * `--session-id`, which the CLI takes together with `--resume` only to fork ([forkSession]). [sessionId] is then
     * the same id, as the id of a resumed session is the one it was saved under.
     */
    val resume: String? = null,
    /**
     * Open [resume] as a new session: `--resume=<resume> --fork-session --session-id=<sessionId>`, where
     * [sessionId] is the new id the host chose. Needs [resume].
     */
    val forkSession: Boolean = false,
    /**
     * Cut the forked conversation after this line of the saved record: `--resume-session-at=<uuid>`, right
     * after `--session-id`. The uuid is the parentUuid of the user line to rewind to, which the host reads from the
     * record. Needs [resume] and [forkSession].
     */
    val resumeSessionAt: String? = null,
    /** When true, adds `--permission-prompt-tool stdio` so permission prompts reach the host over stdin. */
    val permissionPromptToolStdio: Boolean = false,
    /**
     * Working directory for the process, as the IDE sees it. A WSL project's is a UNC path, which the WSL spawner
     * turns into the Linux path.
     */
    val cwd: String? = null,
    /** Environment for the process, incl. auth. Never placed on argv; carried by the spawner. */
    val env: Map<String, String> = emptyMap(),
) {
    /**
     * The `claude` command line. `--session-id`/`--resume` join their value with `=` (injection-safe, like the
     * SDK). Optional flags appear only when set. [env] is **not** part of argv.
     */
    fun toArgv(): List<String> {
        require(!forkSession || resume != null) { "forkSession needs resume (the session to fork)" }
        require(resumeSessionAt == null || (resume != null && forkSession)) {
            "resumeSessionAt needs resume and forkSession (the session to cut, opened as a new one)"
        }
        return buildList {
            add("claude")
            add("-p")
            add("--output-format")
            add("stream-json")
            add("--input-format")
            add("stream-json")
            add("--include-partial-messages")
            add("--verbose")
            // A new session names its id; a resumed one is opened by the id it was saved under (never both).
            if (resume != null) {
                add("--resume=$resume")
                if (forkSession) {
                    add("--fork-session")
                    add("--session-id=$sessionId")
                    resumeSessionAt?.let { add("--resume-session-at=$it") }
                }
            } else {
                add("--session-id=$sessionId")
            }
            permissionMode?.let {
                add("--permission-mode")
                add(it)
            }
            model?.let {
                add("--model")
                add(it)
            }
            effort?.let {
                add("--effort")
                add(it)
            }
            if (permissionPromptToolStdio) {
                add("--permission-prompt-tool")
                add("stdio")
            }
        }
    }

    /**
     * The environment the conversation's child gets: file checkpointing is switched on, and [env] is laid
     * over it (a name in [env] wins). `CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING` is neither added nor removed.
     */
    fun childEnv(): Map<String, String> = mapOf(CHECKPOINTING_ENV to "true") + env

    // The generated data-class toString would print [env] verbatim, so a stray log of a spec would leak
    // auth values. Redact env to its key count; the values never appear in any string form.
    override fun toString(): String =
        "ClaudeLaunchSpec(sessionId=$sessionId, permissionMode=$permissionMode, model=$model, effort=$effort, " +
            "resume=$resume, forkSession=$forkSession, resumeSessionAt=$resumeSessionAt, " +
            "permissionPromptToolStdio=$permissionPromptToolStdio, cwd=$cwd, " +
            "env=<${env.size} redacted>)"

    companion object {
        /** The CLI turns file checkpointing on when this is true (and the DISABLE name is absent). */
        const val CHECKPOINTING_ENV: String = "CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING"
    }
}
