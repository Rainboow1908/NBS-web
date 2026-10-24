/* Browser file bridge for Note Block Studio Web. */

function nbs_js_accept(filter) {
  var exts = [];
  var re = /\*\.([a-z0-9]+)/gi;
  var m;
  while ((m = re.exec(filter || ""))) {
    var e = "." + m[1].toLowerCase();
    if (exts.indexOf(e) < 0) exts.push(e);
  }
  return exts.join(",");
}

var nbs_file_queue = [];
var nbs_file_reading = false;

function nbs_js_read_file(file) {
  if (!file) return;
  if (nbs_file_reading || window.__nbsInbox) {
    nbs_file_queue.push(file);
    return;
  }
  nbs_file_reading = true;
  var reader = new FileReader();
  reader.onload = function () {
    var s = String(reader.result || "");
    var comma = s.indexOf(",");
    var b64 = comma >= 0 ? s.slice(comma + 1) : s;
    nbs_file_reading = false;
    if (!b64) {
      console.warn("[NBS] Could not read dropped/selected file:", file.name);
      return;
    }
    window.__nbsInbox = JSON.stringify({ name: file.name, base64: b64 });
  };
  reader.onerror = function () {
    nbs_file_reading = false;
    console.warn("[NBS] FileReader failed:", file.name);
  };
  reader.readAsDataURL(file);
}

function nbs_js_pick_file(filter) {
  var input = document.getElementById("nbs-file-input");
  if (!input) {
    input = document.createElement("input");
    input.id = "nbs-file-input";
    input.type = "file";
    input.style.display = "none";
    document.body.appendChild(input);
  }
  input.value = "";
  input.accept = nbs_js_accept(filter);
  input.onchange = function () {
    nbs_js_read_file(input.files && input.files[0]);
  };
  input.click();
  return 1;
}

function nbs_js_take_inbox() {
  var v = window.__nbsInbox || "";
  window.__nbsInbox = "";
  if (nbs_file_queue.length > 0) {
    setTimeout(function () {
      nbs_js_read_file(nbs_file_queue.shift());
    }, 50);
  }
  return v;
}

// GameMaker's FileDropper extension has no HTML5 implementation. Handle OS
// file drops at the DOM boundary and route them through the same inbox as the
// file picker. Capture phase + preventDefault stops the browser navigating to
// the dropped file.
(function nbs_js_install_drop() {
  if (window.__nbsDropInstalled) return;
  window.__nbsDropInstalled = true;
  function prevent(ev) {
    if (!ev) return;
    ev.preventDefault();
    ev.stopPropagation();
  }
  window.addEventListener("dragover", prevent, true);
  window.addEventListener("dragenter", prevent, true);
  window.addEventListener("drop", function (ev) {
    prevent(ev);
    var files = ev.dataTransfer && ev.dataTransfer.files;
    if (!files || files.length === 0) return;
    for (var i = 0; i < files.length; i++) nbs_js_read_file(files[i]);
  }, true);
})();

// GameMaker's browser_width/browser_height are captured at startup on HTML5.
// Read the live viewport from JS so update_window() also works after resize.
function nbs_js_viewport_width() {
  return Math.max(
    1,
    Math.floor(window.__nbsViewportW || window.innerWidth || document.documentElement.clientWidth || 1)
  );
}

function nbs_js_viewport_height() {
  return Math.max(
    1,
    Math.floor(window.__nbsViewportH || window.innerHeight || document.documentElement.clientHeight || 1)
  );
}

