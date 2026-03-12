import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, shell } from "electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cliUrlArg = process.argv.find((arg) => arg.startsWith("--url="));
const cliUrl = cliUrlArg ? cliUrlArg.slice("--url=".length) : null;
const appUrl = cliUrl ?? process.env.PHOTOPAY_DESKTOP_URL ?? "http://127.0.0.1:3000";

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    backgroundColor: "#f8f6ef",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.PHOTOPAY_DESKTOP_DEVTOOLS === "1") {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.webContents.on("did-fail-load", () => {
    const html = `
      <html>
        <body style="font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 24px; color: #10211a; background: #f8f6ef;">
          <h2 style="margin-top: 0;">PhotoPay konnte nicht geladen werden</h2>
          <p>Die Desktop-App erwartet einen laufenden Web-Server unter:</p>
          <p style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace;"><strong>${appUrl}</strong></p>
          <p>Starte lokal zuerst <code>npm run dev</code> oder uebergebe eine URL mit <code>--url=...</code>.</p>
        </body>
      </html>
    `;
    void mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });

  void mainWindow.loadURL(appUrl);
}

app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
