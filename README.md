# 🔪 Port Killer — VS Code Extension

Kill any running port directly from the VS Code status bar. Works on **Windows**, **macOS**, and **Linux** — automatically detects your OS and uses the right command.

---

## Features

- **Status bar button** — always visible at the bottom right of VS Code
- **OS-aware** — uses `lsof` + `kill -9` on Mac/Linux, `netstat` + `taskkill` on Windows
- **Smart flow**: enter a port → if in use, shows PID and confirms before killing → if free, tells you immediately
- **Check Port** command — check if a port is in use without killing (with quick-kill option)

---

## How to Use

### Option 1 — Status Bar
Click the **`Kill Port`** button in the bottom-right status bar.

### Option 2 — Command Palette
Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:
- `Port Killer: Kill a Port`
- `Port Killer: Check Port Status`

---

## Flow

```
Click Status Bar
      ↓
Enter port number (e.g. 5173)
      ↓
Port in use?
  ├── YES → Shows PID → Confirm → Kill ✅
  └── NO  → "Port is not in use" ℹ️
```

---

## Installation (Development)

```bash
# 1. Clone / copy the extension folder
cd port-killer

# 2. Install dependencies
npm install

# 3. Compile TypeScript
npm run compile

# 4. Open in VS Code
code .

# 5. Press F5 to launch Extension Development Host
```

---

## OS-specific commands used

| OS      | Find PID                        | Kill PID              |
|---------|---------------------------------|-----------------------|
| macOS   | `lsof -ti tcp:<port>`           | `kill -9 <pid>`       |
| Linux   | `lsof -ti tcp:<port>`           | `kill -9 <pid>`       |
| Windows | `netstat -ano \| findstr :<port>` | `taskkill /PID <pid> /F` |

> **Windows note**: If you get permission errors, try running VS Code as Administrator.

---

---

## Publishing to the VS Code Marketplace

Follow these steps to make your extension available to everyone:

### 1. Create a Publisher
If you haven't yet, create a publisher on the [Visual Studio Marketplace](https://marketplace.visualstudio.com/manage). Your publisher ID must match the one in `package.json` (`rahul-bhatt43`).

### 2. Get a Personal Access Token (PAT)
- Go to [Azure DevOps](https://dev.azure.com/).
- Click the user icon in the top right → **Personal Access Tokens**.
- Create a new token with **All accessible organizations** and **Marketplace (Publish)** scope.

### 3. Log in via CLI
```bash
npx @vscode/vsce login rahul-bhatt43
# (Paste your PAT when prompted)
```

### 4. Publish
```bash
npx @vscode/vsce publish
```

Your extension will be visible to everyone after a short verification period.
