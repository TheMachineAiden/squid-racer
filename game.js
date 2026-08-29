(() => {
  'use strict';

  const canvas = document.querySelector('#game');
  const c = canvas.getContext('2d');
  const $ = (selector) => document.querySelector(selector);
  const ui = {
    screen: $('#screen'), start: $('#start'), copy: $('#screen-copy'),
    score: $('#score'), lead: $('#lead'), lap: $('#lap'), drift: $('#drift'), pause: $('#pause')
  };
  const W = 720;
  const H = 720;
  const ink = '#0c1c37';
  const paper = '#f6efdf';
  const coral = '#cf3f4b';
  const mint = '#aee8d2';
  const yellow = '#ffc94c';
  const keys = { left: false, right: false, throttle: false, brake: false, drift: false };
  const tokenNames = ['DRIFT 01', 'DRIFT 02', 'DRIFT 03'];
  const checkpoints = ['NORTH TURN', 'EAST TURN', 'SOUTH TURN'];
  const art = new Image();
  art.src = 'assets/lagoon-map.png';
  art.addEventListener('load', draw);

  let state = 'intro';
  let car;
  let pickups = [];
  let score = 0;
  let laps = 0;
  let distance = 0;
  let last = 0;
  let audio;
  let notice = '';
  let gate = 0;

  function reset() {
    car = { x: 180, y: 535, a: -1.57, v: 0, slip: 0 };
    score = 0;
    laps = 0;
    distance = 0;
    notice = '';
    gate = 0;
    pickups = [
      { x: 190, y: 190, label: tokenNames[0] },
      { x: 548, y: 205, label: tokenNames[1] },
      { x: 555, y: 495, label: tokenNames[2] }
    ];
    hud();
  }

  function hud() {
    const padded = String(score).padStart(4, '0');
    ui.score.textContent = padded;
    ui.lead.textContent = padded;
    ui.lap.textContent = `${laps}/3`;
    ui.drift.textContent = car && car.slip > 0.15 ? `+${Math.floor(car.slip * 10)}` : '—';
  }

  function beep(frequency = 180, duration = 0.06, type = 'square', volume = 0.03) {
    if (!audio) return;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + duration);
  }

  function clear() {
    Object.keys(keys).forEach((key) => { keys[key] = false; });
  }

  function start() {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    clear();
    reset();
    state = 'play';
    ui.screen.classList.add('hide');
    ui.pause.hidden = false;
    last = 0;
    beep(300, 0.1, 'triangle', 0.06);
    requestAnimationFrame(loop);
  }

  function end() {
    state = 'over';
    clear();
    ui.screen.querySelector('h2').innerHTML = 'FINISH<br><em>LINE.</em>';
    ui.copy.textContent = 'RACE LOG SAVED // PRIVATE VIEW: 1';
    ui.start.textContent = 'RACE AGAIN →';
    ui.screen.classList.remove('hide');
    ui.pause.hidden = true;
  }

  function onTrack(x, y) {
    const outer = ((x - 360) / 304) ** 2 + ((y - 360) / 264) ** 2 <= 1;
    const inner = ((x - 360) / 151) ** 2 + ((y - 360) / 113) ** 2 < 1;
    return outer && !inner;
  }

  function advanceCheckpoints() {
    if (gate === 0 && car.x < 260 && car.y < 210) {
      gate = 1;
      notice = `CHECKPOINT: ${checkpoints[0]}`;
      beep(440, 0.1, 'triangle', 0.05);
    } else if (gate === 1 && car.x > 485 && car.y < 250) {
      gate = 2;
      notice = `CHECKPOINT: ${checkpoints[1]}`;
      beep(440, 0.1, 'triangle', 0.05);
    } else if (gate === 2 && car.x > 485 && car.y > 465) {
      gate = 3;
      notice = `CHECKPOINT: ${checkpoints[2]}`;
      beep(440, 0.1, 'triangle', 0.05);
    } else if (gate === 3 && car.x < 255 && car.y > 480) {
      laps += 1;
      gate = 0;
      notice = `LAP ${laps} COMPLETE`;
      beep(380, 0.1, 'square', 0.05);
      if (laps >= 3) end();
    }
  }

  function move(dt) {
    const drifting = keys.drift && Math.abs(car.v) > 1.2;
    const turn = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
    car.v += (keys.throttle ? 0.12 : 0) * dt - (keys.brake ? 0.18 : 0) * dt;
    car.v *= onTrack(car.x, car.y) ? 0.985 : 0.94;
    car.v = Math.max(-1.6, Math.min(4.6, car.v));
    car.a += turn * (drifting ? 0.055 : 0.035) * Math.sign(car.v || 1) * dt;
    car.slip = Math.max(0, car.slip + (drifting && turn ? 0.12 : -0.06) * dt);
    const movementAngle = car.a + (drifting ? turn * -0.45 : 0);
    car.x += Math.cos(movementAngle) * car.v * dt;
    car.y += Math.sin(movementAngle) * car.v * dt;
    car.x = Math.max(20, Math.min(700, car.x));
    car.y = Math.max(20, Math.min(700, car.y));
    distance += Math.abs(car.v) * dt;

    for (const pickup of pickups) {
      if (!pickup.got && Math.hypot(pickup.x - car.x, pickup.y - car.y) < 34) {
        pickup.got = true;
        score += 125;
        notice = 'RACE TOKEN +125';
        beep(650, 0.08, 'sine', 0.05);
      }
    }

    advanceCheckpoints();

    if (car.slip > 0.8) {
      score += Math.max(20, Math.floor((car.slip + Math.abs(car.v) * 0.25) * 25));
      car.slip = 0;
      notice = 'CLEAN DRIFT';
      beep(520, 0.05, 'sine', 0.03);
    }
    hud();
  }

  function ellipsePath(rx, ry) {
    c.beginPath();
    c.ellipse(360, 360, rx, ry, 0, 0, Math.PI * 2);
  }

  function drawStartLine() {
    c.save();
    c.translate(176, 538);
    c.rotate(-0.22);
    for (let row = 0; row < 2; row += 1) {
      for (let column = 0; column < 7; column += 1) {
        c.fillStyle = (row + column) % 2 ? paper : yellow;
        c.fillRect(column * 12, row * 12, 12, 12);
      }
    }
    c.restore();
  }

  function track() {
    if (art.complete && art.naturalWidth) c.drawImage(art, 0, 0, W, H);
    else {
      c.fillStyle = '#1d8398';
      c.fillRect(0, 0, W, H);
    }

    c.save();
    c.fillStyle = '#23384de8';
    c.beginPath();
    c.ellipse(360, 360, 304, 264, 0, 0, Math.PI * 2);
    c.ellipse(360, 360, 151, 113, 0, 0, Math.PI * 2);
    c.fill('evenodd');
    c.restore();

    c.strokeStyle = '#e4d6ac';
    c.lineWidth = 7;
    ellipsePath(304, 264);
    c.stroke();
    ellipsePath(151, 113);
    c.stroke();

    c.strokeStyle = paper;
    c.lineWidth = 5;
    c.setLineDash([21, 20]);
    c.lineDashOffset = -distance * 3;
    ellipsePath(225, 187);
    c.stroke();
    c.setLineDash([]);

    drawStartLine();
  }

  function pickup(item) {
    if (item.got) return;
    c.save();
    c.translate(item.x, item.y);
    c.fillStyle = yellow;
    c.fillRect(-42, -17, 84, 34);
    c.strokeStyle = ink;
    c.lineWidth = 4;
    c.strokeRect(-42, -17, 84, 34);
    c.fillStyle = ink;
    c.font = '11px ui-monospace, monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(item.label, 0, 1);
    c.restore();
  }

  function vehicle() {
    c.save();
    c.translate(car.x, car.y);
    c.rotate(car.a);
    if (car.slip > 0.15) {
      c.strokeStyle = '#f6efdf99';
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(-22, -13); c.lineTo(-45, -20);
      c.moveTo(-22, 13); c.lineTo(-45, 20);
      c.stroke();
    }
    c.fillStyle = coral;
    c.beginPath();
    c.moveTo(28, 0); c.lineTo(-18, -19); c.lineTo(-27, 0); c.lineTo(-18, 19);
    c.closePath();
    c.fill();
    c.strokeStyle = ink;
    c.lineWidth = 4;
    c.stroke();
    c.fillStyle = paper;
    c.fillRect(0, -10, 12, 20);
    c.restore();
  }

  function drawNotice() {
    if (state !== 'play' || !notice) return;
    c.fillStyle = `${ink}dd`;
    c.fillRect(96, 18, 528, 36);
    c.fillStyle = paper;
    c.font = '14px ui-monospace, monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(notice, 360, 36);
  }

  function draw() {
    track();
    pickups.forEach(pickup);
    vehicle();
    drawNotice();
  }

  function loop(time) {
    if (state !== 'play') return;
    const dt = Math.max(0, Math.min(2, (time - last) / 16.67 || 1));
    last = time;
    move(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function pause() {
    if (state === 'play') {
      state = 'pause';
      ui.screen.querySelector('h2').textContent = 'PAUSED';
      ui.copy.textContent = 'Take a breath. The next corner is waiting.';
      ui.start.textContent = 'CONTINUE →';
      ui.screen.classList.remove('hide');
    } else if (state === 'pause') {
      state = 'play';
      ui.screen.classList.add('hide');
      last = 0;
      requestAnimationFrame(loop);
    }
  }

  const map = {
    ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
    ArrowUp: 'throttle', w: 'throttle', W: 'throttle', ArrowDown: 'brake', s: 'brake', S: 'brake', ' ': 'drift'
  };

  addEventListener('keydown', (event) => {
    if (map[event.key]) {
      keys[map[event.key]] = true;
      event.preventDefault();
    }
    if ((event.key === 'p' || event.key === 'P' || event.key === 'Escape') && state === 'play') pause();
  }, { passive: false });
  addEventListener('keyup', (event) => {
    if (map[event.key]) keys[map[event.key]] = false;
  });
  addEventListener('blur', clear);
  addEventListener('pagehide', clear);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });

  document.querySelectorAll('[data-control]').forEach((button) => {
    const key = button.dataset.control;
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      keys[key] = true;
    }, { passive: false });
    ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave'].forEach((type) => {
      button.addEventListener(type, (event) => {
        event.preventDefault();
        keys[key] = false;
      }, { passive: false });
    });
  });

  ui.start.onclick = () => state === 'pause' ? pause() : start();
  ui.pause.onclick = pause;
  reset();
  draw();
})();
