// rouletteRenderer.js (v5.2 - Strict Context Menu)

if (!window.electronAPI) console.error('❌ Preload error');
else initializeApp();

function initializeApp() {
    // === 1. 状態管理 ===
    const State = {
        items: [],
        colors: [],
        processedItems: [],
        isSpinning: false,
        currentRotation: 0,
        settings: {
            spinMode: 'suspense',
            musicDuration: 8.0,
            bgmPath: '',
            isMuted: false,
            fakeEnabled: false
        }
    };

    // === 2. オーディオ管理 ===
    const Sound = {
        bgm: new Audio(),
        se: {
            start: new Audio('../sounds/start.mp3'),
            spin: new Audio('../sounds/spin.mp3'),
            slow: new Audio('../sounds/slow.mp3'),
            fake: new Audio('../sounds/fake.mp3'),
            result: new Audio('../sounds/result.mp3')
        },
        init() {
            this.se.spin.loop = false;
            this.se.slow.loop = true;
        },
        play(name) {
            if (State.settings.isMuted) return;
            if (this.se[name]) {
                this.se[name].currentTime = 0;
                this.se[name].play().catch(() => {});
            }
        },
        playBGM() {
            if (State.settings.isMuted || !State.settings.bgmPath) return;
            this.bgm.src = State.settings.bgmPath;
            this.bgm.currentTime = 0;
            this.bgm.volume = 1.0;
            this.bgm.loop = false;
            this.bgm.play().catch(e => console.warn('BGM Error:', e));
        },
        stopAll() {
            if (!this.bgm.paused) this.bgm.pause();
            if (!this.se.spin.paused) this.se.spin.pause();
            if (!this.se.slow.paused) this.se.slow.pause();
        }
    };
    Sound.init();

    // === 3. 演出管理 ===
    const EffectManager = {
        animationId: null,
        gl: null,
        
        refresh(themeName) {
            this.stop();
            const canvas = document.getElementById('webgl-canvas');
            if (canvas) this.initWebGL(canvas);
        },

        stop() {
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
            this.gl = null;
        },

        initWebGL(canvas) {
            const container = canvas.parentElement;
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;

            const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
            if (!gl) return;
            this.gl = gl;

            gl.clearColor(0, 0, 0, 0);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

            const program = this.createProgram(gl, this.vertexShaderSrc, this.neonFragmentShaderSrc);
            if (!program) return;

            const buffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,1, -1,-1, 1,1, 1,-1]), gl.STATIC_DRAW);

            const posLoc = gl.getAttribLocation(program, 'position');
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

            const uTime = gl.getUniformLocation(program, 'time');
            const uW = gl.getUniformLocation(program, 'width');
            const uH = gl.getUniformLocation(program, 'height');

            const startTime = Date.now();
            
            const loop = () => {
                if (!document.getElementById('webgl-canvas')) return;

                gl.viewport(0, 0, canvas.width, canvas.height);
                gl.clear(gl.COLOR_BUFFER_BIT);

                gl.uniform1f(uW, canvas.width);
                gl.uniform1f(uH, canvas.height);
                gl.uniform1f(uTime, (Date.now() - startTime) / 1000);

                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                this.animationId = requestAnimationFrame(loop);
            };
            loop();
        },

        createProgram(gl, vsSrc, fsSrc) {
            const compile = (src, type) => {
                const s = gl.createShader(type);
                gl.shaderSource(s, src);
                gl.compileShader(s);
                if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return null;
                return s;
            };
            const vs = compile(vsSrc, gl.VERTEX_SHADER);
            const fs = compile(fsSrc, gl.FRAGMENT_SHADER);
            if (!vs || !fs) return null;
            const p = gl.createProgram();
            gl.attachShader(p, vs);
            gl.attachShader(p, fs);
            gl.linkProgram(p);
            return p;
        },

        vertexShaderSrc: `
            attribute vec2 position;
            void main() { gl_Position = vec4(position, 0.0, 1.0); }
        `,

        neonFragmentShaderSrc: `
            precision highp float;
            uniform float width;
            uniform float height;
            uniform float time;
            vec2 resolution = vec2(width, height);

            #define POINT_COUNT 8
            vec2 points[POINT_COUNT];
            
            const float speed = -1.5;
            const float len = 0.3;
            float intensity = 2.0; 
            float radius = 0.015;

            float sdBezier(vec2 pos, vec2 A, vec2 B, vec2 C){    
                vec2 a = B - A; vec2 b = A - 2.0*B + C; vec2 c = a * 2.0; vec2 d = A - pos;
                float kk = 1.0 / dot(b,b); float kx = kk * dot(a,b); float ky = kk * (2.0*dot(a,a)+dot(d,b)) / 3.0; float kz = kk * dot(d,a);      
                float res = 0.0; float p = ky - kx*kx; float p3 = p*p*p; float q = kx*(2.0*kx*kx - 3.0*ky) + kz; float h = q*q + 4.0*p3;
                if(h>=0.0){ h=sqrt(h); vec2 x=(vec2(h,-h)-q)/2.0; vec2 uv=sign(x)*pow(abs(x),vec2(1.0/3.0)); float t=uv.x+uv.y-kx; t=clamp(t,0.0,1.0); vec2 qos=d+(c+b*t)*t; res=length(qos); }
                else{ float z=sqrt(-p); float v=acos(q/(p*z*2.0))/3.0; float m=cos(v); float n=sin(v)*1.732050808; vec3 t=vec3(m+m,-n-m,n-m)*z-kx; t=clamp(t,0.0,1.0); vec2 qos=d+(c+b*t.x)*t.x; float dis=dot(qos,qos); res=dis; qos=d+(c+b*t.y)*t.y; dis=dot(qos,qos); res=min(res,dis); qos=d+(c+b*t.z)*t.z; dis=dot(qos,qos); res=min(res,dis); res=sqrt(res); }
                return res;
            }

            vec2 getCirclePos(float t) { return vec2(cos(t), sin(t)); }
            float getGlow(float dist, float r, float i) { return pow(r / max(dist, 0.0001), i); }

            float getSegment(float t, vec2 pos, float offset, float scale) {
                for(int i=0; i<POINT_COUNT; i++) {
                    points[i] = getCirclePos(offset + float(i)*len + fract(speed*t)*6.28) * scale;
                }
                vec2 c=(points[0]+points[1])/2.0; vec2 cp; float d=10000.0;
                for(int i=0; i<POINT_COUNT-1; i++){
                    cp=c; c=(points[i]+points[i+1])/2.0;
                    d = min(d, sdBezier(pos, cp, points[i], c));
                }
                return max(0.0, d);
            }

            void main() {
                vec2 pos = (vec2(0.5) - gl_FragCoord.xy/resolution.xy);
                pos.y /= resolution.x/resolution.y;
                float scale = 0.43; 
                float t = time;
                vec3 col = vec3(0.0);

                float d = getSegment(t, pos, 0.0, scale);
                col += 5.0 * vec3(smoothstep(0.005, 0.001, d)); 
                col += getGlow(d, radius, intensity) * vec3(1.0, 0.0, 0.6); 
                
                d = getSegment(t, pos, 3.14, scale); 
                col += 5.0 * vec3(smoothstep(0.005, 0.001, d));
                col += getGlow(d, radius, intensity) * vec3(0.0, 0.6, 1.0); 

                col = 1.0 - exp(-col);
                col = pow(col, vec3(0.4545));
                
                float alpha = max(max(col.r, col.g), col.b);
                if (alpha < 0.1) alpha = 0.0; else alpha = 1.0;
                
                if(length(pos) > 0.49) alpha = 0.0;

                gl_FragColor = vec4(col, alpha);
            }
        `
    };

    // === 4. UI/DOM管理 ===
    const UI = {
        svg: document.getElementById('roulette-svg-target'),
        btn: document.getElementById('spinBtn'),
        result: document.getElementById('result'),
        bgSlot: document.getElementById('theme-background-slot'),
        fgSlot: document.getElementById('theme-foreground-slot'),
        styleTag: document.getElementById('theme-dynamic-style'),
        legend: document.getElementById('legend-area'),

        applyTheme(profile) {
            this.styleTag.textContent = (profile.css || []).join('\n');
            this.bgSlot.innerHTML = (profile.backgroundHtml || []).join('\n');
            this.fgSlot.innerHTML = (profile.foregroundHtml || []).join('\n');
            
            this.adjustLayout();
            
            if (this.btn) this.btn.style.display = 'none';

            // 標準的なクラス名のみを対象にする (テーマファイルで統一済み前提)
            const centerTargets = document.querySelectorAll('.center-hub, .center-mon, .center-circle');
            
            centerTargets.forEach(el => {
                el.style.cursor = 'pointer';
                el.style.pointerEvents = 'auto'; 
                el.style.webkitAppRegion = 'no-drag'; 
                
                // 左クリック：スピン
                el.removeEventListener('click', spin);
                el.addEventListener('click', spin);
                
                // ▼▼▼ 修正: 右クリックメニューはボタン上でのみ有効 ▼▼▼
                el.removeEventListener('contextmenu', this.handleContextMenu);
                el.addEventListener('contextmenu', this.handleContextMenu);
                // ▲▲▲ ▲▲▲

                el.classList.add('clickable-center');
            });

            EffectManager.refresh(profile.themeId);
        },
        
        // メニュー表示ハンドラ
        handleContextMenu(e) {
            e.preventDefault();
            e.stopPropagation(); // 親への伝播を止める（念のため）
            window.electronAPI.showRouletteContextMenu();
        },

        adjustLayout() {
            const wrapper = document.querySelector('.roulette-wrapper');
            const result = document.getElementById('result');
            
            if (wrapper && result) {
                const top = wrapper.offsetTop;
                const height = wrapper.offsetHeight;
                const visualBottom = top + (height / 2);
                const targetTop = visualBottom + 50;
                
                result.style.position = 'absolute';
                result.style.top = `${targetTop}px`;
                result.style.left = '50%';
                result.style.transform = 'translateX(-50%)';
                result.style.margin = '0';
                result.style.width = '100%';
                result.style.textAlign = 'center';
                
                // ▼▼▼ 修正: 結果表示は徹底的に操作無効化 ▼▼▼
                result.style.userSelect = 'none';
                result.style.webkitUserSelect = 'none'; // Chrome系
                result.style.pointerEvents = 'none';    // クリック透過
                // ▲▲▲ ▲▲▲
                
                if (this.legend) {
                    this.legend.style.top = `${targetTop}px`;
                }
            }
        },

        renderRoulette(items, colors, profile) {
            this.svg.innerHTML = '';
            this.legend.style.display = 'none';
            if (!profile || !profile.segmentCss) return;

            this.svg.setAttribute('viewBox', profile.svgViewBox);
            const [,, vbW, vbH] = profile.svgViewBox.split(' ').map(Number);
            const r = Math.min(vbW/2, vbH/2) - 10; 

            items.forEach(item => {
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', this.getSectorPath(vbW/2, vbH/2, r, item.startAngle, item.endAngle));
                path.setAttribute('fill', item.color);
                Object.entries(profile.segmentCss.path || {}).forEach(([k,v])=>path.style[k]=v);
                this.svg.appendChild(path);

                this.drawText(vbW/2, vbH/2, r, item, profile.segmentCss.text);
            });
        },

        getSectorPath(cx, cy, r, startAngle, endAngle) {
            const rad = Math.PI / 180;
            const x1 = cx + r * Math.cos((startAngle-90)*rad);
            const y1 = cy + r * Math.sin((startAngle-90)*rad);
            const x2 = cx + r * Math.cos((endAngle-90)*rad);
            const y2 = cy + r * Math.sin((endAngle-90)*rad);
            const large = (endAngle - startAngle) > 180 ? 1 : 0;
            return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
        },

        drawText(cx, cy, r, item, css) {
            const svgNS = 'http://www.w3.org/2000/svg';
            
            let baseFontSize = 20;
            if (css) {
                if (css['font-size']) baseFontSize = parseFloat(css['font-size']);
                else if (css['font']) {
                    const match = css['font'].match(/(\d+)px/);
                    if (match) baseFontSize = parseFloat(match[1]);
                }
            }

            const lines = (item.name || '').split('\n');
            let maxChars = 0;
            lines.forEach(line => {
                let len = 0;
                for (let i = 0; i < line.length; i++) {
                    len += (line.charCodeAt(i) < 128) ? 0.6 : 1;
                }
                if (len > maxChars) maxChars = len;
            });

            const textRadius = r * 0.65;
            const distToEdge = r - textRadius; 
            const availableHeight = distToEdge * 2 * 0.95; 

            let neededHeight = maxChars * baseFontSize;
            let scale = 1.0;
            if (neededHeight > availableHeight) {
                scale = availableHeight / neededHeight;
            }
            if (lines.length > 1) {
                if (lines.length > 2) scale *= 0.9;
            }

            let finalFontSize = Math.max(10, baseFontSize * scale);
            let lineHeight = finalFontSize * 1.1;

            const rad = Math.PI / 180;
            const angle = item.centerAngle;
            
            const tx = cx + textRadius * Math.cos((angle - 90) * rad);
            const ty = cy + textRadius * Math.sin((angle - 90) * rad);

            const text = document.createElementNS(svgNS, 'text');
            text.setAttribute('dominant-baseline', 'central'); 
            text.setAttribute('text-anchor', 'middle'); 

            text.style.webkitUserSelect = 'none';
            text.style.userSelect = 'none';
            text.style.pointerEvents = 'none';

            if (item.isHorizontal) {
                text.style.writingMode = 'horizontal-tb';
                let rotation = angle - 90;
                text.setAttribute('transform', `rotate(${rotation}, ${tx}, ${ty})`);
            } else {
                text.style.writingMode = 'vertical-rl';
                text.style.textOrientation = 'upright';
                text.style.glyphOrientationVertical = '0';
                text.setAttribute('transform', `rotate(${angle}, ${tx}, ${ty})`);
            }

            if (css) {
                if (css.font) text.style.font = css.font;
                Object.keys(css).forEach(key => { 
                    if (key !== 'font' && !key.startsWith('font-')) text.style[key] = css[key]; 
                });
                if (css.fill) text.style.fill = css.fill;
                if (css['font-family']) text.style.fontFamily = css['font-family'];
                if (css['font-weight']) text.style.fontWeight = css['font-weight'];
            }
            text.style.fontSize = `${finalFontSize}px`;

            if (lines.length > 1) {
                const totalSize = (lines.length - 1) * lineHeight;
                const startOffset = totalSize / 2;

                lines.forEach((line, i) => {
                    const tspan = document.createElementNS(svgNS, 'tspan');
                    tspan.textContent = line;
                    if (item.isHorizontal) {
                        const currentY = ty - startOffset + (i * lineHeight);
                        tspan.setAttribute('x', tx);
                        tspan.setAttribute('y', currentY);
                    } else {
                        const currentX = tx + startOffset - (i * lineHeight);
                        tspan.setAttribute('x', currentX);
                        tspan.setAttribute('y', ty);
                    }
                    text.appendChild(tspan);
                });
            } else {
                text.setAttribute('x', tx);
                text.setAttribute('y', ty);
                text.textContent = item.name;
            }

            this.svg.appendChild(text);
        },
        
        rotate(deg, duration, easing) {
            this.svg.style.transition = `transform ${duration}s ${easing}`;
            this.svg.style.transform = `rotate(${deg}deg)`;
        },
        
        setResult(text) { this.result.textContent = text; },
        enableBtn(enable) { 
            const centers = document.querySelectorAll('.center-hub, .center-mon, .center-circle');
            centers.forEach(el => el.style.pointerEvents = enable ? 'auto' : 'none');
        }
    };

    window.electronAPI.onSettingsUpdated(async (data) => {
        if (!data) return;
        
        State.items = data.items;
        State.settings.fakeEnabled = data.settings.fakeEnabled;
        State.settings.spinMode = data.settings.spinMode || 'suspense';
        State.settings.musicDuration = parseFloat(data.settings.musicDuration) || 8.0;
        State.settings.isMuted = !!data.settings.isMuted;
        
        let bgm = data.settings.bgmPath;
        State.settings.bgmPath = (!bgm || bgm === 'sounds/music.mp3') ? '../sounds/music.mp3' : bgm;

        const profile = await window.electronAPI.getThemeProfile(data.settings.theme);
        State.currentThemeProfile = profile;
        
        UI.applyTheme(profile);
        State.colors = generateColors(State.items.length, profile.colorProfile);
        calculateAngles();
        UI.renderRoulette(State.processedItems, State.colors, profile);
        UI.setResult('Ready');
    });

    function generateColors(count, profile) {
        const list = profile && profile.colors ? profile.colors : ['#888'];
        const res = [];
        for(let i=0; i<count; i++) res.push(list[i % list.length]);
        return res;
    }

    function calculateAngles() {
        const total = State.items.reduce((s, i) => s + (parseFloat(i.weight)||0), 0);
        let curr = 0;
        State.processedItems = State.items.map((item, i) => {
            const w = parseFloat(item.weight)||0;
            const angle = (total>0) ? (w/total)*360 : (360/State.items.length);
            const res = { ...item, index:i, color:State.colors[i], startAngle:curr, endAngle:curr+angle, centerAngle:curr+angle/2 };
            curr += angle;
            return res;
        });
    }

    function getWinner() {
        const total = State.processedItems.reduce((s, i) => s + (parseFloat(i.weight)||0), 0);
        if (total <= 0) {
            const idx = Math.floor(Math.random() * State.processedItems.length);
            return State.processedItems[idx];
        }

        let r = Math.random() * total;
        for(let item of State.processedItems) {
            r -= (parseFloat(item.weight)||0);
            if(r<=0) return item;
        }
        return State.processedItems[State.processedItems.length-1];
    }

    function spin() {
        if (State.isSpinning) return;
        State.isSpinning = true;
        UI.enableBtn(false);
        UI.setResult('');

        const winner = getWinner();
        const winnerName = winner.name.replace(/\n/g, ' ');
        
        const currentVisualAngle = (winner.centerAngle + State.currentRotation) % 360;
        const dist = (360 - currentVisualAngle) % 360;
        
        if (State.settings.spinMode === 'music') {
            Sound.play('start');
            Sound.playBGM();
            
            const spins = Math.max(5, Math.floor(State.settings.musicDuration * 3));
            const targetRot = State.currentRotation + (spins * 360) + dist;
            
            UI.rotate(targetRot, State.settings.musicDuration, 'cubic-bezier(0.1, 0.7, 0.1, 1)');
            
            setTimeout(() => {
                Sound.stopAll();
                finish(winnerName, targetRot);
            }, State.settings.musicDuration * 1000);

        } else {
            Sound.play('start');
            Sound.play('spin');
            
            const totalSpins = 30 + Math.floor(Math.random() * 3);
            const totalDegrees = (totalSpins * 360) + dist;
            const slowDegrees = 450; 
            const targetRot = State.currentRotation + totalDegrees - slowDegrees;
            
            UI.rotate(targetRot, 4.5, 'cubic-bezier(0.5, 0, 0.2, 1)');
            
            setTimeout(() => {
                Sound.stopAll();
                Sound.play('slow');
                const finalRot = targetRot + slowDegrees;
                UI.rotate(finalRot, 3.5, 'linear');
                
                setTimeout(() => {
                    Sound.stopAll();
                    finish(winnerName, finalRot);
                }, 3500);
            }, 4500);
        }
    }

    function finish(winnerName, finalRot) {
        State.isSpinning = false;
        State.currentRotation = finalRot;
        UI.enableBtn(true);
        UI.setResult(winnerName);
        Sound.play('result');
    }

    // ▼▼▼ 修正: グローバルな右クリックメニューは「禁止（なにもしない）」 ▼▼▼
    window.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        // ここではメニューを表示しない！
    });
}