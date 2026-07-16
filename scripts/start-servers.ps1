# Start auth-server (3000), app-one (3001), and app-two (3002) in background windows.
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$PidFile = Join-Path $Root ".servers.pids"
$Apps = @("auth-server", "app-one", "app-two")

& (Join-Path $PSScriptRoot "stop-servers.ps1")

$pids = @()
foreach ($app in $Apps) {
  $dir = Join-Path $Root $app
  if (-not (Test-Path (Join-Path $dir "package.json"))) {
    throw "Missing package.json in $dir"
  }

  $proc = Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList @(
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-Command",
      "Set-Location -LiteralPath '$dir'; Write-Host '[$app] npm run dev'; npm run dev"
    ) `
    -WorkingDirectory $dir `
    -WindowStyle Minimized `
    -PassThru

  $pids += $proc.Id
  Write-Host "Started $app (window PID $($proc.Id))"
}

$pids | Set-Content -Path $PidFile -Encoding UTF8
Write-Host ""
Write-Host "Servers starting:"
Write-Host "  auth-server  http://localhost:3000"
Write-Host "  app-one      http://localhost:3001"
Write-Host "  app-two      http://localhost:3002"
Write-Host "PIDs saved to .servers.pids - run scripts\stop-servers.ps1 to stop."
