import "./style.css";
import Electrobun, { Electroview } from "electrobun/view";

// Defines the shared types manually to avoid importing from bun side
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
    bun: {
        requests: {
            getServices: { params: void, response: { services: ServiceDef[], statuses: Record<string, ServiceStatus> } };
            startService: { params: { id: string }, response: { success: boolean, error?: string } };
            stopService: { params: { id: string }, response: { success: boolean, error?: string } };
            restartService: { params: { id: string }, response: { success: boolean, error?: string } };
            addService: { params: { name: string, dir: string, cmd: string, ports?: string, url?: string }, response: { id: string, success: boolean, error?: string } };
            updateService: { params: { id: string, name: string, dir: string, cmd: string, ports?: string, url?: string }, response: { success: boolean, error?: string } };
            removeService: { params: { id: string }, response: { success: boolean, error?: string } };
            shutdown: { params: void, response: void };
            forceCleanup: { params: void, response: void };
            freePort: { params: { ports: string }, response: { success: boolean, error?: string } };
            openUrl: { params: { url: string }, response: { success: boolean, error?: string } };
            getSettings: { params: void, response: { settings: any } };
            updateSettings: { params: { settings: any }, response: { success: boolean } };
        };
        messages: {
            serviceStatusChange: { id: string, status: ServiceStatus, cpu?: number, mem?: number, gpu?: number, vram?: number };
            serviceLog: { id: string, text: string, type: 'out' | 'err' };
            serviceMetrics: { id: string, cpu: number, mem: number, gpu?: number, vram?: number };
        };
    };
    webview: {
        requests: {};
        messages: {
            serviceStatusChange: { id: string, status: ServiceStatus, cpu?: number, mem?: number, gpu?: number, vram?: number };
            serviceLog: { id: string, text: string, type: 'out' | 'err' };
            serviceMetrics: { id: string, cpu: number, mem: number, gpu?: number, vram?: number };
            serviceClearLog: { id: string };
        };
    };
};

const logs: Record<string, string> = {};
let activeServiceId: string | null = null;
let servicesList: ServiceDef[] = [];
let serviceStatuses: Record<string, ServiceStatus> = {};
let modalMode: "add" | "edit" = "add";

const ICONS = {
    start: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`,
    stop: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12"></rect></svg>`,
    restart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.92-10.26l3.08-3.08"></path></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`,
    plumber: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
    copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
    lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`,
    unlock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`,
    spinner: `<span class="spinner-wrapper" style="display: inline-flex; justify-content: center; align-items: center; width: 14px; height: 14px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg></span>`,
    chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`,
    broom: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
    settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
    web: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`,
    save: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>`,
    close: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`
};

const app = document.getElementById("app")!;

