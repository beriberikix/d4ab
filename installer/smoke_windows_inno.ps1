param(
  [switch]$WithChrome,
  [string]$ChromeExtensionId
)

$ErrorActionPreference = 'Stop'

if (-not $IsWindows) {
  throw 'This smoke script is intended for Windows only.'
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js is required to run this smoke script.'
}

function Get-InnoCompiler {
  $compiler = Get-Command ISCC.exe -ErrorAction SilentlyContinue
  if ($compiler) { return $compiler.Source }

  $compiler = Get-Command iscc -ErrorAction SilentlyContinue
  if ($compiler) { return $compiler.Source }

  return $null
}

function Assert-PathExists([string]$PathToCheck, [string]$Message) {
  if (-not (Test-Path -LiteralPath $PathToCheck)) {
    throw "$Message`nMissing: $PathToCheck"
  }
}

function Read-RegistryDefaultValue([string]$RegistryPath) {
  $item = Get-Item -Path $RegistryPath -ErrorAction Stop
  return $item.GetValue('')
}

Write-Host '[1/6] Building Windows installer assets...' -ForegroundColor Cyan
& node installer/build_installer.js --platform win32 --arch x64
if ($LASTEXITCODE -ne 0) {
  throw 'Windows installer build failed.'
}

$installerScriptPath = Join-Path $PWD 'dist/win32-x64/installer.iss'
Assert-PathExists -PathToCheck $installerScriptPath -Message 'Expected Inno Setup script was not generated.'

Write-Host '[2/6] Checking Inno compiler availability...' -ForegroundColor Cyan
$innoCompiler = Get-InnoCompiler
if ($innoCompiler) {
  Write-Host "Inno compiler found: $innoCompiler"
  & $innoCompiler $installerScriptPath
  if ($LASTEXITCODE -ne 0) {
    throw 'Inno compiler failed to build the installer.'
  }
} else {
  Write-Host 'Inno compiler not found. Verified installer.iss scaffold only.' -ForegroundColor Yellow
}

Write-Host '[3/6] Running native host installation (Windows path)...' -ForegroundColor Cyan
$selectedBrowsers = if ($WithChrome) { 'firefox,chrome' } else { 'firefox' }
$installArgs = @('installer/install_native_host.js', 'install', '--non-interactive', '--browsers', $selectedBrowsers)

if ($WithChrome) {
  if ([string]::IsNullOrWhiteSpace($ChromeExtensionId)) {
    Write-Host 'No Chrome extension ID provided. Using placeholder ID for local scaffolding.' -ForegroundColor Yellow
    $installArgs += '--allow-placeholder-ids'
  } else {
    $installArgs += @('--chrome-extension-id', $ChromeExtensionId)
  }
}

& node @installArgs
if ($LASTEXITCODE -ne 0) {
  throw 'Native host installation failed.'
}

Write-Host '[4/6] Validating installation files...' -ForegroundColor Cyan
$installDir = Join-Path $env:LOCALAPPDATA 'D4AB'
$launcherPath = Join-Path $installDir 'd4ab-bridge.cmd'
Assert-PathExists -PathToCheck $installDir -Message 'Install directory missing.'
Assert-PathExists -PathToCheck $launcherPath -Message 'Windows native launcher missing.'

Write-Host '[5/6] Validating Firefox registry + manifest...' -ForegroundColor Cyan
$firefoxRegistryPath = 'Registry::HKEY_CURRENT_USER\Software\Mozilla\NativeMessagingHosts\com.d4ab.hardware_bridge'
$firefoxManifestPath = Read-RegistryDefaultValue -RegistryPath $firefoxRegistryPath
Assert-PathExists -PathToCheck $firefoxManifestPath -Message 'Firefox manifest path from registry does not exist.'

$firefoxManifest = Get-Content -Raw -LiteralPath $firefoxManifestPath | ConvertFrom-Json
if (-not $firefoxManifest.allowed_extensions) {
  throw 'Firefox manifest is missing allowed_extensions.'
}
Assert-PathExists -PathToCheck $firefoxManifest.path -Message 'Firefox manifest binary path does not exist.'

if ($WithChrome) {
  Write-Host '[6/6] Validating Chrome registry + manifest...' -ForegroundColor Cyan
  $chromeRegistryPath = 'Registry::HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\com.d4ab.hardware_bridge'
  $chromeManifestPath = Read-RegistryDefaultValue -RegistryPath $chromeRegistryPath
  Assert-PathExists -PathToCheck $chromeManifestPath -Message 'Chrome manifest path from registry does not exist.'

  $chromeManifest = Get-Content -Raw -LiteralPath $chromeManifestPath | ConvertFrom-Json
  if (-not $chromeManifest.allowed_origins) {
    throw 'Chrome manifest is missing allowed_origins.'
  }
  Assert-PathExists -PathToCheck $chromeManifest.path -Message 'Chrome manifest binary path does not exist.'
} else {
  Write-Host '[6/6] Chrome verification skipped (run with -WithChrome to include it).' -ForegroundColor Cyan
}

Write-Host 'Windows Inno smoke test completed successfully.' -ForegroundColor Green
