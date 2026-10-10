import { parseQueryString } from '../share.mjs';

const SETTINGS_KEY = 'Settings';

class Setting {
	constructor(shortName, name, type, defaultValue, changeAction, sticky, values) {
		// store values
		this.shortName = shortName;
		this.name = name;
		this.defaultValue = defaultValue;
		this.myValue = defaultValue;
		this.type = type ?? 'checkbox';
		this.sticky = sticky;
		this.values = values;
		// a default blank change function is provided
		this.changeAction = changeAction ?? (() => { });

		// get value from url
		const urlValue = parseQueryString()?.[`settings-${shortName}-${type}`];
		let urlState;
		if (type === 'checkbox' && urlValue !== undefined) {
			urlState = urlValue === 'true';
			this.myValue = urlState;
		}
		if (type === 'select' && urlValue !== undefined) {
			urlState = parseFloat(urlValue);
			this.myValue = urlState;
		}
		if (type === 'text' && urlValue !== undefined) {
			urlState = String(urlValue).trim();
			this.myValue = urlState;
		}

		// get existing value if present
		const storedValue = urlState ?? this.getFromLocalStorage();
		if (sticky && storedValue !== null) {
			this.myValue = storedValue;
		}

		// call the change function on startup
		switch (type) {
			case 'select':
				this.selectChange({ target: { value: this.myValue } });
				break;
			case 'text':
				this.textChange({ target: { value: this.myValue } });
				break;
			case 'checkbox':
			default:
				this.checkboxChange({ target: { checked: this.myValue } });
		}
	}

	generateSelect() {
		// create a radio button set in the selected displays area
		const label = document.createElement('label');
		label.for = `settings-${this.shortName}-select`;
		label.id = `settings-${this.shortName}-label`;

		const span = document.createElement('span');
		span.innerHTML = `${this.name} `;
		label.append(span);

		const select = document.createElement('select');
		select.id = `settings-${this.shortName}-select`;
		select.name = `settings-${this.shortName}-select`;
		select.addEventListener('change', (e) => this.selectChange(e));

		this.values.forEach(([value, text]) => {
			const option = document.createElement('option');
			option.value = value.toFixed(2);

			option.innerHTML = text;
			select.append(option);
		});
		label.append(select);

		this.element = label;

		// set the initial value
		this.selectHighlight(this.myValue);

		return label;
	}

	generateCheckbox() {
		// create a checkbox in the selected displays area
		const label = document.createElement('label');
		label.for = `settings-${this.shortName}-checkbox`;
		label.id = `settings-${this.shortName}-label`;
		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.value = true;
		checkbox.id = `settings-${this.shortName}-checkbox`;
		checkbox.name = `settings-${this.shortName}-checkbox`;
		checkbox.checked = this.myValue;
		checkbox.addEventListener('change', (e) => this.checkboxChange(e));
		const span = document.createElement('span');
		span.innerHTML = this.name;

		label.append(checkbox, span);

		this.element = label;

		return label;
	}

	// free text (for example an airport code): saved when the field loses focus or Enter is pressed
	generateText() {
		const label = document.createElement('label');
		label.for = `settings-${this.shortName}-text`;
		label.id = `settings-${this.shortName}-label`;
		const span = document.createElement('span');
		span.innerHTML = `${this.name} `;
		const input = document.createElement('input');
		input.type = 'text';
		input.id = `settings-${this.shortName}-text`;
		input.name = `settings-${this.shortName}-text`;
		input.value = this.myValue ?? '';
		if (this.values?.placeholder) input.placeholder = this.values.placeholder;
		if (this.values?.maxLength) input.maxLength = this.values.maxLength;
		input.addEventListener('change', (e) => this.textChange(e));
		label.append(span, input);
		this.element = label;
		return label;
	}

	textChange(e) {
		this.myValue = String(e.target.value ?? '').trim();
		this.storeToLocalStorage(this.myValue);
		this.changeAction(this.myValue);
	}

	checkboxChange(e) {
		// update the state
		this.myValue = e.target.checked;
		this.storeToLocalStorage(this.myValue);

		// call change action
		this.changeAction(this.myValue);
	}

	selectChange(e) {
		// update the value
		this.myValue = parseFloat(e.target.value);
		this.storeToLocalStorage(this.myValue);

		// call the change action
		this.changeAction(this.myValue);
	}

	storeToLocalStorage(value) {
		if (!this.sticky) return;
		const allSettingsString = localStorage?.getItem(SETTINGS_KEY) ?? '{}';
		const allSettings = JSON.parse(allSettingsString);
		allSettings[this.shortName] = value;
		localStorage?.setItem(SETTINGS_KEY, JSON.stringify(allSettings));
	}

	getFromLocalStorage() {
		const allSettings = localStorage?.getItem(SETTINGS_KEY);
		try {
			if (allSettings) {
				const storedValue = JSON.parse(allSettings)?.[this.shortName];
				if (storedValue !== undefined) {
					switch (this.type) {
						case 'boolean':
						case 'checkbox':
							return storedValue;
						case 'select':
						case 'text':
							return storedValue;
						default:
							return null;
					}
				}
			}
		} catch {
			return null;
		}
		return null;
	}

	get value() {
		return this.myValue;
	}

	set value(newValue) {
		// update the state
		this.myValue = newValue;
		switch (this.type) {
			case 'select':
				this.selectHighlight(newValue);
				break;
			case 'text':
				this.element.querySelector('input').value = newValue;
				break;
			case 'checkbox':
			default:
				this.element.checked = newValue;
		}
		this.storeToLocalStorage(this.myValue);

		// call change action
		this.changeAction(this.myValue);
	}

	selectHighlight(newValue) {
		// set the dropdown to the provided value
		this.element.querySelectorAll('option').forEach((elem) => {
			elem.selected = newValue.toFixed(2) === elem.value;
		});
	}

	generate() {
		switch (this.type) {
			case 'select':
				return this.generateSelect();
			case 'text':
				return this.generateText();
			case 'checkbox':
			default:
				return this.generateCheckbox();
		}
	}
}

export default Setting;
