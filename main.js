/* by atomizer */

var SNAMES = ['players', 'playersMask', 'playersSkins', 'playersSkinsMask', 4, 5, 9, 10];
var SBASE = 'sheets';

var DFRAMES = [[0, 1, 0, 4, 5], [7, 8, 9, 11, 12], [0, 1, 0, 4, 5], [14, 15, 16, 18, 19]];
var DKEYS = [68, 83, 65, 87]; // dsaw

var CLASSES = {
0x0300: ['Rogue', 0, ['Rough Rouge:0']],
0x0307: ['Archer', 1, ['Robin Hood:1']],
0x030e: ['Wizard', 2, ['Merlin:2', 'Elder Wizard:14']],
0x0310: ['Priest', 3, ['Traditional:3', 'Robed Priest:15']],
0x031d: ['Warrior', 4, ['Strength Warrior:4']],
0x031e: ['Knight', 5, ['Blue Knight:5', 'Blue Knight Alt:7']],
0x031f: ['Paladin', 6, ['Decorated Paladin:6']],
0x0320: ['Assassin', 7, []], // ['No Assassin:6']],
0x0321: ['Necromancer', 8, ['Skull Necromancer:8']],
0x0322: ['Huntress', 9, ['Battle Huntress:9']],
0x0323: ['Mystic', 10, ['Gem Mystic:10']],
0x0324: ['Trickster', 11, ['Super Trickster:11']],
0x0325: ['Sorcerer', 12, ['Sorcerer Mage:12']],
0x0326: ['Ninja', 13, ['Dark Ninja:13']],
}

var REALDYES = [
'beige',
'black',
'blue',
'brown',
'fire brick',
'fuchsia',
'gray',
'green',
'maroon',
'mint cream',
'olive',
'orange',
'orchid',
'pink',
'plum',
'purple',
'red',
'royal blue',
'salmon',
'sienna',
'silver',
'steel blue',
'tan',
'teal',
'thistle',
'turquoise',
'white',
'yellow',
]

var ready = false;

var sprites = {};
var stage, sctx;
var cur_class = 0x030e, cur_skin = -1, cur_dir = 0, cur_frame = 0;
var tx = [-1, -1];
var sc = 0;

BLUSH_PERIOD = 600
WALK_PERIOD = 300
var walking = false, attacking = false, blushing = false;
var d_wstart = new Date, d_bstart = d_wstart;
var r_down = false;

// http://paulirish.com/2011/requestanimationframe-for-smart-animating/
window.requestAnimFrame = (function(){
	return window.requestAnimationFrame    || 
		window.webkitRequestAnimationFrame || 
		window.mozRequestAnimationFrame    || 
		window.oRequestAnimationFrame      || 
		window.msRequestAnimationFrame     || 
		function( callback ){
			window.setTimeout(callback, 1000 / 60);
		};
})();

function extract_sprites(img, sx, sy) {
	sx = sx || 8;
	sy = sy || sx;
	var i = 0, r = [];
	var c = document.createElement('canvas');
	c.width = img.width; c.height = img.height;
	var ctx = c.getContext('2d');
	ctx.drawImage(img, 0, 0);
	for (var y = 0; y < c.height; y += sy) {
		for (var x = 0; x < c.width; x += sx) {
			var ri = ctx.getImageData(x, y, sx, sy);
			// if it's full white or full transparent, skip
			//var vi = ri.data[0];
			//for (var k = 0; k < ri.data.length; k++) if (ri.data[k] != vi) break;
			//if (k < ri.data.length)
			r[i] = ri;
			i++;
		}
	}
	return r;
}


function load_img(src, t, s) {
	var i = new Image();
	var d = new $.Deferred();
	
	i.onload = function() { d.resolve(this, t, s);	}
	i.onerror = function() { d.reject(src);	}
	i.src = src;
	
	return d.promise();
}


function load_sheets() {
	var d = new $.Deferred(),
		wait = SNAMES.length;
	
	for (var i = 0; i < SNAMES.length; i++) {
		var src = SNAMES[i];
		var sz = +src;
		if (src == +src) src = 'textile' + src + 'x' + src;
		src = SBASE + '/' + src + '.png';

		load_img(src, SNAMES[i], sz)
		.done(function(img, t, s) {
			sprites[t] = extract_sprites(img, s);
			if (!--wait) d.resolve();
		})
		.fail(function(){ d.reject(); });
	}
	return d.promise();
}


