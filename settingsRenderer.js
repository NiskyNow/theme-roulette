// settingsRenderer.js (v2.0 - 確率・自動計算対応版)

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
    dom.itemsHeader = document.getElementById('items-header');
    dom.saveBtn = document.getElementById('save-btn');
    dom.saveStatus = document.getElementById('save-status');
    dom.fakeEnabled = document.getElementById('fake-enabled');
    dom.themeSelect = document.getElementById('theme-select'); 

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

    dom.fakeEnabled.addEventListener('change', (e) => actions.updateSettings('fakeEnabled', e.target.checked));
    dom.themeSelect.addEventListener('change', (e) => actions.updateSettings('theme', e.target.value));

    dom.saveBtn.addEventListener('click', () => {
        actions.saveData(true);
    });
    
    document.getElementById('open-roulette-btn').addEventListener('click', () => {
        if (actions.saveData(false)) {
            api.send('run-or-update-roulette', state.currentProfile);
        }
    });

    dom.itemsContainer.addEventListener('change', (e) => {
        const target = e.target;
        const itemCard = target.closest('.item-card');
        if (!itemCard) return;
        const index = parseInt(itemCard.dataset.index, 10);
        
        if (target.classList.contains('item-name-input')) {
            actions.updateItem(index, 'name', target.value);
        } else if (target.classList.contains('prob-manual-input')) {
            // ▼▼▼ 修正: 空欄ならAuto、数値ならFixedとして処理 ▼▼▼
            actions.updateItem(index, 'weight', target.value);
            // ▲▲▲ 修正 ▲▲▲
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
                name: "デフォルト",
                items: [{ "name": "新規項目", "weight": null, "isAuto": true }], // 初期項目はAuto
                settings: { theme: "arcade", fakeEnabled: false, transparentBg: true }
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
        
        // ▼▼▼ 既存データのマイグレーション（isAutoフラグがない場合） ▼▼▼
        if (currentProfile.items) {
            currentProfile.items.forEach(item => {
                if (item.isAuto === undefined) {
                    // weightがnull/0/空文字ならAutoとみなす、それ以外はFixed
                    item.isAuto = (item.weight === null || item.weight === 0 || item.weight === "");
                }
            });
        }
        // ▲▲▲ 修正 ▲▲▲

        render();
    });
    
    api.on('data-saved', (message) => showSaveStatus('✅ 設定を保存しました!', 'success', 3000));
    api.on('data-save-error', (message) => showSaveStatus(`🚨 エラー: ${message}`, 'error'));
}

