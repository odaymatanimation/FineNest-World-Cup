const tapButton = document.getElementById('tapToPlay');
const gameModal = document.getElementById('gameModal');
const modalClose = document.getElementById('modalClose');
const canvas = document.getElementById('catchGame');
const ctx = canvas.getContext('2d');
const confettiCanvas = document.getElementById('confettiCanvas');
const confettiCtx = confettiCanvas.getContext('2d');
const overlay = document.getElementById('gameOverlay');
const handleCard = document.getElementById('handleCard');
const resultCard = document.getElementById('resultCard');
const handleInput = document.getElementById('handleInput');
const handleError = document.getElementById('handleError');
const confirmHandle = document.getElementById('confirmHandle');
const playAgain = document.getElementById('playAgain');
const scoreValue = document.getElementById('scoreValue');
const livesValue = document.getElementById('livesValue');
const bestValue = document.getElementById('bestValue');
const playerLabel = document.getElementById('playerLabel');
const leaderboardList = document.getElementById('leaderboardList');
const resultTitle = document.getElementById('resultTitle');
const resultText = document.getElementById('resultText');
const ballImage = new Image();
const bucketImage = new Image();
const bgMusic = document.getElementById('bgMusic');

ballImage.src = 'assets/ball-finest.png';
bucketImage.src = 'assets/bucket.png';
if (bgMusic) {
  bgMusic.loop = true;
  bgMusic.volume = 0.48;
}

function playBackgroundMusic() {
  if (!bgMusic) return;
  bgMusic.loop = true;
  bgMusic.dataset.status = 'requested';
  const playAttempt = bgMusic.play();
  if (playAttempt && typeof playAttempt.then === 'function') {
    playAttempt
      .then(() => { bgMusic.dataset.status = 'playing'; })
      .catch((error) => { bgMusic.dataset.status = error?.name || 'blocked'; });
  }
}

const storageKey = 'fineNestChallengeScoresLive';
const scoresApiPath = '/.netlify/functions/scores';
let scores = loadScores();
let scoresOnline = false;
let currentHandle = '';
let newBestCelebrated = false;
let confettiPieces = [];
let confettiFrame = 0;

const BASE_BALL_SPEED = 2.35;
const SPEED_GAIN = 0.11;
const SNAIL_INTERVAL = 30;

const game = {
  running: false,
  frame: 0,
  width: 900,
  height: 520,
  bucketX: 450,
  bucketY: 360,
  bucketWidth: 170,
  bucketHeight: 170,
  ballX: 120,
  ballY: -100,
  ballSize: 72,
  speed: BASE_BALL_SPEED,
  dropType: 'ball',
  nextDropType: 'ball',
  nextSnailScore: SNAIL_INTERVAL,
  snailMessageFrame: 0,
  score: 0,
  lives: 3,
  left: false,
  right: false,
  pointer: false
};

function normalizeHandle(value) {
  const raw = String(value || '').trim().replace(/\s+/g, '').replace(/^@+/, '').replace(/[^a-zA-Z0-9._-]/g, '');
  return raw ? '@' + raw.slice(0, 23) : '';
}

function normalizeScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(999999, Math.floor(score)));
}

function normalizeScores(list) {
  const byHandle = new Map();
  (Array.isArray(list) ? list : []).forEach((item) => {
    const handle = normalizeHandle(item?.handle);
    const score = normalizeScore(item?.score);
    if (!handle || score <= 0) return;
    const dateValue = Number(item?.date);
    const date = Number.isFinite(dateValue) ? dateValue : Date.now();
    const key = handle.toLowerCase();
    const existing = byHandle.get(key);
    if (!existing || score > existing.score || (score === existing.score && date > existing.date)) {
      byHandle.set(key, { handle, score, date });
    }
  });
  return Array.from(byHandle.values()).sort((a, b) => b.score - a.score || a.date - b.date).slice(0, 10);
}

function loadScores() {
  try {
    return normalizeScores(JSON.parse(localStorage.getItem(storageKey) || '[]'));
  } catch {
    return [];
  }
}

function saveScores() {
  localStorage.setItem(storageKey, JSON.stringify(scores.slice(0, 10)));
}

