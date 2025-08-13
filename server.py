import subprocess
import re

port = 8000

def get_private_ip():
    try:
        result = subprocess.run("ipconfig", capture_output=True, text=True, shell=True)
        ipv4s = re.findall(r"IPv4.*?:\s*([\d.]+)", result.stdout)
        private_ips = [ip for ip in ipv4s if (
            ip.startswith("192.168.") or 
            ip.startswith("10.") or
            (ip.startswith("172.") and 16 <= int(ip.split(".")[1]) <= 31)
        )]
        for ip in private_ips:
            if ip.startswith("192.168."):
                return ip
        return private_ips[0] if private_ips else None
    except Exception as e:
        return None

if __name__ == "__main__":
    ip = get_private_ip()
    if ip:
        print(f"Server Running On: http://{ip}:{port}\n")
    else:
        print("Could not detect local IPv4 address.")
    try:
        subprocess.run(["python", "-m", "http.server", str(port)])
    except KeyboardInterrupt:
        print("\nServer stopped.")