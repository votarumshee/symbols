package com.votarumshee.symbols

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.SystemBarStyle
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.activity.compose.LocalActivity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.votarumshee.symbols.core.*
import kotlinx.serialization.json.*

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Account recovery secrets must not leak through screenshots or the recent-app preview.
        enableEdgeToEdge(statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT), navigationBarStyle = SystemBarStyle.dark(android.graphics.Color.rgb(13,25,22)))
        setContent { SymbolsTheme { SymbolsRoot() } }
    }
}
@Composable fun SymbolsTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = darkColorScheme(primary = Color(0xFFC7EF7D), onPrimary = Color(0xFF183023),
        background = Color(0xFF0D1916), surface = Color(0xFF152720), secondary = Color(0xFF9ACCB5),
        surfaceVariant = Color(0xFF25392F)), content = content)
}
@Composable private fun SymbolsRoot(vm: GameViewModel = viewModel()) {
    val repository = vm.repository
    vm.app.configurationError?.let { message -> Surface(Modifier.fillMaxSize()) { Text(message, Modifier.safeDrawingPadding().padding(24.dp)) }; return }
    if (repository == null) { Surface(Modifier.fillMaxSize()) { Text(vm.app.configurationError.orEmpty(), Modifier.safeDrawingPadding().padding(24.dp)) }; return }
    val state by repository.state.collectAsStateWithLifecycle()
    val activity = LocalActivity.current
    SideEffect {
        if (state.game == null || state.recoveryCode != null) activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        else activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
    }
    val reduced by vm.app.reducedEffects.collectAsStateWithLifecycle(false)
    var page by rememberSaveable { mutableStateOf("home") }
    var confirmation by remember { mutableStateOf<Pair<String, JsonObject>?>(null) }
    val account = state.game?.account
    var previousAccount by rememberSaveable { mutableStateOf(account) }
    var previousMatch by rememberSaveable { mutableStateOf<String?>(null) }
    LaunchedEffect(account) { if (previousAccount != account) { page = "home"; confirmation = null; previousAccount = account; previousMatch = null } }
    LaunchedEffect(state.game?.match?.text("id")) {
        val id = state.game?.match?.text("id")
        if (id != previousMatch) { if (id != null) page = "game"; previousMatch = id }
    }
    BackHandler(page != "home") { page = "home"; repository.leaveMarket() }
    fun navigate(next: String) { repository.leaveMarket(); page = next; if (next == "market") repository.market(null) }
    val command: (String, JsonObject) -> Unit = { kind, body ->
        if (kind in setOf("buy", "sell", "cancel", "buy-case", "open-case", "buy-skin", "buy-avatar", "upgrade", "delete-account", "logout", "leave")) confirmation = kind to body
        else vm.command(kind, body)
    }
    Scaffold(containerColor = MaterialTheme.colorScheme.background, topBar = {
        Column(Modifier.statusBarsPadding().fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(onClick = { navigate("home") }) { Text("♛  СИМВОЛЫ", fontWeight = FontWeight.Bold) }
                state.game?.profile?.let { Text("${Cents.wire(it.text("balanceCents")).display()} ♦", Modifier.padding(12.dp)) }
            }
            if (account != null) Text(when(state.connection) {
                Connection.Live -> "● На связи"
                Connection.LongPolling -> "↻ Резервное соединение"
                Connection.Connecting -> "Подключаемся…"
                Connection.Paused -> "Пауза · таймер партии продолжается"
                else -> "Нет связи · показано последнее состояние"
            }, style = MaterialTheme.typography.labelMedium)
        }
    }) { padding ->
        Column(Modifier.padding(padding).consumeWindowInsets(padding).imePadding()) {
            state.message?.let { message ->
                Surface(color = MaterialTheme.colorScheme.surfaceVariant) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(message, Modifier.weight(1f).padding(vertical = 10.dp), style = MaterialTheme.typography.bodySmall)
                        TextButton(onClick = repository::dismissMessage) { Text("ОК") }
                    }
                }
            }
            if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            state.pending?.let { pending ->
                Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Незавершённая операция", Modifier.weight(1f))
                    TextButton(enabled = !state.busy, onClick = { if (pending.kind in setOf("action", "leave")) vm.reconcileMove() else vm.retry() }) { Text("Сверить") }
                }
            }
            if (state.game == null) {
                LoginScreen(state, vm::login, vm::select, repository::reconnect)
            } else when(page) {
                "home" -> HomeScreen(state, ::navigate)
                "modes" -> ModeScreen(state, command)
                "game" -> MatchScreen(state, reduced, command)
                "inventory", "upgrades", "shop", "skins", "avatars", "frames" -> CollectionScreen(page, state, command, ::navigate)
                "market" -> MarketScreen(state, repository, command, ::navigate)
                "profile" -> ProfileScreen(state, command, ::navigate)
                "accounts" -> AccountsScreen(state, vm::select, command)
                "quests" -> QuestScreen(state)
                "rules" -> RulesScreen(state)
                "settings" -> SettingsScreen(reduced, vm::reduceEffects, command)
            }
        }
    }
    confirmation?.let { (kind, body) ->
        AlertDialog(onDismissRequest = { confirmation = null }, title = { Text(if (kind == "delete-account") "Удалить аккаунт навсегда?" else "Подтвердить действие") },
            text = { Text(confirmationText(kind, body, state.catalog)) },
            confirmButton = { TextButton(enabled = !state.busy, onClick = { confirmation = null; vm.command(kind, body) }) { Text("Подтвердить") } },
            dismissButton = { TextButton(onClick = { confirmation = null }) { Text("Отмена") } })
    }
    state.recoveryCode?.let { code ->
        AlertDialog(onDismissRequest = repository::dismissMessage, title = { Text("Код восстановления") },
            text = { Column { Text(code, style = MaterialTheme.typography.headlineSmall); Text("Запиши код в безопасном месте. Не отправляй его в поддержку или чат. Новый код заменяет прежний.") } },
            confirmButton = { TextButton(onClick = repository::dismissMessage) { Text("Сохранил") } })
    }
}
@Composable fun Page(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text(title, style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
        content()
        Spacer(Modifier.height(20.dp))
    }
}
@Composable fun Tile(title: String, detail: String = "", onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp)) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            if (detail.isNotBlank()) Text(detail, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.secondary)
        }
    }
}
@Composable fun Action(text: String, enabled: Boolean = true, onClick: () -> Unit) {
    Button(onClick, Modifier.fillMaxWidth().heightIn(min = 48.dp), enabled = enabled) { Text(text) }
}
@Composable fun Entry(value: String, onChange: (String) -> Unit, label: String, number: Boolean = false) {
    OutlinedTextField(value, onChange, Modifier.fillMaxWidth(), label = { Text(label) }, singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = if (number) KeyboardType.Number else KeyboardType.Text))
}
@Composable private fun LoginScreen(state: AppState, login: (String, Boolean) -> Unit, select: (String?) -> Unit, reconnect: () -> Unit) {
    var recovery by rememberSaveable { mutableStateOf(false) }
    var nick by rememberSaveable { mutableStateOf("") }
    var code by remember { mutableStateOf("") } // Deliberately excluded from saved instance state.
    Page(if (recovery) "С возвращением" else "Твой первый ход") {
        Text("Пошаговая игра о точном ходе. Поставь короля, собери защиту и найди путь к победе.")
        if (recovery) {
            Text("В старой игре открой Профиль → Восстановить аккаунт и сохрани код до перехода. После переноса данных сервером введи его здесь. Данные браузера сами не переносятся.")
            OutlinedTextField(code, { code = it }, Modifier.fillMaxWidth(), label = { Text("Код восстановления") }, singleLine = true, visualTransformation = PasswordVisualTransformation())
            Action("Восстановить аккаунт", !state.busy && code.length in 9..40) { login(code, true); code = "" }
        } else {
            Entry(nick, { nick = it.take(20) }, "Никнейм")
            Action("Создать аккаунт", !state.busy && nick.isNotBlank()) { login(nick, false) }
        }
        TextButton(onClick = { recovery = !recovery; code = "" }) { Text(if (recovery) "Создать новый аккаунт" else "У меня уже есть аккаунт") }
        if (state.connection in setOf(Connection.Connecting, Connection.Offline)) Action("Повторить подключение", onClick = reconnect)
        state.accounts.forEach { account -> Tile(account.nick, "Открыть сохранённый аккаунт") { select(account.id) } }
        Text("Новый аккаунт создаётся только по твоей кнопке. Ошибка восстановления не стирает прежний прогресс.", style = MaterialTheme.typography.bodySmall)
    }
}
@Composable private fun HomeScreen(state: AppState, navigate: (String) -> Unit) {
    val profile = state.game!!.profile
    Page("Привет, ${profile.text("nick")}") {
        ProfileArt(profile, state.catalog)
        Text("${profile.obj("rank").text("name", "Без звания")} · ${profile.number("xp")} опыта", color = MaterialTheme.colorScheme.secondary)
        if (state.game?.match?.text("status")?.let { it != "done" } == true) Tile("Продолжить партию", "Ход и таймер продолжаются даже вне приложения") { navigate("game") }
        Tile("Играть  ↗", "Дуэль, команды, испытания и игра с другом") { navigate("modes") }
        Tile("Инвентарь", "Твои символы, кейсы и улучшения") { navigate("inventory") }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedButton({ navigate("shop") }, Modifier.weight(1f)) { Text("Магазин") }
            OutlinedButton({ navigate("market") }, Modifier.weight(1f)) { Text("Рынок") }
        }
        listOf("profile" to "Профиль и история", "quests" to "Задания", "rules" to "Правила и символы", "accounts" to "Аккаунты", "settings" to "Настройки и данные").forEach { (id, label) -> TextButton({ navigate(id) }) { Text(label) } }
    }
}
@Composable private fun ModeScreen(state: AppState, command: (String, JsonObject) -> Unit) {
    var small by rememberSaveable { mutableStateOf(true) }
    var code by rememberSaveable { mutableStateOf("") }
    Page("Выбери игру") {
        Row { Switch(small, { small = it }); Text(if (small) "Поле 10 × 14" else "Поле 28 × 20", Modifier.padding(12.dp)) }
        listOf("play" to "Поиск соперника / обучение", "duel" to "Дуэль · один на один", "team" to "Команды · 2 × 2", "trial" to "Испытание звания", "local" to "Двое на одном устройстве").forEach { (mode, label) ->
            Action(label, !state.busy) { command("start", objectOf("mode" to mode, "small" to small)) }
        }
        Text("Если соперник не найден за 8 секунд, сервер добавит бота. В комнате по коду ожидание продолжается до входа друга.")
        Entry(code, { code = it.uppercase().take(6) }, "Код комнаты")
        Action(if (code.isBlank()) "Создать комнату" else "Войти в комнату", !state.busy && (code.isBlank() || code.length == 6)) {
            command("start", if (code.isBlank()) objectOf("mode" to "room", "small" to small) else objectOf("mode" to "room", "small" to small, "code" to code))
        }
    }
}
@Composable private fun ProfileScreen(state: AppState, command: (String, JsonObject) -> Unit, navigate: (String) -> Unit) {
    val profile = state.game!!.profile
    var nick by rememberSaveable(profile.text("nick")) { mutableStateOf(profile.text("nick")) }
    Page("Профиль") {
        ProfileArt(profile, state.catalog)
        Text("${profile.obj("rank").text("name", "Без звания")} · ${profile.number("rankProgress")}%")
        val levels = state.catalog?.category("level").orEmpty()
        val level = profile.obj("level").takeIf { it.isNotEmpty() } ?: levels.lastOrNull { it.payload.number("xp") <= profile.number("xp") }?.payload
        Text("Уровень ${level?.number("level") ?: 1} · опыт ${profile.number("xp")}")
        Text("До следующего уровня: ${((level?.number("next") ?: 0) - profile.number("xp")).coerceAtLeast(0)} опыта. Каждые 10 уровней сервер выдаёт случайный кейс; уровни продолжаются после 300.")
        profile.array("levelRewards").takeLast(30).reversed().forEach { reward ->
            val r = reward.jsonObject
            Text("Уровень ${r.number("level")}: ${state.catalog?.find("case", r.text("case"))?.text("name", r.text("case"))}")
        }
        Entry(nick, { nick = it.take(20) }, "Никнейм")
        Action("Сохранить ник", !state.busy && nick.isNotBlank()) { command("nickname", objectOf("nick" to nick)) }
        Row { TextButton({ navigate("avatars") }) { Text("Аватарки") }; TextButton({ navigate("frames") }) { Text("Рамки") } }
        Action("Получить новый код восстановления", !state.busy) { command("recovery-code", objectOf()) }
        Text("История матчей", style = MaterialTheme.typography.titleLarge)
        if (profile.array("history").isEmpty()) Text("Здесь появятся результаты партий.")
        profile.array("history").reversed().forEach { entry ->
            val h = entry.jsonObject
            Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp)) {
                Text(if (h.text("outcome") == "win") "Победа" else "Поражение", fontWeight = FontWeight.Bold)
                Text("${h.text("opponent", "Бот")} · ${h.number("xp")} опыта")
                Text(java.time.Instant.ofEpochMilli(h.number("at")).atZone(java.time.ZoneId.systemDefault()).toLocalDate().toString())
            } }
        }
    }
}
@Composable private fun AccountsScreen(state: AppState, select: (String?) -> Unit, command: (String, JsonObject) -> Unit) {
    Page("Аккаунты") {
        Text("Переключение не завершает текущую партию. Таймер продолжится на сервере.")
        state.accounts.forEach { account -> Tile(if (account.id == state.game?.account) state.game!!.profile.text("nick") + " · текущий" else account.nick) { select(account.id) } }
        Action("Добавить / восстановить аккаунт") { select(null) }
        Action("Выйти из текущего аккаунта", !state.busy) { command("logout", objectOf()) }
    }
}
@Composable private fun QuestScreen(state: AppState) {
    Page("Задания") {
        Text("Награды подтверждает сервер после партии. Задания можно выполнять снова в следующих партиях.")
        state.catalog?.category("quest")?.forEach { quest -> Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(18.dp)) {
            Text(quest.payload.text("title"), style = MaterialTheme.typography.titleMedium)
            Text(quest.payload.text("text"))
            Text("${quest.payload.number("reward")} руб. · выполнено: ${state.game?.profile?.obj("quests")?.number(quest.key) ?: 0}")
        } } }
    }
}
@Composable private fun SettingsScreen(reduced: Boolean, reduce: (Boolean) -> Unit, command: (String, JsonObject) -> Unit) {
    val uri = LocalUriHandler.current
    Page("Настройки и данные") {
        Row { Switch(reduced, reduce); Text("Уменьшить эффекты", Modifier.padding(12.dp)) }
        Text("Реклама, аналитика и платежи за реальные деньги отсутствуют. Сеть нужна для игры, в том числе вдвоём на одном устройстве.")
        listOf("Политика конфиденциальности" to BuildConfig.PRIVACY_URL, "Поддержка" to BuildConfig.SUPPORT_URL, "Удаление через сайт" to (BuildConfig.API_URL + "/account-deletion")).forEach { (label, url) ->
            if (url.startsWith("https://")) TextButton({ uri.openUri(url) }) { Text(label) }
            else Text("$label: адрес ещё не предоставлен владельцем", style = MaterialTheme.typography.bodySmall)
        }
        Text("Версия ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE}) · GPL-3.0. Исходные материалы и авторство сохранены в репозитории votarumshee/symbols.")
        Action("Удалить аккаунт", onClick = { command("delete-account", objectOf("confirm" to true)) })
    }
}
private fun confirmationText(kind: String, body: JsonObject, catalog: Catalog?): String = when(kind) {
    "delete-account" -> "Профиль, инвентарь, история и доступ будут удалены сервером. Открытые предложения отменятся. Это действие необратимо."
    "logout" -> "Доступ на этом устройстве будет отозван. Для следующего входа понадобится код восстановления. Убедись, что сохранил его."
    "leave" -> "Поиск отменится. Выход из начавшейся партии считается поражением."
    "buy-case" -> "Купить ${catalog?.find("case", body.text("case"))?.text("name")} за ${catalog?.find("case", body.text("case"))?.number("priceCents")?.let { Cents(it).display() }} руб.?"
    "open-case" -> "Открыть один кейс? Результат определит сервер по показанным вероятностям."
    "sell" -> "Выставить ${body.number("quantity", 1)} шт. ${catalog?.symbolName(body.text("symbol"))} по базовой цене ${body.text("price")} руб.? Надбавку за скин рассчитает сервер."
    "buy" -> "Купить выбранное предложение по показанной точной цене?"
    "cancel" -> "Снять предложение с рынка и вернуть предмет в инвентарь?"
    "upgrade" -> "Купить улучшение ${catalog?.symbolName(body.text("symbol"))}? Оно подействует со следующей партии."
    else -> "Подтвердить покупку по указанной цене за игровые рубины?"
}
