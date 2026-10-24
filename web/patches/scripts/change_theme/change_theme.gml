function change_theme() {
	// change_theme()

	// HTML5 has no desktop wallpaper capture or the paid blur extension.
	// Keep the Fluent theme, but never enable acrylic effects in the browser.
	if (os_browser != browser_not_a_browser) {
		acrylic = 0
		save_settings()
		return
	}

	window_set_color(window_background)

	if (theme == 3 && acrylic && !wpaperexist) {
		wallpaper_init()
	}

}
