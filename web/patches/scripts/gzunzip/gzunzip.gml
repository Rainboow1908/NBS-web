function gzunzip(argument0, argument1) {
	// gzunzip(file, dest)
	if (os_browser != browser_not_a_browser) {
		// web_file_bridge decompresses the selected base64 with fflate first.
		var b64 = ""
		if (variable_global_exists("web_pending_schematic_b64")) b64 = global.web_pending_schematic_b64
		if (b64 == "") return 0
		var b = buffer_base64_decode(b64)
		if (b < 0) return 0
		buffer_save(b, argument1)
		buffer_delete(b)
		return 1
	}

	if (os_type == os_windows) {
		file_delete(argument1)
		execute_program("cmd", current_directory + "7za.exe x -tgzip \"" + argument0 + "\" -so > \"" + argument1 + "\"", true);
	} else {

	}
}