function bestScore() {
  return scores[0]?.score || 0;
}

function renderLeaderboard() {
  bestValue.textContent = bestScore();
  leaderboardList.innerHTML = '';
  const list = scores.slice(0, 5);
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    const label = document.createElement('span');
    label.textContent = 'No player yet';
    const score = document.createElement('strong');
    score.textContent = '0';
    li.append(label, score);
    leaderboardList.appendChild(li);
    return;
  }
  list.forEach((item) => {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = item.handle;
    const date = document.createElement('small');
    date.textContent = new Date(item.date).toLocaleDateString();
    label.appendChild(date);
    const score = document.createElement('strong');
    score.textContent = item.score;
    li.append(label, score);
    leaderboardList.appendChild(li);
  });
}

function upsertLocalScore(handle, score, date = Date.now()) {
  scores = normalizeScores([...scores, { handle, score, date }]);
  saveScores();
  renderLeaderboard();
}

async function loadPublicScores() {
  try {
    const response = await fetch(scoresApiPath, {
      headers: { accept: 'application/json' },
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('Score board unavailable');
    const data = await response.json();
    scores = normalizeScores(data.scores);
    scoresOnline = true;
    saveScores();
  } catch {
    scoresOnline = false;
  }
  renderLeaderboard();
  updateHud();
}

function updateHud() {
  scoreValue.textContent = game.score;
  livesValue.textContent = game.lives;
  bestValue.textContent = bestScore();
  playerLabel.textContent = currentHandle || '-';
}

function imageHeightRatio(image, fallback) {
  return image.naturalWidth && image.naturalHeight ? image.naturalHeight / image.naturalWidth : fallback;
}

function fitBucketToStage() {
  const ratio = imageHeightRatio(bucketImage, 1.08);
  const targetWidth = Math.max(128, Math.min(220, game.width * 0.22));
  const maxHeight = Math.max(140, game.height * 0.34);
  let width = targetWidth;
  let height = width * ratio;

  if (height > maxHeight) {
    height = maxHeight;
    width = height / ratio;
  }

  game.bucketWidth = width;
  game.bucketHeight = height;
  game.bucketY = game.height - game.bucketHeight - 14;
  game.bucketX = Math.min(Math.max(game.bucketX, game.bucketWidth / 2), game.width - game.bucketWidth / 2);
}

function resizeGame() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  game.width = Math.max(320, Math.floor(rect.width || 900));
  game.height = Math.max(360, Math.floor(rect.height || 520));
  canvas.width = Math.floor(game.width * dpr);
  canvas.height = Math.floor(game.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  confettiCanvas.width = canvas.width;
  confettiCanvas.height = canvas.height;
  confettiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fitBucketToStage();
  game.ballSize = Math.max(59, Math.min(90, game.width * 0.0935));
  drawGame();
}

function dropWidth() {
  return game.dropType === 'snail' ? game.ballSize * 1.38 : game.ballSize;
}

function dropHeight() {
  return game.dropType === 'snail' ? game.ballSize * 0.54 : game.ballSize;
}

function resetBall(type = game.nextDropType || 'ball') {
  game.dropType = type;
  game.nextDropType = 'ball';
  const width = dropWidth();
  const height = dropHeight();
  const margin = Math.max(game.ballSize * 0.7, width * 0.55);
  game.ballX = margin + Math.random() * (game.width - margin * 2);
  game.ballY = -height - Math.random() * 140;
}

function drawBackground() {
  ctx.clearRect(0, 0, game.width, game.height);
  const grad = ctx.createLinearGradient(0, 0, 0, game.height);
  grad.addColorStop(0, '#f9c01d');
  grad.addColorStop(1, '#eda407');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, game.width, game.height);
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#000';
  for (let x = 48; x < game.width; x += 96) ctx.fillRect(x, 0, 2, game.height);
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0,0,0,.16)';
  ctx.fillRect(0, game.height - 12, game.width, 12);
}

