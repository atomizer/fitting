/*global $, jQuery, dyes, sheets, skins, History */

var DFRAMES = [[0, 1, 0, 4, 5], [7, 8, 9, 11, 12], [0, 1, 0, 4, 5], [14, 15, 16, 18, 19]];
var DKEYS = [68, 83, 65, 87]; // dsaw

var ready = false;

var sprites = {};
var stage, sctx, bc, bctx, allstage, asctx, abc, abctx;
var cur_class = 0x030e, cur_skin = -1, cur_dir = 0, cur_frame = 0;
var tx = [-1, -1];
var zoom = 1;

var BLUSH_PERIOD = 600;
var WALK_PERIOD = 300;
var walking = false, attacking = false, blushing = false;
var d_wstart = Date.now(), d_bstart = d_wstart;
var r_down = false;


function extract_sprites(ctx, sx, sy) {
	sx = sx || 8;
	sy = sy || sx;
	var i = 0, r = [];
	for (var y = 0; y < ctx.canvas.height; y += sy) {
		for (var x = 0; x < ctx.canvas.width; x += sx) {
			var ri = ctx.getImageData(x, y, sx, sy);
			r[i] = ri;
			i++;
		}
	}
	return r
}

function load_img(src, name, sz) {
	var i = new Image()
	var d = new $.Deferred()
	i.onload = function() { d.resolve(this, name, sz) }
	i.src = src
	return d.promise()
}

function load_sheets() {
	var d = new $.Deferred(), wait = 0
	for (var s in sheets) wait++

	function loaded(img, name, sz) {
		var c = document.createElement('canvas')
		c.width = img.width;
		c.height = img.height;
		var ctx = c.getContext('2d')
		ctx.drawImage(img, 0, 0)
		if (!sz) {
			sprites[name] = extract_sprites(ctx)
		} else {
			sprites[sz] = ctx
		}
		if (!--wait) d.resolve()
	}

	for (var n in sheets) {
		var src = sheets[n]
		var sz = null
		var m = n.match(/^textile(\d+)x(\d+)$/)
		if (m) sz = +m[1]
		load_img(src, n, sz).done(loaded)
	}
	return d.promise()
}


function init_dyes() {
	var dyebox = $('#dyebox');

	dyebox.on('click', '.dye', function(e) {
		var $t = $(this)
		var offx = e.pageX - $t.offset().left
		var k = Math.round(offx / $t.width())
		var id = $t.attr('data-id')
		tx[k] = (tx[k] == id) ? -1 : id;
		full_newstate();
	});

	var ca = document.createElement('canvas');
	var cactx = ca.getContext('2d');
	var dyeels = []
	for (var i in dyes) {
		var d = dyes[i], sz = d[1]
		if (sz == 1) {
			// dye
			d[3] = d[2]
		} else {
			// cloth
			var id = d[2]
			var spr = sprites[sz].getImageData(sz * (id & 0xf), sz * (id >> 4), sz, sz)
			ca.width = sz;
			ca.height = sz;
			cactx.putImageData(spr, 0, 0);
			d[3] = cactx.createPattern(ca, 'repeat');
		}
		var c = $('<div/>').addClass('dye');
		if (sz == 1) {
			// dye
			c.css('background-color', d[2]);
			c.data('color', jQuery.Color(d[2]))
		} else {
			// cloth
			c.css('background-image', 'url(' + ca.toDataURL() + ')');
		}
		c.attr('data-id', i);
		c.attr('title', d[0]);
		if (sz == 1) dyeels.push(c); else c.insertBefore(dyebox.find('br'));
	}
	dyeels = sortDyes(dyeels);
	dyebox.append(dyeels)
}

