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
        $res += ($p.Id.ToString() + ':' + $c.ToString() + ':' + $p.WorkingSet.ToString())
    }}
    Write-Output ($res -join '|')
    """
    
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
        cores = os.cpu_count() or 1
        
        results = {}
        if out_str:
            chunks = out_str.split('|')
            for c in chunks:
                if ':' in c:
                    parts = c.split(':')
                    if len(parts) == 3:
                        pid = parts[0]
                        cpu_time = float(parts[1].replace(',', '.')) if parts[1] else 0.0
                        mem = int(parts[2]) if parts[2] else 0
                        
                        prev = last_cpu_time.get(pid, cpu_time)
                        cpu_percent = ((cpu_time - prev) * 100.0) / cores
                        last_cpu_time[pid] = cpu_time
                        
                        results[pid] = {"cpu": cpu_percent, "mem": mem}
                        
        with open(METRICS_FILE, "w") as f:
            json.dump(results, f)
            
    except Exception:
        pass

while True:
    time.sleep(1)
    get_metrics()
