const { contextBridge, ipcRenderer } = require('electron');
const activeWin = require('active-win');

contextBridge.exposeInMainWorld('appTracker', {
  getActiveApplication: async () => {
    const app = await activeWin();
    if (app) {
      let icon = await ipcRenderer.invoke('get-app-icon', app.owner.path);
      return {
        name: app.owner.name,
        title: app.title,
        icon: icon
      };
    }
    return null;
  }
});

contextBridge.exposeInMainWorld('globalDataAPI', {
  minimise: () => ipcRenderer.send('win-minimise'),
  maximise: () => ipcRenderer.send('win-maximise'),
  close: () => ipcRenderer.send('win-close'),
  toggleMax: () => ipcRenderer.send('win-toggle-max'),
  // Gets the current global data from main process
  getGlobalData: async () => {
    return await ipcRenderer.invoke('get-global-data');
  },
  // Adds a distracting app and returns updated data
  addDistractingApp: async (appName) => {
    return await ipcRenderer.invoke('add-distracting-app', appName);
  },
  removeDistractingApp: (appName) =>
    ipcRenderer.invoke('remove-distracting-app', appName),
  // Listens for updates from the main process
  onGlobalDataUpdate: (callback) => {
    ipcRenderer.on('global-data-updated', (event, data) => callback(data));
  }
});