package com.votarumshee.symbols.core

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import java.math.BigDecimal

val wire = Json { ignoreUnknownKeys = true; encodeDefaults = true }
class UpdateRequired : Exception("Требуется обновить приложение")
fun JsonObject.text(key: String, fallback: String = ""): String = (get(key) as? JsonPrimitive)?.contentOrNull ?: fallback
fun JsonObject.number(key: String, fallback: Long = 0): Long = text(key).toLongOrNull() ?: fallback
fun JsonObject.flag(key: String): Boolean = (get(key) as? JsonPrimitive)?.booleanOrNull ?: false
fun JsonObject.obj(key: String): JsonObject = get(key) as? JsonObject ?: JsonObject(emptyMap())
fun JsonObject.array(key: String): JsonArray = get(key) as? JsonArray ?: JsonArray(emptyList())
fun objectOf(vararg pairs: Pair<String, Any?>): JsonObject = buildJsonObject {
    pairs.forEach { (key, value) -> put(key, when(value) {
        null -> JsonNull
        is JsonElement -> value
        is Boolean -> JsonPrimitive(value)
        is Number -> JsonPrimitive(value)
        else -> JsonPrimitive(value.toString())
    }) }
}

@JvmInline value class Cents(val value: Long) {
    init { require(value in 0..9_007_199_254_740_991) { "Некорректная сумма" } }
    fun display(): String = "${value / 100},${(value % 100).toString().padStart(2, '0')}"
    companion object {
        fun wire(value: String) = Cents(value.toLong())
        fun rubies(value: String): Cents {
            require(Regex("^[0-9]{1,14}([.,][0-9]{1,2})?$").matches(value)) { "Цена: число с двумя знаками после запятой" }
            return Cents(BigDecimal(value.replace(',', '.')).movePointRight(2).longValueExact())
        }
    }
}

@Serializable data class Session(val id: String, val token: String, val nick: String = "Аккаунт") {
    override fun toString() = "Session(redacted)"
}
@Serializable data class Bootstrap(
    val apiVersion: Int, val contentVersion: String, val serverTime: String,
    val cursor: String, val revision: String, val profile: JsonObject, val match: JsonObject? = null
)
@Serializable data class StateEvent(
    val eventId: String, val cursor: String, val type: String, val entityId: String,
    val revision: String, val serverTime: String, val profilePatch: JsonObject,
    val commandId: String? = null, val match: JsonObject? = null
)
@Serializable data class EventPage(val events: List<StateEvent>, val cursor: String, val hasMore: Boolean)
@Serializable data class PendingCommand(
    val account: String, val key: String, val kind: String, val body: JsonObject, val createdAt: Long
) {
    fun canRetry(now: Long): Boolean = now >= createdAt && now - createdAt < 7 * 86_400_000L && kind !in setOf("action", "leave")
}
@Serializable data class ContentRecord(val category: String, val key: String, val payload: JsonObject)
@Serializable data class Catalog(val version: String, val records: List<ContentRecord>) {
    fun category(name: String) = records.filter { it.category == name }
    fun find(category: String, key: String): JsonObject = records.find { it.category == category && it.key == key }?.payload ?: objectOf()
    fun symbolName(key: String) = if (key == "king") "Король" else find("symbol", key).text("name", key)
}
data class GameState(
    val account: String, val cursor: Long, val revision: Long,
    val profile: JsonObject, val match: JsonObject?, val serverTime: String
) {
    companion object {
        fun from(account: String, snapshot: Bootstrap): GameState {
            if (snapshot.apiVersion != 3) throw UpdateRequired()
            Cents.wire(snapshot.profile.text("balanceCents"))
            return GameState(account, decimal(snapshot.cursor), decimal(snapshot.revision), snapshot.profile, snapshot.match, snapshot.serverTime)
        }
    }
}
fun decimal(value: String): Long {
    require(value.matches(Regex("^[0-9]+$")))
    return value.toLong().also { require(it >= 0) }
}

class SnapshotRequired : Exception("Нужно обновить состояние с сервера")
object EventReducer {
    /** Pure, atomic batch: no partial state escapes if any event has a gap. */
    fun apply(initial: GameState, page: EventPage): GameState {
        var state = initial
        for (event in page.events) {
            val cursor = decimal(event.cursor)
            if (cursor <= state.cursor) continue
            if (cursor != state.cursor + 1 || event.type != "state.changed") throw SnapshotRequired()
            val revision = decimal(event.revision)
            if (revision <= state.revision) throw SnapshotRequired()
            var match = state.match
            event.match?.let { change ->
                match = if (change.containsKey("snapshot")) change["snapshot"] as? JsonObject else {
                    val old = match ?: throw SnapshotRequired()
                    if (change.text("baseRevision") != old.text("revision")) throw SnapshotRequired()
                    val patch = change.obj("patch").toMutableMap()
                    if (patch["board"] is JsonObject) {
                        val oldBoard = old.obj("board")
                        val boardPatch = (patch["board"] as JsonObject).toMutableMap()
                        val cells = boardPatch.remove("cells") as? JsonArray ?: JsonArray(emptyList())
                        val boards = oldBoard.array("boards").map { it.jsonArray.toMutableList() }
                        cells.forEach {
                            val cell = it.jsonObject
                            val side = cell.number("side").toInt(); val index = cell.number("index").toInt()
                            if (side !in boards.indices || index !in boards[side].indices) throw SnapshotRequired()
                            boards[side][index] = cell["value"] ?: throw SnapshotRequired()
                        }
                        patch["board"] = JsonObject(oldBoard + boardPatch + ("boards" to JsonArray(boards.map { JsonArray(it) })))
                    }
                    JsonObject(old + patch)
                }
            }
            val profile = JsonObject(state.profile + event.profilePatch)
            if (event.profilePatch["game"] == JsonNull) match = null
            Cents.wire(profile.text("balanceCents"))
            state = state.copy(cursor = cursor, revision = revision, profile = profile, match = match, serverTime = event.serverTime)
        }
        if (decimal(page.cursor) > state.cursor) throw SnapshotRequired()
        return state
    }
}
