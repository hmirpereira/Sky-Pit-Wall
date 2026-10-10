// next Lufthansa Group departures from the local airport (set on the Pi)
// Flight data comes from AeroDataBox through a small service on the Raspberry Pi
// (skypitwall-voos), which keeps the API key private and serves the result on the Pi only.
// Anywhere else the service is not reachable and this screen is skipped.
import STATUS from './status.mjs';
import { json } from './utils/fetch.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';
import { placeTitle } from './utils/local-place.mjs';
import ConversionHelpers from './utils/conversionHelpers.mjs';
import { DateTime } from '../vendor/auto/luxon.mjs';

const SERVICE_URL = 'http://127.0.0.1:8095/flights.json';
const AIRPORT_TZ = 'Europe/Lisbon';
// leaves room for the footer; busy days use pages (7 flights = 4 + 3)
const ROWS_PER_PAGE = 6;
// departed flights leave the list; cancelled ones stay a little after their scheduled time
const KEEP_AFTER_DEPARTURE_MIN = 5;
const KEEP_CANCELLED_MIN = 30;

const STATUS_CLASS = {
	'ON TIME': 'on-time',
	SCHEDULED: 'scheduled',
	DELAYED: 'delayed',
	CANCELLED: 'cancelled',
};

class Departures extends WeatherDisplay {
	constructor(navId, elemId, defaultActive) {
		super(navId, elemId, 'Departures', defaultActive);

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
			console.warn('Departures: flight service not reachable', error.message);
			this.setStatus(STATUS.noData);
			return;
		}

		const now = Date.now();
		this.flights = (response.flights ?? [])
			.filter((flight) => {
				const estimated = Date.parse(flight.estimated);
				const scheduled = Date.parse(flight.scheduled);
				if (flight.status === 'DEPARTED') return false;
				if (flight.status === 'CANCELLED') return scheduled > now - KEEP_CANCELLED_MIN * 60000;
				return estimated > now - KEEP_AFTER_DEPARTURE_MIN * 60000;
			})
			.sort((a, b) => Date.parse(a.estimated) - Date.parse(b.estimated));
		this.lastUpdate = response.lastUpdate ? DateTime.fromISO(response.lastUpdate).setZone(AIRPORT_TZ) : null;

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
		this.elem.querySelector('.header .title.dual .top').innerHTML = placeTitle('Departures');

		const pageIndex = Math.min(Math.max(this.screenIndex, 0), this.pages.length - 1);

		const lines = this.pages[pageIndex].map((flight) => {
			const time = DateTime.fromISO(flight.estimated).setZone(AIRPORT_TZ);
			const row = this.fillTemplate('departures-row', {
				flight: flight.number,
				time: ConversionHelpers.formatTime(time),
				status: flight.status,
			});
			// tail icon per airline: images/airlines/<IATA code>.png (hidden if missing)
			const tail = row.querySelector('.tail');
			tail.addEventListener('error', () => { tail.style.visibility = 'hidden'; });
			tail.src = `images/airlines/${flight.number.slice(0, 2)}.png`;
			const statusClass = STATUS_CLASS[flight.status];
			if (statusClass) row.querySelector('.status').classList.add(statusClass);
			return row;
		});

		const list = this.elem.querySelector('.departures-lines');
		list.innerHTML = '';
		list.append(...lines);

		// the page number goes in the footer: the title has no room left for it
		const parts = [];
		if (this.lastUpdate) parts.push(`Updated ${ConversionHelpers.formatTime(this.lastUpdate)}`);
		if (this.pages.length > 1) parts.push(`Page ${pageIndex + 1}/${this.pages.length}`);
		parts.push('Data: AeroDataBox');
		this.elem.querySelector('.departures-footer').innerHTML = parts.join(' &nbsp; ');

		this.finishDraw();
	}
}

// register display (off by default: it only works on the Pi running skypitwall-voos)
registerDisplay(new Departures(16, 'departures', false));
