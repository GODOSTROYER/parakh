# Starts worker + Next.js app (production build) + Cloudflare quick tunnel (live URL).
$root = Split-Path $PSScriptRoot -Parent

Start-Process powershell -ArgumentList "-NoExit", "-Command", "& '$root\worker\.venv\Scripts\python.exe' '$root\worker\main.py'"

Write-Host "Building app..."
Set-Location $root
npm run build
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root'; npm run start"

if (-not (Test-Path "$root\cloudflared.exe")) {
  Write-Host "Downloading cloudflared..."
  Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile "$root\cloudflared.exe"
}
Write-Host "Starting tunnel - the https://*.trycloudflare.com URL below is your live URL"
& "$root\cloudflared.exe" tunnel --url http://localhost:3000