app.innerHTML = `
    <div class="app-container">
        <aside class="sidebar">
            <div class="sidebar-header">
                <div style="display: flex; align-items: center; gap: 10px;"><img src="./favicon.png" style="width: 52px; height: 52px; border-radius: 12px; box-shadow: 0 0 10px rgba(0, 255, 255, 0.2);" /><h2 style="margin: 0;">WeServices <span style="font-size: 0.5em; color: var(--text-secondary); vertical-align: middle;">v0.1.21</span></h2></div>
                <div style="display: flex; align-items: center; justify-content: center;">
                    <button id="btn-settings" class="btn-icon" style="margin-right: 12px; display: flex; width: 24px; height: 24px;" title="Settings">
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                    </button>
                    <button id="btn-add-service" class="btn-icon" title="Add Service" style="display: flex; align-items: center; justify-content: center; width: 24px; height: 24px;">➕</button>
                </div>
            </div>
            <ul id="service-list" class="service-list"></ul>
        </aside>
        <div id="sidebar-resizer" class="resizer" title="Redimensionner"></div>
        <main class="main-content">
            <header class="content-header" id="content-header" style="display: none;">
                <div class="header-info">
                    <h2 id="current-service-name">Service Name</h2>
                    <div id="current-service-cmd" class="cmd-text"></div>
                </div>
                <div style="display: flex; align-items: stretch; gap: 16px;">
                    <div style="display: flex; flex-direction: column; align-items: flex-end; justify-content: flex-end; gap: 8px;">
                        <div style="color: #ffffff; font-size: 1.15rem; font-weight: 600; letter-spacing: 0.3px; margin-right: 2px;">All Services</div>
                        <div class="header-actions" style="display: flex; align-items: center; gap: 2px;">
                            <button class="btn-xxl-icon" id="btn-global-start" title="Start All" style="color: var(--success);">${ICONS.start}</button>
                            <button class="btn-xxl-icon" id="btn-global-stop" title="Stop All" style="color: var(--danger);">${ICONS.stop}</button>
                            <button class="btn-xxl-icon" id="btn-cleanup" title="Force Clean Zombies" style="color: var(--warning);">${ICONS.broom || '🧹'}</button>
                            <div id="global-led" class="led led-red" style="width: 12px; height: 12px; margin-left: 14px;"></div>
                        </div>
                    </div>
                    <button id="btn-quit-app" title="Quit WeServices Gracefully" style="background: rgba(236,114,128,0.08); border-radius: 12px; color: #ec7280; width: 68px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; border: 2px solid rgba(236,114,128,0.2); padding: 14px; cursor: pointer;" onmouseover="this.style.background='rgba(236,114,128,0.2)'; this.style.transform='scale(1.05)';" onmouseout="this.style.background='rgba(236,114,128,0.08)'; this.style.transform='scale(1)';">
                        ${ICONS.close}
                    </button>
                </div>
            </header>
            <div class="terminal-container">
                <div id="terminal-output" class="terminal-output"></div>
            </div>
        </main>

        <div id="modal-overlay" class="modal-overlay hidden">
            <div class="modal">
                <h2 id="modal-title">Add New Service</h2>
                <div class="form-group">
                    <label>Name</label>
                    <input type="text" id="add-name" placeholder="e.g. My Service" />
                </div>
                <div class="form-group">
                    <label>Directory</label>
                    <input type="text" id="add-dir" placeholder="e.g. F:\\MyProject" />
                </div>
                <div class="form-group">
                    <label>Command</label>
                    <input type="text" id="add-cmd" placeholder="e.g. npm start" />
                </div>
                <div class="form-group">
                    <label>Ports (optional, multi e.g: 3030,3040)</label>
                    <input type="text" id="add-port" placeholder="e.g. 3030, 3040" />
                </div>
                <div class="form-group">
                    <label>Web UI URL (optional)</label>
                    <input type="text" id="add-url" placeholder="e.g. http://localhost:3000" />
                </div>
                <div class="modal-actions">
                    <button class="btn btn-outline" id="btn-cancel-add">Cancel</button>
                    <button class="btn btn-primary" id="btn-submit-add">Save</button>
                </div>
            </div>
        </div>

        <div id="settings-overlay" class="modal-overlay hidden">
            <div class="modal">
                <h2>Settings</h2>
                <div class="form-group checkbox-group">
                    <label>
                        <input type="checkbox" id="chk-autostart-services">
                        Start services when application has started
                    </label>
                </div>
                <div class="form-group checkbox-group">
                    <label>
                        <input type="checkbox" id="chk-autostart-app">
                        Start WeServices at computer startup
                    </label>
                </div>
                <div class="form-group checkbox-group">
                    <label>
                        <input type="checkbox" id="chk-enable-metrics">
                        Enable precise CPU/RAM metrics (Python/ctypes tracing)
                    </label>
                </div>
                <div class="modal-actions">
                    <button class="btn btn-primary" id="btn-close-settings">Close</button>
                </div>
            </div>
        <div id="shutdown-overlay" class="modal-overlay hidden" style="z-index: 9999; flex-direction: column; background: rgba(10,12,16,0.95); animation: fadein 0.3s ease;">
            <div style="color: var(--danger); width: 64px; height: 64px; margin-bottom: 24px; animation: pulse 1s infinite alternate;">
                ${ICONS.close}
            </div>
            <h1 style="color: #fff; font-size: 24px; font-weight: 600; margin: 0 0 12px 0; letter-spacing: 1px;">Shutting Down WeServices</h1>
            <p style="color: var(--text-secondary); font-size: 14px;">Fermeture propre de tous les terminaux enfants en cours...</p>
            <div style="margin-top: 32px; width: 200px; height: 4px; background: var(--bg-tertiary); border-radius: 4px; overflow: hidden;">
                <div style="height: 100%; background: var(--danger); width: 100%; animation: shrink 3s linear forwards;"></div>
            </div>
        </div>
    </div>
`;

// Helper for RPC
let rpc: any; // Setup below

