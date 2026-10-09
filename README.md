# Sky Pit Wall

Weather, airport departures and a pit wall attitude on a TV. A personal fork of [WeatherStar 4000+ International](https://github.com/mwood77/ws4kp-international); see [Sky Pit Wall (this fork)](#sky-pit-wall-this-fork) below. The original README follows.

[![build-docker](https://github.com/mwood77/ws4kp-international/actions/workflows/build-docker.yaml/badge.svg)](https://github.com/mwood77/ws4kp-international/actions/workflows/build-docker.yaml)
[![pages-build-deployment](https://github.com/mwood77/ws4kp-international/actions/workflows/pages/pages-build-deployment/badge.svg)](https://github.com/mwood77/ws4kp-international/actions/workflows/pages/pages-build-deployment)

# WeatherStar 4000+ (International)

<div align="center"> 
    <img src="./overview.gif" alt="Weatherstar 4000+ International" width="600">
</div>

This project is a fork of [`ws4kp`](https://github.com/netbymatt/ws4kp) by [@netbymatt](https://github.com/netbymatt), which has been refactored to run on [Open Meteo's aggregated forecast API](https://open-meteo.com/en/docs). This means this fork of the `ws4kp` works for locations outside of the USA.

A live version of this project is available at https://mwood77.github.io/ws4kp-international

## Sky Pit Wall (this fork)

Sky Pit Wall is a personal fork of [mwood77/ws4kp-international](https://github.com/mwood77/ws4kp-international). It runs full screen on a 1080p TV from a Raspberry Pi 3 (DietPi, Chromium in kiosk mode, widescreen, 24-hour clock), with background music, for the Porto area in Portugal.

Live version: https://hmirpereira.github.io/Sky-Pit-Wall

### Screens

In rotation order, as configured on the TV:

| Screen | What it shows | Source |
|---|---|---|
| Hazards | IPMA warnings for the Porto district (in Portuguese); skipped when there are none | [IPMA](https://api.ipma.pt) |
| Current Conditions, Hourly Forecast, Hourly Graph, Extended Forecast, Almanac, Air Quality | As upstream | [Open-Meteo](https://open-meteo.com) |
| Travel Forecast | Frankfurt, Munich, Zurich, Geneva and Vienna | Open-Meteo |
| Local Radar | As upstream | [RainViewer](https://www.rainviewer.com) |
| Pollen | Daily pollen levels | Open-Meteo (CAMS) |
| Airport METAR | Porto (LPPR) METAR and TAF decoded into plain English | [metar.vatsim.net](https://metar.vatsim.net); TAF from [aviationweather.gov](https://aviationweather.gov) via the Raspberry Pi |
| Departures | Next departures from Porto for a configurable list of airlines (only on the Pi) | [AeroDataBox](https://aerodatabox.com) |
| Cancellations | Cancelled departures from Porto, all airlines (only on the Pi) | [AeroDataBox](https://aerodatabox.com) |
| Work Schedule | Shifts for the next 7 days and the next shift, with the weather at those times (only on the Pi) | Private spreadsheet |
| F1 Last Race | Podium and fastest lap of the latest Grand Prix or sprint | Jolpica F1 |
| F1 Grid | Starting order of the next sprint or race | Jolpica F1, [OpenF1](https://openf1.org) |
| F1 Drivers | Drivers' championship, scrolling through the whole field | [Jolpica F1](https://github.com/jolpica/jolpica-f1) |
| F1 Next Race | Track, details and countdown; weekend schedule and race forecast | Jolpica F1, [f1-circuits](https://github.com/bacinger/f1-circuits), Open-Meteo |

Latest Observations, Regional Forecast, Local Forecast, Marine Forecast and Personal Weather Station are left as upstream but switched off on the TV.

### New and reworked screens

- **Hazards**: warnings from IPMA (the Portuguese weather service) for the Porto district, kept in Portuguese on purpose, without accents (the Star4000 fonts have none). Only yellow, orange and red warnings; the screen is skipped when there are none. In widescreen the warning colour fills the whole width.
- **Airport METAR**: LPPR METAR decoded into plain English (wind, visibility, weather, clouds, temperature, humidity, pressure, trend). Busy reports are split into pages; the raw report is shown when there is room. When the page runs on the Raspberry Pi, the LPPR TAF follows on its own pages: issue time, then each change group (Becoming, Temporary, Prob 30%, From) with its period in Portuguese time and its conditions (the raw TAF is not shown). aviationweather.gov does not accept browser requests, so the TAF is fetched by the `skypitwall-voos` service on the Pi and read from `http://127.0.0.1:8095/taf.json`; anywhere else the TAF pages are simply left out.
- **Pollen**: daily average from Open-Meteo / CAMS (Europe only), with US National Allergy Bureau levels as a guide.
- **Travel Forecast**: one Open-Meteo request for the cities in `TRAVEL_CITIES` (`travelforecast.mjs`); after 18:00 it shows tomorrow.
- **Departures** (off by default): next departures from Porto for the airlines set on the Pi, with an airline tail icon, estimated time and status (ON TIME, DELAYED, CANCELLED, or SCHEDULED when there is no live data). Codeshares are left out; a delay counts from 15 minutes. The data comes from a small service on the Raspberry Pi (`skypitwall-voos`, not in this repository) that calls the AeroDataBox FIDS API with a private key, spreads the monthly quota over the days left, and serves `http://127.0.0.1:8095/flights.json`. Chromium on the Pi allows the site to read it through the `LocalNetworkAccessAllowedForUrls` and `LoopbackNetworkAllowedForUrls` policies. Anywhere else the screen is skipped.
- **Cancellations** (off by default): today's cancelled departures from Porto, all airlines: flight, destination and scheduled time (a `?` marks a cancellation AeroDataBox is not sure about). It uses the same API responses as Departures, so there are no extra calls: the list is refreshed only when the service calls the API for the Departures screen, and the footer shows when that was. Served at `http://127.0.0.1:8095/cancelled.json`; the screen is skipped when there are no cancellations or off the Pi.
- **Work Schedule** (off by default): two pages. Page 1: shifts for the next 7 days (day, shift code, start and end, or Day off) with the weather icon and temperature at the start of each shift; today's shift leaves the list once it has ended. Page 2: the next shift (or the current one) with a countdown and the weather at the start and at the end (Open-Meteo hourly forecast, kept for an hour). A job on the Pi (`skypitwall-horario`, not in this repository) copies a private schedule spreadsheet from cloud storage every hour with a read-only rclone remote and turns it into JSON, served at `http://127.0.0.1:8095/schedule.json`. The schedule never leaves the Pi; anywhere else the screen is skipped.
- **F1 Last Race**: the latest Grand Prix or sprint ("F1 Last Sprint") with its flag and date, a podium with team icons, race time for the winner and gaps for 2nd and 3rd, and the fastest lap.
- **F1 Grid**: the starting order of the next sprint or race in two staggered columns, like a real grid, scrolling through the field. It is the qualifying classification, so grid penalties are not included. Pole shows its lap time and the others the gap to it, from the last part of qualifying each driver reached ("No time" if they set none there). Race grid from Jolpica F1 (qualifying); sprint grid from Jolpica F1's alpha API (sprint qualifying), with OpenF1 as a backup. Team icons come from the car number.
- **F1 weekend timing** (`utils/f1-weekend.mjs`): the two screens take turns. After sprint qualifying: sprint grid until the sprint; after the sprint: sprint result until qualifying; after qualifying: race grid until the race; after the race: race result until the next weekend starts. Results are asked for shortly after each session, then every 20 minutes until they appear, and once more at the next F1 update time to catch penalties. The season schedule is downloaded once a day.
- **F1 Drivers**: the whole drivers' championship, 7 rows at a time, scrolling like the Travel Forecast, with a team icon per driver. Each driver's current team comes from the latest race (the standings list every team a driver raced for, in no particular order).
- **F1 Next Race**: page 1 has the track outline, Grand Prix, circuit, place with an 8-bit flag, track length, date and countdown; page 2 has the weekend schedule in Portuguese time and the forecast at the circuit for the start of the race (from 15 days before). Outlines for the 2026 circuits plus Portimão, Istanbul Park and Bahrain (2027) are in `utils/f1-circuits.mjs`. Long circuit names are shrunk to fit, and accents are removed because the Star4000 fonts draw accented letters blank (also in F1 Drivers and Cancellations).
- **Pi warnings**: when something on the Pi stops updating (flight data refused or failing, flight quota low, TAF or work schedule stale), its screen is simply skipped, so the bottom line adds a red warning such as `Schedule stale since Tue 14:07` (`utils/pi-health.mjs`, from `http://127.0.0.1:8095/health.json`, checked every 5 minutes). Nothing is shown when all is well or off the Pi.
- **F1 update rule**: F1 Drivers and F1 Next Race download their data once a day from Friday to Monday after 22:00 (Lisbon) and keep it in `localStorage` the rest of the week (`utils/f1-update.mjs`). Monday catches races in the Americas, which end late on Sunday in Portugal.

### Look and feel

- **Name and logo**: the site is called Sky Pit Wall (title, loading and progress screens, manifest). The header logo is `images/skypitwalllogo.png`, shown at the size of the original logo; the original `Logo3.png` is kept.
- **F1 screens in red and black**: recoloured copies of the WeatherStar backgrounds (`BackGround1_1_f1.png`, `BackGround1_1_wide_f1.png`) and colours in `_f1-theme.scss`. Colours only; no Formula 1 marks.
- **Aviation screens in navy and silver** (Airport METAR/TAF, Departures, Cancellations, Work Schedule): recoloured copies of the WeatherStar backgrounds (`BackGround1_1_aviation.png`, `BackGround1_1_wide_aviation.png`) with a silver to steel blue title band, navy rows, light blue labels and yellow flight numbers. Colours in `_aviation-theme.scss`. Colours only; no airline marks.
- **Icons**: `images/airlines/<IATA code>.png` (airline tails) and `images/teams/<constructorId>.png` (F1 teams), 128 x 128 PNG with a transparent background, drawn by the owner of this fork. `images/flags/<country>.png` are 24 x 16 pixel flags scaled up without smoothing. A missing icon or flag is simply not shown.

### Fixes

- Auto refresh never started when a display stayed in "loading" (e.g. Hazards) or after a failed data request.
- The Hazards screen was never hidden, which stalled the rotation as soon as there was a warning.
- "Last Update" always showed "(none)".
- Missing weather icons: fog, freezing drizzle and rain, hail and violent rain showers.
- Times follow the "Hours Format" setting everywhere (Hourly Forecast, Almanac, Radar, Local Forecast text).
- The GPS (current location) button still expected a reply from the US weather service (NOAA) and stalled; it now turns the coordinates into a place name (ArcGIS reverse geocoding) and asks to type a city when the browser gives no position.
- The menu button with no location chosen drew the progress screen under the start screen; it now focuses the search box.
- METAR to weather code conversion for personal weather stations (test order and codes).
- Webamp pinned to a fixed version instead of `@next`; image preloads resolve relative to the page.

### Updating the live site

Edit the sources, run `npm run build:css` and `npm run build`, and commit the `docs/` folder together with the sources. GitHub Pages serves `docs/` from `main`. The Pi only loads new code when Chromium restarts.

To replace an icon, flag or the logo without building, put the new file with the same name in both `server/images/...` and `docs/images/...` (otherwise the next build brings the old one back). GitHub Pages lets browsers cache images for 10 minutes.

### Credits

- Based on [WeatherStar 4000+ International](https://github.com/mwood77/ws4kp-international) by [@mwood77](https://github.com/mwood77) and [ws4kp](https://github.com/netbymatt/ws4kp) by [@netbymatt](https://github.com/netbymatt) (MIT License).
- Track outlines from [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits), MIT License, Copyright (c) 2019-2025 Tomislav Bacinger.
- Data: Open-Meteo, IPMA, RainViewer, metar.vatsim.net, Jolpica F1, AeroDataBox.
- Personal, non-commercial project. Not affiliated with The Weather Channel, Formula 1, the FIA, the Lufthansa Group or any team or airline; their names and marks belong to their owners.

## About

This project aims to bring back the feel of the 90's with a weather forecast that has the look and feel of The Weather Channel at that time but available in a modern way. 

This is by no means intended to be a perfect emulation of the WeatherStar 4000, the hardware that produced those wonderful blue and orange graphics you saw during the local forecast on The Weather Channel. If you would like a much more accurate project please see the [WS4000 Simulator](http://www.taiganet.com/). 

Instead, this project intends to create a simple to use interface with minimal configuration fuss. Some changes have been made to the screens available because either more or less forecast information is available today than was in the 90's. Most of these changes are captured in sections below.

## Acknowledgements

This project is based on the work of [Mike Battaglia](https://github.com/vbguyny/ws4kp) and [@netbymatt](https://github.com/netbymatt). This internationalized version was forked in February 2025.

* Mike Battaglia for the original project and all of the code which draws the weather displays. This code remains largely intact and was a huge amount of work to get exactly right. He's also responsible for all of the background graphics including the maps used in the application.
* The team at [TWCClassics](https://twcclassics.com/) for several resources.
	* A [font](https://twcclassics.com/downloads.html) set used on the original WeatherStar 4000
	* [Icon](https://twcclassics.com/downloads.html) sets
	* Countless photos and videos of WeatherStar 4000 forecasts used as references.
* [@netbymatt](https://github.com/netbymatt) for modernizing & module'ing Mike's original project. 

## Architecture

The original authors of this project tried to use as few libraries (and external dependencies) as possible - I'm trying my best to continue in this manner where applicable.

However, some compromises were made while porting this to a different data providers. NOAA was replaced as the sole data provider, with the following:
- Open Meteo
	- General forecast: https://open-meteo.com/en/docs
	- Marine forecast: https://open-meteo.com/en/docs/marine-weather-api
	- Air Quality: https://open-meteo.com/en/docs/air-quality-api
	- Geocoding: https://open-meteo.com/en/docs/geocoding-api
- Wikipedia API and Wikidata Sparql API
	- [Used for unconventional reverse-geocoding-like lookups](https://github.com/mwood77/ws4kp-international/blob/main/server/scripts/modules/utils/nearby-cities.mjs). It's actually a knowledge graph lookup, but we're splitting hairs here.
- Rainviewer API for radar precipitation (this may change):
	- https://www.rainviewer.com/api.html
- ArcGIS by Esri for leaflet map tiles:
	- https://www.arcgis.com/index.html

The project architecture is MVC-like, where views (`~/views/`) are separated from logic handlers (`~/server/scripts/modules/`
), but there is no distinct flow-control logic. I hope to rectify this in the future.

The closest flow control is handled in these files:
- Entry point is: 
	- https://github.com/mwood77/ws4kp-international/blob/main/server/scripts/index.mjs
- A majority of the local storage manipulation is handled [here](https://github.com/mwood77/ws4kp-international/blob/7c13654b32f639e9c24c057ac1948b194d3f2aa4/server/scripts/index.mjs#L84-L146), but there are some outliers. This mostly pertains to Query Param handling, which needs a refactor. [See this issue](https://github.com/mwood77/ws4kp-international/issues/55)
- Core forecast information is retrieved here: 
	- https://github.com/mwood77/ws4kp-international/blob/main/server/scripts/modules/utils/weather.mjs
- Global settings are instantiated here: 
	- https://github.com/mwood77/ws4kp-international/blob/main/server/scripts/modules/settings.mjs
- Base `Setting` class handles initialization and individual (local) storage: 
	- https://github.com/mwood77/ws4kp-international/blob/main/server/scripts/modules/utils/setting.mjs

Formatted weather data is passed into each "view controller" through their constructor as `_weatherParameters` (in getData(...)), and generally assigned to `this.weatherParameters` or `this.data` (depends on who authored the module). This data object looks like:

```js
// Example data for Tokyo

{
    "latitude": 35.6894,
    "longitude": 139.6917,
    "city": "Tokyo",
    "state": "Tokyo",
    "country": "Japan",
    "timeZone": "Asia/Tokyo",
    "forecast": {
        "2025-07-09": {	// Day
            "hours": [
				...
				// Data points per hour
			],
			// All parent values beneath are "daily" values, which were average from the "hours" array
            "temperature_2m": 28.64583333333333,
            "relative_humidity_2m": 78.79166666666667,
            "dew_point_2m": 24.424999999999994,
            "apparent_temperature": 34.400000000000006,
            "precipitation_probability": 0,
            "precipitation": 0,
            "rain": 0,
            "showers": 0,
            "snowfall": 0,
            "snow_depth": 0,
            "weather_code": "0",
            "pressure_msl": 1010.9916666666668,
            "surface_pressure": 1006.4291666666668,
            "cloud_cover": 8.083333333333334,
            "visibility": 24140,
            "evapotranspiration": 0.07541666666666667,
            "et0_fao_evapotranspiration": 0.2233333333333333,
            "vapour_pressure_deficit": 0.8979166666666667,
            "uv_index": 2.672916666666667,
            "uv_index_clear_sky": 2.672916666666667,
            "is_day": 0.5833333333333334,
            "sunshine_duration": 1849.0775,
            "wet_bulb_temperature_2m": 25.545833333333334,
            "wind_speed_10m": 6.379166666666666,
            "wind_direction_10m": 181.25,
            "wind_gusts_10m": 32.074999999999996,
            "temperature_2m_max": 32.5,
            "temperature_2m_min": 25.5,
            "uv_index_max": 8.35
        }
    },
    "stationId": "stationId-dont-matter-anymore",
    "zoneId": "zoneId-dont-matter",
    "radarId": "radarId-dont-matter",
    "weatherOffice": "weatherOffice-dont-matter",
    "Temperature": 30,
    "TemperatureUnit": "C",
    "DewPoint": 24.2,
    "Ceiling": 0.39,
    "CeilingUnit": "km",
    "Visibility": 24.14,
    "VisibilityUnit": "km",
    "WindSpeed": 8.7,
    "WindDirection": "S",
    "Pressure": 1010.1,
    "CloudCover": 11,
    "UV": 8,
    "WindGust": 46.8,
    "WindUnit": "km/h",
    "Humidity": 71,
    "PressureUnit": "hPa",
    "PressureDirection": "steady",
    "TextConditions": 0,
    "nearbyCities": [
        {
            "city": "Tokyo",
            "lat": "35.683889",
            "lon": "139.774444",
            "population": "9640742"
        },
        {
            "city": "Yokohama",
            "lat": "35.433333333",
            "lon": "139.65",
            "population": "3757630"
        },
        {
            "city": "Osaka",
            "lat": "34.69375",
            "lon": "135.502111111",
            "population": "2751862"
        },
        {
            "city": "Nagoya",
            "lat": "35.181388888",
            "lon": "136.906388888",
            "population": "2326844"
        }
    ]
}
```

Lastly, `ws4kp-international` utilizes a customized instance of [`cors-anywhere`](https://github.com/Rob--W/cors-anywhere) to manage CORS on some APIs. This instance of `cors-anywhere` is owned and managed by me (@mwood77), and is only available to this project. It does not collect any personally identifiable information (PII) and can only interact with the Wikidata API. Features that use this proxy are not enabled by default - the proxy is only utilized when "**Experimental Features**" are enabled.

## Run Your WeatherStar
There are a lot of CORS considerations and issues with api.weather.gov that are easiest to deal with by running a local server to see this in action (or use the live link above). You'll need Node.js >12.0 to run the local server.

### To run via Node locally:
```
git clone https://github.com/mwood77/ws4kp-international.git
cd ws4kp
npm i
npm run start
```

### To run via Docker: 
```
docker run -p 8080:8080 ghcr.io/mwood77/ws4kp-international
```

After running this project in either way, pen your web browser: 
- http://localhost:8080/ 

### Deployment
#### GitHub Pages

`ws4kp-international`'s main "showcase" is a deployed instance via GitHub Pages. To prepare a new release run the following command:

```
# Mac & Linux users
npm run build

# Windows users
npm run build:win
```

This will update the artifacts in the `/docs` folder. Simply commit them as part of your branch, and push them to remote. Deployment will be handled automatically when your PR is merged into `main`.

#### Docker Image
This is handled automatically as part of CI/CD, when your code is merged to `main`.

## Updates in 12.0.0

- Introduces personal weather station data
    - You can now display data from your own weather station.
    - `ws4kp-international` supports the following ingestion "standards:"
        - Weather Underground's [Personal Weather Station upload protocol](https://support.weather.com/s/article/PWS-Upload-Protocol?language=en_US)
            - This interface expects the incoming data to be in ***imperial*** units.
            - The ingestion point is located at:
                ```shell
                GET <YOUR-HOST>/v1/pws

                # Example request
                GET localhost:8080/v1/pws?ID=ASTATIONID&PASSWORD=notarealpassword&dateutc=2025-10-19T12:00:00Z&winddir=264&windspeedmph=12&windgustmph=5&windgustdir=264&humidity=43&dewptf=66&tempf=87&weather=RA&UV=2&visibility=40&baromin=30
                ```

## Updates in 11.0.0

- Reintroduces Radar screen
- Introduces ***Experimental Features***
	- If this is enabled and data is present, cascading features ~~will~~ may appear across different displays; ex, additional city AQI values on the Air Quality Index Forecast and Radar Screen.
#### Under the hood
- Nearby cities lookup; this is a new query, which gets national city data (top populous cities) when enabled.
	- However this is a very slow query and somewhat unreliable (can take 2-5 seconds to resolve on location change). This data is written to localStorage once retrieved, and removed when "Experimental Features" is disabled.

## Updates in 10.0.0

- Air Quality Index Forecast powered by [Open Meteo's Air Quality API](https://open-meteo.com/en/docs/air-quality-api)

## Updates in 9.0.0

>[!IMPORTANT]
> The Marine Forecast (and this site in general) **should not** be used in life threatening weather situations, or be relied on to inform the public of such situations. It is your responsibility to check your local forecast and make an informed decision. See [Disclaimer](#disclaimer)

- Marine Forecast powered by [Open Meteo's Marine API](https://open-meteo.com/en/docs/marine-weather-api)

## Updates in 8.0.0
- Introduces [Webamp](https://github.com/captbaritone/webamp)
	- Music is streamed from the Internet Archive and the playlist is a chunk of [*Weatherscan Music: The TRUE Complete Collection*](https://archive.org/details/weatherscancompletecollection/01+Fair+Weather.mp3)
- Time is now configurable between 12-hour and 24-hour formats
- Hourly forecast is now retrieved using timezone instead of toISOString
- Scan lines
- Pressure in mmHg added
- Wipe reveal effect added to scrolling conditions

## Updates in 7.0.0
- Weather units are now customizable. These are broken down by category, which are:
	- Wind Units: `m/s`, `km/h`, `knots`, `mph`
	- Temperature Units: `C`, `F`, `K`
	- Distance Units: `km`, `mi`, `ft`, `meters`, `bananas`
	- Pressure Units: `hpa`, `inHg`
- Added new fields to the **Current Conditions** screen:
	- Cloud Cover: `_%`
	- UV Index: `0 -> 11`
- Changed **Hourly Graph**'s time scale to use 24 hours instead of 12 hour cycle
- Converted all compatible views to render correct values based on user's unit selection
- Corrected an incorrect calculation of **Current Conditions** cloud cover value
- Corrected an incorrect calculation of **Current Conditions** ceiling and visibility values

## Updates in 6.0.0 (Internationalization w/ Open Meteo)
This is a significant divergence from 5.0.0 and is exclusive to this fork.

This migrates the project away from NOAA's USA exclusive weather API to [Open Meteo's global weather API](https://open-meteo.com/en/docs). This means that _this fork_ is capable of rendering weather data across the globe.

However, there are some caveats. Migrating to Open Meteo means that there is some loss of functionality, namely the loss of radar imagery, and observation station data, and hazards. This means that the following screens are no longer functional:
- Hazards
- Latest Observations
- Travel Forecast
- Regional Forecast
- ~~Local Radar~~

## Updates in 5.0.0
The change to 5.0 changes from drawing the weather graphics on canvas elements and instead uses HTML and CSS to style all of the weather graphics. A lot of other changes and fixes were implemented at the same time.

* Replace all canvas elements with HTML and CSS
* City and airport names are better parsed to fit the available space
* Remove the dependency on libgif-js
* Use browser for text wrapping where necessary
* Some new weather icons
* Refresh only on slideshow repeat
* Removed Almanac 30-day outlook
* Fixed startup issue when current conditions are unavailable

### Why the fork (pre 5.0.0)?

The fork is a result of wanting a more manageable, modern code base to work with. Part of it is an exercise in my education in JavaScript. There are several technical changes that were made behind the scenes.

* Make use of the new API available at https://api.weather.gov ([documentation](https://www.weather.gov/documentation/services-web-api)). This caused the removal of some of the original WeatherStar 4000 displays, and allowed for new displays to be created.
* Changed code to make extensive use of ES6 functionality including:
	* Arrow functions
	* Promises
	* Async/await and parallel loading of all forecast resources
	* Classes
* Common code base for each display through use of classes
* Separation between weather display code and user interface
* Use of a modern date parsing library [luxon](https://moment.github.io/luxon/)
* Attempt to remove the need for a local server to bypass [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) issues with the various APIs used. This is almost workable but there are still some minor CORS issues with https://api.weather.gov.
	* The necessary CORS pass through URLs have been rewritten so they can be deployed on Node.js using the included server or through S3/Cloudfront in a serverless environment.
* Proper settings for static resource caching
* Build system integration to reduce the number of scripts that need to be loaded

### What's different

I've made several changes to this Weather Star 4000 simulation compared to the original hardware unit and the code that this was forked from.

* Radar displays the timestamp of the image.
* A new hour-by-hour graph of the temperature, cloud cover and precipitation chances for the next 24 hours.
* A new hourly forecast display for the next 24 hours is available, and is shown in the style of the travel cities forecast. (off by default because it duplicates the hourly graph)
* The "Local Forecast" and "Extended Forecast" provide several additional days of information compared to the original format in the 90's.
* Narration was removed. In the original code narration made use of the computer's local text-to-speech engine which didn't sound great.
* Music was removed. I don't want to deal with copyright issues and hosting MP3s. If you're looking for the music that played during forecasts please visit [TWCClassics](https://twcclassics.com/audio/).
* Marine forecast (tides) is not available as it is not part of the new API.
* The nearby cities displayed on screens such as "Latest Observations" and "Regional Forecast" are likely not the same as they were in the 90's. The weather monitoring equipment at these stations move over time for one reason or another, and coming up with a simple formulaic way of finding nearby stations is sufficient to give the same look-and-feel as the original.
* "Flavors" are not present in this simulation. Flavors refer to the order of the weather information that was shown on the original units. Instead, the order of the displays has been fixed and a checkboxes can be used to turn on and off individual displays. The travel forecast has been defaulted to off so only local information shows for new users.

## Sharing a permalink (bookmarking)
Selected displays, the forecast city and widescreen setting are sticky from one session to the next. However if you would like to share your exact configuration or bookmark it click the "Copy Permalink" (or get "Get Parmalink") near the bottom of the page. A URL will be copied to your clipboard with all of you selected displays and location (or copy it from the page if your browser doesn't support clipboard transfers directly). You can then share this link or add it to your bookmarks.

## Kiosk mode
Kiosk mode can be activated by a checkbox on the page. Note that there is no way out of kiosk mode (except refresh or closing the browser), and the play/pause and other controls will not be available. This is deliberate as a browser's kiosk mode it intended not to be exited or significantly modified.

It's also possible to enter kiosk mode using a permalink. First generate a [Permalink](#sharing-a-permalink-bookmarking), then to the end of it add `&kiosk=true`. Opening this link will load all of the selected displays included in the Permalink, enter kiosk mode immediately upon loading and start playing the forecast.

## Wish list (Feature Requests)

If you think a feature is missing, please add a feature request here:
- https://github.com/mwood77/ws4kp-international/issues

## Community Notes

Thanks to the WeatherStar community for providing these discussions to further extend your retro forecasts!

* [Stream as FFMPEG](https://github.com/netbymatt/ws4kp/issues/37#issuecomment-2008491948)

<!-- ## Customization
A hook is provided as `/server/scripts/custom.js` to allow customizations to your own fork of this project, without accidentally pushing your customizations back upstream to the git repository. An sample file is provided at `/server/scripts/custom.sample.js` and should be renamed to `custom.js` activate it. -->

## Issue reporting and feature requests
Found a bug? Please report it here:
- https://github.com/mwood77/ws4kp-international/issues

## Disclaimer

This web site should NOT be used in life threatening weather situations, or be relied on to inform the public of such situations. The Internet is an unreliable network subject to server and network outages and by nature is not suitable for such mission critical use. If you require such access to NWS data, please consider one of their subscription services. The authors of this web site shall not be held liable in the event of injury, death or property damage that occur as a result of disregarding this warning.

The WeatherSTAR 4000 unit and technology is owned by The Weather Channel. This web site is a free, non-profit work by fans. All of the back ground graphics of this web site were created from scratch.  The icons were created by Charles Abel and Nick Smith (http://twcclassics.com/downloads/icons.html) as well as by Malek Masoud.  The fonts were originally created by Nick Smith (http://twcclassics.com/downloads/fonts.html).

