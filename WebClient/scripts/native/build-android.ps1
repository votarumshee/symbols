param([ValidateSet('LocalQa','ProdQa','OwnerRelease')][string]$Mode='LocalQa')
$ErrorActionPreference='Stop'
$clientRoot=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$repoRoot=(Resolve-Path (Join-Path $clientRoot '..')).Path
if(-not $env:JAVA_HOME){$env:JAVA_HOME=Join-Path $repoRoot 'Client\.tools\jdk21\jdk-21.0.12.1+1'}
if(-not $env:ANDROID_HOME){$env:ANDROID_HOME=Join-Path $repoRoot 'Client\.tools\sdk'}
if(-not $env:GRADLE_USER_HOME){$env:GRADLE_USER_HOME=Join-Path $repoRoot 'Client\.tools\gradle'}
if(-not $env:ANDROID_USER_HOME){$env:ANDROID_USER_HOME=Join-Path $repoRoot 'Client\.tools\android-user'}
if(-not $env:JAVA_TOOL_OPTIONS){$env:JAVA_TOOL_OPTIONS='-Djdk.net.unixdomain.tmpdir='+((Join-Path $repoRoot 'Client\.tools\tmp') -replace '\\','/')}
if($Mode -eq 'OwnerRelease'){
 foreach($name in 'SYMBOLS_KEYSTORE','SYMBOLS_STORE_PASSWORD','SYMBOLS_KEY_ALIAS','SYMBOLS_KEY_PASSWORD'){
  if(-not [Environment]::GetEnvironmentVariable($name)){throw "Owner signing requires $name; no QA key substitution"}
 }
}
$env:SYMBOLS_NATIVE_API=if($Mode -eq 'LocalQa'){'http://10.0.2.2:8080'}else{'https://symbols-api.votarumshee.com'}
Push-Location $clientRoot
try{
 & npm.cmd run build;if($LASTEXITCODE){throw 'Web build failed'}
 & npx.cmd cap sync android;if($LASTEXITCODE){throw 'Capacitor sync failed'}
 [string[]]$tasks=if($Mode -eq 'LocalQa'){@(':app:assembleLocalQa')}elseif($Mode -eq 'ProdQa'){@(':app:assembleProdQa')}else{@(':app:assembleProdRelease',':app:bundleProdRelease')}
 & .\android\gradlew.bat -p android @tasks --console=plain;if($LASTEXITCODE){throw 'Native build failed'}
 $folder=Join-Path $clientRoot 'artifacts\transition';New-Item -ItemType Directory -Force $folder|Out-Null
 if($Mode -ne 'OwnerRelease'){
  $flavor=if($Mode -eq 'LocalQa'){'local'}else{'prod'}
  $version=[regex]::Match((Get-Content 'android/app/build.gradle' -Raw),"versionName '([^']+)'").Groups[1].Value
  if(-not $version){throw 'Missing Android version name'}
  $destination=Join-Path $folder "symbols-web-$flavor-qa-$version.apk"
  Copy-Item -LiteralPath "android\app\build\outputs\apk\$flavor\qa\app-$flavor-qa.apk" -Destination $destination
  & "$PSScriptRoot\verify-apk.ps1" -Apk $destination -Environment $flavor
 }
}finally{Pop-Location}
