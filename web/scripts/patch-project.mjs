// Apply the minimal build-time patches to a copied GameMaker project.
// The upstream source tree is never modified.
//
// Usage: node patch-project.mjs <build-project-dir>
import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const project = resolve(process.argv[2] ?? ".");
const repo = resolve(".");
const patches = join(repo, "web", "patches");

if (!existsSync(join(project, "Minecraft Note Block Studio.yyp"))) {
  console.error("Project .yyp not found in", project);
  process.exit(1);
}

cpSync(join(patches, "extensions", "nbs_web"), join(project, "extensions", "nbs_web"), { recursive: true });
for (const name of [
  "web_file_bridge",
  "buffer_import",
  "buffer_export",
  "file_exists_lib",
  "save_song",
  "load_song",
  "control_step",
  "update_window",
  "change_theme",
  "blur_scripts_alt",
  "wallpaper_init",
  "question",
  "message_yesnocancel",
  "safe_real",
  "shift_layers",
  "open_url",
  "check_updates",
  "update_window_icon",
  "gzzip",
  "gzunzip",
  "datapack_getextranotes",
  "datapack_getinstextures",
  "dat_writefile",
  "pack_instruments"
]) {
  cpSync(join(patches, "scripts", name), join(project, "scripts", name), { recursive: true });
}

// Git may check the source out with CRLF on Windows. The patch anchors below
// are written with LF, so normalize the copied project before editing it.
function normalizeTextLineEndings(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      normalizeTextLineEndings(path);
    } else if (/\.(gml|yy|txt)$/i.test(name)) {
      const source = readFileSync(path, "utf8");
      if (source.includes("\r\n")) writeFileSync(path, source.replaceAll("\r\n", "\n"), "utf8");
    }
  }
}
normalizeTextLineEndings(project);

