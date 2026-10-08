# Native transition and recovery

Android QA uses package `com.votarumshee.symbols.qa`, versionCode **2**, versionName **1.1.0**. This is an update to the delivered Kotlin QA versionCode 1, signed by the same QA certificate (`5a45093829a45a385855f8e53ae806b56f13a30c62db661c1292ef780fc457f0`). This QA key is not an owner/store release key. The fallback Kotlin APK is retained; Android does not support ordinary downgrade installation from version 2 to version 1. Return to Kotlin requires a compatible higher-version rebuild signed by the same key, and a recovery code for accounts created only after the web transition. Never uninstall a real player's app as an update procedure.

## Storage and migration

`SymbolsVaultPlugin.java` decrypts the real Kotlin `noBackupFilesDir/vault/accounts` and `pending-<SHA256(accountId)>` envelopes using the existing `symbols.v1` AndroidKeyStore key, AES-GCM and the original file-name AAD. It reads all sessions and pending operations before committing the new vault. The active session is retained. A null active account stays signed out through an empty original slot. IDs, bearer credentials and idempotency keys remain unchanged. Profiles, balances and inventory are fetched from API v3, never imported as client-authoritative game data.

The new vault is an atomic encrypted file in `noBackupFilesDir`. Its authenticated encryption uses a distinct non-exportable AndroidKeyStore key. The original Kotlin vault and key are preserved. Its migration marker is in the committed new vault, so normal restarts do not repeat migration. The IV-leading-`{` case is tested with an actual Kotlin-produced envelope; legacy binary IVs are never parsed as JSON.

An unavailable/invalidated key returns `VAULT_RECOVERY_REQUIRED`. The UI offers explicit recovery. Reset requires confirmation, archives the old ciphertext and creates a separate new key; it does not delete the archived key. An already invalidated key cannot decrypt old data, so the user still needs a previously saved server recovery code. Android backup/cloud backup/device transfer and Capacitor logging/debugging are disabled. This protects storage at rest, not a compromised JavaScript runtime.

## Builds

From the repository root, PowerShell 7:

```powershell
.\WebClient\scripts\native\build-android.ps1 -Mode LocalQa
.\WebClient\scripts\native\build-android.ps1 -Mode ProdQa
```

The first uses `http://10.0.2.2:8080` and `.dev.qa`; the second uses the production HTTPS API and `.qa`. Both are optimized R8/shrunk/nondebuggable builds. The production Gradle preflight rejects remote `server.url`, debugging, cleartext configuration or a mismatching bundled endpoint. The shell loads packaged resources only. `build.json` records API/content versions and the actual SHA-256 of `client.js`; verification recomputes it from the APK.

`-Mode OwnerRelease` builds APK/AAB only when `SYMBOLS_KEYSTORE`, `SYMBOLS_STORE_PASSWORD`, `SYMBOLS_KEY_ALIAS`, `SYMBOLS_KEY_PASSWORD` are supplied. These variables are never printed. No owner key was created and no store publication was performed. Do not use the QA certificate for store delivery.

## Repeating real migration acceptance

The fixture is a build of the full Kotlin `Client/`, augmented by an isolated test activity using the **actual unmodified SecureStore.kt**. `migration-fixture.init.gradle` changes only the fixture package to `com.votarumshee.symbols.migrationtest.qa`, adds synthetic local assets and the fixture Activity. It uses the same QA signing key and versionCode 1. The seed activity refuses to overwrite existing accounts. Generated fixture credentials are local-only, ignored by Git and absent from delivery APKs.

