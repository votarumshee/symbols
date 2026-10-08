package com.votarumshee.symbols
import android.app.Activity
import android.os.Bundle
import android.widget.TextView
import com.votarumshee.symbols.core.*
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
class MigrationSeedActivity : Activity() {
 override fun onCreate(state: Bundle?) { super.onCreate(state)
  check(packageName=="com.votarumshee.symbols.migrationtest.qa")
  runBlocking {
   val fixture=wire.parseToJsonElement(assets.open("migration-fixture.json").bufferedReader().use { it.readText() }).jsonObject
   val store=SecureStore(this@MigrationSeedActivity)
   check(store.sessions().isEmpty()) { "Refusing to replace existing accounts" }
   val sessions=wire.decodeFromJsonElement<List<Session>>(fixture.getValue("sessions"))
   var attempts=0
   do { store.saveSessions(sessions,fixture.getValue("active").jsonPrimitive.content);attempts++ } while(java.io.File(noBackupFilesDir,"vault/accounts").readBytes()[0].toInt()!=123 && attempts<4096)
   check(java.io.File(noBackupFilesDir,"vault/accounts").readBytes()[0].toInt()==123) { "No IV-leading-brace envelope generated" }
   fixture.getValue("pending").jsonArray.forEach { val p=wire.decodeFromJsonElement<PendingCommand>(it);store.savePending(p.account,p) }
   check(store.sessions()==sessions);check(store.active()==fixture.getValue("active").jsonPrimitive.content)
   setContentView(TextView(this@MigrationSeedActivity).apply { text="KOTLIN_SECURESTORE_SEEDED ${sessions.size} IV_BRACE" })
  }
 }
}