function sortDyes(dyes) {
	if (typeof dyes == 'undefined'){
		dyes = $(".dye[style*='color']");
	}
	var sort = '';
	var sortTypes = $("input[name='sort-dyes']");
	for (var i = 0; i < sortTypes.length; i++){
		if (sortTypes[i].checked){
			sort = sortTypes[i].id.substring(5);
		}
	}
	dyes.sort(function(a, b){
		if (a.length){
			a = a[0];
			b = b[0];
		}
		if (sort == 'name') {
			var aName = a.getAttribute('title')
			var bName = b.getAttribute('title')
			return (aName < bName) ? -1 : (aName > bName) ? 1 : 0;
		}
		var ca = jQuery.Color(a.style.backgroundColor)
		var cb = jQuery.Color(b.style.backgroundColor)
		if (sort == 'lightness') {
			return (ca.lightness() - cb.lightness()) || (ca.hue() - cb.hue());
		}
		if (sort == 'hue') {
			return (ca.hue() - cb.hue()) || (ca.lightness() - cb.lightness());
		}
	})

	return dyes
}

function replaceDyes(newDyes){
	$(".dye[style*='color']").remove();
	$('#dyebox').append(newDyes);
}


// helpers for working with imagedata pixel values

// single component
function p_comp(s, x, y, i) {
	return s.data[((s.width * y + x) << 2) + i];
}

// single pixel
function p_dict(s, x, y) {
	var offset = (s.width * y + x) << 2;
	for (var i = 0, d = []; i < 4; i++) d[i] = s.data[offset + i];
	return d;
}

// css-compatible
function p_css(s, x, y) {
	var d = p_dict(s, x, y);
	d[3] /= 255;
	return 'rgba(' + d.join(',') + ')';
}

function p_set(s, x, y, d) {
	var offset = (s.width * y + x) << 2;
	for (var i = 0; i < 4; i++) s.data[offset + i] = d[i];
}

// returns 3-by-1 ImageData of a character (126 x 42 with scale=5)
function charImage(id, scale, direction, blush, char_class, char_skin){
	id = id || 0;
	scale = scale || 5;
	direction = typeof direction != 'undefined' ? direction : cur_dir;
	blush = blush || 0;
	char_class = char_class || cur_class;
	char_skin = typeof char_skin != 'undefined' ? char_skin : cur_skin;

	var temp = document.createElement('canvas');
	temp.width = (scale * 8 + 2) * 3;
	temp.height = scale * 8 + 2;
	var c = temp.getContext('2d');

	c.save();
	c.translate(42, 0);

	var ischecked = [
		$('#toggle-main').is(':checked'),
		$('#toggle-accessory').is(':checked')
	]

	// draws using c with its current translation as the upper-left corner for the sprite
	// needs x to be set before drawing (attacking sprites have offsets)
	function pastesprite(id, x){
		c.save();
		c.translate(1, 1); // 1px for border

		var i = (char_skin !== -1) ? char_skin : skins[char_class][1];
		i = i * 21 + id;
		var sh = (char_skin !== -1) ? 'playersSkins' : 'players';
		var spr = sprites[sh][i];
		var mask = sprites[sh + 'Mask'][i];
		var xd = 1 - (direction == 2) * 2;
		for (var xi = 0; xi < 8; x += scale * xd, xi++) {
			for (var yi = 0, y = 0; yi < 8; y += scale, yi++) {

				if (!p_comp(spr, xi, yi, 3)) continue;

				// standart
				c.fillStyle = p_css(spr, xi, yi);
				c.fillRect(x, y, scale, scale);

				// if there is something on mask, paint over
				if (p_comp(mask, xi, yi, 3)) {
					for (var ch = 0; ch < 2; ch++) { // 2 textures/channels
						if (!~tx[ch] || !ischecked[ch]) continue;
						var vol = p_comp(mask, xi, yi, ch);
						if (!vol) continue;
						c.fillStyle = dyes[tx[ch]][3];
						c.fillRect(x, y, scale, scale);
						c.fillStyle = 'rgba(0,0,0,' + ((255 - vol) / 255) + ')';
						c.fillRect(x, y, scale, scale);
					}
				}

				// outline
				c.save();
				c.globalCompositeOperation = 'destination-over';
				c.strokeRect(x - 0.5, y - 0.5, scale + 1, scale + 1);
				c.restore();
			}
		}
		c.restore();
	}
	var x = (direction == 2) ? scale * 7 : 0;
	pastesprite(id, x);
	if (cur_frame == 4) { // attacking, frame 2
		x = (direction == 2) ? -scale : scale * 8;
		pastesprite(id + 1, x);
	}
	c.restore();

	// gradient + blush (had to do by hand because there's no actual "substract" blending, d'oh)
	var d = c.getImageData(0, 0, c.canvas.width, c.canvas.height);
	for (x = 0; x < c.canvas.width; x++) {
		for (var y = 0; y < c.canvas.height; y++) {
			if (!p_comp(d, x, y, 3)) continue; // skip transparent
			var pd = p_dict(d, x, y);
			var gr = (y - 1) < (scale * 3) ? 0 : (39 * (y - scale * 3) / (scale * 5));
			pd[0] += blush - gr;
			pd[1] -= blush + gr;
			pd[2] -= blush + gr;
			p_set(d, x, y, pd);
		}
	}
	c.putImageData(d, 0, 0);

	return c.getImageData(0, 0, c.canvas.width, c.canvas.height);
}

