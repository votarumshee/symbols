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
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
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
    MaterialTheme(colorScheme = darkColorScheme(primary = Color(0xFFF5F5F5), onPrimary = Color(0xFF111111),
        background = Color(0xFF100E18), surface = Color(0xFF241E2D), secondary = Color(0xFFE0D8E9),
        surfaceVariant = Color(0xFF30283A)), content = content)
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
        if (id != previousMatch) { if (id != null && state.game?.match?.text("status") != "done") page = "game"; previousMatch = id }
    }
    BackHandler(page != "home") { page = "home"; repository.leaveMarket() }
    fun navigate(next: String) { repository.leaveMarket(); page = next; if (next == "market") repository.market(null) }
    val command: (String, JsonObject) -> Unit = { kind, body ->
        if (kind in setOf("buy", "sell", "cancel", "buy-case", "open-case", "buy-skin", "buy-avatar", "delete-account", "logout", "leave")) confirmation = kind to body
        else vm.command(kind, body)
    }
    Scaffold(contentColor = Color(0xFFF3F3F3), containerColor = Color.Transparent, modifier = Modifier.background(androidx.compose.ui.graphics.Brush.linearGradient(listOf(Color(0xFF25192F), Color(0xFF10211E), Color(0xFF2B1924)))), topBar = {
        Column(Modifier.statusBarsPadding()) {
            if (account != null && page !in setOf("home", "game")) Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(onClick = { navigate("home") }) { Text("На главную") }
                Text("♦ ${Cents.wire(state.game!!.profile.text("balanceCents")).display()}", Modifier.padding(12.dp))
            }
            if (account != null && state.connection !in setOf(Connection.Live)) Text(when(state.connection) {
                Connection.LongPolling -> "↻ Резервное соединение"
                Connection.Connecting -> "Подключаемся…"
                Connection.Paused -> "Пауза · таймер партии продолжается"
                else -> "Нет связи · показано последнее состояние"
            }, Modifier.padding(horizontal = 12.dp), style = MaterialTheme.typography.labelSmall)
        }
    }) { padding ->
        Column(Modifier.padding(padding).consumeWindowInsets(padding).imePadding()) {
            state.message?.takeUnless { it == "Операция подтверждена сервером" }?.let { message ->
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
                "game" -> MatchScreen(state, reduced, command, ::navigate)
                "inventory", "upgrades", "shop", "skins", "avatars", "frames" -> CollectionScreen(page, state, command, ::navigate)
                "market" -> MarketScreen(state, repository, command, ::navigate)
                "profile" -> { HomeScreen(state, ::navigate); AlertDialog(onDismissRequest={navigate("home")},title={Text("Профиль")},text={Box(Modifier.height(500.dp)){ProfileScreen(state,command,::navigate)}},confirmButton={}) }
                "accounts" -> AccountsScreen(state, vm::select, command)
                "quests" -> QuestScreen(state)
                "rules" -> { HomeScreen(state, ::navigate); AlertDialog(onDismissRequest={navigate("home")},title={Text("Правила")},text={Box(Modifier.height(500.dp)){RulesScreen(state)}},confirmButton={}) }
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
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(10.dp)) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            if (detail.isNotBlank()) Text(detail, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.secondary)
        }
    }
}
@Composable fun Action(text: String, enabled: Boolean = true, onClick: () -> Unit) {
    Button(onClick, Modifier.fillMaxWidth().heightIn(min = 52.dp), enabled = enabled, shape = RoundedCornerShape(12.dp)) { Text(text) }
}
@Composable fun Entry(value: String, onChange: (String) -> Unit, label: String, number: Boolean = false) {
    OutlinedTextField(value, onChange, Modifier.fillMaxWidth(), label = { Text(label) }, singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = if (number) KeyboardType.Number else KeyboardType.Text))
}
@Composable private fun LoginScreen(state: AppState, login: (String, Boolean) -> Unit, select: (String?) -> Unit, reconnect: () -> Unit) {
    var recovery by rememberSaveable { mutableStateOf(false) }
    var nick by rememberSaveable { mutableStateOf("") }
    var code by remember { mutableStateOf("") } // Deliberately excluded from saved instance state.
    Box(Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) {
        Column(Modifier.fillMaxWidth().padding(14.dp).background(androidx.compose.ui.graphics.Brush.linearGradient(listOf(Color(0xFF241A2D),Color(0xFF162721),Color(0xFF2E1B23))), RoundedCornerShape(18.dp)).border(1.dp,Color(0xFF55505F),RoundedCornerShape(18.dp)).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(if(recovery) "Войти по коду" else "Твой ник",style=MaterialTheme.typography.headlineSmall,fontWeight=FontWeight.Bold)
            if(recovery) OutlinedTextField(code,{code=it},Modifier.fillMaxWidth(),label={Text("Код восстановления")},singleLine=true,visualTransformation=PasswordVisualTransformation()) else Entry(nick,{nick=it.take(20)},"Ник")
            Action(if(recovery)"Восстановить аккаунт" else "Создать аккаунт",!state.busy && (if(recovery)code.length in 9..40 else nick.isNotBlank())){if(recovery){login(code,true);code=""}else login(nick,false)}
            TextButton(onClick={recovery=!recovery;code=""}){Text(if(recovery)"Создать новый аккаунт" else "У меня уже есть аккаунт")}
            if(state.connection in setOf(Connection.Connecting,Connection.Offline)) TextButton(onClick=reconnect){Text("Повторить подключение")}
            state.accounts.forEach { account -> TextButton(onClick={select(account.id)}){Text(account.nick)} }
        }
    }

}
@Composable private fun HomeScreen(state: AppState, navigate: (String) -> Unit) {
    val profile = state.game!!.profile
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(14.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = androidx.compose.ui.Alignment.Top) {
            Column(horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally, modifier = Modifier.width(94.dp).clickable { navigate("profile") }) {
                Text(profile.obj("rank").text("name", "Без звания"), style = MaterialTheme.typography.labelMedium)
                RankArt(profile.obj("rank"))
                Text(profile.text("nick"), style = MaterialTheme.typography.labelLarge)
            }
            Surface(color = Color(0xFFF5F5F5), contentColor = Color(0xFF111111), shape = RoundedCornerShape(10.dp), modifier = Modifier.padding(top = 24.dp).width(110.dp).clickable { navigate("profile") }) {
                Column(Modifier.padding(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { Text("Уровень ${profile.obj("level").number("level",1)}", style = MaterialTheme.typography.labelMedium); Text("${profile.number("xp")} / ${profile.obj("level").number("next",260)} очков", style = MaterialTheme.typography.labelSmall); LinearProgressIndicator(progress = { (profile.number("xp").toFloat() / profile.obj("level").number("next",260).coerceAtLeast(1)).coerceIn(0f,1f) }, color = Color(0xFF8961ED), trackColor = Color(0xFFD6DEEB), drawStopIndicator = {}) }
            }
            Box(Modifier.padding(top = 22.dp).clickable { navigate("profile") }) { AvatarArt(profile.text("avatar", "lion"), size = 64.dp) }
        }
        Text("♦  ${Cents.wire(profile.text("balanceCents")).display()} рубинов", Modifier.align(androidx.compose.ui.Alignment.End).padding(vertical = 14.dp).background(Color(0xFF202020),RoundedCornerShape(12.dp)).border(1.dp,Color(0xFF444444),RoundedCornerShape(12.dp)).padding(10.dp), style = MaterialTheme.typography.labelLarge)
        Spacer(Modifier.weight(1f).heightIn(min = 14.dp))
        Row(Modifier.align(androidx.compose.ui.Alignment.CenterHorizontally), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            listOf("arrow", "king", "smile").forEachIndexed { i,t -> Surface(modifier=Modifier.rotate(listOf(-6f,5f,-3f)[i]),color = listOf(Color(0xFF30233F),Color(0xFF203A30),Color(0xFF402633))[i], shape = RoundedCornerShape(12.dp), border = BorderStroke(1.dp, Color(0xFF655369))) { Box(Modifier.padding(11.dp)) { SymbolBadge(t, size = 42.dp) } } }
        }
        Text("Символы", Modifier.align(androidx.compose.ui.Alignment.CenterHorizontally).padding(top = 18.dp, bottom = 28.dp), style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold)
        Action(if (state.game?.match?.text("status")?.let { it != "done" } == true) "Продолжить партию" else "Играть") { navigate(if (state.game?.match?.text("status")?.let { it != "done" } == true) "game" else "modes") }
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) { listOf("profile" to "Профиль", "inventory" to "Инвентарь").forEach { (id,label) -> Button(onClick = { navigate(id) }, modifier = Modifier.weight(1f).height(56.dp), shape = RoundedCornerShape(12.dp)) { Text(label) } } }
        Button(onClick = { navigate("upgrades") }, modifier = Modifier.align(androidx.compose.ui.Alignment.End).padding(top = 12.dp, end = 18.dp), shape = RoundedCornerShape(12.dp)) { Text("Улучшить") }
        Spacer(Modifier.weight(1f).heightIn(min = 16.dp))
        listOf(listOf("market" to "Рынок", "shop" to "Магазин", "quests" to "Задания"), listOf("accounts" to "Аккаунты", "rules" to "Правила", "settings" to "Настройки")).forEach { row -> Row(Modifier.align(androidx.compose.ui.Alignment.CenterHorizontally), horizontalArrangement = Arrangement.spacedBy(4.dp)) { row.forEach { (id,label) -> Button(onClick = { navigate(id) }, shape = RoundedCornerShape(10.dp), contentPadding = PaddingValues(horizontal = 10.dp, vertical = 8.dp)) { Text(label, style = MaterialTheme.typography.bodySmall) } } } }
    }
}
@Composable private fun ModeScreen(state: AppState, command: (String, JsonObject) -> Unit) {
    var small by rememberSaveable { mutableStateOf(true) }
    var code by rememberSaveable { mutableStateOf("") }
    var room by rememberSaveable { mutableStateOf(false) }
    Page("Играть") {
        listOf(Triple("play","Играть","Поиск соперника"),Triple("duel","Дуэль","Один на один"),Triple("team","Дуэль 2 на 2","Четыре короля · две команды"),Triple("trial","Повысить звание","Пять сложностей")).forEach { (mode,title,detail) ->
            Button(onClick={command("start",objectOf("mode" to mode,"small" to small))},enabled=!state.busy,shape=RoundedCornerShape(12.dp),modifier=Modifier.fillMaxWidth(),contentPadding=PaddingValues(16.dp)) {Column(Modifier.fillMaxWidth()){Text(title,style=MaterialTheme.typography.titleMedium);Text(detail,style=MaterialTheme.typography.bodySmall)}}
        }
        Choice("Размер поля",listOf("small","large"),if(small)"small" else "large",{small=it=="small"}){if(it=="small")"10 × 14" else "28 × 20"}
        TextButton(onClick={room=true}){Text("С другом по коду")}
        Action("Двое на одном устройстве",!state.busy){command("start",objectOf("mode" to "local","small" to small))}
    }
    if(room)AlertDialog(onDismissRequest={room=false},title={Text("С другом по коду")},text={Entry(code,{code=it.uppercase().take(6)},"Код комнаты")},confirmButton={TextButton(enabled=!state.busy && (code.isBlank()||code.length==6),onClick={command("start",if(code.isBlank())objectOf("mode" to "room","small" to small)else objectOf("mode" to "room","small" to small,"code" to code));room=false}){Text(if(code.isBlank())"Создать комнату" else "Войти")}},dismissButton={TextButton(onClick={room=false}){Text("Отмена")}})
}
@Composable private fun ProfileScreen(state: AppState, command: (String, JsonObject) -> Unit, navigate: (String) -> Unit) {
    val profile=state.game!!.profile
    var nick by rememberSaveable(profile.text("nick")){mutableStateOf(profile.text("nick"))}
    var editing by rememberSaveable { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(16.dp)) {
        Box(Modifier.align(androidx.compose.ui.Alignment.CenterHorizontally).clickable {navigate("avatars")}){AvatarArt(profile.text("avatar","lion"),state.catalog?.find("frame",profile.text("frame"))?:objectOf(),profile.obj("level").number("level",1),96.dp)}
        Text(profile.obj("rank").text("name","Без звания"),Modifier.align(androidx.compose.ui.Alignment.CenterHorizontally),color=Color(0xFFB6ABCA),style=MaterialTheme.typography.labelMedium)
        Text(profile.text("nick"),fontWeight=FontWeight.Bold)
        Surface(color=Color(0xFFF5F5F5),contentColor=Color(0xFF111111),shape=RoundedCornerShape(10.dp)){Column(Modifier.padding(10.dp)){Text("Уровень ${profile.obj("level").number("level",1)}",style=MaterialTheme.typography.labelLarge);Text("${profile.number("xp")} / ${profile.obj("level").number("next",260)} очков",style=MaterialTheme.typography.bodySmall)}}
        LinearProgressIndicator(progress={profile.number("rankProgress")/100f},modifier=Modifier.fillMaxWidth(),color=Color(0xFF8961ED),trackColor=Color(0xFFD6DEEB),drawStopIndicator={})
        Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){TextButton(onClick={editing=true}){Text("Изменить ник")};TextButton(onClick={navigate("frames")}){Text("Рамки")}}
        TextButton(onClick={command("recovery-code",objectOf())},enabled=!state.busy){Text("Восстановить аккаунт")}
        HorizontalDivider()
        Text("История матчей",style=MaterialTheme.typography.titleLarge)
        if(profile.array("history").isEmpty())Text("Здесь появятся результаты партий.")
        profile.array("history").reversed().forEach { value -> val h=value.jsonObject;Surface(color=Color(0xFF242424),shape=RoundedCornerShape(8.dp)){Column(Modifier.fillMaxWidth().padding(12.dp)){Text(if(h.text("outcome")=="win")"Победа" else "Поражение");Text("${h.text("opponent","Бот")} · ${h.number("xp")} очков",style=MaterialTheme.typography.bodySmall)}} }
        profile.array("levelRewards").takeLast(30).reversed().forEach { val r=it.jsonObject;Text("Уровень ${r.number("level")}: ${state.catalog?.find("case",r.text("case"))?.text("name")}") }
    }
    if(editing)AlertDialog(onDismissRequest={editing=false},title={Text("Изменить ник")},text={Entry(nick,{nick=it.take(20)},"Ник")},confirmButton={TextButton(onClick={command("nickname",objectOf("nick" to nick));editing=false},enabled=!state.busy && nick.isNotBlank()){Text("Сохранить")}})
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
            Text("${quest.payload.number("reward")} рубинов · выполнено: ${state.game?.profile?.obj("quests")?.number(quest.key) ?: 0}")
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
    "buy-case" -> "Купить ${catalog?.find("case", body.text("case"))?.text("name")} за ${catalog?.find("case", body.text("case"))?.number("priceCents")?.let { Cents(it).display() }} рубинов?"
    "open-case" -> "Открыть один кейс? Результат определит сервер по показанным вероятностям."
    "sell" -> "Выставить ${body.number("quantity", 1)} шт. ${catalog?.symbolName(body.text("symbol"))} по базовой цене ${body.text("price")} рубинов? Надбавку за скин рассчитает сервер."
    "buy" -> "Купить выбранное предложение по показанной точной цене?"
    "cancel" -> "Снять предложение с рынка и вернуть предмет в инвентарь?"
    "upgrade" -> "Купить улучшение ${catalog?.symbolName(body.text("symbol"))}? Оно подействует со следующей партии."
    else -> "Подтвердить покупку по указанной цене за игровые рубины?"
}

