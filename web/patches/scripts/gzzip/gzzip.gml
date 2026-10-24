function gzzip(argument0, argument1) {
	// gzzip(file, dest)
	if (os_browser != browser_not_a_browser) {
		var src = buffer_load(argument0)
		if (src < 0) return 0
		var b64 = buffer_base64_encode(src, 0, buffer_get_size(src))
		var name = filename_name(argument1)
		if (string_pos("__web_save__", name) == 1) name = string_delete(name, 1, string_length("__web_save__"))
		nbs_js_gzip_download(name, b64)
		buffer_delete(src)
		return 1
	}

	var destname = file_directory + filename_change_ext(filename_name(argument1), "")
	if (os_type = os_windows) {
		file_copy(argument0, destname)
		execute_program("cmd", "\"\"" + current_directory + "7za.exe\" a dummy -tgzip -so \"" + destname + "\" > \"" + argument1 + "\" 2>&1\"", true)
		file_delete(destname)
	} else {
		execute_program("cp", "\"" + argument0 + "\" \"" + destname + "\"", true)
		execute_program("gzip", "-c \"" + destname + "\" > \"" + argument1 + "\"", true)
		execute_program("rm", "\"" + destname + "\"", true)
	}
}
