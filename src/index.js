const { app, BrowserWindow, ipcMain,screen } = require('electron');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2');
require('dotenv').config();
const globalData = require('./globalData');

// Disables gpu cache and shader as there's caching issues
app.commandLine.appendSwitch('disable-gpu-cache');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

let mainWindow;
const activeWin = require('active-win');

app.on('ready', () => {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: true,
        },
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));
});

// Quits the app when all windows are closed
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// mySQL database connection
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database:  process.env.DB_NAME,
    port: 3306,
});

db.connect((err) => {
    if (err) {
        console.error('Database connection failed:', err.message);
        return;
    }
    console.log('Connected to MySQL database.');
});

// Handles database queries from the renderer process
ipcMain.handle('db-query', async (event, queryString) => {
    return new Promise((resolve, reject) => {
        db.query(queryString, (err, results) => {
            if (err) {   
                console.error('Error executing query:', err.message);
                reject(err);
            } else {
                resolve(results);
            }
        });
    });
});


// Function to extract and save the icon
async function extractAndSaveIcon(filePath) {
    try {
        let icon = await app.getFileIcon(filePath, { size: 'large' }); 
        let iconBuffer = icon.toPNG(); 

        let iconFilename = path.basename(filePath, '.exe') + '.png'; // Names it after the exe
        let iconPath = path.join(app.getPath('userData'), iconFilename); // Save it in userData folder

        fs.writeFileSync(iconPath, iconBuffer); // Saves it as a file

        return iconPath; 
    } catch (error) {
        console.error("Error extracting icon:", error);
        return null;
    }
}


// IPC handler to fetch and save app icon
ipcMain.handle('get-app-icon', async (event, exePath) => {
    return await extractAndSaveIcon(exePath);
});


const { exec } = require("child_process");

// Starts Tailwind CLI in watch mode automatically
exec("npm run build.css", (err, stdout, stderr) => {
    if (err) {
        console.error(`Tailwind Watch Error: ${stderr}`);
        return;
    }
    console.log(`Tailwind Watch Running: ${stdout}`);
});

// Overlay window setup
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
      nodeIntegration: false,
      contextIsolation: true, 
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  overlayWindow.loadFile('src/overlay.html'); // Loads the overlay window that goes over the distracting application
  overlayWindow.hide();
     
}


async function updateOverlayBounds(overlayWindow) {
  try {
    const winInfo = await activeWin();

    if (winInfo && winInfo.bounds) {
      const { x, y, width, height } = winInfo.bounds;

      // Get the current display containing active window
      const display = screen.getDisplayMatching(winInfo.bounds);
      const scaleFactor = display.scaleFactor;

      // Correctly translates coordinates
      let scaledX = Math.floor((x - display.bounds.x) / scaleFactor + display.bounds.x);
      let scaledY = Math.floor((y - display.bounds.y) / scaleFactor + display.bounds.y);
      let scaledWidth = Math.floor(width / scaleFactor);
      let scaledHeight = Math.floor(height / scaleFactor);

      overlayWindow.setBounds({
        x: scaledX,
        y: scaledY,
        width: scaledWidth,
        height: scaledHeight,
      });

      
      const activeAppName = winInfo.owner.name.replace('.exe', '').trim();

      if (globalData.distractingApps.includes(activeAppName) && display.id == screen.getPrimaryDisplay().id) { // Detects which display is the main 
        overlayWindow.show();
      } else {
        overlayWindow.hide();
      }
    }
  } catch (error) {
    console.error("Error updating overlay bounds:", error);
  }
}

// Frequent updating for smooth responsiveness
setInterval(() => updateOverlayBounds(overlayWindow), 100);

// Creates the overlay when app is ready
app.whenReady().then(createOverlayWindow);

// Periodically update overlay window based on active app
setInterval(async () => {
  const winInfo = await activeWin();
  if (!winInfo || overlayWindow.isDestroyed()) return;

  
  const activeAppName = winInfo.owner.name.replace('.exe', '').trim();
  if (globalData.distractingApps.includes(activeAppName)) {
    overlayWindow.show();
  } else {
    overlayWindow.hide();
  }
}, 1000);


// IPC handler for getting global data
ipcMain.handle('get-global-data', () => {
  return globalData;
});

// IPC handler for adding distracting apps to the list 
ipcMain.handle('add-distracting-app', (event, appName) => {
  if (appName && !globalData.distractingApps.includes(appName)) {
    globalData.distractingApps.push(appName);
    // Broadcasts the updated data to all renderer processes:
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('global-data-updated', globalData);
    });
  }
  return globalData;
});