const listEl = document.getElementById("service-list")!;
const termEl = document.getElementById("terminal-output")!;
const headerEl = document.getElementById("content-header")!;
const nameEl = document.getElementById("current-service-name")!;
const cmdEl = document.getElementById("current-service-cmd")!;
// Obsolete header action buttons references removed
const modalOverlay = document.getElementById("modal-overlay")!;
const modalTitle = document.getElementById("modal-title")!;
const inputName = document.getElementById("add-name") as HTMLInputElement;
const inputDir = document.getElementById("add-dir") as HTMLInputElement;
const inputCmd = document.getElementById("add-cmd") as HTMLInputElement;
const inputPort = document.getElementById("add-port") as HTMLInputElement;
const inputUrl = document.getElementById("add-url") as HTMLInputElement;

document.getElementById("btn-add-service")!.addEventListener("click", () => {
    modalMode = "add";
    modalTitle.textContent = "Add New Service";
    inputName.value = "";
    inputDir.value = "";
    inputCmd.value = "";
    inputPort.value = "";
    inputUrl.value = "";
    modalOverlay.classList.remove("hidden");
});

function guessPortFromLogs(log: string): number | null {
    if (!log) return null;
    const matches = [...log.matchAll(/(?:port|:|EADDRINUSE.*?)\s*[:=]?\s*(\d{4,5})/gi)];
    for (let i = matches.length - 1; i >= 0; i--) {
        const p = parseInt(matches[i][1]);
        if (p > 1000 && p <= 65535) return p;
    }
    return null;
}

// Edit Modal functions removed

// Obsolete single-service header action button listeners removed

document.getElementById("btn-cancel-add")!.addEventListener("click", () => {
    modalOverlay.classList.add("hidden");
});

const settingsOverlay = document.getElementById("settings-overlay")!;
const chkAutoStartServices = document.getElementById("chk-autostart-services") as HTMLInputElement;
const chkAutoStartApp = document.getElementById("chk-autostart-app") as HTMLInputElement;
const chkEnableMetrics = document.getElementById("chk-enable-metrics") as HTMLInputElement;

let currentSettings: any = { autoStartServices: false, autoStartApp: false, enableMetrics: false };

document.getElementById("btn-settings")!.addEventListener("click", async () => {
    const res = await rpc.request.getSettings();
    currentSettings = res.settings;
    chkAutoStartServices.checked = currentSettings.autoStartServices;
    chkAutoStartApp.checked = currentSettings.autoStartApp;
    chkEnableMetrics.checked = currentSettings.enableMetrics || false;
    settingsOverlay.classList.remove("hidden");
});

document.getElementById("btn-close-settings")!.addEventListener("click", () => {
    settingsOverlay.classList.add("hidden");
});

const handleSaveSettings = async () => {
    currentSettings.autoStartServices = chkAutoStartServices.checked;
    currentSettings.autoStartApp = chkAutoStartApp.checked;
    currentSettings.enableMetrics = chkEnableMetrics.checked;
    await rpc.request.updateSettings({ settings: currentSettings });
};

chkAutoStartServices.addEventListener("change", handleSaveSettings);
chkAutoStartApp.addEventListener("change", handleSaveSettings);
chkEnableMetrics.addEventListener("change", handleSaveSettings);

document.getElementById("btn-submit-add")!.addEventListener("click", async () => {
    const name = inputName.value;
    const dir = inputDir.value;
    const cmd = inputCmd.value;
    const ports = inputPort.value ? inputPort.value : undefined;
    const url = inputUrl.value ? inputUrl.value : undefined;
    if (!name || !dir || !cmd) return alert("All fields are required");

    if (modalMode === "add") {
        await rpc.request.addService({ name, dir, cmd, ports, url });
    }
    
    modalOverlay.classList.add("hidden");
    await refreshServices();
    if (activeServiceId) {
        selectService(activeServiceId);
    }
});

document.getElementById("btn-global-start")?.addEventListener("click", async () => {
    servicesList.forEach(s => {
        if (serviceStatuses[s.id] !== "running" && serviceStatuses[s.id] !== "starting") {
            loadingServices[s.id] = true;
            rpc.request.startService({ id: s.id });
        }
    });
    renderServices();
});

document.getElementById("btn-global-stop")?.addEventListener("click", async () => {
    servicesList.forEach(s => {
        if (serviceStatuses[s.id] === "running" || serviceStatuses[s.id] === "starting" || serviceStatuses[s.id] === "error") {
            loadingServices[s.id] = true;
            rpc.request.stopService({ id: s.id });
        }
    });
    renderServices();
});
// Dead logic removed

document.getElementById("btn-cleanup")?.addEventListener("click", async () => {
    const btn = document.getElementById("btn-cleanup") as HTMLButtonElement;
    const originalText = btn.innerHTML;
    btn.innerHTML = "<span class='spinner'>⏳</span> Nettoyage...";
    btn.disabled = true;
    await rpc.request.forceCleanup();
    setTimeout(() => {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }, 1000);
});

