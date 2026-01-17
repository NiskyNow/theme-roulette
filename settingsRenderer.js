// settingsRenderer.js

/* === Electronとの通信 === */
const api = window.electronAPI;

/* === グローバル状態管理 === */
const state = {
    appData: {
        activeProfileId: null,
        profiles: []
    },
    currentProfileId: null,
    get currentProfile() {
        return this.appData.profiles.find(p => p.id === this.currentProfileId);
    }
};

/* --- DOM要素のキャッシュ --- */
const dom = {};

/* --- 初期化処理 --- */
window.onload = async () => {
    dom.profileSelect = document.getElementById('profile-select');
    dom.itemsContainer = document.getElementById('items-list-container');
    dom.itemTemplate = document.getElementById('item-template');
    dom.totalProbDisplay = document.getElementById('total-prob-display');
    
    // UIパーツ
    dom.saveBtn = document.getElementById('save-btn');
    dom.saveStatus = document.getElementById('save-status');
    dom.fakeEnabled = document.getElementById('fake-enabled');
    dom.themeSelect = document.getElementById('theme-select'); 
    dom.selectAllHorizontal = document.getElementById('select-all-horizontal');
    dom.muteEnabled = document.getElementById('mute-enabled'); // 無音
    
    // 演出モード関連
    dom.spinModeSelect = document.getElementById('spin-mode-select');
    dom.musicSettingsArea = document.getElementById('music-settings-area');
    dom.spinDurationSlider = document.getElementById('spin-duration-slider');
    dom.durationText = document.getElementById('duration-text');
    dom.bgmPathDisplay = document.getElementById('bgm-path-display');
    dom.bgmSelectBtn = document.getElementById('bgm-select-btn');
    dom.bgmResetBtn = document.getElementById('bgm-reset-btn');
    dom.bgmWarning = document.getElementById('bgm-warning'); // 警告

    dom.openFolderBtn = document.getElementById('open-folder-btn');
    dom.runBtn = document.getElementById('open-roulette-btn');

    // ▼▼▼ まとめて入力用要素の取得 ▼▼▼
    dom.bulkBtn = document.getElementById('bulk-input-btn');
    dom.bulkModal = document.getElementById('bulk-modal');
    dom.bulkTextarea = document.getElementById('bulk-textarea');
    dom.bulkConfirm = document.getElementById('bulk-confirm-btn');
    dom.bulkCancel = document.getElementById('bulk-cancel-btn');

    // フォルダボタンのクリックイベント
    dom.openFolderBtn.addEventListener('click', () => {
        api.openSaveFolder();
    });

    setupEventListeners();
    setupIPCListeners();
    await loadThemeOptions();
    api.send('load-data');
};

async function loadThemeOptions() {
    try {
        const themes = await api.getThemeList();
        dom.themeSelect.innerHTML = '';
        if (themes.length === 0) {
            const option = document.createElement('option');
            option.text = "テーマが見つかりません";
            dom.themeSelect.add(option);
            return;
        }
        themes.forEach(theme => {
            const option = document.createElement('option');
            option.value = theme.id;
            option.textContent = theme.name;
            dom.themeSelect.appendChild(option);
        });
    } catch (error) {
        console.error("テーマ一覧の読み込みに失敗しました:", error);
    }
}

