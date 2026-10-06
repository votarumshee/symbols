package com.votarumshee.symbols

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.votarumshee.symbols.core.*
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject

class GameViewModel(application: Application) : AndroidViewModel(application) {
    val app = application as SymbolsApplication
    val repository = app.repository
    fun login(value: String, recovery: Boolean) { viewModelScope.launch { repository?.authenticate(value, recovery) } }
    fun command(kind: String, body: JsonObject = objectOf()) { viewModelScope.launch { repository?.command(kind, body) } }
    fun select(id: String?) { viewModelScope.launch { repository?.select(id) } }
    fun retry() { viewModelScope.launch { repository?.command("", retry = true) } }
    fun reconcileMove() { viewModelScope.launch { repository?.reconcileMove() } }
    fun reduceEffects(value: Boolean) { viewModelScope.launch { app.reducedEffects(value) } }
}
