import { BrowserWindow, Updater, BrowserView, Utils } from "electrobun/bun";
import type { RPCSchema } from "electrobun/bun";
import { spawn, type Subprocess } from "bun";
import { join } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { execSync } from "node:child_process";
import * as os from "os";

const DEV_SERVER_PORT = 5273;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

export type ServiceStatus = "running" | "stopped" | "error" | "starting" | "stopping";

export interface ServiceDef {
    id: string;
    name: string;
    dir: string;
    cmd: string;
    ports?: string;
    url?: string;
}

export type AppRPC = {
    bun: RPCSchema<{
        requests: {
            getServices: { params: void, response: { services: ServiceDef[], statuses: Record<string, ServiceStatus> } };
            startService: { params: { id: string }, response: { success: boolean, error?: string } };
            stopService: { params: { id: string }, response: { success: boolean, error?: string } };
            restartService: { params: { id: string }, response: { success: boolean, error?: string } };
            addService: { params: { name: string, dir: string, cmd: string, ports?: string, url?: string }, response: { id: string, success: boolean, error?: string } };
            updateService: { params: { id: string, name: string, dir: string, cmd: string, ports?: string, url?: string }, response: { success: boolean, error?: string } };
            reorderServices: { params: { services: ServiceDef[] }, response: { success: boolean } };
            removeService: { params: { id: string }, response: { success: boolean, error?: string } };
            shutdown: { params: void, response: void };
            forceCleanup: { params: void, response: void };
            freePort: { params: { ports: string }, response: { success: boolean, error?: string } };
            openUrl: { params: { url: string }, response: { success: boolean, error?: string } };
            getSettings: { params: void, response: { settings: any } };
            updateSettings: { params: { settings: any }, response: { success: boolean } };
        };
        messages: {};
    }>;
    webview: RPCSchema<{
        requests: {};
        messages: {
            serviceStatusChange: { id: string, status: ServiceStatus, cpu?: number, mem?: number, gpu?: number, vram?: number };
            serviceLog: { id: string, text: string, type: 'out' | 'err' };
            serviceMetrics: { id: string, cpu: number, mem: number, gpu?: number, vram?: number };
        };
    }>;
};

// ... jump to handlers inside defined setup
// Assuming I need to replace from export interface down to freePort handler... Wait, I will use multiple ReplaceChunks.

import * as fs from "fs";

const userHome = process.env.USERPROFILE || process.env.HOME || process.cwd();
const confDir = join(userHome, ".weservices");

if (!fs.existsSync(confDir)) {
    try { fs.mkdirSync(confDir, { recursive: true }); } catch (e) {}
}

const oldConfig = "F:\\AzWorkspace\\services_config.json";
const oldSettings = "F:\\AzWorkspace\\weservices_settings.json";

const CONFIG_PATH = fs.existsSync(oldConfig) ? oldConfig : join(confDir, "services_config.json");
const SETTINGS_PATH = fs.existsSync(oldSettings) ? oldSettings : join(confDir, "settings.json");

interface AppSettings {
    autoStartServices: boolean;
    autoStartApp: boolean;
    enableMetrics?: boolean;
}

function loadSettings(): AppSettings {
    if (existsSync(SETTINGS_PATH)) {
        try {
            return JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"));
        } catch (e) {}
    }
    const defaultSettings: AppSettings = { autoStartServices: false, autoStartApp: false, enableMetrics: false };
    saveSettings(defaultSettings);
    return defaultSettings;
}

