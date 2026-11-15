//! What the host did that the operations console shows (HostOperations.kt's `foldOperation`), and
//! the records put back into the transcript (OperationReadings.kt's `withOperations`).

use std::sync::Arc;

use crate::input::PresenterInput;
use crate::records::operations::OperationRecords;
use crate::transcript::Transcript;

/// A request the host sent or could not, a refusal, a launch: what the operations console shows
/// of it. Any other input changes nothing.
pub(crate) fn fold_operation(
    transcript: &Arc<Transcript>,
    input: &PresenterInput,
) -> Arc<Transcript> {
    let operations = &transcript.operations;
    let folded = match input {
        PresenterInput::ControlRequested(requested) => operations.control(requested),
        PresenterInput::ControlSendFailed(id) => operations.send_failed(id),
        PresenterInput::EffortRefused(refused) => operations.refuse_effort(refused),
        PresenterInput::Launched(launched) => operations.launched(launched),
        PresenterInput::SandboxRefused(id) => operations.refuse_sandbox(id),
        PresenterInput::SandboxNotStarted(failed) => operations.sandbox_not_started(failed),
        PresenterInput::RewindRequested(asked) => operations.rewind_requested(asked),
        PresenterInput::RewindNotSent(refused) => operations.rewind_not_sent(refused),
        PresenterInput::ResumeRefused(refused) => operations.refuse_resume(refused),
        PresenterInput::AttachmentRefused(refused) => operations.refuse_attachment(refused),
        _ => return Arc::clone(transcript),
    };
    with_operations(transcript, folded)
}

/// `operations` in place of the transcript's own; the same `Arc` when they are equal. The records
/// are bounded (at most 20 switches and compactions, 5 waits of each kind), so comparing them is
/// cheap.
pub(crate) fn with_operations(
    transcript: &Arc<Transcript>,
    operations: OperationRecords,
) -> Arc<Transcript> {
    if operations == *transcript.operations {
        Arc::clone(transcript)
    } else {
        Arc::new(Transcript {
            operations: Arc::new(operations),
            ..Transcript::clone(transcript)
        })
    }
}
