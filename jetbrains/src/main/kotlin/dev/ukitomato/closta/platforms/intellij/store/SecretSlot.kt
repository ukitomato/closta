package dev.ukitomato.closta.platforms.intellij.store

/**
 * The closed set of places a provider keeps a secret. Closed because PasswordSafe cannot list its entries:
 * forgetting a provider has to name every entry it may have, and only a closed set lets it do so.
 *
 * Keys use [wire], never the constant name. The spelling is part of every stored key, so changing it orphans
 * the secrets already saved under it; the unit tests pin it.
 */
enum class SecretSlot(
    val wire: String,
) {
    /** The IAM user's long-term access key ID and secret access key, used to call STS. */
    BEDROCK_LONG_TERM("bedrock-long-term"),

    /** The temporary credentials from the last MFA authentication, reused until they expire. */
    BEDROCK_SESSION("bedrock-session"),
}
