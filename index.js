const axios = require("axios");
const chalk = require("chalk");
const WebSocket = require("ws");
const { HttpsProxyAgent } = require("https-proxy-agent");
const fs = require("fs");
const readline = require("readline");
const keypress = require("keypress");

let sockets = [];
let lastUpdateds = [];
let emails = [];
let messages = [];
let userIds = [];
let browserIds = [];
let proxies = [];
let accounts = [];
let useProxy = false;
let currentAccountIndex = 0;

function loadAccounts() {
  if (!fs.existsSync("tokens.txt")) {
    console.error("tokens.txt not found. Please add the file with token data.");
    process.exit(1);
  }
  try {
    const data = fs.readFileSync("tokens.txt", "utf8");
    accounts = data
      .split("\n")
      .map((line) => line.trim())
      .filter((token) => token);
  } catch (err) {
    console.error("Failed to load tokens:", err);
  }
}

function loadProxies() {
  if (!fs.existsSync("proxy.txt")) {
    console.error("proxy.txt not found. Please add the file with proxy data.");
    process.exit(1);
  }

  try {
    const data = fs.readFileSync("proxy.txt", "utf8");
    proxies = data
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line);
  } catch (err) {
    console.error("Failed to load proxies:", err);
  }
}

function normalizeProxyUrl(proxy) {
  if (!proxy.startsWith("http://") && !proxy.startsWith("https://")) {
    proxy = "http://" + proxy;
  }
  return proxy;
}

function promptUseProxy() {
  return new Promise((resolve) => {
    displayHeader();
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question("Do you want to use a proxy? (y/n): ", (answer) => {
      useProxy = answer.toLowerCase() === "y";
      rl.close();
      resolve();
    });
  });
}

async function initialize() {
  loadAccounts();
  loadProxies();
  await promptUseProxy();

  if (useProxy && proxies.length < accounts.length) {
    console.error(
      "Not enough proxies for the number of accounts. Please add more proxies."
    );
    process.exit(1);
  }

  for (let i = 0; i < accounts.length; i++) {
    getUserId(i);
  }
}

function generateBrowserId(index) {
  return `browserId-${index}-${Math.random().toString(36).substring(2, 15)}`;
}

function displayHeader() {
  console.clear();
  console.log(
    chalk.green(` ____  _                                 _    ___ 
 / ___|| |_ _ __ ___  __ _ _ __ ___      / \\  |_ _|
 \\___ \\| __| '__/ _ \\/ _\` | '_ \` _ \\    / _ \\  | | 
  ___) | |_| | |  __/ (_| | | | | | |  / ___ \\ | | 
 |____/ \\__|_|  \\___|\\__,_|_| |_| |_| /_/   \\_\\___|`)
  );
  console.log(chalk.green("          github.com/ahlulmukh                  "));
}

function displayAccountData(index) {
  console.log(`Email: ${emails[index]}`);
  console.log(`User ID: ${chalk.green(userIds[index])}`);
  console.log(`Browser ID: ${chalk.magenta(browserIds[index])}`);
  console.log(`Status: ${chalk.yellow(messages[index] || "Loading...")}`);
  console.log("");
}

async function getPoint(index) {
  const pointUrl = `https://api.allstream.ai/mobile/v1/home?imei=${browserIds[index]}`;
  const proxy = proxies[index % proxies.length];
  const agent =
    useProxy && proxy ? new HttpsProxyAgent(normalizeProxyUrl(proxy)) : null;

  try {
    const response = await axios.get(pointUrl, {
      httpsAgent: agent,
      headers: {
        Authorization: `Bearer ${accounts[index]}`,
        "Content-Type": "application/json",
      },
    });

    const data = response.data.data;
    messages[
      index
    ] = `Berhasil mendapatkan data: Total Points = ${data.totalPoints}, Epoch Points = ${data.epochPoints}, Earnings = ${data.earnings}`;

    console.log(
      chalk.green(`Account ${index + 1} - Berhasil PING Ke Server:\n`) +
        messages[index]
    );

    if (accounts.length === 1) {
      displayAccountData(index);
    }
  } catch (error) {
    const errorMessage = error.response
      ? error.response.data.message
      : error.message;
    messages[index] = `Error: ${errorMessage}`;
    console.error(chalk.red(`Error for Account ${index + 1}:`) + errorMessage);
  }
}

