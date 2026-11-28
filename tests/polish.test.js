const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Frontend polish regression tests:
//  1. Liked Songs is pinned inside Playlists as a derived system playlist (no records).
//  2. Profile picture: strict validation, storage upload, safe old-file cleanup.
//  3. Duplicate playback: stable song IDs prevent duplicate player entries and
//     duplicate songs rows.
//  4. App-link menu actions use only verified fallbacks (no invented scheme).
function cut(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start !== -1, 'missing start marker: ' + startMarker);
  let end = source.indexOf(endMarker);
  assert.ok(end !== -1, 'missing end marker: ' + endMarker);
  if (endMarker.startsWith('     ')) end = source.lastIndexOf('/*', end);
  return source.slice(start, end);
}

const UUID = '11111111-1111-1111-1111-111111111111';

/* ---------------- 1. Liked Songs pinned in Playlists ---------------- */
function playlistSetup() {
  const source = fs.readFileSync('js/app.js', 'utf8');
  const code = cut(source, '  var PLAYLISTS = ', '  function openPlaylistForm(');
  const el = Object.fromEntries(['my-playlists-state', 'my-playlists-list', 'playlist-dialog', 'playlist-picker', 'discover-playlist-search', 'discover-playlist-sort'].map(id => [id, { innerHTML: '', textContent: '', style: {}, value: '' }]));
  el['discover-playlist-sort'].value = 'newest';
  const posts = [];
  const rows = [{ id: UUID, name: 'My list', creator_name: 'Owner', owner_id: 'user-a', visibility: 'private', created_at: '2026-01-01', playlist_items: [] }];
  const ctx = {
    $: id => el[id], SONG_SELECT: 'id,title', PL_SELECT: 'id,name,playlist_items(id,songs(id))', ICONS: { note: '', play: '' },
    SONG_APP_BUTTONS: () => '', likedIds: { 's1': true, 's2': true },
    window: { location: { hash: '' } },
    authed: () => !!ctx.__user, uid: () => ctx.__user || '', songCoverUrl: () => null,
    esc: x => String(x || ''), fmtDate: () => '1 Jan 2026', cleanSearch: x => x, updateLikeLabels: () => {},
    caApiCall: async (path, method) => { if (method === 'POST') posts.push(path); return rows; },
    publicApi: async () => rows
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { ctx, el, posts, rows, setUser: u => { ctx.__user = u; } };
}

test('Liked Songs is pinned first in Playlists as a derived system playlist', async () => {
  const { ctx, el, posts, setUser } = playlistSetup();
  setUser('user-a');
  await ctx.refreshMyPlaylists();
  const html = el['my-playlists-list'].innerHTML;
  const likedIdx = html.indexOf('data-open-liked');
  assert.ok(likedIdx !== -1, 'Liked Songs card rendered');
  assert.ok(likedIdx < html.indexOf('My list'), 'Liked card comes before user playlists');
  assert.match(html, /liked-songs-default\.png/, 'existing Liked artwork preserved');
  assert.match(html, /Liked Songs/);
  assert.match(html, /2 lagu/, 'count derived from the user\u2019s likes');
  assert.match(html, /collection-card/, 'uses the same playlist card styling');
  assert.deepEqual(posts, [], 'no playlist record is created for Liked Songs');
  assert.match(el['my-playlists-list'].innerHTML, /data-open-playlist/, 'user playlists still render');
});

test('Liked Songs count follows the user, guests get the login state', async () => {
  const { ctx, el, setUser } = playlistSetup();
  setUser('user-a');
  await ctx.refreshMyPlaylists();
  assert.match(el['my-playlists-list'].innerHTML, /2 lagu/);
  ctx.likedIds = { 's1': true };
  await ctx.refreshMyPlaylists();
  assert.match(el['my-playlists-list'].innerHTML, /1 lagu/, 'count follows the current user\u2019s likes');
  setUser('');
  await ctx.refreshMyPlaylists();
  assert.doesNotMatch(el['my-playlists-list'].innerHTML, /data-open-liked/, 'no Liked card content leaks to guests');
  assert.match(el['my-playlists-state'].innerHTML, /Login/);
});

/* ---------------- 3. Duplicate playback / library entries ---------------- */
const COMMON_APP_SLICES = source => [
  cut(source, '  function isHttpUrl(path) {', '  function canonicalShareUrl(songId)'),
  cut(source, '  function songToTrack(song) {', '     6. MY SONGS')
];

function playerSetup() {
  const source = fs.readFileSync('js/app.js', 'utf8');
  const code = COMMON_APP_SLICES(source).concat([
    cut(source, '  function ensureTrackSong(track) {', '  function doTrackAction(track, action) {'),
    cut(source, '  function playPlaylistSongs(shuffle) {', "  $('playlist-create')")
  ]).join('\n');
  const els = { 'disc-list': { addEventListener() {} }, 'disc-state': { innerHTML: '', style: {} }, 'disc-more': { addEventListener() {}, style: {}, disabled: false }, 'disc-search': { addEventListener() {} }, 'disc-sort': { addEventListener() {} } };
  const posts = [];
  const ctx = {
    SONG_SELECT: 'id,owner_id,owner_name,title,artist,duration_seconds,audio_path,cover_path,source_crate_track_id,source_bucket,visibility,published_at,created_at',
    SONGS: '/rest/v1/songs', SONGS_BUCKET: 'chiroot-shared', CRATE_BUCKET: 'chiroot-crate',
    $: id => els[id] || ({ addEventListener() {}, style: {}, textContent: '' }),
    document: { addEventListener() {}, querySelectorAll: () => [] },
    window: {},
    authed: () => !!ctx.__user, uid: () => ctx.__user || 'user-1',
    caBase: () => 'https://supabase.test', caApiKey: () => 'anon-key',
    caCratePublicUrl: p => 'https://supabase.test/storage/v1/object/public/chiroot-crate/' + p,
    showToast: () => {}, refreshDiscover: () => {}, renderPlaylist: () => {}, loadTrack: () => {},
    tracks: [], playQueue: [], currentIndex: 0, discState: { items: [] },
    caApiCall: async (path, method) => { if (method === 'POST') posts.push([path, method]); return []; },
    fetch: async () => ({ ok: true, json: async () => [] })
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { ctx, posts, setUser: u => { ctx.__user = u; } };
}
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)); };
const song = over => Object.assign({ id: UUID, title: 'Shared', artist: 'A', audio_path: 'someone/s1.mp3', cover_path: null, source_bucket: 'chiroot-shared', visibility: 'public' }, over || {});

