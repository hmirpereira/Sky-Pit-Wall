// airport observation (METAR) display, decoded into plain English
import STATUS from './status.mjs';
import { text } from './utils/fetch.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';
import decodeMetar from './utils/metar-decoder.mjs';

// airport shown on this screen
const STATION = {
	icao: 'LPPR',
	name: 'Porto Airport',
};

// metar.vatsim.net mirrors real-world METARs and allows browser (CORS) requests without a key
const METAR_URL = (icao) => `https://metar.vatsim.net/${icao}`;

class Metar extends WeatherDisplay {
	constructor(navId, elemId, defaultActive) {
		super(navId, elemId, 'Airport METAR', defaultActive);

		// set timings (seconds on screen)
		this.timing.baseDelay = 12000;
	}

	async getData(_weatherParameters) {
		if (!super.getData(_weatherParameters)) return;

		try {
			const raw = (await text(METAR_URL(STATION.icao))).trim().split('\n')[0];
			if (!raw) throw new Error('Empty METAR response');
			this.data = decodeMetar(raw);
		} catch (error) {
			console.error(`Metar: unable to get METAR for ${STATION.icao}`, error);
			this.setStatus(STATUS.failed);
			return;
		}

		this.calcNavTiming();
		this.setStatus(STATUS.loaded);
	}

	async drawCanvas() {
		super.drawCanvas();

		const d = this.data;
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

		const lines = rows.map(([label, value]) => this.fillTemplate('metar-row', { label, value }));

		const list = this.elem.querySelector('.metar-lines');
		list.innerHTML = '';
		list.append(...lines);

		// shrink the text when a busy report has many lines
		list.classList.toggle('compact', rows.length > 8);

		this.elem.querySelector('.metar-raw').innerHTML = d.raw;
		this.elem.querySelector('.header .title.dual .bottom').innerHTML = `${STATION.icao} METAR`;

		this.finishDraw();
	}
}

// register display
registerDisplay(new Metar(15, 'metar', true));
