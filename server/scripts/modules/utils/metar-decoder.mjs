/* eslint-disable no-continue */
// (a token-by-token parser reads more clearly with early "continue")
// Decodes a raw METAR string into plain English fields.
// Covers the common ICAO METAR groups; anything unrecognised is ignored
// (the raw report is always shown on screen alongside the decoded values).

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

const CLOUD_COVER = {
	FEW: 'Few clouds',
	SCT: 'Scattered clouds',
	BKN: 'Broken clouds',
	OVC: 'Overcast',
};

// kept as the standard abbreviations: the full names do not fit on the screen
const CLOUD_TYPE = {
	CB: 'CB',
	TCU: 'TCU',
};

const DESCRIPTORS = {
	MI: 'shallow',
	PR: 'partial',
	BC: 'patches of',
	DR: 'low drifting',
	BL: 'blowing',
	SH: 'showers',
	TS: 'thunderstorm',
	FZ: 'freezing',
};

const PHENOMENA = {
	DZ: 'drizzle',
	RA: 'rain',
	SN: 'snow',
	SG: 'snow grains',
	IC: 'ice crystals',
	PL: 'ice pellets',
	GR: 'hail',
	GS: 'small hail',
	UP: 'unknown precipitation',
	BR: 'mist',
	FG: 'fog',
	FU: 'smoke',
	VA: 'volcanic ash',
	DU: 'dust',
	SA: 'sand',
	HZ: 'haze',
	PY: 'spray',
	PO: 'dust whirls',
	SQ: 'squalls',
	FC: 'funnel cloud',
	SS: 'sandstorm',
	DS: 'duststorm',
};

const capitalise = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

const formatNumber = (value) => value.toLocaleString('en-US');

const compassPoint = (degrees) => COMPASS[Math.round(degrees / 22.5) % 16];

// relative humidity from temperature and dew point (Magnus formula)
const relativeHumidity = (temp, dew) => {
	const a = 17.625;
	const b = 243.04;
	const rh = 100 * Math.exp((a * dew) / (b + dew) - (a * temp) / (b + temp));
	return Math.round(Math.min(100, Math.max(0, rh)));
};

const parseTemp = (text) => (text.startsWith('M') ? -Number(text.slice(1)) : Number(text));

const decodeWeather = (group) => {
	const match = group.match(/^(-|\+|VC)?((?:MI|PR|BC|DR|BL|SH|TS|FZ)*)((?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)*)$/);
	if (!match || (!match[2] && !match[3])) return null;
	const [, intensity, descriptorText, phenomenaText] = match;

	const descriptors = (descriptorText.match(/.{2}/g) ?? []).map((d) => d);
	const phenomena = (phenomenaText.match(/.{2}/g) ?? []).map((p) => PHENOMENA[p]);

	let text = phenomena.join(' and ');

	// other descriptors (freezing, blowing, shallow...) qualify the phenomenon directly
	descriptors
		.filter((d) => d !== 'TS' && d !== 'SH')
		.forEach((d) => { text = `${DESCRIPTORS[d]} ${text}`.trim(); });

	if (descriptors.includes('SH')) text = text ? `${text} showers` : 'showers';

	// intensity applies to the precipitation ("-TSRA" = thunderstorm with light rain)
	const intensityWord = { '-': 'light', '+': 'heavy' }[intensity];
	if (intensityWord && text) text = `${intensityWord} ${text}`;

	if (descriptors.includes('TS')) {
		text = text ? `thunderstorm with ${text}` : `${intensityWord ? `${intensityWord} ` : ''}thunderstorm`;
	}

	if (intensity === 'VC') text = `${text} in the vicinity`;

	return capitalise(text);
};

// DDHHMMZ relative to "now"; handles reports issued in the previous month
const observationDate = (day, hour, minute, now) => {
	let date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, hour, minute));
	if (date - now > 12 * 3600 * 1000) {
		date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, day, hour, minute));
	}
	return date;
};

