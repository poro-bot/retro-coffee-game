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
  const startBtn = $('#startGame');
  const currentScore = $('#currentScore');
  const currentBest = $('#currentBest');
  const dialogTitle = $('#dialogTitle');
  const directionControls = $('#directionControls');
  const pongControls = $('#pongControls');
  const keyboardHint = $('#keyboardHint');
  const soundToggle = $('#soundToggle');

  const COLORS = {
    bg: '#101510',
    grid: 'rgba(241,226,200,.055)',
    cream: '#f1e2c8',
    muted: '#786d5a',
    accent: '#d28b52',
    green: '#8fb996',
    dark: '#1b2019'
  };

  const GAME_INFO = {
    snake: {
      title: 'Coffee Snake',
      intro: 'Збирай зерна та не торкайся країв або власного хвоста.',
      hint: 'Клавіатура: стрілки або WASD'
    },
    catcher: {
      title: 'Bean Catcher',
      intro: 'Рухай чашку й лови зерна. Після трьох промахів гра завершується.',
      hint: 'Клавіатура: ← → або A / D'
    },
    memory: {
      title: 'Coffee Memory',
      intro: 'Відкривай картки по дві та знайди всі однакові пари.',
      hint: 'Натискай на картки'
    },
    pong: {
      title: 'Espresso Pong',
      intro: 'Відбивай зерно платформою. Кожен удар додає очко та трохи швидкості.',
      hint: 'Клавіатура: ← → або A / D'
    }
  };

  let activeGame = null;
  let running = false;
  let rafId = null;
  let intervalId = null;
  let soundOn = false;
  let audioCtx = null;

  const storageKey = (game) => `retroCoffeeBest:${game}`;
  const getBest = (game) => localStorage.getItem(storageKey(game));
  const setBest = (game, value) => localStorage.setItem(storageKey(game), String(value));

  function bestValue(game) {
    const raw = getBest(game);
    if (raw == null) return game === 'memory' ? null : 0;
    return Number(raw);
  }

  function refreshBestLabels() {
    ['snake', 'catcher', 'pong'].forEach(game => {
      $(`#best-${game}`).textContent = bestValue(game) || 0;
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
    soundToggle.textContent = `SOUND: ${soundOn ? 'ON' : 'OFF'}`;
    if (soundOn) beep(520, .06, .035);
  });

  $('#year').textContent = new Date().getFullYear();
  $('#scrollToGames').addEventListener('click', () => $('#games').scrollIntoView({ behavior: 'smooth' }));

  $$('[data-open-game]').forEach(btn => {
    btn.addEventListener('click', () => openGame(btn.dataset.openGame));
  });

  function clearGameRuntime() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    if (intervalId) clearInterval(intervalId);
    rafId = null;
    intervalId = null;
    memoryBoard.innerHTML = '';
    memoryBoard.hidden = true;
    canvas.hidden = false;
    directionControls.hidden = true;
    pongControls.hidden = true;
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
    overlay.hidden = false;
    currentScore.textContent = game === 'memory' ? '0 MOVES' : '0';
    const best = bestValue(game);
    currentBest.textContent = game === 'memory' ? (best ? `${best} MOVES` : '—') : (best || 0);
    keyboardHint.textContent = info.hint;
    if (game === 'snake') directionControls.hidden = false;
    if (game === 'pong') pongControls.hidden = false;
    if (!dialog.open) dialog.showModal();
    drawIdleFrame(game);
  }

  function closeGame() {
    clearGameRuntime();
    if (dialog.open) dialog.close();
    activeGame = null;
  }

  $('#closeGame').addEventListener('click', closeGame);
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
  });

  function showGameOver({ kicker = 'GAME OVER', title = 'Ще раз?', text = '', button = 'RETRY' } = {}) {
    running = false;
    overlayKicker.textContent = kicker;
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    startBtn.textContent = button;
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
    ctx.fillText(game === 'memory' ? 'FLIP THE CARDS' : 'INSERT COIN', size / 2, size * .78);

    if (game === 'snake') {
      const u = size / 18;
      ctx.fillStyle = COLORS.green;
      [[6,9],[7,9],[8,9],[9,9],[9,8]].forEach(([x,y], idx) => roundedRect(x*u+2, y*u+2, u-4, u-4, u*.18, idx === 0 ? COLORS.cream : COLORS.green));
      drawBean(12.5*u, 8.5*u, u*.32);
    } else if (game === 'catcher') {
      drawCup(size*.5, size*.65, size*.19);
      drawBean(size*.42, size*.33, size*.035);
      drawBean(size*.58, size*.22, size*.035);
    } else if (game === 'pong') {
      drawBean(size*.52, size*.43, size*.04);
      roundedRect(size*.36, size*.69, size*.28, size*.035, 8, COLORS.cream);
    }
  }

  function roundedRect(x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
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
    ctx.strokeStyle = '#6f4328';
    ctx.lineWidth = Math.max(1, r * .16);
    ctx.beginPath();
    ctx.moveTo(-r * .12, -r * .75);
    ctx.quadraticCurveTo(r * .35, 0, -r * .08, r * .75);
    ctx.stroke();
    ctx.restore();
  }

  function drawCup(cx, cy, width) {
    const h = width * .52;
    ctx.fillStyle = COLORS.cream;
    ctx.beginPath();
    ctx.roundRect(cx - width/2, cy - h/2, width, h, width*.08);
    ctx.fill();
    ctx.strokeStyle = COLORS.cream;
    ctx.lineWidth = Math.max(2, width*.06);
    ctx.beginPath();
    ctx.arc(cx + width*.53, cy - h*.02, width*.17, -Math.PI/2, Math.PI/2);
    ctx.stroke();
    ctx.fillStyle = '#4b2f22';
    ctx.beginPath();
    ctx.ellipse(cx, cy - h*.34, width*.34, h*.11, 0, 0, Math.PI*2);
    ctx.fill();
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
        text: `Результат: ${s.score}. ${improved ? 'Новий рекорд збережено.' : 'Ще одна спроба?'}`
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
      roundedRect(p.x*u + u*.12, p.y*u + u*.12, u*.76, u*.76, u*.18, i === 0 ? COLORS.cream : COLORS.green);
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
            text: `Результат: ${s.score}. Пропущено 3 зерна.`
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

  // Swipe / touch movement on catcher and pong canvases
  let dragStartX = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (activeGame === 'catcher' || activeGame === 'pong') {
      dragStartX = e.clientX;
      canvas.setPointerCapture?.(e.pointerId);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (dragStartX == null) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    if (activeGame === 'catcher' && catcherState) catcherState.cupX = Math.max(.13, Math.min(.87, x));
    if (activeGame === 'pong' && pongState) pongState.paddleX = Math.max(.12, Math.min(.88, x));
  });
  canvas.addEventListener('pointerup', () => dragStartX = null);
  canvas.addEventListener('pointercancel', () => dragStartX = null);

  // -------------------- MEMORY --------------------
  let memoryState = null;
  const memorySymbols = ['☕','◆','◉','✦','▣','♬','★','△'];
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
          button: 'PLAY AGAIN'
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
        text: `Відбиттів: ${s.score}. ${improved ? 'Новий рекорд збережено.' : 'Ще одна спроба?'}`
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

  $$('[data-pong]').forEach(btn => {
    const value = btn.dataset.pong === 'left' ? -1 : 1;
    btn.addEventListener('pointerdown', e => { e.preventDefault(); if (pongState) pongState.move = value; });
    btn.addEventListener('pointerup', () => { if (pongState) pongState.move = 0; });
    btn.addEventListener('pointercancel', () => { if (pongState) pongState.move = 0; });
    btn.addEventListener('pointerleave', () => { if (pongState) pongState.move = 0; });
  });

  // -------------------- KEYBOARD --------------------
  const keyState = new Set();
  window.addEventListener('keydown', (e) => {
    if (!dialog.open) return;
    const k = e.key.toLowerCase();
    if (['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d',' '].includes(k)) e.preventDefault();
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
  });

  window.addEventListener('resize', () => {
    if (!dialog.open || activeGame === 'memory') return;
    if (running) {
      if (activeGame === 'snake') drawSnake();
      if (activeGame === 'catcher') drawCatcher();
      if (activeGame === 'pong') drawPong();
    } else if (activeGame) drawIdleFrame(activeGame);
  });

  refreshBestLabels();
})();
