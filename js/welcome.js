/* Chiroot welcome — Google-only sign-in (PKCE, flow identik dengan Main.html).
   Konstanta Supabase dibaca dari window.CHIROOT_CONFIG bila ada, sama seperti Main.html. */
(function () {
  'use strict';

  var SUPABASE_URL = (window.CHIROOT_CONFIG && window.CHIROOT_CONFIG.SUPABASE_URL) ||
    'https://astuagdezahmuuwjoghf.supabase.co';
  var SUPABASE_PUBLISHABLE_KEY =
    ((window.CHIROOT_CONFIG && (
      window.CHIROOT_CONFIG.SUPABASE_PUBLISHABLE_KEY ||
      window.CHIROOT_CONFIG.SUPABASE_ANON_KEY)) ||
      'sb_publishable_NXhR-MquEMwYDrCBPAOgAQ_MZ4BXQlT');

  var AUTH_KEY = 'chiroot_auth_v1';
  var PKCE_KEY = 'chiroot_pkce_v1';
  var GUEST_OK_KEY = 'chiroot_guest_ok';
  var APP_URL = 'Main.html';

  function $(id) { return document.getElementById(id); }
  function base() { return String(SUPABASE_URL).trim().replace(/\/+$/, ''); }

  function setStatus(msg, isError, spinner) {
    var el = $('wl-status');
    if (!el) return;
    el.className = 'wl-status' + (isError ? ' error' : '');
    el.innerHTML = (spinner ? '<span class="wl-spinner"></span>' : '') + escapeHtml(msg);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function appUrlWithParams() {
    try {
      var params = new URLSearchParams(window.location.search);
      var song = params.get('song');
      return song ? APP_URL + '?song=' + encodeURIComponent(song) : APP_URL;
    } catch (e) { return APP_URL; }
  }

  function readSession() {
    try {
      var raw = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
      if (!raw || typeof raw !== 'object') return null;
      if (typeof raw.access_token !== 'string' || !raw.access_token) return null;
      if (!raw.user || typeof raw.user.id !== 'string') return null;
      if (typeof raw.expires_at !== 'number' || raw.expires_at <= Date.now()) return null;
      return raw;
    } catch (e) { return null; }
  }

  function b64url(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function pkcePair() {
    var bytes = new Uint8Array(48);
    crypto.getRandomValues(bytes);
    var verifier = b64url(bytes);
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)).then(function (digest) {
      return { verifier: verifier, challenge: b64url(new Uint8Array(digest)) };
    });
  }

  function setBusy(busy) {
    var btn = $('wl-login');
    if (!btn) return;
    btn.disabled = busy;
    var span = btn.querySelector('span');
    if (span) span.textContent = busy ? 'Membuka Google…' : 'Sign in with Google';
  }

  function startLogin() {
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || SUPABASE_PUBLISHABLE_KEY.indexOf('YOUR_') === 0) {
      setStatus('Konfigurasi Supabase belum lengkap. Hubungi developer Chiroot.', true, false);
      return;
    }
    if (!window.crypto || !crypto.subtle || typeof crypto.getRandomValues !== 'function') {
      setStatus('Browser kamu tidak mendukung kriptografi aman. Pakai browser terbaru.', true, false);
      return;
    }
    setBusy(true);
    setStatus('Menyiapkan login…', false, true);
    pkcePair()
      .then(function (pair) {
        try { sessionStorage.setItem(PKCE_KEY, pair.verifier); } catch (e) {}
        try { localStorage.setItem(PKCE_KEY + '_backup', pair.verifier); } catch (e) {}
        var params = new URLSearchParams();
        params.set('provider', 'google');
        params.set('code_challenge', pair.challenge);
        params.set('code_challenge_method', 'S256');
        params.set('redirect_to', new URL(appUrlWithParams(), window.location.href).toString());
        window.location.assign(base() + '/auth/v1/authorize?' + params.toString());
      })
      .catch(function () {
        setBusy(false);
        setStatus('Gagal menyiapkan login. Coba lagi.', true, false);
      });
  }

  function continueAsGuest() {
    try { localStorage.setItem(GUEST_OK_KEY, '1'); } catch (e) {}
    setStatus('Masuk sebagai Guest…', false, true);
    window.location.replace(APP_URL);
  }

  function boot() {
    // login dibatalkan / ditolak Google
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get('error')) {
        var desc = params.get('error_description') || '';
        var msg = /access_denied|cancelled/i.test(params.get('error') + ' ' + desc)
          ? 'Login dibatalkan. Silakan coba lagi.'
          : 'Login gagal: ' + (desc || params.get('error'));
        setStatus(msg, true, false);
        history.replaceState(null, '', window.location.pathname);
        return; // jangan redirect otomatis saat error
      }
    } catch (e) {}

    // sudah punya sesi valid -> langsung ke aplikasi
    if (readSession()) {
      setStatus('Sesi ditemukan, meneruskan ke Chiroot…', false, true);
      window.location.replace(appUrlWithParams());
      return;
    }

    var btn = $('wl-login');
    var guest = $('wl-guest');
    if (btn) btn.addEventListener('click', startLogin);
    if (guest) guest.addEventListener('click', continueAsGuest);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
