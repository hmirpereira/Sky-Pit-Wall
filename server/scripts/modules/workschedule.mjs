// work shifts: page 1 lists the next 7 days with the weather at the start of each shift,
// page 2 shows the next shift with a countdown and the weather at the start and at the end.
// Shifts are read from the skypitwall-voos service on the Raspberry Pi, which serves what
// skypitwall-horario extracts from a private schedule spreadsheet. The schedule never leaves the Pi;
// anywhere else this screen is skipped. Weather: Open-Meteo hourly forecast for the chosen location.
import STATUS from './status.mjs';
import { json } from './utils/fetch.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';
import ConversionHelpers from './utils/conversionHelpers.mjs';
import { getConditionText } from './utils/weather.mjs';
import { getWeatherRegionalIconFromIconLink } from './icons.mjs';
import { DateTime } from '../vendor/auto/luxon.mjs';

const SERVICE_URL = 'http://127.0.0.1:8095/schedule.json';
const LOCAL_TZ = 'Europe/Lisbon';

// a shift as start and end times (a shift that ends after midnight ends on the next day)
const shiftTimes = (day) => {
	if (day.off || !day.start || !day.end) return null;
	const start = DateTime.fromISO(`${day.date}T${day.start}`, { zone: LOCAL_TZ });
	let end = DateTime.fromISO(`${day.date}T${day.end}`, { zone: LOCAL_TZ });
	if (end <= start) end = end.plus({ days: 1 });
	return { start, end };
};

// hourly forecast at the location, 8 days, keyed by local hour ("2026-10-09T03:00");
// kept for an hour, so the 10-minute data refresh does not ask Open-Meteo again each time
const FORECAST_CACHE_MINUTES = 60;
let forecastCache = null;
const getForecast = async (weatherParameters) => {
	const key = `${weatherParameters.latitude},${weatherParameters.longitude}`;
	if (forecastCache?.key === key && DateTime.now().diff(forecastCache.fetched, 'minutes').minutes < FORECAST_CACHE_MINUTES) {
		return forecastCache.data;
	}
	try {
		const data = await json(`https://api.open-meteo.com/v1/forecast?latitude=${weatherParameters.latitude}&longitude=${weatherParameters.longitude}&hourly=temperature_2m,weather_code,precipitation_probability,wind_speed_10m,is_day&timezone=${encodeURIComponent(LOCAL_TZ)}&forecast_days=8`);
		// Open-Meteo answers errors (e.g. daily limit) with a 200 and { error, reason }
		if (!data?.hourly?.time) throw new Error(data?.reason ?? 'no hourly data');
		const byHour = {};
		(data?.hourly?.time ?? []).forEach((time, i) => {
			byHour[time] = {
				code: data.hourly.weather_code[i],
				temperature: data.hourly.temperature_2m[i],
				rain: data.hourly.precipitation_probability[i],
				wind: data.hourly.wind_speed_10m[i],
				isDay: data.hourly.is_day[i],
			};
		});
		forecastCache = { key, fetched: DateTime.now(), data: byHour };
		return byHour;
	} catch (error) {
		console.warn('WorkSchedule: no forecast', error.message);
		// keep using an older forecast rather than none
		return forecastCache?.data ?? {};
	}
};

// forecast for the hour that contains a time (03:30 uses 03:00)
const weatherAt = (forecast, time) => {
	const hour = forecast[time.startOf('hour').toFormat("yyyy-MM-dd'T'HH:mm")];
	if (!hour) return null;
	const condition = getConditionText(Number(hour.code));
	return {
		condition,
		icon: getWeatherRegionalIconFromIconLink(condition, hour.isDay),
		temperature: Math.round(ConversionHelpers.convertTemperatureUnits(hour.temperature)),
		rain: hour.rain ?? 0,
		wind: Math.round(ConversionHelpers.convertWindUnits(hour.wind)),
	};
};

const countdown = (from, to) => {
	const minutes = Math.max(0, Math.round(to.diff(from, 'minutes').minutes));
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (h >= 48) return `${Math.round(h / 24)} days`;
	return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
};

class WorkSchedule extends WeatherDisplay {
	constructor(navId, elemId, defaultActive) {
		super(navId, elemId, 'Work Schedule', defaultActive);

		// two pages, 12 seconds each
		this.timing.baseDelay = 12000;
		this.timing.totalScreens = 2;
	}

	async getData(weatherParameters) {
		if (!super.getData(weatherParameters)) return;

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
		this.days = (response.days ?? []).filter((day) => day.date >= today).slice(0, 8);
		if (this.days.length === 0) {
			this.setStatus(STATUS.noData);
			return;
		}
		this.forecast = await getForecast(this.weatherParameters ?? weatherParameters);

		this.calcNavTiming();
		this.setStatus(STATUS.loaded);
	}

