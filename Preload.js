// Preload.js (v1.5 - 正規化対応)

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  
  // --- settingsRenderer.js 用 ---
  send: (channel, data) => {
    const validChannels = ['load-data', 'save-data', 'run-or-update-roulette', 'roulette-finished', 'sync-legend-colors', 'request-legend-data'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },

  selectAudioFile: async () => {
    return await ipcRenderer.invoke('open-file-dialog');
  },

  openSaveFolder: async () => {
    return await ipcRenderer.invoke('open-save-folder');
  },
  
  // ▼▼▼ 追加: 新しいプロファイル作成をメインプロセスに依頼する ▼▼▼
  createProfile: async (name) => {
    return await ipcRenderer.invoke('create-new-profile', name);
  },
  // ▲▲▲ 追加 ▲▲▲

  on: (channel, callback) => {
    const validChannels = ['data-loaded', 'data-saved', 'data-save-error', 'update-legend', 'highlight-winner'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args)); 
    }
  },
  
  // --- rouletteRenderer.js 用 ---
  getThemeProfile: async (themeName) => {
    const profile = await ipcRenderer.invoke('get-theme-profile', themeName);
    return profile;
  },
  getThemeList: async () => {
    return await ipcRenderer.invoke('get-theme-list');
  },
  
  showRouletteContextMenu: () => {
    ipcRenderer.send('show-roulette-context-menu');
  },
  
  onSettingsUpdated: (callback) => {
    ipcRenderer.on('update-roulette-data', (event, data) => callback(data));
  }
});