test('playing the same song repeatedly keeps a single player entry', () => {
  const { ctx } = playerSetup();
  ctx.playSong(song());
  ctx.playSong(song());
  ctx.playSong(song({ title: 'Renamed' }));
  assert.equal(ctx.tracks.length, 1, 'no duplicate entry for repeated playback');
  assert.equal(ctx.tracks[0].id, 'song:' + UUID);
  assert.equal(ctx.tracks[0]._songId, UUID);
  assert.equal(ctx.tracks[0].title, 'Renamed', 'entry updated in place');
});

test('playing a library song whose crate track is already present updates it in place', () => {
  const { ctx } = playerSetup();
  const crateTrack = { id: 'crate-9', title: 'Old title', artist: 'Old artist', src: 'https://supabase.test/storage/v1/object/public/chiroot-crate/user/crate-9.mp3', labelColor: '#d84a3a', vinylColor: '#1e1e24', isDemo: false, _audioPath: 'user/crate-9.mp3', _coverPath: 'user/crate-9.jpg' };
  ctx.tracks = [crateTrack];
  ctx.playSong(song({ source_crate_track_id: 'crate-9', title: 'New title' }));
  assert.equal(ctx.tracks.length, 1, 'no second entry for the same audio');
  assert.equal(ctx.tracks[0].id, 'crate-9', 'stable crate id preserved (queue stays valid)');
  assert.equal(ctx.tracks[0]._songId, UUID, 'entry now linked to the song row');
  assert.equal(ctx.tracks[0].title, 'New title');
  assert.equal(ctx.tracks[0]._audioPath, 'user/crate-9.mp3', 'crate file fields preserved');
});

test('guest mode also dedupes playback without touching the network', () => {
  const { ctx, posts, setUser } = playerSetup();
  setUser('');
  ctx.playSong(song());
  ctx.playSong(song());
  assert.equal(ctx.tracks.length, 1);
  assert.deepEqual(posts, [], 'playback never inserts song rows, guest or not');
});

test('ensureTrackSong never creates a songs row from a song-id track', async () => {
  const { ctx, posts, setUser } = playerSetup();
  setUser('user-1');
  const viaId = await ctx.ensureTrackSong({ id: 'song:' + UUID, title: 'Shared' });
  assert.equal(viaId.id, UUID, 'the existing song id is used directly');
  await flush();
  assert.deepEqual(posts, [], 'no POST to songs for a track that is already a song row');
  await assert.rejects(() => ctx.ensureTrackSong({ id: 'song:not-a-uuid', title: 'x' }));
});