	async drawCanvas() {
		super.drawCanvas();
		const page = Math.min(Math.max(this.screenIndex, 0), 1);
		this.elem.querySelector('.schedule-page.week').style.display = page === 0 ? 'block' : 'none';
		this.elem.querySelector('.schedule-page.next').style.display = page === 1 ? 'block' : 'none';
		this.elem.querySelector('.header .title.dual .bottom').innerHTML = page === 0 ? 'Next 7 Days' : 'Next Shift';
		if (page === 0) this.drawWeek(); else this.drawNext();
		this.finishDraw();
	}

	drawWeek() {
		const now = DateTime.now().setZone(LOCAL_TZ);
		const today = now.toISODate();
		// today's shift leaves the list once it has ended (the Pi sends 8 days, so 7 rows remain)
		const days = this.days
			.filter((day) => !(day.date === today && shiftTimes(day) && shiftTimes(day).end <= now))
			.slice(0, 7);
		const lines = days.map((day) => {
			const date = DateTime.fromISO(day.date, { zone: LOCAL_TZ });
			const times = shiftTimes(day);
			const row = this.fillTemplate('schedule-row', {
				day: `${date.toFormat('ccc')} ${date.day}`,
				shift: day.off ? 'Day off' : day.code,
				start: times ? ConversionHelpers.formatTime(times.start) : '',
				end: times ? ConversionHelpers.formatTime(times.end) : '',
				temp: '',
			});
			// weather at the start of the shift: icon and temperature (hidden on days off or beyond the forecast)
			const weather = times ? weatherAt(this.forecast, times.start) : null;
			const icon = row.querySelector('.wx img');
			if (weather) {
				icon.src = weather.icon;
				row.querySelector('.temp').textContent = `${weather.temperature}°`;
			} else {
				icon.style.visibility = 'hidden';
			}
			if (day.off) row.classList.add('off');
			if (day.date === today) row.classList.add('today');
			return row;
		});
		const list = this.elem.querySelector('.schedule-lines');
		list.innerHTML = '';
		list.append(...lines);
	}

	drawNext() {
		const now = DateTime.now().setZone(LOCAL_TZ);
		// the shift going on now, or the next one
		const shifts = this.days.map((day) => ({ day, times: shiftTimes(day) })).filter((s) => s.times && s.times.end > now);
		const box = this.elem.querySelector('.schedule-page.next');
		if (shifts.length === 0) {
			box.querySelector('.when').textContent = 'No shifts in the next 7 days';
			box.querySelectorAll('.hours, .countdown, .weather-pair').forEach((e) => { e.style.visibility = 'hidden'; });
			return;
		}
		box.querySelectorAll('.hours, .countdown, .weather-pair').forEach((e) => { e.style.visibility = 'visible'; });
		const { day, times } = shifts[0];
		const onShift = times.start <= now;
		box.querySelector('.when').textContent = `${times.start.toFormat('cccc d LLLL')}   ${day.code}`;
		box.querySelector('.hours').textContent = `${ConversionHelpers.formatTime(times.start)} to ${ConversionHelpers.formatTime(times.end)}`;
		box.querySelector('.countdown').textContent = onShift ? `On shift, ends in ${countdown(now, times.end)}` : `Starts in ${countdown(now, times.start)}`;

		[['start', times.start, 'Start'], ['end', times.end, 'End']].forEach(([cls, time, label]) => {
			const elem = box.querySelector(`.weather-pair .${cls}`);
			const weather = weatherAt(this.forecast, time);
			elem.querySelector('.label').textContent = `${label} ${ConversionHelpers.formatTime(time)}`;
			if (!weather) {
				elem.querySelector('.icon img').style.visibility = 'hidden';
				elem.querySelector('.cond').textContent = 'No forecast yet';
				elem.querySelector('.details').textContent = '';
				return;
			}
			elem.querySelector('.icon img').style.visibility = 'visible';
			elem.querySelector('.icon img').src = weather.icon;
			elem.querySelector('.cond').textContent = weather.condition;
			elem.querySelector('.details').textContent = `${weather.temperature}°${ConversionHelpers.getTemperatureUnitText()}  Rain ${weather.rain}%  Wind ${weather.wind} ${ConversionHelpers.getWindUnitText()}`;
		});
	}
}

// register display (off by default: it only works on the Pi running skypitwall-voos and skypitwall-horario)
registerDisplay(new WorkSchedule(19, 'work-schedule', false));
