# 🚀 WeServices (aka "The AI Dev's Best Friend")

<div align="center">
  <img src="./assets/interface.png" alt="Full Interface Overview" width="800"/>
</div>

**WeServices** is a blazing-fast, lightweight desktop application built with [Bun](https://bun.sh) to manage all your local development servers, APIs, and background tasks in one beautiful interface. 

## 🤔 Why does this exist? (The AI Dev Problem)

If you are a developer—*especially* if you code alongside AI assistants like Cursor, Copilot, or Claude—you know the pain:
1. You have a frontend running (`npm run dev`).
2. You have a backend API running (`python main.py`).
3. You have an MCP server running for your AI.
4. You have a database container or a local proxy running.

Suddenly, you have 5 different terminal windows open. One of them crashes. Another one gets stuck and holds port `3000` hostage (the dreaded `EADDRINUSE` zombie 🧟‍♂️). You hunt down process IDs, you restart terminals, you lose your flow.

**Even worse:** Every time you reboot, you have to remember *"Wait, what was the exact command to start the backend again? What directory was the MCP server in?"*

**WeServices** fixes this. It acts as your **Launch Command Vault** and your Control Panel. Never dig through bash history or READMEs again to find out how to start a project.

## 🎬 See it in Action

https://github.com/user-attachments/assets/dac219cd-6caf-4ce9-ba70-59e598d0462f


## ✨ Features

- 🧠 **The Launch Vault**: It permanently stores all your exact launch commands, directories, and target ports. No more forgetting how to boot up a specific service.
- 🟢 **One-Click Start/Stop**: Start or stop individual services, or hit the **Global Play** button to boot up your entire stack at once.
- 🧟‍♂️ **Force Kill Zombies (Plumber)**: Did a service crash but keep its port open? Click the ⚡ (Zap) icon to magically find and ruthlessly murder the zombie process holding your port hostage.
- 📝 **Inline Editing**: Double-click any locked service to instantly open the inline editor. Change the starting directory, the boot command, or the target port on the fly.
  
  <img src="./assets/editor.png" alt="Inline Editor Details" width="500"/>

- 🔄 **Drag & Drop Reordering**: Grab a service and drag it to organize your stack logically (e.g., Database first, Backend second, Frontend last). 
- 📊 **Real-time Terminal Output**: Click on any service to view its live terminal output safely sandboxed. Automatically strips ugly ANSI codes for clean reading.
- 🛡️ **Lock System**: Lock (🔒) critical services so you don't accidentally edit or delete them while working.

## 🛠️ Installation & Quick Start

Because this app is built on **Bun**, it is incredibly fast and uses virtually zero memory compared to typical Electron apps.

### 1. Prerequisites
You need to have [Bun](https://bun.sh/) installed on your machine.
```bash
# Windows (Powershell)
powershell -c "irm bun.sh/install.ps1 | iex"

# macOS/Linux
curl -fsSL https://bun.sh/install | bash
```

### 2. Clone and Install
```bash
git clone https://github.com/YOUR_USERNAME/services-manager.git
cd services-manager
bun install
```

### 3. Run the App
```bash
bun run dev
```

### 4. Build for Release
To build a standalone executable that you can share or put on your desktop:
```bash
bun run build:canary
```

---
*Built with ❤️ for developers who just want to code, not manage terminals.*
