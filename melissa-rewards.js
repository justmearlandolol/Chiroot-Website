(function(global) {
    "use strict";
    function extractSessionId(raw) {
        if (typeof raw === "string" && raw.trim()) return raw.trim();
        if (Array.isArray(raw) && raw.length) return extractSessionId(raw[0]);
        if (raw && typeof raw === "object") {
            var cand = raw.session_id || raw.playback_session_id || raw.id;
            if (typeof cand === "string" && cand.trim()) return cand.trim();
        }
        return null;
    }
    function createMelissaRewardEngine(deps) {
        var audio = deps.audio, clock = deps.clock || Date.now, generation = 0;
        function fresh() {
            var now = clock();
            return {
                sessionId: null,
                trackId: null,
                duration: 0,
                liveDuration: 0,
                accumulated: 0,
                serverAcc: 0,
                serverAt: now,
                lastPosition: 0,
                lastAt: now,
                lastReportAt: now,
                invalid: false,
                claimed: false,
                claiming: false,
                opening: false,
                openingPromise: null,
                queue: Promise.resolve()
            };
        }
        var st = fresh();
        function trackId() {
            var t = deps.getCurrentTrack();
            return t && t.id != null ? String(t.id) : null;
        }
        function isLooping() {
            if (audio && audio.loop) return true;
            if (typeof deps.isLooping === "function" && deps.isLooping()) return true;
            return false;
        }
        function invalidate(reason, target) {
            var s = target || st;
            if (!s.invalid && !s.claiming && !s.claimed) {
                s.invalid = true;
                if (s === st && deps.onInvalid) deps.onInvalid(reason);
            }
        }
        function reset() {
            generation++;
            st = fresh();
        }
        function safeClampPos(s, rawPos) {
            var dur = s.duration > 0 ? s.duration : s.liveDuration || rawPos || 0;
            var p = Math.max(0, Number(rawPos) || 0);
            if (dur > 0) p = Math.min(p, dur + 1.5);
            return Math.round(p * 100) / 100;
        }
        function safeClampAcc(s, desiredAcc) {
            var now = clock();
            var serverElapsed = Math.max(0, (now - s.serverAt) / 1e3);
            var maxAllowedByWall = s.serverAcc + serverElapsed + 1.5;
            var dur = s.duration > 0 ? s.duration : s.liveDuration || desiredAcc || 0;
            var acc = Math.max(s.serverAcc, Math.min(Number(desiredAcc) || 0, maxAllowedByWall));
            if (dur > 0) acc = Math.min(acc, dur);
            return Math.round(acc * 100) / 100;
        }
        function enqueueReport(s, event, extra, posOverride, accOverride) {
            if (!s.sessionId) return Promise.resolve(null);
            s.queue = s.queue.then(function() {
                if (!s.sessionId || s.invalid) return null;
                var posVal = safeClampPos(s, posOverride != null ? posOverride : audio.currentTime || 0);
                var accVal = safeClampAcc(s, accOverride != null ? accOverride : s.accumulated);
                var args = Object.assign({
                    p_session_id: s.sessionId,
                    p_position_seconds: posVal,
                    p_accumulated_seconds: accVal,
                    p_event: event
                }, extra || {});
                return deps.rpc("record_playback_progress", args).then(function(r) {
                    if (r && r.ok === false) {
                        invalidate(r.reason || r.status || event, s);
                    } else {
                        s.serverAcc = accVal;
                        s.serverAt = clock();
                    }
                    return r;
                });
            }).catch(function() {
                if (event !== "completed") invalidate("progress_failed", s);
                return null;
            });
            return s.queue;
        }
        function report(event, extra) {
            return enqueueReport(st, event, extra);
        }
        function handlePlay() {
            var id = trackId();
            if (!id || !deps.isAuthed()) return;
            var curPos = audio.currentTime || 0;
            if (st.trackId !== id || st.claimed || st.claiming || (st.invalid && curPos <= 1.2)) reset();
            if (isLooping()) {
                st.trackId = id;
                invalidate("loop_active");
                return;
            }
            if (!st.trackId) {
                st.trackId = id;
                st.lastPosition = curPos;
                st.lastAt = clock();
                if (st.lastPosition > 1.5) {
                    invalidate("not_from_start");
                    return;
                }
            }
            if (audio.playbackRate > 1.02) {
                invalidate("playback_speed");
                return;
            }
            if (st.invalid || st.sessionId || st.opening || !(isFinite(audio.duration) && audio.duration > 0 && audio.duration <= 86400)) return;
            var s = st, token = generation;
            s.duration = audio.duration;
            s.liveDuration = audio.duration;
            s.opening = true;
            s.openingPromise = deps.rpc("open_playback_session", {
                p_track_id: id,
                p_duration_seconds: Math.round(s.duration * 100) / 100
            }).then(function(res) {
                var sid = extractSessionId(res);
                if (sid && token === generation && s === st) {
                    s.sessionId = sid;
                    s.serverAcc = 0;
                    s.serverAt = clock();
                    s.lastReportAt = clock();
                } else if (!sid && s === st) {
                    invalidate("session_failed", s);
                }
            }).catch(function() {
                if (s === st) invalidate("session_failed", s);
            }).then(function() {
                s.opening = false;
            });
            return s.openingPromise;
        }
        function handleTimeUpdate() {
            var id = trackId();
            if (isLooping()) {
                if (st.trackId && !st.invalid) invalidate("loop_active");
                return;
            }
            if (!st.trackId || st.claimed || st.claiming) {
                if (!audio.paused && id && deps.isAuthed() && (audio.currentTime || 0) <= 1.5) {
                    handlePlay();
                }
                return;
            }
            if (st.invalid || audio.seeking) return;
            if (id && id !== st.trackId) {
                reset();
                if (!audio.paused && (audio.currentTime || 0) <= 1.5) handlePlay();
                return;
            }
            if (!st.sessionId && !st.opening && deps.isAuthed() && isFinite(audio.duration) && audio.duration > 0) {
                handlePlay();
            }
            var now = clock(), pos = audio.currentTime || 0, delta = pos - st.lastPosition;
            var elapsed = Math.max(0, (now - st.lastAt) / 1e3);
            if (isFinite(audio.duration) && audio.duration > 0) {
                st.liveDuration = audio.duration;
                if (!st.duration) st.duration = audio.duration;
            }
            if (audio.playbackRate > 1.02) invalidate("playback_speed");
            if (delta > Math.max(2.5, elapsed + 2)) invalidate("forward_seek");
            if (delta > 0 && !st.invalid) {
                var maxDur = st.duration > 0 ? st.duration : st.liveDuration || pos;
                var gain = Math.min(delta, Math.max(elapsed + .6, 1.2));
                var nextAcc = st.accumulated + gain;
                st.accumulated = maxDur > 0 ? Math.min(maxDur, nextAcc) : nextAcc;
            }
            st.lastPosition = pos;
            st.lastAt = now;
            if (st.sessionId && now - st.lastReportAt >= 1e4) {
                st.lastReportAt = now;
                report("progress");
            }
        }
        function handleSeeking() {
            if (!st.trackId || st.claiming) return;
            var to = audio.currentTime || 0;
            if (to <= 1.2) return;
            if (to - st.lastPosition > 2) invalidate("forward_seek");
        }
        function handleSeeked() {
            if (st.claiming) return;
            var from = st.lastPosition, to = audio.currentTime || 0;
            if (to <= 1.2) {
                reset();
                if (!audio.paused) handlePlay();
                return;
            }
            if (to - from > 2) invalidate("forward_seek");
            report("seek", {
                p_seek_from: Math.round(from * 100) / 100,
                p_seek_to: Math.round(to * 100) / 100
            });
            st.lastPosition = to;
            st.lastAt = clock();
        }
        function handleRateChange() {
            if (st.trackId && audio.playbackRate > 1.02) invalidate("playback_speed");
        }
        function handleDurationChange() {
            if (isFinite(audio.duration) && audio.duration > 0) {
                st.liveDuration = audio.duration;
                if (!st.duration) st.duration = audio.duration;
                if (!audio.paused && !st.sessionId && !st.opening) handlePlay();
            }
        }
        function handlePause() {
            if (audio.ended || st.claiming) return;
            handleTimeUpdate();
            report("pause");
            st.lastAt = clock();
        }
        function finalizeCurrentSession(forceEnded) {
            var s = st;
            if (isLooping() || !s.trackId || s.invalid || s.claimed || s.claiming) {
                if (isLooping() && s.trackId && !s.invalid) invalidate("loop_active", s);
                return Promise.resolve(null);
            }
            var now = clock();
            var liveDur = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : s.duration;
            var effectiveDur = s.duration > 0 && liveDur > 0 ? Math.min(s.duration, liveDur) : s.duration || liveDur;
            if (!(effectiveDur > 0)) return Promise.resolve(null);
            var isEnded = !!(forceEnded || audio.ended);
            var rawPos = audio.currentTime || 0;
            var elapsed = Math.max(0, (now - s.lastAt) / 1e3);
            if (isEnded && rawPos < s.lastPosition && elapsed >= Math.max(0, effectiveDur - s.lastPosition - 2)) {
                rawPos = effectiveDur;
            }
            var pos = Math.max(rawPos, s.lastPosition);
            var delta = Math.max(0, pos - s.lastPosition);
            if (delta > 0 && delta <= Math.max(2.5, elapsed + 2)) {
                s.accumulated = Math.min(s.duration || effectiveDur, s.accumulated + Math.min(delta, Math.max(elapsed + .6, 1.2)));
            }
            s.lastPosition = pos;
            s.lastAt = now;
            var minPos = Math.max(0, (s.duration || effectiveDur) - 2.8);
            var minAcc = Math.min(effectiveDur * .9, (s.duration || effectiveDur) * .9);
            if (!isEnded || pos < minPos && effectiveDur - pos > 2.8 || s.accumulated < minAcc) {
                return Promise.resolve(null);
            }
            s.claiming = true;
            generation++;
            st = fresh();
            var waitOpen = s.opening && s.openingPromise ? s.openingPromise : Promise.resolve();
            return waitOpen.then(function() {
                if (!s.sessionId || s.invalid) {
                    s.claiming = false;
                    return null;
                }
                var targetDur = s.duration || effectiveDur;
                var finalPos = Math.max(pos, targetDur - .2);
                var sid = s.sessionId;
                return enqueueReport(s, "completed", null, finalPos, s.accumulated).then(function(progress) {
                    if (!progress || progress.ok === false) return null;
                    return deps.rpc("claim_track_reward", {
                        playback_session_id: sid
                    });
                }).then(function(result) {
                    if (result && result.ok === true) {
                        s.claimed = true;
                        if (result.duplicate) {
                            if (deps.onDuplicate) deps.onDuplicate(result);
                        } else if (deps.onReward) {
                            deps.onReward(result);
                        }
                    }
                    return result;
                }).catch(function(err) {
                    if (deps.onError) deps.onError(err);
                    return null;
                }).then(function(r) {
                    s.claiming = false;
                    return r;
                });
            });
        }
        function handleEnded() {
            return finalizeCurrentSession(true);
        }
        function handleLoadedMetadata() {
            if (isFinite(audio.duration) && audio.duration > 0) {
                st.liveDuration = audio.duration;
            }
            if (!audio.paused) handlePlay();
        }
        function handleEmptied() {
            if (!st.claiming) reset();
        }
        var handlers = {
            loadedmetadata: handleLoadedMetadata,
            durationchange: handleDurationChange,
            play: function() {
                if (!st.trackId) st.lastAt = clock();
                return handlePlay();
            },
            playing: function() {
                if (st.trackId && !st.invalid && !audio.seeking) {
                    handleTimeUpdate();
                } else {
                    st.lastAt = clock();
                }
                handlePlay();
            },
            timeupdate: handleTimeUpdate,
            seeking: handleSeeking,
            seeked: handleSeeked,
            ratechange: handleRateChange,
            pause: handlePause,
            ended: handleEnded,
            emptied: handleEmptied
        };
        function unload() {
            if (!st.claiming && !st.claimed) report("pause");
        }
        return {
            attach: function() {
                if (!audio || audio.__melissaRewardsAttached) return;
                audio.__melissaRewardsAttached = true;
                Object.keys(handlers).forEach(function(e) {
                    audio.addEventListener(e, handlers[e], e === "ended");
                });
                if (typeof global.addEventListener === "function") global.addEventListener("beforeunload", unload);
                if (!audio.paused) handlePlay();
            },
            detach: function() {
                if (!audio) return;
                Object.keys(handlers).forEach(function(e) {
                    audio.removeEventListener(e, handlers[e], e === "ended");
                });
                if (typeof global.removeEventListener === "function") global.removeEventListener("beforeunload", unload);
                delete audio.__melissaRewardsAttached;
                reset();
            },
            onBeforeTrackAdvance: function() {
                return finalizeCurrentSession(true);
            },
            onLoopChange: function(loopOn) {
                if (loopOn || isLooping()) {
                    if (st.trackId && !st.invalid) invalidate("loop_active");
                }
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
                isLooping: function() {
                    if (audio && audio.loop) return true;
                    if (typeof global.__chirootIsLooping === "function" && global.__chirootIsLooping()) return true;
                    var lb = document.getElementById("btn-loop");
                    return !!(lb && lb.classList.contains("active"));
                },
                getCurrentTrack: function() {
                    try {
                        if (global.__chirootGetCurrentTrack) return global.__chirootGetCurrentTrack();
                        return typeof tracks !== "undefined" && typeof currentIndex === "number" ? tracks[currentIndex] : null;
                    } catch (e) {
                        return null;
                    }
                },
                isAuthed: function() {
                    if (global.ChirootAuth && global.ChirootAuth.session && global.ChirootAuth.session.user && global.ChirootAuth.session.user.id) {
                        return true;
                    }
                    return global.MelissaCore.isAuthed();
                },
                rpc: function(name, args) {
                    return global.ChirootAuth && global.ChirootAuth.session && typeof caApiCall === "function" ? caApiCall("/rest/v1/rpc/" + name, "POST", args) : global.MelissaCore.rpc(name, args);
                },
                onReward: function(result) {
                    document.dispatchEvent(new CustomEvent("melissa:reward", {
                        detail: result
                    }));
                },
                onDuplicate: function(result) {
                    document.dispatchEvent(new CustomEvent("melissa:reward-duplicate", {
                        detail: result
                    }));
                },
                onInvalid: function(reason) {
                    document.dispatchEvent(new CustomEvent("melissa:reward-invalid", {
                        detail: {
                            reason: reason
                        }
                    }));
                },
                onError: function(err) {
                    document.dispatchEvent(new CustomEvent("melissa:reward-error", {
                        detail: {
                            message: err && err.message ? err.message : String(err || "error")
                        }
                    }));
                }
            });
            engine.attach();
            document.addEventListener("chiroot:loop-change", function(e) {
                engine.onLoopChange(!!(e && e.detail && e.detail.isLoop));
            });
            global.MelissaRewards = engine;
        }
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
    }
})(typeof window !== "undefined" ? window : globalThis);
