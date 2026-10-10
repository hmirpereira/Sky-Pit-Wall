// the local airport and IPMA area come from the settings (set in the Pi's address), so no place
// is written in the code; without them the Airport METAR and Hazards screens are skipped
import settings from '../settings.mjs';
import { ipmaArea } from './ipma-areas.mjs';

const airport = () => {
	const icao = String(settings.airportIcao?.value ?? '').trim().toUpperCase();
	const name = String(settings.airportName?.value ?? '').trim();
	return { icao: /^[A-Z0-9]{4}$/.test(icao) ? icao : '', name };
};

// screen titles: "Frankfurt Airport", "Frankfurt Departures"; just "Airport" / "Departures" without a name
const placeTitle = (word) => [airport().name, word].filter(Boolean).join(' ');

const warningArea = () => ipmaArea(settings.ipmaArea?.value);

export { airport, placeTitle, warningArea };
