'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

// Paleta suavizada usada por el skin "pastel" (mismo índice que COLORS).
const PASTEL_COLORS = [
  null,
  '#aee7ef', // I
  '#ffe9b8', // O
  '#ddb8e3', // T
  '#c2e6c0', // S
  '#f2bcbc', // Z
  '#bcc4ea', // J
  '#ffd9b0', // L
];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');
const recordsListEl = document.getElementById('records-list');
const overlayRecordsListEl = document.getElementById('overlay-records-list');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const nameEntryEl = document.getElementById('name-entry');
const playerNameInput = document.getElementById('player-name');
const saveRecordBtn = document.getElementById('save-record-btn');

const THEME_KEY = 'tetris-theme';
const SKIN_KEY = 'tetris-skin';
const HIGHSCORES_KEY = 'tetris-highscores';
const MAX_RECORDS = 5;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let theme, gridColor;
let skin = 'retro';
let combo, comboMax;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    combo++;
    comboMax = Math.max(comboMax, combo);
    updateHUD();
  } else {
    combo = 0;
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function roundedRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.globalAlpha = alpha ?? 1;
  const px = x * size + 1;
  const py = y * size + 1;
  const w = size - 2;
  const h = size - 2;

  if (skin === 'neon') {
    const color = COLORS[colorIndex];
    context.shadowBlur = 14;
    context.shadowColor = color;
    context.fillStyle = color;
    context.fillRect(px, py, w, h);
    context.shadowBlur = 0;
    context.strokeStyle = 'rgba(255,255,255,0.5)';
    context.lineWidth = 1;
    context.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
  } else if (skin === 'pastel') {
    const color = PASTEL_COLORS[colorIndex];
    const radius = Math.max(2, size * 0.2);
    const stripH = h * 0.4;
    roundedRectPath(context, px, py, w, h, radius);
    context.fillStyle = color;
    context.fill();
    roundedRectPath(context, px, py, w, stripH, Math.min(radius, stripH / 2));
    context.fillStyle = 'rgba(255,255,255,0.4)';
    context.fill();
  } else if (skin === 'pixel-art') {
    const color = COLORS[colorIndex];
    context.fillStyle = color;
    context.fillRect(px, py, w, h);
    const half = w / 2;
    context.fillStyle = 'rgba(0,0,0,0.18)';
    context.fillRect(px, py, half, half);
    context.fillRect(px + half, py + half, w - half, h - half);
    context.fillStyle = 'rgba(255,255,255,0.18)';
    context.fillRect(px + half, py, w - half, half);
    context.fillRect(px, py + half, half, h - half);
  } else {
    // retro (por defecto)
    const color = COLORS[colorIndex];
    context.fillStyle = color;
    context.fillRect(px, py, w, h);
    context.fillStyle = 'rgba(255,255,255,0.12)';
    context.fillRect(px, py, w, 4);
  }

  context.globalAlpha = 1;
  context.shadowBlur = 0;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (skin === 'neon') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (skin === 'neon') {
    nextCtx.fillStyle = '#000000';
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  }
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function loadHighscores() {
  try {
    const raw = localStorage.getItem(HIGHSCORES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.filter(r => r && typeof r.score === 'number' && typeof r.name === 'string');
  } catch {
    return [];
  }
}

function saveHighscores(list) {
  try {
    localStorage.setItem(HIGHSCORES_KEY, JSON.stringify(list));
  } catch {
    // storage unavailable/full (e.g. private browsing) — record stays session-only
  }
}

function qualifiesForHighscore(value) {
  const list = loadHighscores();
  if (list.length < MAX_RECORDS) return value > 0;
  return value > list[list.length - 1].score;
}

function addHighscore(record) {
  const list = loadHighscores();
  list.push(record);
  list.sort((a, b) => b.score - a.score);
  list.splice(MAX_RECORDS);
  saveHighscores(list);
  return list;
}

function bestComboAllTime(list) {
  return list.reduce((m, r) => Math.max(m, r.combo || 0), 0);
}

function maxLinesAllTime(list) {
  return list.reduce((m, r) => Math.max(m, r.lines || 0), 0);
}

function renderRecordsList(el, list, highlightId) {
  el.innerHTML = '';
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'records-empty';
    li.textContent = 'Sin récords aún';
    el.appendChild(li);
    return;
  }
  list.forEach(r => {
    const li = document.createElement('li');
    li.className = 'records-item';
    if (r.id === highlightId) li.classList.add('records-item--new');
    const name = document.createElement('span');
    name.className = 'records-name';
    name.textContent = r.name;
    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'records-score';
    scoreSpan.textContent = r.score.toLocaleString();
    li.appendChild(name);
    li.appendChild(scoreSpan);
    el.appendChild(li);
  });
}

function renderRecords(highlightId) {
  const list = loadHighscores();
  renderRecordsList(recordsListEl, list, highlightId);
  renderRecordsList(overlayRecordsListEl, list, highlightId);
  bestComboEl.textContent = bestComboAllTime(list);
  maxLinesEl.textContent = maxLinesAllTime(list);
}

function submitRecord() {
  const name = playerNameInput.value.trim() || 'Jugador';
  const record = {
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    name,
    score,
    lines,
    combo: comboMax,
    date: new Date().toISOString(),
  };
  addHighscore(record);
  nameEntryEl.classList.add('hidden');
  renderRecords(record.id);
}

function resetRecords() {
  localStorage.removeItem(HIGHSCORES_KEY);
  renderRecords();
}

function applyTheme(value) {
  theme = value;
  document.documentElement.dataset.theme = theme;
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid-line').trim();
  themeToggleBtn.textContent = theme === 'light' ? '☀️ Claro' : '🌙 Oscuro';
  themeToggleBtn.setAttribute('aria-pressed', theme === 'light');
}

function toggleTheme() {
  applyTheme(theme === 'light' ? 'dark' : 'light');
  localStorage.setItem(THEME_KEY, theme);
}

const SKIN_NAMES = ['retro', 'neon', 'pastel', 'pixel-art'];

function applySkin(value) {
  skin = SKIN_NAMES.includes(value) ? value : 'retro';
  if (skinSelect) skinSelect.value = skin;
}

function changeSkin(value) {
  applySkin(value);
  localStorage.setItem(SKIN_KEY, skin);
  // Re-renderiza de inmediato, sin esperar al siguiente frame del loop
  // (necesario si el juego está en pausa o en game over).
  if (current) draw();
  if (next) drawNext();
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  renderRecords();
  overlayRecordsListEl.classList.remove('hidden');
  if (qualifiesForHighscore(score)) {
    nameEntryEl.classList.remove('hidden');
    playerNameInput.value = '';
    setTimeout(() => playerNameInput.focus(), 0);
  } else {
    nameEntryEl.classList.add('hidden');
  }
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  combo = 0;
  comboMax = 0;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  nameEntryEl.classList.add('hidden');
  overlayRecordsListEl.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
themeToggleBtn.addEventListener('click', toggleTheme);
if (skinSelect) skinSelect.addEventListener('change', e => changeSkin(e.target.value));
resetRecordsBtn.addEventListener('click', resetRecords);
saveRecordBtn.addEventListener('click', submitRecord);
playerNameInput.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    submitRecord();
  }
});

applyTheme(localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark');
applySkin(localStorage.getItem(SKIN_KEY) || 'retro');
renderRecords();
init();
