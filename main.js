// main.js (v2.3 - 起動時ルーレット & 幅広版)

const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron'); // ▼ shellを追加
const path = require('path');
const Store = require('electron-store');
const fs = require('fs');
const { autoUpdater } = require('electron-updater'); // ▼ 追加

// ▼▼▼ 追加: ログが出るように設定（開発中の確認用） ▼▼▼
autoUpdater.logger = require("electron-log");
autoUpdater.logger.transports.file.level = "info";

const store = new Store.default({
  defaults: {
    appData: {
      activeProfileId: 'default-profile',
      profiles: [
        {
          id: 'default-profile',
          name: 'デフォルト',
          settings: {
            theme: 'arcade', 
            fakeEnabled: false,
            transparentBg: true
          },
          items: [
            { "name": "激辛お菓子", "weight": 10 },
            { "name": "サインチェキ", "weight": 10 },
            { "name": "歌います", "weight": 10 }
          ]
        }
      ]
    }
  }
});

let settingsWindow;
let rouletteWindow;

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
  
  // 既存のウィンドウがある場合は一度閉じて再生成（透明度やサイズの変更を確実に反映するため）
  if (rouletteWindow && !rouletteWindow.isDestroyed()) {
      rouletteWindow.close();
      rouletteWindow = null;
  }

  const themeHtmlPath = 'roulette_themes/master.html';
  const fullHtmlPath = path.join(__dirname, themeHtmlPath);
  
  rouletteWindow = new BrowserWindow({
    width: 650,  // ネオンがはみ出る余裕を持たせる
    height: 750, // ボタンが見切れないように調整
    transparent: true, 
    frame: false,      // 枠なし
    hasShadow: false,  // 影なし（透過時のノイズ防止）
    backgroundColor: '#00000000', // 完全透明
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
    console.log("--- 'closed' イベントが発火しました ---");
    rouletteWindow = null;
    currentRouletteTheme = null;
    currentRouletteProfileId = null;
  });
}