function appendLogUI(text: string) {
    const span = document.createElement("span");
    span.textContent = text;
    termEl.appendChild(span);
    termEl.scrollTop = termEl.scrollHeight;
}

function renderLog() {
    termEl.innerHTML = "";
    if (activeServiceId) {
        termEl.textContent = logs[activeServiceId] || "";
        termEl.scrollTop = termEl.scrollHeight;
        
        headerEl.style.display = "flex";
        const service = servicesList.find(s => s.id === activeServiceId);
        if (service) {
            nameEl.textContent = service.name;
            cmdEl.textContent = `[${service.dir}] > ${service.cmd}`;
        }
    } else {
        headerEl.style.display = "none";
    }
}

function selectService(id: string) {
    activeServiceId = id;
    if (!logs[id]) logs[id] = "";
    document.querySelectorAll(".service-item").forEach(el => el.classList.remove("active"));
    document.getElementById(`item-${id}`)?.classList.add("active");
    renderLog();
}

// updateButtons logic removed

const unlockedServices: Record<string, boolean> = {};
const loadingServices: Record<string, boolean> = {};

const expandedServices: Record<string, boolean> = {};
const metricCache: Record<string, string> = {};

function renderServices() {
    listEl.innerHTML = "";
    servicesList.forEach(s => {
        const li = document.createElement("li");
        li.className = `service-item ${s.id === activeServiceId ? 'active' : ''}`;
        li.id = `item-${s.id}`;
        
        const status = serviceStatuses[s.id] || "stopped";
        let ledClass = "led-red";
        let ledTitle = "Service is Stopped";
        if (status === "running") { ledClass = "led-green"; ledTitle = "All right, service is running"; }
        else if (status === "starting" || status === "stopping" || status === "error") { ledClass = "led-orange"; ledTitle = "Some issue detect, Try Force Kill zombie button"; }

        const locked = !unlockedServices[s.id];
        const isExpanded = !!expandedServices[s.id];
        const isRunning = status === "running" || status === "starting";
        const isLoading = loadingServices[s.id] || status === "starting" || status === "stopping";

        const startStopIcon = isLoading ? ICONS.spinner : (isRunning ? ICONS.stop : ICONS.start);
        const startStopColor = isLoading ? 'var(--text-secondary)' : (isRunning ? 'var(--danger)' : 'var(--success)');

        li.innerHTML = `
            <div class="service-row">
                <div class="service-main">
                    <button class="inline-btn expand-btn ${isExpanded ? 'expanded' : ''}" id="i-ex-${s.id}">${ICONS.chevron}</button>
                    <div class="led ${ledClass}" title="${ledTitle}"></div>
                </div>
                <div class="service-header" style="flex: 1; display: flex; align-items: center; justify-content: flex-start; gap: 12px; overflow: hidden;">
                   <span class="service-name">${s.name}</span>
                   <span id="metrics-${s.id}" class="service-metrics" style="display: flex; align-items: center; flex-shrink: 0;">${metricCache[s.id] || ''}</span>
                </div>
                <div class="service-actions-grid">
                   <button class="inline-btn" id="i-sg-${s.id}" title="${isRunning?'Stop':'Start'}" style="color:${startStopColor}">${startStopIcon}</button>
                   <button class="inline-btn" id="i-re-${s.id}" title="Restart" ${isRunning?'':'disabled'}>${ICONS.restart}</button>
                   <button class="inline-btn" id="i-wb-${s.id}" title="Open Web UI" style="${s.url ? '' : 'visibility: hidden; point-events: none;'}">${ICONS.web}</button>
                   <button class="inline-btn" id="i-lk-${s.id}" title="${locked?'Unlock':'Lock'}">${locked ? ICONS.lock : ICONS.unlock}</button>
                   <button class="inline-btn ${locked ? 'dim' : ''}" id="i-pb-${s.id}" title="Force Kill Zombie" ${locked?'disabled':''}>${ICONS.plumber}</button>
                   <button class="inline-btn ${locked ? 'dim' : ''}" id="i-tr-${s.id}" title="Delete" ${locked?'disabled':''}>${ICONS.trash}</button>
                </div>
            </div>
            <div class="service-details ${isExpanded ? '' : 'hidden'}">
                <div class="inline-edit-form">
                    <label>Name</label>
                    <input type="text" id="inline-name-${s.id}" value="${s.name.replace(/"/g, '&quot;')}" ${locked ? 'disabled' : ''}>
                    
                    <label>Directory</label>
                    <div style="position: relative; display: block; width: 100%;">
                        <input type="text" id="inline-dir-${s.id}" value="${s.dir.replace(/"/g, '&quot;')}" ${locked ? 'disabled' : ''} style="width: 100%; padding-right: 32px; box-sizing: border-box;">
                        <button class="btn-icon btn-inline-copy" data-copy="inline-dir-${s.id}" title="Copy Directory" style="position: absolute; right: 6px; top: 0; bottom: 0; margin: auto; height: 20px; width: 20px; padding: 2px; color: var(--text-secondary); background: transparent; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;">${ICONS.copy}</button>
                    </div>
                    
                    <label>Command</label>
                    <div style="position: relative; display: block; width: 100%;">
                        <input type="text" id="inline-cmd-${s.id}" value="${s.cmd.replace(/"/g, '&quot;')}" ${locked ? 'disabled' : ''} style="width: 100%; padding-right: 32px; box-sizing: border-box;">
                        <button class="btn-icon btn-inline-copy" data-copy="inline-cmd-${s.id}" title="Copy Command" style="position: absolute; right: 6px; top: 0; bottom: 0; margin: auto; height: 20px; width: 20px; padding: 2px; color: var(--text-secondary); background: transparent; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;">${ICONS.copy}</button>
                    </div>
                    
                    <label>Ports</label>
                    <input type="text" id="inline-port-${s.id}" value="${s.ports ? s.ports.replace(/"/g, '&quot;') : ''}" ${locked ? 'disabled' : ''} placeholder="e.g. 3030">
                    
                    <label>Web UI URL</label>
                    <div style="position: relative; display: block; width: 100%;">
                        <input type="text" id="inline-url-${s.id}" value="${s.url ? s.url.replace(/"/g, '&quot;') : ''}" ${locked ? 'disabled' : ''} placeholder="e.g. http://localhost:3000" style="width: 100%; padding-right: 32px; box-sizing: border-box;">
                        <button class="btn-icon btn-inline-copy" data-copy="inline-url-${s.id}" title="Copy URL" style="position: absolute; right: 6px; top: 0; bottom: 0; margin: auto; height: 20px; width: 20px; padding: 2px; color: var(--text-secondary); background: transparent; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;">${ICONS.copy}</button>
                    </div>
                    
                    <div style="text-align: right; margin-top: 0px; ${locked ? 'display: none;' : ''}">
                        <button class="inline-btn" id="btn-save-${s.id}" title="Save config for this service" style="color: #ec7280; padding: 1px; display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px;">${ICONS.save}</button>
                    </div>
                </div>
            </div>
        `;
        
        li.draggable = true;
        li.addEventListener('dragstart', (e) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.closest('.service-details')) {
                e.preventDefault();
                return;
            }
            e.dataTransfer?.setData('text/plain', s.id);
            li.classList.add('dragging');
        });
        li.addEventListener('dragend', () => li.classList.remove('dragging'));
        li.addEventListener('dragover', (e) => {
            e.preventDefault();
            li.classList.add('drag-over');
        });
        li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
        li.addEventListener('drop', async (e) => {
            e.preventDefault();
            li.classList.remove('drag-over');
            const draggedId = e.dataTransfer?.getData('text/plain');
            if (draggedId && draggedId !== s.id) {
                const fromIdx = servicesList.findIndex(svc => svc.id === draggedId);
                const toIdx = servicesList.findIndex(svc => svc.id === s.id);
                if (fromIdx >= 0 && toIdx >= 0) {
                    const [moved] = servicesList.splice(fromIdx, 1);
                    servicesList.splice(toIdx, 0, moved);
                    renderServices();
                    await rpc.request.reorderServices({ services: servicesList });
                }
            }
        });
        
        const rowContentEl = li.querySelector(".service-row");
        rowContentEl?.addEventListener("click", async () => {
            selectService(s.id);
            if (s.url) {
                try {
                    await navigator.clipboard.writeText(s.url);
                    // Provide a brief visual feedback by changing the row's background momentarily
                    const originalBg = (rowContentEl as HTMLElement).style.backgroundColor;
                    (rowContentEl as HTMLElement).style.backgroundColor = "rgba(46, 204, 113, 0.1)"; // faint green
                    setTimeout(() => {
                        (rowContentEl as HTMLElement).style.backgroundColor = originalBg || "";
                    }, 300);
                } catch(e) {}
            }
        });
        
        rowContentEl?.addEventListener("dblclick", () => {
            expandedServices[s.id] = !expandedServices[s.id];
            renderServices();
            if (expandedServices[s.id] && !locked) {
                document.getElementById(`inline-name-${s.id}`)?.focus();
            }
        });
        
        listEl.appendChild(li);
        
        document.getElementById(`i-ex-${s.id}`)?.addEventListener("click", (e) => {
            e.stopPropagation();
            expandedServices[s.id] = !expandedServices[s.id];
            renderServices();
        });
        
        document.getElementById(`i-sg-${s.id}`)?.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (isLoading) return;
            loadingServices[s.id] = true;
            renderServices();
            if (isRunning) {
                await rpc.request.stopService({id: s.id});
            } else {
                // CLS Request
                logs[s.id] = "";
                if (activeServiceId === s.id) {
                    const lc = document.getElementById("log-content");
                    if (lc) lc.innerHTML = "";
                }
                await rpc.request.startService({id: s.id});
            }
        });
        document.getElementById(`i-re-${s.id}`)?.addEventListener("click", async (e) => {
            e.stopPropagation(); 
            // CLS Request
            logs[s.id] = "";
            if (activeServiceId === s.id) {
                const lc = document.getElementById("log-content");
                if (lc) lc.innerHTML = "";
            }
            loadingServices[s.id] = true;
            renderServices();
            await rpc.request.restartService({id: s.id});
        });
        document.getElementById(`i-pb-${s.id}`)?.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (locked) return;
            let targetPorts = s.ports;
            if (!targetPorts) {
                const guessed = guessPortFromLogs(logs[s.id]);
                if (guessed) targetPorts = guessed.toString();
            }
            if (targetPorts) {
                const btn = e.currentTarget as HTMLButtonElement;
                const originalText = btn.innerHTML;
                btn.innerHTML = ICONS.spinner;
                btn.disabled = true;
                loadingServices[s.id] = true;
                renderServices();
                await rpc.request.freePort({ ports: targetPorts });
                if (serviceStatuses[s.id] === "running") {
                    await rpc.request.stopService({ id: s.id });
                } else {
                    loadingServices[s.id] = false;
                    renderServices();
                }
            }
        });
        document.getElementById(`i-wb-${s.id}`)?.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (s.url) await rpc.request.openUrl({ url: s.url });
        });
        document.getElementById(`i-lk-${s.id}`)?.addEventListener("click", (e) => {
            e.stopPropagation();
            unlockedServices[s.id] = !unlockedServices[s.id];
            renderServices(); // update the locks
        });
        
        li.querySelectorAll(".btn-inline-copy").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const targetId = btn.getAttribute("data-copy");
                if (targetId) {
                    const input = document.getElementById(targetId) as HTMLInputElement;
                    if (input && input.value) {
                        try {
                            await navigator.clipboard.writeText(input.value);
                            const oldColor = (btn as HTMLElement).style.color;
                            (btn as HTMLElement).style.color = "var(--success)";
                            setTimeout(() => (btn as HTMLElement).style.color = oldColor, 1000);
                        } catch(err) {}
                    }
                }
            });
        });
        
        document.getElementById(`btn-save-${s.id}`)?.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (locked) return;
            const name = (document.getElementById(`inline-name-${s.id}`) as HTMLInputElement)?.value;
            const dir = (document.getElementById(`inline-dir-${s.id}`) as HTMLInputElement)?.value;
            const cmd = (document.getElementById(`inline-cmd-${s.id}`) as HTMLInputElement)?.value;
            const port = (document.getElementById(`inline-port-${s.id}`) as HTMLInputElement)?.value;
            const url = (document.getElementById(`inline-url-${s.id}`) as HTMLInputElement)?.value;
            if (name && dir && cmd) {
                const btn = e.currentTarget as HTMLButtonElement;
                const originalText = btn.innerHTML;
                btn.innerHTML = ICONS.spinner;
                btn.disabled = true;
                
                const payload = { id: s.id, name, dir, cmd, ports: port || undefined, url: url || undefined };
                await rpc.request.updateService(payload);
                await refreshServices();
                // If it was the selected one, select again to update log header
                if (activeServiceId === s.id) selectService(s.id);
                
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        });
        document.getElementById(`i-tr-${s.id}`)?.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (!locked && confirm(`Remove service ${s.name}?`)) {
                await rpc.request.removeService({id: s.id});
                if (activeServiceId === s.id) activeServiceId = null;
                await refreshServices();
                renderLog();
            }
        });
    });

    // Global Header Update
    let allRunning = servicesList.length > 0;
    let allStopped = servicesList.length > 0;
    let anyError = false;
    let anyLoading = false;

    servicesList.forEach(s => {
        const st = serviceStatuses[s.id] || "stopped";
        if (st !== "running") allRunning = false;
        if (st !== "stopped") allStopped = false;
        if (st === "error") anyError = true;
        if (st === "starting" || st === "stopping" || loadingServices[s.id]) anyLoading = true;
    });

    const gLed = document.getElementById("global-led");
    const gStart = document.getElementById("btn-global-start");
    const gStop = document.getElementById("btn-global-stop");

    if (gLed) {
        gLed.className = "led";
        if (allRunning) { gLed.classList.add("led-green"); gLed.title = "All right, all service are running"; }
        else if (allStopped) { gLed.classList.add("led-red"); gLed.title = "Services are all Sttoped"; }
        else { gLed.classList.add("led-orange"); gLed.title = "Some issue detect, Try Force Kill zombie button"; }
    }

    if (gStart) {
        gStart.style.opacity = (allRunning || anyLoading) ? "0.3" : "1";
        gStart.style.pointerEvents = (allRunning || anyLoading) ? "none" : "auto";
    }
    if (gStop) {
        gStop.style.opacity = (allStopped || anyLoading) ? "0.3" : "1";
        gStop.style.pointerEvents = (allStopped || anyLoading) ? "none" : "auto";
    }
}

