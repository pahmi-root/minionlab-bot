import chalk from "chalk";

export class Logger {
  static logMessage(
    accountNum: number | null = null,
    total: number | null = null,
    message: string = "",
    messageType: string = "info"
  ): void {
    const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
    const accountStatus = accountNum && total ? `${accountNum}/${total}` : "";

    const colors: { [key: string]: chalk.Chalk } = {
      info: chalk.white,
      success: chalk.green,
      error: chalk.red,
      warning: chalk.yellow,
      process: chalk.cyan,
      debug: chalk.magenta,
    };

    const logColor = colors[messageType] || chalk.white;
    console.log(
      `${chalk.white("[")}${chalk.dim(timestamp)}${chalk.white("]")} ` +
        `${chalk.white("[")}${chalk.yellow(accountStatus)}${chalk.white("]")} ` +
        `${logColor(message)}`
    );
  }
}