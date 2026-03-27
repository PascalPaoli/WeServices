[Setup]
; Informations générales
AppName=WeServices
AppVersion=0.1.21
AppPublisher=PascalPaoli
AppPublisherURL=https://github.com/PascalPaoli/WeServices
DefaultDirName={autopf}\WeServices
DefaultGroupName=WeServices
SetupIconFile=.\assets\favicon\favicon.ico

; Auto-installer: Disable all wizard pages to skip to progress
DisableWelcomePage=yes
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
DisableFinishedPage=yes

OutputDir=.\install
OutputBaseFilename=WeServices_Setup_v0.1.21
LicenseFile=.\LICENSE
Compression=lzma2/ultra64
SolidCompression=yes
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
UninstallDisplayIcon={app}\bin\launcher.exe

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Files]
; Copie TOUT le contenu du dossier généré par Electrobun vers le dossier d'installation ({app})
Source: ".\build\dev-win-x64\vanilla-vite-dev\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
; Raccourci sur le Bureau
Name: "{autodesktop}\WeServices"; Filename: "{app}\bin\launcher.exe"; WorkingDir: "{app}\bin"

; Raccourci dans le Menu Démarrer
Name: "{group}\WeServices"; Filename: "{app}\bin\launcher.exe"; WorkingDir: "{app}\bin"
Name: "{group}\Désinstaller WeServices"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\bin\launcher.exe"; WorkingDir: "{app}\bin"; Flags: nowait