var ftimer

function frame(id, scale) {
	if (ftimer) return;
	ftimer = 1;
	cur_frame = 0;
	var blush = 0;

	if (walking || attacking) {
		cur_frame = (Date.now() - d_wstart) % WALK_PERIOD;
		cur_frame = (cur_frame / WALK_PERIOD < 0.5) ? 1 : 2;
		if (attacking) cur_frame += 2;
	}
	if (blushing) {
		blush = (Date.now() - d_bstart) % BLUSH_PERIOD;
		blush /= BLUSH_PERIOD;
		blush = 127 * (1 - 2 * Math.abs(Math.asin(2 * blush - 1) / Math.PI));
	}

	id = id || DFRAMES[cur_dir][cur_frame] || 0;
	scale = scale || 5;

	var c = bctx;
	c.clearRect(0, 0, bc.width, bc.height);
	var image = charImage(id, scale, cur_dir, blush);
	c.putImageData(image, bc.width / 2 - image.width / 2,
		bc.height / 2 - image.height / 2);

	sctx.clearRect(0, 0, stage.width, stage.height);
	sctx.drawImage(bc, 0, 0, stage.width, stage.height);

	if (walking || blushing) {
		window.requestAnimationFrame(function() {
			ftimer = 0;
			frame();
		})
	} else {
		ftimer = 0;
	}
}

function allframe(scale){
	scale = scale || 5;

	var c = abctx;
	c.clearRect(0, 0, c.canvas.width, c.canvas.height);

	// get sorted list of class IDs
	var classIds = [];
	for (var obj in skins) {
		classIds.push(obj);
	}
	classIds.sort(function(a, b){return a - b});
	var classesCount = classIds.length;

	// create sprites for each class and skin
	var currentChar;
	var x0 = 8, y0 = 8;
	c.save();
	c.globalCompositeOperation = 'destination-over';
	for (var i = 0; i < classesCount; i++){
		currentChar = charImage(0, scale, 0, 0, classIds[i], -1);
		var w = currentChar.width / 3, h = currentChar.height;
		c.putImageData(
			currentChar,
			((w * (i - 1)) + (i * 6)) + x0,
			y0,
			w, 0, w, h
		);
		var skinsCount = skins[classIds[i]][2].length;
		for (var j = 0; j < skinsCount; j++){
			currentChar = charImage(0, scale, 0, 0, classIds[i], skins[classIds[i]][2][j][1]);
			w = currentChar.width / 3
			h = currentChar.height;
			c.putImageData(
				currentChar,
				((w * (i - 1)) + (i * 6)) + x0,
				((h * (j + 1)) + ((j + 1) * 6)) + y0,
				w, 0, w, h
			);
		}
	}
	c.restore();

	asctx.clearRect(0, 0, allstage.width, allstage.height);
	asctx.drawImage(abc, 0, 0, allstage.width, allstage.height);
}


