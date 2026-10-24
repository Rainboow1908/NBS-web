function safe_real(value) {
	// HTML5 real("") throws, while desktop GML tolerates an empty field in
	// legacy selection codes. Treat empty/invalid fields as zero.
	if (is_undefined(value) || value == "") return 0
	return real(value)
}