test('playPlaylistSongs does not stack duplicate queue entries', () => {
  const { ctx } = playerSetup();
  ctx.detailSongs = [{ songs: song() }, { songs: song() }, { songs: song({ id: '22222222-2222-2222-2222-222222222222' }) }];
  ctx.queueTrackIndex = id => ctx.tracks.findIndex(t => String(t.id) === String(id));
  ctx.saveState = () => {};
  ctx.playPlaylistSongs(false);
  const first = ctx.tracks.find(t => t.id === 'song:' + UUID);
  assert.deepEqual(ctx.playQueue, ['song:22222222-2222-2222-2222-222222222222'],
    'repeated play-all keeps one queue entry per song (first song is now playing)');
  assert.ok(first, 'tracks contain the playlist song once');
  assert.equal(ctx.tracks.filter(t => t.id === 'song:' + UUID).length, 1);
});

/* ---------------- 4. App-link menu actions ---------------- */
function appLinkSetup() {
  const source = fs.readFileSync('js/app.js', 'utf8');
  const code = COMMON_APP_SLICES(source).concat([
    cut(source, '  var CHIROOT_APP_SONG_URL = null;', '  function doTrackAction(track, action) {')
  ]).join('\n');
  const opened = [];
  const toasts = [];
  const ctx = {
    SONGS_BUCKET: 'chiroot-shared', CRATE_BUCKET: 'chiroot-crate',
    $: () => ({ addEventListener() {}, style: {} }),
    window: { open: (url, t) => { opened.push([url, t]); return {}; } },
    canonicalShareUrl: id => 'https://chiroot.test/Main.html?song=' + id,
    showToast: m => toasts.push(m),
    tracks: [], currentIndex: 0, discState: { items: [song()] }, songsCache: [song()], likedSongs: [{ songs: song() }], detailSongs: [{ songs: song() }],
    authed: () => true, uid: () => 'user-1',
    caBase: () => 'https://supabase.test', caApiKey: () => 'anon-key', caCratePublicUrl: p => 'https://supabase.test/storage/v1/object/public/chiroot-crate/' + p,
    showToast: m => toasts.push(m), refreshDiscover: () => {}, renderPlaylist: () => {}, loadTrack: () => {},
    playQueue: [], caApiCall: async () => [], fetch: async () => ({ ok: true, json: async () => [] })
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { ctx, opened, toasts };
}

test('app menu actions use verified fallbacks (download page / song page), no invented scheme', () => {
  const { ctx, opened, toasts } = appLinkSetup();
  ctx.openSongInApp(song(), 'desktop');
  assert.deepEqual(opened[0], ['exe.html', '_blank'], 'desktop falls back to the verified app download page');
  ctx.openSongInApp(song(), 'mobile');
  assert.deepEqual(opened[1], ['https://chiroot.test/Main.html?song=' + UUID, '_blank'], 'mobile falls back to the website song page');
  ctx.openSongInApp(null, 'desktop');
  assert.match(toasts[toasts.length - 1], /tidak tersedia/);
  assert.equal(opened.length, 2, 'nothing opened without a song');
  assert.ok(!opened.some(o => String(o[0]).indexOf('chiroot://') === 0), 'no unverified deep link is attempted');
});

test('once a verified song scheme exists, both actions use it via one constant', () => {
  const { ctx, opened } = appLinkSetup();
  vm.runInContext('CHIROOT_APP_SONG_URL = "app://song?id="', ctx);
  ctx.openSongInApp(song(), 'desktop');
  ctx.openSongInApp(song(), 'mobile');
  assert.deepEqual(opened, [['app://song?id=' + UUID, '_blank'], ['app://song?id=' + UUID, '_blank']]);
});

test('every song three-dot menu includes the app actions and the resolver covers all sources', () => {
  const { ctx } = appLinkSetup();
  const buttons = ctx.SONG_APP_BUTTONS('discover', 0);
  assert.match(buttons, /data-song-app="discover"/);
  assert.match(buttons, /data-song-app-kind="desktop"/);
  assert.match(buttons, /data-song-app-kind="mobile"/);
  assert.equal(ctx.songFromMenuSource('discover', 0).id, UUID);
  assert.equal(ctx.songFromMenuSource('mine', 0).id, UUID);
  assert.equal(ctx.songFromMenuSource('liked', 0).id, UUID);
  assert.equal(ctx.songFromMenuSource('playlist', 0).id, UUID);
  const app = fs.readFileSync('js/app.js', 'utf8');
  for (const marker of ['SONG_APP_BUTTONS(\'discover\', i)', 'SONG_APP_BUTTONS(\'mine\', i)', 'SONG_APP_BUTTONS(\'liked\', i)', 'SONG_APP_BUTTONS(\'playlist\', i)']) {
    assert.ok(app.includes(marker), 'menu wired: ' + marker);
  }
  assert.ok(app.includes("data-song-app]"), 'click handler is wired for data-song-app');
});

/* ---------------- 2. Profile picture ---------------- */
function pfpSetup() {
  const source = fs.readFileSync('Main.html', 'utf8');
  const code = [
    cut(source, 'const CHIROOT_PFP_MAX_BYTES = 5 * 1024 * 1024;', 'async function caProcessPfpFile(file) {'),
    cut(source, 'function caDataUrlToBlob(dataUrl) {', 'function caAskSignOut() {')
  ].join('\n');
  const uploads = [], deletes = [], patches = [], gets = [];
  const imageData = 'iVBORw0KGgoAAAANSUhEUg==';
  const ctx = {
    CHIROOT_CRATE_BUCKET: 'chiroot-crate',
    ChirootAuth: { session: { user: { id: 'user-1' } }, profile: { id: 'user-1', display_name: 'U', pfp: '' } },
    caBase: () => 'https://supabase.test',
    caCratePublicUrl: p => 'https://supabase.test/storage/v1/object/public/chiroot-crate/' + p,
    caStorageUpload: async (path, blob, type) => { uploads.push({ path, type, size: blob.size }); return path; },
    caStorageDelete: async path => { deletes.push(path); return true; },
    document: { getElementById: () => null },
    caApiCall: async (path, method) => {
      if (method === 'GET' && path.includes('/rest/v1/playlists')) { gets.push(path); return ctx.__playlistRefs; }
      return [];
    },
    caUpdateProfile: async fields => { patches.push(fields); return Object.assign({}, ctx.ChirootAuth.profile, fields); },
    caSanitizeProfile: (row, uid) => (row && String(row.id) === String(uid)) ? row : null,
    caAccountRemember: () => {}, caRenderTopbar: () => {}, caRenderGreeting: () => {},
    caRenderProfilePreview: () => {}, caFireHook: (n, p) => { ctx.__hook = [n, p]; },
    pfDraft: { pfp: '' },
    showToast: m => { ctx.__toasts.push(m); },
    caProcessPfpFile: async () => 'data:image/jpeg;base64,' + imageData,
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    Blob: globalThis.Blob,
    __playlistRefs: [],
    __toasts: []
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { ctx, uploads, deletes, patches, gets };
}

test('profile image validation requires matching extension AND MIME type, max 5 MB', () => {
  const { ctx } = pfpSetup();
  const f = (name, type, size) => ({ name, type, size: size || 10 });
  ctx.caValidateProfileImageFile(f('a.png', 'image/png'));
  ctx.caValidateProfileImageFile(f('a.jpg', 'image/jpeg'));
  ctx.caValidateProfileImageFile(f('a.jpeg', 'image/jpeg'));
  ctx.caValidateProfileImageFile(f('a.webp', 'image/webp'));
  assert.throws(() => ctx.caValidateProfileImageFile(f('a.png', 'image/gif')), /PNG, JPEG/, 'MIME mismatch rejected');
  assert.throws(() => ctx.caValidateProfileImageFile(f('a.txt', 'image/png')), /PNG, JPEG/, 'extension mismatch rejected');
  assert.throws(() => ctx.caValidateProfileImageFile(f('a.png', '')), /PNG, JPEG/, 'missing MIME rejected');
  assert.throws(() => ctx.caValidateProfileImageFile(f('', 'image/png')), /PNG, JPEG/, 'missing extension rejected');
  assert.throws(() => ctx.caValidateProfileImageFile(f('a.png', 'image/png', 6 * 1024 * 1024)), /5 MB/, 'oversize rejected');
  assert.throws(() => ctx.caValidateProfileImageFile(null), /Pilih file/);
});

test('profile picture uploads to the user\u2019s own storage folder and saves the URL', async () => {
  const { ctx, uploads, patches } = pfpSetup();
  const res = await ctx.caUploadProfilePictureFromDataUrl('data:image/jpeg;base64,' + 'aGk=', {});
  assert.match(res.path, /^user-1\/profile\/avatar-[a-z0-9-]+\.jpg$/, 'stored under the user\u2019s own folder (storage policy)');
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].type, 'image/jpeg', 'JPEG is accepted by the bucket\u2019s allowed mime types');
  assert.ok(uploads[0].size > 0, 'a real blob was uploaded');
  assert.deepEqual(patches.map(p => ({ pfp: p.pfp })), [{ pfp: res.url }], 'profile is patched with the storage URL');
  assert.match(res.url, /storage\/v1\/object\/public\/chiroot-crate\/user-1\/profile\/avatar-/);
});

