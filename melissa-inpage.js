/* =====================================================================
 * Melissa Shop — add-on IN-PAGE untuk Main.html Chiroot AfterDark.
 *
 * Perilaku:
 *  - Karakter Mellissa MUNCUL setiap 30 menit (jadwal persisten di
 *    localStorage, tidak reset saat reload).
 *  - Klik Mellissa -> overlay toko terbuka di halaman yang sama.
 *  - Semua harga/stok/saldo/transaksi tetap server-authoritative via
 *    MelissaCore (Supabase). Tidak ada halaman terpisah.
 *
 * Add-on murni: DOM dibuat sendiri, di-scope di .melissa-root, tidak
 * mengubah elemen/state Chiroot mana pun.
 * ===================================================================== */
(function () {
  'use strict';

  var core = window.MelissaCore;
  if (!core) { console.warn('[Melissa] MelissaCore tidak ada; add-on nonaktif.'); return; }

  var VISIT_MS = Number(window.MELISSA_VISIT_MS) || 30 * 60 * 1000; // 30 menit
  var TICK_MS = 20 * 1000;
  var NEXT_KEY = 'melissa_next_visit_at';
  var ASSET = 'assets/';

  var state = {
    products: [], filtered: [], categories: [], activeCategory: 'all', search: '',
    cart: [], selected: null, qty: 1, balance: null, isAdmin: false,
    purchaseInFlight: false, idempotencyKey: null,
    shopLoaded: false, characterVisible: false
  };

  var els = {};

  // ------------------------------------------------------------- template
  function coinIcon(size) {
    return '<img src="' + ASSET + 'halloween-coin.png" alt="koin" draggable="false" width="' + (size || 18) + '" height="' + (size || 18) + '">';
  }

  function buildMarkup() {
    var root = document.createElement('div');
    root.className = 'melissa-root';
    root.innerHTML =
      /* ---------- karakter mengambang ---------- */
      '<div class="melissa-character" id="mli-character" aria-live="polite">' +
        '<button type="button" class="mc-close" id="mli-char-close" aria-label="Sembunyikan Mellissa sampai kunjungan berikutnya">✕</button>' +
        '<button type="button" class="mc-figure" id="mli-char-figure" aria-label="Buka toko Mellissa" title="Klik untuk lihat barang dagangan Mellissa">' +
          '<span class="mc-bubble" id="mli-bubble">Aku datang bawa barang dagangan! Klik aku ya~</span>' +
          '<span class="mc-ping" aria-hidden="true"></span>' +
          '<span class="mc-glow" aria-hidden="true"></span>' +
          '<span class="mc-spark s1" style="left:6%;top:16%;--dx:-14px;--dy:-16px;--d:.18s" aria-hidden="true">✦</span>' +
          '<span class="mc-spark s2" style="left:84%;top:10%;--dx:12px;--dy:-18px;--d:.34s" aria-hidden="true">✧</span>' +
          '<span class="mc-spark s3" style="left:0%;top:48%;--dx:-16px;--dy:-8px;--d:.52s" aria-hidden="true">✦</span>' +
          '<span class="mc-spark s4" style="left:90%;top:44%;--dx:14px;--dy:-10px;--d:.68s" aria-hidden="true">✧</span>' +
          '<span class="mc-spark s5 ambient" style="left:70%;top:74%;--dx:8px;--dy:-14px;--d:.85s" aria-hidden="true">✦</span>' +
          '<img class="mc-img" src="' + ASSET + 'mellissa.png" alt="Mellissa, penyihir shopkeeper" draggable="false">' +
          '<span class="mc-shadow" aria-hidden="true"></span>' +
        '</button>' +
      '</div>' +

      /* ---------- overlay toko ---------- */
      '<div class="ms-overlay" id="mli-overlay" role="dialog" aria-modal="true" aria-labelledby="mli-title">' +
        '<div class="ms-panel">' +
          '<button type="button" class="ms-close-x" id="mli-overlay-close" aria-label="Tutup toko">✕</button>' +
          '<div class="ms-panel-head">' +
            '<div class="ms-house-frame">' +
              '<img src="' + ASSET + 'shopfront-pixel.png" alt="Rumah toko Halloween Mellissa" draggable="false">' +
            '</div>' +
            '<div class="ms-head-copy">' +
              '<h2 id="mli-title">Melissa Shop</h2>' +
              '<p>Mellissa hanya mampir sesekali. Tukar Halloween Coins yang kamu kumpulkan dari menyelesaikan lagu di Chiroot dengan harta karun musiman.</p>' +
              '<div class="ms-head-actions">' +
                '<span class="ms-coin-chip" id="mli-coin-chip" title="Saldo Halloween Coin kamu">' +
                  '<img src="' + ASSET + 'halloween-coin.png" alt="" draggable="false">' +
                  '<span id="mli-balance">–</span>&nbsp;Coins' +
                '</span>' +
                '<button type="button" class="ms-login-btn" id="mli-login"><span>Login with Google</span></button>' +
                '<button type="button" class="ms-avatar-btn ms-hidden" id="mli-avatar"><span class="dot"></span><span id="mli-avatar-name">Akun</span></button>' +
                '<button type="button" class="ms-admin-btn ms-hidden" id="mli-admin-open">★ Admin</button>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div class="ms-dialogue" id="mli-dialogue">Welcome, traveler! Ready to explore my little Halloween shop?</div>' +

          '<div class="ms-toolbar">' +
            '<div class="ms-search"><span aria-hidden="true" style="color:var(--gold)">🔍</span>' +
              '<input type="search" id="mli-search" placeholder="Cari harta karun…" aria-label="Cari produk"></div>' +
            '<div class="ms-cats" id="mli-cats"></div>' +
            '<button type="button" class="ms-cart-btn" id="mli-cart-open">🛒 Keranjang<span class="count ms-hidden" id="mli-cart-count">0</span></button>' +
          '</div>' +

          '<div class="ms-grid" id="mli-grid"><div class="ms-skeleton"></div></div>' +

          '<div class="ms-section-head"><h3>Riwayat Kamu</h3><div class="rule"></div></div>' +
          '<div class="ms-tabs">' +
            '<button type="button" class="ms-tab active" id="mli-tab-txn">Transaksi Koin</button>' +
            '<button type="button" class="ms-tab" id="mli-tab-purchase">Riwayat Pembelian</button>' +
          '</div>' +
          '<div class="ms-panel-box" id="mli-panel-txn"><div class="ms-table-wrap"><table class="ms-table">' +
            '<thead><tr><th>Waktu</th><th>Tipe</th><th>Keterangan</th><th style="text-align:right">Jumlah</th><th style="text-align:right">Saldo</th></tr></thead>' +
            '<tbody id="mli-txn-body"></tbody></table></div>' +
            '<div class="ms-history-empty ms-hidden" id="mli-txn-empty">Belum ada transaksi koin. Selesaikan lagu pertamamu di Chiroot!</div></div>' +
          '<div class="ms-panel-box ms-hidden" id="mli-panel-purchase"><div class="ms-table-wrap"><table class="ms-table">' +
            '<thead><tr><th>Waktu</th><th>Item</th><th style="text-align:right">Total</th><th>Status</th></tr></thead>' +
            '<tbody id="mli-purchase-body"></tbody></table></div>' +
            '<div class="ms-history-empty ms-hidden" id="mli-purchase-empty">Belum ada pembelian.</div></div>' +
        '</div>' +
      '</div>' +

      /* ---------- detail produk ---------- */
      '<div class="ms-overlay" id="mli-detail-overlay" role="dialog" aria-modal="true" aria-label="Detail produk">' +
        '<div class="ms-modal">' +
          '<button type="button" class="ms-close-x" id="mli-detail-close">✕</button>' +
          '<h3 id="mli-detail-title">Produk</h3>' +
          '<div class="ms-detail-grid">' +
            '<div class="ms-detail-img" id="mli-detail-img"></div>' +
            '<div class="ms-detail-info">' +
              '<p id="mli-detail-desc"></p>' +
              '<div class="ms-stock" id="mli-detail-stock"></div>' +
              '<div class="ms-price" id="mli-detail-price" style="margin:8px 0 4px;font-size:16px"></div>' +
              '<div class="ms-qty">' +
                '<button type="button" id="mli-qty-minus" aria-label="Kurangi">−</button>' +
                '<span id="mli-qty-value">1</span>' +
                '<button type="button" id="mli-qty-plus" aria-label="Tambah">+</button>' +
              '</div>' +
              '<div class="ms-actions" style="justify-content:flex-start;margin:0">' +
                '<button type="button" class="ms-btn ms-btn-primary" id="mli-add-cart">+ Masukkan keranjang</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      /* ---------- drawer keranjang ---------- */
      '<div class="ms-drawer-scrim" id="mli-scrim"></div>' +
      '<aside class="ms-drawer" id="mli-drawer" aria-label="Keranjang belanja">' +
        '<div class="ms-drawer-head"><h3>Keranjang Treasure</h3>' +
          '<button type="button" class="ms-modal-close" id="mli-cart-close" aria-label="Tutup keranjang">✕</button></div>' +
        '<div class="ms-drawer-body" id="mli-cart-body"></div>' +
        '<div class="ms-drawer-foot">' +
          '<div class="ms-total-row"><span>Total</span><span class="ms-price">' + coinIcon() + '<span id="mli-cart-total">0</span></span></div>' +
          '<button type="button" class="ms-btn ms-btn-primary" id="mli-checkout" style="width:100%">Checkout dengan Halloween Coins</button>' +
        '</div>' +
      '</aside>' +

      /* ---------- konfirmasi ---------- */
      '<div class="ms-overlay" id="mli-confirm-overlay" role="dialog" aria-modal="true" aria-label="Konfirmasi pembelian">' +
        '<div class="ms-modal" style="width:min(440px,94%)">' +
          '<div class="ms-confirm-icon">🎃</div>' +
          '<h3 style="margin:0 0 4px">Konfirmasi pembelian</h3>' +
          '<p class="ms-muted" style="margin:0">Server akan memvalidasi saldo &amp; stok.</p>' +
          '<div class="ms-confirm-summary" id="mli-confirm-summary"></div>' +
          '<div class="ms-actions">' +
            '<button type="button" class="ms-btn ms-btn-ghost" id="mli-confirm-cancel">Batal</button>' +
            '<button type="button" class="ms-btn ms-btn-primary" id="mli-confirm-ok">Ya, beli sekarang</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      /* ---------- admin ---------- */
      '<div class="ms-overlay" id="mli-admin-overlay" role="dialog" aria-modal="true" aria-label="Panel admin produk">' +
        '<div class="ms-modal wide">' +
          '<button type="button" class="ms-close-x" id="mli-admin-close">✕</button>' +
          '<h3>Admin — Tambah / Edit Produk</h3>' +
          '<p class="ms-muted" style="margin:0 0 14px">Harga &amp; stok hanya bisa diubah lewat panel ini; database berwenang penuh.</p>' +
          '<form class="ms-admin-form" id="mli-admin-form">' +
            '<input type="hidden" id="mli-ap-id">' +
            '<label>Nama produk<input type="text" id="mli-ap-name" maxlength="120" required placeholder="Pumpkin Lantern"></label>' +
            '<label>Kategori<input type="text" id="mli-ap-category" maxlength="40" placeholder="dekorasi" list="mli-category-list"><datalist id="mli-category-list"></datalist></label>' +
            '<label>Harga (Coins)<input type="number" id="mli-ap-price" min="1" step="1" required placeholder="10"></label>' +
            '<label>Stok<input type="number" id="mli-ap-stock" min="0" step="1" required placeholder="25"></label>' +
            '<label class="full">URL gambar (https / Supabase Storage)<input type="url" id="mli-ap-image" maxlength="1024" placeholder="https://astuagdezahmuuwjoghf.supabase.co/storage/v1/object/public/…"></label>' +
            '<label class="full">Deskripsi<textarea id="mli-ap-desc" rows="3" maxlength="600" placeholder="Cerita singkat harta karun ini…"></textarea></label>' +
            '<label class="full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="mli-ap-active" checked> Produk aktif (tampil di katalog)</label>' +
            '<div class="full ms-actions" style="margin:4px 0 0"><button type="submit" class="ms-btn ms-btn-primary">Simpan produk</button></div>' +
          '</form>' +
        '</div>' +
      '</div>' +

      '<div class="ms-toast" id="mli-toast" role="status" aria-live="polite"></div>';

    document.body.appendChild(root);

    // cegah drag semua gambar add-on (jaga-jaga selain atribut draggable=false)
    root.addEventListener('dragstart', function (e) { e.preventDefault(); });

    [
      'character', 'char-close', 'char-figure', 'bubble',
      'overlay', 'overlay-close', 'coin-chip', 'balance', 'login', 'avatar', 'avatar-name', 'admin-open',
      'dialogue', 'search', 'cats', 'cart-open', 'cart-count', 'grid',
      'tab-txn', 'tab-purchase', 'panel-txn', 'panel-purchase', 'txn-body', 'txn-empty', 'purchase-body', 'purchase-empty',
      'detail-overlay', 'detail-close', 'detail-title', 'detail-img', 'detail-desc', 'detail-stock', 'detail-price',
      'qty-minus', 'qty-value', 'qty-plus', 'add-cart',
      'scrim', 'drawer', 'cart-close', 'cart-body', 'cart-total', 'checkout',
      'confirm-overlay', 'confirm-summary', 'confirm-cancel', 'confirm-ok',
      'admin-overlay', 'admin-close', 'admin-form', 'ap-id', 'ap-name', 'ap-category', 'ap-price', 'ap-stock',
      'ap-image', 'ap-desc', 'ap-active', 'category-list', 'toast'
    ].forEach(function (id) {
      els[id] = document.getElementById('mli-' + id);
    });
  }

  // ------------------------------------------------------------- util
  function $(id) { return els[id]; }
  function esc(v) { return core.esc(v); }
  function say(line) { $('dialogue').textContent = line; }
  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return iso || '—'; }
  }
  function productImage(p) {
    return (p && p.image_url && /^https:\/\/[^"'\s<>]+$/.test(p.image_url)) ? p.image_url : '';
  }
  function openLayer(id) { $(id).classList.add('open'); }
  function closeLayer(id) { $(id).classList.remove('open'); }

  function toast(msg, isError) {
    var el = $('toast');
    el.className = 'ms-toast' + (isError ? ' error' : '');
    el.innerHTML = '';
    if (!isError) {
      var ic = document.createElement('img');
      ic.src = ASSET + 'halloween-coin.png';
      ic.alt = '';
      ic.draggable = false;
      el.appendChild(ic);
    }
    var txt = document.createElement('span');
    txt.textContent = msg;
    el.appendChild(txt);
    requestAnimationFrame(function () { el.classList.add('show'); });
    clearTimeout(el._timer);
    el._timer = setTimeout(function () { el.classList.remove('show'); }, 3200);
  }

  // ------------------------------------------------------------- karakter & jadwal
  function readNextAt() {
    var v = Number(localStorage.getItem(NEXT_KEY));
    if (!isFinite(v) || v <= 0) {
      v = Date.now() + VISIT_MS;
      localStorage.setItem(NEXT_KEY, String(v));
    }
    return v;
  }

  function showCharacter() {
    state.characterVisible = true;
    $('character').classList.add('visible');
    var lines = [
      'Aku datang bawa barang dagangan! Klik aku ya~',
      'Toko keliling Mellissa sudah buka! Cek yuk~',
      'Ada treasure baru hari ini! Klik aku~',
      'Hai traveler! Mau lihat koleksi Halloween-ku?'
    ];
    $('bubble').textContent = lines[Math.floor(Math.random() * lines.length)];
    toast('Mellissa muncul! Klik dia untuk lihat barang dagangan.');
  }

  function hideCharacter() {
    state.characterVisible = false;
    $('character').classList.remove('visible');
  }

  function scheduleNext() {
    localStorage.setItem(NEXT_KEY, String(Date.now() + VISIT_MS));
  }

  function tick() {
    if (Date.now() >= readNextAt()) {
      if (!state.characterVisible) showCharacter();
      scheduleNext();
    }
  }

  // ------------------------------------------------------------- auth
  function renderAuth() {
    var authed = core.isAuthed();
    $('login').classList.toggle('ms-hidden', authed);
    $('avatar').classList.toggle('ms-hidden', !authed);
    if (!authed) {
      state.balance = null;
      $('balance').textContent = '0';
      return;
    }
    if (authed) {
      var s = core.getSession();
      var name = s.user.email ? s.user.email.split('@')[0] : 'Traveler';
      $('avatar-name').textContent = name.replace(/[._-]+/g, ' ');
    }
  }

  function logout() {
    var s = core.getSession();
    var done = function () { core.clearSession(); window.location.reload(); };
    if (s) {
      fetch(core.config.url + '/auth/v1/logout', {
        method: 'POST',
        headers: { apikey: core.config.key, Authorization: 'Bearer ' + s.access_token }
      }).then(done, done);
    } else done();
  }

  // ------------------------------------------------------------- wallet
  function loadBalance(bump) {
    if (!core.isAuthed()) { $('balance').textContent = '0'; return Promise.resolve(); }
    return core.apiCall('/rest/v1/wallets?select=balance&limit=1', 'GET')
      .then(function (rows) {
        var next = (rows && rows.length) ? Number(rows[0].balance) : 0;
        var prev = state.balance;
        state.balance = next;
        $('balance').textContent = String(next);
        if (bump && prev !== null && next !== prev) {
          var chip = $('coin-chip');
          chip.classList.remove('bump');
          void chip.offsetWidth;
          chip.classList.add('bump');
        }
      })
      .catch(function (err) {
        if (err && err.status === 401) return;
        $('balance').textContent = '0';
      });
  }

  // ------------------------------------------------------------- katalog
  function loadProducts() {
    return core.apiCall('/rest/v1/products?select=*&order=created_at.desc', 'GET')
      .then(function (rows) {
        state.products = Array.isArray(rows) ? rows : [];
        if (!state.isAdmin) state.products = state.products.filter(function (p) { return p.is_active; });
        var cats = {};
        state.products.forEach(function (p) { if (p.category) cats[p.category] = true; });
        state.categories = Object.keys(cats).sort();
        renderCats();
        applyFilters();
        if (!state.products.length && core.isAuthed()) say('My shelves are waiting for new treasures!');
      })
      .catch(function (err) {
        state.products = []; state.categories = [];
        renderCats(); applyFilters();
        if (err && err.status !== 404) console.warn('[Melissa] loadProducts', err.message);
      });
  }

  function renderCats() {
    var wrap = $('cats');
    wrap.innerHTML = '';
    function chip(label, val) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ms-cat' + (state.activeCategory === val ? ' active' : '');
      b.textContent = label;
      b.addEventListener('click', function () { state.activeCategory = val; renderCats(); applyFilters(); });
      wrap.appendChild(b);
    }
    chip('Semua', 'all');
    state.categories.forEach(function (c) { chip(c, c); });
    $('category-list').innerHTML = state.categories.map(function (c) { return '<option value="' + esc(c) + '">'; }).join('');
  }

  function applyFilters() {
    var q = state.search.trim().toLowerCase();
    state.filtered = state.products.filter(function (p) {
      var catOk = state.activeCategory === 'all' || p.category === state.activeCategory;
      var qOk = !q || String(p.name || '').toLowerCase().indexOf(q) !== -1 ||
        String(p.description || '').toLowerCase().indexOf(q) !== -1;
      return catOk && qOk;
    });
    renderGrid();
  }

  function renderGrid() {
    var grid = $('grid');
    grid.innerHTML = '';
    if (!state.filtered.length) {
      var empty = document.createElement('div');
      empty.className = 'ms-empty';
      if (state.products.length) {
        empty.innerHTML = '<h3>Tidak ada yang cocok</h3><p>Coba kata kunci atau kategori lain, traveler.</p>';
      } else {
        empty.innerHTML =
          '<img class="shop-logo" src="' + ASSET + 'melissa-shop-logo.png" alt="Logo Melissa Shop" draggable="false" style="width:118px;margin:0 auto 12px">' +
          '<h3>My shelves are waiting for new treasures!</h3>' +
          '<p>Belum ada produk aktif. Saat admin menambahkan treasure, rak ini terisi otomatis.</p>';
      }
      grid.appendChild(empty);
      return;
    }
    state.filtered.forEach(function (p) {
      var card = document.createElement('article');
      card.className = 'ms-card';
      var img = productImage(p);
      card.innerHTML =
        '<div class="ms-card-img">' +
          (img ? '<img src="' + esc(img) + '" alt="' + esc(p.name) + '" draggable="false">' : '<span class="ph">🎃</span>') +
        '</div>' +
        '<div class="ms-card-body">' +
          '<h3 class="ms-card-name">' + esc(p.name) + '</h3>' +
          '<p class="ms-card-desc">' + esc(p.description || '') + '</p>' +
          '<div class="ms-card-foot">' +
            '<span class="ms-price">' + coinIcon() + esc(String(p.price)) + '</span>' +
            '<span class="ms-stock' + (p.stock <= 5 ? ' low' : '') + '">Stok ' + esc(String(p.stock)) + '</span>' +
          '</div>' +
        '</div>';
      card.addEventListener('click', function () { openDetail(p); });
      grid.appendChild(card);
    });
  }

  // ------------------------------------------------------------- detail
  function openDetail(p) {
    state.selected = p;
    state.qty = 1;
    $('detail-title').textContent = p.name;
    $('detail-desc').textContent = p.description || 'Belum ada deskripsi untuk treasure ini.';
    $('detail-stock').textContent = 'Stok tersedia: ' + p.stock + (p.stock <= 5 ? ' · hampir habis!' : '');
    $('detail-price').innerHTML = coinIcon(20) + ' ' + esc(String(p.price)) + ' Halloween Coins';
    var img = productImage(p);
    $('detail-img').innerHTML = img ? '<img src="' + esc(img) + '" alt="' + esc(p.name) + '" draggable="false">' : '<span class="ph" style="font-size:50px">🎃</span>';
    $('qty-value').textContent = '1';
    $('add-cart').disabled = p.stock < 1;
    openLayer('detail-overlay');
  }

  // ------------------------------------------------------------- keranjang
  function cartCount() { return state.cart.reduce(function (n, l) { return n + l.quantity; }, 0); }
  function cartTotal() { return state.cart.reduce(function (n, l) { return n + l.unit_price * l.quantity; }, 0); }

  function renderCart() {
    var body = $('cart-body');
    body.innerHTML = '';
    $('cart-count').textContent = String(cartCount());
    $('cart-count').classList.toggle('ms-hidden', cartCount() === 0);
    $('cart-total').textContent = String(cartTotal());
    $('checkout').disabled = state.cart.length === 0 || state.purchaseInFlight;
    if (!state.cart.length) {
      body.innerHTML = '<div class="ms-history-empty">Keranjang masih kosong. Pilih treasure dari rak dulu yuk!</div>';
      return;
    }
    state.cart.forEach(function (line) {
      var div = document.createElement('div');
      div.className = 'ms-cart-line';
      div.innerHTML =
        (line.image
          ? '<img src="' + esc(line.image) + '" alt="" draggable="false">'
          : '<div style="width:54px;height:54px;border-radius:9px;background:#120616;display:flex;align-items:center;justify-content:center;font-size:22px">🎃</div>') +
        '<div><p class="name">' + esc(line.name) + '</p>' +
        '<div class="meta">' + line.quantity + ' × ' + line.unit_price + ' = ' + (line.unit_price * line.quantity) + ' koin</div></div>' +
        '<button type="button" class="rm" aria-label="Hapus ' + esc(line.name) + '" title="Hapus">✕</button>';
      div.querySelector('.rm').addEventListener('click', function () {
        state.cart = state.cart.filter(function (l) { return l.product_id !== line.product_id; });
        renderCart();
      });
      body.appendChild(div);
    });
  }

  function addSelectedToCart() {
    var p = state.selected;
    if (!p || p.stock < 1) return;
    var existing = state.cart.find(function (l) { return l.product_id === p.id; });
    var currentQty = existing ? existing.quantity : 0;
    if (currentQty + state.qty > p.stock) { toast('Stok ' + p.name + ' hanya ' + p.stock + '.', true); return; }
    if (existing) existing.quantity += state.qty;
    else state.cart.push({ product_id: p.id, name: p.name, image: productImage(p), unit_price: Number(p.price), quantity: state.qty, stock: p.stock });
    closeLayer('detail-overlay');
    renderCart();
    toast('"' + p.name + '" masuk keranjang!');
  }

  // ------------------------------------------------------------- checkout
  function openConfirm() {
    if (!core.isAuthed()) { toast('Login dulu untuk menukar Halloween Coins.', true); return; }
    if (!state.cart.length) return;
    $('confirm-summary').innerHTML =
      state.cart.map(function (l) {
        return '<div class="row"><span>' + esc(l.name) + ' × ' + l.quantity + '</span><span>' + (l.unit_price * l.quantity) + '</span></div>';
      }).join('') +
      '<div class="row total"><span>Total</span><span>' + cartTotal() + ' koin</span></div>' +
      '<div class="row"><span>Saldo kamu</span><span>' + (state.balance == null ? '–' : state.balance) + ' koin</span></div>';
    openLayer('confirm-overlay');
  }

  function doCheckout() {
    if (state.purchaseInFlight) return;
    state.purchaseInFlight = true;
    $('confirm-ok').disabled = true;
    if (!state.idempotencyKey) {
      state.idempotencyKey = (crypto.randomUUID ? crypto.randomUUID() : 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2));
    }
    var payload = state.cart.map(function (l) { return { product_id: l.product_id, quantity: l.quantity }; });
    core.rpc('purchase_products', { p_items: payload, p_idempotency_key: state.idempotencyKey })
      .then(function (res) {
        if (!res || res.ok !== true) throw new Error('Pembelian gagal diproses server.');
        var spent = Number(res.total_spent || cartTotal());
        state.cart = [];
        state.idempotencyKey = null;
        closeLayer('confirm-overlay');
        renderCart();
        say('Excellent choice! Enjoy your new treasure.');
        toast('Pembelian sukses! −' + spent + ' Halloween Coins');
        return Promise.all([loadBalance(true), loadProducts(), loadTransactions(), loadPurchases()]);
      })
      .catch(function (err) {
        var msg = err && err.message ? err.message : 'Pembelian gagal.';
        var friendly = {
          INSUFFICIENT_FUNDS: 'Saldo Halloween Coins kamu tidak cukup.',
          INSUFFICIENT_STOCK: 'Stok produk tidak mencukupi.',
          PRODUCT_UNAVAILABLE: 'Salah satu produk sudah tidak aktif.',
          UNKNOWN_PRODUCT: 'Produk tidak ditemukan di server.',
          EMPTY_CART: 'Keranjang kosong.',
          AUTH_REQUIRED: 'Sesi login habis. Silakan login ulang.'
        };
        Object.keys(friendly).some(function (k) {
          if (msg.indexOf(k) !== -1) { msg = friendly[k]; return true; }
          return false;
        });
        toast(msg, true);
      })
      .then(function () {
        state.purchaseInFlight = false;
        $('confirm-ok').disabled = false;
      });
  }

  // ------------------------------------------------------------- riwayat
  function loadTransactions() {
    if (!core.isAuthed()) { $('txn-body').innerHTML = ''; $('txn-empty').classList.remove('ms-hidden'); return Promise.resolve(); }
    return core.apiCall('/rest/v1/coin_transactions?select=*&order=created_at.desc&limit=50', 'GET')
      .then(function (rows) {
        rows = Array.isArray(rows) ? rows : [];
        $('txn-empty').classList.toggle('ms-hidden', rows.length > 0);
        $('txn-body').innerHTML = rows.map(function (t) {
          var pos = Number(t.amount) > 0;
          return '<tr><td class="ms-muted">' + fmtDate(t.created_at) + '</td><td>' + esc(t.txn_type) + '</td>' +
            '<td class="ms-muted">' + esc(t.reason || '—') + '</td>' +
            '<td style="text-align:right" class="' + (pos ? 'ms-amount-pos' : 'ms-amount-neg') + '">' + (pos ? '+' : '') + esc(String(t.amount)) + '</td>' +
            '<td style="text-align:right">' + esc(String(t.balance_after)) + '</td></tr>';
        }).join('');
      })
      .catch(function () { $('txn-body').innerHTML = ''; $('txn-empty').classList.remove('ms-hidden'); });
  }

  function loadPurchases() {
    if (!core.isAuthed()) { $('purchase-body').innerHTML = ''; $('purchase-empty').classList.remove('ms-hidden'); return Promise.resolve(); }
    return core.apiCall('/rest/v1/purchases?select=*&order=created_at.desc&limit=50', 'GET')
      .then(function (purchases) {
        purchases = Array.isArray(purchases) ? purchases : [];
        if (!purchases.length) { $('purchase-body').innerHTML = ''; $('purchase-empty').classList.remove('ms-hidden'); return; }
        $('purchase-empty').classList.add('ms-hidden');
        return core.apiCall('/rest/v1/purchase_items?select=*', 'GET').then(function (items) {
          items = Array.isArray(items) ? items : [];
          var nameById = {};
          state.products.forEach(function (p) { nameById[p.id] = p.name; });
          $('purchase-body').innerHTML = purchases.map(function (pu) {
            var summary = items.filter(function (i) { return i.purchase_id === pu.id; })
              .map(function (i) { return (nameById[i.product_id] || 'Produk ' + String(i.product_id).slice(0, 8)) + ' ×' + i.quantity; }).join(', ');
            return '<tr><td class="ms-muted">' + fmtDate(pu.created_at) + '</td><td>' + esc(summary || '—') + '</td>' +
              '<td style="text-align:right" class="ms-amount-neg">−' + esc(String(pu.total_amount)) + '</td>' +
              '<td><span class="ms-cat" style="cursor:default">' + esc(pu.status) + '</span></td></tr>';
          }).join('');
        });
      })
      .catch(function () { $('purchase-body').innerHTML = ''; $('purchase-empty').classList.remove('ms-hidden'); });
  }

  // ------------------------------------------------------------- admin
  function checkAdmin() {
    if (!core.isAuthed()) { state.isAdmin = false; $('admin-open').classList.add('ms-hidden'); return Promise.resolve(); }
    return core.rpc('is_melissa_admin', {})
      .then(function (v) {
        state.isAdmin = v === true;
        $('admin-open').classList.toggle('ms-hidden', !state.isAdmin);
        if (state.isAdmin) return loadProducts();
        return null;
      })
      .catch(function () { state.isAdmin = false; $('admin-open').classList.add('ms-hidden'); });
  }

  function submitAdmin(e) {
    e.preventDefault();
    var args = {
      p_id: $('ap-id').value || null,
      p_name: $('ap-name').value.trim(),
      p_description: $('ap-desc').value.trim(),
      p_image_url: $('ap-image').value.trim() || null,
      p_category: $('ap-category').value.trim() || 'general',
      p_price: Number($('ap-price').value),
      p_stock: Number($('ap-stock').value),
      p_is_active: $('ap-active').checked
    };
    core.rpc('admin_upsert_product', args)
      .then(function (res) {
        if (!res || res.ok !== true) throw new Error('Gagal menyimpan produk.');
        closeLayer('admin-overlay');
        toast('Produk tersimpan ke katalog.');
        return loadProducts();
      })
      .catch(function (err) { toast((err && err.message) || 'Gagal menyimpan produk.', true); });
  }

  // ------------------------------------------------------------- buka/tutup toko
  function openShop() {
    openLayer('overlay');
    renderAuth();
    if (!state.shopLoaded) {
      state.shopLoaded = true;
      loadProducts();
      if (core.isAuthed()) bootAuthedData();
      else say('Welcome, traveler! Login dulu untuk mengumpulkan Halloween Coins.');
    } else {
      renderAuth();
      loadProducts();
      if (core.isAuthed()) loadBalance(false);
    }
  }

  function closeShop() { closeLayer('overlay'); }

  function bootAuthedData() {
    say('Welcome, traveler! Ready to explore my little Halloween shop?');
    return Promise.all([loadBalance(false), loadTransactions(), loadPurchases(), checkAdmin()]);
  }

  // ------------------------------------------------------------- events
  function bindEvents() {
    $('char-figure').addEventListener('click', openShop);
    $('char-close').addEventListener('click', function (e) { e.stopPropagation(); hideCharacter(); });

    $('overlay-close').addEventListener('click', closeShop);
    $('overlay').addEventListener('click', function (e) { if (e.target === $('overlay')) closeShop(); });

    $('login').addEventListener('click', function () {
      core.loginWithGoogle('Main.html').catch(function () { toast('Gagal membuka login Google.', true); });
    });
    $('avatar').addEventListener('click', function () {
      if (window.confirm('Keluar dari akun Chiroot di perangkat ini?')) logout();
    });

    $('search').addEventListener('input', function (e) { state.search = e.target.value; applyFilters(); });

    $('cart-open').addEventListener('click', function () {
      renderCart();
      $('drawer').classList.add('open');
      $('scrim').classList.add('open');
    });
    function closeDrawer() { $('drawer').classList.remove('open'); $('scrim').classList.remove('open'); }
    $('cart-close').addEventListener('click', closeDrawer);
    $('scrim').addEventListener('click', closeDrawer);

    $('detail-close').addEventListener('click', function () { closeLayer('detail-overlay'); });
    $('detail-overlay').addEventListener('click', function (e) { if (e.target === $('detail-overlay')) closeLayer('detail-overlay'); });
    $('qty-minus').addEventListener('click', function () { state.qty = Math.max(1, state.qty - 1); $('qty-value').textContent = String(state.qty); });
    $('qty-plus').addEventListener('click', function () {
      var max = state.selected ? state.selected.stock : 1;
      state.qty = Math.min(max, state.qty + 1);
      $('qty-value').textContent = String(state.qty);
    });
    $('add-cart').addEventListener('click', addSelectedToCart);

    $('checkout').addEventListener('click', openConfirm);
    $('confirm-cancel').addEventListener('click', function () { closeLayer('confirm-overlay'); });
    $('confirm-ok').addEventListener('click', doCheckout);

    $('tab-txn').addEventListener('click', function () { switchTab('txn'); });
    $('tab-purchase').addEventListener('click', function () { switchTab('purchase'); });
    function switchTab(name) {
      var isTxn = name === 'txn';
      $('tab-txn').classList.toggle('active', isTxn);
      $('tab-purchase').classList.toggle('active', !isTxn);
      $('panel-txn').classList.toggle('ms-hidden', !isTxn);
      $('panel-purchase').classList.toggle('ms-hidden', isTxn);
    }

    $('admin-open').addEventListener('click', function () {
      $('admin-form').reset();
      $('ap-id').value = '';
      $('ap-active').checked = true;
      openLayer('admin-overlay');
    });
    $('admin-close').addEventListener('click', function () { closeLayer('admin-overlay'); });
    $('admin-overlay').addEventListener('click', function (e) { if (e.target === $('admin-overlay')) closeLayer('admin-overlay'); });
    $('admin-form').addEventListener('submit', submitAdmin);

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      ['admin-overlay', 'confirm-overlay', 'detail-overlay'].forEach(closeLayer);
      closeDrawer();
      closeShop();
    });

    // reward dari mesin playback -> segarkan saldo + dialog Mellissa
    document.addEventListener('melissa:reward', function () {
      say('Wonderful! You\'ve earned 2 Halloween Coins.');
      if (state.shopLoaded && core.isAuthed()) loadBalance(true);
    });

    document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
  }

  // ------------------------------------------------------------- boot
  function boot() {
    buildMarkup();
    bindEvents();
    renderAuth();
    loadProducts(); // katalog publik boleh dibaca tamu
    readNextAt();
    setInterval(tick, TICK_MS);
    tick();
    // Chiroot memulihkan sesi sekitar load; cek ulang beberapa saat.
    setTimeout(renderAuth, 1200);
    setTimeout(renderAuth, 3000);
  }

  window.MelissaInpage = {
    showCharacter: showCharacter,
    hideCharacter: hideCharacter,
    openShop: openShop,
    closeShop: closeShop,
    visitNow: function () { showCharacter(); scheduleNext(); },
    state: state
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
