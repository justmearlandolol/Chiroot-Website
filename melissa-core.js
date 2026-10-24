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
    var refreshPromise = null;
    function saveSession(s) {
        var valid = validateSessionShape(s);
        if (valid) {
            try {
                localStorage.setItem(SESSION_KEY, JSON.stringify(valid));
            } catch (e) {}
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
        if (!session) return Promise.reject(new Error("Belum login."));
        if (!force && session.expires_at - Date.now() > 6e4) return Promise.resolve(session);
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
        return crypto.subtle.digest("SHA-256", (new TextEncoder).encode(b64url(bytes))).then(function(digest) {
            return {
                verifier: b64url(bytes),
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
        return !!(session && session.user && session.user.id);
    }
    window.MelissaCore = {
        config: CONFIG,
        isAuthed: isAuthed,
        getSession: function() {
            return session;
        },
        onSessionChange: null,
        exchangeCodeIfPresent: exchangeCodeIfPresent,
        loginWithGoogle: loginWithGoogle,
        clearSession: clearSession,
        ensureFreshToken: ensureFreshToken,
        apiCall: apiCall,
        rpc: rpc,
        esc: esc
    };
})();
