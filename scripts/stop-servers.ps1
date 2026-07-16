# Stop auth-server, app-one, and app-two (and any leftover node watchers for this repo).
$ErrorActionPreference = "SilentlyContinue"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$PidFile = Join-Path $Root ".servers.pids"
$RootMatch = [regex]::Escape($Root.Path)

$stopped = [System.Collections.Generic.HashSet[int]]::new()

function Stop-PidTree([int]$ProcessId) {
  if ($ProcessId -le 0 -or -not $stopped.Add($ProcessId)) { return }
  Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" |
    ForEach-Object { Stop-PidTree $_.ProcessId }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

if (Test-Path $PidFile) {
  Get-Content $PidFile |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ -match '^\d+$' } |
    ForEach-Object { Stop-PidTree ([int]$_) }
  Remove-Item $PidFile -Force
}

Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object { $_.CommandLine -and $_.CommandLine -match $RootMatch } |
  ForEach-Object { Stop-PidTree $_.ProcessId }

foreach ($port in 3000, 3001, 3002) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-PidTree $_ }
}

Write-Host "Stopped auth-server, app-one, and app-two."
