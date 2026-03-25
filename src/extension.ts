import * as vscode from "vscode";
import { exec } from "child_process";
import * as os from "os";

// ─── OS Detection ────────────────────────────────────────────────────────────

type Platform = "windows" | "mac" | "linux";

function getPlatform(): Platform {
  const p = os.platform();
  if (p === "win32") return "windows";
  if (p === "darwin") return "mac";
  return "linux";
}

// ─── Port Utilities ──────────────────────────────────────────────────────────

/**
 * Returns a shell command to find the PID using a given port.
 * Output format: just the PID (trimmed).
 */
function getFindPidCommand(port: number): string {
  const platform = getPlatform();
  if (platform === "windows") {
    // We fetch all listening ports and filter in JS for accuracy
    return `netstat -ano | findstr LISTENING`;
  } else {
    // lsof -ti :PORT gives just the PID
    return `lsof -ti tcp:${port}`;
  }
}

/**
 * Returns a shell command to kill a PID.
 */
function getKillCommand(pid: string): string {
  const platform = getPlatform();
  if (platform === "windows") {
    return `taskkill /PID ${pid} /F`;
  } else {
    return `kill -9 ${pid}`;
  }
}

/**
 * Parse PID from Windows netstat output.
 * Sample line: "  TCP    0.0.0.0:5173   ...   LISTENING   12345"
 */
function parsePidFromNetstat(output: string, port: number): string | null {
  const lines = output.split("\n");
  const portSuffix = `:${port}`;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);

    // netstat -ano format: Protocol, Local Address, Foreign Address, State, PID
    // Local Address is parts[1], e.g., "0.0.0.0:5173" or "[::]:5173"
    const localAddress = parts[1];
    if (localAddress && localAddress.endsWith(portSuffix)) {
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid) && pid !== "0") {
        return pid;
      }
    }
  }
  return null;
}

/**
 * Finds PID for a given port. Returns null if port is free.
 */
function findPidOnPort(port: number): Promise<string | null> {
  return new Promise((resolve) => {
    const cmd = getFindPidCommand(port);
    exec(cmd, (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve(null);
        return;
      }

      const platform = getPlatform();
      if (platform === "windows") {
        resolve(parsePidFromNetstat(stdout, port));
      } else {
        // lsof -ti gives one PID per line; take first
        const pid = stdout.trim().split("\n")[0].trim();
        resolve(pid || null);
      }
    });
  });
}

/**
 * Kills a process by PID.
 */
function killPid(pid: string): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(getKillCommand(pid), (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// ─── Status Bar ──────────────────────────────────────────────────────────────

let statusBarItem: vscode.StatusBarItem;

function createStatusBar(context: vscode.ExtensionContext) {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );

  const platform = getPlatform();
  const osIcon =
    platform === "windows" ? "$(terminal-powershell)" : "$(terminal-linux)";

  statusBarItem.text = `${osIcon} Kill Port`;
  statusBarItem.tooltip = `Port Killer [${platform.toUpperCase()}] — Click to kill a port`;
  statusBarItem.command = "portKiller.killPort";
  statusBarItem.backgroundColor = undefined;
  statusBarItem.show();

  context.subscriptions.push(statusBarItem);
}

function setStatusBarBusy(message: string) {
  statusBarItem.text = `$(sync~spin) ${message}`;
  statusBarItem.backgroundColor = undefined;
}

function resetStatusBar() {
  const platform = getPlatform();
  const osIcon =
    platform === "windows" ? "$(terminal-powershell)" : "$(terminal-linux)";
  statusBarItem.text = `${osIcon} Kill Port`;
  statusBarItem.backgroundColor = undefined;
  statusBarItem.tooltip = `Port Killer [${platform.toUpperCase()}] — Click to kill a port`;
}

function setStatusBarError() {
  statusBarItem.text = `$(error) Kill Port`;
  statusBarItem.backgroundColor = new vscode.ThemeColor(
    "statusBarItem.errorBackground"
  );
  setTimeout(resetStatusBar, 3000);
}

function setStatusBarSuccess() {
  statusBarItem.text = `$(check) Kill Port`;
  statusBarItem.backgroundColor = new vscode.ThemeColor(
    "statusBarItem.warningBackground"
  );
  setTimeout(resetStatusBar, 2000);
}

// ─── Core Command ────────────────────────────────────────────────────────────

async function killPortCommand() {
  // Step 1: Ask for port number
  const input = await vscode.window.showInputBox({
    prompt: "Enter the port number to kill",
    placeHolder: "e.g. 5173, 3000, 8080",
    validateInput: (value) => {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 1 || num > 65535) {
        return "Please enter a valid port number (1–65535)";
      }
      return null;
    },
  });

  if (!input) return;

  const port = parseInt(input, 10);

  // Step 2: Check if port is in use
  setStatusBarBusy(`Checking :${port}…`);

  let pid: string | null = null;
  try {
    pid = await findPidOnPort(port);
  } catch {
    resetStatusBar();
    vscode.window.showErrorMessage(`Port Killer: Failed to check port ${port}`);
    return;
  }

  if (!pid) {
    resetStatusBar();
    vscode.window.showInformationMessage(
      `✅ Port ${port} is not in use — nothing to kill.`
    );
    return;
  }

  // Step 3: Confirm and kill
  const action = await vscode.window.showWarningMessage(
    `⚠️ Port ${port} is in use by PID ${pid}. Kill it?`,
    { modal: true },
    "Kill Process",
    "Cancel"
  );

  if (action !== "Kill Process") {
    resetStatusBar();
    return;
  }

  setStatusBarBusy(`Killing PID ${pid}…`);

  try {
    await killPid(pid);
    setStatusBarSuccess();
    vscode.window.showInformationMessage(
      `🔪 Port ${port} (PID ${pid}) has been killed.`
    );
  } catch (err: unknown) {
    setStatusBarError();
    const msg = err instanceof Error ? err.message : String(err);

    const platform = getPlatform();
    const hint =
      platform === "windows"
        ? "Try running VS Code as Administrator."
        : "You may need elevated permissions — try `sudo kill`.";

    vscode.window.showErrorMessage(
      `Port Killer: Failed to kill PID ${pid}. ${hint}\n${msg}`
    );
  }
}

// ─── Check Port Command (bonus) ───────────────────────────────────────────────

async function checkPortCommand() {
  const input = await vscode.window.showInputBox({
    prompt: "Enter the port number to check",
    placeHolder: "e.g. 5173, 3000, 8080",
    validateInput: (value) => {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 1 || num > 65535) {
        return "Please enter a valid port number (1–65535)";
      }
      return null;
    },
  });

  if (!input) return;

  const port = parseInt(input, 10);
  setStatusBarBusy(`Checking :${port}…`);

  try {
    const pid = await findPidOnPort(port);
    resetStatusBar();
    if (pid) {
      vscode.window.showWarningMessage(
        `🔴 Port ${port} is IN USE — PID ${pid}`,
        "Kill It"
      ).then((action) => {
        if (action === "Kill It") {
          killPortCommand();
        }
      });
    } else {
      vscode.window.showInformationMessage(
        `🟢 Port ${port} is FREE — not in use.`
      );
    }
  } catch {
    resetStatusBar();
    vscode.window.showErrorMessage(`Port Killer: Could not check port ${port}`);
  }
}

// ─── Activation ──────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  createStatusBar(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("portKiller.killPort", killPortCommand),
    vscode.commands.registerCommand("portKiller.checkPort", checkPortCommand)
  );

  console.log("Port Killer extension is active.");
}

export function deactivate() {
  statusBarItem?.dispose();
}