// action

var preload = load_sheets()

$(function(){
	// ensure that dom is ready before calling init_stage, but allow preload to start earlier
	preload.done(function() {
		init_stage();
		statechanged(true);
	})
	$('#toggle-main, #toggle-accessory').change(function(){frame(); allframe()});
	$("input[name='sort-dyes']").change(function(){replaceDyes(sortDyes())});
	$('#toggle-allpreview').change(function(){
		var checked = $(this).prop('checked');
		if (checked){
			allframe();
		}
		$('#allstage').toggle(checked);
	});
	// url stuff
	function statechanged(replace) {
		var state = History.getState();
		var m = (state.hash.split('?')[1] || '').split(/[=&]/)[0].split('.')
		for (var p = 0; p < m.length && p < 4; p++) {
			m[p] = parseInt(m[p], 36)
			if (isNaN(m[p])) m[p] = -1
		}
		cur_class = 782
		for (var i in skins) {
			if (skins[i][1] == m[0]) {
				cur_class = i
				break
			}
		}
		var sarr = skins[cur_class][2]
		cur_skin = -1
		for (var j = 0; j < sarr.length; j++) {
			if (sarr[j][1] == m[1]) {
				cur_skin = m[1]
				break
			}
		}
		tx[0] = dyes[m[2]] ? +m[2] : -1
		tx[1] = dyes[m[3]] ? +m[3] : -1
		full_newstate(replace);
	}
	History.Adapter.bind(window, 'statechange', statechanged);
});

var state_lock = false; // against race conditions
function newstate(replace) {
	if (state_lock) return;
	state_lock = true;
	update_visuals();
	var url = document.location.pathname
	var parts = []
	parts.push(skins[cur_class][1].toString(36))
	parts.push(~cur_skin ? cur_skin.toString(36) : '')
	parts.push(tx[0] == -1 ? '' : (+tx[0]).toString(36))
	parts.push(tx[1] == -1 ? '' : (+tx[1]).toString(36))
	parts = parts.join('.')
	if (parts != '2...') {
		url += '?' + parts
	}
	(replace ? History.replaceState : History.pushState)(null, document.title, url);
	state_lock = false;
}

// update the all-character preview as well as the normal preview
function full_newstate(replace){
	if (state_lock) return;
	newstate(replace);
	var allframeRedraw = $('#toggle-allpreview').is(':checked');
	if (allframeRedraw){
		allframe();
	}
}

function update_skins() {
	var s = $('#skinsel')
	s.find('div').remove()
	s.append($('<div>').text('Classic').data('id', -1))
	var sa = skins[cur_class][2]
	for (var i = 0; i < sa.length; i++) {
		var t = sa[i]
		s.append($('<div>').text(t[0]).data('id', t[1]))
	}
}

