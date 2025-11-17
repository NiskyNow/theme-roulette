// rouletteRenderer.js

// メイン処理を非同期関数で囲む
async function initializeApp() {

  // 1. preload.js との連携を確認
  if (!window.electronAPI) {
    console.error('❌ 失敗: preload.js との連携ができていません。');
    return;
  }
  console.log('✅ 成功: preload.js との連携に成功しました！');

  // --- グローバル変数とHTML要素の取得 ---
  let items = [];
  let colors = [];
  let probabilities = [];
  let fakeSpin = false;

  let isSpinning = false;
  let currentRotation = 0;

  const rouletteSVG = document.getElementById('roulette-svg-target'); 
  const spinBtn = document.getElementById('spinBtn');
  const resultDiv = document.getElementById('result');

  if (!rouletteSVG || !spinBtn || !resultDiv) {
      console.error('HTMLの共通ID (roulette-svg-target, spinBtn, result) が見つかりません。');
      return;
  }

  /**
   * 0. (仮) テーマの固定色を取得する関数
   */
  function getThemeColors(themeName) {
    // 今は 'cosmic' テーマの固定色を返す
    console.log("Applying 'cosmic' theme colors.");
    return ['#1e3a8a', '#831843', '#065f46', '#92400e', '#581c87'];
  }

  /**
   * (A) ストアから設定を読み込み、変数を更新する関数
   */
  async function loadSettings() {
    console.log('preload.jsのAPI経由で設定を取得します...');
    const settings = await window.electronAPI.getStoreValue('settings'); 
    
    if (!settings || !settings.items) { 
      resultDiv.textContent = 'エラー: 設定が読み込めません';
      return false;
    }

    items = settings.items.map(item => item.name);
    probabilities = settings.items.map(item => item.weight);
    fakeSpin = settings.fakeSpin;
    colors = getThemeColors('cosmic'); // ◀◀◀ テーマ色をセット
    
    return true;
  }


  /**
   * 3. ルーレットを描画する関数
   */
  function drawRoulette() {
      // <svg> タグの中身を空にする
      rouletteSVG.innerHTML = ''; 

      if (items.length === 0) {
        rouletteSVG.innerHTML = '<text x="300" y="300" fill="white" font-size="24" text-anchor="middle">項目がありません。設定してください。</text>';
        return;
      }

      console.log('描画開始:', items, colors);

      const centerX = 300;
      const centerY = 300;
      const radius = 290;
      const anglePerSegment = 360 / items.length;
      const svgNS = 'http://www.w3.org/2000/svg';

      function createSegmentPath(index) {
          const startAngle = (index * anglePerSegment - 90) * Math.PI / 180;
          const endAngle = ((index + 1) * anglePerSegment - 90) * Math.PI / 180;
          const x1 = centerX + radius * Math.cos(startAngle);
          const y1 = centerY + radius * Math.sin(startAngle);
          const x2 = centerX + radius * Math.cos(endAngle);
          const y2 = centerY + radius * Math.sin(endAngle);
          const largeArc = anglePerSegment > 180 ? 1 : 0;
          return `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
      }

      for (let i = 0; i < items.length; i++) {
          // 扇形のパス
          const path = document.createElementNS(svgNS, 'path');
          path.setAttribute('d', createSegmentPath(i));
          path.setAttribute('fill', colors[i % colors.length]); 
          path.setAttribute('class', 'segment-path');
          rouletteSVG.appendChild(path);

          // ▼▼▼ テキスト描画 (復活) ▼▼▼
          const angle = (i * anglePerSegment + anglePerSegment / 2 - 90) * Math.PI / 180;
          const textRadius = radius * 0.65;
          const textX = centerX + textRadius * Math.cos(angle);
          const textY = centerY + textRadius * Math.sin(angle);
          
          const text = document.createElementNS(svgNS, 'text');
          text.setAttribute('x', textX);
          text.setAttribute('y', textY);
          text.setAttribute('class', 'segment-text'); // CSSクラスを適用
          
          const lines = (items[i] || '').split('\n');
          if (lines.length > 1) {
              lines.forEach((line, lineIndex) => {
                  const tspan = document.createElementNS(svgNS, 'tspan');
                  tspan.setAttribute('x', textX);
                  tspan.setAttribute('dy', lineIndex === 0 ? `-${(lines.length-1)*0.5}em` : '1.2em');
                  tspan.textContent = line;
                  text.appendChild(tspan);
              });
          } else {
              text.textContent = items[i];
          }
          
          rouletteSVG.appendChild(text); 
          // ▲▲▲ テキスト描画ここまで ▲▲▲
      } 

      console.log('✅ 描画完了: SVG要素に中身を挿入しました。');
  }

  /**
   * 4. 回転ロジック (変更なし)
   */
  function spin() {
      if (isSpinning) return;
      if (items.length === 0) {
        resultDiv.textContent = '項目がありません。設定してください。';
        return;
      }
      isSpinning = true;
      spinBtn.disabled = true;
      resultDiv.textContent = '回転中...';

      const winningIndex = getWeightedRandomIndex();
      if (winningIndex === -1) {
          isSpinning = false;
          spinBtn.disabled = false;
          return;
      }
      const winningItemName = items[winningIndex].replace('\n', ' ');

      const segmentAngle = 360 / items.length;
      const targetAngle = (segmentAngle * winningIndex) + (segmentAngle / 2);
      const normalizedTargetAngle = 360 - targetAngle;
      const spins = 5 + Math.random() * 3;
      const finalRotation = (spins * 360) + normalizedTargetAngle + currentRotation;

      if (fakeSpin) {
          const fakeIndexOffset = Math.random() < 0.5 ? 1 : -1;
          const fakeIndex = (winningIndex + fakeIndexOffset + items.length) % items.length;
          const fakeTargetAngle = (segmentAngle * fakeIndex) + (segmentAngle / 2);
          const normalizedFakeAngle = 360 - fakeTargetAngle;
          const fakeRotation = ((spins - 1) * 360) + normalizedFakeAngle + currentRotation;
          forceRotate(fakeRotation, 4, 'cubic-bezier(0.25, 1, 0.5, 1)');
          setTimeout(() => {
              forceRotate(finalRotation, 1, 'ease-out');
          }, 4000);
      } else {
          forceRotate(finalRotation, 5, 'cubic-bezier(0.17, 0.67, 0.12, 0.99)');
      }
      currentRotation = finalRotation;
      setTimeout(() => {
          resultDiv.textContent = `結果: ${winningItemName}`;
          isSpinning = false;
          spinBtn.disabled = false;
      }, 5500); 
  }

  /**
   * ヘルパー関数: forceRotate (変更なし)
   */
  function forceRotate(rotationDegrees, durationSeconds, easing) {
      if (!rouletteSVG) return;
      rouletteSVG.style.transition = 'none';
      rouletteSVG.style.transform = `rotate(${currentRotation}deg)`;
      rouletteSVG.offsetWidth; 
      rouletteSVG.style.transition = `transform ${durationSeconds}s ${easing}`;
      rouletteSVG.style.transform = `rotate(${rotationDegrees}deg)`;
  }

  /**
   * ヘルパー関数: getWeightedRandomIndex (変更なし)
   */
  function getWeightedRandomIndex() {
      const totalWeight = probabilities.reduce((sum, weight) => sum + weight, 0);
      if (totalWeight <= 0) return -1; 
      let randomValue = Math.random() * totalWeight;
      for (let i = 0; i < probabilities.length; i++) {
          randomValue -= probabilities[i];
          if (randomValue <= 0) {
              return i;
          }
      }
      return -1;
  }

  // --- 5. イベントリスナーの設定 ---
  // (左クリック)
  spinBtn.addEventListener('click', spin);

  // (SPINボタン右クリックで設定を開く)
  spinBtn.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    console.log('SPINボタンが右クリックされました。設定を開きます。');
    window.electronAPI.openSettings();
  });

  // (更新通知)
  window.electronAPI.onSettingsUpdated(async () => {
    console.log('IPC通知 (on-settings-updated) を受信しました！');
    resultDiv.textContent = '設定を再読み込みしています...';
    await loadSettings();
    drawRoulette();
    resultDiv.textContent = '設定が更新されました！';
  });

  // --- 6. 初期化の実行 ---
  if (await loadSettings()) {
    drawRoulette();
  }
}
initializeApp();