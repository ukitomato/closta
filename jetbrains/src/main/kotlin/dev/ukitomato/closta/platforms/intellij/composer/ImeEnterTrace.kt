package dev.ukitomato.closta.platforms.intellij.composer

import com.intellij.openapi.diagnostic.Logger
import java.awt.event.InputMethodEvent
import java.awt.event.InputMethodListener
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import javax.swing.JComponent

/**
 * Writes one line to the IDE log for an Enter that comes soon after an input-method event, so an Enter that does not
 * send right after a conversion can be traced on the machine that has the input method. It logs what was decided and
 * the event's timing, never the text.
 *
 * Three outcomes leave three different lines: the send action took the key ([taking]), the action stood aside for the
 * input method or a lookup ([sends]), or the key reached the editor without the action seeing it. No line at
 * all means the key press never reached the IDE.
 */
internal class ImeEnterTrace(
    private val now: () -> Long = System::currentTimeMillis,
    private val log: (String) -> Unit = { LOG.info(it) },
) {
    private var lastAt = Long.MIN_VALUE
    private var committed = 0
    private var composing = 0

    fun attach(component: JComponent) {
        component.addInputMethodListener(
            object : InputMethodListener {
                override fun inputMethodTextChanged(event: InputMethodEvent) = imeEvent(event)

                override fun caretPositionChanged(event: InputMethodEvent) = Unit
            },
        )
        component.addKeyListener(
            object : KeyAdapter() {
                override fun keyPressed(e: KeyEvent) {
                    if (e.keyCode == KeyEvent.VK_ENTER && e.modifiersEx == 0) {
                        trace("reached the editor without the send action (consumed=${e.isConsumed})")
                    }
                }
            },
        )
    }

    /** [send], traced as the send action taking the key. */
    fun taking(send: () -> Unit): () -> Unit =
        {
            trace("taken by the send action")
            send()
        }

    /** Whether the send action takes Enter: neither [composing] nor [lookup]; a refusal is traced. */
    fun sends(
        composing: () -> Boolean,
        lookup: () -> Boolean,
    ): () -> Boolean =
        {
            val composed = composing()
            val listed = lookup()
            if (composed || listed) trace("left to the editor (composed range=$composed, lookup=$listed)")
            !composed && !listed
        }

    private fun imeEvent(event: InputMethodEvent) {
        val text = event.text
        val length = if (text == null) 0 else text.endIndex - text.beginIndex
        lastAt = now()
        committed = event.committedCharacterCount
        composing = length - event.committedCharacterCount
    }

    private fun trace(what: String) {
        if (lastAt == Long.MIN_VALUE) return
        val age = now() - lastAt
        if (age > WINDOW_MS) return
        log("composer: Enter $age ms after an input-method event (committed=$committed, composing=$composing): $what")
    }

    private companion object {
        const val WINDOW_MS = 2_000L
        val LOG = Logger.getInstance(ImeEnterTrace::class.java)
    }
}