function setupEventListeners() {
    dom.profileSelect.addEventListener('change', (e) => actions.loadProfile(e.target.value));
    document.querySelector('.btn-new').addEventListener('click', actions.handleNewProfile);
    document.querySelector('.btn-rename').addEventListener('click', actions.handleRenameProfile);
    document.querySelector('.btn-delete').addEventListener('click', actions.handleDeleteProfile);

    document.getElementById('add-item-btn').addEventListener('click', () => {
        actions.addItem();
        render(); 
    });

    // ▼▼▼ まとめて入力機能のイベント ▼▼▼
    if (dom.bulkBtn) {
        dom.bulkBtn.addEventListener('click', () => {
            // モーダルを開く
            dom.bulkTextarea.value = '';
            dom.bulkModal.classList.add('visible');
            dom.bulkTextarea.focus();
        });
    }
    if (dom.bulkCancel) {
        dom.bulkCancel.addEventListener('click', () => {
            // モーダルを閉じる
            dom.bulkModal.classList.remove('visible');
        });
    }
    if (dom.bulkConfirm) {
        dom.bulkConfirm.addEventListener('click', () => {
            // 追加実行
            actions.addBulkItems(dom.bulkTextarea.value);
            dom.bulkModal.classList.remove('visible');
        });
    }
    // ▲▲▲ 追加ここまで ▲▲▲

    // 設定変更イベント
    dom.fakeEnabled.addEventListener('change', (e) => actions.updateSettings('fakeEnabled', e.target.checked));
    dom.muteEnabled.addEventListener('change', (e) => actions.updateSettings('isMuted', e.target.checked));
    dom.themeSelect.addEventListener('change', (e) => actions.updateSettings('theme', e.target.value));

    // モード変更イベント（即時反映）
    dom.spinModeSelect.addEventListener('change', (e) => {
        const mode = e.target.value;
        actions.updateSettings('spinMode', mode);
        toggleMusicSettings(mode);
    });

    // BGM関連
    dom.bgmSelectBtn.addEventListener('click', async () => {
        const path = await api.selectAudioFile();
        if (path) {
            actions.updateSettings('bgmPath', path);
            dom.bgmPathDisplay.value = path;
            validateBgm(); // チェック
        }
    });

    dom.bgmResetBtn.addEventListener('click', () => {
        // リセット時は sounds/music.mp3 に戻す
        const defaultBgm = 'sounds/music.mp3';
        actions.updateSettings('bgmPath', defaultBgm);
        dom.bgmPathDisplay.value = defaultBgm;
        validateBgm();
    });

    dom.spinDurationSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        dom.durationText.textContent = val.toFixed(1) + "秒";
        actions.updateSettings('musicDuration', val);
    });

    dom.saveBtn.addEventListener('click', () => {
        // 保存に成功したら、ルーレットも更新する
        if (actions.saveData(true)) {
            api.send('run-or-update-roulette', state.currentProfile);
        }
    });
    
    dom.runBtn.addEventListener('click', () => {
        if (actions.saveData(false)) {
            api.send('run-or-update-roulette', state.currentProfile);
        }
    });

    dom.selectAllHorizontal.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        const profile = state.currentProfile;
        if (!profile) return;
        profile.items.forEach(item => { item.isHorizontal = isChecked; });
        render();
    });

    dom.itemsContainer.addEventListener('change', (e) => {
        const target = e.target;
        const itemCard = target.closest('.item-card');
        if (!itemCard) return;
        const index = parseInt(itemCard.dataset.index, 10);
        
        if (target.classList.contains('item-name-input')) {
            actions.updateItem(index, 'name', target.value);
        } else if (target.classList.contains('prob-manual-input')) {
            actions.updateItem(index, 'weight', target.value);
        } else if (target.classList.contains('horizontal-input')) {
            actions.updateItem(index, 'isHorizontal', target.checked);
            const allChecked = state.currentProfile.items.every(i => i.isHorizontal);
            dom.selectAllHorizontal.checked = allChecked;
        }
    });

    dom.itemsContainer.addEventListener('click', (e) => {
        const target = e.target;
        const itemCard = target.closest('.item-card');
        if (!itemCard) return;
        const index = parseInt(itemCard.dataset.index, 10);
        if (target.closest('.delete-btn')) {
            actions.handleDeleteClick(index);
        }
    });
}