function updateRegistryAutoStart(enable: boolean) {
    const regKey = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
    const appName = "WeServices";
    
    let exePath = process.execPath;
    // In Electrobun, process.execPath is the embedded bun.exe, but we must run WeServices.exe or launcher.exe
    let launcherPath = exePath.replace(/bun\.exe$/i, "WeServices.exe");
    if (!existsSync(launcherPath)) {
        launcherPath = exePath.replace(/bun\.exe$/i, "launcher.exe");
    }
    
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

// Resource Watchdog Loop (Decoupled JSON Architecture)
let pyDaemonProc: Subprocess | null = null;
const scriptContent = `
import time
import json
import subprocess
import os
import ctypes
from ctypes.wintypes import DWORD, LONG, ULONG

PID_FILE = r"${join(os.tmpdir(), "weservices_pids.json").replace(/\\/g, '\\\\')}"
METRICS_FILE = r"${join(os.tmpdir(), "weservices_metrics.json").replace(/\\/g, '\\\\')}"

last_cpu_time = {}

class PROCESSENTRY32(ctypes.Structure):
    _fields_ = [("dwSize", DWORD), ("cntUsage", DWORD), ("th32ProcessID", DWORD), ("th32DefaultHeapID", ctypes.POINTER(ULONG)), ("th32ModuleID", DWORD), ("cntThreads", DWORD), ("th32ParentProcessID", DWORD), ("pcPriClassBase", LONG), ("dwFlags", DWORD), ("szExeFile", ctypes.c_char * 260)]

def get_process_tree(parent_pids):
    kernel32 = ctypes.windll.kernel32
    hProcessSnap = kernel32.CreateToolhelp32Snapshot(2, 0)
    pe32 = PROCESSENTRY32()
    pe32.dwSize = ctypes.sizeof(PROCESSENTRY32)
    parents = {}
    if kernel32.Process32First(hProcessSnap, ctypes.byref(pe32)):
        while True:
            parents[pe32.th32ProcessID] = pe32.th32ParentProcessID
            if not kernel32.Process32Next(hProcessSnap, ctypes.byref(pe32)):
                break
    kernel32.CloseHandle(hProcessSnap)
    family_map = {}
    all_targets = set()
    for root in parent_pids:
        descendants = {root}
        changed = True
        while changed:
            changed = False
            for pid, ppid in parents.items():
                if pid not in descendants and ppid in descendants:
                    descendants.add(pid)
                    changed = True
        family_map[root] = list(descendants)
        all_targets.update(descendants)
    return family_map, list(all_targets)

def get_metrics():
    if not os.path.exists(PID_FILE): return
    try:
        with open(PID_FILE, "r") as f: pids = json.load(f)
    except Exception: return
    if not pids: return
    
    family_map, all_targets = get_process_tree(pids)
    if not all_targets: return
    
    pid_str = ",".join(map(str, all_targets))
    ps_cmd = f"$ErrorActionPreference = 'SilentlyContinue'; $procs = Get-Process -Id {pid_str}; $res = @(); foreach ($p in $procs) {{ $c = $p.CPU; if ($null -eq $c) {{ $c = 0 }}; $res += ($p.Id.ToString() + ':' + $c.ToString() + ':' + $p.WorkingSet64.ToString()) }}; Write-Output ($res -join '|')"
    
    gpu_metrics = {}
    try:
        out_vram = subprocess.check_output(["powershell", "-NoProfile", "-Command", "Get-WmiObject Win32_PerfFormattedData_GPUPerformanceCounters_GPUProcessMemory | ForEach-Object { $_.Name + ',' + $_.DedicatedUsage }"], universal_newlines=True, stderr=subprocess.DEVNULL, creationflags=0x08000000)
        for line in out_vram.strip().split('\\n'):
            parts = line.split(',')
            if len(parts) == 2 and parts[0].startswith('pid_') and parts[1].strip().isdigit():
                pid_part = parts[0].split('_')[1]
                if pid_part.isdigit():
                    pid = int(pid_part)
                    vram_bytes = int(parts[1].strip())
                    if pid not in gpu_metrics: gpu_metrics[pid] = {'vram': 0, 'sm': 0.0}
                    gpu_metrics[pid]['vram'] += vram_bytes
                
        out_sm = subprocess.check_output(["nvidia-smi", "pmon", "-c", "1", "-s", "u"], universal_newlines=True, stderr=subprocess.DEVNULL, creationflags=0x08000000)
        for line in out_sm.strip().split('\\n'):
            if line.startswith('#') or not line.strip(): continue
            parts = line.split()
            if len(parts) >= 4 and parts[1].isdigit():
                pid = int(parts[1])
                sm = parts[3]
                if sm.isdigit():
                    if pid not in gpu_metrics: gpu_metrics[pid] = {'vram': 0, 'sm': 0.0}
                    gpu_metrics[pid]['sm'] = float(sm)
    except Exception: pass

    try:
        proc = subprocess.Popen(["powershell", "-NoProfile", "-Command", ps_cmd], stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=0x08000000, encoding="utf-8")
        out, _ = proc.communicate(timeout=5)
        out_str = out.strip() if out else ""
        cores = os.cpu_count() or 1
        
        proc_stats = {}
        if out_str:
            for c in out_str.split('|'):
                if ':' in c:
                    parts = c.split(':')
                    if len(parts) == 3:
                        c_pid = int(parts[0])
                        c_cpu = float(parts[1].replace(',', '.') if parts[1] else 0.0)
                        c_mem = int(parts[2]) if parts[2] else 0
                        proc_stats[c_pid] = (c_cpu, c_mem)
        
        results = {}
        for root in pids:
            total_cpu_time = 0.0
            total_mem = 0
            total_gpu_vram = 0
            total_gpu_sm = 0.0
            for child in family_map.get(root, []):
                if child in proc_stats:
                    c_cpu, c_mem = proc_stats[child]
                    total_cpu_time += c_cpu
                    total_mem += c_mem
                if child in gpu_metrics:
                    total_gpu_vram += gpu_metrics[child]['vram']
                    total_gpu_sm += gpu_metrics[child]['sm']
            
            prev = last_cpu_time.get(root, total_cpu_time)
            cpu_percent = (((total_cpu_time - prev) / 3.0) * 100.0) / cores
            last_cpu_time[root] = total_cpu_time
            results[root] = {"cpu": max(0, cpu_percent), "mem": total_mem, "gpu": total_gpu_sm, "vram": total_gpu_vram}
            
        with open(METRICS_FILE, "w") as f: json.dump(results, f)
    except Exception: pass

while True:
    time.sleep(3)
    get_metrics()
`;

const pyPath = join(os.tmpdir(), "metrics_daemon.py");
const pidsJsonPath = join(os.tmpdir(), "weservices_pids.json");
const metricsJsonPath = join(os.tmpdir(), "weservices_metrics.json");

function managePythonDaemon() {
    if (appSettings?.enableMetrics) {
        if (!pyDaemonProc) {
            try {
                writeFileSync(pyPath, scriptContent);
                pyDaemonProc = spawn(["python", pyPath], { stdout: "ignore", stderr: "ignore" });
            } catch(e) {
                try { writeFileSync("C:/Temp/weservices_err.log", String(e)); } catch(err){}
            }
        }
    } else {
        if (pyDaemonProc) {
            pyDaemonProc.kill();
            pyDaemonProc = null;
        }
        try { writeFileSync(metricsJsonPath, "{}"); } catch(e) {}
    }
}

managePythonDaemon();

setInterval(async () => {
    if (!mainWindow || !mainWindow.webview.rpc) return;
    
    // 1. Écrire les PIDs actifs de manière asynchrone non-bloquante
    const activePids: number[] = [];
    for (const [id, proc] of Object.entries(processes)) {
        if ((statuses[id] === "running" || statuses[id] === "starting") && proc && proc.pid) {
            activePids.push(proc.pid);
        }
    }
    
    try {
        writeFileSync(pidsJsonPath, JSON.stringify(activePids));
    } catch(e) {}
    
    // 2. Lire le résultat préparé par le démon Python
    let metricsData: any = {};
    if (existsSync(metricsJsonPath)) {
        try {
            const raw = readFileSync(metricsJsonPath, "utf-8");
            metricsData = JSON.parse(raw);
        } catch(e) {}
    }
    
    // 3. Diffuser passivement à l'UI sans jamais figer le thread
    for (const [id, proc] of Object.entries(processes)) {
        if (statuses[id] !== "running" && statuses[id] !== "starting") continue;
        if (proc && proc.pid) {
            const stat = metricsData[proc.pid.toString()];
            if (stat) {
                broadcastStatus(id, statuses[id], stat.cpu, stat.mem, stat.gpu, stat.vram);
            } else {
                // If python takes time to catch up, ignore
            }
        }
    }
}, 3000);

if (appSettings.autoStartServices) {
    setTimeout(() => {
        services.forEach(s => startService(s.id));
    }, 1000);
}

let mainWindow: BrowserWindow | null = null;

function broadcastStatus(id: string, status: ServiceStatus, cpu?: number, mem?: number, gpu?: number, vram?: number) {
    statuses[id] = status;
    if (mainWindow && mainWindow.webview.rpc) {
        let payload: any = { id, status };
        if (cpu !== undefined) payload.cpu = cpu;
        if (mem !== undefined) payload.mem = mem;
        if (gpu !== undefined) payload.gpu = gpu;
        if (vram !== undefined) payload.vram = vram;
        (mainWindow.webview.rpc as any).send?.serviceStatusChange(payload);
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
        if (mainWindow && mainWindow.webview.rpc) {
            sendLog(id, "<CLS>", 'out');
        }

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
                managePythonDaemon();
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
            addService: ({ name, dir, cmd, ports, url }) => {
                const id = "service_" + Date.now();
                services.push({ id, name, dir, cmd, ports, url });
                statuses[id] = "stopped";
                saveServices(services);
                return { id, success: true };
            },
            updateService: ({ id, name, dir, cmd, ports, url }) => {
                const service = services.find(s => s.id === id);
                if (!service) return { success: false, error: "Not found" };
                service.name = name;
                service.dir = dir;
                service.cmd = cmd;
                service.ports = ports;
                service.url = url;
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
            openUrl: ({ url }) => {
                try {
                    execSync(`start "" "${url}"`);
                    return { success: true };
                } catch(e: any) {
                    return { success: false, error: e.message };
                }
            },
            shutdown: () => {
                cleanupProcesses();
                setTimeout(() => {
                    if (mainWindow) {
                        try { mainWindow.close(); } catch(e){}
                    }
                    try { spawn(["taskkill", "/IM", "weservices.exe", "/F"]); } catch(e){}
                    try { spawn(["taskkill", "/IM", "launcher.exe", "/F"]); } catch(e){}
                    process.exit(0);
                }, 100);
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
        messages: {
            serviceStatusChange: ({ id, status }: { id: string, status: any }) => {},
            serviceLog: ({ id, text, type }: {id: string, text: string, type: any}) => {},
            serviceMetrics: ({ id, cpu, mem, gpu, vram }: { id: string, cpu: number, mem: number, gpu?: number, vram?: number }) => {},
            serviceClearLog: ({ id }: { id: string }) => {}
        } as any
    }
});

async function getMainViewUrl(): Promise<string> {
    return "views://mainview/index.html";
}

async function startViteDevServer() {
    return;
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

// --- WeAi Local API ---
const WEAI_API_PORT = 42069;
Bun.serve({
    port: WEAI_API_PORT,
    fetch(req) {
        const url = new URL(req.url);
        
        if (req.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type"
                }
            });
        }

        const headers = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
        const json = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers });

        try {
            if (req.method === "GET" && url.pathname === "/api/services") {
                return json({ services, statuses });
            }
            if (req.method === "GET" && url.pathname === "/api/metrics") {
                let metricsData = {};
                try {
                    if (existsSync(metricsJsonPath)) {
                        metricsData = JSON.parse(readFileSync(metricsJsonPath, "utf-8"));
                    }
                } catch(e) {}
                return json(metricsData);
            }
            if (req.method === "POST") {
                if (url.pathname === "/api/cleanup") {
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
                        try { execSync(cmd, { stdio: 'ignore' }); } catch(e) {}
                    }
                    return json({ success: true, action: "cleanup" });
                }
                const matchStart = url.pathname.match(/^\/api\/services\/(.+)\/start$/);
                if (matchStart) {
                    startService(matchStart[1]);
                    return json({ success: true, action: "start", id: matchStart[1] });
                }
                const matchStop = url.pathname.match(/^\/api\/services\/(.+)\/stop$/);
                if (matchStop) {
                    stopService(matchStop[1]);
                    return json({ success: true, action: "stop", id: matchStop[1] });
                }
                const matchRestart = url.pathname.match(/^\/api\/services\/(.+)\/restart$/);
                if (matchRestart) {
                    stopService(matchRestart[1]).then(() => {
                        setTimeout(() => startService(matchRestart[1]), 500);
                    });
                    return json({ success: true, action: "restart", id: matchRestart[1] });
                }
            }
            return new Response("Not Found", { status: 404, headers });
        } catch (e: any) {
            return json({ success: false, error: e.message }, 500);
        }
    }
});
console.log(`WeAi Local API Server running on port ${WEAI_API_PORT}`);
// ----------------------

// Add global shutdown hooks to aggressively kill child processes on Windows
let shuttingDown = false;
function cleanupProcesses() {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
        if (pyDaemonProc) pyDaemonProc.kill();
    } catch(e) {}
    for (const id in processes) {
        const proc = processes[id];
        if (proc && proc.pid) {
            try {
                spawn(["taskkill", "/T", "/F", "/PID", proc.pid.toString()]);
            } catch (e) {}
        }
    }
}

// Intercept window close if possible (electrobun window closes trigger process exit usually)
process.on('SIGINT', () => { cleanupProcesses(); process.exit(0); });
process.on('SIGTERM', () => { cleanupProcesses(); process.exit(0); });
process.on('exit', () => cleanupProcesses());
