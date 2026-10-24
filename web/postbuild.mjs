// Post-build transform for the stock GameMaker HTML5 export.
// No file in the upstream source tree is modified.
//
// Usage: node postbuild.mjs <html5-output-dir>
import { copyFileSync, cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const out = resolve(process.argv[2] ?? ".");
const htmlPath = join(out, "nbsweb.html");
const gameDir = join(out, "noteblockstudio");
if (!existsSync(htmlPath) || !existsSync(gameDir)) {
  console.error("HTML5 output not found in", out);
  process.exit(1);
}

function walk(dir, exts) {
  const result = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) result.push(...walk(p, exts));
    else if (exts.some((e) => name.toLowerCase().endsWith(e))) result.push(p);
  }
  return result;
}

// --- 1. sound manifest -------------------------------------------------------
const soundsDir = join(gameDir, "Data", "Sounds");
const sounds = [];
if (existsSync(soundsDir)) {
  for (const p of walk(soundsDir, [".ogg"])) {
    const rel = relative(out, p).split(sep).join("/");
    sounds.push({ name: p.split(/[\\/]/).pop(), path: rel });
  }
}
writeFileSync(join(out, "sounds.json"), JSON.stringify(sounds), "utf8");

// Lowercase aliases so the desktop-oriented GML's "data/sounds/..." paths work
// on case-sensitive hosts such as Cloudflare Workers.
for (const [from, to] of [
  [join(gameDir, "Data", "Sounds"), join(gameDir, "data", "sounds")],
  [join(gameDir, "Songs"), join(gameDir, "songs")],
  [join(gameDir, "Patterns"), join(gameDir, "patterns")]
]) {
  if (existsSync(from) && !existsSync(to)) {
    cpSync(from, to, { recursive: true });
  }
}

// --- 2. locate obfuscated runtime symbols -----------------------------------
const gameJs = readdirSync(gameDir).find((n) => n === "Minecraft Note Block Studio.js");
if (!gameJs) {
  console.error("Game JS not found in", gameDir);
  process.exit(1);
}
const jsPath = join(gameDir, gameJs);
let js = readFileSync(jsPath, "utf8");