function setupIPCListeners() {
    api.on('data-loaded', (data) => {
        if (!data) {
            state.appData = { activeProfileId: 'default-profile-fallback', profiles: [] };
        } else {
            state.appData = data;
        }
        
        if (!state.appData.profiles || state.appData.profiles.length === 0) {
            const newId = `profile-${Date.now()}`;
            state.appData.profiles = [{
                id: newId,
                name: "デフォルト設定",
                items: [{ "name": "新規項目", "weight": null, "isAuto": true, "isHorizontal": false }],
                settings: { theme: "arcade", fakeEnabled: false, spinMode: "suspense", bgmPath: "sounds/music.mp3" }
            }];
            state.appData.activeProfileId = newId;
        }

        state.currentProfileId = state.appData.activeProfileId;
        let currentProfile = state.currentProfile;
        if (!currentProfile) {
            state.currentProfileId = state.appData.profiles[0].id;
            state.appData.activeProfileId = state.appData.profiles[0].id;
            currentProfile = state.currentProfile;
        }
        
        // ▼▼▼ 互換性チェック: 未設定の値をデフォルトで埋める ▼▼▼
        if (!currentProfile.settings) currentProfile.settings = {};
        
        // モード未設定(古いデータ)ならサスペンスにする
        if (!currentProfile.settings.spinMode) currentProfile.settings.spinMode = 'suspense';
        
        // 無音未設定ならOFF
        if (currentProfile.settings.isMuted === undefined) currentProfile.settings.isMuted = false;

        // アイテム設定の互換性
        if (currentProfile.items) {
            currentProfile.items.forEach(item => {
                if (item.isAuto === undefined) {
                    item.isAuto = (item.weight === null || item.weight === 0 || item.weight === "");
                }
                if (item.isHorizontal === undefined) {
                    item.isHorizontal = false;
                }
            });
        }

        // ▼▼▼ 互換性チェック: BGM未設定ならデフォルトを入れる ▼▼▼
        if (!currentProfile.settings.bgmPath) {
            currentProfile.settings.bgmPath = "sounds/music.mp3";
        }
        // ▲▲▲ ▲▲▲

        render();
    });
    
    api.on('data-saved', (message) => showSaveStatus('✅ 保存しました!', '#2B6CB0', 3000));
    api.on('data-save-error', (message) => showSaveStatus(`🚨 エラー: ${message}`, '#C53030'));
}

