function message_yesnocancel(argument0, argument1) {
	// message_yesnocancel(text, caption)
	var a;
	if (os_browser != browser_not_a_browser) return nbs_js_confirm(argument0)
	widget_set_caption(string(argument1))
	a = show_question_cancelable(string(argument0))
	return a
}
