const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mealPdf", {
  save(filename) {
    return ipcRenderer.invoke("save-pdf", filename);
  },
});
