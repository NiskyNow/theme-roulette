// settingsRenderer.js

(async () => {
    // --- HTML要素の取得 ---
    const itemListContainer = document.getElementById('item-list-container');
    const addItemBtn = document.getElementById('add-item-btn');
    const fakeSpinCheck = document.getElementById('fake-spin-check');
    const saveBtn = document.getElementById('save-btn');
    const saveStatus = document.getElementById('save-status');

    let currentSettings;

    /**
     * 1. ストアから設定を読み込み、UIに反映する
     */
    async function loadSettings() {
        console.log('設定を読み込んでいます...');
        currentSettings = await window.electronAPI.getStoreValue('settings');
        
        // UIをクリア
        itemListContainer.innerHTML = '';

        // 項目リストを描画
        currentSettings.items.forEach((item, index) => {
            createItemRow(item.name, item.weight, index);
        });

        // フェイク動作チェック
        fakeSpinCheck.checked = currentSettings.fakeSpin;
    }

    /**
     * 2. UIに項目（行）を追加する
     */
    function createItemRow(name = '', weight = 10, index) {
        const row = document.createElement('div');
        row.className = 'item-row';
        row.innerHTML = `
            <input type="text" class="item-name" value="${escapeHTML(name)}" placeholder="項目名">
            <input type="number" class="item-weight" value="${weight}" min="1">
            <button class="remove-item-btn" data-index="${index}">削除</button>
        `;

        // 削除ボタンの処理
        row.querySelector('.remove-item-btn').addEventListener('click', () => {
            row.remove();
        });

        itemListContainer.appendChild(row);
    }

    // 「項目を追加」ボタンの処理
    addItemBtn.addEventListener('click', () => {
        createItemRow();
    });

    /**
     * 3. UIからデータを集めて保存する
     */
    saveBtn.addEventListener('click', () => {
        console.log('設定を保存します...');
        
        // 1. UIから項目リストを読み取る
        const newItemList = [];
        const itemRows = itemListContainer.querySelectorAll('.item-row');
        
        itemRows.forEach(row => {
            const name = row.querySelector('.item-name').value;
            const weight = parseInt(row.querySelector('.item-weight').value, 10);
            
            // 名前があり、重みが 1 以上なら保存
            if (name && weight >= 1) {
                newItemList.push({ name, weight });
            }
        });

        // 2. UIからフェイク動作設定を読み取る
        const newFakeSpin = fakeSpinCheck.checked;

        // 3. 新しい設定オブジェクトを作成
        const newSettings = {
            items: newItemList,
            fakeSpin: newFakeSpin
        };

        // 4. electron-store に保存 (preload.js経由)
        window.electronAPI.setStoreValue('settings', newSettings);
        
        // 5. メインのルーレットに「更新通知」を送る
        window.electronAPI.sendSettingsUpdated();

        // 6. 保存完了メッセージ
        saveStatus.textContent = '保存しました！';
        setTimeout(() => { saveStatus.textContent = ''; }, 2000);
    });

    // --- 初期化 ---
    await loadSettings();

    // (おまけ) HTMLインジェクション対策
    function escapeHTML(str) {
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