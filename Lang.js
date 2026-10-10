(function () {
  var STORE_KEY = 'chiroot_lang';

  var DICT = {
    'Ambil Data': 'Fetch Data',
    'pakai cover': 'use cover',
    'Tutup Laporan': 'Close Report',
    'Tutup': 'Close',
    'Output default': 'Default output',
    'Pilih headset': 'Pick headset',
    'Halo! Buat profil kamu': 'Hi! Set up your profile',
    'Pilih Foto Profil': 'Choose Profile Photo',
    'Nama': 'Name',
    'Simpan & Mulai': 'Save & Start',
    'Edit Profil': 'Edit Profile',
    'Ganti Foto': 'Change Photo',
    'Batal': 'Cancel',
    'Simpan Profil': 'Save Profile',
    'Ganti Akun': 'Switch Account',
    'Login akun Google lain': 'Sign in with another Google account',
    'Lagu tersimpan di device ini': 'Songs saved on this device',
    'Lanjut sebagai Guest': 'Continue as Guest',
    'Semua Patch Notes': 'All Patch Notes',
    'Terbaru': 'Latest',
    'Riwayat': 'History',
    'Masuk ke Chiroot': 'Sign in to Chiroot',
    'Coba Lagi': 'Retry',
    'aktif': 'active',
    'langsung': 'ready',
    'perlu refresh': 'needs refresh',
    'Akun Chiroot': 'Chiroot Account',
    'Lepas akun ini dari device': 'Remove this account from the device',
    'PEMELIHARAAN': 'MAINTENANCE',
    'UPDATE FITUR': 'FEATURE UPDATE',
    'Tidak ada rincian.': 'No details.',
    'Januari': 'January',
    'Februari': 'February',
    'Maret': 'March',
    'Mei': 'May',
    'Juni': 'June',
    'Juli': 'July',
    'Agustus': 'August',
    'Oktober': 'October',
    'Desember': 'December',
    'Kamu masih mode Guest record ini cuma kesimpen di browser sekarang,Kalau cache dibersihin atau ganti device, lagunya ikut hilang.': 'You are still in Guest mode — these records only live in this browser. If the cache is cleared or you switch devices, the songs are gone.',
    'Login Google biar semua record kamu diinget & bisa dibuka lagi dari device manapun.': 'Sign in with Google so all your records are remembered & can be opened again from any device.',
    'putar & tambahkan ke Crate': 'play & add to Crate',
    'Statistik pemakaian & track favorit': 'Play stats & favorite tracks',
    'Belum ada track': 'No tracks yet',
    'Putar musik untuk merekam stats': 'Play music to record stats',
    'Tekan \u201CPilih headset\u201D untuk memberi izin dan menampilkan perangkat audio.': 'Press \u201CPick headset\u201D to grant permission and list audio devices.',
    'Kelola crate dan data kamu. Lagu tersinkron di akun Google.': 'Manage your crate and data. Songs are synced to your Google account.',
    'Simpan semua lagu crate ke satu file ZIP, atau pulihkan lagu dari file ZIP backup.': 'Save all crate songs into one ZIP file, or restore songs from a ZIP backup file.',
    'Hapus seluruh data dan kembalikan ke piringan hitam demo.': 'Delete all data and restore the demo vinyl.',
    'Akun Google baru terdeteksi. Lengkapi profil dulu untuk membuka Chiroot.': 'A new Google account was detected. Complete your profile first to unlock Chiroot.',
    'Tulisan kecil yang muncul di profil kamu\u2026': 'Short text shown on your profile\u2026',
    'nama@gmail.com': 'name@gmail.com',
    'Ganti warna banner': 'Change banner color',
    'Keluarkan dari antrean': 'Remove from queue',
    'Kosongkan antrean': 'Clear queue',
    'Pilih headset Bluetooth': 'Choose Bluetooth headset',
    'Warna custom': 'Custom color',
    'Antrean lagu': 'Song queue',
    'Pengaturan profil': 'Profile settings',
    'Sapaan dan akun': 'Greeting and account',
    'Preview profil': 'Profile preview',
    'Belum ada akun yang tersimpan di device ini. Login Google satu kali, setelah itu pindah akun tinggal klik.': 'No accounts saved on this device yet. Sign in with Google once, then switching is just one click.',
    'Crate kosong \u2013 Add Music dulu ya!': 'Your crate is empty \u2014 Add Music first!',
    'Antrean dikosongkan': 'Queue cleared',
    'Auto-fill YouTube berhasil!': 'YouTube auto-fill worked!',
    'Backup ZIP dibuat': 'Backup ZIP created',
    'Belum ada patch notes tersedia.': 'No patch notes available yet.',
    'Cover ditolak \u2013 harus JPG/PNG': 'Cover rejected \u2014 must be JPG/PNG',
    'Crate dikosongkan': 'Crate emptied',
    'Email tidak valid.': 'Invalid email.',
    'Nama tidak boleh kosong.': 'Name cannot be empty.',
    'Nama wajib diisi ya.': 'Name is required.',
    'Paste link YouTube dulu bro!': 'Paste a YouTube link first!',
    'Pilih foto profil dulu (PNG / JPEG / WEBP).': 'Pick a profile photo first (PNG / JPEG / WEBP).',
    'Profil tersimpan': 'Profile saved',
    'Statistik bulanan telah direset': 'Monthly stats have been reset',
    'Upload ditolak \u2013 hanya MP3': 'Upload rejected \u2014 MP3 only',
    'Lagu gagal diputar \u2013 cek koneksi lalu tap Play lagi': 'Playback failed \u2014 check your connection then tap Play again',
    'Menghapus crate\u2026': 'Deleting crate\u2026',
    'Metadata ditemukan, mengambil thumbnail...': 'Metadata found, fetching thumbnail\u2026',
    'Akun itu sudah tidak ada di daftar.': 'That account is no longer in the list.',
    'Reverb aktif': 'Reverb on',
    'Reverb nonaktif': 'Reverb off',
    'Akun aktif dilepas dari daftar (kamu tetap login di akun itu).': 'Active account removed from the list (you stay signed in to it).',
    'Akun dilepas dari daftar.': 'Account removed from the list.'
  };

  var PREFIXES = [
    ['Pindah ke ', 'Switched to '],
    ['Selamat datang, ', 'Welcome, '],
    ['Dirilis ', 'Released '],
    ['Gagal keluar: ', 'Sign out failed: '],
    ['Gagal memuat crate: ', 'Failed to load crate: '],
    ['Gagal menambah track: ', 'Failed to add track: '],
    ['Gagal menghapus: ', 'Delete failed: '],
    ['Gagal menyimpan profil: ', 'Failed to save profile: '],
    ['Gagal reset crate: ', 'Crate reset failed: '],
    ['Ganti akun gagal (', 'Account switch failed ('],
    ['Memindahkan ', 'Moving '],
    ['Tap Play lagi \u2013 browser blok autoplay ', 'Tap Play again \u2014 browser blocked autoplay '],
    ['Lepas ', 'Remove ']
  ];

  var SUFFIXES = [
    [' dari daftar akun di device ini?\nLagu & profilnya tetap aman di cloud.', ' from the account list on this device?\nSongs & profile stay safe in the cloud.']
  ];

  var REGEXES = [
    [/(\d[\d.,]*)\s*kali diputar\s*\u2022\s*(\d[\d.,]*)\s*menit/g, '$1 plays \u2022 $2 min']
  ];

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1, PRE: 1, TEMPLATE: 1 };

  function detect() {
    try {
      var saved = localStorage.getItem(STORE_KEY);
      if (saved === 'id' || saved === 'en') return saved;
    } catch (e) {}
    var langs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || navigator.userLanguage || ''];
    var first = String(langs[0] || '').toLowerCase();
    return first.indexOf('id') === 0 ? 'id' : 'en';
  }

  var lang = detect();

  function norm(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  function t(raw) {
    var s = norm(raw);
    if (!s) return raw;
    if (DICT[s]) return DICT[s];
    var m = s.match(/^([^A-Za-z0-9]*)([\s\S]*?)([^A-Za-z0-9]*)$/);
    var lead = m[1] || '';
    var core = m[2] || '';
    var tail = m[3] || '';
    if (core && DICT[core]) return lead + DICT[core] + tail;
    var i;
    var out = s;
    for (i = 0; i < PREFIXES.length; i++) {
      if (out.indexOf(PREFIXES[i][0]) === 0) {
        out = PREFIXES[i][1] + out.slice(PREFIXES[i][0].length);
        break;
      }
    }
    for (i = 0; i < SUFFIXES.length; i++) {
      var sf = SUFFIXES[i][0];
      if (out.length > sf.length && out.lastIndexOf(sf) === out.length - sf.length) {
        out = out.slice(0, out.length - sf.length) + SUFFIXES[i][1];
        break;
      }
    }
    for (i = 0; i < REGEXES.length; i++) {
      REGEXES[i][0].lastIndex = 0;
      if (REGEXES[i][0].test(out)) {
        REGEXES[i][0].lastIndex = 0;
        out = out.replace(REGEXES[i][0], REGEXES[i][1]);
      }
    }
    return out === s ? raw : out;
  }

  function translateAttr(el, name) {
    var val = el.getAttribute(name);
    if (!val) return;
    var out = t(val);
    if (out !== val) el.setAttribute(name, out);
  }

  function translateTextNode(n) {
    var out = t(n.nodeValue);
    if (out !== n.nodeValue) n.nodeValue = out;
  }

  function skipped(el) {
    if (el.id === 'lyrics-content' || el.hasAttribute('data-lang-skip')) return true;
    return false;
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { translateTextNode(root); return; }
    if (root.nodeType !== 1) return;
    if (SKIP_TAGS[root.tagName] || root.isContentEditable) return;
    if (skipped(root)) return;
    translateAttr(root, 'placeholder');
    translateAttr(root, 'title');
    translateAttr(root, 'aria-label');
    if (root.tagName === 'INPUT') return;
    var c = root.firstChild;
    while (c) {
      var next = c.nextSibling;
      if (c.nodeType === 3) translateTextNode(c);
      else if (c.nodeType === 1) walk(c);
      c = next;
    }
  }

  function onMutations(muts) {
    for (var i = 0; i < muts.length; i++) {
      var mu = muts[i];
      if (mu.type === 'childList') {
        for (var j = 0; j < mu.addedNodes.length; j++) walk(mu.addedNodes[j]);
      } else if (mu.type === 'characterData') {
        if (mu.target && mu.target.parentNode && !SKIP_TAGS[mu.target.parentNode.tagName]) translateTextNode(mu.target);
      } else if (mu.type === 'attributes' && mu.target && mu.target.nodeType === 1) {
        translateAttr(mu.target, mu.attributeName);
      }
    }
  }

  function apply() {
    document.documentElement.lang = 'en';
    walk(document.body);
    var newTitle = t(document.title);
    if (newTitle !== document.title) document.title = newTitle;
    if (window.MutationObserver) {
      var observer = new MutationObserver(onMutations);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['placeholder', 'title', 'aria-label']
      });
    }
  }

  function init() {
    if (lang === 'en') apply();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.Lang = {
    get: function () { return lang; },
    t: t,
    set: function (next) {
      var val = String(next || '').toLowerCase().indexOf('id') === 0 ? 'id' : 'en';
      try { localStorage.setItem(STORE_KEY, val); } catch (e) {}
      window.location.reload();
    }
  };
})();
