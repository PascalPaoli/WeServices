import ctypes
from ctypes.wintypes import DWORD, LONG, ULONG

class PROCESSENTRY32(ctypes.Structure):
    _fields_ = [
        ("dwSize", DWORD),
        ("cntUsage", DWORD),
        ("th32ProcessID", DWORD),
        ("th32DefaultHeapID", ctypes.POINTER(ULONG)),
        ("th32ModuleID", DWORD),
        ("cntThreads", DWORD),
        ("th32ParentProcessID", DWORD),
        ("pcPriClassBase", LONG),
        ("dwFlags", DWORD),
        ("szExeFile", ctypes.c_char * 260)
    ]

def get_process_children(parent_pids):
    kernel32 = ctypes.windll.kernel32
    TH32CS_SNAPPROCESS = 2
    hProcessSnap = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    pe32 = PROCESSENTRY32()
    pe32.dwSize = ctypes.sizeof(PROCESSENTRY32)
    
    parents = {}
    if kernel32.Process32First(hProcessSnap, ctypes.byref(pe32)):
        while True:
            parents[pe32.th32ProcessID] = pe32.th32ParentProcessID
            if not kernel32.Process32Next(hProcessSnap, ctypes.byref(pe32)):
                break
    kernel32.CloseHandle(hProcessSnap)
    
    # Map root -> all its descendant PIDs
    family_map = {}
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
        
    return family_map

# Test with current process
import os
print(get_process_children([os.getpid()]))
