const path = require("node:path");
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { writeFile } = require("node:fs/promises");

const PORT = Number(process.env.PORT || 0);
let server;
let mainWindow;
let appUrl;

async function startLocalApp() {
  process.env.PUBLIC_DIR = path.join(app.getAppPath(), "public");
  const module = await import(path.join(app.getAppPath(), "server.js"));
  server = await module.startServer(PORT);
  const address = server.address();
  appUrl = `http://127.0.0.1:${address.port}`;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 900,
    minWidth: 900,
    minHeight: 700,
    title: "전북교육연수원 식단 PDF",
    backgroundColor: "#e9eef3",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadURL(appUrl);
}

app.whenReady().then(async () => {
  await startLocalApp();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (server) {
    server.close();
  }
});

ipcMain.handle("save-pdf", async (_event, filename) => {
  if (!mainWindow) {
    return { canceled: true };
  }

  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: "PDF 저장",
    defaultPath: filename || "식단표.pdf",
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });

  if (canceled || !filePath) {
    return { canceled: true };
  }

  const data = await mainWindow.webContents.printToPDF({
    pageSize: "A4",
    printBackground: false,
    preferCSSPageSize: true,
    margins: {
      marginType: "none",
    },
  });

  await writeFile(filePath, data);
  return { canceled: false, filePath };
});