const decodeMetar = (raw, now = new Date()) => {
	const result = {
		raw: raw.trim(),
		station: null,
		observed: null,
		ageMinutes: null,
		wind: null,
		visibility: null,
		weather: [],
		clouds: [],
		temperature: null,
		dewPoint: null,
		humidity: null,
		pressure: null,
		trend: null,
	};

	// the remarks section is not decoded
	const body = result.raw.split(/\sRMK\s/)[0];
	const tokens = body.split(/\s+/).filter((t) => t && t !== 'METAR' && t !== 'SPECI' && t !== 'COR' && t !== 'AUTO');

	let i = 0;
	if (/^[A-Z]{4}$/.test(tokens[i])) { result.station = tokens[i]; i += 1; }

	const time = tokens[i]?.match(/^(\d{2})(\d{2})(\d{2})Z$/);
	if (time) {
		result.observed = observationDate(Number(time[1]), Number(time[2]), Number(time[3]), now);
		result.ageMinutes = Math.max(0, Math.round((now - result.observed) / 60000));
		i += 1;
	}

	for (; i < tokens.length; i += 1) {
		const t = tokens[i];

		// trend groups end the decoded part
		if (t === 'NOSIG') { result.trend = 'No significant change expected'; break; }
		if (t === 'BECMG' || t === 'TEMPO') {
			result.trend = t === 'BECMG' ? 'Changes expected (BECMG)' : 'Temporary changes expected (TEMPO)';
			break;
		}

		// wind
		let m = t.match(/^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)$/);
		if (m) {
			const toKnots = m[4] === 'MPS' ? 1.94384 : 1;
			const speed = Math.round(Number(m[2]) * toKnots);
			const gust = m[3] ? Math.round(Number(m[3]) * toKnots) : null;
			if (speed === 0 && !gust) {
				result.wind = 'Calm';
			} else if (m[1] === 'VRB') {
				result.wind = `Variable at ${speed} kt`;
			} else {
				const dir = Number(m[1]);
				result.wind = `${compassPoint(dir)} (${m[1]}°) at ${speed} kt`;
			}
			if (gust) result.wind += `, gusting ${gust} kt`;
			continue;
		}

		// variable wind direction range
		m = t.match(/^(\d{3})V(\d{3})$/);
		if (m && result.wind) {
			result.windVariable = `Varying between ${m[1]}° and ${m[2]}°`;
			continue;
		}

		if (t === 'CAVOK') {
			result.visibility = '10 km or more';
			result.clouds.push('No significant cloud');
			continue;
		}

		// visibility in metres
		m = t.match(/^(\d{4})(NDV)?$/);
		if (m && result.visibility === null) {
			const metres = Number(m[1]);
			if (metres === 9999) result.visibility = '10 km or more';
			else if (metres >= 5000) result.visibility = `${metres / 1000} km`;
			else result.visibility = `${formatNumber(metres)} m`;
			continue;
		}

		// visibility in statute miles
		m = t.match(/^(P)?(\d+)?(?:\s)?(\d\/\d)?SM$/);
		if (m && result.visibility === null) {
			result.visibility = `${m[1] ? 'More than ' : ''}${t.replace('SM', '').replace('P', '')} mi`;
			continue;
		}

		// runway visual range is not shown
		if (/^R\d{2}[LCR]?\//.test(t)) continue;

		// clouds
		m = t.match(/^(FEW|SCT|BKN|OVC)(\d{3})(CB|TCU|\/\/\/)?$/);
		if (m) {
			const feet = Number(m[2]) * 100;
			let text = `${CLOUD_COVER[m[1]]} at ${formatNumber(feet)} ft`;
			if (CLOUD_TYPE[m[3]]) text += ` (${CLOUD_TYPE[m[3]]})`;
			result.clouds.push(text);
			continue;
		}
		m = t.match(/^VV(\d{3}|\/\/\/)$/);
		if (m) {
			result.clouds.push(m[1] === '///' ? 'Sky obscured' : `Sky obscured, vertical visibility ${formatNumber(Number(m[1]) * 100)} ft`);
			continue;
		}
		if (t === 'NSC') { result.clouds.push('No significant cloud'); continue; }
		if (t === 'NCD') { result.clouds.push('No cloud detected'); continue; }
		if (t === 'SKC' || t === 'CLR') { result.clouds.push('Sky clear'); continue; }

		// temperature / dew point
		m = t.match(/^(M?\d{2})\/(M?\d{2})?$/);
		if (m) {
			result.temperature = parseTemp(m[1]);
			if (m[2]) {
				result.dewPoint = parseTemp(m[2]);
				result.humidity = relativeHumidity(result.temperature, result.dewPoint);
			}
			continue;
		}

		// pressure
		m = t.match(/^Q(\d{4})$/);
		if (m) { result.pressure = `${Number(m[1])} hPa`; continue; }
		m = t.match(/^A(\d{4})$/);
		if (m) { result.pressure = `${(Number(m[1]) / 100).toFixed(2)} inHg`; continue; }

		// recent weather and wind shear are not shown
		if (/^RE/.test(t) || t === 'WS') continue;

		// present weather
		const weather = decodeWeather(t);
		if (weather) result.weather.push(weather);
	}

	return result;
};

export default decodeMetar;
