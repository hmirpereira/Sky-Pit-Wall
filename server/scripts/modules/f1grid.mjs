// starting grid of the next Formula 1 sprint or race, scrolling through the field.
// Two columns, staggered like a real grid: odd positions on the left, even ones half a row back.
// Shown from sprint qualifying until the sprint, and from qualifying until the race
// (see utils/f1-weekend.mjs); the rest of the time F1 Last Race takes its place.
// The order is the qualifying classification: grid penalties are not included.
// Sources: race grid from Jolpica F1 (qualifying); sprint grid from Jolpica F1's alpha API
// (sprint qualifying), with OpenF1 as a backup. Team icons come from the car number.
import STATUS from './status.mjs';
import { json } from './utils/fetch.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';
import { DateTime } from '../vendor/auto/luxon.mjs';
import { getPhase, getSessionResult } from './utils/f1-weekend.mjs';

const JOLPICA = 'https://api.jolpi.ca';
const OPENF1 = 'https://api.openf1.org/v1';
// v3: with qualifying lap times
const CACHE_KEY = 'f1-grid-cache-v3';
const LOCAL_TZ = 'Europe/Lisbon';
// scrolling: one step = one pixel per baseDelay (20 ms)
const ROW_HEIGHT = 70; // keep in sync with _f1-grid.scss
const VISIBLE_HEIGHT = 266;
const HOLD = 150; // steps (3 s) before scrolling and at the end

// the alpha API and OpenF1 give team names, not the constructorId used for the icons
const TEAM_NAMES = {
	'red bull': 'red_bull',
	'red bull racing': 'red_bull',
	'rb f1 team': 'rb',
	'racing bulls': 'rb',
	mercedes: 'mercedes',
	ferrari: 'ferrari',
	mclaren: 'mclaren',
	'aston martin': 'aston_martin',
	alpine: 'alpine',
	'alpine f1 team': 'alpine',
	williams: 'williams',
	haas: 'haas',
	'haas f1 team': 'haas',
	audi: 'audi',
	'kick sauber': 'audi',
	cadillac: 'cadillac',
	'cadillac f1 team': 'cadillac',
};

const stripAccents = (text) => String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const shortRaceName = (name) => name.replace('Grand Prix', 'GP');

// qualifying times: "1:31.156" <-> seconds
const toSeconds = (text) => {
	const m = String(text ?? '').match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);
	return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : null;
};
const lapText = (seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, '0')}`;
// pole: its lap; the others: gap to pole ("+0.232"). The time is the one from the last part
// of qualifying each driver reached; a driver who set no time there shows "No time"
// (an earlier, slower part would give a misleading gap)
const timeText = (seconds, pole, index) => {
	if (pole === null) return '';
	if (seconds === null) return 'No time';
	return index === 0 ? lapText(seconds) : `+${(seconds - pole).toFixed(3)}`;
};

// car number -> constructorId, from the latest race
const teamsByNumber = async () => {
	const results = (await json(`${JOLPICA}/ergast/f1/current/last/results/`).catch(() => null))?.MRData?.RaceTable?.Races?.[0]?.Results ?? [];
	return Object.fromEntries(results.map((r) => [Number(r.number), r.Constructor?.constructorId]));
};
const withTeams = async (rows) => {
	const teams = await teamsByNumber();
	return rows.map((r) => ({
		position: String(r.position),
		name: r.name,
		time: r.time ?? null,
		team: teams[Number(r.number)] ?? TEAM_NAMES[String(r.teamName ?? '').toLowerCase()] ?? '',
	}));
};

// Jolpica alpha API: SQ (sprint qualifying) or Q (qualifying) of a round
const alphaResults = async (season, round, code) => {
	const events = (await json(`${JOLPICA}/f1/alpha/schedules/${season}/`))?.data?.events ?? [];
	const id = events.find((e) => String(e.round?.number) === String(round))?.round?.id;
	if (!id) return null;
	const results = (await json(`${JOLPICA}/f1/alpha/results/${id}/${code}/`))?.data?.results ?? [];
	if (results.length < 2) return null;
	return withTeams(results.map((r) => ({
		position: r.position, name: r.driver?.family_name, number: r.car_number ?? r.driver?.permanent_car_number, teamName: r.team?.name, time: toSeconds(Object.values(r.components ?? {}).at(-1)?.time ?? r.time),
	})));
};

// OpenF1: starting grid of a session (refused without a paid key while any session is live)
const openf1Grid = async (season, sessionName, start) => {
	const sessions = await json(`${OPENF1}/sessions?year=${season}&session_name=${encodeURIComponent(sessionName)}`);
	const session = (Array.isArray(sessions) ? sessions : [])
		.find((s) => Math.abs(DateTime.fromISO(s.date_start).diff(start, 'hours').hours) < 2);
	if (!session) return null;
	const grid = await json(`${OPENF1}/starting_grid?session_key=${session.session_key}`);
	const drivers = await json(`${OPENF1}/drivers?session_key=${session.session_key}`);
	if (!Array.isArray(grid) || grid.length < 2) return null;
	const byNumber = Object.fromEntries((Array.isArray(drivers) ? drivers : []).map((d) => [d.driver_number, d]));
	return withTeams(grid.sort((a, b) => a.position - b.position).map((g) => ({
		position: g.position, name: byNumber[g.driver_number]?.last_name ?? `#${g.driver_number}`, number: g.driver_number, teamName: byNumber[g.driver_number]?.team_name, time: g.lap_duration ?? null,
	})));
};

