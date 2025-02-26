const { app, BrowserWindow, ipcMain,nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2');
require('dotenv').config();
let mainWindow;

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