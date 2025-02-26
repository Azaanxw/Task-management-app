const { contextBridge,ipcRenderer } = require('electron');
const activeWin = require('active-win');



contextBridge.exposeInMainWorld('appTracker', {
    getActiveApplication: async () => {
        const app = await activeWin();
        console.log(app.owner.path);
        if (app) {
            let icon = await ipcRenderer.invoke('get-app-icon', app.owner.path);  // Extracts icon from .exe

            return {
                name: app.owner.name,
                title: app.title,
                icon: icon
            };
        }
        return null;
    },
});