const audioMatch = js.match(/"audio_file_decode"[\s\S]{0,1500}?(?:var|let)\s+\w+\s*=\s*(\w+)\([^;]{0,500}?"tmp\.file"/);
const bufferMatch = js.match(/"buffer_load"[\s\S]{0,800}?\.\w+\s*=\s*(\w+)\([^;]{0,500}?"tmp\.file"/);
const existsMatch = js.match(/"Load instrument"[\s\S]{0,400}?!yyGetBool\((\w+)\(\w+\)\)/);
const audioSym = audioMatch && audioMatch[1];
const bufferSym = bufferMatch && bufferMatch[1];
const existsSym = existsMatch && existsMatch[1];

if (!audioSym || !bufferSym) {
  console.error("Could not locate HTML5 audio symbols (audio=%s buffer=%s)", audioSym, bufferSym);
  process.exit(1);
}

const bufferDef = new RegExp("function\\s+" + bufferSym + "\\s*\\(([^)]*)\\)\\{");
const bufferDefMatch = js.match(bufferDef);
const bufferParam = bufferDefMatch && bufferDefMatch[1].split(",")[0].trim();
const bufferSlice = bufferDefMatch ? js.slice(bufferDefMatch.index, bufferDefMatch.index + 2000) : "";
const wrapMatch =
  bufferSlice.match(/Uint8Array[\s\S]{0,500}?return\s+(\w+)\(/) ||
  bufferSlice.match(/return\s+(\w+)\(/);
const wrapSym = wrapMatch && wrapMatch[1];

if (!bufferParam || !wrapSym) {
  console.error("Could not locate buffer_load internals (param=%s wrap=%s)", bufferParam, wrapSym);
  process.exit(1);
}

// --- 3. patch the generated JS ---------------------------------------------
// audio_file_decode_ogg stub -> callback into wrapper.js
const audioStub = new RegExp("function\\s+" + audioSym + "\\s*\\([^)]*\\)\\s*\\{\\s*return\\s+0\\s*\\}");
if (!audioStub.test(js)) {
  console.error("Could not find audio stub body for", audioSym);
  process.exit(1);
}
// This symbol is also the HTML5 "unsupported function" stub used by
// open_url/file_dnd/Python/etc. Only route the audio decode call (destination
// tmp.file) to the PCM shim; all other calls keep the original return 0.
js = js.replace(
  audioStub,
  `function ${audioSym}(src,dest){` +
    `if(dest&&String(dest).indexOf("tmp.file")>=0&&window.__nbsTakeSound)return window.__nbsTakeSound(src,dest);` +
    `return 0}`
);

// buffer_load: serve the current decoded PCM only once, for the audio temp
// path. A persistent __nbsPcm would contaminate schematic/non-audio loads.
const bufferInjection =
  `function ${bufferSym}(${bufferParam}){` +
  `if(window.__nbsPcmPending&&window.__nbsPcm&&String(${bufferParam}).indexOf("tmp.file")>=0){` +
  `window.__nbsPcmPending=false;return ${wrapSym}(window.__nbsPcm);}`;
js = js.replace(bufferDef, bufferInjection);

// audio_create_buffer_sound: the HTML5 runtime reads signed s16 samples but
// subtracts 1.0 (an unsigned-PCM conversion), which creates a large DC offset
// and crackle. Remove that - 1.0 for this build.
const soundMatch = js.match(/gmlsound=(\w+)\(/);
const soundSym = soundMatch && soundMatch[1];
if (!soundSym) {
  console.error("Could not locate audio_create_buffer_sound call site");
  process.exit(1);
}
const soundStart = js.search(new RegExp("function\\s+" + soundSym + "\\s*\\("));
if (soundStart < 0) {
  console.error("Could not locate audio_create_buffer_sound definition", soundSym);
  process.exit(1);
}
const soundSlice = js.slice(soundStart, soundStart + 8000);
if (!soundSlice.includes("getChannelData") || !soundSlice.includes("Math.pow(2,")) {
  console.error("Unexpected audio_create_buffer_sound body for", soundSym);
  process.exit(1);
}
const fixedSlice = soundSlice.replace(/(\/[A-Za-z0-9_$]+\))-1\.0/, "$1");
if (fixedSlice === soundSlice) {
  console.error("Could not find the signedness conversion in", soundSym);
  process.exit(1);
}
js = js.slice(0, soundStart) + fixedSlice + js.slice(soundStart + soundSlice.length);

// file_exists: treat a bundled/pre-decoded sound as present
if (existsSym) {
  const existsDef = new RegExp("function\\s+" + existsSym + "\\s*\\(([^)]*)\\)\\{");
  const existsParam = (js.match(existsDef) || [])[1]?.split(",")[0]?.trim();
  if (existsParam) {
    js = js.replace(
      existsDef,
      `function ${existsSym}(${existsParam}){if(window.__nbsSoundExists&&window.__nbsSoundExists(${existsParam}))return true;`
    );
  }
}

// Native-only calls are stubs on HTML5. Return a harmless value instead of
// letting undefined flow back into window/audio code.
for (const name of ["external_call", "external_define", "display_reset"]) {
  const re = new RegExp(
    "function\\s+(\\w+)\\(([^)]*)\\)\\{\\w+\\(\"" + name + "\\(\\)\"\\);?\\}"
  );
  js = js.replace(re, (_m, fn, args) => `function ${fn}(${args}){return 0}`);
}

// File dialogs are empty stubs in the stock HTML5 runtime. Route them to the
// JS bridge: open triggers a picker and returns "" (the GML poll loads the
// inbox later); save returns a fake path that buffer_export turns into a
// download.
for (const [name, kind] of [
  ["get_open_filename_ext", "open"],
  ["get_save_filename_ext", "save"]
]) {
  const re = new RegExp(
    "function\\s+(\\w+)\\(([^)]*)\\)\\{\\w+\\(\"" + name + "\\(\\)\"\\);?\\}"
  );
  js = js.replace(re, (_m, fn, args) => {
    if (kind === "open") {
      return `function ${fn}(${args}){if(window.nbs_js_pick_file)nbs_js_pick_file(arguments[0]);return ""}`;
    }
    return `function ${fn}(${args}){if(window.nbs_js_prompt){var n=nbs_js_prompt(arguments[3],arguments[1]);if(!n)return "";return "__web_save__"+n}return ""}`;
  });
}

// The HTML5 cursor map does not cover every Windows cursor constant used by
// the editor (e.g. the hand cursor) and throws, which can freeze the game.
// Ignore unsupported cursor types instead of aborting.
const cursorThrows = (js.match(/\w+\("Cursor type is not supported\."\);/g) || []).length;
js = js.replace(/\w+\("Cursor type is not supported\."\);/g, "");

// Browser caches tph_nbs_web.js independently of the page. Bust it on every
// build so new extension functions are actually loaded after a deploy.
js = js.replace(/"tph_nbs_web\.js"/g, '"tph_nbs_web.js?v=' + Date.now() + '"');
js += "\n;window.__nbsPatched=true;\n;window.__nbsAudioFixed=true;\n";
writeFileSync(jsPath, js, "utf8");

// --- 4. HTML wrapper --------------------------------------------------------
copyFileSync(resolve("web/wrapper.js"), join(out, "wrapper.js"));
copyFileSync(resolve("web/default-settings.ini"), join(out, "default-settings.ini"));
copyFileSync(resolve("web/vendor/fflate.min.js"), join(out, "fflate.min.js"));
copyFileSync(resolve("web/vendor/lame.min.js"), join(out, "lame.min.js"));
const nbsIcon = resolve("NoteBlockStudio-3.12.0-beta.5", "options", "windows", "icons", "icon.ico");
if (!existsSync(nbsIcon)) {
  console.error("NBS project icon not found at", nbsIcon);
  process.exit(1);
}
copyFileSync(nbsIcon, join(out, "favicon.ico"));
let html = readFileSync(htmlPath, "utf8");
let htmlChanged = false;
const titleTag = /<title[\s\S]*?<\/title>/i;
if (titleTag.test(html)) {
  if (!/<title>NBSweb<\/title>/i.test(html)) {
    html = html.replace(titleTag, "<title>NBSweb</title>");
    htmlChanged = true;
  }
} else {
  html = html.replace("</head>", "        <title>NBSweb</title>\n    </head>");
  htmlChanged = true;
}
if (!html.includes('src="lame.min.js"')) {
  html = html.replace("</head>", '        <script src="lame.min.js?v=' + Date.now() + '"></script>\n    </head>');
  htmlChanged = true;
}
if (!html.includes('src="fflate.min.js"')) {
  html = html.replace("</head>", '        <script src="fflate.min.js?v=' + Date.now() + '"></script>\n    </head>');
  htmlChanged = true;
}
if (!html.includes('rel="icon"')) {
  html = html.replace("</head>", '        <link rel="icon" type="image/x-icon" href="favicon.ico?v=' + Date.now() + '">\n    </head>');
  htmlChanged = true;
}
if (!html.includes('src="wrapper.js"')) {
  html = html.replace("</body>", '        <script src="wrapper.js?v=' + Date.now() + '"></script>\n    </body>');
  htmlChanged = true;
}
if (htmlChanged) writeFileSync(htmlPath, html, "utf8");
copyFileSync(htmlPath, join(out, "index.html"));

// The stock export ships desktop-only Python/ffmpeg/7za/DLL assets. Keeping
// them in the public web deployment wastes >30 MB and exposes binaries that
// HTML5 never requests. Keep only files the browser runtime uses.
function trimDesktopAssets(root) {
  for (const rel of ["noteblockstudio/Data/Fonts", "noteblockstudio/Data/Python"]) {
    rmSync(join(root, rel), { recursive: true, force: true });
  }
  const dropExt = new Set([".exe", ".dll", ".bat", ".plist", ".c"]);
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (dropExt.has(name.slice(name.lastIndexOf(".")).toLowerCase())) rmSync(p, { force: true });
    }
  };
  walk(join(root, "noteblockstudio"));
  for (const rel of ["noteblockstudio/wph_libzoom.zip", "igor.output.manifest", "nbsweb.html", ".assetsignore"]) {
    rmSync(join(root, rel), { force: true });
  }
}
trimDesktopAssets(out);

console.log(
  `Post-build: ${sounds.length} sounds; audio=${audioSym}; buffer=${bufferSym}; wrap=${wrapSym}; exists=${existsSym || "n/a"}`
);
