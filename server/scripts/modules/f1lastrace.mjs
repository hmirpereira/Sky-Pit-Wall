// result of the last Formula 1 race or sprint: podium (team icon, driver, time or gap) and fastest lap.
// Race: from about 2h30 after the start until the next weekend's first session.
// Sprint: from about 1 h after the start until qualifying (see utils/f1-weekend.mjs).
// Between those, the F1 Grid screen takes its place. Source: Jolpica F1.
import STATUS from './status.mjs';
import { json } from './utils/fetch.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';
import { DateTime } from '../vendor/auto/luxon.mjs';
import { getPhase, getSessionResult } from './utils/f1-weekend.mjs';

const RESULT_URL = (season, round, type) => `https://api.jolpi.ca/ergast/f1/${season}/${round}/${type === 'sprint' ? 'sprint' : 'results'}/`;
const CACHE_KEY = 'f1-last-race-cache-v2';
const LOCAL_TZ = 'Europe/Lisbon';

// the Star4000 fonts draw accented letters blank (Pérez -> P rez), so accents are removed
const stripAccents = (text) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const shortRaceName = (name) => name.replace('Grand Prix', 'GP');

const parseRace = (race) => {
	const results = race.Results ?? race.SprintResults ?? [];
	if (results.length < 3) return null;
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

		// only after a race or a sprint; the rest of the weekend belongs to the grid
		const {
			phase, season, round, race: scheduled,
		} = await getPhase();
		if (phase !== 'race-result' && phase !== 'sprint-result') {
			this.setStatus(STATUS.noData);
			return;
		}
		this.type = phase === 'sprint-result' ? 'sprint' : 'race';
		this.race = await getSessionResult(CACHE_KEY, `${season}-${round}-${this.type}`, async () => {
			const race = (await json(RESULT_URL(season, round, this.type)))?.MRData?.RaceTable?.Races?.[0];
			const parsed = race ? parseRace(race) : null;
			// the sprint answer carries the race date; the sprint date comes from the schedule
			if (parsed && this.type === 'sprint' && scheduled.Sprint?.date) parsed.date = scheduled.Sprint.date;
			return parsed;
		});
		if (!this.race?.podium?.length) {
			this.setStatus(STATUS.noData);
			return;
		}

		this.calcNavTiming();
		this.setStatus(STATUS.loaded);
	}

	async drawCanvas() {
		super.drawCanvas();
		const { race } = this;

		this.elem.querySelector('.header .title.dual .top').innerHTML = this.type === 'sprint' ? 'F1 Last Sprint' : 'F1 Last Race';
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
registerDisplay(new F1LastRace(20, 'f1-last-race', true));
