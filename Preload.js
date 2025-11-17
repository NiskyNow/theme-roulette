// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// レンダラープロセス (rouletteRenderer.js) の 'window' オブジェクトに
// 'electronAPI' という名前で安全な「窓口」を公開する
contextBridge.exposeInMainWorld('electronAPI', {

  // 1. (読み込み) main.jsの 'get-store-value' を呼び出す (非同期)
  getStoreValue: async (key) => {
    const value = await ipcRenderer.invoke('get-store-value', key);
    return value;
  },
  
  // 2. (書き込み) main.jsの 'set-store-value' を呼び出す
  setStoreValue: (key, value) => {
    ipcRenderer.send('set-store-value', key, value);
  },

  // 3. (設定画面を開く) main.jsの 'open-settings-window' を呼び出す
  openSettings: () => {
    ipcRenderer.send('open-settings-window');
  },

  // 4. (更新通知を送る) main.jsの 'settings-updated' を呼び出す
  sendSettingsUpdated: () => {
    ipcRenderer.send('settings-updated');
  },

  // 5. (更新通知を受け取る) main.jsからの 'on-settings-updated' を待つ
  onSettingsUpdated: (callback) => {
    // チャンネル名を固定し、安全にコールバックを実行
    ipcRenderer.on('on-settings-updated', (event, ...args) => callback(...args));
  }
});