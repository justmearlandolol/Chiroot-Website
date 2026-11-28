const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Player actions (like/share/playlist) and the persistent bar must target the track
// that is DISPLAYED. While the easter egg is active the turntable shows the Secret
// Track, not tracks[currentIndex]. Also covers the crate-track song gate for
// URL-only tracks and the easter-egg guard in doTrackAction.
function cut(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start !== -1, 'missing start marker: ' + startMarker);
  let end = source.indexOf(endMarker);
  assert.ok(end !== -1, 'missing end marker: ' + endMarker);
  if (endMarker.startsWith('     ')) end = source.lastIndexOf('/*', end);
  return source.slice(start, end);
}

function makeElFactory(els) {
  return id => els[id] || (els[id] = {
    id, hidden: false, textContent: '', value: 0, disabled: false, style: {}, _h: {}, _attrs: {},
    addEventListener(n, f) { (this._h[n] = this._h[n] || []).push(f); },
    getAttribute(k) { return this._attrs[k]; },
    setAttribute(k, v) { this._attrs[k] = v; },
    removeAttribute(k) { delete this._attrs[k]; }
  });
}

// Persistent bar + compact-player action buttons (+ the track-song gate).
function setup() {
  const source = fs.readFileSync('js/app.js', 'utf8');
  const code = [
    cut(source, '  function displayedPlayerTrack() {', '  /* Playlists: song rows remain governed'),
    cut(source, '  function ensureTrackSong(track) {', '  function doTrackAction(track, action) {'),
    cut(source, '  $(\'persistent-share-song\')', '     INIT')
  ].join('\n');
  const els = {};
  const clicked = [];
  const ctx = {
    SONGS: '/rest/v1/songs',
    SONG_SELECT: 'id,owner_id,title,artist',
    SONGS_BUCKET: 'chiroot-shared',
    CRATE_BUCKET: 'chiroot-crate',
    $: makeElFactory(els),
    document: { addEventListener() {}, body: { classList: { toggle() {}, add() {}, remove() {} } } },
    window: {},
    isEggActive: false,
    activeEggTrack: null,
    tracks: [],
    currentIndex: 0,
    audio: { getAttribute: () => 'blob:audio', paused: true, volume: 0.8, duration: NaN, currentTime: 0, addEventListener() {} },
    fmtDur: () => '0:00',
    showToast: () => {},
    updateLikeLabels: () => {},
    play: () => {},
    pause: () => {},
    prevTrack: () => {},
    nextTrack: () => {},
    doTrackAction: (track, action) => { clicked.push([track, action]); },
    publishTrack: async () => ({ id: 'row-1', title: 'x' }),
    authed: () => true,
    uid: () => 'user-1',
    caApiCall: async () => []
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { ctx, els, clicked };
}

// The real doTrackAction with mocked collaborators.
function setupDoTrack() {
  const source = fs.readFileSync('js/app.js', 'utf8');
  const code = cut(source, '  function doTrackAction(track, action) {', '  function playPlaylistSongs(shuffle)');
  const ctx = {
    SONGS: '/rest/v1/songs',
    SONG_SELECT: 'id,visibility',
    showToast: () => {},
    authed: () => true,
    uid: () => 'user-1',
    caApiCall: async () => [],
    ensureTrackSong: async () => ({ id: 'row-1', title: 'x' }),
    fetchSongPublic: async () => null,
    copyText: async () => true,
    canonicalShareUrl: id => 'https://chiroot.test/Main.html?song=' + id,
    toggleLike: () => {},
    showPicker: () => {}
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { ctx };
}

function click(els, id) {
  const handlers = els[id] && els[id]._h.click;
  assert.ok(handlers && handlers.length, 'no click handler on ' + id);
  handlers[0]();
}

const egg = { id: '__chiroot_easter_egg__', title: 'Secret Track ✦', artist: 'Chiroot Easter Egg', isEasterEgg: true };

test('player actions target the displayed Secret Track while the egg is active', () => {
  const { ctx, els, clicked } = setup();
  ctx.tracks = [{ id: 'crate-1', title: 'Crate Song' }];
  ctx.currentIndex = 0;
  ctx.isEggActive = true;
  ctx.activeEggTrack = egg;

  ['persistent-like', 'persistent-share-song', 'cmp-act-link', 'persistent-add-playlist', 'cmp-act-like', 'cmp-act-playlist']
    .forEach(id => { click(els, id); assert.equal(clicked[clicked.length - 1][0], egg, id + ' targets the egg track'); });
});

test('the same actions keep targeting tracks[currentIndex] when the egg is off', () => {
  const { ctx, els, clicked } = setup();
  ctx.tracks = [{ id: 'crate-1', title: 'A' }, { id: 'crate-2', title: 'B' }];
  ctx.currentIndex = 1;
  ctx.isEggActive = false;
  ctx.activeEggTrack = null;

  ['persistent-like', 'persistent-share-song', 'cmp-act-link', 'persistent-add-playlist', 'cmp-act-like', 'cmp-act-playlist']
    .forEach(id => { click(els, id); assert.equal(clicked[clicked.length - 1][0], ctx.tracks[1], id + ' targets the current track'); });
});

test('collection actions refuse the Secret Track instead of saving it as a song', () => {
  const { ctx } = setupDoTrack();
  const toasts = [];
  ctx.showToast = m => toasts.push(m);
  let ensured = 0;
  ctx.ensureTrackSong = async () => { ensured++; return { id: 'row-1' }; };
  ctx.doTrackAction(egg, 'like');
  ctx.doTrackAction(egg, 'playlist');
  assert.equal(ensured, 0, 'egg track is never turned into a song row');
  assert.equal(toasts.length, 2);
  assert.match(toasts[0], /Secret Track/);
});

test('URL-only crate tracks can be saved (like/playlist) like cloud tracks', async () => {
  const { ctx } = setup();
  const calls = [];
  ctx.caApiCall = async (path, method, body) => { calls.push([path, method, body]); return []; };
  await ctx.ensureTrackSong({ id: 'crate-5', title: 'U', _audioUrl: 'https://cdn.example.test/a.mp3' });
  assert.equal(calls.length, 1, 'the idempotency lookup ran for a URL-only track, then publishTrack');
  await assert.rejects(() => ctx.ensureTrackSong({ id: 'crate-6', title: 'Nothing' }), /URL audio/);
  await assert.doesNotReject(() => ctx.ensureTrackSong({ id: 'song:row-1', title: 'Linked', _songId: 'row-1' }));
});
