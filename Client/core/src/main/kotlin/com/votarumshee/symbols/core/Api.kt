package com.votarumshee.symbols.core

import io.ktor.client.*
import io.ktor.client.engine.okhttp.*
import io.ktor.client.plugins.*
import io.ktor.client.plugins.websocket.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.websocket.*
import kotlinx.serialization.json.*
import java.net.URI
import java.util.concurrent.atomic.AtomicLong

class ApiFailure(val status: Int, val code: String, override val message: String, val retryAfterMs: Long = 0) : Exception(message)
data class CatalogResponse(val catalog: Catalog?, val etag: String?, val maxAgeSeconds: Long)
class Traffic {
    val httpRequests = AtomicLong(); val sentBytes = AtomicLong(); val receivedBytes = AtomicLong()
    val wsMessages = AtomicLong(); val wsBytes = AtomicLong(); val connections = AtomicLong(); val reconnects = AtomicLong()
}
class SymbolsApi(val base: String, allowLocal: Boolean = false, val traffic: Traffic = Traffic(), suppliedClient: HttpClient? = null) : AutoCloseable {
    init {
        val uri = URI(base)
        require(uri.rawUserInfo == null && uri.rawQuery == null && uri.rawFragment == null && uri.path.orEmpty().trim('/').isEmpty())
        require(uri.scheme == "https" || allowLocal && uri.scheme == "http" && uri.host in setOf("127.0.0.1", "localhost", "10.0.2.2")) { "Нужен безопасный адрес сервера" }
    }
    private val client = suppliedClient ?: HttpClient(OkHttp) {
        install(WebSockets) // OkHttp automatically responds to server ping; no extra profile heartbeat.
        install(HttpTimeout) { requestTimeoutMillis = 35_000; connectTimeoutMillis = 10_000; socketTimeoutMillis = 40_000 }
        followRedirects = false
    }
    private suspend fun request(path: String, token: String? = null, body: JsonObject? = null, key: String? = null, etag: String? = null): Pair<HttpResponse, String> {
        traffic.httpRequests.incrementAndGet()
        val payload = body?.toString()
        traffic.sentBytes.addAndGet(payload?.toByteArray()?.size?.toLong() ?: 0)
        val response = client.request(base.trimEnd('/') + "/api/v3/" + path) {
            method = if (body == null) HttpMethod.Get else HttpMethod.Post
            if (token != null) bearerAuth(token)
            if (key != null) header("Idempotency-Key", key)
            if (etag != null) header(HttpHeaders.IfNoneMatch, etag)
            if (payload != null) { contentType(ContentType.Application.Json); setBody(payload) }
        }
        val text = response.bodyAsText()
        traffic.receivedBytes.addAndGet(text.toByteArray().size.toLong())
        if (response.status.value !in 200..299 && response.status.value != 304) {
            val error = runCatching { wire.parseToJsonElement(text).jsonObject.obj("error") }.getOrNull()
            throw ApiFailure(response.status.value, error?.text("code") ?: "HTTP_ERROR", error?.text("message") ?: "Сервер временно недоступен", (response.headers[HttpHeaders.RetryAfter]?.toLongOrNull() ?: 0).coerceIn(0, 3600) * 1000)
        }
        return response to text
    }
    suspend fun authenticate(value: String, recover: Boolean): Session {
        val result = wire.parseToJsonElement(request("account/" + if (recover) "recover" else "register", body = objectOf((if (recover) "code" else "nick") to value)).second).jsonObject
        return Session(result.text("id"), result.text("token"), if (recover) "Аккаунт" else value)
    }
    suspend fun bootstrap(token: String) = wire.decodeFromString<Bootstrap>(request("bootstrap", token).second)
    suspend fun command(token: String, command: PendingCommand): JsonObject = wire.parseToJsonElement(request("commands/${command.kind}", token, command.body, command.key).second).jsonObject
    suspend fun catalog(token: String, etag: String?): CatalogResponse {
        val (response, text) = request("catalog", token, etag = etag)
        val age = response.headers[HttpHeaders.CacheControl]?.substringAfter("max-age=", "0")?.substringBefore(',')?.toLongOrNull() ?: 0
        return CatalogResponse(if (response.status.value == 304) null else wire.decodeFromString<Catalog>(text), response.headers[HttpHeaders.ETag], age.coerceIn(0, 3600))
    }
    suspend fun market(token: String, symbol: String?, offset: Int, descending: Boolean): JsonObject {
        require(offset in 0..10000)
        val query = parameters { if (!symbol.isNullOrEmpty()) append("symbol", symbol); append("offset", "$offset"); append("desc", "$descending") }.formUrlEncode()
        return wire.parseToJsonElement(request("market?$query", token).second).jsonObject
    }
    suspend fun changes(token: String, cursor: Long) = wire.decodeFromString<EventPage>(request("changes?cursor=$cursor", token).second)
    suspend fun events(token: String, cursor: Long, connected: suspend () -> Unit, receive: suspend (EventPage) -> Unit) {
        val endpoint = base.replaceFirst("https://", "wss://").replaceFirst("http://", "ws://") + "/api/v3/events?cursor=$cursor"
        client.webSocket(urlString = endpoint, request = { bearerAuth(token) }) {
            traffic.connections.incrementAndGet()
            try {
                connected()
                for (frame in incoming) if (frame is Frame.Text) {
                    val text = frame.readText(); traffic.wsMessages.incrementAndGet(); traffic.wsBytes.addAndGet(text.toByteArray().size.toLong())
                    val obj = wire.parseToJsonElement(text).jsonObject
                    if ("error" in obj) {
                        val code = obj.obj("error").text("code")
                        throw ApiFailure(if (code == "UNAUTHORIZED") 401 else 409, code, "Нужно восстановить соединение")
                    }
                    receive(wire.decodeFromString<EventPage>(text))
                }
            } finally { traffic.connections.decrementAndGet() }
        }
    }
    override fun close() = client.close()
}
