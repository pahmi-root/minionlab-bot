import axios from "axios";
import chalk from "chalk";
import { HttpsProxyAgent } from "https-proxy-agent";
import WebSocket from "ws";
import { AccountManager } from "./AccountManager";
import { ProxyManager } from "./ProxyManager";

export class WebSocketManager {
  private sockets: WebSocket[][] = [];
  private lastUpdateds: string[][] = [];
  private emails: string[] = [];
  private messages: string[][] = [];
  private userIds: string[] = [];
  private browserIds: string[][] = [];
  private accessTokens: string[] = [];

  constructor(
    private accountManager: AccountManager,
    private proxyManager: ProxyManager
  ) {}

  initialize(useProxy: boolean): void {
    for (let i = 0; i < this.accountManager.accounts.length; i++) {
      this.sockets[i] = [];
      this.lastUpdateds[i] = [];
      this.messages[i] = [];
      this.browserIds[i] = [];

      for (let j = 0; j < this.proxyManager.proxies.length; j++) {
        this.getUserId(i, j, useProxy);
      }
    }
  }

  private generateBrowserId(): string {
    const characters = 'abcdef0123456789';
    let browserId = '';
    for (let i = 0; i < 32; i++) {
      browserId += characters[Math.floor(Math.random() * characters.length)];
    }
    return browserId;
  }

