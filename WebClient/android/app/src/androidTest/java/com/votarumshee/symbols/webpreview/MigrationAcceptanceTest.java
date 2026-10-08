package com.votarumshee.symbols.webpreview;
import android.content.Context;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;




import org.json.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.io.*;
import java.lang.reflect.Method;

/** Only runs against a disposable package and synthetic local fixtures. No secrets in assertions/logs. */

public class MigrationAcceptanceTest extends Instrumentation {
 private boolean smoke=false; @Override public void onCreate(Bundle args){super.onCreate(args);smoke="smoke".equals(args.getString("mode"));start();}
 @Override public void onStart(){Bundle result=new Bundle();try{if(smoke)nativeSmoke();else actualKotlinUpgradePreservesVaultAndUi();result.putString("stream",smoke?"NATIVE_SMOKE_PASS (registration/local kings/directed arrow/secure vault)":"MIGRATION_ACCEPTANCE_PASS (real Kotlin vault; optimized Capacitor UI)");finish(-1,result);}catch(Throwable e){result.putString("stream","MIGRATION_ACCEPTANCE_FAIL: "+e.getClass().getSimpleName()+": "+e.getMessage());finish(0,result);}}
 private static void assertTrue(String m,boolean b){if(!b)throw new AssertionError(m);}
 private static void assertFalse(String m,boolean b){assertTrue(m,!b);}
 private static void assertEquals(String m,Object a,Object b){assertTrue(m,java.util.Objects.equals(a,b));}
 private void click(MainActivity activity,String selector)throws Exception{
  waitTrue(activity,"document.querySelector('#app')?.dataset.busy!=='true'&&!!document.querySelector("+JSONObject.quote(selector)+")","control ready "+selector);
  js(activity,"document.querySelector("+JSONObject.quote(selector)+").click()");
 }
 private void nativeSmoke()throws Exception{
  Context target=getTargetContext();assertTrue("local QA package only",(target.getPackageName().equals("com.votarumshee.symbols.dev.qa")||target.getPackageName().equals("com.votarumshee.symbols.nativesmoke.qa")));
  MainActivity activity=(MainActivity)startActivitySync(new Intent(target,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
  try{
   waitTrue(activity,"!!document.querySelector('#next-dialog input')","fresh local test requires empty install");
   js(activity,"document.querySelector('#next-dialog input').value='NativeSmoke'+Date.now().toString().slice(-6);document.querySelector('#next-dialog form').requestSubmit()");
   click(activity,"[data-nav=modes]");click(activity,"[data-start=local]");
   click(activity,"[data-side='0'][data-index='65']");
   waitTrue(activity,"document.querySelector('[data-side=\"0\"][data-index=\"65\"]')?.dataset.symbol==='king'","first king");
   click(activity,"[data-side='1'][data-index='65']");
   waitTrue(activity,"document.querySelector('[data-side=\"1\"][data-index=\"65\"]')?.dataset.symbol==='king'","second king");
   click(activity,"[data-piece=arrow]");click(activity,"[data-side='0'][data-index='2']");click(activity,"[data-direction='0']");
   waitTrue(activity,"document.querySelector('[data-side=\"0\"][data-index=\"2\"]')?.dataset.symbol==='arrow'","server-confirmed directed arrow");
   JSONObject values=new JSONObject(readVault(target));JSONObject session=new JSONObject(values.getString("symbols-session"));
   assertTrue("native account persisted",session.has("token"));assertEquals("no unknown operation","null",values.optString("pending:"+session.getString("id"),"null"));
   assertEquals("no browser token","false",js(activity,"Object.values(localStorage).some(v=>v.includes('token'))"));
  }finally{runOnMainSync(activity::finish);}
 }
 private static class Capture extends com.getcapacitor.PluginCall {
  String error=null;boolean resolved=false;com.getcapacitor.JSObject data=null;
  Capture(boolean confirm){super(null,"SymbolsVault","test","test",new com.getcapacitor.JSObject().put("confirm",confirm));}
  @Override public void resolve(){resolved=true;}
  @Override public void resolve(com.getcapacitor.JSObject value){resolved=true;data=value;}
  @Override public void reject(String message,String code){error=code;}
  @Override public void reject(String message){error="REJECTED";}
 }
 private void storageEdges(Context target)throws Exception{
  File isolated=new File(target.getNoBackupFilesDir(),"edge-"+java.util.UUID.randomUUID());assertTrue("edge dir",isolated.mkdirs());
  Context context=new android.content.ContextWrapper(target){@Override public File getNoBackupFilesDir(){return isolated;}};
  SymbolsVaultPlugin plugin=new SymbolsVaultPlugin(){@Override public Context getContext(){return context;}};
  Method decrypt=SymbolsVaultPlugin.class.getDeclaredMethod("decrypt",File.class,String.class,String.class);decrypt.setAccessible(true);
  JSONObject accounts=new JSONObject((String)decrypt.invoke(plugin,new File(target.getNoBackupFilesDir(),"vault/accounts"),"symbols.v1","accounts"));accounts.put("active",JSONObject.NULL);
  java.security.KeyStore keys=java.security.KeyStore.getInstance("AndroidKeyStore");keys.load(null);
  javax.crypto.Cipher cipher=javax.crypto.Cipher.getInstance("AES/GCM/NoPadding");cipher.init(javax.crypto.Cipher.ENCRYPT_MODE,keys.getKey("symbols.v1",null));cipher.updateAAD("accounts".getBytes(StandardCharsets.UTF_8));
  File legacyDir=new File(isolated,"vault");assertTrue("edge legacy dir",legacyDir.mkdir());
  try(FileOutputStream out=new FileOutputStream(new File(legacyDir,"accounts.bak"))){out.write(cipher.getIV());out.write(cipher.doFinal(accounts.toString().getBytes(StandardCharsets.UTF_8)));}
  JSONObject values=new JSONObject(readVault(context));assertEquals("null active preserved as empty original","original",values.getString("symbols-active-account"));assertFalse("null active never signs in first session",values.has("symbols-session"));assertEquals("all accounts plus empty sentinel",3,new JSONArray(values.getString("symbols-accounts-v1")).length());
  assertTrue("atomic legacy backup restored",new File(legacyDir,"accounts").exists());
  File current=new File(isolated,"capacitor-vault-v1");assertTrue("stage interrupted atomic write",current.renameTo(new File(isolated,"capacitor-vault-v1.bak")));Capture restored=new Capture(false);plugin.read(restored);assertTrue("new vault atomic backup restored",restored.resolved&&current.exists());
  Capture reject=new Capture(false);plugin.reset(reject);assertEquals("reset requires confirmation","REJECTED",reject.error);
  Capture reset=new Capture(true);plugin.reset(reset);assertTrue("reset succeeds",reset.resolved);
  File[] archives=isolated.listFiles((dir,name)->name.startsWith("capacitor-vault-recovery-"));assertTrue("old encrypted vault archived",archives!=null&&archives.length==1);
  JSONObject old=new JSONObject((String)decrypt.invoke(plugin,archives[0],"symbols.capacitor.v1","capacitor-vault-v1"));assertEquals("archived key still decrypts",3,new JSONArray(old.getString("symbols-accounts-v1")).length());
  JSONObject envelope=new JSONObject(new String(java.nio.file.Files.readAllBytes(new File(isolated,"capacitor-vault-v1").toPath()),StandardCharsets.UTF_8));String alias=envelope.getString("alias");assertTrue("rotated recovery alias",alias.startsWith("symbols.capacitor.recovery."));keys.deleteEntry(alias);
  Capture invalid=new Capture(false);plugin.read(invalid);assertEquals("invalid key recovery contract","VAULT_RECOVERY_REQUIRED",invalid.error);
  Capture retry=new Capture(true);plugin.reset(retry);assertTrue("invalidated key can recover",retry.resolved);
 }
 private String readVault(Context context)throws Exception{
  SymbolsVaultPlugin vault=new SymbolsVaultPlugin(){@Override public Context getContext(){return context;}};
  File file=new File(context.getNoBackupFilesDir(),"capacitor-vault-v1");
  if(!file.exists()){Method migrate=SymbolsVaultPlugin.class.getDeclaredMethod("migrate");migrate.setAccessible(true);migrate.invoke(vault);}
  Method decrypt=SymbolsVaultPlugin.class.getDeclaredMethod("decrypt",File.class,String.class,String.class);decrypt.setAccessible(true);
  return (String)decrypt.invoke(vault,file,"symbols.capacitor.v1","capacitor-vault-v1");
 }
 private String js(MainActivity activity,String script)throws Exception{
  CountDownLatch latch=new CountDownLatch(1);String[] value={null};
  runOnMainSync(()->activity.getBridge().getWebView().evaluateJavascript(script,r->{value[0]=r;latch.countDown();}));
  assertTrue("WebView JS callback",latch.await(10,TimeUnit.SECONDS));return value[0];
 }
 private void waitTrue(MainActivity activity,String script,String message)throws Exception{for(int i=0;i<60;i++){if("true".equals(js(activity,script)))return;Thread.sleep(500);}throw new AssertionError(message);}
 public void actualKotlinUpgradePreservesVaultAndUi()throws Exception{
  Context target=getTargetContext();
  assertTrue("Isolated package required",target.getPackageName().equals("com.votarumshee.symbols.migrationtest.qa"));
  String fixtureText=new String(getContext().getAssets().open("migration-fixture.json").readAllBytes(),StandardCharsets.UTF_8);
  JSONObject fixture=new JSONObject(fixtureText),values=new JSONObject(readVault(target));JSONArray sessions=fixture.getJSONArray("sessions");
  assertEquals("all accounts",2,new JSONArray(values.getString("symbols-accounts-v1")).length());
  assertTrue("active account retained",values.getString("symbols-active-account").equals(fixture.getString("active")));
  for(int i=0;i<sessions.length();i++){
   JSONObject old=sessions.getJSONObject(i);String key=i==0?"symbols-session":"symbols-account:"+old.getString("id")+":symbols-session";
   JSONObject current=new JSONObject(values.getString(key));assertTrue("session ID retained",current.getString("id").equals(old.getString("id")));assertTrue("credential retained",current.getString("token").equals(old.getString("token")));
   JSONObject pending=new JSONObject(values.getString("pending:"+old.getString("id"))),expected=fixture.getJSONArray("pending").getJSONObject(i);
   assertTrue("pending idempotency key retained",pending.getString("key").equals(expected.getString("key")));assertEquals("timestamp",expected.getLong("createdAt"),pending.getLong("at"));assertEquals("command kind",expected.getString("kind"),pending.getString("kind"));
  }
  assertTrue("legacy envelope preserved",new File(target.getNoBackupFilesDir(),"vault/accounts").exists());
  assertEquals("legacy raw IV starts with JSON brace",123,(int)java.nio.file.Files.readAllBytes(new File(target.getNoBackupFilesDir(),"vault/accounts").toPath())[0]);
  String cipher=new String(java.nio.file.Files.readAllBytes(new File(target.getNoBackupFilesDir(),"capacitor-vault-v1").toPath()),StandardCharsets.ISO_8859_1);
  assertFalse("encrypted at rest",cipher.contains(sessions.getJSONObject(0).getString("token")));
  storageEdges(target);
  MainActivity activity=(MainActivity)startActivitySync(new Intent(target,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
  try{
   boolean loaded=false;for(int i=0;i<60;i++){String result=js(activity,"document.body.innerText.includes('MigrationTwo')");if("true".equals(result)){loaded=true;break;}Thread.sleep(500);}
   assertTrue("optimized WebView displays active migrated account",loaded);
   assertEquals("no WebView bearer storage","false",js(activity,"Object.values(localStorage).some(v=>v.includes('token'))"));
   js(activity,"window.__vaultMigrationCheck='waiting';Capacitor.Plugins.SymbolsVault.read().then(r=>window.__vaultMigrationCheck=JSON.parse(r.value)['symbols-native-migration-v1']).catch(()=>window.__vaultMigrationCheck='failed')");
   Thread.sleep(500);assertEquals("native bridge works","\"complete\"",js(activity,"window.__vaultMigrationCheck"));
   assertEquals("balance retained","true",js(activity,"document.body.innerText.includes('346,67')"));
   js(activity,"document.querySelector('[data-nav=inventory]').click()");
   waitTrue(activity,"document.querySelector('[data-item=teleport] .inventory-count')?.textContent==='×4'","active inventory retained");
   click(activity,"[data-nav=home]");click(activity,"[data-accounts]");
   assertEquals("both accounts shown","true",js(activity,"document.querySelector('#next-dialog').innerText.includes('MigrationOne')&&document.querySelector('#next-dialog').innerText.includes('MigrationTwo')"));
   js(activity,"document.querySelector('[data-account=original]').click()");
   waitTrue(activity,"document.querySelector('.rank-corner small')?.textContent==='MigrationOne'","switch to first migrated account");
   assertEquals("first balance retained","true",js(activity,"document.body.innerText.includes('345,67')"));
   js(activity,"document.querySelector('[data-nav=inventory]').click()");
   waitTrue(activity,"document.querySelector('[data-item=teleport] .inventory-count')?.textContent==='×3'","first inventory retained");
   click(activity,"[data-nav=home]");click(activity,"[data-accounts]");js(activity,"document.querySelectorAll('[data-account]')[1].click()");
   waitTrue(activity,"document.querySelector('.rank-corner small')?.textContent==='MigrationTwo'","switch back to active account");
   JSONObject after=new JSONObject(readVault(target));assertTrue("unknown action not silently dropped",after.has("pending:"+fixture.getString("active"))&&!after.getString("pending:"+fixture.getString("active")).equals("null"));
  }finally{runOnMainSync(activity::finish);}
 }
}








