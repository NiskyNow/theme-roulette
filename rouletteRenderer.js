// rouletteRenderer.js (最終版)

// メイン処理を非同期関数で囲む
async function initializeApp() {

  // 1. preload.js との連携を確認
  if (!window.electronAPI) {
    console.error('❌ 失敗: preload.js との連携ができていません。');
    return;
  }
  console.log('✅ 成功: preload.js との連携に成功しました！');

  // --- グローバル変数とHTML要素の取得 ---
  let items = []; // 項目名
  let colors = []; // 最終的な色の配列
  let probabilities = []; // 重み
  let fakeSpin = false;
  
  let currentThemeProfile = {}; // 読み込んだJSONプロファイル
  let isSpinning = false;
  let currentRotation = 0;

  // --- 共通IDの要素を取得 ---
  const rouletteSVG = document.getElementById('roulette-svg-target'); 
  const spinBtn = document.getElementById('spinBtn');
  const resultDiv = document.getElementById('result');

  if (!rouletteSVG || !spinBtn || !resultDiv) {
      console.error('HTMLの共通ID (roulette-svg-target, spinBtn, result) が見つかりません。');
      return;
  }

  /**
   * (A) ストアから設定を読み込み、テーマプロファイルを読み込む
   */
  async function loadSettingsAndTheme() {
    console.log('preload.jsのAPI経由で設定を取得します...');
    
    // 1. electron-storeから設定を取得
    const settings = await window.electronAPI.getStoreValue('settings'); 
    const themeName = await window.electronAPI.getStoreValue('currentTheme'); // 'arcade' など

    if (!settings || !settings.items || !themeName) { 
      resultDiv.textContent = 'エラー: 設定が読み込めません';
      return false;
    }

    // 2. 項目と確率をセット
    items = settings.items.map(item => item.name);
    probabilities = settings.items.map(item => item.weight);
    fakeSpin = settings.fakeSpin;
    
    // 3. テーマのJSONプロファイルを読み込む (preload.js経由)
    console.log(`テーマ "${themeName}" のプロファイルを読み込みます...`);
    currentThemeProfile = await window.electronAPI.getThemeProfile(themeName);
    
    if (!currentThemeProfile) {
      resultDiv.textContent = `エラー: ${themeName}.json が読み込めません`;
      return false;
    }

    // 4. 色の配列を生成する
    colors = generateColors(items.length, currentThemeProfile.colorProfile);
    
    return true;
  }
  
  /**
   * (B) 色のプロファイルに基づいて色の配列を生成する
   */
  function generateColors(count, profile) {
    const generated = [];
    if (profile.type === 'fixed-list' || profile.type === 'alternating') {
      // 固定リスト、または交互のリスト
      for (let i = 0; i < count; i++) {
        generated.push(profile.colors[i % profile.colors.length]);
      }
    } else if (profile.type === 'gradient') {
      // (将来的には、ここでグラデーションの中間色を自動生成するロジックを実装)
      // (現在は固定リストと同じ動作)
      for (let i = 0; i < count; i++) {
        generated.push(profile.colors[i % profile.colors.length]);
      }
    }
    return generated;
  }


  /**
   * (C) ルーレットを描画する関数 (JSONプロファイルを使用)
   */
  function drawRoulette() {
      // 0. プロファイルからデザイン情報を取得
      const profile = currentThemeProfile;
      const segmentCss = profile.segmentCss;
      const textCss = segmentCss.text;
      
      // 1. SVG要素と設定
      rouletteSVG.innerHTML = ''; // 中身をクリア
      rouletteSVG.setAttribute('viewBox', profile.svgViewBox); // "0 0 580 580" など
      const [,, vbWidth, vbHeight] = profile.svgViewBox.split(' ').map(Number);
      const centerX = vbWidth / 2;
      const centerY = vbHeight / 2;
      const radius = Math.min(centerX, centerY) - 10; // (マージン 10px)

      if (items.length === 0) {
        rouletteSVG.innerHTML = `<text x="${centerX}" y="${centerY}" fill="${textCss.fill}" font-size="${textCss.font-size}" text-anchor="middle">項目がありません。設定してください。</text>`;
        return;
      }

      console.log('描画開始:', items, colors);

      const anglePerSegment = 360 / items.length;
      const svgNS = 'http://www.w3.org/2000/svg';

      function createSegmentPath(index) {
          const startRad = (anglePerSegment * index - 90) * Math.PI / 180;
          const endRad = (anglePerSegment * (index + 1) - 90) * Math.PI / 180;
          
          const x1 = centerX + radius * Math.cos(startRad);
          const y1 = centerY + radius * Math.sin(startRad);
          const x2 = centerX + radius * Math.cos(endRad);
          const y2 = centerY + radius * Math.sin(endRad);
          
          return `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`;
      }

      for (let i = 0; i < items.length; i++) {
          // --- 1. 扇形のパス ---
          const path = document.createElementNS(svgNS, 'path');
          path.setAttribute('d', createSegmentPath(i));
          path.setAttribute('fill', colors[i]);
          
          // JSONプロファイルからCSSを適用
          Object.keys(segmentCss.path).forEach(key => {
            path.style[key] = segmentCss.path[key];
          });
          
          rouletteSVG.appendChild(path);

          // --- 2. テキスト ---
          const textAngleRad = (anglePerSegment * i + anglePerSegment / 2 - 90) * Math.PI / 180;
          const textRadius = radius * 0.65;
          const textX = centerX + textRadius * Math.cos(textAngleRad);
          const textY = centerY + textRadius * Math.sin(textAngleRad);
          
          const text = document.createElementNS(svgNS, 'text');
          text.setAttribute('x', textX);
          text.setAttribute('y', textY);
          
          // JSONプロファイルからCSSを適用
          Object.keys(textCss).forEach(key => {
            text.style[key] = textCss[key];
          });

          // 複数行の処理 (JSONプロファイルからオフセットを読み込む)
          const lines = (items[i] || '').split('\n');
          const verticalOffset = profile.textVerticalOffset || -0.5;
          const lineHeight = profile.textLineHeight || 30;

          if (lines.length > 1) {
              lines.forEach((line, lineIndex) => {
                  const tspan = document.createElementNS(svgNS, 'tspan');
                  tspan.setAttribute('x', textX);
                  tspan.setAttribute('y', textY + (lineIndex + verticalOffset) * lineHeight);
                  tspan.textContent = line;
                  text.appendChild(tspan);
              });
          } else {
              text.textContent = items[i];
          }
          
          rouletteSVG.appendChild(text); 
      } 
  }

  /**
   * (D) 回転ロジック (変更なし)
   */
  function spin() {
      if (isSpinning) return;
      if (items.length === 0) {
        resultDiv.textContent = '項目がありません。設定してください。';
        return;
      }
      isSpinning = true;
      spinBtn.disabled = true;
      resultDiv.textContent = '...'; // 結果表示をシンプルに

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
          // (フェイクスピンのロジック ... 変更なし)
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
          resultDiv.textContent = winningItemName; // 結果表示をシンプルに
          isSpinning = false;
          spinBtn.disabled = false;
      }, 5500); 
  }

  /**
   * (E) ヘルパー関数: forceRotate (変更なし)
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
   * (F) ヘルパー関数: getWeightedRandomIndex (変更なし)
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
  spinBtn.addEventListener('click', spin);

  spinBtn.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    window.electronAPI.openSettings();
  });

  window.electronAPI.onSettingsUpdated(async () => {
    console.log('IPC通知 (on-settings-updated) を受信しました！');
    resultDiv.textContent = '...';
    
    await loadSettingsAndTheme(); // 設定とテーマを再読み込み
    drawRoulette(); // マスを再描画
    
    resultDiv.textContent = '...'; // (待機状態に戻す)
  });

  // --- 6. 初期化の実行 ---
  if (await loadSettingsAndTheme()) {
    drawRoulette();
  }
}
initializeApp();