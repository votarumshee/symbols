package com.votarumshee.symbols.core

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.serialization.json.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.util.UUID

class TrafficMeasurementTest {
    @Test fun measureTenMinutesIdleAndActive() = runBlocking {
        assumeTrue("Opt-in 10 minute measurement", System.getProperty("symbols.measure") == "600")
        val base = System.getProperty("symbols.integrationUrl")
        coroutineScope {
            listOf(false, true).map { active -> async {
                val api = SymbolsApi(base, true)
                val session = api.authenticate(if (active) "Трафик игра" else "Трафик покой", false)
                suspend fun command(kind: String, body: JsonObject) = api.command(session.token, PendingCommand(session.id, UUID.randomUUID().toString(), kind, body, System.currentTimeMillis()))
                if (active) {
                    command("start", objectOf("mode" to "local", "small" to true))
                    repeat(2) {
                        val match = api.bootstrap(session.token).match!!
                        command("action", objectOf("matchId" to match.text("id"), "revision" to match.text("revision"), "action" to objectOf("type" to "king", "index" to 56)))
                    }
                }
                val state = MutableStateFlow(GameState.from(session.id, api.bootstrap(session.token)))
                val connected = CompletableDeferred<Unit>()
                val latencies = mutableListOf<Long>()
                var sentAt = 0L
                val ws = launch {
                    api.events(session.token, state.value.cursor, { connected.complete(Unit) }) { page ->
                        state.value = EventReducer.apply(state.value, page)
                        if (sentAt > 0) { latencies += System.currentTimeMillis() - sentAt; sentAt = 0 }
                    }
                }
                withTimeout(15_000) { connected.await() }
                fun counts() = listOf(api.traffic.httpRequests.get(), api.traffic.sentBytes.get(), api.traffic.receivedBytes.get(), api.traffic.wsMessages.get(), api.traffic.wsBytes.get())
                val initial = counts(); val started = System.currentTimeMillis()
                while (System.currentTimeMillis() - started < 600_000) {
                    delay(minOf(9_000, 600_000 - (System.currentTimeMillis() - started)).coerceAtLeast(1))
                    if (active && System.currentTimeMillis() - started < 600_000) {
                        val match = state.value.match!!
                        val side = match.number("actor").toInt() % 2
                        val index = match.obj("board").array("boards")[side].jsonArray.indexOfFirst { it == JsonNull }
                        sentAt = System.currentTimeMillis()
                        command("action", objectOf("matchId" to match.text("id"), "revision" to match.text("revision"), "action" to objectOf("type" to "smile", "index" to index)))
                    }
                }
                val end = counts(); val delta = end.zip(initial).map { (a,b) -> a-b }
                val report = objectOf("scenario" to if (active) "active-local" else "idle", "seconds" to (System.currentTimeMillis()-started)/1000.0,
                    "httpRequests" to delta[0], "sentPayloadBytes" to delta[1], "receivedHttpPayloadBytes" to delta[2], "wsMessages" to delta[3], "wsPayloadBytes" to delta[4],
                    "connections" to api.traffic.connections.get(), "reconnects" to api.traffic.reconnects.get(), "p95CommandToEventMs" to latencies.sorted().let { it.getOrNull(((it.size-1)*.95).toInt()) },
                    "notes" to "Real Kotlin Ktor/OkHttp on JVM, not Android UI. Payload bytes exclude HTTP/TLS/WS framing. Ping/pong every 20s per server protocol; control frame bytes not instrumented.")
                File("build/measurements").mkdirs()
                File("build/measurements/${if(active) "active" else "idle"}.json").writeText(report.toString())
                ws.cancelAndJoin(); command("delete-account", objectOf("confirm" to true)); api.close()
            } }.awaitAll()
        }
        Unit
    }
}
