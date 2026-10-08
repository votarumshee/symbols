package com.votarumshee.symbols

import androidx.compose.ui.test.*
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Rule
import org.junit.Test
import org.junit.Before
import org.junit.Assume.assumeTrue
import org.junit.runner.RunWith
import java.io.File
import android.content.ContentValues
import android.provider.MediaStore
import com.votarumshee.symbols.core.*
import kotlinx.coroutines.*
import kotlinx.serialization.json.*

@RunWith(AndroidJUnit4::class)
class SmokeTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    @Before fun selectEntryScreen() = runBlocking {
        withContext(Dispatchers.Main) { (compose.activity.application as SymbolsApplication).repository!!.select(null) }
    }
    private fun waitFor(text: String) {
        compose.waitUntil(30_000) { compose.onAllNodesWithText(text, substring = true).fetchSemanticsNodes().isNotEmpty() }
    }
    @Test fun createAccountOpenInventoryAndSurviveRecreation() {
        waitFor("Ник")
        compose.onNodeWithText("Ник", substring = false).performTextInput("Android тест")
        compose.onNodeWithText("Создать аккаунт", useUnmergedTree = true).performScrollTo().performClick()
        waitFor("Android тест")
        screenshot("01-home")
        compose.onNodeWithText("Инвентарь", substring = false).performScrollTo().performClick()
        waitFor("Common")
        screenshot("02-inventory")
        compose.activityRule.scenario.recreate()
        waitFor("Common")
        compose.onNodeWithText("На главную").performClick()
        compose.onNodeWithText("Играть", substring = false).performScrollTo().performClick()
        waitFor("Поиск соперника")
        compose.onNodeWithText("Двое на одном устройстве").performScrollTo().performClick()
        waitFor("Расставляем королей")
        repeat(2) {
            val before = (compose.activity.application as SymbolsApplication).repository!!.state.value.game!!.match!!.get("revision").toString()
            compose.onNodeWithContentDescription("Поле 10 на 14.", substring = true).performTouchInput { click(Offset(width / 28f, height * .95f)) }
            compose.waitUntil(15_000) { (compose.activity.application as SymbolsApplication).repository!!.state.value.game!!.match!!.get("revision").toString() != before }
        }
        waitFor("Стрелочка")
        compose.onNodeWithText("Стрелочка").performClick()
        compose.onNodeWithContentDescription("Поле 10 на 14.", substring = true).performTouchInput { click(Offset(width * 1.5f / 14, height * .55f)) }
        waitFor("Куда направить?")
        compose.onNodeWithText("↑", substring = false).performClick()
        waitFor("Смайлик")
        screenshot("03-match")
        compose.activityRule.scenario.recreate()
        waitFor("Смайлик")
        compose.onNodeWithText("Меню").performScrollTo().performClick()
        compose.onNodeWithText("Подтвердить", substring = false).performClick()
        waitFor("Партия завершена")
        screenshot("04-result")
    }
    @Test fun restoreImportedAccountBuyCaseAndDeleteAccount() {
        val assets = InstrumentationRegistry.getInstrumentation().context.assets
        assumeTrue("Generate private synthetic fixture first", assets.list("")!!.contains("synthetic-fixture.json"))
        val fixture = wire.parseToJsonElement(assets.open("synthetic-fixture.json").bufferedReader().use { it.readText() }).jsonObject
        waitFor("У меня уже есть аккаунт")
        compose.onNodeWithText("У меня уже есть аккаунт").performScrollTo().performClick()
        compose.onNodeWithText("Код восстановления", substring = false).performTextInput(fixture.text("code"))
        compose.onNodeWithText("Восстановить аккаунт", substring = false).performScrollTo().performClick()
        waitFor("Перенос Android")
        compose.onNodeWithText("1234,56", substring = true).assertExists()
        compose.activityRule.scenario.recreate()
        waitFor("Перенос Android")
        compose.onNodeWithText("Магазин", substring = false).performScrollTo().performClick()
        val firstCase=(compose.activity.application as SymbolsApplication).repository!!.state.value.catalog!!.category("case").first().payload.text("name")
        compose.onNodeWithText(firstCase).performScrollTo().performClick()
        waitFor("Купить за 20,00 рубинов")
        compose.onAllNodesWithText("Купить за 20,00 рубинов")[0].performScrollTo().performClick()
        compose.onNodeWithText("Подтвердить", substring = false).performClick()
        waitFor("1214,56 ♦")
        compose.onAllNodesWithText("Открыть", substring = false)[0].performScrollTo().performClick()
        compose.onNodeWithText("Подтвердить", substring = false).performClick()
        waitFor("Последний результат:")
        compose.onNodeWithText("На главную").performClick()
        compose.onNodeWithText("Настройки и данные").performScrollTo().performClick()
        compose.onNodeWithText("Удалить аккаунт", substring = false).performScrollTo().performClick()
        compose.onNodeWithText("Подтвердить", substring = false).performClick()
        waitFor("Твой первый ход")
    }
    private fun screenshot(name: String) {
        if (android.os.Build.VERSION.SDK_INT < 29) return // No storage permission added to the app for test screenshots.
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val resolver = instrumentation.targetContext.contentResolver
        val metadata = ContentValues().apply { put(MediaStore.Images.Media.DISPLAY_NAME, "$name.png"); put(MediaStore.Images.Media.MIME_TYPE, "image/png"); if (android.os.Build.VERSION.SDK_INT >= 29) put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/Symbols") }
        val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, metadata) ?: return
        instrumentation.uiAutomation.takeScreenshot()?.let { bitmap -> resolver.openOutputStream(uri)!!.use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) } }
    }
}
