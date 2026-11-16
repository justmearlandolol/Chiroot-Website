(function () {
  'use strict';

  var STORE_KEY = 'chiroot_recap_store_v2';
  var RECAP_WINDOW_DAYS = 3;
  var LEGACY_KEY = 'gramophone_monthly_stats_v1';
  var STATE = {
    ready: false,
    open: false,
    busy: false,
    slides: [],
    index: 0,
    timer: null,
    ticker: null,
    flushTimer: null,
    bg: null,
    mainWasPlaying: false,
    data: null,
    summaryCache: {},
    prevScroll: 0,
    manualIntent: false,
    srcMap: {}
  };

  var MONTH_NAMES = ['JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI', 'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'];
  var MONTH_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
  var DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  var STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.6l2.4 6.1 6.5.4-5 4.1 1.6 6.3-5.5-3.6-5.5 3.6 1.6-6.3-5-4.1 6.5-.4z" fill="currentColor"/></svg>';

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function monthKeyOf(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1); }
  function dayKeyOf(d) { return monthKeyOf(d) + '-' + pad2(d.getDate()); }
  function yearKeyOf(d) { return String(d.getFullYear()); }
  function monthIndex(key) { return parseInt(String(key).slice(5, 7), 10) - 1; }
  function monthLabel(key) { return MONTH_NAMES[monthIndex(key)] + ' ' + key.slice(0, 4); }
  function shiftMonth(key, delta) {
    var y = parseInt(key.slice(0, 4), 10);
    var m = monthIndex(key) + delta;
    y += Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    return y + '-' + pad2(m + 1);
  }
  function num(n) { return new Intl.NumberFormat('id-ID').format(Math.max(0, Math.round(n || 0))); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function safeImg(u) {
    if (!u) return '';
    try { if (typeof caSafeImageUrl === 'function') return caSafeImageUrl(u) || ''; } catch (e) {}
    return String(u);
  }
  function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }
  function hashSeed(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h;
  }
  function prng(seed) {
    var s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  function emptyStore() { return { v: 2, months: {}, pending: { days: {}, tracks: {} }, marks: {} }; }

  function migrateLegacy() {
    var fresh = emptyStore();
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null'); } catch (e) { raw = null; }
    if (raw && typeof raw === 'object') {
      var mk = raw.currentMonth || monthKeyOf(new Date());
      var m = { usage: Number(raw.totalUsageSeconds || 0), listen: 0, night: 0, days: {}, tracks: {} };
      Object.keys(raw.tracks || {}).forEach(function (id) {
        var t = raw.tracks[id] || {};
        m.tracks[id] = {
          title: String(t.title || ''),
          artist: String(t.artist || ''),
          cover: safeImg(t.cover),
          plays: Number(t.playCount || 0),
          loops: 0,
          listen: Number(t.playSeconds || 0)
        };
        m.listen += Number(t.playSeconds || 0);
      });
      fresh.months[mk] = m;
      if (raw.lastReportShown) fresh.marks['month:' + raw.lastReportShown] = 1;
    }
    return fresh;
  }

  function readStore() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { s = null; }
    if (!s || typeof s !== 'object' || s.v !== 2) s = migrateLegacy();
    if (!s.months || typeof s.months !== 'object') s.months = {};
    if (!s.pending || typeof s.pending !== 'object') s.pending = { days: {}, tracks: {} };
    if (!s.pending.days) s.pending.days = {};
    if (!s.pending.tracks) s.pending.tracks = {};
    if (!s.marks || typeof s.marks !== 'object') s.marks = {};
    pruneStore(s);
    return s;
  }

  function pruneStore(s) {
    var keys = Object.keys(s.months).sort();
    if (keys.length <= 18) return;
    keys.slice(0, keys.length - 18).forEach(function (k) { delete s.months[k]; });
  }

  var store = readStore();
  var persistTimer = null;

  function persist() {
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {}
  }
  function schedulePersist() {
    if (persistTimer) return;
    persistTimer = setTimeout(persist, 4000);
  }

  function ensureMonth(key) {
    if (!store.months[key]) store.months[key] = { usage: 0, listen: 0, night: 0, days: {}, tracks: {} };
    var m = store.months[key];
    if (!m.days) m.days = {};
    if (!m.tracks) m.tracks = {};
    return m;
  }

  function ensureTrack(m, track) {
    var r = m.tracks[track.id];
    if (!r) {
      r = m.tracks[track.id] = { title: '', artist: '', cover: '', plays: 0, loops: 0, listen: 0 };
    }
    if (track.title) r.title = String(track.title).slice(0, 160);
    if (track.artist) r.artist = String(track.artist).slice(0, 160);
    var c = safeImg(track.cover);
    if (c) r.cover = c;
    if (track.src && /^(https?:|blob:|data:)/i.test(String(track.src))) STATE.srcMap[track.id] = track.src;
    return r;
  }

  function bumpDay(m, dk, u, l, n) {
    var d = m.days[dk];
    if (!d) d = m.days[dk] = { usage: 0, listen: 0, night: 0 };
    d.usage += u; d.listen += l; d.night += n;
    var p = store.pending.days[dk];
    if (!p) p = store.pending.days[dk] = { u: 0, l: 0, n: 0 };
    p.u += u; p.l += l; p.n += n;
  }

  function bumpPendingTrack(mk, id, r, plays, loops, listen) {
    var key = mk + '|' + id;
    var p = store.pending.tracks[key];
    if (!p) p = store.pending.tracks[key] = { month: mk, id: id, title: r.title || '', artist: r.artist || '', cover: r.cover || '', plays: 0, loops: 0, listen: 0 };
    p.title = r.title || p.title;
    p.artist = r.artist || p.artist;
    if (r.cover) p.cover = r.cover;
    p.plays += plays; p.loops += loops; p.listen += listen;
  }

  function activeTrack() {
    try {
      if (typeof tracks !== 'undefined' && tracks && tracks.length && tracks[currentIndex]) return tracks[currentIndex];
    } catch (e) {}
    return null;
  }
  function audioEl() { return document.getElementById('audio'); }
  function isAudioPlaying() {
    var a = audioEl();
    if (!a || a.paused || a.ended) return false;
    if (typeof isPlaying !== 'undefined' && !isPlaying) return a.currentTime > 0.2;
    return true;
  }
  function isNightTime(d) { var h = d.getHours(); return h >= 22 || h < 4; }

  var clock = { ts: Date.now(), lastCT: 0, lastPlayId: '', lastPlayAt: 0 };

  function tick() {
    var now = Date.now();
    var dt = now - clock.ts;
    clock.ts = now;
    if (dt <= 0 || dt > 8000) dt = 1000;
    var secs = Math.round(dt / 1000);
    if (secs <= 0) return;
    var visible = !document.hidden;
    var tr = activeTrack();
    var playing = isAudioPlaying() && !!(tr && tr.id) && !STATE.open;
    if (!visible && !playing) return;
    var when = new Date();
    var mk = monthKeyOf(when);
    var dk = dayKeyOf(when);
    var m = ensureMonth(mk);
    if (visible) {
      m.usage += secs;
      bumpDay(m, dk, secs, 0, 0);
    }
    if (playing) {
      var night = isNightTime(when);
      m.listen += secs;
      bumpDay(m, dk, 0, secs, night ? secs : 0);
      var r = ensureTrack(m, tr);
      r.listen += secs;
      bumpPendingTrack(mk, tr.id, r, 0, 0, secs);
    }
    schedulePersist();
  }

  function registerPlay(track, loopReplay) {
    if (!track || !track.id) return;
    var now = Date.now();
    var looping = !!loopReplay;
    if (!looping) {
      try { if (typeof isLoop !== 'undefined' && isLoop) looping = true; } catch (e) {}
    }
    if (!loopReplay && !looping && track.id === clock.lastPlayId && now - clock.lastPlayAt < 1500) return;
    var mk = monthKeyOf(new Date());
    var m = ensureMonth(mk);
    var r = ensureTrack(m, track);
    r.plays += 1;
    if (looping) r.loops += 1;
    bumpPendingTrack(mk, track.id, r, 1, looping ? 1 : 0, 0);
    clock.lastPlayId = track.id;
    clock.lastPlayAt = now;
    schedulePersist();
    pushLegacyPlayEvent(track);
  }

  function pushLegacyPlayEvent(track) {
    try {
      if (!(window.ChirootAuth && ChirootAuth.session && ChirootAuth.session.user)) return;
      if (typeof caApiCall !== 'function') return;
      caApiCall('/rest/v1/play_events', 'POST', {
        user_id: ChirootAuth.session.user.id,
        track_id: String(track.id),
        title: String(track.title || '').slice(0, 120),
        artist: String(track.artist || '').slice(0, 120)
      }).catch(function () {});
    } catch (e) {}
  }

  function bindAudioHooks() {
    var a = audioEl();
    if (!a || a._recapBound) return;
    a._recapBound = true;
    a.addEventListener('timeupdate', function () {
      var ct = a.currentTime || 0;
      var dur = a.duration || 0;
      if (dur > 3 && clock.lastCT > dur - 4 && ct + 1 < clock.lastCT) {
        var tr = activeTrack();
        if (tr && tr.id) registerPlay(tr, true);
      }
      clock.lastCT = ct;
    });
    a.addEventListener('play', function () {
      var tr = activeTrack();
      if (!tr || !tr.id) return;
      if ((a.currentTime || 0) > 2.5) return;
      if (tr.id === clock.lastPlayId && Date.now() - clock.lastPlayAt < 1500) return;
      registerPlay(tr, false);
    });
  }

  function cloudReady() {
    try {
      return !!(window.ChirootAuth && ChirootAuth.session && ChirootAuth.session.user && ChirootAuth.session.user.id);
    } catch (e) { return false; }
  }
  function uid() { return ChirootAuth.session.user.id; }

  function api(path, method, body) {
    if (typeof caApiCall === 'function') return caApiCall(path, method, body);
    var base = String((typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL) || '').replace(/\/+$/, '');
    var key = String((typeof SUPABASE_PUBLISHABLE_KEY !== 'undefined' && SUPABASE_PUBLISHABLE_KEY) || '');
    var headers = { apikey: key, Authorization: 'Bearer ' + (ChirootAuth.session.access_token || key) };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      headers.Prefer = 'return=representation';
    }
    return fetch(base + path, { method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body) })
      .then(function (res) { return res.text().then(function (txt) { var d = null; try { d = txt ? JSON.parse(txt) : null; } catch (e) {} if (!res.ok) throw new Error('HTTP ' + res.status); return d; }); });
  }

  function pendingPayload() {
    var usage = [];
    var trks = [];
    Object.keys(store.pending.days).forEach(function (k) {
      var p = store.pending.days[k];
      var u = Math.floor(p.u), l = Math.floor(p.l), n = Math.floor(p.n);
      if (u || l || n) usage.push({ day: k, usage_seconds: u, listen_seconds: l, night_seconds: n });
    });
    Object.keys(store.pending.tracks).forEach(function (k) {
      var p = store.pending.tracks[k];
      if (p.plays || p.loops || p.listen) trks.push({
        month_key: p.month,
        track_id: String(p.id).slice(0, 120),
        title: String(p.title || '').slice(0, 160),
        artist: String(p.artist || '').slice(0, 160),
        cover_url: p.cover || null,
        play_inc: p.plays,
        loop_inc: p.loops,
        listen_inc: Math.floor(p.listen)
      });
    });
    return { usage: usage, tracks: trks };
  }

  function cloudFlush() {
    if (!cloudReady()) return Promise.resolve(false);
    var payload = pendingPayload();
    if (!payload.usage.length && !payload.tracks.length) return Promise.resolve(true);
    return api('/rest/v1/rpc/recap_ingest', 'POST', { p_usage: payload.usage, p_tracks: payload.tracks })
      .then(function () {
        payload.usage.forEach(function (d) {
          var p = store.pending.days[d.day];
          if (!p) return;
          p.u -= d.usage_seconds; p.l -= d.listen_seconds; p.n -= d.night_seconds;
          if (p.u <= 0 && p.l <= 0 && p.n <= 0) delete store.pending.days[d.day];
        });
        payload.tracks.forEach(function (t) {
          var k = t.month_key + '|' + t.track_id;
          var p = store.pending.tracks[k];
          if (!p) return;
          p.plays -= t.play_inc; p.loops -= t.loop_inc; p.listen -= t.listen_inc;
          if (p.plays <= 0 && p.loops <= 0 && p.listen <= 0) delete store.pending.tracks[k];
        });
        persist();
        return true;
      })
      .catch(function () { return false; });
  }

  function pendingKeepalive() {
    if (!cloudReady()) return;
    var payload = pendingPayload();
    if (!payload.usage.length && !payload.tracks.length) return;
    try {
      var base = String((typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL) || '').replace(/\/+$/, '');
      var key = String((typeof SUPABASE_PUBLISHABLE_KEY !== 'undefined' && SUPABASE_PUBLISHABLE_KEY) || '');
      fetch(base + '/rest/v1/rpc/recap_ingest', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + (ChirootAuth.session.access_token || key) },
        body: JSON.stringify({ p_usage: payload.usage, p_tracks: payload.tracks })
      }).catch(function () {});
    } catch (e) {}
  }

  function cloudSummary(kind, key) {
    var ck = kind + ':' + key;
    if (STATE.summaryCache[ck] !== undefined) return Promise.resolve(STATE.summaryCache[ck]);
    if (!cloudReady()) return Promise.resolve(null);
    return api('/rest/v1/rpc/recap_summary', 'POST', { p_kind: kind, p_key: key })
      .then(function (res) {
        var payload = Array.isArray(res) ? res[0] : res;
        if (!payload || typeof payload !== 'object' || payload.error) { STATE.summaryCache[ck] = null; return null; }
        (payload.marks || []).forEach(function (m) { if (m) store.marks[m] = 1; });
        STATE.summaryCache[ck] = payload;
        return payload;
      })
      .catch(function () { STATE.summaryCache[ck] = null; return null; });
  }

  function cloudMarkShown(periodKey, localOnly) {
    store.marks[periodKey] = 1;
    persist();
    if (localOnly || !cloudReady()) return Promise.resolve(false);
    return api('/rest/v1/rpc/recap_mark_shown', 'POST', { p_period_key: periodKey }).catch(function () { return false; });
  }

  function periodMatches(kind, key, mk) {
    if (kind === 'month') return mk === key;
    return mk.slice(0, 4) === key;
  }

  function mergeTrackInto(bucket, id, t) {
    var o = bucket[id];
    if (!o) o = bucket[id] = { id: id, title: t.title || '', artist: t.artist || '', cover: t.cover || '', plays: 0, loops: 0, listen: 0, src: t.src || '' };
    o.plays += Number(t.plays || 0);
    o.loops += Number(t.loops || 0);
    o.listen += Number(t.listen || 0);
    if (t.title) o.title = t.title;
    if (t.artist) o.artist = t.artist;
    if (t.cover) o.cover = t.cover;
    if (t.src) o.src = t.src;
    return o;
  }

  function mergeDayInto(bucket, dk, d) {
    var o = bucket[dk];
    if (!o) o = bucket[dk] = { usage: 0, listen: 0, night: 0 };
    o.usage += Number(d.usage || 0);
    o.listen += Number(d.listen || 0);
    o.night += Number(d.night || 0);
  }

  function localPeriod(kind, key) {
    var out = { usage: 0, listen: 0, night: 0, tracks: {}, days: {} };
    Object.keys(store.months).forEach(function (mk) {
      if (!periodMatches(kind, key, mk)) return;
      var m = store.months[mk];
      out.usage += m.usage || 0;
      out.listen += m.listen || 0;
      out.night += m.night || 0;
      Object.keys(m.days || {}).forEach(function (dk) { mergeDayInto(out.days, dk, m.days[dk]); });
      Object.keys(m.tracks || {}).forEach(function (id) {
        var t = m.tracks[id];
        mergeTrackInto(out.tracks, id, { title: t.title, artist: t.artist, cover: t.cover, plays: t.plays, loops: t.loops, listen: t.listen, src: STATE.srcMap[id] || '' });
      });
    });
    return out;
  }

  function pendingPeriod(kind, key) {
    var out = { usage: 0, listen: 0, night: 0, tracks: {}, days: {} };
    Object.keys(store.pending.days).forEach(function (dk) {
      var mk = dk.slice(0, 7);
      if (!periodMatches(kind, key, mk)) return;
      var p = store.pending.days[dk];
      mergeDayInto(out.days, dk, { usage: p.u, listen: p.l, night: p.n });
      out.usage += p.u; out.listen += p.l; out.night += p.n;
    });
    Object.keys(store.pending.tracks).forEach(function (k) {
      var p = store.pending.tracks[k];
      if (!periodMatches(kind, key, p.month)) return;
      mergeTrackInto(out.tracks, p.id, { title: p.title, artist: p.artist, cover: p.cover, plays: p.plays, loops: p.loops, listen: p.listen, src: STATE.srcMap[p.id] || '' });
      out.usage += 0;
    });
    return out;
  }

  function fromCloud(cloud) {
    var out = { usage: 0, listen: 0, night: 0, tracks: {}, days: {} };
    out.usage = Number(cloud.usage_seconds || 0);
    out.listen = Number(cloud.listen_seconds || 0);
    out.night = Number(cloud.night_seconds || 0);
    (cloud.days || []).forEach(function (d) { if (d && d.day) mergeDayInto(out.days, d.day, { usage: d.usage_seconds, listen: d.listen_seconds, night: d.night_seconds }); });
    (cloud.tracks || []).forEach(function (t) {
      if (!t || !t.track_id) return;
      mergeTrackInto(out.tracks, t.track_id, { title: t.title, artist: t.artist, cover: t.cover_url, plays: t.play_count, loops: t.loop_count, listen: t.listen_seconds, src: STATE.srcMap[t.track_id] || '' });
    });
    return out;
  }

  function absorb(base, add) {
    base.usage += add.usage; base.listen += add.listen; base.night += add.night;
    Object.keys(add.days).forEach(function (dk) { mergeDayInto(base.days, dk, add.days[dk]); });
    Object.keys(add.tracks).forEach(function (id) { mergeTrackInto(base.tracks, id, add.tracks[id]); });
    return base;
  }

  function mergedPeriod(kind, key, cloud) {
    var local = localPeriod(kind, key);
    if (!cloud) return local;
    var out = absorb(fromCloud(cloud), pendingPeriod(kind, key));
    if (!out.usage && !out.listen && local.usage) return local;
    return out;
  }

  function topEntries(bucket, limit) {
    var list = Object.keys(bucket).map(function (k) { return bucket[k]; });
    list.sort(function (a, b) {
      return (b.listen - a.listen) || (b.plays - a.plays) || String(a.title).localeCompare(String(b.title));
    });
    return list.slice(0, limit || 50).filter(function (t) { return (t.plays > 0 || t.listen > 0); });
  }

  function aggregateArtists(trackList) {
    var map = {};
    trackList.forEach(function (t) {
      var name = String(t.artist || 'Unknown Artist').trim() || 'Unknown Artist';
      var key = name.toLowerCase();
      var a = map[key];
      if (!a) a = map[key] = { name: name, plays: 0, listen: 0, cover: '', tracks: 0 };
      a.plays += t.plays; a.listen += t.listen; a.tracks += 1;
      if (!a.cover && t.cover) a.cover = t.cover;
      if (t.artist) a.name = name;
    });
    var list = Object.keys(map).map(function (k) { return map[k]; });
    list.sort(function (a, b) { return (b.listen - a.listen) || (b.plays - a.plays) || a.name.localeCompare(b.name); });
    return list;
  }

  function biggestDay(dayBucket) {
    var best = null;
    Object.keys(dayBucket).forEach(function (dk) {
      var d = dayBucket[dk];
      if (!best || d.listen > best.listen) best = { day: dk, listen: d.listen, usage: d.usage };
    });
    return best && best.listen > 0 ? best : null;
  }

  function formatDay(dk) {
    var parts = String(dk).split('-');
    var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d.getDate() + ' ' + MONTH_SHORT[d.getMonth()].charAt(0) + MONTH_SHORT[d.getMonth()].slice(1).toLowerCase();
  }

  function pickWords(stats) {
    var words = [];
    var loopRatio = stats.plays ? stats.loops / stats.plays : 0;
    var nightRatio = stats.listen ? stats.night / stats.listen : 0;
    var topShare = stats.listen ? (stats.topTrack ? stats.topTrack.listen / stats.listen : 0) : 0;
    if (loopRatio >= 0.22) words.push({ w: 'LOOP OBSESSED', d: 'kamu putar ulang lagu yang sama sampai hafal liriknya' });
    if (nightRatio >= 0.28) words.push({ w: 'NIGHT OWL', d: 'piringan hitam paling sering berputar lewat tengah malam' });
    if (stats.distinctTracks >= 8) words.push({ w: 'CRATE DIGGER', d: 'crate kamu luas, jarang betah di satu lagu' });
    if (topShare >= 0.45 && stats.topTrack) words.push({ w: 'LOYAL FAN', d: stats.topTrack.title + ' mendominasi hampir separuh waktu dengar kamu' });
    if (stats.biggestDay && stats.biggestDay.listen >= 3600) words.push({ w: 'MARATHONER', d: 'ada satu hari yang kamu dengar lebih dari satu jam non-stop' });
    if (stats.usage >= 3600 * 8) words.push({ w: 'RESIDENT', d: 'Chiroot jadi bagian rutinitas harian kamu' });
    if (words.length < 3) words.push({ w: 'STEADY SPINNER', d: 'ritme dengar kamu stabil dari hari ke hari' });
    if (words.length < 3) words.push({ w: 'SOFT LISTENER', d: 'volume kecil, tapi frekuensi dengar rapi' });
    if (words.length < 3) words.push({ w: 'COLLECTOR', d: 'setiap lagu di crate dapat panggungnya sendiri' });
    return words.slice(0, 3);
  }

  function buildTimeline(kind, key, dayBucket) {
    var buckets = [];
    if (kind === 'year') {
      for (var m = 0; m < 12; m++) {
        var mk = key + '-' + pad2(m + 1);
        var total = 0;
        Object.keys(dayBucket).forEach(function (dk) { if (dk.slice(0, 7) === mk) total += dayBucket[dk].listen; });
        buckets.push({ label: MONTH_SHORT[m], value: total });
      }
    } else {
      var ranges = [[1, 7], [8, 14], [15, 21], [22, 31]];
      ranges.forEach(function (r, i) {
        var total = 0;
        Object.keys(dayBucket).forEach(function (dk) {
          if (dk.slice(0, 7) !== key) return;
          var day = parseInt(dk.slice(8, 10), 10);
          if (day >= r[0] && day <= r[1]) total += dayBucket[dk].listen;
        });
        buckets.push({ label: 'W' + (i + 1), value: total });
      });
    }
    var max = 1;
    buckets.forEach(function (b) { if (b.value > max) max = b.value; });
    buckets.forEach(function (b) { b.pct = Math.max(4, Math.round((b.value / max) * 100)); });
    return buckets;
  }

  function buildRecapData(kind, key, merged, prevMerged) {
    var trackList = topEntries(merged.tracks, 200);
    var totalPlays = 0;
    trackList.forEach(function (t) { totalPlays += t.plays; });
    var artists = aggregateArtists(trackList);
    var top = trackList[0] || null;
    var data = {
      kind: kind,
      key: key,
      label: kind === 'month' ? monthLabel(key) : ('TAHUN ' + key),
      shortLabel: kind === 'month' ? (MONTH_NAMES[monthIndex(key)] + ' ' + key.slice(0, 4)) : key,
      usage: merged.usage,
      listen: merged.listen,
      night: merged.night,
      plays: totalPlays,
      tracks: trackList,
      artists: artists,
      topTrack: top,
      topArtist: artists[0] || null,
      distinctTracks: trackList.length,
      distinctArtists: artists.length,
      loops: trackList.reduce(function (a, t) { return a + t.loops; }, 0),
      biggestDay: biggestDay(merged.days),
      timeline: buildTimeline(kind, key, merged.days),
      hasData: merged.usage > 0 || merged.listen > 0 || totalPlays > 0,
      prev: prevMerged ? {
        usage: prevMerged.usage,
        listen: prevMerged.listen,
        plays: Object.keys(prevMerged.tracks).reduce(function (a, k) { return a + prevMerged.tracks[k].plays; }, 0)
      } : null
    };
    data.words = pickWords(data);
    data.topShare = data.listen && top ? Math.round((top.listen / data.listen) * 100) : 0;
    return data;
  }

  function loadRecap(kind, key) {
    STATE.busy = true;
    var prevKey = kind === 'month' ? shiftMonth(key, -1) : String(parseInt(key, 10) - 1);
    return cloudFlush().then(function () {
      return Promise.all([cloudSummary(kind, key), cloudSummary(kind, prevKey)]);
    }).then(function (res) {
      var merged = mergedPeriod(kind, key, res[0]);
      var prev = mergedPeriod(kind, prevKey, res[1]);
      var data = buildRecapData(kind, key, merged, prev);
      STATE.busy = false;
      return data;
    }).catch(function () {
      var merged = mergedPeriod(kind, key, null);
      var prev = mergedPeriod(kind, prevKey, null);
      STATE.busy = false;
      return buildRecapData(kind, key, merged, prev);
    });
  }

  function palettesFor() {
    return {
      hero: { bg: 'radial-gradient(120% 80% at 20% 8%, #2a0510 0%, #120006 45%, #050505 100%)', a: '#ff2f7d', b: '#b9104b', c: '#ff7a2f', d: '#5c0424' },
      red: { bg: 'linear-gradient(170deg,#ff4a12 0%,#ec1f06 46%,#b60f04 100%)', a: '#8fe04a', b: '#2f9b2a', c: '#0f5c16', d: '#ffd447' },
      blue: { bg: 'linear-gradient(165deg,#25e6f5 0%,#3b46ff 48%,#8a2bd9 100%)', a: '#19d3f3', b: '#5a2bff', c: '#ff2fbf', d: '#7ef6c8' },
      yellow: { bg: 'linear-gradient(170deg,#ffe600 0%,#ffd21f 52%,#f2b705 100%)', a: '#2b2bff', b: '#7c5cff', c: '#00dcc8', d: '#19b3ff', shade: 0.16, extra: 0 },
      dark: { bg: 'linear-gradient(200deg,#04100e 0%,#000 60%,#0a0410 100%)', a: '#2ff5a0', b: '#0f7f5c', c: '#1ee6ff', d: '#0b4f5e' },
      ember: { bg: 'linear-gradient(160deg,#1a0206 0%,#08060a 62%,#000 100%)', a: '#ff3b1f', b: '#c9102f', c: '#ff8a3d', d: '#5c0424' },
      green: { bg: 'linear-gradient(170deg,#00c66a 0%,#0b8f52 55%,#046b3c 100%)', a: '#e9ff4d', b: '#7cff9a', c: '#00513a', d: '#d5ff00' }
    };
  }

  function svgArt(variant, pal, seed) {
    var W = 1080, H = 1920;
    var rand = prng(seed || 7);
    var out = ['<svg class="rc-art-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">'];
    out.push('<defs>');
    out.push('<linearGradient id="rg' + seed + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + pal.a + '"/><stop offset="1" stop-color="' + pal.b + '"/></linearGradient>');
    out.push('<linearGradient id="rg2' + seed + '" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + pal.c + '"/><stop offset="1" stop-color="' + pal.d + '"/></linearGradient>');
    out.push('<filter id="rb' + seed + '" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="22"/></filter>');
    out.push('<filter id="rb2' + seed + '" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="7"/></filter>');
    out.push('</defs>');

    if (variant === 'ribbon') {
      out.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#050506"/>');
      for (var i = 0; i < 4; i++) {
        var cx = 140 + rand() * 800;
        var cy = 160 + i * 240 + rand() * 180;
        var rx = 300 + rand() * 380;
        var ry = 130 + rand() * 170;
        var rot = -34 + rand() * 74;
        var fill = i % 2 === 0 ? 'url(#rg' + seed + ')' : 'url(#rg2' + seed + ')';
        out.push('<g filter="url(#rb' + seed + ')" opacity="' + (0.75 + rand() * 0.25).toFixed(2) + '">');
        out.push('<ellipse cx="' + cx.toFixed(0) + '" cy="' + cy.toFixed(0) + '" rx="' + rx.toFixed(0) + '" ry="' + ry.toFixed(0) + '" fill="' + fill + '" transform="rotate(' + rot.toFixed(0) + ' ' + cx.toFixed(0) + ' ' + cy.toFixed(0) + ')"/>');
        out.push('</g>');
        out.push('<g opacity="0.5" filter="url(#rb2' + seed + ')">');
        out.push('<ellipse cx="' + cx.toFixed(0) + '" cy="' + (cy + 40).toFixed(0) + '" rx="' + (rx * 0.62).toFixed(0) + '" ry="' + (ry * 0.34).toFixed(0) + '" fill="none" stroke="#ffffff" stroke-width="7" transform="rotate(' + rot.toFixed(0) + ' ' + cx.toFixed(0) + ' ' + (cy + 40).toFixed(0) + ')"/>');
        out.push('</g>');
      }
      out.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="url(#rcfade' + seed + ')"/>');
      out.push('<defs><linearGradient id="rcfade' + seed + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0.18" stop-color="#000" stop-opacity="0"/><stop offset="0.52" stop-color="#000" stop-opacity="0.62"/><stop offset="0.78" stop-color="#000" stop-opacity="0.9"/><stop offset="1" stop-color="#000" stop-opacity="0.97"/></linearGradient></defs>');
    } else if (variant === 'tunnel') {
      var colors = [pal.a, pal.b, pal.c, pal.d];
      for (var t = 0; t < 13; t++) {
        var inset = t * 40;
        var bw = W - inset * 2;
        var bh = H - inset * 1.56;
        if (bw <= 24 || bh <= 24) break;
        out.push('<rect x="' + inset + '" y="' + (inset * 0.78).toFixed(0) + '" width="' + bw + '" height="' + bh.toFixed(0) + '" fill="none" stroke="' + colors[t % colors.length] + '" stroke-width="' + Math.max(6, 30 - t) + '" opacity="' + (0.95 - t * 0.05).toFixed(2) + '" rx="' + Math.max(2, 24 - t) + '"/>');
      }
      out.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="url(#rg2' + seed + ')" opacity="' + (pal.extra == null ? 0.25 : pal.extra) + '"/>');
    } else {
      var cols = [pal.a, pal.b, pal.c];
      for (var s = 0; s < 7; s++) {
        var size = 60 + s * 30;
        var bx = W - 40 - s * 62 - size;
        if (bx < 8) break;
        out.push('<rect x="' + (s * 58) + '" y="' + (s * 36) + '" width="' + size + '" height="' + size + '" fill="' + cols[s % cols.length] + '" opacity="' + (0.92 - s * 0.08).toFixed(2) + '"/>');
        out.push('<rect x="' + bx + '" y="' + (s * 30) + '" width="' + size + '" height="' + size + '" fill="' + cols[(s + 1) % cols.length] + '" opacity="' + (0.85 - s * 0.08).toFixed(2) + '"/>');
      }
      out.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="url(#rg' + seed + ')" opacity="0.12"/>');
    }

    out.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="url(#rcshade' + seed + ')" opacity="' + (pal.shade == null ? 0.42 : pal.shade) + '"/>');
    out.push('<defs><linearGradient id="rcshade' + seed + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.25"/><stop offset="0.45" stop-color="#000" stop-opacity="0.05"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></linearGradient></defs>');
    out.push('</svg>');
    return out.join('');
  }

  function thumbHtml(t, size) {
    var cover = safeImg(t && t.cover);
    var cls = 'rc-thumb' + (size === 'lg' ? ' rc-thumb-lg' : '');
    if (cover) return '<span class="' + cls + '" style="background-image:url(&quot;' + esc(cover) + '&quot;)"></span>';
    var initial = String((t && (t.title || t.name)) || '?').trim().charAt(0).toUpperCase() || '?';
    return '<span class="' + cls + ' rc-thumb-empty">' + esc(initial) + '</span>';
  }

  function rowList(items, opts) {
    opts = opts || {};
    if (!items.length) return '<div class="rc-empty">Belum ada data di periode ini.</div>';
    var html = '<ol class="rc-rows">';
    items.slice(0, opts.limit || 5).forEach(function (item, i) {
      var title = item.title || item.name || '-';
      var sub = opts.sub ? opts.sub(item) : (item.artist || '');
      html += '<li class="rc-row">' +
        '<span class="rc-rank">' + (i + 1) + '</span>' +
        thumbHtml(item) +
        '<span class="rc-row-text"><span class="rc-row-title">' + esc(title) + '</span><span class="rc-row-sub">' + esc(sub) + '</span></span>' +
        (opts.metric ? '<span class="rc-row-metric">' + esc(opts.metric(item)) + '</span>' : '') +
        '</li>';
    });
    html += '</ol>';
    return html;
  }

  function footHtml(extra, final) {
    return '<div class="rc-foot"><span class="rc-star">' + STAR_SVG + '</span>' +
      '<span class="rc-foot-hint" data-rc-foothint="1">' + (final ? '' : 'Tap / → untuk lanjut') + '</span>' +
      '<span class="rc-foot-label">' + esc(extra || 'RECAP') + '</span></div>';
  }

  function slideHtml(body, paletteKey, variant, pal, opts) {
    opts = opts || {};
    var scrim = { hero: 0.5, red: 0.34, blue: 0.52, yellow: 0.4, dark: 0.44, green: 0.34 }[paletteKey] || 0.36;
    return '<section class="rc-slide rc-pal-' + paletteKey + '" data-pal="' + paletteKey + '">' +
      '<div class="rc-art" style="background:' + pal.bg + '">' + svgArt(variant, pal, opts.seed || 11) + '</div>' +
      '<div class="rc-scrim" style="opacity:' + scrim + '"></div>' +
      '<div class="rc-inner' + (opts.centered ? ' rc-center' : '') + '">' + body + '</div>' +
      (opts.foot === false ? '' : footHtml(opts.footLabel, opts.final)) +
      '</section>';
  }

  function buildSlides(data) {
    var pal = palettesFor();
    var seedBase = hashSeed(data.key + data.kind + String(data.plays));
    var slides = [];
    var top = data.topTrack;
    var topFive = data.tracks.slice(0, 5);
    var artistFive = data.artists.slice(0, 5);
    var usageHours = Math.floor(data.usage / 3600);
    var usageMinutes = Math.floor((data.usage % 3600) / 60);
    var listenMinutes = Math.round(data.listen / 60);

    slides.push({
      duration: 5600,
      html: slideHtml(
        '<div class="rc-eyebrow">CHIROOT · ' + (data.kind === 'month' ? 'MONTHLY' : 'YEARLY') + ' RECAP</div>' +
        '<div class="rc-hero-block">' +
          '<h1 class="rc-hero-title">' + esc(data.kind === 'month' ? MONTH_NAMES[monthIndex(data.key)] : data.key) + '<br>RECAP</h1>' +
          '<p class="rc-hero-sub">' + (data.kind === 'month' ? esc(data.key.slice(0, 4)) : 'JANUARI — DESEMBER') + ' · ' + num(Math.round(data.listen / 60)) + ' menit didengarkan</p>' +
        '</div>' +
        '<div class="rc-hero-pill">' + num(data.plays) + ' kali putar · ' + data.distinctTracks + ' lagu · ' + data.distinctArtists + ' artis</div>',
        'hero', 'ribbon', pal.hero, { seed: seedBase, footLabel: 'RECAP' }
      )
    });

    slides.push({
      duration: 8600,
      html: slideHtml(
        '<div class="rc-kicker">My minutes listened</div>' +
        '<div class="rc-bignum">' + num(listenMinutes) + '<span class="rc-bignum-unit">MENIT</span></div>' +
        '<div class="rc-sublead">Setara ' + num(usageHours) + ' jam ' + num(usageMinutes) + ' menit di dalam app — dari buka Chiroot sampai lagu terakhir, digabung dari semua device yang login.</div>' +
        '<div class="rc-statgrid">' +
          '<div class="rc-statcard"><span class="rc-statk">WAKTU DI APP</span><span class="rc-statv">' + num(usageHours) + ' jam</span></div>' +
          '<div class="rc-statcard"><span class="rc-statk">LAGU DIPUTAR</span><span class="rc-statv">' + num(data.plays) + '</span></div>' +
          '<div class="rc-statcard"><span class="rc-statk">DI-LOOP ULANG</span><span class="rc-statv">' + num(data.loops) + '</span></div>' +
          '<div class="rc-statcard"><span class="rc-statk">ARTIS UNIK</span><span class="rc-statv">' + num(data.distinctArtists) + '</span></div>' +
        '</div>',
        'dark', 'tunnel', pal.dark, { seed: seedBase + 3, footLabel: 'MINUTES' }
      )
    });

    slides.push({
      duration: 9000,
      html: slideHtml(
        '<h2 class="rc-h2">MY TOP SONGS</h2>' +
        '<p class="rc-h2-sub">' + esc(data.label) + ' · diurutkan dari menit dengar</p>' +
        rowList(topFive, { metric: function (t) { return num(t.plays) + 'x'; } }),
        'red', 'stair', pal.red, { seed: seedBase + 5, footLabel: 'TOP SONGS' }
      )
    });

    slides.push({
      duration: 8800,
      html: slideHtml(
        '<h2 class="rc-h2 rc-h2-center">MY TOP ARTISTS</h2>' +
        '<p class="rc-h2-sub rc-h2-center">Siapa yang paling sering kamu putar</p>' +
        rowList(artistFive, { sub: function (a) { return num(Math.round(a.listen / 60)) + ' menit'; }, metric: function (a) { return num(a.plays) + 'x'; } }),
        'blue', 'tunnel', pal.blue, { seed: seedBase + 7, centered: true, footLabel: 'TOP ARTISTS' }
      )
    });

    slides.push({
      duration: 8800,
      html: slideHtml(
        '<div class="rc-center-stack">' +
          '<div class="rc-kicker rc-kicker-center">My Top Song</div>' +
          '<div class="rc-poster">' + thumbHtml(top || {}, 'lg') + '</div>' +
          (top ?
            '<h3 class="rc-poster-title">' + esc(top.title) + '</h3>' +
            '<p class="rc-poster-artist">' + esc(top.artist || 'Unknown Artist') + '</p>' +
            '<div class="rc-poster-metric"><span class="rc-k">Total plays</span><span class="rc-v">' + num(top.plays) + '</span></div>' +
            '<div class="rc-poster-metric"><span class="rc-k">Di-loop</span><span class="rc-v">' + num(top.loops) + 'x</span></div>' +
            '<p class="rc-poster-note">Top ' + Math.max(1, data.topShare) + '% dari total waktu dengar kamu</p>'
            : '<h3 class="rc-poster-title">Belum ada lagu</h3><p class="rc-poster-artist">Putar satu piringan dulu</p>') +
        '</div>',
        'yellow', 'tunnel', pal.yellow, { seed: seedBase + 11, centered: true, footLabel: 'TOP SONG' }
      )
    });

    var big = data.biggestDay;
    slides.push({
      duration: 9000,
      html: slideHtml(
        '<h2 class="rc-h2">WORDS TO DESCRIBE<br>AT THAT TIME</h2>' +
        '<p class="rc-h2-sub">' + esc(data.label) + '</p>' +
        '<div class="rc-words">' + data.words.map(function (w) {
          return '<div class="rc-word"><span class="rc-word-w">' + esc(w.w) + '</span><span class="rc-word-d">' + esc(w.d) + '</span></div>';
        }).join('') + '</div>' +
        '<p class="rc-footnote">' + (big ? 'Hari paling ramai: ' + esc(DAY_NAMES[new Date(big.day + 'T00:00:00').getDay()]) + ', ' + formatDay(big.day) + ' — ' + num(Math.round(big.listen / 60)) + ' menit.' : 'Data harian akan muncul setelah beberapa sesi.') + '</p>',
        'yellow', 'stair', pal.yellow, { seed: seedBase + 13, footLabel: 'WORDS' }
      )
    });

    var pct = function (cur, prevVal) {
      if (!prevVal) return cur > 0 ? 'BARU' : '—';
      var diff = Math.round(((cur - prevVal) / prevVal) * 100);
      return (diff >= 0 ? '+' : '') + diff + '%';
    };
    slides.push({
      duration: 9000,
      html: slideHtml(
        '<h2 class="rc-h2">MY EVOLUTION</h2>' +
        '<p class="rc-h2-sub">Dibanding periode sebelumnya</p>' +
        '<div class="rc-evo">' +
          '<div class="rc-evo-row"><span class="rc-evo-k">Menit dengar</span><span class="rc-evo-v">' + num(listenMinutes) + '</span><span class="rc-evo-d ' + (data.prev && data.prev.listen && data.listen >= data.prev.listen ? 'up' : 'down') + '">' + pct(data.listen, data.prev && data.prev.listen) + '</span></div>' +
          '<div class="rc-evo-row"><span class="rc-evo-k">Total putar</span><span class="rc-evo-v">' + num(data.plays) + '</span><span class="rc-evo-d ' + (data.prev && data.prev.plays && data.plays >= data.prev.plays ? 'up' : 'down') + '">' + pct(data.plays, data.prev && data.prev.plays) + '</span></div>' +
          '<div class="rc-evo-row"><span class="rc-evo-k">Waktu di app</span><span class="rc-evo-v">' + num(usageHours) + ' jam</span><span class="rc-evo-d ' + (data.prev && data.prev.usage && data.usage >= data.prev.usage ? 'up' : 'down') + '">' + pct(data.usage, data.prev && data.prev.usage) + '</span></div>' +
          '<div class="rc-evo-row"><span class="rc-evo-k">Loop replay</span><span class="rc-evo-v">' + num(data.loops) + 'x</span><span class="rc-evo-d neutral">' + (data.plays ? Math.round((data.loops / data.plays) * 100) : 0) + '% dari putaran</span></div>' +
        '</div>' +
        '<p class="rc-footnote">' + (data.topArtist ? 'Artis andalan: ' + esc(data.topArtist.name) + '. ' : '') + 'Tiap device yang login dengan akun Google yang sama ikut menambah angka ini.</p>',
        'red', 'ribbon', pal.ember, { seed: seedBase + 17, footLabel: 'EVOLUTION' }
      )
    });

    slides.push({
      duration: 9000,
      html: slideHtml(
        '<h2 class="rc-h2">' + (data.kind === 'year' ? 'MONTH BY MONTH' : 'WEEK BY WEEK') + '</h2>' +
        '<p class="rc-h2-sub">Menit dengar per ' + (data.kind === 'year' ? 'bulan' : 'minggu') + '</p>' +
        '<div class="rc-chart">' + data.timeline.map(function (b) {
          return '<div class="rc-bar"><span class="rc-bar-val">' + (b.value ? num(Math.round(b.value / 60)) : '') + '</span><span class="rc-bar-fill" style="height:' + b.pct + '%"></span><span class="rc-bar-label">' + esc(b.label) + '</span></div>';
        }).join('') + '</div>' +
        '<p class="rc-footnote">Total ' + num(listenMinutes) + ' menit · ' + num(data.plays) + ' putaran · ' + data.distinctTracks + ' lagu berbeda.</p>',
        'green', 'stair', pal.green, { seed: seedBase + 19, footLabel: 'TIMELINE' }
      )
    });

    slides.push({
      duration: 0,
      final: true,
      html: slideHtml(
        '<div class="rc-outro">' +
          '<div class="rc-outro-cols">' +
            '<div class="rc-outro-col"><span class="rc-outro-k">Top Artists</span>' +
              artistFive.map(function (a, i) { return '<span class="rc-outro-row"><b>' + (i + 1) + '</b>' + esc(a.name) + '</span>'; }).join('') +
            '</div>' +
            '<div class="rc-outro-col"><span class="rc-outro-k">Top Songs</span>' +
              topFive.map(function (t, i) { return '<span class="rc-outro-row"><b>' + (i + 1) + '</b>' + esc(t.title) + '</span>'; }).join('') +
            '</div>' +
          '</div>' +
          '<div class="rc-outro-min"><span class="rc-outro-k">Minutes listened</span><span class="rc-outro-num">' + num(listenMinutes) + '</span></div>' +
          '<p class="rc-outro-note">' + esc(data.label) + ' · ' + num(usageHours) + ' jam di Chiroot · ' + num(data.plays) + ' putaran</p>' +
          '<button type="button" class="rc-done-btn" data-rc-done="1">Buka Player ✦</button>' +
        '</div>',
        'hero', 'ribbon', pal.hero, { seed: seedBase + 23, centered: true, footLabel: 'RECAP', final: true }
      )
    });

    return slides;
  }

  function rcCss() {
    return [
      '@keyframes rcFade { from { opacity: 0 } to { opacity: 1 } }',
      '@keyframes rcRise { from { opacity: 0; transform: translateY(18px) } to { opacity: 1; transform: none } }',
      '@keyframes rcZoom { from { transform: scale(1.06) } to { transform: scale(1) } }',
      '@keyframes rcBar { from { transform: scaleY(0) } to { transform: scaleY(1) } }',
      '.rc-slide .rc-inner > *{ animation: rcRise .62s cubic-bezier(.2,.8,.2,1) both; }',
      '.rc-slide .rc-inner > *:nth-child(2){ animation-delay:.09s }',
      '.rc-slide .rc-inner > *:nth-child(3){ animation-delay:.16s }',
      '.rc-slide .rc-inner > *:nth-child(4){ animation-delay:.23s }',
      '.rc-slide .rc-inner > *:nth-child(5){ animation-delay:.3s }'
    ];
  }

  function injectStyles() {
    if (document.getElementById('rc-styles')) return;
    var css = [
      '#rc-overlay{position:fixed;inset:0;z-index:2147483000;display:none;background:#000;color:#fff;overflow:hidden;font-family:"Plus Jakarta Sans","Segoe UI",system-ui,-apple-system,sans-serif;overscroll-behavior:contain;touch-action:manipulation;-webkit-tap-highlight-color:transparent}',
      '#rc-overlay.rc-on{display:block}',
      'html.rc-locked,html.rc-locked body{overflow:hidden!important;height:100%!important}',
      'html.rc-locked body > *:not(#rc-overlay){pointer-events:none!important}',
      '#rc-dim{position:absolute;inset:0;background:radial-gradient(circle at 50% 42%,#16131a 0%,#000 72%);opacity:0;transition:opacity .7s ease}',
      '#rc-overlay.rc-lit #rc-dim{opacity:1}',
      '.rc-stage{position:absolute;inset:0}',
      '.rc-scrim{position:absolute;inset:0;z-index:1;pointer-events:none;background:radial-gradient(78% 62% at 50% 52%,rgba(0,0,0,.62) 0%,rgba(0,0,0,.3) 58%,rgba(0,0,0,0) 82%)}',
      '.rc-slide{position:absolute;inset:0;display:flex;flex-direction:column;padding:clamp(16px,3.6vh,34px) clamp(16px,4vw,26px) clamp(52px,8vh,74px);opacity:0;transform:scale(.992);transition:opacity .5s ease,transform .6s cubic-bezier(.2,.8,.2,1);pointer-events:none;overflow:hidden;isolation:isolate}',
      '.rc-slide.rc-active{opacity:1;transform:none;pointer-events:auto}',
      '.rc-slide.rc-leaving{opacity:0;transform:scale(1.02)}',
      '.rc-art{position:absolute;inset:0;z-index:0;animation:rcZoom 14s ease-out both}',
      '.rc-art-svg{width:100%;height:100%;display:block}',
      '.rc-inner{position:relative;z-index:2;width:100%;max-width:520px;margin:0 auto;flex:1;display:flex;flex-direction:column;justify-content:center}',
      '.rc-inner.rc-center{align-items:center;text-align:center}',
      '.rc-eyebrow{font-size:clamp(10px,1.5vw,13px);letter-spacing:.22em;text-transform:uppercase;font-weight:800;opacity:.75;margin-bottom:auto}',
      '.rc-hero-block{margin-top:auto}',
      '.rc-hero-title{font-size:clamp(40px,12.5vw,86px);line-height:.9;font-weight:800;letter-spacing:-.03em;text-transform:uppercase;margin:0 0 14px}',
      '.rc-hero-sub{font-size:clamp(12px,2.6vw,15px);opacity:.8;margin:0;font-weight:600;letter-spacing:.03em}',
      '.rc-hero-pill{margin-top:18px;margin-bottom:auto;display:inline-flex;align-self:flex-start;gap:8px;font-size:clamp(10px,2.2vw,12.5px);font-weight:700;letter-spacing:.06em;text-transform:uppercase;background:rgba(255,255,255,.14);border:1.5px solid rgba(255,255,255,.34);border-radius:999px;padding:8px 14px;backdrop-filter:blur(6px)}',
      '.rc-kicker{font-size:clamp(11px,2.4vw,14px);letter-spacing:.2em;text-transform:uppercase;font-weight:800;opacity:.7}',
      '.rc-kicker-center{text-align:center}',
      '.rc-bignum{font-size:clamp(76px,26vw,168px);line-height:.84;font-weight:800;letter-spacing:-.05em;display:flex;align-items:flex-end;gap:10px;margin:6px 0 4px}',
      '.rc-bignum-unit{font-size:clamp(13px,3vw,20px);font-weight:800;letter-spacing:.16em;padding-bottom:clamp(12px,3vw,22px);opacity:.7}',
      '.rc-sublead{font-size:clamp(12px,2.8vw,15px);line-height:1.45;opacity:.82;max-width:26em;margin:6px 0 20px;font-weight:500}',
      '.rc-statgrid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:auto}',
      '.rc-statcard{background:rgba(255,255,255,.1);border:1.5px solid rgba(255,255,255,.22);border-radius:14px;padding:11px 12px;display:flex;flex-direction:column;gap:4px;backdrop-filter:blur(8px)}',
      '.rc-statk{font-size:clamp(8.5px,1.9vw,10.5px);letter-spacing:.14em;text-transform:uppercase;font-weight:800;opacity:.66}',
      '.rc-statv{font-size:clamp(20px,5.4vw,30px);font-weight:800;letter-spacing:-.02em;line-height:1}',
      '.rc-h2{font-size:clamp(26px,7.4vw,44px);line-height:.98;font-weight:800;letter-spacing:-.02em;text-transform:uppercase;margin:0 0 6px}',
      '.rc-h2-center{text-align:center}',
      '.rc-h2-sub{font-size:clamp(11px,2.4vw,13.5px);opacity:.72;margin:0 0 18px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}',
      '.rc-rows{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px}',
      '.rc-row{display:flex;align-items:center;gap:11px;background:rgba(0,0,0,.26);border:1.5px solid rgba(255,255,255,.16);border-radius:13px;padding:9px 11px;backdrop-filter:blur(4px)}',
      '.rc-rank{font-size:clamp(15px,3.6vw,20px);font-weight:800;min-width:1.2em;opacity:.72}',
      '.rc-thumb{width:38px;height:38px;flex:0 0 38px;border-radius:8px;background:#0a0a0c center/cover no-repeat;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;border:1.5px solid rgba(255,255,255,.3);overflow:hidden}',
      '.rc-thumb-lg{width:clamp(150px,46vw,230px);height:clamp(150px,46vw,230px);flex:0 0 auto;border-radius:14px;font-size:clamp(42px,12vw,64px);box-shadow:0 18px 50px rgba(0,0,0,.5)}',
      '.rc-thumb-empty{background:linear-gradient(140deg,#101013,#242430);color:rgba(255,255,255,.55)}',
      '.rc-row-text{display:flex;flex-direction:column;min-width:0;flex:1}',
      '.rc-row-title{font-size:clamp(13px,3.1vw,16px);font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-.01em}',
      '.rc-row-sub{font-size:clamp(10.5px,2.4vw,12.5px);opacity:.66;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}',
      '.rc-row-metric{font-size:clamp(11px,2.6vw,13px);font-weight:800;opacity:.85;letter-spacing:.02em}',
      '.rc-center-stack{display:flex;flex-direction:column;align-items:center;text-align:center;gap:2px}',
      '.rc-poster{margin:10px 0 14px;filter:drop-shadow(0 20px 40px rgba(0,0,0,.45))}',
      '.rc-poster-title{font-size:clamp(22px,6.2vw,34px);font-weight:800;letter-spacing:-.02em;margin:0;text-transform:uppercase;line-height:1}',
      '.rc-poster-artist{font-size:clamp(12px,2.9vw,15px);opacity:.8;margin:5px 0 16px;font-weight:700;text-transform:uppercase;letter-spacing:.1em}',
      '.rc-poster-metric{display:flex;justify-content:space-between;align-items:center;width:min(320px,84%);border-top:1.5px solid rgba(0,0,0,.28);padding:7px 2px}',
      '.rc-poster-metric .rc-k{font-size:clamp(10px,2.3vw,12px);text-transform:uppercase;letter-spacing:.14em;font-weight:800;opacity:.7}',
      '.rc-poster-metric .rc-v{font-size:clamp(16px,4vw,22px);font-weight:800;letter-spacing:-.01em}',
      '.rc-poster-note{font-size:clamp(10.5px,2.3vw,12.5px);font-weight:700;opacity:.75;margin:12px 0 0;letter-spacing:.04em;text-transform:uppercase}',
      '.rc-words{display:flex;flex-direction:column;gap:10px;margin-top:4px}',
      '.rc-word{display:flex;flex-direction:column;gap:2px;background:rgba(0,0,0,.16);border-left:4px solid rgba(0,0,0,.55);border-radius:0 12px 12px 0;padding:9px 12px}',
      '.rc-word-w{font-size:clamp(16px,4.2vw,23px);font-weight:800;letter-spacing:-.01em;text-transform:uppercase}',
      '.rc-word-d{font-size:clamp(10.5px,2.4vw,12.5px);font-weight:600;opacity:.78;line-height:1.35}',
      '.rc-evo{display:flex;flex-direction:column;gap:8px}',
      '.rc-evo-row{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:10px;background:rgba(0,0,0,.22);border:1.5px solid rgba(255,255,255,.18);border-radius:12px;padding:10px 12px}',
      '.rc-evo-k{font-size:clamp(11px,2.5vw,13px);text-transform:uppercase;letter-spacing:.1em;font-weight:800;opacity:.8}',
      '.rc-evo-v{font-size:clamp(17px,4.4vw,24px);font-weight:800;letter-spacing:-.02em}',
      '.rc-evo-d{font-size:clamp(10.5px,2.4vw,12px);font-weight:800;padding:3px 8px;border-radius:999px;white-space:nowrap}',
      '.rc-evo-d.up{background:rgba(46,240,150,.22);color:#9dffcd}',
      '.rc-evo-d.down{background:rgba(255,90,90,.2);color:#ffc0c0}',
      '.rc-evo-d.neutral{background:rgba(255,255,255,.14);color:#fff;opacity:.8}',
      '.rc-chart{display:flex;align-items:flex-end;justify-content:space-between;gap:clamp(3px,.9vw,8px);height:clamp(180px,38vh,300px);margin:clamp(10px,3vh,24px) 0 10px;padding:0 2px}',
      '.rc-bar{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:5px;min-width:0;height:100%}',
      '.rc-bar-val{font-size:clamp(8px,1.9vw,10.5px);font-weight:800;opacity:.75;white-space:nowrap}',
      '.rc-bar-fill{width:100%;border-radius:7px 7px 3px 3px;background:linear-gradient(180deg,rgba(255,255,255,.98),rgba(255,255,255,.55));transform-origin:bottom;animation:rcBar .8s cubic-bezier(.2,.8,.2,1) both;box-shadow:0 0 0 1.5px rgba(0,0,0,.18) inset}',
      '.rc-bar-label{font-size:clamp(8.5px,2vw,11px);font-weight:800;letter-spacing:.06em;opacity:.72;text-transform:uppercase}',
      '.rc-footnote{font-size:clamp(10.5px,2.4vw,12.5px);line-height:1.5;font-weight:600;opacity:.75;margin:12px 0 0}',
      '.rc-empty{font-size:13px;opacity:.7;font-weight:600;padding:12px 0}',
      '.rc-outro{display:flex;flex-direction:column;align-items:center;gap:16px}',
      '.rc-outro-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px;width:100%;text-align:left}',
      '.rc-outro-col{display:flex;flex-direction:column;gap:5px}',
      '.rc-outro-k{font-size:clamp(9px,2vw,11px);letter-spacing:.16em;text-transform:uppercase;font-weight:800;opacity:.62;margin-bottom:3px}',
      '.rc-outro-row{font-size:clamp(10.5px,2.5vw,12.5px);font-weight:700;opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;gap:6px}',
      '.rc-outro-row b{opacity:.55;font-weight:800}',
      '.rc-outro-min{display:flex;flex-direction:column;align-items:center;gap:2px;margin-top:6px}',
      '.rc-outro-num{font-size:clamp(40px,13vw,76px);font-weight:800;letter-spacing:-.04em;line-height:1}',
      '.rc-outro-note{font-size:clamp(10.5px,2.4vw,12.5px);font-weight:700;opacity:.72;margin:0;text-align:center}',
      '.rc-done-btn{margin-top:8px;border:none;border-radius:999px;padding:14px 26px;font-family:inherit;font-size:clamp(13px,3vw,15px);font-weight:800;letter-spacing:.03em;background:#fff;color:#000;cursor:pointer;box-shadow:0 12px 30px rgba(0,0,0,.45);transition:transform .16s ease,opacity .2s}',
      '.rc-done-btn:hover{transform:translateY(-2px)}',
      '.rc-done-btn:active{transform:translateY(1px)}',
      '.rc-foot{position:absolute;left:clamp(16px,4vw,26px);right:clamp(16px,4vw,26px);bottom:clamp(16px,3.4vh,28px);z-index:3;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px}',
      '.rc-foot-hint{font-size:9px;letter-spacing:.14em;text-transform:uppercase;font-weight:800;opacity:.42;text-align:center;white-space:nowrap;overflow:hidden}',
      '.rc-star{width:26px;height:26px;border-radius:50%;border:1.6px solid rgba(255,255,255,.85);display:flex;align-items:center;justify-content:center;flex:0 0 26px;opacity:.9}',
      '.rc-star svg{width:13px;height:13px;display:block}',
      '.rc-foot-label{font-size:9.5px;letter-spacing:.26em;font-weight:800;text-transform:uppercase;opacity:.72}',
      '.rc-progress{position:absolute;top:clamp(10px,2.2vh,18px);left:clamp(12px,3vw,22px);right:clamp(12px,3vw,22px);z-index:6;display:flex;gap:4px}',
      '.rc-progress i{flex:1;height:3px;border-radius:99px;background:rgba(255,255,255,.26);overflow:hidden;position:relative}',
      '.rc-progress i span{position:absolute;inset:0;background:#fff;transform:scaleX(0);transform-origin:left;border-radius:99px}',
      '.rc-progress i.done span{transform:scaleX(1)}',
      '.rc-progress i.run span{transition:transform linear}',
      '.rc-pal-yellow{color:#0d0d10}',
      '.rc-pal-yellow .rc-scrim{background:radial-gradient(80% 60% at 50% 50%,rgba(255,255,255,.34) 0%,rgba(255,255,255,.12) 60%,rgba(255,255,255,0) 84%)}',
      '.rc-pal-yellow .rc-star{border-color:rgba(0,0,0,.8)}',
      '.rc-pal-yellow .rc-progress i{background:rgba(0,0,0,.2)}',
      '.rc-pal-yellow .rc-progress i span{background:#101013}',
      '.rc-pal-yellow .rc-thumb{border-color:rgba(0,0,0,.28)}',
      '.rc-h2,.rc-hero-title,.rc-bignum,.rc-poster-title{text-shadow:0 2px 26px rgba(0,0,0,.32)}',
      '.rc-pal-yellow .rc-h2,.rc-pal-yellow .rc-hero-title,.rc-pal-yellow .rc-bignum,.rc-pal-yellow .rc-poster-title{text-shadow:0 2px 22px rgba(255,255,255,.4)}',
      '.rc-tapwake{position:absolute;inset:0;z-index:9;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:rgba(0,0,0,.86);backdrop-filter:blur(6px);cursor:pointer}',
      '.rc-tapwake h4{font-size:clamp(20px,5.6vw,30px);font-weight:800;letter-spacing:-.02em;margin:0;text-align:center;text-transform:uppercase;max-width:14em}',
      '.rc-tapwake p{font-size:13px;font-weight:600;opacity:.7;margin:0;text-align:center;max-width:22em;line-height:1.5}',
      '.rc-tapwake .rc-wake-ring{width:74px;height:74px;border-radius:50%;border:2px solid rgba(255,255,255,.7);display:flex;align-items:center;justify-content:center;animation:rcPulse 1.8s ease-in-out infinite}',
      '@keyframes rcPulse{0%,100%{transform:scale(1);opacity:.85}50%{transform:scale(1.08);opacity:1}}',
      '.rc-picker{position:fixed;inset:0;z-index:2147482900;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(6,6,8,.72);backdrop-filter:blur(10px);font-family:"Plus Jakarta Sans","Segoe UI",system-ui,sans-serif}',
      '.rc-picker.rc-on{display:flex}',
      '.rc-picker-card{width:min(440px,100%);background:#0d0d11;border:1.5px solid rgba(255,255,255,.16);border-radius:22px;padding:20px;color:#fff;box-shadow:0 30px 80px rgba(0,0,0,.6);max-height:86vh;overflow:auto}',
      '.rc-picker-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}',
      '.rc-picker-title{font-size:17px;font-weight:800;letter-spacing:-.01em;margin:0}',
      '.rc-picker-sub{font-size:11.5px;font-weight:600;opacity:.6;margin:4px 0 0;line-height:1.45}',
      '.rc-picker-x{border:none;background:rgba(255,255,255,.1);color:#fff;width:30px;height:30px;border-radius:50%;font-size:14px;cursor:pointer;flex:0 0 30px;font-family:inherit}',
      '.rc-picker-list{display:flex;flex-direction:column;gap:9px}',
      '.rc-pick-empty{font-size:12px;line-height:1.55;font-weight:600;opacity:.62;padding:6px 2px}',
      '.rc-report-btn{position:relative}',
      '.rc-report-btn.rc-btn-fresh::after{content:"";position:absolute;top:-3px;right:-3px;width:9px;height:9px;border-radius:50%;background:#e0522d;border:2px solid #fff9e8;animation:rcDot 1.9s ease-out infinite}',
      '@keyframes rcDot{0%{box-shadow:0 0 0 0 rgba(224,82,45,.55)}70%{box-shadow:0 0 0 7px rgba(224,82,45,0)}100%{box-shadow:0 0 0 0 rgba(224,82,45,0)}}',
      '.rc-pick{display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:1.5px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);border-radius:14px;padding:12px 13px;color:#fff;font-family:inherit;cursor:pointer;transition:transform .14s ease,background .16s}',
      '.rc-pick:hover{background:rgba(255,255,255,.1);transform:translateY(-1px)}',
      '.rc-pick-ico{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;flex:0 0 34px;background:linear-gradient(140deg,#ff2f7d,#8a2bd9)}',
      '.rc-pick-body{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}',
      '.rc-pick-t{font-size:13.5px;font-weight:800;letter-spacing:-.01em}',
      '.rc-pick-s{font-size:10.5px;font-weight:600;opacity:.62;letter-spacing:.04em;text-transform:uppercase}',
      '.rc-pick-go{font-size:18px;opacity:.6}',
      '.rc-pick[disabled]{opacity:.42;cursor:not-allowed}',
      '.rc-report-btn{background:#eef7eb;border:2.3px solid #1a1a1a;padding:10px 14px;font-family:"Patrick Hand",sans-serif;font-size:16px;cursor:pointer;transition:transform .13s ease,background .15s;box-shadow:0 3px 0 #9fbe97;border-radius:16px 14px 17px 15px/14px 16px 14px 17px;color:#2f5928;display:inline-flex;align-items:center;gap:6px}',
      '.rc-report-btn:hover{transform:translateY(-2px);background:#f4fbf2}',
      '.rc-report-btn:active{transform:translateY(1px);box-shadow:0 1px 0 #9fbe97}',
      '@media (max-height:560px){.rc-slide{padding-bottom:44px}.rc-chart{height:130px}.rc-bignum{font-size:64px}}',
      '@media (prefers-reduced-motion:reduce){.rc-slide,.rc-art,.rc-bar-fill,.rc-slide .rc-inner > *{animation:none!important;transition:opacity .2s!important}}'
    ].join('') + rcCss().join('');
    var st = document.createElement('style');
    st.id = 'rc-styles';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function ensureOverlay() {
    var el = document.getElementById('rc-overlay');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'rc-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Chiroot Recap');
    el.innerHTML = '<div id="rc-dim"></div><div class="rc-stage" id="rc-stage"></div><div class="rc-progress" id="rc-progress"></div>';
    document.body.appendChild(el);
    return el;
  }

  function ensurePicker() {
    var el = document.getElementById('rc-picker');
    if (el) return el;
    el = document.createElement('div');
    el.className = 'rc-picker';
    el.id = 'rc-picker';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Pilih periode recap');
    el.innerHTML = '<div class="rc-picker-card"><div class="rc-picker-head"><div><h3 class="rc-picker-title">Chiroot Recap</h2><p class="rc-picker-sub">Recap cuma muncul di ' + RECAP_WINDOW_DAYS + ' hari pertama setiap ganti bulan/tahun. Pilih satu buat diputar.</p></div><button type="button" class="rc-picker-x" data-rc-pick-close="1" aria-label="Tutup">✕</button></div><div class="rc-picker-list" id="rc-picker-list"></div></div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      if (e.target === el || e.target.closest('[data-rc-pick-close]')) closePicker();
    });
    return el;
  }

  function renderPicker() {
    var list = document.getElementById('rc-picker-list');
    if (!list) return;
    var items = freshRecaps();
    if (!items.length) {
      list.innerHTML = '<div class="rc-pick-empty">Belum ada recap baru. Recap hanya muncul di ' + RECAP_WINDOW_DAYS + ' hari pertama setiap ganti bulan (dan awal tahun).</div>';
      return;
    }
    list.innerHTML = items.map(function (it, i) {
      return '<button type="button" class="rc-pick" data-rc-pick="' + i + '">' +
        '<span class="rc-pick-ico">' + it.icon + '</span>' +
        '<span class="rc-pick-body"><span class="rc-pick-t">' + esc(it.title) + '</span><span class="rc-pick-s">' + esc(it.sub) + '</span></span>' +
        '<span class="rc-pick-go">›</span></button>';
    }).join('');
    list.querySelectorAll('[data-rc-pick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var it = items[parseInt(btn.getAttribute('data-rc-pick'), 10)];
        closePicker();
        startRecap(it.kind, it.key, { manual: true });
      });
    });
  }

  function openPicker() {
    if (STATE.open) return;
    var p = ensurePicker();
    injectStyles();
    renderPicker();
    p.classList.add('rc-on');
  }
  function closePicker() {
    var p = document.getElementById('rc-picker');
    if (p) p.classList.remove('rc-on');
  }

  function pickBackdropTrack(data) {
    var candidates = [];
    if (data && data.tracks) candidates = data.tracks.slice(0, 12);
    var crate = [];
    try { if (typeof tracks !== 'undefined' && Array.isArray(tracks)) crate = tracks; } catch (e) {}
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      var src = c.src || STATE.srcMap[c.id];
      if (!src) {
        for (var j = 0; j < crate.length; j++) {
          if (String(crate[j].id) === String(c.id) && crate[j].src) { src = crate[j].src; break; }
        }
      }
      if (src) return { src: src, title: c.title, artist: c.artist };
    }
    for (var k = 0; k < crate.length; k++) {
      if (crate[k] && crate[k].src) return { src: crate[k].src, title: crate[k].title, artist: crate[k].artist };
    }
    return null;
  }

  function fadeAudio(el, from, to, ms, done) {
    var started = Date.now();
    var step = function () {
      var p = Math.min(1, (Date.now() - started) / ms);
      try { el.volume = clamp(from + (to - from) * p, 0, 1); } catch (e) {}
      if (p < 1) requestAnimationFrame(step);
      else if (done) done();
    };
    try { el.volume = from; } catch (e) {}
    requestAnimationFrame(step);
  }

  function startBackdrop(data) {
    var pick = pickBackdropTrack(data);
    if (!pick) return Promise.resolve('none');
    try {
      if (STATE.bg) { STATE.bg.pause(); STATE.bg.src = ''; }
      var bg = new Audio();
      bg.loop = true;
      bg.preload = 'auto';
      bg.crossOrigin = 'anonymous';
      bg.volume = 0;
      bg.src = pick.src;
      STATE.bg = bg;
      var p = bg.play();
      if (!p || typeof p.then !== 'function') { fadeAudio(bg, 0, 0.5, 2200); return Promise.resolve('ok'); }
      return p.then(function () { fadeAudio(bg, 0, 0.5, 2600); return 'ok'; }).catch(function () { return 'blocked'; });
    } catch (e) { return Promise.resolve('blocked'); }
  }

  function stopBackdrop() {
    var bg = STATE.bg;
    STATE.bg = null;
    if (!bg) return;
    try {
      fadeAudio(bg, bg.volume || 0.5, 0, 900, function () { try { bg.pause(); bg.src = ''; } catch (e) {} });
    } catch (e) {}
  }

  function lockUI() {
    document.documentElement.classList.add('rc-locked');
    STATE.prevScroll = window.scrollY || 0;
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    STATE.mainWasPlaying = false;
    try { STATE.mainWasPlaying = !!(typeof isPlaying !== 'undefined' && isPlaying); } catch (e) {}
    try { if (typeof pause === 'function') pause(); } catch (e) {}
  }

  function unlockUI() {
    document.documentElement.classList.remove('rc-locked');
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    try { window.scrollTo(0, STATE.prevScroll || 0); } catch (e) {}
    if (STATE.mainWasPlaying) {
      STATE.mainWasPlaying = false;
      try { if (typeof play === 'function') Promise.resolve(play()).catch(function () {}); } catch (e) {}
    }
  }

  function onKeyDown(e) {
    if (!STATE.open) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    var k = e.key;
    if (k === 'ArrowRight' || k === ' ' || k === 'Enter' || k === 'PageDown') nextSlide();
    else if (k === 'ArrowLeft' || k === 'PageUp') prevSlide();
  }
  function onKeyUp(e) {
    if (!STATE.open) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function progressMarkup(count) {
    var out = '';
    for (var i = 0; i < count; i++) out += '<i data-rc-seg="' + i + '"><span></span></i>';
    return out;
  }

  function runSegment(index, duration) {
    var wrap = document.getElementById('rc-progress');
    if (!wrap) return;
    wrap.querySelectorAll('i').forEach(function (seg, i) {
      var fill = seg.querySelector('span');
      seg.classList.toggle('done', i < index);
      seg.classList.remove('run');
      if (fill) { fill.style.transition = 'none'; fill.style.transform = i < index ? 'scaleX(1)' : 'scaleX(0)'; }
      if (i === index && duration > 0) {
        seg.classList.add('run');
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            if (fill) { fill.style.transition = 'transform ' + duration + 'ms linear'; fill.style.transform = 'scaleX(1)'; }
          });
        });
      }
    });
  }

  function showSlide(index, opts) {
    opts = opts || {};
    var stage = document.getElementById('rc-stage');
    if (!stage || !STATE.slides.length) return;
    index = clamp(index, 0, STATE.slides.length - 1);
    STATE.index = index;
    var slide = STATE.slides[index];
    var prev = stage.querySelector('.rc-slide.rc-active');
    if (prev) {
      prev.classList.remove('rc-active');
      prev.classList.add('rc-leaving');
      setTimeout(function () { if (prev && prev.parentNode) prev.parentNode.removeChild(prev); }, 620);
    }
    var holder = document.createElement('div');
    holder.innerHTML = slide.html;
    var node = holder.firstElementChild;
    stage.appendChild(node);
    requestAnimationFrame(function () { node.classList.add('rc-active'); });
    runSegment(index, slide.duration);
    if (STATE.timer) { clearTimeout(STATE.timer); STATE.timer = null; }
    if (slide.duration > 0 && !opts.noAuto) {
      STATE.timer = setTimeout(function () { nextSlide(); }, slide.duration);
    }
    if (slide.final) {
      var btn = node.querySelector('[data-rc-done]');
      if (btn) btn.addEventListener('click', function (e) { e.stopPropagation(); finishRecap(); });
    }
  }

  function nextSlide() {
    if (!STATE.open) return;
    if (STATE.index >= STATE.slides.length - 1) return;
    showSlide(STATE.index + 1);
  }
  function prevSlide() {
    if (!STATE.open || STATE.index <= 0) return;
    showSlide(STATE.index - 1);
  }

  function startRecap(kind, key, opts) {
    opts = opts || {};
    if (STATE.open) return Promise.resolve(false);
    if (STATE.busy) return Promise.resolve(false);
    if (opts.manual) STATE.manualIntent = true;
    STATE.busy = true;
    return loadRecap(kind, key).then(function (data) {
      STATE.busy = false;
      STATE.data = data;
      STATE.slides = buildSlides(data);
      STATE.index = 0;
      var overlay = ensureOverlay();
      overlay.classList.add('rc-on');
      STATE.open = true;
      lockUI();
      cloudMarkShown(opts.markKey || ((kind === 'month' ? 'month:' : 'year:') + key), !!opts.localMark);
      document.getElementById('rc-progress').innerHTML = progressMarkup(STATE.slides.length);
      var stage = document.getElementById('rc-stage');
      stage.innerHTML = '';
      setTimeout(function () { overlay.classList.add('rc-lit'); }, 30);
      setTimeout(function () { showSlide(0); }, 320);
      startBackdrop(data).then(function (status) {
        if (status === 'ok' || status === 'none') return;
        if (opts.manual) {
          var retry = function () {
            document.removeEventListener('pointerup', retry, true);
            startBackdrop(STATE.data).catch(function () {});
          };
          document.addEventListener('pointerup', retry, true);
        } else {
          showWakeGate();
        }
      });
      return true;
    }).catch(function () {
      STATE.busy = false;
      return false;
    });
  }

  function showWakeGate() {
    var overlay = document.getElementById('rc-overlay');
    if (!overlay || overlay.querySelector('.rc-tapwake')) return;
    var gate = document.createElement('div');
    gate.className = 'rc-tapwake';
    gate.innerHTML = '<div class="rc-wake-ring">' + STAR_SVG + '</div><h4>Recap kamu sudah siap</h4><p>Tap sekali untuk mulai recap + backsound lagu favorit kamu.</p>';
    gate.addEventListener('click', function () {
      gate.remove();
      startBackdrop(STATE.data).catch(function () {});
    });
    overlay.appendChild(gate);
  }

  function finishRecap() {
    if (!STATE.open) return;
    STATE.open = false;
    if (STATE.timer) { clearTimeout(STATE.timer); STATE.timer = null; }
    stopBackdrop();
    var overlay = document.getElementById('rc-overlay');
    if (overlay) {
      overlay.classList.remove('rc-lit');
      setTimeout(function () {
        overlay.classList.remove('rc-on');
        var stage = document.getElementById('rc-stage');
        if (stage) stage.innerHTML = '';
        var gate = overlay.querySelector('.rc-tapwake');
        if (gate) gate.remove();
      }, 500);
    }
    unlockUI();
    persist();
    cloudFlush();
    setRecapButtonVisible(false);
    setTimeout(function () { updateRecapButton(); }, 900);
  }

  function bindStageGestures() {
    var overlay = document.getElementById('rc-overlay');
    if (!overlay || overlay._rcGest) return;
    overlay._rcGest = true;
    var startX = 0, startY = 0, startT = 0;
    overlay.addEventListener('pointerdown', function (e) {
      startX = e.clientX; startY = e.clientY; startT = Date.now();
    }, { passive: true });
    overlay.addEventListener('pointerup', function (e) {
      if (!STATE.open) return;
      if (e.target.closest('button')) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      var dt = Date.now() - startT;
      if (dt > 700) return;
      if (Math.abs(dx) > 46 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) nextSlide(); else prevSlide();
        return;
      }
      nextSlide();
    }, { passive: true });
  }

  function recapWindowOpen(now) {
    return (now || new Date()).getDate() <= RECAP_WINDOW_DAYS;
  }

  function freshRecaps() {
    var now = new Date();
    var out = [];
    if (!recapWindowOpen(now)) return out;
    var prevM = shiftMonth(monthKeyOf(now), -1);
    if (!store.marks['month:' + prevM]) {
      out.push({ kind: 'month', key: prevM, icon: '↺', title: 'Recap bulan lalu', sub: monthLabel(prevM) });
    }
    if (now.getMonth() === 0) {
      var prevY = String(now.getFullYear() - 1);
      if (!store.marks['year:' + prevY]) {
        out.push({ kind: 'year', key: prevY, icon: '★', title: 'Recap tahun lalu', sub: prevY });
      }
    }
    return out;
  }

  function setRecapButtonVisible(on) {
    var btn = document.getElementById('btn-recap-open');
    if (!btn) return;
    if (on) {
      btn.style.display = 'inline-flex';
      btn.removeAttribute('aria-hidden');
      btn.classList.add('rc-btn-fresh');
    } else {
      btn.style.display = 'none';
      btn.setAttribute('aria-hidden', 'true');
      btn.classList.remove('rc-btn-fresh');
    }
  }

  function updateRecapButton() {
    var btn = document.getElementById('btn-recap-open');
    if (!btn) return Promise.resolve(false);
    if (STATE.open) return Promise.resolve(false);
    var cands = freshRecaps();
    if (!cands.length) { setRecapButtonVisible(false); return Promise.resolve(false); }
    return loadRecap(cands[0].kind, cands[0].key).then(function (data) {
      var still = freshRecaps();
      var show = !!(data && data.hasData && still.length);
      setRecapButtonVisible(show);
      return show;
    }).catch(function () { setRecapButtonVisible(false); return false; });
  }

  function bindEntryButton() {
    var ids = ['btn-recap-open', 'btn-report-open'];
    ids.forEach(function (id) {
      var btn = document.getElementById(id);
      if (!btn || btn._rcBound) return;
      btn._rcBound = true;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var cands = freshRecaps();
        if (cands.length === 1) {
          startRecap(cands[0].kind, cands[0].key, { manual: true });
          return;
        }
        if (cands.length > 1) { openPicker(); return; }
        setRecapButtonVisible(false);
      });
    });
    document.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-rc-open]') : null;
      if (!t) return;
      e.preventDefault();
      var cands = freshRecaps();
      if (cands.length === 1) startRecap(cands[0].kind, cands[0].key, { manual: true });
      else openPicker();
    });
  }

  function periodKeyOf(kind, key) { return (kind === 'month' ? 'month:' : 'year:') + key; }

  function maybeShowDue() {
    if (STATE.open || STATE.busy || STATE.manualIntent) return Promise.resolve(false);
    var now = new Date();
    var curM = monthKeyOf(now);
    var curY = yearKeyOf(now);
    var lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var endOfMonth = now.getDate() === lastDay && now.getHours() === 23 && now.getMinutes() >= 56;
    var endOfYear = now.getMonth() === 11 && now.getDate() === 31 && now.getHours() === 23 && now.getMinutes() >= 56;
    var cands = [];
    if (endOfYear && !store.marks['pre:year:' + curY]) cands.push({ kind: 'year', key: curY, markKey: 'pre:year:' + curY, localMark: true });
    if (endOfMonth && !store.marks['pre:month:' + curM]) cands.push({ kind: 'month', key: curM, markKey: 'pre:month:' + curM, localMark: true });
    var atNewPeriodMidnight = now.getHours() === 0 && now.getMinutes() < 30;
    if (atNewPeriodMidnight) freshRecaps().forEach(function (c) { cands.push(c); });
    if (!cands.length) return Promise.resolve(false);

    var tryNext = function (i) {
      if (i >= cands.length) return Promise.resolve(false);
      var c = cands[i];
      return loadRecap(c.kind, c.key).then(function (data) {
        if (!data.hasData) {
          var key = c.markKey || periodKeyOf(c.kind, c.key);
          if (c.localMark) { store.marks[key] = 1; persist(); }
          else cloudMarkShown(key);
          return tryNext(i + 1);
        }
        return startRecap(c.kind, c.key, { auto: true, markKey: c.markKey, localMark: c.localMark }).then(function () { return true; });
      });
    };
    return tryNext(0);
  }

  function startTicker() {
    if (STATE.ticker) return;
    clock.ts = Date.now();
    STATE.ticker = setInterval(tick, 1000);
    STATE.flushTimer = setInterval(function () { cloudFlush(); }, 25000);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { persist(); pendingKeepalive(); cloudFlush(); }
    });
    window.addEventListener('pagehide', function () { persist(); pendingKeepalive(); });
    window.addEventListener('beforeunload', function () { persist(); pendingKeepalive(); });
  }

  function boot() {
    if (STATE.ready) return;
    STATE.ready = true;
    injectStyles();
    ensureOverlay();
    bindAudioHooks();
    bindStageGestures();
    bindEntryButton();
    setRecapButtonVisible(false);
    startTicker();
    var kick = function () {
      bindAudioHooks();
      bindEntryButton();
      updateRecapButton().catch(function () {});
      setTimeout(function () { maybeShowDue().catch(function () {}); }, 2600);
      setInterval(function () { if (!STATE.open) maybeShowDue().catch(function () {}); }, 300000);
      setInterval(function () { if (!STATE.open) updateRecapButton().catch(function () {}); }, 600000);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) updateRecapButton().catch(function () {}); });
    };
    try {
      if (window.ChirootAuth && typeof ChirootAuth.waitReady === 'function') {
        ChirootAuth.waitReady().then(kick).catch(kick);
      } else {
        kick();
      }
    } catch (e) { kick(); }
  }

  window.ChirootRecap = {
    open: function (kind, key) { return startRecap(kind || 'month', key || monthKeyOf(new Date()), { manual: true }); },
    picker: openPicker,
    close: finishRecap,
    check: maybeShowDue,
    flush: cloudFlush,
    data: function (kind, key) { return loadRecap(kind || 'month', key || monthKeyOf(new Date())); },
    stats: function () { return store; }
  };

  window.getMonthlyStats = function () {
    var mk = monthKeyOf(new Date());
    var local = localPeriod('month', mk);
    return {
      currentMonth: mk,
      totalUsageSeconds: local.usage,
      tracks: local.tracks,
      lastReportShown: store.marks['month:' + mk] ? mk : mk
    };
  };
  window.saveMonthlyStats = function () { persist(); };
  window.recordTrackPlay = function (track) { registerPlay(track, false); };
  window.setupMonthlyReport = function () { boot(); };
  window.checkMonthlyReportTrigger = function () { return maybeShowDue(); };
  window.showMonthlyReportModal = function () { return startRecap('month', monthKeyOf(new Date()), { manual: true }); };
  window.hideMonthlyReportModal = function () { finishRecap(); };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
