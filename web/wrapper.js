/* Post-build browser wrapper. No GameMaker source files are modified.
 *
 * Responsibilities:
 *  - keep the canvas and input in the same coordinate space (DPR = 1)
 *  - size the canvas to the browser viewport before GameMaker starts
 *  - decode bundled OGG instruments to raw PCM in the page
 *  - override the HTML5 audio-decode stub and buffer loader for temp.file
 *  - normalize backslash asset paths used by the desktop-oriented GML
 *  - show a loading screen while sounds are decoded
 */
(function () {
  "use strict";

  document.title = "NBSweb";

  try {
    Object.defineProperty(window, "devicePixelRatio", { get: function () { return 1; } });
  } catch (e) {}

  // GameMaker's HTML5 buffer-sound path uses a very crude resampler when the
  // AudioContext rate differs from the sound rate. The GML passes 44100, so
  // force the context to 44100 and let the browser do high-quality output
  // resampling instead. Without this, 48 kHz devices produce crackle/static.
  (function forceAudioRate() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    function Wrapped(options) {
      try {
        return new AC(Object.assign({}, options || {}, { sampleRate: 44100 }));
      } catch (e) {
        return new AC(options);
      }
    }
    Wrapped.prototype = AC.prototype;
    window.AudioContext = Wrapped;
    if (window.webkitAudioContext) window.webkitAudioContext = Wrapped;
  })();

  var canvas = null;
  var loading = null;
  var status = null;

  function makeLoading() {
    var style = document.createElement("style");
    style.textContent =
      "html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#171717;color:#ddd;font-family:'Segoe UI','Microsoft YaHei',system-ui,sans-serif}" +
      "#gm4html5_div_id{position:fixed;inset:0;background:#171717}" +
      // No 100vw/100vh here: that stretches a stale buffer on resize. The
      // wrapper sets exact px sizes (as inline !important) instead.
      "#canvas{display:block;outline:none;user-select:none;-webkit-user-select:none;touch-action:none}" +
      "#nbs-loading{position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:radial-gradient(circle at 50% 35%,#262626 0%,#141414 60%,#0d0d0d 100%);transition:opacity .35s ease}" +
      "#nbs-loading.nbs-hidden{opacity:0;pointer-events:none}" +
      "#nbs-loading .t{font-size:26px;font-weight:600;letter-spacing:.02em}" +
      "#nbs-loading .s{font-size:13px;color:#9a9a9a}" +
      "#nbs-loading .bar{width:260px;height:4px;border-radius:999px;background:#333;overflow:hidden}" +
      "#nbs-loading .bar>div{width:40%;height:100%;border-radius:inherit;background:linear-gradient(90deg,#7ee35a,#b8ff7a);animation:nbs-slide 1.25s ease-in-out infinite}" +
      "@keyframes nbs-slide{0%{transform:translateX(-110%)}50%{transform:translateX(90%)}100%{transform:translateX(260%)}}";
    document.head.appendChild(style);

    loading = document.createElement("div");
    loading.id = "nbs-loading";
    loading.innerHTML =
      '<div class="t">NBSweb</div>' +
      '<div class="s" id="nbs-loading-status">正在加载网页版…</div>' +
      '<div class="bar"><div></div></div>';
    document.body.appendChild(loading);
    status = document.getElementById("nbs-loading-status");
  }

  function setStatus(text) {
    if (status) status.textContent = text;
  }

  function ensureUiCss() {
    if (document.getElementById("nbs-ui-css")) return;
    var s = document.createElement("style");
    s.id = "nbs-ui-css";
    s.textContent =
      "#nbs-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:80;max-width:min(560px,90vw);padding:12px 16px;border-radius:10px;background:#252525;border:1px solid #3a3a3a;color:#eee;font-size:13px;line-height:1.55;box-shadow:0 8px 28px rgba(0,0,0,.45);opacity:0;transition:opacity .2s ease;pointer-events:none}" +
      "#nbs-toast.show{opacity:1}" +
      "#nbs-fatal{position:fixed;left:12px;right:12px;bottom:12px;z-index:90;padding:10px 14px;border-radius:8px;background:#2b1b1b;border:1px solid #6b3b3b;color:#ffd9d9;font-size:12px;display:flex;gap:12px;align-items:center;justify-content:space-between}" +
      "#nbs-fatal button{background:#7a3030;border:0;color:#fff;border-radius:6px;padding:6px 10px;cursor:pointer}";
    document.head.appendChild(s);
  }

  function toast(text, ms) {
    ensureUiCss();
    var el = document.getElementById("nbs-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "nbs-toast";
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(el._nbsTimer);
    el._nbsTimer = setTimeout(function () { el.classList.remove("show"); }, ms || 4200);
  }
  window.__nbsToast = toast;

  window.__nbsUnsupported = function (kind) {
    toast(
      kind === "open"
        ? "网页版暂不支持打开文件。请使用桌面版，或等待后续的 Web 文件桥。"
        : "网页版暂不支持保存文件。请使用桌面版，或等待后续的 Web 文件桥。"
    );
  };

  function showFatal(message) {
    hideLoading();
    ensureUiCss();
    var el = document.getElementById("nbs-fatal");
    if (!el) {
      el = document.createElement("div");
      el.id = "nbs-fatal";
      var span = document.createElement("span");
      span.id = "nbs-fatal-text";
      var copy = document.createElement("button");
      copy.textContent = "复制错误";
      copy.onclick = function () {
        var text = document.getElementById("nbs-fatal-text").textContent;
        var fallback = function () {
          try {
            var ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.left = "-9999px";
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            var ok = document.execCommand("copy");
            document.body.removeChild(ta);
            toast(ok ? "已复制错误信息" : "复制失败，请手动选择错误文本");
          } catch (e) {
            toast("复制失败，请手动选择错误文本");
          }
        };
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
              toast("已复制错误信息");
            }).catch(fallback);
          } else {
            fallback();
          }
        } catch (e) {
          fallback();
        }
      };
      var exportBtn = document.createElement("button");
      exportBtn.textContent = "导出当前歌曲 (.nbs)";
      exportBtn.onclick = function () {
        // Per-tab request. control_step on this tab consumes it and calls the
        // normal save/download path, including unsaved changes.
        window.__nbsExportRequested = true;
        toast("正在导出当前歌曲…");
        setTimeout(function () {
          if (window.__nbsExportRequested) {
            toast("导出请求未执行：游戏循环可能已停止。可先尝试“重新加载”。", 6500);
          }
        }, 3500);
      };
      var btn = document.createElement("button");
      btn.textContent = "重新加载";
      btn.onclick = function () { location.reload(); };
      el.appendChild(span);
      el.appendChild(exportBtn);
      el.appendChild(copy);
      el.appendChild(btn);
      document.body.appendChild(el);
    }
    var text = document.getElementById("nbs-fatal-text");
    var value = String(message || "未知错误");
    text.textContent = "运行错误：" + value.slice(0, 900);
    text.title = value;
  }

  // GameMaker's runtime catches many exceptions internally and only writes
  // them to the console. Surface those on the page too.
  (function () {
    if (console.__nbsWrapped) return;
    console.__nbsWrapped = true;
    var origError = console.error.bind(console);
    console.error = function () {
      try {
        var text = Array.prototype.map.call(arguments, function (x) {
          return x && x.stack ? x.stack : String(x);
        }).join(" ");
        if (/Unhandled Exception|unable to call function|is not a function|undefined is not/i.test(text)) {
          showFatal(text);
        }
      } catch (e) {}
      return origError.apply(null, arguments);
    };
  })();

  window.addEventListener("error", function (e) {
    if (e && (e.error || e.message)) showFatal(e.message || String(e.error));
  });
  window.addEventListener("unhandledrejection", function (e) {
    if (e && e.reason) showFatal(String(e.reason));
  });

  function hideLoading() {
    if (!loading) return;
    loading.classList.add("nbs-hidden");
    setTimeout(function () {
      if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
    }, 450);
  }

  // NBS relayouts from window_width/window_height every frame (control_draw),
  // so the canvas buffer and CSS size must stay in sync. Previously we only
  // sized it once, which made later browser resizes CSS-stretch the old frame.
  var resizeTimer = null;
  function sizeCanvasToViewport() {
    canvas = canvas || document.getElementById("canvas");
    if (!canvas) return;
    var w = Math.max(320, Math.floor(window.innerWidth));
    var h = Math.max(240, Math.floor(window.innerHeight));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    // DPR is pinned to 1 above, so CSS pixels and buffer pixels match exactly.
    // !important prevents GameMaker's own inline window sizing from creating
    // a buffer/CSS mismatch (which would stretch or crop the UI).
    canvas.style.setProperty("width", w + "px", "important");
    canvas.style.setProperty("height", h + "px", "important");
    canvas.style.setProperty("position", "fixed", "important");
    canvas.style.setProperty("left", "0", "important");
    canvas.style.setProperty("top", "0", "important");
    canvas.style.setProperty("right", "auto", "important");
    canvas.style.setProperty("bottom", "auto", "important");
    canvas.style.setProperty("margin", "0", "important");
    canvas.style.setProperty("transform", "none", "important");
    canvas.style.setProperty("max-width", "none", "important");
    canvas.style.setProperty("max-height", "none", "important");
    // If the compositor paints one old frame between the CSS/buffer update and
    // the next GameMaker draw, contain keeps it uniform instead of stretching.
    canvas.style.setProperty("object-fit", "contain", "important");
    canvas.style.setProperty("object-position", "left top", "important");
    canvas.style.display = "block";
    // GML reads these committed values; do not expose every intermediate drag
    // size or update_window() will resize the surface on every frame.
    window.__nbsViewportW = w;
    window.__nbsViewportH = h;
  }

  function preSize() {
    sizeCanvasToViewport();
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(sizeCanvasToViewport, 120);
    });
    // A tab can be resized while hidden; once visible, make the next frame use
    // the current viewport instead of the stale size.
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) setTimeout(sizeCanvasToViewport, 0);
    });
    window.addEventListener("beforeunload", function (e) {
      if (!window.__nbsDirty) return;
      e.preventDefault();
      e.returnValue = "";
      return "";
    });
  }

  function normalizeUrl(url) {
    if (typeof url !== "string") return url;
    return url.replace(/\\/g, "/");
  }

  // The GML uses Windows separators when it thinks os_type is Windows. Browsers
  // do not normalize backslashes in XHR URLs, so do it here.
  (function patchXHR() {
    if (!window.XMLHttpRequest) return;
    var open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      var args = Array.prototype.slice.call(arguments);
      args[1] = normalizeUrl(url);
      return open.apply(this, args);
    };
  })();

  function decodeToPcm(arrayBuffer) {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return Promise.resolve(null);
    var ctx = new Ctx();
    return ctx.decodeAudioData(arrayBuffer.slice(0)).then(function (audioBuffer) {
      var rate = 44100;
      var frames = Math.max(1, Math.ceil(audioBuffer.duration * rate));
      var Oac = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!Oac) {
        ctx.close();
        return null;
      }
      var offline = new Oac(2, frames, rate);
      var source = offline.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(offline.destination);
      source.start(0);
      return offline.startRendering().then(function (rendered) {
        var left = rendered.getChannelData(0);
        var right = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : left;
        var bytes = new Uint8Array(frames * 4);
        var view = new DataView(bytes.buffer);
        for (var i = 0; i < frames; i++) {
          var l = Math.max(-1, Math.min(1, left[i]));
          var r = Math.max(-1, Math.min(1, right[i]));
          // The native GMaudioTools decoder writes signed 16-bit little-endian
          // PCM. postbuild.mjs fixes the runtime's extra "- 1.0" conversion.
          view.setInt16(i * 4, l < 0 ? l * 0x8000 : l * 0x7fff, true);
          view.setInt16(i * 4 + 2, r < 0 ? r * 0x8000 : r * 0x7fff, true);
        }
        ctx.close();
        return bytes;
      });
    }).catch(function () {
      try { ctx.close(); } catch (e) {}
      return null;
    });
  }

  var pcmByName = Object.create(null);
  // Offline audio export reads the decoded instrument PCM from the page.
  window.__nbsPcmByName = pcmByName;
  window.__nbsDebug = { decoded: 0, errors: [] };

  // HTML5 GameMaker returns `undefined` for unset array cells and for INI keys
  // that are missing. Desktop GML treats those as 0 / "" / false. Patching each
  // call site is a losing game, so coerce at the runtime boundary instead.
  function installUndefinedCompat() {
    if (window.__nbsUndefinedCompat) return;
    window.__nbsUndefinedCompat = true;
    var debug = window.__nbsDebug || (window.__nbsDebug = { decoded: 0, errors: [] });
    if (typeof debug.coerced !== "number") debug.coerced = 0;
    if (!debug.coercedSamples) debug.coercedSamples = [];
    var specs = [
      ["yyGetReal", 0],
      ["yyGetInt32", 0],
      ["yyGetInt64", 0],
      ["yyGetString", ""],
      ["yyGetBool", false]
    ];
    specs.forEach(function (spec) {
      var name = spec[0];
      var fallback = spec[1];
      var original = window[name];
      if (typeof original !== "function") return;
      window[name] = function (value) {
        if (value === undefined || value === null) {
          debug.coerced++;
          if (debug.coercedSamples.length < 8) {
            debug.coercedSamples.push({
              fn: name,
              stack: String((new Error()).stack || "")
            });
          }
          return fallback;
        }
        return original.apply(this, arguments);
      };
    });
    debug.undefinedCompat = true;
  }

  // Merge the shipped template into whatever settings already exist. Upstream
  // adds keys regularly; a missing key must not turn into `undefined` later.
  function parseIniSections(text) {
    var lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/);
    var sections = [];
    var byName = Object.create(null);
    var current = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var header = /^\s*\[([^\]]+)\]\s*$/.exec(line);
      if (header) {
        current = { name: header[1], end: i + 1, keys: Object.create(null), lines: [] };
        sections.push(current);
        byName[current.name] = current;
        continue;
      }
      if (!current) continue;
      current.end = i + 1;
      current.lines.push(line);
      var eq = line.indexOf("=");
      if (eq > 0 && !/^\s*[;#]/.test(line)) {
        current.keys[line.slice(0, eq).trim()] = line;
      }
    }
    return { lines: lines, sections: sections, byName: byName };
  }

  function mergeIni(existing, template) {
    if (!existing) return template;
    var have = parseIniSections(existing);
    var tpl = parseIniSections(template);
    var inserts = [];
    var append = [];
    for (var s = 0; s < tpl.sections.length; s++) {
      var ts = tpl.sections[s];
      var target = have.byName[ts.name];
      var missing = [];
      for (var l = 0; l < ts.lines.length; l++) {
        var line = ts.lines[l];
        var eq = line.indexOf("=");
        if (eq <= 0 || /^\s*[;#]/.test(line)) {
          if (!target) missing.push(line);
          continue;
        }
        var key = line.slice(0, eq).trim();
        if (target && target.keys[key] !== undefined) continue;
        missing.push(line);
      }
      if (!missing.length) continue;
      if (target) {
        inserts.push({ at: target.end, lines: missing.slice() });
      } else {
        append.push("[" + ts.name + "]");
        append = append.concat(missing);
      }
    }
    // Apply insertions bottom-up so earlier indices stay valid.
    inserts.sort(function (a, b) { return b.at - a.at; });
    for (var i = 0; i < inserts.length; i++) {
      have.lines.splice.apply(have.lines, [inserts[i].at, 0].concat(inserts[i].lines));
    }
    var out = have.lines.join("\n").replace(/\s+$/, "");
    if (append.length) out += (out ? "\n" : "") + append.join("\n");
    return out + "\n";
  }

  function ensureSettings() {
    try {
      return fetch("default-settings.ini", { cache: "no-store" })
        .then(function (r) { return r.ok ? r.text() : ""; })
        .then(function (template) {
          if (!template) return;
          var lastMerged = "";
          for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (!key || key.indexOf(".settings") < 0) continue;
            var value = localStorage.getItem(key) || "";
            var next = value ? mergeIni(value, template) : template;
            next = next.replace(/acrylic="1"/g, 'acrylic="0"');
            lastMerged = next;
            if (next !== value) localStorage.setItem(key, next);
          }
          var initial = lastMerged || template.replace(/acrylic="1"/g, 'acrylic="0"');
          for (var c = 0; c < 2; c++) {
            var canonical = c === 0
              ? "NoteBlockStudio.0.NoteBlockStudio.0.settings_dev.ini"
              : "NoteBlockStudio.0.NoteBlockStudio.0.settings.ini";
            if (localStorage.getItem(canonical) === null) {
              localStorage.setItem(canonical, initial);
            }
          }
        })
        .catch(function () {});
    } catch (e) {}
    return Promise.resolve();
  }

  function loadSounds() {
    return fetch("sounds.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) {
        if (!Array.isArray(list) || list.length === 0) return;
        var done = 0;
        setStatus("正在解码音色… 0/" + list.length);
        return Promise.all(list.map(function (item) {
          return fetch(encodeURI(normalizeUrl(item.path)), { cache: "force-cache" })
            .then(function (r) { return r.ok ? r.arrayBuffer() : null; })
            .then(function (buf) {
              if (!buf) return null;
              return decodeToPcm(buf).then(function (pcm) {
                if (pcm) {
                  pcmByName[item.name] = pcm;
                  window.__nbsDebug.decoded = Object.keys(pcmByName).length;
                } else {
                  window.__nbsDebug.errors.push(item.name);
                }
                done++;
                setStatus("正在解码音色… " + done + "/" + list.length);
              });
            })
            .catch(function () {});
        }));
      })
      .catch(function () {});
  }

  // postbuild.mjs rewrites the generated HTML5 runtime to call these hooks.
  window.__nbsTakeSound = function (src) {
    var base = normalizeUrl(String(src)).split("/").pop();
    var pcm = pcmByName[base];
    if (!pcm) return -1;
    window.__nbsPcm = pcm;
    window.__nbsPcmPending = true;
    return 0;
  };
  window.__nbsSoundExists = function (path) {
    var base = normalizeUrl(String(path)).split("/").pop();
    return !!pcmByName[base];
  };

  function startGame() {
    var gm = window.GameMaker_Init;
    if (typeof gm !== "function") {
      console.error("[NBS] GameMaker_Init not found");
      return;
    }
    installUndefinedCompat();
    window.__nbsDebug.audioShim = window.__nbsPatched === true;
    window.__nbsDebug.audioFixed = window.__nbsAudioFixed === true;
    setStatus("正在启动…");
    // Keep the custom loading screen until GML draws its first frame. A fixed
    // timeout exposes GameMaker's own loading screen on slow first loads.
    window.__nbsGameReady = function () {
      hideLoading();
    };
    gm();
    // GameMaker may adjust the canvas to the application_surface size during
    // init. Force it back to the real viewport so CSS never scales the frame.
    setTimeout(sizeCanvasToViewport, 0);
    setTimeout(sizeCanvasToViewport, 300);
  }

  makeLoading();
  preSize();
  // Do not rewrite canvas.width/height on resize: that resets GameMaker's
  // WebGL surface and causes white screens. The game is sized once at startup.

  // The HTML normally assigns window.onload = GameMaker_Init. Cancel that and
  // start only after the OGG samples have been decoded.
  window.onload = null;
  window.addEventListener("load", function () {
    Promise.all([loadSounds(), ensureSettings()]).then(startGame);
  });
})();
