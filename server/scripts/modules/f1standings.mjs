// current Formula 1 drivers' championship, scrolling through the whole field
// (same idea as the Travel Forecast screen)
// Source: Jolpica F1 API (successor of Ergast), no key, CORS enabled.
import STATUS from './status.mjs';
import { json } from './utils/fetch.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';
import { readCache, writeCache, isFresh } from './utils/f1-update.mjs';

const STANDINGS_URL = 'https://api.jolpi.ca/ergast/f1/current/driverstandings/';
// the standings list every team a driver raced for this season, in no particular order,
// so each driver's current team is taken from the latest race
const LAST_RACE_URL = 'https://api.jolpi.ca/ergast/f1/current/last/results/';
// scrolling: one step = one pixel per baseDelay (20 ms, i.e. 50 px/s at normal speed)
const ROW_HEIGHT = 40; // keep in sync with _f1-standings.scss
const VISIBLE_HEIGHT = 280; // 7 rows
const HOLD = 150; // steps (3 s) before scrolling and at the end

// v2: the team now comes from the latest race (older copies may show the wrong team)
const CACHE_KEY = 'f1-standings-cache-v2';

// the Star4000 fonts draw accented letters blank (Pérez -> P rez), so accents are removed
const stripAccents = (text) => String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

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

		let cache = readCache(CACHE_KEY);
		if (!isFresh(cache)) {
			try {
				const response = await json(STANDINGS_URL);
				const lastRace = await json(LAST_RACE_URL).catch(() => null);
				const teamInLastRace = {};
				(lastRace?.MRData?.RaceTable?.Races?.[0]?.Results ?? []).forEach((result) => {
					teamInLastRace[result.Driver?.driverId] = result.Constructor?.constructorId;
				});
				const list = response?.MRData?.StandingsTable?.StandingsLists?.[0];
				cache = {
					round: list?.round,
					season: list?.season,
					drivers: (list?.DriverStandings ?? []).map((standing) => ({
						position: standing.positionText ?? standing.position,
						name: standing.Driver?.familyName ?? standing.Driver?.code ?? '',
						points: standing.points,
						// team in the latest race; if the driver missed it, the last team listed
						team: teamInLastRace[standing.Driver?.driverId] ?? standing.Constructors?.at(-1)?.constructorId ?? '',
					})),
				};
				writeCache(CACHE_KEY, cache);
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
				driver: stripAccents(driver.name),
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
registerDisplay(new F1Standings(22, 'f1-standings', true));
