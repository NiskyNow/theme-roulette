// main.js (全文)

const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const Store = require('electron-store');
const fs = require('fs'); // ▼▼▼ 修正: ファイルシステムをインポート ▼▼▼

// Storeを初期化
const store = new Store.default({
  defaults: {
    // 起動時のデフォルトテーマ
    currentTheme: 'arcade', 
    
    // 項目設定
    settings: {
      items: [
        { "name": "激辛お菓子", "weight": 10 },
        { "name": "サインチェキ", "weight": 10 },
        { "name": "歌います", "weight": 10 }
      ],
      fakeSpin: false 
    }
  }
});

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 900, 
    transparent: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // ▼▼▼ 修正 ▼▼▼
  // 起動時にストアから「現在のテーマ」を読み込む
  const themeName = store.get('currentTheme');
  const themeHtmlPath = `roulette_themes/${themeName}.html`;

  console.log(`Loading theme: ${themeHtmlPath}`);
  mainWindow.loadFile(themeHtmlPath); // 決定したテーマのHTMLを読み込む
  // ▲▲▲ 修正 ▲▲▲
  
  // mainWindow.webContents.openDevTools();

  // --- IPCハンドラ ---

  // (読み込み)
  ipcMain.handle('get-store-value', (event, key) => {
    return store.get(key);
  });

  // (書き込み)
  ipcMain.on('set-store-value', (event, key, value) => {
    store.set(key, value);
    
    // ▼▼▼ 修正 ▼▼▼
    // もしテーマが変更されたら、アプリをリロードして反映
    if (key === 'currentTheme') {
        mainWindow.reload();
    }
    // ▲▲▲ 修正 ▲▲▲
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
  
  // ▼▼▼ 修正 ▼▼▼
  // (f)
  ipcMain.handle('get-theme-profile', (event, themeName) => {
      // "arcade" -> "theme_profiles/arcade.json"
      const filePath = path.join(__dirname, 'theme_profiles', `${themeName}.json`);
      console.log(`Reading profile: ${filePath}`);
      try {
          const data = fs.readFileSync(filePath, 'utf8');
          return JSON.parse(data);
      } catch (error) {
          console.error(`Failed to read profile: ${error.message}`);
          return null; // 読み込み失敗
      }
  });
  // ▲▲▲ 修正 ▲▲▲
}

function createSettingsWindow() {
  // ( ... createSettingsWindow のコードは変更なし ... )
  const settingsWindow = new BrowserWindow({
    width: 400,
    height: 500,
    title: '設定',
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