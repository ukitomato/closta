//! Reading the `--perf-log` CSV the measuring exe writes (`elapsed_ms,metric,value`, the time
//! since the exe started) and holding it against the budgets. The exe writes only raw values;
//! the p99s and the budgets are here, where they can be tested without a window.

use anyhow::bail;

/// One line of the CSV.
#[derive(Clone, PartialEq, Debug)]
pub struct Row {
    pub elapsed_ms: f64,
    pub metric: String,
    pub value: f64,
}

/// A whole CSV, in the order it was written.
#[derive(Clone, PartialEq, Debug, Default)]
pub struct PerfLog {
    pub rows: Vec<Row>,
}

impl PerfLog {
    /// Reads the CSV; the header and blank lines are skipped. A bad line names its number only.
    pub fn parse(text: &str) -> anyhow::Result<PerfLog> {
        let mut rows = Vec::new();
        for (at, line) in text.lines().enumerate() {
            let line = line.trim();
            if line.is_empty() || line == HEADER {
                continue;
            }
            let row = (|| {
                let mut columns = line.split(',');
                let elapsed_ms = columns.next()?.parse().ok()?;
                let metric = columns.next()?.to_owned();
                let value = columns.next()?.parse().ok()?;
                columns.next().is_none().then_some(Row {
                    elapsed_ms,
                    metric,
                    value,
                })
            })();
            match row {
                Some(row) => rows.push(row),
                None => bail!(
                    "the perf log's line {} is not elapsed_ms,metric,value",
                    at + 1
                ),
            }
        }
        Ok(PerfLog { rows })
    }

    fn of<'a>(&'a self, metric: &'a str) -> impl Iterator<Item = &'a Row> + 'a {
        self.rows.iter().filter(move |row| row.metric == metric)
    }

    /// When `metric` was first written.
    fn first(&self, metric: &str) -> Option<f64> {
        self.of(metric).map(|row| row.elapsed_ms).reduce(f64::min)
    }

    /// The value `metric` was last written with.
    fn last(&self, metric: &str) -> Option<f64> {
        self.of(metric).last().map(|row| row.value)
    }

    fn values(&self, metric: &str) -> Vec<f64> {
        self.of(metric).map(|row| row.value).collect()
    }

    /// The values of `metric` written within `window`.
    fn values_within(&self, metric: &str, window: (f64, f64)) -> Vec<f64> {
        self.of(metric)
            .filter(|row| within(row.elapsed_ms, window))
            .map(|row| row.value)
            .collect()
    }

    /// The frame times of the frames whose drawing started within `window`.
    fn frames_within(&self, window: (f64, f64)) -> Vec<f64> {
        self.of(FRAME)
            .filter(|row| within(row.elapsed_ms - row.value, window))
            .map(|row| row.value)
            .collect()
    }

    /// "Opening the large conversation": when the first frame drawn after the refresh that
    /// followed the replay's end was presented.
    fn open_ms(&self) -> Option<f64> {
        let refreshed = self.first("refreshed")?;
        self.of(FRAME)
            .filter(|row| row.elapsed_ms - row.value > refreshed)
            .map(|row| row.elapsed_ms)
            .reduce(f64::min)
    }

    /// The span the scene's frames are judged in: the scroll for the synthetic conversation,
    /// the first update to the replay's end for the stream.
    fn frame_window(&self, scene: PerfScene) -> Option<(f64, f64)> {
        match scene {
            PerfScene::Synth => Some((self.first("scroll_start")?, self.first("scroll_end")?)),
            PerfScene::Stream => Some((self.first("update_ms")?, self.first("ready")?)),
            PerfScene::Idle => None,
        }
    }
}

const HEADER: &str = "elapsed_ms,metric,value";
const FRAME: &str = "frame_ms";

fn within(at: f64, (start, end): (f64, f64)) -> bool {
    start <= at && at <= end
}

/// The 99th percentile: the values sorted, the one at `len * 99 / 100`.
pub fn p99(values: &[f64]) -> Option<f64> {
    let mut sorted = values.to_vec();
    sorted.sort_by(f64::total_cmp);
    sorted.get(sorted.len() * 99 / 100).copied()
}

/// A measured scene of `cargo xtask win-perf`.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum PerfScene {
    /// The synthetic conversation: opened, left alone, then scrolled from the tail to the head.
    Synth,
    /// The streaming reply played at 30 ms a line.
    Stream,
    /// Three slots open and doing nothing.
    Idle,
}

impl PerfScene {
    pub const ALL: [PerfScene; 3] = [PerfScene::Synth, PerfScene::Stream, PerfScene::Idle];

