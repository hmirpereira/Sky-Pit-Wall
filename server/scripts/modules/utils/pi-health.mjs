// warnings from the Raspberry Pi services (flights, TAF, work schedule) for the bottom line:
// when something there stops updating, its screen is simply skipped, so without this nobody notices.
// Read from the skypitwall-voos service (/health.json); anywhere else there are no warnings.
const HEALTH_URL = 'http://127.0.0.1:8095/health.json';
const CHECK_EVERY_MS = 5 * 60 * 1000;

let problems = [];
let lastCheck = 0;

const check = async () => {
	lastCheck = Date.now();
	try {
		const response = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(3000) });
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const data = await response.json();
		problems = Array.isArray(data?.problems) ? data.problems : [];
	} catch {
		// not on the Pi (or the service itself is down: then the Pi screens are gone anyway)
		problems = [];
	}
};

// current warnings; checks again in the background at most every 5 minutes
const piProblems = () => {
	if (Date.now() - lastCheck > CHECK_EVERY_MS) check();
	return problems;
};

export default piProblems;
