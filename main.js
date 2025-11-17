// main.js

const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const Store = require('electron-store');

// Storeを初期化 (v7以降は .default が必要)
const store = new Store.default({
  defaults: {
    settings: {
      // 項目リスト (名前 と "重み" で確率を表現)
      items: [
        { "name": "激辛お菓子", "weight": 10 },
        { "name": "サインチェキ", "weight": 10 },
        { "name": "歌います", "weight": 10 },
        { "name": "動画", "weight": 10 },
        { "name": "踊ります", "weight": 10 }
      ],
      // フェイク動作のON/OFF
      fakeSpin: false 
    }
  }
});

// メインウィンドウをグローバルで保持
let mainWindow;

/**
 * メインウィンドウを作成する関数
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 1000, 

    transparent: true, // ウィンドウを透明化
    frame: false,
    
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // ▼▼▼ 読み込むHTMLを改造版に指定 ▼▼▼
  mainWindow.loadFile('cosmicroulette.html');
  // ▲▲▲

  // (開発用) デベロッパーツールを開く
  // mainWindow.webContents.openDevTools();

  // --- IPCハンドラ ---

  // (読み込み)
  ipcMain.handle('get-store-value', (event, key) => {
    return store.get(key);
  });

  // (書き込み)
  ipcMain.on('set-store-value', (event, key, value) => {
    store.set(key, value);
  });
  
  // (更新通知)
  ipcMain.on('settings-updated', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('on-settings-updated');
    }
  });

  // (設定画面を開く)
  ipcMain.on('open-settings-window', () => {
    if (BrowserWindow.getAllWindows().find(w => w.getTitle() === '設定')) {
      return;
    }
    createSettingsWindow();
  });
}

/**
 * 設定ウィンドウを作成する関数
 */
function createSettingsWindow() {
  const settingsWindow = new BrowserWindow({
    width: 400,
    height: 500,
    title: '設定',
    // modal: false (非モーダル)
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), 
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.loadFile('settings.html');
}


// --- アプリのライフサイクル ---
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});