async function refreshServices() {
    const data = await rpc.request.getServices();
    servicesList = data.services;
    serviceStatuses = data.statuses;
    renderServices();
}

rpc = Electroview.defineRPC<any>({
    maxRequestTime: 5000,
    handlers: {
        requests: {},
        messages: {
            serviceStatusChange: ({ id, status, cpu, mem, gpu, vram }: { id: string, status: ServiceStatus, cpu?: number, mem?: number, gpu?: number, vram?: number }) => {
                loadingServices[id] = false;
                const prevStatus = serviceStatuses[id];
                serviceStatuses[id] = status;
                
                if (cpu !== undefined && mem !== undefined) {
                    let cpuStr = Math.round(cpu) + "%";
                    let memMb = mem / 1024 / 1024;
                    let memStr = memMb > 500 ? (memMb / 1024).toFixed(1) + " Gb" : Math.round(memMb) + " Mb";
                    
                    let gpuStr = gpu !== undefined && gpu > 0 ? Math.round(gpu) + "%" : "0%";
                    let vramNb = vram !== undefined ? vram / 1024 / 1024 : 0;
                    let vramStr = vramNb > 500 ? (vramNb / 1024).toFixed(1) + " Gb" : Math.round(vramNb) + " Mb";

                    const val = `
                        <div style="display: flex; gap: 16px; margin-top: 2px;">
                            <div style="display: flex; flex-direction: column; align-items: center; width: 60px; white-space: nowrap;">
                                <span style="font-size: 8px; color: var(--text-secondary); text-transform: uppercase; font-weight: 600; margin-bottom: 2px;">CPU</span>
                                <span style="font-size: 0.95rem; font-weight: 800; color: var(--success); margin-bottom: 2px;">${cpuStr}</span>
                                <span style="font-size: 0.85rem; font-weight: 600; color: #a6accd;">${memStr}</span>
                            </div>
                            <div style="display: flex; flex-direction: column; align-items: center; width: 60px; white-space: nowrap;">
                                <span style="font-size: 8px; color: var(--text-secondary); text-transform: uppercase; font-weight: 600; margin-bottom: 2px;">GPU</span>
                                <span style="font-size: 0.95rem; font-weight: 800; color: var(--success); margin-bottom: 2px;">${gpuStr}</span>
                                <span style="font-size: 0.85rem; font-weight: 600; color: #a6accd;">${vramStr}</span>
                            </div>
                        </div>`;
                    metricCache[id] = val;
                    const el = document.getElementById(`metrics-${id}`);
                    if (el) el.innerHTML = val;
                }
                
                // ONLY trigger a full heavy re-render if the service state actually changed between running/stopped!
                if (prevStatus !== status) {
                    renderServices();
                }
            },
            serviceLog: ({ id, text, type }: {id: string, text: string, type: 'out'|'err'}) => {
                if (text === "<CLS>") {
                    logs[id] = "";
                    if (activeServiceId === id) {
                        const lc = document.getElementById("log-content");
                        if (lc) lc.innerHTML = "";
                    }
                    return;
                }

                // Strip raw ANSI escape syntax like [2m, [32m INFO[0m, \x1b[... etc
                const cleanText = text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\[\d+(;\d+)*m/g, '');
                
                if (!logs[id]) logs[id] = "";
                logs[id] += cleanText;
                // keep last 50000 chars roughly to prevent memory issues
                if (logs[id].length > 50000) logs[id] = logs[id].slice(-50000);
                
                if (activeServiceId === id) {
                    appendLogUI(cleanText);
                }
            },
            serviceMetrics: ({ id, cpu, mem, gpu, vram }: { id: string, cpu: number, mem: number, gpu?: number, vram?: number }) => {
                let cpuStr = Math.round(cpu) + "%";
                let memMb = mem / 1024 / 1024;
                let memStr = memMb > 500 ? (memMb / 1024).toFixed(1) + " Gb" : Math.round(memMb) + " Mb";
                
                let gpuStr = gpu !== undefined && gpu > 0 ? Math.round(gpu) + "%" : "0%";
                let vramNb = vram !== undefined ? vram / 1024 / 1024 : 0;
                let vramStr = vramNb > 500 ? (vramNb / 1024).toFixed(1) + " Gb" : Math.round(vramNb) + " Mb";

                const val = `
                    <div style="display: flex; gap: 16px; margin-top: 2px;">
                        <div style="display: flex; flex-direction: column; align-items: center; width: 60px; white-space: nowrap;">
                            <span style="font-size: 8px; color: var(--text-secondary); text-transform: uppercase; font-weight: 600; margin-bottom: 2px;">CPU</span>
                            <span style="font-size: 0.95rem; font-weight: 800; color: var(--success); margin-bottom: 2px;">${cpuStr}</span>
                            <span style="font-size: 0.85rem; font-weight: 600; color: #a6accd;">${memStr}</span>
                        </div>
                        <div style="display: flex; flex-direction: column; align-items: center; width: 60px; white-space: nowrap;">
                            <span style="font-size: 8px; color: var(--text-secondary); text-transform: uppercase; font-weight: 600; margin-bottom: 2px;">GPU</span>
                            <span style="font-size: 0.95rem; font-weight: 800; color: var(--success); margin-bottom: 2px;">${gpuStr}</span>
                            <span style="font-size: 0.85rem; font-weight: 600; color: #a6accd;">${vramStr}</span>
                        </div>
                    </div>`;
                
                // DIAGNOSTIC LOG: Print to terminal window to prove receipt
                if (!logs[id]) logs[id] = "";
                const hook = `\n> METRICS TICK: ${val} <\n`;
                logs[id] += hook;
                if (activeServiceId === id) {
                    const lc = document.getElementById("log-content");
                    if (lc) lc.innerHTML += hook;
                }

                metricCache[id] = val;
                const el = document.getElementById(`metrics-${id}`);
                if (el) el.innerHTML = val;
            },
            serviceClearLog: ({ id }: { id: string }) => {
                logs[id] = "";
                if (activeServiceId === id) {
                    const lc = document.getElementById("log-content");
                    if (lc) lc.innerHTML = "";
                }
            }
        }
    }
});

