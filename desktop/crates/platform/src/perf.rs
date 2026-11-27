//! Measuring the replay build: the CSV of times and counts (`--perf-log`, `elapsed_ms,metric,value`
//! with the time since the exe started), the frame times the profiler's journal holds, and the
//! process's own CPU time and working set. Only raw values are written; `cargo xtask win-perf`
//! takes the p99s and holds them against the budgets. Nothing but times and counts goes in.

use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use closta_shell::slot::SlotId;
#[cfg(feature = "profiler")]
use gpui_kit::journal::{ForegroundJournalCollector, IntervalBoundary, IntervalSealer};

#[cfg(windows)]
pub use os::{cpu_time, working_set_bytes};

/// The CSV the measuring run writes, one line at a time.
pub struct PerfLog {
    file: File,
}

impl PerfLog {
    /// Creates the file and writes its header.
    pub fn create(path: &Path) -> io::Result<PerfLog> {
        let mut file = File::create(path)?;
        file.write_all(b"elapsed_ms,metric,value\n")?;
        Ok(PerfLog { file })
    }

    /// Writes one line straight to the file. A failed write is let go: the log never stops the
    /// app, and a CSV that lacks a value fails its verdict.
    pub fn record(&mut self, elapsed: Duration, metric: &str, value: f64) {
        let line = format!("{:.3},{metric},{value}\n", elapsed.as_secs_f64() * 1000.0);
        _ = self.file.write_all(line.as_bytes());
    }
}

/// The frames the profiler's journal saw presented.
#[cfg(feature = "profiler")]
struct Frames {
    collector: ForegroundJournalCollector,
    sealer: IntervalSealer,
}

/// One presented frame: when it was on screen, how long from the start of its drawing, and
/// from when it first became dirty (when the journal knows).
#[cfg(feature = "profiler")]
struct Presented {
    at: Instant,
    frame: Duration,
    dirty: Option<Duration>,
}

#[cfg(feature = "profiler")]
impl Frames {
    fn new(cx: &gpui_kit::App) -> Frames {
        Frames {
            collector: cx.foreground_journal().collector(),
            sealer: IntervalSealer::new(Instant::now()),
        }
    }

    /// The frames presented since the last call, and how many journal entries were lost.
    fn presented(&mut self) -> (Vec<Presented>, u64) {
        let drained = self.collector.collect_unseen();
        let lost = drained.lost;
        self.sealer.note_lost(lost);
        let presented = self
            .sealer
            .push_entries(drained.entries)
            .into_iter()
            .filter_map(|snapshot| match snapshot.boundary {
                IntervalBoundary::Presented(presented) => Some(Presented {
                    at: presented.presentation.present_end,
                    frame: presented
                        .presentation
                        .present_end
                        .saturating_duration_since(presented.frame.draw_start),
                    dirty: presented.dirty_to_present_duration(),
                }),
                _ => None,
            })
            .collect();
        (presented, lost)
    }
}

/// Where the idle window starts: the time and the CPU time used so far.
pub(crate) struct IdleStart {
    at: Instant,
    #[cfg(windows)]
    cpu: Duration,
}

impl IdleStart {
    pub(crate) fn now() -> IdleStart {
        IdleStart {
            at: Instant::now(),
            #[cfg(windows)]
            cpu: cpu_time(),
        }
    }
}

/// A span measured from a user's act to the first frame drawn after the screen showed its
/// result: `began` is the act, `shown` is when the result reached the screen's state.
#[derive(Clone, Copy)]
#[cfg_attr(not(feature = "profiler"), allow(dead_code))]
struct Span {
    began: Instant,
    shown: Option<Instant>,
}

impl Span {
    fn begin(at: Instant) -> Span {
        Span {
            began: at,
            shown: None,
        }
    }

    /// The span in milliseconds when a frame whose drawing started at `draw_start` and was
    /// presented at `at` is the first drawn after the result was shown; `None` before that.
    #[cfg_attr(not(feature = "profiler"), allow(dead_code))]
    fn closed_by(&self, draw_start: Instant, at: Instant) -> Option<f64> {
        let shown = self.shown?;
        (draw_start > shown)
            .then(|| at.saturating_duration_since(self.began).as_secs_f64() * 1000.0)
    }
}