    pub fn name(self) -> &'static str {
        match self {
            PerfScene::Synth => "synth",
            PerfScene::Stream => "stream",
            PerfScene::Idle => "idle",
        }
    }

    pub fn from_name(name: &str) -> Option<PerfScene> {
        PerfScene::ALL
            .into_iter()
            .find(|scene| scene.name() == name)
    }
}

/// How a value stands against its budget.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Outcome {
    Pass,
    Fail,
    /// Neither passed nor failed: the run timed out, or no frame was presented in the window.
    Held,
}

/// One budget of a scene and the value measured for it.
#[derive(Clone, PartialEq, Debug)]
pub struct Verdict {
    pub name: &'static str,
    pub value: Option<f64>,
    pub budget: f64,
    pub outcome: Outcome,
}

/// Opening the synthetic conversation, from the exe's start: at most 2 s.
const OPEN_MS: f64 = 2000.0;
/// One update (the shell's diff and the rows): p99 at most 5 ms.
const UPDATE_MS: f64 = 5.0;
/// Drawing start to presented: p99 at most 16 ms.
const FRAME_MS: f64 = 16.0;
/// The share of one core used while idle: under 3%. GPUI on Windows wakes the window at every
/// vsync even when nothing is drawn, which alone takes about 1–3% of a core.
const IDLE_CPU: f64 = 0.03;
/// The working set after the scroll: under 400 MB.
const WORKING_SET_MB: f64 = 400.0;

/// Within `budget`, at most it or (`strict`) under it; a missing value fails.
fn judge(name: &'static str, value: Option<f64>, budget: f64, strict: bool) -> Verdict {
    let pass = value.is_some_and(|value| {
        if strict {
            value < budget
        } else {
            value <= budget
        }
    });
    Verdict {
        name,
        value,
        budget,
        outcome: if pass { Outcome::Pass } else { Outcome::Fail },
    }
}

/// The scene's budgets against `log`.
pub fn verdicts(scene: PerfScene, log: &PerfLog) -> Vec<Verdict> {
    let window = log.frame_window(scene);
    let frames = window.map(|window| log.frames_within(window));
    let frame = || {
        let mut verdict = judge(FRAME, frames.as_deref().and_then(p99), FRAME_MS, false);
        // No window means a marker is missing: that fails, as any missing value does.
        if window.is_none() {
            verdict.outcome = Outcome::Fail;
        }
        verdict
    };
    let update = || judge("update_ms", p99(&log.values("update_ms")), UPDATE_MS, false);
    let mut judged = match scene {
        PerfScene::Synth => vec![
            judge("open_ms", log.open_ms(), OPEN_MS, false),
            update(),
            frame(),
            judge(
                "working_set_mb",
                log.last("working_set_mb"),
                WORKING_SET_MB,
                true,
            ),
        ],
        PerfScene::Stream => vec![update(), frame()],
        PerfScene::Idle => {
            let share = match (log.last("idle_cpu_ms"), log.last("idle_wall_ms")) {
                (Some(cpu), Some(wall)) if wall > 0.0 => Some(cpu / wall),
                _ => None,
            };
            vec![judge("idle_cpu", share, IDLE_CPU, true)]
        }
    };
    let timed_out = log.of("timeout").next().is_some();
    let no_frames = frames.as_ref().is_some_and(Vec::is_empty);
    if timed_out || no_frames {
        for verdict in &mut judged {
            verdict.outcome = Outcome::Held;
        }
    }
    judged
}

