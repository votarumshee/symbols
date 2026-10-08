package com.votarumshee.symbols

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.util.LruCache
import com.caverock.androidsvg.SVG
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlin.math.cos
import kotlin.math.sin

object SymbolArt {
    private val cache = object : LruCache<String, Bitmap>(4 * 1024 * 1024) {
        override fun sizeOf(key: String, value: Bitmap) = value.byteCount
    }
    suspend fun bitmap(context: Context, symbol: String, skin: String): Bitmap? = withContext(Dispatchers.Default) {
        if (!symbol.matches(Regex("[a-z0-9]+")) || !skin.matches(Regex("[a-z0-9]+"))) return@withContext null
        val key = "$symbol-$skin"
        cache.get(key)?.let { return@withContext it }
        runCatching {
            val svg = context.assets.open("symbols/$key.svg").use { SVG.getFromInputStream(it) }
            val bitmap = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888)
            svg.setDocumentWidth(96f); svg.setDocumentHeight(96f)
            svg.renderToCanvas(Canvas(bitmap))
            val matrix = ColorMatrix()
            fun hue(degrees: Double) {
                val c = cos(Math.toRadians(degrees)).toFloat(); val s = sin(Math.toRadians(degrees)).toFloat()
                matrix.postConcat(ColorMatrix(floatArrayOf(
                    .213f+c*.787f-s*.213f,.715f-c*.715f-s*.715f,.072f-c*.072f+s*.928f,0f,0f,
                    .213f-c*.213f+s*.143f,.715f+c*.285f+s*.140f,.072f-c*.072f-s*.283f,0f,0f,
                    .213f-c*.213f-s*.787f,.715f-c*.715f+s*.715f,.072f+c*.928f+s*.072f,0f,0f,
                    0f,0f,0f,1f,0f)))
            }
            fun saturation(value: Float) { matrix.postConcat(ColorMatrix().apply { setSaturation(value) }) }
            when(skin) {
                "neon" -> { hue(65.0); saturation(1.7f) }
                "frost" -> { hue(155.0); saturation(.7f); matrix.postConcat(ColorMatrix().apply { setScale(1.25f,1.25f,1.25f,1f) }) }
                "ember" -> {
                    val t=.65f
                    matrix.postConcat(ColorMatrix(floatArrayOf(1-.607f*t,.769f*t,.189f*t,0f,0f,.349f*t,1-.314f*t,.168f*t,0f,0f,.272f*t,.534f*t,1-.869f*t,0f,0f,0f,0f,0f,1f,0f)))
                    saturation(2.8f); hue(335.0)
                }
            }
            val result = if (skin in setOf("neon", "frost", "ember")) Bitmap.createBitmap(96,96,Bitmap.Config.ARGB_8888).also { Canvas(it).drawBitmap(bitmap,0f,0f,Paint().apply { colorFilter=ColorMatrixColorFilter(matrix) }) } else bitmap
            val glow = if(skin == "classic") when(symbol) { "point" -> 0xFFFFE086.toInt(); "circle" -> 0xFF43DFFF.toInt(); "feedback" -> 0xFFF79A50.toInt(); else -> null } else null
            val finalBitmap = if(glow == null) result else Bitmap.createBitmap(96,96,Bitmap.Config.ARGB_8888).also { target ->
                val offset=IntArray(2);val mask=result.extractAlpha(Paint().apply { maskFilter=android.graphics.BlurMaskFilter(6f,android.graphics.BlurMaskFilter.Blur.NORMAL) },offset)
                Canvas(target).apply { drawBitmap(mask,offset[0].toFloat(),offset[1].toFloat(),Paint().apply {color=glow});drawBitmap(result,0f,0f,null) };mask.recycle()
            }
            cache.put(key, finalBitmap)
            finalBitmap
        }.getOrNull()
    }
}

@Composable fun SymbolBadge(symbol: String, skin: String = "classic", size: androidx.compose.ui.unit.Dp = 56.dp) {
    val context = LocalContext.current
    val bitmap by produceState<Bitmap?>(null, symbol, skin) { value = SymbolArt.bitmap(context, symbol, skin) }
    Box(Modifier.size(size)) { bitmap?.let { Image(it.asImageBitmap(), contentDescription = null, modifier = Modifier.fillMaxSize()) } }
}
