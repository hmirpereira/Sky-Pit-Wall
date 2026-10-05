// travel forecast display
import STATUS from './status.mjs';
import { json } from './utils/fetch.mjs';
import { getWeatherRegionalIconFromIconLink } from './icons.mjs';
import { DateTime } from '../vendor/auto/luxon.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';
import { getConditionText } from './utils/weather.mjs';
import ConversionHelpers from './utils/conversionHelpers.mjs';

// cities shown on the travel forecast (Open-Meteo, any location worldwide)
const TRAVEL_CITIES = [
	{ Name: 'Frankfurt', lat: 50.1109, lon: 8.6821 },
	{ Name: 'Munich', lat: 48.1351, lon: 11.5820 },
	{ Name: 'Zurich', lat: 47.3769, lon: 8.5417 },
	{ Name: 'Geneva', lat: 46.2044, lon: 6.1432 },
	{ Name: 'Vienna', lat: 48.2082, lon: 16.3738 },
];

// after this local hour the forecast shown is for tomorrow
const SWITCH_TO_TOMORROW_HOUR = 18;

class TravelForecast extends WeatherDisplay {
	constructor(navId, elemId, defaultActive) {
		// special height and width for scrolling
		super(navId, elemId, 'Travel Forecast', defaultActive);

		// Remove from loading screen
		this.showOnProgress = false;

		// set up the timing
		this.timing.baseDelay = 20;
		// page sizes are 4 cities, calculate the number of pages necessary plus overflow
		const pagesFloat = TRAVEL_CITIES.length / 4;
		const pages = Math.floor(pagesFloat) - 2; // first page is already displayed, last page doesn't happen
		const extra = pages % 1;
		const timingStep = 75 * 4;
		this.timing.delay = [150 + timingStep];
		// add additional pages
		for (let i = 0; i < pages; i += 1) this.timing.delay.push(timingStep);
		// add the extra (not exactly 4 pages portion)
		if (extra !== 0) this.timing.delay.push(Math.round(this.extra * this.cityHeight));
		// add the final 3 second delay
		this.timing.delay.push(150);
	}

	async getData() {
		// super checks for enabled
		if (!super.getData()) return;

		const today = DateTime.local().hour < SWITCH_TO_TOMORROW_HOUR;
		const dayIndex = today ? 0 : 1;

		try {
			// one request for all cities
			const lats = TRAVEL_CITIES.map((city) => city.lat).join(',');
			const lons = TRAVEL_CITIES.map((city) => city.lon).join(',');
			const response = await json(`https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=2`);
			const results = Array.isArray(response) ? response : [response];

			this.data = TRAVEL_CITIES.map((city, index) => {
				const daily = results[index]?.daily;
				if (!daily) return { name: city.Name, error: true };
				const condition = getConditionText(Number(daily.weather_code[dayIndex]));
				return {
					today,
					high: ConversionHelpers.convertTemperatureUnits(daily.temperature_2m_max[dayIndex]),
					low: ConversionHelpers.convertTemperatureUnits(daily.temperature_2m_min[dayIndex]),
					name: city.Name,
					icon: getWeatherRegionalIconFromIconLink(condition, 1),
				};
			});
		} catch (error) {
			console.error('GetTravelWeather failed', error);
			this.data = TRAVEL_CITIES.map((city) => ({ name: city.Name, error: true }));
		}

		// test for some data available in at least one forecast
		const hasData = this.data.some((forecast) => !forecast.error);
		if (!hasData) {
			this.setStatus(STATUS.noData);
			return;
		}

		this.setStatus(STATUS.loaded);
		this.drawLongCanvas();
	}

	async drawLongCanvas() {
		// get the element and populate
		const list = this.elem.querySelector('.travel-lines');
		list.innerHTML = '';

		// set up variables
		const cities = this.data;

		const lines = cities.map((city) => {
			if (city.error) return false;
			const fillValues = {
				city,
			};

			// check for forecast data
			if (city.icon) {
				fillValues.city = city.name;
				// get temperatures and convert if necessary
				const { low, high } = city;

				// convert to strings with no decimal
				const lowString = Math.round(low).toString();
				const highString = Math.round(high).toString();

				fillValues.low = lowString;
				fillValues.high = highString;
				const { icon } = city;

				fillValues.icon = { type: 'img', src: icon };
			} else {
				fillValues.error = 'NO TRAVEL DATA AVAILABLE';
			}
			return this.fillTemplate('travel-row', fillValues);
		}).filter((d) => d);
		list.append(...lines);
	}

	async drawCanvas() {
		// there are technically 2 canvases: the standard canvas and the extra-long canvas that contains the complete
		// list of cities. The second canvas is copied into the standard canvas to create the scroll
		super.drawCanvas();

		// set up variables
		const cities = this.data;

		this.elem.querySelector('.header .title.dual .bottom').innerHTML = `For ${getTravelCitiesDayName(cities)}`;

		this.finishDraw();
	}

	async showCanvas() {
		// special to travel forecast to draw the remainder of the canvas
		await this.drawCanvas();
		super.showCanvas();
	}

	// screen index change callback just runs the base count callback
	screenIndexChange() {
		this.baseCountChange(this.navBaseCount);
	}

	// base count change callback
	baseCountChange(count) {
		// calculate scroll offset and don't go past end
		let offsetY = Math.min(this.elem.querySelector('.travel-lines').offsetHeight - 289, (count - 150));

		// don't let offset go negative
		if (offsetY < 0) offsetY = 0;

		// copy the scrolled portion of the canvas
		this.elem.querySelector('.main').scrollTo(0, offsetY);
	}

	// necessary to get the lastest long canvas when scrolling
	getLongCanvas() {
		return this.longCanvas;
	}
}

// effectively returns early on the first found date
const getTravelCitiesDayName = (cities) => cities.reduce((dayName, city) => {
	if (city && dayName === '') {
		// today or tomorrow
		const day = DateTime.local().plus({ days: (city.today) ? 0 : 1 });
		// return the day
		return day.toLocaleString({ weekday: 'long' });
	}
	return dayName;
}, '');

// register display, not active by default
registerDisplay(new TravelForecast(5, 'travel', false));
