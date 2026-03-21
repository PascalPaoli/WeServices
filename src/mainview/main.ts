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
}

export type AppRPC = {
    bun: {
        requests: {
            getServices: { params: void, response: { services: ServiceDef[], statuses: Record<string, ServiceStatus> } };
            startService: { params: { id: string }, response: { success: boolean, error?: string } };
            stopService: { params: { id: string }, response: { success: boolean, error?: string } };
            restartService: { params: { id: string }, response: { success: boolean, error?: string } };
            addService: { params: { name: string, dir: string, cmd: string }, response: { id: string, success: boolean, error?: string } };
            updateService: { params: { id: string, name: string, dir: string, cmd: string }, response: { success: boolean, error?: string } };
            removeService: { params: { id: string }, response: { success: boolean, error?: string } };
            getSettings: { params: void, response: { settings: any } };
            updateSettings: { params: { settings: any }, response: { success: boolean } };
        };
        messages: {};
    };
    webview: {
        requests: {};
        messages: {
            serviceStatusChange: { id: string, status: ServiceStatus };
            serviceLog: { id: string, text: string, type: 'out' | 'err' };
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
    edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`,
    plumber: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
    lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`,
    unlock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`,
    spinner: `<span class="spinner-wrapper" style="display: inline-flex; justify-content: center; align-items: center; width: 14px; height: 14px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg></span>`,
    chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`,
    broom: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
    settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`
};

const app = document.getElementById("app")!;

app.innerHTML = `
    <div class="app-container">
        <aside class="sidebar">
            <div class="sidebar-header">
                <h2>WeServices</h2>
                <div style="display: flex; align-items: center; justify-content: center;">
                    <button id="btn-settings" class="btn-icon" style="margin-right: 12px; display: flex; width: 24px; height: 24px;" title="Settings">
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                    </button>
                    <button id="btn-add-service" class="btn-icon" title="Add Service" style="display: flex; align-items: center; justify-content: center; width: 24px; height: 24px;">➕</button>
                </div>
            </div>
            <ul id="service-list" class="service-list"></ul>
        </aside>
        <main class="main-content">
            <header class="content-header" id="content-header" style="display: none;">
                <div class="header-info">
                    <h2 id="current-service-name">Service Name</h2>
                    <div id="current-service-cmd" class="cmd-text"></div>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; justify-content: flex-end; gap: 8px;">
                    <div style="color: #ffffff; font-size: 1.15rem; font-weight: 600; letter-spacing: 0.3px; margin-right: 2px;">All Services</div>
                    <div class="header-actions" style="display: flex; align-items: center; gap: 2px;">
                        <button class="btn-xxl-icon" id="btn-global-start" title="Start All" style="color: var(--success);">${ICONS.start}</button>
     <button class="btn-xxl-icon" id="btn-global-stop" title="Stop All" style="color: var(--danger);">${ICONS.stop}</button>
                        <button class="btn-xxl-icon" id="btn-cleanup" title="Force Clean Zombies" style="color: var(--warning);">${ICONS.broom || '🧹'}</button>
                        <div id="global-led" class="led led-red" style="width: 12px; height: 12px; margin-left: 14px;"></div>
                    </div>
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
                <div class="modal-actions">
                    <button class="btn btn-primary" id="btn-close-settings">Close</button>
                </div>
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

document.getElementById("btn-add-service")!.addEventListener("click", () => {
    modalMode = "add";
    modalTitle.textContent = "Add New Service";
    inputName.value = "";
    inputDir.value = "";
    inputCmd.value = "";
    inputPort.value = "";
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

let currentSettings = { autoStartServices: false, autoStartApp: false };

document.getElementById("btn-settings")!.addEventListener("click", async () => {
    const res = await rpc.request.getSettings();
    currentSettings = res.settings;
    chkAutoStartServices.checked = currentSettings.autoStartServices;
    chkAutoStartApp.checked = currentSettings.autoStartApp;
    settingsOverlay.classList.remove("hidden");
});

document.getElementById("btn-close-settings")!.addEventListener("click", () => {
    settingsOverlay.classList.add("hidden");
});

const handleSaveSettings = async () => {
    currentSettings.autoStartServices = chkAutoStartServices.checked;
    currentSettings.autoStartApp = chkAutoStartApp.checked;
    await rpc.request.updateSettings({ settings: currentSettings });
};

chkAutoStartServices.addEventListener("change", handleSaveSettings);
chkAutoStartApp.addEventListener("change", handleSaveSettings);

document.getElementById("btn-submit-add")!.addEventListener("click", async () => {
    const name = inputName.value;
    const dir = inputDir.value;
    const cmd = inputCmd.value;
    const ports = inputPort.value ? inputPort.value : undefined;
    if (!name || !dir || !cmd) return alert("All fields are required");

    if (modalMode === "add") {
        await rpc.request.addService({ name, dir, cmd, ports });
    }
    
    modalOverlay.classList.add("hidden");
    await refreshServices();
    if (activeServiceId) {
        selectService(activeServiceId);
    }
});

document.getElementById("btn-global-startstop")?.addEventListener("click", async () => {
    let allRunning = servicesList.length > 0;
    servicesList.forEach(s => {
        if (serviceStatuses[s.id] !== "running") allRunning = false;
    });
    
    if (allRunning) {
        // Stop all
        await Promise.all(servicesList.map(s => {
            if (serviceStatuses[s.id] === "running") {
                return rpc.request.stopService({ id: s.id });
            }
        }));
    } else {
        // Start all stopped
        await Promise.all(servicesList.map(s => {
            if (serviceStatuses[s.id] !== "running") {
                return rpc.request.startService({ id: s.id });
            }
        }));
    }
});

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

function renderServices() {
    listEl.innerHTML = "";
    servicesList.forEach(s => {
        const li = document.createElement("li");
        li.className = `service-item ${s.id === activeServiceId ? 'active' : ''}`;
        li.id = `item-${s.id}`;
        
        const status = serviceStatuses[s.id] || "stopped";
        let ledClass = "led-red";
        if (status === "running") ledClass = "led-green";
        else if (status === "starting" || status === "stopping") ledClass = "led-orange";
        else if (status === "error") ledClass = "led-orange";

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
                    <div class="led ${ledClass}"></div>
                    <span class="service-name">${s.name}</span>
                </div>
                <div class="service-actions-grid">
                   <button class="inline-btn" id="i-sg-${s.id}" title="${isRunning?'Stop':'Start'}" style="color:${startStopColor}">${startStopIcon}</button>
                   <button class="inline-btn" id="i-re-${s.id}" title="Restart" ${isRunning?'':'disabled'}>${ICONS.restart}</button>
                   <button class="inline-btn" id="i-lk-${s.id}" title="${locked?'Unlock':'Lock'}">${locked ? ICONS.lock : ICONS.unlock}</button>
                   <button class="inline-btn ${locked ? 'dim' : ''}" id="i-ed-${s.id}" title="Edit" ${locked?'disabled':''}>${ICONS.edit}</button>
                   <button class="inline-btn ${locked ? 'dim' : ''}" id="i-pb-${s.id}" title="Force Kill Zombie" ${locked?'disabled':''}>${ICONS.plumber}</button>
                   <button class="inline-btn ${locked ? 'dim' : ''}" id="i-tr-${s.id}" title="Delete" ${locked?'disabled':''}>${ICONS.trash}</button>
                </div>
            </div>
            <div class="service-details ${isExpanded ? '' : 'hidden'}">
                <div class="inline-edit-form">
                    <label>Name</label>
                    <input type="text" id="inline-name-${s.id}" value="${s.name.replace(/"/g, '&quot;')}" ${locked ? 'disabled' : ''}>
                    <label>Directory</label>
                    <input type="text" id="inline-dir-${s.id}" value="${s.dir.replace(/"/g, '&quot;')}" ${locked ? 'disabled' : ''}>
                    <label>Command</label>
                    <input type="text" id="inline-cmd-${s.id}" value="${s.cmd.replace(/"/g, '&quot;')}" ${locked ? 'disabled' : ''}>
                    <label>Ports</label>
                    <input type="text" id="inline-port-${s.id}" value="${s.ports ? s.ports.replace(/"/g, '&quot;') : ''}" ${locked ? 'disabled' : ''} placeholder="e.g. 3030">
                    <div style="text-align: right; margin-top: 6px; ${locked ? 'display: none;' : ''}">
                        <button class="btn btn-primary" id="btn-save-${s.id}" style="padding: 4px 12px; font-size: 12px;">Save</button>
                    </div>
                </div>
            </div>
        `;
        
        li.draggable = true;
        li.addEventListener('dragstart', (e) => {
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
        
        li.querySelector(".service-row")?.addEventListener("click", () => selectService(s.id));
        li.querySelector(".service-row")?.addEventListener("dblclick", () => {
            if (!locked) {
                expandedServices[s.id] = true;
                renderServices();
                document.getElementById(`inline-name-${s.id}`)?.focus();
            } else {
                expandedServices[s.id] = !expandedServices[s.id];
                renderServices();
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
            if (isRunning) await rpc.request.stopService({id: s.id});
            else await rpc.request.startService({id: s.id});
        });
        document.getElementById(`i-re-${s.id}`)?.addEventListener("click", async (e) => {
            e.stopPropagation(); 
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
                const old = btn.innerHTML;
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
        document.getElementById(`i-lk-${s.id}`)?.addEventListener("click", (e) => {
            e.stopPropagation();
            unlockedServices[s.id] = !unlockedServices[s.id];
            renderServices(); // update the locks
        });
        document.getElementById(`i-ed-${s.id}`)?.addEventListener("click", (e) => {
            e.stopPropagation();
            if (!locked) {
                expandedServices[s.id] = true;
                renderServices();
                document.getElementById(`inline-name-${s.id}`)?.focus();
            }
        });
        
        document.getElementById(`btn-save-${s.id}`)?.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (locked) return;
            const name = (document.getElementById(`inline-name-${s.id}`) as HTMLInputElement)?.value;
            const dir = (document.getElementById(`inline-dir-${s.id}`) as HTMLInputElement)?.value;
            const cmd = (document.getElementById(`inline-cmd-${s.id}`) as HTMLInputElement)?.value;
            const port = (document.getElementById(`inline-port-${s.id}`) as HTMLInputElement)?.value;
            if (name && dir && cmd) {
                const btn = e.currentTarget as HTMLButtonElement;
                const old = btn.innerHTML;
                btn.innerHTML = 'Saving...';
                btn.disabled = true;
                
                await rpc.request.updateService({ id: s.id, name, dir, cmd, ports: port || undefined });
                await refreshServices();
                // If it was the selected one, select again to update log header
                if (activeServiceId === s.id) selectService(s.id);
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
            serviceStatusChange: ({ id, status }: { id: string, status: ServiceStatus }) => {
                loadingServices[id] = false;
                serviceStatuses[id] = status;
                renderServices();
            },
            serviceLog: ({ id, text, type }: {id: string, text: string, type: 'out'|'err'}) => {
                // Strip raw ANSI escape syntax like [2m, [32m INFO[0m, \x1b[... etc
                const cleanText = text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\[\d+(;\d+)*m/g, '');
                
                if (!logs[id]) logs[id] = "";
                logs[id] += cleanText;
                // keep last 50000 chars roughly to prevent memory issues
                if (logs[id].length > 50000) logs[id] = logs[id].slice(-50000);
                
                if (activeServiceId === id) {
                    // appending is faster than re-rendering whole string for large logs
                    appendLogUI(cleanText);
                }
            }
        }
    }
});

const electrobun = new Electrobun.Electroview({ rpc });

window.addEventListener("beforeunload", () => {
    // Tell the backend to kill all managed services instantly!
    rpc.request.shutdown();
});

// Init
refreshServices().then(() => {
    if (servicesList.length > 0 && !activeServiceId) {
        selectService(servicesList[0].id);
    } else if (activeServiceId) {
        selectService(activeServiceId);
    }
});
