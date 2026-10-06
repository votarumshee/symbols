package com.votarumshee.symbols

import android.graphics.Paint
import android.graphics.Bitmap
import android.graphics.RectF
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
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
@Composable fun MatchScreen(state: AppState, reduced: Boolean, command: (String, JsonObject) -> Unit) {
    val game = state.game?.match
    if (game == null) { Page("Партия") { Text("Нет активной партии. Выбери режим игры на главной.") }; return }
    val catalog = state.catalog ?: return
    val board = game.obj("board")
    val actor = game.number("actor").toInt()
    val seats = game.array("seats").map { it.jsonPrimitive.int }
    val seat = if (game.text("mode") == "local") actor else seats.firstOrNull() ?: 0
    val myTurn = actor == seat && game.text("status") in setOf("setup", "play")
    var symbol by rememberSaveable(game.text("id")) { mutableStateOf("arrow") }
    var selected by rememberSaveable(game.text("id")) { mutableStateOf(-1) }
    var selectedSide by rememberSaveable(game.text("id")) { mutableStateOf(-1) }
    var source by rememberSaveable(game.text("id")) { mutableStateOf(-1) }
    var direction by rememberSaveable { mutableStateOf(0) }
    var cellSize by rememberSaveable { mutableStateOf(40f) }
    var rowText by rememberSaveable { mutableStateOf("") }
    var columnText by rememberSaveable { mutableStateOf("") }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(game.text("revision")) { selected = -1; selectedSide = -1; source = -1 }
    LaunchedEffect(game.text("status")) { while (game.text("status") != "done") { now = System.currentTimeMillis(); delay(1000) } }
    val width = board.number("width").toInt()
    val rows = board.number("rows").toInt()
    val active = !state.busy && state.connection in setOf(Connection.Live, Connection.LongPolling)
    Page(if (game.text("status") == "waiting") "Ждём соперника" else if (game.text("status") == "done") "Партия завершена" else if (myTurn) "Твой ход" else "Ход соперника") {
        game.text("code").takeIf { it.isNotBlank() }?.let { Text("Код комнаты: $it", style = MaterialTheme.typography.headlineSmall) }
        game.array("players").forEachIndexed { index, value ->
            val player = value.jsonObject
            ProfileArt(player, catalog)
            val hp = board.array("kingHp").getOrNull(index)?.jsonPrimitive?.content ?: "—"
            Text("${if (actor == index) "▶ " else ""}${player.text("nick")} ${if (player.flag("bot")) "· бот" else ""} · здоровье $hp")
            if (!player.flag("bot") && player.text("id") != state.game!!.account) ReportControls(player.text("id"), player.text("nick"), command)
        }
        if (game.text("status") == "waiting") Text("${game.array("players").size} из ${game.number("capacity")} участников")
        if (game.text("status") in setOf("setup", "play")) {
            val remaining = ((game.number("turnAt") + catalog.find("settings", "runtime").number("turnTimeoutMs") - now - state.serverOffsetMs) / 1000).coerceAtLeast(0)
            Text("До конца хода: $remaining с. ${if (remaining == 0L) "Ждём результат сервера." else ""}")
            if (game.text("status") == "setup") Text("Выбери клетку своего крайнего ряда и подтверди размещение короля.")
            else if (game.flag("tutorial")) Text("Установи стрелочку и выбери направление. Атака сработает после ответного хода. Защищай короля блоками; точка усиливает символ по направлению.")
        }
        if (width > 0 && rows > 0) {
            Text("Масштаб поля · перетаскивай полосы прокрутки. Нажатие только выбирает клетку.", style = MaterialTheme.typography.bodySmall)
            Slider(cellSize, { cellSize = it }, valueRange = 24f..64f, modifier = Modifier.semantics { contentDescription = "Масштаб игрового поля" })
            Box(Modifier.fillMaxWidth().height(340.dp).horizontalScroll(rememberScrollState()).verticalScroll(rememberScrollState())) {
                BoardCanvas(game, seat % 2, cellSize, selectedSide, selected, reduced) { side, index -> selectedSide = side; selected = index }
            }
            if (selected >= 0) {
                val piece = board.array("boards")[selectedSide].jsonArray[selected] as? JsonObject
                Text("${if (selectedSide == seat % 2) "Твоя" else "Чужая"} клетка: ряд ${selected / width + 1}, столбец ${selected % width + 1}. ${piece?.let { catalog.symbolName(it.text("type")) } ?: "Пусто"}")
            }
            if (myTurn) {
                val advice = game.obj("advice")
                if (advice.isNotEmpty()) {
                    Text(advice.text("text"))
                    val move = advice.obj("move")
                    if (move.isNotEmpty()) TextButton(onClick = { symbol = move.text("type"); selectedSide = seat % 2; selected = move.number("index").toInt(); direction = move.number("dir").toInt() }) { Text("Показать рекомендуемый ход") }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Column(Modifier.weight(1f)) { Entry(rowText, { rowText = it }, "Ряд 1–$rows", true) }
                    Column(Modifier.weight(1f)) { Entry(columnText, { columnText = it }, "Столбец 1–$width", true) }
                }
                TextButton(onClick = {
                    val r = rowText.toIntOrNull(); val c = columnText.toIntOrNull()
                    if (r != null && c != null && r in 1..rows && c in 1..width) { selectedSide = seat % 2; selected = (r - 1) * width + c - 1 }
                }) { Text("Выбрать по координатам (TalkBack)") }
                if (game.text("status") != "setup") {
                    val symbols = catalog.category("symbol").filter { it.payload.flag("free") || state.game!!.profile.obj("inventory").number(it.key) > 0 || board.isNotEmpty() && game.obj("uses").obj("$seat").number(it.key) > 0 }.map { it.key }
                    Choice("Символ", symbols, symbol, { symbol = it; source = -1 }, catalog::symbolName)
                    Text("Осталось: ${game.obj("uses").obj("$seat").text(symbol, "∞")}")
                    Choice("Направление", (0..7).map { "$it" }, "$direction", { direction = it.toInt() }) { directions[it.toInt()] }
                    if (symbol == "teleport") TextButton(enabled = selectedSide == seat % 2 && selected >= 0, onClick = { source = selected; selected = -1 }) { Text(if (source < 0) "Выбрать исходную фигуру" else "Источник: ${source / width + 1}, ${source % width + 1}. Выбери место назначения.") }
                }
                val type = if (game.text("status") == "setup") "king" else symbol
                Action("Подтвердить: ${catalog.symbolName(type)}", active && (type == "angry" || selected >= 0 && selectedSide == seat % 2) && (type != "teleport" || source >= 0)) {
                    val action = if (type == "angry") objectOf("type" to type) else objectOf("type" to type, "index" to selected, "side" to selectedSide, "dir" to direction, "source" to source.takeIf { it >= 0 })
                    command("action", objectOf("matchId" to game.text("id"), "revision" to game.text("revision"), "action" to action))
                }
            }
        }
        if (game.text("status") == "done") {
            val result = game.obj("result")
            Text(if (game.text("mode") == "local") "Победила сторона ${(board.number("winner") + 1)}" else if (result.flag("won")) "Победа!" else "Поражение", style = MaterialTheme.typography.headlineMedium)
            Text("${game.text("reason")} · +${result.number("xp")} опыта")
            Text("Баланс и награды обновлены сервером. Задания: ${result.array("quests").joinToString { catalog.find("quest", it.jsonPrimitive.content).text("title") }}")
            if (game.text("mode") == "trial") Action("Следующее испытание", active) { command("start", objectOf("mode" to "trial", "small" to (width == 14))) }
        } else Action(if (game.text("status") == "waiting") "Отменить поиск" else "Выйти из партии", active) { command("leave", objectOf("matchId" to game.text("id"), "revision" to game.text("revision"))) }
    }
}
@Composable private fun BoardCanvas(game: JsonObject, view: Int, cellDp: Float, selectedSide: Int, selected: Int, reduced: Boolean, choose: (Int, Int) -> Unit) {
    val board = game.obj("board")
    val width = board.number("width").toInt(); val rows = board.number("rows").toInt()
    val boards = board.array("boards")
    val paint = remember { Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER; color = android.graphics.Color.WHITE } }
    val context = LocalContext.current
    val players = game.array("players")
    fun skin(piece: JsonObject, side: Int): String = players.getOrNull(piece.number("seat", side.toLong()).toInt())?.jsonObject?.obj("skins")?.text(piece.text("type"), "classic") ?: "classic"
    val keys = remember(board, players) { boards.flatMapIndexed { side, cells -> cells.jsonArray.mapNotNull { cell -> (cell as? JsonObject)?.let { it.text("type") to skin(it, side) } } }.distinct() }
    val art by produceState<Map<Pair<String, String>, Bitmap>>(emptyMap(), keys) {
        value = keys.mapNotNull { key -> SymbolArt.bitmap(context, key.first, key.second)?.let { key to it } }.toMap()
    }
    val effectProgress = remember { Animatable(1f) }
    LaunchedEffect(game.text("revision"), reduced) {
        if (game.array("effects").isNotEmpty() && !reduced) { effectProgress.snapTo(0f); effectProgress.animateTo(1f, tween(650)) }
        else effectProgress.snapTo(1f)
    }
    Canvas(Modifier.size((width * cellDp).dp, (rows * 2 * cellDp).dp).semantics { contentDescription = "Поле ${rows * 2} на $width. Для доступного выбора используй координаты под полем." }
        .pointerInput(width, rows, cellDp, view) { detectTapGestures { offset ->
            val cell = cellDp.dp.toPx(); val x = (offset.x / cell).toInt(); val y = (offset.y / cell).toInt()
            if (x in 0 until width && y in 0 until rows * 2) {
                val side = if (y < rows) 1 - view else view
                val row = if (y < rows) rows - 1 - y else y - rows
                choose(side, row * width + x)
            }
        } }) {
        val cell = cellDp.dp.toPx(); paint.textSize = cell * .55f
        for (y in 0 until rows * 2) for (x in 0 until width) {
            val side = if (y < rows) 1 - view else view
            val row = if (y < rows) rows - 1 - y else y - rows
            val index = row * width + x
            val top = Offset(x * cell, y * cell)
            drawRect(if (side == view) Color(0xFF203C32) else Color(0xFF3E2C31), top, Size(cell - 1, cell - 1))
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
                if (type == "king") drawRect(Color(0xFFE0CC75), top + Offset(3f, 3f), Size(cell - 6, cell - 6), style = Stroke(2f))
            }
            if (side == selectedSide && index == selected) drawRect(Color(0xFFC7EF7D), top, Size(cell - 1, cell - 1), style = Stroke(4f))
        }
        drawLine(Color.White, Offset(0f, rows * cell), Offset(width * cell, rows * cell), 3f)
        if (effectProgress.value < 1f) game.array("effects").forEach { element ->
            val path = element.jsonObject.array("path")
            path.take((path.size * effectProgress.value).toInt() + 1).forEach { p ->
                val point = p.jsonObject; val side = point.number("side").toInt(); val index = point.number("index").toInt()
                val y = if (side == view) rows + index / width else rows - 1 - index / width
                drawCircle(Color(0xFFFFDC76).copy(alpha = .7f), cell * .16f, Offset((index % width + .5f) * cell, (y + .5f) * cell))
            }
        }
    }
}
