function check_updates() {
	// check_updates()
	// -1: unable to check, 0: checking, 1: update found, 2: up to date, 4: downloading
	if (async_load[? "id"] = update_http) {
		var status = async_load[? "status"];
		if (status == -1) {
			update = -1
			return
		}
		if (status == 0) {
			if (async_load[? "http_status"] != 200) {
				update = -1
				return
			}
			update_http = -1
			var res = json_parse(async_load[? "result"])
			if (!is_array(res)) {
				update = -1
				return
			}
			if (array_length(res) == 0) {
				update = -1
				return
			}
			var release = res
			if (check_prerelease) release = res[0]
			if (!is_struct(release) || !variable_struct_exists(release, "tag_name")) {
				update = -1
				return
			}
			var new_version = string_replace(release.tag_name, "v", "")
			if (new_version == version) {
				update = 2
			} else if (!question(
				condstr(language != 1,
					"Version " + new_version + " is available! Do you want to download it?",
					"版本 " + new_version + " 可用！是否现在下载？"),
				condstr(language != 1, "Update available!", "更新可用！"))) {
				update = 1
			} else if (os_type = os_windows) {
				if (!variable_struct_exists(release, "assets") || !is_array(release.assets) || array_length(release.assets) == 0) {
					update = 1
					return
				}
				update_download = http_get_file(release.assets[0].browser_download_url, update_file)
				update = 4
			} else if (os_type = os_macosx) {
				open_url("https://testflight.apple.com/join/hg58hwbM")
			} else {
				open_url("https://github.com/OpenNBS/NoteBlockStudio/releases")
			}
		}
	}
}
