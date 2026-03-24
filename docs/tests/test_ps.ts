// Test Powershell metrics script
import { spawn } from "bun";

function getStatsPS(pid: number) {
    return new Promise((resolve) => {
        const psCmd = `
        $proc = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
        if ($proc) {
            $cpu = $proc.CPU
            if ($null -eq $cpu) { $cpu = 0 }
            $mem = $proc.WorkingSet
            Write-Output "$cpu,$mem"
        } else {
            Write-Output "0,0"
        }
        `;
        const child = spawn(["pwsh", "-NoProfile", "-Command", psCmd], { stdout: "pipe" });
        
        // Timeout in case pwsh hangs
        const t = setTimeout(() => {
            child.kill();
            resolve({ cpuSec: 0, mem: 0 });
        }, 1500);

        (async () => {
            try {
                const out = await new Response(child.stdout).text();
                clearTimeout(t);
                const parts = out.trim().split(",");
                if (parts.length === 2) {
                    resolve({ cpuSec: parseFloat(parts[0]), mem: parseInt(parts[1]) });
                } else {
                    resolve({ cpuSec: 0, mem: 0 });
                }
            } catch(e) {
                clearTimeout(t);
                resolve({ cpuSec: 0, mem: 0 });
            }
        })();
    });
}

async function run() {
    console.log("Testing PID:", process.pid);
    const s1 = await getStatsPS(process.pid) as any;
    console.log("Tick 1:", s1);
    
    // burn cpu
    let x = 0; for(let i=0; i<100000; i++) x++;
    
    await new Promise(r => setTimeout(r, 1000));
    
    const s2 = await getStatsPS(process.pid) as any;
    console.log("Tick 2:", s2);
    
    const cpuDiff = s2.cpuSec - s1.cpuSec;
    console.log(`CPU Usage over 1s: ${(cpuDiff * 100).toFixed(1)}%`);
    console.log(`RAM: ${(s2.mem / 1024 / 1024).toFixed(1)} MB`);
}

run();
