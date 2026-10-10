// Regional Forecast for Portugal: district capitals and island capitals on five maps
// (north, centre, Lisbon area, south, islands); each label sits on its city, without dots or lines, each with the day's weather icon, high and low.
// Before 18:00 it shows today, after that tomorrow (like the Travel Forecast).
// Data: one Open-Meteo request for all 22 cities. Maps and label positions are made by
// ferramentas/mkregional.py from Natural Earth (public domain) and stored in utils/regional-pt.mjs.
// (The original screen used the US National Weather Service and a US map, so it never worked here.)
import STATUS from './status.mjs';
import { json } from './utils/fetch.mjs';
import { getWeatherRegionalIconFromIconLink } from './icons.mjs';
import { DateTime } from '../vendor/auto/luxon.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';
import { getConditionText } from './utils/weather.mjs';
import ConversionHelpers from './utils/conversionHelpers.mjs';
import REGIONAL_PAGES from './utils/regional-pt.mjs';

const SWITCH_TO_TOMORROW_HOUR = 18;
const PAGE_TITLES = {
	north: 'North', centre: 'Centre', lisbon: 'Lisbon', south: 'South', islands: 'Islands',
};

class RegionalForecast extends WeatherDisplay {
	constructor(navId, elemId) {
		super(navId, elemId, 'Regional Forecast', false);
		this.showOnProgress = false;
		this.timing.baseDelay = 6000;
		this.timing.totalScreens = REGIONAL_PAGES.length;
	}

	async getData(_weatherParameters) {
		if (!super.getData(_weatherParameters)) return;

		const cities = REGIONAL_PAGES.flatMap((page) => page.cities);
		this.today = DateTime.local().hour < SWITCH_TO_TOMORROW_HOUR;
		const day = this.today ? 0 : 1;
		try {
			const lats = cities.map((c) => c.lat).join(',');
			const lons = cities.map((c) => c.lon).join(',');
			const response = await json(`https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=2`);
			const results = Array.isArray(response) ? response : [response];
			this.forecast = {};
			cities.forEach((city, index) => {
				const daily = results[index]?.daily;
				if (!daily) return;
				this.forecast[city.key] = {
					icon: getWeatherRegionalIconFromIconLink(getConditionText(Number(daily.weather_code[day])), 1),
					high: Math.round(ConversionHelpers.convertTemperatureUnits(daily.temperature_2m_max[day])),
					low: Math.round(ConversionHelpers.convertTemperatureUnits(daily.temperature_2m_min[day])),
				};
			});
			this.dayName = this.today ? 'Today' : DateTime.local().plus({ days: 1 }).toFormat('cccc');
		} catch (error) {
			console.error('RegionalForecast: no data', error);
			this.forecast = {};
		}
		if (Object.keys(this.forecast).length === 0) {
			this.setStatus(STATUS.noData);
			return;
		}
		this.setStatus(STATUS.loaded);
	}

	async drawCanvas() {
		super.drawCanvas();
		const page = REGIONAL_PAGES[Math.min(Math.max(this.screenIndex, 0), REGIONAL_PAGES.length - 1)];

		this.elem.querySelector('.header .title.dual .top').innerHTML = `Portugal ${PAGE_TITLES[page.id]}`;
		this.elem.querySelector('.header .title.dual .bottom').innerHTML = `Forecast ${this.dayName}`;
		this.elem.querySelector('.map img').src = page.map;

		const blocks = page.cities.map((city) => {
			const data = this.forecast[city.key];
			if (!data) return false;
			const block = this.fillTemplate('location', {
				city: city.name,
				high: data.high,
				low: data.low,
				icon: { type: 'img', src: data.icon },
			});
			block.style.left = `${city.x}px`;
			block.style.top = `${city.y}px`;
			block.style.width = `${city.w}px`;
			return block;
		}).filter((d) => d);

		const container = this.elem.querySelector('.location-container');
		container.innerHTML = '';
		container.append(...blocks);

		this.finishDraw();
	}
}

registerDisplay(new RegionalForecast(6, 'regional-forecast'));
