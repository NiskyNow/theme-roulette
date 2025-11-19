// rouletteRenderer.js (v1.4.4 - 右クリックメニュー対応)

// 1. preload.js との連携を確認
if (!window.electronAPI) {
  console.error('❌ 失敗: preload.js との連携ができていません。');
  // (ここで処理を停止)
} else {
  console.log('✅ 成功: preload.js との連携に成功しました！');
  initializeApp();
}

/**
 * アプリケーションを初期化する
 */
function initializeApp() {

  // --- グローバル変数とHTML要素の取得 ---
  let items = []; // 項目名
  let colors = []; // 最終的な色の配列
  let probabilities = []; // 重み (weight)
  let fakeSpin = false;
  
  let currentThemeProfile = {}; // 読み込んだJSONプロファイル
  let isSpinning = false;
  let currentRotation = 0;

  // --- 共通IDの要素を取得 ---
  const rouletteSVG = document.getElementById('roulette-svg-target'); 
  const spinBtn = document.getElementById('spinBtn');
  const resultDiv = document.getElementById('result');
  
  // テーマHTML (arcade.htmlなど) に存在する可能性のある中央ボタン
  const centerButton = document.querySelector('.center-button');

  if (!rouletteSVG || !spinBtn || !resultDiv) {
      console.error('HTMLの共通ID (roulette-svg-target, spinBtn, result) が見つかりません。');
      return;
  }

  // --- (A) main.jsからのデータ受信リスナー (変更なし) ---
  
  // (v1.3.5) 関数名を preload.js と一致させる
  // main.jsから 'update-roulette-data' が送られてくるのを待機する
  window.electronAPI.onSettingsUpdated(async (data) => {
    console.log('IPC通知 (onSettingsUpdated) を受信しました！', data);

    if (!data || !data.items || !data.settings) {
      resultDiv.textContent = 'エラー: 設定データが不正です';
      return;
    }

    // 1. 設定をグローバル変数に反映
    // (v1.3.5) main.js は 'weight' が入った items を送る
    items = data.items.map(item => item.name);
    probabilities = data.items.map(item => item.weight); // 重み(weight)を確率計算に使う
    
    fakeSpin = data.settings.fakeEnabled;

    // 2. テーマのJSONプロファイルを読み込む
    const themeName = data.settings.theme;
    console.log(`テーマ "${themeName}" のプロファイルを読み込みます...`);
    currentThemeProfile = await window.electronAPI.getThemeProfile(themeName); //

    if (!currentThemeProfile) {
      resultDiv.textContent = `エラー: ${themeName}.json が読み込めません`;
      return;
    }

    // 3. 色の配列を生成する (v1.3.1 の色被り防止ロジック)
    colors = generateColors(items.length, currentThemeProfile.colorProfile);

    // 4. ルーレットを描画する
    drawRoulette();

    // 5. 状態をリセット
    resultDiv.textContent = '...'; // (待機状態に戻す)
    isSpinning = false;
    spinBtn.disabled = false;
  });

  
  /**
   * (B) 色のプロファイルに基づいて色の配列を生成する
   * (v1.3.1) 最後のセグメントが最初のセグメントと色が被らないように修正
   */
  function generateColors(count, profile) {
    const generated = [];
    if (!profile || !profile.colors || profile.colors.length === 0) {
        // 色が定義されていないか空の場合、デフォルトのグレーを返す
        console.warn("テーマプロファイルに色定義がないか空です。");
        for (let i = 0; i < count; i++) generated.push("#888888");
        return generated;
    }

    const colorList = profile.colors;
    const colorCount = colorList.length;

    // 色が1色しかない場合は、どうしようもないので全てその色を返す
    if (colorCount === 1) {
        for (let i = 0; i < count; i++) generated.push(colorList[0]);
        return generated;
    }
    
    // 色が2色以上ある場合
    if (profile.type === 'fixed-list' || profile.type === 'alternating' || profile.type === 'gradient' || profile.type === 'gradient-list') {
      for (let i = 0; i < count; i++) {
        
        let colorIndex = i % colorCount;

        // ▼▼▼ 追加ロジック (v1.3.1) ▼▼▼
        // もし「最後のセグメント(i === count - 1)」で、
        // かつ「割り当てられる色が最初のセグメントの色(colorIndex === 0)」だった場合
        if (i === count - 1 && colorIndex === 0) {
            
            // 2番目の色 (index 1) を割り当てる
            // (こうすることで、最後[1]と最初[0]が必ず異なる色になる)
            colorIndex = 1;
        }
        // ▲▲▲ 追加ロジック ▲▲▲

        generated.push(colorList[colorIndex]);
      }
    }
    return generated;
  }


  /**
   * (C) ルーレットを描画する関数 (JSONプロファイルを使用)
   * (v1.4.3) 'font' と 'font-size' の両方に対応
   */
  /**
   * (C) ルーレットを描画する関数 (JSONプロファイルを使用)
   * (v1.4.8) 短歌のような縦書き（外周→中心）に対応
   */
  function drawRoulette() {
      rouletteSVG.innerHTML = ''; 
      
      const profile = currentThemeProfile;
      if (!profile || !profile.segmentCss) {
        console.error("テーマプロファイルが不正です (segmentCss がありません)");
        return; 
      }
      
      const segmentCss = profile.segmentCss;
      const textCss = segmentCss.text;
      
      rouletteSVG.setAttribute('viewBox', profile.svgViewBox);
      const [,, vbWidth, vbHeight] = profile.svgViewBox.split(' ').map(Number);
      const centerX = vbWidth / 2;
      const centerY = vbHeight / 2;
      const radius = Math.min(centerX, centerY) - 10;

      if (items.length === 0) {
        const defaultFill = (textCss && textCss.fill) ? textCss.fill : '#FFF';
        const defaultFontSize = (textCss && (textCss['font-size'] || (textCss.font && textCss.font.includes('px')))) 
                                ? (textCss['font-size'] || '20px') 
                                : '20px';
        rouletteSVG.innerHTML = `<text x="${centerX}" y="${centerY}" fill="${defaultFill}" font-size="${defaultFontSize}" text-anchor="middle">項目がありません。設定してください。</text>`;
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
          
          if (items.length === 1) {
            return `M ${centerX} ${centerY} m -${radius}, 0 a ${radius},${radius} 0 1,0 ${radius * 2},0 a ${radius},${radius} 0 1,0 -${radius * 2},0`;
          }
          
          return `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${anglePerSegment > 180 ? 1 : 0} 1 ${x2} ${y2} Z`;
      }

      for (let i = 0; i < items.length; i++) {
          const path = document.createElementNS(svgNS, 'path');
          path.setAttribute('d', createSegmentPath(i));
          path.setAttribute('fill', colors[i]);
          
          if(segmentCss.path) {
            Object.keys(segmentCss.path).forEach(key => {
              path.style[key] = segmentCss.path[key];
            });
          }
          
          rouletteSVG.appendChild(path);

          const textAngleRad = (anglePerSegment * i + anglePerSegment / 2 - 90) * Math.PI / 180;
          
          // ▼▼▼ 修正 (v1.4.9) ▼▼▼
          // 半径の 0.65倍 だったのを 0.8倍 に変更し、より外側へ配置
          const textRadius = radius * 0.7; 
          // ▲▲▲ 修正 ▲▲▲
          
          const textX = centerX + textRadius * Math.cos(textAngleRad);
          const textY = centerY + textRadius * Math.sin(textAngleRad);
          
          const text = document.createElementNS(svgNS, 'text');
          text.setAttribute('x', textX);
          text.setAttribute('y', textY);
          
          // (v1.4.8) 縦書きスタイル
          text.style.writingMode = 'vertical-rl';
          text.style.textOrientation = 'upright';
          text.style.glyphOrientationVertical = '0';
          
          // ▼▼▼ 追加 (v1.4.9) ▼▼▼
          // 文字ブロックの中心を座標に合わせる
          text.setAttribute('dominant-baseline', 'central'); 
          text.setAttribute('text-anchor', 'middle'); 
          // ▲▲▲ 追加 ▲▲▲

          // 回転角度
          const degree = anglePerSegment * i + anglePerSegment / 2;
          const rotateAngle = degree;
          
          text.setAttribute('transform', `rotate(${rotateAngle}, ${textX}, ${textY})`);

          if (textCss) {
             if (textCss.font) {
                text.style.font = textCss.font;
                Object.keys(textCss).forEach(key => {
                    if (key !== 'font' && key !== 'font-size' && key !== 'font-weight' && key !== 'font-family') {
                        text.style[key] = textCss[key];
                    }
                });
                if (textCss.fill) {
                    text.style.fill = textCss.fill;
                }
             } else {
                Object.keys(textCss).forEach(key => {
                    text.style[key] = textCss[key];
                });
             }
          }

          const lines = (items[i] || '').split('\n');
          // 縦書きの場合の簡易的な改行処理（必要に応じて調整）
          if (lines.length > 1) {
              lines.forEach((line, lineIndex) => {
                  const tspan = document.createElementNS(svgNS, 'tspan');
                  // 縦書きの複数行は x 方向にずらす必要があるが、ここでは簡易的に配置
                  // 本格的な縦書き複数行対応は複雑なため、一旦テキスト結合または単純配置とする
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
      if (centerButton) centerButton.style.pointerEvents = 'none'; // 中央ボタンも無効化
      resultDiv.textContent = '...';

      const winningIndex = getWeightedRandomIndex(); // (v1.3.1) 重みベースの抽選
      if (winningIndex === -1) {
          resultDiv.textContent = 'エラー: 重みがありません';
          isSpinning = false;
          spinBtn.disabled = false;
          if (centerButton) centerButton.style.pointerEvents = 'auto';
          return;
      }
      const winningItemName = items[winningIndex].replace('\n', ' ');

      const segmentAngle = 360 / items.length;
      const targetAngle = (segmentAngle * winningIndex) + (segmentAngle / 2);
      const normalizedTargetAngle = 360 - targetAngle; 
      const spins = 5 + Math.random() * 3;
      const finalRotation = (spins * 360) + normalizedTargetAngle; 

      const rotationAmount = finalRotation - (currentRotation % 360);
      currentRotation += rotationAmount;

      if (fakeSpin && Math.random() < 0.33) { // 33%の確率でフェイクスピン
          const fakeIndexOffset = Math.random() < 0.5 ? 1 : -1;
          const fakeIndex = (winningIndex + fakeIndexOffset + items.length) % items.length;
          const fakeTargetAngle = (segmentAngle * fakeIndex) + (segmentAngle / 2);
          const normalizedFakeAngle = 360 - fakeTargetAngle;
          
          const fakeRotation = ((spins - 1) * 360) + normalizedFakeAngle;
          const fakeRotationAmount = fakeRotation - (currentRotation % 360);
          
          forceRotate(currentRotation + fakeRotationAmount, 4, 'cubic-bezier(0.25, 1, 0.5, 1)');
          
          setTimeout(() => {
              forceRotate(currentRotation, 1.5, 'ease-out');
          }, 4000);

      } else {
          forceRotate(currentRotation, 5, 'cubic-bezier(0.17, 0.67, 0.12, 0.99)');
      }
      
      setTimeout(() => {
          resultDiv.textContent = winningItemName;
          isSpinning = false;
          spinBtn.disabled = false;
          if (centerButton) centerButton.style.pointerEvents = 'auto';
          
          currentRotation = currentRotation % 360; 
      }, 5500); 
  }

  /**
   * (E) ヘルパー関数: forceRotate (変更なし)
   */
  function forceRotate(rotationDegrees, durationSeconds, easing) {
      if (!rouletteSVG) return;
      
      const startRotation = currentRotation % 360;
      rouletteSVG.style.transition = 'none';
      rouletteSVG.style.transform = `rotate(${startRotation}deg)`;
      
      rouletteSVG.offsetWidth; 
      
      rouletteSVG.style.transition = `transform ${durationSeconds}s ${easing}`;
      rouletteSVG.style.transform = `rotate(${rotationDegrees}deg)`;
      
      currentRotation = rotationDegrees;
  }

  /**
   * (F) ヘルパー関数: getWeightedRandomIndex (変更なし)
   */
  function getWeightedRandomIndex() {
      // (v1.3.5) 'probabilities' は 'weight' の配列
      const totalWeight = probabilities.reduce((sum, weight) => sum + (parseFloat(weight) || 0), 0);
      
      if (totalWeight <= 0) {
        // もし全ての重みが 0 または未設定なら、均等割り
        console.log("重みがないため、均等確率で抽選します。");
        if (items.length === 0) return -1; // 項目が0なら -1
        return Math.floor(Math.random() * items.length);
      }
      
      let randomValue = Math.random() * totalWeight;
      for (let i = 0; i < probabilities.length; i++) {
          randomValue -= (probabilities[i] || 0);
          if (randomValue <= 0) {
              return i;
          }
      }
      return items.length - 1; // フォールバック
  }


  // --- 6. イベントリスナーの設定 (メイン) ---
  spinBtn.addEventListener('click', spin);

  // ▼▼▼ 修正 (v1.4.4) 右クリックでメニューを要求 ▼▼▼
  spinBtn.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    window.electronAPI.showRouletteContextMenu();
  });
  
  // 中央ボタンが存在する場合、同様のイベントを設定 (arcade.html など)
  if (centerButton) {
    centerButton.addEventListener('click', spin);
    centerButton.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        window.electronAPI.showRouletteContextMenu();
    });
  }
  // ▲▲▲ 修正 ▲▲▲
}