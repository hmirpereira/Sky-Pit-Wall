// airport observation (METAR) and forecast (TAF) display, decoded into plain English
import STATUS from './status.mjs';
import { text, json } from './utils/fetch.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';
import decodeMetar from './utils/metar-decoder.mjs';
import decodeTaf from './utils/taf-decoder.mjs';
import { DateTime } from '../vendor/auto/luxon.mjs';
import ConversionHelpers from './utils/conversionHelpers.mjs';

// airport shown on this screen
const STATION = {
	icao: 'LPPR',
	name: 'Porto Airport',
};

// metar.vatsim.net mirrors real-world METARs and allows browser (CORS) requests without a key
const METAR_URL = (icao) => `https://metar.vatsim.net/${icao}`;

// the TAF comes from the ws4kp-voos service on the Raspberry Pi, which fetches it from
// aviationweather.gov (no browser requests allowed there); elsewhere there are no TAF pages
const TAF_URL = 'http://127.0.0.1:8095/taf.json';
const LOCAL_TZ = 'Europe/Lisbon';

class Metar extends WeatherDisplay {
	constructor(navId, elemId, defaultActive) {
		super(navId, elemId, 'Airport METAR', defaultActive);

		// set timings (seconds on screen)
		this.timing.baseDelay = 12000;
	}

	async getData(_weatherParameters) {
		if (!super.getData(_weatherParameters)) return;

		const [metar, taf] = await Promise.all([getMetar(), getTaf()]);
		if (!metar && !taf) {
			this.setStatus(STATUS.failed);
			return;
		}

		// busy reports are split over several pages instead of squeezing the text
		this.pages = [
			...(metar ? metarPages(metar) : []),
			...(taf ? tafPages(taf) : []),
		];
		this.timing.totalScreens = this.pages.length;

		this.calcNavTiming();
		this.setStatus(STATUS.loaded);
	}

	async drawCanvas() {
		super.drawCanvas();

		const pageIndex = Math.min(Math.max(this.screenIndex, 0), this.pages.length - 1);
		const { kind, rows, raw } = this.pages[pageIndex];

		const lines = rows.map(([label, value]) => this.fillTemplate('metar-row', { label, value }));

		const list = this.elem.querySelector('.metar-lines');
		list.innerHTML = '';
		list.append(...lines);

		const rawElem = this.elem.querySelector('.metar-raw');
		rawElem.innerHTML = raw;

		// spread the rows over the space left above the raw report
		const main = this.elem.querySelector('.main');
		const available = main.clientHeight - rawElem.offsetHeight - 24;
		// TAF pages with only a few rows keep them together at the top instead of spreading them out
		const height = kind === 'TAF' ? Math.min(available, rows.length * ROW_PITCH) : available;
		list.style.height = `${Math.max(height, 0)}px`;

		// page numbers count METAR and TAF pages separately
		const same = this.pages.filter((page) => page.kind === kind);
		const pageText = same.length > 1 ? ` ${same.indexOf(this.pages[pageIndex]) + 1}/${same.length}` : '';
		this.elem.querySelector('.header .title.dual .bottom').innerHTML = `${STATION.icao} ${kind}${pageText}`;

		this.finishDraw();
	}
}

// decoded lines per page that fit with comfortable spacing, with and without the raw report
const ROWS_WITH_RAW = 7;
const ROWS_WITHOUT_RAW = 10;
// height of each line on TAF pages that are not full
const ROW_PITCH = 32;

const getMetar = async () => {
	try {
		const raw = (await text(METAR_URL(STATION.icao))).trim().split('\n')[0];
		if (!raw) throw new Error('Empty METAR response');
		return decodeMetar(raw);
	} catch (error) {
		console.error(`Metar: unable to get METAR for ${STATION.icao}`, error);
		return null;
	}
};

const getTaf = async () => {
	try {
		const data = await json(TAF_URL, { signal: AbortSignal.timeout(5000) });
		// an old TAF (e.g. the Pi lost its connection) is not shown
		if (!data?.raw || !data.validTo || new Date(data.validTo) < new Date()) return null;
		return decodeTaf(data.raw, data.issued);
	} catch {
		// expected away from the Raspberry Pi
		return null;
	}
};

