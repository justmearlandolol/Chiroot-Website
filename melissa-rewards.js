(function (global) {
  'use strict';

  var PROGRESS_INTERVAL_MS = 5000;
  var MAX_POSITION_DELTA = 3.0; // lompatan posisi wajar per tick (detik)
  var SEEK_TOLERANCE = 2.0;
  var END_TOLERANCE = 3.0;

  function createMelissaRewardEngine(deps) {
    deps = deps || {};
    var audio = deps.audio;
    var getCurrentTrack = deps.getCurrentTrack || function () { return null; };
    var rpc = deps.rpc || function () { return Promise.reject(new Error('no rpc')); };
    var isAuthed = deps.isAuthed || function () { return false; };
    var onReward = deps.onReward || function () {};
    var onInvalid = deps.onInvalid || function () {};
    var clock = deps.clock || function () { return Date.now(); };

    var st = freshState();

    function freshState() {
      return {
        sessionId: null,
        trackId: null,
        duration: 0,
        accumulated: 0,
        lastPosition: 0,
        lastReportAt: 0,
        claimed: false,
        invalid: false,
        opening: false
      };
    }

    function currentTrackId() {
      var t = getCurrentTrack();
      return t && t.id != null ? String(t.id) : null;
    }

    function validDuration() {
      return !!(audio && isFinite(audio.duration) && audio.duration > 0 && audio.duration <= 86400);
    }

    function abandon(reason) {
      // Sesi lama ditinggalkan (ganti lagu / reload sumber). Tanpa klaim,
      // baris terbuka di server tidak akan pernah memenuhi syarat reward.
      st = freshState();
      return reason;
    }

    function ensureSession() {
      var trackId = currentTrackId();
      if (!trackId || !isAuthed() || st.opening) return Promise.resolve(null);
      if (st.sessionId && st.trackId === trackId) return Promise.resolve(st.sessionId);
      if (!validDuration()) return Promise.resolve(null);

      st.opening = true;
      var duration = audio.duration;
      return rpc('open_playback_session', {
        p_track_id: trackId,
        p_duration_seconds: Math.round(duration * 100) / 100
      })
        .then(function (id) {
          st.sessionId = id;
          st.trackId = trackId;
          st.duration = duration;
          st.accumulated = 0;
          st.lastPosition = audio.currentTime || 0;
          st.lastReportAt = clock();
          st.claimed = false;
          st.invalid = false;
          return id;
        })
        .catch(function (err) {
          // Kegagalan membuka sesi tidak boleh mengganggu pemutaran.
          if (deps.debug) console.warn('[MelissaRewards] open session gagal:', err && err.message);
          return null;
        })
        .then(function (id) {
          st.opening = false;
          return id;
        });
    }

    function report(eventName, extra) {
      if (!st.sessionId || st.invalid) return Promise.resolve(null);
      var args = {
        p_session_id: st.sessionId,
        p_position_seconds: Math.round((audio.currentTime || 0) * 100) / 100,
        p_accumulated_seconds: Math.round(st.accumulated * 100) / 100,
        p_event: eventName
      };
      if (extra) {
        if (extra.seekFrom != null) args.p_seek_from = extra.seekFrom;
        if (extra.seekTo != null) args.p_seek_to = extra.seekTo;
      }
      return rpc('record_playback_progress', args)
        .then(function (res) {
          if (res && res.ok === false) {
            st.invalid = true;
            onInvalid(res.reason || eventName);
          }
          return res;
        })
        .catch(function (err) {
          if (deps.debug) console.warn('[MelissaRewards] progress gagal:', err && err.message);
          return null;
        });
    }

    // --- Event handlers -------------------------------------------------
    function handleLoadedMetadata() {
      var trackId = currentTrackId();
      if (!trackId) return;
      if (st.trackId && st.trackId !== trackId) abandon('track-changed');
      if (validDuration() && (!st.duration || st.trackId !== trackId)) {
        st.duration = audio.duration;
      }
    }

    function handlePlay() {
      var trackId = currentTrackId();
      if (!trackId) return;
      if (st.trackId && st.trackId !== trackId) abandon('track-changed');
      if (!st.sessionId || st.trackId !== trackId) {
        ensureSession();
      }
      st.lastPosition = audio.currentTime || 0;
    }

    function handleTimeUpdate() {
      if (!st.sessionId || audio.paused || st.invalid) return;
      var pos = audio.currentTime || 0;
      var delta = pos - st.lastPosition;

      // Akumulasi hanya dari kemajuan posisi yang wajar (anti lompatan).
      if (delta > 0 && delta <= MAX_POSITION_DELTA) {
        st.accumulated = Math.min(st.accumulated + delta, st.duration || pos);
      }
      st.lastPosition = pos;

      var now = clock();
      if (now - st.lastReportAt >= PROGRESS_INTERVAL_MS) {
        st.lastReportAt = now;
        report('progress');
      }
    }

    function handleSeeked() {
      var from = st.lastPosition;
      var to = audio.currentTime || 0;
      st.lastPosition = to;
      if (!st.sessionId) return;

      // Cermin aturan server: seek maju melewati bagian yang belum
      // terdengar membatalkan kelayakan reward (server tetap otoritas).
      if (to - from > SEEK_TOLERANCE && st.accumulated < to * 0.9) {
        st.invalid = true;
        onInvalid('forward_seek');
      }
      report('seek', { seekFrom: Math.round(from * 100) / 100, seekTo: Math.round(to * 100) / 100 });
    }

    function handlePause() {
      if (!st.sessionId) return;
      st.lastPosition = audio.currentTime || 0;
      report('pause');
    }

    function handleEnded() {
      if (!st.sessionId || st.claimed || st.invalid) return Promise.resolve(null);
      var duration = st.duration || audio.duration || 0;
      var pos = audio.currentTime || 0;

      // Hanya akhir alami: elemen benar-benar ended dan posisi di ujung.
      if (!audio.ended || !duration || pos < duration - END_TOLERANCE) {
        return Promise.resolve(null);
      }
      st.accumulated = Math.max(st.accumulated, pos);

      return report('completed')
        .then(function () {
          if (st.invalid) return null;
          return rpc('claim_track_reward', { playback_session_id: st.sessionId });
        })
        .then(function (result) {
          if (!result || result.ok !== true) return null;
          st.claimed = true;
          if (!result.duplicate) onReward(result); // sukses baru -> notifikasi
          return result;
        })
        .catch(function (err) {
          if (deps.debug) console.warn('[MelissaRewards] klaim ditolak:', err && err.message);
          return null;
        });
    }

    function handleEmptied() {
      if (st.sessionId) abandon('source-emptied');
    }

    function flushBeforeUnload() {
      if (st.sessionId && !audio.paused) {
        try {
          report('pause');
        } catch (e) {}
      }
    }

    function attach() {
      if (!audio || audio.__melissaRewardsAttached) return;
      audio.__melissaRewardsAttached = true;
      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('play', handlePlay);
      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('seeked', handleSeeked);
      audio.addEventListener('pause', handlePause);
      audio.addEventListener('ended', handleEnded);
      audio.addEventListener('emptied', handleEmptied);
      global.addEventListener('beforeunload', flushBeforeUnload);
    }

    function detach() {
      if (!audio) return;
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('seeked', handleSeeked);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('emptied', handleEmptied);
      global.removeEventListener('beforeunload', flushBeforeUnload);
      delete audio.__melissaRewardsAttached;
    }

    return {
      attach: attach,
      detach: detach,
      // Diekspos untuk pengujian & inspeksi
      _state: function () { return st; },
      _handlers: {
        play: handlePlay,
        timeupdate: handleTimeUpdate,
        seeked: handleSeeked,
        pause: handlePause,
        ended: handleEnded,
        emptied: handleEmptied,
        loadedmetadata: handleLoadedMetadata
      }
    };
  }

  global.MelissaRewardFactory = createMelissaRewardEngine;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createMelissaRewardEngine: createMelissaRewardEngine };
  }

  // --- Bootstrap DOM nyata (hanya di browser, di dalam Main.html) -------
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    function bootstrap() {
      var audio = document.getElementById('audio');
      if (!audio || !window.MelissaCore) return;

      function getCurrentTrack() {
        try {
          if (typeof tracks !== 'undefined' && Array.isArray(tracks) && typeof currentIndex === 'number') {
            return tracks[currentIndex] || null;
          }
        } catch (e) {}
        return null;
      }

      var engine = createMelissaRewardEngine({
        audio: audio,
        getCurrentTrack: getCurrentTrack,
        isAuthed: function () {
          try {
            if (window.ChirootAuth && typeof ChirootAuth.isAuthed === 'function') {
              return ChirootAuth.isAuthed();
            }
          } catch (e) {}
          return window.MelissaCore.isAuthed();
        },
        rpc: function (name, args) {
          // Utamakan helper Chiroot bila ada (memakai session yang sama),
          // jika tidak pakai MelissaCore.
          if (window.ChirootAuth && window.ChirootAuth.session && typeof caApiCall === 'function') {
            return caApiCall('/rest/v1/rpc/' + name, 'POST', args);
          }
          return window.MelissaCore.rpc(name, args);
        },
        onReward: function (result) {
          showCoinRewardToast(result);
          document.dispatchEvent(new CustomEvent('melissa:reward', { detail: result }));
        },
        onInvalid: function (reason) {
          document.dispatchEvent(new CustomEvent('melissa:reward-invalid', { detail: { reason: reason } }));
        }
      });
      engine.attach();
      window.MelissaRewards = engine;
    }

    function showCoinRewardToast(result) {
      var existing = document.getElementById('melissa-coin-toast');
      if (existing) existing.remove();

      var toast = document.createElement('div');
      toast.id = 'melissa-coin-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      toast.innerHTML =
        '<img src="assets/halloween-coin.png" alt="" class="mct-coin" width="26" height="26">' +
        '<span class="mct-text">+2 Halloween Coins</span>';
      document.body.appendChild(toast);

      requestAnimationFrame(function () {
        toast.classList.add('show');
      });
      clearTimeout(toast._hideTimer);
      toast._hideTimer = setTimeout(function () {
        toast.classList.remove('show');
        setTimeout(function () {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 450);
      }, 3200);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
      bootstrap();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