function nbs_js_download(name, base64) {
  var bin = atob(base64 || "");
  var len = bin.length;
  var bytes = new Uint8Array(len);
  for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  var blob = new Blob([bytes], { type: "application/octet-stream" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = name || "song.nbs";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(function () {
    URL.revokeObjectURL(url);
    if (a.parentNode) a.parentNode.removeChild(a);
  }, 1500);
  return 1;
}

function nbs_js_open_url(url) {
  try {
    var u = String(url || "");
    if (!/^https?:\/\//i.test(u)) return 0;
    // Do NOT pass noopener/noreferrer in the features string: Chrome then
    // returns null even when the tab opened, and a location.href fallback
    // would navigate away from the game. Open a normal blank target and
    // sever opener explicitly.
    var w = window.open(u, "_blank");
    if (w) {
      try { w.opener = null; } catch (e) {}
      return 1;
    }
    // Popup blocked: leave the game page intact.
    if (typeof window.__nbsToast === "function") {
      window.__nbsToast("浏览器阻止了新标签页，请允许弹出窗口后重试。");
    }
    return 0;
  } catch (e) {
    return 0;
  }
}

function nbs_js_b64_to_bytes(b64) {
  var bin = atob(b64 || "");
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function nbs_js_bytes_to_b64(bytes) {
  var s = "";
  for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function nbs_js_gzip_download(name, base64) {
  try {
    if (typeof CompressionStream !== "function") return 0;
    var bytes = nbs_js_b64_to_bytes(base64);
    var stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
    new Response(stream).arrayBuffer().then(function (buf) {
      nbs_js_download(name, nbs_js_bytes_to_b64(new Uint8Array(buf)));
    }).catch(function (e) {
      console.warn("[NBS] gzip failed:", e);
    });
    return 1;
  } catch (e) {
    console.warn("[NBS] gzip failed:", e);
    return 0;
  }
}

function nbs_js_set_dirty(dirty) {
  window.__nbsDirty = !!Number(dirty);
  return 1;
}

function nbs_js_take_export_request() {
  if (!window.__nbsExportRequested) return 0;
  window.__nbsExportRequested = false;
  return 1;
}

var nbs_capture = null;

function nbs_js_export_audio(nbsBase64, name, format) {
  try {
    if (window.__nbsToast) window.__nbsToast("正在离线渲染音频…");
    var pcmMap = window.__nbsPcmByName || {};
    var raw = nbs_js_b64_to_bytes(nbsBase64);
    var view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    var pos = 0;
    function u8() { var v = view.getUint8(pos); pos += 1; return v; }
    function u16() { var v = view.getUint16(pos, true); pos += 2; return v; }
    function u32() { var v = view.getUint32(pos, true); pos += 4; return v; }
    function str() {
      var len = u32(), start = pos;
      pos += len;
      return new TextDecoder().decode(raw.subarray(start, start + len));
    }
    function skip(n) { pos += n; }

    var first = u16();
    var version = 0;
    if (first === 0) {
      version = u8();
      u8(); // first custom instrument index
    } else {
      pos = 0;
      throw new Error("legacy NBS audio export is not supported");
    }
    var songLength = version >= 3 ? u16() : 0;
    var layerCount = u16();
    str(); str(); str(); str(); // name/author/original/description
    var tempo = (u16() || 1000) / 100;
    u8(); u8(); u8(); // autosave, minutes, time signature
    skip(20); // 5 ints of stats
    str(); // midi filename
    if (version >= 4) { u8(); u8(); u16(); }
    var notes = [];
    var tick = 0;
    while (true) {
      var tickJump = u16();
      if (tickJump === 0) break;
      tick += tickJump;
      var layer = 0;
      while (true) {
        var layerJump = u16();
        if (layerJump === 0) break;
        layer += layerJump;
        var instrument = u8();
        var key = u8();
        var velocity = version >= 4 ? u8() : 100;
        var pan = version >= 4 ? u8() : 100;
        var pitch = version >= 4 ? view.getInt16(pos, true) : 0;
        if (version >= 4) pos += 2;
        notes.push({ tick: tick, layer: layer, instrument: instrument, key: key, velocity: velocity, pan: pan, pitch: pitch });
      }
    }
    var layers = [];
    for (var li = 0; li < layerCount; li++) {
      var lname = str();
      var lock = version >= 4 ? u8() : 0;
      var vol = u8();
      var stereo = version >= 2 ? u8() : 100;
      layers.push({ name: lname, lock: lock, volume: vol, stereo: stereo });
    }
    var customCount = u8();
    var customFiles = [];
    for (var ci = 0; ci < customCount; ci++) {
      str(); // name
      customFiles.push(str());
      u8(); u8();
    }

    var builtin = [
      "harp.ogg", "dbass.ogg", "bdrum.ogg", "sdrum.ogg", "click.ogg", "guitar.ogg",
      "flute.ogg", "bell.ogg", "icechime.ogg", "iron_xylophone.ogg", "cow_bell.ogg",
      "didgeridoo.ogg", "bit.ogg", "banjo.ogg", "pling.ogg", "xylobone.ogg"
    ];
    var maxTick = Math.max(songLength, notes.reduce(function (m, n) { return Math.max(m, n.tick); }, 0));
    var duration = Math.max(1, maxTick / Math.max(0.1, tempo) + 2);
    var ctx = new OfflineAudioContext(2, Math.ceil(duration * 44100), 44100);
    var cache = {};
    notes.forEach(function (note) {
      var file = note.instrument >= 16 && customFiles[note.instrument - 16]
        ? customFiles[note.instrument - 16]
        : builtin[note.instrument];
      if (!file) return;
      var pcm = pcmMap[file] || pcmMap[file.split("/").pop()];
      if (!pcm) return;
      if (!cache[file]) {
        var frames = Math.floor(pcm.byteLength / 4);
        var ab = ctx.createBuffer(2, frames, 44100);
        var l = ab.getChannelData(0), r = ab.getChannelData(1);
        var dv = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
        for (var i = 0; i < frames; i++) {
          l[i] = dv.getInt16(i * 4, true) / 32768;
          r[i] = dv.getInt16(i * 4 + 2, true) / 32768;
        }
        cache[file] = ab;
      }
      var layer = layers[note.layer] || { volume: 100, stereo: 100 };
      if (layer.lock === 1) return;
      var source = ctx.createBufferSource();
      source.buffer = cache[file];
      source.playbackRate.value = Math.pow(2, (note.key - 45) / 12);
      var gain = ctx.createGain();
      gain.gain.value = (note.velocity / 100) * (layer.volume / 100);
      var panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (panner) {
        panner.pan.value = Math.max(-1, Math.min(1, ((note.pan - 100) / 100) * (layer.stereo / 100)));
        source.connect(gain);
        gain.connect(panner);
        panner.connect(ctx.destination);
      } else {
        source.connect(gain);
        gain.connect(ctx.destination);
      }
      source.start(note.tick / Math.max(0.1, tempo));
    });
    return ctx.startRendering().then(function (audio) {
      var left = audio.getChannelData(0);
      var right = audio.numberOfChannels > 1 ? audio.getChannelData(1) : left;
      var total = left.length;
      var outName = String(name || "audio");
      if (String(format).toLowerCase() === "wav") {
        var bytes = new Uint8Array(44 + total * 4);
        var dv = new DataView(bytes.buffer);
        dv.setUint32(0, 0x46464952, true);
        dv.setUint32(4, 36 + total * 4, true);
        dv.setUint32(8, 0x45564157, true);
        dv.setUint32(12, 0x20746d66, true);
        dv.setUint32(16, 16, true);
        dv.setUint16(20, 1, true);
        dv.setUint16(22, 2, true);
        dv.setUint32(24, 44100, true);
        dv.setUint32(28, 44100 * 4, true);
        dv.setUint16(32, 4, true);
        dv.setUint16(34, 16, true);
        dv.setUint32(36, 0x61746164, true);
        dv.setUint32(40, total * 4, true);
        for (var i = 0; i < total; i++) {
          dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, left[i])) * 32767, true);
          dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, right[i])) * 32767, true);
        }
        nbs_js_download(/\.wav$/i.test(outName) ? outName : outName + ".wav", nbs_js_bytes_to_b64(bytes));
      } else if (window.lamejs && typeof lamejs.Mp3Encoder === "function") {
        var enc = new lamejs.Mp3Encoder(2, 44100, 192);
        var chunks = [];
        for (var p = 0; p < total; p += 1152) {
          var n = Math.min(1152, total - p);
          var l = new Int16Array(n), r = new Int16Array(n);
          for (var j = 0; j < n; j++) {
            l[j] = Math.max(-1, Math.min(1, left[p + j])) * 32767;
            r[j] = Math.max(-1, Math.min(1, right[p + j])) * 32767;
          }
          var chunk = enc.encodeBuffer(l, r);
          if (chunk.length) chunks.push(new Uint8Array(chunk));
        }
        var tail = enc.flush();
        if (tail.length) chunks.push(new Uint8Array(tail));
        var size = chunks.reduce(function (a, c) { return a + c.length; }, 0);
        var mp3 = new Uint8Array(size), at = 0;
        chunks.forEach(function (c) { mp3.set(c, at); at += c.length; });
        nbs_js_download(/\.mp3$/i.test(outName) ? outName : outName + ".mp3", nbs_js_bytes_to_b64(mp3));
      }
      return 1;
    }).catch(function (e) {
      console.warn("[NBS] offline audio export failed:", e);
      if (window.__nbsToast) window.__nbsToast("音频导出失败：" + e);
      return 0;
    });
  } catch (e) {
    console.warn("[NBS] offline audio export failed:", e);
    if (window.__nbsToast) window.__nbsToast("音频导出失败：" + e);
    return 0;
  }
}


