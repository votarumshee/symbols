package com.votarumshee.symbols.core

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File

class ImportedAccountTest {
    @Test fun importedProgressSurvivesRecoveryOnAnotherClient() = runBlocking {
        val path = System.getProperty("symbols.importFixture").orEmpty()
        assumeTrue("Requires generated synthetic legacy fixture", path.isNotBlank())
        val fixture = wire.parseToJsonElement(File(path).readText()).jsonObject
        val api = SymbolsApi(System.getProperty("symbols.integrationUrl"), true)
        val expected = fixture.obj("expected")
        try {
            repeat(2) {
                val session = api.authenticate(fixture.text("code"), true)
                assertEquals(fixture.text("id"), session.id)
                val profile = api.bootstrap(session.token).profile
                for (key in listOf("nick", "inventory", "upgrades", "skins", "ownedSkins", "ownedAvatars", "rank", "history", "xp", "frame")) assertEquals(key, expected[key], profile[key])
                assertEquals(expected.number("balanceCents").toString(), profile.text("balanceCents"))
            }
        } finally { api.close() }
    }
}
