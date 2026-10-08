// cancelled departures from Porto (OPO), all airlines
// Comes from the same ws4kp-voos service on the Raspberry Pi as the Departures screen. The list is
// only refreshed when the service calls AeroDataBox for the Lufthansa Group flights (no extra calls),
// so the footer shows when it was last updated. Anywhere else this screen is skipped.
import STATUS from './status.mjs';
import { json } from './utils/fetch.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';
import ConversionHelpers from './utils/conversionHelpers.mjs';
import { DateTime } from '../vendor/auto/luxon.mjs';

const SERVICE_URL = 'http://127.0.0.1:8095/cancelled.json';
const AIRPORT_TZ = 'Europe/Lisbon';
const ROWS_PER_PAGE = 6;
// tail icons drawn so far (images/airlines/<IATA>.png); other airlines show none
const TAIL_ICONS = ['LH', 'LX', 'OS', '4Y', 'SN'];
// the Star4000 fonts draw accented letters blank (São Paulo -> S o Paulo), so accents are removed
const stripAccents = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

class Cancellations extends WeatherDisplay {
	constructor(navId, elemId, defaultActive) {
		super(navId, elemId, 'Cancellations', defaultActive);

		// set timings (seconds on screen)
		this.timing.baseDelay = 10000;
	}

	async getData(_weatherParameters) {
		if (!super.getData(_weatherParameters)) return;

		let response;
		try {
			response = await json(SERVICE_URL, { signal: AbortSignal.timeout(5000) });
		} catch (error) {
			// not on the Pi, or the service is down: skip the screen quietly
			console.warn('Cancellations: flight service not reachable', error.message);
			this.setStatus(STATUS.noData);
			return;
		}

		// cancellations of today (Portuguese time) and later; the service already drops older days
		const today = DateTime.now().setZone(AIRPORT_TZ).startOf('day');
		this.flights = (response.flights ?? [])
			.filter((flight) => DateTime.fromISO(flight.scheduled) >= today)
			.sort((a, b) => Date.parse(a.scheduled) - Date.parse(b.scheduled));
		this.lastUpdate = response.lastUpdate ? DateTime.fromISO(response.lastUpdate).setZone(AIRPORT_TZ) : null;

		// no cancellations: the screen is skipped
		if (this.flights.length === 0) {
			this.setStatus(STATUS.noData);
			return;
		}

		this.pages = [];
		const pageCount = Math.ceil(this.flights.length / ROWS_PER_PAGE);
		const perPage = Math.ceil(this.flights.length / pageCount);
		for (let i = 0; i < this.flights.length; i += perPage) this.pages.push(this.flights.slice(i, i + perPage));
		this.timing.totalScreens = this.pages.length;

		this.calcNavTiming();
		this.setStatus(STATUS.loaded);
	}

	async drawCanvas() {
		super.drawCanvas();

		const pageIndex = Math.min(Math.max(this.screenIndex, 0), this.pages.length - 1);
		const today = DateTime.now().setZone(AIRPORT_TZ);

		const lines = this.pages[pageIndex].map((flight) => {
			const time = DateTime.fromISO(flight.scheduled).setZone(AIRPORT_TZ);
			// flights after midnight show the day
			const timeText = time.hasSame(today, 'day') ? ConversionHelpers.formatTime(time) : `${time.toFormat('ccc')} ${ConversionHelpers.formatTime(time)}`;
			const row = this.fillTemplate('cancellations-row', {
				flight: flight.number,
				destination: stripAccents(flight.destinationName ?? flight.destination ?? ''),
				// "?" when AeroDataBox is not sure about the cancellation
				time: `${timeText}${flight.uncertain ? '?' : ''}`,
			});
			const airline = flight.number.slice(0, 2);
			const tail = row.querySelector('.tail');
			if (TAIL_ICONS.includes(airline)) tail.src = `images/airlines/${airline}.png`;
			else tail.style.visibility = 'hidden';
			return row;
		});

		const list = this.elem.querySelector('.cancellations-lines');
		list.innerHTML = '';
		list.append(...lines);

		const parts = [];
		if (this.lastUpdate) parts.push(`Updated ${ConversionHelpers.formatTime(this.lastUpdate)}`);
		if (this.pages.length > 1) parts.push(`Page ${pageIndex + 1}/${this.pages.length}`);
		parts.push('Data: AeroDataBox');
		this.elem.querySelector('.cancellations-footer').innerHTML = parts.join(' &nbsp; ');

		this.finishDraw();
	}
}

// register display (off by default: it only works on the Pi running ws4kp-voos)
registerDisplay(new Cancellations(17, 'cancellations', false));
