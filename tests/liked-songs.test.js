const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise the real collection functions without a browser or a production account.
function setup() {
  const source = fs.readFileSync('js/app.js', 'utf8');
  const code = source.slice(source.indexOf('  var likedSongs = [];'), source.indexOf('  function closeSongMenus('));
  const elements = Object.fromEntries(['liked-state', 'liked-list', 'liked-count'].map(id => [id, {innerHTML:'', textContent:'', style:{}}]));
  const song = {id:'song-1', title:'Song', artist:'Artist'};
  const rows = [];
  let user = 'user-a';
  const ctx = {
    $, document: {querySelectorAll: () => []}, tracks: [], currentIndex: 0,
    authed: () => !!user, uid: () => user, currentRoute: () => 'liked',
    esc: String, fmtDate: () => '1 Jan 2026', songCoverUrl: () => null,
    ICONS: {note:'', play:''}, SONG_SELECT:'id,title,artist',
    SONG_APP_BUTTONS: () => '',
    showToast: () => {},
    caApiCall: async (path, method, body) => {
      if (method === 'POST') { rows.push({user_id:body.user_id, song_id:body.song_id, songs:song, added_at:'2026-01-01'}); return []; }
      if (method === 'DELETE') { const i = rows.findIndex(x => x.user_id === user && x.song_id === song.id); if (i !== -1) rows.splice(i,1); return []; }
      if (path.includes('songs(')) return rows.filter(x => x.user_id === user);
      return rows.filter(x => x.user_id === user && x.song_id === song.id);
    }
  };
  function $(id) { return elements[id] || null; }
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return {ctx, elements, song, setUser: x => { user = x; }};
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('new user is empty, first like appears, and unlike returns to empty', async () => {
  const {ctx, elements, song} = setup();
  await ctx.refreshLikes();
  assert.equal(elements['liked-count'].textContent, '0 lagu');
  assert.match(elements['liked-state'].innerHTML, /Belum ada lagu yang disukai/);
  assert.match(elements['liked-state'].innerHTML, /data-route="discover"/);
  ctx.toggleLike(song); await flush(); await flush();
  assert.equal(elements['liked-count'].textContent, '1 lagu');
  assert.match(elements['liked-list'].innerHTML, /Song/);
  ctx.toggleLike(song); await flush(); await flush();
  assert.equal(elements['liked-count'].textContent, '0 lagu');
  assert.equal(elements['liked-list'].innerHTML, '');
  assert.match(elements['liked-state'].innerHTML, /liked-songs-default.png/);
});

test('collection reload is scoped to the current user', async () => {
  const {ctx, elements, song, setUser} = setup();
  await ctx.refreshLikes(); ctx.toggleLike(song); await flush(); await flush();
  setUser('user-b'); await ctx.refreshLikes();
  assert.equal(elements['liked-count'].textContent, '0 lagu');
  assert.equal(elements['liked-list'].innerHTML, '');
});
