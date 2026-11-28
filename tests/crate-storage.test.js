const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Deleting a crate track (or resetting the crate, or replacing its audio/cover)
// must NOT delete storage objects that are still referenced by a `songs` row.
// A private song row is created automatically when a crate track is liked or
// added to a playlist, and that row points at the very same crate objects.
function cut(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start !== -1, 'missing start marker: ' + startMarker);
  let end = source.indexOf(endMarker);
  assert.ok(end !== -1, 'missing end marker: ' + endMarker);
  if (endMarker.startsWith('     ')) end = source.lastIndexOf('/*', end);
  return source.slice(start, end);
}

function setup() {
  const source = fs.readFileSync('Main.html', 'utf8');
  const code = [
    cut(source, 'async function caCrateUpdate(track, fields', '/* Kembalikan daftar path'),
    cut(source, '/* Kembalikan daftar path', 'function caLoginRedirectUrl()')
  ].join('\n');
  const deleted = [];
  const uploaded = [];
  const dbCalls = [];
  let songRefs = []; // rows returned by the songs reference check
  const ctx = {
    ChirootAuth: { session: { user: { id: 'user-1' } } },
    uid: () => 'user-1',
    caApiCall: async (path, method, body) => {
      dbCalls.push({ path, method, body });
      if (method === 'GET' && path.includes('/rest/v1/songs')) return songRefs;
      return [];
    },
    caStorageUpload: async (path) => { uploaded.push(path); return path; },
    caStorageDelete: async (path) => { deleted.push(path); return true; },
    caMapCrateRow: row => ({ id: row.id, title: row.title || 't', artist: 'a', src: 'x', cover: null, _audioPath: row.audio_path || null, _coverPath: row.cover_path || null, _audioUrl: row.audio_url || null }),
    caBustUrl: u => u,
    caSafePathToken: s => String(s).replace(/[^a-zA-Z0-9_-]/g, '_'),
    caCratePublicUrl: p => 'https://supabase.test/storage/v1/object/public/chiroot-crate/' + p
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { ctx, deleted, uploaded, dbCalls, setSongRefs: r => { songRefs = r; } };
}
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)); };

test('reference check returns only paths still used by songs rows', async () => {
  const { ctx, setSongRefs } = setup();
  setSongRefs([{ id: 'r1', audio_path: 'user-1/t1.mp3', cover_path: 'user-1/t1.jpg' }]);
  const found = await ctx.caSongsReferencedObjectPaths(['user-1/t1.mp3', 'user-1/t1.jpg', 'user-1/t2.mp3']);
  assert.deepEqual([...found], ['user-1/t1.mp3', 'user-1/t1.jpg']);
  setSongRefs([]);
  assert.deepEqual([...await ctx.caSongsReferencedObjectPaths([])], []);
});

test('caCrateDelete keeps objects that a songs row still references', async () => {
  const { ctx, deleted, setSongRefs } = setup();
  const track = { id: 'crate-1', _audioPath: 'user-1/crate-1.mp3', _coverPath: 'user-1/crate-1.jpg' };

  setSongRefs([{ id: 'song-1', audio_path: 'user-1/crate-1.mp3', cover_path: null }]);
  await ctx.caCrateDelete(track);
  await flush();
  assert.deepEqual(deleted, [], 'nothing deleted while the song row uses the audio object');

  setSongRefs([]);
  await ctx.caCrateDelete(track);
  await flush();
  assert.deepEqual(deleted, ['user-1/crate-1.mp3', 'user-1/crate-1.jpg'], 'both objects removed once unreferenced');
});

test('caCrateDelete keeps objects when the reference check fails', async () => {
  const { ctx, deleted } = setup();
  ctx.caApiCall = async (path, method) => {
    if (method === 'GET') throw new Error('offline');
    return [];
  };
  await ctx.caCrateDelete({ id: 'crate-1', _audioPath: 'user-1/crate-1.mp3', _coverPath: null });
  await flush();
  assert.deepEqual(deleted, [], 'failure to verify references keeps every object');
});

test('caCrateReset only removes objects that no songs row references', async () => {
  const { ctx, deleted, setSongRefs } = setup();
  const rows = [
    { id: 'c1', _audioPath: 'user-1/c1.mp3', _coverPath: 'user-1/c1.jpg' },
    { id: 'c2', _audioPath: 'user-1/c2.mp3', _coverPath: null }
  ];
  ctx.caFetchCrate = async () => rows;
  setSongRefs([{ id: 'song-9', audio_path: 'user-1/c1.mp3', cover_path: null }]);
  await ctx.caCrateReset();
  await flush();
  assert.deepEqual(deleted, ['user-1/c2.mp3'], 'c1 objects kept (referenced), c2 removed');
});

test('caCrateUpdate keeps a replaced object that is still referenced by a song', async () => {
  const { ctx, deleted, uploaded, setSongRefs } = setup();
  const track = { id: 'crate-1', title: 'T', artist: 'A', _audioPath: 'user-1/old.mp3', _coverPath: 'user-1/old.jpg' };
  const blob = { size: 10 };

  setSongRefs([{ id: 'song-1', audio_path: 'user-1/old.mp3', cover_path: null }]);
  await ctx.caCrateUpdate(track, { title: 'T2' }, blob, null);
  await flush();
  assert.equal(uploaded.length, 1, 'new audio uploaded');
  assert.deepEqual(deleted, [], 'old audio object kept: a songs row still points at it');

  setSongRefs([]);
  await ctx.caCrateUpdate(track, { title: 'T3' }, blob, null);
  await flush();
  assert.ok(deleted.includes('user-1/old.mp3'), 'old audio removed once unreferenced');
  assert.ok(!deleted.includes('user-1/old.jpg'), 'cover was not replaced, so it is kept');
});
