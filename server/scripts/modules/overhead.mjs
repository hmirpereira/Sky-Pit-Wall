// aircraft around the chosen location, served by the skypitwall-voos service on the Pi
// (the owner's ADS-B receiver first, completed by the adsb.lol network; routes from adsbdb.com).
// Page 1: the closest aircraft in the air (flight, airline, route, altitude, speed, type).
// Page 2: radar of everything within 50 km, and a list sorted by distance.
// Page 3 (only with aircraft on the ground): airport plan with the aircraft on it, and in grey the
// group's aircraft still on their stand after switching the transponder off (old flight number and stand).
// Metric units.
// Off the Pi the screen is skipped. The airport marker comes from the service (no place in the code).
import STATUS from './status.mjs';
import { json } from './utils/fetch.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';

const SERVICE_URL = 'http://127.0.0.1:8095/overhead.json';
// everything on screen is metric; ADS-B gives feet and knots
const RANGE_KM = 50;
const KM_PER_NM = 1.852;
const M_PER_FT = 0.3048;
const RADAR_RADIUS = 140; // px, keep in sync with _overhead.scss
const GROUP_ICONS = ['LH', 'LX', 'OS', '4Y', 'SN'];
// airline logos drawn above the flight number on the radar, by ICAO airline code (the first
// three letters of the callsign): add the code here and the file as images/overhead-logos/<CODE>.png
// (drawn at 48 x 16 px, transparent background). Only codes listed here are asked for.
const RADAR_LOGOS = [];
const LOGO_H = 16;
const airlineCode = (callsign) => /^([A-Z]{3})\d/.exec(callsign ?? '')?.[1] ?? null;
// flight number (LH1176) from the Pi service; aircraft whose callsign does not give it
// (letters in it, like RYR10UB, or no airline known) show the callsign instead
const flightText = (ac) => ac.flight ?? ac.callsign;
const routeText = (ac) => (ac.from?.iata && ac.to?.iata ? `${ac.from.iata}-${ac.to.iata}` : '');

const toRad = (d) => (d * Math.PI) / 180;
const distanceNm = (a, b) => {
	const dLat = toRad(b.lat - a.lat);
	const dLon = toRad(b.lon - a.lon);
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
	return 2 * 3440.065 * Math.asin(Math.sqrt(h));
};
const bearing = (a, b) => {
	const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
	const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
	return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};
const compass = (deg) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
const stripAccents = (text) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const metres = (ac) => Math.round((ac.alt * M_PER_FT) / 10) * 10;
const altitudeText = (ac) => (ac.ground ? 'Ground' : `${metres(ac).toLocaleString('en-US')} m`);
const shortAltitude = (ac) => (ac.ground ? 'GND' : metres(ac).toLocaleString('en-US'));

// airport plan: lat/lon box around the runways, aprons and buildings
const planBounds = (airport) => {
	// map: { runways: [line, ...], ... }, each line a list of [lat, lon]
	const pts = Object.values(airport.map).flat(1).flat(1);
	const lats = pts.map((pt) => pt[0]);
	const lons = pts.map((pt) => pt[1]);
	return {
		south: Math.min(...lats), north: Math.max(...lats), west: Math.min(...lons), east: Math.max(...lons),
	};
};
const insidePlan = (airport, ac) => {
	const b = planBounds(airport);
	return ac.lat >= b.south - 0.003 && ac.lat <= b.north + 0.003 && ac.lon >= b.west - 0.004 && ac.lon <= b.east + 0.004;
};
// where an aircraft on the ground is: the stand it is parked on (within 40 m, nearly stopped),
// else the taxiway it is on (within 25 m), else nothing
const groundMetres = (a, b) => Math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 111320 * Math.cos(toRad(a[0])));
const toLine = (pt, a, b) => {
	// distance from a point to a segment, in metres, on a flat local grid
	const k = 111320 * Math.cos(toRad(pt[0]));
	const [px, py] = [pt[1] * k, pt[0] * 111320];
	const [ax, ay] = [a[1] * k, a[0] * 111320];
	const [bx, by] = [b[1] * k, b[0] * 111320];
	const len = (bx - ax) ** 2 + (by - ay) ** 2;
	const f = len ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len)) : 0;
	return Math.hypot(px - (ax + f * (bx - ax)), py - (ay + f * (by - ay)));
};
const whereOnGround = (airport, ac) => {
	const pt = [ac.lat, ac.lon];
	if ((ac.gs ?? 0) < 5) {
		const stand = (airport.stands ?? []).map(([ref, lat, lon]) => [ref, groundMetres(pt, [lat, lon])])
			.sort((a, b) => a[1] - b[1])[0];
		if (stand && stand[1] <= 40) return stand[0];
	}
	const refs = airport.taxiwayRefs ?? [];
	let best = null;
	(airport.map.taxiways ?? []).forEach((way, i) => {
		if (!refs[i]) return;
		for (let j = 1; j < way.length; j += 1) {
			const d = toLine(pt, way[j - 1], way[j]);
			if (d <= 25 && (!best || d < best[1])) best = [refs[i], d];
		}
	});
	return best ? `TWY ${best[0]}` : '';
};

