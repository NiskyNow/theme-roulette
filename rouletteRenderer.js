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

  // ▼▼▼ 音声ファイルの読み込み ▼▼▼
  // (Tick関連のコードは削除してOKです)
  
  const audioStart = new Audio('../sounds/start.mp3');
  const audioSpin = new Audio('../sounds/spin.mp3'); 
  const audioSlow = new Audio('../sounds/slow.mp3'); // ▼ 新しい slow.mp3
  const audioFake = new Audio('../sounds/fake.mp3');
  const audioResult = new Audio('../sounds/result.mp3');

  audioSpin.loop = false; 
  audioSpin.playbackRate = 1.0; 
  audioSlow.loop = true; // ゆっくり音はループ推奨
  

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
   * (v2.6.0) テキスト描画：縦書き復活 & 自動縮小対応版
   */
  function drawSegmentTexts(cx, cy, r, textCss, profile) {
      const svgNS = 'http://www.w3.org/2000/svg';
      const itemsToShowInLegend = []; 

      // 1. 基準フォントサイズの取得 (デフォルト20px)
      let baseFontSize = 20;
      if (textCss) {
          if (textCss['font-size']) baseFontSize = parseFloat(textCss['font-size']);
          else if (textCss['font']) {
              const match = textCss['font'].match(/(\d+)px/);
              if (match) baseFontSize = parseFloat(match[1]);
          }
      }

      processedItems.forEach(item => {
          let textContent = item.name;
          
          // 狭いセグメントは番号表示
          if (item.angle < 15) {
              itemsToShowInLegend.push(item);
              textContent = (item.index + 1).toString();
          }

          const lines = (textContent || '').split('\n');
          
          // --- 2. 自動サイズ調整ロジック (縦書き用) ---
          
          // セグメント内で文字に使ってよい長さ（半径の80%を上限とする）
          // 外側の10%と中心側の10%を余白として残すイメージ
          const availableHeight = r * 0.8;
          
          // 最も長い行の文字数をカウント
          let maxChars = 0;
          lines.forEach(line => {
              let len = 0;
              for (let i = 0; i < line.length; i++) {
                  // 全角1、半角0.6程度で計算
                  len += (line.charCodeAt(i) < 128) ? 0.6 : 1;
              }
              if (len > maxChars) maxChars = len;
          });

          // 計算上の必要高さ = 文字数 * フォントサイズ
          let neededHeight = maxChars * baseFontSize;
          
          // 縮小率の計算 (必要高さが利用可能高さを超えていたら縮小)
          let scale = 1.0;
          if (neededHeight > availableHeight) {
              scale = availableHeight / neededHeight;
          }
          
          // 行数が多い場合も少し縮小 (横幅対策)
          if (lines.length > 1) {
              // 3行以上ならさらに少し小さくする
              if (lines.length > 2) scale *= 0.9;
          }

          // 最終フォントサイズ (最小サイズは 10px で底打ちさせる)
          let finalFontSize = Math.max(10, baseFontSize * scale);
          
          // 行間 (フォントサイズの1.1倍)
          let lineHeight = finalFontSize * 1.1;


          // --- 3. 描画 ---
          
          const centerAngleRad = (item.centerAngle - 90) * Math.PI / 180;
          // テキストの配置中心: 半径の 60% の位置 (少し内側寄りにすることで外枠との被りを防ぐ)
          const textRadius = r * 0.60; 
          const tx = cx + textRadius * Math.cos(centerAngleRad);
          const ty = cy + textRadius * Math.sin(centerAngleRad);

          const text = document.createElementNS(svgNS, 'text');
          
          // 縦書き設定
          text.style.writingMode = 'vertical-rl';
          text.style.textOrientation = 'upright';
          text.style.glyphOrientationVertical = '0';
          text.setAttribute('dominant-baseline', 'central'); 
          text.setAttribute('text-anchor', 'middle'); 
          
          text.setAttribute('transform', `rotate(${item.centerAngle}, ${tx}, ${ty})`);

          // スタイル適用
          if (textCss) {
             if (textCss.font) text.style.font = textCss.font;
             Object.keys(textCss).forEach(key => { 
                 if (key !== 'font' && !key.startsWith('font-')) text.style[key] = textCss[key]; 
             });
             if (textCss.fill) text.style.fill = textCss.fill;
             
             if (textCss['font-family']) text.style.fontFamily = textCss['font-family'];
             if (textCss['font-weight']) text.style.fontWeight = textCss['font-weight'];
          }
          
          // 計算したサイズを適用
          text.style.fontSize = `${finalFontSize}px`;

          // 改行(tspan)の配置
          if (lines.length > 1) {
              // 全体の幅
              const totalWidth = (lines.length - 1) * lineHeight;
              // 開始位置（右側）
              const startOffset = totalWidth / 2;

              lines.forEach((line, i) => {
                  const tspan = document.createElementNS(svgNS, 'tspan');
                  tspan.textContent = line;
                  // 縦書きなので X座標 をずらすことで行を変える
                  // i=0(1行目)が一番右(startOffset)、そこから左へずらす
                  const currentX = tx + startOffset - (i * lineHeight);
                  
                  tspan.setAttribute('x', currentX);
                  tspan.setAttribute('y', ty); 
                  text.appendChild(tspan);
              });
          } else {
              text.setAttribute('x', tx);
              text.setAttribute('y', ty);
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
      
      resultDiv.textContent = ''; 
      
      isSpinning = true;
      spinBtn.disabled = true;
      
      const foreground = document.getElementById('theme-foreground-slot');
      if (foreground) foreground.style.pointerEvents = 'none';

      // 1. スタート音
      audioStart.currentTime = 0;
      audioStart.play().catch(() => {});

      // 2. 回転音
      audioSpin.currentTime = 0;
      audioSpin.volume = 1.0; 
      audioSpin.play().catch(() => {});

      // ▼▼▼ 時間設定 ▼▼▼
      let spinSoundDuration = audioSpin.duration;
      if (isNaN(spinSoundDuration) || !isFinite(spinSoundDuration)) spinSoundDuration = 6.0;

      // Spinパートの時間（音が終わる少し前にSlowへ）
      const SPIN_DURATION = Math.max(3, spinSoundDuration - 0.3);
      
      // ▼▼▼ 変更: Slowパートを長く設定 ▼▼▼
      // 安全策として時間を延ばす許可をいただいたので、余裕を持って設定します
      const SLOW_DURATION = 3.5; 
      // ▲▲▲ 変更 ▲▲▲

      // --- ターゲット決定 ---
      
      let finalWinner = getWeightedRandomItem();
      if (!finalWinner) return;

      // フェイク用ターゲット計算
      let visualTargetItem = finalWinner;
      let isFakeExecution = false;

      if (fakeSpin && Math.random() < 0.33) {
          isFakeExecution = true;
          const dir = Math.random() < 0.5 ? -1 : 1;
          const fakeIndex = (finalWinner.index + dir + processedItems.length) % processedItems.length;
          visualTargetItem = processedItems[fakeIndex];
      }

      const winningItemName = finalWinner.name.replace('\n', ' ');

      // 角度計算
      const targetAngleFromTop = visualTargetItem.centerAngle;
      const targetMod = (360 - targetAngleFromTop) % 360;
      const currentMod = currentRotation % 360;
      let distance = targetMod - currentMod;
      if (distance < 0) distance += 360;

      const totalSpins = 30 + Math.floor(Math.random() * 3);
      const totalDegreesToVisualTarget = (totalSpins * 360) + distance;
      
      // ▼▼▼ 修正箇所 1: Slowの回転量を減らす（速度を落とす） ▼▼▼
      // 720度（2回転）を3.5秒で回ると速すぎます。360度〜450度くらいが適正です。
      const slowDegrees = 450; 
      // ▲▲▲ 修正 ▲▲▲
      
      // Spin終了地点（Slow開始地点）
      const spinEndRotation = currentRotation + totalDegreesToVisualTarget - slowDegrees;
      
      // 最終ゴール地点
      const slowEndRotation = currentRotation + totalDegreesToVisualTarget;


      // --- アニメーション実行 ---

      // 1. Spinパート (加速～減速)
      
      // ▼▼▼ 修正箇所 2: 仮想ターゲットをもっと遠くにする（ブレーキを弱める） ▼▼▼
      // 「+ 200」だとブレーキがかかりすぎて止まりそうになってしまいます。
      // 「+ 600」くらいにして、「まだ先があるから勢いを保つ」ようにCSSを騙します。
      const virtualTarget = spinEndRotation + 600; 
      // ▲▲▲ 修正 ▲▲▲
      
      // 止まらないカーブ
      const spinEasing = 'cubic-bezier(0.5, 0, 0.2, 1)'; 

      forceRotate(virtualTarget, SPIN_DURATION + 1.5, spinEasing);

      // 2. Slowパートへの切り替え (SPIN_DURATION経過後)
      setTimeout(() => {
          // 音切り替え
          audioSpin.pause();
          audioSlow.currentTime = 0;
          audioSlow.volume = 1.0;
          audioSlow.play().catch(() => {});

          // 線形補間でゴールまで等速移動
          // 今どこにいても、ゴールは500度以上先にあるはずなので、必ず前進します
          forceRotate(slowEndRotation, SLOW_DURATION, 'linear');

          // 3. 停止 & フェイク判定 (Slow終了後)
          setTimeout(() => {
              audioSlow.pause(); // まずSlow音を止める

              if (isFakeExecution) {
                  // ▼▼▼ 修正: ここで「完全に止まった」と思わせるための「間」を作る ▼▼▼
                  
                  // 0.8秒待機（この間は回転も音も止まっています）
                  setTimeout(() => {
                      // --- フェイク演出スタート ---
                      audioFake.currentTime = 0;
                      audioFake.play().catch(() => {});

                      // ズレ計算
                      const finalTargetMod = (360 - finalWinner.centerAngle) % 360;
                      const currentVisualMod = (slowEndRotation % 360);
                      let drift = finalTargetMod - currentVisualMod;
                      
                      if (drift > 180) drift -= 360;
                      if (drift < -180) drift += 360;

                      const finalRealRotation = slowEndRotation + drift;

                      // ズルっと動く
                      forceRotate(finalRealRotation, 1.0, 'cubic-bezier(0.25, 1, 0.5, 1)');

                      // フェイク移動完了後に結果表示
                      setTimeout(() => {
                          finishSpin(finalWinner.name.replace('\n', ' '), finalRealRotation);
                      }, 1000);

                  }, 800); // ★ここが調整ポイント: 800ms (0.8秒) のタメ

              } else {
                  // --- 通常終了 ---
                  finishSpin(winningItemName, slowEndRotation);
              }

          }, SLOW_DURATION * 1000);

      }, SPIN_DURATION * 1000);
      
      // 共通終了処理
      function finishSpin(text, finalRot) {
          audioResult.currentTime = 0;
          audioResult.play().catch(() => {});
          resultDiv.textContent = text;
          isSpinning = false;
          spinBtn.disabled = false;
          if (foreground) foreground.style.pointerEvents = 'auto'; 
          currentRotation = finalRot;
      }
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

  // (v2.2.2) アニメーション割り込み用に現在の回転角度を取得する関数
  function forceRotate(rotationDegrees, durationSeconds, easing) {
      const rouletteSVG = document.getElementById('roulette-svg-target');
      if (!rouletteSVG) return;
      
      // アニメーション切り替え時の「継ぎ目」をなくすため、一度スタイルをリセットしません。
      // 新しい値を上書きすることでブラウザが自動的に現在地から補間してくれます。
      // ただし、transitionプロパティは更新する必要があります。
      
      rouletteSVG.style.transition = `transform ${durationSeconds}s ${easing}`;
      rouletteSVG.style.transform = `rotate(${rotationDegrees}deg)`;
  }
  
  // 座標取得用（念のため残していますが今回は自動補間に任せています）
  function getCurrentRotation(element) {
      const style = window.getComputedStyle(element);
      const transform = style.transform || style.webkitTransform;
      if (!transform || transform === 'none') return 0;
      const values = transform.split('(')[1].split(')')[0].split(',');
      const a = parseFloat(values[0]);
      const b = parseFloat(values[1]);
      let angle = Math.round(Math.atan2(b, a) * (180 / Math.PI));
      return (angle < 0) ? angle + 360 : angle;
  }

  spinBtn.addEventListener('click', spin);
  spinBtn.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    window.electronAPI.showRouletteContextMenu();
  });
}