package dev.ukitomato.closta.presenter.view

/**
 * A token count in few characters: as it is under a thousand, then one decimal and a `k`, and a `M` where the
 * figure rounds to a thousand `k`. Integer arithmetic, so no locale can change the separator.
 */
fun shortTokens(n: Long): String {
    val thousandsTenths = (n + HALF_OF_TENTH_K) / TENTH_K
    return when {
        n < THOUSAND -> n.toString()
        thousandsTenths < TENTHS_IN_MILLION -> "${decimal(thousandsTenths)}k"
        else -> "${decimal((n + HALF_OF_TENTH_M) / TENTH_M)}M"
    }
}

private fun decimal(tenths: Long): String = "${tenths / TENS}.${tenths % TENS}"

private const val THOUSAND = 1000L
private const val TENS = 10L
private const val TENTH_K = 100L
private const val HALF_OF_TENTH_K = 50L
private const val TENTH_M = 100_000L
private const val HALF_OF_TENTH_M = 50_000L
private const val TENTHS_IN_MILLION = 10_000L
