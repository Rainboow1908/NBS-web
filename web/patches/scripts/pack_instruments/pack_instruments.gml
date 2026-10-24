function pack_instruments() {
	var fn, tempdir, ins, src, dst, count;
	if (language != 1) fn = string(get_save_filename_ext("ZIP archive (*.zip)|*.zip", condstr(songs[song].filename == "", "", filename_change_ext(songs[song].filename, "") + " - ") + "Instruments.zip", "", "Pack instruments to ZIP file"));
	else fn = string(get_save_filename_ext("ZIP archive (*.zip)|*.zip", condstr(songs[song].filename == "", "", filename_change_ext(songs[song].filename, "") + " - ") + "Instruments.zip", "", "导出音色至 ZIP 文件"));
	if (fn = "") return 0;
	fn = enforce_extension(fn, ".zip")

	if (os_browser != browser_not_a_browser) {
		var web_json = "{"
		var web_first = true
		count = 0
		for (var wi = first_custom_index; wi <= ds_list_size(songs[song].instrument_list) - 1; wi++) {
			ins = ds_list_find_value(songs[song].instrument_list, wi)
			if (ins.filename == "") continue
			src = sounds_directory + ins.filename
			if (!file_exists_lib(src)) continue
			var wb = buffer_load(src)
			if (wb < 0) continue
			var wname = string_replace(ins.filename, "\\", "/")
			if (!web_first) web_json += ","
			web_first = false
			web_json += "\"" + wname + "\":\"" + buffer_base64_encode(wb, 0, buffer_get_size(wb)) + "\""
			buffer_delete(wb)
			count += 1
		}
		web_json += "}"
		var web_name = filename_name(fn)
		if (string_pos("__web_save__", web_name) == 1) web_name = string_delete(web_name, 1, string_length("__web_save__"))
		nbs_js_zip_download(web_name, web_json)
		if (language != 1) message(string(count) + " instrument" + condstr(count > 1, "s were", " was") + " saved!", "Pack instruments")
		else message(string(count) + "个音色已保存！", "导出音色")
		return 1
	}

	tempdir = game_save_id + "temp" + condstr(os_type = os_windows, "\\", "/");
	if (directory_exists_lib(tempdir)) {
		directory_delete_lib(tempdir);
	}
	directory_create_lib(tempdir);

	count = 0;
	for (var i = first_custom_index; i <= ds_list_size(songs[song].instrument_list) - 1; i++) {
		ins = ds_list_find_value(songs[song].instrument_list, i);
		if (ins.filename != "") {
			src = sounds_directory + ins.filename;
			dst = tempdir + ins.filename;
			if (!file_exists_lib(src)) continue;
			if (!directory_exists_lib(filename_dir(dst))) directory_create_lib(filename_dir(dst))
			files_copy_lib(src, dst);
			count++;
		}
	}

	if (os_type = os_macosx) execute_program("ditto", "-c -k \"" + game_save_id + "temp" + "\" \"" + fn + "\"", true);
	else execute_program(get_7z_exc_name(), "a -tzip \"" + fn + "\" \"" + game_save_id + "temp" + condstr(os_type = os_windows, "\\", "/") + "*\"", true)
	directory_delete_lib(tempdir);
	if (language != 1) message(string(count) + " instrument" + condstr(count > 1, "s were", " was") + " saved!", "Pack instruments")
	else message(string(count) + "个音色已保存！", "导出音色")
}
