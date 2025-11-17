// preload.js (全文)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  
  // ( ... getStoreValue, setStoreValue ... 変更なし ... )
  getStoreValue: async (key) => {
    const value = await ipcRenderer.invoke('get-store-value', key);
    return value;
  },
  setStoreValue: (key, value) => {
    ipcRenderer.send('set-store-value', key, value);
  },

  // ▼▼▼ 修正 ▼▼▼
  // テーマのJSONプロファイルを main.js に要求する
  getThemeProfile: async (themeName) => {
    console.log(`(preload) -> main: 'get-theme-profile' (theme: ${themeName})`);
    const profile = await ipcRenderer.invoke('get-theme-profile', themeName);
    return profile;
  },
  // ▲▲▲ 修正 ▲▲▲

  // ( ... openSettings, sendSettingsUpdated, onSettingsUpdated ... 変更なし ... )
  openSettings: () => {
    ipcRenderer.send('open-settings-window');
  },
  sendSettingsUpdated: () => {
    ipcRenderer.send('settings-updated');
  },
  onSettingsUpdated: (callback) => {
    ipcRenderer.on('on-settings-updated', (event, ...args) => callback(...args));
  }
});