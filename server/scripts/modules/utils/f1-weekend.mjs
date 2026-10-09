// Where we are in the current race weekend, so the F1 Last Race and F1 Grid screens
// take turns without a gap:
//   after sprint qualifying -> sprint grid    (until the sprint starts)
//   after the sprint        -> sprint result  (until qualifying starts)
//   after qualifying        -> race grid      (until the race starts)
//   after the race          -> race result    (until the next weekend's first session)
// The season schedule comes from Jolpica F1 once a day.
// Results are asked for shortly after each session and then every 20 minutes until they appear,
// and once more at the next F1 update time (22:00) to catch penalties given after the session.
import { json } from './fetch.mjs';
import { readCache, writeCache, isFresh } from './f1-update.mjs';
import { DateTime } from '../../vendor/auto/luxon.mjs';

const SCHEDULE_URL = 'https://api.jolpi.ca/ergast/f1/current/races/?limit=40';
const SCHEDULE_KEY = 'f1-schedule-cache';
const RETRY_MINUTES = 20;

// how long after a session starts its result is worth asking for
const AFTER = {
	sprintQualifying: 60, sprint: 60, qualifying: 75, race: 150,
};

const at = (session) => (session?.date ? DateTime.fromISO(`${session.date}T${session.time ?? '00:00:00Z'}`) : null);

const getSchedule = async () => {
	let cache = readCache(SCHEDULE_KEY);
	const today = DateTime.now().toISODate();
	if (!cache?.races || cache.day !== today) {
		try {
			const races = (await json(SCHEDULE_URL))?.MRData?.RaceTable?.Races ?? [];
			cache = { day: today, races };
			writeCache(SCHEDULE_KEY, cache);
		} catch (error) {
			console.error('F1 weekend: unable to get the schedule', error);
		}
	}
	return cache?.races ?? [];
};

const weekendTimes = (race) => {
	const times = {
		sprintQualifying: at(race.SprintQualifying),
		sprint: at(race.Sprint),
		qualifying: at(race.Qualifying),
		race: at({ date: race.date, time: race.time }),
	};
	times.first = at(race.FirstPractice) ?? [times.sprintQualifying, times.qualifying, times.race].filter(Boolean)[0];
	return times;
};

// phase: 'sprint-grid' | 'sprint-result' | 'race-grid' | 'race-result' | 'none'
const getPhase = async (now = DateTime.now()) => {
	const races = await getSchedule();
	const started = races.filter((race) => weekendTimes(race).first <= now);
	const race = started.at(-1);
	if (!race) return { phase: 'none' };
	const t = weekendTimes(race);
	const after = (key) => t[key] && now >= t[key].plus({ minutes: AFTER[key] });
	const before = (key) => t[key] && now < t[key];

	let phase = 'none';
	if (t.sprint && after('sprintQualifying') && before('sprint')) phase = 'sprint-grid';
	else if (t.sprint && after('sprint') && before('qualifying')) phase = 'sprint-result';
	else if (after('qualifying') && before('race')) phase = 'race-grid';
	else if (after('race')) phase = 'race-result';
	return {
		phase, round: race.round, season: race.season, race, times: t,
	};
};

// result of one session: kept once found; asked again once an hour while missing,
// and once more at the next 22:00 update time
const getSessionResult = async (key, id, fetcher) => {
	const cache = readCache(key);
	const now = DateTime.now();
	if (cache?.id === id && cache.data && isFresh(cache)) return cache.data;
	if (cache?.id === id && !cache.data && cache.tried && now.diff(DateTime.fromISO(cache.tried), 'minutes').minutes < RETRY_MINUTES) return null;
	let data = null;
	try {
		data = await fetcher();
	} catch (error) {
		console.error(`F1 weekend: unable to get ${id}`, error);
	}
	if (data) {
		writeCache(key, { id, data });
		return data;
	}
	// nothing new: keep an older copy of the same session if there is one
	if (cache?.id === id && cache.data) {
		writeCache(key, { ...cache });
		return cache.data;
	}
	writeCache(key, { id, data: null, tried: now.toISO() });
	return null;
};

export {
	getPhase,
	getSessionResult,
	weekendTimes,
};
