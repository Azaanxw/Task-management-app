const { contextBridge, ipcRenderer } = require('electron');

// Variables to store user data
let currentUserId = null;
let currentUserLevel = 1;
let currentUserExp = 0;


// Authentication API
contextBridge.exposeInMainWorld('authAPI', {

  // Attempts to login the user and if successful returns their info like userId, lvl etc
  login: async (username, password) => {
    const result = await ipcRenderer.invoke('auth-login', { username, password });

    if (result.success) {
      currentUserId = result.userId;
      currentUserLevel = result.level;
      currentUserExp = result.experience;

      ipcRenderer.send('auth-login-success', currentUserId);
    }

    return {
      ...result,
      userId: currentUserId,
      level: currentUserLevel,
      experience: currentUserExp
    };
  },

  // Attempts to register the user 
  register: (username, password) =>
    ipcRenderer.invoke('auth-register', { username, password }),

  getCurrentUserId: () => currentUserId,
  getUserLevel: () => currentUserLevel,
  getUserExp: () => currentUserExp,

  // Changes a users password
  changePassword: (currentPassword, newPassword) =>
    ipcRenderer.invoke('auth-change-password', { currentPassword, newPassword }),
});

// Database API 
contextBridge.exposeInMainWorld('dbAPI', {
  // Folder operations
  createFolder: (uid, name) => ipcRenderer.invoke('db:createFolder', uid, name),
  getFolders: uid => ipcRenderer.invoke('db:getFolders', uid),
  updateFolder: (folderId, newName) => ipcRenderer.invoke('db:updateFolder', folderId, newName),
  deleteFolder: (folderId) => ipcRenderer.invoke('db:deleteFolder', folderId),

  // Task operations
  createTask: (fid, t, d, p, s) => ipcRenderer.invoke('db:createTask', fid, t, d, p, s),
  getTasks: uid => ipcRenderer.invoke('db:getTasks', uid),
  completeTask: tid => ipcRenderer.invoke('db:completeTask', tid),

  // Progress operations
  addXP: (uid, xp) => ipcRenderer.invoke('db:addXP', uid, xp),
  addFocusTime: (uid, mins) => ipcRenderer.invoke('db:addFocusTime', uid, mins),
  getFocusSessions: uid => ipcRenderer.invoke('db:getFocusSessions', uid),

  // App usage operations
  addAppUsage:       (uid, app, secs) => ipcRenderer.invoke('db:addAppUsage',       uid, app, secs),
  getDailyAppUsage:  uid =>            ipcRenderer.invoke('db:getDailyAppUsage',  uid),
  getWeeklyAppUsage: uid =>            ipcRenderer.invoke('db:getWeeklyAppUsage', uid),
  
  // Distracting app operations
  getDistractingApps: uid => ipcRenderer.invoke('db:getDistractingApps', uid),
  addDistractingApp: (uid, app) => ipcRenderer.invoke('db:addDistractingApp', uid, app),
  removeDistractingApp: (uid, app) => ipcRenderer.invoke('db:removeDistractingApp', uid, app),

  // User stats operations
  getUserStats: uid => ipcRenderer.invoke('db:getUserStats', uid),
  updateStreakDays: (uid, streak) => ipcRenderer.invoke('db:updateStreakDays', uid, streak),

  // Leaderboard operations
  getLeaderboard: () => ipcRenderer.invoke('db:getLeaderboard'),
  refreshLeaderboard: () => ipcRenderer.invoke('db:refreshLeaderboard'),
  setLeaderboardVisibility: (uid, hide) => ipcRenderer.invoke('db:setLeaderboardVisibility', uid, hide),
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

// Global data API for window controls for custom title bar
contextBridge.exposeInMainWorld('globalDataAPI', {
  minimise: () => ipcRenderer.send('win-minimise'),
  maximise: () => ipcRenderer.send('win-maximise'),
  close: () => ipcRenderer.send('win-close'),
  toggleMax: () => ipcRenderer.send('win-toggle-max'),
});

// Overlay API for the overlay window
contextBridge.exposeInMainWorld('overlayAPI', {
  closeActiveWindow: () => ipcRenderer.invoke('close-active-window'),
  pauseTimer: () => ipcRenderer.send('overlay-pause'),
  onTimerUpdate: (callback) => ipcRenderer.on('timer-update', (event, time, isBreak) => callback(time, isBreak))
});

// renderer API for the main window to communicate with the overlay window
contextBridge.exposeInMainWorld('rendererAPI', {
  sendTimerUpdate: (time, isBreak) => ipcRenderer.send('timer-update', time, isBreak),
  onPauseCommand: (callback) => ipcRenderer.on('pause-timer', () => callback()),
  setFocusState:    (isActive)      => ipcRenderer.send('focus-timer-state', isActive),
  onPauseCommand:   (callback)      => ipcRenderer.on('pause-timer', () => callback())
});

// Settings API to change certain settings in the app
contextBridge.exposeInMainWorld('SettingsAPI', {
  applyTransparency: (callback) => {
    ipcRenderer.on('apply-transparency', (event, enabled) => callback(enabled));
  },
  sendTransparencySetting: (enabled) => {
    ipcRenderer.send('apply-transparency', enabled);
  }
});