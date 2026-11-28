const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Songs added dynamically to `tracks` (Discover/Liked/Playlist, id "song:<uuid>")
// are not part of crate_tracks, so after a reload the queue entries that point to
// them would be dropped by restoreState(). The real persistence/restore helpers
// must keep those entries: saved per account (or guest), restored before
// restoreState() runs, pruned against RLS visibility, and never shrunk by merges.
function cut(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start !== -1, 'missing start marker: ' + startMarker);
  let end = source.indexOf(endMarker);
  assert.ok(end !== -1, 'missing end marker: ' + endMarker);
  if (endMarker.startsWith('     ')) end = source.lastIndexOf('/*', end);
  return source.slice(start, end);
}

const LIVE = '11111111-1111-1111-1111-111111111111';
const GONE = '22222222-2222-2222-2222-222222222222';

function setup() {
  const source = fs.readFileSync('js/app.js', 'utf8');
  const code = [
    cut(source, '  function isHttpUrl(path) {', '  function canonicalShareUrl(songId)'),
    cut(source, '  function songToTrack(song) {', '     6. MY SONGS')
  ].join('\n');
  const ls = {};
  let user = 'user-1';
  let authed = true;
  const ctx = {
    SONGS: '/rest/v1/songs',
    SONG_SELECT: 'id,owner_id,owner_name,title,artist,duration_seconds,audio_path,cover_path,source_crate_track_id,source_bucket,visibility,published_at,created_at',
    SONGS_BUCKET: 'chiroot-shared',
    CRATE_BUCKET: 'chiroot-crate',
    $: () => ({ addEventListener() {} }),
    document: { addEventListener() {}, querySelectorAll: () => [] },
    window: {},
    localStorage: {
      getItem: k => (k in ls ? ls[k] : null),
      setItem: (k, v) => { ls[k] = String(v); },
      removeItem: k => { delete ls[k]; }
    },
    authed: () => authed,
    uid: () => user,
    profile: () => null,
    caBase: () => 'https://supabase.test',
    caApiKey: () => 'anon-key',
    caCratePublicUrl: p => 'https://supabase.test/storage/v1/object/public/chiroot-crate/' + p,
    showToast: () => {},
    refreshDiscover: () => {},
    renderPlaylist: () => {},
    loadTrack: () => {},
    tracks: [],
    playQueue: [],
    currentIndex: 0,
    discState: { items: [] },
    caApiCall: async (path, method) => {
      const ids = path.includes('id=in.(') ? path.split('id=in.(')[1].split(')')[0].split(',') : [];
      return ids.includes(LIVE) ? [liveRow()] : [];
    },
    fetch: async (url, opts) => {
      ctx.guestFetches.push({ url, headers: opts && opts.headers });
      return { ok: true, json: async () => [liveRow()] };
    }
  };
  ctx.guestFetches = [];
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return {
    ctx, ls,
    setUser: u => { user = u; },
    setAuthed: a => { authed = a; },
    key: () => 'chiroot_dynamic_songs_v1:' + (authed ? user : 'guest')
  };
}
const liveRow = () => ({
  id: LIVE, owner_id: 'someone', owner_name: 'Owner', title: 'Shared Song', artist: 'Artist',
  audio_path: 'someone/song-file.mp3', cover_path: null, source_bucket: 'chiroot-shared',
  visibility: 'public', published_at: '2026-01-01', created_at: '2026-01-01'
});
const songTrack = () => ({ id: 'song:' + LIVE, title: 'Shared Song', artist: 'Artist', _songId: LIVE });
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)); };

test('playing a shared song persists it per account, merges instead of shrinking', () => {
  const { ctx, ls, key } = setup();
  ctx.tracks = [{ id: 'crate-1', title: 'Crate', artist: 'A' }];
  ctx.playSong({ id: LIVE, title: 'Shared Song', artist: 'Artist', audio_path: 'someone/song-file.mp3', source_bucket: 'chiroot-shared' });
  assert.deepEqual(JSON.parse(ls[key()]), [LIVE], 'the dynamic song id is persisted');

  // A later saveState with the song gone (e.g. another crate load) must not erase it.
  ctx.tracks = [{ id: 'crate-1', title: 'Crate', artist: 'A' }];
  ctx.caPersistDynamicSongTracks();
  assert.deepEqual(JSON.parse(ls[key()]), [LIVE], 'merge never shrinks the stored list');
});

test('restore re-adds persisted shared songs and prunes invisible ones', async () => {
  const { ctx, ls, key } = setup();
  ls[key()] = JSON.stringify([GONE, LIVE]);
  await ctx.caRestoreDynamicSongTracks();
  await flush();

  const restored = ctx.tracks.find(t => t.id === 'song:' + LIVE);
  assert.ok(restored, 'the still-visible song is back in tracks');
  assert.equal(restored.title, 'Shared Song');
  assert.equal(restored.src, 'https://supabase.test/storage/v1/object/public/chiroot-shared/someone/song-file.mp3');
  assert.deepEqual(JSON.parse(ls[key()]), [LIVE], 'the deleted/private-again song id is pruned');
});

test('restore works in guest mode through the public (anon) API', async () => {
  const { ctx, ls, key, setAuthed } = setup();
  setAuthed(false);
  ls[key()] = JSON.stringify([LIVE]);
  await ctx.caRestoreDynamicSongTracks();
  await flush();
  assert.equal(ctx.guestFetches.length, 1, 'anon fetch used for guests');
  assert.equal(ctx.guestFetches[0].headers.apikey, 'anon-key');
  assert.ok(ctx.tracks.some(t => t.id === 'song:' + LIVE));
  assert.deepEqual(JSON.parse(ls[key()]), [LIVE]);
});

test('restore skips malformed ids and survives fetch failures untouched', async () => {
  const { ctx, ls, key } = setup();
  ls[key()] = JSON.stringify(['not-a-uuid']);
  await ctx.caRestoreDynamicSongTracks();
  assert.deepEqual(ctx.tracks, [], 'no fetch for ids that cannot be song ids');

  ls[key()] = JSON.stringify([LIVE]);
  ctx.caApiCall = async () => { throw new Error('offline'); };
  await ctx.caRestoreDynamicSongTracks();
  await flush();
  assert.deepEqual(JSON.parse(ls[key()]), [LIVE], 'list kept when the visibility check fails');
  assert.deepEqual(ctx.tracks, [], 'nothing added when the check fails');
});