function init_stage() {
	stage = $('#stage')[0]
	sctx = stage.getContext('2d');
	sctx.imageSmoothingEnabled = false;
	sctx.mozImageSmoothingEnabled = false;
	bc = document.createElement('canvas');
	bctx = bc.getContext('2d');
	bc.width = bc.height = stage.width / zoom;

	allstage = $('#allstage')[0]
	asctx = allstage.getContext('2d');

	// set width + height based on number of classes/skins
	var allstageWidth = 0;
	var allstageHeight = 0;
	for (var obj in skins){
		allstageWidth++;
		allstageHeight = Math.max(allstageHeight, (skins[obj][2].length + 1));
	}
	function charDimsToPixels(dimension){
		return ((42 * dimension) + (6 * (dimension - 1)) + 16);
	}
	allstage.width = allstageWidth = charDimsToPixels(allstageWidth);
	allstage.height = allstageHeight = charDimsToPixels(allstageHeight);

	abc = document.createElement('canvas');
	abctx = abc.getContext('2d');
	abc.width = allstage.width;
	abc.height = allstage.height;

	init_dyes();

	// classes
	var clsel = $('#clsel');
	for (var i in skins) {
		$('<div/>').text(skins[i][0]).data('id', i).appendTo(clsel);
	}
	clsel.on('click', 'div', function() {
		cur_class = +$(this).data('id');
		cur_skin = -1;
		newstate()
	});

	// skins
	$('#skinsel').on('click', 'div', function() {
		cur_skin = +$(this).data('id')
		newstate()
	})

	// wasd
	var keys = []
	$(document)
	.keydown(function(e){
		if (e.altKey || e.ctrlKey || e.metaKey) return;
		var dir = DKEYS.indexOf(e.keyCode);
		if (!r_down && e.keyCode == 82) { // R (random)
			r_down = true;
			var dyes = $('.dye'), dlen = dyes.length;
			for (var i = 0; i < 2; i++) {
				var r = Math.floor(Math.random() * dlen);
				tx[i] = $(dyes[r]).data('id');
			}
			full_newstate();
			return;
		}
		if (!~dir) return;
		e.preventDefault();
		cur_dir = dir;
		walking = true;
		if (!~keys.indexOf(dir)) keys.push(dir)
		attacking = e.shiftKey;
		frame();
	})
	.keyup(function(e){
		e.preventDefault();
		var dir = DKEYS.indexOf(e.keyCode);
		if (e.keyCode == 82) r_down = false;
		attacking = e.shiftKey;
		keys = keys.filter(function(k) { return k != dir })
		if (!keys.length) {
			walking = attacking = false
		} else {
			cur_dir = keys[keys.length - 1]
		}
		frame();
	});

	$('#stage').click(function(e) {
		if (e.shiftKey) {
			blushing = !blushing;
			d_bstart = Date.now();
		} else {
			zoom = zoom == 3 ? 1 : zoom + 1;
			bc.width = bc.height = stage.width / zoom
		}
		frame();
	});

	$('#allstage').click(function(e) {
		var $t = $(this)
		var dx = e.pageX - $t.offset().left
		var dy = e.pageY - $t.offset().top
		dx = Math.floor((dx - 5) / 48)
		dy = Math.floor((dy - 5) / 48)
		for (var k in skins) {
			if (skins[k][1] != dx) continue
			var sk = -1
			if (dy > 0) {
				sk = skins[k][2][dy - 1]
				if (!sk) return
			}
			cur_class = k
			cur_skin = dy ? sk[1] : -1
			newstate()
			return
		}
	})

	$('#dyebox').tooltip({
		position: {
			my: 'center top',
			at: 'center+1 bottom'
		},
		show: {
			effect: 'none',
			delay: 150
		},
		hide: false
	})

	$(document).mousedown(function(e) { e.preventDefault(); });

	ready = true;
}

function update_sel(id, elid) {
	var b = $('#' + id)
	b.find('.selected').removeClass('selected')
	b.find('div').each(function() {
		if ($(this).data('id') == elid) $(this).addClass('selected')
	})
}

function update_visuals() {
	if (!ready) return;
	for (var t = 0; t < 2; t++) {
		var $t = $('.dye').filter(function() {
			return +$(this).data('id') == tx[t];
		});
		var $ind = $('#ind' + t);
		if (!$t.length) $ind.hide(); else $ind.show().appendTo($t);
		$('#desc' + t).text(dyes[tx[t]] ? dyes[tx[t]][0] : 'none')
	}
	update_skins()
	update_sel('clsel', cur_class)
	update_sel('skinsel', cur_skin)
	frame();
}
