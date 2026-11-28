const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise the real publish/delete helpers from js/app.js without a browser:
// storage copy happens BEFORE a song row becomes public, failures stay private,
// URL-only tracks publish as links, and shared objects are never deleted while
// other songs or crate tracks still reference them.
function cut(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start !== -1, 'missing start marker: ' + startMarker);
  let end = source.indexOf(endMarker);
  assert.ok(end !== -1, 'missing end marker: ' + endMarker);
  if (endMarker.startsWith('     ')) end = source.lastIndexOf('/*', end); // include the section comment opener
  return source.slice(start, end);
}

function setup() {
  const source = fs.readFileSync('js/app.js', 'utf8');
  const code = [
    cut(source, '  function isHttpUrl(path) {', '  function canonicalShareUrl(songId)'),
    cut(source, '  function storageCopy(sourceBucket', '     5. DISCOVER'),
    cut(source, '  function songToTrack(song) {', '     6. MY SONGS'),
    cut(source, '  var songsCache = [];', '     7. PUBLISH FLOW'),
    cut(source, '  function extOf(path)', '     8. MODAL HELPERS')
  ].join('\n');

  const events = []; // ordered trace of DB writes and storage requests
  let user = 'user-1';
  let authed = true;
  const ls = {};
  const songRows = []; // rows served for reference checks
  const crateRows = []; // crate_tracks rows served for reference checks
  let existingRow = null; // row served for the publish idempotency check
  let nextRowId = 1;
  const els = {};
  const el = id => els[id] || (els[id] = {
    innerHTML: '', textContent: '', hidden: false, style: {}, disabled: false, value: '',
    addEventListener() {}
  });

  const ctx = {
    SONGS: '/rest/v1/songs',
    SONG_SELECT: 'id,owner_id,owner_name,title,artist,duration_seconds,audio_path,cover_path,source_crate_track_id,source_bucket,visibility,published_at,created_at',
    SONGS_BUCKET: 'chiroot-shared',
    CRATE_BUCKET: 'chiroot-crate',
    PAGE_SIZE: 24,
    ICONS: { note: '', play: '' },
    SONG_APP_BUTTONS: () => '',
    $: el,
    document: { addEventListener() {}, querySelectorAll: () => [] },
    window: { confirm: () => true },
    localStorage: {
      getItem: k => (k in ls ? ls[k] : null),
      setItem: (k, v) => { ls[k] = String(v); },
      removeItem: k => { delete ls[k]; }
    },
    authed: () => authed,
    uid: () => user,
    profile: () => ({ display_name: 'User One', email: 'user-1@test' }),
    caBase: () => 'https://supabase.test',
    caApiKey: () => 'anon-key',
    caCratePublicUrl: p => 'https://supabase.test/storage/v1/object/public/chiroot-crate/' + p,
    ChirootAuth: { session: { access_token: 'token-1' } },
    showToast: () => {},
    refreshDiscover: () => {},
    updateLikeLabels: () => {},
    currentRoute: () => 'songs',
    renderPlaylist: () => {},
    loadTrack: () => {},
    tracks: [],
    playQueue: [],
    currentIndex: 0,
    esc: s => String(s == null ? '' : s),
    fmtDate: () => '1 Jan 2026',
    discState: { items: [] },
    caApiCall: async (path, method, body) => {
      events.push({ kind: 'db', method, path, body: body === undefined ? null : body });
      if (method === 'GET') {
        if (path.includes('/rest/v1/crate_tracks')) return crateRows;
        if (path.includes('source_crate_track_id=eq.')) return existingRow ? [existingRow] : [];
        return songRows;
      }
      if (method === 'POST') { const row = { id: 'row-' + (nextRowId++) }; return [row]; }
      if (method === 'PATCH' || method === 'DELETE') return [];
      return [];
    },
    fetch: async (url, opts) => {
      const body = opts && opts.body ? JSON.parse(opts.body) : null;
      const fail = url.endsWith('/fail');
      events.push({ kind: 'storage', method: opts && opts.method || 'GET', url, body });
      return { ok: !fail, status: fail ? 500 : 200 };
    }
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return {
    ctx, events, els, ls,
    setExisting: r => { existingRow = r; },
    setSongRows: r => { songRows.length = 0; songRows.push(...r); },
    setCrateRows: r => { crateRows.length = 0; crateRows.push(...r); },
    setUser: u => { user = u; },
    setAuthed: a => { authed = a; }
  };
}
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)); };

