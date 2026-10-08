// work shifts for the next 7 days
// Read from the skypitwall-voos service on the Raspberry Pi, which serves what skypitwall-horario
// extracts from a private schedule spreadsheet. The schedule never leaves the Pi;
// anywhere else this screen is skipped.
import STATUS from './status.mjs';
import { json } from './utils/fetch.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';
import ConversionHelpers from './utils/conversionHelpers.mjs';
import { DateTime } from '../vendor/auto/luxon.mjs';

const SERVICE_URL = 'http://127.0.0.1:8095/schedule.json';
const LOCAL_TZ = 'Europe/Lisbon';

class WorkSchedule extends WeatherDisplay {
	constructor(navId, elemId, defaultActive) {
		super(navId, elemId, 'Work Schedule', defaultActive);

		// set timings (seconds on screen)
		this.timing.baseDelay = 12000;
	}

	async getData(_weatherParameters) {
		if (!super.getData(_weatherParameters)) return;

		let response;
		try {
			response = await json(SERVICE_URL, { signal: AbortSignal.timeout(5000) });
		} catch (error) {
			// not on the Pi, or the service is down: skip the screen quietly
			console.warn('WorkSchedule: schedule service not reachable', error.message);
			this.setStatus(STATUS.noData);
			return;
		}

		// from today on (the file on the Pi is refreshed every hour)
		const today = DateTime.now().setZone(LOCAL_TZ).toISODate();
		this.days = (response.days ?? []).filter((day) => day.date >= today).slice(0, 7);
		if (this.days.length === 0) {
			this.setStatus(STATUS.noData);
			return;
		}

		this.calcNavTiming();
		this.setStatus(STATUS.loaded);
	}

	async drawCanvas() {
		super.drawCanvas();

		const today = DateTime.now().setZone(LOCAL_TZ).toISODate();
		const parseTime = (text) => DateTime.fromFormat(text, 'HH:mm', { zone: LOCAL_TZ });
		const lines = this.days.map((day) => {
			const date = DateTime.fromISO(day.date, { zone: LOCAL_TZ });
			const row = this.fillTemplate('schedule-row', {
				day: `${date.toFormat('ccc')} ${date.day}`,
				shift: day.off ? 'Day off' : day.code,
				start: !day.off && day.start ? ConversionHelpers.formatTime(parseTime(day.start)) : '',
				end: !day.off && day.end ? ConversionHelpers.formatTime(parseTime(day.end)) : '',
			});
			if (day.off) row.classList.add('off');
			if (day.date === today) row.classList.add('today');
			return row;
		});

		const list = this.elem.querySelector('.schedule-lines');
		list.innerHTML = '';
		list.append(...lines);

		this.finishDraw();
	}
}

// register display (off by default: it only works on the Pi running skypitwall-voos and skypitwall-horario)
registerDisplay(new WorkSchedule(18, 'work-schedule', false));
