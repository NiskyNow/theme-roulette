// Preload.js (v1.4.4 - 右クリックメニュー対応)

const { contextBridge, ipcRenderer } = require('electron');

// 以下のAPIを 'window.electronAPI' として公開する
contextBridge.exposeInMainWorld('electronAPI', {
  
  // --- 1. settingsRenderer.js (設定画面) 用のAPI ---
  
  // main.js に 'load-data' や 'save-data' などを送信
  send: (channel, data) => {
    // (v1.3.5) チャンネル名を変更
    const validChannels = ['load-data', 'save-data', 'run-or-update-roulette'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  
  // main.js から 'data-loaded' や 'data-saved' を受信
  on: (channel, callback) => {
    const validChannels = ['data-loaded', 'data-saved', 'data-save-error'];
    if (validChannels.includes(channel)) {
      // (event を除外し、data のみコールバックに渡す)
      ipcRenderer.on(channel, (event, ...args) => callback(...args)); 
    }
  },
  
  // --- 2. rouletteRenderer.js (ルーレット本体) 用のAPI ---
  
  // JSONプロファイルを main.js に要求
  getThemeProfile: async (themeName) => {
    const profile = await ipcRenderer.invoke('get-theme-profile', themeName);
    return profile;
  },
  
  // ▼▼▼ 修正 (v1.4.4) 'openSettings' -> 'showRouletteContextMenu' ▼▼▼
  // 右クリックで main.js にコンテキストメニューを要求
  showRouletteContextMenu: () => {
    ipcRenderer.send('show-roulette-context-menu');
  },
  // ▲▲▲ 修正 ▲▲▲
  
  // main.js または settings.html から最新の項目リストを受け取る
  // (v1.3.5) 関数名を変更
  onSettingsUpdated: (callback) => {
    // (v1.3.5) チャンネル名を変更
    ipcRenderer.on('update-roulette-data', (event, data) => callback(data));
  }
});