test('url and path resolution for file, crate and URL-only songs', () => {
  const { ctx } = setup();
  assert.equal(ctx.isHttpUrl('https://cdn.test/a.mp3'), true);
  assert.equal(ctx.isHttpUrl('http://cdn.test/a.mp3'), false);
  assert.equal(ctx.isHttpUrl('uid/a.mp3'), false);
  assert.equal(ctx.songAudioUrl({ audio_path: 'https://cdn.test/a.mp3' }), 'https://cdn.test/a.mp3');
  assert.equal(ctx.songAudioUrl({ audio_path: 'u/t.mp3', source_bucket: 'chiroot-crate' }),
    'https://supabase.test/storage/v1/object/public/chiroot-crate/u/t.mp3');
  assert.equal(ctx.songAudioUrl({ audio_path: 'u/t.mp3', source_bucket: 'chiroot-shared' }),
    'https://supabase.test/storage/v1/object/public/chiroot-shared/u/t.mp3');
  assert.equal(ctx.songCoverUrl({ cover_path: null }), null);
  assert.equal(ctx.songCoverUrl({ cover_path: 'https://cdn.test/c.jpg' }), 'https://cdn.test/c.jpg');
  // A private song that was published before keeps its files (and cover) in chiroot-shared.
  assert.equal(ctx.songCoverUrl({ cover_path: 'u/p1-cover.jpg', source_bucket: 'chiroot-shared' }),
    'https://supabase.test/storage/v1/object/public/chiroot-shared/u/p1-cover.jpg');
  assert.equal(ctx.songCoverUrl({ cover_path: 'u/c1.jpg', source_bucket: 'chiroot-crate' }),
    'https://supabase.test/storage/v1/object/public/chiroot-crate/u/c1.jpg');
});

test('publishing a new crate track copies audio+cover before the row becomes public', async () => {
  const { ctx, events } = setup();
  const status = { textContent: '' };
  const track = { id: 'crate-1', title: 'A', artist: 'B', _audioPath: 'user-1/crate-1.mp3', _coverPath: 'user-1/crate-1.jpg' };
  await ctx.publishTrack(track, true, status);
  await flush();

  const post = events.find(e => e.kind === 'db' && e.method === 'POST');
  const copies = events.filter(e => e.kind === 'storage' && e.body && e.body.sourceKey);
  const patch = events.find(e => e.kind === 'db' && e.method === 'PATCH');

  assert.ok(post, 'row created');
  // The row is only ever visible as private while its files are still in chiroot-crate.
  assert.equal(post.body.visibility, 'private');
  assert.equal(post.body.published_at, null);
  assert.equal(post.body.audio_path, 'user-1/crate-1.mp3');
  assert.equal(post.body.source_bucket, 'chiroot-crate');

  assert.equal(copies.length, 2, 'audio and cover copied');
  const postIdx = events.indexOf(post);
  const patchIdx = events.indexOf(patch);
  assert.ok(patchIdx > postIdx, 'patch happens after insert');
  for (const c of copies) {
    assert.ok(events.indexOf(c) > postIdx && events.indexOf(c) < patchIdx, 'copies happen before the public patch');
    assert.equal(c.body.bucketId, 'chiroot-crate');
    assert.equal(c.body.destinationBucket, 'chiroot-shared');
  }
  assert.equal(copies[0].body.destinationKey, 'user-1/row-1.mp3');
  assert.equal(copies[1].body.destinationKey, 'user-1/row-1-cover.jpg');

  assert.equal(patch.body.visibility, 'public');
  assert.ok(patch.body.published_at, 'published_at set only at the end');
  assert.equal(patch.body.audio_path, 'user-1/row-1.mp3');
  assert.equal(patch.body.cover_path, 'user-1/row-1-cover.jpg');
  assert.equal(patch.body.source_bucket, 'chiroot-shared');
  assert.equal(patch.path.includes('row-1'), true);
});

