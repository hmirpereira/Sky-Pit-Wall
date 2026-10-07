// shared update rule for the F1 screens: the data only changes on race weekends,
// so it is downloaded once a day on these days, from this hour (Portuguese time) on,
// and saved in the browser; the rest of the time the saved copy is shown.
// Friday to Monday at 22h: Monday catches races in the Americas, which end late on Sunday in Lisbon.
import { DateTime } from '../../vendor/auto/luxon.mjs';

const UPDATE_WEEKDAYS = [5, 6, 7, 1]; // 1 = Monday ... 7 = Sunday
const UPDATE_HOUR = 22;
const UPDATE_TZ = 'Europe/Lisbon';

// most recent update time that has already passed
const lastUpdateSlot = () => {
	const now = DateTime.now().setZone(UPDATE_TZ);
	for (let back = 0; back <= 7; back += 1) {
		const slot = now.minus({ days: back }).set({
			hour: UPDATE_HOUR, minute: 0, second: 0, millisecond: 0,
		});
		if (UPDATE_WEEKDAYS.includes(slot.weekday) && slot <= now) return slot;
	}
	return now.minus({ days: 7 });
};

const readCache = (key) => {
	try {
		return JSON.parse(window.localStorage.getItem(key));
	} catch {
		return null;
	}
};

const writeCache = (key, data) => {
	try {
		window.localStorage.setItem(key, JSON.stringify({ ...data, fetched: DateTime.now().toISO() }));
	} catch {
		// storage unavailable: the next refresh simply downloads again
	}
};

// true when the saved copy was downloaded after the latest update time
const isFresh = (cache) => !!cache?.fetched && DateTime.fromISO(cache.fetched) >= lastUpdateSlot();

export {
	readCache,
	writeCache,
	isFresh,
};
