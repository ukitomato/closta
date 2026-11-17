#![allow(clippy::expect_used, clippy::unwrap_used)]
//! The channels of `watch_status` and `watch_view` close once the session ends, however it ends,
//! and stay open across a restart into the sandbox.

mod support;

use closta_providers::claude::fake::live::LiveOptions;
use closta_session::status::SessionStatus;
use futures_lite::future;
use smol::Timer;
use support::{GUARD, Processes, drive, reach, runtime, until};

fn running(status: &SessionStatus) -> bool {
    matches!(status, SessionStatus::Running { .. })
}

fn is_end(status: &SessionStatus) -> bool {
    status.is_end()
}

#[test]
fn the_status_channel_closes_once_the_session_ends() {
    drive(|executor| async move {
        let processes = Processes::new();
        let control = processes.prepare(LiveOptions::default());
        let (runtime, run, _log) = runtime(&processes, |_| {});
        let rx = runtime.watch_status();
        let run = executor.spawn(run);
        until(|| running(&runtime.status())).await;
        control.exit(0);
        run.await;

        assert_eq!(rx.recv().await, Ok(SessionStatus::Starting));
        assert_eq!(
            rx.recv().await,
            Ok(SessionStatus::Running {
                version: "2.1.282".into()
            })
        );
        assert_eq!(rx.recv().await, Ok(SessionStatus::Ended));
        assert!(rx.recv().await.is_err());
    });
}

#[test]
fn the_channels_close_on_a_failure_and_on_a_close() {
    drive(|executor| async move {
        let processes = Processes::new();
        let control = processes.prepare(LiveOptions::default());
        let (failing, run, _log) = runtime(&processes, |_| {});
        let status = failing.watch_status();
        let view = failing.watch_view();
        let run = executor.spawn(run);
        until(|| running(&failing.status())).await;
        control.exit(3);
        run.await;
        assert!(matches!(
            reach(&failing, is_end).await,
            SessionStatus::Failed(_)
        ));
        while status.recv().await.is_ok() {}
        while view.recv().await.is_ok() {}
        assert!(status.is_closed() && view.is_closed());

        let processes = Processes::new();
        processes.prepare(LiveOptions::default());
        let (closing, run, _log) = runtime(&processes, |_| {});
        let status = closing.watch_status();
        let view = closing.watch_view();
        let run = executor.spawn(run);
        until(|| running(&closing.status())).await;
        closing.close();
        run.await;
        let mut seen = Vec::new();
        while let Ok(it) = status.recv().await {
            seen.push(it);
        }
        assert_eq!(seen.last(), Some(&SessionStatus::Closed));
        while view.recv().await.is_ok() {}
        assert!(status.is_closed() && view.is_closed());
    });
}

#[test]
fn a_watch_taken_after_the_end_gets_the_end_and_is_closed() {
    drive(|executor| async move {
        let processes = Processes::new();
        let control = processes.prepare(LiveOptions::default());
        let (runtime, run, _log) = runtime(&processes, |_| {});
        let run = executor.spawn(run);
        until(|| running(&runtime.status())).await;
        control.exit(0);
        run.await;

        let rx = runtime.watch_status();
        assert_eq!(rx.recv().await, Ok(SessionStatus::Ended));
        assert!(rx.recv().await.is_err());
    });
}

#[test]
fn a_view_watch_taken_after_the_end_is_closed_at_once() {
    drive(|executor| async move {
        let processes = Processes::new();
        let control = processes.prepare(LiveOptions::default());
        let (runtime, run, _log) = runtime(&processes, |_| {});
        let run = executor.spawn(run);
        until(|| running(&runtime.status())).await;
        control.exit(0);
        run.await;

        let rx = runtime.watch_view();
        assert!(rx.is_closed());
        assert!(rx.recv().await.is_err());
    });
}

#[test]
fn a_restart_into_the_sandbox_keeps_the_channels_open() {
    drive(|executor| async move {
        let processes = Processes::new();
        let (runtime, run, _log) = runtime(&processes, |_| {});
        let run = executor.spawn(run);
        until(|| running(&runtime.status()) && processes.controls().len() == 1).await;
        let status = runtime.watch_status();
        let view = runtime.watch_view();
        assert_eq!(status.recv().await.map(|s| running(&s)), Ok(true));

        assert!(runtime.turn_sandbox_on());
        assert_eq!(status.recv().await, Ok(SessionStatus::Starting));
        until(|| running(&runtime.status()) && processes.controls().len() == 2).await;
        assert_eq!(status.recv().await.map(|s| running(&s)), Ok(true));
        assert!(!status.is_closed() && !view.is_closed());
        assert!(
            future::or(async { Some(status.recv().await) }, async {
                Timer::after(GUARD / 10).await;
                None
            })
            .await
            .is_none(),
            "nothing more is sent, and nothing closes"
        );

        runtime.close();
        run.await;
    });
}