function drawSnail() {
  const w = dropWidth();
  const h = dropHeight();
  const x = game.ballX - w / 2;
  const y = game.ballY + game.ballSize * 0.2;
  ctx.save();
  ctx.lineWidth = Math.max(3, game.ballSize * 0.045);
  ctx.strokeStyle = '#050505';
  ctx.fillStyle = '#ffd12b';
  ctx.beginPath();
  ctx.roundRect(x, y + h * 0.28, w * 0.86, h * 0.48, h * 0.2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f7b512';
  ctx.beginPath();
  ctx.arc(x + w * 0.35, y + h * 0.34, h * 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + w * 0.7, y + h * 0.32);
  ctx.lineTo(x + w * 0.84, y + h * 0.02);
  ctx.moveTo(x + w * 0.78, y + h * 0.34);
  ctx.lineTo(x + w * 0.94, y + h * 0.08);
  ctx.stroke();
  ctx.fillStyle = '#050505';
  ctx.beginPath();
  ctx.arc(x + w * 0.84, y + h * 0.02, Math.max(3, h * 0.07), 0, Math.PI * 2);
  ctx.arc(x + w * 0.94, y + h * 0.08, Math.max(3, h * 0.07), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSpeedResetNotice() {
  ctx.save();
  ctx.globalAlpha = Math.min(1, game.snailMessageFrame / 30);
  ctx.fillStyle = '#050505';
  ctx.fillRect(game.width / 2 - 106, 18, 212, 38);
  ctx.fillStyle = '#f7b512';
  ctx.font = '700 20px Arial Narrow, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SPEED RESET', game.width / 2, 38);
  ctx.restore();
}

function drawGame() {
  drawBackground();
  if (game.dropType === 'snail') {
    drawSnail();
  } else if (ballImage.complete && ballImage.naturalWidth) {
    ctx.drawImage(ballImage, game.ballX - game.ballSize / 2, game.ballY, game.ballSize, game.ballSize);
  }
  if (game.snailMessageFrame > 0) drawSpeedResetNotice();
  const bucketLeft = game.bucketX - game.bucketWidth / 2;
  if (bucketImage.complete && bucketImage.naturalWidth) {
    ctx.drawImage(bucketImage, bucketLeft, game.bucketY, game.bucketWidth, game.bucketHeight);
  }
}

function clearConfetti() {
  confettiPieces = [];
  cancelAnimationFrame(confettiFrame);
  confettiCtx.clearRect(0, 0, game.width, game.height);
}

function enterPlayFullscreen() {
  gameModal.classList.add('playing-fullscreen');
  if (!document.fullscreenElement && gameModal.requestFullscreen) {
    gameModal.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  }
  if (screen.orientation?.lock) {
    screen.orientation.lock('portrait').catch(() => {});
  }
  setTimeout(resizeGame, 160);
}

function exitPlayFullscreen() {
  gameModal.classList.remove('playing-fullscreen');
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
  if (screen.orientation?.unlock) {
    try { screen.orientation.unlock(); } catch {}
  }
  setTimeout(resizeGame, 120);
}

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && !game.running) {
    gameModal.classList.remove('playing-fullscreen');
  }
  resizeGame();
});

function setHandleScreen() {
  gameModal.classList.remove('playing-fullscreen');
  overlay.classList.remove('hidden');
  handleCard.hidden = false;
  resultCard.hidden = true;
  handleError.textContent = '';
  handleInput.value = currentHandle || '';
  stopGame();
  clearConfetti();
  updateHud();
  resizeGame();
}

function openModal() {
  playBackgroundMusic();
  gameModal.classList.add('is-open');
  gameModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  setHandleScreen();
  requestAnimationFrame(() => {
    resizeGame();
    handleInput.focus();
  });
}

function closeModal() {
  stopGame();
  exitPlayFullscreen();
  clearConfetti();
  gameModal.classList.remove('is-open');
  gameModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}


