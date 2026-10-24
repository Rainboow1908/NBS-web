function buffer_import(argument0) {
	// buffer_import(fn)

	if (os_browser != browser_not_a_browser && string_pos("__web_pending__", argument0) == 1) {
		return global.web_pending_buffer
	}
	if (os_browser != browser_not_a_browser && argument0 == temp_file) {
		// gzunzip already wrote the browser-decompressed bytes here.
		return buffer_load(temp_file)
	}

	files_delete_lib(temp_file)
	files_copy_lib(argument0, temp_file)
	return buffer_load(temp_file)



}
