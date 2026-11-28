
(function () {
  'use strict';

  if (!document.getElementById('chiroot-topbar')) return; // hanya di Main.html

  /* ---------- konstanta ---------- */
  var SONGS_BUCKET = 'chiroot-shared';
  var CRATE_BUCKET = 'chiroot-crate';
  var LS_THEME = 'chiroot_theme_v1';
  var LS_DISPLAY = 'chiroot_display_v1';
  var LS_GUEST_OK = 'chiroot_guest_ok';
  var WELCOME_URL = 'welcome.html';
  var PAGE_SIZE = 24;

  /* Deep-link ?song= dicekap SEKARANG (sebelum handler OAuth legacy
     membersihkan query string saat callback login). */
  var PENDING_SONG = (function () {
    try { return new URLSearchParams(window.location.search).get('song') || ''; } catch (e) { return ''; }
  })();

  var ICONS = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
    disc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>',
    music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
    cog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5Z"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07L12 4.93"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07L12 19.07"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4-4"/></svg>',
    note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>'
  };

  /* ---------- util ---------- */
  function $(id) { return document.getElementById(id); }

  function esc(s) {
    try { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    }); } catch (e) { return ''; }
  }

  function authed() { return !!(window.ChirootAuth && ChirootAuth.isAuthed()); }
  function uid() { return (ChirootAuth.session && ChirootAuth.session.user && ChirootAuth.session.user.id) || ''; }
  function profile() { return (window.ChirootAuth && ChirootAuth.profile) || null; }

  function storageUrl(bucket, path) {
    return caBase() + '/storage/v1/object/public/' + bucket + '/' + String(path || '').replace(/^\/+/, '');
  }

  function songAudioUrl(song) {
    var bucket = song.source_bucket || SONGS_BUCKET;
    if (bucket === CRATE_BUCKET) return caCratePublicUrl(song.audio_path);
    return storageUrl(bucket, song.audio_path);
  }

  function songCoverUrl(song) {
    if (!song.cover_path) return null;
    return storageUrl(song.source_bucket === CRATE_BUCKET ? CRATE_BUCKET : SONGS_BUCKET, song.cover_path);
  }

  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) { return ''; }
  }

  function fmtDur(sec) {
    var n = Number(sec);
    if (!isFinite(n) || n <= 0) return '';
    var m = Math.floor(n / 60), s = Math.round(n % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function initials(name) {
    var w = String(name || '?').trim().split(/\s+/).slice(0, 2);
    return w.map(function (x) { return (x.charAt(0) || '').toUpperCase(); }).join('') || '?';
  }

  function cleanSearch(q) { return String(q || '').replace(/[,()*]/g, ' ').trim().slice(0, 60); }

  function canonicalShareUrl(songId) {
    try {
      var u = new URL(window.location.href);
      u.hash = '';
      u.search = '?song=' + encodeURIComponent(songId);
      return u.toString();
    } catch (e) { return window.location.origin + '/Main.html?song=' + encodeURIComponent(songId); }
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  /* ==================================================================
     1. GATE: pengunjung tanpa sesi -> welcome.html (flag Guest dihormati)
     ================================================================== */
  var _guestMode = window.caEnterGuestMode;
  window.caEnterGuestMode = function (note) {
    var hasSession = !!(window.ChirootAuth && ChirootAuth.session);
    if (!hasSession) {
      var ok = false;
      try { ok = localStorage.getItem(LS_GUEST_OK) === '1'; } catch (e) {}
      if (!ok) {
        window.location.replace(WELCOME_URL);
        return Promise.resolve();
      }
    }
    return _guestMode.apply(this, arguments);
  };

  /* logout -> welcome.html (bersih-bersih sudah dilakukan caDoSignOut) */
  var _doSignOut = window.caDoSignOut;
  window.caDoSignOut = function () {
    var r = _doSignOut.apply(this, arguments);
    try { localStorage.removeItem(LS_GUEST_OK); } catch (e) {}
    window.setTimeout(function () { window.location.replace(WELCOME_URL); }, 700);
    return r;
  };

  /* ==================================================================
     2. TEMA & MODE TAMPILAN (dark default, persist ke user_settings)
     ================================================================== */
  var SETTINGS_TABLE = '/rest/v1/user_settings';

  function lsGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function lsSet(key, val) { try { localStorage.setItem(key, val); } catch (e) {} }

  var OS_LIGHT_MQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

  function applyColorScheme(t) {
    var v = t === 'light' ? 'light' : (t === 'dark' ? 'dark' : ((OS_LIGHT_MQ && OS_LIGHT_MQ.matches) ? 'light' : 'dark'));
    document.documentElement.style.colorScheme = v;
  }

  function renderThemeToggle() {
    var wrap = $('app-theme-toggle');
    if (!wrap) return;
    var t = document.documentElement.getAttribute('data-theme') || 'dark';
    var resolved = t === 'light' ? 'light' : (t === 'dark' ? 'dark' : ((OS_LIGHT_MQ && OS_LIGHT_MQ.matches) ? 'light' : 'dark'));
    Array.prototype.forEach.call(wrap.querySelectorAll('button[data-theme-value]'), function (b) {
      var on = b.dataset.themeValue === resolved;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function applyTheme(theme) {
    var t = (theme === 'light' || theme === 'system') ? theme : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    applyColorScheme(t);
    renderThemeToggle();
  }

  if (OS_LIGHT_MQ && OS_LIGHT_MQ.addEventListener) {
    OS_LIGHT_MQ.addEventListener('change', function () {
      if (currentTheme() === 'system') { applyColorScheme('system'); renderThemeToggle(); }
    });
  }

  function applyDisplay(mode) {
    var m = mode === 'cover' ? 'cover' : 'gramophone';
    document.documentElement.setAttribute('data-display', m);
    document.querySelectorAll('.display-toggle').forEach(function (el) {
      el.setAttribute('aria-label', m === 'cover'
        ? 'Tap untuk kembali ke mode gramophone'
        : 'Tap untuk ganti ke mode cover art');
    });
  }

  function saveSettingsRemote(patch) {
    if (!authed() || !window.caApiCall) return;
    var u = uid();
    caApiCall(SETTINGS_TABLE + '?select=user_id&user_id=eq.' + encodeURIComponent(u), 'GET')
      .then(function (rows) {
        if (Array.isArray(rows) && rows.length) {
          return caApiCall(SETTINGS_TABLE + '?user_id=eq.' + encodeURIComponent(u), 'PATCH', patch);
        }
        var seed = { user_id: u, theme: 'dark', display_mode: 'gramophone' };
        for (var k in patch) { if (Object.prototype.hasOwnProperty.call(patch, k)) seed[k] = patch[k]; }
        return caApiCall(SETTINGS_TABLE, 'POST', seed);
      })
      .catch(function (err) { console.warn('save settings failed', err); });
  }

  function loadRemoteSettings() {
    if (!authed() || !window.caApiCall) return;
    caApiCall(SETTINGS_TABLE + '?select=theme,display_mode&user_id=eq.' + encodeURIComponent(uid()), 'GET')
      .then(function (rows) {
        var row = Array.isArray(rows) && rows[0];
        if (!row) return;
        if (row.theme) { applyTheme(row.theme); lsSet(LS_THEME, row.theme); }
        if (row.display_mode) { applyDisplay(row.display_mode); lsSet(LS_DISPLAY, row.display_mode); }
      })
      .catch(function (err) { console.warn('load settings failed', err); });
  }

  function currentTheme() {
    return lsGet(LS_THEME) || 'dark';
  }

  function currentDisplay() {
    return lsGet(LS_DISPLAY) || 'gramophone';
  }

  function bindSeg(seg, onPick) {
    if (!seg) return;
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-value]');
      if (!b) return;
      onPick(b.dataset.value);
    });
  }

  applyTheme(currentTheme());
  applyDisplay(currentDisplay());
  /* Toggle tema sun/moon di sidebar (lihat juga Settings untuk opsi System) */
  var themeToggle = $('app-theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-theme-value]');
      if (!b) return;
      applyTheme(b.dataset.themeValue);
      lsSet(LS_THEME, b.dataset.themeValue);
      saveSettingsRemote({ theme: b.dataset.themeValue });
    });
  }

  /* Sidebar collapsible (desktop) — status dipersist di localStorage */
  var LS_SIDEBAR = 'chiroot_sidebar_v1';
  function applySidebar(collapsed) {
    document.documentElement.setAttribute('data-sidebar', collapsed ? 'collapsed' : 'open');
    var btn = $('app-sidebar-toggle');
    if (btn) {
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      btn.title = collapsed ? 'Buka sidebar' : 'Tutup sidebar';
    }
  }
  var sidebarToggleBtn = $('app-sidebar-toggle');
  if (sidebarToggleBtn) {
    applySidebar(lsGet(LS_SIDEBAR) === 'collapsed');
    sidebarToggleBtn.addEventListener('click', function () {
      var isCollapsed = document.documentElement.getAttribute('data-sidebar') === 'collapsed';
      applySidebar(!isCollapsed); // buka jika sedang collapsed, tutup jika sedang open
      lsSet(LS_SIDEBAR, isCollapsed ? 'open' : 'collapsed');
    });
  }
  /* Mode tampilan: TAP gramophone / cover di halaman utama untuk berganti.
     Perpindahan instan — audio, progres, dan antrean tidak terganggu. */
  (function () {
    var targets = Array.prototype.slice.call(document.querySelectorAll('.gramophone-wrap, .cover-stage'));
    function toggleDisplay() {
      var next = currentDisplay() === 'cover' ? 'gramophone' : 'cover';
      applyDisplay(next); lsSet(LS_DISPLAY, next); saveSettingsRemote({ display_mode: next });
    }
    targets.forEach(function (el) {
      el.classList.add('display-toggle');
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.addEventListener('click', toggleDisplay);
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDisplay(); }
      });
    });
    applyDisplay(currentDisplay());
  })();

  /* ==================================================================
     3. ROUTER (hash): #/home | #/discover | #/songs
     ================================================================== */
  var ROUTES = ['home', 'discover', 'songs', 'liked'];

  function currentRoute() {
    var h = String(window.location.hash || '').replace(/^#\/?/, '');
    return ROUTES.indexOf(h) >= 0 ? h : 'home';
  }

  function navigate(route) {
    if (window.location.hash !== '#/' + route) {
      window.location.hash = '#/' + route;
      return; // hashchange akan render
    }
    renderRoute();
  }

  function renderRoute() {
    var r = currentRoute();
    document.querySelectorAll('.app-view').forEach(function (v) {
      v.classList.toggle('active', v.dataset.view === r || (r === 'home' && v.dataset.view === 'home'));
    });
    document.querySelectorAll('[data-route]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-route') === r);
    });
    if (r === 'discover' && !discState.loaded) refreshDiscover(true);
    if (r === 'songs') refreshSongs();
    if (r === 'liked') refreshLikes();
    closeSongMenus();
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', renderRoute);

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-route]');
    if (!b) return;
    e.preventDefault();
    navigate(b.getAttribute('data-route'));
  });

  var btnSidebarSettings = $('app-nav-settings');
  if (btnSidebarSettings) {
    btnSidebarSettings.addEventListener('click', function () {
      var legacy = $('btn-settings-open');
      if (legacy) legacy.click();
    });
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-open-settings]')) {
      e.preventDefault();
      var legacyBtn = $('btn-settings-open');
      if (legacyBtn) legacyBtn.click();
    }
  });

  /* ==================================================================
     4. DATA LAYER: songs
     ================================================================== */
  var SONGS = '/rest/v1/songs';
  var SONG_SELECT = 'id,owner_id,owner_name,title,artist,duration_seconds,audio_path,cover_path,source_crate_track_id,source_bucket,visibility,published_at,created_at';

  function fetchPublicSongs(opts) {
    var q = SONGS + '?select=' + SONG_SELECT + '&visibility=eq.public';
    if (opts.search) {
      q += '&or=(title.ilike.*' + encodeURIComponent(opts.search) + '*,owner_name.ilike.*' + encodeURIComponent(opts.search) + '*)';
    }
    var order = 'published_at.desc.nullslast';
    if (opts.sort === 'oldest') order = 'published_at.asc.nullslast';
    if (opts.sort === 'title') order = 'title.asc';
    q += '&order=' + order + '&limit=' + (opts.limit || PAGE_SIZE);
    if (opts.offset) q += '&offset=' + opts.offset;
    return caApiCall(q, 'GET');
  }

  function fetchSongPublic(id) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return Promise.reject(new Error('ID tidak valid'));
    return caApiCall(SONGS + '?select=' + SONG_SELECT + '&id=eq.' + encodeURIComponent(id) + '&visibility=eq.public', 'GET')
      .then(function (rows) { return (Array.isArray(rows) && rows[0]) || null; });
  }

  function fetchMySongs() {
    return caApiCall(SONGS + '?select=' + SONG_SELECT + '&owner_id=eq.' + encodeURIComponent(uid()) + '&order=created_at.desc', 'GET');
  }

  function storageCopy(sourceBucket, sourceKey, destBucket, destKey) {
    return fetch(caBase() + '/storage/v1/object/copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': caApiKey(), 'Authorization': 'Bearer ' + ChirootAuth.session.access_token },
      body: JSON.stringify({ bucketId: sourceBucket, sourceKey: sourceKey, destinationBucket: destBucket, destinationKey: destKey })
    }).then(function (res) {
      if (!res.ok) throw new Error('Copy storage gagal (HTTP ' + res.status + ')');
      return true;
    });
  }

  function storageDeleteIn(bucket, key) {
    return fetch(caBase() + '/storage/v1/object/' + bucket + '/' + key, {
      method: 'DELETE',
      headers: { 'apikey': caApiKey(), 'Authorization': 'Bearer ' + ChirootAuth.session.access_token }
    }).catch(function () {});
  }

  /* ==================================================================
     5. DISCOVER
     ================================================================== */
  var discState = { loaded: false, loading: false, offset: 0, search: '', sort: 'newest', items: [] };

  function refreshDiscover(reset) {
    var listEl = $('disc-list');
    var stateEl = $('disc-state');
    var moreBtn = $('disc-more');
    if (!listEl || !stateEl) return;
    if (reset) {
      discState.offset = 0;
      discState.items = [];
    }
    if (discState.loading) return;
    discState.loading = true;
    moreBtn.disabled = true;
    if (!discState.items.length) {
      stateEl.innerHTML = '<span class="crd-spin"></span><br>Memuat katalog lagu…';
      stateEl.style.display = 'block';
    }
    fetchPublicSongs({ search: discState.search, sort: discState.sort, offset: discState.offset })
      .then(function (rows) {
        discState.items = discState.items.concat(rows || []);
        discState.offset += (rows && rows.length) || 0;
        renderDiscover();
        updateLikeLabels();
        if (rows && rows.length >= PAGE_SIZE) {
          moreBtn.style.display = '';
          moreBtn.disabled = false;
        } else {
          moreBtn.style.display = 'none';
        }
        discState.loaded = true;
      })
      .catch(function (err) {
        stateEl.innerHTML = '<strong>Gagal memuat katalog</strong>' + esc(err && err.message ? err.message : 'Cek koneksi internet kamu.') +
          '<br><button class="song-btn" id="disc-retry" style="margin-top:10px;">↻ Coba lagi</button>';
        stateEl.style.display = 'block';
        var retry = $('disc-retry');
        if (retry) retry.addEventListener('click', function () { refreshDiscover(true); });
      })
      .then(function () { discState.loading = false; });
  }

  function renderDiscover() {
    var listEl = $('disc-list');
    var stateEl = $('disc-state');
    var items = discState.items;
    if (!items.length) {
      listEl.innerHTML = '';
      stateEl.innerHTML = discState.search
        ? '<strong>Tidak ada hasil</strong>Tidak ada lagu publik yang cocok dengan pencarianmu.'
        : '<strong>Belum ada lagu yang dibagikan</strong>Jadilah yang pertama! Buka My Songs lalu publikasikan lagu dari Crate-mu.';
      stateEl.style.display = 'block';
      return;
    }
    stateEl.style.display = 'none';
    listEl.innerHTML = items.map(function (s, i) {
      var mine = authed() && s.owner_id === uid();
      var cover = songCoverUrl(s);
      return '<li class="song-row' + (isSongPlaying(s.id) ? ' playing' : '') + '" data-song-idx="' + i + '">' +
        '<div class="song-cover"><span class="song-cover-fallback">' + ICONS.note + '</span>' + (cover ? '<img src="' + esc(cover) + '" alt="" loading="lazy" onerror="this.remove()">' : '') + '</div>' +
        '<div class="song-meta">' +
          '<p class="song-title">' + esc(s.title) + '</p>' +
          '<p class="song-sub">' + esc(s.artist || s.owner_name || 'Pengguna Chiroot') +
            (s.duration_seconds ? ' · ' + esc(fmtDur(s.duration_seconds)) : '') +
            (s.published_at ? ' · ' + esc(fmtDate(s.published_at)) : '') + '</p>' +
        '</div>' +
        '<div class="song-actions">' +
          '<button class="song-btn primary" data-song-play="' + i + '">' + ICONS.play + ' Putar</button>' +
          '<details class="song-menu"><summary class="song-btn" aria-label="Aksi lagu">⋯</summary><div class="song-menu-panel">' +
          '<button data-like-source="discover" data-like-index="' + i + '">♡ Suka / batal suka</button>' +
          '<button data-song-share="' + i + '">Salin link</button>' +
          (mine ? '<button data-song-unpublish="' + i + '">Jadikan privat</button><button data-song-del="' + i + '">Hapus lagu</button>' : '') +
          '</div></details>' +
        '</div>' +
      '</li>';
    }).join('');
  }

  function isSongPlaying(songId) {
    try {
      var t = tracks && tracks[currentIndex];
      return t && t._songId === songId;
    } catch (e) { return false; }
  }

  function songToTrack(song) {
    return {
      id: 'song:' + song.id,
      title: String(song.title || 'Tanpa judul'),
      artist: String(song.artist || song.owner_name || 'Pengguna Chiroot'),
      src: songAudioUrl(song),
      cover: songCoverUrl(song) || null,
      labelColor: '#f5b73e',
      vinylColor: '#1e1e24',
      _songId: song.id,
      isDemo: false
    };
  }

  function playSong(song) {
    var track = songToTrack(song);
    var idx = -1;
    for (var i = 0; i < tracks.length; i++) {
      if (String(tracks[i].id) === track.id) { idx = i; break; }
    }
    if (idx < 0) { tracks.push(track); idx = tracks.length - 1; }
    try {
      renderPlaylist();
      loadTrack(idx, true, true);
    } catch (e) {
      showToast('Gagal memutar: ' + (e && e.message ? e.message : e));
      return;
    }
  }

  $('disc-list').addEventListener('click', function (e) {
    var playBtn = e.target.closest('[data-song-play]');
    var shareBtn = e.target.closest('[data-song-share]');
    var unpBtn = e.target.closest('[data-song-unpublish]');
    var delBtn = e.target.closest('[data-song-del]');
    if (playBtn) {
      var s1 = discState.items[Number(playBtn.dataset.songPlay)];
      if (s1) playSong(s1);
    } else if (shareBtn) {
      var s2 = discState.items[Number(shareBtn.dataset.songShare)];
      if (s2) copyText(canonicalShareUrl(s2.id)).then(function (ok) {
        showToast(ok ? 'Link lagu disalin ✓' : 'Gagal menyalin link');
      });
    } else if (unpBtn) {
      var s3 = discState.items[Number(unpBtn.dataset.songUnpublish)];
      if (s3 && window.confirm('Jadikan "' + s3.title + '" privat? Lagu akan hilang dari katalog publik.')) {
        unpublishSong(s3);
      }
    } else if (delBtn) {
      var s4 = discState.items[Number(delBtn.dataset.songDel)];
      if (s4 && window.confirm('Hapus permanen "' + s4.title + '" dari Chiroot? Tindakan ini tidak bisa dibatalkan.')) {
        deleteSong(s4);
      }
    }
  });

  function unpublishSong(song) {
    showToast('Menjadikan privat…');
    caApiCall(SONGS + '?id=eq.' + encodeURIComponent(song.id) + '&owner_id=eq.' + encodeURIComponent(uid()), 'PATCH', { visibility: 'private', published_at: null })
      .then(function () {
        // Catatan: objek audio di chiroot-shared sengaja dipertahankan supaya
        // lagu bisa dipublikasikan lagi nanti tanpa copy ulang, dan supaya
        // audio_path baris ini tidak menunjuk ke objek yang sudah terhapus.
        showToast('"' + song.title + '" sekarang privat ✓');
        refreshDiscover(true);
      })
      .catch(function (err) { showToast('Gagal: ' + (err && err.message ? err.message : err)); });
  }

  function deleteSong(song) {
    showToast('Menghapus…');
    caApiCall(SONGS + '?id=eq.' + encodeURIComponent(song.id) + '&owner_id=eq.' + encodeURIComponent(uid()), 'DELETE')
      .then(function () {
        if (song.audio_path && (song.source_bucket || SONGS_BUCKET) === SONGS_BUCKET) {
          storageDeleteIn(SONGS_BUCKET, song.audio_path);
        }
        if (song.cover_path) storageDeleteIn(SONGS_BUCKET, song.cover_path);
        showToast('Lagu dihapus ✓');
        refreshDiscover(true);
      })
      .catch(function (err) { showToast('Gagal: ' + (err && err.message ? err.message : err)); });
  }

  var searchTimer = null;
  $('disc-search').addEventListener('input', function (e) {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(function () {
      discState.search = cleanSearch(e.target.value);
      refreshDiscover(true);
    }, 350);
  });
  $('disc-sort').addEventListener('change', function (e) {
    discState.sort = e.target.value || 'newest';
    refreshDiscover(true);
  });
  $('disc-more').addEventListener('click', function () { refreshDiscover(false); });

  /* ==================================================================
     6. MY SONGS
     ================================================================== */
  var songsCache = [];
  var crateOnlyCache = [];
  var bulkPublishing = false;

  function refreshSongs() {
    var cloudEl = $('songs-cloud');
    var crateEl = $('songs-crate');
    var stateEl = $('songs-state');
    if (!cloudEl || !crateEl || !stateEl) return;
    if (!authed()) {
      stateEl.innerHTML = '<strong>My Songs butuh akun</strong>Login dengan Google untuk melihat & mempublikasikan lagumu.' +
        '<br><button class="song-btn primary" id="songs-login" style="margin-top:12px;">Login with Google</button>';
      stateEl.style.display = 'block';
      cloudEl.innerHTML = '';
      crateEl.innerHTML = '';
      var lb = $('songs-login');
      if (lb) lb.addEventListener('click', function () { if (window.caLoginRedirect) caLoginRedirect(); });
      crateOnlyCache = [];
      updatePublishAllButton();
      return;
    }
    stateEl.innerHTML = '<span class="crd-spin"></span><br>Memuat lagu milikmu…';
    stateEl.style.display = 'block';
    fetchMySongs()
      .then(function (rows) {
        songsCache = rows || [];
        var crateTracks = (tracks || []).filter(function (t) { return t && !String(t.id).startsWith('song:'); });
        var publishedIds = {};
        songsCache.forEach(function (s) {
          if (s.source_crate_track_id) publishedIds[s.source_crate_track_id] = true;
        });
        var localOnly = crateTracks.filter(function (t) { return !publishedIds[String(t.id)]; });
        crateOnlyCache = localOnly;
        renderMySongs(cloudEl, crateEl, localOnly);
        updateLikeLabels();
        updatePublishAllButton();
        stateEl.style.display = 'none';
      })
      .catch(function (err) {
        stateEl.innerHTML = '<strong>Gagal memuat</strong>' + esc(err && err.message ? err.message : '');
        stateEl.style.display = 'block';
      });
  }

  function renderMySongs(cloudEl, crateEl, localOnly) {
    if (songsCache.length) {
      cloudEl.innerHTML = songsCache.map(function (s, i) {
        var isPub = s.visibility === 'public';
        var cover = isPub ? songCoverUrl(s) : (s.source_bucket === CRATE_BUCKET && s.cover_path ? caCratePublicUrl(s.cover_path) : null);
        return '<li class="song-row" data-song-idx="' + i + '">' +
          '<div class="song-cover"><span class="song-cover-fallback">' + ICONS.note + '</span>' + (cover ? '<img src="' + esc(cover) + '" alt="" loading="lazy" onerror="this.remove()">' : '') + '</div>' +
          '<div class="song-meta">' +
            '<p class="song-title">' + esc(s.title) + '</p>' +
            '<p class="song-sub">' + (isPub ? 'Publik' : 'Privat') + (s.created_at ? ' · ' + esc(fmtDate(s.created_at)) : '') + '</p>' +
          '</div>' +
          '<div class="song-actions">' +
            '<button class="song-btn primary" data-my-play="' + i + '">' + ICONS.play + ' Putar</button>' +
            '<details class="song-menu"><summary class="song-btn" aria-label="Aksi lagu">⋯</summary><div class="song-menu-panel">' +
            '<button data-like-source="mine" data-like-index="' + i + '">♡ Suka / batal suka</button>' +
            (isPub ? '<button data-my-share="' + i + '">Salin link</button><button data-my-unpub="' + i + '">Jadikan privat</button>' : '<button data-my-pub="' + i + '">Publikasikan</button>') +
            '<button data-my-del="' + i + '">Hapus lagu</button></div></details>' +
          '</div>' +
        '</li>';
      }).join('');
    } else {
      cloudEl.innerHTML = '<li class="crd-state" style="list-style:none;"><strong>Belum ada lagu di Chiroot</strong>Publikasikan lagu dari Crate-mu lewat daftar di bawah.</li>';
    }
    if (localOnly.length) {
      crateEl.innerHTML = localOnly.map(function (t, i) {
        return '<li class="song-row" data-crate-idx="' + i + '">' +
          '<div class="song-cover"><span class="song-cover-fallback">' + ICONS.note + '</span>' + (t.cover ? '<img src="' + esc(t.cover) + '" alt="" loading="lazy" onerror="this.remove()">' : '') + '</div>' +
          '<div class="song-meta">' +
            '<p class="song-title">' + esc(t.title) + '</p>' +
            '<p class="song-sub">' + esc(t.artist || '') + '</p>' +
          '</div>' +
          '<div class="song-actions">' +
            '<span class="song-badge local">Crate</span>' +
            '<button class="song-btn primary" data-crate-publish="' + i + '">Publikasikan…</button>' +
          '</div>' +
        '</li>';
      }).join('');
    } else {
      crateEl.innerHTML = '<li class="crd-state" style="list-style:none;">Semua lagu Crate-mu sudah terhubung ke Chiroot ✓</li>';
    }
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-my-play]')) {
      var p = e.target.closest('[data-my-play]').dataset.myPlay;
      var s1 = songsCache[Number(p)];
      if (s1) playSong(s1);
    } else if (e.target.closest('[data-my-share]')) {
      var sh = e.target.closest('[data-my-share]').dataset.myShare;
      var s2 = songsCache[Number(sh)];
      if (s2) copyText(canonicalShareUrl(s2.id)).then(function (ok) {
        showToast(ok ? 'Link lagu disalin ✓' : 'Gagal menyalin link');
      });
    } else if (e.target.closest('[data-my-unpub]')) {
      var u = e.target.closest('[data-my-unpub]').dataset.myUnpub;
      var s3 = songsCache[Number(u)];
      if (s3 && window.confirm('Jadikan "' + s3.title + '" privat? Lagu akan hilang dari katalog publik.')) {
        unpublishSong(s3);
        window.setTimeout(refreshSongs, 800);
      }
    } else if (e.target.closest('[data-my-pub]')) {
      var toPublish = songsCache[Number(e.target.closest('[data-my-pub]').dataset.myPub)];
      var crateTrack = toPublish && (tracks || []).find(function (t) { return String(t.id) === String(toPublish.source_crate_track_id); });
      if (crateTrack) openPublishModal(crateTrack); else showToast('Lagu sumber tidak ditemukan di Crate.');
    } else if (e.target.closest('[data-my-del]')) {
      var d = e.target.closest('[data-my-del]').dataset.myDel;
      var s4 = songsCache[Number(d)];
      if (s4 && window.confirm('Hapus permanen "' + s4.title + '"?')) {
        deleteSong(s4);
        window.setTimeout(refreshSongs, 800);
      }
    } else if (e.target.closest('[data-crate-publish]')) {
      var cIdx = Number(e.target.closest('[data-crate-publish]').dataset.cratePublish);
      var crateTracks2 = (tracks || []).filter(function (t) { return t && !String(t.id).startsWith('song:'); });
      var t = crateTracks2[cIdx];
      if (t) openPublishModal(t);
    }
  });

  /* ==================================================================
     7. PUBLISH FLOW (dari Crate -> chiroot-shared, tanpa re-upload)
     ================================================================== */
  var pubCtx = null; // { track }

  function openPublishModal(track) {
    pubCtx = { track: track };
    $('pub-song-title').textContent = track.title || 'Tanpa judul';
    $('pub-status').textContent = '';
    setPubChoice('private');
    setModalOpen('publish-modal', true);
  }

  function setPubChoice(v) {
    $('pub-choice').dataset.value = v;
    Array.prototype.forEach.call($('pub-choice').querySelectorAll('button'), function (b) {
      b.classList.toggle('active', b.dataset.value === v);
    });
  }

  $('pub-choice').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-value]');
    if (b) setPubChoice(b.dataset.value);
  });
  $('pub-cancel').addEventListener('click', function () { setModalOpen('publish-modal', false); });
  var pubCloseBtn = $('pub-close');
  if (pubCloseBtn) pubCloseBtn.addEventListener('click', function () { setModalOpen('publish-modal', false); });
  $('pub-go').addEventListener('click', doPublish);

  function extOf(path) {
    var m = /\.([a-z0-9]+)$/i.exec(String(path || ''));
    return m ? m[1].toLowerCase() : 'mp3';
  }

  function publishTrack(track, isPublic, statusEl) {
    if (!authed()) return Promise.reject(new Error('Butuh login'));
    var audioPath = track._audioPath || '';
    if (!audioPath) return Promise.reject(new Error('Lagu tidak punya file audio di cloud'));
    var coverPath = track._coverPath || '';
    var setStatus = function (m) { if (statusEl) statusEl.textContent = m; };

    // idempoten: cek apakah track crate ini sudah pernah dipublikasikan
    return caApiCall(SONGS + '?select=' + SONG_SELECT + '&owner_id=eq.' + encodeURIComponent(uid()) + '&source_crate_track_id=eq.' + encodeURIComponent(track.id), 'GET')
      .then(function (rows) {
        var existing = Array.isArray(rows) && rows[0];
        if (existing) {
          return caApiCall(SONGS + '?id=eq.' + encodeURIComponent(existing.id), 'PATCH', { visibility: isPublic ? 'public' : 'private', published_at: isPublic ? (existing.published_at || new Date().toISOString()) : null, title: track.title, artist: track.artist || null })
            .then(function () { return { existing: true }; });
        }
        // 1) insert row (audio_path sementara = path crate; diperbarui setelah copy)
        return caApiCall(SONGS, 'POST', {
          owner_id: uid(),
          owner_name: (profile() && (profile().display_name || profile().email)) || 'Pengguna Chiroot',
          title: String(track.title || 'Tanpa judul'),
          artist: track.artist || null,
          audio_path: audioPath,
          cover_path: coverPath || null,
          source_crate_track_id: String(track.id),
          source_bucket: isPublic ? SONGS_BUCKET : CRATE_BUCKET,
          visibility: isPublic ? 'public' : 'private',
          published_at: isPublic ? new Date().toISOString() : null
        }).then(function (created) {
          var row = Array.isArray(created) && created[0];
          if (!row || !row.id) throw new Error('Gagal membuat catatan lagu');
          if (!isPublic) return row; // privat: audio tetap di crate, tidak ada copy
          // 2) copy audio + cover ke bucket publik chiroot-shared (server-side, tanpa re-upload)
          setStatus('Menyiapkan audio publik…');
          var destAudio = uid() + '/' + row.id + '.' + extOf(audioPath);
          return storageCopy(CRATE_BUCKET, audioPath, SONGS_BUCKET, destAudio)
            .then(function () {
              var patch = { audio_path: destAudio, source_bucket: SONGS_BUCKET };
              if (coverPath) {
                var destCover = uid() + '/' + row.id + '-cover.' + extOf(coverPath);
                return storageCopy(CRATE_BUCKET, coverPath, SONGS_BUCKET, destCover)
                  .then(function () {
                    patch.cover_path = destCover;
                    return patch;
                  });
              }
              return patch;
            })
            .then(function (patch) {
              return caApiCall(SONGS + '?id=eq.' + encodeURIComponent(row.id), 'PATCH', patch).then(function () { return row; });
            })
            .catch(function (err) {
              // gagal copy -> bersihkan row supaya tidak meninggalkan catatan setengah jadi
              caApiCall(SONGS + '?id=eq.' + encodeURIComponent(row.id), 'DELETE').catch(function () {});
              throw err;
            });
        });
      });
  }

  function doPublish() {
    if (!pubCtx || !authed()) return;
    var isPublic = $('pub-choice').dataset.value === 'public';
    var btn = $('pub-go');
    btn.disabled = true;
    var status = $('pub-status');
    status.textContent = '';
    publishTrack(pubCtx.track, isPublic, status)
      .then(function (res) {
        setModalOpen('publish-modal', false);
        showToast(res && res.existing
          ? 'Lagu sudah ada di My Songs — visibilitas diperbarui ✓'
          : (isPublic ? 'Lagu dipublikasikan! Sekarang terlihat di Discover ✓' : 'Lagu disimpan sebagai privat ✓'));
        if (isPublic && currentRoute() === 'discover') refreshDiscover(true);
        if (currentRoute() === 'songs') refreshSongs();
      })
      .catch(function (err) {
        status.textContent = 'Gagal: ' + (err && err.message ? err.message : err);
      })
      .then(function () { btn.disabled = false; });
  }

  /* Publikasikan SEMUA lagu Crate yang belum terhubung ke Chiroot (berurutan, dengan progres) */
  function updatePublishAllButton() {
    var btn = $('btn-publish-all');
    if (!btn) return;
    btn.style.display = (authed() && crateOnlyCache.length && !bulkPublishing) ? '' : 'none';
    btn.disabled = bulkPublishing;
  }

  function publishAllPublic() {
    if (!authed() || bulkPublishing) return;
    var targets = crateOnlyCache.filter(function (t) { return t && t._audioPath; });
    var skipped = crateOnlyCache.length - targets.length;
    if (!targets.length) {
      showToast('Tidak ada lagu Crate yang bisa dipublikasikan.');
      return;
    }
    if (!window.confirm('Publikasikan ' + targets.length + ' lagu ke Discover?\n\nSemua lagu ini akan terlihat & bisa diputar publik. Lanjutkan?')) return;
    bulkPublishing = true;
    updatePublishAllButton();
    var status = $('publish-all-status');
    if (status) { status.style.display = ''; status.textContent = 'Mempublikasikan 1/' + targets.length + '…'; }
    var done = 0, failed = 0;
    function next(i) {
      if (i >= targets.length) {
        bulkPublishing = false;
        crateOnlyCache = [];
        updatePublishAllButton();
        if (status) status.style.display = 'none';
        showToast('Selesai: ' + (done - failed) + ' lagu dipublikasikan' +
          (failed ? ', ' + failed + ' gagal' : '') +
          (skipped ? ', ' + skipped + ' dilewati (tanpa audio cloud)' : '') + '.');
        refreshSongs();
        if (currentRoute() === 'discover') refreshDiscover(true);
        return;
      }
      if (status) status.textContent = 'Mempublikasikan ' + (i + 1) + '/' + targets.length + '…';
      publishTrack(targets[i], true, null)
        .then(function () { done++; })
        .catch(function (err) { console.warn('bulk publish failed:', targets[i] && targets[i].title, err); failed++; })
        .then(function () { next(i + 1); });
    }
    next(0);
  }

  var pubAllBtn = $('btn-publish-all');
  if (pubAllBtn) pubAllBtn.addEventListener('click', publishAllPublic);

  /* ==================================================================
     8. MODAL HELPERS
     ================================================================== */
  function setModalOpen(id, open) {
    var m = $(id);
    if (!m) return;
    m.classList.toggle('open', !!open);
    m.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  document.addEventListener('click', function (e) {
    if (e.target.classList && e.target.classList.contains('modal-overlay') && e.target.id === 'publish-modal') {
      setModalOpen('publish-modal', false);
    }
  });

  /* ==================================================================
     9. SIDEBAR / PROFIL / BOTTOM NAV
     ================================================================== */
  function renderProfileBox() {
    var p = profile();
    var nameEl = $('app-profile-name');
    var mailEl = $('app-profile-mail');
    var avEl = $('app-profile-avatar');
    var av2 = $('bn-avatar');
    if (!nameEl) return;
    if (p) {
      nameEl.textContent = p.display_name || (p.email || '').split('@')[0] || 'Pengguna';
      mailEl.textContent = p.email || '';
      var inner = p.pfp
        ? '<img src="' + esc(p.pfp) + '" alt="">'
        : esc(initials(p.display_name || p.email));
      avEl.innerHTML = inner;
      if (av2) av2.innerHTML = inner;
    } else {
      nameEl.textContent = 'Mode Guest';
      mailEl.textContent = 'Login untuk sinkron cloud';
      var g = esc(initials('G'));
      avEl.innerHTML = g;
      if (av2) av2.innerHTML = g;
    }
  }

  var _appLogout = $('app-logout');
  if (_appLogout) _appLogout.addEventListener('click', function () {
    if (window.caAskSignOut) caAskSignOut();
  });

  /* Profil di sidebar: klik -> Edit Profile (modal legacy) */
  var profileBox = document.querySelector('.app-sidebar-footer .app-profile');
  if (profileBox) {
    profileBox.classList.add('app-profile-clickable');
    profileBox.setAttribute('role', 'button');
    profileBox.setAttribute('tabindex', '0');
    profileBox.setAttribute('title', 'Edit profil');
    profileBox.addEventListener('click', function () {
      if (!authed()) { showToast('Login dulu untuk mengedit profil.'); return; }
      if (window.caOpenProfileModal) caOpenProfileModal();
    });
    profileBox.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); profileBox.click(); }
    });
  }

  /* Ganti Akun di sidebar -> account switcher legacy */
  var switchBtn = $('app-switch-account');
  if (switchBtn) {
    switchBtn.addEventListener('click', function () {
      if (window.caOpenAccountSwitcher) caOpenAccountSwitcher();
      else showToast('Fitur ganti akun tidak tersedia.');
    });
  }

  /* wrap hooks legacy supaya profil & settings ikut ter-render */
  function wrapHook(name, after) {
    var hooks = window.ChirootHooks;
    if (!hooks || typeof hooks[name] !== 'function') return;
    var orig = hooks[name];
    hooks[name] = function () {
      var r = orig.apply(this, arguments);
      try { after.apply(this, arguments); } catch (e) { console.warn('hook wrap failed', e); }
      return r;
    };
  }

  wrapHook('onProfileReady', function () {
    loadRemoteSettings();
    renderProfileBox();
    refreshLikeStates();
    if (currentRoute() === 'liked') refreshLikes();
    handleDeepLink();
    /* crate sudah selesai dimuat — kalau user sedang di My Songs,
       refresh supaya daftar "Masih di Crate" langsung terisi */
    if (currentRoute() === 'songs') refreshSongs();
  });
  wrapHook('onProfileUpdated', function () { renderProfileBox(); });

  /* ==================================================================
     10. DEEP LINK ?song=<id> (tanpa autoplay)
     ================================================================== */
  function handleDeepLink() {
    var id = PENDING_SONG;
    if (!id) {
      try { id = new URLSearchParams(window.location.search).get('song') || ''; } catch (e) {}
    }
    if (!id) return;
    PENDING_SONG = '';
    try { history.replaceState(null, '', window.location.pathname + window.location.hash); } catch (e) {}
    fetchSongPublic(id)
      .then(function (song) {
        if (!song) {
          showToast('Lagu tidak ditemukan atau sudah dibuat privat.');
          return;
        }
        var track = songToTrack(song);
        var exists = -1;
        for (var i = 0; i < tracks.length; i++) {
          if (String(tracks[i].id) === track.id) { exists = i; break; }
        }
        if (exists < 0) { tracks.push(track); exists = tracks.length - 1; }
        renderPlaylist();
        loadTrack(exists, false, true); // JANGAN autoplay — tunggu aksi user
        navigate('home');
        showToast('"' + song.title + '" — dibagikan oleh ' + (song.owner_name || 'pengguna Chiroot') + '. Tekan play untuk mendengarkan.');
      })
      .catch(function (err) {
        showToast('Gagal membuka lagu: ' + (err && err.message ? err.message : err));
      });
  }

  /* A user's likes are always loaded from the server; no sample entries. */
  var likedSongs = [];
  var likedIds = Object.create(null);
  var likeStateOwner = '';
  function refreshLikeStates() {
    var owner = authed() ? uid() : '';
    likedIds = Object.create(null); likeStateOwner = owner;
    if (!owner) return;
    caApiCall('/rest/v1/song_likes?select=song_id&user_id=eq.' + encodeURIComponent(owner), 'GET').then(function (rows) {
      if (!authed() || uid() !== owner || likeStateOwner !== owner) return;
      (rows || []).forEach(function (row) { likedIds[row.song_id] = true; });
      updateLikeLabels();
    }).catch(function () { /* The collection view reports loading errors explicitly. */ });
  }
  function updateLikeLabels() {
    document.querySelectorAll('[data-like-source]').forEach(function (button) {
      if (button.dataset.likeSource === 'liked') return;
      var i = Number(button.dataset.likeIndex);
      var song = button.dataset.likeSource === 'discover' ? discState.items[i] : songsCache[i];
      if (song) button.textContent = likedIds[song.id] ? '♥ Hapus dari Liked Songs' : '♡ Tambah ke Liked Songs';
    });
    var track = tracks && tracks[currentIndex], btn = $('persistent-like');
    if (btn && track && track._songId) { btn.textContent = likedIds[track._songId] ? '♥' : '♡'; btn.setAttribute('aria-label', likedIds[track._songId] ? 'Hapus dari Liked Songs' : 'Tambah ke Liked Songs'); }
  }
  var likesOwner = '';
  var likesRequest = 0;
  function refreshLikes() {
    var state = $('liked-state'), list = $('liked-list'), count = $('liked-count');
    var owner = authed() ? uid() : '';
    var request = ++likesRequest;
    likedSongs = []; likesOwner = owner; list.innerHTML = ''; count.textContent = '';
    if (!owner) {
      state.style.display = 'block';
      state.innerHTML = '<strong>Login untuk melihat Liked Songs</strong>Koleksi ini disimpan secara pribadi di akunmu.';
      return Promise.resolve();
    }
    state.style.display = 'block'; state.innerHTML = '<span class="crd-spin"></span><br>Memuat lagu…';
    return caApiCall('/rest/v1/song_likes?select=added_at,songs(' + SONG_SELECT + ')&user_id=eq.' + encodeURIComponent(owner) + '&order=added_at.desc', 'GET')
      .then(function (rows) {
        if (request !== likesRequest || !authed() || uid() !== owner) return;
        likedSongs = (rows || []).filter(function (row) { return !!row.songs; });
        renderLikes();
      }).catch(function (err) {
        if (request !== likesRequest || !authed() || uid() !== owner) return;
        state.style.display = 'block';
        state.innerHTML = '<strong>Gagal memuat Liked Songs</strong>' + esc(err.message || 'Coba lagi.') + '<br><button class="song-btn" id="liked-retry">Coba lagi</button>';
        $('liked-retry').addEventListener('click', refreshLikes);
      });
  }
  function renderLikes() {
    var state = $('liked-state'), list = $('liked-list');
    $('liked-count').textContent = likedSongs.length + ' lagu';
    if (!likedSongs.length) {
      list.innerHTML = '';
      state.style.display = 'block';
      state.innerHTML = '<img class="liked-empty-art" src="assets/covers/liked-songs-default.png" alt=""><strong>Belum ada lagu yang disukai</strong>Lagu yang kamu sukai akan muncul di sini.<br><button type="button" class="song-btn primary" data-route="discover">Cari lagu di Discover</button>';
      return;
    }
    state.style.display = 'none';
    list.innerHTML = likedSongs.map(function (row, i) {
      var song = row.songs, cover = songCoverUrl(song);
      return '<li class="song-row"><div class="song-cover"><span class="song-cover-fallback">' + ICONS.note + '</span>' + (cover ? '<img src="' + esc(cover) + '" alt="" onerror="this.remove()">' : '') + '</div>' +
        '<div class="song-meta"><p class="song-title">' + esc(song.title) + '</p><p class="song-sub">' + esc(song.artist || song.owner_name || 'Pengguna Chiroot') + ' · Disukai ' + esc(fmtDate(row.added_at)) + '</p></div>' +
        '<div class="song-actions"><button class="song-btn primary" data-liked-play="' + i + '">' + ICONS.play + ' Putar</button><button class="song-btn" data-like-source="liked" data-like-index="' + i + '" aria-label="Hapus dari Liked Songs">♥</button></div></li>';
    }).join('');
  }
  function toggleLike(song) {
    if (!authed()) { showToast('Login untuk menyukai lagu.'); return; }
    var owner = uid();
    var path = '/rest/v1/song_likes?user_id=eq.' + encodeURIComponent(owner) + '&song_id=eq.' + encodeURIComponent(song.id);
    caApiCall(path + '&select=song_id', 'GET').then(function (rows) {
      if (!authed() || uid() !== owner) throw new Error('Akun telah berubah.');
      return rows && rows.length ? caApiCall(path, 'DELETE').then(function () { return false; }) :
        caApiCall('/rest/v1/song_likes', 'POST', { user_id: owner, song_id: song.id }).then(function () { return true; });
    }).then(function (liked) {
      if (uid() === owner && likeStateOwner === owner) { if (liked) likedIds[song.id] = true; else delete likedIds[song.id]; updateLikeLabels(); }
      showToast(liked ? 'Ditambahkan ke Liked Songs ✓' : 'Dihapus dari Liked Songs');
      if (currentRoute() === 'liked' && likesOwner === owner) refreshLikes();
    }).catch(function (err) { showToast('Gagal menyimpan: ' + (err.message || err)); });
  }
  function closeSongMenus(except) {
    document.querySelectorAll('details.song-menu[open]').forEach(function (menu) { if (menu !== except) menu.open = false; });
  }
  document.addEventListener('click', function (e) {
    var summary = e.target.closest('.song-menu summary');
    if (summary) closeSongMenus(summary.parentNode);
    else if (!e.target.closest('.song-menu')) closeSongMenus();
    var button = e.target.closest('[data-like-source]');
    if (button) {
      var i = Number(button.dataset.likeIndex), source = button.dataset.likeSource;
      var song = source === 'discover' ? discState.items[i] : source === 'mine' ? songsCache[i] : likedSongs[i] && likedSongs[i].songs;
      closeSongMenus(); if (song) toggleLike(song);
    }
    var playButton = e.target.closest('[data-liked-play]');
    if (playButton && likedSongs[Number(playButton.dataset.likedPlay)]) playSong(likedSongs[Number(playButton.dataset.likedPlay)].songs);
    if (e.target.closest('.song-menu-panel button')) closeSongMenus();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var open = document.querySelector('details.song-menu[open]');
      if (open) { var summary = open.querySelector('summary'); closeSongMenus(); summary.focus(); }
    }
  });

  /* Desktop bar uses the same legacy audio element and queue as the main player. */
  (function () {
    var bar = $('persistent-player'), seek = $('persistent-seek'), volume = $('persistent-volume');
    function sync() {
      var track = (typeof isEggActive !== 'undefined' && isEggActive && activeEggTrack) || (tracks && tracks[currentIndex]);
      var active = !!(track && audio.getAttribute('src'));
      bar.hidden = !active;
      document.body.classList.toggle('has-persistent-player', active);
      if (!active) return;
      $('persistent-like').hidden = !track._songId;
      updateLikeLabels();
      $('persistent-title').textContent = track.title || 'Tanpa judul';
      $('persistent-artist').textContent = track.artist || 'Pengguna Chiroot';
      var cover = $('persistent-cover');
      if (track.cover) { if (cover.getAttribute('src') !== track.cover) cover.src = track.cover; cover.hidden = false; }
      else { cover.removeAttribute('src'); cover.hidden = true; }
      $('persistent-play').textContent = audio.paused ? '▶' : '❚❚';
      $('persistent-play').setAttribute('aria-label', audio.paused ? 'Putar' : 'Jeda');
      var duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      $('persistent-time').textContent = fmtDur(audio.currentTime) || '0:00';
      $('persistent-duration').textContent = fmtDur(duration) || '0:00';
      seek.disabled = !duration;
      if (document.activeElement !== seek) seek.value = duration ? audio.currentTime / duration * 100 : 0;
      if (document.activeElement !== volume) volume.value = audio.volume;
    }
    $('persistent-like').addEventListener('click', function () { var t = tracks && tracks[currentIndex]; if (t && t._songId) toggleLike({ id: t._songId }); });
    $('persistent-play').addEventListener('click', function () { if (audio.paused) play(); else pause(); });
    $('persistent-prev').addEventListener('click', function () { prevTrack(); });
    $('persistent-next').addEventListener('click', function () { nextTrack(); });
    seek.addEventListener('input', function () { if (Number.isFinite(audio.duration)) audio.currentTime = audio.duration * Number(seek.value) / 100; });
    volume.addEventListener('input', function () { audio.volume = Number(volume.value); });
    ['loadstart', 'loadedmetadata', 'timeupdate', 'play', 'pause', 'ended', 'emptied', 'volumechange', 'error'].forEach(function (event) { audio.addEventListener(event, sync); });
    audio.addEventListener('error', function () { if (audio.getAttribute('src')) showToast('Audio tidak tersedia. Coba lagi.'); });
    sync();
  })();

  /* ==================================================================
     INIT
     ================================================================== */
  renderProfileBox();
  refreshLikeStates();
  renderRoute();

  /* Mode COVER: mirror cover dari label vinyl (tanpa menyentuh kode legacy).
     Synchronize: ganti lagu di crate akan otomatis memperbarui cover besar. */
  (function () {
    var labelInner = document.querySelector('#record-label .label-inner') || document.querySelector('.label-inner');
    var img = $('cover-stage-img');
    var fb = $('cover-stage-fallback');
    if (!labelInner || !img || !fb) return;
    function mirror() {
      var srcImg = labelInner.querySelector('img');
      var src = srcImg ? srcImg.getAttribute('src') : '';
      if (src) {
        img.src = src;
        img.style.display = '';
        fb.style.display = 'none';
      } else {
        img.removeAttribute('src');
        img.style.display = 'none';
        fb.style.display = '';
      }
    }
    img.addEventListener('error', mirror);
    new MutationObserver(mirror).observe(labelInner, { childList: true, subtree: true });
    mirror();
  })();
})();