const PLAN_W = 640;
const PLAN_H = 310;
// the plan is turned so the longest runway lies across the page, which fills the wide screen
// best; returns the projection and the turn in degrees (clockwise) for the north mark and the arrows
const planProjection = (airport) => {
	const b = planBounds(airport);
	const lat0 = (b.north + b.south) / 2;
	const lon0 = (b.east + b.west) / 2;
	const kx = Math.cos(toRad(lat0));
	// local x east, y south, in degrees of latitude
	const local = (lat, lon) => [(lon - lon0) * kx, lat0 - lat];
	const runway = (airport.map.runways ?? []).map((way) => [way[0], way.at(-1)])
		.sort(([a1, a2], [b1, b2]) => Math.hypot(...local(...b1).map((v, i) => v - local(...b2)[i]))
			- Math.hypot(...local(...a1).map((v, i) => v - local(...a2)[i])))[0];
	let turn = 0;
	if (runway) {
		const [x1, y1] = local(...runway[0]);
		const [x2, y2] = local(...runway[1]);
		turn = -Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
		// keep north on the upper half of the page
		if (turn > 90) turn -= 180;
		if (turn < -90) turn += 180;
	}
	const c = Math.cos(toRad(turn));
	const sn = Math.sin(toRad(turn));
	const turned = (lat, lon) => {
		const [x, y] = local(lat, lon);
		return [x * c - y * sn, x * sn + y * c];
	};
	const pts = Object.values(airport.map).flat(1).flat(1).map((pt) => turned(...pt));
	const xs = pts.map((pt) => pt[0]);
	const ys = pts.map((pt) => pt[1]);
	const minX = Math.min(...xs);
	const minY = Math.min(...ys);
	const w = Math.max(...xs) - minX;
	const h = Math.max(...ys) - minY;
	const scale = Math.min((PLAN_W - 60) / w, (PLAN_H - 40) / h);
	const offX = (PLAN_W - w * scale) / 2;
	const offY = (PLAN_H - h * scale) / 2;
	const project = (lat, lon) => {
		const [x, y] = turned(lat, lon);
		return { x: offX + (x - minX) * scale, y: offY + (y - minY) * scale };
	};
	return { project, turn };
};

class Overhead extends WeatherDisplay {
	constructor(navId, elemId, defaultActive) {
		super(navId, elemId, 'Overhead', defaultActive);
		this.timing.baseDelay = 12000;
		this.timing.totalScreens = 2;
	}

