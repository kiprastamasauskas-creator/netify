import socket

target_host = "127.0.0.1"

# A list of common ports a Red Teamer always checks
ports_to_scan = range(1, 10001)

print(f"[*] Starting multi-port scan on target: {target_host}\n")

# The loop: Python will repeat this block for every port in our list
for port in ports_to_scan:
    # 1. Create a fresh socket for each port probe
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(0.05)
    
    # 2. Probe the port
    result = s.connect_ex((target_host, port))
    
    # 3. Report the finding
    if result == 0:
        print(f"[+] ALERT: Port {port} is OPEN! 🔥")
    else:
        print(f"[-] Port {port} is closed.")
        
    # 4. Clean up the connection before checking the next port
    s.close()

print("\n[*] Scan complete. Target mapping finished.")