test('a failed profile PATCH cleans up the just-uploaded object (no orphans)', async () => {
  const { ctx, uploads, deletes, patches } = pfpSetup();
  ctx.caUpdateProfile = async () => { throw new Error('RLS denied'); };
  await assert.rejects(() => ctx.caUploadProfilePictureFromDataUrl('data:image/jpeg;base64,' + 'aGk=', {}));
  assert.equal(uploads.length, 1);
  assert.equal(deletes.length, 1, 'the uploaded object is removed again');
  assert.deepEqual(patches.map(p => ({ pfp: p.pfp })), [], 'no profile update persisted after the failure');
});

test('replacing a picture deletes the old file only when unreferenced and owned', async () => {
  const { ctx, deletes, gets } = pfpSetup();
  const oldUrl = 'https://supabase.test/storage/v1/object/public/chiroot-crate/user-1/profile/avatar-old.jpg';
  ctx.__playlistRefs = []; // not referenced by any playlist snapshot
  await ctx.caUploadProfilePictureFromDataUrl('data:image/jpeg;base64,' + 'aGk=', { oldPfp: oldUrl });
  assert.equal(gets.length, 1, 'playlists.creator_image snapshot check ran');
  assert.deepEqual(deletes, ['user-1/profile/avatar-old.jpg'], 'unreferenced old avatar removed');

  deletes.length = 0; gets.length = 0;
  ctx.__playlistRefs = [{ id: 'p1' }]; // a playlist still shows this picture
  await ctx.caUploadProfilePictureFromDataUrl('data:image/jpeg;base64,' + 'aGk=', { oldPfp: oldUrl });
  assert.deepEqual(deletes, [], 'referenced old avatar kept');

  deletes.length = 0;
  ctx.caApiCall = async () => { throw new Error('offline'); };
  await ctx.caUploadProfilePictureFromDataUrl('data:image/jpeg;base64,' + 'aGk=', { oldPfp: oldUrl });
  assert.deepEqual(deletes, [], 'failed reference check keeps the old file');

  deletes.length = 0;
  const foreignUrl = 'https://supabase.test/storage/v1/object/public/chiroot-crate/user-2/profile/avatar-x.jpg';
  ctx.__playlistRefs = [];
  await ctx.caUploadProfilePictureFromDataUrl('data:image/jpeg;base64,' + 'aGk=', { oldPfp: foreignUrl });
  assert.deepEqual(deletes, [], 'files outside the user\u2019s own folder are never touched');
  assert.ok(ctx.caOwnPfpStoragePathFromUrl('data:image/png;base64,xx') === null, 'data URLs have no storage object');
});

