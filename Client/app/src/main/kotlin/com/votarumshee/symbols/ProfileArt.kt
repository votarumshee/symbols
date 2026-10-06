package com.votarumshee.symbols

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.votarumshee.symbols.core.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*

@Composable private fun assetBitmap(name: String, tile: Int = -1): Bitmap? {
    val context = LocalContext.current
    val bitmap by produceState<Bitmap?>(null, name, tile) {
        value = withContext(Dispatchers.IO) {
            context.assets.open(name).use { BitmapFactory.decodeStream(it) }?.let { original ->
                if (tile < 0) original else Bitmap.createBitmap(original, tile % 5 * (original.width / 5), tile / 5 * (original.height / 2), original.width / 5, original.height / 2)
            }
        }
    }
    return bitmap
}

@Composable fun AvatarArt(id: String, frame: JsonObject = JsonObject(emptyMap()), level: Long = 1) {
    val color = when(frame.text("type")) {
        "bronze" -> Color(0xFFC28B57); "silver" -> Color(0xFFD8E4ED); "gold" -> Color(0xFFECC459)
        "emerald" -> Color(0xFF50DCAF); "diamond" -> Color(0xFF8CE5F2); "puregold" -> Color(0xFFFFDA57)
        "violetdiamond" -> Color(0xFFC296FC); else -> Color.Transparent
    }
    Box(Modifier.size(76.dp).border(if(frame.isEmpty()) 0.dp else 3.dp, color, RoundedCornerShape(18.dp)).padding(8.dp), contentAlignment = Alignment.Center) {
        if (id in setOf("thunderlion", "firec")) {
            assetBitmap(if(id == "firec") "fire-c.png" else "thunder-lion.png")?.let { Image(it.asImageBitmap(), if(id == "firec") "Огненная C" else "Лев с молнией", Modifier.fillMaxSize()) }
        } else Text(if(id == "eagle") "🦅" else "🦁", fontSize = 36.sp)
        if(frame.isNotEmpty()) Text(if(level > 300) "$level" else "┃".repeat(frame.number("stage").toInt().coerceIn(1,6)), color = color, fontSize = 11.sp, modifier = Modifier.align(Alignment.BottomCenter).background(Color(0xFF152720)))
        if(frame.text("type") in setOf("emerald", "diamond", "violetdiamond")) Text("◆ ◆ ◆", color = color, fontSize = 10.sp, modifier = Modifier.align(Alignment.TopCenter))
    }
}

@Composable fun ProfileArt(profile: JsonObject, catalog: Catalog?) {
    val level = profile.obj("level").number("level", profile.number("level", 1))
    val unlocked = (level / 10).coerceAtMost(30)
    val chosen = if(profile["frame"] == JsonNull) 0 else profile.number("frame", unlocked)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        AvatarArt(profile.text("avatar", "lion"), catalog?.find("frame", "$chosen") ?: JsonObject(emptyMap()), level)
        val rank = profile.obj("rank")
        val index = rank.number("index", -1).toInt()
        if(index in 0..18) {
            val tile = if(index < 12) index / 4 else index - 9
            Box(Modifier.size(76.dp)) {
                assetBitmap("rank-atlas.png", tile)?.let { Image(it.asImageBitmap(), rank.text("name"), Modifier.fillMaxSize()) }
                if(index < 12) Text(listOf("I","II","III","IV")[index % 4], Modifier.align(Alignment.BottomEnd), color = Color(0xFFFFE9B6))
                if(index == 15) Text("Pro", Modifier.align(Alignment.TopCenter))
                if(index == 16) Text("1 · 1 · 1", Modifier.align(Alignment.BottomCenter), fontSize = 10.sp)
            }
        }
    }
}
