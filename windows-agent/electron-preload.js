/* eslint-disable @typescript-eslint/no-require-imports */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vistaAgent", {
  onState(callback) {
    ipcRenderer.on("agent-state", (_event, state) => callback(state));
  },
  confirmWarning() {
    return ipcRenderer.invoke("confirm-warning");
  },
  requestExtension() {
    return ipcRenderer.invoke("request-extension");
  },
  closeAgent() {
    return ipcRenderer.invoke("close-agent");
  },
  getBays() {
    return ipcRenderer.invoke("get-bays");
  },
  selectBay(bayCode) {
    return ipcRenderer.invoke("select-bay", bayCode);
  }
});
