// current Formula 1 drivers' championship, scrolling through the whole field
// (same idea as the Travel Forecast screen)
// Source: Jolpica F1 API (successor of Ergast), no key, CORS enabled.
import STATUS from './status.mjs';
import { json } from './utils/fetch.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';
import { DateTime } from '../vendor/auto/luxon.mjs';

const STANDINGS_URL = 'https://api.jolpi.ca/ergast/f1/current/driverstandings/';
// scrolling: one step = one pixel per baseDelay (20 ms, i.e. 50 px/s at normal speed)
const ROW_HEIGHT = 40; // keep in sync with _f1-standings.scss
const VISIBLE_HEIGHT = 280; // 7 rows
const HOLD = 150; // steps (3 s) before scrolling and at the end

// the standings only change on race weekends: download them once a day on these days,
// from this hour (Portuguese time) on; the rest of the time the saved copy is shown
// Friday to Monday at 22h: Monday catches races in the Americas, which end late on Sunday in Lisbon
const UPDATE_WEEKDAYS = [5, 6, 7, 1]; // 1 = Monday ... 7 = Sunday
const UPDATE_HOUR = 22;
const UPDATE_TZ = 'Europe/Lisbon';
const CACHE_KEY = 'f1-standings-cache';

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

const readCache = () => {
	try {
		return JSON.parse(window.localStorage.getItem(CACHE_KEY));
	} catch {
		return null;
	}
};

const writeCache = (data) => {
	try {
		window.localStorage.setItem(CACHE_KEY, JSON.stringify(data));
	} catch {
		// storage unavailable: the next refresh simply downloads again
	}
};

class F1Standings extends WeatherDisplay {
	constructor(navId, elemId, defaultActive) {
		super(navId, elemId, 'F1 Standings', defaultActive);

		// timing is set once the number of drivers is known
		this.timing.baseDelay = 20;
		this.timing.delay = [500];
		this.scrollDistance = 0;
	}

	async getData(_weatherParameters) {
		if (!super.getData(_weatherParameters)) return;

		let cache = readCache();
		const fresh = cache?.fetched && DateTime.fromISO(cache.fetched) >= lastUpdateSlot();
		if (!fresh) {
			try {
				const response = await json(STANDINGS_URL);
				const list = response?.MRData?.StandingsTable?.StandingsLists?.[0];
				cache = {
					fetched: DateTime.now().toISO(),
					round: list?.round,
					season: list?.season,
					drivers: (list?.DriverStandings ?? []).map((standing) => ({
						position: standing.positionText ?? standing.position,
						name: standing.Driver?.familyName ?? standing.Driver?.code ?? '',
						points: standing.points,
						// a driver who changed teams lists several; the last one is the current team
						team: standing.Constructors?.at(-1)?.constructorId ?? '',
					})),
				};
				writeCache(cache);
			} catch (error) {
				// keep showing the saved copy if there is one
				console.error('F1Standings: unable to get the standings', error);
				if (!cache?.drivers) {
					this.setStatus(STATUS.failed);
					return;
				}
			}
		}
		this.round = cache.round;
		this.season = cache.season;
		this.drivers = cache.drivers ?? [];

		// before the first race of a season there are no standings yet: skip the screen
		if (this.drivers.length === 0) {
			this.setStatus(STATUS.noData);
			return;
		}

		// hold, scroll to the last driver, hold
		this.scrollDistance = Math.max(0, this.drivers.length * ROW_HEIGHT - VISIBLE_HEIGHT);
		this.timing.delay = [HOLD + this.scrollDistance + HOLD];

		this.calcNavTiming();
		this.setStatus(STATUS.loaded);
	}

	async drawCanvas() {
		super.drawCanvas();

		const lines = this.drivers.map((driver) => {
			const row = this.fillTemplate('f1-row', {
				position: driver.position,
				driver: driver.name,
				points: driver.points,
			});
			// team icon: images/teams/<constructorId>.png (hidden if missing)
			const team = row.querySelector('.team');
			team.addEventListener('error', () => { team.style.visibility = 'hidden'; });
			team.src = `images/teams/${driver.team}.png`;
			return row;
		});

		const list = this.elem.querySelector('.f1-lines');
		list.innerHTML = '';
		list.append(...lines);
		list.scrollTop = 0;

		this.elem.querySelector('.header .title.dual .bottom').innerHTML = this.round ? `After Round ${this.round}` : 'Standings';

		this.finishDraw();
	}

	// a screenIndexChange method replaces the default drawCanvas call, so draw here
	async screenIndexChange() {
		await this.drawCanvas();
		this.baseCountChange(this.navBaseCount);
	}

	// called on every step: scroll the list after the initial hold, stop at the end
	baseCountChange(count) {
		const offset = Math.min(Math.max(count - HOLD, 0), this.scrollDistance);
		const list = this.elem.querySelector('.f1-lines');
		if (list) list.scrollTop = offset;
	}
}

// register display
registerDisplay(new F1Standings(17, 'f1-standings', true));
