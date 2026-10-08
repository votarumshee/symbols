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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.Dp
import com.votarumshee.symbols.core.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*

private val portraitCache = object : android.util.LruCache<String, Bitmap>(2*1024*1024) {
    override fun sizeOf(key: String, value: Bitmap) = value.byteCount
}
@Composable private fun assetBitmap(name: String, tile: Int = -1): Bitmap? {
    val context = LocalContext.current
    val bitmap by produceState<Bitmap?>(null, name, tile) {
        value = withContext(Dispatchers.IO) {
            val key = "$name:$tile"
            portraitCache.get(key) ?: run {
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                context.assets.open(name).use { BitmapFactory.decodeStream(it, null, bounds) }
                val target = if(tile < 0) 192 else 960
                var sample = 1
                while(bounds.outWidth / (sample * 2) >= target) sample *= 2
                context.assets.open(name).use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }?.let { original ->
                    (if (tile < 0) original else Bitmap.createBitmap(original, tile % 5 * (original.width / 5), tile / 5 * (original.height / 2), original.width / 5, original.height / 2)).also { portraitCache.put(key,it) }
                }
            }
        }
    }
    return bitmap
}

@Composable fun AvatarArt(id: String, frame: JsonObject = JsonObject(emptyMap()), level: Long = 1, size: Dp = 76.dp) {
    val color = when(frame.text("type")) {
        "bronze" -> Color(0xFFB87D4B); "silver" -> Color(0xFFC3CBD3); "gold" -> Color(0xFFE6BA46)
        "emerald" -> Color(0xFF29C995); "diamond" -> Color(0xFF91E0FF); "puregold" -> Color(0xFFFFE36C)
        "violetdiamond" -> Color(0xFF9568D8); else -> Color.Transparent
    }
    val metal = when(frame.text("type")) {
        "puregold" -> Brush.linearGradient(listOf(Color(0xFFFFF6B9),Color(0xFFD39C24),Color(0xFFFFE680)))
        "violetdiamond" -> Brush.sweepGradient(listOf(Color(0xFF4D296F),Color(0xFFC39AFF),Color(0xFF7646A7),Color(0xFFE5CBFF),Color(0xFF4D296F)))
        else -> Brush.linearGradient(0f to Color(0xFFEEE7DF),.24f to color,.48f to Color(0xFF17141B),.65f to color,1f to Color(0xFFF7F2EE))
    }
    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
      Box(Modifier.fillMaxSize().then(if(frame.isEmpty())Modifier else Modifier.background(metal,RoundedCornerShape(18.dp)).border(1.dp,color,RoundedCornerShape(18.dp))).padding(if(frame.isEmpty())0.dp else 5.dp).background(Brush.linearGradient(listOf(Color(0xFF303F57),Color(0xFF171C29))),RoundedCornerShape(13.dp)).padding(2.dp),contentAlignment=Alignment.Center) {
        if (id in setOf("thunderlion", "firec")) {
            assetBitmap(if(id == "firec") "fire-c.png" else "thunder-lion.png")?.let { Image(it.asImageBitmap(), if(id == "firec") "Огненная C" else "Лев с молнией", Modifier.fillMaxSize()) }
        } else Text(if(id == "eagle") "🦅" else "🦁", fontSize = if(size < 60.dp) 24.sp else 36.sp)
      }
        if(frame.isNotEmpty()) androidx.compose.foundation.Canvas(Modifier.fillMaxSize()) {
            val stage=frame.number("stage").toInt().coerceIn(1,6)
            val stripe=(if(size < 60.dp)4.dp else 6.dp).toPx();val gap=2.dp.toPx();val total=stage*stripe+(stage-1)*gap;val height=(if(size < 60.dp)8.dp else 12.dp).toPx()
            repeat(stage) { i -> val x=(this.size.width-total)/2+i*(stripe+gap);val y=this.size.height-height/2
                val shape=androidx.compose.ui.graphics.Path().apply{moveTo(x+height*.45f,y);lineTo(x+stripe+height*.45f,y);lineTo(x+stripe,y+height);lineTo(x,y+height);close()}
                drawPath(shape,Brush.horizontalGradient(listOf(color,Color(0xFFE7DCD8),color),x,x+stripe))
            }
            if(frame.text("type") in setOf("emerald","diamond","violetdiamond")) repeat(3) { i ->
                val x=this.size.width/2+(i-1)*7.dp.toPx();val y=3.dp.toPx();val r=2.dp.toPx()
                drawPath(androidx.compose.ui.graphics.Path().apply{moveTo(x,y-r);lineTo(x+r,y);lineTo(x,y+r);lineTo(x-r,y);close()},color)
            }
        }
        if(level > 300 && frame.isNotEmpty()) Text("$level",color=color,fontSize=9.sp,modifier=Modifier.align(Alignment.BottomCenter))
    }
}

@Composable fun ProfileArt(profile: JsonObject, catalog: Catalog?, compact: Boolean = false) {
    val level = profile.obj("level").number("level", profile.number("level", 1))
    val unlocked = (level / 10).coerceAtMost(30)
    val chosen = if(profile["frame"] == JsonNull) 0 else profile.number("frame", unlocked)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        AvatarArt(profile.text("avatar", "lion"), catalog?.find("frame", "$chosen") ?: JsonObject(emptyMap()), level, if(compact) 40.dp else 76.dp)
        val rank = profile.obj("rank")
        val index = rank.number("index", -1).toInt()
        if(index in 0..18) {
            val tile = if(index < 12) index / 4 else index - 9
            Box(Modifier.size(if(compact) 40.dp else 76.dp)) {
                assetBitmap("rank-atlas.png", tile)?.let { Image(it.asImageBitmap(), rank.text("name"), Modifier.fillMaxSize()) }
                if(index < 12) Text(listOf("I","II","III","IV")[index % 4], Modifier.align(Alignment.BottomEnd), color = Color(0xFFFFE9B6))
                if(index == 15) Text("Pro", Modifier.align(Alignment.TopCenter))
                if(index == 16) Text("1 · 1 · 1", Modifier.align(Alignment.BottomCenter), fontSize = 10.sp)
            }
        }
    }
}

@Composable fun RankArt(rank: JsonObject) {
    val index = rank.number("index", -1).toInt()
    Box(Modifier.size(80.dp).background(Color(0xFF222222),RoundedCornerShape(18.dp)).border(1.dp,Color(0xFF555555),RoundedCornerShape(18.dp)),contentAlignment=Alignment.Center) {
        if(index in 0..18) { val tile=if(index<12)index/4 else index-9;assetBitmap("rank-atlas.png",tile)?.let { Image(it.asImageBitmap(),rank.text("name"),Modifier.fillMaxSize()) };if(index<12)Text(listOf("I","II","III","IV")[index%4],Modifier.align(Alignment.BottomEnd),color=Color(0xFFFFE9B6)) }
        else Text("◇",fontSize=54.sp,color=Color(0xFFDDDDDD))
    }
}
