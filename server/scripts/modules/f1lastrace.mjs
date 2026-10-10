// result of the last Formula 1 race or sprint: podium (team icon, driver, time or gap) and fastest lap.
// Race: from about 2h30 after the start until the next weekend's first session.
// Sprint: from about 1 h after the start until qualifying (see utils/f1-weekend.mjs).
// Between those, the F1 Grid screen takes its place. Source: Jolpica F1; OpenF1 while Jolpica
// has not published the result yet.
import STATUS from './status.mjs';
import { json } from './utils/fetch.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';
import { DateTime } from '../vendor/auto/luxon.mjs';
import { getPhase, getSessionResult } from './utils/f1-weekend.mjs';
import {
	teamsByNumber, teamId, findSession, sessionResult, laps,
} from './utils/f1-openf1.mjs';

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

// times as Jolpica writes them: winner "1:32:15.123" (or "38:08.162"), others "+5.123"
const raceTime = (seconds) => {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = (seconds % 60).toFixed(3).padStart(6, '0');
	return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};
const lapTime = (seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, '0')}`;

// OpenF1: classification of the race or sprint, and the fastest lap from the lap times
const openf1Race = async (season, type, start) => {
	const session = await findSession(season, type === 'sprint' ? 'Sprint' : 'Race', start);
	if (!session) return null;
	const results = await sessionResult(session.session_key);
	if (results.length < 3 || String(results[0].position) !== '1') return null;
	const teams = await teamsByNumber();
	const allLaps = (await laps(session.session_key)).filter((l) => l.lap_duration);
	const best = allLaps.reduce((a, b) => (!a || b.lap_duration < a.lap_duration ? b : a), null);
	const name = (number) => results.find((r) => r.driver_number === number)?.driver?.last_name ?? `#${number}`;
	return {
		podium: results.slice(0, 3).map((r, i) => {
			let time = '';
			if (i === 0) time = r.duration ? raceTime(r.duration) : '';
			else if (typeof r.gap_to_leader === 'number') time = `+${r.gap_to_leader.toFixed(3)}`;
			else time = String(r.gap_to_leader ?? '');
			return {
				position: String(i + 1), name: r.driver.last_name ?? `#${r.driver_number}`, team: teamId(teams, r.driver_number, r.driver.team_name), time,
			};
		}),
		fastest: best ? { name: name(best.driver_number), time: lapTime(best.lap_duration), lap: best.lap_number } : null,
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
			phase, season, round, race: scheduled, times,
		} = await getPhase();
		if (phase !== 'race-result' && phase !== 'sprint-result') {
			this.setStatus(STATUS.noData);
			return;
		}
		this.type = phase === 'sprint-result' ? 'sprint' : 'race';
		this.race = await getSessionResult(CACHE_KEY, `${season}-${round}-${this.type}`, async () => {
			const race = (await json(RESULT_URL(season, round, this.type)).catch(() => null))?.MRData?.RaceTable?.Races?.[0];
			let parsed = race ? parseRace(race) : null;
			if (!parsed) {
				// not on Jolpica yet: OpenF1, with the round's details from the schedule
				const result = await openf1Race(season, this.type, this.type === 'sprint' ? times.sprint : times.race).catch(() => null);
				if (result) {
					parsed = {
						...result, round, name: scheduled.raceName, country: scheduled.Circuit?.Location?.country, date: scheduled.date,
					};
				}
			}
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
