package dev.ukitomato.closta.providers.claude.auth

import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import software.amazon.awssdk.core.SdkGlobalTime
import java.io.IOException
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.concurrent.thread

/**
 * [AwsStsCall] against a fake STS on this machine: the SDK is pointed at it with its own system
 * property for the STS endpoint, so no AWS is reached, and the fake counts the requests. An MFA code works once, so
 * the SDK must send each request once — after a 500, a dropped connection and a clock error alike.
 *
 * The fake answers on a plain socket rather than the JDK's HTTP server, which writes its own `Date` header: the clock
 * case needs the fake's `Date` to be an hour away from this machine's clock. A clock error makes the SDK keep a clock
 * correction for the whole process (`SdkGlobalTime`); each test starts and ends without one.
 */
class AwsStsCallTest {
    private var sts: FakeSts? = null

    @BeforeEach
    fun noCorrection() = SdkGlobalTime.setGlobalTimeOffset(0)

    @AfterEach
    fun stop() {
        System.clearProperty(ENDPOINT_PROPERTY)
        sts?.close()
        SdkGlobalTime.setGlobalTimeOffset(0)
    }

    private fun against(answer: (Int) -> Answer): FakeSts =
        FakeSts(answer).also {
            sts = it
            System.setProperty(ENDPOINT_PROPERTY, it.url)
        }

    private fun failureFrom(fake: FakeSts): StsCallException {
        val failure = assertThrows<StsCallException> { AwsStsCall.getSessionToken(REQUEST) }
        assertEquals(1, fake.requests.size) { "requests sent: ${fake.requests.size}" }
        assertTrue(fake.requests.single().contains("TokenCode=$CODE"))
        return failure
    }

    @Test
    fun `a 500 is sent once and is other`() {
        val fake = against { Answer.Reply(INTERNAL_ERROR, error("Receiver", "InternalFailure"), now()) }
        val failure = failureFrom(fake)
        assertEquals(StsFailureReason.OTHER, failure.reason)
        assertEquals("InternalFailure", failure.errorCode)
    }

    @Test
    fun `a dropped connection is sent once and is unreachable`() {
        val failure = failureFrom(against { Answer.Drop })
        assertEquals(StsFailureReason.UNREACHABLE, failure.reason)
    }

    @Test
    fun `a signature refused by a clock an hour away is sent once and is the clock`() {
        val hourAway = now().plus(Duration.ofHours(1))
        val refused = error("Sender", "SignatureDoesNotMatch")
        val failure = failureFrom(against { Answer.Reply(FORBIDDEN, refused, hourAway) })
        assertEquals(StsFailureReason.CLOCK_SKEW, failure.reason)
        assertEquals("SignatureDoesNotMatch", failure.errorCode)
    }

    @Test
    fun `after a correction, a clock that is right again is still the clock, not the key`() {
        var date = now().plus(Duration.ofHours(1))
        val refused = error("Sender", "SignatureDoesNotMatch")
        val fake = against { Answer.Reply(FORBIDDEN, refused, date) }
        assertThrows<StsCallException> { AwsStsCall.getSessionToken(REQUEST) }
        // As if this machine's clock was set right: AWS's Date now agrees with it,
        // but the SDK still corrects by an hour.
        date = now()
        val failure = assertThrows<StsCallException> { AwsStsCall.getSessionToken(REQUEST) }
        assertEquals(2, fake.requests.size)
        assertEquals(StsFailureReason.CLOCK_SKEW, failure.reason)
    }

    @Test
    fun `a signature refused by a clock that agrees is the long-term key`() {
        val failure = failureFrom(against { Answer.Reply(FORBIDDEN, error("Sender", "SignatureDoesNotMatch"), now()) })
        assertEquals(StsFailureReason.LONG_TERM_KEY_REJECTED, failure.reason)
    }

    @Test
    fun `an answer gives the temporary credentials`() {
        val fake = against { Answer.Reply(OK, SIGNED_IN, now()) }
        val credentials = AwsStsCall.getSessionToken(REQUEST)
        assertEquals(1, fake.requests.size)
        assertEquals("ASIAFAKEFAKEFAKEFAKE", credentials.accessKeyId)
        assertEquals(Instant.parse(EXPIRATION).toEpochMilli(), credentials.expirationEpochMillis)
    }

