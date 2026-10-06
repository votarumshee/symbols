package com.votarumshee.symbols.core

import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import kotlin.random.Random

class ProtocolTest {
    private fun initial() = GameState("owner", 0, 0, objectOf("nick" to "Старый", "balanceCents" to "425", "inventory" to objectOf("sword" to 2)),
        objectOf("id" to "arena", "revision" to "0", "board" to objectOf("width" to 14, "rows" to 5, "boards" to JsonArray(listOf(JsonArray(List(70) { JsonNull }), JsonArray(List(70) { JsonNull }))))), "2026-10-06T00:00:00Z")
    private fun event(cursor: String = "1", revision: String = "1", change: JsonObject? = null) = StateEvent("owner:$cursor", cursor, "state.changed", "arena", revision, "2026-10-06T00:00:01Z", objectOf("nick" to "Новый"), "stable-command", change)
    @Test fun moneyNeverUsesFloatingPoint() {
        assertEquals(425L, Cents.rubies("4,25").value)
        assertEquals("90071992547409,91", Cents(9_007_199_254_740_991).display())
        for (value in listOf("-1", "1.001", "NaN", "9e3", "90071992547409.92")) assertThrows(IllegalArgumentException::class.java) { Cents.rubies(value) }
    }
    @Test fun duplicateEventDoesNotApplyTwice() {
        val event = event()
        val state = EventReducer.apply(initial(), EventPage(listOf(event, event), "1", false))
        assertEquals(1, state.cursor)
        assertEquals("Новый", state.profile.text("nick"))
        assertEquals(2, state.profile.obj("inventory").number("sword"))
    }
    @Test fun gapsAndWrongBaseRequireAtomicSnapshot() {
        assertThrows(SnapshotRequired::class.java) { EventReducer.apply(initial(), EventPage(listOf(event("2", "2")), "2", false)) }
        assertThrows(SnapshotRequired::class.java) { EventReducer.apply(initial(), EventPage(listOf(event(change = objectOf("baseRevision" to "9", "patch" to objectOf()))), "1", false)) }
        assertThrows(SnapshotRequired::class.java) { EventReducer.apply(initial(), EventPage(listOf(event(), event("3", "3")), "3", false)) }
        assertEquals("Старый", initial().profile.text("nick"))
    }
    @Test fun sparseBoardPatchesPreserveOtherCellsAndAcceptNull() {
        val change = objectOf("baseRevision" to "0", "patch" to objectOf("revision" to "1", "board" to objectOf("cells" to JsonArray(listOf(objectOf("side" to 0, "index" to 56, "value" to objectOf("type" to "king")))))))
        val state = EventReducer.apply(initial(), EventPage(listOf(event(change = change)), "1", false))
        assertEquals("king", state.match!!.obj("board").array("boards")[0].jsonArray[56].jsonObject.text("type"))
        assertEquals(JsonNull, state.match.obj("board").array("boards")[0].jsonArray[55])
        val cleared = EventReducer.apply(state, EventPage(listOf(event("2", "2", objectOf("snapshot" to null))), "2", false))
        assertNull(cleared.match)
    }
    @Test fun staleEventsDoNotRollBackState() {
        val state = EventReducer.apply(initial(), EventPage(listOf(event()), "1", false))
        assertEquals(state, EventReducer.apply(state, EventPage(listOf(event("0", "0")), "0", false)))
    }
    @Test fun retryWindowExcludesMovesAndExpiredReceipts() {
        val buy = PendingCommand("a", "stable", "buy", objectOf("id" to "lot"), 1000)
        assertTrue(buy.canRetry(2000))
        assertFalse(buy.canRetry(1000 + 7 * 86_400_000L))
        assertFalse(buy.copy(kind = "action").canRetry(2000))
        assertFalse(buy.canRetry(999))
    }
    @Test fun backoffIsBoundedAndNeverBusyLoops() {
        for (attempt in 1..100) assertTrue(retryDelay(attempt, Random(attempt)) in 1000..30000)
    }
    @Test fun sharedContractFixtureParsesWithoutUuidAssumption() {
        val contracts = File(System.getProperty("contracts.dir"))
        val examples = wire.parseToJsonElement(File(contracts, "examples.json").readText()).jsonObject
        val sample = examples.obj("registration").obj("response")
        val session = wire.decodeFromString<Session>(sample.toString())
        assertEquals("example-player", session.id)
        assertFalse(session.toString().contains(sample.text("token")))
        val api = wire.parseToJsonElement(File(contracts, "openapi.yaml").readText()).jsonObject
        assertTrue(api.obj("paths").containsKey("/api/v3/events"))
        assertEquals("1", examples.obj("action").text("revision"))
    }
    @Test fun releaseRejectsInsecureEndpointAndCredentials() {
        for (url in listOf("http://example.com", "https://user:pass@example.com", "https://example.com?token=bad", "https://example.com/path"))
            assertThrows(IllegalArgumentException::class.java) { SymbolsApi(url) }
    }
}
