import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("photopayDesktop", {
  platform: process.platform,
});
