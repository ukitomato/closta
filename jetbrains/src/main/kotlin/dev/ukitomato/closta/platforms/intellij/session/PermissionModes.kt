package dev.ukitomato.closta.platforms.intellij.session

/** The permission modes the CLI takes (the six capture `07` switched through, with `bypassPermissions`). */
internal val PERMISSION_MODES = setOf("default", "acceptEdits", "plan", "auto", "dontAsk", "bypassPermissions")
