const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2');
const activeWin = require('active-win');
const bcrypt = require('bcrypt');
require('dotenv').config();
let loginWindow = null;
let mainWindow = null;
let currentUserId = null;
let focusTimerActive = false;

// MySQL database connection
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: 3306,
}).promise();

// Start Tailwind CLI in watch mode
require('child_process').exec('npm run build.css', (err, stdout, stderr) => {
  if (err) console.error('Tailwind Watch Error:', stderr);
  else console.log('Tailwind Watch Running:', stdout);
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

// IPC handler to get the app icon
ipcMain.handle('get-app-icon', (event, exePath) => {
  return extractAndSaveIcon(exePath);
});

// IPC handlers for authentication
// Registration handler
ipcMain.handle('auth-register', async (event, { username, password }) => {
  if (!username || !password) {
    return { success: false, message: 'Username and password are required' };
  }
  try {
    const [existingUsers] = await db.query(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );
    if (existingUsers.length > 0) {
      return { success: false, message: 'Username already taken' };
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [username, passwordHash]
    );

    return { success: true };
  } catch (error) {
    console.error('Registration error:', error);
    return { success: false, message: error.message || 'Registration failed' };
  }
});

// Login handler
ipcMain.handle('auth-login', async (event, { username, password }) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, password_hash FROM users WHERE username = ?',
      [username]
    );

    if (rows.length === 0) {
      return { success: false, message: 'Invalid username or password' };
    }

    const { id, password_hash } = rows[0];

    const match = await bcrypt.compare(password, password_hash);
    if (!match) {
      return { success: false, message: 'Invalid username or password' };
    }

    // If sucessful, return the userid
    return {
      success: true,
      userId: id
    };
  } catch (err) {
    console.error('Login error:', err);
    return { success: false, message: 'Login failed' };
  }
});

// Login success handler
ipcMain.on('auth-login-success', (event, userId) => {
  currentUserId = userId;
  if (loginWindow) {
    loginWindow.close();
    loginWindow = null;
  }
  // Reloads and shows the existing mainWindow if it still exists if not then creates a new main window
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
    mainWindow.show();
  } else {
    createMainWindow();
  }
});

// Password change handler
ipcMain.handle('auth-change-password', async (event, { currentPassword, newPassword }) => {
  if (!currentUserId) {
    return { success: false, message: 'Not authenticated' };
  }

  try {
    // Fetches the stored hash
    const [rows] = await db.execute(
      'SELECT password_hash FROM users WHERE id = ?',
      [currentUserId]
    );
    if (rows.length === 0) {
      return { success: false, message: 'User not found' };
    }
    const storedHash = rows[0].password_hash;

    // Checks current password
    const valid = await bcrypt.compare(currentPassword, storedHash);
    if (!valid) {
      return { success: false, message: 'Current password incorrect' };
    }

    // Hashes and updates to the new password
    const newHash = await bcrypt.hash(newPassword, 10);
    await db.execute(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [newHash, currentUserId]
    );

    return { success: true };
  } catch (err) {
    console.error('Change password error:', err);
    return { success: false, message: 'Password change failed' };
  }
});


// Gets the current active window info
ipcMain.handle('get-active-win-info', async () => {
  return await activeWin({ includeIcon: true });
});

// OVERLAY WINDOW 
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
    show: true
  });
  overlayWindow.loadFile(path.join(__dirname, '/overlay.html'));
  overlayWindow.setOpacity(0);
}

// UPDATE OVERLAY BOUNDS FOR DISTRACTING APPS
async function updateOverlayBounds(win) {
  try {
    if (!currentUserId) return;

    const winInfo = await activeWin();
    if (!winInfo?.bounds) return;

    const [resultSets] = await db.execute(
      'CALL proc_get_distracting_apps(?)',
      [currentUserId]
    );
    const rows = Array.isArray(resultSets[0]) ? resultSets[0] : resultSets;

    const activeAppName = winInfo.owner.name
      .replace(/\.exe$/i, '')
      .trim()
      .toLowerCase();

    const isDistracting = rows.some(r =>
      r.app_name.toLowerCase() === activeAppName
    );
    const shouldShow = isDistracting && focusTimerActive;
    overlayWindow.setOpacity(shouldShow ? 1 : 0);

    if (!shouldShow) return;

    const { x, y, width, height } = winInfo.bounds;
    const display = screen.getDisplayMatching(winInfo.bounds);
    const { scaleFactor, bounds: dbb } = display;
    const dipX = Math.round(dbb.x + (x - dbb.x) / scaleFactor);
    const dipY = Math.round(dbb.y + (y - dbb.y) / scaleFactor);
    const dipW = Math.round(width / scaleFactor);
    const dipH = Math.round(height / scaleFactor);

    win.setBounds({ x: dipX, y: dipY, width: dipW, height: dipH });
  }
  catch (err) {
    console.error('Error in updateOverlayBounds:', err);
  }
}

