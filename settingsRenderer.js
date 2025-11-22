// settingsRenderer.js (v1.3.5 - 新設計思想対応)

/* === Electronとの通信 (preload.js経由) === */
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
window.onload = async () => { // async に変更
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
    
    // ▼▼▼ 追加 (v1.5.1) テーマ一覧を動的に読み込む ▼▼▼
    await loadThemeOptions();
    // ▲▲▲ 追加 ▲▲▲

    api.send('load-data');
};
async function loadThemeOptions() {
    try {
        const themes = await api.getThemeList();
        
        // 既存のオプションをクリア
        dom.themeSelect.innerHTML = '';
        
        if (themes.length === 0) {
            const option = document.createElement('option');
            option.text = "テーマが見つかりません";
            dom.themeSelect.add(option);
            return;
        }

        // リストに追加
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

/**
 * すべてのUIイベントリスナーをここで一元管理します。
 */
function setupEventListeners() {
    dom.profileSelect.addEventListener('change', (e) => {
        actions.loadProfile(e.target.value);
    });

    document.querySelector('.btn-new').addEventListener('click', actions.handleNewProfile);
    document.querySelector('.btn-rename').addEventListener('click', actions.handleRenameProfile);
    document.querySelector('.btn-delete').addEventListener('click', actions.handleDeleteProfile);

    document.getElementById('add-item-btn').addEventListener('click', () => {
        actions.addItem();
        render(); // (v1.3.5) リアルタイム保存を削除
    });

    dom.fakeEnabled.addEventListener('change', (e) => actions.updateSettings('fakeEnabled', e.target.checked));
    dom.themeSelect.addEventListener('change', (e) => actions.updateSettings('theme', e.target.value));

    // ▼▼▼ 修正 (v1.3.5) 「保存」と「実行/更新」の役割を分離 ▼▼▼
    dom.saveBtn.addEventListener('click', () => {
        actions.saveData(true); // true = "保存しました" 通知あり
    });
    
    document.getElementById('open-roulette-btn').addEventListener('click', () => {
        // 1. まず現在の設定を保存する (通知なし)
        const isSaveSuccess = actions.saveData(false);
        
        // 2. 保存が成功した場合のみ、実行/更新を通知
        if (isSaveSuccess) {
            api.send('run-or-update-roulette', state.currentProfile);
        }
    });
    // ▲▲▲ 修正 ▲▲▲

    dom.itemsContainer.addEventListener('change', (e) => {
        const target = e.target;
        const itemCard = target.closest('.item-card');
        if (!itemCard) return;
        const index = parseInt(itemCard.dataset.index, 10);
        if (target.classList.contains('item-name-input')) {
            actions.updateItem(index, 'name', target.value);
        } else if (target.classList.contains('prob-manual-input')) {
            // ▼▼▼ 修正 (v1.3.5) 'probability' -> 'weight' ▼▼▼
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

/**
 * メインプロセスとの非同期通信リスナー
 */
function setupIPCListeners() {
    api.on('data-loaded', (data) => {
        
        // ▼▼▼ 修正 (v1.4.1) ▼▼▼
        // 1. data (appData) 自体が null or undefined かチェック
        // (ファイル破損などで main.js が null を送ってきた場合)
        if (!data) {
            console.error("Failed to load appData (null). Resetting to default structure.");
            // デフォルト構造を state.appData に設定
            state.appData = {
                activeProfileId: 'default-profile-fallback',
                profiles: [] // この後、(2)のチェックで中身が作られる
            };
        } else {
            // data がある場合は、それをセット
            state.appData = data;
        }
        
        // 2. プロファイル配列自体が空の場合、デフォルトを作成
        if (!state.appData.profiles || state.appData.profiles.length === 0) {
            const newId = `profile-${Date.now()}`;
            state.appData.profiles = [{
                id: newId,
                name: "デフォルト",
                items: [{ "name": "新規項目", "weight": 10 }], //
                settings: { theme: "arcade", fakeEnabled: false, transparentBg: true } //
            }];
            state.appData.activeProfileId = newId;
        }

        // 3. activeProfileId が不正（削除されたプロファイルなど）だった場合の修復処理
        state.currentProfileId = state.appData.activeProfileId;
        let currentProfile = state.currentProfile; //
        if (!currentProfile) {
            console.warn("アクティブなプロファイルIDが無効です。リストの先頭のプロファイルにリセットします。");
            
            // リストの先頭のプロファイルを強制的にアクティブにする
            state.currentProfileId = state.appData.profiles[0].id;
            state.appData.activeProfileId = state.appData.profiles[0].id;
            
            // プロファイルを取り直す
            currentProfile = state.currentProfile; //
        }
        // ▲▲▲ 修正 ▲▲▲
        
        // 4. (v1.3.9 の修正) 項目が (items: []) ない場合の修復処理
        if (currentProfile && (!currentProfile.items || currentProfile.items.length === 0)) {
            console.warn("アクティブなプロファイルに項目がありません。デフォルト項目を1つ追加します。");
            currentProfile.items = [
                { "name": "新規項目", "weight": 10 } //
            ];
        }
        
        render(); //
    });
    
    api.on('data-saved', (message) => showSaveStatus('✅ 設定を保存しました!', 'success', 3000));
    api.on('data-save-error', (message) => showSaveStatus(`🚨 エラー: ${message}`, 'error'));
}

/* --- アクション (ユーザー操作によって呼び出される関数群) --- */
const actions = {
    loadProfile(profileId) { state.currentProfileId = profileId; render(); },
    
    addItem() {
        const profile = state.currentProfile;
        if (!profile) return;
        // ▼▼▼ 修正 (v1.3.5) 'probability' -> 'weight' ▼▼▼
        profile.items.push({ name: "新規項目", weight: 10 });
        // ▲▲▲ 修正 ▲▲▲
        
        // (v1.3.5) リアルタイム保存を削除
    },
    
    updateItem(index, key, value) {
        const profile = state.currentProfile;
        if (!profile || !profile.items[index]) return;
        
        // ▼▼▼ 修正 (v1.3.5) 'probability' -> 'weight' ▼▼▼
        if (key === 'weight') {
            profile.items[index].weight = (value === '' || value === null) ? null : parseFloat(value);
        } else {
        // ▲▲▲ 修正 ▲▲▲
            profile.items[index][key] = value;
        }
        render(); // 確率の再計算・表示のために render() が必要
    },
    
    updateSettings(key, value) {
        const profile = state.currentProfile;
        if (profile) {
            if (!profile.settings) {
                profile.settings = { theme: "arcade", fakeEnabled: false, transparentBg: true };
            }
            profile.settings[key] = value;
        }
        // (v1.3.5) リアルタイム保存を削除
    },
    
    // ▼▼▼ 修正 (v1.3.5) リアルタイム通知を削除、戻り値を追加 ▼▼▼
    saveData(showStatus = true) {
        if (showStatus) {
            showSaveStatus('保存中...', '');
        }
        
        // 確率計算を実行
        calculateProbabilities(state.currentProfile.items); 
        
        if (validateProfile()) {
            state.appData.activeProfileId = state.currentProfileId;
            api.send('save-data', state.appData);
            
            // (v1.3.5) リアルタイム通知 ('notify-roulette-update') を削除
            
            return true; // 保存成功
        } else {
            return false; // 保存失敗 (バリデーションエラー)
        }
    },
    // ▲▲▲ 修正 ▲▲▲

    
    handleDeleteClick(index) {
        const profile = state.currentProfile;
        if (!profile || !profile.items[index]) return;
        
        Swal.fire({
            title: "削除", 
            text: `「${profile.items[index].name || '新規項目'}」を削除しますか？`,
            icon: "warning",
            showCancelButton: true, 
            confirmButtonColor: "#d33",
            confirmButtonText: "削除", 
            cancelButtonText: "キャンセル"
        }).then((result) => {
            if (result.isConfirmed) {
                if (profile.items.length <= 1) {
                     // ▼▼▼ 修正 (v1.3.5) 'probability' -> 'weight' ▼▼▼
                    profile.items[index] = { name: "新規項目", weight: 10 };
                    // ▲▲▲ 修正 ▲▲▲
                } else {
                    profile.items.splice(index, 1);
                }
                render();
                // (v1.3.5) リアルタイム保存を削除
            }
        });
    },

    async handleNewProfile() {
        const { value: newName } = await Swal.fire({
            title: "新しいプロファイル", input: "text", inputLabel: "プロファイル名を入力してください",
            inputValue: "新規プロファイル", showCancelButton: true, cancelButtonText: "キャンセル",
            confirmButtonText: "作成", inputValidator: (value) => !value && "名前を入力してください"
        });
        if (newName) {
            const newId = `profile-${Date.now()}`;
            // ▼▼▼ 修正 (v1.3.5) 'probability' -> 'weight' ▼▼▼
            state.appData.profiles.push({
                id: newId, name: newName, 
                items: [
                    { "name": "新規項目", "weight": 10 }
                ],
                // ▲▲▲ 修正 ▲▲▲
                settings: { theme: "arcade", fakeEnabled: false, transparentBg: true }
            });
            actions.loadProfile(newId);
        }
    },

    async handleRenameProfile() {
        const profile = state.currentProfile;
        if (!profile) return;
        const { value: newName } = await Swal.fire({
            title: "プロファイル名の変更", input: "text", inputLabel: "新しい名前を入力してください",
            inputValue: profile.name, showCancelButton: true, cancelButtonText: "キャンセル",
            confirmButtonText: "変更", inputValidator: (value) => !value && "名前を入力してください"
        });
        if (newName) {
            profile.name = newName;
            render();
        }
    },

    handleDeleteProfile() {
        if (state.appData.profiles.length <= 1) {
            return Swal.fire("エラー", "最後のプロファイルは削除できません。", "error");
        }
        const profile = state.currentProfile;
        if (!profile) return;
        Swal.fire({
            title: `「${profile.name}」を削除しますか？`, text: "この操作は元に戻せません。", icon: "warning",
            showCancelButton: true, confirmButtonColor: "#d33", cancelButtonColor: "#3085d6",
            confirmButtonText: "はい、削除します", cancelButtonText: "キャンセル"
        }).then((result) => {
            if (result.isConfirmed) {
                state.appData.profiles = state.appData.profiles.filter(p => p.id !== profile.id);
                actions.loadProfile(state.appData.profiles[0].id);
                Swal.fire("削除しました", `「${profile.name}」を削除しました。`, "success", { timer: 1500 });
            }
        });
    }
};

/* --- データ処理 (v1.3.5) --- */
// (probability -> weight に変更)
function calculateProbabilities(items = []) {
    let fixedTotal = 0; // 手入力された「重み」の合計
    let autoCount = 0;  // 自動計算の項目数
    
    items.forEach(item => {
        // (v1.3.5) 'weight' を見る
        if (item.weight !== null && item.weight !== '' && item.weight !== undefined) {
            fixedTotal += parseFloat(item.weight);
        } else {
            autoCount++;
        }
    });

    // (v1.3.5) ロジックを「重み」ベースに変更
    // (重みベースの確率計算)
    const totalWeight = items.reduce((sum, item) => sum + (parseFloat(item.weight) || 0), 0);
    
    let totalProb = 0;
    
    if (totalWeight <= 0) {
        // もし全ての重みが 0 または未設定なら、均等割り
        const autoProb = (items.length > 0) ? (100 / items.length) : 0;
        items.forEach(item => {
            item.calculatedProb = autoProb;
        });
        totalProb = items.length > 0 ? 100 : 0;
    } else {
        // 重みに応じて計算
        items.forEach(item => {
            const weight = parseFloat(item.weight) || 0;
            item.calculatedProb = (weight / totalWeight) * 100;
            totalProb += item.calculatedProb;
        });
    }
    
    // (v1.3.5) 最後の項目で丸め誤差を調整
    if (items.length > 0 && Math.abs(totalProb - 100) > 0.0001) {
        const adjustment = 100 - totalProb;
        items[items.length - 1].calculatedProb += adjustment;
        totalProb = 100;
    }
    
    return { fixedTotal: totalWeight, totalProb };
}


/* --- UI描画 (DOM操作) --- */
function render() {
    const profile = state.currentProfile;
    if (!profile) return;
    if (!profile.settings) {
        profile.settings = { theme: "arcade", fakeEnabled: false, transparentBg: true };
    }
    
    const { fixedTotal, totalProb } = calculateProbabilities(profile.items);
    
    renderProfileSelector();
    renderItemsList(profile.items);
    renderTotalProb(totalProb, fixedTotal); // (v1.3.5) fixedTotal (合計重み) を渡す
    renderSettings(profile.settings); 
    validateProfile(profile.items, fixedTotal); // (v1.3.5) fixedTotal (合計重み) を渡す
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
        
        // (v1.3.5) probability -> weight に変更
        const probInput = itemRow.querySelector('.prob-manual-input');
        probInput.value = (item.weight === null || item.weight === '' || item.weight === undefined) ? '' : item.weight;
        // (v1.3.5) placeholder で計算後の確率(%)を表示する
        probInput.placeholder = `${item.calculatedProb.toFixed(2)}%`;
        
        itemRow.querySelector('.delete-btn-wrapper').style.display = 'flex';
        dom.itemsContainer.appendChild(itemRow);
    });
}

function renderTotalProb(totalProb, totalWeight) {
    // (v1.3.5) 表示を確率ベースに戻す
    const roundedTotal = Math.round(totalProb * 100) / 100;
    dom.totalProbDisplay.textContent = `合計確率: ${roundedTotal.toFixed(2)}%`;
}

function renderSettings(settings = {}) {
    dom.itemsHeader.textContent = `📝 項目の設定`;
    dom.fakeEnabled.checked = settings.fakeEnabled || false;
    dom.themeSelect.value = settings.theme || 'arcade'; 
    settings.transparentBg = true;
}

function validateProfile(items = [], totalWeight) {
    let isError = false;
    let errorMessages = [];
    
    // (v1.3.5) 確率100%超過チェック -> 重み 0 以下チェック に変更
    if (totalWeight <= 0 && items.length > 0) {
        // (重みが0でも均等割りされるので、エラーにはしない。代わりに警告を出す)
        showSaveStatus('合計重みが0です。均等確率で抽選されます。', 'warning');
    }

    const hasEmptyName = items.some(item => !item.name || item.name.trim() === "");
    if (hasEmptyName) {
        isError = true;
        errorMessages.push('項目名が空のマスがあります。');
    }
    
    document.querySelectorAll('.item-name-input').forEach(input => {
        const isInvalid = !input.value || input.value.trim() === "";
        input.style.borderColor = isInvalid ? '#ef4444' : '';
        input.style.boxShadow = isInvalid ? '0 0 0 3px rgba(239, 68, 68, 0.1)' : '';
    });

    if (isError) {
        showSaveStatus(errorMessages.join(' '), 'error');
        dom.saveBtn.disabled = true;
        return false;
    } else {
        // (v1.3.5) 警告(warning)でなければステータスを隠す
        if (dom.saveStatus.className !== 'warning') {
             hideSaveStatus();
        }
        dom.saveBtn.disabled = false;
        return true;
    }
}

/* --- ヘルパー関数 --- */
function showSaveStatus(message, type, timeout = 0) {
    dom.saveStatus.textContent = message;
    dom.saveStatus.className = type; // 'success', 'error', または 'warning'
    dom.saveStatus.style.display = 'block';
    if (timeout > 0) {
        setTimeout(() => {
            if (dom.saveStatus.className === type) hideSaveStatus();
        }, timeout);
    }
}

function hideSaveStatus() {
    // (v1.3.5) 警告(warning) はタイムアウトで消えないようにする
    if (dom.saveStatus.className !== 'warning') {
        dom.saveStatus.textContent = '';
        dom.saveStatus.className = '';
        dom.saveStatus.style.display = 'none';
    }
}