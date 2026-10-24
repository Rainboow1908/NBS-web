function question(argument0, argument1) {
	// question(str, caption)
	var a;
	if (os_browser != browser_not_a_browser) return nbs_js_confirm(argument0)
	widget_set_caption(string(argument1))
	a = show_question(string(argument0))
	return a
}
