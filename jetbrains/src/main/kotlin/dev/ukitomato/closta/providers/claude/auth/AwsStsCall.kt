package dev.ukitomato.closta.providers.claude.auth

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.awscore.retry.AwsRetryStrategy
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration
import software.amazon.awssdk.core.exception.SdkException
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.sts.StsClient
import software.amazon.awssdk.services.sts.model.GetSessionTokenRequest
import java.time.Duration

/**
 * The production [StsCall]: AWS SDK `StsClient.getSessionToken` over the URL-connection HTTP client, so
 * there is no extra HTTP stack, no `aws` binary, and no `~/.aws` — the long-term IAM keys go straight to
 * the SDK (they are never written to disk or logged here). `com.intellij`-independent.
 *
 * This object is the AWS boundary. Real STS is not reached from the unit tests (it was measured in runIde);
 * `AwsStsCallTest` runs it against a local fake STS instead. The request-building and
 * response-extraction below are a 1:1 copy of the SDK shape; the resolver's tested seam is [StsCall]. An SDK failure
 * leaves here as a [StsCallException] sorted by [StsFailures], which keeps the reason and drops AWS's message.
 *
 * The SDK never sends the request again: an MFA code works once, and the SDK's default retry sent the
 * same code up to four times after a 500 or a dropped connection.
 */
object AwsStsCall : StsCall {
    private const val API_CALL_TIMEOUT_SECONDS = 30L

    override fun getSessionToken(request: SessionTokenRequest): StsTemporaryCredentials =
        try {
            call(request)
        } catch (failure: SdkException) {
            throw StsFailures.classify(failure)
        }

    private fun call(request: SessionTokenRequest): StsTemporaryCredentials {
        val provider =
            StaticCredentialsProvider.create(
                AwsBasicCredentials.create(request.longTermAccessKeyId, request.longTermSecretAccessKey),
            )
        return StsClient
            .builder()
            .region(Region.of(request.region))
            .credentialsProvider(provider)
            // Pass the *builder*, not a built instance: the SDK then owns the HTTP client's lifecycle and
            // closes it when the StsClient is closed (below `use {}`). Handing it a pre-built instance via
            // httpClient() would leak the URL-connection client on every call (AWS SDK v2 docs).
            .httpClientBuilder(UrlConnectionHttpClient.builder())
            .overrideConfiguration(
                ClientOverrideConfiguration
                    .builder()
                    .apiCallTimeout(Duration.ofSeconds(API_CALL_TIMEOUT_SECONDS))
                    .retryStrategy(AwsRetryStrategy.doNotRetry())
                    .build(),
            ).build()
            .use { sts ->
                val response =
                    sts.getSessionToken(
                        GetSessionTokenRequest
                            .builder()
                            .serialNumber(request.deviceArn)
                            .tokenCode(request.tokenCode)
                            .durationSeconds(request.durationSeconds)
                            .build(),
                    )
                val credentials = response.credentials()
                StsTemporaryCredentials(
                    accessKeyId = credentials.accessKeyId(),
                    secretAccessKey = credentials.secretAccessKey(),
                    sessionToken = credentials.sessionToken(),
                    expirationEpochMillis = credentials.expiration().toEpochMilli(),
                )
            }
    }
}
