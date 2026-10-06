package com.votarumshee.symbols.core

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse

class RecoveryIntegrationTest {
    private class MemoryStore: PrivateStore {
        var accounts=emptyList<Session>(); var selected:String?=null; var receipt:PendingCommand?=null; var content:Catalog?=null
        override suspend fun sessions()=accounts
        override suspend fun active()=selected
        override suspend fun saveSessions(sessions:List<Session>,active:String?){accounts=sessions;selected=active}
        override suspend fun pending(account:String)=receipt
        override suspend fun savePending(account:String,command:PendingCommand?){receipt=command}
        override suspend fun clearAccount(account:String){}
        override suspend fun catalog()=content
        override suspend fun saveCatalog(catalog:Catalog){content=catalog}
    }
    @Test fun unknownOutcomeRetryRateLimitPauseAndSessionRevocation()=runBlocking {
        assumeTrue("Start the opt-in local fault proxy",System.getenv("SYMBOLS_FAULT_TEST")=="1")
        val transport=HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build()
        fun fault(body:JsonObject){assertEquals(200,transport.send(HttpRequest.newBuilder(URI("http://127.0.0.1:8081/control")).POST(HttpRequest.BodyPublishers.ofString(body.toString())).build(),HttpResponse.BodyHandlers.discarding()).statusCode())}
        fault(objectOf())
        val api=SymbolsApi("http://127.0.0.1:8081",true);val store=MemoryStore()
        val dispatcher=java.util.concurrent.Executors.newSingleThreadExecutor().asCoroutineDispatcher()
        val scope=CoroutineScope(SupervisorJob()+dispatcher)
        val repo=GameRepository(api,store,scope)
        suspend fun ready(){withTimeout(20_000){repo.state.first{it.connection==Connection.Live}}}
        suspend fun command(kind:String,body:JsonObject=objectOf(),retry:Boolean=false)=withContext(dispatcher){repo.command(kind,body,retry)}
        try {
            withContext(dispatcher){repo.authenticate("Сбой сети",false)};ready()
            val before=repo.state.value.game!!.revision
            fault(objectOf("dropAfterCommit" to true,"dropEvents" to true))
            assertNull(command("nickname",objectOf("nick" to "После сбоя")))
            val pending=repo.state.value.pending!!
            fault(objectOf("dropEvents" to true))
            assertNotNull(command("",retry=true));assertNull(repo.state.value.pending)
            val s=store.accounts.single();val actual=api.bootstrap(s.token)
            assertEquals("После сбоя",actual.profile.text("nick"));assertEquals(before+1,actual.revision.toLong())
            assertEquals("nickname",pending.kind)
            fault(objectOf("disconnect" to true));withTimeout(20_000){repo.state.first{it.game?.revision==before+1}};ready()
            withContext(dispatcher){repo.network(false)}
            val requests=api.traffic.httpRequests.get();assertNull(command("nickname",objectOf("nick" to "Не отправлять")));assertEquals(requests,api.traffic.httpRequests.get())
            withContext(dispatcher){repo.network(true)};ready()
            fault(objectOf("status" to 429));assertNull(command("nickname",objectOf("nick" to "После лимита")))
            val key=repo.state.value.pending!!.key;val count=api.traffic.httpRequests.get();assertNull(command("",retry=true));assertEquals(count,api.traffic.httpRequests.get())
            delay(1100);fault(objectOf("status" to 503));assertNull(command("",retry=true));assertEquals(key,repo.state.value.pending!!.key)
            fault(objectOf("delay" to 350));assertNotNull(command("",retry=true))
            withContext(dispatcher){repo.foreground(false)};delay(3500);assertEquals(Connection.Paused,repo.state.value.connection);assertEquals(0,api.traffic.connections.get())
            withContext(dispatcher){repo.foreground(true)};ready()
            fault(objectOf());assertNotNull(command("delete-account",objectOf("confirm" to true)))
            try { api.bootstrap(s.token);fail("Deleted account remained valid") } catch(e:ApiFailure){assertEquals(401,e.status)}
        } finally { fault(objectOf());scope.cancel();api.close();dispatcher.close() }
        Unit
    }
}
