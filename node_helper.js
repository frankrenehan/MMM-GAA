const NodeHelper = require("node_helper");
const { parse } = require("node-html-parser");
const https = require("https");
const http = require("http");

module.exports = NodeHelper.create({
  start: function () {
    console.log("[MMM-GAA] Node helper started");
    this._cache = {};  // Per-feed cache of last successful data
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "FETCH_GAA_DATA") {
      this.fetchAllData(payload);
    }
  },

  // Normalize a team name for comparison: trim, collapse whitespace,
  // lowercase, strip common punctuation variations (e.g. St. vs St)
  normalizeName: function (name) {
    if (!name) return "";
    return name
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase()
      .replace(/[\u2018\u2019\u0060]/g, "\u0027")  // normalize curly quotes/backtick to straight apostrophe
      .replace(/\./g, "");     // "St." → "St"
  },

  // Check if a team name matches a county name (exact match after normalization)
  matchesCounty: function (teamName, countyName) {
    return this.normalizeName(teamName) === this.normalizeName(countyName);
  },

  // Check if a team name matches a club name.
  // Uses word-boundary matching to reduce false positives from short names
  // while still matching joint teams like "Fenians/ St Patricks".
  matchesClub: function (teamName, clubName) {
    const normTeam = this.normalizeName(teamName);
    const normClub = this.normalizeName(clubName);
    if (!normTeam || !normClub) return false;
    // Escape regex special chars, then match as a word boundary
    const escaped = normClub.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp("(?:^|[\\s/])" + escaped + "(?:$|[\\s/])").test(normTeam);
  },

  fetchAllData: async function (config) {
    const instanceId = config.instanceId || "default";
    const results = { instanceId };
    const rawSiteUrl = config.siteUrl || "https://kilkennygaa.ie";
    // Only allow http(s) URLs to prevent fetching from unexpected protocols.
    // Strip trailing slash to avoid double-slash in constructed URLs.
    const siteUrl = /^https?:\/\//i.test(rawSiteUrl)
      ? rawSiteUrl.replace(/\/+$/, "")
      : "https://kilkennygaa.ie";
    const baseUrl = `${siteUrl}/fixtures-results`;
    let feedErrors = 0;

    // Per-instance cache bucket
    if (!this._cache[instanceId]) this._cache[instanceId] = {};

    // ── FEED 1: Inter-county team (senior, U-20, minor, etc.) ──
    // Single fetch via clubs endpoint with level=inter_county, split by isPlayed.
    // Skip entirely if showCounty is explicitly false.
    if (config.showCounty === false) {
      results.countyFixtures = [];
      results.countyResults = [];
    } else {
      try {
        const countyName = config.countyName || "Kilkenny";

        const countyUrl = this.buildUrl(
          `${baseUrl}/clubs-fixtures-results-ajax/`,
          {
            countyBoardID: config.countyBoardID,
            level: "inter_county",
            orderTBCLast: "Y",
          }
        );
        const countyHtml = await this.fetchPage(countyUrl);
        const countyAll = this.parseMatches(countyHtml).filter(
          (m) =>
            this.matchesCounty(m.homeTeam, countyName) ||
            this.matchesCounty(m.awayTeam, countyName)
        );
        results.countyFixtures = countyAll.filter((m) => !m.isPlayed);
        results.countyResults = countyAll.filter((m) => m.isPlayed);

        this._cache[instanceId].county = {
          countyFixtures: results.countyFixtures,
          countyResults: results.countyResults,
        };
      } catch (err) {
        feedErrors++;
        console.error("[MMM-GAA] County feed error:", err.message);
        if (this._cache[instanceId].county) {
          console.log("[MMM-GAA] Using cached county data");
          results.countyFixtures = this._cache[instanceId].county.countyFixtures;
          results.countyResults = this._cache[instanceId].county.countyResults;
        } else {
          results.countyFixtures = [];
          results.countyResults = [];
        }
      }
    }

    // ── FEED 2: Senior club ──
    try {
      const sport = config.sport || "hurling";
      const seniorParams = {
        countyBoardID: config.countyBoardID,
        level: "club",
        grade: "senior",
        orderTBCLast: "Y",
      };
      if (sport !== "all") {
        seniorParams.sport = sport;
      }
      const seniorAllUrl = this.buildUrl(
        `${baseUrl}/clubs-fixtures-results-ajax/`,
        seniorParams
      );
      const seniorAllHtml = await this.fetchPage(seniorAllUrl);
      const seniorAll = this.parseMatches(seniorAllHtml);
      results.seniorFixtures = seniorAll.filter((m) => !m.isPlayed);
      results.seniorResults = seniorAll.filter((m) => m.isPlayed);

      this._cache[instanceId].senior = {
        seniorFixtures: results.seniorFixtures,
        seniorResults: results.seniorResults,
      };
    } catch (err) {
      feedErrors++;
      console.error("[MMM-GAA] Senior feed error:", err.message);
      if (this._cache[instanceId].senior) {
        console.log("[MMM-GAA] Using cached senior data");
        results.seniorFixtures = this._cache[instanceId].senior.seniorFixtures;
        results.seniorResults = this._cache[instanceId].senior.seniorResults;
      } else {
        results.seniorFixtures = [];
        results.seniorResults = [];
      }
    }

    // ── FEED 3: Your club (all grades) ──
    // The clubs endpoint caps at ~100 matches per request, so a single
    // unfiltered fetch misses smaller clubs. We fetch multiple grade
    // categories in parallel to get broad coverage, then merge and dedup.
    try {
      const clubSlug = config.clubSlug;
      const clubName = config.clubDisplayName || clubSlug;
      if (clubSlug) {
        const grades = ["senior", "intermediate", "junior", "minor", "juvenile", "u21"];
        const baseParams = {
          countyBoardID: config.countyBoardID,
          orderTBCLast: "Y",
        };

        const fetches = grades.map((grade) =>
          this.fetchPage(
            this.buildUrl(`${baseUrl}/clubs-fixtures-results-ajax/`, {
              ...baseParams,
              grade,
            })
          ).then((html) => this.parseMatches(html))
           .catch(() => [])
        );
        const allGradeResults = await Promise.all(fetches);
        const allClubMatches = allGradeResults.flat();

        // Dedup by home+away+date (same match may appear in overlapping grades)
        const seen = new Set();
        const uniqueMatches = allClubMatches.filter((m) => {
          const key = `${m.homeTeam}|${m.awayTeam}|${m.date}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        const myClubMatches = uniqueMatches.filter(
          (m) =>
            this.matchesClub(m.homeTeam, clubName) ||
            this.matchesClub(m.awayTeam, clubName)
        );
        results.clubFixtures = myClubMatches.filter((m) => !m.isPlayed);
        results.clubResults = myClubMatches.filter((m) => m.isPlayed);
      } else {
        results.clubFixtures = [];
        results.clubResults = [];
      }

      this._cache[instanceId].club = {
        clubFixtures: results.clubFixtures,
        clubResults: results.clubResults,
      };
    } catch (err) {
      feedErrors++;
      console.error("[MMM-GAA] Club feed error:", err.message);
      if (this._cache[instanceId].club) {
        console.log("[MMM-GAA] Using cached club data");
        results.clubFixtures = this._cache[instanceId].club.clubFixtures;
        results.clubResults = this._cache[instanceId].club.clubResults;
      } else {
        results.clubFixtures = [];
        results.clubResults = [];
      }
    }

    // If all feeds failed and we have no cached data at all, send error
    const hasAnyData =
      results.countyFixtures.length > 0 || results.countyResults.length > 0 ||
      results.seniorFixtures.length > 0 || results.seniorResults.length > 0 ||
      results.clubFixtures.length > 0 || results.clubResults.length > 0;

    if (feedErrors === 3 && !hasAnyData) {
      console.error("[MMM-GAA] All feeds failed with no cached data");
      this.sendSocketNotification("GAA_ERROR", { instanceId, error: "All feeds failed" });
      return;
    }

    // ── DATE FILTERING & SORTING ──
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const resultsCutoff = new Date(today);
    resultsCutoff.setDate(resultsCutoff.getDate() - (config.resultsDays || 7));
    const fixturesCutoff = new Date(today);
    fixturesCutoff.setDate(fixturesCutoff.getDate() + (config.fixturesDays || 14) + 1);

    // Cache parsed dates so we don't reparse repeatedly
    const dateCache = new Map();
    const getDate = (m) => {
      if (!dateCache.has(m)) dateCache.set(m, this.parseGAADate(m.date));
      return dateCache.get(m);
    };

    // Sort helpers: unparseable dates sort to the end
    const sortAsc = (a, b) => (getDate(a) || Infinity) - (getDate(b) || Infinity);
    const sortDesc = (a, b) => (getDate(b) || 0) - (getDate(a) || 0);

    // Results: include matches from resultsCutoff through today (inclusive).
    // "tomorrow" is midnight tonight, so d < tomorrow includes all of today.
    const filterResults = (matches) =>
      matches
        .filter((m) => {
          const d = getDate(m);
          return d && d >= resultsCutoff && d < tomorrow;
        })
        .sort(sortDesc);

    // Select fixtures inside the configured window, sorted nearest-first.
    // If too few, backfill with the next-nearest future fixtures outside
    // the window (never past matches).
    const filterFixtures = (matches, minItems) => {
      const futureMatches = matches
        .filter((m) => {
          const d = getDate(m);
          return d && d >= today;
        })
        .sort(sortAsc);

      const inWindow = futureMatches.filter((m) => getDate(m) < fixturesCutoff);
      if (inWindow.length >= (minItems || 2)) return inWindow;

      // Backfill from future matches outside the window
      const outside = futureMatches.filter((m) => getDate(m) >= fixturesCutoff);
      return inWindow.concat(outside).slice(0, minItems || 2);
    };

    results.countyResults = filterResults(results.countyResults);
    results.countyFixtures = filterFixtures(results.countyFixtures, config.maxCountyFixtures || 4);
    results.seniorResults = filterResults(results.seniorResults);
    results.seniorFixtures = filterFixtures(results.seniorFixtures, config.maxSeniorFixtures || 6);
    results.clubResults = filterResults(results.clubResults);
    results.clubFixtures = filterFixtures(results.clubFixtures, config.maxClubFixtures || 6);

    results.lastUpdated = new Date().toISOString();

    console.log(
      `[MMM-GAA] Fetched: ` +
        `${results.countyFixtures.length} county fix, ${results.countyResults.length} county res, ` +
        `${results.seniorFixtures.length} senior fix, ${results.seniorResults.length} senior res, ` +
        `${results.clubFixtures.length} club fix, ${results.clubResults.length} club res` +
        (feedErrors > 0 ? ` (${feedErrors} feed(s) used cache)` : "")
    );

    this.sendSocketNotification("GAA_DATA", results);
  },

  buildUrl: function (base, params) {
    const query = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    return `${base}?${query}`;
  },

  // Parse GAA date strings like "Sunday 26th Apr 2026" or "2026-04-18 - 2026-04-19"
  parseGAADate: function (dateStr) {
    if (!dateStr) return null;
    try {
      const isoMatch = dateStr.match(/(\d{4}-\d{2}-\d{2})/);
      if (isoMatch) return new Date(isoMatch[1] + "T12:00:00");

      const months = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
      };
      const match = dateStr.match(/(\d+)\w*\s+(\w{3})\w*\s+(\d{4})/);
      if (match) {
        const day = parseInt(match[1], 10);
        const month = months[match[2].toLowerCase()];
        const year = parseInt(match[3], 10);
        if (month !== undefined) return new Date(year, month, day, 12, 0, 0);
      }
      return null;
    } catch (e) {
      return null;
    }
  },

  fetchPage: function (url, _redirectCount) {
    const redirectCount = _redirectCount || 0;
    const MAX_REDIRECTS = 5;
    const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB

    return new Promise((resolve, reject) => {
      if (redirectCount >= MAX_REDIRECTS) {
        return reject(new Error(`Too many redirects for ${url}`));
      }

      const client = url.startsWith("https") ? https : http;
      const req = client.get(
        url,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; MagicMirror/2.0; +http://magicmirror.builders)",
            Accept: "text/html,application/xhtml+xml",
          },
          timeout: 15000,
        },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return this.fetchPage(res.headers.location, redirectCount + 1)
              .then(resolve).catch(reject);
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          }
          let data = "";
          let bytes = 0;
          res.on("data", (chunk) => {
            bytes += chunk.length;
            if (bytes > MAX_BODY_BYTES) {
              req.destroy();
              return reject(new Error(`Response too large for ${url}`));
            }
            data += chunk;
          });
          res.on("end", () => resolve(data));
          res.on("error", reject);
        }
      );
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`Timeout fetching ${url}`));
      });
    });
  },

  parseMatches: function (html) {
    if (!html || html.trim().length === 0) return [];

    const root = parse(html);
    const matches = [];
    let currentDate = "";

    const allElements = root.querySelectorAll(
      ".fix_res_date, .competition"
    );

    for (const el of allElements) {
      if (el.classList.contains("fix_res_date")) {
        currentDate = el.text.trim();
        continue;
      }

      if (el.classList.contains("competition")) {
        const compNameEl = el.querySelector(".competition-name a");
        const currentComp = compNameEl
          ? compNameEl.text.trim().replace(/\s+/g, " ")
          : "";

        let matchRows = el.querySelectorAll(".comp_details");
        if (matchRows.length === 0) {
          matchRows = el
            .querySelectorAll(".home_team")
            .map((ht) => ht.parentNode);
        }

        for (const row of matchRows) {
          const match = this.parseMatchRow(row, currentDate, currentComp);
          if (match) matches.push(match);
        }
      }
    }

    return matches;
  },

  // Determine whether a match has been played based on score fields.
  //
  // The GAA WordPress theme populates .home_score and .away_score for
  // played matches. Unplayed fixtures leave these empty.
  //
  // Edge case: a 0-0 scoreline is ambiguous when a throw-in time is
  // also present (e.g. "14:00"), because the scores may be pre-filled
  // placeholder zeros for a future fixture. In that case we treat it
  // as unplayed. A genuine 0-0 result would not have a future time.
  isMatchPlayed: function (homeScore, awayScore, time) {
    if (!homeScore || !awayScore) return false;
    const bothZero = homeScore === "0-0" && awayScore === "0-0";
    const hasThrowInTime = /\d{1,2}:\d{2}/.test(time);
    if (bothZero && hasThrowInTime) return false;
    return true;
  },

  parseMatchRow: function (row, date, competition) {
    try {
      const homeTeamEl = row.querySelector(".home_team a, .home_team");
      const awayTeamEl = row.querySelector(".away_team a, .away_team");
      const homeScoreEl = row.querySelector(".home_score");
      const awayScoreEl = row.querySelector(".away_score");
      const timeEl = row.querySelector(".time");
      const venueEl = row.querySelector(".venue");

      if (!homeTeamEl || !awayTeamEl) return null;

      const homeTeam = homeTeamEl.text.trim().replace(/\s+/g, " ");
      const awayTeam = awayTeamEl.text.trim().replace(/\s+/g, " ");
      const homeScore = homeScoreEl ? homeScoreEl.text.trim() : "";
      const awayScore = awayScoreEl ? awayScoreEl.text.trim() : "";
      const time = timeEl ? timeEl.text.trim() : "";
      const venue = venueEl ? venueEl.text.trim().replace(/\s+/g, " ") : "";

      return {
        date,
        competition,
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        time,
        venue,
        isPlayed: this.isMatchPlayed(homeScore, awayScore, time),
      };
    } catch (e) {
      return null;
    }
  },
});
