package com.votarumshee.symbols.core

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.*
import java.util.UUID
import kotlin.random.Random

interface PrivateStore {
    suspend fun sessions(): List<Session>
    suspend fun active(): String?
    suspend fun saveSessions(sessions: List<Session>, active: String?)
    suspend fun pending(account: String): PendingCommand?
    suspend fun savePending(account: String, command: PendingCommand?)
    suspend fun clearAccount(account: String)
    suspend fun catalog(): Catalog?
    suspend fun saveCatalog(catalog: Catalog)
}
enum class Connection { SignedOut, Connecting, Live, LongPolling, Offline, Paused, Expired }
data class AppState(
    val game: GameState? = null, val catalog: Catalog? = null,
    val accounts: List<Session> = emptyList(), val connection: Connection = Connection.SignedOut,
    val busy: Boolean = false, val message: String? = null, val pending: PendingCommand? = null,
    val recoveryCode: String? = null, val market: JsonObject? = null,
    val serverOffsetMs: Long = 0
)
class GameRepository(private val api: SymbolsApi, private val store: PrivateStore, private val scope: CoroutineScope) {
    private val mutable = MutableStateFlow(AppState())
    val state: StateFlow<AppState> = mutable.asStateFlow()
    private var session: Session? = null
    private var generation = 0L
    private var stream: Job? = null
    private var background: Job? = null
    private var marketJob: Job? = null
    private var foreground = true
    private var online = true
    private val lifecycle = Mutex()
    private val commandLock = Mutex()
    private val snapshotLock = Mutex()

