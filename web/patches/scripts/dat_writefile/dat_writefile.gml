function dat_writefile(argument0, argument1) {
	// dat_writefile(str, path)
	var str, path, file, prefix, rel
	str = argument0
	path = argument1

	file = buffer_create(string_length(str), buffer_fixed, 1)
	buffer_write(file, buffer_text, str)

	if (os_browser != browser_not_a_browser) {
		if (!variable_global_exists("web_zip_paths")) {
			global.web_zip_paths = []
			global.web_zip_data = []
		}
		prefix = game_save_id + "tempdatapack" + condstr(os_type = os_windows, "\\", "/")
		rel = string_replace(path, prefix, "")
		rel = string_replace(rel, "\\", "/")
		if (string_char_at(rel, 1) == "/") rel = string_delete(rel, 1, 1)
		array_push(global.web_zip_paths, rel)
		array_push(global.web_zip_data, buffer_base64_encode(file, 0, buffer_get_size(file)))
		buffer_delete(file)
		return
	}

	buffer_export(file, path)
	buffer_delete(file)
}