/// Where a measured run stands, and the log it writes to.
pub(crate) struct Measuring {
    started: Instant,
    log: Option<PerfLog>,
    ready_file: Option<PathBuf>,
    pub(crate) exit_after: Option<Duration>,
    pub(crate) scroll_through: bool,
    /// The slots whose first refresh after every replay ended is still to come; `None` until
    /// the replays end.
    awaiting: Option<HashSet<SlotId>>,
    refreshed: bool,
    /// When each slot last refreshed on a change it was told of.
    last_refresh: HashMap<SlotId, Instant>,
    /// When the last awaited slot refreshed: the time `refreshed` is written at.
    refreshed_at: Option<Instant>,
    /// The row the scroll through stands at, once it started.
    pub(crate) scroll_at: Option<usize>,
    /// The resume popup's listing, from the act that opened it to the frame that drew the rows.
    resume_list: Option<Span>,
    /// The slot a pick opened and the span from the pick to the frame drawn after its history
    /// was restored.
    resume_open: Option<(SlotId, Span)>,
    #[cfg(feature = "profiler")]
    frames: Option<Frames>,
}

impl Measuring {
    /// Starts measuring; frames are collected only when there is a log to write them to.
    pub(crate) fn new(
        started: Instant,
        perf_log: Option<&Path>,
        ready_file: Option<PathBuf>,
        exit_after: Option<Duration>,
        scroll_through: bool,
        cx: &gpui_kit::App,
    ) -> Measuring {
        // A log that cannot be made leaves no CSV, which `win-perf` reports.
        let log = perf_log.and_then(|path| PerfLog::create(path).ok());
        #[cfg(feature = "profiler")]
        let frames = log.is_some().then(|| Frames::new(cx));
        #[cfg(not(feature = "profiler"))]
        let _ = cx;
        Measuring {
            started,
            log,
            ready_file,
            exit_after,
            scroll_through,
            awaiting: None,
            refreshed: false,
            last_refresh: HashMap::new(),
            refreshed_at: None,
            scroll_at: None,
            resume_list: None,
            resume_open: None,
            #[cfg(feature = "profiler")]
            frames,
        }
    }

    /// Whether frames are being collected.
    #[cfg(feature = "profiler")]
    pub(crate) fn collects_frames(&self) -> bool {
        self.frames.is_some()
    }

    /// Whether frames are being collected: never without the profiler.
    #[cfg(not(feature = "profiler"))]
    pub(crate) fn collects_frames(&self) -> bool {
        false
    }

    /// Writes `metric` at the time now.
    pub(crate) fn record(&mut self, metric: &str, value: f64) {
        self.record_at(Instant::now(), metric, value);
    }

    /// Writes `metric` at the time `at`.
    fn record_at(&mut self, at: Instant, metric: &str, value: f64) {
        let elapsed = at.saturating_duration_since(self.started);
        if let Some(log) = &mut self.log {
            log.record(elapsed, metric, value);
        }
    }

    /// Writes a duration in milliseconds.
    pub(crate) fn record_ms(&mut self, metric: &str, took: Duration) {
        self.record(metric, took.as_secs_f64() * 1000.0);
    }

    /// Every replay ended: from now on, each slot's next refresh is awaited. True when there is
    /// no slot to await, which leaves the run refreshed at once.
    pub(crate) fn ready(&mut self, slots: impl IntoIterator<Item = SlotId>) -> bool {
        self.record("ready", 1.0);
        let awaiting: HashSet<SlotId> = slots.into_iter().collect();
        let none = awaiting.is_empty();
        self.awaiting = Some(awaiting);
        if none && !self.refreshed {
            self.refreshed = true;
            self.refreshed_at = Some(Instant::now());
            return true;
        }
        false
    }

    /// The slots whose refresh after the replays' end is still to come.
    pub(crate) fn awaited(&self) -> Vec<SlotId> {
        self.awaiting.iter().flatten().copied().collect::<Vec<_>>()
    }

