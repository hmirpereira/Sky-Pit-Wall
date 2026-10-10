document.addEventListener('DOMContentLoaded', () => init());

// shorthand mappings for frequently used values
const specialMappings = {
	kiosk: 'settings-kiosk-checkbox',
};

const init = () => {
	// add action to existing link
	const shareLink = document.querySelector('#share-link');
	shareLink.addEventListener('click', createLink);
	document.querySelector('#tv-link')?.addEventListener('click', createTvLink);

	// if navigator.clipboard does not exist, change text
	if (!navigator?.clipboard) {
		shareLink.textContent = 'Get Permalink';
	}
};

// settings the TV always needs, whatever is chosen on this page
const TV_SETTINGS = {
	'settings-kiosk-checkbox': true,
	'settings-wide-checkbox': true,
	'settings-scanLines-checkbox': true,
	'settings-hideWebamp-checkbox': true,
};

const createLink = async (e) => {
	// cancel default event (click on hyperlink)
	e.preventDefault();
	const url = buildUrl();

	// send to proper function based on availability of clipboard
	if (navigator?.clipboard) {
		copyToClipboard(url);
	} else {
		writeLinkToPage(url);
	}
};

// the same address with the TV settings, ready for "skypitwall-tv url" on the Pi
const createTvLink = async (e) => {
	e.preventDefault();
	const box = document.querySelector('#tv-link-command');
	// the TV needs a location: without one it would stop at "Enter your location"
	if (!localStorage.getItem('latLon') && !parseQueryString().latLon) {
		box.value = 'Choose a location first (search box at the top), then copy the TV command again.';
		box.style.display = 'block';
		return;
	}
	const url = buildUrl(TV_SETTINGS);
	const command = `skypitwall-tv url '${url.toString()}'`;
	box.value = command;
	box.style.display = 'block';
	box.focus();
	box.select();
	if (navigator?.clipboard) {
		try {
			await navigator.clipboard.writeText(command);
			const confirmSpan = document.querySelector('#tv-link-copied');
			confirmSpan.style.display = 'inline';
			setTimeout(() => { confirmSpan.style.display = 'none'; }, 5000);
		} catch (error) {
			console.error(error);
		}
	}
};

const buildUrl = (overrides = {}) => {
	// get all checkboxes on page
	const checkboxes = document.querySelectorAll('input[type=checkbox]');

	// list to receive checkbox statuses
	const queryStringElements = {};

	[...checkboxes].forEach((elem) => {
		if (elem?.id) {
			queryStringElements[elem.id] = elem?.checked ?? false;
		}
	});

	// get all select boxes
	const selects = document.querySelectorAll('select');
	[...selects].forEach((elem) => {
		if (elem?.id) {
			queryStringElements[elem.id] = elem?.value ?? 0;
		}
	});

	// text settings (airport code and name)
	document.querySelectorAll('input[type=text][id^="settings-"]').forEach((elem) => {
		if (elem.value.trim()) queryStringElements[elem.id] = elem.value.trim();
	});

	// add the location string (left out when no location has been chosen yet)
	const latLonQuery = localStorage.getItem('latLonQuery') ?? parseQueryString().latLonQuery;
	const latLon = localStorage.getItem('latLon') ?? parseQueryString().latLon;
	if (latLonQuery) queryStringElements.latLonQuery = latLonQuery;
	if (latLon) queryStringElements.latLon = latLon;

	Object.assign(queryStringElements, overrides);
	const queryString = (new URLSearchParams(queryStringElements)).toString();

	return new URL(`?${queryString}`, document.location.href);
};

const copyToClipboard = async (url) => {
	try {
		// write to clipboard
		await navigator.clipboard.writeText(url.toString());
		// alert user
		const confirmSpan = document.querySelector('#share-link-copied');
		confirmSpan.style.display = 'inline';

		// hide confirm text after 5 seconds
		setTimeout(() => {
			confirmSpan.style.display = 'none';
		}, 5000);
	} catch (error) {
		console.error(error);
	}
};

const writeLinkToPage = (url) => {
	// get elements
	const shareLinkInstructions = document.querySelector('#share-link-instructions');
	const shareLinkUrl = shareLinkInstructions.querySelector('#share-link-url');
	// populate url and display
	shareLinkUrl.value = url;
	shareLinkInstructions.style.display = 'inline';
	// highlight for convenience
	shareLinkUrl.focus();
	shareLinkUrl.select();
};

const parseQueryString = () => {
	// return memoized result
	if (parseQueryString.params) return parseQueryString.params;
	const urlSearchParams = new URLSearchParams(window.location.search);

	// turn into an array of key-value pairs
	const paramsArray = [...urlSearchParams];

	// add additional expanded keys
	paramsArray.forEach((paramPair) => {
		const expandedKey = specialMappings[paramPair[0]];
		if (expandedKey) {
			paramsArray.push([expandedKey, paramPair[1]]);
		}
	});

	// memoize result
	parseQueryString.params = Object.fromEntries(paramsArray);

	return parseQueryString.params;
};

export {
	createLink,
	parseQueryString,
};
