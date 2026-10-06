package com.votarumshee.symbols.core

import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.util.UUID

/** Real Ktor/OkHttp -> Server -> isolated PostgreSQL. No mocks. */
class ServerIntegrationTest {
    @Test fun recoveryEventsLocalPlayEconomyAndDeletion() = runBlocking {
        val base = System.getProperty("symbols.integrationUrl").orEmpty()
        assumeTrue("Set SYMBOLS_TEST_URL to an isolated Server + PostgreSQL", base.isNotEmpty())
        val api = SymbolsApi(base, true)
        var session = api.authenticate("Клиент тест", false)
        suspend fun cmd(kind: String, body: JsonObject = objectOf(), key: String = UUID.randomUUID().toString()) = api.command(session.token, PendingCommand(session.id, key, kind, body, System.currentTimeMillis()))
        try {
            val initial = api.bootstrap(session.token)
            assertEquals("100", initial.profile.text("balanceCents"))
            val catalog = api.catalog(session.token, null)
            assertEquals(initial.contentVersion, catalog.catalog!!.version)
            assertNull(api.catalog(session.token, catalog.etag).catalog)
            val recovery = cmd("recovery-code").text("code")
            session = api.authenticate(recovery, true)
            assertEquals("100", api.bootstrap(session.token).profile.text("balanceCents"))
            val frames = Channel<EventPage>(Channel.UNLIMITED)
            val connected = CompletableDeferred<Unit>()
            val stream = launch { api.events(session.token, initial.cursor.toLong(), { connected.complete(Unit) }, { frames.send(it) }) }
            withTimeout(15_000) { connected.await() }
            var state = GameState.from(session.id, api.bootstrap(session.token))
            suspend fun receive() { state = EventReducer.apply(state, withTimeout(15_000) { frames.receive() }) }
            val key = UUID.randomUUID().toString()
            val started = cmd("start", objectOf("mode" to "local", "small" to true), key)
            assertEquals(started, cmd("start", objectOf("mode" to "local", "small" to true), key))
            receive()
            assertEquals("setup", state.match!!.text("status"))
            repeat(2) {
                val match = state.match!!
                cmd("action", objectOf("matchId" to match.text("id"), "revision" to match.text("revision"), "action" to objectOf("type" to "king", "index" to 56)))
                receive()
            }
            assertEquals("play", state.match!!.text("status"))
            val playing = state.match!!
            cmd("action", objectOf("matchId" to playing.text("id"), "revision" to playing.text("revision"), "action" to objectOf("type" to "arrow", "index" to 42, "dir" to 0)))
            receive()
            assertEquals(1, api.traffic.connections.get())
            val match = state.match!!
            cmd("leave", objectOf("matchId" to match.text("id"), "revision" to match.text("revision")))
            receive()
            assertEquals("done", state.match!!.text("status"))
            assertTrue(api.market(session.token, null, 0, false).containsKey("listings"))
            assertThrows(ApiFailure::class.java) { runBlocking { cmd("buy-case", objectOf("case" to "assault")) } }
            stream.cancelAndJoin()
            assertEquals(0, api.traffic.connections.get())
            cmd("delete-account", objectOf("confirm" to true))
            try { api.bootstrap(session.token); fail("Deleted session remained authorized") } catch (e: ApiFailure) { assertEquals(401, e.status) }
        } finally { api.close() }
    }
}
