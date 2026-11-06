package dev.ukitomato.closta.platforms.intellij.auth

import dev.ukitomato.closta.core.interfaces.Secret
import dev.ukitomato.closta.core.interfaces.SecretStore
import dev.ukitomato.closta.providers.claude.auth.SessionCredentials
import dev.ukitomato.closta.providers.claude.auth.SessionTokenRequest
import dev.ukitomato.closta.providers.claude.auth.SessionTokenResolver
import kotlinx.coroutines.CompletableDeferred
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** A [SecretStore] in memory; [failOn] makes a read or write of a key throw. */
class MemorySecretStore : SecretStore {
    val entries = ConcurrentHashMap<String, Secret>()
    var failOn: (operation: String, key: String) -> Exception? = { _, _ -> null }

    override suspend fun get(key: String): Secret? {
        failOn("get", key)?.let { throw it }
        return entries[key]
    }

    override suspend fun set(
        key: String,
        value: Secret,
    ) {
        failOn("set", key)?.let { throw it }
        entries[key] = value
    }

    override suspend fun clear(key: String) {
        failOn("clear", key)?.let { throw it }
        entries.remove(key)
    }
}

/**
 * A [SessionTokenResolver] that answers from [answer] and records every request it was given. When [gate] is set, it
 * blocks the calling thread until the gate opens — like the SDK's blocking call — after completing [entered].
 */
class ScriptedResolver(
    private val answer: (SessionTokenRequest) -> Result<SessionCredentials>,
) : SessionTokenResolver {
    val requests = CopyOnWriteArrayList<SessionTokenRequest>()
    var gate: CountDownLatch? = null
    val entered = CompletableDeferred<Unit>()
    val returned = CompletableDeferred<Unit>()

    override fun resolve(request: SessionTokenRequest): Result<SessionCredentials> {
        requests += request
        entered.complete(Unit)
        gate?.await(GATE_SECONDS, TimeUnit.SECONDS)
        return answer(request).also { returned.complete(Unit) }
    }

    private companion object {
        const val GATE_SECONDS = 30L
    }
}

/**
 * An [MfaPrompt] that types [codes] one after another, recording what each press of Sign In came to, and gives up when
 * it runs out. [beforeTyping] runs first, like the wait for other modal dialogs — a test holds it there or changes the
 * settings — then the prompt asks `ready` and shows nothing when it says no.
 */
class ScriptedPrompt(
    private val codes: List<String>,
    private val beforeTyping: suspend () -> Unit = {},
) : MfaPrompt {
    val results = CopyOnWriteArrayList<ExchangeResult>()
    val requests = CopyOnWriteArrayList<SignInRequest>()
    val shown = CompletableDeferred<Unit>()

    var notShown = false
        private set

    override suspend fun ask(
        request: SignInRequest,
        ready: suspend () -> Boolean,
        exchange: suspend (String) -> ExchangeResult,
    ): SessionCredentials? {
        requests += request
        shown.complete(Unit)
        beforeTyping()
        notShown = !ready()
        return if (notShown) null else type(exchange)
    }

    private suspend fun type(exchange: suspend (String) -> ExchangeResult): SessionCredentials? {
        codes.forEach { code ->
            val result = exchange(code)
            results += result
            if (result is ExchangeResult.SignedIn) return result.credentials
        }
        return null
    }
}

/** A [SignInLog] that keeps every line. */
class RecordingSignInLog : SignInLog {
    val lines = CopyOnWriteArrayList<String>()

    override fun info(message: String) {
        lines += "INFO $message"
    }

    override fun warn(message: String) {
        lines += "WARN $message"
    }
}