    /// Notes that `slot` refreshed on a change it was told of, at `at`.
    pub(crate) fn note_natural_refresh(&mut self, slot: SlotId, at: Instant) {
        self.last_refresh.insert(slot, at);
    }

    /// When `slot` last refreshed on a change it was told of.
    pub(crate) fn last_refresh(&self, slot: SlotId) -> Option<Instant> {
        self.last_refresh.get(&slot).copied()
    }

    /// Notes that `slot` stands refreshed as of `at`. True once every slot has refreshed after
    /// the replays ended, and only that once; `refreshed` is then the latest of their times.
    pub(crate) fn note_refresh(&mut self, slot: SlotId, at: Instant) -> bool {
        let Some(awaiting) = &mut self.awaiting else {
            return false;
        };
        if !awaiting.remove(&slot) {
            return false;
        }
        self.refreshed_at = Some(self.refreshed_at.map_or(at, |was| was.max(at)));
        if self.refreshed || !awaiting.is_empty() {
            return false;
        }
        self.refreshed = true;
        true
    }

    /// Stops awaiting `slot`, which is gone. True when it was the last one awaited, as
    /// [`Self::note_refresh`] is.
    pub(crate) fn forget(&mut self, slot: SlotId) -> bool {
        self.last_refresh.remove(&slot);
        let Some(awaiting) = &mut self.awaiting else {
            return false;
        };
        if !awaiting.remove(&slot) || self.refreshed || !awaiting.is_empty() {
            return false;
        }
        self.refreshed = true;
        self.refreshed_at.get_or_insert_with(Instant::now);
        true
    }

    /// Whether every slot has refreshed after the replays ended.
    pub(crate) fn is_refreshed(&self) -> bool {
        self.refreshed
    }

    /// Writes `refreshed` and the rows there are, and the ready file for whoever waits on it.
    pub(crate) fn write_refreshed(&mut self, rows: usize) {
        let at = self.refreshed_at.unwrap_or_else(Instant::now);
        self.record_at(at, "refreshed", 1.0);
        self.record("rows", rows as f64);
        if let Some(path) = &self.ready_file {
            // Whoever waits on it times out on its own when it never appears.
            _ = std::fs::write(path, b"");
        }
    }

    /// The popup was asked for: writes `resume_opened` (the mark the judge's frame window starts
    /// at) and starts timing the listing.
    pub(crate) fn resume_opened(&mut self) {
        self.record(RESUME_OPENED, 0.0);
        self.resume_list = Some(Span::begin(Instant::now()));
    }

    /// The popup's rows are in the shell's state: the next frame drawn shows them.
    pub(crate) fn resume_listed(&mut self) {
        if let Some(span) = &mut self.resume_list {
            span.shown.get_or_insert_with(Instant::now);
        }
    }

    /// A pick opened `slot`: starts timing until its history is restored and drawn.
    pub(crate) fn resume_picked(&mut self, slot: SlotId) {
        self.resume_open = Some((slot, Span::begin(Instant::now())));
    }

    /// `slot` refreshed on rows it was told of with its earlier conversation put back (it runs
    /// or has ended): for the slot a pick opened, the next frame drawn shows that conversation.
    pub(crate) fn resume_restored(&mut self, slot: SlotId) {
        if let Some((picked, span)) = &mut self.resume_open
            && *picked == slot
        {
            span.shown.get_or_insert_with(Instant::now);
        }
    }

    /// Closes the resume spans the frame presented at `at`, drawn from `draw_start`, ends.
    #[cfg(feature = "profiler")]
    fn close_resume_spans(&mut self, draw_start: Instant, at: Instant) {
        if let Some(ms) = self
            .resume_list
            .and_then(|span| span.closed_by(draw_start, at))
        {
            self.resume_list = None;
            self.record_at(at, "resume_list_ms", ms);
        }
        if let Some(ms) = self
            .resume_open
            .and_then(|(_, span)| span.closed_by(draw_start, at))
        {
            self.resume_open = None;
            self.record_at(at, "resume_open_ms", ms);
        }
    }

