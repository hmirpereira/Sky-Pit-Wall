// next Formula 1 race: track outline, race details and countdown (page 1),
// weekend schedule in Portuguese time and race-time forecast at the circuit (page 2)
// Sources: Jolpica F1 (schedule), bacinger/f1-circuits (outlines, see utils/f1-circuits.mjs),
// Open-Meteo (forecast at the circuit, up to 16 days ahead)
import STATUS from './status.mjs';
import { json } from './utils/fetch.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';
import { DateTime } from '../vendor/auto/luxon.mjs';
import ConversionHelpers from './utils/conversionHelpers.mjs';
import { getConditionText } from './utils/weather.mjs';
import { getWeatherRegionalIconFromIconLink } from './icons.mjs';
import { readCache, writeCache, isFresh } from './utils/f1-update.mjs';
import CIRCUITS from './utils/f1-circuits.mjs';

const NEXT_RACE_URL = 'https://api.jolpi.ca/ergast/f1/current/next/races/';
const CACHE_KEY = 'f1-next-race-cache';
const LOCAL_TZ = 'Europe/Lisbon';
// a race is treated as over this long after the start; then the next one is looked up
const RACE_DURATION_HOURS = 3;
// when the saved race is over, try again at most this often
const RETRY_MINUTES = 60;

const SESSIONS = [
	['FirstPractice', 'Practice 1'],
	['SecondPractice', 'Practice 2'],
	['ThirdPractice', 'Practice 3'],
	['SprintQualifying', 'Sprint Quali'],
	['Sprint', 'Sprint'],
	['Qualifying', 'Qualifying'],
];

const toDateTime = (date, time) => DateTime.fromISO(`${date}T${time ?? '00:00:00Z'}`, { zone: 'utc' });

const shortRaceName = (name) => name.replace('Grand Prix', 'GP');