// Web secondary controls are light rounded buttons; preserve native focus/touch semantics.
@Composable fun TextButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, content: @Composable RowScope.() -> Unit) {
    Button(onClick = onClick, modifier = modifier.heightIn(min = 40.dp), enabled = enabled, shape = RoundedCornerShape(10.dp), contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp), content = content)
}

@Composable fun AlertDialog(onDismissRequest: () -> Unit, confirmButton: @Composable () -> Unit,
    modifier: Modifier = Modifier, dismissButton: (@Composable () -> Unit)? = null,
    title: (@Composable () -> Unit)? = null, text: (@Composable () -> Unit)? = null) {
    androidx.compose.ui.window.Dialog(onDismissRequest, properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)) {
        CompositionLocalProvider(LocalContentColor provides Color(0xFFF3F3F3)) {
        BoxWithConstraints(Modifier.fillMaxWidth().padding(12.dp)) {
            Column(modifier.fillMaxWidth().heightIn(max = maxHeight * .9f).background(androidx.compose.ui.graphics.Brush.linearGradient(listOf(Color(0xFF241A2D), Color(0xFF162721), Color(0xFF2E1B23))), RoundedCornerShape(18.dp)).border(1.dp, Color(0xFF55505F), RoundedCornerShape(18.dp)).verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Box(Modifier.weight(1f)) { ProvideTextStyle(MaterialTheme.typography.headlineSmall) { title?.invoke() } }
                    TextButton(onClick = onDismissRequest, modifier = Modifier.semantics { contentDescription = "Закрыть" }) { Text("×") }
                }
                text?.invoke()
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) { dismissButton?.invoke(); confirmButton() }
            }
        }
        }
    }
}