test('failed copy leaves the song private, never public, and cleans up copied objects', async () => {
  const { ctx, events } = setup();
  const status = { textContent: '' };
  const track = { id: 'crate-2', title: 'A', _audioPath: 'user-1/crate-2.mp3', _coverPath: 'user-1/crate-2.jpg' };
  // Make the cover copy fail (second storage copy request).
  const realFetch = ctx.fetch;
  let copyCount = 0;
  ctx.fetch = async (url, opts) => {
    if (opts && opts.body && JSON.parse(opts.body).destinationKey && JSON.parse(opts.body).destinationKey.includes('-cover')) {
      copyCount++;
      return { ok: false, status: 500 };
    }
    return realFetch(url, opts);
  };
  await assert.rejects(() => ctx.publishTrack(track, true, status), /publik/);
  await flush();

  const patches = events.filter(e => e.kind === 'db' && e.method === 'PATCH');
  assert.equal(patches.length, 0, 'no patch (public or otherwise) after a failed copy');
  const cleanups = events.filter(e => e.kind === 'storage' && e.method === 'DELETE');
  assert.equal(cleanups.length, 1, 'the already-copied audio object is cleaned up');
  assert.ok(cleanups[0].url.includes('/storage/v1/object/chiroot-shared/user-1/row-1.mp3'), 'cleanup targets chiroot-shared');
});

test('URL-only crate tracks publish without any storage copy', async () => {
  const { ctx, events } = setup();
  const track = { id: 'crate-3', title: 'U', _audioUrl: 'https://cdn.example.test/a.mp3' };
  await ctx.publishTrack(track, true, null);
  await flush();

  const copies = events.filter(e => e.kind === 'storage' && e.body && e.body.sourceKey);
  assert.equal(copies.length, 0, 'no file to copy for a URL-only track');
  const post = events.find(e => e.kind === 'db' && e.method === 'POST');
  assert.equal(post.body.audio_path, 'https://cdn.example.test/a.mp3');
  assert.equal(post.body.source_bucket, 'chiroot-shared');
  const patch = events.find(e => e.kind === 'db' && e.method === 'PATCH');
  assert.equal(patch.body.visibility, 'public');
  assert.equal(patch.body.audio_path, undefined, 'audio path untouched');

  // URL-only track that does have an uploaded cover: only the cover is copied.
  events.length = 0;
  const track2 = { id: 'crate-4', title: 'U2', _audioUrl: 'https://cdn.example.test/b.mp3', _coverPath: 'user-1/crate-4.jpg' };
  await ctx.publishTrack(track2, true, null);
  await flush();
  const post2 = events.find(e => e.kind === 'db' && e.method === 'POST');
  assert.equal(post2.body.audio_path, 'https://cdn.example.test/b.mp3');
  assert.equal(post2.body.source_bucket, 'chiroot-crate', 'cover still lives in chiroot-crate while private');
  const copies2 = events.filter(e => e.kind === 'storage' && e.body && e.body.sourceKey);
  assert.equal(copies2.length, 1);
  assert.equal(copies2[0].body.sourceKey, 'user-1/crate-4.jpg');
  const patch2 = events.find(e => e.kind === 'db' && e.method === 'PATCH');
  assert.equal(patch2.body.cover_path, 'user-1/row-2-cover.jpg');
  assert.equal(patch2.body.source_bucket, 'chiroot-shared');
  assert.equal(patch2.body.audio_path, undefined, 'audio stays a plain URL');
});

test('republishing a private row copies its crate files before becoming public', async () => {
  const { ctx, events, setExisting } = setup();
  setExisting({ id: 'row-9', audio_path: 'user-1/crate-9.mp3', cover_path: 'user-1/crate-9.jpg', source_bucket: 'chiroot-crate', visibility: 'private' });
  const track = { id: 'crate-9', title: 'A', artist: 'B', _audioPath: 'user-1/crate-9.mp3', _coverPath: 'user-1/crate-9.jpg' };
  await ctx.publishTrack(track, true, null);
  await flush();

  const copies = events.filter(e => e.kind === 'storage' && e.body && e.body.sourceKey);
  assert.equal(copies.length, 2);
  assert.equal(copies[0].body.sourceKey, 'user-1/crate-9.mp3', 'copy reads the row\u2019s own paths');
  assert.equal(copies[0].body.destinationKey, 'user-1/row-9.mp3');
  const patch = events.find(e => e.kind === 'db' && e.method === 'PATCH');
  assert.equal(patch.body.visibility, 'public');
  assert.equal(patch.body.audio_path, 'user-1/row-9.mp3');
  assert.ok(events.indexOf(patch) > events.indexOf(copies[1]), 'public only after both copies');

  // Row whose files are already in chiroot-shared (published then unpublished): no copy at all.
  events.length = 0;
  setExisting({ id: 'row-8', audio_path: 'user-1/row-8.mp3', cover_path: 'user-1/row-8-cover.jpg', source_bucket: 'chiroot-shared', visibility: 'private' });
  await ctx.publishTrack(track, true, null);
  await flush();
  assert.equal(events.filter(e => e.kind === 'storage').length, 0, 'no copies when files are already shared');
  const patch2 = events.find(e => e.kind === 'db' && e.method === 'PATCH');
  assert.equal(patch2.body.visibility, 'public');
  assert.equal(patch2.body.audio_path, undefined);
});