// the Star4000 fonts list accented letters but draw them blank (Autódromo -> Aut dromo), so accents are removed
const stripAccents = (text) => (text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const parseRace = (race) => {
	const sessions = SESSIONS
		.filter(([key]) => race[key])
		.map(([key, name]) => ({ name, start: toDateTime(race[key].date, race[key].time).toISO() }));
	const start = toDateTime(race.date, race.time).toISO();
	sessions.push({ name: 'Race', start });
	sessions.sort((a, b) => a.start.localeCompare(b.start));
	return {
		round: race.round,
		name: race.raceName,
		circuitId: race.Circuit?.circuitId,
		circuit: race.Circuit?.circuitName,
		locality: race.Circuit?.Location?.locality,
		country: race.Circuit?.Location?.country,
		lat: race.Circuit?.Location?.lat,
		lon: race.Circuit?.Location?.long,
		start,
		sessions,
	};
};

// forecast for the hour the race starts, only when it is within Open-Meteo's 16 days
const getForecast = async (race) => {
	const start = DateTime.fromISO(race.start).toUTC();
	if (start > DateTime.now().plus({ days: 15 }) || !race.lat) return null;
	try {
		const day = start.toISODate();
		const response = await json(`https://api.open-meteo.com/v1/forecast?latitude=${race.lat}&longitude=${race.lon}&hourly=weather_code,temperature_2m,precipitation_probability,is_day&timezone=GMT&start_date=${day}&end_date=${day}`);
		const index = response?.hourly?.time?.indexOf(start.startOf('hour').toFormat("yyyy-MM-dd'T'HH:mm"));
		if (index === undefined || index < 0) return null;
		const condition = getConditionText(Number(response.hourly.weather_code[index]));
		return {
			condition,
			icon: getWeatherRegionalIconFromIconLink(condition, response.hourly.is_day[index]),
			temperature: Math.round(ConversionHelpers.convertTemperatureUnits(response.hourly.temperature_2m[index])),
			rain: response.hourly.precipitation_probability[index],
		};
	} catch (error) {
		console.error('F1NextRace: unable to get the forecast', error);
		return null;
	}
};

class F1NextRace extends WeatherDisplay {
	constructor(navId, elemId, defaultActive) {
		super(navId, elemId, 'F1 Next Race', defaultActive);

		// two pages, 10 seconds each
		this.timing.baseDelay = 10000;
		this.timing.totalScreens = 2;
	}

	async getData(_weatherParameters) {
		if (!super.getData(_weatherParameters)) return;

		let cache = readCache(CACHE_KEY);
		const raceOver = cache?.race && DateTime.fromISO(cache.race.start) < DateTime.now().minus({ hours: RACE_DURATION_HOURS });
		const retryDue = !cache?.attempted || DateTime.fromISO(cache.attempted) < DateTime.now().minus({ minutes: RETRY_MINUTES });

		if (!isFresh(cache) || (raceOver && retryDue)) {
			try {
				const response = await json(NEXT_RACE_URL);
				const race = response?.MRData?.RaceTable?.Races?.[0];
				cache = { attempted: DateTime.now().toISO(), race: race ? parseRace(race) : null };
				writeCache(CACHE_KEY, cache);
			} catch (error) {
				console.error('F1NextRace: unable to get the next race', error);
				if (!cache?.race) {
					this.setStatus(STATUS.failed);
					return;
				}
			}
		}

		this.race = cache?.race;
		// season over (no next race) or the saved race has already finished: skip the screen
		if (!this.race || DateTime.fromISO(this.race.start) < DateTime.now().minus({ hours: RACE_DURATION_HOURS })) {
			this.setStatus(STATUS.noData);
			return;
		}

		this.forecast = await getForecast(this.race);

		this.calcNavTiming();
		this.setStatus(STATUS.loaded);
	}

	async drawCanvas() {
		super.drawCanvas();
		const { race } = this;
		const page = Math.min(Math.max(this.screenIndex, 0), 1);

		this.elem.querySelector('.f1-race-page.info').style.display = page === 0 ? 'block' : 'none';
		this.elem.querySelector('.f1-race-page.weekend').style.display = page === 1 ? 'block' : 'none';
		this.elem.querySelector('.header .title.dual .bottom').innerHTML = page === 0 ? `Round ${race.round}` : 'Weekend';

		if (page === 0) this.drawInfo(race);
		else this.drawWeekend(race);

		this.finishDraw();
	}

	drawInfo(race) {
		// track outline
		const svg = this.elem.querySelector('.track svg');
		const circuit = CIRCUITS[race.circuitId];
		if (circuit) {
			svg.setAttribute('viewBox', `-40 -40 ${circuit.w + 80} ${circuit.h + 80}`);
			svg.querySelector('.outline').setAttribute('points', circuit.path);
			svg.querySelector('.outline-shadow').setAttribute('points', circuit.path);
			svg.style.visibility = 'visible';
		} else {
			svg.style.visibility = 'hidden';
		}

		const start = DateTime.fromISO(race.start).setZone(LOCAL_TZ);
		const days = Math.round(start.startOf('day').diff(DateTime.now().setZone(LOCAL_TZ).startOf('day'), 'days').days);
		let countdown = `In ${days} days`;
		if (days === 1) countdown = 'Tomorrow';
		if (days <= 0) countdown = 'Race day';

		const lines = [
			['name', shortRaceName(race.name)],
			['circuit', race.circuit],
			['place', [race.locality, race.country].filter((v) => v && v !== race.circuit).join(', ')],
			['date', start.toFormat('ccc d LLL')],
			['countdown', countdown],
		];
		if (circuit?.length) lines.splice(3, 0, ['length', `${(circuit.length / 1000).toFixed(3)} km`]);

		const info = this.elem.querySelector('.race-info');
		info.innerHTML = '';
		lines.forEach(([cls, text]) => {
			const div = document.createElement('div');
			div.className = cls;
			div.textContent = stripAccents(text);
			// 8-bit flag after the country: images/flags/<country>.png (hidden if missing)
			if (cls === 'place' && race.country) {
				const flag = document.createElement('img');
				flag.className = 'flag';
				flag.alt = '';
				flag.addEventListener('error', () => flag.remove());
				// file name: country without accents, lower case, spaces as hyphens (Türkiye -> turkiye)
				const slug = race.country.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '-');
				flag.src = `images/flags/${slug}.png`;
				div.append(flag);
			}
			info.append(div);
		});

		// long circuit names (up to 34 characters, e.g. "Autódromo Internacional do Algarve")
		// do not fit at the normal size: shrink the line until it fits, down to 70%
		info.querySelectorAll(':scope > div').forEach((div) => {
			let size = parseFloat(window.getComputedStyle(div).fontSize);
			const minimum = size * 0.7;
			while (div.clientWidth > 0 && div.scrollWidth > div.clientWidth && size > minimum) {
				size -= 1;
				div.style.fontSize = `${size}px`;
			}
		});
	}

	drawWeekend(race) {
		const rows = race.sessions.map((session) => {
			const start = DateTime.fromISO(session.start).setZone(LOCAL_TZ);
			const row = this.fillTemplate('session-row', {
				day: start.toFormat('ccc d'),
				session: session.name,
				time: ConversionHelpers.formatTime(start),
			});
			if (session.name === 'Race') row.classList.add('race');
			return row;
		});
		const list = this.elem.querySelector('.session-lines');
		list.innerHTML = '';
		list.append(...rows);

		const forecast = this.elem.querySelector('.race-forecast');
		if (this.forecast) {
			forecast.querySelector('.icon img').src = this.forecast.icon;
			forecast.querySelector('.text').innerHTML = `Race: ${this.forecast.condition}, ${this.forecast.temperature}°${ConversionHelpers.getTemperatureUnitText()}, rain ${this.forecast.rain ?? 0}%`;
			forecast.style.visibility = 'visible';
		} else {
			forecast.style.visibility = 'hidden';
		}
	}
}

// register display
registerDisplay(new F1NextRace(20, 'f1-next-race', true));