const actions = {
    loadProfile(profileId) { state.currentProfileId = profileId; render(); },
    
    addItem() {
        const profile = state.currentProfile;
        if (!profile) return;
        profile.items.push({ name: "新規項目", weight: null, isAuto: true, isHorizontal: false });
    },

    // ▼▼▼ 追加：まとめて追加ロジック ▼▼▼
    addBulkItems(text) {
        if (!text) return;
        // 改行で分割し、空白行を除去
        const lines = text.split(/\r\n|\n|\r/).filter(line => line.trim() !== "");
        
        if (lines.length === 0) return;
        
        const profile = state.currentProfile;
        if (!profile) return;

        lines.forEach(line => {
            profile.items.push({ 
                name: line.trim(), 
                weight: null, 
                isAuto: true, 
                isHorizontal: false 
            });
        });
        render(); // 再描画
        showSaveStatus(`${lines.length}個の項目を追加しました（未保存）`, '#2B6CB0', 3000);
    },
    // ▲▲▲ 追加ここまで ▲▲▲
    
    updateItem(index, key, value) {
        const profile = state.currentProfile;
        if (!profile || !profile.items[index]) return;
        
        if (key === 'weight') {
            if (value === '' || value === null) {
                profile.items[index].isAuto = true;
                profile.items[index].weight = null;
            } else {
                profile.items[index].isAuto = false;
                profile.items[index].weight = parseFloat(value);
            }
        } else {
            profile.items[index][key] = value;
        }
        render(); 
    },
    
    updateSettings(key, value) {
        const profile = state.currentProfile;
        if (profile) {
            if (!profile.settings) profile.settings = {};
            profile.settings[key] = value;
        }
    },
    
    saveData(showStatus = true) {
        // BGMチェック
        if (!validateBgm()) {
            // エラー表示して中断するか、警告だけ出すか。ここでは警告のみで保存はさせる（次回設定するため）
            if(showStatus) showSaveStatus('⚠️ BGMが設定されていません', '#C05621');
        } else {
            if (showStatus) showSaveStatus('保存中...', '');
        }
        
        const { isValid } = calculateAndDistribute(state.currentProfile.items);
        
        if (isValid && validateProfile()) {
            state.appData.activeProfileId = state.currentProfileId;
            api.send('save-data', state.appData);
            return true;
        } else {
            return false;
        }
    },
    
    handleDeleteClick(index) {
        const profile = state.currentProfile;
        if (!profile || !profile.items[index]) return;
        
        Swal.fire({
            title: "削除", 
            text: `この項目を削除しますか？`,
            icon: "warning",
            showCancelButton: true, confirmButtonColor: "#C53030",
            confirmButtonText: "削除", cancelButtonText: "キャンセル",
            heightAuto: false
        }).then((result) => {
            if (result.isConfirmed) {
                if (profile.items.length <= 1) {
                    profile.items[index] = { name: "新規項目", weight: null, isAuto: true, isHorizontal: false };
                } else {
                    profile.items.splice(index, 1);
                }
                render();
            }
        });
    },

    async handleNewProfile() {
        const { value: newName } = await Swal.fire({
            title: "新規作成", input: "text", inputLabel: "保存設定の名前",
            inputValue: "新しい設定", showCancelButton: true, confirmButtonText: "作成",
            heightAuto: false
        });
        if (newName) {
            const newId = `profile-${Date.now()}`;
            state.appData.profiles.push({
                id: newId, name: newName, 
                items: [{ "name": "新規項目", "weight": null, "isAuto": true, isHorizontal: false }],
                settings: { theme: "arcade", fakeEnabled: false, spinMode: "suspense", bgmPath: "sounds/music.mp3" }
            });
            actions.loadProfile(newId);
        }
    },
    async handleRenameProfile() {
        const profile = state.currentProfile;
        if (!profile) return;
        const { value: newName } = await Swal.fire({
            title: "名前変更", input: "text", inputValue: profile.name, 
            showCancelButton: true, confirmButtonText: "変更",
            heightAuto: false
        });
        if (newName) {
            profile.name = newName;
            render();
        }
    },
    handleDeleteProfile() {
        if (state.appData.profiles.length <= 1) return;
        Swal.fire({
            title: "削除確認", text: "この保存設定を削除しますか？", icon: "warning",
            showCancelButton: true, confirmButtonColor: "#C53030", confirmButtonText: "削除",
            heightAuto: false
        }).then((result) => {
            if (result.isConfirmed) {
                state.appData.profiles = state.appData.profiles.filter(p => p.id !== state.currentProfileId);
                actions.loadProfile(state.appData.profiles[0].id);
            }
        });
    }
};

/* --- ロジック関数 --- */
function calculateAndDistribute(items = []) {
    let fixedTotal = 0;
    let autoItems = [];
    items.forEach(item => {
        if (!item.isAuto && item.weight !== null && !isNaN(item.weight)) {
            fixedTotal += parseFloat(item.weight);
        } else {
            item.isAuto = true; 
            autoItems.push(item);
        }
    });
    let remaining = 100 - fixedTotal;
    let isValid = true;
    let message = "";
    if (remaining < -0.01) {
        isValid = false; message = `合計100%超 (${fixedTotal.toFixed(1)}%)`;
    } else if (autoItems.length === 0 && Math.abs(remaining) > 0.01) {
        isValid = false; message = `合計不足 (${fixedTotal.toFixed(1)}%)`;
    }
    if (autoItems.length > 0) {
        const autoValue = Math.max(0, remaining / autoItems.length);
        autoItems.forEach(item => item.weight = parseFloat(autoValue.toFixed(2)));
    }
    return { fixedTotal, isValid, message };
}