	async getData(weatherParameters) {
		if (!super.getData(weatherParameters)) return;
		const home = { lat: (this.weatherParameters ?? weatherParameters).latitude, lon: (this.weatherParameters ?? weatherParameters).longitude };
		try {
			const data = await json(SERVICE_URL, { signal: AbortSignal.timeout(5000) });
			this.home = home;
			this.airport = data.airport ?? null;
			this.allAircraft = data.aircraft ?? [];
			// aircraft of the group still on their stand with the transponder off (last position kept by the Pi)
			this.parked = (data.parked ?? []).map((ac) => ({ ...ac, ground: true, parked: true }));
			this.aircraft = (data.aircraft ?? [])
				.map((ac) => ({ ...ac, dist: distanceNm(this.home, ac) * KM_PER_NM, brg: bearing(this.home, ac) }))
				.filter((ac) => ac.dist <= RANGE_KM)
				.sort((a, b) => a.dist - b.dist);
		} catch (error) {
			console.error('Overhead: no data from the Pi', error);
			this.setStatus(STATUS.noData);
			return;
		}
		this.closest = this.aircraft.find((ac) => !ac.ground);
		// aircraft on the airport plan: on the ground, or very low over it (landing or taking off)
		this.onAirport = this.airport?.map ? [
			...this.allAircraft.filter((ac) => insidePlan(this.airport, ac) && (ac.ground || ac.alt * M_PER_FT < 300)),
			...this.parked.filter((ac) => insidePlan(this.airport, ac)),
		] : [];
		if (!this.closest && !this.onAirport.length) {
			this.setStatus(STATUS.noData);
			return;
		}
		// aircraft on the ground go to the airport plan page when there is one, so the radar shows what is flying
		this.radarAircraft = this.onAirport.length ? this.aircraft.filter((ac) => !ac.ground) : this.aircraft;
		this.pages = [this.closest && 'closest', this.closest && 'radar', this.onAirport.length && 'ground'].filter(Boolean);
		this.timing.totalScreens = this.pages.length;
		this.calcNavTiming();
		this.setStatus(STATUS.loaded);
	}

	async drawCanvas() {
		super.drawCanvas();
		const page = this.pages[Math.min(Math.max(this.screenIndex, 0), this.pages.length - 1)];
		['closest', 'radar', 'ground'].forEach((name) => {
			this.elem.querySelector(`.overhead-page.${name}`).style.display = page === name ? 'block' : 'none';
		});
		const titles = { closest: 'Closest Now', radar: `Within ${RANGE_KM} km`, ground: `${this.airport?.name ?? ''} Ground` };
		this.elem.querySelector('.header .title.dual .bottom').innerHTML = titles[page];
		if (page === 'closest') this.drawClosest();
		if (page === 'radar') this.drawRadar();
		if (page === 'ground') this.drawGround();
		this.finishDraw();
	}

