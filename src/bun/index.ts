import { BrowserWindow, Updater, BrowserView, Utils } from "electrobun/bun";
import type { RPCSchema } from "electrobun/bun";
import { spawn, type Subprocess } from "bun";
import { join } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { execSync } from "node:child_process";

const DEV_SERVER_PORT = 5273;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

export type ServiceStatus = "running" | "stopped" | "error" | "starting" | "stopping";

export interface ServiceDef {
    id: string;
    name: string;
    dir: string;
    cmd: string;
    ports?: string;
}

export type AppRPC = {
    bun: RPCSchema<{
        requests: {
            getServices: { params: void, response: { services: ServiceDef[], statuses: Record<string, ServiceStatus> } };
            startService: { params: { id: string }, response: { success: boolean, error?: string } };
            stopService: { params: { id: string }, response: { success: boolean, error?: string } };
            restartService: { params: { id: string }, response: { success: boolean, error?: string } };
            addService: { params: { name: string, dir: string, cmd: string, ports?: string }, response: { id: string, success: boolean, error?: string } };
            updateService: { params: { id: string, name: string, dir: string, cmd: string, ports?: string }, response: { success: boolean, error?: string } };
            reorderServices: { params: { services: ServiceDef[] }, response: { success: boolean } };
            removeService: { params: { id: string }, response: { success: boolean, error?: string } };
            shutdown: { params: void, response: void };
            forceCleanup: { params: void, response: void };
            freePort: { params: { ports: string }, response: { success: boolean, error?: string } };
            getSettings: { params: void, response: { settings: any } };
            updateSettings: { params: { settings: any }, response: { success: boolean } };
        };
        messages: {};
    }>;
    webview: RPCSchema<{
        requests: {};
        messages: {
            serviceStatusChange: { id: string, status: ServiceStatus };
            serviceLog: { id: string, text: string, type: 'out' | 'err' };
        };
    }>;
};

// ... jump to handlers inside defined setup
// Assuming I need to replace from export interface down to freePort handler... Wait, I will use multiple ReplaceChunks.

const CONFIG_PATH = "F:\\AzWorkspace\\services_config.json";
const SETTINGS_PATH = "F:\\AzWorkspace\\weservices_settings.json";

interface AppSettings {
    autoStartServices: boolean;
    autoStartApp: boolean;
}

function loadSettings(): AppSettings {
    if (existsSync(SETTINGS_PATH)) {
        try {
            return JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"));
        } catch (e) {}
    }
    const defaultSettings: AppSettings = { autoStartServices: false, autoStartApp: false };
    saveSettings(defaultSettings);
    return defaultSettings;
}

function updateRegistryAutoStart(enable: boolean) {
    const regKey = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
    const appName = "WeServices";
    
    let exePath = process.execPath;
    // In Electrobun, process.execPath is the embedded bun.exe, but we must run launcher.exe
    const launcherPath = exePath.replace(/bun\.exe$/i, "launcher.exe");
    if (existsSync(launcherPath)) {
        exePath = launcherPath;
    }
    
    
    try {
        if (enable) {
            execSync(`reg add "${regKey}" /v "${appName}" /t REG_SZ /d "\\"${exePath}\\"" /f`, { stdio: 'ignore' });
        } else {
            execSync(`reg delete "${regKey}" /v "${appName}" /f`, { stdio: 'ignore' });
        }
    } catch(e) {
        console.error("Failed to update registry", e);
    }
}

function saveSettings(settings: AppSettings) {
    try {
        writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
        updateRegistryAutoStart(settings.autoStartApp);
    } catch (e) {}
}

let appSettings = loadSettings();

function loadServices(): ServiceDef[] {
    if (existsSync(CONFIG_PATH)) {
        try {
            return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
        } catch (e) {
            console.error("Failed to load services", e);
        }
    }
    const defaultServices: ServiceDef[] = [
        { id: "kokoro", name: "Kokoro TTS API", dir: "F:\\AzWorkspace\\kokoro_api", cmd: "powershell -noProfile -ExecutionPolicy Bypass -Command .\\run.ps1" },
        { id: "vscode", name: "VSCode MCP", dir: "F:\\llm_mcp\\vscode-mcp", cmd: "node F:\\llm_mcp\\vscode-mcp\\node_modules\\vscode-mcp-server\\build\\cli.js" },
        { id: "weai", name: "WeAi serveur", dir: "F:\\AzWorkspace\\AzClaw", cmd: "npm start dev" },
        { id: "murmure2", name: "Murmure2", dir: "F:\\AzWorkspace\\murmure2", cmd: "pnpm tauri dev" }
    ];
    saveServices(defaultServices);
    return defaultServices;
}