const actions = {
    loadProfile(profileId) { state.currentProfileId = profileId; render(); },
    
    addItem() {
        const profile = state.currentProfile;
        if (!profile) return;
        // ▼▼▼ 修正: 新規項目は「Auto (空欄)」で追加 ▼▼▼
        profile.items.push({ name: "新規項目", weight: null, isAuto: true });
        // ▲▲▲ 修正 ▲▲▲
    },
    
    updateItem(index, key, value) {
        const profile = state.currentProfile;
        if (!profile || !profile.items[index]) return;
        
        if (key === 'weight') {
            // ▼▼▼ 修正: 空欄か数値かでフラグを切り替え ▼▼▼
            if (value === '' || value === null) {
                profile.items[index].isAuto = true;
                profile.items[index].weight = null; // 内部的にはnullにしておく
            } else {
                profile.items[index].isAuto = false;
                profile.items[index].weight = parseFloat(value);
            }
            // ▲▲▲ 修正 ▲▲▲
        } else {
            profile.items[index][key] = value;
        }
        render(); // 再計算して表示更新
    },
    
    updateSettings(key, value) {
        const profile = state.currentProfile;
        if (profile) {
            if (!profile.settings) profile.settings = { theme: "arcade", fakeEnabled: false };
            profile.settings[key] = value;
        }
    },
    
    saveData(showStatus = true) {
        if (showStatus) showSaveStatus('保存中...', '');
        
        // 保存前に計算を実行し、Auto項目のweightに実際の値をセットする
        // これにより、ルーレット側は計算済みの数値を受け取れる
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
            text: `「${profile.items[index].name || '新規項目'}」を削除しますか？`,
            icon: "warning",
            showCancelButton: true, 
            confirmButtonColor: "#d33",
            confirmButtonText: "削除", cancelButtonText: "キャンセル",
            heightAuto: false,
            scrollbarPadding: false
        }).then((result) => {
            if (result.isConfirmed) {
                if (profile.items.length <= 1) {
                    profile.items[index] = { name: "新規項目", weight: null, isAuto: true };
                } else {
                    profile.items.splice(index, 1);
                }
                render();
            }
        });
    },

    // (以下、プロファイル作成・削除系は変更なし)
    async handleNewProfile() {
        const { value: newName } = await Swal.fire({
            title: "新しいプロファイル", input: "text", inputLabel: "プロファイル名",
            inputValue: "新規プロファイル", showCancelButton: true, confirmButtonText: "作成", cancelButtonText: "キャンセル",
            inputValidator: (value) => !value && "名前を入力してください",
            heightAuto: false,
            scrollbarPadding: false
        });
        if (newName) {
            const newId = `profile-${Date.now()}`;
            state.appData.profiles.push({
                id: newId, name: newName, 
                items: [{ "name": "新規項目", "weight": null, "isAuto": true }],
                settings: { theme: "arcade", fakeEnabled: false, transparentBg: true }
            });
            actions.loadProfile(newId);
        }
    },
    async handleRenameProfile() {
        const profile = state.currentProfile;
        if (!profile) return;
        const { value: newName } = await Swal.fire({
            title: "プロファイル名の変更", input: "text", inputLabel: "新しい名前",
            inputValue: profile.name, showCancelButton: true, confirmButtonText: "変更", cancelButtonText: "キャンセル",
            inputValidator: (value) => !value && "名前を入力してください",
            heightAuto: false,
            scrollbarPadding: false
        });
        if (newName) {
            profile.name = newName;
            render();
        }
    },
    handleDeleteProfile() {
        if (state.appData.profiles.length <= 1) return Swal.fire({
            title: "エラー", text: "最後のプロファイルは削除できません。", icon: "error",
            heightAuto: false, scrollbarPadding: false
        });
        const profile = state.currentProfile;
        Swal.fire({
            title: `「${profile.name}」を削除しますか？`, text: "この操作は元に戻せません。", icon: "warning",
            showCancelButton: true, confirmButtonColor: "#d33", confirmButtonText: "はい、削除します", cancelButtonText: "キャンセル",
            heightAuto: false,
            scrollbarPadding: false
        }).then((result) => {
            if (result.isConfirmed) {
                state.appData.profiles = state.appData.profiles.filter(p => p.id !== profile.id);
                actions.loadProfile(state.appData.profiles[0].id);
                Swal.fire({
                    title: "削除しました", icon: "success", timer: 1500, showConfirmButton: false,
                    heightAuto: false, scrollbarPadding: false
                });
            }
        });
    }
};

/* --- ▼▼▼ ロジック修正: 確率の自動計算と分配 ▼▼▼ --- */
function calculateAndDistribute(items = []) {
    let fixedTotal = 0;
    let autoItems = [];

    // 1. 手入力(Fixed)の合計を計算
    items.forEach(item => {
        if (!item.isAuto && item.weight !== null && !isNaN(item.weight)) {
            fixedTotal += parseFloat(item.weight);
        } else {
            // Auto扱いの項目をリストアップ
            // (念のためフラグがずれていても、weightが無効ならAutoとみなす)
            item.isAuto = true; 
            autoItems.push(item);
        }
    });

    let remaining = 100 - fixedTotal;
    let isValid = true;
    let message = "";

    // 2. エラーチェック
    // 誤差許容範囲を少し持たせる(0.01)
    if (remaining < -0.01) {
        isValid = false;
        message = `合計が100%を超えています (現在 ${fixedTotal.toFixed(1)}%)`;
    } else if (autoItems.length === 0 && Math.abs(remaining) > 0.01) {
        isValid = false;
        message = `自動項目がなく、合計が100%になりません (現在 ${fixedTotal.toFixed(1)}%)`;
    }

    // 3. 残りをAuto項目に分配
    if (autoItems.length > 0) {
        // 負の残り(100%オーバー)でも、計算上は分配してマイナスを表示させる(エラー視認用)
        // ただしUIでは0以下にしない等の制御も可
        const autoValue = Math.max(0, remaining / autoItems.length);
        
        autoItems.forEach(item => {
            // UI表示と保存のために weight に値をセットする
            // ただし isAuto フラグは true のまま維持
            item.weight = parseFloat(autoValue.toFixed(2)); // 小数点2桁で丸める
        });
    }

    return { fixedTotal, isValid, message };
}
/* --- ▲▲▲ 修正完了 ▲▲▲ --- */