    private fun now(): Instant = Instant.now()

    private fun error(
        type: String,
        code: String,
    ) = "<ErrorResponse><Error><Type>$type</Type><Code>$code</Code><Message>fake</Message></Error>" +
        "<RequestId>fake</RequestId></ErrorResponse>"

    /** What the fake STS does with one request. */
    sealed interface Answer {
        /** Close the connection without a word. */
        data object Drop : Answer

        class Reply(
            val status: Int,
            val body: String,
            val date: Instant,
        ) : Answer
    }

    /** A one-thread HTTP/1.1 server on the loopback that keeps each request's body and answers as told. */
    class FakeSts(
        private val answer: (Int) -> Answer,
    ) : AutoCloseable {
        val requests = CopyOnWriteArrayList<String>()
        private val server = ServerSocket(0, BACKLOG, InetAddress.getLoopbackAddress())
        val url = "http://127.0.0.1:${server.localPort}"
        private val worker =
            thread(isDaemon = true, name = "fake-sts") {
                while (!server.isClosed) {
                    val socket =
                        try {
                            server.accept()
                        } catch (_: IOException) {
                            break
                        }
                    socket.use(::handle)
                }
            }

        private fun handle(socket: Socket) {
            val input = socket.getInputStream().buffered()
            val head = StringBuilder()
            while (!head.endsWith("\r\n\r\n")) {
                val byte = input.read()
                if (byte < 0) return
                head.append(byte.toChar())
            }
            val length =
                CONTENT_LENGTH
                    .find(head)
                    ?.groupValues
                    ?.get(1)
                    ?.toInt() ?: 0
            requests += String(input.readNBytes(length), Charsets.UTF_8)
            when (val reply = answer(requests.size)) {
                Answer.Drop -> Unit
                is Answer.Reply -> {
                    val body = reply.body.toByteArray(Charsets.UTF_8)
                    val date = DateTimeFormatter.RFC_1123_DATE_TIME.format(reply.date.atOffset(ZoneOffset.UTC))
                    val status =
                        "HTTP/1.1 ${reply.status} Fake\r\nContent-Type: text/xml\r\nContent-Length: ${body.size}\r\n" +
                            "Date: $date\r\nConnection: close\r\n\r\n"
                    socket.getOutputStream().apply {
                        write(status.toByteArray(Charsets.US_ASCII))
                        write(body)
                        flush()
                    }
                }
            }
        }

        override fun close() {
            server.close()
            worker.join(JOIN_MS)
        }
    }

    private companion object {
        const val ENDPOINT_PROPERTY = "aws.endpointUrlSts"
        const val CODE = "246813"
        const val OK = 200
        const val FORBIDDEN = 403
        const val INTERNAL_ERROR = 500
        const val BACKLOG = 8
        const val JOIN_MS = 5_000L
        const val EXPIRATION = "2026-10-02T12:00:00Z"
        val CONTENT_LENGTH = Regex("(?i)content-length:\\s*(\\d+)")
        val REQUEST =
            SessionTokenRequest(
                tokenCode = CODE,
                deviceArn = "GAHT12345678",
                region = "eu-west-1",
                durationSeconds = 900,
                longTermAccessKeyId = "AKIAFAKEFAKEFAKEFAKE",
                longTermSecretAccessKey = "aws-sts-call-test-fake-secret-not-a-real-one",
            )
        const val SIGNED_IN =
            "<GetSessionTokenResponse xmlns=\"https://sts.amazonaws.com/doc/2011-06-15/\"><GetSessionTokenResult>" +
                "<Credentials><AccessKeyId>ASIAFAKEFAKEFAKEFAKE</AccessKeyId>" +
                "<SecretAccessKey>aws-sts-call-test-fake-temporary-secret</SecretAccessKey>" +
                "<SessionToken>aws-sts-call-test-fake-session-token</SessionToken>" +
                "<Expiration>$EXPIRATION</Expiration></Credentials></GetSessionTokenResult>" +
                "<ResponseMetadata><RequestId>fake</RequestId></ResponseMetadata></GetSessionTokenResponse>"
    }
}
