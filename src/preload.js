const { contextBridge } = require('electron');
const activeWin = require('active-win');

// Expose the `getActiveApplication` function to the renderer process
contextBridge.exposeInMainWorld('appTracker', {
    getActiveApplication: async () => {
        const app = await activeWin();
        if (app) {
            return {
                name: app.owner.name, // App name
                title: app.title, // Window title
            };
        }
        return null;
    },
});
