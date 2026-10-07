/* eslint-disable no-continue */
// Splits a raw TAF into its change groups (FM, BECMG, TEMPO, PROB) and decodes
// the conditions of each group with the METAR decoder. Anything unrecognised is
// ignored; the raw TAF is always shown on screen as well.
import decodeMetar from './metar-decoder.mjs';

const DAY_MS = 24 * 3600 * 1000;

// DDHH (or DDHHMM) relative to the issue time; hour 24 is midnight of the next day
const tafDate = (day, hour, minute, issued) => {
	let date = new Date(Date.UTC(issued.getUTCFullYear(), issued.getUTCMonth(), day, hour, minute));
	// a day number smaller than the issue day belongs to the next month
	if (date < issued - 2 * DAY_MS) date = new Date(Date.UTC(issued.getUTCFullYear(), issued.getUTCMonth() + 1, day, hour, minute));
	return date;
};

const parsePeriod = (token, issued) => {
	const m = token.match(/^(\d{2})(\d{2})\/(\d{2})(\d{2})$/);
	if (!m) return null;
	return {
		from: tafDate(Number(m[1]), Number(m[2]), 0, issued),
		to: tafDate(Number(m[3]), Number(m[4]), 0, issued),
	};
};

// conditions in a group, in screen order
const decodeConditions = (station, tokens) => {
	// maximum/minimum temperature groups (TX20/0714Z) are not shown
	const useful = tokens.filter((t) => !/^T[XN]M?\d{2}\/\d{4}Z$/.test(t));
	const d = decodeMetar(`${station} ${useful.join(' ')}`);
	const conditions = [];
	if (d.wind) conditions.push(d.wind);
	// CAVOK on one line instead of visibility plus clouds
	if (useful.includes('CAVOK')) {
		conditions.push('CAVOK (ceiling and vis OK)');
		conditions.push(...d.weather);
		return conditions;
	}
	if (d.visibility) conditions.push(`Visibility ${d.visibility}`);
	conditions.push(...d.weather);
	if (useful.includes('NSW')) conditions.push('No significant weather');
	conditions.push(...d.clouds);
	return conditions;
};

const decodeTaf = (rawText, issuedText = null, now = new Date()) => {
	const raw = rawText.trim().replace(/\s+/g, ' ');
	const tokens = raw.split(' ').filter((t) => t !== 'TAF' && t !== 'COR');
	const result = {
		raw, station: null, issued: null, amended: false, from: null, to: null, groups: [],
	};

	let i = 0;
	if (tokens[i] === 'AMD') { result.amended = true; i += 1; }
	if (/^[A-Z]{4}$/.test(tokens[i])) { result.station = tokens[i]; i += 1; }

	const time = tokens[i]?.match(/^(\d{2})(\d{2})(\d{2})Z$/);
	if (time) {
		// the full date comes from the service; the DDHHMMZ group only has the day
		result.issued = issuedText ? new Date(issuedText) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Number(time[1]), Number(time[2]), Number(time[3])));
		i += 1;
	}
	result.issued = result.issued ?? now;

	const validity = parsePeriod(tokens[i] ?? '', result.issued);
	if (validity) { result.from = validity.from; result.to = validity.to; i += 1; }

	// split the rest into groups
	let group = {
		type: 'BASE', from: result.from, to: result.to, tokens: [],
	};
	const groups = [group];
	for (; i < tokens.length; i += 1) {
		const t = tokens[i];
		const fm = t.match(/^FM(\d{2})(\d{2})(\d{2})$/);
		const prob = t.match(/^PROB(\d{2})$/);
		if (fm || prob || t === 'BECMG' || t === 'TEMPO') {
			// "PROB30 TEMPO" is one group
			if (t === 'TEMPO' && group.type === 'PROB' && group.tokens.length === 0) {
				group.tempo = true;
				continue;
			}
			let type = t;
			if (fm) type = 'FM';
			if (prob) type = 'PROB';
			group = { type, tokens: [] };
			if (prob) group.probability = Number(prob[1]);
			if (fm) group.from = tafDate(Number(fm[1]), Number(fm[2]), Number(fm[3]), result.issued);
			groups.push(group);
			continue;
		}
		if (!group.from || (group.type !== 'BASE' && group.type !== 'FM' && !group.to)) {
			const period = parsePeriod(t, result.issued);
			if (period) { group.from = period.from; group.to = period.to; continue; }
		}
		group.tokens.push(t);
	}

	// FM groups (and the base forecast) last until the next FM group or the end of the TAF
	const fmStarts = groups.filter((g) => g.type === 'FM').map((g) => g.from);
	groups.forEach((g) => {
		if (g.type === 'BASE' || g.type === 'FM') {
			g.to = fmStarts.find((start) => start > g.from) ?? result.to;
		}
	});

	result.groups = groups
		.map((g) => ({
			type: g.type,
			probability: g.probability ?? null,
			tempo: g.tempo ?? false,
			from: g.from,
			to: g.to,
			conditions: decodeConditions(result.station, g.tokens),
		}))
		// temporary and probable changes that are already over are no longer of interest
		.filter((g) => !((g.type === 'TEMPO' || g.type === 'PROB') && g.to && g.to < now))
		.filter((g) => g.conditions.length > 0);

	return result;
};

export default decodeTaf;