const electrobun = new Electrobun.Electroview({ rpc });

let isAutoQuitting = false;

document.getElementById("btn-quit-app")?.addEventListener("click", () => {
    document.getElementById("shutdown-overlay")?.classList.remove("hidden");
    
    let anyRunning = false;
    for (const id in serviceStatuses) {
        if (serviceStatuses[id] === "running" || serviceStatuses[id] === "starting") {
            anyRunning = true;
            rpc.request.stopService({ id });
        }
    }
    
    setTimeout(() => {
        rpc.request.shutdown(); // Must strictly match void args
    }, anyRunning ? 3000 : 800);
});

// Init
refreshServices().then(() => {
    if (servicesList.length > 0 && !activeServiceId) {
        selectService(servicesList[0].id);
    } else if (activeServiceId) {
        selectService(activeServiceId);
    }
});

// Sidebar Resizer Logic
const resizer = document.getElementById("sidebar-resizer");
const sidebar = document.querySelector(".sidebar") as HTMLElement;
let isResizing = false;

if (resizer && sidebar) {
    resizer.addEventListener("mousedown", (e) => {
        isResizing = true;
        resizer.classList.add("resizing");
        document.body.style.cursor = "ew-resize";
        // Empêche la sélection de texte pendant le drag
        document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", (e) => {
        if (!isResizing) return;
        const newWidth = e.clientX;
        if (newWidth > 200 && newWidth < 800) {
            sidebar.style.width = newWidth + "px";
        }
    });

    document.addEventListener("mouseup", () => {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove("resizing");
            document.body.style.cursor = "default";
            document.body.style.userSelect = "auto";
        }
    });
}



