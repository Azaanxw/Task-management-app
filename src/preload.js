const { contextBridge, ipcRenderer } = require('electron');
const activeWin = require('active-win');

// Provides active application data to renderer
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

  // Adds or removes distracting apps
  addDistractingApp: async (appName) => {
    return await ipcRenderer.invoke('add-distracting-app', appName);
  },
  removeDistractingApp: (appName) =>
    ipcRenderer.invoke('remove-distracting-app', appName),

  // Listens for updates
  onGlobalDataUpdate: (callback) => {
    ipcRenderer.on('global-data-updated', (event, data) => callback(data));
  }
});

// Overlay API for communication between overlay and main process
contextBridge.exposeInMainWorld('overlayAPI', {
  // Closes the current active window
  closeActiveWindow: () => ipcRenderer.invoke('close-active-window'),
  // Pauses the main focus timer
  pauseTimer: () => ipcRenderer.send('overlay-pause'),
  // Receives live timer updates 
  onTimerUpdate: (callback) => {
    ipcRenderer.on('timer-update', (event, time, isBreak) => callback(time, isBreak));
  }
});

contextBridge.exposeInMainWorld('rendererAPI', {
  // Sends live timer updates to the overlay
  sendTimerUpdate: (time, isBreak) => ipcRenderer.send('timer-update', time, isBreak),
  // Listens for pause commands coming from the overlay
  onPauseCommand: (callback) => {
    ipcRenderer.on('pause-timer', () => callback());
  },
  setFocusState: (isActive) => ipcRenderer.send('focus-timer-state', isActive),
});