function saveServices(services: ServiceDef[]) {
    try {
        writeFileSync(CONFIG_PATH, JSON.stringify(services, null, 2));
    } catch (e) {
        console.error("Failed to save services", e);
    }
}

let services = loadServices();
const processes: Record<string, Subprocess> = {};
const statuses: Record<string, ServiceStatus> = {};

services.forEach(s => statuses[s.id] = "stopped");

if (appSettings.autoStartServices) {
    setTimeout(() => {
        services.forEach(s => startService(s.id));
    }, 1000);
}

let mainWindow: BrowserWindow | null = null;

function broadcastStatus(id: string, status: ServiceStatus) {
    statuses[id] = status;
    if (mainWindow && mainWindow.webview.rpc) {
        (mainWindow.webview.rpc as any).send?.serviceStatusChange({ id, status });
    }
}

function sendLog(id: string, text: string, type: 'out' | 'err' = 'out') {
    if (mainWindow && mainWindow.webview.rpc) {
        (mainWindow.webview.rpc as any).send?.serviceLog({ id, text, type });
    }
}

function attachWatchdog(childPid: number) {
    const parentPid = process.pid;
    const psScript = `$parent = ${parentPid}; $child = ${childPid}; while ((Get-Process -Id $parent -ErrorAction SilentlyContinue) -and (Get-Process -Id $child -ErrorAction SilentlyContinue)) { Start-Sleep -Seconds 2 }; if (-not (Get-Process -Id $parent -ErrorAction SilentlyContinue)) { taskkill /T /F /PID $child 2>$null }`;
    spawn({ 
        cmd: ["powershell", "-WindowStyle", "Hidden", "-Command", psScript],
        stdin: "ignore", stdout: "ignore", stderr: "ignore"
    });
}

async function startService(id: string) {
    if (processes[id]) {
        return { success: false, error: "Already running" };
    }
    const service = services.find(s => s.id === id);
    if (!service) return { success: false, error: "Not found: " + id };

    try {
        const cmdArgs = service.cmd.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(arg => arg.replace(/(^"|"$)/g, '')) || [];
        
        const proc = spawn({
            cmd: cmdArgs,
            cwd: service.dir,
            stdin: "pipe",
            stdout: "pipe",
            stderr: "pipe",
        });

        attachWatchdog(proc.pid);

        processes[id] = proc;
        broadcastStatus(id, "starting");
        sendLog(id, `--- Started: ${service.name} ---\n`, 'out');
        
        setTimeout(() => {
            if (statuses[id] === "starting") {
                broadcastStatus(id, "running");
            }
        }, 1500);

        const readStream = async (stream: any, type: 'out' | 'err') => {
            try {
                const reader = stream.getReader();
                const decoder = new TextDecoder();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const text = decoder.decode(value);
                    sendLog(id, text, type);
                }
            } catch (err) {}
        };

        if (proc.stdout) readStream(proc.stdout, 'out');
        if (proc.stderr) readStream(proc.stderr, 'err');

        proc.exited.then(code => {
            // If the process was intentionally killed by stopService, it was removed from processes[id]
            if (processes[id] !== proc) return; 

            sendLog(id, `\n--- Exited with code ${code} ---\n`, 'out');
            delete processes[id];
            broadcastStatus(id, code === 0 ? "stopped" : "error");
        });

        return { success: true };
    } catch (err: any) {
        broadcastStatus(id, "error");
        sendLog(id, `\nFailed to start: ${err.message}\n`, 'err');
        return { success: false, error: err.message };
    }
}

async function stopService(id: string) {
    const proc = processes[id];
    if (proc) {
        broadcastStatus(id, "stopping");
        try {
            spawn({ cmd: ["taskkill", "/T", "/F", "/PID", proc.pid.toString()] });
        } catch (e) {
            proc.kill(); // fallback
        }
        delete processes[id];
        setTimeout(() => {
            broadcastStatus(id, "stopped");
            sendLog(id, `\n--- Stopped by user ---\n`, 'out');
        }, 300);
        return { success: true };
    }
    return { success: false, error: "Not running" };
}

