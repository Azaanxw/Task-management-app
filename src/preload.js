const { contextBridge, ipcRenderer } = require('electron');

// Authentication API
contextBridge.exposeInMainWorld('authAPI', {
  login: (username, password) => ipcRenderer.invoke('auth-login', { username, password }),
  register: (username, password) => ipcRenderer.invoke('auth-register', { username, password }),
  forceLogin: () => ipcRenderer.send('auth-login-success')
});

// Gets active window info from main process
contextBridge.exposeInMainWorld('appTracker', {
  getActiveApplication: async () => {
    try {
      const winInfo = await ipcRenderer.invoke('get-active-win-info');
      if (!winInfo) return null;
      const icon = await ipcRenderer.invoke('get-app-icon', winInfo.owner.path);
      return {
        name: winInfo.owner.name,
        title: winInfo.title,
        icon
      };
    } catch (err) {
      console.error('Error fetching active window info:', err);
      return null;
    }
  }
});

contextBridge.exposeInMainWorld('globalDataAPI', {
  // Window controls
  minimise: () => ipcRenderer.send('win-minimise'),
  maximise: () => ipcRenderer.send('win-maximise'),
  close:    () => ipcRenderer.send('win-close'),
  toggleMax:() => ipcRenderer.send('win-toggle-max'),
  // Distracting-apps management
  getGlobalData:    () => ipcRenderer.invoke('get-global-data'),
  addDistractingApp:(appName) => ipcRenderer.invoke('add-distracting-app', appName),
  removeDistractingApp:(appName) => ipcRenderer.invoke('remove-distracting-app', appName),
  onGlobalDataUpdate:(callback) => ipcRenderer.on('global-data-updated', (event, data) => callback(data))
});

// Overlay window control & timer-update IPC methods
contextBridge.exposeInMainWorld('overlayAPI', {
  closeActiveWindow: () => ipcRenderer.invoke('close-active-window'),
  pauseTimer:        () => ipcRenderer.send('overlay-pause'),
  onTimerUpdate:     (callback) => ipcRenderer.on('timer-update', (event, time, isBreak) => callback(time, isBreak))
});

// Focus timer IPC methods
contextBridge.exposeInMainWorld('rendererAPI', {
  sendTimerUpdate: (time, isBreak) => ipcRenderer.send('timer-update', time, isBreak),
  onPauseCommand:  (callback) => ipcRenderer.on('pause-timer', () => callback()),
  setFocusState:   (isActive) => ipcRenderer.send('focus-timer-state', isActive)
});
