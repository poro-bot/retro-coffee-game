(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const dialog = $('#gameDialog');
  const canvas = $('#gameCanvas');
  const ctx = canvas.getContext('2d');
  const memoryBoard = $('#memoryBoard');
  const overlay = $('#gameOverlay');
  const overlayKicker = $('#overlayKicker');
  const overlayTitle = $('#overlayTitle');
  const overlayText = $('#overlayText');
  const overlayMascotUse = $('#overlayMascotUse');
  const startBtn = $('#startGame');
  const currentScore = $('#currentScore');
  const currentBest = $('#currentBest');
  const dialogTitle = $('#dialogTitle');
  const gameHomeBtn = $('#gameHomeBtn');
  const directionControls = $('#directionControls');
  const pongControls = $('#pongControls');
  const keyboardHint = $('#keyboardHint');
  const soundToggle = $('#soundToggle');
  const homeMascot = $('#homeMascot');
  const homeMascotUse = $('#homeMascotUse');
  const mascotBubble = $('#mascotBubble');

  const COLORS = {
    bg: '#030a25',
    grid: 'rgba(101,181,255,.075)',
 cream: '#f0ecff',
 muted: '#7088b9',
 accent: '#9b63ff',
 blue: '#65b5ff',
 dark: '#07102f',
 panel: '#0b1640'
  };

  const GAME_INFO = {
    snake: {
      title: 'Coffee Snake',
      intro: 'Збирай зерна. На телефоні керуй свайпами.',
      hint: 'Свайп ← ↑ ↓ → · або кнопки / WASD'
    },
    catcher: {
      title: 'Bean Catcher',
      intro: 'Веди чашку пальцем і лови зерна. Три промахи завершують гру.',
      hint: 'Веди пальцем ← → · або A / D'
    },
    memory: {
      title: 'Coffee Memory',
      intro: 'Відкривай картки тапами та знайди всі однакові пари.',
      hint: 'Тапай по картках'
    },
    pong: {
      title: 'Espresso Pong',
      intro: 'Веди платформу пальцем і не дай зерну впасти.',
      hint: 'Веди пальцем ← → · або кнопки / A / D'
    },
    stack: {
      title: 'Cup Stack',
      intro: 'Тапай у потрібний момент і складай чашки якомога вище.',
      hint: 'Тап по полю · або SPACE / ENTER'
    },
    breakout: {
      title: 'Coffee Breakout',
      intro: 'Рухай платформу пальцем і розбий усі піксельні блоки.',
      hint: 'Веди пальцем ← → · або кнопки / A / D'
    }
  };

  const SCORE_GAMES = ['snake', 'catcher', 'pong', 'stack', 'breakout'];
  let activeGame = null;
  let running = false;
  let rafId = null;
  let intervalId = null;
  let soundOn = false;
  let audioCtx = null;

  const storageKey = (game) => `poroRetroBest:${game}`;
  const getBest = (game) => localStorage.getItem(storageKey(game));
  const setBest = (game, value) => localStorage.setItem(storageKey(game), String(value));

  function bestValue(game) {
    const raw = getBest(game);
    if (raw == null) return game === 'memory' ? null : 0;
    return Number(raw);
  }

  function refreshBestLabels() {
    SCORE_GAMES.forEach(game => {
      const el = $(`#best-${game}`);
      if (el) el.textContent = bestValue(game) || 0;
    });
      const mem = bestValue('memory');
      $('#best-memory').textContent = mem ? `${mem} ход.` : '—';
  }

  function beep(freq = 440, duration = .045, volume = .025) {
    if (!soundOn) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.value = volume;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime + duration);
      osc.stop(audioCtx.currentTime + duration);
    } catch (_) {}
  }

  soundToggle.addEventListener('click', () => {
    soundOn = !soundOn;
    soundToggle.setAttribute('aria-pressed', String(soundOn));
    soundToggle.setAttribute('aria-label', soundOn ? 'Вимкнути звук' : 'Увімкнути звук');
    soundToggle.textContent = `♪ ${soundOn ? 'ON' : 'OFF'}`;
    if (soundOn) beep(520, .06, .035);
  });

    // -------------------- MASCOT --------------------
    const mascotPhrases = ['LET\'S PLAY!', 'COFFEE TIME!', 'HI!', 'ONE MORE?', 'GOOD LUCK!'];
    let mascotTimer = null;

    homeMascot.addEventListener('click', () => {
      clearTimeout(mascotTimer);
      mascotBubble.textContent = mascotPhrases[Math.floor(Math.random() * mascotPhrases.length)];
      homeMascot.classList.remove('is-boop');
      void homeMascot.offsetWidth;
      homeMascot.classList.add('is-boop');
      homeMascotUse.setAttribute('href', '#mascot-happy');
      beep(720, .045, .02);
      mascotTimer = setTimeout(() => {
        homeMascot.classList.remove('is-boop');
        homeMascotUse.setAttribute('href', '#mascot-idle');
      }, 900);
    });

    function setOverlayMood(mood = 'idle') {
      overlay.classList.remove('is-happy', 'is-sad');
      if (mood === 'happy') {
        overlay.classList.add('is-happy');
        overlayMascotUse.setAttribute('href', '#mascot-happy');
      } else if (mood === 'sad') {
        overlay.classList.add('is-sad');
        overlayMascotUse.setAttribute('href', '#mascot-sad');
      } else {
        overlayMascotUse.setAttribute('href', '#mascot-idle');
      }
    }

    // -------------------- OPEN / CLOSE --------------------
    $$('[data-open-game]').forEach(btn => {
      btn.addEventListener('click', () => openGame(btn.dataset.openGame));
    });

    function clearGameRuntime() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      if (intervalId) clearTimeout(intervalId);
      rafId = null;
      intervalId = null;
      memoryBoard.innerHTML = '';
      memoryBoard.hidden = true;
      canvas.hidden = false;
      directionControls.hidden = true;
      pongControls.hidden = true;
      gestureStart = null;
    }

    function openGame(game) {
      clearGameRuntime();
      activeGame = game;
      const info = GAME_INFO[game];
      dialogTitle.textContent = info.title;
      overlayKicker.textContent = 'READY?';
      overlayTitle.textContent = info.title;
      overlayText.textContent = info.intro;
      startBtn.textContent = 'START';
      setOverlayMood('idle');
      overlay.hidden = false;
      currentScore.textContent = game === 'memory' ? '0 MOVES' : '0';
      const best = bestValue(game);
      currentBest.textContent = game === 'memory' ? (best ? `${best} MOVES` : '—') : (best || 0);
      keyboardHint.textContent = info.hint;
      if (game === 'snake') directionControls.hidden = false;
      if (game === 'pong' || game === 'breakout') pongControls.hidden = false;
      if (!dialog.open) dialog.showModal();
      drawIdleFrame(game);
    }

    function closeGame() {
      clearGameRuntime();
      if (dialog.open) dialog.close();
      activeGame = null;
    }

    // Назва гри + стрілка повертають на головний екран.
    gameHomeBtn.addEventListener('click', closeGame);

    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      closeGame();
    });

    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) closeGame();
    });

      startBtn.addEventListener('click', () => {
        if (!activeGame) return;
        overlay.hidden = true;
        if (activeGame === 'snake') startSnake();
        if (activeGame === 'catcher') startCatcher();
        if (activeGame === 'memory') startMemory();
        if (activeGame === 'pong') startPong();
        if (activeGame === 'stack') startStack();
        if (activeGame === 'breakout') startBreakout();
      });

        function showGameOver({ kicker = 'GAME OVER', title = 'Ще раз?', text = '', button = 'RETRY', mood = 'sad' } = {}) {
          running = false;
          overlayKicker.textContent = kicker;
          overlayTitle.textContent = title;
          overlayText.textContent = text;
          startBtn.textContent = button;
          setOverlayMood(mood);
          overlay.hidden = false;
        }

        function updateBest(game, score, lowerIsBetter = false) {
          const prev = bestValue(game);
          const improved = prev == null || (lowerIsBetter ? score < prev : score > prev);
          if (improved) {
            setBest(game, score);
            refreshBestLabels();
          }
          currentBest.textContent = game === 'memory'
          ? `${bestValue(game)} MOVES`
          : bestValue(game);
          return improved;
        }

        // -------------------- DRAW HELPERS --------------------
        function fitCanvas() {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const rect = canvas.getBoundingClientRect();
          const size = Math.max(300, Math.round(rect.width * dpr));
          if (canvas.width !== size || canvas.height !== size) {
            canvas.width = size;
            canvas.height = size;
          }
          return { size, dpr };
        }

        function drawGrid(size, cells = 18) {
          ctx.fillStyle = COLORS.bg;
          ctx.fillRect(0, 0, size, size);
          ctx.strokeStyle = COLORS.grid;
          ctx.lineWidth = 1;
          const step = size / cells;
          for (let i = 1; i < cells; i++) {
            const p = Math.round(i * step) + .5;
            ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
          }
        }

        function drawIdleFrame(game) {
          canvas.hidden = false;
          const { size } = fitCanvas();
          drawGrid(size, 18);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = COLORS.muted;
          ctx.font = `${Math.round(size * .035)}px monospace`;
          ctx.fillText(game === 'memory' ? 'FLIP THE CARDS' : 'INSERT COIN', size / 2, size * .80);

          if (game === 'snake') {
            const u = size / 18;
            [[6,9],[7,9],[8,9],[9,9],[9,8]].forEach(([x,y], idx) => roundedRect(x*u+2, y*u+2, u-4, u-4, u*.18, idx === 0 ? COLORS.cream : COLORS.blue));
            drawBean(12.5*u, 8.5*u, u*.32);
          } else if (game === 'catcher') {
            drawCup(size*.5, size*.65, size*.19);
            drawBean(size*.42, size*.33, size*.035);
            drawBean(size*.58, size*.22, size*.035);
          } else if (game === 'pong') {
            drawBean(size*.52, size*.43, size*.04);
            roundedRect(size*.36, size*.69, size*.28, size*.035, 8, COLORS.cream);
          } else if (game === 'stack') {
            drawCupLayer(size*.5, size*.68, size*.42, size*.085, 0);
            drawCupLayer(size*.48, size*.58, size*.35, size*.085, 1);
            drawCupLayer(size*.53, size*.48, size*.28, size*.085, 2);
          } else if (game === 'breakout') {
            for (let r = 0; r < 3; r++) {
              for (let c = 0; c < 5; c++) {
                roundedRect(size*(.12+c*.16), size*(.18+r*.075), size*.13, size*.045, 2, (r+c)%2 ? COLORS.accent : COLORS.blue);
              }
            }
            drawBean(size*.5, size*.54, size*.032);
            roundedRect(size*.36, size*.69, size*.28, size*.035, 8, COLORS.cream);
          }
        }

        function roundedRect(x, y, w, h, r, fill) {
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
          else ctx.rect(x, y, w, h);
          ctx.fillStyle = fill;
          ctx.fill();
        }

        function drawBean(x, y, r) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(-.55);
          ctx.fillStyle = COLORS.accent;
          ctx.beginPath();
          ctx.ellipse(0, 0, r * 1.25, r, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = COLORS.blue;
          ctx.lineWidth = Math.max(1, r * .16);
          ctx.beginPath();
          ctx.moveTo(-r * .12, -r * .75);
          ctx.quadraticCurveTo(r * .35, 0, -r * .08, r * .75);
          ctx.stroke();
          ctx.restore();
        }

        function drawCup(cx, cy, width) {
          const h = width * .52;
          roundedRect(cx - width/2, cy - h/2, width, h, width*.08, COLORS.cream);
          ctx.strokeStyle = COLORS.cream;
          ctx.lineWidth = Math.max(2, width*.06);
          ctx.beginPath();
          ctx.arc(cx + width*.53, cy - h*.02, width*.17, -Math.PI/2, Math.PI/2);
          ctx.stroke();
          ctx.fillStyle = COLORS.accent;
          ctx.beginPath();
          ctx.ellipse(cx, cy - h*.34, width*.34, h*.11, 0, 0, Math.PI*2);
          ctx.fill();
        }

        function drawCupLayer(cx, cy, width, height, parity = 0) {
          const fill = parity % 2 ? COLORS.accent : COLORS.blue;
          roundedRect(cx - width/2, cy - height/2, width, height, Math.max(2, height*.12), fill);
          ctx.strokeStyle = fill;
          ctx.lineWidth = Math.max(2, height*.18);
          ctx.beginPath();
          ctx.arc(cx + width*.52, cy, height*.40, -Math.PI/2, Math.PI/2);
          ctx.stroke();
          roundedRect(cx - width*.28, cy - height*.25, width*.42, height*.20, 1, COLORS.bg);
        }

        // -------------------- SNAKE --------------------
        let snakeState = null;
        function startSnake() {
          clearGameRuntime();
          directionControls.hidden = false;
          canvas.hidden = false;
          running = true;
          snakeState = {
            cells: 18,
            snake: [{x:8,y:9},{x:7,y:9},{x:6,y:9}],
            dir: {x:1,y:0},
            nextDir: {x:1,y:0},
            food: {x:13,y:9},
            score: 0,
            speed: 150
          };
          currentScore.textContent = '0';
          scheduleSnakeTick();
          drawSnake();
        }

        function scheduleSnakeTick() {
          if (!running || activeGame !== 'snake') return;
          intervalId = setTimeout(() => {
            snakeTick();
            scheduleSnakeTick();
          }, snakeState.speed);
        }

        function snakeTick() {
          const s = snakeState;
          s.dir = s.nextDir;
          const head = { x: s.snake[0].x + s.dir.x, y: s.snake[0].y + s.dir.y };
          const hitWall = head.x < 0 || head.y < 0 || head.x >= s.cells || head.y >= s.cells;
          const hitSelf = s.snake.some(p => p.x === head.x && p.y === head.y);
          if (hitWall || hitSelf) {
            beep(130, .12, .035);
            const improved = updateBest('snake', s.score);
            showGameOver({
              title: improved ? 'NEW HIGH SCORE' : 'Game over',
              text: `Результат: ${s.score}. ${improved ? 'Новий рекорд збережено.' : 'Ще одна спроба?'}`,
              mood: improved ? 'happy' : 'sad'
            });
            return;
          }

          s.snake.unshift(head);
          if (head.x === s.food.x && head.y === s.food.y) {
            s.score += 10;
            currentScore.textContent = s.score;
            beep(620, .04);
            if (s.speed > 72 && s.score % 30 === 0) s.speed -= 8;
            placeSnakeFood();
          } else {
            s.snake.pop();
          }
          drawSnake();
        }

        function placeSnakeFood() {
          const s = snakeState;
          let p;
          do {
            p = { x: Math.floor(Math.random()*s.cells), y: Math.floor(Math.random()*s.cells) };
          } while (s.snake.some(v => v.x === p.x && v.y === p.y));
          s.food = p;
        }

        function drawSnake() {
          const { size } = fitCanvas();
          const s = snakeState;
          drawGrid(size, s.cells);
          const u = size / s.cells;
          s.snake.forEach((p, i) => {
            roundedRect(p.x*u + u*.12, p.y*u + u*.12, u*.76, u*.76, u*.18, i === 0 ? COLORS.cream : COLORS.blue);
          });
          drawBean((s.food.x+.5)*u, (s.food.y+.5)*u, u*.27);
        }

        function setSnakeDir(x, y) {
          if (!snakeState) return;
          const d = snakeState.dir;
          if (d.x + x === 0 && d.y + y === 0) return;
          snakeState.nextDir = {x,y};
        }

        $$('[data-dir]').forEach(btn => btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          const map = { up:[0,-1], down:[0,1], left:[-1,0], right:[1,0] };
          const [x,y] = map[btn.dataset.dir];
          setSnakeDir(x,y);
        }));

        // -------------------- CATCHER --------------------
        let catcherState = null;
        function startCatcher() {
          clearGameRuntime();
          canvas.hidden = false;
          running = true;
          catcherState = {
            score: 0,
            misses: 0,
            cupX: .5,
            move: 0,
            last: performance.now(),
 spawnAt: 0,
 beans: [],
 elapsed: 0
          };
          currentScore.textContent = '0';
          rafId = requestAnimationFrame(catcherLoop);
        }

        function catcherLoop(now) {
          if (!running || activeGame !== 'catcher') return;
          const s = catcherState;
          const dt = Math.min((now - s.last) / 1000, .035);
          s.last = now;
          s.elapsed += dt;
          s.spawnAt -= dt;
          s.cupX = Math.max(.13, Math.min(.87, s.cupX + s.move * dt * .72));
          if (s.spawnAt <= 0) {
            s.beans.push({ x: .1 + Math.random()*.8, y: -.05, vy: .23 + Math.min(.20, s.elapsed*.006) });
            s.spawnAt = Math.max(.36, .78 - s.elapsed*.009) + Math.random()*.2;
          }

          const cupLeft = s.cupX - .12;
          const cupRight = s.cupX + .12;
          for (let i = s.beans.length - 1; i >= 0; i--) {
            const b = s.beans[i];
            b.y += b.vy * dt;
            if (b.y > .79 && b.y < .89 && b.x > cupLeft && b.x < cupRight) {
              s.beans.splice(i, 1);
              s.score += 5;
              currentScore.textContent = s.score;
              beep(700, .035);
            } else if (b.y > 1.02) {
              s.beans.splice(i, 1);
              s.misses++;
              beep(180, .055, .025);
              if (s.misses >= 3) {
                const improved = updateBest('catcher', s.score);
                showGameOver({
                  title: improved ? 'NEW HIGH SCORE' : 'Shift over',
                  text: `Результат: ${s.score}. Пропущено 3 зерна.`,
                  mood: improved ? 'happy' : 'sad'
                });
                return;
              }
            }
          }
          drawCatcher();
          rafId = requestAnimationFrame(catcherLoop);
        }

        function drawCatcher() {
          const { size } = fitCanvas();
          const s = catcherState;
          drawGrid(size, 18);
          s.beans.forEach(b => drawBean(b.x*size, b.y*size, size*.028));
          drawCup(s.cupX*size, size*.86, size*.21);
          ctx.textAlign = 'left';
          ctx.fillStyle = COLORS.muted;
          ctx.font = `${Math.round(size*.033)}px monospace`;
          ctx.fillText(`MISSES ${s.misses}/3`, size*.05, size*.07);
        }

        function catcherMove(v) { if (catcherState) catcherState.move = v; }

        // -------------------- MEMORY --------------------
        let memoryState = null;
        const memorySymbols = ['◆','●','✦','■','♬','★','△','♥'];

        function startMemory() {
          clearGameRuntime();
          canvas.hidden = true;
          memoryBoard.hidden = false;
          running = true;
          const deck = [...memorySymbols, ...memorySymbols]
          .map((symbol, idx) => ({ symbol, id: idx, sort: Math.random() }))
          .sort((a,b) => a.sort-b.sort);
          memoryState = { open: [], matched: 0, moves: 0, locked: false };
          currentScore.textContent = '0 MOVES';

          deck.forEach((card, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'memory-card';
            btn.dataset.index = String(idx);
            btn.dataset.symbol = card.symbol;
            btn.innerHTML = `
            <span class="memory-card-inner front">?</span>
            <span class="memory-card-inner back">${card.symbol}</span>
            `;
            btn.addEventListener('click', () => flipMemory(btn));
            memoryBoard.appendChild(btn);
          });
        }

        function flipMemory(card) {
          const s = memoryState;
          if (!running || s.locked || card.classList.contains('is-open') || card.classList.contains('is-matched')) return;
          card.classList.add('is-open');
          s.open.push(card);
          beep(520, .025, .018);
          if (s.open.length < 2) return;

          s.moves++;
          currentScore.textContent = `${s.moves} MOVES`;
          const [a,b] = s.open;
          if (a.dataset.symbol === b.dataset.symbol) {
            a.classList.add('is-matched');
            b.classList.add('is-matched');
            a.classList.remove('is-open');
            b.classList.remove('is-open');
            s.open = [];
            s.matched += 2;
            beep(760, .055, .025);
            if (s.matched === 16) {
              const improved = updateBest('memory', s.moves, true);
              setTimeout(() => showGameOver({
                kicker: 'COMPLETE',
                title: improved ? 'NEW BEST' : 'Усі пари знайдено',
                text: `${s.moves} ходів. ${improved ? 'Новий найкращий результат.' : 'Спробуєш пройти ще швидше?'}`,
                button: 'PLAY AGAIN',
                mood: 'happy'
              }), 350);
            }
          } else {
            s.locked = true;
            setTimeout(() => {
              a.classList.remove('is-open');
              b.classList.remove('is-open');
              s.open = [];
              s.locked = false;
            }, 620);
          }
        }

        // -------------------- PONG --------------------
        let pongState = null;
        function startPong() {
          clearGameRuntime();
          pongControls.hidden = false;
          canvas.hidden = false;
          running = true;
          pongState = {
            paddleX: .5,
            move: 0,
            ball: { x:.5, y:.48, vx:.24*(Math.random()>.5?1:-1), vy:.30 },
 score: 0,
 last: performance.now()
          };
          currentScore.textContent = '0';
          rafId = requestAnimationFrame(pongLoop);
        }

        function pongLoop(now) {
          if (!running || activeGame !== 'pong') return;
          const s = pongState;
          const dt = Math.min((now-s.last)/1000, .035);
          s.last = now;
          s.paddleX = Math.max(.14, Math.min(.86, s.paddleX + s.move*dt*.72));
          const b = s.ball;
          b.x += b.vx*dt;
          b.y += b.vy*dt;

          if (b.x < .035 && b.vx < 0) { b.x = .035; b.vx *= -1; beep(260,.018,.012); }
          if (b.x > .965 && b.vx > 0) { b.x = .965; b.vx *= -1; beep(260,.018,.012); }
          if (b.y < .035 && b.vy < 0) { b.y = .035; b.vy *= -1; beep(280,.018,.012); }

          const paddleY = .86;
          const paddleHalf = .14;
          if (b.vy > 0 && b.y > paddleY-.035 && b.y < paddleY+.025 && Math.abs(b.x-s.paddleX) < paddleHalf) {
            b.y = paddleY-.04;
            b.vy = -Math.abs(b.vy)*1.025;
            b.vx += (b.x-s.paddleX)*.30;
            b.vx = Math.max(-.58, Math.min(.58, b.vx));
            s.score++;
            currentScore.textContent = s.score;
            beep(640,.03,.02);
          }

          if (b.y > 1.04) {
            const improved = updateBest('pong', s.score);
            showGameOver({
              title: improved ? 'NEW HIGH SCORE' : 'Missed!',
              text: `Відбиттів: ${s.score}. ${improved ? 'Новий рекорд збережено.' : 'Ще одна спроба?'}`,
              mood: improved ? 'happy' : 'sad'
            });
            return;
          }

          drawPong();
          rafId = requestAnimationFrame(pongLoop);
        }

        function drawPong() {
          const { size } = fitCanvas();
          const s = pongState;
          drawGrid(size, 18);
          drawBean(s.ball.x*size, s.ball.y*size, size*.032);
          roundedRect((s.paddleX-.14)*size, .86*size, .28*size, .028*size, 7, COLORS.cream);
          ctx.textAlign = 'center';
          ctx.fillStyle = COLORS.muted;
          ctx.font = `${Math.round(size*.028)}px monospace`;
          ctx.fillText('KEEP THE BEAN ALIVE', size*.5, size*.08);
        }

        // -------------------- CUP STACK --------------------
        let stackState = null;

        function startStack() {
          clearGameRuntime();
          canvas.hidden = false;
          running = true;
          stackState = {
            layers: [{ x:.5, y:.86, w:.48 }],
            moving: { x:.24, y:.76, w:.48, dir:1 },
            score: 0,
            speed: .34,
            last: performance.now()
          };
          currentScore.textContent = '0';
          rafId = requestAnimationFrame(stackLoop);
        }

        function stackLoop(now) {
          if (!running || activeGame !== 'stack') return;
          const s = stackState;
          const dt = Math.min((now-s.last)/1000, .035);
          s.last = now;
          const m = s.moving;
          m.x += m.dir * s.speed * dt;
          const minX = m.w/2 + .035;
          const maxX = 1 - m.w/2 - .035;
          if (m.x <= minX) { m.x = minX; m.dir = 1; }
          if (m.x >= maxX) { m.x = maxX; m.dir = -1; }
          drawStack();
          rafId = requestAnimationFrame(stackLoop);
        }

        function dropStackCup() {
          if (!running || activeGame !== 'stack' || !stackState) return;
          const s = stackState;
          const m = s.moving;
          const prev = s.layers[s.layers.length - 1];
          const left = Math.max(m.x - m.w/2, prev.x - prev.w/2);
          const right = Math.min(m.x + m.w/2, prev.x + prev.w/2);
          const overlap = right - left;

          if (overlap <= .025) {
            beep(120, .12, .04);
            const improved = updateBest('stack', s.score);
            showGameOver({
              title: improved ? 'NEW HIGH SCORE' : 'Tower down!',
              text: `Чашок у вежі: ${s.score}. ${improved ? 'Новий рекорд.' : 'Спробуєш ще?'}`,
              mood: improved ? 'happy' : 'sad'
            });
            return;
          }

          const x = (left + right) / 2;
          const layer = { x, y:m.y, w:overlap };
          s.layers.push(layer);
          s.score++;
          currentScore.textContent = s.score;
          beep(680 + Math.min(260, s.score*18), .035, .022);
          s.speed = Math.min(.68, .34 + s.score*.018);

          let nextY = m.y - .095;
          if (nextY < .16) {
            s.layers.forEach(l => l.y += .095);
            nextY = .16;
          }
          const fromLeft = s.score % 2 === 0;
          s.moving = {
            x: fromLeft ? overlap/2 + .04 : 1 - overlap/2 - .04,
            y: nextY,
            w: overlap,
            dir: fromLeft ? 1 : -1
          };
        }

        function drawStack() {
          const { size } = fitCanvas();
          const s = stackState;
          drawGrid(size, 18);
          ctx.textAlign = 'left';
          ctx.fillStyle = COLORS.muted;
          ctx.font = `${Math.round(size*.030)}px monospace`;
          ctx.fillText('TAP TO DROP', size*.05, size*.07);

          const h = size*.065;
          s.layers.forEach((l, i) => drawCupLayer(l.x*size, l.y*size, l.w*size, h, i));
          drawCupLayer(s.moving.x*size, s.moving.y*size, s.moving.w*size, h, s.layers.length);
        }

        // -------------------- BREAKOUT --------------------
        let breakoutState = null;

        function makeBricks() {
          const bricks = [];
          const rows = 4;
          const cols = 6;
          const w = .125;
          const h = .048;
          const gapX = .018;
          const gapY = .018;
          const totalW = cols*w + (cols-1)*gapX;
          const startX = (1-totalW)/2;
          for (let r=0; r<rows; r++) {
            for (let c=0; c<cols; c++) {
              bricks.push({
                x: startX + c*(w+gapX),
                          y: .13 + r*(h+gapY),
                          w, h,
                          alive: true,
                          parity: (r+c)%2
              });
            }
          }
          return bricks;
        }

        function startBreakout() {
          clearGameRuntime();
          pongControls.hidden = false;
          canvas.hidden = false;
          running = true;
          breakoutState = {
            paddleX: .5,
            move: 0,
            ball: { x:.5, y:.66, vx:.25*(Math.random()>.5?1:-1), vy:-.31 },
 bricks: makeBricks(),
 score: 0,
 last: performance.now()
          };
          currentScore.textContent = '0';
          rafId = requestAnimationFrame(breakoutLoop);
        }

        function breakoutLoop(now) {
          if (!running || activeGame !== 'breakout') return;
          const s = breakoutState;
          const dt = Math.min((now-s.last)/1000, .035);
          s.last = now;
          s.paddleX = Math.max(.14, Math.min(.86, s.paddleX + s.move*dt*.78));
          const b = s.ball;
          b.x += b.vx*dt;
          b.y += b.vy*dt;
          const radius = .022;

          if (b.x < radius && b.vx < 0) { b.x = radius; b.vx *= -1; }
          if (b.x > 1-radius && b.vx > 0) { b.x = 1-radius; b.vx *= -1; }
          if (b.y < radius && b.vy < 0) { b.y = radius; b.vy *= -1; }

          const paddleY = .88;
          const paddleHalf = .14;
          if (b.vy > 0 && b.y > paddleY-.04 && b.y < paddleY+.025 && Math.abs(b.x-s.paddleX) < paddleHalf) {
            b.y = paddleY-.045;
            b.vy = -Math.abs(b.vy)*1.015;
            b.vx += (b.x-s.paddleX)*.32;
            b.vx = Math.max(-.60, Math.min(.60, b.vx));
            beep(610,.025,.018);
          }

          for (const brick of s.bricks) {
            if (!brick.alive) continue;
            if (
              b.x + radius > brick.x &&
              b.x - radius < brick.x + brick.w &&
              b.y + radius > brick.y &&
              b.y - radius < brick.y + brick.h
            ) {
              brick.alive = false;
              b.vy *= -1;
              s.score += 10;
              currentScore.textContent = s.score;
              beep(760,.025,.018);
              break;
            }
          }

          if (s.bricks.every(brick => !brick.alive)) {
            const improved = updateBest('breakout', s.score);
            showGameOver({
              kicker: 'CLEAR!',
              title: improved ? 'NEW HIGH SCORE' : 'Perfect brew!',
              text: `Усі блоки розбиті. Результат: ${s.score}.`,
              button: 'PLAY AGAIN',
              mood: 'happy'
            });
            return;
          }

          if (b.y > 1.05) {
            const improved = updateBest('breakout', s.score);
            showGameOver({
              title: improved ? 'NEW HIGH SCORE' : 'Ball lost!',
              text: `Результат: ${s.score}. ${improved ? 'Новий рекорд.' : 'Ще одна спроба?'}`,
              mood: improved ? 'happy' : 'sad'
            });
            return;
          }

          drawBreakout();
          rafId = requestAnimationFrame(breakoutLoop);
        }

        function drawBreakout() {
          const { size } = fitCanvas();
          const s = breakoutState;
          drawGrid(size, 18);
          s.bricks.forEach(brick => {
            if (!brick.alive) return;
            roundedRect(brick.x*size, brick.y*size, brick.w*size, brick.h*size, 2, brick.parity ? COLORS.accent : COLORS.blue);
          });
          drawBean(s.ball.x*size, s.ball.y*size, size*.030);
          roundedRect((s.paddleX-.14)*size, .88*size, .28*size, .028*size, 7, COLORS.cream);
        }

        // -------------------- TOUCH / POINTER --------------------
        let gestureStart = null;

        canvas.addEventListener('pointerdown', (e) => {
          if (!activeGame) return;
          e.preventDefault();
          gestureStart = { x: e.clientX, y: e.clientY, t: performance.now() };
          canvas.setPointerCapture?.(e.pointerId);

          const rect = canvas.getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width;

          if (activeGame === 'catcher' && catcherState) {
            catcherState.cupX = Math.max(.13, Math.min(.87, x));
          }
          if (activeGame === 'pong' && pongState) {
            pongState.paddleX = Math.max(.14, Math.min(.86, x));
          }
          if (activeGame === 'breakout' && breakoutState) {
            breakoutState.paddleX = Math.max(.14, Math.min(.86, x));
          }
          if (activeGame === 'stack' && stackState && running) {
            dropStackCup();
          }
        });

        canvas.addEventListener('pointermove', (e) => {
          if (!gestureStart) return;
          e.preventDefault();
          const rect = canvas.getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width;
          if (activeGame === 'catcher' && catcherState) catcherState.cupX = Math.max(.13, Math.min(.87, x));
          if (activeGame === 'pong' && pongState) pongState.paddleX = Math.max(.14, Math.min(.86, x));
          if (activeGame === 'breakout' && breakoutState) breakoutState.paddleX = Math.max(.14, Math.min(.86, x));
        });

          canvas.addEventListener('pointerup', (e) => {
            if (!gestureStart) return;
            e.preventDefault();

            if (activeGame === 'snake' && snakeState && running) {
              const dx = e.clientX - gestureStart.x;
              const dy = e.clientY - gestureStart.y;
              const rect = canvas.getBoundingClientRect();
              const threshold = Math.max(18, Math.min(rect.width, rect.height) * .055);
              if (Math.max(Math.abs(dx), Math.abs(dy)) >= threshold) {
                if (Math.abs(dx) > Math.abs(dy)) setSnakeDir(dx > 0 ? 1 : -1, 0);
                else setSnakeDir(0, dy > 0 ? 1 : -1);
              }
            }
            gestureStart = null;
          });

          canvas.addEventListener('pointercancel', () => { gestureStart = null; });

          // -------------------- BUTTON CONTROLS --------------------
          $$('[data-pong]').forEach(btn => {
            const value = btn.dataset.pong === 'left' ? -1 : 1;
            const apply = (v) => {
              if (activeGame === 'pong' && pongState) pongState.move = v;
              if (activeGame === 'breakout' && breakoutState) breakoutState.move = v;
            };
              btn.addEventListener('pointerdown', e => { e.preventDefault(); apply(value); });
              ['pointerup','pointercancel','pointerleave'].forEach(name => btn.addEventListener(name, () => apply(0)));
          });

          // -------------------- KEYBOARD --------------------
          const keyState = new Set();

          window.addEventListener('keydown', (e) => {
            if (!dialog.open) return;
            const k = e.key.toLowerCase();
            if (['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d',' ','enter'].includes(k)) e.preventDefault();
            keyState.add(k);

            if (activeGame === 'snake') {
              if (k === 'arrowup' || k === 'w') setSnakeDir(0,-1);
              if (k === 'arrowdown' || k === 's') setSnakeDir(0,1);
              if (k === 'arrowleft' || k === 'a') setSnakeDir(-1,0);
              if (k === 'arrowright' || k === 'd') setSnakeDir(1,0);
            }
            if (activeGame === 'catcher' && catcherState) {
              if (k === 'arrowleft' || k === 'a') catcherMove(-1);
              if (k === 'arrowright' || k === 'd') catcherMove(1);
            }
            if (activeGame === 'pong' && pongState) {
              if (k === 'arrowleft' || k === 'a') pongState.move = -1;
              if (k === 'arrowright' || k === 'd') pongState.move = 1;
            }
            if (activeGame === 'breakout' && breakoutState) {
              if (k === 'arrowleft' || k === 'a') breakoutState.move = -1;
              if (k === 'arrowright' || k === 'd') breakoutState.move = 1;
            }
            if (activeGame === 'stack' && stackState && running && (k === ' ' || k === 'enter')) {
              if (!e.repeat) dropStackCup();
            }
          });

          window.addEventListener('keyup', (e) => {
            const k = e.key.toLowerCase();
            keyState.delete(k);
            if (activeGame === 'catcher' && catcherState) {
              if (!keyState.has('arrowleft') && !keyState.has('a') && !keyState.has('arrowright') && !keyState.has('d')) catcherMove(0);
            }
            if (activeGame === 'pong' && pongState) {
              if (!keyState.has('arrowleft') && !keyState.has('a') && !keyState.has('arrowright') && !keyState.has('d')) pongState.move = 0;
            }
            if (activeGame === 'breakout' && breakoutState) {
              if (!keyState.has('arrowleft') && !keyState.has('a') && !keyState.has('arrowright') && !keyState.has('d')) breakoutState.move = 0;
            }
          });

          window.addEventListener('resize', () => {
            if (!dialog.open || activeGame === 'memory') return;
            if (running) {
              if (activeGame === 'snake') drawSnake();
              if (activeGame === 'catcher') drawCatcher();
              if (activeGame === 'pong') drawPong();
              if (activeGame === 'stack') drawStack();
              if (activeGame === 'breakout') drawBreakout();
            } else if (activeGame) {
              drawIdleFrame(activeGame);
            }
          });

          refreshBestLabels();
})();