    suspend fun initialize() = lifecycle.withLock {
        val sessions = store.sessions()
        mutable.update { it.copy(accounts = sessions, catalog = store.catalog()) }
        sessions.find { it.id == store.active() }?.let { selectLocked(it) }
    }
    suspend fun authenticate(value: String, recover: Boolean) = lifecycle.withLock {
        if (mutable.value.busy) return@withLock
        mutable.update { it.copy(busy = true, message = null) }
        try {
            val next = api.authenticate(value.trim(), recover)
            val accounts = (store.sessions().filterNot { it.id == next.id } + next).takeLast(10)
            store.saveSessions(accounts, next.id)
            mutable.update { it.copy(accounts = accounts) }
            selectLocked(next)
        } catch (e: CancellationException) { throw e }
        catch (e: Exception) { error(e) }
        finally { mutable.update { it.copy(busy = false) } }
    }
    suspend fun select(account: String?) = lifecycle.withLock {
        selectLocked(store.sessions().find { it.id == account })
    }
    private suspend fun selectLocked(next: Session?) {
        generation++
        stream?.cancelAndJoin(); stream = null
        marketJob?.cancelAndJoin(); marketJob = null
        session?.let { store.clearAccount(it.id) } // Keep pending receipt journal; clear private snapshots.
        session = next
        val accounts = store.sessions()
        store.saveSessions(accounts, next?.id)
        mutable.value = AppState(accounts = accounts, catalog = mutable.value.catalog, connection = if (next == null) Connection.SignedOut else Connection.Connecting,
            pending = next?.let { store.pending(it.id) })
        if (next != null && foreground && online) launchStream()
    }
    fun foreground(value: Boolean) {
        foreground = value
        background?.cancel()
        if (value) {
            if (stream?.isActive != true && session != null && online) launchStream()
        } else background = scope.launch {
            delay(3_000)
            stream?.cancelAndJoin(); stream = null
            marketJob?.cancel()
            mutable.update { it.copy(connection = if (session == null) Connection.SignedOut else Connection.Paused, recoveryCode = null) }
        }
    }
    fun network(value: Boolean) {
        online = value
        if (!value) {
            stream?.cancel(); stream = null
            mutable.update { it.copy(connection = if (session == null) Connection.SignedOut else Connection.Offline) }
        } else if (foreground && session != null && stream?.isActive != true) launchStream()
    }
    fun reconnect() { if (session != null && stream?.isActive != true && online && foreground) launchStream() }
    private fun valid(g: Long, s: Session) = generation == g && session?.id == s.id
    private fun launchStream() {
        if (stream?.isActive == true) return
        val s = session ?: return
        val g = generation
        stream = scope.launch {
            var failures = 0
            var snapshotNeeded = true
            while (isActive && valid(g, s) && foreground && online) {
                try {
                    if (snapshotNeeded) { bootstrap(s, g); snapshotNeeded = false }
                    if (failures >= 3) {
                        mutable.update { it.copy(connection = Connection.LongPolling) }
                        // Bounded fallback: one request at a time, then another WS attempt.
                        repeat(3) { apply(s, g, api.changes(s.token, mutable.value.game?.cursor ?: 0)) }
                        failures = 0
                    }
                    api.events(s.token, mutable.value.game?.cursor ?: 0,
                        connected = { if (valid(g, s)) mutable.update { it.copy(connection = Connection.Live, message = null) } },
                        receive = { page -> apply(s, g, page); failures = 0 })
                    throw ApiFailure(503, "DISCONNECTED", "Соединение прервано")
                } catch (e: CancellationException) { throw e }
                catch (e: Exception) {
                    if (!valid(g, s)) break
                    if (e is ApiFailure && e.status == 401) {
                        expire(s); break
                    }
                    snapshotNeeded = snapshotNeeded || e is SnapshotRequired || e is ApiFailure && e.status == 409
                    mutable.update { it.copy(connection = Connection.Offline, message = "Связь потеряна. Ход и таймер продолжаются на сервере.") }
                    failures++
                    api.traffic.reconnects.incrementAndGet()
                    val delayMs = maxOf((e as? ApiFailure)?.retryAfterMs ?: 0, retryDelay(failures))
                    delay(delayMs)
                }
            }
        }
    }
    private suspend fun bootstrap(s: Session, g: Long) = snapshotLock.withLock {
        val snapshot = api.bootstrap(s.token)
        val game = GameState.from(s.id, snapshot)
        if (!valid(g, s)) return@withLock
        val cached = mutable.value.catalog
        if (cached?.version != snapshot.contentVersion) {
            val result = api.catalog(s.token, cached?.let { "\"${it.version}\"" })
            val catalog = result.catalog ?: cached ?: throw SnapshotRequired()
            require(catalog.version == snapshot.contentVersion) { "Каталог изменился. Повтори подключение." }
            store.saveCatalog(catalog)
            if (!valid(g, s)) return@withLock
            mutable.update { it.copy(catalog = catalog) }
        }
        val offset = java.time.Instant.parse(snapshot.serverTime).toEpochMilli() - System.currentTimeMillis()
        mutable.update { old -> if (!valid(g, s) || old.game?.let { it.account == s.id && it.cursor > game.cursor } == true) old else old.copy(game = game, serverOffsetMs = offset) }
    }
    private suspend fun apply(s: Session, g: Long, page: EventPage) {
        if (!valid(g, s)) return
        val initial = mutable.value.game ?: throw SnapshotRequired()
        val next = EventReducer.apply(initial, page)
        val pending = mutable.value.pending
        val confirmed = pending != null && page.events.any { it.commandId == pending.key }
        if (confirmed) store.savePending(s.id, null)
        if (valid(g, s)) mutable.update { it.copy(game = next, pending = if (confirmed) null else it.pending) }
    }
    suspend fun command(kind: String, body: JsonObject = objectOf(), retry: Boolean = false): JsonObject? {
        if (!commandLock.tryLock()) return null
        val s = session
        val g = generation
        try {
            if (s == null || mutable.value.game == null) return null
            if (!online || mutable.value.connection !in setOf(Connection.Live, Connection.LongPolling)) {
                mutable.update { it.copy(message = "Нет связи. Операция не отправлена.") }; return null
            }
            val previous = store.pending(s.id)
            if (previous != null && !retry) { mutable.update { it.copy(pending = previous, message = "Сначала сверь незавершённую операцию.") }; return null }
            val pending = if (retry) previous?.takeIf { it.canRetry(System.currentTimeMillis()) }
                ?: throw IllegalStateException("Этот ход или старая операция не повторяется. Обнови состояние и свяжись с поддержкой.")
            else PendingCommand(s.id, UUID.randomUUID().toString(), kind, body, System.currentTimeMillis())
            store.savePending(s.id, pending)
            mutable.update { it.copy(busy = true, pending = pending, message = null) }
            val result = api.command(s.token, pending)
            store.savePending(s.id, null)
            if (!valid(g, s)) return result
            if (pending.kind in setOf("logout", "delete-account")) {
                val accounts = store.sessions().filterNot { it.id == s.id }
                store.saveSessions(accounts, null)
                select(null)
            } else mutable.update { it.copy(pending = null, message = if (pending.kind == "recovery-code") "Код показан один раз. Сохрани его в безопасном месте." else "Операция подтверждена сервером",
                recoveryCode = if (pending.kind == "recovery-code") result.text("code").takeIf { code -> code.isNotBlank() } else it.recoveryCode) }
            return result
        } catch (e: CancellationException) { throw e }
        catch (e: Exception) {
            if (s != null && valid(g, s)) {
                if (e is ApiFailure && e.status in 400..499 && e.status != 408 && e.status != 429) {
                    store.savePending(s.id, null)
                    mutable.update { it.copy(pending = null) }
                    if (e.status == 401) expire(s)
                    if (e.status == 409) { stream?.cancelAndJoin(); stream = null; launchStream() }
                }
                error(e)
            }
        } finally {
            if (generation == g) mutable.update { it.copy(busy = false) }
            commandLock.unlock()
        }
        return null
    }
    suspend fun reconcileMove() {
        val s = session ?: return
        val pending = store.pending(s.id) ?: return
        if (pending.kind !in setOf("action", "leave")) return
        stream?.cancelAndJoin(); stream = null
        bootstrap(s, generation)
        // Never replay a move after a restart/timeout. The new authoritative board is displayed.
        store.savePending(s.id, null)
        mutable.update { it.copy(pending = null, message = "Показано актуальное поле. Старый ход повторно не отправлен.") }
        launchStream()
    }
    fun market(symbol: String?, offset: Int = 0, descending: Boolean = false) {
        marketJob?.cancel()
        val s = session ?: return
        val g = generation
        marketJob = scope.launch {
            delay(300)
            try {
                val page = api.market(s.token, symbol, offset, descending)
                if (valid(g, s)) mutable.update { it.copy(market = page) }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (valid(g, s)) error(e) }
        }
    }
    fun leaveMarket() { marketJob?.cancel(); marketJob = null }
    fun dismissMessage() { mutable.update { it.copy(message = null, recoveryCode = null) } }
    private suspend fun expire(s: Session) {
        store.clearAccount(s.id)
        val accounts = store.sessions().filterNot { it.id == s.id }
        store.saveSessions(accounts, null)
        generation++; session = null
        mutable.value = AppState(catalog = mutable.value.catalog, accounts = accounts, connection = Connection.Expired, message = "Сессия истекла. Войди по коду восстановления.")
    }
    private fun error(e: Exception) {
        mutable.update { it.copy(message = when (e) {
            is ApiFailure -> e.message
            is IllegalArgumentException, is IllegalStateException -> e.message ?: "Проверь введённые данные"
            else -> "Сервер недоступен. Если операция была отправлена, сверь её результат перед повтором."
        }) }
    }
}
fun retryDelay(attempt: Int, random: Random = Random.Default): Long {
    val cap = minOf(30_000L, 1_000L shl attempt.coerceIn(0, 5))
    return random.nextLong(cap / 2, cap + 1)
}
