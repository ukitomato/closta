package dev.ukitomato.closta.core.models

/**
 * How many lines the reader could not place, kept as a count rather than as an error.
 *
 * Two separate numbers, not one total. An unknown kind means the CLI started sending something new
 * — the version moved and the types need revisiting. A broken line means the bytes were damaged in
 * transport or by the scrubber. Same symptom, unrelated causes, and a reader who sees them added
 * together cannot tell which one to chase.
 *
 * The counts are per wire type so that "what appeared" can be answered, but only the **first** raw
 * line of each sort is retained. Keeping every unknown line whole would rebuild, in memory and in
 * test output, the payloads the capture scrubber exists to strip; one sample is enough to see the
 * shape and does not grow with the stream.
 *
 * This is a plain value: counting is folding, and the fold stays pure so it can run anywhere.
 */
data class UnknownEventTally(
    val unknownByWireType: Map<String, Int> = emptyMap(),
    val brokenLineCount: Int = 0,
    val firstUnknown: RawJson? = null,
    val firstBrokenLine: String? = null,
) {
    /** Lines whose `type` matched no declared kind. */
    val unknownCount: Int get() = unknownByWireType.values.sum()

    /** Every line that could not be placed, of either sort. */
    val totalCount: Int get() = unknownCount + brokenLineCount

    /** True when every line was placed — the state the recorded captures are expected to be in. */
    val isClean: Boolean get() = totalCount == 0

    /**
     * Folds one event in. Known events leave the tally untouched, which is what makes it safe to run
     * this across a whole stream without first filtering.
     */
    fun accept(event: AgentEvent): UnknownEventTally =
        when (event) {
            is AgentEvent.UnknownKind ->
                copy(
                    unknownByWireType =
                        unknownByWireType + (event.wireType to (unknownByWireType[event.wireType] ?: 0) + 1),
                    firstUnknown = firstUnknown ?: event.raw,
                )

            is AgentEvent.BrokenLine ->
                copy(
                    brokenLineCount = brokenLineCount + 1,
                    firstBrokenLine = firstBrokenLine ?: event.line,
                )

            is AgentEvent.Known -> this
        }

    companion object {
        /** The starting point, and the expected result for a capture with nothing odd in it. */
        val EMPTY = UnknownEventTally()

        /** Counts a whole stream. Returns [EMPTY] when nothing was out of place. */
        fun of(events: Iterable<AgentEvent>): UnknownEventTally = events.fold(EMPTY, UnknownEventTally::accept)
    }
}
