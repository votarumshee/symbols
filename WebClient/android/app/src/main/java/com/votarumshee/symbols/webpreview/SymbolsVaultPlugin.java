package com.votarumshee.symbols.webpreview;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.Arrays;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import org.json.*;
/** Atomic no-backup AES-GCM vault; migration never changes the original Kotlin vault. */
@CapacitorPlugin(name="SymbolsVault")
public class SymbolsVaultPlugin extends Plugin {
 private static final String ALIAS="symbols.capacitor.v1";
 private boolean exists(File f){return f.exists()||new File(f.getPath()+".bak").exists();}
 private File file(){return new File(getContext().getNoBackupFilesDir(),"capacitor-vault-v1");}
 private SecretKey key(String alias,boolean create)throws Exception{
  KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
  if(!store.containsAlias(alias)){
   if(!create)throw new IllegalStateException("Key unavailable");
   KeyGenerator gen=KeyGenerator.getInstance("AES","AndroidKeyStore");
   gen.init(new KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(true).build());gen.generateKey();
  }return (SecretKey)store.getKey(alias,null);
 }
 private String decrypt(File f,String alias,String aad)throws Exception{
  byte[] b=new AtomicFile(f).readFully();if(b.length<29||b.length>2000000)throw new IllegalStateException("Invalid envelope");
  if(aad.equals("capacitor-vault-v1")&&b[0]==123){JSONObject envelope=new JSONObject(new String(b,StandardCharsets.UTF_8));alias=envelope.getString("alias");byte[] iv=Base64.decode(envelope.getString("iv"),Base64.NO_WRAP),ct=Base64.decode(envelope.getString("ciphertext"),Base64.NO_WRAP);b=new byte[iv.length+ct.length];System.arraycopy(iv,0,b,0,iv.length);System.arraycopy(ct,0,b,iv.length,ct.length);}
  Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(alias,false),new GCMParameterSpec(128,Arrays.copyOfRange(b,0,12)));c.updateAAD(aad.getBytes(StandardCharsets.UTF_8));
  return new String(c.doFinal(Arrays.copyOfRange(b,12,b.length)),StandardCharsets.UTF_8);
 }
 private void save(String value)throws Exception{ String alias=ALIAS;if(exists(file())){byte[] b=new AtomicFile(file()).readFully();if(b.length>0&&b[0]==123)alias=new JSONObject(new String(b,StandardCharsets.UTF_8)).getString("alias");}save(value,alias); }
 private void save(String value,String alias)throws Exception{
  new JSONObject(value);Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key(alias,true));c.updateAAD("capacitor-vault-v1".getBytes(StandardCharsets.UTF_8));
  AtomicFile target=new AtomicFile(file());FileOutputStream out=target.startWrite();
  try{JSONObject envelope=new JSONObject().put("alias",alias).put("iv",Base64.encodeToString(c.getIV(),Base64.NO_WRAP)).put("ciphertext",Base64.encodeToString(c.doFinal(value.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP));out.write(envelope.toString().getBytes(StandardCharsets.UTF_8));target.finishWrite(out);}catch(Exception e){target.failWrite(out);throw e;}
 }
 private String legacy(String name)throws Exception{File f=new File(new File(getContext().getNoBackupFilesDir(),"vault"),name);return exists(f)?decrypt(f,"symbols.v1",name):null;}
 private static String sk(String id,String name){return id.equals("original")?name:"symbols-account:"+id+":"+name;}
 private String migrate()throws Exception{
  JSONObject values=new JSONObject();String old=legacy("accounts");
  if(old!=null){JSONObject accounts=new JSONObject(old);JSONArray sessions=accounts.getJSONArray("sessions"),registry=new JSONArray();String active="original";registry.put(new JSONObject().put("id","original"));
   for(int i=0;i<sessions.length();i++){
    JSONObject s=sessions.getJSONObject(i);String id=s.getString("id"),local=i==0&&!accounts.isNull("active")?"original":id;if(s.getString("token").isEmpty())throw new IllegalStateException("Invalid session");
    if(!local.equals("original"))registry.put(new JSONObject().put("id",local));if(id.equals(accounts.optString("active")))active=local;
    values.put(sk(local,"symbols-session"),s.toString());values.put(sk(local,"symbols-progress-v1"),new JSONObject().put("nick",s.optString("nick","Аккаунт")).toString());
    byte[] hash=MessageDigest.getInstance("SHA-256").digest(id.getBytes(StandardCharsets.UTF_8));StringBuilder hex=new StringBuilder();for(byte b:hash)hex.append(String.format("%02x",b&255));String journal=legacy("pending-"+hex);
    if(journal!=null){JSONObject p=new JSONObject(journal);if(!id.equals(p.getString("account")))throw new IllegalStateException("Invalid journal owner");p.put("at",p.getLong("createdAt"));p.put("migratedFromKotlin",true);values.put("pending:"+id,p.toString());}
   }values.put("symbols-accounts-v1",registry.toString());values.put("symbols-active-account",active);
  }values.put("symbols-native-migration-v1","complete");save(values.toString());return values.toString();
 }
 @PluginMethod public synchronized void read(PluginCall call){try{String plain=exists(file())?decrypt(file(),ALIAS,"capacitor-vault-v1"):migrate();JSObject result=new JSObject();result.put("value",plain);call.resolve(result);}catch(Exception e){call.reject("Не удалось открыть защищённое хранилище. Восстановите вход по коду; исходные данные сохранены.","VAULT_RECOVERY_REQUIRED");}}
 @PluginMethod public synchronized void write(PluginCall call){try{String v=call.getString("value");if(v==null||v.length()>2000000)throw new IllegalArgumentException();save(v);call.resolve();}catch(Exception e){call.reject("Не удалось сохранить аккаунт. Операция не отправлена.","VAULT_WRITE_FAILED");}}
 @PluginMethod public synchronized void reset(PluginCall call){if(!Boolean.TRUE.equals(call.getBoolean("confirm"))){call.reject("Требуется подтверждение восстановления");return;}try{
  if(exists(file()))new AtomicFile(file()).readFully();
  if(file().exists()&&!file().renameTo(new File(getContext().getNoBackupFilesDir(),"capacitor-vault-recovery-"+System.currentTimeMillis())))throw new IllegalStateException();
  save(new JSONObject().put("symbols-native-migration-v1","recovery-selected").toString(),"symbols.capacitor.recovery."+java.util.UUID.randomUUID());call.resolve();
 }catch(Exception e){call.reject("Не удалось начать восстановление","VAULT_RECOVERY_REQUIRED");}}
}



