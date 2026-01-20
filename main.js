// main.js (v3.0 - Data Normalization & Migration)

const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// ログ設定
autoUpdater.logger = require("electron-log");
autoUpdater.logger.transports.file.level = "info";

// --- データモデル定義 (正規化・マイグレーション用) ---
const DefaultSettings = {
    theme: 'candy',
    spinMode: 'suspense',
    fakeEnabled: false,
    isMuted: false,
    bgmPath: 'sounds/music.mp3',
    musicDuration: 8.0,
    transparentBg: true
};

class ProfileModel {
    static create(name = "新しい設定") {
        return {
            id: `profile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: name,
            items: [
                { name: "新規項目", weight: null, isAuto: true, isHorizontal: false }
            ],
            settings: { ...DefaultSettings }
        };
    }

    static normalize(profile) {
        if (!profile) return null;
        
        // IDがない場合は付与
        if (!profile.id) profile.id = `profile-${Date.now()}`;
        
        // 名前チェック
        if (!profile.name) profile.name = "名称未設定";

        // 設定の正規化 (不足キーをデフォルト値で埋める)
        profile.settings = { ...DefaultSettings, ...(profile.settings || {}) };

        // bgmPathのパス修正 (互換性維持)
        if (!profile.settings.bgmPath) profile.settings.bgmPath = DefaultSettings.bgmPath;

        // itemsの正規化
        if (!Array.isArray(profile.items)) profile.items = [];
        profile.items = profile.items.map(item => ({
            name: item.name || "",
            weight: (item.weight === null || item.weight === "") ? null : parseFloat(item.weight),
            isAuto: item.isAuto !== undefined ? item.isAuto : (item.weight === null),
            isHorizontal: !!item.isHorizontal,
            // 必要なプロパティがあればここに追加
            ...item
        }));

        return profile;
    }
}
// ---------------------------------------------------

const store = new Store.default({
  defaults: {
    appData: {
      activeProfileId: null,
      profiles: [ ProfileModel.create("デフォルト設定") ]
    }
  }
});

// 初期化時にアクティブIDがなければ設定
const initData = store.get('appData');
if (!initData.activeProfileId && initData.profiles.length > 0) {
    initData.activeProfileId = initData.profiles[0].id;
    store.set('appData', initData);
}

let settingsWindow;
let rouletteWindow;
let legendWindow = null;
let lastRouletteData = null;

let currentRouletteTheme = null;
let currentRouletteProfileId = null; 


// --- 2. 設定ウィンドウ ---
function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  
  settingsWindow = new BrowserWindow({
    width: 900,
    height: 700,
    title: '設定',
    webPreferences: {
      preload: path.join(__dirname, 'Preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.loadFile('settings.html');
}

// --- 3. ルーレット本体を開く関数 ---
async function createRouletteWindow(profile) {
  console.log("--- createRouletteWindow が呼ばれました ---");

  if (!profile || !profile.settings || !profile.settings.theme) {
      console.error('無効なプロファイルです。テーマを読み込めません。');
      return;
  }
  
  if (rouletteWindow && !rouletteWindow.isDestroyed()) {
      rouletteWindow.close();
      rouletteWindow = null;
  }

  const themeHtmlPath = 'roulette_themes/master.html';
  const fullHtmlPath = path.join(__dirname, themeHtmlPath);
  
  rouletteWindow = new BrowserWindow({
    width: 650,
    height: 750,
    transparent: true, 
    frame: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'Preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  console.log(`Loading Master Shell: ${themeHtmlPath}`);
  rouletteWindow.loadFile(fullHtmlPath);
  
  currentRouletteTheme = profile.settings.theme;
  currentRouletteProfileId = profile.id;

  rouletteWindow.webContents.on('did-finish-load', () => {
    const rouletteData = {
      items: profile.items,
      settings: profile.settings
    };
    if (rouletteWindow && !rouletteWindow.isDestroyed()) {
        rouletteWindow.webContents.send('update-roulette-data', rouletteData);
    }
  });

  rouletteWindow.on('closed', () => {
    rouletteWindow = null;
    currentRouletteTheme = null;
    currentRouletteProfileId = null;
  });
}

// --- 凡例ウィンドウ ---
function createLegendWindow() {
    if (legendWindow && !legendWindow.isDestroyed()) {
        legendWindow.focus();
        return;
    }

    legendWindow = new BrowserWindow({
        width: 300,
        height: 600,
        title: '項目リスト',
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'Preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    legendWindow.loadFile('legend.html');
    
    legendWindow.on('closed', () => {
        legendWindow = null;
    });
}


// --- 4. アプリ起動時の動作 ---
app.whenReady().then(() => {
  Menu.setApplicationMenu(null); 

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  }

  // ★起動時にデータをロード＆正規化
  const appData = store.get('appData');
  if (appData && appData.profiles) {
      // 全プロファイルを正規化
      appData.profiles = appData.profiles.map(p => ProfileModel.normalize(p));
      store.set('appData', appData); // 正規化後のデータを保存し直す
  }
  
  if (appData && appData.profiles && appData.profiles.length > 0) {
      const activeProfile = appData.profiles.find(p => p.id === appData.activeProfileId) || appData.profiles[0];
      
      // テーマファイルの存在チェック
      const currentThemeId = activeProfile.settings.theme || 'arcade';
      const themeFilePath = path.join(__dirname, 'theme_profiles', `${currentThemeId}.json`);

      if (!fs.existsSync(themeFilePath)) {
          console.warn(`Theme "${currentThemeId}" not found. Resetting to default.`);
          activeProfile.settings.theme = 'candy'; // デフォルトをCandyに
          store.set('appData', appData);
      }
      
      lastRouletteData = activeProfile;
      createRouletteWindow(activeProfile);
  } else {
      createSettingsWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        const appData = store.get('appData');
        if (appData && appData.profiles && appData.profiles.length > 0) {
             const activeProfile = appData.profiles.find(p => p.id === appData.activeProfileId) || appData.profiles[0];
             lastRouletteData = activeProfile;
             createRouletteWindow(activeProfile);
        } else {
             createSettingsWindow();
        }
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// --- アップデート関連 ---
autoUpdater.on('update-available', () => {
  console.log('Update available.');
});
autoUpdater.on('update-downloaded', (info) => {
  dialog.showMessageBox({
    type: 'info',
    title: 'アップデートあり',
    message: `新しいバージョン (${info.version}) がダウンロードされました。\n再起動して適用しますか？`,
    buttons: ['はい', 'いいえ']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});
autoUpdater.on('error', (err) => {
  console.error('Update error:', err);
});


// --- 5. IPCハンドラ ---

// (A) 'load-data' : 読み込み時に必ず正規化を行う
ipcMain.on('load-data', (event) => {
  let data = null; 
  try {
    data = store.get('appData');
    if (data && data.profiles) {
        // ここでも念のため正規化を通す（手動編集などで壊れた場合用）
        data.profiles = data.profiles.map(p => ProfileModel.normalize(p));
    }
  } catch (error) {
    console.error('Failed to load data:', error);
  }
  if (event.sender && !event.sender.isDestroyed()) {
      event.sender.send('data-loaded', data); 
  }
});

// (B) 'save-data'
ipcMain.on('save-data', (event, appData) => {
  try {
    // 保存前にも一応正規化しておく（安全策）
    if (appData && appData.profiles) {
        appData.profiles = appData.profiles.map(p => ProfileModel.normalize(p));
    }
    store.set('appData', appData);
    if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('data-saved');
    }
  } catch (error) {
    console.error('Failed to save data:', error);
    if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('data-save-error', error.message);
    }
  }
});

// (New) 'create-new-profile' : 統一されたひな形を提供する
ipcMain.handle('create-new-profile', (event, name) => {
    return ProfileModel.create(name);
});

// (C) 'run-or-update-roulette'
ipcMain.on('run-or-update-roulette', async (event, profile) => {
    console.log("--- 'run-or-update-roulette' ---");

    // 起動直前の最終正規化
    const cleanProfile = ProfileModel.normalize(profile);
    lastRouletteData = cleanProfile;

    if (!cleanProfile) return;

    // 自動凡例表示ロジック
    let shouldAutoOpenLegend = false;
    if (cleanProfile.items && cleanProfile.items.length > 0) {
        const totalWeight = cleanProfile.items.reduce((sum, item) => sum + (parseFloat(item.weight) || 0), 0);
        if (totalWeight <= 0) {
            const angle = 360 / cleanProfile.items.length;
            if (angle < 12) shouldAutoOpenLegend = true;
        } else {
            for (const item of cleanProfile.items) {
                const w = parseFloat(item.weight) || 0;
                const angle = (w / totalWeight) * 360;
                if (angle < 12) {
                    shouldAutoOpenLegend = true;
                    break;
                }
            }
        }
    }

    if (!rouletteWindow || rouletteWindow.isDestroyed()) {
        await createRouletteWindow(cleanProfile); 
    } else {
        currentRouletteTheme = cleanProfile.settings.theme;
        currentRouletteProfileId = cleanProfile.id;

        const rouletteData = {
          items: cleanProfile.items,
          settings: cleanProfile.settings
        };
        
        if (rouletteWindow && !rouletteWindow.isDestroyed()) {
            rouletteWindow.webContents.send('update-roulette-data', rouletteData);
            rouletteWindow.focus();
        }
    }

    const isLegendOpen = legendWindow && !legendWindow.isDestroyed();
    if (shouldAutoOpenLegend) {
        if (isLegendOpen) {
            legendWindow.webContents.send('update-legend', cleanProfile);
        } else {
            createLegendWindow();
            legendWindow.webContents.once('did-finish-load', () => {
                legendWindow.webContents.send('update-legend', cleanProfile);
            });
        }
    } else {
        if (isLegendOpen) {
            legendWindow.webContents.send('update-legend', cleanProfile);
        }
    }
});

// (D) 'get-theme-profile'
ipcMain.handle('get-theme-profile', (event, themeName) => {
    const filePath = path.join(__dirname, 'theme_profiles', `${themeName}.json`);
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return null;
    }
});

// (E) 'get-theme-list'
ipcMain.handle('get-theme-list', () => {
    const themesDir = path.join(__dirname, 'theme_profiles');
    try {
        const files = fs.readdirSync(themesDir);
        return files
            .filter(file => file.endsWith('.json'))
            .map(file => {
                try {
                    const content = fs.readFileSync(path.join(themesDir, file), 'utf8');
                    const json = JSON.parse(content);
                    return { id: json.themeId, name: json.name };
                } catch (e) { return null; }
            })
            .filter(t => t !== null);
    } catch (e) {
        return [];
    }
});

// (F) 右クリックメニュー
ipcMain.on('show-roulette-context-menu', (event) => {
    const appData = store.get('appData');
    const profiles = appData.profiles || [];

    let themeList = [];
    try {
        const themesDir = path.join(__dirname, 'theme_profiles');
        const files = fs.readdirSync(themesDir);
        themeList = files
            .filter(file => file.endsWith('.json'))
            .map(file => {
                try {
                    const content = fs.readFileSync(path.join(themesDir, file), 'utf8');
                    const json = JSON.parse(content);
                    return { id: json.themeId, name: json.name };
                } catch (e) { return null; }
            })
            .filter(t => t !== null);
    } catch (e) {}

    const profileSubmenu = profiles.map(p => {
        return {
            label: p.name,
            type: 'radio',
            checked: p.id === currentRouletteProfileId, 
            click: async () => {
                const targetProfileIndex = appData.profiles.findIndex(prof => prof.id === p.id);
                if (targetProfileIndex === -1) return;

                if (currentRouletteTheme) {
                    // 設定を一時的に上書きするが、保存はしていない点に注意
                    appData.profiles[targetProfileIndex].settings.theme = currentRouletteTheme;
                }
                
                // 切り替え時にも正規化を通す
                const targetProfile = ProfileModel.normalize(appData.profiles[targetProfileIndex]);
                lastRouletteData = targetProfile;
                
                appData.activeProfileId = targetProfile.id;
                store.set('appData', appData);
                currentRouletteProfileId = targetProfile.id;

                if (rouletteWindow && !rouletteWindow.isDestroyed()) {
                     const rouletteData = { items: targetProfile.items, settings: targetProfile.settings };
                     rouletteWindow.webContents.send('update-roulette-data', rouletteData);
                     rouletteWindow.focus();
                } else {
                    await createRouletteWindow(targetProfile);
                }

                if (settingsWindow && !settingsWindow.isDestroyed()) {
                    settingsWindow.webContents.send('data-loaded', appData);
                }
            }
        };
    });

    const themeSubmenu = themeList.map(t => {
        return {
            label: t.name,
            type: 'radio',
            checked: t.id === currentRouletteTheme,
            click: () => {
                const currentProfileIndex = appData.profiles.findIndex(p => p.id === currentRouletteProfileId);
                if (currentProfileIndex !== -1) {
                    appData.profiles[currentProfileIndex].settings.theme = t.id;
                    store.set('appData', appData);
                    currentRouletteTheme = t.id;
                    
                    const rouletteData = {
                        items: appData.profiles[currentProfileIndex].items,
                        settings: appData.profiles[currentProfileIndex].settings
                    };
                    
                    if (rouletteWindow && !rouletteWindow.isDestroyed()) {
                        rouletteWindow.webContents.send('update-roulette-data', rouletteData);
                        rouletteWindow.focus();
                    }
                    if (settingsWindow && !settingsWindow.isDestroyed()) {
                        settingsWindow.webContents.send('data-loaded', appData);
                    }
                }
            }
        };
    });

    const menuTemplate = [
        { label: 'プロファイル', submenu: profileSubmenu.length > 0 ? profileSubmenu : [{ label: 'なし', enabled: false }] },
        { label: 'テーマ', submenu: themeSubmenu.length > 0 ? themeSubmenu : [{ label: 'なし', enabled: false }] },
        { type: 'separator' },
        { label: '項目リストを表示', click: () => { createLegendWindow(); } },
        { label: '設定画面を開く', click: () => { createSettingsWindow(); } },
        { label: 'ルーレットを閉じる', click: () => { if (rouletteWindow) rouletteWindow.close(); } }
    ];

    const contextMenu = Menu.buildFromTemplate(menuTemplate);
    if (rouletteWindow && !rouletteWindow.isDestroyed()) {
         contextMenu.popup({ window: rouletteWindow });
    }
});

// (G) ファイル選択
ipcMain.handle('open-file-dialog', async () => {
    const defaultPath = path.join(__dirname, 'sounds'); 
    const { canceled, filePaths } = await dialog.showOpenDialog({
        defaultPath: defaultPath,
        properties: ['openFile'],
        filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }]
    });
    return canceled ? null : filePaths[0];
});

// (H) 保存フォルダ
ipcMain.handle('open-save-folder', async () => {
    const folderPath = app.getPath('userData'); 
    await shell.openPath(folderPath);
});

// (I) ルーレット終了時の当選通知
ipcMain.on('roulette-finished', (event, index) => {
    if (legendWindow && !legendWindow.isDestroyed()) {
        legendWindow.webContents.send('highlight-winner', index);
    }
});

// (J) 色情報の同期
ipcMain.on('sync-legend-colors', (event, itemsWithColors) => {
    // 凡例側のデータを更新するが、lastRouletteData自体の色情報はレンダラー任せで良い
    if (lastRouletteData) {
        lastRouletteData.items = itemsWithColors;
    } else {
        lastRouletteData = { items: itemsWithColors, settings: {} };
    }

    if (legendWindow && !legendWindow.isDestroyed()) {
        legendWindow.webContents.send('update-legend', { items: itemsWithColors });
    }
});

// (K) 凡例ウィンドウからのデータ要求応答
ipcMain.on('request-legend-data', (event) => {
    if (lastRouletteData) {
        event.sender.send('update-legend', lastRouletteData);
    }
});