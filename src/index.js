const { app, BrowserWindow, ipcMain, screen, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2');
require('dotenv').config();
const globalData = require('./globalData');
const activeWin = require('active-win');
let focusTimerActive = false;

// Disable GPU cache and shader disk cache
app.commandLine.appendSwitch('disable-gpu-cache');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// MySQL database connection
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: 3306,
});

db.connect(err => {
  if (err) console.error('Database connection failed:', err.message);
  else console.log('Connected to MySQL database.');
});

// IPC handler for database queries
ipcMain.handle('db-query', (event, queryString) => {
  return new Promise((resolve, reject) => {
    db.query(queryString, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
});

// Extract and save application icon
async function extractAndSaveIcon(filePath) {
  try {
    const icon = await app.getFileIcon(filePath, { size: 'large' });
    const buffer = icon.toPNG();
    const filename = path.basename(filePath, '.exe') + '.png';
    const fullPath = path.join(app.getPath('userData'), filename);
    fs.writeFileSync(fullPath, buffer);
    return fullPath;
  } catch (err) {
    console.error('Error extracting icon:', err);
    return null;
  }
}

ipcMain.handle('get-app-icon', (event, exePath) => {
  return extractAndSaveIcon(exePath);
});

// Start Tailwind CLI in watch mode
require('child_process').exec('npm run build.css', (err, stdout, stderr) => {
  if (err) console.error('Tailwind Watch Error:', stderr);
  else console.log('Tailwind Watch Running:', stdout);
});

// Overlay window and positioning
let overlayWindow;
function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 300,
    height: 100,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: true,
    },
  });
  overlayWindow.loadFile(path.join(__dirname, '/overlay.html'));
  overlayWindow.hide();
}

async function updateOverlayBounds(win) {
  try {
    const winInfo = await activeWin();
    if (!winInfo || !winInfo.bounds) return;
    const { x, y, width, height } = winInfo.bounds;
    const display = screen.getDisplayMatching(winInfo.bounds);
    const { scaleFactor, bounds: db } = display;
    const dipX = Math.round(db.x + (x - db.x) / scaleFactor);
    const dipY = Math.round(db.y + (y - db.y) / scaleFactor);
    const dipW = Math.round(width / scaleFactor);
    const dipH = Math.round(height / scaleFactor);
    win.setBounds({ x: dipX, y: dipY, width: dipW, height: dipH });
    const activeAppName = winInfo.owner.name.replace('.exe', '').trim();
    const isDistracting = globalData.distractingApps
      .some(app => app.toLowerCase() === activeAppName.toLowerCase());

    if (isDistracting && focusTimerActive) win.show();
    else win.hide();
  } catch (err) {
    console.error('Error updating overlay bounds:', err);
  }
}

// Initialize windows after app is ready
app.whenReady().then(() => {
  // Menu.setApplicationMenu(null); // Hides menu bar 
  // Main window
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Overlay setup
  createOverlayWindow();
  updateOverlayBounds(overlayWindow);
  setInterval(() => updateOverlayBounds(overlayWindow), 100);
  setInterval(async () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    const info = await activeWin();
    if (
      !info || !info.owner || typeof info.owner.name !== 'string' ||
      !info.owner.name.trim()
    ) {
      // Akips overlay if no active window or invalid name
      return;
    }
    const name = info?.owner?.name.replace('.exe', '').trim();
    const isDistracting = globalData.distractingApps
      .some(app => app.toLowerCase() === name.toLowerCase());

    if (isDistracting && focusTimerActive) overlayWindow.show();
    else overlayWindow.hide();
  }, 1000);
});

// Quits when all windows are closed 
app.on('window-all-closed', () => {
  app.quit();
});


// IPC handlers for window controls
ipcMain.on('win-minimise', () => BrowserWindow.getFocusedWindow()?.minimize());
ipcMain.on('win-maximise', () => BrowserWindow.getFocusedWindow()?.maximize());
ipcMain.on('win-close', () => BrowserWindow.getFocusedWindow()?.close());
ipcMain.on('win-toggle-max', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return;
  win.isMaximized() ? win.unmaximize() : win.maximize();
});

// IPC handlers for global data
ipcMain.handle('get-global-data', () => globalData);
ipcMain.handle('add-distracting-app', (event, appName) => {
  if (
    appName &&
    !globalData.distractingApps.some(
      app => app.toLowerCase() === appName.toLowerCase()
    )
  ) {
    globalData.distractingApps.push(appName);
    BrowserWindow.getAllWindows().forEach(w =>
      w.webContents.send('global-data-updated', globalData)
    );
  }
  return globalData;
});

// IPC handler to remove a distracting app
ipcMain.handle('remove-distracting-app', (event, appName) => {
  if (appName && globalData.distractingApps.includes(appName)) {
    globalData.distractingApps = globalData.distractingApps.filter(a => a !== appName);
    BrowserWindow.getAllWindows().forEach(w =>
      w.webContents.send('global-data-updated', globalData)
    );
  }
  return globalData;
});
// IPC handler to set focus timer state
ipcMain.on('focus-timer-state', (event, isActive) => {
  focusTimerActive = isActive;
});

ipcMain.handle('close-active-window', async () => {
  const winInfo = await activeWin();
  if (winInfo?.owner?.processId) {
    try {
      process.kill(winInfo.owner.processId);
      return true;
    } catch (e) {
      console.error('Failed to close process', e);
    }
  }
  return false;
});

ipcMain.on('overlay-pause', () => {
  if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send('pause-timer');
});

ipcMain.on('timer-update', (event, time, isBreak) => {
  if (overlayWindow && !overlayWindow.isDestroyed())
    overlayWindow.webContents.send('timer-update', time, isBreak);
});