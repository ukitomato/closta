package dev.ukitomato.closta.platforms.intellij.settings

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import javax.swing.JFormattedTextField
import javax.swing.JSpinner
import javax.swing.SpinnerNumberModel

class SessionSecondsFieldTest {
    private fun spinner() =
        JSpinner(SpinnerNumberModel(3_600, 900, 129_600, 900)).apply { editor = JSpinner.NumberEditor(this, "#") }

    @Test
    fun `what was typed stays when the field loses focus, so Apply sees it`() {
        // The default, COMMIT_OR_REVERT, would put back the last good value on the way to Apply and save that.
        assertEquals(JFormattedTextField.PERSIST, sessionSecondsField(spinner()).focusLostBehavior)
    }

    @Test
    fun `a valid edit becomes the spinner's value, so its arrows step from it`() {
        val spinner = spinner()
        sessionSecondsField(spinner).text = "7200"
        assertEquals(7_200, spinner.value)
    }
}