const metarPages = (data) => {
	const rows = buildRows(data);
	// pages are balanced (13 rows -> 7 + 6, not 10 + 3)
	const fitsWithRaw = rows.length <= ROWS_WITH_RAW;
	const pageCount = fitsWithRaw ? 1 : Math.ceil(rows.length / ROWS_WITHOUT_RAW);
	const perPage = Math.ceil(rows.length / pageCount);
	const pages = [];
	for (let i = 0; i < rows.length; i += perPage) {
		const page = rows.slice(i, i + perPage).map((row) => [...row]);
		// a page that starts mid-group (e.g. the third cloud layer) repeats the group label
		if (page[0][0] === '') page[0][0] = rows.slice(0, i).reverse().find((row) => row[0])?.[0] ?? '';
		pages.push({ kind: 'METAR', rows: page, raw: '' });
	}
	// the raw report goes on the last page, only if that page has room for it
	const last = pages.at(-1);
	if (last.rows.length <= ROWS_WITH_RAW) last.raw = data.raw;
	return pages;
};

// TAF times in Portuguese time: "Wed 21:00", and only the time when the day is the same
const localTime = (date) => DateTime.fromJSDate(date).setZone(LOCAL_TZ);
const formatDayTime = (dt) => `${dt.toFormat('ccc')} ${ConversionHelpers.formatTime(dt)}`;
const formatRange = (from, to) => {
	if (!from) return '';
	const start = localTime(from);
	if (!to) return `From ${formatDayTime(start)}`;
	const end = localTime(to);
	return `${formatDayTime(start)} to ${end.hasSame(start, 'day') ? ConversionHelpers.formatTime(end) : formatDayTime(end)}`;
};

const GROUP_LABEL = {
	BASE: 'Forecast', FM: 'From', BECMG: 'Becoming', TEMPO: 'Temporary',
};

// one block of rows per group: label and period, then one condition per row
const tafBlocks = (taf) => taf.groups.map((group) => {
	const label = group.type === 'PROB' ? `Prob ${group.probability}%` : GROUP_LABEL[group.type];
	const period = formatRange(group.from, group.to) + (group.tempo ? ', temporary' : '');
	return [[label, period], ...group.conditions.map((condition) => ['', condition])];
});

const tafPages = (taf) => {
	const issued = localTime(taf.issued);
	const ago = Math.max(0, Math.round((Date.now() - taf.issued) / 60000));
	const agoText = ago < 120 ? `${ago} min ago` : `${Math.round(ago / 60)} h ago`;
	const blocks = tafBlocks(taf);
	// the issue time goes with the first group so they stay on the same page
	const issuedRow = ['Issued', `${formatDayTime(issued)}${taf.amended ? ', amended' : ''} (${agoText})`];
	if (blocks.length) blocks[0].unshift(issuedRow); else blocks.push([issuedRow]);

	// whole groups per page
	const pages = [];
	let current = [];
	blocks.forEach((block) => {
		if (current.length && current.length + block.length > ROWS_WITHOUT_RAW) { pages.push(current); current = []; }
		current.push(...block);
	});
	if (current.length) pages.push(current);
	// the raw TAF is not shown
	return pages.map((rows) => ({ kind: 'TAF', rows, raw: '' }));
};

// decoded METAR as [label, value] rows; continuation lines have an empty label
const buildRows = (d) => {
	const rows = [];

	if (d.observed) {
		const hh = String(d.observed.getUTCHours()).padStart(2, '0');
		const mm = String(d.observed.getUTCMinutes()).padStart(2, '0');
		rows.push(['Observed', `${hh}:${mm} UTC (${d.ageMinutes} min ago)`]);
	}
	if (d.wind) rows.push(['Wind', d.wind]);
	if (d.windVariable) rows.push(['', d.windVariable]);
	if (d.visibility) rows.push(['Visibility', d.visibility]);
	d.weather.forEach((weather, index) => rows.push([index === 0 ? 'Weather' : '', weather]));
	d.clouds.forEach((cloud, index) => rows.push([index === 0 ? 'Clouds' : '', cloud]));
	if (d.temperature !== null) {
		const dew = d.dewPoint !== null ? `, dew point ${d.dewPoint}°C` : '';
		rows.push(['Temperature', `${d.temperature}°C${dew}`]);
	}
	if (d.humidity !== null) rows.push(['Humidity', `${d.humidity}%`]);
	if (d.pressure) rows.push(['Pressure', d.pressure]);
	if (d.trend) rows.push(['Trend', d.trend]);

	return rows;
};

// register display
registerDisplay(new Metar(15, 'metar', true));
