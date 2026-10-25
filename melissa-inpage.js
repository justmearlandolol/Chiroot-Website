(function() {
    "use strict";
    var core = window.MelissaCore;
    if (!core) {
        console.warn("[Melissa] MelissaCore tidak ada; add-on nonaktif.");
        return;
    }
    var bordersApi = window.ChirootBorders;
    var VISIT_MS = Number(window.MELISSA_VISIT_MS) || 30 * 60 * 1e3;
    var DESPAWN_MS = Number(window.MELISSA_DESPAWN_MS) || 10 * 60 * 1e3;
    var TICK_MS = 1e4;
    var NEXT_KEY = "melissa_next_visit_at";
    var ACTIVE_UNTIL_KEY = "melissa_active_until";
    var REOPEN_SHOP_KEY = "melissa_reopen_shop";
    var state = {
        products: [],
        filtered: [],
        categories: [],
        activeCategory: "all",
        search: "",
        cart: [],
        selected: null,
        qty: 1,
        balance: null,
        isAdmin: false,
        syncingBorders: false,
        purchaseInFlight: false,
        idempotencyKey: null,
        shopLoaded: false,
        characterVisible: false,
        despawning: false,
        despawnAt: 0,
        loginBusy: false
    };
    var els = {};
    var bubbleTimer = null;
    var despawnTimer = null;
    function coinSvg(size) {
        var sz = size || 18;
        return '<svg class="ms-coin-svg" width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24" aria-hidden="true" style="flex-shrink:0;display:inline-block;vertical-align:middle"><circle cx="12" cy="12" r="10.5" fill="#f3a620" stroke="#7d4300" stroke-width="1.6"/><circle cx="12" cy="12" r="7.8" fill="#ffd466" stroke="#b96c06" stroke-width="1"/><path d="M12 6.8l1.55 3.35 3.65.45-2.7 2.5.72 3.6L12 14.9l-3.22 1.8.72-3.6-2.7-2.5 3.65-.45z" fill="#9a4e00"/></svg>';
    }
    function coinIcon(size) {
        return coinSvg(size);
    }
    function userAvatarData() {
        var pfp = "";
        var label = "✦";
        if (window.ChirootAuth && window.ChirootAuth.profile) {
            pfp = window.ChirootAuth.profile.pfp || "";
            var dn = String(window.ChirootAuth.profile.display_name || "").trim();
            if (dn) label = dn.charAt(0).toUpperCase();
        } else if (core.isAuthed()) {
            var sess = core.getSession();
            if (sess && sess.user && sess.user.email) label = sess.user.email.charAt(0).toUpperCase();
        }
        return { pfp: pfp, label: label };
    }
    function borderPreviewHtml(borderSrc, borderName, large) {
        var av = userAvatarData();
        var cls = "ms-border-stage" + (large ? " lg" : "");
        var inner = av.pfp ? '<img class="ms-bp-pfp" src="' + esc(av.pfp) + '" alt="" draggable="false">' : '<span class="ms-bp-init">' + esc(av.label) + "</span>";
        return '<div class="' + cls + '"><div class="ms-bp-circle">' + inner + '</div><img class="ms-bp-frame" src="' + esc(borderSrc) + '" alt="' + esc(borderName) + '" draggable="false"></div>';
    }
    function buildMarkup() {
        var root = document.createElement("div");
        root.className = "melissa-root";
        root.innerHTML = '<div class="melissa-character" id="mli-character" aria-live="polite">' + '<button type="button" class="mc-figure" id="mli-char-figure" aria-label="Buka toko Mellissa" title="Klik untuk lihat barang dagangan Mellissa">' + '<span class="mc-bubble" id="mli-bubble">Aku datang bawa barang dagangan! Klik aku ya~</span>' + '<span class="mc-ping" aria-hidden="true"></span>' + '<span class="mc-glow" aria-hidden="true"></span>' + '<span class="mc-star-burst" id="mli-star-burst" aria-hidden="true"></span>' + '<span class="mc-spark s1" style="left:6%;top:16%;--dx:-14px;--dy:-16px;--d:.18s" aria-hidden="true">✦</span>' + '<span class="mc-spark s2" style="left:84%;top:10%;--dx:12px;--dy:-18px;--d:.34s" aria-hidden="true">✧</span>' + '<span class="mc-spark s3" style="left:0%;top:48%;--dx:-16px;--dy:-8px;--d:.52s" aria-hidden="true">✦</span>' + '<span class="mc-spark s4" style="left:90%;top:44%;--dx:14px;--dy:-10px;--d:.68s" aria-hidden="true">✧</span>' + '<span class="mc-spark s5 ambient" style="left:70%;top:74%;--dx:8px;--dy:-14px;--d:.85s" aria-hidden="true">✦</span>' + '<img class="mc-img" src="mellissa.png" alt="Mellissa, penyihir shopkeeper" draggable="false">' + '<span class="mc-shadow" aria-hidden="true"></span>' + "</button>" + '<span class="mc-timer-pill ms-hidden" id="mli-char-timer" aria-hidden="true">⏳ <span id="mli-char-timer-val">10:00</span></span>' + "</div>" + '<div class="ms-overlay" id="mli-overlay" role="dialog" aria-modal="true" aria-labelledby="mli-title">' + '<div class="ms-panel">' + '<button type="button" class="ms-close-x" id="mli-overlay-close" aria-label="Tutup toko">✕</button>' + '<div class="ms-panel-head">' + '<div class="ms-house-frame">' + '<img src="shopfront-pixel.png" alt="Rumah toko Halloween Mellissa" draggable="false">' + "</div>" + '<div class="ms-head-copy">' + '<h2 id="mli-title">Melissa Shop</h2>' + "<p>Mellissa mampir selama 10 menit sebelum menghilang. Tukar Halloween Coins dari lagu Chiroot dengan PFP Border (30 Coins) &amp; harta karun musiman.</p>" + '<div class="ms-head-actions">' + '<span class="ms-coin-chip" id="mli-coin-chip" title="Saldo Halloween Coin kamu">' + coinSvg(18) + '<span id="mli-balance">–</span>&nbsp;Coins' + "</span>" + '<span class="ms-despawn-chip ms-hidden" id="mli-despawn-chip" title="Sisa waktu kunjungan Mellissa">⏳ <span id="mli-despawn-time">10:00</span></span>' + '<button type="button" class="ms-login-btn" id="mli-login"><span>Login with Google</span></button>' + '<button type="button" class="ms-avatar-btn ms-hidden" id="mli-avatar"><span class="dot"></span><span id="mli-avatar-name">Akun</span></button>' + '<button type="button" class="ms-admin-btn ms-hidden" id="mli-admin-open">★ Admin</button>' + "</div>" + "</div>" + "</div>" + '<div class="ms-dialogue" id="mli-dialogue">Welcome, traveler! Ready to explore my little Halloween shop?</div>' + '<div class="ms-toolbar">' + '<div class="ms-search"><span aria-hidden="true" style="color:var(--gold)">🔍</span>' + '<input type="search" id="mli-search" placeholder="Cari PFP Border atau treasure…" aria-label="Cari produk"></div>' + '<div class="ms-cats" id="mli-cats"></div>' + '<button type="button" class="ms-cart-btn" id="mli-cart-open">🛒 Keranjang<span class="count ms-hidden" id="mli-cart-count">0</span></button>' + "</div>" + '<div class="ms-grid" id="mli-grid"><div class="ms-skeleton"></div></div>' + '<div class="ms-section-head"><h3>Riwayat Kamu</h3><div class="rule"></div></div>' + '<div class="ms-tabs">' + '<button type="button" class="ms-tab active" id="mli-tab-txn">Transaksi Koin</button>' + '<button type="button" class="ms-tab" id="mli-tab-purchase">Riwayat Pembelian</button>' + "</div>" + '<div class="ms-panel-box" id="mli-panel-txn"><div class="ms-table-wrap"><table class="ms-table">' + '<thead><tr><th>Waktu</th><th>Tipe</th><th>Keterangan</th><th style="text-align:right">Jumlah</th><th style="text-align:right">Saldo</th></tr></thead>' + '<tbody id="mli-txn-body"></tbody></table></div>' + '<div class="ms-history-empty ms-hidden" id="mli-txn-empty">Belum ada transaksi koin. Selesaikan lagu pertamamu di Chiroot!</div></div>' + '<div class="ms-panel-box ms-hidden" id="mli-panel-purchase"><div class="ms-table-wrap"><table class="ms-table">' + '<thead><tr><th>Waktu</th><th>Item</th><th style="text-align:right">Total</th><th>Status</th></tr></thead>' + '<tbody id="mli-purchase-body"></tbody></table></div>' + '<div class="ms-history-empty ms-hidden" id="mli-purchase-empty">Belum ada pembelian.</div></div>' + "</div>" + "</div>" + '<div class="ms-overlay" id="mli-detail-overlay" role="dialog" aria-modal="true" aria-label="Detail produk">' + '<div class="ms-modal">' + '<button type="button" class="ms-close-x" id="mli-detail-close">✕</button>' + '<h3 id="mli-detail-title">Produk</h3>' + '<div class="ms-detail-grid">' + '<div class="ms-detail-img" id="mli-detail-img"></div>' + '<div class="ms-detail-info">' + '<p id="mli-detail-desc"></p>' + '<div class="ms-stock" id="mli-detail-stock"></div>' + '<div class="ms-price" id="mli-detail-price" style="margin:8px 0 4px;font-size:16px"></div>' + '<div class="ms-qty" id="mli-qty-wrap">' + '<button type="button" id="mli-qty-minus" aria-label="Kurangi">−</button>' + '<span id="mli-qty-value">1</span>' + '<button type="button" id="mli-qty-plus" aria-label="Tambah">+</button>' + "</div>" + '<div class="ms-actions" style="justify-content:flex-start;margin:0;flex-wrap:wrap;gap:8px">' + '<button type="button" class="ms-btn ms-btn-primary" id="mli-add-cart">+ Masukkan keranjang</button>' + '<button type="button" class="ms-btn ms-btn-ghost ms-hidden" id="mli-equip-btn">✦ Pakai Border Ini</button>' + "</div>" + "</div>" + "</div>" + "</div>" + "</div>" + '<div class="ms-drawer-scrim" id="mli-scrim"></div>' + '<aside class="ms-drawer" id="mli-drawer" aria-label="Keranjang belanja">' + '<div class="ms-drawer-head"><h3>Keranjang Treasure</h3>' + '<button type="button" class="ms-modal-close" id="mli-cart-close" aria-label="Tutup keranjang">✕</button></div>' + '<div class="ms-drawer-body" id="mli-cart-body"></div>' + '<div class="ms-drawer-foot">' + '<div class="ms-total-row"><span>Total</span><span class="ms-price">' + coinIcon() + '<span id="mli-cart-total">0</span></span></div>' + '<button type="button" class="ms-btn ms-btn-primary" id="mli-checkout" style="width:100%">Checkout dengan Halloween Coins</button>' + "</div>" + "</aside>" + '<div class="ms-overlay" id="mli-confirm-overlay" role="dialog" aria-modal="true" aria-label="Konfirmasi pembelian">' + '<div class="ms-modal" style="width:min(440px,94%)">' + '<div class="ms-confirm-icon">🎃</div>' + '<h3 style="margin:0 0 4px">Konfirmasi pembelian</h3>' + '<p class="ms-muted" style="margin:0">Server akan memvalidasi saldo &amp; stok.</p>' + '<div class="ms-confirm-summary" id="mli-confirm-summary"></div>' + '<div class="ms-actions">' + '<button type="button" class="ms-btn ms-btn-ghost" id="mli-confirm-cancel">Batal</button>' + '<button type="button" class="ms-btn ms-btn-primary" id="mli-confirm-ok">Ya, beli sekarang</button>' + "</div>" + "</div>" + "</div>" + '<div class="ms-overlay" id="mli-admin-overlay" role="dialog" aria-modal="true" aria-label="Panel admin produk">' + '<div class="ms-modal wide">' + '<button type="button" class="ms-close-x" id="mli-admin-close">✕</button>' + "<h3>Admin — Tambah / Edit Produk</h3>" + '<p class="ms-muted" style="margin:0 0 14px">Harga &amp; stok hanya bisa diubah lewat panel ini; database berwenang penuh.</p>' + '<form class="ms-admin-form" id="mli-admin-form">' + '<input type="hidden" id="mli-ap-id">' + '<label>Nama produk<input type="text" id="mli-ap-name" maxlength="120" required placeholder="Pumpkin & Ribbon Border #01"></label>' + '<label>Kategori<input type="text" id="mli-ap-category" maxlength="40" placeholder="PFP Border" list="mli-category-list"><datalist id="mli-category-list"></datalist></label>' + '<label>Harga (Coins)<input type="number" id="mli-ap-price" min="1" step="1" required placeholder="30"></label>' + '<label>Stok<input type="number" id="mli-ap-stock" min="0" step="1" required placeholder="9999"></label>' + '<label class="full">URL gambar / Kode PFP Border<input type="url" id="mli-ap-image" maxlength="1024" placeholder="https://astuagdezahmuuwjoghf.supabase.co/pfp/pfp_border_01.png"></label>' + '<label class="full">Deskripsi<textarea id="mli-ap-desc" rows="3" maxlength="600" placeholder="Cerita singkat harta karun ini…"></textarea></label>' + '<label class="full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="mli-ap-active" checked> Produk aktif (tampil di katalog)</label>' + '<div class="full ms-actions" style="margin:4px 0 0;flex-wrap:wrap;gap:8px"><button type="button" class="ms-btn ms-btn-ghost" id="mli-sync-borders">🎃 Sinkron 10 PFP Border (30 Coins)</button><button type="submit" class="ms-btn ms-btn-primary">Simpan produk</button></div>' + "</form>" + "</div>" + "</div>" + '<div class="ms-toast" id="mli-toast" role="status" aria-live="polite"></div>';
        document.body.appendChild(root);
        root.addEventListener("dragstart", function(e) {
            e.preventDefault();
        });
        [ "character", "char-figure", "char-timer", "char-timer-val", "bubble", "star-burst", "overlay", "overlay-close", "coin-chip", "balance", "despawn-chip", "despawn-time", "login", "avatar", "avatar-name", "admin-open", "dialogue", "search", "cats", "cart-open", "cart-count", "grid", "tab-txn", "tab-purchase", "panel-txn", "panel-purchase", "txn-body", "txn-empty", "purchase-body", "purchase-empty", "detail-overlay", "detail-close", "detail-title", "detail-img", "detail-desc", "detail-stock", "detail-price", "qty-wrap", "qty-minus", "qty-value", "qty-plus", "add-cart", "equip-btn", "scrim", "drawer", "cart-close", "cart-body", "cart-total", "checkout", "confirm-overlay", "confirm-summary", "confirm-cancel", "confirm-ok", "admin-overlay", "admin-close", "admin-form", "ap-id", "ap-name", "ap-category", "ap-price", "ap-stock", "ap-image", "ap-desc", "ap-active", "sync-borders", "category-list", "toast" ].forEach(function(id) {
            els[id] = document.getElementById("mli-" + id);
        });
    }
    function $(id) {
        return els[id];
    }
    function esc(v) {
        return core.esc(v);
    }
    function say(line) {
        if ($("dialogue")) $("dialogue").textContent = line;
    }
    function fmtDate(iso) {
        try {
            return new Date(iso).toLocaleString("id-ID", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            });
        } catch (e) {
            return iso || "—";
        }
    }
    function resolveBorderKey(p) {
        if (!p) return "";
        if (bordersApi) return bordersApi.resolveKey(p);
        return "";
    }
    function productImage(p) {
        if (!p) return "";
        var bKey = resolveBorderKey(p);
        if (bKey && bordersApi) {
            var bSrc = bordersApi.getSrc(bKey);
            if (bSrc) return bSrc;
        }
        if (p.image_url && /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/]+=*$/.test(p.image_url)) return p.image_url;
        return p.image_url && /^https:\/\/[^"'\s<>]+$/.test(p.image_url) ? p.image_url : "";
    }
    function mergeWithBorderCatalog(dbRows) {
        var rows = Array.isArray(dbRows) ? dbRows.slice() : [];
        var byBorderKey = {};
        var normalized = rows.map(function(row) {
            var copy = Object.assign({}, row);
            var bKey = resolveBorderKey(copy);
            if (bKey) {
                copy.border_key = bKey;
                if (!copy.category || copy.category === "general") copy.category = "PFP Border";
                byBorderKey[bKey] = copy;
            }
            return copy;
        });
        if (bordersApi) {
            bordersApi.getCatalog().forEach(function(item) {
                if (!byBorderKey[item.key]) {
                    normalized.push({
                        id: "local_" + item.key,
                        border_key: item.key,
                        name: item.name,
                        description: item.description,
                        image_url: item.image_marker,
                        category: item.category,
                        price: 30,
                        stock: 9999,
                        is_active: true,
                        _unseeded: true
                    });
                }
            });
        }
        normalized.sort(function(a, b) {
            var ka = a.border_key || "";
            var kb = b.border_key || "";
            if (ka && kb) return ka.localeCompare(kb);
            if (ka) return -1;
            if (kb) return 1;
            return 0;
        });
        return normalized;
    }
    function openLayer(id) {
        if ($(id)) $(id).classList.add("open");
    }
    function closeLayer(id) {
        if ($(id)) $(id).classList.remove("open");
    }
    function toast(msg, isError) {
        var el = $("toast");
        if (!el) return;
        el.className = "ms-toast" + (isError ? " error" : "");
        el.innerHTML = "";
        if (!isError) {
            var ic = document.createElement("img");
            ic.src = "halloween-coin.png";
            ic.alt = "";
            ic.draggable = false;
            el.appendChild(ic);
        }
        var txt = document.createElement("span");
        txt.textContent = msg;
        el.appendChild(txt);
        requestAnimationFrame(function() {
            el.classList.add("show");
        });
        clearTimeout(el._timer);
        el._timer = setTimeout(function() {
            el.classList.remove("show");
        }, 3200);
    }
    function readNextAt() {
        var v = Number(localStorage.getItem(NEXT_KEY));
        if (!isFinite(v) || v <= 0) {
            v = Date.now() + VISIT_MS;
            localStorage.setItem(NEXT_KEY, String(v));
        }
        return v;
    }
    function readActiveUntil() {
        var v = Number(localStorage.getItem(ACTIVE_UNTIL_KEY));
        return isFinite(v) && v > 0 ? v : 0;
    }
    function formatRemaining(ms) {
        var sec = Math.max(0, Math.ceil(ms / 1e3));
        var m = Math.floor(sec / 60);
        var s = sec % 60;
        return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
    }
    function updateDespawnChip() {
        var visibleTimer = state.characterVisible && !state.despawning && state.despawnAt > 0;
        var rem = visibleTimer ? Math.max(0, state.despawnAt - Date.now()) : 0;
        var label = formatRemaining(rem);
        if ($("despawn-chip") && $("despawn-time")) {
            if (visibleTimer) {
                $("despawn-chip").classList.remove("ms-hidden");
                $("despawn-time").textContent = label;
                $("despawn-chip").classList.toggle("urgent", rem <= 6e4);
            } else {
                $("despawn-chip").classList.add("ms-hidden");
            }
        }
        if ($("char-timer") && $("char-timer-val")) {
            if (visibleTimer) {
                $("char-timer").classList.remove("ms-hidden");
                $("char-timer-val").textContent = label;
                $("char-timer").classList.toggle("urgent", rem <= 6e4);
            } else {
                $("char-timer").classList.add("ms-hidden");
            }
        }
    }
    function armDespawnTimer(targetTs) {
        state.despawnAt = targetTs;
        clearTimeout(despawnTimer);
        var wait = Math.max(0, targetTs - Date.now());
        despawnTimer = setTimeout(function() {
            despawnCharacter(true);
        }, wait);
        updateDespawnChip();
    }
    function spawnStarExplosion() {
        var box = $("star-burst");
        if (!box) return;
        var glyphs = [ "✦", "✧", "★", "✶" ];
        var colors = [ "#ffd466", "#fff4c2", "#ff9e3d", "#e3b5ff", "#ffbe3b" ];
        var html = '<span class="mc-burst-flash"></span><span class="mc-burst-ring"></span><span class="mc-burst-ring r2"></span>';
        var count = 24;
        for (var i = 0; i < count; i++) {
            var angle = (Math.PI * 2 * i) / count + (Math.random() - .5) * .22;
            var dist = 56 + Math.round(Math.random() * 76);
            var tx = Math.round(Math.cos(angle) * dist);
            var ty = Math.round(Math.sin(angle) * dist) - 8;
            var rot = Math.round((Math.random() - .5) * 420);
            var sc = (.75 + Math.random() * .75).toFixed(2);
            var dur = (.62 + Math.random() * .3).toFixed(2);
            var dly = (Math.random() * .08).toFixed(2);
            var clr = colors[i % colors.length];
            var gl = glyphs[i % glyphs.length];
            html += '<span class="mc-star-particle" style="--tx:' + tx + "px;--ty:" + ty + "px;--rot:" + rot + "deg;--sc:" + sc + ";--dur:" + dur + "s;--dly:" + dly + "s;color:" + clr + '">' + gl + "</span>";
        }
        box.innerHTML = html;
    }
    function despawnCharacter() {
        if (state.despawning || !state.characterVisible) return;
        if (state.purchaseInFlight) {
            clearTimeout(despawnTimer);
            despawnTimer = setTimeout(function() {
                despawnCharacter();
            }, 4e3);
            return;
        }
        state.despawning = true;
        clearTimeout(bubbleTimer);
        clearTimeout(despawnTimer);
        try {
            localStorage.removeItem(ACTIVE_UNTIL_KEY);
            var curNext = Number(localStorage.getItem(NEXT_KEY));
            if (!isFinite(curNext) || curNext <= Date.now()) {
                localStorage.setItem(NEXT_KEY, String(Date.now() + VISIT_MS));
            }
        } catch (e) {}
        [ "admin-overlay", "confirm-overlay", "detail-overlay" ].forEach(closeLayer);
        if ($("drawer")) $("drawer").classList.remove("open");
        if ($("scrim")) $("scrim").classList.remove("open");
        closeShop();
        $("bubble").hidden = true;
        updateDespawnChip();
        spawnStarExplosion();
        $("character").classList.add("despawning");
        toast("✦ Waktu kunjungan 10 menit habis! Mellissa menghilang dalam ledakan bintang~");
        setTimeout(function() {
            $("character").classList.remove("visible", "despawning");
            if ($("star-burst")) $("star-burst").innerHTML = "";
            state.characterVisible = false;
            state.despawning = false;
            state.despawnAt = 0;
            updateDespawnChip();
        }, 950);
    }
    function presentCharacterUntil(untilTs, silentToast) {
        if (!untilTs || untilTs <= Date.now()) return false;
        if (state.characterVisible && !state.despawning) {
            if (state.despawnAt !== untilTs) armDespawnTimer(untilTs); else updateDespawnChip();
            return true;
        }
        clearTimeout(despawnTimer);
        if ($("star-burst")) $("star-burst").innerHTML = "";
        $("character").classList.remove("despawning");
        state.despawning = false;
        state.characterVisible = true;
        $("character").classList.add("visible");
        armDespawnTimer(untilTs);
        var lines = [ "Aku datang 10 menit bawa dagangan! Klik aku ya~", "Toko keliling Mellissa buka 10 menit! Cek PFP Border yuk~", "Ada 10 PFP Border Halloween 30 Coins! Klik aku~", "Hai traveler! Mampir yuk sebelum aku menghilang~" ];
        clearTimeout(bubbleTimer);
        $("bubble").hidden = false;
        bubbleTimer = setTimeout(function() {
            $("bubble").hidden = true;
        }, 1e4);
        $("bubble").textContent = lines[Math.floor(Math.random() * lines.length)];
        if (!silentToast) toast("Mellissa muncul selama 10 menit! Klik dia untuk belanja.");
        return true;
    }
    function startScheduledVisit() {
        var now = Date.now();
        var existing = readActiveUntil();
        if (existing > now) {
            return presentCharacterUntil(existing, true);
        }
        if (now < readNextAt()) return false;
        var until = now + DESPAWN_MS;
        var nextAt = until + VISIT_MS;
        try {
            localStorage.setItem(ACTIVE_UNTIL_KEY, String(until));
            localStorage.setItem(NEXT_KEY, String(nextAt));
        } catch (e) {}
        return presentCharacterUntil(until, false);
    }
    function tick() {
        if (state.despawning) return;
        var now = Date.now();
        var activeUntil = readActiveUntil();
        if (state.characterVisible) {
            var deadline = activeUntil > 0 ? Math.min(state.despawnAt || activeUntil, activeUntil) : state.despawnAt;
            if (!deadline || now >= deadline) {
                despawnCharacter();
            } else {
                if (state.despawnAt !== deadline) armDespawnTimer(deadline); else updateDespawnChip();
            }
            return;
        }
        if (activeUntil > now) {
            presentCharacterUntil(activeUntil, true);
            return;
        }
        if (activeUntil > 0 && activeUntil <= now) {
            try {
                localStorage.removeItem(ACTIVE_UNTIL_KEY);
                var nAt = Number(localStorage.getItem(NEXT_KEY));
                if (!isFinite(nAt) || nAt <= now) localStorage.setItem(NEXT_KEY, String(now + VISIT_MS));
            } catch (e) {}
        }
        if (now >= readNextAt()) {
            startScheduledVisit();
        }
    }
    function renderAuth() {
        var authed = core.isAuthed();
        $("login").classList.toggle("ms-hidden", authed);
        $("avatar").classList.toggle("ms-hidden", !authed);
        if (!authed) {
            state.balance = null;
            $("balance").textContent = "0";
            return;
        }
        var s = core.getSession();
        var name = s && s.user && s.user.email ? s.user.email.split("@")[0] : "Traveler";
        if (window.ChirootAuth && window.ChirootAuth.profile && window.ChirootAuth.profile.display_name) {
            name = window.ChirootAuth.profile.display_name;
        }
        $("avatar-name").textContent = name.replace(/[._-]+/g, " ");
    }
    function logout() {
        if (typeof window.caAskSignOut === "function") {
            window.caAskSignOut();
            return;
        }
        var s = core.getSession();
        var done = function() {
            core.clearSession();
            state.balance = 0;
            state.isAdmin = false;
            renderAuth();
            renderGrid();
            document.dispatchEvent(new CustomEvent("melissa:balance", { detail: { balance: 0 } }));
            toast("Berhasil keluar dari akun.");
        };
        if (s) {
            fetch(core.config.url + "/auth/v1/logout", {
                method: "POST",
                headers: {
                    apikey: core.config.key,
                    Authorization: "Bearer " + s.access_token
                }
            }).then(done, done);
        } else done();
    }
    function loadBalance(bump) {
        if (!core.isAuthed()) {
            $("balance").textContent = "0";
            return Promise.resolve();
        }
        return core.apiCall("/rest/v1/wallets?select=balance&limit=1", "GET").then(function(rows) {
            var next = rows && rows.length ? Number(rows[0].balance) : 0;
            var prev = state.balance;
            state.balance = next;
            document.dispatchEvent(new CustomEvent("melissa:balance", {
                detail: {
                    balance: next
                }
            }));
            $("balance").textContent = String(next);
            if (bump && prev !== null && next !== prev) {
                var chip = $("coin-chip");
                chip.classList.remove("bump");
                void chip.offsetWidth;
                chip.classList.add("bump");
            }
        }).catch(function(err) {
            if (err && err.status === 401) return;
            $("balance").textContent = "0";
        });
    }
    function loadProducts() {
        return core.apiCall("/rest/v1/products?select=*&order=created_at.desc", "GET").then(function(rows) {
            var merged = mergeWithBorderCatalog(rows);
            if (!state.isAdmin) {
                merged = merged.filter(function(p) {
                    return p.is_active !== false;
                });
            }
            state.products = merged;
            var cats = {};
            state.products.forEach(function(p) {
                if (p.category) cats[p.category] = true;
            });
            state.categories = Object.keys(cats).sort();
            renderCats();
            applyFilters();
            return state.products;
        }).catch(function(err) {
            state.products = mergeWithBorderCatalog([]);
            var cats = {};
            state.products.forEach(function(p) {
                if (p.category) cats[p.category] = true;
            });
            state.categories = Object.keys(cats).sort();
            renderCats();
            applyFilters();
            if (err && err.status !== 404) console.warn("[Melissa] loadProducts", err.message);
            return state.products;
        });
    }
    function syncBordersToServer(announce) {
        if (!core.isAuthed() || state.syncingBorders || !bordersApi) return Promise.resolve(false);
        var catalog = bordersApi.getCatalog();
        var tasks = catalog.map(function(item) {
            var existing = state.products.find(function(p) {
                return !p._unseeded && p.border_key === item.key;
            });
            if (existing && Number(existing.price) === 30 && existing.is_active) return null;
            return {
                p_id: existing ? existing.id : null,
                p_name: item.name,
                p_description: item.description,
                p_image_url: item.image_marker,
                p_category: "PFP Border",
                p_price: 30,
                p_stock: existing ? Math.max(Number(existing.stock) || 0, 9999) : 9999,
                p_is_active: true
            };
        }).filter(Boolean);
        if (!tasks.length) {
            if (announce) toast("Semua 10 PFP Border (30 Coins) sudah sinkron di database!");
            return Promise.resolve(true);
        }
        state.syncingBorders = true;
        var chain = Promise.resolve();
        tasks.forEach(function(args) {
            chain = chain.then(function() {
                return core.rpc("admin_upsert_product", args);
            });
        });
        return chain.then(function() {
            if (announce) toast("10 PFP Border (30 Coins) berhasil disimpan ke database!");
            return loadProducts().then(function() {
                state.cart.forEach(function(line) {
                    if (line.border_key) {
                        var real = state.products.find(function(p) {
                            return !p._unseeded && p.border_key === line.border_key;
                        });
                        if (real) {
                            line.product_id = real.id;
                            line._unseeded = false;
                        }
                    }
                });
                return true;
            });
        }).catch(function(err) {
            if (announce) toast(err && err.message || "Gagal sinkron PFP Border.", true);
            return false;
        }).then(function(ok) {
            state.syncingBorders = false;
            return ok;
        });
    }
    function renderCats() {
        var wrap = $("cats");
        wrap.innerHTML = "";
        function chip(label, val) {
            var b = document.createElement("button");
            b.type = "button";
            b.className = "ms-cat" + (state.activeCategory === val ? " active" : "");
            b.textContent = label;
            b.addEventListener("click", function() {
                state.activeCategory = val;
                renderCats();
                applyFilters();
            });
            wrap.appendChild(b);
        }
        chip("Semua", "all");
        state.categories.forEach(function(c) {
            chip(c, c);
        });
        $("category-list").innerHTML = state.categories.map(function(c) {
            return '<option value="' + esc(c) + '">';
        }).join("");
    }
    function applyFilters() {
        var q = state.search.trim().toLowerCase();
        state.filtered = state.products.filter(function(p) {
            var catOk = state.activeCategory === "all" || p.category === state.activeCategory;
            var qOk = !q || String(p.name || "").toLowerCase().indexOf(q) !== -1 || String(p.description || "").toLowerCase().indexOf(q) !== -1;
            return catOk && qOk;
        });
        renderGrid();
    }
    function renderGrid() {
        var grid = $("grid");
        grid.innerHTML = "";
        if (!state.filtered.length) {
            var empty = document.createElement("div");
            empty.className = "ms-empty";
            if (state.products.length) {
                empty.innerHTML = "<h3>Tidak ada yang cocok</h3><p>Coba kata kunci atau kategori lain, traveler.</p>";
            } else {
                empty.innerHTML = '<div style="font-size:42px;margin:0 auto 8px">🎃</div>' + "<h3>My shelves are waiting for new treasures!</h3>" + "<p>Belum ada produk aktif. Saat admin menambahkan treasure, rak ini terisi otomatis.</p>";
            }
            grid.appendChild(empty);
            return;
        }
        var equippedKey = core.isAuthed() && bordersApi ? bordersApi.getEquipped() : "";
        state.filtered.forEach(function(p) {
            var card = document.createElement("article");
            card.className = "ms-card";
            var img = productImage(p);
            var bKey = resolveBorderKey(p);
            var owned = core.isAuthed() && bKey && bordersApi && bordersApi.isOwned(bKey);
            var isEquipped = owned && equippedKey === bKey;
            var badgeHtml = isEquipped ? '<span class="ms-owned-pill equipped">✦ Terpasang</span>' : owned ? '<span class="ms-owned-pill">✓ Dimiliki</span>' : "";
            var mediaHtml = bKey && img ? borderPreviewHtml(img, p.name, false) : img ? '<img src="' + esc(img) + '" alt="' + esc(p.name) + '" draggable="false">' : '<span class="ph">🎃</span>';
            var stockLabel = owned ? "Koleksi kamu" : bKey ? "PFP Border" : "Stok " + esc(String(p.stock));
            card.innerHTML = '<div class="ms-card-img">' + badgeHtml + mediaHtml + "</div>" + '<div class="ms-card-body">' + '<h3 class="ms-card-name">' + esc(p.name) + "</h3>" + '<p class="ms-card-desc">' + esc(p.description || "") + "</p>" + '<div class="ms-card-foot">' + '<span class="ms-price">' + coinIcon() + esc(String(p.price)) + "</span>" + '<span class="ms-stock' + (!owned && !bKey && p.stock <= 5 ? " low" : "") + '">' + stockLabel + "</span>" + "</div>" + "</div>";
            card.addEventListener("click", function() {
                openDetail(p);
            });
            grid.appendChild(card);
        });
    }
    function refreshDetailEquipUI(p) {
        var bKey = resolveBorderKey(p);
        var owned = core.isAuthed() && bKey && bordersApi && bordersApi.isOwned(bKey);
        var equipped = owned && bordersApi.getEquipped() === bKey;
        var qtyWrap = $("qty-wrap");
        var addBtn = $("add-cart");
        var eqBtn = $("equip-btn");
        if (owned) {
            if (qtyWrap) qtyWrap.classList.add("ms-hidden");
            addBtn.classList.add("ms-hidden");
            eqBtn.classList.remove("ms-hidden");
            eqBtn.textContent = equipped ? "Lepas Border dari Profil" : "✦ Pakai Border Ini";
            $("detail-stock").textContent = equipped ? "Status: Sedang terpasang di profil kamu ✦" : "Status: Sudah kamu miliki — siap dipasang!";
        } else {
            if (qtyWrap) qtyWrap.classList.toggle("ms-hidden", !!bKey);
            addBtn.classList.remove("ms-hidden");
            eqBtn.classList.add("ms-hidden");
            addBtn.disabled = p.stock < 1;
            $("detail-stock").textContent = bKey ? "Item permanen untuk foto profil Chiroot" : "Stok tersedia: " + p.stock + (p.stock <= 5 ? " · hampir habis!" : "");
        }
    }
    function openDetail(p) {
        state.selected = p;
        state.qty = 1;
        $("detail-title").textContent = p.name;
        $("detail-desc").textContent = p.description || "Belum ada deskripsi untuk treasure ini.";
        $("detail-price").innerHTML = coinIcon(20) + " " + esc(String(p.price)) + " Halloween Coins";
        var img = productImage(p);
        var bKey = resolveBorderKey(p);
        $("detail-img").innerHTML = bKey && img ? borderPreviewHtml(img, p.name, true) : img ? '<img src="' + esc(img) + '" alt="' + esc(p.name) + '" draggable="false">' : '<span class="ph" style="font-size:50px">🎃</span>';
        $("qty-value").textContent = "1";
        refreshDetailEquipUI(p);
        openLayer("detail-overlay");
    }
    function cartCount() {
        return state.cart.reduce(function(n, l) {
            return n + l.quantity;
        }, 0);
    }
    function cartTotal() {
        return state.cart.reduce(function(n, l) {
            return n + l.unit_price * l.quantity;
        }, 0);
    }
    function renderCart() {
        var body = $("cart-body");
        body.innerHTML = "";
        $("cart-count").textContent = String(cartCount());
        $("cart-count").classList.toggle("ms-hidden", cartCount() === 0);
        $("cart-total").textContent = String(cartTotal());
        $("checkout").disabled = state.cart.length === 0 || state.purchaseInFlight;
        if (!state.cart.length) {
            body.innerHTML = '<div class="ms-history-empty">Keranjang masih kosong. Pilih PFP Border atau treasure dari rak dulu yuk!</div>';
            return;
        }
        state.cart.forEach(function(line) {
            var div = document.createElement("div");
            div.className = "ms-cart-line";
            div.innerHTML = (line.image ? '<img src="' + esc(line.image) + '" alt="" draggable="false">' : '<div style="width:54px;height:54px;border-radius:9px;background:#120616;display:flex;align-items:center;justify-content:center;font-size:22px">🎃</div>') + '<div style="min-width:0;flex:1"><p class="name">' + esc(line.name) + "</p>" + '<div class="meta">' + line.quantity + " × " + line.unit_price + " = " + line.unit_price * line.quantity + " koin</div></div>" + '<button type="button" class="rm" aria-label="Hapus ' + esc(line.name) + '" title="Hapus">✕</button>';
            div.querySelector(".rm").addEventListener("click", function() {
                state.cart = state.cart.filter(function(l) {
                    return l.product_id !== line.product_id;
                });
                renderCart();
            });
            body.appendChild(div);
        });
    }
    function addSelectedToCart() {
        var p = state.selected;
        if (!p || p.stock < 1) return;
        var bKey = resolveBorderKey(p);
        if (bKey && core.isAuthed() && bordersApi && bordersApi.isOwned(bKey)) {
            toast("Kamu sudah memiliki border ini!", true);
            return;
        }
        var existing = state.cart.find(function(l) {
            return l.product_id === p.id || bKey && l.border_key === bKey;
        });
        if (bKey && existing) {
            closeLayer("detail-overlay");
            toast('"' + p.name + '" sudah ada di keranjang.');
            return;
        }
        var currentQty = existing ? existing.quantity : 0;
        if (currentQty + state.qty > p.stock) {
            toast("Stok " + p.name + " hanya " + p.stock + ".", true);
            return;
        }
        if (existing) existing.quantity += state.qty; else state.cart.push({
            product_id: p.id,
            border_key: bKey || "",
            _unseeded: !!p._unseeded,
            name: p.name,
            image: productImage(p),
            unit_price: Number(p.price),
            quantity: bKey ? 1 : state.qty,
            stock: p.stock
        });
        closeLayer("detail-overlay");
        renderCart();
        toast('"' + p.name + '" masuk keranjang!');
    }
    function openConfirm() {
        if (!core.isAuthed()) {
            toast("Login dulu untuk menukar Halloween Coins.", true);
            return;
        }
        if (!state.cart.length) return;
        $("confirm-summary").innerHTML = state.cart.map(function(l) {
            return '<div class="row"><span>' + esc(l.name) + " × " + l.quantity + "</span><span>" + l.unit_price * l.quantity + "</span></div>";
        }).join("") + '<div class="row total"><span>Total</span><span>' + cartTotal() + " koin</span></div>" + '<div class="row"><span>Saldo kamu</span><span>' + (state.balance == null ? "–" : state.balance) + " koin</span></div>";
        openLayer("confirm-overlay");
    }
    function doCheckout() {
        if (state.purchaseInFlight) return;
        state.purchaseInFlight = true;
        $("confirm-ok").disabled = true;
        if (!state.idempotencyKey) {
            state.idempotencyKey = crypto.randomUUID ? crypto.randomUUID() : "p_" + Date.now() + "_" + Math.random().toString(36).slice(2);
        }
        var hasUnseeded = state.cart.some(function(l) {
            return l._unseeded || /^local_/.test(String(l.product_id));
        });
        var prep = hasUnseeded ? syncBordersToServer(false) : Promise.resolve(true);
        prep.then(function() {
            var stillLocal = state.cart.some(function(l) {
                return l._unseeded || /^local_/.test(String(l.product_id));
            });
            if (stillLocal) {
                throw new Error("SEED_REQUIRED");
            }
            var payload = state.cart.map(function(l) {
                return {
                    product_id: l.product_id,
                    quantity: l.quantity
                };
            });
            var boughtBorders = state.cart.map(function(l) {
                return l.border_key;
            }).filter(Boolean);
            return core.rpc("purchase_products", {
                p_items: payload,
                p_idempotency_key: state.idempotencyKey
            }).then(function(res) {
                if (!res || res.ok !== true) throw new Error("Pembelian gagal diproses server.");
                var spent = Number(res.total_spent || cartTotal());
                if (boughtBorders.length && bordersApi) {
                    bordersApi.markOwned(boughtBorders);
                    bordersApi.setEquipped(boughtBorders[0]);
                }
                state.cart = [];
                state.idempotencyKey = null;
                closeLayer("confirm-overlay");
                $("drawer").classList.remove("open");
                $("scrim").classList.remove("open");
                renderCart();
                renderGrid();
                say(boughtBorders.length ? "Border baru langsung terpasang di foto profilmu!" : "Excellent choice! Enjoy your new treasure.");
                toast(boughtBorders.length ? "Pembelian sukses! −" + spent + " Coins • Border terpasang!" : "Pembelian sukses! −" + spent + " Halloween Coins");
                return Promise.all([ loadBalance(true), loadProducts(), loadTransactions(), loadPurchases() ]);
            });
        }).catch(function(err) {
            var msg = err && err.message ? err.message : "Pembelian gagal.";
            var friendly = {
                SEED_REQUIRED: "Produk PFP Border belum terdaftar di tabel products Supabase. Buka sekali dengan akun Admin atau jalankan SQL seed produk.",
                INSUFFICIENT_FUNDS: "Saldo Halloween Coins kamu tidak cukup (butuh " + cartTotal() + " Coins).",
                INSUFFICIENT_STOCK: "Stok produk tidak mencukupi.",
                PRODUCT_UNAVAILABLE: "Salah satu produk sudah tidak aktif.",
                UNKNOWN_PRODUCT: "Produk tidak ditemukan di server.",
                EMPTY_CART: "Keranjang kosong.",
                AUTH_REQUIRED: "Sesi login habis. Silakan login ulang."
            };
            Object.keys(friendly).some(function(k) {
                if (msg.indexOf(k) !== -1) {
                    msg = friendly[k];
                    return true;
                }
                return false;
            });
            toast(msg, true);
        }).then(function() {
            state.purchaseInFlight = false;
            $("confirm-ok").disabled = false;
        });
    }
    function loadTransactions() {
        if (!core.isAuthed()) {
            $("txn-body").innerHTML = "";
            $("txn-empty").classList.remove("ms-hidden");
            return Promise.resolve();
        }
        return core.apiCall("/rest/v1/coin_transactions?select=*&order=created_at.desc&limit=50", "GET").then(function(rows) {
            rows = Array.isArray(rows) ? rows : [];
            $("txn-empty").classList.toggle("ms-hidden", rows.length > 0);
            $("txn-body").innerHTML = rows.map(function(t) {
                var pos = Number(t.amount) > 0;
                return '<tr><td class="ms-muted">' + fmtDate(t.created_at) + "</td><td>" + esc(t.txn_type) + "</td>" + '<td class="ms-muted">' + esc(t.reason || "—") + "</td>" + '<td style="text-align:right" class="' + (pos ? "ms-amount-pos" : "ms-amount-neg") + '">' + (pos ? "+" : "") + esc(String(t.amount)) + "</td>" + '<td style="text-align:right">' + esc(String(t.balance_after)) + "</td></tr>";
            }).join("");
        }).catch(function() {
            $("txn-body").innerHTML = "";
            $("txn-empty").classList.remove("ms-hidden");
        });
    }
    function loadPurchases() {
        if (!core.isAuthed()) {
            $("purchase-body").innerHTML = "";
            $("purchase-empty").classList.remove("ms-hidden");
            return Promise.resolve();
        }
        return core.apiCall("/rest/v1/purchases?select=*&order=created_at.desc&limit=50", "GET").then(function(purchases) {
            purchases = Array.isArray(purchases) ? purchases : [];
            if (!purchases.length) {
                $("purchase-body").innerHTML = "";
                $("purchase-empty").classList.remove("ms-hidden");
                return;
            }
            $("purchase-empty").classList.add("ms-hidden");
            return core.apiCall("/rest/v1/purchase_items?select=*", "GET").then(function(items) {
                items = Array.isArray(items) ? items : [];
                var nameById = {};
                var borderById = {};
                state.products.forEach(function(p) {
                    nameById[p.id] = p.name;
                    if (p.border_key) borderById[p.id] = p.border_key;
                });
                var ownedBorderKeys = [];
                items.forEach(function(i) {
                    if (borderById[i.product_id]) ownedBorderKeys.push(borderById[i.product_id]);
                });
                if (ownedBorderKeys.length && bordersApi) {
                    bordersApi.markOwned(ownedBorderKeys);
                    renderGrid();
                }
                $("purchase-body").innerHTML = purchases.map(function(pu) {
                    var summary = items.filter(function(i) {
                        return i.purchase_id === pu.id;
                    }).map(function(i) {
                        return (nameById[i.product_id] || "Produk " + String(i.product_id).slice(0, 8)) + " ×" + i.quantity;
                    }).join(", ");
                    return '<tr><td class="ms-muted">' + fmtDate(pu.created_at) + "</td><td>" + esc(summary || "—") + "</td>" + '<td style="text-align:right" class="ms-amount-neg">−' + esc(String(pu.total_amount)) + "</td>" + '<td><span class="ms-cat" style="cursor:default">' + esc(pu.status) + "</span></td></tr>";
                }).join("");
            });
        }).catch(function() {
            $("purchase-body").innerHTML = "";
            $("purchase-empty").classList.remove("ms-hidden");
        });
    }
    function checkAdmin() {
        if (!core.isAuthed()) {
            state.isAdmin = false;
            $("admin-open").classList.add("ms-hidden");
            return Promise.resolve();
        }
        return core.rpc("is_melissa_admin", {}).then(function(v) {
            state.isAdmin = v === true;
            $("admin-open").classList.toggle("ms-hidden", !state.isAdmin);
            if (state.isAdmin) {
                return loadProducts().then(function() {
                    return syncBordersToServer(false);
                });
            }
            return null;
        }).catch(function() {
            state.isAdmin = false;
            $("admin-open").classList.add("ms-hidden");
        });
    }
    function submitAdmin(e) {
        e.preventDefault();
        var rawImg = $("ap-image").value.trim();
        var bKey = resolveBorderKey(rawImg);
        if (bKey && !/^https:\/\//.test(rawImg)) {
            rawImg = core.config.url + "/pfp/" + bKey + ".png";
        }
        var args = {
            p_id: $("ap-id").value || null,
            p_name: $("ap-name").value.trim(),
            p_description: $("ap-desc").value.trim(),
            p_image_url: rawImg || null,
            p_category: $("ap-category").value.trim() || "general",
            p_price: Number($("ap-price").value),
            p_stock: Number($("ap-stock").value),
            p_is_active: $("ap-active").checked
        };
        core.rpc("admin_upsert_product", args).then(function(res) {
            if (!res || res.ok !== true) throw new Error("Gagal menyimpan produk.");
            closeLayer("admin-overlay");
            toast("Produk tersimpan ke katalog.");
            return loadProducts();
        }).catch(function(err) {
            toast(err && err.message || "Gagal menyimpan produk.", true);
        });
    }
    function openShop() {
        if (state.despawning) return;
        tick();
        var now = Date.now();
        var activeUntil = readActiveUntil();
        if (!state.characterVisible || activeUntil <= now) {
            var waitMs = Math.max(0, readNextAt() - now);
            toast("✦ Mellissa sedang berkelana! Toko buka lagi dalam " + formatRemaining(waitMs) + ".");
            return;
        }
        updateDespawnChip();
        openLayer("overlay");
        renderAuth();
        if (!state.shopLoaded) {
            state.shopLoaded = true;
            loadProducts().then(function() {
                if (core.isAuthed()) return bootAuthedData();
                say("Welcome, traveler! Login dulu untuk mengumpulkan Halloween Coins & beli PFP Border (30 Coins).");
                return null;
            });
        } else {
            renderAuth();
            loadProducts().then(function() {
                if (core.isAuthed()) {
                    loadBalance(false);
                    loadTransactions();
                    loadPurchases();
                }
            });
        }
    }
    function closeShop() {
        closeLayer("overlay");
    }
    function bootAuthedData() {
        say("Welcome, traveler! Koleksi 10 PFP Border Halloween tersedia seharga 30 Coins!");
        return Promise.all([ loadBalance(false), loadTransactions(), loadPurchases(), checkAdmin() ]);
    }
    function refreshLiveAuth() {
        renderAuth();
        if (core.isAuthed()) {
            bootAuthedData().then(function() {
                renderGrid();
            });
        } else {
            state.balance = 0;
            state.isAdmin = false;
            $("admin-open").classList.add("ms-hidden");
            renderGrid();
        }
    }
    function bindEvents() {
        $("char-figure").addEventListener("click", openShop);
        $("overlay-close").addEventListener("click", closeShop);
        $("overlay").addEventListener("click", function(e) {
            if (e.target === $("overlay")) closeShop();
        });
        $("login").addEventListener("click", function() {
            if (state.loginBusy) return;
            state.loginBusy = true;
            var btn = $("login");
            var labelSpan = btn.querySelector("span") || btn;
            var origLabel = labelSpan.textContent;
            btn.disabled = true;
            labelSpan.textContent = "Menunggu Google…";
            try {
                localStorage.setItem(REOPEN_SHOP_KEY, "1");
                if (state.characterVisible && state.despawnAt > Date.now()) {
                    localStorage.setItem(ACTIVE_UNTIL_KEY, String(state.despawnAt));
                }
            } catch (e) {}
            var resetBtn = function() {
                state.loginBusy = false;
                btn.disabled = false;
                labelSpan.textContent = origLabel;
            };
            var fn = typeof core.loginWithGooglePopup === "function" ? core.loginWithGooglePopup : core.loginWithGoogle;
            fn("Main.html").then(function(sess) {
                try {
                    localStorage.removeItem(REOPEN_SHOP_KEY);
                } catch (e) {}
                resetBtn();
                refreshLiveAuth();
                document.dispatchEvent(new CustomEvent("chiroot:live-login", {
                    detail: {
                        session: sess || core.getSession()
                    }
                }));
                toast("Login berhasil! Melissa Shop siap digunakan tanpa reload.");
            }).catch(function(err) {
                try {
                    localStorage.removeItem(REOPEN_SHOP_KEY);
                } catch (e) {}
                resetBtn();
                if (err && err.message === "POPUP_CLOSED") {
                    if (core.isAuthed()) {
                        refreshLiveAuth();
                        document.dispatchEvent(new CustomEvent("chiroot:live-login", {
                            detail: {
                                session: core.getSession()
                            }
                        }));
                    } else {
                        toast("Jendela login ditutup sebelum selesai.");
                    }
                    return;
                }
                toast("Gagal membuka login Google.", true);
            });
        });
        $("avatar").addEventListener("click", function() {
            if (window.confirm("Keluar dari akun Chiroot di perangkat ini?")) logout();
        });
        $("search").addEventListener("input", function(e) {
            state.search = e.target.value;
            applyFilters();
        });
        $("cart-open").addEventListener("click", function() {
            renderCart();
            $("drawer").classList.add("open");
            $("scrim").classList.add("open");
        });
        function closeDrawer() {
            $("drawer").classList.remove("open");
            $("scrim").classList.remove("open");
        }
        $("cart-close").addEventListener("click", closeDrawer);
        $("scrim").addEventListener("click", closeDrawer);
        $("detail-close").addEventListener("click", function() {
            closeLayer("detail-overlay");
        });
        $("detail-overlay").addEventListener("click", function(e) {
            if (e.target === $("detail-overlay")) closeLayer("detail-overlay");
        });
        $("qty-minus").addEventListener("click", function() {
            state.qty = Math.max(1, state.qty - 1);
            $("qty-value").textContent = String(state.qty);
        });
        $("qty-plus").addEventListener("click", function() {
            var max = state.selected ? state.selected.stock : 1;
            if (resolveBorderKey(state.selected)) max = 1;
            state.qty = Math.min(max, state.qty + 1);
            $("qty-value").textContent = String(state.qty);
        });
        $("add-cart").addEventListener("click", addSelectedToCart);
        $("equip-btn").addEventListener("click", function() {
            if (!state.selected || !bordersApi) return;
            var bKey = resolveBorderKey(state.selected);
            if (!bKey) return;
            var currently = bordersApi.getEquipped() === bKey;
            bordersApi.setEquipped(currently ? "" : bKey);
            refreshDetailEquipUI(state.selected);
            renderGrid();
            toast(currently ? "PFP Border dilepas dari profil." : "PFP Border dipasang ke profil!");
        });
        $("checkout").addEventListener("click", openConfirm);
        $("confirm-cancel").addEventListener("click", function() {
            closeLayer("confirm-overlay");
        });
        $("confirm-ok").addEventListener("click", doCheckout);
        $("tab-txn").addEventListener("click", function() {
            switchTab("txn");
        });
        $("tab-purchase").addEventListener("click", function() {
            switchTab("purchase");
        });
        function switchTab(name) {
            var isTxn = name === "txn";
            $("tab-txn").classList.toggle("active", isTxn);
            $("tab-purchase").classList.toggle("active", !isTxn);
            $("panel-txn").classList.toggle("ms-hidden", !isTxn);
            $("panel-purchase").classList.toggle("ms-hidden", isTxn);
        }
        $("admin-open").addEventListener("click", function() {
            $("admin-form").reset();
            $("ap-id").value = "";
            $("ap-active").checked = true;
            openLayer("admin-overlay");
        });
        $("sync-borders").addEventListener("click", function() {
            syncBordersToServer(true);
        });
        $("admin-close").addEventListener("click", function() {
            closeLayer("admin-overlay");
        });
        $("admin-overlay").addEventListener("click", function(e) {
            if (e.target === $("admin-overlay")) closeLayer("admin-overlay");
        });
        $("admin-form").addEventListener("submit", submitAdmin);
        document.addEventListener("keydown", function(e) {
            if (e.key !== "Escape") return;
            [ "admin-overlay", "confirm-overlay", "detail-overlay" ].forEach(closeLayer);
            closeDrawer();
            closeShop();
        });
        document.addEventListener("melissa:reward", function(e) {
            var r = e && e.detail || {};
            var amt = Number(r.coins_awarded || r.amount || r.reward || 2);
            say("Wonderful! You've earned " + amt + " Halloween Coins.");
            if (core.isAuthed()) {
                loadBalance(true);
                if (state.shopLoaded) loadTransactions();
            }
        });
        document.addEventListener("chiroot:border-equipped", function() {
            if (state.shopLoaded) renderGrid();
        });
        document.addEventListener("chiroot:live-login", function() {
            refreshLiveAuth();
        });
        document.addEventListener("chiroot:live-logout", function() {
            refreshLiveAuth();
        });
        window.addEventListener("storage", function(ev) {
            if (!ev) return;
            if (ev.key === "chiroot_auth_v1") {
                refreshLiveAuth();
            } else if (ev.key === ACTIVE_UNTIL_KEY || ev.key === NEXT_KEY) {
                tick();
            }
        });
        document.addEventListener("visibilitychange", function() {
            if (!document.hidden) tick();
        });
    }
    function boot() {
        if (window.__CHIROOT_OAUTH_POPUP_RECEIVER__) return;
        buildMarkup();
        bindEvents();
        renderAuth();
        loadProducts().then(function() {
            if (core.isAuthed()) {
                loadPurchases();
                checkAdmin();
            }
        });
        readNextAt();
        setInterval(tick, TICK_MS);
        setInterval(function() {
            if (state.characterVisible && !state.despawning) tick();
        }, 1e3);
        tick();
        var shouldReopen = false;
        try {
            shouldReopen = localStorage.getItem(REOPEN_SHOP_KEY) === "1";
            if (shouldReopen) localStorage.removeItem(REOPEN_SHOP_KEY);
        } catch (e) {}
        if (shouldReopen) {
            openShop();
        }
        setTimeout(function() {
            renderAuth();
            if (core.isAuthed()) {
                loadPurchases();
                checkAdmin();
            }
        }, 1800);
    }
    window.MelissaInpage = {
        openShop: openShop,
        closeShop: closeShop,
        syncBordersToServer: syncBordersToServer,
        isVisiting: function() {
            return state.characterVisible && !state.despawning && readActiveUntil() > Date.now();
        },
        state: state
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
