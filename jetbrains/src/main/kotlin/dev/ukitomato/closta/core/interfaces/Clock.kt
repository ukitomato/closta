package dev.ukitomato.closta.core.interfaces

import java.time.Instant

/**
 * The one place core is allowed to learn the current time — `core` never reads a clock directly
 * (`core/models` takes elapsed time as an argument, so no time leaks into `core`). A use case that
 * needs elapsed time (`RespondToApproval`) reads [now] here and passes the elapsed figure into the
 * pure fold-family function (`resolveApproval`), so the transition stays testable under a virtual
 * clock.
 *
 * Two implementations, neither a test fake plus one: the test one is a fixed [Instant]; the real one
 * wraps `java.time.Clock` and is supplied by the composition root that wires the use cases
 * (`platforms`).
 */
interface Clock {
    /** The current instant, from whatever real or virtual clock the implementation is backed by. */
    fun now(): Instant
}
