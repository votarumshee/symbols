package com.votarumshee.symbols

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.votarumshee.symbols.core.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Run concurrently on two devices using scripts/android-pair.mjs. Real application repositories. */
@RunWith(AndroidJUnit4::class)
class MultiplayerTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    @Test fun pairedDevicesPlayAndSwitchAccounts() = runBlocking {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue("Opt-in two-device test", args.containsKey("role"))
        val role = args.getString("role")!!.toInt()
        val team = args.getString("mode") == "team"
        val assets = InstrumentationRegistry.getInstrumentation().context.assets
        val sessions = wire.decodeFromString<List<Session>>(assets.open("multi-fixture.json").bufferedReader().use { it.readText() })
        val app = compose.activity.application as SymbolsApplication
        val repo = app.repository!!
        val mine = if(team) listOf(role, role+2) else listOf(role)
        withContext(Dispatchers.Main) {
            repo.select(null)
            SecureStore(app).saveSessions(mine.map { sessions[it] }, null)
            repo.select(sessions[role].id)
        }
        val played = mutableSetOf<Int>()
        withTimeout(100_000) {
            while (true) {
                val state = repo.state.first { it.connection == Connection.Live && it.game?.match != null }
                val match = state.game!!.match!!
                if(match.text("status") == "done") break
                val actor = match.number("actor").toInt()
                if(actor !in mine) { delay(100); continue }
                if(state.game!!.account != sessions[actor].id) {
                    withContext(Dispatchers.Main) { repo.select(sessions[actor].id) }
                    assertNull(repo.state.value.game) // Previous account's private snapshot was cleared.
                    continue
                }
                val setup = match.text("status") == "setup"
                if(!setup && actor in played) {
                    if(role == 0 && played.size == mine.size) {
                        withContext(Dispatchers.Main) { assertNotNull(repo.command("leave", objectOf("matchId" to match.text("id"), "revision" to match.text("revision")))) }
                        repo.state.first { it.game?.match?.text("status") == "done" }
                    }
                    delay(100); continue
                }
                val board = match.obj("board")
                assertEquals(if(args.getString("small") == "true") 14 else 20, board.number("width").toInt())
                val index = if(setup) (board.number("rows")-1)*board.number("width")+actor/2 else actor/2
                val action = objectOf("type" to if(setup) "king" else "smile", "index" to index)
                withContext(Dispatchers.Main) { assertNotNull(repo.command("action", objectOf("matchId" to match.text("id"), "revision" to match.text("revision"), "action" to action))) }
                repo.state.first { it.game?.match?.text("revision") != match.text("revision") }
                if(!setup) played.add(actor)
            }
        }
        assertEquals(mine.toSet(), played)
        assertEquals("done", repo.state.value.game!!.match!!.text("status"))
        Unit
    }
}
