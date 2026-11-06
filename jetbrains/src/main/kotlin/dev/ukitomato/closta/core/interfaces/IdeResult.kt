package dev.ukitomato.closta.core.interfaces

/**
 * What an IDE-context seam hands back: a value, or a failure *as a value*. No seam throws to report a refusal:
 * an exception would stop the coroutine or the stdout reader of whoever called it.
 *
 * The [Failed.message] is one short sentence for a person. It never carries an environment value, a secret or the
 * content of a file.
 */
sealed interface IdeResult<out T> {
    data class Ok<out T>(
        val value: T,
    ) : IdeResult<T>

    data class Failed(
        val kind: IdeFailureKind,
        val message: String,
    ) : IdeResult<Nothing>
}

/** Why a seam refused. The kind is what a caller branches on; the message is for display. */
enum class IdeFailureKind {
    /** The request itself is malformed (a name, a line number, a missing pair of arguments). */
    INVALID_ARGUMENT,

    /** The path is not inside the project. */
    OUTSIDE_PROJECT,

    /** The file does not exist. */
    NOT_FOUND,

    /** The file exists but cannot be written. */
    NOT_WRITABLE,

    /** A line range reaches past the end of the file. */
    OUT_OF_RANGE,

    /** The place or the branch is already taken. */
    ALREADY_EXISTS,

    /** The host cannot do this here (no repository, no `git`, no editor). */
    UNAVAILABLE,

    /** Anything else; the message says what the host knows. */
    FAILED,
}