function init_dyes() {
	var dyebox = $('#dyebox');
	
	dyebox.delegate('.dye', 'click', function(e) {
		var t = +e.shiftKey;
		var $t = $(this), id = $t.data('id');
		tx[t] = (tx[t] == id) ? -1 : id;
		newstate();
	});
	
	for (var i = 0; i < dyes.length; i++) {
		var d = dyes[i];
		var dname = d[0].replace(/ cloth$| clothing dye$/i, '');
		if (~d[0].search(/dye$/i) && !~REALDYES.indexOf(dname.toLowerCase())) continue;
		var c = $('<div/>').addClass('dye');
		if (d[1] == 1) {
			// dye
			c.css('background-color', d[2]);
			d[3] = d[2];
		} else {
			// cloth
			var spr = sprites[d[1]][d[2]];
			var ca = document.createElement('canvas');
			ca.width = spr.width; ca.height = spr.height;
			var cactx = ca.getContext('2d');
			cactx.putImageData(spr, 0, 0);
			c.css('background-image', 'url(' + ca.toDataURL() + ')');
			d[3] = cactx.createPattern(ca, 'repeat');
		}
		c.data('id', i);
		c.attr('title', dname);
		d[1] == 1 ? c.appendTo(dyebox) : c.insertBefore(dyebox.find('br'));
	}
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

var ftimer

function frame(id, scale) {
	ftimer = 1
	var cur_frame = 0, blush = 0;
	
	if (walking || attacking) {
		cur_frame = (new Date - d_wstart) % WALK_PERIOD;
		cur_frame = (cur_frame / WALK_PERIOD < 0.5) ? 1 : 2;
		if (attacking) cur_frame += 2;
	}
	if (blushing) {
		blush = (new Date - d_bstart) % BLUSH_PERIOD;
		blush /= BLUSH_PERIOD;
		blush = 127 * (1 - 2 * Math.abs(Math.asin(2 * blush - 1) / Math.PI));
	}
	
	id = id || DFRAMES[cur_dir][cur_frame] || 0;
	scale = scale || 5;

	var c = sctx;
	
	c.save();
	c.clearRect(0, 0, stage.width, stage.height);
	c.translate(stage.width/2, stage.height/2);
	
	c.scale(sc+1, sc+1);
	c.translate(-4 * scale, -4 * scale);
	
	// var grad = c.createLinearGradient(0, scale*3, 0, scale*8);
	// grad.addColorStop(0, 'black');
	// grad.addColorStop(1, 'rgba(0,0,0,0.15)');
	
	function pastesprite(id) {
		var i = ~cur_skin ? cur_skin : CLASSES[cur_class][1]
		i = i * 21 + id;
		var sh = ~cur_skin ? 'playersSkins' : 'players'
		var spr = sprites[sh][i];
		var mask = sprites[sh + 'Mask'][i];
		var xd = 1 - (cur_dir == 2) * 2;
		for (var xi = 0; xi < 8; x += scale * xd, xi++) {
			for (var yi = 0, y = 0; yi < 8; y += scale, yi++) {
				
				if (!p_comp(spr, xi, yi, 3)) continue;
				
				// standart
				c.fillStyle = p_css(spr, xi, yi);
				c.fillRect(x, y, scale, scale);
				
				// if there is something on mask, paint over
				if (p_comp(mask, xi, yi, 3)) {
					for (var ch = 0; ch < 2; ch++) { // 2 textures/channels
						if (!~tx[ch]) continue;
						var vol = p_comp(mask, xi, yi, ch);
						if (!vol) continue;
						c.fillStyle = dyes[tx[ch]][3];
						c.fillRect(x, y, scale, scale);
						c.fillStyle = 'rgba(0,0,0,' + ((255 - vol) / 255) + ')';
						c.fillRect(x, y, scale, scale);
					}
				}
				
				// c.fillStyle = grad;
				// c.globalCompositeOperation = 'substract';
				// c.fillRect(x, y, scale, scale);
				// c.restore();
				
				// outline
				c.save();
				c.globalCompositeOperation = 'destination-over';
				c.strokeRect(x-0.5, y-0.5, scale+1, scale+1);
				c.restore();
			}
		}
	}
	var x = (cur_dir == 2) ? scale * 7 : 0;
	pastesprite(id);
	if (attacking && cur_frame == 4) { // attacking, frame 2
		x = (cur_dir == 2) ? -scale : scale * 8;
		pastesprite(id + 1);
	}
	c.restore();
	
	// gradient + blush (had to do by hand because there's no actual "substract" blending, d'oh)
	scale *= sc+1;
	var x0 = stage.width/2 - scale*12; // gaaaaaaaahhhh
	var y0 = stage.height/2 - scale*4;
	var d = c.getImageData(x0, y0, scale*24, scale*8);
	for (var x = 0; x < scale * 24; x++) {
		for (var y = 0; y < scale * 8; y++) {
			if (!p_comp(d, x, y, 3)) continue; // skip transparent
			var pd = p_dict(d, x, y);
			var gr = y < scale*3 ? 0 : 39 * (y - scale*3) / (scale*5);
			pd[0] += blush; pd[0] -= gr;
			pd[1] -= blush + gr;
			pd[2] -= blush + gr;
			p_set(d, x, y, pd);
		}
	}
	c.putImageData(d, x0, y0);
	
	// shadow - iffy, no chrome
/* 	c.save();
	c.shadowBlur = 10;
	c.shadowColor = 'black';
	c.drawImage(stage, 0, 0);
	c.restore(); */
	
	if (walking || blushing) {
		requestAnimFrame(function() {frame() });
	} else {
		ftimer = 0
	}
}



// action

var preload = load_sheets();

$(function(){
	// ensure that dom is ready before calling init_stage, but allow preload to start earlier
	preload.done(function(){init_stage()});
	// url stuff
	function statechanged(replace) {
		var state = History.getState();
		var t = state.hash.replace(/[\/\?]/g, '').replace(/=[^&]*/g, '').split('&');
		var csa = t[0].split('.')
		cur_class = isNaN(csa[0]) || csa[0] == '' ? cur_class : +csa[0];
		for (var i in CLASSES) {
			if (CLASSES[i][1] == cur_class) {
				cur_class = i
				break
			}
		}
		cur_skin = isNaN(csa[1]) || csa[1] == '' ? -1 : +csa[1]
		tx[0] = isNaN(t[1]) || t[1] == '' ? tx[0] : +t[1];
		tx[1] = isNaN(t[2]) || t[2] == '' ? tx[1] : +t[2];
		newstate(replace);
	}
	History.Adapter.bind(window, 'statechange', statechanged);
	statechanged(true);
});

var state_lock = false; // against race conditions
function newstate(replace) {
	if (state_lock) return;
	state_lock = true;
	update_visuals();
	var cs = CLASSES[cur_class][1] + (~cur_skin ? '.' + cur_skin : '')
	var url = '/?' + [cs, tx[0], tx[1]].join('&');
	(replace ? History.replaceState : History.pushState)(null, document.title, url);
	state_lock = false;
}

function update_skins() {
	var s = $('#skinsel')
	s.empty().append($('<div>').text('Classic').data('id', -1))
	var sa = CLASSES[cur_class][2]
	for (var i = 0; i < sa.length; i++) {
		var t = sa[i].split(':')
		s.append($('<div>').text(t[0]).data('id', t[1]))
	}
}

function init_stage() {
	stage = $('#stage')[0], sctx = stage.getContext('2d');
	sctx.imageSmoothingEnabled = false;
	sctx.webkitImageSmoothingEnabled = false;
	sctx.mozImageSmoothingEnabled = false;
	
	init_dyes();
	
	// classes
	var clsel = $('#clsel');
	for (var i in CLASSES) {
		$('<div/>').text(CLASSES[i][0]).data('id', i).appendTo(clsel);
	}
	clsel.delegate('div', 'click', function() {
		cur_class = +$(this).data('id');
		cur_skin = -1;
		update_skins()
		newstate()
	});
	
	// skins
	$('#skinsel').delegate('div', 'click', function() {
		cur_skin = +$(this).data('id')
		newstate()
	})
	
	update_skins()
	frame();
	
	// wasd
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
			newstate();
			return;
		}
		if (!~dir) return;
		e.preventDefault();
		cur_dir = dir;
		walking = true;
		attacking = e.shiftKey;
		if (!ftimer) frame();
	})
	.keyup(function(e){
		e.preventDefault();
		var dir = DKEYS.indexOf(e.keyCode);
		if (e.keyCode == 82) r_down = false;
		attacking = e.shiftKey;
		if (!~dir || cur_dir != dir) return;
		walking = attacking = false;
		frame();
	});
	
	$('#stage').click(function(e) {
		if (e.shiftKey) {
			blushing = !blushing;
			d_bstart = new Date;
		} else sc = +!sc;
		frame();
	});
	
	$(document).mousedown(function(e) { e.preventDefault(); });
	
	ready = true;
	update_visuals();
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
		if (!$t.length) tx[t] = -1;
		var $ind = $('#ind' + t);
		if (tx[t] == -1) $ind.hide();
		else $ind.show().appendTo($t);
	}
	update_sel('clsel', cur_class)
	update_sel('skinsel', cur_skin)
	frame();
}

