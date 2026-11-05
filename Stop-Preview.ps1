# Stop only the local inflation.watch preview process matching this checkout.
$expectedScript = Join-Path $PSScriptRoot 'preview.py'
$matches = Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" | Where-Object {
    $_.CommandLine -and $_.CommandLine.Contains($expectedScript)
}
foreach ($previewProcess in $matches) {
    Stop-Process -Id $previewProcess.ProcessId
}
