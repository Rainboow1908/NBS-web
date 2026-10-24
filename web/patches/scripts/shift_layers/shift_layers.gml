function shift_layers(argument0, argument1, argument2) {
	// shift_layers(layer1, layer2, undo)
	// Swap two layers directly. The upstream implementation round-trips through
	// the selection editor; large selections can hang the HTML5 runtime. Layer
	// contents and metadata are already in the song arrays, so swap them here.

	var l1, l2, s, a, xx, yy, tmp;
	l1 = argument0
	l2 = argument1
	if (l1 = l2) return 0
	if (l1 < 0 || l2 < 0) return 0

	s = songs[song]

	// A selection is only a view/copy of blocks already in the song. Clearing
	// its markers does not delete notes, and avoids the old selection round-trip.
	if (s.selected > 0) {
		s.selected = 0
		s.selection_code = ""
		s.selection_x = 0
		s.selection_y = 0
		s.selection_l = 0
		s.selection_h = 0
		ds_list_clear(s.selected_layers)
	}

	// Make sure both layer metadata slots exist.
	if (l1 >= s.endb2 || l2 >= s.endb2) {
		s.endb2 = max(s.endb2, max(l1, l2) + 1)
	}
	if (l1 >= s.arrayheight || l2 >= s.arrayheight) {
		s.arrayheight = max(s.arrayheight, max(l1, l2) + 1)
	}
	// Only the two swapped metadata slots are needed. Do not loop to endb2:
	// old/broken songs can have endb2 larger than the sparse layer arrays.
	if (l1 >= array_length(s.layername)) s.layername[@ l1] = ""
	if (l2 >= array_length(s.layername)) s.layername[@ l2] = ""
	if (l1 >= array_length(s.layerlock)) s.layerlock[@ l1] = 0
	if (l2 >= array_length(s.layerlock)) s.layerlock[@ l2] = 0
	if (l1 >= array_length(s.layervol)) s.layervol[@ l1] = 100
	if (l2 >= array_length(s.layervol)) s.layervol[@ l2] = 100
	if (l1 >= array_length(s.layerstereo)) s.layerstereo[@ l1] = 100
	if (l2 >= array_length(s.layerstereo)) s.layerstereo[@ l2] = 100
	if (l1 >= array_length(s.rowamount)) s.rowamount[@ l1] = 0
	if (l2 >= array_length(s.rowamount)) s.rowamount[@ l2] = 0

	// HTML5 stores sparse 2-D rows. A column that only has notes on layer 0
	// can have row length 1; reading layer 1 would throw. Normalize every
	// non-empty row to arrayheight before swapping.
	for (xx = 0; xx < s.arraylength; xx++) {
		if (xx >= array_length(s.song_exists)) continue
		if (xx >= array_length(s.colamount) || s.colamount[xx] <= 0) continue
		var rowlen = array_length(s.song_exists[xx])
		for (yy = rowlen; yy < s.arrayheight; yy++) s.song_exists[@ xx, yy] = 0
		rowlen = array_length(s.song_ins[xx])
		for (yy = rowlen; yy < s.arrayheight; yy++) s.song_ins[@ xx, yy] = 0
		rowlen = array_length(s.song_key[xx])
		for (yy = rowlen; yy < s.arrayheight; yy++) s.song_key[@ xx, yy] = 0
		rowlen = array_length(s.song_vel[xx])
		for (yy = rowlen; yy < s.arrayheight; yy++) s.song_vel[@ xx, yy] = 0
		rowlen = array_length(s.song_pan[xx])
		for (yy = rowlen; yy < s.arrayheight; yy++) s.song_pan[@ xx, yy] = 0
		rowlen = array_length(s.song_pit[xx])
		for (yy = rowlen; yy < s.arrayheight; yy++) s.song_pit[@ xx, yy] = 0
		rowlen = array_length(s.song_played[xx])
		for (yy = rowlen; yy < s.arrayheight; yy++) s.song_played[@ xx, yy] = 0
		rowlen = array_length(s.song_added[xx])
		for (yy = rowlen; yy < s.arrayheight; yy++) s.song_added[@ xx, yy] = 0
	}

	// Solo state references layer indexes; keep it pointing at the same layer.
	if (s.layerlock[l1] = 2 ^^ s.layerlock[l2] = 2) {
		if (s.layerlock[l1] = 2) s.solostr = string_replace_all(s.solostr, "|" + string(l1) + "|", "|" + string(l2) + "|")
		else if (s.layerlock[l2] = 2) s.solostr = string_replace_all(s.solostr, "|" + string(l2) + "|", "|" + string(l1) + "|")
	}

	// Swap layer metadata.
	tmp = s.layername[l1]
	s.layername[l1] = s.layername[l2]
	s.layername[l2] = tmp
	tmp = s.layerlock[l1]
	s.layerlock[l1] = s.layerlock[l2]
	s.layerlock[l2] = tmp
	tmp = s.layervol[l1]
	s.layervol[l1] = s.layervol[l2]
	s.layervol[l2] = tmp
	tmp = s.layerstereo[l1]
	s.layerstereo[l1] = s.layerstereo[l2]
	s.layerstereo[l2] = tmp
	tmp = s.rowamount[l1]
	s.rowamount[l1] = s.rowamount[l2]
	s.rowamount[l2] = tmp

	// Swap note data column by column. colamount and totalblocks are unchanged
	// because the same notes still exist, only on the other layer.
	var e1, e2, i1, i2, k1, k2, v1, v2, p1, p2, t1, t2, d1, d2;
	for (xx = 0; xx < s.arraylength; xx++) {
		// Empty columns have no row array at all; song_exists[xx, layer]
		// would be an out-of-range read on HTML5.
		if (xx >= array_length(s.song_exists)) continue
		if (xx >= array_length(s.colamount) || s.colamount[xx] <= 0) continue
		var rowlen = array_length(s.song_exists[xx])
		if (rowlen <= 0) continue
		e1 = 0
		e2 = 0
		if (l1 < rowlen) e1 = s.song_exists[xx, l1]
		if (l2 < rowlen) e2 = s.song_exists[xx, l2]
		if (e1 || e2) {
			i1 = s.song_ins[xx, l1]
			i2 = s.song_ins[xx, l2]
			k1 = s.song_key[xx, l1]
			k2 = s.song_key[xx, l2]
			v1 = s.song_vel[xx, l1]
			v2 = s.song_vel[xx, l2]
			p1 = s.song_pan[xx, l1]
			p2 = s.song_pan[xx, l2]
			t1 = s.song_pit[xx, l1]
			t2 = s.song_pit[xx, l2]
			d1 = s.song_played[xx, l1]
			d2 = s.song_played[xx, l2]

			s.song_exists[@ xx, l1] = e2
			s.song_exists[@ xx, l2] = e1
			s.song_ins[@ xx, l1] = i2
			s.song_ins[@ xx, l2] = i1
			s.song_key[@ xx, l1] = k2
			s.song_key[@ xx, l2] = k1
			s.song_vel[@ xx, l1] = v2
			s.song_vel[@ xx, l2] = v1
			s.song_pan[@ xx, l1] = p2
			s.song_pan[@ xx, l2] = p1
			s.song_pit[@ xx, l1] = t2
			s.song_pit[@ xx, l2] = t1
			s.song_played[@ xx, l1] = d2
			s.song_played[@ xx, l2] = d1
		}
	}

	// colfirst/collast can change only if one of the swapped layers was a
	// boundary. Recompute them once, rather than relying on the selection code.
	var first, last;
	for (xx = 0; xx < s.arraylength; xx++) {
		if (xx >= array_length(s.colamount) || s.colamount[xx] <= 0) {
			if (xx < array_length(s.colfirst)) s.colfirst[@ xx] = -1
			if (xx < array_length(s.collast)) s.collast[@ xx] = -1
			continue
		}
		if (xx >= array_length(s.song_exists)) continue
		first = -1
		last = -1
		var rowlen2 = array_length(s.song_exists[xx])
		for (yy = 0; yy < rowlen2; yy++) {
			if (s.song_exists[xx, yy]) {
				if (first = -1) first = yy
				last = yy
			}
		}
		s.colfirst[@ xx] = first
		s.collast[@ xx] = last
		if (first = -1) s.colamount[@ xx] = 0
	}

	swap_text_edit(400 + l1, 400 + l2)
	update_songsize()
	s.changed = 1
	if (!argument2) history_set(h_swaplayer, l1, l2)
	return 1
}


