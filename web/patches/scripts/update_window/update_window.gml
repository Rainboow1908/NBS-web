function update_window() {
	// update_window()

	// HTML5: browser_width/browser_height are the real viewport and change on
	// every resize. Do not depend on window_get_width() (it can stay at the
	// canvas's old buffer size), and skip desktop-only display_reset /
	// window_set_rectangle calls. NBS still relayouts from window_width/height
	// in control_draw(), so the UI adapts instead of being clipped.
	if (os_browser != browser_not_a_browser) {
		var bww, bhh;
		// browser_width/browser_height are fixed at startup in HTML5. The
		// extension reads the live viewport so resizing after load works.
		bww = nbs_js_viewport_width()
		bhh = nbs_js_viewport_height()
		if (bww <= 0 || bhh <= 0) return 0
		if (window_width == bww && window_height == bhh) return 0

		// Update the runtime's internal display size too. surface_resize alone
		// leaves the HTML5 display/window metrics stale, which renders the app
		// surface at an old offset/scale.
		window_set_size(bww, bhh)
		surface_resize(application_surface, bww, bhh)
		camera_set_view_pos(cam_window, 0, 0)
		camera_set_view_size(cam_window, bww * (1 / window_scale), bhh * (1 / window_scale))
		// Keep the viewport anchored at the canvas origin. Without x/y port
		// updates HTML5 can keep an old centered/offset viewport.
		view_set_xport(0, 0)
		view_set_yport(0, 0)
		view_set_wport(0, bww)
		view_set_hport(0, bhh)

		window_width = bww
		window_height = bhh
		return 1
	}

	if (window_width != window_get_width() || window_height != window_get_height()) {
	    var ww, hh, xx, yy;
	    ww = window_get_width()
	    hh = window_get_height()

	    if (ww <= 0 || hh <= 0)
	        return 0

	    xx = window_get_x()
	    yy = window_get_y()
	    // Linux window geometry is controlled asynchronously by the X11 window manager.
	    // Sending the geometry straight back during a resize creates a configure loop.
	    if (os_type != os_linux) {
		    display_reset(0, false)
		    if (!macos_is_retina() || (os_type = os_macosx && !NOT_RUN_FROM_IDE)) window_set_rectangle(xx, yy, ww, hh)
		    else window_set_rectangle(xx, yy, ww / 2, hh / 2)
	    }
		show_debug_message("Set window size to " + string(ww) + " x " + string(hh))
	    surface_resize(application_surface, ww, hh)

		camera_set_view_pos(cam_window, 0, 0)
	    camera_set_view_size(cam_window, ww * (1 / window_scale), hh * (1 / window_scale))
		view_set_wport(0, ww);
		view_set_hport(0, hh);

	    window_width = ww
	    window_height = hh
	}
}