function nbs_js_gunzip_base64(base64) {
  try {
    var bytes = nbs_js_b64_to_bytes(base64);
    if (!window.fflate) return "";
    // Some schematic files are already uncompressed NBT.
    var out = (bytes[0] === 0x1f && bytes[1] === 0x8b) ? fflate.gunzipSync(bytes) : bytes;
    return nbs_js_bytes_to_b64(out);
  } catch (e) {
    console.warn("[NBS] gunzip failed:", e);
    return "";
  }
}

function nbs_js_download_url(name, url) {
  try {
    fetch(encodeURI(String(url || ""))).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.blob();
    }).then(function (blob) {
      var a = document.createElement("a");
      var objectUrl = URL.createObjectURL(blob);
      a.href = objectUrl;
      a.download = name || "download.zip";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(objectUrl);
        if (a.parentNode) a.parentNode.removeChild(a);
      }, 1500);
    }).catch(function (e) {
      console.warn("[NBS] download failed:", e);
    });
    return 1;
  } catch (e) {
    return 0;
  }
}

function nbs_js_zip_download(name, filesJson) {
  try {
    if (!window.fflate) return 0;
    if (window.__nbsToast) window.__nbsToast("正在打包 ZIP…");
    var files = JSON.parse(filesJson || "{}");
    var entries = {};
    for (var key in files) {
      if (!Object.prototype.hasOwnProperty.call(files, key)) continue;
      entries[key] = nbs_js_b64_to_bytes(files[key]);
    }
    var count = Object.keys(entries).length;
    var zipped = fflate.zipSync(entries, { level: 6 });
    nbs_js_download(name, nbs_js_bytes_to_b64(zipped));
    if (window.__nbsToast) window.__nbsToast("ZIP 已生成：" + name + "（" + count + " 个文件）");
    return 1;
  } catch (e) {
    console.warn("[NBS] zip failed:", e);
    if (window.__nbsToast) window.__nbsToast("ZIP 生成失败：" + e);
    return 0;
  }
}

function nbs_js_game_ready() {
  if (typeof window.__nbsGameReady === "function") window.__nbsGameReady();
  return 1;
}

function nbs_js_set_window_icon(fruity) {
  var useFruity = !!Number(fruity);
  if (window.__nbsFaviconFruity === useFruity) return 1;
  window.__nbsFaviconFruity = useFruity;
  var href = useFruity ? "noteblockstudio/Data/icon.ico" : "favicon.ico";
  var link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = "image/x-icon";
  link.href = href;
  return 1;
}

function nbs_js_confirm(text) {
  try {
    return window.confirm(String(text || "")) ? 1 : 0;
  } catch (e) {
    return 0;
  }
}

function nbs_js_prompt(title, def) {
  try {
    if (typeof window.prompt === "function") {
      var v = window.prompt(title || "File name", def || "song.nbs");
      return v == null ? "" : v;
    }
  } catch (e) {}
  if (!def || def.charAt(0) === ".") return "song.nbs";
  return def;
}
