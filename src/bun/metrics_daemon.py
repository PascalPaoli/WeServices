import time
import json
import subprocess
import os

PID_FILE = "C:/Temp/weservices_pids.json"
METRICS_FILE = "C:/Temp/weservices_metrics.json"

last_cpu_time = {}

def get_metrics():
    if not os.path.exists(PID_FILE):
        return

    try:
        with open(PID_FILE, "r") as f:
            pids = json.load(f)
    except Exception:
        return
        
    if not pids:
        return
        
    pid_str = ",".join(map(str, pids))
    ps_cmd = f"""
    $ErrorActionPreference = 'SilentlyContinue'
    $procs = Get-Process -Id {pid_str}
    $res = @()
    foreach ($p in $procs) {{
        $c = $p.CPU
        if ($null -eq $c) {{ $c = 0 }}
        $res += ($p.Id.ToString() + ':' + $c.ToString() + ':' + $p.WorkingSet64.ToString())
    }}
    Write-Output ($res -join '|')
    """
    
    gpu_metrics = {}
    try:
        out_vram = subprocess.check_output(["powershell", "-NoProfile", "-Command", "Get-WmiObject Win32_PerfFormattedData_GPUPerformanceCounters_GPUProcessMemory | ForEach-Object { $_.Name + ',' + $_.DedicatedUsage }"], universal_newlines=True, stderr=subprocess.DEVNULL, creationflags=0x08000000)
        for line in out_vram.strip().split('\n'):
            parts = line.split(',')
            if len(parts) == 2 and parts[0].startswith('pid_') and parts[1].strip().isdigit():
                pid_part = parts[0].split('_')[1]
                if pid_part.isdigit():
                    pid = int(pid_part)
                    vram_bytes = int(parts[1].strip())
                    if pid not in gpu_metrics: gpu_metrics[pid] = {'vram': 0, 'sm': 0.0}
                    gpu_metrics[pid]['vram'] += vram_bytes
    except Exception:
        pass
                
    try:
        out_sm = subprocess.check_output(["nvidia-smi", "pmon", "-c", "1", "-s", "u"], universal_newlines=True, stderr=subprocess.DEVNULL, creationflags=0x08000000)
        for line in out_sm.strip().split('\n'):
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
        proc = subprocess.Popen(
            ["powershell", "-NoProfile", "-Command", ps_cmd],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=0x08000000, # CREATE_NO_WINDOW
            encoding="utf-8"
        )
        out, _ = proc.communicate(timeout=2)
        out_str = out.strip() if out else ""
        cores = int(os.cpu_count() or 1)
        
        results = {}
        if out_str:
            chunks = out_str.split('|')
            for c in chunks:
                if ':' in c:
                    parts = c.split(':')
                    if len(parts) == 3:
                        pid = int(parts[0])
                        cpu_time = float(parts[1].replace(',', '.')) if parts[1] else 0.0
                        mem = int(parts[2]) if parts[2] else 0
                        
                        vram = gpu_metrics.get(pid, {}).get('vram', 0)
                        gpu_sm = gpu_metrics.get(pid, {}).get('sm', 0.0)
                        
                        prev = last_cpu_time.get(pid, cpu_time)
                        cpu_percent = ((cpu_time - prev) * 100.0) / cores
                        last_cpu_time[pid] = cpu_time
                        
                        results[pid] = {"cpu": cpu_percent, "mem": mem, "gpu": gpu_sm, "vram": vram}
                        
        with open(METRICS_FILE, "w") as f:
            json.dump(results, f)
            
    except Exception:
        pass

while True:
    time.sleep(1)
    get_metrics()
