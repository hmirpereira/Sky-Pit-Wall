// weather warnings from IPMA (Portuguese weather service)

import STATUS from './status.mjs';
import { json } from './utils/fetch.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';
import { warningArea } from './utils/local-place.mjs';

// NOTE: by the owner's choice, this screen is shown in Portuguese, the language of the IPMA
// warning texts (the IPMA open data API has no English version of the descriptions).

// the IPMA warning area comes from the settings (utils/local-place.mjs)
const IPMA_WARNINGS_URL = 'https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json';

const LEVELS = { yellow: 1, orange: 2, red: 3 };
const LEVEL_NAMES = { yellow: 'AMARELO', orange: 'LARANJA', red: 'VERMELHO' };

const DAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

const stripAccents = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// IPMA times are Portuguese local time without an offset ("2026-10-06T09:00:00")
const formatIpmaTime = (value) => {
	const [date, time] = value.split('T');
	const [y, m, d] = date.split('-').map(Number);
	const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
	return `${DAYS[weekday]} ${d} ${MONTHS[m - 1]} ${time.slice(0, 5)}`;
};

// current time in Portugal, in the same format as IPMA, so strings can be compared
const nowInPortugal = () => {
	const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
	}).formatToParts(new Date()).map((p) => [p.type, p.value]));
	return `${parts.year}-${parts.month}-${parts.day}T${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}:${parts.second}`;
};

class Hazards extends WeatherDisplay {
	constructor(navId, elemId, defaultActive) {
		// special height and width for scrolling
		super(navId, elemId, 'Hazards', defaultActive);
		this.showOnProgress = false;

		// 0 screens skips this during "play"
		this.timing.totalScreens = 0;
	}

	async getData(weatherParameters) {
		// super checks for enabled
		const superResult = super.getData(weatherParameters);

		const alert = this.checkbox.querySelector('.alert');
		alert.classList.remove('show');

		try {
			const AREA = warningArea();
			if (!AREA) throw new Error('no IPMA warning area set');
			this.area = AREA;
			const warnings = await json(IPMA_WARNINGS_URL);
			const now = nowInPortugal();
			this.data = warnings
				.filter((w) => w.idAreaAviso === AREA.id && LEVELS[w.awarenessLevelID] && w.endTime > now)
				.sort((a, b) => (LEVELS[b.awarenessLevelID] - LEVELS[a.awarenessLevelID]) || a.startTime.localeCompare(b.startTime));

			// show alert indicator
			if (this.data.length > 0) alert.classList.add('show');
		} catch (error) {
			console.error('Hazards: unable to get IPMA warnings', error);
			this.data = [];
		}

		this.getDataCallback();

		if (!superResult) {
			this.setStatus(STATUS.loaded);
			return;
		}
		this.drawLongCanvas();
	}

	async drawLongCanvas() {
		// get the list element and populate
		const list = this.elem.querySelector('.hazard-lines');
		list.innerHTML = '';

		const now = nowInPortugal();
		const lines = (this.data ?? []).map((warning) => {
			const level = LEVEL_NAMES[warning.awarenessLevelID];
			const period = warning.startTime > now
				? `DE ${formatIpmaTime(warning.startTime)}<br/>ATÉ ${formatIpmaTime(warning.endTime)}`
				: `ATÉ ${formatIpmaTime(warning.endTime)}`;
			const description = warning.text ? `<br/><br/>${warning.text}` : '';

			const line = this.fillTemplate('hazard', {
				// the Star4000 fonts have no usable accented capitals, so accents are removed (ATÉ -> ATE)
				'hazard-text': stripAccents(`AVISO ${level}<br/>${warning.awarenessTypeName}<br/>${this.area.name}<br/>${period}${description}`),
			});
			line.classList.add(`level-${warning.awarenessLevelID}`);
			return line;
		});

		list.append(...lines);

		// background colour follows the most severe warning
		list.className = 'hazard-lines';
		if (this.data?.length) list.classList.add(`level-${this.data[0].awarenessLevelID}`);

		// no alerts, skip this display by setting timing to zero
		if (lines.length === 0) {
			this.setStatus(STATUS.loaded);
			this.timing.totalScreens = 0;
			this.setStatus(STATUS.loaded);
			return;
		}

		// update timing
		// set up the timing
		this.timing.baseDelay = 20;
		// 24 hours = 6 pages
		const pages = Math.max(Math.ceil(list.scrollHeight / 400) - 3, 1);
		const timingStep = 400;
		this.timing.delay = [150 + timingStep];
		// add additional pages
		for (let i = 0; i < pages; i += 1) this.timing.delay.push(timingStep);
		// add the final 3 second delay
		this.timing.delay.push(250);
		this.calcNavTiming();
		this.setStatus(STATUS.loaded);
	}

	drawCanvas() {
		super.drawCanvas();
		this.finishDraw();
	}

	showCanvas() {
		// special to hourly to draw the remainder of the canvas
		this.drawCanvas();
		super.showCanvas();
	}

	// screen index change callback just runs the base count callback
	screenIndexChange() {
		this.baseCountChange(this.navBaseCount);
	}

	// base count change callback
	baseCountChange(count) {
		// calculate scroll offset and don't go past end
		let offsetY = Math.min(this.elem.querySelector('.hazard-lines').getBoundingClientRect().height - 390, (count - 150));

		// don't let offset go negative
		if (offsetY < 0) offsetY = 0;

		// copy the scrolled portion of the canvas
		this.elem.querySelector('.main').scrollTo(0, offsetY);
	}

	// make data available outside this class
	// promise allows for data to be requested before it is available
	async getCurrentData(stillWaiting) {
		if (stillWaiting) this.stillWaitingCallbacks.push(stillWaiting);
		return new Promise((resolve) => {
			if (this.data) resolve(this.data);
			// data not available, put it into the data callback queue
			this.getDataCallbacks.push(() => resolve(this.data));
		});
	}

	// after we roll through the hazards once, don't display again until the next refresh (10 minutes)
	screenIndexFromBaseCount() {
		const superValue = super.screenIndexFromBaseCount();
		// false is returned when we reach the end of the scroll
		if (superValue === false) {
			// set total screens to zero to take this out of the rotation
			this.timing.totalScreens = 0;
		}
		// return the value as expected
		return superValue;
	}
}

// register display
registerDisplay(new Hazards(0, 'hazards', false));