test('clicking the avatar runs validate -> upload -> profile update -> UI refresh', async () => {
  const { ctx, uploads, patches } = pfpSetup();
  const url = await ctx.caChangeProfilePictureFromFile({ name: 'me.png', type: 'image/png', size: 100 });
  assert.match(url, /chiroot-crate\/user-1\/profile\/avatar-/);
  assert.equal(patches.length, 1);
  assert.match(ctx.ChirootAuth.profile.pfp, /avatar-/);
  assert.equal(ctx.pfDraft.pfp, url);
  assert.deepEqual(ctx.__hook[0], 'onProfileUpdated');
  assert.equal(uploads.length, 1);

  ctx.__toasts.length = 0;
  await ctx.caChangeProfilePictureFromFile({ name: 'x.gif', type: 'image/gif', size: 10 });
  assert.match(ctx.__toasts[ctx.__toasts.length - 1], /Gagal mengganti foto/);
  assert.equal(uploads.length, 1, 'invalid file never reaches storage');

  ctx.__toasts.length = 0;
  ctx.ChirootAuth.profile = null;
  const r = await ctx.caChangeProfilePictureFromFile({ name: 'me.png', type: 'image/png', size: 10 });
  assert.equal(r, null, 'guests cannot change a profile picture');
  assert.match(ctx.__toasts[ctx.__toasts.length - 1], /Login/);
  assert.equal(uploads.length, 1);
});
