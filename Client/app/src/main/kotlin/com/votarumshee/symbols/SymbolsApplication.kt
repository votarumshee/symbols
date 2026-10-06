package com.votarumshee.symbols

import android.app.Application
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.datastore.preferences.preferencesDataStore
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import com.votarumshee.symbols.core.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.map
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf

private val android.content.Context.settings by preferencesDataStore("settings")
class SymbolsApplication : Application(), DefaultLifecycleObserver {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    var repository: GameRepository? = null
        private set
    var configurationError: String? by mutableStateOf(null)
        private set
    private val reducedKey = booleanPreferencesKey("reduced_effects")
    val reducedEffects get() = settings.data.map { it[reducedKey] ?: false }
    suspend fun reducedEffects(value: Boolean) { settings.edit { it[reducedKey] = value } }
    override fun onCreate() {
        super<Application>.onCreate()
        try {
            repository = GameRepository(SymbolsApi(BuildConfig.API_URL, BuildConfig.FLAVOR == "dev" && BuildConfig.BUILD_TYPE in setOf("debug", "qa")), SecureStore(this), scope)
        } catch (_: Exception) { configurationError = "Адрес сервера не настроен в этой сборке. Нужна сборка для вашего сервера."; return }
        ProcessLifecycleOwner.get().lifecycle.addObserver(this)
        val manager = getSystemService(ConnectivityManager::class.java)
        val capabilities = manager.getNetworkCapabilities(manager.activeNetwork)
        repository?.network(capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true)
        manager.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { scope.launch { repository?.network(true) } }
            override fun onLost(network: Network) { scope.launch { repository?.network(manager.activeNetwork != null) } }
        })
        scope.launch { try { repository?.initialize() } catch (_: Exception) { configurationError = "Не удалось открыть защищённое хранилище. Не создавай новый аккаунт: используй сохранённый код восстановления." } }
    }
    override fun onStart(owner: LifecycleOwner) { repository?.foreground(true) }
    override fun onStop(owner: LifecycleOwner) { repository?.foreground(false) }
}
