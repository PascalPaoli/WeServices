Write-Host "🔧 Compiling WeServices with Electrobun..."
bun run build:canary

$binFolder = "build\dev-win-x64\WeServices-dev\bin"

# Parfois le dossier s'appelle encore vanilla-vite-dev si le config n'est pas modifié
if (!(Test-Path $binFolder)) {
    $binFolder = "build\dev-win-x64\vanilla-vite-dev\bin"
}

if (Test-Path "$binFolder\launcher.exe") {
    Write-Host "📦 Renaming launcher.exe to WeServices.exe..."
    Rename-Item "$binFolder\launcher.exe" "WeServices.exe"
}

Write-Host "🔗 Creating a desktop-ready Shortcut..."
$WshShell = New-Object -comObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("WeServices.lnk")
$Shortcut.TargetPath = "$PWD\$binFolder\WeServices.exe"
$Shortcut.WorkingDirectory = "$PWD\$binFolder"
$Shortcut.Save()

Write-Host "✅ Done! You can now launch WeServices using the shortcut in this folder."
