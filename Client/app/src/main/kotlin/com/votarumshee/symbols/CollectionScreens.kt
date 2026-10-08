package com.votarumshee.symbols

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.Alignment
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.votarumshee.symbols.core.*
import kotlinx.serialization.json.*

@Composable fun CollectionScreen(page: String, state: AppState, command: (String, JsonObject) -> Unit, navigate: (String) -> Unit) {
    if(page in setOf("inventory","shop","upgrades")) { WebCollection(page,state,command,navigate);return }
    val catalog=state.catalog ?: return;val profile=state.game!!.profile
    var symbol by rememberSaveable {mutableStateOf("arrow")}
    Page(when(page){"skins"->"Скины символов";"frames"->"Рамки";else->"Аватарки"}) {
        if(page=="skins") {
            Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(8.dp)){(listOf("king")+catalog.category("symbol").filter {it.payload.flag("free")||profile.obj("inventory").number(it.key)>0}.map{it.key}).distinct().forEach {key->TextButton(onClick={symbol=key}){Text(catalog.symbolName(key))}}}
            Text("Покупка навсегда для выбранного символа. Сила и лимиты не меняются.",style=MaterialTheme.typography.bodySmall)
            Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(16.dp)) {
                catalog.category("skin").forEach { item ->
                    val owned=item.key=="classic"||profile.obj("ownedSkins").array(symbol).any{it.jsonPrimitive.content==item.key}
                    val selected=profile.obj("skins").text(symbol,"classic")==item.key;val cost=item.payload.number("price")*100
                    Surface(Modifier.width(260.dp),color=Color(0xFF2D223C),shape=RoundedCornerShape(18.dp),border=BorderStroke(if(selected)2.dp else 1.dp,if(selected)Color(0xFFBD82D6)else Color(0xFF796285))) {
                        Column(Modifier.padding(20.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(12.dp)) {
                            SymbolBadge(symbol,item.key,110.dp);Text(item.payload.text("name"),style=MaterialTheme.typography.titleLarge)
                            Text(item.payload.text("effect","Внешний вид"),style=MaterialTheme.typography.bodySmall)
                            Action(if(selected)"Выбрано"else if(owned)"Выбрать"else"Купить за ${Cents(cost).display()} рубинов",!selected&&!state.busy&&(owned||profile.number("balanceCents")>=cost)){command(if(owned)"skin"else"buy-skin",objectOf("symbol" to symbol,"skin" to item.key))}
                        }
                    }
                }
            }
        }
        if(page=="avatars")catalog.category("avatar").chunked(2).forEach {row->Row(horizontalArrangement=Arrangement.spacedBy(10.dp)){row.forEach {item->
            val bundle=catalog.find("avatarBundle",item.key);val owned=bundle.isEmpty()||profile.array("ownedAvatars").any{it.jsonPrimitive.content==item.key};val cost=bundle.number("priceCents");val selected=profile.text("avatar")==item.key
            Surface(Modifier.weight(1f),shape=RoundedCornerShape(14.dp),color=Color(0xFF25252B),border=BorderStroke(if(selected)2.dp else 1.dp,if(selected)Color.White else Color(0xFF55505F))){Column(Modifier.padding(12.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(8.dp)){
                AvatarArt(item.key,size=96.dp);Text(item.payload.text("name"),style=MaterialTheme.typography.titleSmall)
                if(bundle.isNotEmpty())Text("${catalog.symbolName(bundle.text("symbol"))} ×${bundle.number("quantity")}",style=MaterialTheme.typography.bodySmall)
                Action(if(selected)"Выбрано"else if(owned)"Выбрать"else"${Cents(cost).display()} рубинов",!selected&&!state.busy&&(owned||profile.number("balanceCents")>=cost)){command(if(owned)"avatar"else"buy-avatar",objectOf("avatar" to item.key))}
            }}
        };if(row.size==1)Spacer(Modifier.weight(1f))}}
        if(page=="frames") {
            val level=profile.obj("level").number("level",1)
            Action("Без рамки",!state.busy){command("frame",objectOf("frame" to null))}
            catalog.category("frame").chunked(3).forEach {row->Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){row.forEach {item->
                val unlocked=level>=item.payload.number("level");val selected=profile.text("frame")==item.key
                Surface(onClick={command("frame",objectOf("frame" to item.key.toInt()))},enabled=unlocked&&!state.busy,modifier=Modifier.weight(1f),shape=RoundedCornerShape(10.dp),color=Color(0xFF26232D),border=BorderStroke(if(selected)2.dp else 1.dp,if(selected)Color.White else Color(0xFF55505F))){Column(Modifier.padding(8.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(8.dp)){
                    AvatarArt(profile.text("avatar","lion"),item.payload,level,64.dp);Text(item.payload.text("name"),style=MaterialTheme.typography.labelSmall);Text(if(selected)"Выбрано"else if(unlocked)"Выбрать"else"Ур. ${item.payload.number("level")}",style=MaterialTheme.typography.labelSmall)
                }}
            };repeat(3-row.size){Spacer(Modifier.weight(1f))}}}
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
    Page("Рынок") {
        Row(horizontalArrangement=Arrangement.spacedBy(8.dp),verticalAlignment=Alignment.CenterVertically) {
            Box(Modifier.weight(1f)){Choice("Символ",listOf("")+catalog.category("symbol").filterNot{it.payload.flag("free")}.map{it.key},filter,{filter=it;repository.market(it.ifBlank{null},descending=descending)}){if(it.isBlank())"Все"else catalog.symbolName(it)}}
            TextButton(onClick={descending=!descending;repository.market(filter.ifBlank{null},descending=descending)}){Text(if(descending)"Цена ↓"else"Цена ↑")}
        }
        TextButton(onClick={repository.market(filter.ifBlank{null},descending=descending)}){Text("Обновить")}
        val offers = state.market?.array("listings")
        if (offers == null) Text(if (state.marketLoading) "Загружаем предложения…" else "Не удалось загрузить предложения. Нажми «Обновить».")
        else { Surface(color=Color.Transparent,shape=RoundedCornerShape(14.dp),border=BorderStroke(1.dp,Color(0xFF61506F))){Row(Modifier.fillMaxWidth().background(androidx.compose.ui.graphics.Brush.linearGradient(listOf(Color(0xFF49315B),Color(0xFF214737)))).padding(16.dp),horizontalArrangement=Arrangement.spacedBy(12.dp),verticalAlignment=Alignment.CenterVertically){Text("${offers.size}",style=MaterialTheme.typography.headlineMedium);Text(if(state.market?.get("nextOffset")!=JsonNull)"предложений на странице"else"предложений")}}
            if(offers.isEmpty()) Surface(color=Color(0xFF25242E),shape=RoundedCornerShape(20.dp)) { Column(Modifier.fillMaxWidth().padding(24.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(12.dp)) {Text("Предложений пока нет",style=MaterialTheme.typography.titleLarge);Text("Выставь символ из инвентаря по своей цене.");Action("Открыть инвентарь"){navigate("inventory")} } }
        }
        if(filter.isBlank()) offers?.map{it.jsonObject}?.groupBy{it.text("symbol")}?.entries?.toList()?.chunked(2)?.forEach { row->Row(horizontalArrangement=Arrangement.spacedBy(12.dp)){row.forEach { (key,items)->
            Surface(onClick={filter=key;repository.market(key,descending=descending)},modifier=Modifier.weight(1f),color=Color(0xFF242832),shape=RoundedCornerShape(14.dp),border=BorderStroke(1.dp,Color(0xFF55505F))){Column(Modifier.padding(16.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(8.dp)){SymbolBadge(key);Text(catalog.symbolName(key));Text("${items.size} предложений · от ${Cents(items.minOf{it.number("priceCents")}).display()}",style=MaterialTheme.typography.bodySmall)}}
        };if(row.size==1)Spacer(Modifier.weight(1f))}}
        else offers?.forEach { element -> val offer=element.jsonObject;val cost=Cents.wire(offer.text("priceCents"));val mine=offer.text("seller")==state.game?.account
            Surface(color=Color(0xFF242832),shape=RoundedCornerShape(10.dp)){Column(Modifier.fillMaxWidth().padding(10.dp)){
                Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){SymbolBadge(offer.text("symbol"),offer.text("skin","classic"),34.dp);Column(Modifier.weight(1f)){Text(offer.text("nick"),style=MaterialTheme.typography.bodySmall);Text("${cost.display()} рубинов",style=MaterialTheme.typography.labelLarge)};TextButton(onClick={command(if(mine)"cancel"else"buy",objectOf("id" to offer.text("id")))},enabled=!state.busy&&(mine||state.game!!.profile.number("balanceCents")>=cost.value)){Text(if(mine)"Снять"else"Купить")}}
                if(!mine)ReportControls(offer.text("seller"),offer.text("nick"),command)
            }}
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

@Composable private fun WebCollection(page: String, state: AppState, command: (String, JsonObject) -> Unit, navigate: (String) -> Unit) {
    val catalog = state.catalog ?: return
    val profile = state.game!!.profile
    var selected by rememberSaveable(page) { mutableStateOf<String?>(null) }
    var price by rememberSaveable { mutableStateOf("") }
    var quantity by rememberSaveable { mutableStateOf("1") }
    var skin by rememberSaveable { mutableStateOf("classic") }
    var caseId by rememberSaveable(page) { mutableStateOf<String?>(null) }
    val owned = catalog.category("symbol").filter { it.key != "king" && (it.payload.flag("free") || profile.obj("inventory").number(it.key) > 0) }
    fun rarity(key: String): Pair<String,Color> = when(when(key){"arrowx2","angry","feedback"->"rare";"circle"->"uncommon";"inspect","laser","electricity","teleport"->"legendary";"tank","powerful","sword"->"arcana";else->"common"}) {
        "arcana" -> "Аркана" to Color(0xFFE34747); "legendary" -> "Легендарное" to Color(0xFFEF82C3); "rare" -> "Rare" to Color(0xFF327AD7); "uncommon" -> "Uncommon" to Color(0xFFB0C4CE); else -> "Common" to Color(0xFF919191)
    }
    Page(when(page) { "inventory" -> "Инвентарь"; "shop" -> "Магазин"; else -> "Улучшить" }) {
        if(page == "shop") Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { TextButton({}) { Text("Кейсы") }; TextButton({navigate("avatars")}) { Text("Магазин") }; TextButton({navigate("skins")}) { Text("Скины") } }
        if(page == "shop") Text("Один кейс — один символ. Открытие купленного кейса бесплатно.", style = MaterialTheme.typography.bodySmall)
        if(page == "upgrades") Text("Постоянные улучшения действуют со следующей партии. Король: +10 жизней. Символы: +1 использование.", style = MaterialTheme.typography.bodySmall)
        val cases = catalog.category("case").filter { page == "shop" || page == "inventory" && profile.obj("cases").number(it.key) > 0 }
        if(page != "upgrades") cases.chunked(if(page == "inventory") 3 else 2).forEach { row -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            row.forEach { item ->
                val tint=when(item.payload.text("tone")){"red"->Color(0xFF71353D);"green"->Color(0xFF22664C);"blue"->Color(0xFF28566F);else->Color(0xFF5D357E)}
                Surface(onClick={caseId=item.key},modifier=Modifier.weight(1f),color=Color.Transparent,shape=RoundedCornerShape(20.dp),border=BorderStroke(1.dp,Color(0xFF796287))) {
                    Column(Modifier.background(androidx.compose.ui.graphics.Brush.radialGradient(listOf(tint,Color(0xFF19151F)))).padding(horizontal=8.dp,vertical=18.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(12.dp)) {
                        Text(item.payload.text("mark"),style=MaterialTheme.typography.displayLarge);Text(item.payload.text("name"),style=MaterialTheme.typography.titleLarge)
                        if(page=="shop")Text("${Cents(item.payload.number("priceCents")).display()} рубинов",style=MaterialTheme.typography.bodyMedium)
                        Text("У тебя: ${profile.obj("cases").number(item.key)}",style=MaterialTheme.typography.bodySmall)
                        if(page=="shop")Row(horizontalArrangement=Arrangement.spacedBy(3.dp)){item.payload.array("drops").forEach {drop->SymbolBadge(drop.jsonArray[0].jsonPrimitive.content,size=28.dp)}}
                    }
                }
            };repeat((if(page=="inventory")3 else 2)-row.size){Spacer(Modifier.weight(1f))}
        } }
        if(page != "shop") (if(page == "inventory") owned.map { it.key } else (listOf("king")+catalog.category("symbol").map { it.key }).distinct()).chunked(if(page == "inventory")3 else 2).forEach { row -> Row(horizontalArrangement=Arrangement.spacedBy(10.dp)) {
            row.forEach { key -> Surface(onClick = { if(page!="upgrades") { selected=key; skin="classic"; price=""; quantity="1" } }, modifier=Modifier.weight(1f), shape=RoundedCornerShape(9.dp), color=Color(0xFF25242E), border=BorderStroke(1.dp,Color(0xFF45404A))) {
                Column(horizontalAlignment=Alignment.CenterHorizontally) {
                    Text(if(page=="inventory") if(catalog.find("symbol",key).flag("free")) "∞" else "×${profile.obj("inventory").number(key)}" else "Улучшений: ${profile.obj("upgrades").number(key)}",Modifier.align(Alignment.End).padding(6.dp),style=MaterialTheme.typography.labelSmall)
                    SymbolBadge(key,profile.obj("skins").text(key,"classic"),48.dp);Text(catalog.symbolName(key),Modifier.padding(6.dp).heightIn(min=32.dp),style=MaterialTheme.typography.labelMedium)
                    if(page=="upgrades") {
                        val level=profile.obj("upgrades").number(key);val upgrade=catalog.find("upgrade","$key:${level+1}");val cost=upgrade.number("priceRubies")*100
                        val owned=key=="king" || catalog.find("symbol",key).flag("free") || profile.obj("inventory").number(key)>0
                        val enabled=owned && upgrade.isNotEmpty() && !state.busy && profile.number("balanceCents")>=cost
                        TextButton(onClick={command("upgrade",objectOf("symbol" to key,"level" to level))},enabled=enabled,modifier=Modifier.padding(4.dp)){Text(if(!owned)"Нет символа" else if(upgrade.isEmpty())"Максимум" else "Улучшить · ${Cents(cost).display()}",fontSize=12.sp)}
                        TextButton(onClick={command("upgrade",objectOf("symbol" to key,"level" to level,"max" to true))},enabled=enabled,modifier=Modifier.padding(bottom=6.dp)){Text("На максимум",fontSize=12.sp)}
                    } else { val r=rarity(key);Text(r.first,Modifier.fillMaxWidth().background(r.second).padding(vertical=5.dp),color=Color(0xFF111111),style=MaterialTheme.typography.labelSmall,textAlign=androidx.compose.ui.text.style.TextAlign.Center) }
                }
            } };repeat((if(page=="inventory")3 else 2)-row.size){Spacer(Modifier.weight(1f))}
        } }
    }
    selected?.let { key -> AlertDialog(onDismissRequest={selected=null},title={Text(catalog.symbolName(key))},text={Column(verticalArrangement=Arrangement.spacedBy(8.dp)) {
        SymbolBadge(key,profile.obj("skins").text(key,"classic"))
        Text(symbolDescriptions[key].orEmpty(),style=MaterialTheme.typography.bodySmall)
        if(!catalog.find("symbol",key).flag("free")) {
            Entry(price,{price=it},"Цена, рубины",true);Entry(quantity,{quantity=it},"Количество",true)
            Choice("Скин", listOf("classic")+profile.obj("ownedSkins").array(key).map { it.jsonPrimitive.content },skin,{skin=it}){catalog.find("skin",it).text("name",it)}
            Action("Выставить на рынок",!state.busy && runCatching {Cents.rubies(price)}.isSuccess && quantity.toIntOrNull() in 1..100){command("sell",objectOf("symbol" to key,"price" to price,"quantity" to quantity.toInt(),"skin" to skin))}
        } else Text("Базовый символ · без ограничения экземпляров")
    }},confirmButton={TextButton(onClick={selected=null}){Text("Закрыть")}}) }
    caseId?.let { key -> val item=catalog.find("case",key);val cost=item.number("priceCents")
        AlertDialog(onDismissRequest={caseId=null},title={Text(item.text("name"))},text={Column(verticalArrangement=Arrangement.spacedBy(8.dp)){
            Text(item.text("mark"),style=MaterialTheme.typography.displayMedium);item.array("drops").forEach { d -> val pair=d.jsonArray;Text("${catalog.symbolName(pair[0].jsonPrimitive.content)} — ${Cents(pair[1].jsonPrimitive.long).display()}%",style=MaterialTheme.typography.bodySmall) }
            Action("Купить за ${Cents(cost).display()} рубинов",!state.busy && profile.number("balanceCents")>=cost){command("buy-case",objectOf("case" to key))}
            Action("Открыть · ×${profile.obj("cases").number(key)}",!state.busy && profile.obj("cases").number(key)>0){command("open-case",objectOf("case" to key))}
            profile.obj("lastCaseDrop").text("symbol").takeIf {it.isNotEmpty()}?.let {SymbolBadge(it);Text("Последний выигрыш: ${catalog.symbolName(it)}")}
        }},confirmButton={TextButton(onClick={caseId=null}){Text("Закрыть")}})
    }
}