async function connectWebSocket(index) {
  if (sockets[index]) return;
  const url = "wss://gw0.streamapp365.com/connect";

  const proxy = proxies[index % proxies.length];
  const agent =
    useProxy && proxy ? new HttpsProxyAgent(normalizeProxyUrl(proxy)) : null;

  sockets[index] = new WebSocket(url, { agent });

  sockets[index].onopen = async () => {
    lastUpdateds[index] = new Date().toISOString();
    console.log(`Account ${index + 1} Connected`, lastUpdateds[index]);
    sendRegisterMessage(index);
    startPinging(index);
  };

  sockets[index].onclose = () => {
    console.log(`Account ${index + 1} Disconnected`);
    reconnectWebSocket(index);
  };

  sockets[index].onerror = (error) => {
    console.error(`WebSocket error for Account ${index + 1}:`, error);
  };
}

async function reconnectWebSocket(index) {
  const url = "wss://gw0.streamapp365.com/connect";
  const proxy = proxies[index % proxies.length];
  const agent =
    useProxy && proxy ? new HttpsProxyAgent(normalizeProxyUrl(proxy)) : null;

  if (sockets[index]) {
    sockets[index].removeAllListeners();
  }

  sockets[index] = new WebSocket(url, { agent });

  sockets[index].onopen = async () => {
    lastUpdateds[index] = new Date().toISOString();
    console.log(`Account ${index + 1} Reconnected`, lastUpdateds[index]);
    sendRegisterMessage(index);
    startPinging(index);
  };

  sockets[index].onclose = () => {
    console.log(`Account ${index + 1} Disconnected again`);
    setTimeout(() => {
      reconnectWebSocket(index);
    }, 5000);
  };

  sockets[index].onerror = (error) => {
    console.error(`WebSocket error for Account ${index + 1}:`, error);
  };
}

function sendRegisterMessage(index) {
  if (sockets[index] && sockets[index].readyState === WebSocket.OPEN) {
    const message = {
      type: "register",
      user: userIds[index],
      dev: browserIds[index],
    };

    sockets[index].send(JSON.stringify(message));
    console.log(
      chalk.green(`Berhasil Daftarkan browser, melanjutkan ping socket ...\n`)
    );
  } else {
    console.error(
      `WebSocket not open for Account ${index + 1}. Unable to send message.`
    );
  }
}

async function startPinging(index) {
  const pingServer = async () => {
    if (sockets[index] && sockets[index].readyState === WebSocket.OPEN) {
      const proxy = proxies[index % proxies.length];
      const agent =
        useProxy && proxy
          ? new HttpsProxyAgent(normalizeProxyUrl(proxy))
          : null;

      sockets[index].send(JSON.stringify({ type: "ping" }), { agent });
      await getPoint(index);
    }

    setTimeout(pingServer, 60000);
  };

  pingServer();
}

async function getUserId(index) {
  const loginUrl = "https://api.allstream.ai/mobile/v1/auth/myInfo";

  const proxy = proxies[index % proxies.length];
  const agent =
    useProxy && proxy ? new HttpsProxyAgent(normalizeProxyUrl(proxy)) : null;

  try {
    const response = await axios.get(loginUrl, {
      httpsAgent: agent,
      headers: {
        Authorization: `Bearer ${accounts[index]}`,
        "Content-Type": "application/json",
      },
    });

    const { data } = response.data;
    emails[index] = data.email;
    userIds[index] = data.uuid;
    browserIds[index] = generateBrowserId(index);
    messages[index] = "Connected successfully";

    await connectWebSocket(index);
  } catch (error) {
    const errorMessage = error.response
      ? error.response.data.message
      : error.message;
    messages[index] = `Error: ${errorMessage}`;
    if (index === currentAccountIndex) {
      displayAccountData(index);
    }
    console.error(`Error for Account ${index + 1}:`, errorMessage);
  }
}

initialize();