// --- 4. アプリ起動時の動作 (修正) ---
app.whenReady().then(() => {
  // ▼▼▼ この1行を追加してメニューバーを消去します ▼▼▼
  Menu.setApplicationMenu(null); 
  // ▲▲▲ 追加 ▲▲▲

  // ▼▼▼ 追加: アップデート確認の実行 ▼▼▼
  // 開発環境(dev)ではエラーになることがあるので、本番ビルド時のみ動くようにするガード
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  }
  // ▲▲▲ 追加 ▲▲▲


  // ▼▼▼ 修正 (v2.3) 起動時にルーレットを開く ▼▼▼
  const appData = store.get('appData');
  
  // 有効なプロファイルがあるか確認
  if (appData && appData.profiles && appData.profiles.length > 0) {
      // 前回のアクティブプロファイル、または最初のプロファイルを取得
      const activeProfile = appData.profiles.find(p => p.id === appData.activeProfileId) || appData.profiles[0];
      
      // ルーレットを開く
      createRouletteWindow(activeProfile);
  } else {
      // データがない場合（初回起動など）は設定画面を開く
      createSettingsWindow();
  }
  // ▲▲▲ 修正 ▲▲▲

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        const appData = store.get('appData');
        if (appData && appData.profiles && appData.profiles.length > 0) {
             const activeProfile = appData.profiles.find(p => p.id === appData.activeProfileId) || appData.profiles[0];
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

// ▼▼▼ 追加: アップデート関連のイベントリスナー ▼▼▼

// 1. アップデートが見つかったとき
autoUpdater.on('update-available', () => {
  // ここでユーザーに「ダウンロード中...」と伝えたりできますが、
  // checkForUpdatesAndNotify() はダウンロード完了まで自動で進めます。
  console.log('Update available.');
});

// 2. アップデートのダウンロードが完了したとき
autoUpdater.on('update-downloaded', (info) => {
  // ユーザーに再起動を促すダイアログを表示
  dialog.showMessageBox({
    type: 'info',
    title: 'アップデートあり',
    message: `新しいバージョン (${info.version}) がダウンロードされました。\n再起動して適用しますか？`,
    buttons: ['はい', 'いいえ']
  }).then((result) => {
    if (result.response === 0) {
      // 「はい」が押されたら終了してインストール
      autoUpdater.quitAndInstall();
    }
  });
});

// 3. エラーが起きたとき
autoUpdater.on('error', (err) => {
  console.error('Update error:', err);
});
// ▲▲▲ 追加ここまで ▲▲▲

// --- 5. IPCハンドラ ---

// (A) 'load-data'
ipcMain.on('load-data', (event) => {
  let data = null; 
  try {
    data = store.get('appData'); 
  } catch (error) {
    console.error('Failed to load data from electron-store:', error);
  }
  if (event.sender && !event.sender.isDestroyed()) {
      event.sender.send('data-loaded', data); 
  }
});

// (B) 'save-data'
ipcMain.on('save-data', (event, appData) => {
  try {
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

// (C) 'run-or-update-roulette'
ipcMain.on('run-or-update-roulette', async (event, profile) => {
    console.log("--- 'run-or-update-roulette' が呼ばれました ---");

    if (!profile) {
        console.error("run-or-update-roulette が profile無しで呼ばれました。");
        return;
    }

    if (!rouletteWindow || rouletteWindow.isDestroyed()) {
        console.log("ルーレットが (開いていない) ため、新規作成します。");
        await createRouletteWindow(profile); 
    } else {
        console.log("ウィンドウが存在するため、データを更新してテーマを切り替えます。");
        
        currentRouletteTheme = profile.settings.theme;
        currentRouletteProfileId = profile.id;

        const rouletteData = {
          items: profile.items,
          settings: profile.settings
        };
        
        if (rouletteWindow && !rouletteWindow.isDestroyed()) {
            rouletteWindow.webContents.send('update-roulette-data', rouletteData);
            rouletteWindow.focus();
        }
    }
});

// (D) 'get-theme-profile'
ipcMain.handle('get-theme-profile', (event, themeName) => {
    const filePath = path.join(__dirname, 'theme_profiles', `${themeName}.json`);
    console.log(`Reading profile: ${filePath}`);
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Failed to read profile: ${error.message}`);
        return null;
    }
});

// (E) 'get-theme-list' (v1.5.1)
ipcMain.handle('get-theme-list', () => {
    const themesDir = path.join(__dirname, 'theme_profiles');
    try {
        const files = fs.readdirSync(themesDir);
        const themes = files
            .filter(file => file.endsWith('.json'))
            .map(file => {
                try {
                    const content = fs.readFileSync(path.join(themesDir, file), 'utf8');
                    const json = JSON.parse(content);
                    return { id: json.themeId, name: json.name };
                } catch (e) {
                    console.error(`Failed to parse theme: ${file}`, e);
                    return null;
                }
            })
            .filter(t => t !== null);
        return themes;
    } catch (e) {
        console.error("Failed to read theme directory", e);
        return [];
    }
});

// (F) 右クリックメニュー
ipcMain.on('show-roulette-context-menu', (event) => {
    const appData = store.get('appData');
    const profiles = appData.profiles || [];

    // テーマ一覧取得 (メニュー用)
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
                console.log(`Menu: Switching to profile ${p.name}`);
                
                const targetProfileIndex = appData.profiles.findIndex(prof => prof.id === p.id);
                if (targetProfileIndex === -1) return;

                if (currentRouletteTheme) {
                    appData.profiles[targetProfileIndex].settings.theme = currentRouletteTheme;
                }
                
                const targetProfile = appData.profiles[targetProfileIndex];
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
                console.log(`Menu: Changing theme to ${t.name}`);
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
        {
            label: 'プロファイル (Profiles)',
            submenu: profileSubmenu.length > 0 ? profileSubmenu : [{ label: 'なし', enabled: false }]
        },
        {
            label: 'テーマ (Themes)',
            submenu: themeSubmenu.length > 0 ? themeSubmenu : [{ label: 'なし', enabled: false }]
        },
        { type: 'separator' },
        {
            label: '設定画面を開く',
            click: () => { createSettingsWindow(); }
        },
        {
            label: 'ルーレットを閉じる',
            click: () => {
                if (rouletteWindow && !rouletteWindow.isDestroyed()) {
                    rouletteWindow.close();
                }
            }
        }
    ];

    const contextMenu = Menu.buildFromTemplate(menuTemplate);
    if (rouletteWindow && !rouletteWindow.isDestroyed()) {
         contextMenu.popup({ window: rouletteWindow });
    }
});

// (G) ファイル選択ダイアログを開く
ipcMain.handle('open-file-dialog', async () => {
    // ▼▼▼ 修正: デフォルトパスを sounds フォルダに指定 ▼▼▼
    const defaultPath = path.join(__dirname, 'sounds'); 

    const { canceled, filePaths } = await dialog.showOpenDialog({
        defaultPath: defaultPath, // ここで指定
        properties: ['openFile'],
        filters: [
            { name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }
        ]
    });
    if (canceled) {
        return null;
    } else {
        return filePaths[0]; // 選択されたファイルのフルパスを返す
    }
});

// (H) 保存フォルダを開く
ipcMain.handle('open-save-folder', async () => {
    // electron-store がデータを保存しているフォルダ (UserData) を開く
    const folderPath = app.getPath('userData'); 
    await shell.openPath(folderPath);
});