function render() {
    const profile = state.currentProfile;
    if (!profile) return;
    
    // 計算と保存
    calculateAndDistribute(profile.items);
    
    // プロファイル選択プルダウン更新
    dom.profileSelect.innerHTML = '';
    state.appData.profiles.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = p.name;
        option.selected = p.id === state.currentProfileId;
        dom.profileSelect.appendChild(option);
    });

    // リスト描画
    renderItemsList(profile.items);
    
    // 設定反映
    if(!profile.settings) profile.settings = {};
    const s = profile.settings;

    dom.themeSelect.value = s.theme || 'arcade';
    dom.fakeEnabled.checked = !!s.fakeEnabled;
    dom.muteEnabled.checked = !!s.isMuted;
    
    const mode = s.spinMode || 'suspense'; // デフォルト: suspense
    dom.spinModeSelect.value = mode;
    toggleMusicSettings(mode);
    
    // BGM設定
    dom.bgmPathDisplay.value = s.bgmPath || "sounds/music.mp3";
    const dur = s.musicDuration || 8.0;
    dom.spinDurationSlider.value = dur;
    dom.durationText.textContent = dur.toFixed(1) + "秒";
    
    validateBgm();
}

function renderItemsList(items = []) {
    dom.itemsContainer.innerHTML = '';
    const allChecked = items.length > 0 && items.every(i => i.isHorizontal);
    if (dom.selectAllHorizontal) dom.selectAllHorizontal.checked = allChecked;

    items.forEach((item, index) => {
        const clone = dom.itemTemplate.content.cloneNode(true);
        const card = clone.querySelector('.item-card');
        card.dataset.index = index;
        
        clone.querySelector('.item-index').textContent = index + 1;

        // テキストエリア自動リサイズ
        const nameInput = clone.querySelector('.item-name-input');
        nameInput.value = item.name || "";
        const autoResize = (el) => {
            el.style.height = 'auto';
            el.style.height = el.scrollHeight + 'px';
        };
        nameInput.addEventListener('input', () => autoResize(nameInput));
        setTimeout(() => autoResize(nameInput), 0);

        const probInput = clone.querySelector('.prob-manual-input');
        if (item.isAuto) {
            probInput.value = "";
            probInput.placeholder = item.weight !== null ? `${item.weight}%` : "Auto";
            probInput.classList.add("is-auto");
        } else {
            probInput.value = item.weight;
            probInput.placeholder = "数値";
            probInput.classList.remove("is-auto");
        }
        
        clone.querySelector('.horizontal-input').checked = !!item.isHorizontal;
        dom.itemsContainer.appendChild(clone);
    });
}

function toggleMusicSettings(mode) {
    if (mode === 'music') {
        dom.musicSettingsArea.classList.add('visible');
    } else {
        dom.musicSettingsArea.classList.remove('visible');
    }
}

// BGMチェック
function validateBgm() {
    const p = state.currentProfile;
    if (!p || !p.settings) return true;
    
    // ミュージックモードかつBGMなしの場合
    if (p.settings.spinMode === 'music' && !p.settings.bgmPath) {
        dom.bgmWarning.style.display = 'block';
        dom.bgmPathDisplay.classList.add('error');
        return false;
    } else {
        dom.bgmWarning.style.display = 'none';
        dom.bgmPathDisplay.classList.remove('error');
        return true;
    }
}

function validateProfile() {
    const { isValid, message } = calculateAndDistribute(state.currentProfile.items);
    if (!isValid) { showSaveStatus(message, '#C53030'); return false; }
    
    const hasEmptyName = state.currentProfile.items.some(item => !item.name || item.name.trim() === "");
    if (hasEmptyName) { showSaveStatus('項目名が空のマスがあります', '#C53030'); return false; }
    
    return true;
}

function showSaveStatus(message, color, timeout = 0) {
    dom.saveStatus.textContent = message;
    dom.saveStatus.style.color = color || '#333';
    dom.saveStatus.style.display = 'block';
    if (timeout > 0) {
        setTimeout(() => {
            if (dom.saveStatus.textContent === message) dom.saveStatus.textContent = '';
        }, timeout);
    }
}