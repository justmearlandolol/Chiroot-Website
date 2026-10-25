(function() {
    "use strict";
    if (window.MelissaCore) return;
    var SESSION_KEY = "chiroot_auth_v1";
    var PKCE_KEY = "chiroot_pkce_v1";
    function resolveConfig() {
        var cfg = window.CHIROOT_CONFIG || {};
        var url = cfg.SUPABASE_URL || typeof window.SUPABASE_URL === "string" && window.SUPABASE_URL || "https://astuagdezahmuuwjoghf.supabase.co";
        var key = cfg.SUPABASE_ANON_KEY || typeof window.SUPABASE_PUBLISHABLE_KEY === "string" && window.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_NXhR-MquEMwYDrCBPAOgAQ_MZ4BXQlT";
        return {
            url: String(url).replace(/\/+$/, ""),
            key: String(key).trim()
        };
    }
    var CONFIG = resolveConfig();
    function expireMs(value, fallbackMs) {
        var n = Number(value);
        if (isFinite(n) && n > 0) {
            if (n < 1e12) n *= 1e3;
            return n;
        }
        return fallbackMs;
    }
    function validateSessionShape(raw) {
        if (!raw || typeof raw !== "object") return null;
        var user = raw.user;
        if (!user || typeof user !== "object") return null;
        if (typeof user.id !== "string" || !user.id) return null;
        if (typeof raw.access_token !== "string" || !raw.access_token) return null;
        if (typeof raw.refresh_token !== "string" || !raw.refresh_token) return null;
        var exp = expireMs(raw.expires_at, 0);
        if (exp <= 0) return null;
        return {
            access_token: raw.access_token,
            refresh_token: raw.refresh_token,
            expires_at: exp,
            user: {
                id: user.id,
                email: typeof user.email === "string" ? user.email : ""
            }
        };
    }
    function readStoredSession() {
        try {
            var raw = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
            var s = validateSessionShape(raw);
            if (s && s.expires_at - Date.now() > 5e3) return s;
        } catch (e) {}
        return null;
    }
    var session = readStoredSession();
    function syncSession() {
        if (window.ChirootAuth && window.ChirootAuth.session) {
            var cs = validateSessionShape(window.ChirootAuth.session);
            if (cs) {
                session = cs;
                return session;
            }
        }
        var stored = readStoredSession();
        if (stored) {
            session = stored;
            return session;
        }
        if (window.ChirootAuth && window.ChirootAuth._settled && !window.ChirootAuth.session) {
            session = null;
        }
        return session;
    }
    var refreshPromise = null;
    function saveSession(s) {
        var valid = validateSessionShape(s);
        if (valid) {
            try {
                localStorage.setItem(SESSION_KEY, JSON.stringify(valid));
            } catch (e) {}
            if (window.ChirootAuth && (!window.ChirootAuth.session || window.ChirootAuth.session.user && window.ChirootAuth.session.user.id === valid.user.id)) {
                window.ChirootAuth.session = valid;
            }
        }
        return valid;
    }
    function clearSession() {
        try {
            localStorage.removeItem(SESSION_KEY);
        } catch (e) {}
        session = null;
    }
    function ensureFreshToken(force) {
        syncSession();
        if (!session) return Promise.reject(new Error("Belum login."));
        if (!force && session.expires_at - Date.now() > 6e4) return Promise.resolve(session);
        if (window.ChirootAuth && window.ChirootAuth.session && typeof window.caEnsureFreshToken === "function") {
            return window.caEnsureFreshToken(!!force).then(function(updated) {
                var valid = validateSessionShape(updated);
                if (valid) session = valid;
                return session;
            });
        }
        if (refreshPromise) return refreshPromise;
        refreshPromise = fetch(CONFIG.url + "/auth/v1/token?grant_type=refresh_token", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: CONFIG.key
            },
            body: JSON.stringify({
                refresh_token: session.refresh_token
            })
        }).then(function(res) {
            return res.json().then(function(data) {
                if (!res.ok || !data || typeof data.access_token !== "string") {
                    throw new Error(data && (data.msg || data.message) || "Sesi habis.");
                }
                session = saveSession({
                    access_token: data.access_token,
                    refresh_token: typeof data.refresh_token === "string" && data.refresh_token ? data.refresh_token : session.refresh_token,
                    expires_at: expireMs(data.expires_at, Date.now() + (Number(data.expires_in) || 3600) * 1e3),
                    user: data.user && typeof data.user.id === "string" && data.user.id === session.user.id ? {
                        id: data.user.id,
                        email: data.user.email || session.user.email
                    } : session.user
                });
                return session;
            });
        }).finally(function() {
            refreshPromise = null;
        });
        return refreshPromise;
    }
    function apiFetch(path, options, retried) {
        options = options || {};
        syncSession();
        function doRequest(token) {
            var headers = Object.assign({}, options.headers || {});
            headers.apikey = CONFIG.key;
            if (token) headers.Authorization = "Bearer " + token;
            return fetch(CONFIG.url + path, Object.assign({}, options, {
                headers: headers
            }));
        }
        if (!session) return doRequest(null);
        return ensureFreshToken(false).then(function(sess) {
            return doRequest(sess.access_token);
        }).then(function(res) {
            if (res.status === 401 && !retried) {
                return ensureFreshToken(true).then(function(sess2) {
                    return doRequest(sess2.access_token);
                });
            }
            return res;
        });
    }
    function errorFrom(data, fallback) {
        if (data && typeof data === "object") {
            var msg = data.error_description || data.msg || data.message || data.error;
            if (typeof msg === "string" && msg.trim()) return msg;
            if (Array.isArray(data) && data[0] && typeof data[0].message === "string") {
                return data[0].message;
            }
        }
        if (typeof data === "string" && data.trim()) return data;
        return fallback;
    }
    function apiCall(path, method, body) {
        var headers = {};
        if (body !== undefined) {
            headers["Content-Type"] = "application/json";
            headers.Prefer = "return=representation";
        }
        return apiFetch(path, {
            method: method || "GET",
            headers: headers,
            body: body === undefined ? undefined : JSON.stringify(body)
        }).then(function(res) {
            return res.text().then(function(text) {
                var data = null;
                if (text) {
                    try {
                        data = JSON.parse(text);
                    } catch (e) {
                        data = null;
                    }
                }
                if (!res.ok) {
                    var err = new Error(errorFrom(data, "HTTP " + res.status));
                    err.status = res.status;
                    err.data = data;
                    throw err;
                }
                return data;
            });
        });
    }
    function rpc(name, args) {
        return apiCall("/rest/v1/rpc/" + name, "POST", args || {});
    }
    function b64url(bytes) {
        var out = "";
        for (var i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
        return btoa(out).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    function pkcePair() {
        var bytes = new Uint8Array(48);
        crypto.getRandomValues(bytes);
        var verifier = b64url(bytes);
        return crypto.subtle.digest("SHA-256", (new TextEncoder).encode(verifier)).then(function(digest) {
            return {
                verifier: verifier,
                challenge: b64url(new Uint8Array(digest))
            };
        });
    }
    function redirectUrlFor(pageName) {
        try {
            var u = new URL(window.location.href);
            var parts = u.pathname.split("/");
            parts[parts.length - 1] = pageName;
            u.pathname = parts.join("/");
            u.search = "";
            u.hash = "";
            return u.toString();
        } catch (e) {
            return window.location.origin + "/" + pageName;
        }
    }
    function loginWithGoogle(redirectPage) {
        return pkcePair().then(function(pair) {
            try {
                sessionStorage.setItem(PKCE_KEY, pair.verifier);
            } catch (e) {}
            try {
                localStorage.setItem(PKCE_KEY + "_backup", pair.verifier);
            } catch (e) {}
            var params = new URLSearchParams;
            params.set("provider", "google");
            params.set("code_challenge", pair.challenge);
            params.set("code_challenge_method", "S256");
            params.set("redirect_to", redirectUrlFor(redirectPage || "Main.html"));
            window.location.assign(CONFIG.url + "/auth/v1/authorize?" + params.toString());
        });
    }
    function loginWithGooglePopup(redirectPage) {
        var proto = window.location.protocol;
        var okProto = proto === "https:" || proto === "http:" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
        if (!okProto) {
            return Promise.reject(new Error("Login Google membutuhkan alamat HTTPS atau localhost."));
        }
        var w = 500, h = 640;
        var left = Math.max(0, Math.round((window.screenX || 0) + ((window.outerWidth || 800) - w) / 2));
        var top = Math.max(0, Math.round((window.screenY || 0) + ((window.outerHeight || 700) - h) / 2));
        var popup = null;
        try {
            popup = window.open("about:blank", "chiroot_google_oauth", "popup=yes,width=" + w + ",height=" + h + ",left=" + left + ",top=" + top);
            if (popup && popup.document) {
                popup.document.write("<!DOCTYPE html><html><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Login Google — Melissa Shop</title></head><body style='margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#0B080D;color:#FFE6A4;font-family:Georgia,serif;text-align:center;padding:20px'><div><div style='font-size:34px;margin-bottom:10px'>🎃</div><div>Menghubungkan ke Google…</div></div></body></html>");
                popup.document.close();
            }
        } catch (e) {
            popup = null;
        }
        if (!popup) {
            try {
                localStorage.setItem("melissa_reopen_shop", "1");
                localStorage.removeItem("chiroot_oauth_popup_ts");
            } catch (e) {}
            return loginWithGoogle(redirectPage);
        }
        return new Promise(function(resolve, reject) {
            var settled = false;
            var pollTimer = null;
            var bc = null;
            function cleanup() {
                clearInterval(pollTimer);
                window.removeEventListener("storage", onStorage);
                window.removeEventListener("message", onMessage);
                if (bc) {
                    try { bc.close(); } catch (e) {}
                }
            }
            function finishOk() {
                if (settled) return;
                var s = syncSession();
                if (!s) return;
                settled = true;
                cleanup();
                try { localStorage.removeItem("chiroot_oauth_popup_ts"); } catch (e) {}
                document.dispatchEvent(new CustomEvent("chiroot:live-login", { detail: { session: s } }));
                resolve(s);
            }
            function onStorage(e) {
                if (e.key === SESSION_KEY || e.key === "chiroot_oauth_done") {
                    syncSession();
                    if (isAuthed()) finishOk();
                }
            }
            function onMessage(e) {
                if (e.origin === window.location.origin && e.data && e.data.type === "chiroot:oauth-complete") {
                    syncSession();
                    if (isAuthed()) finishOk();
                }
            }
            window.addEventListener("storage", onStorage);
            window.addEventListener("message", onMessage);
            if (typeof BroadcastChannel === "function") {
                try {
                    bc = new BroadcastChannel("chiroot_oauth_bc");
                    bc.onmessage = function(ev) {
                        if (ev && ev.data && ev.data.type === "chiroot:oauth-complete") {
                            syncSession();
                            if (isAuthed()) finishOk();
                        }
                    };
                } catch (e) {}
            }
            pkcePair().then(function(pair) {
                try {
                    sessionStorage.setItem(PKCE_KEY, pair.verifier);
                } catch (e) {}
                try {
                    localStorage.setItem(PKCE_KEY + "_backup", pair.verifier);
                    localStorage.setItem("chiroot_oauth_popup_ts", String(Date.now()));
                } catch (e) {}
                var params = new URLSearchParams;
                params.set("provider", "google");
                params.set("code_challenge", pair.challenge);
                params.set("code_challenge_method", "S256");
                params.set("redirect_to", redirectUrlFor(redirectPage || "Main.html"));
                popup.location.replace(CONFIG.url + "/auth/v1/authorize?" + params.toString());
                var closedTicks = 0;
                pollTimer = setInterval(function() {
                    var s = readStoredSession();
                    if (s) {
                        session = s;
                        finishOk();
                        return;
                    }
                    var isClosed = false;
                    try { isClosed = !popup || popup.closed; } catch (e) { isClosed = false; }
                    if (isClosed) {
                        closedTicks++;
                        if (closedTicks >= 4 && !settled) {
                            settled = true;
                            cleanup();
                            try { localStorage.removeItem("chiroot_oauth_popup_ts"); } catch (e) {}
                            reject(new Error("POPUP_CLOSED"));
                        }
                    } else {
                        closedTicks = 0;
                    }
                }, 400);
            }).catch(function(err) {
                settled = true;
                cleanup();
                try { if (popup && !popup.closed) popup.close(); } catch (e) {}
                reject(err);
            });
        });
    }
    function exchangeCodeIfPresent() {
        var code = new URLSearchParams(window.location.search).get("code");
        if (!code) return Promise.resolve(null);
        var verifier = null;
        try {
            verifier = sessionStorage.getItem(PKCE_KEY) || localStorage.getItem(PKCE_KEY + "_backup");
        } catch (e) {}
        if (!verifier) return Promise.resolve(null);
        return fetch(CONFIG.url + "/auth/v1/token?grant_type=pkce", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: CONFIG.key
            },
            body: JSON.stringify({
                auth_code: code,
                code_verifier: verifier
            })
        }).then(function(res) {
            return res.json().then(function(data) {
                if (!res.ok || !data || typeof data.access_token !== "string") {
                    throw new Error(errorFrom(data, "Gagal menukar kode login."));
                }
                session = saveSession({
                    access_token: data.access_token,
                    refresh_token: data.refresh_token,
                    expires_at: expireMs(data.expires_at, Date.now() + (Number(data.expires_in) || 3600) * 1e3),
                    user: data.user ? {
                        id: String(data.user.id),
                        email: data.user.email || ""
                    } : {
                        id: "",
                        email: ""
                    }
                });
                try {
                    sessionStorage.removeItem(PKCE_KEY);
                    localStorage.removeItem(PKCE_KEY + "_backup");
                } catch (e) {}
                try {
                    var clean = new URL(window.location.href);
                    clean.searchParams.delete("code");
                    window.history.replaceState({}, document.title, clean.toString());
                } catch (e) {}
                return session;
            });
        });
    }
    function esc(value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, function(c) {
            return {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            }[c];
        });
    }
    function isAuthed() {
        var s = syncSession();
        return !!(s && s.user && s.user.id);
    }
    window.addEventListener("storage", function(e) {
        if (e.key === SESSION_KEY) syncSession();
    });
    var BORDER_META = [
        { key: "pfp_border_01", name: "Pumpkin & Ribbon Border #01", desc: "Bingkai profil Halloween edisi kelelawar ungu, pita hitam, dan labu berkilau." },
        { key: "pfp_border_02", name: "Phantom Violet Border #02", desc: "Bingkai duri ungu menyala dengan hantu imut dan pita Halloween." },
        { key: "pfp_border_03", name: "Inferno Bat Border #03", desc: "Bingkai bara api oranye gothic dengan kelelawar malam dan peti mati." },
        { key: "pfp_border_04", name: "Witch Lantern Border #04", desc: "Bingkai topi penyihir ungu mistis dengan lentera menyala dan roh kecil." },
        { key: "pfp_border_05", name: "Crescent Moon Border #05", desc: "Bingkai bulan sabit keemasan dengan kelelawar dan hantu pembawa lilin." },
        { key: "pfp_border_06", name: "Shadow Chain Border #06", desc: "Bingkai aura petir ungu gelap dengan kelelawar malam dan rantai gothic." },
        { key: "pfp_border_07", name: "Blazing Jack Border #07", desc: "Bingkai pita hitam malam dengan kelelawar dan Jack-o'-Lantern membara." },
        { key: "pfp_border_08", name: "Spiderweb Lantern Border #08", desc: "Bingkai jaring laba-laba bercahaya, pita labu ungu, dan lentera klasik." },
        { key: "pfp_border_09", name: "Mystic Ghost Border #09", desc: "Bingkai api ungu-oranye dengan kelelawar dan hantu kecil ramah." },
        { key: "pfp_border_10", name: "Gothic Rose Border #10", desc: "Bingkai mawar ungu gelap, labu Halloween, kelelawar, dan lentera gantung." }
    ];
    function getBorderMap() {
        if (typeof PFP_BORDERS !== "undefined" && PFP_BORDERS) return PFP_BORDERS;
        if (window.PFP_BORDERS) return window.PFP_BORDERS;
        return {};
    }
    function resolveBorderKey(input) {
        if (!input) return "";
        if (typeof input === "string") {
            var direct = input.trim();
            if (/^pfp_border_\d{2}$/.test(direct)) return direct;
            var m = direct.match(/pfp_border_(\d{1,2})/i);
            if (m) return "pfp_border_" + String(Number(m[1])).padStart(2, "0");
            var mNum = direct.match(/border\s*#?(\d{1,2})\b/i);
            if (mNum) {
                var k = "pfp_border_" + String(Number(mNum[1])).padStart(2, "0");
                if (BORDER_META.some(function(x) { return x.key === k; })) return k;
            }
            return "";
        }
        if (typeof input === "object") {
            return resolveBorderKey(input.border_key) || resolveBorderKey(input.image_url) || resolveBorderKey(input.name);
        }
        return "";
    }
    function getBorderSrc(keyOrObj) {
        var key = resolveBorderKey(keyOrObj);
        if (!key) return "";
        var map = getBorderMap();
        return typeof map[key] === "string" ? map[key] : "";
    }
    function getCatalog() {
        var map = getBorderMap();
        return BORDER_META.filter(function(item) {
            return !Object.keys(map).length || !!map[item.key];
        }).map(function(item) {
            return {
                key: item.key,
                name: item.name,
                description: item.desc,
                price: 30,
                category: "PFP Border",
                image_marker: CONFIG.url + "/pfp/" + item.key + ".png",
                src: map[item.key] || ""
            };
        });
    }
    function currentUserId(explicitUid) {
        if (explicitUid) return String(explicitUid);
        var s = syncSession();
        return s && s.user && s.user.id ? String(s.user.id) : "";
    }
    function getOwnedMap(explicitUid) {
        var uid = currentUserId(explicitUid);
        if (!uid) return {};
        try {
            var raw = JSON.parse(localStorage.getItem("chiroot_owned_borders_" + uid) || "{}");
            return raw && typeof raw === "object" ? raw : {};
        } catch (e) {
            return {};
        }
    }
    function markOwned(keys, explicitUid) {
        var uid = currentUserId(explicitUid);
        if (!uid || !Array.isArray(keys)) return {};
        var owned = getOwnedMap(uid);
        var changed = false;
        keys.forEach(function(k) {
            var rk = resolveBorderKey(k);
            if (rk && !owned[rk]) {
                owned[rk] = true;
                changed = true;
            }
        });
        if (changed) {
            try {
                localStorage.setItem("chiroot_owned_borders_" + uid, JSON.stringify(owned));
            } catch (e) {}
            document.dispatchEvent(new CustomEvent("chiroot:borders-updated", {
                detail: { userId: uid, owned: owned }
            }));
        }
        return owned;
    }
    function isOwned(key, explicitUid) {
        var rk = resolveBorderKey(key);
        if (!rk) return false;
        return !!getOwnedMap(explicitUid)[rk];
    }
    function getEquipped(explicitUid) {
        var uid = currentUserId(explicitUid);
        if (!uid) return "";
        try {
            var k = resolveBorderKey(localStorage.getItem("chiroot_equipped_border_" + uid) || "");
            if (k && getOwnedMap(uid)[k]) return k;
            return "";
        } catch (e) {
            return "";
        }
    }
    function setEquipped(key, explicitUid) {
        var uid = currentUserId(explicitUid);
        if (!uid) return "";
        var rk = key ? resolveBorderKey(key) : "";
        if (rk && !getOwnedMap(uid)[rk]) return getEquipped(uid);
        try {
            if (rk) localStorage.setItem("chiroot_equipped_border_" + uid, rk);
            else localStorage.removeItem("chiroot_equipped_border_" + uid);
        } catch (e) {}
        document.dispatchEvent(new CustomEvent("chiroot:border-equipped", {
            detail: { userId: uid, borderKey: rk, src: rk ? getBorderSrc(rk) : "" }
        }));
        return rk;
    }
    window.ChirootBorders = {
        PRICE: 30,
        getCatalog: getCatalog,
        resolveKey: resolveBorderKey,
        getSrc: getBorderSrc,
        getOwnedMap: getOwnedMap,
        markOwned: markOwned,
        isOwned: isOwned,
        getEquipped: getEquipped,
        setEquipped: setEquipped
    };
    window.MelissaCore = {
        config: CONFIG,
        isAuthed: isAuthed,
        getSession: function() {
            return syncSession();
        },
        onSessionChange: null,
        exchangeCodeIfPresent: exchangeCodeIfPresent,
        loginWithGoogle: loginWithGoogle,
        loginWithGooglePopup: loginWithGooglePopup,
        clearSession: clearSession,
        ensureFreshToken: ensureFreshToken,
        apiCall: apiCall,
        rpc: rpc,
        esc: esc
    };
})();
