package com.votarumshee.symbols

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.votarumshee.symbols.core.*
import kotlinx.serialization.json.*

@Composable fun CollectionScreen(page: String, state: AppState, command: (String, JsonObject) -> Unit, navigate: (String) -> Unit) {
    val catalog = state.catalog ?: return
    val profile = state.game!!.profile
    var symbol by rememberSaveable { mutableStateOf("king") }
    var price by rememberSaveable { mutableStateOf("") }
    var quantity by rememberSaveable { mutableStateOf("1") }
    var skin by rememberSaveable { mutableStateOf("classic") }
    val titles = mapOf("inventory" to "Инвентарь", "upgrades" to "Улучшения", "shop" to "Кейсы", "skins" to "Скины", "avatars" to "Аватарки", "frames" to "Рамки")
    Page(titles[page].orEmpty()) {
        Row { TextButton({ navigate("shop") }) { Text("Кейсы") }; TextButton({ navigate("skins") }) { Text("Скины") }; TextButton({ navigate("avatars") }) { Text("Аватарки") } }
        if (page == "inventory") {
            Action("Улучшить символы") { navigate("upgrades") }
            catalog.category("symbol").filter { it.payload.flag("free") || profile.obj("inventory").number(it.key) > 0 }.forEach { item ->
                Tile("${symbolMark(item.key)} ${catalog.symbolName(item.key)}", if (item.payload.flag("free")) "Базовый символ · без ограничения экземпляров" else "В наличии: ${profile.obj("inventory").number(item.key)} · нажми, чтобы продать") { symbol = item.key }
            }
            if (!catalog.find("symbol", symbol).flag("free") && symbol != "king") {
                Text("Продать: ${catalog.symbolName(symbol)}", style = MaterialTheme.typography.titleMedium)
                Entry(price, { price = it }, "Цена одного экземпляра, рубины", true)
                Entry(quantity, { quantity = it }, "Количество от 1 до 100", true)
                val owned = profile.obj("ownedSkins").array(symbol).map { it.jsonPrimitive.content }
                Choice("Скин", listOf("classic") + owned, skin, { skin = it }) { catalog.find("skin", it).text("name", it) }
                val cents = runCatching { Cents.rubies(price).value }.getOrNull()
                val surcharge = if (skin == "classic") 0 else catalog.find("skin", skin).number("price") * catalog.find("settings", "runtime").number("skinSurchargePercent")
                if (cents != null) Text("Итого за экземпляр с надбавкой скина: ${runCatching { Cents(Math.addExact(cents, surcharge)).display() }.getOrDefault("вне диапазона")} руб.")
                Action("Выставить на рынок", !state.busy && cents != null && quantity.toIntOrNull() in 1..100) { command("sell", objectOf("symbol" to symbol, "price" to price, "quantity" to quantity.toInt(), "skin" to skin)) }
            }
        }
        if (page in setOf("shop", "inventory")) {
            Text("Один кейс — один символ. Покупка за игровые рубины; открытие бесплатно.")
            catalog.category("case").filter { page == "shop" || profile.obj("cases").number(it.key) > 0 }.forEach { item ->
                Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${item.payload.text("mark")} ${item.payload.text("name")}", style = MaterialTheme.typography.titleLarge)
                    Text("У тебя: ${profile.obj("cases").number(item.key)}")
                    item.payload.array("drops").forEach { drop ->
                        val pair = drop.jsonArray
                        Text("${catalog.symbolName(pair[0].jsonPrimitive.content)} — ${Cents(pair[1].jsonPrimitive.long).display()}%", style = MaterialTheme.typography.bodySmall)
                    }
                    val cost = item.payload.number("priceCents")
                    Action("Купить за ${Cents(cost).display()} руб.", !state.busy && profile.number("balanceCents") >= cost) { command("buy-case", objectOf("case" to item.key)) }
                    Action("Открыть", !state.busy && profile.obj("cases").number(item.key) > 0) { command("open-case", objectOf("case" to item.key)) }
                } }
            }
            profile.obj("lastCaseDrop").text("symbol").takeIf { it.isNotEmpty() }?.let { Text("Последний результат: ${catalog.symbolName(it)}. Предмет подтверждён сервером.") }
        }
        if (page == "upgrades") {
            Text("Постоянное улучшение действует со следующей партии. Цены и пределы получены из каталога сервера.")
            (listOf("king") + catalog.category("symbol").map { it.key }).forEach { key ->
                val level = profile.obj("upgrades").number(key)
                val upgrade = catalog.find("upgrade", "$key:${level + 1}")
                val available = key == "king" || catalog.find("symbol", key).flag("free") || profile.obj("inventory").number(key) > 0
                if (upgrade.isNotEmpty()) Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(18.dp)) {
                    Text("${symbolMark(key)} ${catalog.symbolName(key)} · улучшений $level")
                    val cost = upgrade.number("priceRubies") * 100
                    Action("Улучшить за ${Cents(cost).display()} руб.", !state.busy && available && profile.number("balanceCents") >= cost) { command("upgrade", objectOf("symbol" to key, "level" to level)) }
                    TextButton(enabled = !state.busy && available && profile.number("balanceCents") >= cost, onClick = { command("upgrade", objectOf("symbol" to key, "level" to level, "max" to true)) }) { Text("Улучшить на максимум по балансу") }
                } }
            }
        }
        if (page == "skins") {
            Choice("Символ", listOf("king") + catalog.category("symbol").map { it.key }, symbol, { symbol = it }, catalog::symbolName)
            catalog.category("skin").forEach { item ->
                val owned = item.key == "classic" || profile.obj("ownedSkins").array(symbol).any { it.jsonPrimitive.content == item.key }
                val selected = profile.obj("skins").text(symbol, "classic") == item.key
                val cost = item.payload.number("price") * 100
                Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(18.dp)) {
                    SymbolBadge(symbol, item.key)
                    Text(item.payload.text("name"), style = MaterialTheme.typography.titleLarge)
                    Text(item.payload.text("effect", "Внешний вид. Сила символа не меняется."))
                    Action(if (selected) "Выбрано" else if (owned) "Выбрать" else "Купить за ${Cents(cost).display()} руб.", !selected && !state.busy && (owned || profile.number("balanceCents") >= cost)) {
                        command(if (owned) "skin" else "buy-skin", objectOf("symbol" to symbol, "skin" to item.key))
                    }
                } }
            }
        }
        if (page == "avatars") catalog.category("avatar").forEach { item ->
            val bundle = catalog.find("avatarBundle", item.key)
            val owned = bundle.isEmpty() || profile.array("ownedAvatars").any { it.jsonPrimitive.content == item.key }
            val cost = bundle.number("priceCents")
            Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(18.dp)) {
                AvatarArt(item.key)
                Text("${item.payload.text("emoji", "◉")} ${item.payload.text("name")}", style = MaterialTheme.typography.titleLarge)
                if (bundle.isNotEmpty()) Text("В комплекте: ${catalog.symbolName(bundle.text("symbol"))} × ${bundle.number("quantity")}")
                Action(if (owned) "Выбрать" else "Купить за ${Cents(cost).display()} руб.", !state.busy && (owned || profile.number("balanceCents") >= cost)) { command(if (owned) "avatar" else "buy-avatar", objectOf("avatar" to item.key)) }
            } }
        }
        if (page == "frames") {
            Action("Скрыть рамку", !state.busy) { command("frame", objectOf("frame" to null)) }
            val level = profile.obj("level").number("level", catalog.category("level").lastOrNull { it.payload.number("xp") <= profile.number("xp") }?.payload?.number("level") ?: 1)
            catalog.category("frame").forEach { item ->
                AvatarArt(profile.text("avatar"), item.payload, level)
                Action("${item.payload.text("name")} · уровень ${item.payload.number("level")}", !state.busy && level >= item.payload.number("level")) { command("frame", objectOf("frame" to item.key.toInt())) }
            }
        }
    }
}
@Composable fun Choice(label: String, values: List<String>, selected: String, change: (String) -> Unit, name: (String) -> String = { it }) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        OutlinedButton({ expanded = true }, Modifier.fillMaxWidth()) { Text("$label: ${name(selected)} ▾") }
        DropdownMenu(expanded, { expanded = false }) { values.forEach { value -> DropdownMenuItem(text = { Text(name(value)) }, onClick = { change(value); expanded = false }) } }
    }
}
@Composable fun MarketScreen(state: AppState, repository: GameRepository, command: (String, JsonObject) -> Unit, navigate: (String) -> Unit) {
    var filter by rememberSaveable { mutableStateOf("") }
    var descending by rememberSaveable { mutableStateOf(false) }
    val catalog = state.catalog ?: return
    Page("Рынок игроков") {
        Choice("Символ", listOf("") + catalog.category("symbol").filterNot { it.payload.flag("free") }.map { it.key }, filter, { filter = it; repository.market(it.ifBlank { null }, descending = descending) }) { if (it.isBlank()) "Все" else catalog.symbolName(it) }
        Row {
            TextButton({ descending = !descending; repository.market(filter.ifBlank { null }, descending = descending) }) { Text(if (descending) "Цена ↓" else "Цена ↑") }
            TextButton({ repository.market(filter.ifBlank { null }, descending = descending) }) { Text("Обновить") }
            TextButton({ navigate("inventory") }) { Text("Продать") }
        }
        val offers = state.market?.array("listings")
        if (offers == null) Text(if (state.marketLoading) "Загружаем предложения…" else "Не удалось загрузить предложения. Нажми «Обновить».")
        else if (offers.isEmpty()) Text("Предложений пока нет. Можно выставить свой символ из инвентаря.")
        offers?.forEach { element ->
            val offer = element.jsonObject
            Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(catalog.symbolName(offer.text("symbol")), style = MaterialTheme.typography.titleLarge)
                Text("${offer.text("nick")} · ${catalog.find("skin", offer.text("skin", "classic")).text("name", "Обычный")}")
                val cost = Cents.wire(offer.text("priceCents"))
                Text("${cost.display()} рубинов")
                val mine = offer.text("seller") == state.game?.account
                Action(if (mine) "Снять с продажи" else "Купить за ${cost.display()}", !state.busy && (mine || state.game!!.profile.number("balanceCents") >= cost.value)) { command(if (mine) "cancel" else "buy", objectOf("id" to offer.text("id"))) }
                if (!mine) ReportControls(offer.text("seller"), offer.text("nick"), command)
            } }
        }
        state.market?.get("nextOffset")?.takeIf { it != JsonNull }?.jsonPrimitive?.intOrNull?.let { next -> Action("Следующая страница") { repository.market(filter.ifBlank { null }, next, descending) } }
    }
}
@Composable fun ReportControls(target: String, nick: String, command: (String, JsonObject) -> Unit) {
    var open by remember { mutableStateOf(false) }
    var reason by remember { mutableStateOf("") }
    TextButton({ open = true }) { Text("Пожаловаться / блокировать") }
    if (open) AlertDialog(onDismissRequest = { open = false }, title = { Text(nick) }, text = {
        Column {
            Entry(reason, { reason = it.take(500) }, "Причина жалобы")
            Text("Жалоба поступит оператору сервера. Блокировка запрещает новые совместные игры и покупки; текущая партия продолжается.")
            TextButton({ command("block", objectOf("target" to target)); open = false }) { Text("Блокировать игрока") }
            TextButton({ command("unblock", objectOf("target" to target)); open = false }) { Text("Снять блокировку") }
        }
    }, confirmButton = { TextButton(enabled = reason.trim().length >= 3, onClick = { command("report", objectOf("target" to target, "reason" to reason)); open = false }) { Text("Отправить жалобу") } }, dismissButton = { TextButton({ open = false }) { Text("Отмена") } })
}