	drawGround() {
		const page = this.elem.querySelector('.overhead-page.ground');
		const { project, turn } = planProjection(this.airport);
		const path = (way) => way.map(([lat, lon]) => {
			const p = project(lat, lon);
			return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
		}).join(' ');
		const { map } = this.airport;
		const stands = this.airport.stands ?? [];
		const svg = [
			...(map.aprons ?? []).map((w) => `<polygon class="apron" points="${path(w)}"/>`),
			...(map.buildings ?? []).map((w) => `<polygon class="building" points="${path(w)}"/>`),
			...(map.taxiways ?? []).map((w) => `<polyline class="taxiway" points="${path(w)}"/>`),
			...(map.runways ?? []).map((w) => `<polyline class="runway" points="${path(w)}"/>`),
			...stands.map(([, lat, lon]) => {
				const p = project(lat, lon);
				return `<circle class="stand" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="1.5"/>`;
			}),
		].join('');
		page.querySelector('.plan').innerHTML = `<svg viewBox="0 0 ${PLAN_W} ${PLAN_H}">${svg}</svg>`;

		// nothing written may overlap: aircraft first, then taxiway letters, then stand numbers
		// (stands are close together, so only the ones with room get their number). Boxes are [x, y, w, h].
		const taken = [];
		const free = (x, y, w, h) => x >= 0 && x + w <= PLAN_W && y >= 0 && y + h <= PLAN_H
			&& taken.every(([tx, ty, tw, th]) => x >= tx + tw || tx >= x + w || y >= ty + th || ty >= y + h);
		const take = (box) => {
			if (!free(...box)) return false;
			taken.push(box);
			return true;
		};

		// aircraft: arrow in the direction it points; flight number, and under it the stand or taxiway it is on
		const LABEL_W = 70;
		const targets = this.onAirport.map((ac) => {
			const p = project(ac.lat, ac.lon);
			let where = '';
			if (ac.parked) where = ac.stand ?? '';
			else if (ac.ground) where = whereOnGround(this.airport, ac);
			const h = where ? 30 : 16;
			taken.push([p.x - 8, p.y - 10, 16, 20]);
			const spot = [[9, -8], [-9 - LABEL_W, -8], [9, -h], [-9 - LABEL_W, -h], [9, 2], [-9 - LABEL_W, 2]]
				.map(([dx, dy]) => [p.x + dx, p.y + dy]).find(([x, y]) => free(x, y, LABEL_W, h));
			if (spot) taken.push([...spot, LABEL_W, h]);
			const side = spot && spot[0] < p.x ? 'left' : 'right';
			const label = spot ? `<div class="label ${side}" style="left:${spot[0] - p.x}px; top:${spot[1] - p.y}px">`
				+ `${flightText(ac)}${where ? `<div class="where">${where}</div>` : ''}</div>` : '';
			return `<div class="target${ac.ground ? '' : ' moving'}${ac.parked ? ' parked' : ''}" style="left:${p.x}px; top:${p.y}px">
				<div class="plane" style="transform: rotate(${(ac.track ?? 0) + turn}deg)"></div>${label}</div>`;
		});

		const marks = [];
		(this.airport.taxiwayLabels ?? []).forEach(([ref, lat, lon]) => {
			const p = project(lat, lon);
			const w = ref.length * 7 + 6;
			if (take([p.x - w / 2, p.y - 7, w, 14])) marks.push(`<div class="twy" style="left:${p.x - w / 2}px; top:${p.y - 7}px; width:${w}px">${ref}</div>`);
		});
		stands.forEach(([ref, lat, lon]) => {
			const p = project(lat, lon);
			// a little larger than the text, so the numbers keep a gap between them
			const w = ref.length * 6 + 4;
			// the number just off the stand mark, on whichever side has room
			const spot = [[3, -7], [-3 - w, -7], [-w / 2, -16], [-w / 2, 3]]
				.map(([dx, dy]) => [p.x + dx, p.y + dy]).find(([x, y]) => free(x, y, w, 13));
			if (spot) {
				taken.push([...spot, w, 13]);
				marks.push(`<div class="stand-ref" style="left:${spot[0]}px; top:${spot[1]}px">${ref}</div>`);
			}
		});
		page.querySelector('.plan-targets').innerHTML = marks.join('') + targets.join('');
		page.querySelector('.north .arrow').style.transform = `rotate(${turn}deg)`;
	}

	drawClosest() {
		const ac = this.closest;
		const card = this.elem.querySelector('.overhead-page.closest');
		card.querySelector('.where').textContent = `${ac.dist.toFixed(1)} km ${compass(ac.brg)} of home`;
		card.querySelector('.callsign').textContent = flightText(ac);
		card.querySelector('.airline').textContent = stripAccents(ac.airline ?? '');
		const tail = card.querySelector('.tail');
		tail.style.display = GROUP_ICONS.includes(ac.iataAirline) ? '' : 'none';
		tail.src = `images/airlines/${ac.iataAirline}.png`;
		// no route, or one that does not fit where the aircraft is (checked by the Pi service)
		card.querySelector('.route').classList.toggle('unknown', !(ac.from?.iata && ac.to?.iata));
		card.querySelector('.from .code').textContent = ac.from?.iata ?? '';
		card.querySelector('.from .city').textContent = stripAccents(ac.from?.city ?? '');
		card.querySelector('.to .code').textContent = ac.to?.iata ?? '';
		card.querySelector('.to .city').textContent = stripAccents(ac.to?.city ?? '');
		// the Star4000 fonts have no arrows: climbing or descending is a small triangle drawn in CSS
		let trend = '';
		if (ac.vrate > 300) trend = 'up';
		if (ac.vrate < -300) trend = 'down';
		card.querySelector('.alt .value').innerHTML = `${altitudeText(ac)}<span class="trend ${trend}"></span>`;
		card.querySelector('.speed .value').textContent = `${Math.round(ac.gs * KM_PER_NM)} km/h`;
		card.querySelector('.type .value').textContent = ac.type ?? '';
		card.querySelector('.reg .value').textContent = ac.reg ?? '';
	}

