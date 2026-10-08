param([Parameter(Mandatory=$true)][string]$Apk,[ValidateSet('local','prod','migration')][string]$Environment='local')
$ErrorActionPreference='Stop'
$apkPath=(Resolve-Path -LiteralPath $Apk).Path
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$sdk=if($env:ANDROID_HOME){$env:ANDROID_HOME}else{Join-Path $repo 'Client\.tools\sdk'}
if(-not $env:JAVA_HOME){$env:JAVA_HOME=Join-Path $repo 'Client\.tools\jdk21\jdk-21.0.12.1+1'}
$bt=Join-Path $sdk 'build-tools\36.0.0'
$cert=(& "$bt\apksigner.bat" verify --verbose --print-certs $apkPath | Out-String);if($LASTEXITCODE){throw 'APK signature invalid'}
$badging=(& "$bt\aapt.exe" dump badging $apkPath | Out-String);if($LASTEXITCODE){throw 'APK manifest unreadable'}
$manifest=(& "$bt\aapt.exe" dump xmltree $apkPath AndroidManifest.xml | Out-String)
& "$bt\zipalign.exe" -c -P 16 4 $apkPath | Out-Null;if($LASTEXITCODE){throw 'APK alignment failed'}
$certificate=[regex]::Match($cert,'certificate SHA-256 digest: ([a-f0-9]+)').Groups[1].Value
$identity=[regex]::Match($badging,"package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'")
if($identity.Groups[2].Value -ne '2'){throw 'Expected increased versionCode 2'}
if($badging -match 'application-debuggable'){throw 'QA must be nondebuggable'}
if($manifest -notmatch 'allowBackup.*0x0'){throw 'Backup must be disabled'}
$minimum=[regex]::Match($badging,"sdkVersion:'([0-9]+)'").Groups[1].Value
$target=[regex]::Match($badging,"targetSdkVersion:'([0-9]+)'").Groups[1].Value
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::OpenRead($apkPath)
function Read-ZipText([string]$name){$entry=$zip.GetEntry($name);if(-not $entry){throw "Missing packaged $name"};$reader=[IO.StreamReader]::new($entry.Open());try{$reader.ReadToEnd()}finally{$reader.Dispose()}}
try{
 if(@($zip.Entries | Where-Object {$_.FullName -match 'migration-fixture|expected-private|debug.keystore'}).Count){throw 'Test fixture or signing material found in delivery APK'}
 $config=Read-ZipText 'assets/capacitor.config.json'|ConvertFrom-Json
 $build=Read-ZipText 'assets/public/build.json'|ConvertFrom-Json
 $jsEntry=$zip.GetEntry('assets/public/client.js');$stream=$jsEntry.Open();try{$sha=[Security.Cryptography.SHA256]::Create();$assetHash=[Convert]::ToHexString($sha.ComputeHash($stream)).ToLowerInvariant()}finally{$stream.Dispose()}
 if($config.server.url -or $config.android.webContentsDebuggingEnabled -or $config.loggingBehavior -ne 'none'){throw 'Unsafe shell config'}
 if($assetHash -ne $build.assetVersion){throw 'Packaged assets differ from metadata'}
 if($Environment -eq 'prod'){
  if($build.nativeApi -ne 'https://symbols-api.votarumshee.com'){throw 'Wrong production API'}
  if($manifest -notmatch 'usesCleartextTraffic.*0x0'){throw 'Production cleartext must be disabled'}
  if($identity.Groups[1].Value -ne 'com.votarumshee.symbols.qa'){throw 'Wrong upgrade package'}
 }
 $libs=@($zip.Entries | Where-Object {$_.FullName -match '\.so$'} | ForEach-Object {$_.FullName})
 $result=[ordered]@{file=[IO.Path]::GetFileName($apkPath);sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $apkPath).Hash.ToLowerInvariant();package=$identity.Groups[1].Value;versionCode=2;versionName=$identity.Groups[3].Value;certificateSha256=$certificate;minSdk=[int]$minimum;targetSdk=[int]$target;debuggable=$false;allowBackup=$false;nativeApi=$build.nativeApi;assetVersion=$assetHash;contentVersion=$build.contentVersion;packagedAssetsMatch=$true;remoteServerUrl=$false;webDebugging=$false;logging='none';zipAlignment16K='PASS';nativeLibraries=$libs;nativeLibrary16K=if($libs.Count){'ELF inspection required'}else{'N/A: no packaged native libraries'};r8=$true;productionChanged=$false}
 $json=$result|ConvertTo-Json -Depth 8;$json|Set-Content -Encoding utf8 ($apkPath+'.json');$json
}finally{$zip.Dispose()}


