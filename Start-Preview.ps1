$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
python preview.py --port 8765
