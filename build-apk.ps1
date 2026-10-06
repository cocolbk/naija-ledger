# Reusable signed-APK builder for Naija Ledger (Windows, no admin required).
# Uses the EXISTING release keystore at %LOCALAPPDATA%\naija-ledger\android.keystore.
# The keystore password is read from keystore-pass.txt (same folder) and never embedded here.
# Output: dist\naija-ledger-<version>.apk + SHA-256 checksum.
$ErrorActionPreference = "Stop"

$env:JAVA_HOME = "C:\Users\HomePC\.tools\jd17\jdk-17.0.20.1+1"
$env:ANDROID_HOME = "C:\Users\HomePC\.tools\android-sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$SdkBuildTools = "$env:ANDROID_HOME\build-tools\36.1.0"
$TwaDir = "C:\Users\HomePC\AppData\Local\nl-twa"
$ProjectRoot = "C:\Users\HomePC\Desktop\naija ledger"
$PassFile = "C:\Users\HomePC\AppData\Local\naija-ledger\keystore-pass.txt"
$Keystore = "C:\Users\HomePC\AppData\Local\naija-ledger\android.keystore"

foreach ($p in @("$env:JAVA_HOME\bin\java.exe", "$SdkBuildTools\apksigner.bat", $Keystore, $PassFile)) {
  if (-not (Test-Path $p)) { throw "Missing required file: $p" }
}
$pw = (Get-Content $PassFile -Raw).Trim()
$env:BUBBLEWRAP_KEYSTORE_PASSWORD = $pw
$env:BUBBLEWRAP_KEY_PASSWORD = $pw

Push-Location $TwaDir
try {
  Write-Output "==> Bubblewrap update..."
  npx.cmd -y @bubblewrap/cli update --manifest "$TwaDir\twa-manifest.json" --skipVersionUpgrade
  if ($LASTEXITCODE -ne 0) { throw "bubblewrap update failed" }
  Write-Output "==> Bubblewrap build (Gradle download on first run)..."
  npx.cmd -y @bubblewrap/cli build --manifest "$TwaDir\twa-manifest.json"
  if ($LASTEXITCODE -ne 0) { throw "bubblewrap build failed" }
} finally {
  Pop-Location
}

$built = Join-Path $TwaDir "app-release-signed.apk"
if (-not (Test-Path $built)) { throw "Build finished but APK not found at $built" }

$manifest = Get-Content "$TwaDir\twa-manifest.json" -Raw | ConvertFrom-Json
$distDir = Join-Path $ProjectRoot "dist"
New-Item -ItemType Directory -Force -Path $distDir | Out-Null
$outApk = Join-Path $distDir ("naija-ledger-" + $manifest.appVersion + ".apk")
Copy-Item $built $outApk -Force

Write-Output "==> Verifying signature..."
& "$SdkBuildTools\apksigner.bat" verify --print-certs $outApk
if ($LASTEXITCODE -ne 0) { throw "apksigner verification FAILED" }

Write-Output "==> Package info..."
& "$SdkBuildTools\aapt.exe" dump badging $outApk | Select-String -Pattern "^package:|^launchable-activity:|^sdkVersion:|^targetSdkVersion:"

$hash = (Get-FileHash $outApk -Algorithm SHA256).Hash.ToLower()
$size = (Get-Item $outApk).Length
Write-Output "==> DONE"
Write-Output "APK     : $outApk"
Write-Output "Size    : $size bytes"
Write-Output "SHA-256 : $hash"