	drawRadar() {
		const page = this.elem.querySelector('.overhead-page.radar');
		const scope = page.querySelector('.scope .targets');
		scope.innerHTML = '';
		const place = (lat, lon) => {
			const d = distanceNm(this.home, { lat, lon });
			const b = toRad(bearing(this.home, { lat, lon }));
			const r = ((d * KM_PER_NM) / RANGE_KM) * RADAR_RADIUS;
			return { x: RADAR_RADIUS + r * Math.sin(b), y: RADAR_RADIUS - r * Math.cos(b) };
		};
		// labels must not overlap each other, the ring numbers, the home dot or the airport name:
		// the closest aircraft first, then by distance; a label goes to the right of its aircraft,
		// or to the left, or is left out (the arrow is always drawn). Boxes are [x, y, width, height].
		const labels = [[170, 130, 24, 14], [210, 130, 24, 14], [136, 136, 8, 8]];
		if (this.airport?.lat !== undefined) {
			const spot = place(this.airport.lat, this.airport.lon);
			const airport = document.createElement('div');
			// name on the side away from home, so it does not cover the home mark
			airport.className = `airport ${spot.x < RADAR_RADIUS ? 'west' : 'east'}`;
			airport.style.left = `${spot.x}px`;
			airport.style.top = `${spot.y}px`;
			airport.textContent = this.airport.name ?? '';
			scope.append(airport);
			const nameW = (this.airport.name ?? '').length * 9 + 10;
			labels.push([spot.x < RADAR_RADIUS ? spot.x - 8 - nameW : spot.x + 8, spot.y - 10, nameW, 20]);
		}

		const LABEL_W = 62;
		// flight number, and the route under it when known; a logo, when there is one, goes above
		const free = (x, y, h) => x >= 0 && x + LABEL_W <= 280 && y >= 0 && y + h <= 280
			&& labels.every(([lx, ly, lw, lh]) => x >= lx + lw || lx >= x + LABEL_W || y >= ly + lh || ly >= y + h);
		this.radarAircraft.forEach((ac) => {
			const p = place(ac.lat, ac.lon);
			const route = routeText(ac);
			const code = airlineCode(ac.callsign);
			const logo = RADAR_LOGOS.includes(code) ? LOGO_H : 0;
			const top = p.y - 6 - logo;
			const h = (route ? 28 : 14) + logo;
			// places tried in turn: right, left, then the same a little higher or lower, then further away
			let spot = null;
			if (!ac.ground) {
				const L = -10 - LABEL_W;
				spot = [[10, 0], [L, 0], [10, -h + 6], [L, -h + 6], [10, h - 6], [L, h - 6], [10, -2 * h], [L, -2 * h], [10, 2 * h], [L, 2 * h]]
					.map(([dx, dy]) => [p.x + dx, top + dy]).find(([x, y]) => free(x, y, h)) ?? null;
				if (spot) labels.push([...spot, LABEL_W, h]);
			}
			const side = spot && spot[0] < p.x ? 'left' : 'right';
			const target = document.createElement('div');
			target.className = `target${ac === this.closest ? ' closest' : ''}${ac.ground ? ' ground' : ''}`;
			target.style.left = `${p.x}px`;
			target.style.top = `${p.y}px`;
			// aircraft on the ground: a dot at the airport, without a label
			const label = spot ? `<div class="label ${side}" style="left:${spot[0] - p.x}px; top:${spot[1] - p.y}px">${logo ? `<img class="logo" src="images/overhead-logos/${code}.png" alt="">` : ''}`
				+ `<div class="flight">${flightText(ac)}</div>${route ? `<div class="route">${route}</div>` : ''}</div>` : '';
			target.innerHTML = ac.ground ? '<div class="dot"></div>'
				: `<div class="plane" style="transform: rotate(${ac.track ?? 0}deg)"></div>${label}`;
			scope.append(target);
		});

		const lines = this.radarAircraft.slice(0, 7).map((ac) => this.fillTemplate('overhead-row', {
			callsign: flightText(ac),
			alt: shortAltitude(ac),
			dist: `${ac.dist.toFixed(0)}`,
		}));
		const list = page.querySelector('.overhead-lines');
		list.innerHTML = '';
		list.append(...lines);
	}
}

// register display
registerDisplay(new Overhead(18, 'overhead', false));
