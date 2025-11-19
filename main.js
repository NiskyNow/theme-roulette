// main.js (v1.4.6 - テーマ維持切り替え対応)

const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const Store = require('electron-store');
const fs = require('fs');

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

// --- 2. 設定ウィンドウ (変更なし) ---
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

// --- 3. ルーレット本体を開く関数 (変更なし) ---
async function createRouletteWindow(profile) {
  console.log("--- createRouletteWindow が呼ばれました ---");
  console.log(`(呼び出し時) rouletteWindow の状態: ${rouletteWindow ? '存在します' : 'null または undefined'}`);

  if (!profile || !profile.settings || !profile.settings.theme) {
      console.error('無効なプロファイルです。テーマを読み込めません。');
      return;
  }
  
  if (rouletteWindow && !rouletteWindow.isDestroyed()) {
    console.log("古いウィンドウが存在するため、閉じるのを待機します...");
    await new Promise((resolve) => {
      rouletteWindow.once('closed', () => {
        console.log("--- 'closed' イベント (Promise内) が発火しました ---");
        resolve();
      });
      rouletteWindow.close();
    });
    console.log("古いウィンドウが閉じたため、新規作成を続行します。");
  } else {
    console.log("古いウィンドウは存在しないため、.close() をスキップします。");
  }

  const themeName = profile.settings.theme;
  const themeHtmlPath = `roulette_themes/${themeName}.html`;
  const fullHtmlPath = path.join(__dirname, themeHtmlPath);
  
  if (!fs.existsSync(fullHtmlPath)) {
      console.error(`テーマファイルが見つかりません: ${themeHtmlPath}`);
      if (settingsWindow && !settingsWindow.isDestroyed()) {
          settingsWindow.webContents.send('data-save-error', `テーマファイル(${themeName}.html)が見つかりません。`);
      }
      return;
  }

  rouletteWindow = new BrowserWindow({
    width: 800,
    height: 900,
    transparent: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'Preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  console.log(`Loading theme: ${themeHtmlPath}`);
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
    console.log("--- (新規) 'closed' イベントが発火しました ---");
    rouletteWindow = null;
    currentRouletteTheme = null;
    currentRouletteProfileId = null;
  });
}

// --- 4. アプリ起動時の動作 (変更なし) ---
app.whenReady().then(() => {
  createSettingsWindow(); 

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createSettingsWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// --- 5. 新しいIPC（通信）ハンドラ ---

// (A) 'load-data' (変更なし)
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

// (B) 'save-data' (変更なし)
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

// (C) 'run-or-update-roulette' (変更なし)
ipcMain.on('run-or-update-roulette', async (event, profile) => {
    console.log("--- 'run-or-update-roulette' が呼ばれました ---");

    if (!profile) {
        console.error("run-or-update-roulette が profile無しで呼ばれました。");
        return;
    }

    // 1. ルーレットが現在開いているか？
    if (!rouletteWindow || rouletteWindow.isDestroyed()) {
        console.log("ルーレットが (開いていない) ため、新規作成します。");
        await createRouletteWindow(profile); 
    } else {
        // 2. テーマ または プロファイルID が変更されているか？
        if (profile.id !== currentRouletteProfileId || profile.settings.theme !== currentRouletteTheme) {
            console.log("テーマまたはプロファイルが変更されたため、ウィンドウを再生成します。");
            await createRouletteWindow(profile); 
        } else {
            console.log("テーマは同じなため、データのみ更新します。");
            const rouletteData = {
              items: profile.items,
              settings: profile.settings
            };
            if (rouletteWindow && !rouletteWindow.isDestroyed()) {
                rouletteWindow.webContents.send('update-roulette-data', rouletteData);
                
                // ▼▼▼ 追加 (v1.4.10) ▼▼▼
                // データ更新時でもウィンドウを最前面に持ってくる
                rouletteWindow.focus();
                // ▲▲▲ 追加 ▲▲▲
            }
        }
    }
});
// (D) 'get-theme-profile' (変更なし)
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


// ▼▼▼ 修正 (v1.4.6) 右クリックメニューのハンドラ ▼▼▼
ipcMain.on('show-roulette-context-menu', (event) => {
    const appData = store.get('appData');
    const profiles = appData.profiles || [];

    const profileSubmenu = profiles.map(p => {
        return {
            label: p.name,
            type: 'radio',
            checked: p.id === currentRouletteProfileId, 
            click: async () => {
                console.log(`Menu: Switching to profile ${p.name} (Theme inheriting: ${currentRouletteTheme})`);

                // 1. ストア内の対象プロファイルを特定する
                const targetProfileIndex = appData.profiles.findIndex(prof => prof.id === p.id);
                if (targetProfileIndex === -1) return;

                // ▼▼▼ 修正ポイント ▼▼▼
                // 現在開いているテーマがあれば、切り替え先のプロファイルにもそのテーマを強制適用する
                if (currentRouletteTheme) {
                    appData.profiles[targetProfileIndex].settings.theme = currentRouletteTheme;
                }
                // ▲▲▲ 修正ポイント ▲▲▲
                
                const targetProfile = appData.profiles[targetProfileIndex];

                // 2. ストアの 'activeProfileId' と '更新されたプロファイル' を保存する
                appData.activeProfileId = targetProfile.id;
                store.set('appData', appData);

                // 3. ルーレットを切り替える (同じテーマなら再生成せずデータ更新だけになる)
                // run-or-update-roulette と同じロジックを通すため、
                // ここで直接呼ぶのではなく、イベントハンドラと同じ処理を行うか、関数化するのが理想だが
                // 今回は createRouletteWindow へのロジックを記述する。
                
                // もしテーマが同じならウィンドウを閉じずにデータ更新だけで済ませたい場合:
                if (targetProfile.settings.theme === currentRouletteTheme && rouletteWindow && !rouletteWindow.isDestroyed()) {
                     console.log("Menu: テーマ維持のためデータのみ更新");
                     const rouletteData = {
                        items: targetProfile.items,
                        settings: targetProfile.settings
                     };
                     rouletteWindow.webContents.send('update-roulette-data', rouletteData);
                     
                     // 現在のIDを更新
                     currentRouletteProfileId = targetProfile.id;
                } else {
                    // テーマが変わった(あるいはウィンドウがない)場合は再生成
                    await createRouletteWindow(targetProfile);
                }

                // 4. 設定ウィンドウが開いていれば、データを再読み込みさせて同期する
                if (settingsWindow && !settingsWindow.isDestroyed()) {
                    settingsWindow.webContents.send('data-loaded', appData);
                }
            }
        };
    });

    const menuTemplate = [
        {
            label: 'プロファイルを選択',
            submenu: profileSubmenu.length > 0 ? profileSubmenu : [{ label: 'プロファイルがありません', enabled: false }]
        },
        { type: 'separator' },
        {
            label: '設定画面を開く',
            click: () => {
                createSettingsWindow();
            }
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
// ▲▲▲ 修正 ▲▲▲