/// The values shown beside the verdicts and never judged: the p99 of the dirty-to-present
/// times and of the prefetches in the scene's window.
pub fn references(scene: PerfScene, log: &PerfLog) -> Vec<(&'static str, Option<f64>)> {
    let window = log.frame_window(scene);
    ["dirty_ms", "prefetch_ms"]
        .into_iter()
        .map(|metric| {
            let values = window.map(|window| log.values_within(metric, window));
            (metric, values.as_deref().and_then(p99))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn log(lines: &[&str]) -> PerfLog {
        let mut text = vec![HEADER];
        text.extend_from_slice(lines);
        PerfLog::parse(&text.join("\n")).unwrap()
    }

    fn verdict<'a>(verdicts: &'a [Verdict], name: &str) -> &'a Verdict {
        verdicts
            .iter()
            .find(|verdict| verdict.name == name)
            .unwrap_or_else(|| panic!("no verdict {name} in {verdicts:?}"))
    }

    /// A synthetic run within every budget: ready at 900, refreshed at 1000, the scroll from
    /// 13000 to 15000.
    fn synth(extra: &[&str]) -> PerfLog {
        let mut lines = vec![
            "500,update_ms,1.5",
            "900,ready,1",
            "950,update_ms,3.0",
            "1000,refreshed,1",
            "1000,rows,4000",
            "1030,frame_ms,5",
            "1030,dirty_ms,12",
            "3000,idle_cpu_ms,20",
            "3000,idle_wall_ms,10000",
            "13000,scroll_start,1",
            "13100,frame_ms,9",
            "13100,prefetch_ms,1.5",
            "14000,frame_ms,11",
            "14000,dirty_ms,20",
            "15000,scroll_end,1",
            "15000,working_set_mb,250",
        ];
        lines.extend_from_slice(extra);
        log(&lines)
    }

    #[test]
    fn parse_reads_the_three_columns_and_skips_the_header() {
        let log =
            PerfLog::parse(&format!("{HEADER}\n12.5,update_ms,0.75\n\n13,ready,1\n")).unwrap();
        assert_eq!(
            log.rows,
            [
                Row {
                    elapsed_ms: 12.5,
                    metric: "update_ms".to_owned(),
                    value: 0.75,
                },
                Row {
                    elapsed_ms: 13.0,
                    metric: "ready".to_owned(),
                    value: 1.0,
                },
            ]
        );
        let error = PerfLog::parse(&format!("{HEADER}\n1,update_ms\n")).unwrap_err();
        assert!(error.to_string().contains("line 2"), "{error}");
        assert!(PerfLog::parse(&format!("{HEADER}\n1,update_ms,fast\n")).is_err());
        assert!(PerfLog::parse(&format!("{HEADER}\nsoon,update_ms,1\n")).is_err());
        assert_eq!(PerfLog::parse("").unwrap(), PerfLog::default());
    }

    #[test]
    fn p99_picks_the_99th_percentile() {
        assert_eq!(p99(&[]), None);
        assert_eq!(p99(&[3.0]), Some(3.0));
        let hundred: Vec<f64> = (1..=100).rev().map(f64::from).collect();
        assert_eq!(p99(&hundred), Some(100.0));
        let two_hundred: Vec<f64> = (1..=200).rev().map(f64::from).collect();
        assert_eq!(p99(&two_hundred), Some(199.0));
        assert_eq!(p99(&[5.0, 1.0, 9.0]), Some(9.0));
    }

    #[test]
    fn a_missing_metric_fails_instead_of_passing() {
        let all = verdicts(PerfScene::Synth, &synth(&[]));
        assert!(all.iter().all(|it| it.outcome == Outcome::Pass), "{all:?}");

        let without = PerfLog {
            rows: synth(&[])
                .rows
                .into_iter()
                .filter(|row| row.metric != "working_set_mb" && row.metric != "update_ms")
                .collect(),
        };
        let judged = verdicts(PerfScene::Synth, &without);
        for name in ["working_set_mb", "update_ms"] {
            let missing = verdict(&judged, name);
            assert_eq!(missing.value, None);
            assert_eq!(missing.outcome, Outcome::Fail);
        }

        let idle = verdicts(PerfScene::Idle, &log(&["1000,refreshed,1"]));
        assert_eq!(verdict(&idle, "idle_cpu").outcome, Outcome::Fail);

        // A scroll that never started has no window to count frames in.
        let unscrolled = PerfLog {
            rows: synth(&[])
                .rows
                .into_iter()
                .filter(|row| row.metric != "scroll_start")
                .collect(),
        };
        let judged = verdicts(PerfScene::Synth, &unscrolled);
        assert_eq!(verdict(&judged, "frame_ms").outcome, Outcome::Fail);
    }

    #[test]
    fn no_frames_or_a_timeout_holds_the_scene() {
        let timed_out = verdicts(PerfScene::Synth, &synth(&["180000,timeout,1"]));
        assert!(!timed_out.is_empty());
        assert!(
            timed_out.iter().all(|it| it.outcome == Outcome::Held),
            "{timed_out:?}"
        );

        let without_scroll_frames = PerfLog {
            rows: synth(&[])
                .rows
                .into_iter()
                .filter(|row| !(row.metric == "frame_ms" && row.elapsed_ms > 13000.0))
                .collect(),
        };
        let held = verdicts(PerfScene::Synth, &without_scroll_frames);
        assert!(
            held.iter().all(|it| it.outcome == Outcome::Held),
            "{held:?}"
        );

        // A stream whose frames all came after the replay's end.
        let stream = log(&[
            "100,update_ms,1",
            "4000,ready,1",
            "4100,refreshed,1",
            "4200,frame_ms,3",
        ]);
        let held = verdicts(PerfScene::Stream, &stream);
        assert!(
            held.iter().all(|it| it.outcome == Outcome::Held),
            "{held:?}"
        );

        let idle = verdicts(
            PerfScene::Idle,
            &log(&[
                "180000,timeout,1",
                "3000,idle_cpu_ms,1",
                "3000,idle_wall_ms,10000",
            ]),
        );
        assert_eq!(verdict(&idle, "idle_cpu").outcome, Outcome::Held);
    }

    #[test]
    fn open_is_the_first_frame_drawn_after_the_refresh() {
        // Presented after the refresh but drawn before it; then two frames written out of order.
        let open = synth(&["1012,frame_ms,15", "1050,frame_ms,3"]);
        let judged = verdicts(PerfScene::Synth, &open);
        assert_eq!(verdict(&judged, "open_ms").value, Some(1030.0));

        let late = synth(&["999,frame_ms,1"])
            .rows
            .into_iter()
            .map(|mut row| {
                if row.metric == "refreshed" {
                    row.elapsed_ms = 2500.0;
                }
                row
            })
            .collect();
        let judged = verdicts(PerfScene::Synth, &PerfLog { rows: late });
        let open = verdict(&judged, "open_ms");
        assert_eq!(open.value, Some(13100.0));
        assert_eq!(open.budget, 2000.0);
        assert_eq!(open.outcome, Outcome::Fail);
    }

    #[test]
    fn dirty_and_prefetch_times_are_shown_but_not_judged() {
        let slow = synth(&["13500,dirty_ms,40", "13500,prefetch_ms,30"]);
        let judged = verdicts(PerfScene::Synth, &slow);
        assert!(
            judged.iter().all(|it| it.outcome == Outcome::Pass),
            "{judged:?}"
        );
        assert!(
            judged
                .iter()
                .all(|it| it.name != "dirty_ms" && it.name != "prefetch_ms")
        );
        assert_eq!(
            references(PerfScene::Synth, &slow),
            [("dirty_ms", Some(40.0)), ("prefetch_ms", Some(30.0))]
        );
        // Outside the scroll, the open's dirty time is not the scroll's.
        assert_eq!(
            references(PerfScene::Synth, &synth(&[])),
            [("dirty_ms", Some(20.0)), ("prefetch_ms", Some(1.5))]
        );
        assert_eq!(
            references(PerfScene::Stream, &log(&["1,update_ms,1", "9,ready,1"])),
            [("dirty_ms", None), ("prefetch_ms", None)]
        );
    }

    #[test]
    fn frames_are_counted_in_their_scenes_window() {
        // A slow frame while opening is outside the scroll's window.
        let opening = synth(&["1200,frame_ms,80"]);
        let judged = verdicts(PerfScene::Synth, &opening);
        let frames = verdict(&judged, "frame_ms");
        assert_eq!(frames.value, Some(11.0));
        assert_eq!(frames.budget, 16.0);
        assert_eq!(frames.outcome, Outcome::Pass);

        let slow_scroll = synth(&["14500,frame_ms,17"]);
        let judged = verdicts(PerfScene::Synth, &slow_scroll);
        assert_eq!(verdict(&judged, "frame_ms").outcome, Outcome::Fail);

        // The stream's window runs from its first update to the replay's end.
        let stream = log(&[
            "50,frame_ms,40",
            "100,update_ms,1",
            "400,frame_ms,7",
            "700,update_ms,6",
            "900,frame_ms,8",
            "3000,ready,1",
            "3100,refreshed,1",
            "3200,frame_ms,30",
        ]);
        let judged = verdicts(PerfScene::Stream, &stream);
        assert_eq!(verdict(&judged, "frame_ms").value, Some(8.0));
        assert_eq!(verdict(&judged, "frame_ms").outcome, Outcome::Pass);
        let updates = verdict(&judged, "update_ms");
        assert_eq!(updates.value, Some(6.0));
        assert_eq!(updates.budget, 5.0);
        assert_eq!(updates.outcome, Outcome::Fail);
    }

    #[test]
    fn idle_cpu_is_a_share_of_one_core() {
        let quiet = verdicts(
            PerfScene::Idle,
            &log(&[
                "1000,refreshed,1",
                "12000,idle_cpu_ms,290",
                "12000,idle_wall_ms,10000",
            ]),
        );
        let idle = verdict(&quiet, "idle_cpu");
        assert_eq!(idle.value, Some(0.029));
        assert_eq!(idle.budget, 0.03);
        assert_eq!(idle.outcome, Outcome::Pass);

        // 3.2% of one core is over, however many cores the machine has.
        let busy = verdicts(
            PerfScene::Idle,
            &log(&[
                "1000,refreshed,1",
                "12000,idle_cpu_ms,320",
                "12000,idle_wall_ms,10000",
            ]),
        );
        assert_eq!(verdict(&busy, "idle_cpu").outcome, Outcome::Fail);
        assert_eq!(
            verdicts(
                PerfScene::Idle,
                &log(&["1,idle_cpu_ms,1", "1,idle_wall_ms,0"])
            )[0]
            .outcome,
            Outcome::Fail
        );
    }
}
