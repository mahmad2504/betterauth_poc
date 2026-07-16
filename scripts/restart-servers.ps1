# Restart auth-server, app-one, and app-two.
$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "start-servers.ps1")
