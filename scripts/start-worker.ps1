# Starts the DeepSeek-OCR-2 worker on http://127.0.0.1:8100
$root = Split-Path $PSScriptRoot -Parent
& "$root\worker\.venv\Scripts\python.exe" "$root\worker\main.py"
