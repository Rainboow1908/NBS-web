function file_exists_lib(argument0) {
	// file_exists_lib(file)
	if (os_browser != browser_not_a_browser && string_pos("__web_pending__", argument0) == 1) return true

	if (argument0 = "")
	    return 0

	return file_exists(argument0)



}