const rpc = BrowserView.defineRPC<AppRPC>({
    maxRequestTime: 5000,
    handlers: {
        requests: {
            getServices: () => {
                return { services, statuses };
            },
            getSettings: () => {
                return { settings: appSettings };
            },
            updateSettings: ({ settings }) => {
                appSettings = settings;
                saveSettings(appSettings);
                return { success: true };
            },
            startService: async ({ id }) => await startService(id),
            stopService: async ({ id }) => await stopService(id),
            restartService: async ({ id }) => {
                await stopService(id);
                // slight delay
                await new Promise(r => setTimeout(r, 500));
                return await startService(id);
            },
            addService: ({ name, dir, cmd, ports }) => {
                const id = "service_" + Date.now();
                services.push({ id, name, dir, cmd, ports });
                statuses[id] = "stopped";
                saveServices(services);
                return { id, success: true };
            },
            updateService: ({ id, name, dir, cmd, ports }) => {
                const service = services.find(s => s.id === id);
                if (!service) return { success: false, error: "Not found" };
                service.name = name;
                service.dir = dir;
                service.cmd = cmd;
                service.ports = ports;
                saveServices(services);
                return { success: true };
            },
            reorderServices: ({ services: newOrder }) => {
                services = newOrder;
                saveServices(services);
                return { success: true };
            },
            removeService: async ({ id }) => {
                await stopService(id);
                services = services.filter(s => s.id !== id);
                delete statuses[id];
                saveServices(services);
                return { success: true };
            },
            freePort: ({ ports }) => {
                try {
                    const portArray = ports.split(",").map(p => p.trim()).filter(p => !isNaN(parseInt(p)));
                    for (const pt of portArray) {
                        const psScript = `Get-NetTCPConnection -LocalPort ${pt} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }`;
                        execSync(`powershell -WindowStyle Hidden -Command "${psScript}"`, { stdio: 'ignore' });
                    }
                    return { success: true };
                } catch(e) {
                    return { success: false, error: "Echec" };
                }
            },
            shutdown: () => {
                cleanupProcesses();
                return;
            },
            forceCleanup: () => {
                const killCmds = [
                    "taskkill /F /IM kokoro_api.exe /T 2>NUL",
                    "taskkill /F /IM cargo.exe /T 2>NUL",
                    "taskkill /F /IM node.exe /T 2>NUL",
                    "taskkill /F /IM npm.cmd /T 2>NUL",
                    "taskkill /F /IM pnpm.exe /T 2>NUL",
                    "taskkill /F /IM python.exe /T 2>NUL",
                    "taskkill /F /IM pwsh.exe /T 2>NUL"
                ];
                for (const cmd of killCmds) {
                    try {
                        execSync(cmd, { stdio: 'ignore' });
                    } catch(e) {}
                }
                return;
            }
        },
        messages: {}
    }
});

async function getMainViewUrl(): Promise<string> {
    const channel = await Updater.localInfo.channel();
    if (channel === "dev") {
        for (let i = 0; i < 15; i++) {
            try {
                await fetch(DEV_SERVER_URL, { method: "HEAD" });
                console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
                return DEV_SERVER_URL;
            } catch {
                await new Promise(r => setTimeout(r, 200));
            }
        }
        console.log("Vite dev server not running.");
    }
    return "views://mainview/index.html";
}

async function startViteDevServer() {
    const channel = await Updater.localInfo.channel();
    if (channel !== "dev") return;
    try {
        await fetch(DEV_SERVER_URL, { method: "HEAD" });
    } catch {
        console.log("Spawning Vite Dev Server internally...");
        const viteProc = spawn(["C:\\Users\\jp_22\\.bun\\bin\\bun.exe", "run", "hmr"], { 
            cwd: "F:\\AzTest\\Services_Manager",
            stdin: "ignore", stdout: "ignore", stderr: "ignore"
        });
        processes["vite_hmr"] = viteProc as any;
        if (viteProc.pid) attachWatchdog(viteProc.pid);
    }
}
await startViteDevServer();

const url = await getMainViewUrl();

mainWindow = new BrowserWindow({
    title: "WeServices",
    url,
    frame: {
        width: 1100,
        height: 800,
        x: 200,
        y: 200,
    },
    rpc
});

console.log("Services Manager started!");

// Add global shutdown hooks to aggressively kill child processes on Windows
let shuttingDown = false;
function cleanupProcesses() {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const id in processes) {
        const proc = processes[id];
        if (proc && proc.pid) {
            try {
                execSync(`taskkill /T /F /PID ${proc.pid}`, { stdio: 'ignore' });
            } catch (e) {}
        }
    }
}

// Intercept window close if possible (electrobun window closes trigger process exit usually)
process.on('SIGINT', () => { cleanupProcesses(); process.exit(0); });
process.on('SIGTERM', () => { cleanupProcesses(); process.exit(0); });
process.on('exit', () => cleanupProcesses());
