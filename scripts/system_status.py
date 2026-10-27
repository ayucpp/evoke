#!/usr/bin/env python3
"""
EVOKE Sample Script — System & Environment Diagnostic Utility
Executed when configured on keypad keys (e.g., K4 or K12).
"""

import sys
import os
import platform
import time
import shutil

def get_system_summary():
    uname = platform.uname()
    load = os.getloadavg() if hasattr(os, 'getloadavg') else (0, 0, 0)
    print("=" * 48)
    print("   EVOKE SYSTEM STATUS")
    print("=" * 48)
    print(f"OS / Kernel : {uname.system} {uname.release} ({uname.machine})")
    print(f"Node / Host : {uname.node}")
    print(f"Local Time  : {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"1m/5m/15m   : {load[0]:.2f}, {load[1]:.2f}, {load[2]:.2f}")
    print("Status      : System nominal. Keypad connected.")
    print("=" * 48)

def get_memory_stats():
    print("=" * 48)
    print("   EVOKE MEMORY & STORAGE STATS")
    print("=" * 48)
    try:
        total, used, free = shutil.disk_usage("/")
        print(f"Disk Total  : {total // (2**30)} GB")
        print(f"Disk Used   : {used // (2**30)} GB ({int(used/total*100)}%)")
        print(f"Disk Free   : {free // (2**30)} GB")
    except Exception as e:
        print(f"Disk Query Error: {e}")

    try:
        with open("/proc/meminfo", "r") as f:
            lines = [line.strip() for line in f if "MemTotal" in line or "MemAvailable" in line]
            for l in lines:
                print(f"Memory      : {l}")
    except Exception:
        pass
    print("=" * 48)

def main():
    if "--memory" in sys.argv:
        get_memory_stats()
    elif "--summary" in sys.argv:
        get_system_summary()
    else:
        print(f"EVOKE script called with args: {sys.argv[1:]}")
        get_system_summary()

if __name__ == "__main__":
    main()
