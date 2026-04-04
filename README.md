# MMM-GAA

A [MagicMirror²](https://magicmirror.builders/) module that displays GAA fixtures and results – inter-county, senior club, and your home club.

Designed for county board sites that use the common GAA WordPress fixtures/results theme. Compatibility may vary by site.

## Features

- **Three feeds** on one widget: inter-county team, senior club, and your home club
- **Hurling and/or football** – configurable per county
- Scores in GAA goals-points format with calculated totals
- Winning teams bolded, your club highlighted in colour
- Smart date filtering: recent results and near-future fixtures
- Configurable sponsor name stripping from competition names
- Resilient fetching: each feed fails independently and falls back to cached data
- Compact stacked layout designed for MagicMirror displays

## Installation

```bash
cd ~/MagicMirror/modules
git clone https://github.com/frankrenehan/MMM-GAA.git
cd MMM-GAA
npm install
```

## Configuration

Add to your `config/config.js` modules array:

```js
{
  module: "MMM-GAA",
  position: "top_right",
  config: {
    countyBoardID: 15,
    countyName: "Kilkenny",
    sport: "hurling",
    clubSlug: "fenians",
    clubDisplayName: "Fenians",
    highlightClub: "Fenians",
  }
},
```

### Config Options

| Option | Default | Description |
|--------|---------|-------------|
| `countyBoardID` | `15` | County board ID (see table below) |
| `countyName` | `"Kilkenny"` | County name for header and team filtering |
| `siteUrl` | `"https://kilkennygaa.ie"` | County board website URL |
| `logoUrl` | Kilkenny crest | URL to county crest image (set to `""` to hide) |
| `sport` | `"hurling"` | `"hurling"`, `"football"`, or `"all"` |
| `clubSlug` | `"fenians"` | Your club's URL slug from the county site |
| `clubDisplayName` | `"Fenians"` | Section header for your club |
| `highlightClub` | `"Fenians"` | Club name to highlight |
| `showCounty` | `true` | Show inter-county team section |
| `resultsDays` | `7` | Show results from the last N days |
| `fixturesDays` | `14` | Show fixtures for the next N days |
| `updateInterval` | `1800000` | Refresh interval in ms (default 30 min) |
| `maxCountyFixtures` | `3` | Max county fixtures shown |
| `maxCountyResults` | `2` | Max county results shown |
| `maxSeniorFixtures` | `4` | Max senior club fixtures shown |
| `maxSeniorResults` | `2` | Max senior club results shown |
| `maxClubFixtures` | `4` | Max home club fixtures shown |
| `maxClubResults` | `2` | Max home club results shown |
| `showVenue` | `true` | Show venue beneath each match |
| `showCompetition` | `true` | Show competition name |
| `sponsorPatterns` | Kilkenny defaults | Array of regex strings to strip from competition names (see below) |

### County Board IDs

Counties are numbered alphabetically 1–32:

| ID | County | ID | County | ID | County | ID | County |
|----|--------|----|--------|----|--------|----|--------|
| 1 | Antrim | 9 | Down | 17 | Leitrim | 25 | Roscommon |
| 2 | Armagh | 10 | Dublin | 18 | Limerick | 26 | Sligo |
| 3 | Carlow | 11 | Fermanagh | 19 | Longford | 27 | Tipperary |
| 4 | Cavan | 12 | Galway | 20 | Louth | 28 | Tyrone |
| 5 | Clare | 13 | Kerry | 21 | Mayo | 29 | Waterford |
| 6 | Cork | 14 | Kildare | 22 | Meath | 30 | Westmeath |
| 7 | Derry | 15 | Kilkenny | 23 | Monaghan | 31 | Wexford |
| 8 | Donegal | 16 | Laois | 24 | Offaly | 32 | Wicklow |

> **Note:** IDs are alphabetical 1–32. Verify against your county board's website if unsure.

### Example Configurations

**Kilkenny hurling:**
```js
{
  countyBoardID: 15,
  countyName: "Kilkenny",
  siteUrl: "https://kilkennygaa.ie",
  sport: "hurling",
  clubSlug: "fenians",
  clubDisplayName: "Fenians",
  highlightClub: "Fenians",
}
```

**Dublin football:**
```js
{
  countyBoardID: 10,
  countyName: "Dublin",
  siteUrl: "https://dublingaa.ie",
  sport: "football",
  clubSlug: "kilmacud-crokes",
  clubDisplayName: "Kilmacud Crokes",
  highlightClub: "Kilmacud Crokes",
}
```

**Tipperary – both sports:**
```js
{
  countyBoardID: 27,
  countyName: "Tipperary",
  siteUrl: "https://tipperary.gaa.ie",
  sport: "all",
  clubSlug: "thurles-sarsfields",
  clubDisplayName: "Thurles Sarsfields",
  highlightClub: "Thurles Sarsfields",
}
```

### Sponsor Patterns

Competition names on GAA sites often include sponsor prefixes (e.g. "Allianz Hurling League"). The module strips these for cleaner display. The default patterns cover common Kilkenny sponsors.

To add your county's sponsors, set `sponsorPatterns` to an array of regex strings:

```js
{
  sponsorPatterns: [
    "SuperValu\\s*",
    "Bord\\s*Gáis\\s*Energy\\s*",
    "EirGrid\\s*",
  ]
}
```

Each pattern is applied case-insensitively. Structural cleanup (round numbers, "FOD", province prefixes, truncation) is always applied regardless of sponsor patterns.

### Finding Your Club Slug

Visit your county board's website and find the clubs section. The URL slug is what you need:
- `kilkennygaa.ie/clubs/fenians/` → `"fenians"`
- `kilkennygaa.ie/clubs/danesfort/` → `"danesfort"`
- `kilkennygaa.ie/clubs/shamrocks-ballyhale/` → `"shamrocks-ballyhale"`

## How It Works

The module scrapes public endpoints on GAA county board WordPress sites:

| Feed | Source | Method |
|------|--------|--------|
| **County team** | `clubs-fixtures-results-ajax/?countyBoardID=N&level=inter_county` | Filtered to exact county name, split by played/unplayed |
| **Senior club** | `clubs-fixtures-results-ajax/?countyBoardID=N&sport=X&level=club&grade=senior` | Single fetch, split by played/unplayed |
| **Your club** | `clubs-fixtures-results-ajax/?countyBoardID=N&grade=X` | Multiple grade-filtered fetches in parallel, merged and deduped |

Results are trimmed to the configured date window. Fixtures prefer the configured future window, but will backfill with the next-nearest future fixtures if too few are available, so the mirror is never empty.

No API key or authentication needed.

## Customisation

### Highlight colour

The default highlight colour is Kilkenny amber (`#f5c518`). Change it in `MMM-GAA.css`:

```css
.mmm-gaa .team-name.highlight {
  color: #005DAA; /* Dublin blue */
}
```

### Module width

Adjust `max-width` in `MMM-GAA.css` to fit your mirror layout:

```css
.mmm-gaa {
  max-width: 250px; /* increase or decrease as needed */
}
```

## Notes

- GAA scores: goals-points format (2-14 = 2×3 + 14 = 20 total)
- Joint underage teams (e.g. "Fenians/ St Patricks") are captured by the club name filter
- `highlightClub` uses loose substring matching and only affects display highlighting – it does not filter data
- For counties other than Kilkenny, set `siteUrl` to your county board's site (e.g. `https://dublingaa.ie`)
- Each endpoint returns max ~100 matches per request
- `npm test` covers core filtering, sorting, matching, and classification logic – it does not test full HTML fixture parsing
- Not all county board websites use the same theme – this module targets the standard GAA WordPress fixtures/results theme. Some counties may use a different structure

## License

MIT
