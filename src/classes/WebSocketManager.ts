import axios from "axios";
import chalk from "chalk";
import { HttpsProxyAgent } from "https-proxy-agent";
import WebSocket from "ws";
import { AccountManager } from "./AccountManager";
import { ProxyManager } from "./ProxyManager";

export class WebSocketManager {
  private sockets: WebSocket[] = [];
  private lastUpdateds: string[] = [];
  private emails: string[] = [];
  private messages: string[] = [];
  private userIds: string[] = [];
  private browserIds: string[] = [];
  private accessTokens: string[] = [];

  constructor(
    private accountManager: AccountManager,
    private proxyManager: ProxyManager
  ) {}

  initialize(useProxy: boolean): void {
    for (let i = 0; i < this.accountManager.accounts.length; i++) {
      this.getUserId(i, useProxy);
    }
  }

  private generateBrowserId(index: number): string {
    return `browserId-${index}-${Math.random().toString(36).substring(2, 15)}`;
  }

  private async getUserId(index: number, useProxy: boolean): Promise<void> {
    const loginUrl = "https://api.allstream.ai/web/v1/auth/emailLogin";
    const proxy = this.proxyManager.proxies[index % this.proxyManager.proxies.length];
    const agent =
      useProxy && proxy
        ? new HttpsProxyAgent(this.proxyManager.normalizeProxyUrl(proxy))
        : undefined;

    try {
      const response = await axios.post(
        loginUrl,
        {
          email: this.accountManager.accounts[index].email,
          password: this.accountManager.accounts[index].password,
        },
        {
          httpsAgent: agent,
          headers: {
            Authorization: `Bearer ${this.accessTokens[index]}`,
            "Content-Type": "application/json",
          },
        }
      );

      const { data } = response.data;
      this.emails[index] = data.user.email;
      this.userIds[index] = data.user.uuid;
      this.accessTokens[index] = data.token;
      this.browserIds[index] = this.generateBrowserId(index);
      this.messages[index] = "Connected successfully";

      await this.connectWebSocket(index, useProxy);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error for Account ${index + 1}:`, error.message);
      } else {
        console.error("An unknown error occurred:", error);
      }
    }
  }

  private async connectWebSocket(index: number, useProxy: boolean): Promise<void> {
    if (this.sockets[index]) return;
    const url = "wss://gw0.streamapp365.com/connect";

    const proxy = this.proxyManager.proxies[index % this.proxyManager.proxies.length];
    const agent =
      useProxy && proxy
        ? new HttpsProxyAgent(this.proxyManager.normalizeProxyUrl(proxy))
        : undefined;

    const wsOptions = agent ? { agent } : {};
    this.sockets[index] = new WebSocket(url, wsOptions);

    this.sockets[index].onopen = async () => {
      this.lastUpdateds[index] = new Date().toISOString();
      console.log(`Account ${index + 1} Connected`, this.lastUpdateds[index]);
      this.sendRegisterMessage(index);
      this.startPinging(index, useProxy);
    };

    this.sockets[index].onmessage = async (event) => {
      let rawData = event.data.toString();
    
      if (rawData.startsWith("{") && rawData.endsWith("}")) {
        try {
          const message = JSON.parse(rawData);
          await this.handleMessage(index, message);
        } catch (error) {
          console.error(`Error parsing JSON:`, error);
        }
      }
    };
    
    this.sockets[index].onclose = () => {
      console.log(`Account ${index + 1} Disconnected`);
      this.reconnectWebSocket(index, useProxy);
    };

    this.sockets[index].onerror = (error) => {
      console.error(`WebSocket error for Account ${index + 1}:`, error);
    };
  }

  private async reconnectWebSocket(index: number, useProxy: boolean): Promise<void> {
    const url = "wss://gw0.streamapp365.com/connect";
    const proxy = this.proxyManager.proxies[index % this.proxyManager.proxies.length];
    const agent =
      useProxy && proxy
        ? new HttpsProxyAgent(this.proxyManager.normalizeProxyUrl(proxy))
        : undefined;

    if (this.sockets[index]) {
      this.sockets[index].removeAllListeners();
    }

    const wsOptions = agent ? { agent } : {};
    this.sockets[index] = new WebSocket(url, wsOptions);

    this.sockets[index].onopen = async () => {
      this.lastUpdateds[index] = new Date().toISOString();
      console.log(`Account ${index + 1} Reconnected`, this.lastUpdateds[index]);
      this.sendRegisterMessage(index);
      this.startPinging(index, useProxy);
    };

    this.sockets[index].onclose = () => {
      console.log(`Account ${index + 1} Disconnected again`);
      setTimeout(() => {
        this.reconnectWebSocket(index, useProxy);
      }, 5000);
    };

    this.sockets[index].onerror = (error) => {
      console.error(`WebSocket error for Account ${index + 1}:`, error);
    };
  }

  private sendRegisterMessage(index: number): void {
    if (this.sockets[index] && this.sockets[index].readyState === WebSocket.OPEN) {
      const message = {
        type: "register",
        user: this.userIds[index],
        dev: this.browserIds[index],
      };

      this.sockets[index].send(JSON.stringify(message));
      console.log(
        chalk.green(
          `Successfully registered browser, continuing to ping socket...\n`
        )
      );
    } else {
      console.error(
        `WebSocket not open for Account ${index + 1}. Unable to send message.`
      );
    }
  }

  private async handleMessage(index: number, message: any): Promise<void> {
    if (message.type === "request") {
        const { taskid, data } = message;
        const { method, url, headers, body, timeout } = data;

        try {
            const response = await fetch(url, {
                method,
                headers,
                body: method === "POST" ? body : undefined,
                signal: AbortSignal.timeout(timeout),
            });

            this.sockets[index].send(
                JSON.stringify({
                    type: "response",
                    taskid,
                    result: {
                        parsed: "", 
                        html: "JTdCJTIyY291bnRyeSUyMiUzQSUyMklEJTIyJTJDJTIyYXNuJTIyJTNBJTdCJTIyYXNudW0lMjIlM0E5MzQxJTJDJTIyb3JnX25hbWUlMjIlM0ElMjJQVCUyMElORE9ORVNJQSUyMENPTU5FVFMlMjBQTFVTJTIyJTdEJTJDJTIyZ2VvJTIyJTNBJTdCJTIyY2l0eSUyMiUzQSUyMiUyMiUyQyUyMnJlZ2lvbiUyMiUzQSUyMiUyMiUyQyUyMnJlZ2lvbl9uYW1lJTIyJTNBJTIyJTIyJTJDJTIycG9zdGFsX2NvZGUlMjIlM0ElMjIlMjIlMkMlMjJsYXRpdHVkZSUyMiUzQS02LjE3NSUyQyUyMmxvbmdpdHVkZSUyMiUzQTEwNi44Mjg2JTJDJTIydHolMjIlM0ElMjJBc2lhJTJGSmFrYXJ0YSUyMiU3RCU3RA==",
                        rawStatus: response.status,
                    },
                })
            );
        } catch (error: any) {
            this.sockets[index].send(
                JSON.stringify({
                    type: "error",
                    taskid,
                    error: error.message,
                    errorCode: 50000001,
                    rawStatus: 500,
                })
            );
        }
    } else {
        console.log(`Account ${index + 1} - Unhandled message type:`, message.type);
    }
}

  private startPinging(index: number, useProxy: boolean): void {
    const pingServer = async () => {
      if (this.sockets[index] && this.sockets[index].readyState === WebSocket.OPEN) {
        const proxy = this.proxyManager.proxies[index % this.proxyManager.proxies.length];
        const agent =
          useProxy && proxy
            ? new HttpsProxyAgent(this.proxyManager.normalizeProxyUrl(proxy))
            : undefined;

        this.sockets[index].send(JSON.stringify({ type: "ping" }));
        await this.getPoint(index, useProxy);
      }

      setTimeout(pingServer, 60000);
    };

    pingServer();
  }

  private async getPoint(index: number, useProxy: boolean): Promise<void> {
    const pointUrl = `https://api.allstream.ai/web/v1/dashBoard/info`;
    const proxy = this.proxyManager.proxies[index % this.proxyManager.proxies.length];
    const agent =
      useProxy && proxy
        ? new HttpsProxyAgent(this.proxyManager.normalizeProxyUrl(proxy))
        : undefined;

    try {
      const response = await axios.get(pointUrl, {
        httpsAgent: agent,
        headers: {
          Authorization: `Bearer ${this.accessTokens[index]}`,
          "Content-Type": "application/json",
        },
      });

      const { data } = response.data;
      this.messages[index] = `Successfully retrieved data: Total Points = ${
        data.totalScore ?? 0
      }, Today Points = ${data.todayScore ?? 0}`;

      console.log(
        chalk.green(`Account ${index + 1} - Successfully PING the Server:\n`) +
          this.messages[index]
      );
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error for Account ${index + 1}:`, error.message);
      } else {
        console.error("An unknown error occurred:", error);
      }
    }
  }
}