```powershell
node WebClient/scripts/native/prepare-migration.mjs
# Use the SDK/JDK/Gradle/ANDROID_USER_HOME environment from build-android.ps1.
cd Client
.\gradlew.bat -I ..\WebClient\scripts\native\migration-fixture.init.gradle :app:assembleDevQa
cd ..
adb -s emulator-5556 install Client/app/build/outputs/apk/dev/qa/app-dev-qa.apk
adb -s emulator-5556 shell am start -W -n com.votarumshee.symbols.migrationtest.qa/com.votarumshee.symbols.MigrationSeedActivity
# Wait for KOTLIN_SECURESTORE_SEEDED 2 IV_BRACE in UI.
cd WebClient
$env:SYMBOLS_NATIVE_API='http://10.0.2.2:8080'
npm.cmd run build
npx.cmd cap sync android
.\android\gradlew.bat -p android :app:assembleMigrationQa :app:assembleMigrationQaAndroidTest
cd ..
adb -s emulator-5556 install -r WebClient/android/app/build/outputs/apk/migration/qa/app-migration-qa.apk
adb -s emulator-5556 install -r WebClient/android/app/build/outputs/apk/androidTest/migration/qa/app-migration-qa-androidTest.apk
adb -s emulator-5556 shell am instrument -w com.votarumshee.symbols.migrationtest.qa.test/com.votarumshee.symbols.webpreview.MigrationAcceptanceTest
node WebClient/scripts/native/verify-migration-db.mjs
```

The expected marker is `MIGRATION_ACCEPTANCE_PASS`. Repeat on a fresh disposable emulator, or remove **only this explicitly synthetic package** from a previous run before seeding. Never clear/uninstall `.qa` or `.dev.qa` as part of migration testing. The independent native smoke uses a fresh `.dev.qa` installation in CI, `assembleLocalQaAndroidTest`, and runner argument `-e mode smoke`. It expects `NATIVE_SMOKE_PASS` after real UI registration, local game, two kings and a directed arrow. Locally `SYMBOLS_LOCAL_SUFFIX=.nativesmoke` isolates that smoke from an already installed development app.

## iOS: source prepared, execution UNVERIFIED

The Capacitor 8.5.3 SPM Xcode project is in `ios/App`. `SymbolsVaultPlugin` in `AppDelegate.swift` stores the same JSON contract using Security/Keychain, `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`, synchronization disabled. `SymbolsBridgeViewController` registers it; both the storyboard and scene delegate instantiate that subclass. Recovery archives the old Keychain item before creating an empty item. No Preferences/UserDefaults token fallback exists. Native lifecycle uses the shared Capacitor App adapter. Symbols icon/splash are rendered from the existing vector.

On macOS/Xcode after `npm ci`:

```sh
SYMBOLS_NATIVE_API=https://symbols-api.votarumshee.com npm run build
npx cap sync ios
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

Then test WKWebView, Keychain relaunch/recovery, lifecycle, keyboard/safe area, API calls and game actions on simulator and signed device. Windows cannot execute these checks. Apple signing/team provisioning, macOS build and actual iOS/device acceptance remain external gates. Android API26 in the available AOSP image has no WebView provider (`Current WebView package is null`); minSdk26 is not evidence of runtime acceptance. Android8 with a supported WebView (minimum103) and a physical Android device remain external gates.

## Native acceptance evidence (2026-10-08)

- **PASS Android36/R8:** actual full Kotlin fixture `install -r`, two accounts, active selection, credentials and pending keys/timestamps preserved; both inventories/balances verified in UI and PostgreSQL, no pending command replay.
- **PASS storage edges:** real Kotlin envelope with IV byte `0x7b`; null active remains signed out; old and new AtomicFile `.bak` recovery; reset requires confirmation, retains old decrypting key, and invalidated-key recovery succeeds.
- **PASS native functional smoke:** fresh synthetic registration, local game, two kings, directed arrow, native secure vault, no bearer in browser storage.
- Raw markers: `artifacts/transition/migration-instrumentation.txt`, `native-smoke-instrumentation.txt`; DB proof `migration-database.json`; native matrix `native-acceptance.json`; per-APK verifier JSON and `release-manifest.json` record the final binaries.
- iOS, real Android phone, API26 with a usable WebView and owner-signed store release remain the external gates above. CI files are prepared; no claim is made that GitHub/macOS jobs have run.