// Jolpica qualifying (Ergast format): has the constructorId already
const ergastQualifying = async (season, round) => {
	const race = (await json(`${JOLPICA}/ergast/f1/${season}/${round}/qualifying/`))?.MRData?.RaceTable?.Races?.[0];
	const results = race?.QualifyingResults ?? [];
	if (results.length < 2) return null;
	// official time: from the last part of qualifying each driver took part in
	return results.map((r) => ({
		position: r.position, name: r.Driver?.familyName ?? '', team: r.Constructor?.constructorId ?? '', time: toSeconds(['Q3', 'Q2', 'Q1'].map((q) => r[q]).find((t) => t !== undefined)),
	}));
};

// first source that answers with a grid
const tryEach = (...sources) => sources.reduce(
	(found, source) => found.then((rows) => (rows?.length ? rows
		: source().catch((error) => { console.error('F1Grid:', error); return null; }))),
	Promise.resolve(null),
);

class F1Grid extends WeatherDisplay {
	constructor(navId, elemId, defaultActive) {
		super(navId, elemId, 'F1 Grid', defaultActive);
		this.timing.baseDelay = 20;
		this.timing.delay = [500];
		this.scrollDistance = 0;
	}

	async getData(_weatherParameters) {
		if (!super.getData(_weatherParameters)) return;

		const {
			phase, season, round, race, times,
		} = await getPhase();
		if (phase !== 'sprint-grid' && phase !== 'race-grid') {
			this.setStatus(STATUS.noData);
			return;
		}
		const type = phase === 'sprint-grid' ? 'sprint' : 'race';
		const slots = await getSessionResult(CACHE_KEY, `${season}-${round}-${type}`, () => (type === 'sprint'
			? tryEach(() => alphaResults(season, round, 'SQ'), () => openf1Grid(season, 'Sprint Qualifying', times.sprintQualifying))
			: tryEach(() => ergastQualifying(season, round), () => alphaResults(season, round, 'Q'))));
		this.grid = {
			type,
			round,
			name: race.raceName,
			country: race.Circuit?.Location?.country,
			start: (type === 'sprint' ? times.sprint : times.race).toISO(),
			slots: slots ?? [],
		};
		if (!this.grid.slots.length) {
			this.setStatus(STATUS.noData);
			return;
		}

		const rows = Math.ceil(this.grid.slots.length / 2);
		this.scrollDistance = Math.max(0, rows * ROW_HEIGHT + ROW_HEIGHT / 2 + 8 - VISIBLE_HEIGHT);
		this.timing.delay = [HOLD + this.scrollDistance + HOLD];
		this.calcNavTiming();
		this.setStatus(STATUS.loaded);
	}

	async drawCanvas() {
		super.drawCanvas();
		const { grid } = this;

		this.elem.querySelector('.header .title.dual .top').innerHTML = grid.type === 'sprint' ? 'F1 Sprint Grid' : 'F1 Race Grid';
		this.elem.querySelector('.header .title.dual .bottom').innerHTML = `Round ${grid.round}`;

		const title = this.elem.querySelector('.race-title');
		title.querySelector('.name').textContent = stripAccents(shortRaceName(grid.name));
		const flag = title.querySelector('.flag');
		flag.style.display = '';
		flag.onerror = () => { flag.style.display = 'none'; };
		flag.src = `images/flags/${stripAccents(grid.country).toLowerCase().replace(/\s+/g, '-')}.png`;
		title.querySelector('.date').textContent = DateTime.fromISO(grid.start).setZone(LOCAL_TZ).toFormat('ccc HH:mm');

		const pole = grid.slots[0]?.time ?? null;
		const slots = grid.slots.map((driver, index) => {
			const slot = this.fillTemplate('grid-slot', {
				position: driver.position,
				driver: stripAccents(driver.name),
				lap: timeText(driver.time ?? null, pole, index),
			});
			const row = Math.floor(index / 2);
			const right = index % 2 === 1;
			slot.classList.add(right ? 'right' : 'left');
			slot.style.top = `${row * ROW_HEIGHT + (right ? ROW_HEIGHT / 2 : 0) + 6}px`;
			const team = slot.querySelector('.team');
			team.addEventListener('error', () => { team.style.visibility = 'hidden'; });
			team.src = `images/teams/${driver.team}.png`;
			return slot;
		});

		const area = this.elem.querySelector('.grid-area');
		const lines = area.querySelector('.grid-lines');
		lines.innerHTML = '';
		lines.append(...slots);
		lines.style.height = `${Math.ceil(slots.length / 2) * ROW_HEIGHT + ROW_HEIGHT / 2 + 8}px`;
		area.scrollTop = 0;

		this.finishDraw();
	}

	async screenIndexChange() {
		await this.drawCanvas();
		this.baseCountChange(this.navBaseCount);
	}

	baseCountChange(count) {
		const offset = Math.min(Math.max(count - HOLD, 0), this.scrollDistance);
		const area = this.elem.querySelector('.grid-area');
		if (area) area.scrollTop = offset;
	}
}

// register display
registerDisplay(new F1Grid(20, 'f1-grid', true));
