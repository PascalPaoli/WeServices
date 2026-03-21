Write-Host "[*] Compiling WeServices with Bun and Vite..."
bun run build:canary

$binFolder = "build\dev-win-x64\WeServices-dev\bin"

# If the folder has the old generated name, fallback to it
if (-not (Test-Path $binFolder)) {
    $binFolder = "build\dev-win-x64\vanilla-vite-dev\bin"
}

if (Test-Path "$binFolder\launcher.exe") {
    Write-Host "[*] Renaming launcher.exe to WeServices.exe..."
    Rename-Item "$binFolder\launcher.exe" "WeServices.exe"
}

Write-Host "[*] Patching missing views onto the bundled App..."
$viewsDest = "$binFolder\..\Resources\app\views\mainview"
if (-not (Test-Path $viewsDest)) { New-Item -ItemType Directory -Force -Path $viewsDest | Out-Null }

Copy-Item -Path "dist\index.html" -Destination "$viewsDest\index.html" -Force
if (Test-Path "dist\assets") {
    Copy-Item -Path "dist\assets" -Destination "$viewsDest\" -Recurse -Force
}

Write-Host "[*] Creating a desktop-ready Shortcut..."
$WshShell = New-Object -comObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("WeServices.lnk")
$Shortcut.TargetPath = "$PWD\$binFolder\WeServices.exe"
$Shortcut.WorkingDirectory = "$PWD\$binFolder"
$Shortcut.Save()

Write-Host "[+] Done! You can now launch WeServices using the shortcut in this folder."