    /// Writes the CPU time used since `start` and the wall-clock time it spans.
    pub(crate) fn record_idle(&mut self, start: IdleStart) {
        #[cfg(windows)]
        self.record_ms("idle_cpu_ms", cpu_time().saturating_sub(start.cpu));
        self.record_ms("idle_wall_ms", start.at.elapsed());
    }

    /// Writes the working set in MB (10^6 bytes, the larger figure of the two MBs).
    pub(crate) fn record_working_set(&mut self) {
        #[cfg(windows)]
        self.record("working_set_mb", working_set_bytes() as f64 / 1_000_000.0);
    }

    /// Writes the frames presented since the last call: the time from the start of drawing to
    /// presented (`frame_ms`), and from dirty to presented (`dirty_ms`, for reference only),
    /// each at the time it was presented.
    pub(crate) fn collect(&mut self) {
        #[cfg(feature = "profiler")]
        {
            let Some(frames) = &mut self.frames else {
                return;
            };
            let (presented, lost) = frames.presented();
            if lost > 0 {
                self.record("frames_lost", lost as f64);
            }
            for presented in presented {
                let draw_start = presented.at.checked_sub(presented.frame);
                if let Some(draw_start) = draw_start {
                    self.close_resume_spans(draw_start, presented.at);
                }
                self.record_at(
                    presented.at,
                    "frame_ms",
                    presented.frame.as_secs_f64() * 1000.0,
                );
                if let Some(dirty) = presented.dirty {
                    self.record_at(presented.at, "dirty_ms", dirty.as_secs_f64() * 1000.0);
                }
            }
        }
    }
}

/// The row written when the resume popup is asked for.
const RESUME_OPENED: &str = "resume_opened";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_span_closes_on_the_first_frame_drawn_after_its_result_was_shown() {
        let began = Instant::now();
        let mut span = Span::begin(began);
        let after = |ms| began + Duration::from_millis(ms);
        // Nothing shown yet: no frame closes it.
        assert_eq!(span.closed_by(after(5), after(9)), None);
        span.shown = Some(after(10));
        // Drawn before the result was shown, presented after it.
        assert_eq!(span.closed_by(after(8), after(14)), None);
        let ms = span.closed_by(after(12), after(20)).unwrap();
        assert!((ms - 20.0).abs() < 1e-6, "{ms}");
    }
}

/// What the process reads of itself from Windows. The only `unsafe` of this crate.
#[cfg(windows)]
#[allow(unsafe_code)]
mod os {
    use std::time::Duration;

    use windows::Win32::Foundation::FILETIME;
    use windows::Win32::System::ProcessStatus::{K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
    use windows::Win32::System::Threading::{GetCurrentProcess, GetProcessTimes};

    fn ticks(time: FILETIME) -> u64 {
        (u64::from(time.dwHighDateTime) << 32) | u64::from(time.dwLowDateTime)
    }

    /// The CPU time this process has used, in the kernel and in user mode; zero when Windows
    /// does not say.
    pub fn cpu_time() -> Duration {
        let (mut created, mut exited, mut kernel, mut user) = Default::default();
        // SAFETY: the pseudo handle of the current process needs no closing, and the four
        // pointers are to locals that outlive the call.
        let read = unsafe {
            GetProcessTimes(
                GetCurrentProcess(),
                &mut created,
                &mut exited,
                &mut kernel,
                &mut user,
            )
        };
        if read.is_err() {
            return Duration::ZERO;
        }
        // FILETIME counts 100 ns ticks.
        Duration::from_nanos((ticks(kernel) + ticks(user)).saturating_mul(100))
    }

    /// The working set of this process in bytes; zero when Windows does not say.
    pub fn working_set_bytes() -> u64 {
        let mut counters = PROCESS_MEMORY_COUNTERS {
            cb: size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
            ..Default::default()
        };
        // SAFETY: `counters` is a local of the size given in `cb`, and the pseudo handle of the
        // current process needs no closing.
        let read =
            unsafe { K32GetProcessMemoryInfo(GetCurrentProcess(), &mut counters, counters.cb) };
        if read.as_bool() {
            counters.WorkingSetSize as u64
        } else {
            0
        }
    }
}
