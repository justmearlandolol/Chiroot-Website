const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Boot-time robustness: the "Memeriksa sesi…" gate must never spin forever.
// Boot-critical fetches are bounded (caFetchWithTimeout, media uploads exempt),
// the gate gets a watchdog fallback (caGateStuck), and a boot that finally
// completes after the fallback took over must not clobber that state.
function cut(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start !== -1, 'missing start marker: ' + startMarker);
  let end = source.indexOf(endMarker);
  assert.ok(end !== -1, 'missing end marker: ' + endMarker);
  return source.slice(start, end);
}

function makeEl(extra) {
  const el = {
    children: [], _listeners: {}, className: '', id: '', innerHTML: '', textContent: '',
    type: '', disabled: false, onclick: null,
    classList: {
      _set: new Set(),
      contains(c) { return this._set.has(c); },
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); }
    },
    setAttribute(k, v) { el._attrs[k] = v; },
    _attrs: {},
    appendChild(ch) { el.children.push(ch); return ch; },
    remove() {},
    addEventListener(n, f) { (el._listeners[n] = el._listeners[n] || []).push(f); },
    querySelector() { return null; },
    querySelectorAll() { return [] }
  };
  return Object.assign(el, extra || {});
}

function loadCode() {
  const source = fs.readFileSync('Main.html', 'utf8');
  return [
    cut(source, 'const CA_FETCH_TIMEOUT_MS = 15000;', 'let caRefreshPromise = null;'),
    cut(source, 'function caGateError(message) {', 'async function caBootProfileStep(fresh, runId) {'),
    cut(source, 'async function caBootProfileStep(fresh, runId) {', 'async function caBoot() {')
  ].join('\n');
}

function setup(opts) {
  opts = opts || {};
  const gate = makeEl();
  if (opts.gateOpen !== false) gate.classList.add('open');
  const spinner = makeEl();
  const errEl = makeEl({ className: 'gate-error' });
  const retryBtn = makeEl({ id: 'gate-retry-btn' });
  const wrap = makeEl({ className: 'gate-btn-wrap' });
  const content = makeEl({
    querySelector(sel) {
      if (sel === '.gate-spinner' && !opts.noSpinner) return spinner;
      if (sel === '.gate-error' && opts.errorExists) return errEl;
      if (sel === '.gate-btn-wrap') return wrap;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '.gate-status' && !opts.noSpinner) return [spinner];
      return [];
    }
  });
  const created = [];
  const timers = [];
  const documentStub = {
    addEventListener() {},
    getElementById(id) {
      if (id === 'auth-overlay') return gate;
      if (id === 'auth-overlay-content') return content;
      if (id === 'gate-retry-btn') return null;
      if (id === 'gate-guest-btn') return null;
      return null;
    },
    createElement() { const el = makeEl(); created.push(el); return el; }
  };
  const reloadCalls = { n: 0 };
  const reload = () => { reloadCalls.n++; return reloadCalls.n; };
  const ctx = {
    CA_FETCH_TIMEOUT_MS: undefined, // filled by the sliced code
    document: documentStub,
    window: {
      addEventListener() {},
      setTimeout(fn, ms) {
        const entry = { fn, ms };
        timers.push(entry);
        if (opts.realTimers) { entry.id = globalThis.setTimeout(fn, ms); return entry.id; }
        return timers.length;
      },
      clearTimeout(id) { if (opts.realTimers && id) globalThis.clearTimeout(id); },
      location: { reload }
    },
    console: { warn() {}, error() {}, info() {} },
    fetch: opts.fetch,
    AbortController: opts.noAbortController ? undefined : globalThis.AbortController,
    Blob: globalThis.Blob,
    ChirootAuth: { _settled: !!opts.settled, session: opts.session || null },
    caEnterGuestMode: async (note) => { ctx.__guestNote = note; },
    caClearSession: () => { ctx.__cleared = true; },
    caGateShow: () => { ctx.__gateShown = true; },
    caGateHide: () => { ctx.__gateHidden = true; },
    caRenderTopbar: () => {},
    caRenderGreeting: () => {},
    caAccountRemember: () => {},
    caFireHook: (n) => { ctx.__hooks = (ctx.__hooks || []).concat(n); },
    caSettled: (v) => { ctx.__settled = v; },
    caOpenOnboarding: () => { ctx.__onboarding = true; },
    caEnsureFreshToken: async () => { if (opts.refreshFails) throw new Error('invalid_grant: Token use in session invalid'); return { ok: true }; },
    caFetchProfile: async () => { if (opts.bumpBeforeProfile) vm.runInContext('caBootRunId = 99;', ctx); return opts.profile || null; }
  };
  vm.createContext(ctx);
  vm.runInContext(loadCode(), ctx);
  return { ctx, gate, content, wrap, spinner, errEl, retryBtn, created, timers, reload, reloadCalls };
}
const tick = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)); };

