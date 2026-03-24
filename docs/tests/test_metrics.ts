import pidtree from "pidtree";
import pidusage from "pidusage";

console.log("=== METRICS TEST ===");

const myPid = process.pid;
console.log(`My PID: ${myPid}`);

async function run() {
    try {
        console.log("Fetching pidtree...");
        
        // Timeout wrapper logic to prove hanging
        const treePromise = pidtree(myPid, { root: true });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("PIDTREE HUNG ON WINDOWS WMI!")), 5000));
        
        const pids = await Promise.race([treePromise, timeoutPromise]) as number[];
        
        console.log(`Found array length: ${pids?.length || 0}`);
        
        console.log("Fetching pidusage...");
        const stats = await pidusage(pids);
        
        console.log("SUCCESS:", Object.keys(stats).length, "stats retrieved.");
        
    } catch (e: any) {
        console.error("FATAL ERROR:", e.message);
    }
    process.exit(0);
}

run();
