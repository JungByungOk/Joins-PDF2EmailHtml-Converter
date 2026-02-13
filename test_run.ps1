Get-Process -Name 'node','electron' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
$proc = Start-Process -FilePath "C:\Github\pdf2email\test_start.bat" -NoNewWindow -PassThru -RedirectStandardOutput "C:\Github\pdf2email\test_start_out.txt" -RedirectStandardError "C:\Github\pdf2email\test_start_err.txt"
$proc.WaitForExit(60000)
if (-not $proc.HasExited) { $proc.Kill() }
Write-Output "=== STDOUT ==="
Get-Content "C:\Github\pdf2email\test_start_out.txt" -ErrorAction SilentlyContinue | Select-Object -Last 10
Write-Output "=== STDERR ==="
Get-Content "C:\Github\pdf2email\test_start_err.txt" -ErrorAction SilentlyContinue
Write-Output "=== DONE ==="
