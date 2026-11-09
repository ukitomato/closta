package dev.ukitomato.closta.platforms.intellij.settings

import javax.swing.JFormattedTextField
import javax.swing.JSpinner
import javax.swing.text.DefaultFormatter

/**
 * The text field of the session duration's [spinner]. What was typed stays when the field loses focus — the default
 * would put back the last good value on the way to Apply, which would then save a number nobody chose — so the form
 * reads the text and Apply refuses it when it is wrong. Each valid edit is the spinner's value, so its arrows step
 * from what was typed.
 */
internal fun sessionSecondsField(spinner: JSpinner): JFormattedTextField =
    (spinner.editor as JSpinner.DefaultEditor).textField.apply {
        focusLostBehavior = JFormattedTextField.PERSIST
        (formatter as? DefaultFormatter)?.commitsOnValidEdit = true
    }
