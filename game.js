/* 五球点球挑战 — DSH Game Studio 的单 Canvas 入口。 */
(function () {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const title = (window.GAME && window.GAME.title) || '五球点球挑战';
  const world = { w: 390, h: 760 };
  const spot = { x: 195, y: 612 };
  const goal = { left: 81, right: 309, top: 273, bottom: 368 };
  const totalShots = 5;
  const feedbackTime = 0.72;
  const button = { x: 29, y: 662, w: 332, h: 55 };
  const colors = {
    night: '#08161f', white: '#f4f5e9', mint: '#d6f888',
    muted: '#a3bdb8', deep: '#102730', orange: '#ffc37c', rose: '#ffa599',
  };
  const outcomes = {
    goal: { text: '进球', color: colors.mint },
    save: { text: '扑救', color: colors.orange },
    miss: { text: '射偏', color: colors.rose },
  };
  const font = '"PingFang SC", "Microsoft YaHei", sans-serif';
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const smoothstep = t => t * t * (3 - 2 * t);

  let phase = 'title';
  let stage = 'ready';
  let score = 0;
  let attempts = 0;
  let results = [];
  let gesture = null;
  let shot = null;
  let keeperTime = 0;
  let sceneTime = 0;
  let stageTime = 0;
  let nextReadyIn = 0;
  let preview = null;
  let cssWidth, cssHeight, scale, dpr, offsetX, offsetY, hudY;
  let lastTime;
  let fps = 0;
  let frameCount = 0;
  let frameTime = 0;

  function emitPhase() {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ source: 'dsh-game-studio', type: 'state', phase, score }, '*');
    }
  }

  function startRound() {
    phase = 'playing';
    stage = 'ready';
    stageTime = 0;
    score = 0;
    attempts = 0;
    results = [];
    gesture = null;
    shot = null;
    keeperTime = 0;
    preview = null;
    nextReadyIn = 0;
    emitPhase();
  }

  function resize() {
    cssWidth = window.innerWidth || canvas.clientWidth || world.w;
    cssHeight = window.innerHeight || canvas.clientHeight || world.h;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';
    canvas.style.touchAction = 'none';
    scale = Math.min(cssWidth / world.w, cssHeight / world.h);
    offsetX = (cssWidth - world.w * scale) / 2;
    offsetY = (cssHeight - world.h * scale) / 2;
    const safe = window.__wxSafeArea || (window.GAME && window.GAME.safeArea);
    hudY = Math.max(64, ((safe && safe.topHudY || 88) - offsetY) / scale + 5);
    cancelGesture();
  }

  function toWorld(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - offsetX) / scale,
      y: (event.clientY - rect.top - offsetY) / scale,
    };
  }

  function insideButton(p) {
    return p.x >= button.x && p.x <= button.x + button.w &&
      p.y >= button.y && p.y <= button.y + button.h;
  }

  function getAim(dx, dy) {
    const distance = Math.hypot(dx, dy);
    if (dy > -15 || distance < 20) return null;
    const power = clamp((distance - 20) / 130, 0, 1);
    return {
      x: clamp(spot.x + dx / -dy * 208, -42, 432),
      y: power < 0.15 ? mix(455, 370, power / 0.15) : mix(370, 284, (power - 0.15) / 0.85),
      power,
    };
  }

  function cancelGesture() {
    gesture = null;
    preview = null;
  }

  canvas.addEventListener('pointerdown', event => {
    if (gesture || (event.button != null && event.button !== 0)) return;
    const p = toWorld(event);
    if (phase === 'title' || stage === 'final') {
      if (!insideButton(p)) return;
      gesture = { id: event.pointerId, start: p, button: true };
    } else {
      if (stage !== 'ready' || p.x < 10 || p.x > 380 || p.y < 462 || p.y > 725) return;
      gesture = { id: event.pointerId, start: p, button: false };
    }
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
    }
    event.preventDefault();
  });

  canvas.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.id || gesture.button) return;
    const p = toWorld(event);
    preview = getAim(p.x - gesture.start.x, p.y - gesture.start.y);
    event.preventDefault();
  });

  canvas.addEventListener('pointerup', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const p = toWorld(event);
    const { start, button: pressedButton } = gesture;
    cancelGesture();
    if (pressedButton) {
      if (insideButton(p) && Math.hypot(p.x - start.x, p.y - start.y) < 22) startRound();
    } else {
      const aim = getAim(p.x - start.x, p.y - start.y);
      if (aim) kick(aim);
    }
    event.preventDefault();
  });

  function cancelPointer(event) {
    if (gesture && event.pointerId === gesture.id) cancelGesture();
  }
  canvas.addEventListener('pointercancel', cancelPointer);
  canvas.addEventListener('lostpointercapture', cancelPointer);
  window.addEventListener('blur', cancelGesture);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelGesture();
      lastTime = undefined;
    }
  });
  document.addEventListener('keydown', event => {
    if (!event.repeat && event.key === 'Enter' && (phase === 'title' || stage === 'final')) startRound();
  });

  function keeperAtRest() {
    const step = Math.sin(keeperTime * 7);
    return {
      x: spot.x + Math.sin(keeperTime * 2.15) * 39,
      y: 327 + Math.abs(step) * 2,
      lean: Math.cos(keeperTime * 2.15) * 0.085,
      reach: 0,
      step,
    };
  }

  function kick(aim) {
    if (stage !== 'ready' || phase !== 'playing' || attempts === totalShots) return;
    const keeper = keeperAtRest();
    const guess = aim.x + Math.sin(attempts * 2.4 + keeperTime * 1.5) * 19;
    shot = {
      ...aim,
      age: 0,
      duration: mix(0.63, 0.32, aim.power),
      keeperStart: keeper.x,
      keeperStartY: keeper.y,
      keeperStartLean: keeper.lean,
      keeperStartStep: keeper.step,
      keeperTarget: clamp(guess, goal.left + 25, goal.right - 25),
      result: null,
    };
    attempts++;
    stage = 'flight';
    stageTime = 0;
  }

  function divingKeeper() {
    const travel = Math.max(0, Math.min(shot.age, shot.duration) - 0.105);
    const direction = Math.sign(shot.keeperTarget - shot.keeperStart);
    const movement = Math.min(Math.abs(shot.keeperTarget - shot.keeperStart), travel * 187);
    const reach = clamp(travel / 0.20, 0, 1);
    const landing = shot.result ? smoothstep(clamp((feedbackTime - nextReadyIn) / 0.44, 0, 1)) : 0;
    return {
      x: shot.keeperStart + (movement + landing * reach * 6) * direction,
      y: mix(shot.keeperStartY, 327, reach) -
        clamp((327 - shot.y) * 0.30, 0, 14) * reach + landing * reach * 13,
      lean: mix(shot.keeperStartLean, direction * 0.44, reach) + direction * landing * reach * 0.14,
      reach,
      step: shot.keeperStartStep * (1 - reach) + direction * reach,
    };
  }

  function keeperTouchesBall(keeper) {
    const dx = shot.x - keeper.x;
    const dy = shot.y - (keeper.y - 8);
    return Math.hypot(dx / 33, dy / 39) <= 1;
  }

  function insideGoal(aim) {
    const radius = 8;
    return aim.x - radius > goal.left && aim.x + radius < goal.right &&
      aim.y - radius > goal.top && aim.y + radius < goal.bottom;
  }

  function resolveShot() {
    shot.result = !insideGoal(shot) ? 'miss' : keeperTouchesBall(divingKeeper()) ? 'save' : 'goal';
    score += Number(shot.result === 'goal');
    results.push(shot.result);
    stage = 'feedback';
    stageTime = 0;
    nextReadyIn = feedbackTime;
  }

  function update(dt) {
    sceneTime += dt;
    stageTime += dt;
    if (phase !== 'playing') return;
    if (stage === 'ready') {
      keeperTime += dt;
    } else if (stage === 'flight') {
      shot.age += dt;
      if (shot.age >= shot.duration) resolveShot();
    } else if (stage === 'feedback') {
      nextReadyIn -= dt;
      if (nextReadyIn > 0) return;
      stageTime = 0;
      if (attempts === totalShots) {
        stage = 'final';
        phase = score > 0 ? 'won' : 'lost';
        emitPhase();
      } else {
        shot = null;
        stage = 'ready';
      }
    }
  }

  function polygon(g, points, fill, stroke, width = 1) {
    g.beginPath();
    g.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i][0], points[i][1]);
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = width; g.stroke(); }
  }

  function line(g, points, color, width) {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i][0], points[i][1]);
    g.stroke();
  }

  function ellipse(g, x, y, rx, ry, fill, border, width = 1) {
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (border) { g.strokeStyle = border; g.lineWidth = width; g.stroke(); }
  }

  function panel(x, y, w, h, r, fill, border) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (border) {
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function label(text, x, y, size, color, align = 'center', weight = 700) {
    ctx.font = weight + ' ' + size + 'px ' + font;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function gradient(g, x, y, x2, y2, stops) {
    const paint = g.createLinearGradient(x, y, x2, y2);
    for (const [offset, color] of stops) paint.addColorStop(offset, color);
    return paint;
  }

  function glow(x, y, radius, color) {
    const paint = ctx.createRadialGradient(x, y, 1, x, y, radius);
    paint.addColorStop(0, color);
    paint.addColorStop(1, 'rgba(0,0,0,0)');
    ellipse(ctx, x, y, radius, radius, paint);
  }

  const fans = Array.from({ length: 232 }, (_, i) => {
    const row = Math.floor(i / 29);
    const column = i % 29;
    const x = -5 + column * 14 + ((i * 191 % 13) - 6) * 0.7;
    const y = 264 + row * 7 + Math.cos((x - 195) / 210 * Math.PI / 2) * 25 + (i * 337 % 11) / 3;
    return { x, y, color: ['#344e50', '#456868', '#60847d', '#547b83', '#899576'][i * 113 % 17 % 5] };
  });

  function drawFloodlight() {
    const beam = gradient(ctx, 63, 228, 172, 386, [
      [0, 'rgba(220,251,250,0.23)'], [1, 'rgba(134,228,224,0)'],
    ]);
    polygon(ctx, [[29, 212], [68, 204], [286, 403], [34, 414]], beam);
    glow(48, 216, 86, 'rgba(177,239,241,0.20)');
    glow(48, 216, 40, 'rgba(208,254,243,0.34)');
    line(ctx, [[38, 218], [35, 306]], '#4a696b', 1.5);
    line(ctx, [[37, 219], [55, 232], [88, 304]], '#29474c', 1);
    ctx.translate(49, 215);
    ctx.rotate(-0.15);
    panel(-25, -9, 50, 18, 4, '#426269', '#8da6a3');
    panel(-21, -6, 42, 12, 3, '#cbe5db');
    for (let i = 0; i < 6; i++) panel(-19 + i * 6.6, -4, 5, 8, 1, '#fafde2');
  }

  function drawStadium() {
    ctx.fillStyle = gradient(ctx, 0, 174, 0, 455, [
      [0, colors.night], [0.43, '#193b48'], [0.70, '#244c4f'], [1, '#142b32'],
    ]);
    ctx.fillRect(0, 169, world.w, 290);
    glow(195, 310, 163, 'rgba(147,201,162,0.17)');

    ctx.beginPath();
    ctx.moveTo(0, 247);
    ctx.quadraticCurveTo(195, 311, 390, 247);
    ctx.lineTo(390, 384);
    ctx.lineTo(0, 384);
    ctx.closePath();
    ctx.fillStyle = gradient(ctx, 0, 250, 0, 385, [[0, '#1b3943'], [1, '#102b30']]);
    ctx.fill();
    for (let i = 0; i < 7; i++) {
      const y = 250 + i * 13;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.quadraticCurveTo(195, y + 61 - i * 4, 390, y);
      ctx.strokeStyle = i === 0 ? '#557373' : 'rgba(142,196,185,0.17)';
      ctx.lineWidth = i === 0 ? 1.8 : 1;
      ctx.stroke();
    }
    for (const { x, y, color } of fans) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1.8, 2);
    }
    for (const flip of [false, true]) {
      ctx.save();
      if (flip) { ctx.translate(world.w, 0); ctx.scale(-1, 1); }
      polygon(ctx, [[0, 341], [78, 349], [85, 364], [0, 361]], '#0d222a', '#345558');
      line(ctx, [[1, 344], [77, 352]], '#799c92', 1.5);
      for (let i = 0; i < 7; i++) {
        const x = 5 + i * 11;
        line(ctx, [[x, 347 + i], [x + 5, 348 + i]], i % 3 === 0 ? '#c0da92' : '#43706e', 2);
      }
      drawFloodlight();
      ctx.restore();
    }

    const turf = gradient(ctx, 0, 349, 0, 750, [
      [0, '#386e53'], [0.24, '#35674b'], [0.57, '#285339'], [1, '#112e2b'],
    ]);
    ctx.fillStyle = turf;
    ctx.fillRect(0, 366, world.w, 394);
    const bands = [368, 381, 393, 414, 443, 482, 536, 610, 709, 760];
    for (let i = 0; i < bands.length - 1; i += 2) {
      ctx.fillStyle = 'rgba(183,218,134,0.073)';
      ctx.fillRect(0, bands[i], world.w, bands[i + 1] - bands[i]);
    }
    ctx.fillStyle = gradient(ctx, 0, 0, 390, 0, [
      [0, 'rgba(9,30,23,0.3)'], [0.50, 'rgba(9,30,23,0)'], [1, 'rgba(9,30,23,0.3)'],
    ]);
    ctx.fillRect(0, 366, world.w, 394);

    ctx.beginPath();
    for (let i = 0; i < 325; i++) {
      const spread = (i * 137 % 503) / 503;
      const x = (i * 257 % 997) / 997 * 390;
      const y = 369 + spread * spread * 385;
      ctx.moveTo(x, y);
      ctx.lineTo(x + 0.5 + spread * 1.7, y - spread);
    }
    ctx.strokeStyle = 'rgba(213,236,166,0.26)';
    ctx.lineWidth = 0.6;
    ctx.stroke();

    const marking = 'rgba(235,251,211,0.46)';
    line(ctx, [[0, 369], [390, 369]], 'rgba(236,252,206,0.6)', 1.5);
    line(ctx, [[-24, 543], [48, 369]], marking, 1.5);
    line(ctx, [[414, 543], [342, 369]], marking, 1.5);
    line(ctx, [[73, 369], [50, 426], [340, 426], [317, 369]], marking, 1.6);
    line(ctx, [[101, 369], [90, 396], [300, 396], [289, 369]], marking, 1.25);
    ctx.beginPath();
    ctx.moveTo(125, 426);
    ctx.bezierCurveTo(141, 466, 249, 466, 265, 426);
    ctx.strokeStyle = marking;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ellipse(ctx, spot.x, spot.y + 14, 5, 2.5, 'rgba(233,252,212,0.67)');

    ctx.fillStyle = gradient(ctx, 0, 625, 0, 759, [
      [0, 'rgba(8,22,31,0)'], [0.70, 'rgba(8,22,31,0.90)'], [1, colors.night],
    ]);
    ctx.fillRect(0, 625, world.w, 135);
  }

  function drawNet() {
    const { left, right, top, bottom } = goal;
    const rear = { left: left + 24, right: right - 24, top: top + 13, bottom: bottom - 14 };
    const impact = shot && shot.result === 'goal' ? Math.max(0, 1 - stageTime * 2.5) : 0;
    ellipse(ctx, 195, bottom + 6, 132, 9, 'rgba(3,18,21,0.32)');
    polygon(ctx, [[left, top], [right, top], [right, bottom], [left, bottom]], 'rgba(6,29,35,0.48)');
    polygon(ctx, [[rear.left, rear.top], [rear.right, rear.top], [rear.right, rear.bottom], [rear.left, rear.bottom]],
      gradient(ctx, 0, rear.top, 0, rear.bottom, [[0, 'rgba(8,25,34,0.47)'], [1, 'rgba(44,82,70,0.44)']]));
    line(ctx, [[left, bottom], [rear.left, rear.bottom], [rear.left, rear.top], [rear.right, rear.top],
      [rear.right, rear.bottom], [right, bottom]], '#608c82', 1.45);
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      const x = mix(left, right, t);
      const backX = mix(rear.left, rear.right, t);
      const wave = impact ? impact * Math.sin(x * 0.079 - stageTime * 30) * Math.max(0, 6 - Math.abs(x - shot.x) / 15) : 0;
      line(ctx, [[x, top], [backX, rear.top], [backX + wave, rear.bottom], [x, bottom]],
        i % 3 ? 'rgba(199,229,206,0.32)' : 'rgba(213,239,211,0.48)', 0.65);
    }
    for (let i = 0; i <= 7; i++) {
      const t = i / 7;
      const y = mix(top, bottom, t);
      const backY = mix(rear.top, rear.bottom, t);
      line(ctx, [[left, y], [rear.left, backY], [rear.right, backY], [right, y]],
        'rgba(207,236,216,0.43)', i % 3 ? 0.65 : 0.9);
    }
    line(ctx, [[left, bottom], [right, bottom]], '#a6c8ad', 1.8);
  }

  function drawGoalFrame() {
    const { left, right, top, bottom } = goal;
    const path = [[left, bottom], [left, top], [right, top], [right, bottom]];
    line(ctx, path.map(([x, y]) => [x + 2.5, y + 2]), '#142f33', 9.5);
    line(ctx, path, gradient(ctx, 0, top - 5, 0, bottom,
      [[0, '#f8f6dc'], [0.56, '#d0e6d6'], [1, '#9fc3af']]), 6.3);
    line(ctx, [[left - 1.3, bottom - 3], [left - 1.3, top - 0.9], [right - 1, top - 0.9]], '#ffffed', 1.4);
  }

  function paintKeeper(g, reach, step = 0) {
    const side = Math.sign(step);
    const stride = Math.abs(step) * 1.8;
    for (const foot of [-1, 1]) {
      const extension = foot === side ? reach * 6 : -reach * 3;
      const y = 28 - foot * step * 3 - reach * 1.7;
      const ankle = foot * (15 + stride + extension);
      line(g, [[foot * 7, 6], [foot * (11 + extension / 2), 17], [ankle, y]], '#152733', 9.2);
      line(g, [[foot * (11 + extension / 2), 19], [ankle, y - 2]], '#748b80', 4.7);
      line(g, [[ankle - 4, y], [ankle + 5, y - 0.6]], '#142834', 6.7);
      line(g, [[ankle - 4, y + 1.3], [ankle + 5, y + 0.7]], '#dbedc4', 1.6);
    }

    for (const hand of [-1, 1]) {
      const longReach = hand === side ? reach : reach * 0.53;
      const handX = hand * (26 + 10 * longReach);
      const handY = -12 - longReach * 15 - hand * step * 1.6;
      const arm = [[hand * 10, -14], [hand * 20, -7 - longReach * 7], [handX, handY]];
      line(g, arm, '#202d34', 9.6);
      line(g, arm, '#bb6732', 7.2);
      line(g, [arm[0], arm[1]], '#efab60', 6.9);
      ellipse(g, handX, handY, 5.6, 6.6, '#e9f1d9', '#24393d', 1.4);
      line(g, [[handX - 2.5, handY + 2.7], [handX + 2.5, handY + 2.7]], '#9bb6a7', 1.15);
    }

    const jersey = gradient(g, -12, -20, 14, 13, [
      [0, '#ffdc91'], [0.49, '#f6a14d'], [1, '#c86e38'],
    ]);
    polygon(g, [[-10, -20], [10, -20], [16, -13], [11, 8], [6, 12], [-8, 12], [-13, 8], [-16, -12]],
      jersey, '#583a2b', 1.5);
    line(g, [[-12, -13], [-9, 4], [-5, 9]], 'rgba(255,231,163,0.72)', 1.4);
    line(g, [[9, -11], [6, 6]], 'rgba(162,75,43,0.48)', 1.7);
    line(g, [[-6, -18], [0, -15.5], [6, -18]], '#8b4f35', 1.9);
    line(g, [[-5, 1], [5, 1]], '#ffe1a5', 1.5);
    ellipse(g, 0, -26.5, 8.3, 10.3, '#dba579', '#292832', 1.45);
    polygon(g, [[-8.8, -25], [-9.7, -31.7], [-5.8, -36], [2.6, -37.3], [8.7, -33.3],
      [8.9, -26.3], [5.6, -30.3], [-1.3, -28.4], [-4.7, -30]], '#27323c');
    line(g, [[-5, -33.4], [-1.6, -34.7], [3.5, -34.7]], '#51606a', 1);
    line(g, [[-4.3, -26.5], [-2.2, -26.1]], '#603d34', 1.2);
    line(g, [[2, -26.4], [4.2, -26.9]], '#603d34', 1.2);
    line(g, [[-1.4, -21.9], [2.2, -21.9]], '#936045', 0.9);
  }

  function drawKeeper() {
    const keeper = shot ? divingKeeper() : keeperAtRest();
    ellipse(ctx, keeper.x, 357, 22 + keeper.reach * 6, 4.5, 'rgba(4,22,23,0.40)');
    ctx.save();
    ctx.translate(keeper.x, keeper.y);
    ctx.rotate(keeper.lean);
    paintKeeper(ctx, keeper.reach, keeper.step);
    ctx.restore();
  }

  const ballPanels = Array.from({ length: 5 }, (_, i) => {
    const angle = i * Math.PI * 2 / 5 - Math.PI / 2;
    return [Math.cos(angle), Math.sin(angle)];
  });

  function paintBall(g, radius) {
    const shading = g.createRadialGradient(-radius * 0.31, -radius * 0.43, 1, 0, 0, radius * 1.04);
    shading.addColorStop(0, '#ffffff');
    shading.addColorStop(0.71, '#f3fff7');
    shading.addColorStop(1, '#9cbab3');
    ellipse(g, 0, 0, radius, radius, shading, '#133036', radius * 0.075);
    g.save();
    g.clip();
    for (const [x, y] of ballPanels) {
      line(g, [[x * radius * 0.35, y * radius * 0.35], [x * radius, y * radius]], '#819793', radius * 0.06);
      ellipse(g, x * radius * 0.99, y * radius * 0.99, radius * 0.22, radius * 0.25, '#19353a');
    }
    polygon(g, ballPanels.map(([x, y]) => [x * radius * 0.37, y * radius * 0.37]), '#17353a');
    g.restore();
  }

  function ballAt(aim, progress) {
    return {
      x: mix(spot.x, aim.x, progress),
      y: mix(spot.y, aim.y, progress) - Math.sin(progress * Math.PI) * (12 + aim.power * 14),
      radius: mix(17, 8, progress),
    };
  }

  function drawAim() {
    if (!preview) return;
    const inside = insideGoal(preview);
    const color = inside ? colors.mint : colors.orange;
    const dots = 11;
    ctx.save();
    for (let i = 1; i <= dots; i++) {
      const t = 0.11 + i / dots * 0.77;
      const p = ballAt(preview, t);
      ctx.globalAlpha = 0.22 + t * 0.75;
      const r = 1.3 + i / dots * 0.8 + preview.power * 0.5;
      ellipse(ctx, p.x, p.y, r, r, color);
    }
    ctx.globalAlpha = 1;
    const x = clamp(preview.x, 11, 379);
    const y = preview.y;
    ellipse(ctx, x, y, 11, 11, 'rgba(4,17,23,0.55)', color, 1.1);
    for (let i = 0; i < 4; i++) {
      const sideX = i < 2 ? -1 : 1;
      const sideY = i % 2 ? -1 : 1;
      line(ctx, [[x + sideX * 10, y + sideY * 15], [x + sideX * 15, y + sideY * 15],
        [x + sideX * 15, y + sideY * 10]], color, 1.55);
    }
    ellipse(ctx, x, y, 2.2, 2.2, color);
    ctx.restore();
  }

  function drawReadyBall() {
    const { x, y } = spot;
    const pulse = (Math.sin(sceneTime * 3.7) + 1) / 2;
    ellipse(ctx, x + 1, y + 16, 25, 6, 'rgba(7,20,22,0.66)');
    const ring = gesture ? 25 : 26 + pulse * 3;
    ellipse(ctx, x, y + 4, ring, ring * 0.78,
      'rgba(17,38,33,0.15)', preview ? 'rgba(224,249,148,0.81)' : 'rgba(217,243,163,0.42)', 1.1);
    if (!gesture) {
      ctx.save();
      ctx.globalAlpha = 0.31 + pulse * 0.40;
      const gy = y - 43 - 4 * pulse;
      line(ctx, [[x - 6, gy], [x, gy - 5], [x + 6, gy]], colors.mint, 1.65);
      ctx.restore();
    }
  }

  function drawBall() {
    if (!shot) drawReadyBall();
    let p = { ...spot, radius: 17 + (preview ? preview.power * 1.4 : 0) };
    let rotation = 0.4;
    if (shot) {
      const t = clamp(shot.age / shot.duration, 0, 1);
      const flight = 1 - Math.pow(1 - t, 1.23);
      p = ballAt(shot, flight);
      rotation += flight * (3 + shot.power * 5);
      if (shot.result) {
        const rebound = clamp((feedbackTime - nextReadyIn) / 0.4, 0, 1);
        if (shot.result === 'save') {
          p.x += Math.sign(shot.x - spot.x || -1) * 31 * rebound;
          p.y += 38 * rebound;
        } else if (shot.result === 'goal') {
          p.y += 8 * rebound;
          p.radius -= 1.6 * rebound;
        } else {
          p.x += (shot.x - spot.x) * 0.18 * rebound;
          p.y += 13 * rebound;
        }
      } else {
        const streak = [];
        for (let i = 5; i >= 0; i--) streak.push(ballAt(shot, Math.max(0, flight - i * 0.044)));
        const tail = streak[0];
        const light = gradient(ctx, tail.x, tail.y + 0.1, p.x, p.y,
          [[0, 'rgba(219,250,172,0)'], [1, 'rgba(231,255,208,0.64)']]);
        line(ctx, streak.map(point => [point.x, point.y]), light, p.radius * 0.97);
        const dust = clamp(t * 2.9, 0, 1);
        if (dust < 1) {
          ctx.save();
          ctx.globalAlpha = (1 - dust) * 0.7;
          for (let i = -2; i <= 2; i++) {
            const x = spot.x + i * (6 + dust * 9);
            const y = spot.y + 14 - dust * (6 + Math.abs(i) * 3);
            line(ctx, [[x, y], [x + i, y - 3]], '#dbe5ac', 1.5);
          }
          ctx.restore();
        }
      }
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(rotation);
    paintBall(ctx, p.radius);
    ctx.restore();
  }

  function outcomeIcon(x, y, name, color) {
    if (name === 'goal') {
      line(ctx, [[x - 4.7, y - 0.1], [x - 1.4, y + 3.6], [x + 5.5, y - 4.1]], color, 1.9);
    } else if (name === 'save') {
      polygon(ctx, [[x - 4.4, y - 4.6], [x + 4.4, y - 4.6], [x + 3.9, y + 1.6],
        [x, y + 5], [x - 3.9, y + 1.6]], null, color, 1.6);
    } else if (name === 'miss') {
      line(ctx, [[x - 3.4, y - 3.4], [x + 3.4, y + 3.4]], color, 1.8);
      line(ctx, [[x - 3.4, y + 3.4], [x + 3.4, y - 3.4]], color, 1.8);
    }
  }

  function mark(x, y, index) {
    const name = results[index];
    const result = outcomes[name];
    const active = phase === 'playing' && index === results.length;
    const r = 12;
    ellipse(ctx, x, y, r, r, active ? colors.mint : '#142a32',
      active ? colors.mint : result ? result.color : '#405853', 1.1);
    if (result) {
      outcomeIcon(x, y, name, result.color);
    } else {
      label(String(index + 1), x, y + 0.4, 11.5, active ? colors.night : colors.muted);
    }
  }

  function drawHeader() {
    if (phase === 'title') {
      label(title, 195, hudY + 31, 40, colors.white, 'center', 800);
      line(ctx, [[176, hudY + 62], [214, hudY + 62]], colors.mint, 2);
      return;
    }
    label(title, 27, hudY + 21, 25, colors.white, 'left', 750);
    const y = hudY + 73;
    panel(26, y - 22, 338, 44, 12, '#112830', '#31494b');
    for (let i = 0; i < totalShots; i++) mark(47 + i * 30, y, i);
    line(ctx, [[192, y - 11], [192, y + 11]], '#385356', 1);
    label('进球', 208, y + 0.3, 12, colors.muted, 'left', 500);
    label(String(score), 314, y + 1, 24, colors.mint, 'right', 800);
    label('/ 5', 350, y + 1, 14, colors.white, 'right', 500);
  }

  function drawButton(text) {
    const { x, y, w, h } = button;
    const pressed = gesture && gesture.button;
    const fill = gradient(ctx, x, y, x, y + h, [
      [0, pressed ? '#c9eb79' : '#e6ffab'],
      [1, pressed ? '#b1d360' : '#c0e871'],
    ]);
    panel(x, y + 3, w, h, 13, '#172f2b');
    panel(x, y, w, h, 13, fill, 'rgba(248,255,217,0.52)');
    label(text, x + w / 2 - 1, y + h / 2, 19, colors.night, 'center', 800);
    line(ctx, [[x + w - 50, y + h / 2], [x + w - 28, y + h / 2]], colors.night, 1.65);
    line(ctx, [[x + w - 34, y + h / 2 - 5], [x + w - 28, y + h / 2],
      [x + w - 34, y + h / 2 + 5]], colors.night, 1.65);
  }

  function drawPowerMeter() {
    const power = preview ? preview.power : 0;
    const height = 7;
    const count = 10;
    const segment = 18;
    const barY = 684;
    label('力度', 70, barY + height / 2, 13, colors.muted, 'left', 600);
    for (let i = 0; i < count; i++) {
      const x = 111 + i * (segment + 3);
      panel(x, barY, segment, height, 2, '#2b4141');
      const fill = clamp(power * count - i, 0, 1);
      if (fill > 0) {
        const width = fill * segment;
        panel(x, barY, width, height, Math.min(2, width / 2), i > 7 ? '#ffe4a0' : colors.mint);
      }
    }
    label(preview ? '松手射门' : '继续向上滑', 195, 710, 12.5, preview ? colors.mint : colors.muted, 'center', 500);
  }

  function drawFooter() {
    if (phase === 'title') {
      label('向上滑动，松手射门', 195, 637, 15, colors.white, 'center', 500);
      drawButton('开始挑战');
      return;
    }
    if (stage !== 'ready') return;
    if (gesture) {
      drawPowerMeter();
    } else {
      label('向球门方向滑动', 195, 675, 16, colors.white, 'center', 700);
      label('滑得越远，射门越有力', 195, 700, 12.5, colors.muted, 'center', 400);
    }
  }

  function drawImpact() {
    if (stage !== 'feedback' || !shot || shot.result === 'miss') return;
    const spread = clamp(stageTime / 0.45, 0, 1);
    if (spread === 1) return;
    const color = outcomes[shot.result].color;
    ctx.save();
    ctx.globalAlpha = (1 - spread) * 0.7;
    ellipse(ctx, shot.x, shot.y, 8 + 38 * spread, 6 + 20 * spread, null, color, 1.2);
    for (let i = 0; i < 9; i++) {
      const angle = i * Math.PI * 2 / 9 + 0.3;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const radius = 10 + spread * (27 + i % 3 * 9);
      line(ctx, [[shot.x + dx * radius, shot.y + dy * radius],
        [shot.x + dx * (radius + 5), shot.y + dy * (radius + 5)]], color, 1.35);
    }
    ctx.restore();
  }

  function drawResult() {
    if (stage === 'feedback') {
      const result = outcomes[shot.result];
      const appear = smoothstep(clamp(stageTime / 0.14, 0, 1));
      ctx.save();
      ctx.globalAlpha = appear;
      ctx.translate(0, (1 - appear) * 10);
      panel(134, 457, 122, 38, 19, '#0d2129', result.color);
      outcomeIcon(157, 476, shot.result, result.color);
      label(result.text, 205, 476, 17, result.color, 'center', 750);
      ctx.restore();
    }
    if (stage === 'final') {
      const reveal = smoothstep(clamp(stageTime / 0.24, 0, 1));
      ctx.fillStyle = 'rgba(5,16,22,' + reveal * 0.45 + ')';
      ctx.fillRect(0, 173, world.w, 587);
      ctx.save();
      ctx.globalAlpha = reveal;
      ctx.translate(0, (1 - reveal) * 8);
      const fill = gradient(ctx, 0, 409, 0, 735, [[0, '#183238'], [0.54, '#112731'], [1, '#0c202b']]);
      panel(15, 409, 360, 325, 24, fill, '#57716b');
      line(ctx, [[177, 411], [213, 411]], colors.mint, 2);
      label('本局结束', 195, 449, 20, colors.white, 'center', 750);
      label('总进球', 195, 481, 12.5, colors.muted, 'center', 500);
      label(String(score), 198, 525, 55, colors.mint, 'right', 800);
      label('/ 5', 208, 534, 22, colors.white, 'left', 600);
      line(ctx, [[33, 565], [357, 565]], '#3a5154', 1);
      results.forEach((result, i) => {
        const x = 67 + i * 64;
        mark(x, 594, i);
        label(outcomes[result].text, x, 624, 12, outcomes[result].color, 'center', 500);
      });
      drawButton('再来一局');
      ctx.restore();
    }
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors.night;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, world.w, world.h);
    ctx.clip();
    drawStadium();
    drawNet();
    drawKeeper();
    drawGoalFrame();
    drawAim();
    drawBall();
    drawImpact();
    drawHeader();
    drawFooter();
    drawResult();
    ctx.restore();
  }

  function frame(now) {
    const dt = lastTime === undefined ? 0 : clamp((now - lastTime) / 1000, 0, 0.05);
    lastTime = now;
    frameCount++;
    frameTime += dt;
    if (frameTime >= 0.5) {
      fps = Math.round(frameCount / frameTime);
      frameCount = 0;
      frameTime = 0;
    }
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  window.__gameState = () => ({
    phase, stage, score, attempts, results: results.slice(), fps,
    hearts: totalShots - attempts, hero: { ...spot }, pickups: [], enemies: [], world: { ...world },
  });

  window.__autoplay = () => {
    if (phase !== 'playing' || stage !== 'ready' || gesture) return;
    const swipes = [[-50, -132], [0, -150], [108, -50], [42, -123], [-52, -138]];
    kick(getAim(...swipes[attempts]));
  };

  window.__renderSlots = (size = 256) => {
    function draw(drawer) {
      const thumb = document.createElement('canvas');
      thumb.width = thumb.height = size;
      const g = thumb.getContext('2d');
      g.translate(size / 2, size / 2);
      drawer(g);
      return thumb.toDataURL('image/png');
    }
    return {
      足球: draw(g => paintBall(g, size * 0.38)),
      门将: draw(g => {
        g.scale(size / 87, size / 87);
        g.translate(0, 4);
        paintKeeper(g, 0);
      }),
    };
  };

  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(frame);
})();
