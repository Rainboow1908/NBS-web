function update_window_icon(){
	if (os_browser != browser_not_a_browser) {
		// HTML5 has no native window icon; keep the tab favicon in sync with
		// the same Fruity-icon preference used by the desktop window.
		nbs_js_set_window_icon(window_icon)
		return
	}
	if (icon_display && os_type = os_windows) {
		if (window_icon) window_set_icon_raw(window_handle(), buffer_get_address(icon_buffer), buffer_get_address(icon_size_buffer))
		else window_reset_icon_raw(window_handle())
	}
}
