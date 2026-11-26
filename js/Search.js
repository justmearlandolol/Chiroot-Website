(function () {
  'use strict';

  var ITEM_SELECTOR = '.playlist-item';
  var HIDDEN_CLASS = 'is-search-hidden';
  var TITLE_SELECTOR = '.p-title';
  var ARTIST_SELECTOR = '.p-artist';
  var ALBUM_SELECTOR = '.p-album';
  var MAX_STATUS_CHARS = 28;

  var wrap = null;
  var input = null;
  var clearBtn = null;
  var kbdHint = null;
  var statusEl = null;
  var noResultsEl = null;
  var noResultsQueryEl = null;
  var playlist = null;
  var playlistWrap = null;

  var query = '';
  var needle = '';
  var tokens = [];

  var rafId = null;
  var observer = null;

  function normalize(value) {
    var str = value == null ? '' : String(value);
    try {
      if (typeof str.normalize === 'function') {
        str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      }
    } catch (e) {}
    return str.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function truncate(value, max) {
    var str = String(value || '');
    return str.length > max ? str.slice(0, max - 1).trim() + '…' : str;
  }

  function searchTextOf(item) {
    var parts = [];
    var titleEl = item.querySelector(TITLE_SELECTOR);
    var artistEl = item.querySelector(ARTIST_SELECTOR);
    var albumEl = item.querySelector(ALBUM_SELECTOR);
    if (titleEl) parts.push(titleEl.textContent || '');
    if (artistEl) parts.push(artistEl.textContent || '');
    if (albumEl) parts.push(albumEl.textContent || '');
    if (item.dataset && item.dataset.searchExtra) parts.push(item.dataset.searchExtra);
    return normalize(parts.join(' • '));
  }

  function matches(haystack) {
    if (!tokens.length) return true;
    for (var i = 0; i < tokens.length; i++) {
      if (haystack.indexOf(tokens[i]) === -1) return false;
    }
    return true;
  }

  function applyFilter() {
    rafId = null;
    if (!playlist) return;

    var items = playlist.querySelectorAll(ITEM_SELECTOR);
    var total = items.length;
    var visible = 0;
    var filtering = needle.length > 0;

    for (var i = 0; i < total; i++) {
      var item = items[i];
      var show = !filtering || matches(searchTextOf(item));
      if (item.classList.contains(HIDDEN_CLASS) === show) {
        item.classList.toggle(HIDDEN_CLASS, !show);
      }
      if (show) visible++;
    }

    var noHit = filtering && total > 0 && visible === 0;

    if (noResultsEl) noResultsEl.hidden = !noHit;
    if (noResultsQueryEl) noResultsQueryEl.textContent = noHit ? '“' + truncate(query, 40) + '”' : '';
    if (noHit && playlistWrap) playlistWrap.scrollTop = 0;

    updateStatus(filtering, visible, total);
  }

  function updateStatus(filtering, visible, total) {
    if (!statusEl) return;
    if (!filtering || total === 0) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = visible === 0
      ? 'Tidak ada hasil untuk “' + truncate(query, MAX_STATUS_CHARS) + '”'
      : visible + ' dari ' + total + ' lagu cocok dengan “' + truncate(query, MAX_STATUS_CHARS) + '”';
  }

  function scheduleApply() {
    if (rafId !== null) return;
    if (typeof window.requestAnimationFrame === 'function') {
      rafId = window.requestAnimationFrame(applyFilter);
    } else {
      rafId = window.setTimeout(applyFilter, 16);
    }
  }

  function syncClearButton() {
    if (!clearBtn) return;
    var hasText = query.length > 0;
    clearBtn.hidden = !hasText;
    if (input) input.classList.toggle('has-value', hasText);
  }

  function setQuery(value, options) {
    var opts = options || {};
    query = value == null ? '' : String(value);
    needle = normalize(query);
    tokens = needle ? needle.split(' ').filter(Boolean) : [];

    if (input && input.value !== query) input.value = query;

    syncClearButton();
    if (opts.immediate) applyFilter();
    else scheduleApply();
  }

  function clearQuery(refocus) {
    setQuery('', { immediate: true });
    if (refocus && input) {
      try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
    }
  }

  function focusSearch() {
    if (!input) return;
    try { input.focus({ preventScroll: false }); } catch (e) { input.focus(); }
    try { input.select(); } catch (e) {}
  }

  function isTypingTarget(target) {
    if (!target || !target.tagName) return false;
    var tag = target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return !!target.isContentEditable;
  }

  function bindEvents() {
    if (input) {
      input.addEventListener('input', function () {
        setQuery(input.value);
      });

      input.addEventListener('focus', function () {
        if (wrap) wrap.classList.add('is-focused');
        if (input.value !== query) setQuery(input.value);
      });

      input.addEventListener('blur', function () {
        if (wrap) wrap.classList.remove('is-focused');
      });

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' || e.key === 'Esc') {
          e.preventDefault();
          if (query) {
            e.stopPropagation();
            clearQuery(true);
          } else {
            input.blur();
          }
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          applyFilter();
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('mousedown', function (e) {
        e.preventDefault();
      });
      clearBtn.addEventListener('click', function (e) {
        e.preventDefault();
        clearQuery(true);
      });
    }

    var noResultsClear = document.getElementById('crate-no-results-clear');
    if (noResultsClear) {
      noResultsClear.addEventListener('click', function (e) {
        e.preventDefault();
        clearQuery(true);
      });
    }

    document.addEventListener('keydown', function (e) {
      var key = e.key;

      if ((e.ctrlKey || e.metaKey) && !e.altKey && (key === 'k' || key === 'K')) {
        if (isTypingTarget(e.target) && e.target !== input) return;
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        focusSearch();
        return;
      }

      if (key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        focusSearch();
        return;
      }

      if ((key === 'Escape' || key === 'Esc') && query && !isTypingTarget(e.target)) {
        e.preventDefault();
        setQuery('', { immediate: true });
      }
    }, true);

    if (playlist && typeof window.MutationObserver === 'function') {
      observer = new MutationObserver(function (records) {
        if (!needle) {
          if (noResultsEl && !noResultsEl.hidden) noResultsEl.hidden = true;
          return;
        }
        for (var i = 0; i < records.length; i++) {
          var r = records[i];
          if (r.type === 'childList' || r.type === 'characterData') {
            scheduleApply();
            return;
          }
        }
      });
      observer.observe(playlist, { childList: true, subtree: true, characterData: true });
    }

    window.addEventListener('pageshow', function () {
      if (needle) scheduleApply();
    });
  }

  function setShortcutLabel() {
    if (!kbdHint) return;
    var platform = (navigator.userAgentData && navigator.userAgentData.platform)
      || navigator.platform
      || navigator.userAgent
      || '';
    kbdHint.textContent = /mac|iphone|ipad|ipod/i.test(platform) ? '⌘ K' : 'Ctrl K';
  }

  function init() {
    wrap = document.getElementById('crate-search-wrap');
    input = document.getElementById('crate-search-input');
    clearBtn = document.getElementById('crate-search-clear');
    kbdHint = document.getElementById('crate-search-kbd');
    statusEl = document.getElementById('crate-search-status');
    noResultsEl = document.getElementById('crate-no-results');
    noResultsQueryEl = document.getElementById('crate-no-results-query');
    playlist = document.getElementById('playlist');
    playlistWrap = document.getElementById('playlist-wrap');

    if (!input || !playlist) return;

    setShortcutLabel();
    syncClearButton();
    bindEvents();

    window.CrateSearch = {
      focus: focusSearch,
      clear: function () { clearQuery(true); },
      setQuery: function (value) { setQuery(value, { immediate: true }); },
      getQuery: function () { return query; },
      apply: applyFilter
    };

    if (input.value) setQuery(input.value, { immediate: true });
    else if (needle) scheduleApply();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
