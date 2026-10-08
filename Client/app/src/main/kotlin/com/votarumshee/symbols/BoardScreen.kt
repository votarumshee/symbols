package com.votarumshee.symbols

import android.graphics.Paint
import android.graphics.Bitmap
import android.graphics.RectF
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.votarumshee.symbols.core.*
import kotlinx.coroutines.delay
import kotlinx.serialization.json.*

fun symbolMark(type: String): String = when(type) {
    "king" -> "♛"; "arrow" -> "↑"; "arrowx2" -> "⇈"; "sword" -> "⚔"; "electricity" -> "ϟ"; "smile" -> "☺"
    "point" -> "•"; "laser" -> "↟"; "circle" -> "●"; "feedback" -> "△"; "tank" -> "▣"; "inspect" -> "⊙"
    "powerful" -> "✹"; "angry" -> "‼"; "teleport" -> "⇄"; "erase" -> "×"; else -> "?"
}
private val directions = listOf("↑", "↗", "→", "↘", "↓", "↙", "←", "↖")
private val directed = setOf("arrow", "arrowx2", "laser", "tank", "sword", "point", "inspect", "powerful")
@Composable fun MatchScreen(state: AppState, reduced: Boolean, command: (String, JsonObject) -> Unit, navigate: (String) -> Unit) {
    val game = state.game?.match ?: return
    val catalog = state.catalog ?: return
    val board = game.obj("board")
    val actor = game.number("actor").toInt()
    val seat = if (game.text("mode") == "local") actor else game.array("seats").firstOrNull()?.jsonPrimitive?.int ?: 0
    val status = game.text("status")
    val myTurn = actor == seat && status in setOf("setup", "play")
    val width = board.number("width").toInt(); val rows = board.number("rows").toInt()
    var symbol by rememberSaveable(game.text("id")) { mutableStateOf<String?>(null) }
    var selected by rememberSaveable(game.text("id")) { mutableIntStateOf(-1) }
    var source by rememberSaveable(game.text("id")) { mutableIntStateOf(-1) }
    var zoom by rememberSaveable { mutableStateOf(false) }
    var accessible by rememberSaveable { mutableStateOf(false) }
    var rowText by rememberSaveable { mutableStateOf("") }; var columnText by rememberSaveable { mutableStateOf("") }
    var notice by remember { mutableStateOf("") }
    var lastSentAt by remember { mutableLongStateOf(0L) }
    var sentRevision by remember { mutableStateOf<String?>(null) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(game.text("revision")) { symbol = null; selected = -1; source = -1; sentRevision = null; notice = "" }
    LaunchedEffect(state.busy, state.message) { if (!state.busy && state.message != null) sentRevision = null }
    LaunchedEffect(status) { while (status != "done") { now = System.currentTimeMillis(); delay(1000) } }
    val active = myTurn && !state.busy && sentRevision != game.text("revision") && state.connection in setOf(Connection.Live, Connection.LongPolling)
    fun send(type: String, index: Int = -1, dir: Int? = null) {
        if (!active || sentRevision == game.text("revision") || android.os.SystemClock.elapsedRealtime()-lastSentAt < 350) return
        lastSentAt=android.os.SystemClock.elapsedRealtime()
        sentRevision = game.text("revision"); selected = -1
        command("action", objectOf("matchId" to game.text("id"), "revision" to game.text("revision"),
            "action" to objectOf("type" to type, "index" to index.takeIf { it >= 0 }, "side" to seat % 2, "dir" to dir, "source" to source.takeIf { it >= 0 })))
    }
    fun choose(side: Int, index: Int) {
        if (!active || sentRevision == game.text("revision") || side != seat % 2) return
        if (status == "setup") { if (index >= (rows - 1) * width) send("king", index); else notice = "Выбери клетку своего крайнего ряда."; return }
        val type = symbol ?: run { notice = "Выбери символ внизу."; return }
        val piece = board.array("boards").getOrNull(side)?.jsonArray?.getOrNull(index) as? JsonObject
        if (type == "teleport" && source < 0) { if (piece != null && piece.text("type") != "king") { source = index; notice = "Теперь выбери свободную клетку." }; return }
        if (type != "erase" && piece != null) { notice = "Эта клетка занята"; return }
        val original = board.array("boards").getOrNull(side)?.jsonArray?.getOrNull(source) as? JsonObject
        if (type in directed || type == "teleport" && original?.text("type") in directed) selected = index else send(type, index)
    }
    @Composable fun team(side: Int) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            game.array("players").forEachIndexed { i, element -> if (i % 2 == side) {
                val player = element.jsonObject
                Surface(Modifier.weight(1f), color = if (actor == i) Color(0xFF343434) else Color.Transparent,
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF55505F))) {
                    Row(Modifier.padding(8.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        AvatarArt(player.text("avatar", "lion"), catalog.find("frame", player.text("frame")), player.number("level", 1), size = 40.dp)
                        Column(Modifier.padding(start = 8.dp)) { Text(player.text("nick"), style = MaterialTheme.typography.bodySmall); Text("${board.array("kingHp").getOrNull(i)?.jsonPrimitive?.content ?: "—"} HP", style = MaterialTheme.typography.labelLarge); Text("Уровень ${player.number("level", 1)}", style = MaterialTheme.typography.labelSmall) }
                    }
                }
            } }
        }
    }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            TextButton(onClick = { if (status == "done") navigate("home") else command("leave", objectOf("matchId" to game.text("id"), "revision" to game.text("revision"))) }, enabled = !state.busy) { Text(if(status == "waiting") "Отменить поиск" else "Меню") }
            Text("Символы", style = MaterialTheme.typography.titleSmall)
            if(status != "done") TextButton(onClick = { zoom = !zoom }) { Text(if (zoom) "Уменьшить" else "Увеличить") }
            if(status != "done") TextButton(onClick = { accessible = true }, modifier = Modifier.semantics { contentDescription = "Выбор клетки по координатам" }) { Text("⋮") }
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            val remaining = ((game.number("turnAt") + catalog.find("settings", "runtime").number("turnTimeoutMs") - now - state.serverOffsetMs) / 1000).coerceAtLeast(0)
            Row(Modifier.fillMaxWidth(), verticalAlignment=androidx.compose.ui.Alignment.CenterVertically) {
            Text(when(status) { "setup" -> "Расставляем королей"; "done" -> "Партия завершена"; "waiting" -> "Ищем игру"; else -> "Ходит ${game.array("players").getOrNull(actor)?.jsonObject?.text("nick").orEmpty()}" }, modifier=Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                if(status in setOf("setup","play")) Text("$remaining с",style=MaterialTheme.typography.labelSmall,modifier=Modifier.semantics { contentDescription="До конца хода $remaining секунд" })
            }
            if(status != "done") Text(if (notice.isNotEmpty()) notice else if (status == "setup") if(myTurn) "Выбери клетку своего крайнего ряда." else "Короля ставит ${game.array("players").getOrNull(actor)?.jsonObject?.text("nick").orEmpty()}" else if (!myTurn) "Сейчас ход другого участника." else if (symbol == null) "Выбери символ внизу." else "Выбери клетку для ${catalog.symbolName(symbol!!)}", style = MaterialTheme.typography.bodySmall)
            if (status == "waiting") { Text(game.text("code")); Text("${game.array("players").size} из ${game.number("capacity")}") }
            if (game.flag("tutorial") && status != "done") {
                Text(game.obj("advice").text("text", "Поставь короля в нижнем ряду. Затем выбирай символ и клетку."), style = MaterialTheme.typography.bodySmall)
                val move = game.obj("advice").obj("move")
                if (myTurn && move.isNotEmpty()) TextButton(onClick = { symbol=move.text("type"); selected=move.number("index").toInt() }) { Text("Показать рекомендуемый ход") }
            }
            if (width > 0 && rows > 0 && status != "done") {
                team(1 - seat % 2)
                BoxWithConstraints(Modifier.fillMaxWidth()) {
                    val cell = if (zoom) 40f else maxWidth.value / width
                    Box(Modifier.fillMaxWidth().clip(androidx.compose.foundation.shape.RoundedCornerShape(5.dp)).border(1.dp,Color(0xFF685A74),androidx.compose.foundation.shape.RoundedCornerShape(5.dp)).height((cell * rows * 2).dp.coerceAtMost(420.dp)).horizontalScroll(rememberScrollState()).verticalScroll(rememberScrollState())) {
                        val onCell = remember(game, state.busy, state.connection, sentRevision, symbol, source) { { side: Int, index: Int -> choose(side, index) } }
                        BoardCanvas(game, seat % 2, cell, seat % 2, if(source >= 0) source else selected, reduced, onCell)
                    }
                }
                team(seat % 2)
            }
            if (status == "done") {
                val result = game.obj("result")
                val winner=board.number("winner").toInt()
                val rewards=result.number("bucks",result.array("quests").sumOf { if(it.jsonPrimitive.content=="clean")2L else 1L })
                Column(Modifier.fillMaxWidth().padding(vertical=20.dp).background(Brush.linearGradient(listOf(Color(0xFF30253D),Color(0xFF17372D))),androidx.compose.foundation.shape.RoundedCornerShape(22.dp)).border(1.dp,Color(0xFF615667),androidx.compose.foundation.shape.RoundedCornerShape(22.dp)).padding(24.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(16.dp)) {
                    Text(if(game.text("mode") == "local") "Победил ${game.array("players").getOrNull(winner)?.jsonObject?.text("nick").orEmpty()}" else if(result.flag("won")) "Победа!" else "Поражение", style = MaterialTheme.typography.headlineSmall,textAlign=androidx.compose.ui.text.style.TextAlign.Center)
                    Row(horizontalArrangement=Arrangement.spacedBy(20.dp)) { game.array("players").forEachIndexed { index,value -> if(index%2==winner) {val player=value.jsonObject;Column(horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(8.dp)) {AvatarArt(player.text("avatar","lion"),catalog.find("frame",player.text("frame")),player.number("level",1),64.dp);Text(player.text("nick"),style=MaterialTheme.typography.titleSmall)} } } }
                    Text("+${result.number("xp")} очков · +$rewards рубинов",style=MaterialTheme.typography.bodyMedium)
                    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                        TextButton(onClick={if(game.text("mode")=="trial")command("start",objectOf("mode" to "trial","small" to (width==14))) else navigate("modes")},enabled=!state.busy){Text(if(game.text("mode")=="trial")"Продолжить" else "Играть ещё")}
                        TextButton(onClick={navigate("home")}){Text("На главную")}
                    }
                }
            }
            Spacer(Modifier.height(6.dp))
        }
        if (status in setOf("setup", "play")) Surface(color = Color(0xFF241E2D), tonalElevation = 0.dp) {
            if (status == "setup") Text("Короли ставятся в крайних рядах, не в центре.", Modifier.fillMaxWidth().padding(14.dp), style = MaterialTheme.typography.bodySmall)
            else if(symbol != null) Row(Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                SymbolBadge(symbol!!, state.game!!.profile.obj("skins").text(symbol!!, "classic")); Text(catalog.symbolName(symbol!!), Modifier.weight(1f)); TextButton(onClick = { symbol = null; selected = -1; source = -1; notice = "" }) { Text("Отмена") }
            } else Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                catalog.category("symbol").filter { it.key != "king" && (it.payload.flag("free") || state.game!!.profile.obj("inventory").number(it.key) > 0 || game.obj("uses").obj("$seat").number(it.key) > 0) }.forEach { item ->
                    val count = game.obj("uses").obj("$seat").text(item.key, "∞")
                    Surface(onClick = { if(item.key == "angry") send(item.key) else { symbol = item.key; source = -1; notice = "" } }, enabled = active && (item.payload.flag("free") || count != "0"), modifier = Modifier.width(108.dp), color = Color(0xFF242424), shape = androidx.compose.foundation.shape.RoundedCornerShape(10.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF555555))) {
                        Column(Modifier.padding(8.dp), horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally) { SymbolBadge(item.key, state.game!!.profile.obj("skins").text(item.key, "classic"), 36.dp); Text(catalog.symbolName(item.key), style = MaterialTheme.typography.labelMedium); Text(count, style = MaterialTheme.typography.bodySmall) }
                    }
                }
            }
        }
    }
    if (selected >= 0) AlertDialog(onDismissRequest = { selected = -1 }, title = { Text("Куда направить?") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { listOf(listOf(7,0,1),listOf(6,-1,2),listOf(5,4,3)).forEach { row -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { row.forEach { dir -> if(dir < 0) Spacer(Modifier.weight(1f).height(56.dp)) else Button(onClick = { symbol?.let { send(it, selected, dir) } }, enabled = active, modifier = Modifier.weight(1f).height(56.dp), shape = androidx.compose.foundation.shape.RoundedCornerShape(10.dp)) { Text(directions[dir], style = MaterialTheme.typography.headlineSmall) } } } } }
    }, confirmButton = {})
    if (accessible) AlertDialog(onDismissRequest = { accessible = false }, title = { Text("Выбрать клетку") }, text = { Column { TextButton(onClick={accessible=false;navigate("rules")}){Text("Правила")}; game.array("players").forEach { v -> val p=v.jsonObject; if(!p.flag("bot") && p.text("id")!=state.game!!.account) ReportControls(p.text("id"),p.text("nick"),command) }; Entry(rowText, { rowText = it }, "Ряд 1–$rows", true); Entry(columnText, { columnText = it }, "Столбец 1–$width", true) } }, confirmButton = { TextButton(onClick = { val r=rowText.toIntOrNull(); val c=columnText.toIntOrNull(); if(r != null && c != null && r in 1..rows && c in 1..width) { accessible=false; choose(seat % 2, (r-1)*width+c-1) } }) { Text("Выбрать") } }, dismissButton = { TextButton(onClick = { accessible=false }) { Text("Отмена") } })
}
@Composable private fun BoardCanvas(game: JsonObject, view: Int, cellDp: Float, selectedSide: Int, selected: Int, reduced: Boolean, choose: (Int, Int) -> Unit) {
    val latestChoose by rememberUpdatedState(choose)
    val board = game.obj("board")
    val width = board.number("width").toInt(); val rows = board.number("rows").toInt()
    val boards = board.array("boards")
    val paint = remember { Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER; color = android.graphics.Color.WHITE } }
    val context = LocalContext.current
    val players = game.array("players")
    fun skin(piece: JsonObject, side: Int): String {
        val skin=players.getOrNull(piece.number("seat",side.toLong()).toInt())?.jsonObject?.obj("skins")?.text(piece.text("type"),"classic") ?: "classic"
        return if(piece.text("type")=="king" && skin=="classic") if(side==view)"classicown"else"classicenemy"else skin
    }
    val keys = remember(board, players, view, game.array("effects")) { boards.flatMapIndexed { side, cells -> cells.jsonArray.mapNotNull { cell -> (cell as? JsonObject)?.let { it.text("type") to skin(it, side) } } }.plus(game.array("effects").map { it.jsonObject.text("projectile") to "classic" }).distinct() }
    val art by produceState<Map<Pair<String, String>, Bitmap>>(emptyMap(), keys) {
        value = keys.mapNotNull { key -> SymbolArt.bitmap(context, key.first, key.second)?.let { key to it } }.toMap()
    }
    val effectProgress = remember { Animatable(1f) }
    LaunchedEffect(game.text("revision"), reduced) {
        if (game.array("effects").isNotEmpty() && !reduced) { effectProgress.snapTo(0f); effectProgress.animateTo(1f, tween(650)) }
        else effectProgress.snapTo(1f)
    }
    Canvas(Modifier.size((width * cellDp).dp, (rows * 2 * cellDp).dp).semantics { contentDescription = "Поле ${rows * 2} на $width. Для доступного выбора используй меню координат над полем." }
        .pointerInput(width, rows, cellDp, view) { detectTapGestures { offset ->
            val cell = cellDp.dp.toPx(); val x = (offset.x / cell).toInt(); val y = (offset.y / cell).toInt()
            if (x in 0 until width && y in 0 until rows * 2) {
                val side = if (y < rows) 1 - view else view
                val row = if (y < rows) rows - 1 - y else y - rows
                latestChoose(side, row * width + x)
            }
        } }) {
        val cell = cellDp.dp.toPx(); paint.textSize = cell * .55f
        drawRect(androidx.compose.ui.graphics.Brush.linearGradient(listOf(Color(0xFF36283F), Color(0xFF1D3731), Color(0xFF38232E))))
        for (y in 0 until rows * 2) for (x in 0 until width) {
            val side = if (y < rows) 1 - view else view
            val row = if (y < rows) rows - 1 - y else y - rows
            val index = row * width + x
            val top = Offset(x * cell, y * cell)
            drawRect(Color(0x29B4A9CF), top, Size(cell, cell), style = Stroke(1f))
            if(row == rows - 1) drawRect(Color(0x0CDFD5FF), top, Size(cell, cell))
            val piece = boards.getOrNull(side)?.jsonArray?.getOrNull(index) as? JsonObject
            if (piece != null) {
                val type = piece.text("type")
                drawContext.canvas.nativeCanvas.apply {
                    save()
                    if (type in setOf("arrow", "arrowx2", "laser", "tank", "sword", "point", "inspect", "powerful")) rotate(if (side == view) piece.number("dir") * 45f else 180f - piece.number("dir") * 45f, top.x + cell / 2, top.y + cell / 2)
                    paint.alpha = if (piece.flag("spent")) 130 else 255
                    val bitmap = art[type to skin(piece, side)]
                    if (bitmap != null) drawBitmap(bitmap, null, RectF(top.x + 2, top.y + 2, top.x + cell - 2, top.y + cell - 2), paint)
                    else drawText(symbolMark(type), top.x + cell / 2, top.y + cell * .7f, paint)
                    restore()
                }
                if (type == "king") {
                    val hp = board.array("kingHp").getOrNull(piece.number("seat", side.toLong()).toInt())?.jsonPrimitive?.content.orEmpty()
                    drawRect(Color(0xED203B5D), top + Offset(0f,cell*.66f),Size(cell*.65f,cell*.34f))
                    paint.alpha=255;paint.textSize=cell*.30f
                    drawContext.canvas.nativeCanvas.drawText(hp,top.x+cell*.32f,top.y+cell*.95f,paint)
                }
            }
            if (side == selectedSide && index == selected) drawRect(Color(0xFFB6A4C9), top, Size(cell - 1, cell - 1), style = Stroke(4f))
        }
        drawLine(Color(0xFFB6A4C9), Offset(0f, rows * cell), Offset(width * cell, rows * cell), 3f)
        if (effectProgress.value < 1f) game.array("effects").forEach { element ->
            val effect=element.jsonObject;val path=effect.array("path").map { it.jsonObject }
            fun position(point: JsonObject): Offset { val side=point.number("side").toInt();val index=point.number("index").toInt();val y=if(side==view)rows+index/width else rows-1-index/width;return Offset((index%width+.5f)*cell,(y+.5f)*cell) }
            if(path.isNotEmpty()) {
                val cursor=effectProgress.value*(path.size-1);val step=cursor.toInt();val from=position(path[step]);val to=position(path[(step+1).coerceAtMost(path.lastIndex)]);val head=from+(to-from)*(cursor-step)
                val type=effect.text("projectile");val color=if(type=="laser")Color(0xFFD77AFF)else if(type=="sword")Color(0xFF64EAFF)else Color(0xFFFFCF74)
                if(type in setOf("laser","sword")) { drawLine(color.copy(alpha=.3f),from,head,cell*.30f);drawLine(Color.White,from,head,cell*.09f) }
                else if(type=="tank")drawOval(color,head-Offset(cell*.18f,cell*.08f),Size(cell*.36f,cell*.16f))
                else art[type to "classic"]?.let { bitmap -> drawContext.canvas.nativeCanvas.apply { save(); val angle=if(effect.number("player").toInt()==view)effect.number("direction")*45f else 180f-effect.number("direction")*45f;rotate(angle,head.x,head.y);paint.alpha=255;drawBitmap(bitmap,null,RectF(head.x-cell*.35f,head.y-cell*.35f,head.x+cell*.35f,head.y+cell*.35f),paint);restore() } }
                effect.array("impacts").forEach { raw ->val hit=raw.jsonObject;val at=path.indexOfFirst {it.number("side")==hit.number("side")&&it.number("index")==hit.number("index")};if(at in 0..step){val center=position(hit);val radius=cell*.28f;drawCircle(color.copy(alpha=.65f),radius,center,style=Stroke(2f));drawLine(color,center-Offset(radius,radius),center+Offset(radius,radius),2f);drawLine(color,center+Offset(-radius,radius),center+Offset(radius,-radius),2f)}}
            }
        }
    }
}
