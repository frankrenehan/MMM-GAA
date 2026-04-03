Module.register("MMM-GAA", {
  // Default config
  defaults: {
    countyBoardID: 15, // Kilkenny
    countyName: "Kilkenny", // County name for header and filtering
    siteUrl: "https://kilkennygaa.ie", // County board website URL
    logoUrl: "https://kilkennygaa.b-cdn.net/wp-content/uploads/2025/09/kilkenny.png",
    sport: "hurling", // "hurling", "football", or "all"
    clubSlug: "fenians", // Club page slug (kilkennygaa.ie/clubs/<slug>/)
    clubDisplayName: "Fenians",
    resultsDays: 7, // Show results from the last N days
    fixturesDays: 14, // Show fixtures for the next N days
    updateInterval: 30 * 60 * 1000, // 30 minutes
    showCounty: true, // Show Kilkenny county team section
    maxCountyFixtures: 4, // Max upcoming county fixtures to show
    maxCountyResults: 3, // Max recent county results to show
    maxSeniorFixtures: 6, // Max upcoming senior club fixtures to show
    maxSeniorResults: 4, // Max recent senior club results to show
    maxClubFixtures: 6, // Max upcoming club fixtures to show
    maxClubResults: 3, // Max recent club results to show
    animationSpeed: 1000,
    highlightClub: "Fenians", // Highlight this club name in amber
    showVenue: true,
    showCompetition: true,
    sponsorPatterns: [
      "St\\.?\\s*Canice'?s?\\s*Credit\\s*Union\\s*",
      "St\\.?\\s*Cannice'?s?\\s*Credit\\s*Union\\s*",
      "J\\.?J\\.?\\s*Kavanagh\\s*(and|&)\\s*Sons?\\s*",
      "Kilkenny\\s*Vehicle\\s*Centre\\s*",
      "Duggan\\s*Steel\\s*",
      "Michael\\s*Lyng\\s*Motors?\\s*(Hyundai)?\\s*",
      "Iverk\\s*Produce\\s*",
      "Country\\s*Style\\s*Foods?\\s*",
      "Allianz\\s*",
      "AIB\\s*GAA\\s*",
    ],
  },

  // Module startup
  start: function () {
    Log.info("[MMM-GAA] Starting module");
    this.gaaData = null;
    this.error = null;
    this.loaded = false;
    this.scheduleUpdate();
    this.fetchData();
  },

  // Request data from node_helper
  fetchData: function () {
    this.sendSocketNotification("FETCH_GAA_DATA", this.config);
  },

  // Schedule periodic updates
  scheduleUpdate: function () {
    this.updateTimer = setInterval(() => {
      this.fetchData();
    }, this.config.updateInterval);
  },

  // MagicMirror lifecycle: pause updates when module is hidden
  suspend: function () {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  },

  // MagicMirror lifecycle: resume updates when module is shown again
  resume: function () {
    if (!this.updateTimer) {
      this.scheduleUpdate();
      this.fetchData();
    }
  },

  // Handle data from node_helper
  socketNotificationReceived: function (notification, payload) {
    if (notification === "GAA_DATA") {
      this.gaaData = payload;
      this.loaded = true;
      this.error = null;
      this.updateDom(this.config.animationSpeed);
    } else if (notification === "GAA_ERROR") {
      this.error = payload.error;
      this.loaded = true;
      this.updateDom(this.config.animationSpeed);
    }
  },

  // Build the DOM
  getDom: function () {
    const wrapper = document.createElement("div");
    wrapper.className = "mmm-gaa";

    if (!this.loaded) {
      const loading = document.createElement("div");
      loading.className = "loading dimmed light small";
      loading.textContent = "Loading GAA fixtures\u2026";
      wrapper.appendChild(loading);
      return wrapper;
    }

    if (this.error) {
      const errorDiv = document.createElement("div");
      errorDiv.className = "error dimmed light small";
      errorDiv.textContent = "Error: " + this.error;
      wrapper.appendChild(errorDiv);
      return wrapper;
    }

    if (!this.gaaData) return wrapper;

    // === SECTION 1: County Team ===
    if (this.config.showCounty) {
      const hasCounty =
        (this.gaaData.countyFixtures && this.gaaData.countyFixtures.length > 0) ||
        (this.gaaData.countyResults && this.gaaData.countyResults.length > 0);
      if (hasCounty) {
        const countySection = this.buildSection(
          this.config.countyName || "County",
          this.gaaData.countyFixtures,
          this.gaaData.countyResults,
          this.config.maxCountyFixtures,
          this.config.maxCountyResults
        );
        wrapper.appendChild(countySection);
      }
    }

    // === SECTION 2: Senior Club ===
    const sport = this.config.sport || "hurling";
    const sportLabel = sport === "all" ? "" : " " + sport.charAt(0).toUpperCase() + sport.slice(1);
    const hasSenior =
      (this.gaaData.seniorFixtures && this.gaaData.seniorFixtures.length > 0) ||
      (this.gaaData.seniorResults && this.gaaData.seniorResults.length > 0);
    if (hasSenior) {
      if (wrapper.children.length > 0) {
        const divider1 = document.createElement("div");
        divider1.className = "section-divider";
        wrapper.appendChild(divider1);
      }
      const seniorSection = this.buildSection(
        `Senior Club${sportLabel}`,
        this.gaaData.seniorFixtures,
        this.gaaData.seniorResults,
        this.config.maxSeniorFixtures,
        this.config.maxSeniorResults
      );
      wrapper.appendChild(seniorSection);
    }

    // === SECTION 3: Club Fixtures ===
    if (this.config.clubSlug) {
      const hasClub =
        (this.gaaData.clubFixtures && this.gaaData.clubFixtures.length > 0) ||
        (this.gaaData.clubResults && this.gaaData.clubResults.length > 0);
      if (hasClub) {
        if (wrapper.children.length > 0) {
          const divider2 = document.createElement("div");
          divider2.className = "section-divider";
          wrapper.appendChild(divider2);
        }
        const clubSection = this.buildSection(
          this.config.clubDisplayName,
          this.gaaData.clubFixtures,
          this.gaaData.clubResults,
          this.config.maxClubFixtures,
          this.config.maxClubResults
        );
        wrapper.appendChild(clubSection);
      }
    }

    // === LAST UPDATED FOOTER ===
    if (this.gaaData.lastUpdated) {
      const updatedAt = new Date(this.gaaData.lastUpdated);
      const ageMs = Date.now() - updatedAt.getTime();
      const ageMin = Math.floor(ageMs / 60000);
      if (ageMin >= 5) {
        const footer = document.createElement("div");
        footer.className = "gaa-footer dimmed xsmall";
        if (ageMin < 60) {
          footer.textContent = `Updated ${ageMin} min ago`;
        } else {
          const ageHrs = Math.floor(ageMin / 60);
          footer.textContent = `Updated ${ageHrs}h ${ageMin % 60}m ago`;
        }
        wrapper.appendChild(footer);
      }
    }

    return wrapper;
  },

  buildSection: function (title, fixtures, results, maxFix, maxRes) {
    const section = document.createElement("div");
    section.className = "gaa-section";

    // Section header (with inline logo for county section)
    const header = document.createElement("div");
    header.className = "section-header";
    if (this.config.logoUrl && title === (this.config.countyName || "County")) {
      const logo = document.createElement("img");
      logo.className = "gaa-logo-inline";
      logo.src = this.config.logoUrl;
      logo.alt = title;
      header.appendChild(logo);
    }
    const titleSpan = document.createElement("span");
    titleSpan.textContent = title;
    header.appendChild(titleSpan);
    section.appendChild(header);

    // Recent results
    if (results && results.length > 0) {
      const resHeader = document.createElement("div");
      resHeader.className = "sub-header dimmed";
      resHeader.textContent = "Results";
      section.appendChild(resHeader);

      const recentResults = results.slice(0, maxRes);
      for (const match of recentResults) {
        section.appendChild(this.buildMatchRow(match));
      }
    }

    // Upcoming fixtures
    if (fixtures && fixtures.length > 0) {
      const fixHeader = document.createElement("div");
      fixHeader.className = "sub-header dimmed";
      fixHeader.textContent = "Fixtures";
      section.appendChild(fixHeader);

      const upcomingFixtures = fixtures.slice(0, maxFix);
      for (const match of upcomingFixtures) {
        section.appendChild(this.buildMatchRow(match));
      }
    }

    return section;
  },

  buildMatchRow: function (match) {
    const row = document.createElement("div");
    row.className = "match-row";

    // Line 1: Date • Competition
    const dateLine = document.createElement("div");
    dateLine.className = "match-date dimmed xsmall";
    let dateText = this.formatDate(match.date);
    if (this.config.showCompetition && match.competition) {
      const shortComp = this.shortenCompetition(match.competition);
      dateText += ` \u2022 ${shortComp}`;
    }
    dateLine.textContent = dateText;
    row.appendChild(dateLine);

    if (match.isPlayed) {
      // RESULT: two lines, team + score on each
      const homeTotal = this.calcTotal(match.homeScore);
      const awayTotal = this.calcTotal(match.awayScore);

      const homeLine = document.createElement("div");
      homeLine.className = "team-line";
      const homeName = document.createElement("span");
      homeName.className = "team-name" +
        (this.isHighlightedClub(match.homeTeam) ? " highlight" : "") +
        (homeTotal > awayTotal ? " winner" : "");
      homeName.textContent = match.homeTeam;
      const homeScore = document.createElement("span");
      homeScore.className = "team-score";
      homeScore.textContent = `${match.homeScore} (${homeTotal})`;
      homeLine.appendChild(homeName);
      homeLine.appendChild(homeScore);
      row.appendChild(homeLine);

      const awayLine = document.createElement("div");
      awayLine.className = "team-line away-line";
      const awayName = document.createElement("span");
      awayName.className = "team-name" +
        (this.isHighlightedClub(match.awayTeam) ? " highlight" : "") +
        (awayTotal > homeTotal ? " winner" : "");
      awayName.textContent = match.awayTeam;
      const awayScore = document.createElement("span");
      awayScore.className = "team-score";
      awayScore.textContent = `${match.awayScore} (${awayTotal})`;
      awayLine.appendChild(awayName);
      awayLine.appendChild(awayScore);
      row.appendChild(awayLine);
    } else {
      // FIXTURE: two lines, home with time, away below with "v" prefix
      const homeLine = document.createElement("div");
      homeLine.className = "team-line";
      const homeName = document.createElement("span");
      homeName.className = "team-name" +
        (this.isHighlightedClub(match.homeTeam) ? " highlight" : "");
      homeName.textContent = match.homeTeam;
      const timeBadge = document.createElement("span");
      timeBadge.className = "time-badge";
      timeBadge.textContent = match.time || "TBC";
      homeLine.appendChild(homeName);
      homeLine.appendChild(timeBadge);
      row.appendChild(homeLine);

      const awayLine = document.createElement("div");
      awayLine.className = "team-line away-line";
      const awayName = document.createElement("span");
      awayName.className = "team-name" +
        (this.isHighlightedClub(match.awayTeam) ? " highlight" : "");
      awayName.textContent = `v ${match.awayTeam}`;
      awayLine.appendChild(awayName);
      row.appendChild(awayLine);
    }

    // Venue line (optional)
    if (this.config.showVenue && match.venue) {
      const venueLine = document.createElement("div");
      venueLine.className = "match-venue dimmed xsmall";
      venueLine.textContent = match.venue;
      row.appendChild(venueLine);
    }

    return row;
  },

  // Convert GAA score (e.g. "2-14") to total points
  calcTotal: function (score) {
    if (!score) return 0;
    const parts = score.trim().split("-");
    if (parts.length === 2) {
      const goals = parseInt(parts[0], 10) || 0;
      const points = parseInt(parts[1], 10) || 0;
      return goals * 3 + points;
    }
    return 0;
  },

  // Check if a team name matches the highlighted club
  isHighlightedClub: function (teamName) {
    if (!this.config.highlightClub || !teamName) return false;
    return teamName.toLowerCase().includes(this.config.highlightClub.toLowerCase());
  },

  // Shorten competition name for display.
  // Strips configurable sponsor patterns, then applies universal structural cleanup.
  shortenCompetition: function (comp) {
    if (!comp) return "";
    let short = comp;

    // Strip configurable sponsor names
    const patterns = this.config.sponsorPatterns || [];
    for (const pat of patterns) {
      try {
        short = short.replace(new RegExp(pat, "gi"), "");
      } catch (e) {
        // Skip invalid regex patterns silently
      }
    }

    // Universal structural cleanup (not sponsor-specific)
    short = short
      .replace(/Leinster\s*GAA\s*/gi, "Leinster ")
      .replace(/Munster\s*GAA\s*/gi, "Munster ")
      .replace(/Connacht\s*GAA\s*/gi, "Connacht ")
      .replace(/Ulster\s*GAA\s*/gi, "Ulster ")
      .replace(/\s*-\s*League\s*Division\s*\d+\s*/gi, " ")
      .replace(/\s*-\s*Cup\s*Division\s*\d+\s*/gi, " ")
      .replace(/\s*-\s*Round\s*\d+\s*/gi, "")
      .replace(/\s*Round\s*\d+\s*/gi, "")
      .replace(/\s*\(FOD\)\s*/gi, "")
      .replace(/\s*FOD\s*/gi, "")
      .replace(/\s*-\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();

    // Truncate if still long
    if (short.length > 40) {
      short = short.substring(0, 37) + "\u2026";
    }
    return short;
  },

  // Format date string for compact display
  formatDate: function (dateStr) {
    if (!dateStr) return "";

    // Format 1: ISO range "2026-04-18 - 2026-04-19" → "Sat 18 Apr"
    const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const d = new Date(
        parseInt(isoMatch[1]),
        parseInt(isoMatch[2]) - 1,
        parseInt(isoMatch[3])
      );
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                       "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
    }

    // Format 2: "Sunday 26th Apr 2026" → "Sun 26 Apr"
    return dateStr
      .replace(/(\w+day)\s+/, (m, day) => day.substring(0, 3) + " ")
      .replace(/(\d+)(st|nd|rd|th)/, "$1")
      .replace(/\s+\d{4}$/, "");
  },

  // CSS styles
  getStyles: function () {
    return ["MMM-GAA.css"];
  },
});
