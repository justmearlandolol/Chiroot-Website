import eggAudio from './egg.js';

(function () {
  var STAR = 'data:image/png;base64,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';
  var EYES = 'data:image/png;base64,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';
  var root, card, canvas, ctx, label, audio;
  var hostAudio = null, hostWasPlaying = false;
  var open = false, raf = 0, fade = 0, taps = 0, lastTap = 0, parts = [], arcs = [], W = 0, H = 0;

  document.addEventListener('keydown', function (e) {
    if (!e.repeat && e.altKey && e.shiftKey && e.code === 'KeyW') openEgg();
  });

  document.addEventListener('click', function (e) {
    if (!matchMedia('(pointer: coarse)').matches) return;
    var t = e.target.closest ? e.target.closest('#btn-add-open, #empty-add-btn') : null;
    if (!t) return;
    var now = Date.now();
    taps = now - lastTap > 10000 ? 1 : taps + 1;
    lastTap = now;
    if (taps >= 7) {
      taps = 0;
      e.preventDefault();
      e.stopPropagation();
      openEgg();
    }
  }, true);

  function openEgg() {
    if (open) return;
    open = true;
    hostAudio = document.getElementById('audio');
    hostWasPlaying = !!(hostAudio && !hostAudio.paused);
    if (hostWasPlaying) hostAudio.pause();
    if (!root) build();
    clearInterval(fade);
    card.classList.remove('egg-paused');
    label.textContent = 'Pause';
    root.style.display = 'flex';
    audio.volume = 1;
    audio.currentTime = 0;
    audio.play().catch(function () {});
    startFx();
  }

  function closeEgg() {
    if (!open) return;
    open = false;
    if (hostAudio && hostWasPlaying) hostAudio.play().catch(function () {});
    hostWasPlaying = false;
    root.style.display = 'none';
    cancelAnimationFrame(raf);
    clearInterval(fade);
    fade = setInterval(function () {
      if (audio.volume > 0.04) audio.volume = Math.max(0, audio.volume - 0.04);
      else { clearInterval(fade); audio.pause(); audio.volume = 1; }
    }, 40);
  }

  function build() {
    var st = document.createElement('style');
    st.textContent = '.egg-root{position:fixed;inset:0;z-index:2147483646;display:none;align-items:center;justify-content:center;background:rgba(8,9,13,.5);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}' +
      '.egg-canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}' +
      '.egg-card{position:relative;width:min(430px,calc(100vw - 36px));padding:46px 26px 26px;border-radius:16px;text-align:center;color:#fff;background:linear-gradient(150deg,#5b62c4 0%,#454a9b 22%,#2c2e35 60%,#26272c 100%);box-shadow:0 24px 70px rgba(0,0,0,.55);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;animation:eggPop .38s cubic-bezier(.18,1.25,.4,1)}' +
      '@keyframes eggPop{from{transform:scale(.86);opacity:0}to{transform:scale(1);opacity:1}}' +
      '.egg-x{position:absolute;top:14px;right:14px;width:34px;height:34px;border:0;border-radius:8px;background:transparent;color:#e8e9ee;cursor:pointer;display:flex;align-items:center;justify-content:center}' +
      '.egg-x:hover{background:rgba(255,255,255,.09)}' +
      '.egg-logo{display:block;width:96px;height:94px;margin:0 auto 16px;animation:eggSpin 5s linear infinite;filter:drop-shadow(0 6px 18px rgba(126,232,223,.28))}' +
      '.egg-paused .egg-logo{animation-play-state:paused}' +
      '@keyframes eggSpin{to{transform:rotate(360deg)}}' +
      '.egg-title{margin:0 0 8px;font-size:22px;font-weight:700}' +
      '.egg-sub{margin:0 0 24px;font-size:14px;color:#b7bac3}' +
      '.egg-actions{display:flex;gap:12px}' +
      '.egg-btn{flex:1;height:44px;border:0;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px}' +
      '.egg-secondary{background:#3f4147;color:#eceef2}' +
      '.egg-secondary:hover{background:#4a4d54}' +
      '.egg-primary{background:#5865f2;color:#fff}' +
      '.egg-primary:hover{background:#4752d9}' +
      '.egg-card .ic-play{display:none}' +
      '.egg-card.egg-paused .ic-play{display:block}' +
      '.egg-card.egg-paused .ic-pause{display:none}';
    document.head.appendChild(st);
    root = document.createElement('div');
    root.className = 'egg-root';
    root.innerHTML = '<canvas class="egg-canvas"></canvas>' +
      '<div class="egg-card" role="dialog" aria-modal="true" aria-label="Chiroot easter egg">' +
      '<button type="button" class="egg-x" aria-label="Tutup"><svg width="15" height="15" viewBox="0 0 16 16"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>' +
      '<svg class="egg-logo" viewBox="0 0 55 54" aria-hidden="true"><image href="' + STAR + '" width="55" height="54"/><image href="' + EYES + '" width="55" height="54"/></svg>' +
      '<h3 class="egg-title">You found the secret egg!</h3>' +
      '<p class="egg-sub">Enjoy the hidden Chiroot track.</p>' +
      '<div class="egg-actions">' +
      '<button type="button" class="egg-btn egg-secondary">Back to Chiroot</button>' +
      '<button type="button" class="egg-btn egg-primary"><svg class="ic-pause" width="13" height="13" viewBox="0 0 14 14"><rect x="2" y="1" width="4" height="12" rx="1.3" fill="currentColor"/><rect x="8" y="1" width="4" height="12" rx="1.3" fill="currentColor"/></svg><svg class="ic-play" width="13" height="13" viewBox="0 0 14 14"><path d="M3 1.5l9.5 5.5L3 12.5z" fill="currentColor"/></svg><span class="egg-label">Pause</span></button>' +
      '</div></div>';
    document.body.appendChild(root);
    card = root.querySelector('.egg-card');
    label = root.querySelector('.egg-label');
    canvas = root.querySelector('.egg-canvas');
    ctx = canvas.getContext('2d');
    audio = new Audio(eggAudio || '');
    audio.loop = true;
    root.querySelector('.egg-x').addEventListener('click', closeEgg);
    root.querySelector('.egg-secondary').addEventListener('click', closeEgg);
    root.querySelector('.egg-primary').addEventListener('click', function () {
      var p = !card.classList.contains('egg-paused');
      card.classList.toggle('egg-paused', p);
      label.textContent = p ? 'Play' : 'Pause';
      if (p) audio.pause();
      else audio.play().catch(function () {});
    });
    root.addEventListener('wheel', function (e) { e.preventDefault(); }, { passive: false });
    root.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
    addEventListener('resize', function () { if (open) startFx(); });
  }

  function startFx() {
    W = canvas.width = innerWidth;
    H = canvas.height = innerHeight;
    parts = [];
    arcs = [];
    var shapes = ['circle', 'square', 'triangle', 'diamond'];
    var cols = ['#7ee8df', '#8ab4ff', '#c792ea', '#ffd47e'];
    for (var i = 0; i < 16; i++) {
      var a = Math.random() * 6.283, sp = 0.6 + Math.random() * 1.6;
      parts.push({ x: Math.random() * W, y: Math.random() * H, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s: 3 + Math.random() * 4, c: cols[i % 4], sh: shapes[i % 4], tr: [] });
    }
    for (var j = 0; j < 3; j++) arcs.push({ r: (0.38 + Math.random() * 0.42) * Math.min(W, H), a: Math.random() * 6.283, len: 1 + Math.random() * 1.8, w: 5 + Math.random() * 4, v: (Math.random() < 0.5 ? -1 : 1) * (0.002 + Math.random() * 0.004) });
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function tick() {
    ctx.clearRect(0, 0, W, H);
    var cx = W / 2, cy = H / 2, i, k;
    for (i = 0; i < arcs.length; i++) {
      var q = arcs[i];
      q.a += q.v;
      ctx.beginPath();
      ctx.arc(cx, cy, q.r, q.a, q.a + q.len);
      ctx.strokeStyle = 'rgba(124,136,182,0.7)';
      ctx.lineWidth = q.w;
      ctx.lineCap = 'round';
      ctx.stroke();
      glow(cx + Math.cos(q.a + q.len) * q.r, cy + Math.sin(q.a + q.len) * q.r, 5, '#7ee8df');
    }
    for (i = 0; i < parts.length; i++) {
      var p = parts[i];
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -24) p.x = W + 24; else if (p.x > W + 24) p.x = -24;
      if (p.y < -24) p.y = H + 24; else if (p.y > H + 24) p.y = -24;
      p.tr.push({ x: p.x, y: p.y });
      if (p.tr.length > 20) p.tr.shift();
      for (k = 0; k < p.tr.length; k++) {
        var f = k / p.tr.length;
        ctx.globalAlpha = f * 0.3;
        draw(p.tr[k].x, p.tr[k].y, p.s * f, p.sh, p.c);
      }
      ctx.globalAlpha = 1;
      glow(p.x, p.y, p.s, p.c);
    }
    if (open) raf = requestAnimationFrame(tick);
  }

  function glow(x, y, r, c) {
    ctx.save();
    ctx.shadowColor = c;
    ctx.shadowBlur = 16;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.283);
    ctx.fill();
    ctx.restore();
  }

  function draw(x, y, r, t, c) {
    if (r < 0.4) return;
    ctx.fillStyle = c;
    ctx.beginPath();
    if (t === 'circle') ctx.arc(x, y, r, 0, 6.283);
    else if (t === 'square') ctx.rect(x - r, y - r, r * 2, r * 2);
    else if (t === 'triangle') { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r); ctx.lineTo(x - r, y + r); ctx.closePath(); }
    else { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); }
    ctx.fill();
  }
})();