  private async getUserId(accountIndex: number, proxyIndex: number, useProxy: boolean): Promise<void> {
    const loginUrl = "https://api.allstream.ai/web/v1/auth/emailLogin";
    const proxy = this.proxyManager.proxies[proxyIndex];
    const agent =
      useProxy && proxy
        ? new HttpsProxyAgent(this.proxyManager.normalizeProxyUrl(proxy))
        : undefined;

    try {
      const response = await axios.post(
        loginUrl,
        {
          email: this.accountManager.accounts[accountIndex].email,
          password: this.accountManager.accounts[accountIndex].password,
        },
        {
          httpsAgent: agent,
          headers: {
            Authorization: `Bearer ${this.accessTokens[accountIndex]}`,
            "Content-Type": "application/json",
          },
        }
      );

      const { data } = response.data;
      this.emails[accountIndex] = data.user.email;
      this.userIds[accountIndex] = data.user.uuid;
      this.accessTokens[accountIndex] = data.token;
      this.browserIds[accountIndex][proxyIndex] = this.generateBrowserId();
      this.messages[accountIndex][proxyIndex] = "Connected successfully";

      console.log(`Account ${accountIndex + 1} connected successfully with proxy ${proxyIndex + 1}`);
      await this.connectWebSocket(accountIndex, proxyIndex, useProxy);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error for Account ${accountIndex + 1} with proxy ${proxyIndex + 1}:`, error.message);
      } else {
        console.error("An unknown error occurred:", error);
      }
    }
  }

  private async connectWebSocket(accountIndex: number, proxyIndex: number, useProxy: boolean): Promise<void> {
    if (this.sockets[accountIndex][proxyIndex]) return;
    const url = "wss://gw0.streamapp365.com/connect";

    const proxy = this.proxyManager.proxies[proxyIndex];
    const agent =
      useProxy && proxy
        ? new HttpsProxyAgent(this.proxyManager.normalizeProxyUrl(proxy))
        : undefined;

    const wsOptions = agent ? { agent } : {};
    this.sockets[accountIndex][proxyIndex] = new WebSocket(url, wsOptions);

    this.sockets[accountIndex][proxyIndex].onopen = async () => {
      this.lastUpdateds[accountIndex][proxyIndex] = new Date().toISOString();
      console.log(`Account ${accountIndex + 1} Connected with proxy ${proxyIndex + 1}`, this.lastUpdateds[accountIndex][proxyIndex]);
      this.sendRegisterMessage(accountIndex, proxyIndex);
      this.startPinging(accountIndex, proxyIndex, useProxy);
    };

    this.sockets[accountIndex][proxyIndex].onmessage = async (event) => {
      let rawData = event.data.toString();
    
      if (rawData.startsWith("{") && rawData.endsWith("}")) {
        try {
          const message = JSON.parse(rawData);
          await this.handleMessage(accountIndex, proxyIndex, message);
        } catch (error) {
          console.error(`Error parsing JSON:`, error);
        }
      }
    };
    
    this.sockets[accountIndex][proxyIndex].onclose = () => {
      console.log(`Account ${accountIndex + 1} Disconnected with proxy ${proxyIndex + 1}`);
      this.reconnectWebSocket(accountIndex, proxyIndex, useProxy);
    };

    this.sockets[accountIndex][proxyIndex].onerror = (error) => {
      console.error(`WebSocket error for Account ${accountIndex + 1} with proxy ${proxyIndex + 1}:`, error);
    };
  }

  private async reconnectWebSocket(accountIndex: number, proxyIndex: number, useProxy: boolean): Promise<void> {
    const url = "wss://gw0.streamapp365.com/connect";
    const proxy = this.proxyManager.proxies[proxyIndex];
    const agent =
      useProxy && proxy
        ? new HttpsProxyAgent(this.proxyManager.normalizeProxyUrl(proxy))
        : undefined;

    if (this.sockets[accountIndex][proxyIndex]) {
      this.sockets[accountIndex][proxyIndex].removeAllListeners();
    }

    const wsOptions = agent ? { agent } : {};
    this.sockets[accountIndex][proxyIndex] = new WebSocket(url, wsOptions);

    this.sockets[accountIndex][proxyIndex].onopen = async () => {
      this.lastUpdateds[accountIndex][proxyIndex] = new Date().toISOString();
      console.log(`Account ${accountIndex + 1} Reconnected with proxy ${proxyIndex + 1}`, this.lastUpdateds[accountIndex][proxyIndex]);
      this.sendRegisterMessage(accountIndex, proxyIndex);
      this.startPinging(accountIndex, proxyIndex, useProxy);
    };

    this.sockets[accountIndex][proxyIndex].onclose = () => {
      console.log(`Account ${accountIndex + 1} Disconnected again with proxy ${proxyIndex + 1}`);
      setTimeout(() => {
        this.reconnectWebSocket(accountIndex, proxyIndex, useProxy);
      }, 5000);
    };

    this.sockets[accountIndex][proxyIndex].onerror = (error) => {
      console.error(`WebSocket error for Account ${accountIndex + 1} with proxy ${proxyIndex + 1}:`, error);
    };
  }

  private sendRegisterMessage(accountIndex: number, proxyIndex: number): void {
    if (this.sockets[accountIndex][proxyIndex] && this.sockets[accountIndex][proxyIndex].readyState === WebSocket.OPEN) {
      const message = {
        type: "register",
        user: this.userIds[accountIndex],
        dev: this.browserIds[accountIndex][proxyIndex],
      };

      this.sockets[accountIndex][proxyIndex].send(JSON.stringify(message));
      console.log(
        chalk.green(
          `Successfully registered browser for Account ${accountIndex + 1} with proxy ${proxyIndex + 1}, ID: ${this.browserIds[accountIndex][proxyIndex]}, continuing to ping socket...\n`
        )
      );
    } else {
      console.error(
        `WebSocket not open for Account ${accountIndex + 1} with proxy ${proxyIndex + 1}. Unable to send message.`
      );
    }
  }

  private async handleMessage(accountIndex: number, proxyIndex: number, message: any): Promise<void> {
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

            this.sockets[accountIndex][proxyIndex].send(
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
            this.sockets[accountIndex][proxyIndex].send(
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
        console.log(`Account ${accountIndex + 1} with proxy ${proxyIndex + 1} - Unhandled message type:`, message.type);
    }
}

  private startPinging(accountIndex: number, proxyIndex: number, useProxy: boolean): void {
    const pingServer = async () => {
      if (this.sockets[accountIndex][proxyIndex] && this.sockets[accountIndex][proxyIndex].readyState === WebSocket.OPEN) {
        const proxy = this.proxyManager.proxies[proxyIndex];
        const agent =
          useProxy && proxy
            ? new HttpsProxyAgent(this.proxyManager.normalizeProxyUrl(proxy))
            : undefined;

        this.sockets[accountIndex][proxyIndex].send(JSON.stringify({ type: "ping" }));
        await this.getPoint(accountIndex, proxyIndex, useProxy);
      }

      setTimeout(pingServer, 60000);
    };

    pingServer();
  }

  private async getPoint(accountIndex: number, proxyIndex: number, useProxy: boolean): Promise<void> {
    const pointUrl = `https://api.allstream.ai/web/v1/dashBoard/info`;
    const proxy = this.proxyManager.proxies[proxyIndex];
    const agent =
      useProxy && proxy
        ? new HttpsProxyAgent(this.proxyManager.normalizeProxyUrl(proxy))
        : undefined;

    try {
      const response = await axios.get(pointUrl, {
        httpsAgent: agent,
        headers: {
          Authorization: `Bearer ${this.accessTokens[accountIndex]}`,
          "Content-Type": "application/json",
        },
      });

      const { data } = response.data;
      this.messages[accountIndex][proxyIndex] = `Successfully retrieved data: Total Points = ${
        data.totalScore ?? 0
      }, Today Points = ${data.todayScore ?? 0}`;

      console.log(
        chalk.green(`Account ${accountIndex + 1} with proxy ${proxyIndex + 1} - Successfully PING the Server:\n`) +
          this.messages[accountIndex][proxyIndex]
      );
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error for Account ${accountIndex + 1} with proxy ${proxyIndex + 1}:`, error.message);
      } else {
        console.error("An unknown error occurred:", error);
      }
    }
  }
}