test('deleteSong deletes objects from the correct bucket and keeps shared ones', async () => {
  const { ctx, events, setSongRows, setCrateRows } = setup();

  // Audio still referenced by another song row -> audio kept, cover removed.
  setSongRows([{ id: 'other', audio_path: 'user-1/s1.mp3', cover_path: null }]);
  await ctx.deleteSong({ id: 's1', title: 'T', audio_path: 'user-1/s1.mp3', cover_path: 'user-1/s1-cover.jpg', source_bucket: 'chiroot-shared' });
  await flush();
  const deletes = events.filter(e => e.kind === 'storage' && e.method === 'DELETE');
  assert.equal(deletes.length, 1);
  assert.ok(deletes[0].url.includes('/chiroot-shared/user-1/s1-cover.jpg'), 'only the unreferenced cover is deleted');

  // Private row whose files live in chiroot-crate: both objects deleted FROM chiroot-crate.
  events.length = 0;
  setSongRows([]);
  await ctx.deleteSong({ id: 's2', title: 'T', audio_path: 'user-1/crate-2.mp3', cover_path: 'user-1/crate-2.jpg', source_bucket: 'chiroot-crate' });
  await flush();
  const del2 = events.filter(e => e.kind === 'storage' && e.method === 'DELETE');
  assert.equal(del2.length, 2);
  assert.ok(del2[0].url.includes('/storage/v1/object/chiroot-crate/user-1/crate-2.mp3'), 'audio from chiroot-crate');
  assert.ok(del2[1].url.includes('/storage/v1/object/chiroot-crate/user-1/crate-2.jpg'), 'cover from chiroot-crate, not chiroot-shared');

  // URL audio has no object; a crate track still using the cover blocks its deletion.
  events.length = 0;
  setCrateRows([{ id: 'c-3', audio_path: null, cover_path: 'user-1/crate-3.jpg' }]);
  await ctx.deleteSong({ id: 's3', title: 'T', audio_path: 'https://cdn.example.test/c.mp3', cover_path: 'user-1/crate-3.jpg', source_bucket: 'chiroot-crate' });
  await flush();
  assert.equal(events.filter(e => e.kind === 'storage' && e.method === 'DELETE').length, 0,
    'URL audio is never "deleted" and the cover is still referenced by crate_tracks');

  // If the reference check fails, no object is touched at all.
  events.length = 0;
  const realApi = ctx.caApiCall;
  ctx.caApiCall = async (path, method) => {
    if (method === 'DELETE') return [];
    throw new Error('offline');
  };
  await ctx.deleteSong({ id: 's4', title: 'T', audio_path: 'user-1/s4.mp3', cover_path: 'user-1/s4-cover.jpg', source_bucket: 'chiroot-shared' });
  await flush();
  ctx.caApiCall = realApi;
  assert.equal(events.filter(e => e.kind === 'storage' && e.method === 'DELETE').length, 0,
    'no storage deletes when references cannot be checked');
});

test('My Songs shows covers for private songs whose files stayed in chiroot-shared', () => {
  const { ctx } = setup();
  const cloud = { innerHTML: '' };
  const crate = { innerHTML: '' };
  ctx.songsCache = [
    { id: 'p1', title: 'Unpublished', cover_path: 'user-1/p1-cover.jpg', source_bucket: 'chiroot-shared', visibility: 'private', created_at: '2026-01-01' },
    { id: 'p2', title: 'Purely private', cover_path: 'user-1/p2-cover.jpg', source_bucket: 'chiroot-crate', visibility: 'private', created_at: '2026-01-01' },
    { id: 'p3', title: 'No cover', cover_path: null, source_bucket: 'chiroot-shared', visibility: 'public' }
  ];
  ctx.renderMySongs(cloud, crate, []);
  const html = cloud.innerHTML;
  assert.match(html, /storage\/v1\/object\/public\/chiroot-shared\/user-1\/p1-cover\.jpg/, 'unpublished-but-shared cover is shown');
  assert.match(html, /storage\/v1\/object\/public\/chiroot-crate\/user-1\/p2-cover\.jpg/, 'crate cover is shown');
  assert.doesNotMatch(html, /p3-cover/, 'missing cover falls back to the note icon');
});
