(function(global) {
    "use strict";
    function createMelissaRewardEngine(deps) {
        var audio = deps.audio, clock = deps.clock || Date.now, generation = 0;
        function fresh() {
            return {
                sessionId: null,
                trackId: null,
                duration: 0,
                accumulated: 0,
                lastPosition: 0,
                lastAt: clock(),
                lastReportAt: clock(),
                invalid: false,
                claimed: false,
                claiming: false,
                opening: false,
                queue: Promise.resolve()
            };
        }
        var st = fresh();
        function trackId() {
            var t = deps.getCurrentTrack();
            return t && t.id != null ? String(t.id) : null;
        }
        function invalidate(reason) {
            if (!st.invalid) {
                st.invalid = true;
                if (deps.onInvalid) deps.onInvalid(reason);
            }
        }
        function reset() {
            generation++;
            st = fresh();
        }
        function report(event, extra) {
            var s = st;
            if (!s.sessionId) return Promise.resolve(null);
            var args = Object.assign({
                p_session_id: s.sessionId,
                p_position_seconds: Math.round((audio.currentTime || 0) * 100) / 100,
                p_accumulated_seconds: Math.round(s.accumulated * 100) / 100,
                p_event: event
            }, extra || {});
            s.queue = s.queue.then(function() {
                return deps.rpc("record_playback_progress", args);
            }).then(function(r) {
                if (s === st && r && r.ok === false) invalidate(r.reason || event);
                return r;
            }).catch(function() {
                if (s === st) invalidate("progress_failed");
                return null;
            });
            return s.queue;
        }
        function handlePlay() {
            var id = trackId();
            if (!id || !deps.isAuthed()) return;
            if (st.trackId !== id || st.claimed) reset();
            if (!st.trackId) {
                st.trackId = id;
                st.lastPosition = audio.currentTime || 0;
                st.lastAt = clock();
                if (st.lastPosition > .5) invalidate("not_from_start");
            }
            if (audio.playbackRate > 1.001) invalidate("playback_speed");
            if (st.sessionId || st.opening || !(isFinite(audio.duration) && audio.duration > 0 && audio.duration <= 86400)) return;
            var s = st, token = generation;
            s.duration = audio.duration;
            s.opening = true;
            return deps.rpc("open_playback_session", {
                p_track_id: id,
                p_duration_seconds: Math.round(s.duration * 100) / 100
            }).then(function(sessionId) {
                if (token === generation && s === st && trackId() === id) s.sessionId = sessionId;
            }).catch(function() {
                if (s === st) invalidate("session_failed");
            }).then(function() {
                s.opening = false;
            });
        }
        function handleTimeUpdate() {
            if (!st.trackId || st.invalid || audio.seeking) return;
            if (trackId() !== st.trackId) {
                reset();
                return;
            }
            var now = clock(), pos = audio.currentTime || 0, delta = pos - st.lastPosition;
            var elapsed = Math.max(0, (now - st.lastAt) / 1e3);
            if (audio.playbackRate > 1.001) invalidate("playback_speed");
            if (delta > elapsed + .75) invalidate("forward_seek");
            if (delta > 0 && !st.invalid) st.accumulated = Math.min(st.duration || audio.duration, st.accumulated + Math.min(delta, elapsed + .05));
            st.lastPosition = pos;
            st.lastAt = now;
            if (now - st.lastReportAt >= 5e3) {
                st.lastReportAt = now;
                report("progress");
            }
        }
        function handleSeeking() {
            if (st.trackId && audio.currentTime - st.lastPosition > .5) invalidate("forward_seek");
        }
        function handleSeeked() {
            var from = st.lastPosition, to = audio.currentTime || 0;
            if (to - from > .5) invalidate("forward_seek");
            report("seek", {
                p_seek_from: from,
                p_seek_to: to
            });
            st.lastPosition = to;
            st.lastAt = clock();
        }
        function handleRateChange() {
            if (st.trackId && audio.playbackRate > 1.001) invalidate("playback_speed");
        }
        function handlePause() {
            handleTimeUpdate();
            report("pause");
            st.lastAt = clock();
        }
        function handleEnded() {
            handleTimeUpdate();
            var s = st;
            if (!audio.ended || !s.sessionId || s.invalid || s.claimed || s.claiming || trackId() !== s.trackId || audio.currentTime < s.duration - .5 || s.accumulated < s.duration - Math.min(.75, s.duration * .01)) return Promise.resolve(null);
            s.claiming = true;
            return report("completed").then(function(progress) {
                if (!progress || s !== st || s.invalid) return null;
                return deps.rpc("claim_track_reward", {
                    playback_session_id: s.sessionId
                });
            }).then(function(result) {
                if (result && result.ok === true) {
                    s.claimed = true;
                    if (!result.duplicate && deps.onReward) deps.onReward(result);
                }
                return result;
            }).catch(function() {
                return null;
            }).then(function(r) {
                s.claiming = false;
                return r;
            });
        }
        function handleLoadedMetadata() {
            if (!audio.paused) handlePlay();
        }
        var handlers = {
            loadedmetadata: handleLoadedMetadata,
            play: function() {
                st.lastAt = clock();
                return handlePlay();
            },
            playing: function() {
                st.lastAt = clock();
                handlePlay();
            },
            timeupdate: handleTimeUpdate,
            seeking: handleSeeking,
            seeked: handleSeeked,
            ratechange: handleRateChange,
            pause: handlePause,
            ended: handleEnded,
            emptied: reset
        };
        function unload() {
            report("pause");
        }
        return {
            attach: function() {
                if (!audio || audio.__melissaRewardsAttached) return;
                audio.__melissaRewardsAttached = true;
                Object.keys(handlers).forEach(function(e) {
                    audio.addEventListener(e, handlers[e]);
                });
                global.addEventListener("beforeunload", unload);
                if (!audio.paused) handlePlay();
            },
            detach: function() {
                if (!audio) return;
                Object.keys(handlers).forEach(function(e) {
                    audio.removeEventListener(e, handlers[e]);
                });
                global.removeEventListener("beforeunload", unload);
                delete audio.__melissaRewardsAttached;
                reset();
            },
            _state: function() {
                return st;
            },
            _handlers: handlers
        };
    }
    global.MelissaRewardFactory = createMelissaRewardEngine;
    if (typeof module !== "undefined" && module.exports) module.exports = {
        createMelissaRewardEngine: createMelissaRewardEngine
    };
    if (typeof document !== "undefined") {
        function boot() {
            var audio = document.getElementById("audio");
            if (!audio || !global.MelissaCore) return;
            var engine = createMelissaRewardEngine({
                audio: audio,
                getCurrentTrack: function() {
                    try {
                        return typeof tracks !== "undefined" && typeof currentIndex === "number" ? tracks[currentIndex] : null;
                    } catch (e) {
                        return null;
                    }
                },
                isAuthed: function() {
                    return global.ChirootAuth && typeof global.ChirootAuth.isAuthed === "function" ? global.ChirootAuth.isAuthed() : global.MelissaCore.isAuthed();
                },
                rpc: function(name, args) {
                    return global.ChirootAuth && global.ChirootAuth.session && typeof caApiCall === "function" ? caApiCall("/rest/v1/rpc/" + name, "POST", args) : global.MelissaCore.rpc(name, args);
                },
                onReward: function(result) {
                    document.dispatchEvent(new CustomEvent("melissa:reward", {
                        detail: result
                    }));
                },
                onInvalid: function(reason) {
                    document.dispatchEvent(new CustomEvent("melissa:reward-invalid", {
                        detail: {
                            reason: reason
                        }
                    }));
                }
            });
            engine.attach();
            global.MelissaRewards = engine;
        }
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
    }
})(typeof window !== "undefined" ? window : globalThis);
