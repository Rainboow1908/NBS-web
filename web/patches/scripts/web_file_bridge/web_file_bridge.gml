/// Browser file bridge: the JS extension provides an async picker and a
/// download helper; this script polls its inbox and feeds the selected bytes
/// through the normal GML loaders.
function nbs_web_poll() {
	if (os_browser = browser_not_a_browser) return

	var inbox = nbs_js_take_inbox()
	if (inbox == "") return

	var info
	try {
		info = json_parse(inbox)
	} catch (e) {
		message("Could not read the selected file.", "Note Block Studio")
		return 0
	}
	if (!is_struct(info) || !variable_struct_exists(info, "name") || !variable_struct_exists(info, "base64")) return 0

	global.web_pending_name = info.name
	var lower_name = string_lower(global.web_pending_name)
	var len = string_length(lower_name)
	var ext = ""
	if (len >= 4 && string_copy(lower_name, len - 3, 4) == ".nbs") ext = ".nbs"
	else if (len >= 4 && string_copy(lower_name, len - 3, 4) == ".nbp") ext = ".nbp"
	else if (len >= 4 && string_copy(lower_name, len - 3, 4) == ".mid") ext = ".mid"
	else if (len >= 5 && string_copy(lower_name, len - 4, 5) == ".midi") ext = ".midi"
	else if (len >= 10 && string_copy(lower_name, len - 9, 10) == ".schematic") ext = ".schematic"
	global.web_pending_buffer = buffer_base64_decode(info.base64)
	if (global.web_pending_buffer < 0) {
		message("Could not decode the selected file.", "Note Block Studio")
		return 0
	}

	var fake = "__web_pending__" + ext
	if (ext == ".nbs") {
		if (variable_global_exists("web_pick_mode") && global.web_pick_mode == "instruments") {
			global.web_pick_mode = ""
			load_instruments(fake)
		} else {
			load_song(fake, 0, 1)
			if (song >= 0 && array_length(songs) > song) {
				songs[song].filename = global.web_pending_name
				update_tabs_name()
			}
		}
	} else if (ext == ".mid" || ext == ".midi") {
		open_midi(fake)
		if (song >= 0 && array_length(songs) > song) songs[song].filename = global.web_pending_name
	} else if (ext == ".nbp") {
		pattern_import(fake, 1)
	} else if (ext == ".schematic") {
		global.web_pending_schematic_b64 = nbs_js_gunzip_base64(info.base64)
		if (global.web_pending_schematic_b64 != "") open_schematic(fake)
		else message("Could not decompress the selected Schematic.", "Note Block Studio")
		global.web_pending_schematic_b64 = ""
	} else {
		message("This file type is not supported in the web build yet: " + ext, "Note Block Studio")
	}

	global.web_pending_buffer = -1
}
