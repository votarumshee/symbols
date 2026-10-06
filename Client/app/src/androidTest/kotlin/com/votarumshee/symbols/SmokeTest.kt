package com.votarumshee.symbols

import androidx.compose.ui.test.*
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
        waitFor("Никнейм")
        compose.onNodeWithText("Никнейм").performTextInput("Android тест")
        compose.onNodeWithText("Создать аккаунт", useUnmergedTree = true).performScrollTo().performClick()
        waitFor("Привет, Android тест")
        waitFor("На связи")
        screenshot("01-home")
        compose.onNodeWithText("Инвентарь", substring = false).performScrollTo().performClick()
        waitFor("Улучшить символы")
        screenshot("02-inventory")
        compose.activityRule.scenario.recreate()
        waitFor("Улучшить символы")
        compose.onNodeWithText("♛  СИМВОЛЫ").performClick()
        compose.onNodeWithText("Играть  ↗").performScrollTo().performClick()
        waitFor("Выбери игру")
        compose.onNodeWithText("Двое на одном устройстве").performScrollTo().performClick()
        waitFor("Твой ход")
        repeat(2) {
            val before = (compose.activity.application as SymbolsApplication).repository!!.state.value.game!!.match!!.get("revision").toString()
            compose.onNodeWithText("Ряд 1–5").performScrollTo().performTextClearance()
            compose.onNodeWithText("Ряд 1–5").performTextInput("5")
            compose.onNodeWithText("Столбец 1–14").performTextClearance()
            compose.onNodeWithText("Столбец 1–14").performTextInput("1")
            compose.onNodeWithText("Выбрать по координатам (TalkBack)").performScrollTo().performClick()
            compose.onNodeWithText("Подтвердить: Король").performScrollTo().performClick()
            compose.waitUntil(15_000) { (compose.activity.application as SymbolsApplication).repository!!.state.value.game!!.match!!.get("revision").toString() != before }
        }
        waitFor("Направление:")
        compose.onNodeWithText("Твой ход").performScrollTo()
        screenshot("03-match")
        compose.activityRule.scenario.recreate()
        waitFor("Твой ход")
        compose.onNodeWithText("Выйти из партии").performScrollTo().performClick()
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
        waitFor("Привет, Перенос Android")
        waitFor("На связи")
        compose.onNodeWithText("1234,56 ♦").assertExists()
        compose.activityRule.scenario.recreate()
        waitFor("Привет, Перенос Android")
        compose.onNodeWithText("Магазин", substring = false).performScrollTo().performClick()
        waitFor("Купить за 20,00 руб.")
        compose.onAllNodesWithText("Купить за 20,00 руб.")[0].performScrollTo().performClick()
        compose.onNodeWithText("Подтвердить", substring = false).performClick()
        waitFor("1214,56 ♦")
        compose.onAllNodesWithText("Открыть", substring = false)[0].performScrollTo().performClick()
        compose.onNodeWithText("Подтвердить", substring = false).performClick()
        waitFor("Последний результат:")
        compose.onNodeWithText("♛  СИМВОЛЫ").performClick()
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
