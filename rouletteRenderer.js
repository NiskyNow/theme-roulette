// rouletteRenderer.js (v2.2.0 - Numbered Legend Support)

// 1. preload.js との連携を確認
if (!window.electronAPI) {
  console.error('❌ 失敗: preload.js との連携ができていません。');
} else {
  console.log('✅ 成功: preload.js との連携に成功しました！');
  initializeApp();
}

/**
 * アプリケーション初期化
 */
function initializeApp() {

  // --- グローバル状態 ---
  let rawItems = [];          
  let processedItems = [];    
  let colors = [];            
  let probabilities = []; 
  let fakeSpin = false;
  let currentThemeProfile = {}; 
  
  let isSpinning = false;
  let currentRotation = 0;    

  // --- DOM要素 ---
  const rouletteSVG = document.getElementById('roulette-svg-target'); 
  const spinBtn = document.getElementById('spinBtn');
  const resultDiv = document.getElementById('result');
  
  const bgSlot = document.getElementById('theme-background-slot');
  const fgSlot = document.getElementById('theme-foreground-slot');
  const styleTag = document.getElementById('theme-dynamic-style');
  
  const legendArea = document.getElementById('legend-area');

  if (!rouletteSVG || !spinBtn || !resultDiv) {
      console.error('必要なDOM要素が見つかりません。master.html を確認してください。');
      return;
  }

  // --- (A) データ受信リスナー ---
  window.electronAPI.onSettingsUpdated(async (data) => {
    console.log('IPC通知を受信:', data);

    if (!data || !data.items || !data.settings) {
      resultDiv.textContent = 'エラー: 設定データが不正です';
      return;
    }

    rawItems = data.items;
    probabilities = data.items.map(item => item.weight); 
    fakeSpin = data.settings.fakeEnabled;

    const themeName = data.settings.theme;
    currentThemeProfile = await window.electronAPI.getThemeProfile(themeName);

    if (!currentThemeProfile) {
      resultDiv.textContent = `エラー: ${themeName}.json が読み込めません`;
      return;
    }

    injectTheme(currentThemeProfile);
    colors = generateColors(rawItems.length, currentThemeProfile.colorProfile);
    calculateSegmentAngles();
    renderAll();

    resultDiv.textContent = '...';
    isSpinning = false;
    spinBtn.disabled = false;
  });

  // --- 内部ロジック ---

  function injectTheme(profile) {
      styleTag.textContent = (profile.css && Array.isArray(profile.css)) ? profile.css.join('\n') : '';
      bgSlot.innerHTML = (profile.backgroundHtml && Array.isArray(profile.backgroundHtml)) ? profile.backgroundHtml.join('\n') : '';
      fgSlot.innerHTML = (profile.foregroundHtml && Array.isArray(profile.foregroundHtml)) ? profile.foregroundHtml.join('\n') : '';
  }

  function generateColors(count, profile) {
    const generated = [];
    if (!profile || !profile.colors || profile.colors.length === 0) {
        for (let i = 0; i < count; i++) generated.push("#888888");
        return generated;
    }
    const colorList = profile.colors;
    if (colorList.length === 1) {
        for (let i = 0; i < count; i++) generated.push(colorList[0]);
        return generated;
    }
    for (let i = 0; i < count; i++) {
        let colorIndex = i % colorList.length;
        if (i === count - 1 && colorIndex === 0) {
            colorIndex = 1;
        }
        generated.push(colorList[colorIndex]);
    }
    return generated;
  }

  function calculateSegmentAngles() {
      const totalWeight = rawItems.reduce((sum, item) => sum + (parseFloat(item.weight) || 0), 0);
      let currentAngle = 0;

      processedItems = rawItems.map((item, index) => {
          const weight = parseFloat(item.weight) || 0;
          const angle = (totalWeight > 0) ? (weight / totalWeight) * 360 : (360 / rawItems.length);
          
          const startAngle = currentAngle;
          const endAngle = currentAngle + angle;
          const centerAngle = startAngle + (angle / 2);

          currentAngle += angle;

          return {
              ...item,
              index: index,
              color: colors[index],
              angle: angle,
              startAngle: startAngle,
              endAngle: endAngle,
              centerAngle: centerAngle
          };
      });
  }

  // --- 描画関数群 ---

  function renderAll() {
      rouletteSVG.innerHTML = '';
      legendArea.innerHTML = '';
      legendArea.style.display = 'none';

      const profile = currentThemeProfile;
      if (!profile || !profile.segmentCss) return;

      rouletteSVG.setAttribute('viewBox', profile.svgViewBox);
      const [,, vbWidth, vbHeight] = profile.svgViewBox.split(' ').map(Number);
      const centerX = vbWidth / 2;
      const centerY = vbHeight / 2;
      const radius = Math.min(centerX, centerY) - 10;

      if (processedItems.length === 0) {
          drawEmptyMessage(centerX, centerY, profile.segmentCss.text);
          return;
      }

      drawSegments(centerX, centerY, radius, profile.segmentCss.path);
      drawSegmentTexts(centerX, centerY, radius, profile.segmentCss.text, profile);
      drawLegend();
  }

  function drawEmptyMessage(cx, cy, textCss) {
      const defaultFill = (textCss && textCss.fill) ? textCss.fill : '#FFF';
      const defaultSize = '20px';
      rouletteSVG.innerHTML = `<text x="${cx}" y="${cy}" fill="${defaultFill}" font-size="${defaultSize}" text-anchor="middle">項目がありません</text>`;
  }

  function drawSegments(cx, cy, r, pathCss) {
      const svgNS = 'http://www.w3.org/2000/svg';

      processedItems.forEach(item => {
          const startRad = (item.startAngle - 90) * Math.PI / 180;
          const endRad = (item.endAngle - 90) * Math.PI / 180;

          const x1 = cx + r * Math.cos(startRad);
          const y1 = cy + r * Math.sin(startRad);
          const x2 = cx + r * Math.cos(endRad);
          const y2 = cy + r * Math.sin(endRad);

          let d;
          if (processedItems.length === 1 || item.angle >= 360) {
              d = `M ${cx} ${cy} m -${r}, 0 a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 -${r * 2},0`;
          } else {
              const largeArc = item.angle > 180 ? 1 : 0;
              d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
          }

          const path = document.createElementNS(svgNS, 'path');
          path.setAttribute('d', d);
          path.setAttribute('fill', item.color);
          
          if (pathCss) {
              Object.keys(pathCss).forEach(key => { path.style[key] = pathCss[key]; });
          }
          rouletteSVG.appendChild(path);
      });
  }

  /**
   * (v2.2.0) テキスト描画：狭い場合は番号を表示して凡例リストへ送る
   */
  function drawSegmentTexts(cx, cy, r, textCss, profile) {
      const svgNS = 'http://www.w3.org/2000/svg';
      const itemsToShowInLegend = []; 

      processedItems.forEach(item => {
          let textContent = item.name;
          let isSmallSegment = false;

          // 角度が狭すぎる場合（例: 15度未満）
          if (item.angle < 15) {
              isSmallSegment = true;
              itemsToShowInLegend.push(item);
              // ▼▼▼ 変更: 文字の代わりに番号を表示 ▼▼▼
              textContent = (item.index + 1).toString();
              // ▲▲▲ 変更 ▲▲▲
          }

          const centerAngleRad = (item.centerAngle - 90) * Math.PI / 180;
          const textRadius = r * 0.7; 
          const tx = cx + textRadius * Math.cos(centerAngleRad);
          const ty = cy + textRadius * Math.sin(centerAngleRad);

          const text = document.createElementNS(svgNS, 'text');
          text.setAttribute('x', tx);
          text.setAttribute('y', ty);

          // 共通スタイル
          text.style.writingMode = 'vertical-rl';
          text.style.textOrientation = 'upright';
          text.style.glyphOrientationVertical = '0';
          text.setAttribute('dominant-baseline', 'central'); 
          text.setAttribute('text-anchor', 'middle'); 
          
          // 英数字の間隔調整（番号の場合も適用）
          if (/^[\x20-\x7E]+$/.test(textContent)) {
              // 番号だけなら少し詰める程度でいいが、統一感を出すため適用
              text.style.letterSpacing = '-2px'; 
          }

          text.setAttribute('transform', `rotate(${item.centerAngle}, ${tx}, ${ty})`);

          if (textCss) {
             if (textCss.font) text.style.font = textCss.font;
             Object.keys(textCss).forEach(key => { 
                 if (key !== 'font' && !key.startsWith('font-')) text.style[key] = textCss[key]; 
             });
             if (textCss.fill) text.style.fill = textCss.fill;
          }

          // 番号表示の場合、文字サイズを少し大きく強調しても良いかもしれないが、
          // 狭いセグメントなので、逆に大きすぎるとはみ出る。
          // とりあえずデフォルトサイズを使用。

          const lines = (textContent || '').split('\n');
          
          // 長文対策（番号の場合は関係ないが、通常の名前の場合に発動）
          if (!isSmallSegment) {
              const totalLength = lines.join('').length;
              if (totalLength > 6) {
                  const currentSize = parseFloat(textCss['font-size'] || '20');
                  text.style.fontSize = `${currentSize * 0.8}px`;
              }
          } else {
              // 番号の場合は見やすくするため、標準サイズを維持（縮小しない）
          }

          if (lines.length > 1) {
              lines.forEach(line => {
                  const tspan = document.createElementNS(svgNS, 'tspan');
                  tspan.textContent = line;
                  text.appendChild(tspan);
              });
          } else {
              text.textContent = textContent;
          }

          rouletteSVG.appendChild(text);
      });

      window.currentLegendItems = itemsToShowInLegend;
  }

  /**
   * (v2.2.0) 凡例描画：番号と名前を併記
   */
  function drawLegend() {
      const items = window.currentLegendItems || [];
      if (items.length === 0) {
          legendArea.style.display = 'none';
          return;
      }

      legendArea.style.display = 'block';
      
      const ul = document.createElement('ul');
      ul.style.listStyle = 'none';
      ul.style.padding = '0';
      ul.style.margin = '0';

      items.forEach(item => {
          const li = document.createElement('li');
          li.style.marginBottom = '5px';
          li.style.display = 'flex';
          li.style.alignItems = 'center';
          li.style.fontSize = '14px';
          // 長い名前が折り返されないようにする
          li.style.whiteSpace = 'nowrap';

          // 色見本
          const colorBox = document.createElement('span');
          colorBox.style.display = 'inline-block';
          colorBox.style.width = '12px';
          colorBox.style.height = '12px';
          colorBox.style.backgroundColor = item.color;
          colorBox.style.marginRight = '6px';
          colorBox.style.borderRadius = '2px';
          colorBox.style.flexShrink = '0'; // 縮まないように

          // ▼▼▼ 追加: 番号 ▼▼▼
          const numberSpan = document.createElement('span');
          numberSpan.textContent = `${item.index + 1}.`; // "1." のように表示
          numberSpan.style.marginRight = '6px';
          numberSpan.style.fontWeight = 'bold';
          numberSpan.style.minWidth = '20px'; // 桁がずれないように幅確保
          // ▲▲▲ 追加 ▲▲▲

          li.appendChild(colorBox);
          li.appendChild(numberSpan);
          li.appendChild(document.createTextNode(item.name));
          ul.appendChild(li);
      });

      legendArea.appendChild(ul);
  }

  // --- Spinロジック (変更なし) ---

  function spin() {
      if (isSpinning) return;
      if (processedItems.length === 0) return;
      
      isSpinning = true;
      spinBtn.disabled = true;
      
      const foreground = document.getElementById('theme-foreground-slot');
      if (foreground) foreground.style.pointerEvents = 'none';

      const winningItem = getWeightedRandomItem();
      if (!winningItem) {
          resultDiv.textContent = 'エラー';
          isSpinning = false;
          spinBtn.disabled = false;
          if (foreground) foreground.style.pointerEvents = 'auto'; 
          return;
      }

      const winningItemName = winningItem.name.replace('\n', ' ');
      const targetAngleFromTop = winningItem.centerAngle;
      const targetMod = (360 - targetAngleFromTop) % 360;
      const currentMod = currentRotation % 360;
      let distance = targetMod - currentMod;
      if (distance < 0) distance += 360;

      const minSpins = 5;
      const extraSpins = Math.floor(Math.random() * 3);
      const spinDegrees = (minSpins + extraSpins) * 360;
      const nextRotation = currentRotation + spinDegrees + distance;

      if (fakeSpin && Math.random() < 0.33) {
          const dir = Math.random() < 0.5 ? -1 : 1;
          const fakeIndex = (winningItem.index + dir + processedItems.length) % processedItems.length;
          const fakeItem = processedItems[fakeIndex];
          const fakeTargetFromTop = fakeItem.centerAngle;
          const fakeTargetMod = (360 - fakeTargetFromTop) % 360;
          let fakeDistance = fakeTargetMod - currentMod;
          if (fakeDistance < 0) fakeDistance += 360;
          const fakeFinalRotation = currentRotation + spinDegrees + fakeDistance;

          forceRotate(fakeFinalRotation, 4, 'cubic-bezier(0.25, 1, 0.5, 1)');
          setTimeout(() => { forceRotate(nextRotation, 1.5, 'ease-out'); }, 4000);
      } else {
          forceRotate(nextRotation, 5, 'cubic-bezier(0.17, 0.67, 0.12, 0.99)');
      }
      
      setTimeout(() => {
          resultDiv.textContent = winningItemName;
          isSpinning = false;
          spinBtn.disabled = false;
          if (foreground) foreground.style.pointerEvents = 'auto'; 
          currentRotation = nextRotation;
      }, 5500);
  }

  function getWeightedRandomItem() {
      const totalWeight = processedItems.reduce((sum, item) => sum + (parseFloat(item.weight) || 0), 0);
      if (totalWeight <= 0) {
          if (processedItems.length === 0) return null;
          return processedItems[Math.floor(Math.random() * processedItems.length)];
      }
      let randomValue = Math.random() * totalWeight;
      for (const item of processedItems) {
          randomValue -= (parseFloat(item.weight) || 0);
          if (randomValue <= 0) return item;
      }
      return processedItems[processedItems.length - 1];
  }

  function forceRotate(rotationDegrees, durationSeconds, easing) {
      if (!rouletteSVG) return;
      rouletteSVG.style.transition = `transform ${durationSeconds}s ${easing}`;
      rouletteSVG.style.transform = `rotate(${rotationDegrees}deg)`;
  }

  spinBtn.addEventListener('click', spin);
  spinBtn.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    window.electronAPI.showRouletteContextMenu();
  });
}