function startGame() {
  playBackgroundMusic();
  currentHandle = normalizeHandle(handleInput.value);
  if (!currentHandle) {
    handleError.textContent = 'Please enter your social handle.';
    return;
  }
  overlay.classList.add('hidden');
  handleCard.hidden = true;
  resultCard.hidden = true;
  enterPlayFullscreen();
  game.running = true;
  game.score = 0;
  game.lives = 3;
  game.speed = BASE_BALL_SPEED;
  game.dropType = 'ball';
  game.nextDropType = 'ball';
  game.nextSnailScore = SNAIL_INTERVAL;
  game.snailMessageFrame = 0;
  game.bucketX = game.width / 2;
  newBestCelebrated = false;
  clearConfetti();
  resizeGame();
  resetBall();
  updateHud();
  cancelAnimationFrame(game.frame);
  game.frame = requestAnimationFrame(loop);
}

function stopGame() {
  game.running = false;
  cancelAnimationFrame(game.frame);
}

async function saveResult() {
  const score = normalizeScore(game.score);
  if (score <= 0) return { saved: false, newBest: false, online: scoresOnline };

  const previousBest = bestScore();
  const date = Date.now();
  upsertLocalScore(currentHandle, score, date);

  try {
    const response = await fetch(scoresApiPath, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ handle: currentHandle, score, date })
    });
    if (!response.ok) throw new Error('Score save unavailable');
    const data = await response.json();
    scores = normalizeScores(data.scores);
    scoresOnline = true;
    saveScores();
    renderLeaderboard();
    return {
      saved: true,
      newBest: Boolean(data.newBest ?? score > previousBest),
      online: true
    };
  } catch {
    scoresOnline = false;
    renderLeaderboard();
    return { saved: true, newBest: score > previousBest, online: false };
  }
}

async function endGame() {
  stopGame();
  exitPlayFullscreen();
  overlay.classList.remove('hidden');
  handleCard.hidden = true;
  resultCard.hidden = false;
  resultTitle.textContent = 'Saving score...';
  resultText.textContent = 'Checking the Finest Players Board.';
  updateHud();

  const result = await saveResult();
  resultTitle.textContent = result.newBest ? 'New high score!' : 'Every supporter counts.';
  if (result.saved && result.online) {
    resultText.textContent = 'Score ' + game.score + ' saved online for ' + currentHandle + '.';
  } else if (result.saved) {
    resultText.textContent = 'Score ' + game.score + ' saved on this browser. The public board will update when the online score server is available.';
  } else {
    resultText.textContent = 'Score 0 recorded. Catch at least one ball to enter the Finest Players Board.';
  }
  if (result.newBest && !newBestCelebrated) burstConfetti();
  updateHud();
}

function loop() {
  if (!game.running) return;
  if (game.left) game.bucketX -= Math.max(7, game.width * 0.012);
  if (game.right) game.bucketX += Math.max(7, game.width * 0.012);
  game.bucketX = Math.min(Math.max(game.bucketX, game.bucketWidth / 2), game.width - game.bucketWidth / 2);
  const activeSpeed = game.dropType === 'snail' ? Math.max(1.8, BASE_BALL_SPEED * 0.86) : game.speed;
  game.ballY += activeSpeed;

  const bucketLeft = game.bucketX - game.bucketWidth / 2;
  const bucketRight = game.bucketX + game.bucketWidth / 2;
  const catchTop = game.bucketY + game.bucketHeight * 0.05;
  const catchBottom = game.bucketY + game.bucketHeight * 0.55;
  const dropBottom = game.ballY + dropHeight();
  const caught = dropBottom >= catchTop && dropBottom <= catchBottom && game.ballX > bucketLeft + 8 && game.ballX < bucketRight - 8;

  if (caught) {
    if (game.dropType === 'snail') {
      game.speed = BASE_BALL_SPEED;
      game.snailMessageFrame = 110;
    } else {
      game.score += 1;
      game.speed += SPEED_GAIN;
      if (game.score >= game.nextSnailScore) {
        game.nextDropType = 'snail';
        game.nextSnailScore += SNAIL_INTERVAL;
      }
      if (game.score > bestScore() && !newBestCelebrated) {
        newBestCelebrated = true;
        burstConfetti();
      }
    }
    resetBall();
    updateHud();
  } else if (game.ballY > game.height + 12) {
    if (game.dropType === 'snail') {
      resetBall();
    } else {
      game.lives -= 1;
      updateHud();
      if (game.lives <= 0) {
        drawGame();
        endGame();
        return;
      }
      resetBall();
    }
  }

  if (game.snailMessageFrame > 0) game.snailMessageFrame -= 1;
  drawGame();
  game.frame = requestAnimationFrame(loop);
}

