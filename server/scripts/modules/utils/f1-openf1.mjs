// OpenF1 (https://openf1.org) as a backup for the F1 screens when Jolpica F1 has not yet
// published a session (it can take until after the weekend). Free use is refused while any
// session is live; the screens then try again later (utils/f1-weekend.mjs).
import { json } from './fetch.mjs';
import { DateTime } from '../../vendor/auto/luxon.mjs';

const JOLPICA = 'https://api.jolpi.ca';
const OPENF1 = 'https://api.openf1.org/v1';

// the alpha API and OpenF1 give team names, not the constructorId used for the icons
export const TEAM_NAMES = {
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

// car number -> constructorId, from the latest race
export const teamsByNumber = async () => {
	const results = (await json(`${JOLPICA}/ergast/f1/current/last/results/`).catch(() => null))?.MRData?.RaceTable?.Races?.[0]?.Results ?? [];
	return Object.fromEntries(results.map((r) => [Number(r.number), r.Constructor?.constructorId]));
};
// constructorId for the icons: from the car number, else from the team name
export const teamId = (teams, number, teamName) => teams[Number(number)] ?? TEAM_NAMES[String(teamName ?? '').toLowerCase()] ?? '';

// the OpenF1 session with this name that starts within 2 h of the scheduled time
export const findSession = async (season, sessionName, start) => {
	if (!start) return null;
	const sessions = await json(`${OPENF1}/sessions?year=${season}&session_name=${encodeURIComponent(sessionName)}`);
	return (Array.isArray(sessions) ? sessions : [])
		.find((s) => Math.abs(DateTime.fromISO(s.date_start).diff(start, 'hours').hours) < 2) ?? null;
};

const list = async (url) => {
	const data = await json(url);
	return Array.isArray(data) ? data : [];
};

// classification and drivers of a session; numeric positions first, then the rest (retired) in order
export const sessionResult = async (sessionKey) => {
	const [results, drivers] = await Promise.all([
		list(`${OPENF1}/session_result?session_key=${sessionKey}`),
		list(`${OPENF1}/drivers?session_key=${sessionKey}`),
	]);
	const byNumber = Object.fromEntries(drivers.map((d) => [d.driver_number, d]));
	// a position can be a number, null or text such as "RT"
	const rank = (r) => (typeof r.position === 'number' || /^\d+$/.test(String(r.position ?? '')) ? Number(r.position) : 1000);
	return results.map((r, i) => ({ ...r, order: i })).sort((a, b) => rank(a) - rank(b) || a.order - b.order)
		.map((r) => ({ ...r, driver: byNumber[r.driver_number] ?? {} }));
};

export const laps = (sessionKey) => list(`${OPENF1}/laps?session_key=${sessionKey}`);

export { JOLPICA, OPENF1 };
