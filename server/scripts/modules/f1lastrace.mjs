// result of the last Formula 1 race: podium (team icon, driver, time or gap) and fastest lap.
// Shown from the race until the next race weekend starts (first session of the next race,
// taken from the F1 Next Race cache); before the first race of a season it is skipped.
// Source: Jolpica F1 (same request the F1 Drivers screen uses to find each driver's team).
import STATUS from './status.mjs';
import { json } from './utils/fetch.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';
import { DateTime } from '../vendor/auto/luxon.mjs';
import { readCache, writeCache, isFresh } from './utils/f1-update.mjs';

const LAST_RACE_URL = 'https://api.jolpi.ca/ergast/f1/current/last/results/';
const CACHE_KEY = 'f1-last-race-cache';
const NEXT_RACE_CACHE_KEY = 'f1-next-race-cache';
const LOCAL_TZ = 'Europe/Lisbon';

// the Star4000 fonts draw accented letters blank (Pérez -> P rez), so accents are removed
const stripAccents = (text) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const shortRaceName = (name) => name.replace('Grand Prix', 'GP');

const parseRace = (race) => {
	const results = race.Results ?? [];
	const fastest = results.find((r) => r.FastestLap?.rank === '1');
	return {
		round: race.round,
		name: race.raceName,
		country: race.Circuit?.Location?.country,
		date: race.date,
		podium: results.slice(0, 3).map((r) => ({
			position: r.position,
			name: r.Driver?.familyName ?? r.Driver?.code ?? '',
			team: r.Constructor?.constructorId ?? '',
			// winner: race time; others: gap, or the status when lapped ("+1 Lap")
			time: r.Time?.time ?? r.status ?? '',
		})),
		fastest: fastest ? {
			name: fastest.Driver?.familyName ?? '',
			time: fastest.FastestLap?.Time?.time ?? '',
			lap: fastest.FastestLap?.lap,
		} : null,
	};
};

class F1LastRace extends WeatherDisplay {
	constructor(navId, elemId, defaultActive) {
		super(navId, elemId, 'F1 Last Race', defaultActive);
		this.timing.baseDelay = 12000;
	}

	async getData(_weatherParameters) {
		if (!super.getData(_weatherParameters)) return;

		let cache = readCache(CACHE_KEY);
		if (!isFresh(cache)) {
			try {
				const response = await json(LAST_RACE_URL);
				const race = response?.MRData?.RaceTable?.Races?.[0];
				cache = { race: race ? parseRace(race) : null };
				writeCache(CACHE_KEY, cache);
			} catch (error) {
				console.error('F1LastRace: unable to get the last race', error);
				if (!cache?.race) {
					this.setStatus(STATUS.failed);
					return;
				}
			}
		}
		this.race = cache?.race;

		// no race yet this season, or the next race weekend has already started: skip the screen
		const nextRace = readCache(NEXT_RACE_CACHE_KEY)?.race;
		const nextWeekend = nextRace?.sessions?.[0]?.start ?? nextRace?.start;
		const weekendStarted = nextWeekend && DateTime.fromISO(nextWeekend) <= DateTime.now()
			&& DateTime.fromISO(nextRace.start) > DateTime.fromISO(this.race?.date ?? '1970-01-01');
		if (!this.race?.podium?.length || weekendStarted) {
			this.setStatus(STATUS.noData);
			return;
		}

		this.calcNavTiming();
		this.setStatus(STATUS.loaded);
	}

	async drawCanvas() {
		super.drawCanvas();
		const { race } = this;

		this.elem.querySelector('.header .title.dual .bottom').innerHTML = `Round ${race.round}`;

		// race name, flag and date
		const title = this.elem.querySelector('.race-title');
		title.querySelector('.name').textContent = stripAccents(shortRaceName(race.name));
		const flag = title.querySelector('.flag');
		flag.style.display = '';
		flag.onerror = () => { flag.style.display = 'none'; };
		flag.src = `images/flags/${stripAccents(race.country).toLowerCase().replace(/\s+/g, '-')}.png`;
		title.querySelector('.date').textContent = DateTime.fromISO(race.date, { zone: LOCAL_TZ }).toFormat('ccc d LLL');

		// podium: P2 left, P1 middle, P3 right
		race.podium.forEach((driver) => {
			const step = this.elem.querySelector(`.podium .p${driver.position}`);
			if (!step) return;
			const icon = step.querySelector('.team');
			icon.style.visibility = 'visible';
			icon.onerror = () => { icon.style.visibility = 'hidden'; };
			icon.src = `images/teams/${driver.team}.png`;
			step.querySelector('.driver').textContent = stripAccents(driver.name);
			step.querySelector('.time').textContent = driver.time;
		});

		const fastest = this.elem.querySelector('.fastest');
		if (race.fastest) {
			fastest.textContent = `Fastest lap: ${stripAccents(race.fastest.name)} ${race.fastest.time}${race.fastest.lap ? ` (lap ${race.fastest.lap})` : ''}`;
			fastest.style.visibility = 'visible';
		} else {
			fastest.style.visibility = 'hidden';
		}

		this.finishDraw();
	}
}

// register display
registerDisplay(new F1LastRace(19, 'f1-last-race', true));