test('caFetchWithTimeout aborts a hanging request and passes fast ones through', async () => {
  // Hanging fetch that only rejects when aborted.
  const hanging = setup({
    realTimers: true,
    fetch: (url, opts) => new Promise((resolve, reject) => {
      if (opts && opts.signal) opts.signal.addEventListener('abort', () => reject(new Error('AbortError')));
      // never resolves otherwise
    })
  });
  const p = hanging.ctx.caFetchWithTimeout('https://supabase.test/auth/v1/token', { method: 'POST' }, 30);
  await assert.rejects(p, /AbortError/);

  const fast = setup({ realTimers: true, fetch: async () => ({ ok: true }) });
  const res = await fast.ctx.caFetchWithTimeout('https://supabase.test/rest/v1/profiles', {}, 500);
  assert.equal(res.ok, true);

  // A blob body (media upload) is never given a timeout, even when one is requested.
  let sawSignal = false;
  const media = setup({
    realTimers: true,
    fetch: (url, opts) => { sawSignal = !!(opts && opts.signal); return new Promise(() => {}); }
  });
  const blob = new globalThis.Blob(['x']);
  const pending = media.ctx.caFetchWithTimeout('https://supabase.test/storage/v1/object/x', { method: 'POST', body: blob }, 20);
  await new Promise(r => setTimeout(r, 60));
  assert.equal(sawSignal, false, 'no AbortSignal for media uploads');
  assert.ok(typeof pending.then === 'function');
});

test('caFetchWithTimeout falls back to plain fetch without AbortController', async () => {
  let sawSignal = false;
  const { ctx } = setup({
    realTimers: true,
    noAbortController: true,
    fetch: (url, opts) => { sawSignal = !!(opts && opts.signal); return Promise.resolve({ ok: true }); }
  });
  await ctx.caFetchWithTimeout('https://supabase.test/rest/v1/profiles', {}, 20);
  assert.equal(sawSignal, false);
});

test('caGateStuck replaces the spinner with an error, retry (reload) and guest buttons', () => {
  const { ctx, content, wrap, created, reloadCalls } = setup({});
  ctx.caGateStuck('Terlalu lama.');
  const htmls = created.map(b => b.id);
  assert.ok(htmls.includes('gate-retry-btn'), 'retry button created');
  assert.ok(htmls.includes('gate-guest-btn'), 'guest button created');
  const retryBtn = created.find(b => b.id === 'gate-retry-btn');
  const guestBtn = created.find(b => b.id === 'gate-guest-btn');
  assert.ok(content.children.some(c => c.className === 'gate-error'), 'error message shown');
  retryBtn.onclick();
  assert.equal(reloadCalls.n, 1, 'retry reloads the page');
  guestBtn._listeners.click[0]();
  assert.match(ctx.__guestNote, /Guest/);
  assert.equal(vm.runInContext('caBootRunId', ctx), 1, 'guest fallback invalidates the running boot');
});

test('caGateStuck is a no-op once the gate resolved or no spinner is showing', () => {
  const closed = setup({ gateOpen: false });
  closed.ctx.caGateStuck('x');
  assert.equal(closed.created.length, 0);
  assert.equal(closed.content.children.length, 0);

  const noSpinner = setup({ noSpinner: true });
  noSpinner.ctx.caGateStuck('x');
  assert.equal(noSpinner.created.length, 0);
  assert.equal(noSpinner.content.children.length, 0);
});

test('watchdog only fires the fallback when the session check never settled', () => {
  const { ctx, timers, created } = setup({ settled: false });
  ctx.caStartBootWatchdog();
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 30000);
  timers[0].fn();
  assert.ok(created.length > 0, 'fallback rendered when boot never settled');

  const settled = setup({ settled: true });
  settled.ctx.caStartBootWatchdog();
  assert.equal(settled.timers.length, 1);
  settled.timers[0].fn();
  assert.equal(settled.created.length, 0, 'no fallback after boot settled');
});

test('caBootProfileStep applies a profile on the current run', async () => {
  const { ctx } = setup({ profile: { id: 'user-1', display_name: 'A' } });
  vm.runInContext('caBootRunId = 1;', ctx); // caBoot melakukan ini sebelum memanggil step
  await ctx.caBootProfileStep(false, 1);
  assert.equal(ctx.__gateHidden, true);
  assert.deepEqual(ctx.__hooks, ['onProfileReady']);
  assert.equal(ctx.__settled, true);
  assert.equal(ctx.__onboarding, undefined);
});

test('caBootProfileStep abandons a stale run after the fallback took over', async () => {
  const { ctx } = setup({ profile: { id: 'user-1', display_name: 'A' }, bumpBeforeProfile: true });
  vm.runInContext('caBootRunId = 1;', ctx);
  const step = ctx.caBootProfileStep(false, 1); // profile fetch bumps caBootRunId to 99
  await step;
  assert.equal(ctx.__gateHidden, undefined, 'gate not touched by the abandoned run');
  assert.equal(ctx.__settled, undefined);
  assert.equal(ctx.__hooks, undefined);
});

test('caBootProfileStep enters guest mode on refresh failure, but not on a stale run', async () => {
  const failing = setup({ refreshFails: true });
  vm.runInContext('caBootRunId = 1;', failing.ctx);
  await failing.ctx.caBootProfileStep(false, 1);
  assert.match(failing.ctx.__guestNote, /invalid_grant/);
  assert.equal(failing.ctx.__cleared, true);

  const stale = setup({ refreshFails: true, bumpBeforeProfile: false });
  vm.runInContext('caBootRunId = 1;', stale.ctx);
  // Bump the run id while the (failing) refresh is in flight.
  stale.ctx.caEnsureFreshToken = async () => {
    vm.runInContext('caBootRunId = 42;', stale.ctx);
    throw new Error('invalid_grant');
  };
  await stale.ctx.caBootProfileStep(false, 1);
  assert.equal(stale.ctx.__guestNote, undefined, 'no guest mode for an abandoned run');
  assert.equal(stale.ctx.__cleared, undefined, 'stored session not cleared for an abandoned run');
});