function render() {
    const profile = state.currentProfile;
    if (!profile) return;
    if (!profile.settings) profile.settings = { theme: "arcade", fakeEnabled: false };
    
    // 計算実行
    const { fixedTotal, isValid, message } = calculateAndDistribute(profile.items);
    
    renderProfileSelector();
    renderItemsList(profile.items);
    renderTotalProb(fixedTotal, isValid, message);
    renderSettings(profile.settings); 
    validateProfileForRender(isValid, message);
}

function renderProfileSelector() {
    dom.profileSelect.innerHTML = '';
    state.appData.profiles.forEach(profile => {
        const option = document.createElement('option');
        option.value = profile.id;
        option.textContent = profile.name;
        option.selected = profile.id === state.currentProfileId;
        dom.profileSelect.appendChild(option);
    });
}

function renderItemsList(items = []) {
    dom.itemsContainer.innerHTML = '';
    items.forEach((item, index) => {
        const itemRow = dom.itemTemplate.content.cloneNode(true);
        const itemCard = itemRow.querySelector('.item-card');
        itemCard.dataset.index = index;
        
        itemRow.querySelector('.item-index').textContent = index + 1;
        itemRow.querySelector('.item-name-input').value = item.name || "";
        
        const probInput = itemRow.querySelector('.prob-manual-input');
        
        // ▼▼▼ 修正: Autoなら値を空にしてプレースホルダーに計算値を表示 ▼▼▼
        if (item.isAuto) {
            probInput.value = ""; // 空にする
            probInput.placeholder = item.weight !== null ? `${item.weight}%` : "Auto";
            probInput.classList.add("is-auto"); // スタイル用クラス（必要なら）
        } else {
            probInput.value = item.weight;
            probInput.placeholder = "数値";
            probInput.classList.remove("is-auto");
        }
        // ▲▲▲ 修正 ▲▲▲
        
        itemRow.querySelector('.delete-btn-wrapper').style.display = 'flex';
        dom.itemsContainer.appendChild(itemRow);
    });
}

function renderTotalProb(fixedTotal, isValid, message) {
    if (!isValid) {
        dom.totalProbDisplay.textContent = "エラー";
        dom.totalProbDisplay.style.background = "#F4A98B"; // エラー色
    } else {
        dom.totalProbDisplay.textContent = "合計: 100%";
        dom.totalProbDisplay.style.background = "#A1D8D4"; // 正常色
    }
}

function renderSettings(settings = {}) {
    dom.itemsHeader.textContent = `📝 項目の設定`;
    dom.fakeEnabled.checked = settings.fakeEnabled || false;
    dom.themeSelect.value = settings.theme || 'arcade'; 
}

// 描画時の簡易バリデーション表示
function validateProfileForRender(isValid, message) {
    if (!isValid) {
        showSaveStatus(message, 'error');
        dom.saveBtn.disabled = true;
    } else {
        const hasEmptyName = state.currentProfile.items.some(item => !item.name || item.name.trim() === "");
        if (hasEmptyName) {
            showSaveStatus('項目名が空のマスがあります。', 'error');
            dom.saveBtn.disabled = true;
        } else {
            hideSaveStatus();
            dom.saveBtn.disabled = false;
        }
    }
}

// 保存時の最終チェック
function validateProfile() {
    const { isValid, message } = calculateAndDistribute(state.currentProfile.items);
    if (!isValid) {
        showSaveStatus(message, 'error');
        return false;
    }
    const hasEmptyName = state.currentProfile.items.some(item => !item.name || item.name.trim() === "");
    if (hasEmptyName) {
        showSaveStatus('項目名が空のマスがあります。', 'error');
        return false;
    }
    return true;
}

function showSaveStatus(message, type, timeout = 0) {
    dom.saveStatus.textContent = message;
    dom.saveStatus.className = type; 
    dom.saveStatus.style.display = 'block';
    if (timeout > 0) {
        setTimeout(() => {
            if (dom.saveStatus.className === type) hideSaveStatus();
        }, timeout);
    }
}

function hideSaveStatus() {
    dom.saveStatus.textContent = '';
    dom.saveStatus.className = '';
    dom.saveStatus.style.display = 'none';
}