// pollen forecast for today, from Open-Meteo's air quality API (CAMS, Europe only)
import STATUS from './status.mjs';
import { json } from './utils/fetch.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';

// Levels use the US National Allergy Bureau scales (grains/m³, daily average):
// [moderate from, high from, very high from]. These are a guide, not a medical reference.
const SCALES = {
	tree: [15, 90, 1500],
	grass: [5, 20, 200],
	weed: [10, 50, 500],
};

const POLLEN_TYPES = [
	{ key: 'grass_pollen', name: 'Grass', scale: SCALES.grass },
	{ key: 'olive_pollen', name: 'Olive', scale: SCALES.tree },
	{ key: 'birch_pollen', name: 'Birch', scale: SCALES.tree },
	{ key: 'alder_pollen', name: 'Alder', scale: SCALES.tree },
	{ key: 'mugwort_pollen', name: 'Mugwort', scale: SCALES.weed },
	{ key: 'ragweed_pollen', name: 'Ragweed', scale: SCALES.weed },
];

const LEVELS = [
	{ text: 'None', className: 'none' },
	{ text: 'Low', className: 'low' },
	{ text: 'Moderate', className: 'moderate' },
	{ text: 'High', className: 'high' },
	{ text: 'Very High', className: 'very-high' },
];

const levelFor = (value, scale) => {
	if (value === null || value === undefined) return null;
	if (value < 1) return LEVELS[0];
	if (value < scale[0]) return LEVELS[1];
	if (value < scale[1]) return LEVELS[2];
	if (value < scale[2]) return LEVELS[3];
	return LEVELS[4];
};

class Pollen extends WeatherDisplay {
	constructor(navId, elemId, defaultActive) {
		super(navId, elemId, 'Pollen', defaultActive);

		// set timings (seconds on screen)
		this.timing.baseDelay = 10000;
	}

	async getData(_weatherParameters) {
		if (!super.getData(_weatherParameters)) return;
		const { latitude, longitude } = this.weatherParameters;

		try {
			const keys = POLLEN_TYPES.map((type) => type.key).join(',');
			const response = await json(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&hourly=${keys}&forecast_days=1&timezone=auto`);

			this.data = POLLEN_TYPES.map((type) => {
				const values = (response.hourly?.[type.key] ?? []).filter((v) => v !== null);
				// daily average, to match the scales above
				const average = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
				return { ...type, average, level: levelFor(average, type.scale) };
			});
		} catch (error) {
			console.error('Pollen: unable to get pollen forecast', error);
			this.setStatus(STATUS.failed);
			return;
		}

		// outside Europe CAMS has no pollen data; skip the screen
		if (this.data.every((type) => type.level === null)) {
			this.setStatus(STATUS.noData);
			return;
		}

		this.calcNavTiming();
		this.setStatus(STATUS.loaded);
	}

	async drawCanvas() {
		super.drawCanvas();

		const lines = this.data.map((type) => {
			const row = this.fillTemplate('pollen-row', {
				name: type.name,
				level: type.level?.text ?? 'N/A',
				count: type.average === null ? '' : `${Math.round(type.average)}`,
			});
			if (type.level) row.querySelector('.level').classList.add(type.level.className);
			return row;
		});

		const list = this.elem.querySelector('.pollen-lines');
		list.innerHTML = '';
		list.append(...lines);

		this.finishDraw();
	}
}

// register display
registerDisplay(new Pollen(14, 'pollen', true));
