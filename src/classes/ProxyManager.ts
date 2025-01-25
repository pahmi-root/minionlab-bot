import fs from "fs";

export class ProxyManager {
  public proxies: string[] = [];

  loadProxies(): void {
    if (!fs.existsSync("proxy.txt")) {
      console.error("proxy.txt not found. Please add the file with proxy data.");
      process.exit(1);
    }

    try {
      const data = fs.readFileSync("proxy.txt", "utf8");
      this.proxies = data
        .split("\n")
        .map((line: string) => line.trim())
        .filter((line: string) => line);
    } catch (err) {
      console.error("Failed to load proxies:", err);
    }
  }

  normalizeProxyUrl(proxy: string): string {
    if (!proxy.startsWith("http://") && !proxy.startsWith("https://")) {
      proxy = "http://" + proxy;
    }
    return proxy;
  }
}