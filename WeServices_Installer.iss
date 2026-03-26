[Setup]
; Informations générales sur l'application
AppName=WeServices
AppVersion=0.1.21
AppPublisher=PascalPaoli
AppPublisherURL=https://github.com/PascalPaoli/WeServices
DefaultDirName={autopf}\WeServices
DefaultGroupName=WeServices

; Configuration de l'exécutable de sortie (l'installateur final)
OutputDir=.\install
OutputBaseFilename=WeServices_Setup_v0.1.21

; Fichier de Licence (Sera affiché à l'utilisateur lors de l'installation)
LicenseFile=.\LICENSE

; Compression maximale pour réduire la taille du .exe
Compression=lzma2/ultra64
SolidCompression=yes
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64

; L'icône du désinstallateur dans le Panneau de Configuration
UninstallDisplayIcon={app}\bin\launcher.exe

; Empêche l'assistant de poser trop de questions inutiles (documentation, etc.)
DisableProgramGroupPage=yes
DisableWelcomePage=no

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
; Option pour lancer WeServices immédiatement à la fin de l'installation
Filename: "{app}\bin\launcher.exe"; WorkingDir: "{app}\bin"; Description: "Lancer WeServices"; Flags: nowait postinstall skipifsilent