// Creates the login window
function createLoginWindow() {
  loginWindow = new BrowserWindow({
    width: 400,
    height: 500,
    frame: false,
    title: "Focustra Login",
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  loginWindow.loadFile(path.join(__dirname, 'authentication.html'));
}

// Creates the main application window
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    title: 'Focustra',
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  createOverlayWindow();
  updateOverlayBounds(overlayWindow);
  setInterval(() => updateOverlayBounds(overlayWindow), 100);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Loads the login window first 
app.whenReady().then(() => {
  createLoginWindow();
  app.on('activate', () => {
    if (windows.length === 0 && !mainWindow && !loginWindow) {
      createLoginWindow();
    }
  });
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


// IPC handler to set focus timer state
ipcMain.on('focus-timer-state', (event, isActive) => {
  focusTimerActive = isActive;
});

// IPC handler to pause the timer in the overlay window
ipcMain.on('overlay-pause', () => {
  if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send('pause-timer');
});

// IPC handler to send timer updates to the overlay window
ipcMain.on('timer-update', (event, time, isBreak) => {
  if (overlayWindow && !overlayWindow.isDestroyed())
    overlayWindow.webContents.send('timer-update', time, isBreak);
});

// IPC handler to close the distracting app window
ipcMain.handle('close-active-window', async () => {
  const winInfo = await activeWin();
  if (winInfo?.owner?.processId) {
    try {
      process.kill(winInfo.owner.processId);
      if (overlayWindow && overlayWindow.isVisible()) {
        overlayWindow.hide();
      }
      return true;
    } catch (e) {
      console.error('Failed to close process', e);
    }
  }
  return false;
});

// IPC handler to set the transparency of the overlay window
ipcMain.on('apply-transparency', (event, enabled) => {
  overlayWindow.webContents.send('apply-transparency', enabled);
});

// IPC handlers for Database

// CREATE FOLDER
ipcMain.handle('db:createFolder', async (event, userId, folderName) => {
  try {
    await db.execute('CALL proc_create_folder(?, ?)', [userId, folderName]);
    return { success: true };
  } catch (err) {
    console.error('Create folder error:', err);
    return { success: false };
  }
});

// GET FOLDERS
ipcMain.handle('db:getFolders', async (event, userId) => {
  try {
    const [rows] = await db.execute('CALL proc_get_folders(?)', [userId]);
    return rows[0];
  } catch (err) {
    console.error('Get folders error:', err);
    return [];
  }
});

// UPDATE FOLDER
ipcMain.handle('db:updateFolder', async (event, folderId, newName) => {
  try {
    await db.execute('CALL proc_update_folder(?, ?)', [folderId, newName]);
    return { success: true };
  } catch (err) {
    console.error('Update folder error:', err);
    return { success: false };
  }
});

// DELETE FOLDER
ipcMain.handle('db:deleteFolder', async (event, folderId) => {
  try {
    await db.execute('CALL proc_delete_folder(?)', [folderId]);
    return { success: true };
  } catch (err) {
    console.error('Delete folder error:', err);
    return { success: false };
  }
});

// CREATE TASK
ipcMain.handle('db:createTask', async (event, folderId, title, due, priority, status) => {
  try {
    await db.execute('CALL proc_create_task(?, ?, ?, ?, ?)', [folderId, title, due, priority, status]);
    return { success: true };
  } catch (err) {
    console.error('Create task error:', err);
    return { success: false };
  }
});

// GET TASKS FOR USER
ipcMain.handle('db:getTasks', async (event, userId) => {
  try {
    const [rows] = await db.execute('CALL proc_get_tasks_for_user(?)', [userId]);
    return rows[0];
  } catch (err) {
    console.error('Get tasks error:', err);
    return [];
  }
});

// COMPLETE TASK
ipcMain.handle('db:completeTask', async (event, taskId) => {
  try {
    await db.execute('CALL proc_complete_task(?)', [taskId]);
    return { success: true };
  } catch (err) {
    console.error('Complete task error:', err);
    return { success: false };
  }
});

// ADD APP USAGE
ipcMain.handle('db:addAppUsage', async (event, userId, appName, secs) => {
  try {
    await db.execute('CALL proc_add_app_usage(?, ?, ?)', [userId, appName, secs]);
    return { success: true };
  } catch (err) {
    console.error('Add app usage error:', err);
    return { success: false };
  }
});

// GET DAILY APP USAGE
ipcMain.handle('db:getDailyAppUsage', async (e, userId) => {
  try {
    const [rows] = await db.execute('CALL proc_get_daily_app_usage(?)', [userId]);
    return rows[0];
  } catch (err) {
    console.error(err);
    return [];
  }
});

// GET WEEKLY APP USAGE
ipcMain.handle('db:getWeeklyAppUsage', async (e, userId) => {
  try {
    const [rows] = await db.execute('CALL proc_get_weekly_app_usage(?)', [userId]);
    return rows[0];
  } catch (err) {
    console.error(err);
    return [];
  }
});

// GETS TODAYS AND YESTERDAYS COMPLETED TASKS 
ipcMain.handle('db:getDailyCompletionCounts', async (event, userId) => {
  try {
    const [resultSets] = await db.query(
      'CALL proc_get_daily_completion_counts(?)',
      [userId]
    );
    const rows = resultSets[0] || [];
    const row = rows[0] || {};
    const today = row.today ?? 0;
    const yesterday = row.yesterday ?? 0;
    return { today, yesterday };
  } catch (err) {
    console.error('getDailyCompletionCounts error:', err);
    return { today: 0, yesterday: 0 };
  }
});


// UPDATES A GIVEN USER'S PRODUCTIVITY SCORE
ipcMain.handle(
  'db:updateProductivityScore',
  (event, userId, score, reset) =>
    db
      .execute('CALL proc_update_productivity(?, ?, ?)', [userId, score, reset])
      .then(() => ({ success: true }))
      .catch(err => ({ success: false, error: err }))
);

// ADD DISTRACTING APP
ipcMain.handle('db:addDistractingApp', async (event, userId, appName) => {
  try {
    await db.execute('CALL proc_add_distracting_app(?, ?)', [userId, appName]);
    return { success: true };
  } catch (err) {
    console.error('Add distracting app error:', err);
    return { success: false };
  }
});

// GET DISTRACTING APPS
ipcMain.handle('db:getDistractingApps', async (event, userId) => {
  try {
    const [rows] = await db.execute('CALL proc_get_distracting_apps(?)', [userId]);
    return rows[0];
  } catch (err) {
    console.error('Get distracting apps error:', err);
    return [];
  }
});

// REMOVE DISTRACTING APP
ipcMain.handle('db:removeDistractingApp', async (event, userId, appName) => {
  try {
    await db.execute('CALL proc_remove_distracting_app(?, ?)', [userId, appName]);
    return { success: true };
  } catch (err) {
    console.error('Remove distracting app error:', err);
    return { success: false };
  }
});

// ADD FOCUS TIME
ipcMain.handle('db:addFocusTime', async (event, userId, minutes) => {
  try {
    await db.execute('CALL proc_add_focus(?, ?)', [userId, minutes]);
    return { success: true };
  } catch (err) {
    console.error('Add focus time error:', err);
    return { success: false };
  }
});

// GET FOCUS SESSIONS
ipcMain.handle('db:getFocusSessions', async (event, userId) => {
  try {
    const [rows] = await db.query(
      'SELECT session_date, FLOOR(total_seconds / 60) AS minutes FROM focus_sessions WHERE user_id = ? ORDER BY session_date',
      [userId]
    );
    return rows;
  } catch (err) {
    console.error('Get focus sessions error:', err);
    return [];
  }
});

// ADD XP
ipcMain.handle('db:addXP', async (event, userId, xp) => {
  try {
    await db.execute('CALL proc_add_xp(?, ?)', [userId, xp]);
    return { success: true };
  } catch (err) {
    console.error('Add XP error:', err);
    return { success: false };
  }
});

// GET LEADERBOARD
ipcMain.handle('db:getLeaderboard', async () => {
  try {
    const [rows] = await db.query('SELECT * FROM leaderboard ORDER BY level DESC LIMIT 15');
    return rows;
  } catch (err) {
    console.error('Get leaderboard error:', err);
    return [];
  }
});

// REFRESH LEADERBOARD
ipcMain.handle('db:refreshLeaderboard', async () => {
  try {
    await db.execute('CALL proc_refresh_leaderboard()');
    return { success: true };
  } catch (err) {
    console.error('Refresh leaderboard error:', err);
    return { success: false };
  }
});

// CHANGE LEADERBOARD VISIBILITY FOR A GIVEN USER
ipcMain.handle('db:setLeaderboardVisibility', async (event, userId, hide) => {
  try {
    await db.execute(
      'UPDATE users SET hide_from_leaderboard = ? WHERE id = ?',
      [hide, userId]
    );
    return { success: true };
  } catch (err) {
    console.error('Leaderboard visibility update error:', err);
    return { success: false };
  }
});

// GET USER STATS
ipcMain.handle('db:getUserStats', async (event, userId) => {
  try {
    const [[stats]] = await db.execute('CALL proc_get_user_stats(?)', [userId]);
    return stats;
  } catch (err) {
    console.error(err);
    return null;
  }
});

// UPDATE USER STREAK DAYS
ipcMain.handle('db:updateStreakDays', (event, userId, streak) =>
  db.execute('CALL proc_update_streak_days(?, ?)', [userId, streak])
    .then(() => ({ success: true }))
    .catch(err => ({ success: false, error: err }))
);