const yypPath = join(project, "Minecraft Note Block Studio.yyp");
let yyp = readFileSync(yypPath, "utf8");
const resources = [];
if (!yyp.includes('"name":"nbs_web"')) {
  resources.push('    {"id":{"name":"nbs_web","path":"extensions/nbs_web/nbs_web.yy",},"order":0,},');
}
if (!yyp.includes('"name":"web_file_bridge"')) {
  resources.push('    {"id":{"name":"web_file_bridge","path":"scripts/web_file_bridge/web_file_bridge.yy",},"order":1,},');
}
if (!yyp.includes('"name":"safe_real"')) {
  resources.push('    {"id":{"name":"safe_real","path":"scripts/safe_real/safe_real.yy",},"order":2,},');
}
if (resources.length) {
  yyp = yyp.replace(/"resources": \[\r?\n/, (m) => m + resources.join("\n") + "\n");
  writeFileSync(yypPath, yyp, "utf8");
}

// Upstream shrinks the browser canvas by 5 px on startup. That makes the
// canvas buffer (browser_width - 5) differ from the CSS size (100vw), so the
// whole UI is scaled by ~1%. The wrapper owns viewport sizing now; use the
// exact browser size so buffer pixels and CSS pixels stay 1:1.
const controlCreatePath = join(project, "scripts", "control_create", "control_create.gml");
let controlCreate = readFileSync(controlCreatePath, "utf8");

const oldBrowserSizeBlock =
  /window_set_min_width\(800\)\s*window_set_min_height\(500\)\s*if \(os_browser != browser_not_a_browser\) window_set_size\(browser_width - 5, browser_height - 5\)/;
const newBrowserSizeBlock = `if (os_browser != browser_not_a_browser) {
		// The wrapper owns the viewport. Do not clamp to the desktop 800x500
		// minimum; narrow/zoomed browser windows must still fill the page.
		window_set_min_width(320)
		window_set_min_height(240)
		window_set_size(browser_width, browser_height)
	} else {
		window_set_min_width(800)
		window_set_min_height(500)
	}`;
if (!oldBrowserSizeBlock.test(controlCreate)) {
  console.error("Expected browser window-size block not found in control_create.gml");
  process.exit(1);
}
controlCreate = controlCreate.replace(oldBrowserSizeBlock, newBrowserSizeBlock);

const oldMinSizeBlock =
  /if \(!macos_is_retina\(\)\) \{\s*window_set_min_width\(800 \* window_scale\)\s*window_set_min_height\(500 \* window_scale\)\s*\} else \{\s*window_set_min_width\(800 \* window_scale \/ 2\)\s*window_set_min_height\(500 \* window_scale \/ 2\)\s*\}/;
const newMinSizeBlock = `if (os_browser != browser_not_a_browser) {
		window_set_min_width(320)
		window_set_min_height(240)
	} else if (!macos_is_retina()) {
		window_set_min_width(800 * window_scale)
		window_set_min_height(500 * window_scale)
	} else {
		window_set_min_width(800 * window_scale / 2)
		window_set_min_height(500 * window_scale / 2)
	}`;
if (!oldMinSizeBlock.test(controlCreate)) {
  console.error("Expected minimum-window-size block not found in control_create.gml");
  process.exit(1);
}
controlCreate = controlCreate.replace(oldMinSizeBlock, newMinSizeBlock);
writeFileSync(controlCreatePath, controlCreate, "utf8");

// Drop mode draws 52 keys starting at key 0; the last black pair can be
// c1=87, c2=88. Upstream guards c1 but then indexes piano_key[88]. Guard both
// the black and white key branches; the piano array has 88 entries (0..87).
const drawPianoPath = join(project, "scripts", "draw_piano", "draw_piano.gml");
let drawPiano = readFileSync(drawPianoPath, "utf8");
const oldSharpGuard = "if (c1 >= 88) continue";
if (!drawPiano.includes(oldSharpGuard)) {
  console.error("Expected black-key bounds guard not found in draw_piano.gml");
  process.exit(1);
}
drawPiano = drawPiano.replace(oldSharpGuard, "if (c1 < 0 || c2 < 0 || c1 >= 88 || c2 >= 88) continue");
const oldWhiteKey =
  /(c1 = startkey \+ sharpkeys \+ b)\s*(k1 = \(show_keyboard && piano_key\[c1\] > 0\))/;
if (!oldWhiteKey.test(drawPiano)) {
  console.error("Expected white-key block not found in draw_piano.gml");
  process.exit(1);
}
drawPiano = drawPiano.replace(oldWhiteKey, "$1\n\t        if (c1 < 0 || c1 >= 88) continue\n\t        $2");
writeFileSync(drawPianoPath, drawPiano, "utf8");

const drawPianoKeyPath = join(project, "scripts", "draw_piano_key", "draw_piano_key.gml");
let drawPianoKey = readFileSync(drawPianoKeyPath, "utf8");
const oldKeyBody = "function draw_piano_key(isblack, xx, yy, color, alpha, key, showkeybind, showclicks, ispressed) {\n\t\n\tvar sprite_offset = 0;";
const newKeyBody = "function draw_piano_key(isblack, xx, yy, color, alpha, key, showkeybind, showclicks, ispressed) {\n\tif (key < 0 || key >= 88) return;\n\t\n\tvar sprite_offset = 0;";
if (!drawPianoKey.includes(oldKeyBody)) {
  console.error("Expected draw_piano_key body not found");
  process.exit(1);
}
drawPianoKey = drawPianoKey.replace(oldKeyBody, newKeyBody);
writeFileSync(drawPianoKeyPath, drawPianoKey, "utf8");

// Tell the page wrapper when the first real game frame is being drawn, so it
// can keep its own loading screen up instead of exposing GameMaker's loading
// screen on slow first loads.
const controlDrawPath = join(project, "scripts", "control_draw", "control_draw.gml");
let controlDraw = readFileSync(controlDrawPath, "utf8");
const drawHeader = "function control_draw() {\n\t// control_draw()";
if (!controlDraw.includes(drawHeader)) {
  console.error("Expected control_draw header not found");
  process.exit(1);
}
controlDraw = controlDraw.replace(
  drawHeader,
  drawHeader +
    "\n\tif (os_browser != browser_not_a_browser && !variable_global_exists(\"nbs_web_ready\")) {\n" +
    "\t\tglobal.nbs_web_ready = 1\n" +
    "\t\tnbs_js_game_ready()\n" +
    "\t}"
);
writeFileSync(controlDrawPath, controlDraw, "utf8");

// Audio export: desktop uses Python/ffmpeg. Browser captures the in-memory NBS
// bytes and offline-renders WAV/MP3 (no MediaRecorder, no real-time playback).
const audioExportPath = join(project, "scripts", "audio_export", "audio_export.gml");
let audioExport = readFileSync(audioExportPath, "utf8");
const audioExportInsert = '\tif (fn = "") return 0';
if (!audioExport.includes(audioExportInsert)) {
  console.error("Expected audio_export save-dialog block not found");
  process.exit(1);
}
audioExport = audioExport.replace(
  audioExportInsert,
  audioExportInsert +
    "\n\n\tif (os_browser != browser_not_a_browser) {\n" +
    "\t\tvar web_name = filename_name(fn)\n" +
    "\t\tif (string_pos(\"__web_save__\", web_name) == 1) web_name = string_delete(web_name, 1, string_length(\"__web_save__\"))\n" +
    "\t\tglobal.web_audio_capture = 1\n" +
    "\t\tglobal.web_audio_b64 = \"\"\n" +
    "\t\tsave_song(\"__web_audio__.nbs\", false, false, 5)\n" +
    "\t\tvar web_nbs = global.web_audio_b64\n" +
    "\t\tglobal.web_audio_b64 = \"\"\n" +
    "\t\tif (web_nbs == \"\") {\n" +
    "\t\t\tmessage(condstr(language != 1, \"Could not prepare the song for audio export.\", \"无法为音频导出准备歌曲。\"), condstr(language != 1, \"Audio Export\", \"音频导出\"))\n" +
    "\t\t\treturn 0\n" +
    "\t\t}\n" +
    "\t\tnbs_js_export_audio(web_nbs, web_name, audio_exp_format)\n" +
    "\t\treturn 0\n" +
    "\t}"
);
writeFileSync(audioExportPath, audioExport, "utf8");

// Data-pack export still needs a real ZIP builder. Do not write temp files
// into localStorage and then claim success in the browser.
const datapackPath = join(project, "scripts", "datapack_export", "datapack_export.gml");
let datapack = readFileSync(datapackPath, "utf8");
const datapackHeader = "function datapack_export() {\n\t// datapack_export()";
if (!datapack.includes(datapackHeader)) {
  console.error("Expected datapack_export header not found");
  process.exit(1);
}
datapack = datapack.replace(
  datapackHeader,
  datapackHeader + "\n\tglobal.web_zip_paths = []\n\tglobal.web_zip_data = []"
);
const oldDatapackShell =
  /if \(o\.dat_usezip\) \{[\s\S]*?directory_delete_lib\(tempdir\)/;
if (!oldDatapackShell.test(datapack)) {
  console.error("Expected datapack shell block not found");
  process.exit(1);
}
datapack = datapack.replace(
  oldDatapackShell,
  `if (os_browser != browser_not_a_browser) {
		var web_json = "{"
		var web_first = true
		for (var wi = 0; wi < array_length(global.web_zip_paths); wi++) {
			if (!web_first) web_json += ","
			web_first = false
			web_json += "\\"" + global.web_zip_paths[wi] + "\\":\\"" + global.web_zip_data[wi] + "\\""
		}
		web_json += "}"
		var web_name = filename_name(fn)
		if (string_pos("__web_save__", web_name) == 1) web_name = string_delete(web_name, 1, string_length("__web_save__"))
		nbs_js_zip_download(web_name, web_json)
		global.web_zip_paths = []
		global.web_zip_data = []
	} else {
		if (o.dat_usezip) {
			if (os_type = os_macosx) execute_program("ditto", "-c -k \\"" + game_save_id + "tempdatapack" + "\\" \\"" + fn + "\\"", true);
			else execute_program(get_7z_exc_name(), "a -tzip \\"" + fn + "\\" \\"" + game_save_id + "tempdatapack" + condstr(os_type = os_windows, "\\\\", "/") + "*\\"", true)
		} else {
			if (os_type = os_windows) execute_program("Xcopy", @'/E /I /Q /Y "' + filename_dir(tempdir) + @'" "' + fn + @'"', true)
			else execute_program("cp", "-r \\"" + game_save_id + "tempdatapack\\" \\"" + fn + "/\\"", true);
		}
	}
	directory_delete_lib(tempdir)`
);
writeFileSync(datapackPath, datapack, "utf8");

// Schematic/track exports already have the finished bytes in a buffer. Encode
// that buffer directly in the browser instead of relying on buffer_save /
// buffer_load(temp_file), which is fragile in HTML5 virtual storage.
const schematicExportPath = join(project, "scripts", "schematic_export", "schematic_export.gml");
let schematicExport = readFileSync(schematicExportPath, "utf8");
const schematicSave3 =
  /buffer_save\(buffer, temp_file\)\s*buffer_delete\(buffer\)\s*gzzip\(temp_file, fn\)/;
if (!schematicSave3.test(schematicExport)) {
  console.error("Expected schematic buffer export block not found");
  process.exit(1);
}
schematicExport = schematicExport.replace(
  schematicSave3,
  `if (os_browser != browser_not_a_browser) {
		var web_name = filename_name(fn)
		if (string_pos("__web_save__", web_name) == 1) web_name = string_delete(web_name, 1, string_length("__web_save__"))
		nbs_js_gzip_download(web_name, buffer_base64_encode(buffer, 0, buffer_get_size(buffer)))
	} else {
		buffer_save(buffer, temp_file)
		gzzip(temp_file, fn)
	}
	buffer_delete(buffer)`
);
writeFileSync(schematicExportPath, schematicExport, "utf8");

const trackExportPath = join(project, "scripts", "track_export", "track_export.gml");
let trackExport = readFileSync(trackExportPath, "utf8");
const trackSave3 =
  /buffer_save\(buffer, temp_file\)\s*buffer_delete\(buffer\)\s*log\("totalblocksc: " \+ string\(totalblocksc\)\)\s*totalblocksc = 0\s*gzzip\(temp_file, fn\)/;
if (!trackSave3.test(trackExport)) {
  console.error("Expected track buffer export block not found");
  process.exit(1);
}
trackExport = trackExport.replace(
  trackSave3,
  `if (os_browser != browser_not_a_browser) {
		var web_name = filename_name(fn)
		if (string_pos("__web_save__", web_name) == 1) web_name = string_delete(web_name, 1, string_length("__web_save__"))
		nbs_js_gzip_download(web_name, buffer_base64_encode(buffer, 0, buffer_get_size(buffer)))
	} else {
		buffer_save(buffer, temp_file)
		gzzip(temp_file, fn)
	}
	buffer_delete(buffer)
	log("totalblocksc: " + string(totalblocksc))
	totalblocksc = 0`
);
writeFileSync(trackExportPath, trackExport, "utf8");

const schematicSavePath = join(project, "scripts", "schematic_save", "schematic_save.gml");
let schematicSave = readFileSync(schematicSavePath, "utf8");
const branchSave3 =
  /buffer_save\(file, temp_file\)\s*log \("buffer size " \+ string\(buffer_get_size\(file\)\)\)\s*buffer_delete\(file\)\s*\/\/ Compress using Gzip and clean up\s*gzzip\(temp_file, filen\)\s*file_delete\(temp_file\);/;
if (!branchSave3.test(schematicSave)) {
  console.error("Expected branch buffer export block not found");
  process.exit(1);
}
schematicSave = schematicSave.replace(
  branchSave3,
  `if (os_browser != browser_not_a_browser) {
		var web_name = filename_name(filen)
		if (string_pos("__web_save__", web_name) == 1) web_name = string_delete(web_name, 1, string_length("__web_save__"))
		nbs_js_gzip_download(web_name, buffer_base64_encode(file, 0, buffer_get_size(file)))
	} else {
		buffer_save(file, temp_file)
		gzzip(temp_file, filen)
		file_delete(temp_file)
	}
	buffer_delete(file)`
);
writeFileSync(schematicSavePath, schematicSave, "utf8");

// Acrylic needs desktop wallpaper capture and a paid blur extension. Disable
// the preference checkbox in the browser instead of letting it crash on draw.
const prefsPath = join(project, "scripts", "draw_window_preferences", "draw_window_preferences.gml");
let prefs = readFileSync(prefsPath, "utf8");
const oldAcrylicToggle = "theme != 3, true)) {acrylic = !acrylic change_theme()}";
const newAcrylicToggle =
  "theme != 3 || os_browser != browser_not_a_browser, true)) {acrylic = !acrylic change_theme()}";
const acrylicToggleCount = prefs.split(oldAcrylicToggle).length - 1;
if (acrylicToggleCount !== 2) {
  console.error(`Expected 2 acrylic checkbox lines, found ${acrylicToggleCount}`);
  process.exit(1);
}
prefs = prefs.replaceAll(oldAcrylicToggle, newAcrylicToggle);

// Upstream only saves preferences immediately for non-Fluent themes
// (theme != 3). Fluent relies on the desktop app-exit save, which does not
// exist on a browser refresh. Always save when the browser dialog closes.
const oldPrefsClose =
  /if \(theme != 3\) \{\s*window = 0\s*window_set_cursor\(curs\)\s*save_settings\(\)\s*\} else \{\s*if \(windowopen = 1\) windowclose = 1\s*\}/;
const newPrefsClose = `if (os_browser != browser_not_a_browser) {
			save_settings()
			if (windowopen = 1) windowclose = 1
		} else if (theme != 3) {
			window = 0
			window_set_cursor(curs)
			save_settings()
		} else {
			if (windowopen = 1) windowclose = 1
		}`;
if (!oldPrefsClose.test(prefs)) {
  console.error("Expected preferences close/save block not found");
  process.exit(1);
}
prefs = prefs.replace(oldPrefsClose, newPrefsClose);

// Fluent's top-left back arrow closes the window without going through the
// OK branch; save in the browser before closing.
const oldPrefsBack =
  /if \(mouse_rectangle_click\(x1, y1 \+ 30, 40, 40\) && windowopen = 1\) \{\s*if \(windowsound && theme = 3\) play_sound\(soundgoback, 45, 100, 100, 0\)\s*windowclose = 1\s*\}/;
const newPrefsBack = `if (mouse_rectangle_click(x1, y1 + 30, 40, 40) && windowopen = 1) {
				if (windowsound && theme = 3) play_sound(soundgoback, 45, 100, 100, 0)
				if (os_browser != browser_not_a_browser) save_settings()
				windowclose = 1
			}`;
if (!oldPrefsBack.test(prefs)) {
  console.error("Expected preferences back-button block not found");
  process.exit(1);
}
prefs = prefs.replace(oldPrefsBack, newPrefsBack);

// Folder pickers reuse the file-save dialog, which writes "__web_save__..."
// into song/pattern paths in the browser. Disable Open/Change; "Use default"
// remains available.
const folderButtonRe =
  /draw_button2\(x1 \+ 40, y1 \+ (?:246|296) \+ \(theme = 3\) \* 22, 76, "(?:Open|Change|打开|修改)", 0, 1\)/g;
const folderButtonCount = (prefs.match(folderButtonRe) || []).length;
if (folderButtonCount !== 4) {
  console.error(`Expected 4 folder buttons, found ${folderButtonCount}`);
  process.exit(1);
}
prefs = prefs.replace(folderButtonRe, (m) =>
  m.replace(", 0, 1)", ", os_browser != browser_not_a_browser, 1)")
);
writeFileSync(prefsPath, prefs, "utf8");

// message_yesnocancel returns -1 for Cancel; upstream treats that as truthy
// and removes an instrument without confirmation. Require an explicit Yes.
const instrumentsPath = join(project, "scripts", "draw_window_instruments", "draw_window_instruments.gml");
let instruments = readFileSync(instrumentsPath, "utf8");
for (const confirm of [
  'message_yesnocancel("This will remove " + string(userselect.num_blocks) + " block" + condstr(userselect.num_blocks > 1, "s") + " using this instrument and cannot be undone. Confirm?", "Warning")',
  'message_yesnocancel("这将移除使用该音色的 " + string(userselect.num_blocks) + " 个方块并且不能撤销。确定吗？", "警告")'
]) {
  if (!instruments.includes(confirm)) {
    console.error("Expected instrument remove confirmation not found");
    process.exit(1);
  }
  instruments = instruments.replace(confirm, confirm + " == 1");
}
const oldInstrumentSong = "var cursong = songs[song]";
if (!instruments.includes(oldInstrumentSong)) {
  console.error("Expected instrument window song reference not found");
  process.exit(1);
}
instruments = instruments.replace(
  oldInstrumentSong,
  oldInstrumentSong + "\n\tinsselect = median(-1, insselect, ds_list_size(cursong.instrument_list) - 1)"
);
for (const [oldImport, newImport] of [
  [
    'if (draw_button2(x1 + 455, y1 + 9, 80, "Import", 0, 1)) load_instruments("")',
    'if (draw_button2(x1 + 455, y1 + 9, 80, "Import", 0, 1)) { global.web_pick_mode = "instruments"; load_instruments("") }'
  ],
  [
    'if (draw_button2(x1 + 455, y1 + 9, 80, "导入", 0, 1)) load_instruments("")',
    'if (draw_button2(x1 + 455, y1 + 9, 80, "导入", 0, 1)) { global.web_pick_mode = "instruments"; load_instruments("") }'
  ]
]) {
  if (!instruments.includes(oldImport)) {
    console.error("Expected instrument import button not found");
    process.exit(1);
  }
  instruments = instruments.replace(oldImport, newImport);
}
writeFileSync(instrumentsPath, instruments, "utf8");

// Legacy clipboard selections can contain empty fields. HTML5 real("")
// throws; use safe_real() so Ctrl+V does not crash on such a selection.
const selectionLoadPath = join(project, "scripts", "selection_load", "selection_load.gml");
let selectionLoad = readFileSync(selectionLoadPath, "utf8");
if (!selectionLoad.includes("real(buffer_substr_copy(")) {
  console.error("Expected selection_load numeric fields not found");
  process.exit(1);
}
selectionLoad = selectionLoad.replaceAll("real(buffer_substr_copy(", "safe_real(buffer_substr_copy(");
writeFileSync(selectionLoadPath, selectionLoad, "utf8");

const decompressPath = join(project, "scripts", "try_decompress_selection", "try_decompress_selection.gml");
let decompress = readFileSync(decompressPath, "utf8");
const oldDelete = "\t\tbuffer_delete(decompress_buffer)";
if (!decompress.includes(oldDelete)) {
  console.error("Expected selection decompress cleanup not found");
  process.exit(1);
}
decompress = decompress.replace(oldDelete, "\t\tif (decompress_buffer != -1) buffer_delete(decompress_buffer)");
writeFileSync(decompressPath, decompress, "utf8");

// HTML5 file_exists() does not see INI files that GameMaker stores in
// localStorage. load_settings() therefore skipped the file and reset every
// preference to defaults on each launch. In the browser, open the expected
// settings file directly; ini_read_* still falls back to current values.
const loadSettingsPath = join(project, "scripts", "load_settings", "load_settings.gml");
let loadSettings = readFileSync(loadSettingsPath, "utf8");
const oldLoadSettings =
  /if \(is_prerelease && file_exists\(settings_dev_file\)\) \{\s*ini_open\(settings_dev_file\);\s*\} else if \(file_exists\(settings_file\)\) \{\s*ini_open\(settings_file\);\s*\} else \{\s*return;\s*\}/;
const newLoadSettings = `if (os_browser != browser_not_a_browser) {
		// HTML5: game_save_id can be empty/undefined while the INI backend
		// prefixes localStorage keys itself. Use the stable relative path.
		if (is_prerelease) ini_open("NoteBlockStudio.0.settings_dev.ini");
		else ini_open("NoteBlockStudio.0.settings.ini");
	} else if (is_prerelease && file_exists(settings_dev_file)) {
		ini_open(settings_dev_file);
	} else if (file_exists(settings_file)) {
		ini_open(settings_file);
	} else {
		return;
	}`;
if (!oldLoadSettings.test(loadSettings)) {
  console.error("Expected settings-loading block not found in load_settings.gml");
  process.exit(1);
}
loadSettings = loadSettings.replace(oldLoadSettings, newLoadSettings);
writeFileSync(loadSettingsPath, loadSettings, "utf8");

// Keep writes on the same stable path as load_settings; otherwise an empty
// game_save_id at load time and a populated one at save time would use
// different localStorage keys.
const saveSettingsPath = join(project, "scripts", "save_settings", "save_settings.gml");
let saveSettings = readFileSync(saveSettingsPath, "utf8");
const oldSaveOpen =
  /if \(is_prerelease\) \{\s*ini_open\(settings_dev_file\)\s*\} else \{\s*ini_open\(settings_file\)\s*\}/;
const newSaveOpen = `if (os_browser != browser_not_a_browser) {
		if (is_prerelease) ini_open("NoteBlockStudio.0.settings_dev.ini");
		else ini_open("NoteBlockStudio.0.settings.ini");
	} else if (is_prerelease) {
		ini_open(settings_dev_file)
	} else {
		ini_open(settings_file)
	}`;
if (!oldSaveOpen.test(saveSettings)) {
  console.error("Expected settings-saving block not found in save_settings.gml");
  process.exit(1);
}
saveSettings = saveSettings.replace(oldSaveOpen, newSaveOpen);
writeFileSync(saveSettingsPath, saveSettings, "utf8");

// --- NBSweb branding and link destinations ---------------------------------
// The browser build is branded NBSweb. Keep the upstream MIT license and the
// original-project attribution; only user-facing links and labels change.
function replaceRequired(source, from, to, label) {
  if (!source.includes(from)) {
    console.error(`Expected ${label} not found`);
    process.exit(1);
  }
  return source.replace(from, to);
}

const macrosPath = join(project, "scripts", "macros", "macros.gml");
let macros = readFileSync(macrosPath, "utf8");
for (const [from, to, label] of [
  [
    '#macro link_github "https://github.com/OpenNBS/OpenNoteBlockStudio"',
    '#macro link_github "https://github.com/Rainboow1908/NBS-web"',
    "GitHub macro"
  ],
  [
    '#macro link_report "https://github.com/OpenNBS/OpenNoteBlockStudio/issues/new/choose"',
    '#macro link_report "https://github.com/Rainboow1908/NBS-web/issues/new/choose"',
    "GitHub report macro"
  ],
  [
    '#macro link_releases "https://api.github.com/repos/OpenNBS/OpenNoteBlockStudio/releases"',
    '#macro link_releases "https://api.github.com/repos/Rainboow1908/NBS-web/releases"',
    "GitHub releases macro"
  ],
  [
    '#macro link_latest "https://api.github.com/repos/OpenNBS/OpenNoteBlockStudio/releases/latest"',
    '#macro link_latest "https://api.github.com/repos/Rainboow1908/NBS-web/releases/latest"',
    "GitHub latest-release macro"
  ],
  [
    '#macro link_changelog "https://opennbs.org/changelog"',
    '#macro link_changelog "https://github.com/Rainboow1908/NBS-web/releases"',
    "changelog macro"
  ],
  [
    '#macro link_website "https://opennbs.org/"',
    '#macro link_website "https://nbs.rbowo.com/"',
    "website macro"
  ],
  [
    '#macro link_discord "https://discord.gg/sKPGjyVcyy"',
    '#macro link_discord "https://discord.gg/vkVabHyMTk"',
    "Discord macro"
  ],
  [
    '#macro link_github_org "https://github.com/OpenNBS"',
    '#macro link_github_org "https://github.com/Rainboow1908"',
    "GitHub org macro"
  ],
  [
    '#macro link_qq_group "http://qm.qq.com/cgi-bin/qm/qr?_wv=1027&k=9iT2JIMOPWcrhzVpOROtlv7PJ1jSGEu0&authKey=VmmwRR7507A9fEVxraPmXn224vhbHXc4xs4QmwkveFZBriU%2Fq2NCj9fbYE5QCaLJ&noverify=0&group_code=218993157"',
    '#macro link_qq_group "https://qm.qq.com/q/2zquUag63e"',
    "QQ group macro"
  ],
  [
    '#macro link_twitter "https://twitter.com/OpenNBS"',
    '#macro link_twitter ""',
    "Twitter macro"
  ],
  [
    '#macro link_youtube "https://youtube.com/@OpenNBS"',
    '#macro link_youtube ""',
    "YouTube macro"
  ],
  [
    '#macro link_donate "https://opencollective.com/OpenNBS/donate"',
    '#macro link_donate ""',
    "donation macro"
  ]
]) {
  macros = replaceRequired(macros, from, to, label);
}
writeFileSync(macrosPath, macros, "utf8");

const checkUpdatesPath = join(project, "scripts", "check_updates", "check_updates.gml");
let checkUpdates = readFileSync(checkUpdatesPath, "utf8");
checkUpdates = replaceRequired(
  checkUpdates,
  'open_url("https://github.com/OpenNBS/NoteBlockStudio/releases")',
  'open_url("https://github.com/Rainboow1908/NBS-web/releases")',
  "update fallback URL"
);
writeFileSync(checkUpdatesPath, checkUpdates, "utf8");

// HTML5 browser tab title.
const html5OptionsPath = join(project, "options", "html5", "options_html5.yy");
let html5Options = readFileSync(html5OptionsPath, "utf8");
html5Options = replaceRequired(
  html5Options,
  '"option_html5_browser_title": "Note Block Studio"',
  '"option_html5_browser_title": "NBSweb"',
  "HTML5 browser title"
);
writeFileSync(html5OptionsPath, html5Options, "utf8");

// Welcome window: remove the donation banner, rebrand, and remove Twitter /
// YouTube / Donate from the footer. Discord stays.
const greetingPath = join(project, "scripts", "draw_window_greeting", "draw_window_greeting.gml");
let greeting = readFileSync(greetingPath, "utf8");
const donationBlock = /\n\tif \(donate_banner\) \{[\s\S]*?\n\t\}\n\t\n\tdraw_window\(/;
if (!donationBlock.test(greeting)) {
  console.error("Expected donation banner block not found in draw_window_greeting.gml");
  process.exit(1);
}
greeting = greeting.replace(donationBlock, "\n\tdraw_window(");
greeting = replaceRequired(
  greeting,
  'draw_text_center(x1 + 132, y1 + 213, "Note Block Studio")',
  'draw_text_center(x1 + 132, y1 + 213, "NBSweb")',
  "greeting product title"
);
greeting = replaceRequired(
  greeting,
  'draw_text_url(x1 + 132, y1 + 296 + dev_label_offset, "noteblock.studio", link_website)',
  'draw_text_url(x1 + 132, y1 + 296 + dev_label_offset, "nbs.rbowo.com", link_website)',
  "greeting website label"
);
const oldGreetingFooter = `\tvar theme_pipe_offset = (theme != 3) * 2 // move |'s to the left by 2px to compensate for wider font
\tif (language != 1) draw_text_center(x1 + 132, y1 + 340 + dev_label_offset, "Follow OpenNBS:")
\telse draw_text_center(x1 + 132, y1 + 340 + dev_label_offset, "关注 OpenNBS：")
\tdraw_text_url(x1 + 80, y1 + 356 + dev_label_offset, "Discord", link_discord)
\tdraw_text_dynamic(x1 + 104 - theme_pipe_offset, y1 + 356 + dev_label_offset, "|")
\tdraw_text_url(x1 + 128, y1 + 356 + dev_label_offset, "Twitter", link_twitter)
\tdraw_text_dynamic(x1 + 150 - theme_pipe_offset, y1 + 356 + dev_label_offset, "|")
\tdraw_text_url(x1 + 180, y1 + 356 + dev_label_offset, "YouTube", link_youtube)

\tdraw_text_url(x1 + 108 - (language == 1) * 20, y1 + 372 + dev_label_offset, "GitHub", link_github)
\tdraw_text_dynamic(x1 + 131 - (language == 1) * 22 - theme_pipe_offset, y1 + 372 + dev_label_offset, "|")
\tif (language == 1) draw_text_url(x1 + 133, y1 + 372 + dev_label_offset, "QQ 群", link_qq_group)
\tif (language == 1) draw_text_dynamic(x1 + 131 + 22 - theme_pipe_offset, y1 + 372 + dev_label_offset, "|")
\tif (language != 1) draw_text_url(x1 + 156, y1 + 372 + dev_label_offset, "Donate", link_donate)
\telse draw_text_url(x1 + 156 + 15, y1 + 372 + dev_label_offset, "捐赠", link_donate)`;
const newGreetingFooter = `\tvar theme_pipe_offset = (theme != 3) * 2 // move |'s to the left by 2px to compensate for wider font
\tif (language != 1) draw_text_center(x1 + 132, y1 + 340 + dev_label_offset, "Follow NBSweb:")
\telse draw_text_center(x1 + 132, y1 + 340 + dev_label_offset, "关注 NBSweb：")
\tdraw_text_url(x1 + 64, y1 + 356 + dev_label_offset, "Discord", link_discord)
\tdraw_text_dynamic(x1 + 116 - theme_pipe_offset, y1 + 356 + dev_label_offset, "|")
\tdraw_text_url(x1 + 124, y1 + 356 + dev_label_offset, "GitHub", link_github)
\tdraw_text_dynamic(x1 + 178 - theme_pipe_offset, y1 + 356 + dev_label_offset, "|")
\tdraw_text_url(x1 + 186, y1 + 356 + dev_label_offset, condstr(language == 1, "QQ 群", "QQ group"), link_qq_group)`;
greeting = replaceRequired(greeting, oldGreetingFooter, newGreetingFooter, "greeting social footer");
greeting = replaceRequired(
  greeting,
  "\t} else if (check_update) {",
  `\t} else if (os_browser != browser_not_a_browser) {
\t\tdraw_set_color(c_gray)
\t\tif (language != 1) draw_text_center(x1 + 132, y1 + 248 + dev_label_offset, "Browser version")
\t\telse draw_text_center(x1 + 132, y1 + 248 + dev_label_offset, "网页版")
\t} else if (check_update) {`,
  "greeting browser update status"
);
writeFileSync(greetingPath, greeting, "utf8");

// About window: rebrand, keep upstream attribution, remove Twitter / YouTube /
// Donate buttons, add QQ.
const aboutPath = join(project, "scripts", "draw_window_about", "draw_window_about.gml");
let about = readFileSync(aboutPath, "utf8");
about = replaceRequired(
  about,
  'draw_text_dynamic(x1 + 150, y1 + 200, "Note Block Studio")',
  'draw_text_dynamic(x1 + 150, y1 + 200, "NBSweb")',
  "about product title"
);
const oldAboutAttributionEn = "This program is a continuation of\\n Minecraft Note Block Studio, \\ncreated by David Andrei. ";
const newAboutAttributionEn = "NBSweb is based on Minecraft Note Block Studio,\\ncreated by David Andrei. ";
if (!about.includes(oldAboutAttributionEn)) {
  console.error("Expected about English attribution not found");
  process.exit(1);
}
about = about.replaceAll(oldAboutAttributionEn, newAboutAttributionEn);
const oldAboutAttributionZh = "本程序是 Minecraft Note Block Studio 的延续版本\\n原作者 David Andrei";
const newAboutAttributionZh = "NBSweb 基于 Minecraft Note Block Studio\\n原作者 David Andrei";
if (!about.includes(oldAboutAttributionZh)) {
  console.error("Expected about Chinese attribution not found");
  process.exit(1);
}
about = about.replaceAll(oldAboutAttributionZh, newAboutAttributionZh);
const oldAboutButtons = `\tif (draw_button2(x1 + 8, y1 + 380, 72, condstr(language != 1, "Website", "官方网站"), false, true)) {
\t\topen_url(link_website)
\t}
\tif (draw_button2(x1 + 84, y1 + 380, 72, condstr(language != 1, "GitHub", "GitHub"), false, true)) {
\t\topen_url(link_github)
\t}
\tif (draw_button2(x1 + 160, y1 + 380, 72, condstr(language != 1, "Discord", "Discord"), false, true)) {
\t\topen_url(link_discord)
\t}
\tif (draw_button2(x1 + 236, y1 + 380, 72, condstr(language != 1, "Twitter", "Twitter"), false, true)) {
\t\topen_url(link_twitter)
\t}
\tif (draw_button2(x1 + 312, y1 + 380, 72, condstr(language != 1, "YouTube", "YouTube"), false, true)) {
\t\topen_url(link_youtube)
\t}
\tif (draw_button2(x1 + 388, y1 + 380, 72, condstr(language != 1, "Donate", "捐赠"), false, true)) {
\t\topen_url(link_donate)
\t}`;
const newAboutButtons = `\tif (draw_button2(x1 + 8, y1 + 380, 72, condstr(language != 1, "Website", "官方网站"), false, true)) {
\t\topen_url(link_website)
\t}
\tif (draw_button2(x1 + 84, y1 + 380, 72, condstr(language != 1, "GitHub", "GitHub"), false, true)) {
\t\topen_url(link_github)
\t}
\tif (draw_button2(x1 + 160, y1 + 380, 72, condstr(language != 1, "Discord", "Discord"), false, true)) {
\t\topen_url(link_discord)
\t}
\tif (draw_button2(x1 + 236, y1 + 380, 72, condstr(language != 1, "QQ group", "QQ 群"), false, true)) {
\t\topen_url(link_qq_group)
\t}`;
about = replaceRequired(about, oldAboutButtons, newAboutButtons, "about link buttons");
writeFileSync(aboutPath, about, "utf8");

const langPath = join(project, "scripts", "lang_en_us", "lang_en_us.gml");
let lang = readFileSync(langPath, "utf8");
if (!lang.includes(oldAboutAttributionEn)) {
  console.error("Expected language-file about attribution not found");
  process.exit(1);
}
lang = lang.replaceAll(oldAboutAttributionEn, newAboutAttributionEn);
writeFileSync(langPath, lang, "utf8");

// Help menu: remove Donate, add QQ; use one stable index order for both
// languages so menu_click stays simple.
const controlDrawBrandPath = join(project, "scripts", "control_draw", "control_draw.gml");
let controlDrawBrand = readFileSync(controlDrawBrandPath, "utf8");
controlDrawBrand = replaceRequired(
  controlDrawBrand,
  "Website...|GitHub...|Discord server...|Report a bug...|Donate...",
  "Website...|GitHub...|Discord server...|QQ group...|Report a bug...",
  "English Help menu links"
);
controlDrawBrand = replaceRequired(
  controlDrawBrand,
  "官方网站......|GitHub......|Discord 服务器......|反馈 bug......|QQ 群......|捐赠......",
  "官方网站......|GitHub......|Discord 服务器......|QQ 群......|反馈 bug......",
  "Chinese Help menu links"
);
controlDrawBrand = replaceRequired(
  controlDrawBrand,
  "Visit the Note Block Studio website",
  "Visit the NBSweb website",
  "English website tooltip"
);
controlDrawBrand = replaceRequired(
  controlDrawBrand,
  "访问 Note Block Studio 官方网站",
  "访问 NBSweb 官方网站",
  "Chinese website tooltip"
);
writeFileSync(controlDrawBrandPath, controlDrawBrand, "utf8");

const macosMenuPath = join(project, "scripts", "menu_macos_init", "menu_macos_init.gml");
let macosMenu = readFileSync(macosMenuPath, "utf8");
macosMenu = replaceRequired(
  macosMenu,
  "Website...|GitHub...|Discord server...|Report a bug...|Donate...",
  "Website...|GitHub...|Discord server...|QQ group...|Report a bug...",
  "macOS English Help menu links"
);
macosMenu = replaceRequired(
  macosMenu,
  "官方网站......|GitHub......|Discord 服务器......|反馈 bug......|QQ 群......|捐赠......",
  "官方网站......|GitHub......|Discord 服务器......|QQ 群......|反馈 bug......",
  "macOS Chinese Help menu links"
);
writeFileSync(macosMenuPath, macosMenu, "utf8");

const menuClickPath = join(project, "scripts", "menu_click", "menu_click.gml");
let menuClick = readFileSync(menuClickPath, "utf8");
const oldHelpClicks = `\t\t\tif (sel = 6) open_url(link_website)
\t\t\tif (sel = 7) open_url(link_github)
\t\t\tif (sel = 8) open_url(link_discord)
\t        if (sel = 9) open_url(link_report)
\t\t\tif (language == 0) {
\t\t        if (sel = 10) open_url(link_donate)
\t\t        if (sel = 11) window = w_changelist
\t\t        if (sel = 12) window = w_about
\t\t\t} else if (language == 1) {
\t\t        if (sel = 10) open_url(link_qq_group)
\t\t        if (sel = 11) open_url(link_donate)
\t\t        if (sel = 12) window = w_changelist
\t\t        if (sel = 13) window = w_about
\t\t\t}`;
const newHelpClicks = `\t\t\tif (sel = 6) open_url(link_website)
\t\t\tif (sel = 7) open_url(link_github)
\t\t\tif (sel = 8) open_url(link_discord)
\t\t\tif (sel = 9) open_url(link_qq_group)
\t        if (sel = 10) open_url(link_report)
\t\t\tif (sel = 11) window = w_changelist
\t\t\tif (sel = 12) window = w_about`;
menuClick = replaceRequired(menuClick, oldHelpClicks, newHelpClicks, "Help menu click indices");
writeFileSync(menuClickPath, menuClick, "utf8");

// Donation banner is not just hidden on the welcome screen; its trigger state
// is disabled as well so updates cannot turn it back on.
const controlCreateBrandPath = join(project, "scripts", "control_create", "control_create.gml");
let controlCreateBrand = readFileSync(controlCreateBrandPath, "utf8");
controlCreateBrand = replaceRequired(
  controlCreateBrand,
  "\tdonate_banner = 1\n\tdonate_banner_time = -1",
  "\tdonate_banner = 0\n\tdonate_banner_time = -1",
  "initial donation banner state"
);
controlCreateBrand = replaceRequired(
  controlCreateBrand,
  "\tcheck_update = (os_type != os_macosx)",
  "\tcheck_update = (os_type != os_macosx && os_browser == browser_not_a_browser)",
  "browser update-check state"
);
controlCreateBrand = replaceRequired(
  controlCreateBrand,
  "\tif (date_compare_date(date_current_datetime(), donate_banner_time) > 0) {\n\t\tdonate_banner = 1\n\t} else {\n\t\tdonate_banner = 0\n\t}",
  "\tdonate_banner = 0",
  "donation banner date reset"
);
controlCreateBrand = replaceRequired(
  controlCreateBrand,
  "\t\tdonate_banner = 1 // Enable donate banner after each update",
  "\t\tdonate_banner = 0 // Donation banner disabled for NBSweb",
  "donation banner update trigger"
);
writeFileSync(controlCreateBrandPath, controlCreateBrand, "utf8");

// Keep visible credits branded; third-party names and repository URLs stay as-is.
const creditsPath = join(project, "datafiles", "Data", "credits.txt");
let credits = readFileSync(creditsPath, "utf8");
credits = replaceRequired(
  credits,
  "for making OpenNBS what it is!",
  "for making NBSweb what it is!",
  "credits special thanks"
);
writeFileSync(creditsPath, credits, "utf8");

// Replace the old product name in GML text without touching the historical
// attribution "Minecraft Note Block Studio".
const attributionToken = "\u0000MINECRAFT_NOTE_BLOCK_STUDIO\u0000";
let brandedFiles = 0;
function brandGml(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      brandGml(path);
    } else if (name.endsWith(".gml")) {
      const source = readFileSync(path, "utf8");
      if (!source.includes("Note Block Studio")) continue;
      const branded = source
        .replaceAll("Minecraft Note Block Studio", attributionToken)
        .replaceAll("Note Block Studio", "NBSweb")
        .replaceAll(attributionToken, "Minecraft Note Block Studio");
      if (branded !== source) {
        writeFileSync(path, branded, "utf8");
        brandedFiles++;
      }
    }
  }
}
brandGml(join(project, "scripts"));

console.log(
  `Patched project: ${resources.length} resources added; exact viewport; acrylic disabled; settings persisted; NBSweb branding (${brandedFiles} GML files)`
);
