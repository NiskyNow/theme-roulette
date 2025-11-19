// settingsRenderer.js (全文)

(async () => {
    // --- HTML要素の取得 ---
    const itemListContainer = document.getElementById('item-list-container');
    const addItemBtn = document.getElementById('add-item-btn');
    const fakeSpinCheck = document.getElementById('fake-spin-check');
    const saveBtn = document.getElementById('save-btn');
    const saveStatus = document.getElementById('save-status');
    const themeSelect = document.getElementById('theme-select'); // ▼▼▼ 追加 ▼▼▼

    let currentSettings;
    let currentTheme; // ▼▼▼ 追加 ▼▼▼

    /**
     * 1. ストアから設定を読み込み、UIに反映する
     */
    async function loadSettings() {
        console.log('設定を読み込んでいます...');
        if (!window.electronAPI) {
            console.error('preload.js (electronAPI) が見つかりません。');
            return;
        }
        
        // 項目設定を読み込む
        currentSettings = await window.electronAPI.getStoreValue('settings');
        // ▼▼▼ テーマ設定を読み込む ▼▼▼
        currentTheme = await window.electronAPI.getStoreValue('currentTheme'); 

        // UIをクリア
        itemListContainer.innerHTML = '';

        // 項目リストを描画
        if (currentSettings && currentSettings.items) {
            currentSettings.items.forEach((item, index) => {
                createItemRow(item.name, item.weight, index);
            });
        }

        // フェイク動作チェック
        if (currentSettings) {
            fakeSpinCheck.checked = currentSettings.fakeSpin;
        }
        
        // ▼▼▼ テーマ選択ドロップダウンに反映 ▼▼▼
        if (currentTheme) {
            themeSelect.value = currentTheme;
        }
    }

    /**
     * 2. UIに項目（行）を追加する (変更なし)
     */
    function createItemRow(name = '', weight = 10, index) {
        // ( ... 変更なし ... )
        const row = document.createElement('div');
        row.className = 'item-row';
        const safeName = escapeHTML(name);
        row.innerHTML = `
            <input type="text" class="item-name" value="${safeName}" placeholder="項目名">
            <input type="number" class="item-weight" value="${weight}" min="1">
            <button class="remove-item-btn">削除</button>
        `;
        row.querySelector('.remove-item-btn').addEventListener('click', () => {
            row.remove();
        });
        itemListContainer.appendChild(row);
    }

    // 「項目を追加」ボタンの処理 (変更なし)
    addItemBtn.addEventListener('click', () => {
        createItemRow();
    });

    /**
     * 3. UIからデータを集めて保存する
     */
    saveBtn.addEventListener('click', () => {
        console.log('設定を保存します...');
        
        // 1. 項目リストを保存 (変更なし)
        const newItemList = [];
        const itemRows = itemListContainer.querySelectorAll('.item-row');
        itemRows.forEach(row => {
            const name = row.querySelector('.item-name').value;
            const weight = parseInt(row.querySelector('.item-weight').value, 10);
            if (name && weight >= 1) {
                newItemList.push({ name, weight });
            }
        });
        const newFakeSpin = fakeSpinCheck.checked;
        const newSettings = {
            items: newItemList,
            fakeSpin: newFakeSpin
        };
        window.electronAPI.setStoreValue('settings', newSettings);
        
        // ▼▼▼ 選択されたテーマを保存 ▼▼▼
        const newTheme = themeSelect.value;
        window.electronAPI.setStoreValue('currentTheme', newTheme);
        // ▲▲▲ 追加 ▲▲▲
        
        // 5. メインのルーレットに「更新通知」を送る
        // (注: テーマ変更は main.js が検知してリロードするので、
        //  この通知は主に「項目変更」を反映させるため)
        window.electronAPI.sendSettingsUpdated();

        // 6. 保存完了メッセージ
        saveStatus.textContent = '保存しました！(アプリがリロードされます)';
        
        // ウィンドウを閉じる (リロードされるので)
        setTimeout(() => {
            window.close();
        }, 1000);
    });

    // --- 初期化 ---
    await loadSettings();

    // (おまけ) HTMLインジェクション対策 (変更なし)
    function escapeHTML(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/[<>&"']/g, (match) => {
            return {
                '<': '&lt;',
                '>': '&gt;',
                '&': '&amp;',
                '"': '&quot;',
                "'": '&#39;'
            }[match];
        });
    }

})();