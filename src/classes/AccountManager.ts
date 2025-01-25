import fs from "fs";

export class AccountManager {
  public accounts: { email: string; password: string }[] = [];

  loadAccounts(): void {
    if (!fs.existsSync("accounts.txt")) {
      console.error("accounts.txt not found. Please add the file with token data.");
      process.exit(1);
    }

    try {
      const data = fs.readFileSync("accounts.txt", "utf8");
      this.accounts = data
        .split("\n")
        .map((line) => {
          const [email, password] = line.split(":");
          if (email && password) {
            return { email: email.trim(), password: password.trim() };
          }
          return null;
        })
        .filter((account: { email: string; password: string } | null) => account !== null) as {
          email: string;
          password: string;
        }[];
    } catch (err) {
      console.error("Failed to load accounts:", err);
    }
  }
}