function bucketFromPointer(event) {
  const rect = canvas.getBoundingClientRect();
  game.bucketX = Math.min(Math.max(event.clientX - rect.left, game.bucketWidth / 2), game.width - game.bucketWidth / 2);
  if (!game.running) drawGame();
}

function burstConfetti() {
  confettiPieces = Array.from({ length: 130 }, () => ({
    x: game.width / 2,
    y: game.height * 0.28,
    vx: (Math.random() - 0.5) * 9,
    vy: Math.random() * -8 - 3,
    g: 0.22,
    size: Math.random() * 8 + 5,
    rot: Math.random() * 6,
    color: ['#e2002f', '#f7b512', '#02835f', '#ffffff', '#050505'][Math.floor(Math.random() * 5)]
  }));
  cancelAnimationFrame(confettiFrame);
  animateConfetti();
}

function animateConfetti() {
  confettiCtx.clearRect(0, 0, game.width, game.height);
  confettiPieces.forEach((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.g;
    p.rot += 0.16;
    confettiCtx.save();
    confettiCtx.translate(p.x, p.y);
    confettiCtx.rotate(p.rot);
    confettiCtx.fillStyle = p.color;
    confettiCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.62);
    confettiCtx.restore();
  });
  confettiPieces = confettiPieces.filter((p) => p.y < game.height + 30);
  if (confettiPieces.length) confettiFrame = requestAnimationFrame(animateConfetti);
}

tapButton.addEventListener('pointerdown', playBackgroundMusic, { passive: true });
tapButton.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') playBackgroundMusic();
});
tapButton.addEventListener('click', openModal);
modalClose.addEventListener('click', closeModal);
gameModal.addEventListener('click', (event) => {
  if (event.target === gameModal) closeModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && gameModal.classList.contains('is-open')) closeModal();
  if (event.key === 'ArrowLeft') game.left = true;
  if (event.key === 'ArrowRight') game.right = true;
});
document.addEventListener('keyup', (event) => {
  if (event.key === 'ArrowLeft') game.left = false;
  if (event.key === 'ArrowRight') game.right = false;
});
confirmHandle.addEventListener('click', startGame);
playAgain.addEventListener('click', setHandleScreen);
handleInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') startGame();
});
canvas.addEventListener('pointerdown', (event) => {
  canvas.setPointerCapture(event.pointerId);
  game.pointer = true;
  bucketFromPointer(event);
});
canvas.addEventListener('pointermove', (event) => {
  if (game.pointer || event.buttons) bucketFromPointer(event);
});
canvas.addEventListener('pointerup', () => {
  game.pointer = false;
});
canvas.addEventListener('pointercancel', () => {
  game.pointer = false;
});

let videoTouched = false;
function activateVideo(name) {
  document.querySelectorAll('[data-video]').forEach((button) => button.classList.toggle('active', button.dataset.video === name));
  document.querySelectorAll('[data-panel]').forEach((panel) => {
    const active = panel.dataset.panel === name;
    panel.classList.toggle('active', active);
    const video = panel.querySelector('video');
    if (!active && video) video.pause();
  });
}
document.querySelectorAll('[data-video]').forEach((button) => {
  button.addEventListener('click', () => {
    videoTouched = true;
    activateVideo(button.dataset.video);
  });
});
function syncVideo() {
  if (!videoTouched) activateVideo(window.innerWidth < 680 ? 'mobile' : 'web');
}
window.addEventListener('resize', () => {
  syncVideo();
  if (gameModal.classList.contains('is-open')) resizeGame();
});

Promise.all([
  new Promise((resolve) => { ballImage.onload = resolve; ballImage.onerror = resolve; }),
  new Promise((resolve) => { bucketImage.onload = resolve; bucketImage.onerror = resolve; })
]).then(() => {
  renderLeaderboard();
  updateHud();
  syncVideo();
  loadPublicScores();
});
