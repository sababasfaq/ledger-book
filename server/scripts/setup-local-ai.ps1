param(
  [string]$Model = "qwen3:1.7b"
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
if ($Model -notmatch '^[a-zA-Z0-9._-]+(:[a-zA-Z0-9._-]+)?$' -or $Model -match 'cloud') {
  throw "Choose a local Ollama model name, such as qwen3:1.7b."
}
$serverRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$localAiRoot = Join-Path $serverRoot ".local-ai"
$ocrDirectory = Join-Path $localAiRoot "tessdata"
$runtimeDirectory = Join-Path $localAiRoot "ollama"
$modelDirectory = Join-Path $localAiRoot "models"
New-Item -ItemType Directory -Force -Path $localAiRoot,$ocrDirectory,$runtimeDirectory,$modelDirectory | Out-Null

foreach ($language in @("eng","ben")) {
  $target = Join-Path $ocrDirectory "$language.traineddata"
  if (-not (Test-Path -LiteralPath $target)) {
    Write-Output "Downloading local OCR language: $language"
    Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/$language.traineddata" -OutFile "$target.partial"
    Move-Item -LiteralPath "$target.partial" -Destination $target -Force
  }
}
$env:OLLAMA_HOST = "127.0.0.1:11434"
$env:OLLAMA_MODELS = $modelDirectory
$env:OLLAMA_NO_CLOUD = "1"
$env:OLLAMA_NUM_PARALLEL = "1"
$executable = Join-Path $runtimeDirectory "ollama.exe"
$running = $false
try {
  $version = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/version" -TimeoutSec 3
  $running = [bool]$version.version
} catch {}

if (-not $running) {
  if (-not (Test-Path -LiteralPath $executable)) {
    Write-Output "Preparing the portable Ollama runtime from its official GitHub release."
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/ollama/ollama/releases/latest"
    $asset = $release.assets | Where-Object { $_.name -eq "ollama-windows-amd64.zip" } | Select-Object -First 1
    if (-not $asset -or $asset.digest -notmatch '^sha256:([a-fA-F0-9]{64})$') { throw "The official download does not include a verifiable SHA-256 digest." }
    $expectedHash = $Matches[1]
    $archive = Join-Path $localAiRoot "ollama-windows-amd64.zip"
    Write-Output ("Downloading Ollama ({0:N2} GB). Models are downloaded separately." -f ($asset.size / 1GB))
    if (-not (Test-Path -LiteralPath $archive)) {
      Invoke-WebRequest -UseBasicParsing -Uri $asset.browser_download_url -OutFile "$archive.partial"
      Move-Item -LiteralPath "$archive.partial" -Destination $archive -Force
    }
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expectedHash) { throw "Ollama download checksum did not match. Remove the generated archive and run setup again." }
    Write-Output "Checksum verified. Extracting the local runtime."
    Expand-Archive -LiteralPath $archive -DestinationPath $runtimeDirectory -Force
    if (-not (Test-Path -LiteralPath $executable)) { throw "The Ollama executable was not found after extraction." }
  }
  Write-Output "Starting local Ollama on 127.0.0.1:11434."
  $process = Start-Process -FilePath $executable -ArgumentList "serve" -WorkingDirectory $runtimeDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $localAiRoot "ollama.log") -RedirectStandardError (Join-Path $localAiRoot "ollama-error.log")
  @{pid=$process.Id;executable=$executable;startedAt=(Get-Date).ToUniversalTime().ToString("o")} | ConvertTo-Json | Set-Content -Encoding utf8 -LiteralPath (Join-Path $localAiRoot "runtime.json")
  for ($attempt=0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 500
    try { $version=Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/version" -TimeoutSec 2; if($version.version){$running=$true;break} } catch {}
  }
  if (-not $running) { throw "Ollama did not start. Read server/.local-ai/ollama-error.log." }
}
Write-Output "Checking the local language model $Model."
$tags=Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags"
$installed=$tags.models | Where-Object { $_.name -eq $Model -and -not $_.remote_host -and -not $_.remote_model } | Select-Object -First 1
if ($installed) {
  Write-Output "The model is already installed. Starting it does not need an internet connection."
} else {
  Write-Output "Downloading the model. This is a one-time download."
  $body = @{model=$Model;stream=$false} | ConvertTo-Json
  $result=Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:11434/api/pull" -ContentType "application/json" -Body $body -TimeoutSec 3600
  if ($result.status -ne "success") { throw "The model download did not complete successfully." }
}
Write-Output "Local AI setup complete. Restart the API and open AI Assistant."
Write-Output "Bangla and English receipt images will be processed locally."

