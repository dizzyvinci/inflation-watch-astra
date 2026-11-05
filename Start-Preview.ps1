$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
python (Join-Path $PSScriptRoot 'preview.py') --port 8765
