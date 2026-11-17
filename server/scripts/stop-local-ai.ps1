$ErrorActionPreference = "Stop"
$serverRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$state=Join-Path $serverRoot ".local-ai/runtime.json"
if(-not(Test-Path -LiteralPath $state)){Write-Output "No runtime started by this project was found.";exit 0}
$runtime=Get-Content -Raw -LiteralPath $state | ConvertFrom-Json
$process=Get-Process -Id $runtime.pid -ErrorAction SilentlyContinue
if(-not $process){Write-Output "The project runtime has already stopped.";exit 0}
$expected=[IO.Path]::GetFullPath((Join-Path $serverRoot ".local-ai/ollama/ollama.exe"))
if([IO.Path]::GetFullPath($process.Path) -ne $expected -or [IO.Path]::GetFullPath($runtime.executable) -ne $expected){throw "The saved process is not this project's runtime. No process was stopped."}
try {
  $running=Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/ps" -TimeoutSec 3
  foreach($model in $running.models){
    $body=@{model=$model.name;keep_alive=0} | ConvertTo-Json
    Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:11434/api/generate" -ContentType "application/json" -Body $body -TimeoutSec 10 | Out-Null
  }
} catch {}
Stop-Process -Id $process.Id
Write-Output "The project's local AI runtime has stopped. Use npm run ai:start to start it again."

