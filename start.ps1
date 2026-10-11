Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
node .\start.mjs @args
if ($LASTEXITCODE -ne 0) { throw 'Relight Desk exited with an error.' }
