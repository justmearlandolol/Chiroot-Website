const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise the real playlist list/detail helpers without a browser or network.
function setup() {
  const source = fs.readFileSync('js/app.js', 'utf8');
  const code = source.slice(source.indexOf('  var PLAYLISTS = '), source.indexOf('  function openPlaylistForm('));
  const el = Object.fromEntries(['playlist-dialog','playlist-picker','my-playlists-state','my-playlists-list','public-playlist-state','public-playlist-list','discover-playlist-search','discover-playlist-sort','playlist-detail-state','playlist-detail','playlist-tracks'].map(id => [id, {innerHTML:'',textContent:'',style:{},value:''}]));
  el['discover-playlist-sort'].value = 'newest';
  let account = 'user-a';
  const songs = [
    {id:'item-2', position:2, added_at:'2026-01-02', songs:{id:'s2',title:'Second',artist:'Artist'}},
    {id:'item-1', position:1, added_at:'2026-01-01', songs:{id:'s1',title:'First',artist:'Artist'}},
    {id:'hidden', position:3, songs:null}
  ];
  const rows = [{id:'00000000-0000-0000-0000-000000000001',name:'<My list>',creator_name:'Owner',owner_id:'user-a',visibility:'private',created_at:'2026-01-01',playlist_items:songs}];
  const ctx = {
    $: id => el[id], SONG_SELECT:'id,title', ICONS:{note:'',play:''},
    window:{location:{hash:'#/playlist/00000000-0000-0000-0000-000000000001'}},
    authed:()=>!!account, uid:()=>account, songCoverUrl:()=>null,
    esc: x => String(x || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
    fmtDate:()=> '1 Jan 2026', cleanSearch:x=>x, updateLikeLabels:()=>{},
    caApiCall:async()=> rows, publicApi:async()=>rows
  };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return {ctx, el, songs, setAccount: x => { account=x; }};
}

test('playlist rows use stable order and exclude inaccessible songs', () => {
  const {ctx,songs}=setup();
  assert.deepEqual(Array.from(ctx.sortItems(songs), x=>x.id), ['item-1','item-2']);
  const card=ctx.cards([{id:'p',name:'<script>',creator_name:'Owner',playlist_items:songs}]);
  assert.match(card,/&lt;script&gt;/);
  assert.match(card,/2 lagu/);
});

test('playlist library shows the authenticated user\'s server results', async () => {
  const {ctx,el,setAccount}=setup();
  await ctx.refreshMyPlaylists();
  assert.match(el['my-playlists-list'].innerHTML,/&lt;My list&gt;/);
  setAccount(''); await ctx.refreshMyPlaylists();
  assert.equal(el['my-playlists-list'].innerHTML,'');
  assert.match(el['my-playlists-state'].innerHTML,/Login/);
});

test('detail shows owner controls and added timestamps in stable order', async () => {
  const {ctx,el}=setup();
  ctx.refreshPlaylistDetail();
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(el['playlist-detail'].innerHTML,/data-playlist-edit/);
  assert.match(el['playlist-tracks'].innerHTML,/Ditambahkan 1 Jan 2026/);
  assert.ok(el['playlist-tracks'].innerHTML.indexOf('First') < el['playlist-tracks'].innerHTML.indexOf('Second'));
  assert.doesNotMatch(el['playlist-tracks'].innerHTML,/hidden/);
});
