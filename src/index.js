const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const mysql = require('mysql2');
require('dotenv').config(); // Load .env variables
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
