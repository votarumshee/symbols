package com.votarumshee.symbols

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import com.votarumshee.symbols.core.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@Serializable private data class Accounts(val sessions: List<Session> = emptyList(), val active: String? = null)
/** AES/GCM envelopes are atomic and stored only in noBackupFilesDir. No secrets in DataStore. */
class SecureStore(context: Context) : PrivateStore {
    private val root = File(context.noBackupFilesDir, "vault").apply { mkdirs() }
    private val catalogFile = File(context.cacheDir, "catalog.json")
    private val lock = Mutex()
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        return (store.getKey("symbols.v1", null) as? SecretKey) ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("symbols.v1", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(true).build())
        }.generateKey()
    }
    private fun path(name: String) = File(root, name)
    private fun read(name: String): String? {
        val file = AtomicFile(path(name))
        if (!file.baseFile.exists()) return null
        val bytes = file.readFully()
        require(bytes.size in 29..1_048_576)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
        cipher.updateAAD(name.toByteArray())
        return cipher.doFinal(bytes.copyOfRange(12, bytes.size)).toString(Charsets.UTF_8)
    }
    private fun write(name: String, text: String?) {
        val file = AtomicFile(path(name))
        if (text == null) { file.delete(); return }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key()); cipher.updateAAD(name.toByteArray())
        val bytes = cipher.iv + cipher.doFinal(text.toByteArray())
        val output = file.startWrite()
        try { output.write(bytes); file.finishWrite(output) } catch (e: Exception) { file.failWrite(output); throw e }
    }
    private fun journal(account: String) = "pending-" + MessageDigest.getInstance("SHA-256").digest(account.toByteArray()).joinToString("") { "%02x".format(it) }
    private suspend fun <T> io(block: () -> T): T = withContext(Dispatchers.IO) { lock.withLock { block() } }
    override suspend fun sessions() = io { read("accounts")?.let { wire.decodeFromString<Accounts>(it).sessions } ?: emptyList() }
    override suspend fun active() = io { read("accounts")?.let { wire.decodeFromString<Accounts>(it).active } }
    override suspend fun saveSessions(sessions: List<Session>, active: String?) = io { write("accounts", wire.encodeToString(Accounts(sessions, active))) }
    override suspend fun pending(account: String) = io { read(journal(account))?.let { wire.decodeFromString<PendingCommand>(it) } }
    override suspend fun savePending(account: String, command: PendingCommand?) = io { write(journal(account), command?.let { wire.encodeToString(it) }) }
    override suspend fun clearAccount(account: String) { /* Profile/board cache is memory-only and reset by repository. */ }
    override suspend fun catalog() = withContext(Dispatchers.IO) {
        if (!catalogFile.exists() || catalogFile.length() > 2_000_000 || System.currentTimeMillis() - catalogFile.lastModified() > 7 * 86_400_000L) null
        else runCatching { wire.decodeFromString<Catalog>(catalogFile.readText()) }.getOrNull()
    }
    override suspend fun saveCatalog(catalog: Catalog) = withContext(Dispatchers.IO) {
        val file = AtomicFile(catalogFile); val output = file.startWrite()
        try { output.write(wire.encodeToString(catalog).toByteArray()); file.finishWrite(output) } catch (e: Exception) { file.failWrite(output); throw e }
    }
}
