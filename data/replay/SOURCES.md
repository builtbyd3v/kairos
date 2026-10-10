# Replay fixture sources

- Site: St. Lucie Nuclear Power Plant, Hutchinson Island, FL, at 27.3486, -80.2464 (Wikipedia: 27.34861111, -80.24638889).
- NWS grid for the site: MLB 75,21, from api.weather.gov/points. County is FLC111 and forecast zone is FLZ159.
- 2025-05-05 is a strong day for this site. Polygon MLB SV.W #32 contained the plant from 16:57 to 17:27 EDT. FPR measured a 51 kt gust, and 2.0 in hail fell 13 km away.
- `kit-rounds-weather.json` uses Open-Meteo reanalysis for Sep 1-10 2026. No St. Lucie County alert was active at any mission start.
- Reanalysis has no thunder codes, so `thunderPct` is 0 for every kit step.

Retrieved 2026-10-10, 06:51Z to 07:10Z. The build scripts (`fix1.py`, `fix2.py`; Python stdlib, `python3 -I`) are in the session scratchpad, not the repo.

## Site

| Data | Source |
|---|---|
| Coordinates | https://en.wikipedia.org/w/api.php?action=query&prop=coordinates&titles=St._Lucie_Nuclear_Power_Plant&format=json, which returns 27.34861111, -80.24638889. Rounded to 4 decimals. |
| `nwsGrid` | https://api.weather.gov/points/27.3486,-80.2464 returns gridId MLB, gridX 75, gridY 21, county FLC111, zone FLZ159. |

## Fixture 1: storm-2025-05-05.json

| Data | Source | Notes |
|---|---|---|
| Alerts | IEM VTEC CSV: https://mesonet.agron.iastate.edu/cgi-bin/request/gis/watchwarn.py?accept=csv&sts=2025-05-05T04:00Z&ets=2025-05-06T04:00Z&location_group=states&states=FL&phenomena=SV&significance=W | IEM ignored the phenomena filter, so the file holds every FL product (SV, FA, MA). Only rows with `ugc=FLC111` are kept. There were no FF warnings, TO warnings, or TO watches in FL that day. |
| Polygons | https://mesonet.agron.iastate.edu/geojson/sbw.geojson?sts=2025-05-05T12:00Z&ets=2025-05-06T04:00Z | One issuance polygon per event, tested with a ray-cast point-in-polygon check. |
| Weather steps | IEM ASOS 1-minute FPR: https://mesonet.agron.iastate.edu/cgi-bin/request/asos1min.py?station=FPR&vars=tmpf&vars=gust_sknt&vars=precip&sts=2025-05-05T15:00Z&ets=2025-05-06T01:00Z&sample=1min&what=download&delim=comma&tz=UTC | FPR is 21 km NW of the plant, on the mainland. The file has 600 rows; 12 have a missing field. |
| Thunder codes | IEM ASOS FPR METAR and specials: https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=FPR&data=tmpc&data=sknt&data=gust&data=p01m&data=wxcodes&year1=2025&month1=5&day1=5&year2=2025&month2=5&day2=6&tz=America/New_York&format=onlycomma&latlon=yes&missing=null&trace=0.0001&direct=no&report_type=3&report_type=4 | The 5-minute HFMETAR (`report_type=1`) is also read. |
| Hail | NCEI Storm Events: https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/StormEvents_details-ftp_v1.0_d2025_c20260819.csv.gz | Times are EST-5 and are converted to EDT. The event used is 1243422: 2.0 in hail at Ft Pierce Beach, 16:00 EST (17:00 EDT), 12.9 km from the plant. |

Polygon findings (plant point):

| Product | Time (EDT) | Lists FLC111 | Polygon | `coversSite` |
|---|---|---|---|---|
| MLB SV.A #224 (watch) | 14:15 to 21:00 | yes | county-wide | true |
| MLB SV.W #31 | 16:19 to 17:00 | yes | misses the plant by 0.2 km | false |
| MLB SV.W #32 | 16:57 to 17:27 (cancelled early) | yes | contains the plant | true |
| MLB SV.W #30 | 15:37 to 16:15 | no | 23.9 km away | not listed |

Mapping:
- Each step covers the 15 minutes that end at the step time.
- `precipMmPerHour` = mean 1-min precip (in) x 25.4 x 60. Precip resolution is 0.01 in/min, so values move in steps of about 1 mm/h.
- `gustKmh` = max 1-min `gust_sknt` x 1.852. The peak is 94.5 km/h (51 kt) at 19:00. NCEI records a 51 kt measured gust at FPR at 18:56 EDT.
- `tempC` = the last 1-min `tmpf` in the block, converted to C.
- `thunderPct` = 100 if an FPR METAR or HFMETAR in the block reports TS or VCTS, or an SV warning with `coversSite: true` is active. Otherwise it is null, which means unknown. It is a presence flag, not a probability.
- `coversSite` = true if the storm polygon contains the plant, or if the product is county-wide for FLC111. The app treats only these alerts as in effect, the same as `api.weather.gov/alerts/active?point=`.

## Fixture 2: kit-rounds-weather.json

| Data | Source | Notes |
|---|---|---|
| Missions | `data/kit/missions.csv` | 27 missions. Start times are read as EDT. |
| Hourly weather | https://archive-api.open-meteo.com/v1/archive?latitude=27.3486&longitude=-80.2464&start_date=2026-09-01&end_date=2026-09-10&hourly=precipitation,temperature_2m,wind_gusts_10m,weather_code&timezone=America/New_York&wind_speed_unit=kmh | Model is `best_match` (ERA5 / ERA5-Land). The grid cell is 27.311, -80.257, 4.3 km from the plant. 240 hours, no nulls. |
| Alerts | https://mesonet.agron.iastate.edu/cgi-bin/request/gis/watchwarn.py?accept=csv&sts=2026-09-01T04:00Z&ets=2026-09-11T04:00Z&location_group=states&states=FL | FLC111 rows: FA.Y #95, #96, #102 and SV.W #117 (2026-09-07 14:43 to 14:59 EDT). None was active at a mission start, so every `alerts` list is empty. |

Mapping:
- `precipMmPerHour` = `precipitation` for the hour that ends at the step.
- `gustKmh` = `wind_gusts_10m`.
- `tempC` = `temperature_2m`.
- `thunderPct` = 100 if `weather_code` >= 95, else 0. The codes seen are 0-3, 51, 53, 55, 61, 63, so the value is always 0.
