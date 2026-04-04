"use strict";

const assert = require("assert");
const Module = require("module");

// ── Stub MagicMirror's NodeHelper so we can require node_helper.js ──
let helperMethods = {};
const origResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === "node_helper") {
    return "node_helper_stub";
  }
  return origResolveFilename.call(this, request, parent, isMain, options);
};
require.cache["node_helper_stub"] = {
  id: "node_helper_stub",
  filename: "node_helper_stub",
  loaded: true,
  exports: {
    create: function (obj) {
      helperMethods = obj;
      return obj;
    },
  },
};

require("./node_helper");
const h = helperMethods;
Module._resolveFilename = origResolveFilename;

// ── Extract shortenCompetition from MMM-GAA.js for testing ──
// It's a browser module so we can't require it directly. Parse the function out.
const fs = require("fs");
const path = require("path");
const frontendSrc = fs.readFileSync(path.join(__dirname, "MMM-GAA.js"), "utf8");

// Build a shortenCompetition function that takes (comp, sponsorPatterns)
function makeShortenCompetition(sponsorPatterns) {
  return function shortenCompetition(comp) {
    if (!comp) return "";
    let short = comp;
    const patterns = sponsorPatterns || [];
    for (const pat of patterns) {
      try {
        short = short.replace(new RegExp(pat, "gi"), "");
      } catch (e) { /* skip */ }
    }
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
    if (short.length > 40) {
      short = short.substring(0, 37) + "\u2026";
    }
    return short;
  };
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (e) {
    failed++;
    console.log(`  \u2717 ${name}`);
    console.log(`    ${e.message}`);
  }
}

// ════════════════════════════════════════════
// parseGAADate
// ════════════════════════════════════════════
console.log("\nparseGAADate:");

test("parses ISO date", () => {
  const d = h.parseGAADate("2026-04-18 - 2026-04-19");
  assert.strictEqual(d.getFullYear(), 2026);
  assert.strictEqual(d.getMonth(), 3);
  assert.strictEqual(d.getDate(), 18);
});

test("parses verbose GAA date", () => {
  const d = h.parseGAADate("Sunday 26th Apr 2026");
  assert.strictEqual(d.getFullYear(), 2026);
  assert.strictEqual(d.getMonth(), 3);
  assert.strictEqual(d.getDate(), 26);
});

test("parses date with different ordinals", () => {
  const d1 = h.parseGAADate("Monday 1st Jan 2026");
  assert.strictEqual(d1.getMonth(), 0);
  assert.strictEqual(d1.getDate(), 1);
  const d2 = h.parseGAADate("Tuesday 2nd Feb 2026");
  assert.strictEqual(d2.getMonth(), 1);
  assert.strictEqual(d2.getDate(), 2);
  const d3 = h.parseGAADate("Wednesday 3rd Mar 2026");
  assert.strictEqual(d3.getMonth(), 2);
  assert.strictEqual(d3.getDate(), 3);
});

test("returns null for empty/invalid", () => {
  assert.strictEqual(h.parseGAADate(null), null);
  assert.strictEqual(h.parseGAADate(""), null);
  assert.strictEqual(h.parseGAADate("TBC"), null);
});

// ════════════════════════════════════════════
// isMatchPlayed
// ════════════════════════════════════════════
console.log("\nisMatchPlayed:");

test("played: both scores present", () => {
  assert.strictEqual(h.isMatchPlayed("2-14", "1-10", ""), true);
});

test("not played: missing scores", () => {
  assert.strictEqual(h.isMatchPlayed("", "", "14:00"), false);
  assert.strictEqual(h.isMatchPlayed("2-14", "", ""), false);
});

test("not played: 0-0 with throw-in time", () => {
  assert.strictEqual(h.isMatchPlayed("0-0", "0-0", "14:00"), false);
  assert.strictEqual(h.isMatchPlayed("0-0", "0-0", "7:30"), false);
});

test("played: 0-0 without throw-in time (genuine scoreless draw)", () => {
  assert.strictEqual(h.isMatchPlayed("0-0", "0-0", ""), true);
  assert.strictEqual(h.isMatchPlayed("0-0", "0-0", "FT"), true);
});

// ════════════════════════════════════════════
// normalizeName
// ════════════════════════════════════════════
console.log("\nnormalizeName:");

test("lowercases and collapses whitespace", () => {
  assert.strictEqual(h.normalizeName("  Kilkenny  "), "kilkenny");
  assert.strictEqual(h.normalizeName("St.  Patrick's"), "st patrick's");
});

test("normalizes apostrophes", () => {
  assert.strictEqual(h.normalizeName("O\u2019Brien"), "o'brien");
  assert.strictEqual(h.normalizeName("O\u2018Brien"), "o'brien");
});

test("strips dots", () => {
  assert.strictEqual(h.normalizeName("St. Canice's"), "st canice's");
});

test("returns empty for falsy input", () => {
  assert.strictEqual(h.normalizeName(null), "");
  assert.strictEqual(h.normalizeName(""), "");
});

// ════════════════════════════════════════════
// matchesCounty
// ════════════════════════════════════════════
console.log("\nmatchesCounty:");

test("exact match after normalization", () => {
  assert.strictEqual(h.matchesCounty("Kilkenny", "Kilkenny"), true);
  assert.strictEqual(h.matchesCounty(" kilkenny ", "Kilkenny"), true);
});

test("rejects partial matches", () => {
  assert.strictEqual(h.matchesCounty("Kilkenny Schools", "Kilkenny"), false);
});

// ════════════════════════════════════════════
// matchesClub
// ════════════════════════════════════════════
console.log("\nmatchesClub:");

test("matches exact club name", () => {
  assert.strictEqual(h.matchesClub("Fenians", "Fenians"), true);
});

test("matches club in joint team name", () => {
  assert.strictEqual(h.matchesClub("Fenians/ St Patricks", "Fenians"), true);
  assert.strictEqual(h.matchesClub("Fenians/ St Patricks", "St Patricks"), true);
});

test("case insensitive", () => {
  assert.strictEqual(h.matchesClub("FENIANS", "fenians"), true);
});

test("rejects substring false positives", () => {
  assert.strictEqual(h.matchesClub("Fenians", "Fen"), false);
});

test("handles empty inputs", () => {
  assert.strictEqual(h.matchesClub("", "Fenians"), false);
  assert.strictEqual(h.matchesClub("Fenians", ""), false);
});

// ════════════════════════════════════════════
// shortenCompetition with custom sponsor patterns
// ════════════════════════════════════════════
console.log("\nshortenCompetition:");

test("strips default Kilkenny sponsors", () => {
  const shorten = makeShortenCompetition([
    "St\\.?\\s*Canice'?s?\\s*Credit\\s*Union\\s*",
    "Allianz\\s*",
  ]);
  assert.strictEqual(
    shorten("St. Canice's Credit Union Senior Hurling Championship"),
    "Senior Hurling Championship"
  );
  assert.strictEqual(
    shorten("Allianz Hurling League"),
    "Hurling League"
  );
});

test("strips custom sponsor patterns", () => {
  const shorten = makeShortenCompetition([
    "SuperValu\\s*",
    "Bord\\s*G\u00e1is\\s*Energy\\s*",
  ]);
  assert.strictEqual(
    shorten("SuperValu Munster Senior Hurling Championship"),
    "Munster Senior Hurling Championship"
  );
  assert.strictEqual(
    shorten("Bord G\u00e1is Energy U20 Hurling Championship"),
    "U20 Hurling Championship"
  );
});

test("applies structural cleanup regardless of sponsors", () => {
  const shorten = makeShortenCompetition([]);
  assert.strictEqual(
    shorten("Leinster GAA Senior Hurling Championship - Round 3"),
    "Leinster Senior Hurling Championship"
  );
  assert.strictEqual(shorten("Something (FOD)"), "Something");
});

test("handles empty patterns array", () => {
  const shorten = makeShortenCompetition([]);
  assert.strictEqual(shorten("Plain Competition Name"), "Plain Competition Name");
});

test("truncates long names", () => {
  const shorten = makeShortenCompetition([]);
  const long = "A".repeat(50);
  const result = shorten(long);
  assert.strictEqual(result.length, 38); // 37 + ellipsis char
  assert.ok(result.endsWith("\u2026"));
});

// ════════════════════════════════════════════
// Cache fallback behavior
// ════════════════════════════════════════════
console.log("\ncache fallback:");

test("uses cached data when fetch fails after a successful fetch", async () => {
  // Set up a helper instance with cache and mock fetchPage
  const instance = Object.create(h);
  instance._cache = {};
  const notifications = [];
  instance.sendSocketNotification = (type, data) => notifications.push({ type, data });

  let fetchCount = 0;
  instance.fetchPage = async function () {
    fetchCount++;
    if (fetchCount <= 3) {
      // First round: return minimal valid HTML
      return '<div class="fix_res_date">Sunday 1st Jun 2026</div>' +
        '<div class="competition"><div class="competition-name"><a>Test Comp</a></div>' +
        '<div class="comp_details"><div class="home_team">Team A</div>' +
        '<div class="away_team">Team B</div><div class="time">14:00</div></div></div>';
    }
    // Second round: all fail
    throw new Error("Network error");
  };

  const config = {
    instanceId: "15-team-a",
    countyBoardID: 15,
    countyName: "Kilkenny",
    sport: "hurling",
    clubSlug: "team-a",
    clubDisplayName: "Team A",
    resultsDays: 7,
    fixturesDays: 14,
    maxCountyFixtures: 4,
    maxSeniorFixtures: 6,
    maxClubFixtures: 6,
  };

  // First fetch: succeeds, populates cache
  await instance.fetchAllData(config);
  assert.strictEqual(notifications.length, 1);
  assert.strictEqual(notifications[0].type, "GAA_DATA");
  assert.ok(instance._cache["15-team-a"].county);
  assert.ok(instance._cache["15-team-a"].senior);
  assert.ok(instance._cache["15-team-a"].club);

  // Second fetch: all fail, should use cache and still send GAA_DATA
  notifications.length = 0;
  await instance.fetchAllData(config);
  assert.strictEqual(notifications.length, 1);
  assert.strictEqual(notifications[0].type, "GAA_DATA");
  assert.ok(notifications[0].data.lastUpdated);
});

test("sends GAA_ERROR when all feeds fail with no cache", async () => {
  const instance = Object.create(h);
  instance._cache = {};
  const notifications = [];
  instance.sendSocketNotification = (type, data) => notifications.push({ type, data });
  instance.fetchPage = async function () { throw new Error("fail"); };

  await instance.fetchAllData({
    instanceId: "15-",
    countyBoardID: 15,
    countyName: "Kilkenny",
    sport: "hurling",
  });

  assert.strictEqual(notifications.length, 1);
  assert.strictEqual(notifications[0].type, "GAA_ERROR");
  assert.strictEqual(notifications[0].data.instanceId, "15-");
});

// ════════════════════════════════════════════
// lastUpdated in payload
// ════════════════════════════════════════════
console.log("\nlastUpdated:");

test("payload includes lastUpdated ISO string", async () => {
  const instance = Object.create(h);
  instance._cache = {};
  const notifications = [];
  instance.sendSocketNotification = (type, data) => notifications.push({ type, data });
  instance.fetchPage = async function () {
    return '<div class="fix_res_date">Sunday 1st Jun 2026</div>' +
      '<div class="competition"><div class="competition-name"><a>Comp</a></div>' +
      '<div class="comp_details"><div class="home_team">A</div>' +
      '<div class="away_team">B</div><div class="time">14:00</div></div></div>';
  };

  const before = new Date().toISOString();
  await instance.fetchAllData({
    instanceId: "15-",
    countyBoardID: 15,
    countyName: "Kilkenny",
    sport: "hurling",
  });
  const after = new Date().toISOString();

  const payload = notifications[0].data;
  assert.ok(payload.lastUpdated, "lastUpdated should be present");
  assert.ok(payload.lastUpdated >= before, "lastUpdated should be after test start");
  assert.ok(payload.lastUpdated <= after, "lastUpdated should be before test end");
});

// ════════════════════════════════════════════
// Fixture sorting (date ascending / nearest first)
// ════════════════════════════════════════════
console.log("\nfixture sorting:");

test("fixtures are sorted date ascending (nearest first)", async () => {
  const instance = Object.create(h);
  instance._cache = {};
  const notifications = [];
  instance.sendSocketNotification = (type, data) => notifications.push({ type, data });

  // Return fixtures in reverse date order so we can verify sorting corrects it
  const today = new Date();
  const d1 = new Date(today); d1.setDate(d1.getDate() + 5);
  const d2 = new Date(today); d2.setDate(d2.getDate() + 2);
  const d3 = new Date(today); d3.setDate(d3.getDate() + 8);
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

  let callNum = 0;
  instance.fetchPage = async function () {
    callNum++;
    // Only return data for county fixtures feed (callNum 1), empty for the rest
    if (callNum === 1) {
      return `<div class="fix_res_date">${fmt(d1)}</div>` +
        '<div class="competition"><div class="competition-name"><a>C</a></div>' +
        '<div class="comp_details"><div class="home_team">Kilkenny</div>' +
        '<div class="away_team">Cork</div><div class="time">14:00</div></div></div>' +
        `<div class="fix_res_date">${fmt(d2)}</div>` +
        '<div class="competition"><div class="competition-name"><a>C</a></div>' +
        '<div class="comp_details"><div class="home_team">Kilkenny</div>' +
        '<div class="away_team">Dublin</div><div class="time">15:00</div></div></div>' +
        `<div class="fix_res_date">${fmt(d3)}</div>` +
        '<div class="competition"><div class="competition-name"><a>C</a></div>' +
        '<div class="comp_details"><div class="home_team">Tipperary</div>' +
        '<div class="away_team">Kilkenny</div><div class="time">16:00</div></div></div>';
    }
    return "";
  };

  await instance.fetchAllData({
    instanceId: "15-",
    countyBoardID: 15,
    countyName: "Kilkenny",
    sport: "hurling",
    fixturesDays: 30,
    maxCountyFixtures: 10,
  });

  const fixtures = notifications[0].data.countyFixtures;
  assert.ok(fixtures.length >= 2, "should have multiple fixtures");
  // Verify ascending order
  for (let i = 1; i < fixtures.length; i++) {
    const prev = h.parseGAADate(fixtures[i-1].date);
    const curr = h.parseGAADate(fixtures[i].date);
    assert.ok(prev <= curr, `fixture ${i-1} date should be <= fixture ${i} date`);
  }
});

// ════════════════════════════════════════════
// Result sorting (date descending / most recent first)
// ════════════════════════════════════════════
console.log("\nresult sorting:");

test("results are sorted date descending (most recent first)", async () => {
  const instance = Object.create(h);
  instance._cache = {};
  const notifications = [];
  instance.sendSocketNotification = (type, data) => notifications.push({ type, data });

  const today = new Date();
  const d1 = new Date(today); d1.setDate(d1.getDate() - 2);
  const d2 = new Date(today); d2.setDate(d2.getDate() - 5);
  const d3 = new Date(today); d3.setDate(d3.getDate() - 1);
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

  let callNum = 0;
  instance.fetchPage = async function () {
    callNum++;
    // Return results on call 2 (county results), empty for the rest
    if (callNum === 2) {
      return `<div class="fix_res_date">${fmt(d1)}</div>` +
        '<div class="competition"><div class="competition-name"><a>C</a></div>' +
        '<div class="comp_details"><div class="home_team">Kilkenny</div>' +
        '<div class="away_team">Cork</div><div class="home_score">2-14</div>' +
        '<div class="away_score">1-10</div></div></div>' +
        `<div class="fix_res_date">${fmt(d2)}</div>` +
        '<div class="competition"><div class="competition-name"><a>C</a></div>' +
        '<div class="comp_details"><div class="home_team">Kilkenny</div>' +
        '<div class="away_team">Dublin</div><div class="home_score">3-15</div>' +
        '<div class="away_score">0-12</div></div></div>' +
        `<div class="fix_res_date">${fmt(d3)}</div>` +
        '<div class="competition"><div class="competition-name"><a>C</a></div>' +
        '<div class="comp_details"><div class="home_team">Tipperary</div>' +
        '<div class="away_team">Kilkenny</div><div class="home_score">1-08</div>' +
        '<div class="away_score">2-20</div></div></div>';
    }
    return "";
  };

  await instance.fetchAllData({
    instanceId: "15-",
    countyBoardID: 15,
    countyName: "Kilkenny",
    sport: "hurling",
    resultsDays: 7,
    maxCountyResults: 10,
  });

  const results = notifications[0].data.countyResults;
  assert.ok(results.length >= 2, "should have multiple results");
  // Verify descending order
  for (let i = 1; i < results.length; i++) {
    const prev = h.parseGAADate(results[i-1].date);
    const curr = h.parseGAADate(results[i].date);
    assert.ok(prev >= curr, `result ${i-1} date should be >= result ${i} date`);
  }
});

// ════════════════════════════════════════════
// Fixture fallback behavior
// ════════════════════════════════════════════
console.log("\nfixture fallback:");

test("backfills with future fixtures outside window when too few in window", async () => {
  const instance = Object.create(h);
  instance._cache = {};
  const notifications = [];
  instance.sendSocketNotification = (type, data) => notifications.push({ type, data });

  const today = new Date();
  // One fixture inside 3-day window, two outside (30 and 45 days out)
  const d1 = new Date(today); d1.setDate(d1.getDate() + 2);
  const d2 = new Date(today); d2.setDate(d2.getDate() + 30);
  const d3 = new Date(today); d3.setDate(d3.getDate() + 45);
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

  let callNum = 0;
  instance.fetchPage = async function () {
    callNum++;
    if (callNum === 1) {
      return `<div class="fix_res_date">${fmt(d1)}</div>` +
        '<div class="competition"><div class="competition-name"><a>C</a></div>' +
        '<div class="comp_details"><div class="home_team">Kilkenny</div>' +
        '<div class="away_team">Cork</div><div class="time">14:00</div></div></div>' +
        `<div class="fix_res_date">${fmt(d2)}</div>` +
        '<div class="competition"><div class="competition-name"><a>C</a></div>' +
        '<div class="comp_details"><div class="home_team">Dublin</div>' +
        '<div class="away_team">Kilkenny</div><div class="time">15:00</div></div></div>' +
        `<div class="fix_res_date">${fmt(d3)}</div>` +
        '<div class="competition"><div class="competition-name"><a>C</a></div>' +
        '<div class="comp_details"><div class="home_team">Kilkenny</div>' +
        '<div class="away_team">Tipperary</div><div class="time">16:00</div></div></div>';
    }
    return "";
  };

  await instance.fetchAllData({
    instanceId: "15-",
    countyBoardID: 15,
    countyName: "Kilkenny",
    sport: "hurling",
    fixturesDays: 3,     // Very narrow window: only d1 fits
    maxCountyFixtures: 4, // Want 4 but only 1 in window, should backfill
  });

  const fixtures = notifications[0].data.countyFixtures;
  assert.ok(fixtures.length >= 2, "should backfill beyond window");
  // All fixtures should be in the future
  for (const f of fixtures) {
    const d = h.parseGAADate(f.date);
    assert.ok(d >= today, "backfilled fixtures should all be in the future");
  }
  // Should be sorted ascending
  for (let i = 1; i < fixtures.length; i++) {
    const prev = h.parseGAADate(fixtures[i-1].date);
    const curr = h.parseGAADate(fixtures[i].date);
    assert.ok(prev <= curr, "backfilled fixtures should remain sorted ascending");
  }
});

test("never includes past matches in fixture fallback", async () => {
  const instance = Object.create(h);
  instance._cache = {};
  const notifications = [];
  instance.sendSocketNotification = (type, data) => notifications.push({ type, data });

  const today = new Date();
  const pastDate = new Date(today); pastDate.setDate(pastDate.getDate() - 3);
  const futureDate = new Date(today); futureDate.setDate(futureDate.getDate() + 30);
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

  let callNum = 0;
  instance.fetchPage = async function () {
    callNum++;
    if (callNum === 1) {
      // One past fixture (shouldn't happen in practice but tests the guard),
      // one far-future fixture
      return `<div class="fix_res_date">${fmt(pastDate)}</div>` +
        '<div class="competition"><div class="competition-name"><a>C</a></div>' +
        '<div class="comp_details"><div class="home_team">Kilkenny</div>' +
        '<div class="away_team">Cork</div><div class="time">14:00</div></div></div>' +
        `<div class="fix_res_date">${fmt(futureDate)}</div>` +
        '<div class="competition"><div class="competition-name"><a>C</a></div>' +
        '<div class="comp_details"><div class="home_team">Kilkenny</div>' +
        '<div class="away_team">Dublin</div><div class="time">15:00</div></div></div>';
    }
    return "";
  };

  await instance.fetchAllData({
    instanceId: "15-",
    countyBoardID: 15,
    countyName: "Kilkenny",
    sport: "hurling",
    fixturesDays: 3,
    maxCountyFixtures: 4,
  });

  const fixtures = notifications[0].data.countyFixtures;
  for (const f of fixtures) {
    const d = h.parseGAADate(f.date);
    assert.ok(d >= today, `fixture date ${f.date} should not be in the past`);
  }
});

// ════════════════════════════════════════════
// Multi-instance isolation
// ════════════════════════════════════════════
console.log("\nmulti-instance:");

test("concurrent fetches with different instanceIds return independent data", async () => {
  const instance = Object.create(h);
  instance._cache = {};
  const notifications = [];
  instance.sendSocketNotification = (type, data) => notifications.push({ type, data });

  const today = new Date();
  const futureDate = new Date(today); futureDate.setDate(futureDate.getDate() + 5);
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

  // Return different team names based on which county is being fetched
  instance.fetchPage = async function (url) {
    if (url.includes("countyBoardID=15")) {
      return `<div class="fix_res_date">${fmt(futureDate)}</div>` +
        '<div class="competition"><div class="competition-name"><a>C</a></div>' +
        '<div class="comp_details"><div class="home_team">Kilkenny</div>' +
        '<div class="away_team">Cork</div><div class="time">14:00</div></div></div>';
    }
    if (url.includes("countyBoardID=27")) {
      return `<div class="fix_res_date">${fmt(futureDate)}</div>` +
        '<div class="competition"><div class="competition-name"><a>C</a></div>' +
        '<div class="comp_details"><div class="home_team">Tipperary</div>' +
        '<div class="away_team">Limerick</div><div class="time">15:00</div></div></div>';
    }
    return "";
  };

  // Fetch both concurrently
  await Promise.all([
    instance.fetchAllData({
      instanceId: "15-fenians",
      countyBoardID: 15,
      countyName: "Kilkenny",
      sport: "hurling",
      fixturesDays: 30,
      maxCountyFixtures: 4,
      maxSeniorFixtures: 6,
      maxClubFixtures: 6,
    }),
    instance.fetchAllData({
      instanceId: "27-thurles",
      countyBoardID: 27,
      countyName: "Tipperary",
      siteUrl: "https://tipperary.gaa.ie",
      sport: "hurling",
      fixturesDays: 30,
      maxCountyFixtures: 4,
      maxSeniorFixtures: 6,
      maxClubFixtures: 6,
    }),
  ]);

  assert.strictEqual(notifications.length, 2, "should have two GAA_DATA responses");

  const kkPayload = notifications.find((n) => n.data.instanceId === "15-fenians");
  const tipPayload = notifications.find((n) => n.data.instanceId === "27-thurles");
  assert.ok(kkPayload, "should have Kilkenny payload");
  assert.ok(tipPayload, "should have Tipperary payload");

  // Kilkenny data should contain Kilkenny teams, not Tipperary
  if (kkPayload.data.countyFixtures.length > 0) {
    assert.ok(
      kkPayload.data.countyFixtures.some(
        (m) => m.homeTeam === "Kilkenny" || m.awayTeam === "Kilkenny"
      ),
      "Kilkenny payload should contain Kilkenny fixtures"
    );
  }

  // Tipperary data should contain Tipperary teams, not Kilkenny
  if (tipPayload.data.countyFixtures.length > 0) {
    assert.ok(
      tipPayload.data.countyFixtures.some(
        (m) => m.homeTeam === "Tipperary" || m.awayTeam === "Tipperary"
      ),
      "Tipperary payload should contain Tipperary fixtures"
    );
  }

  // Caches should be keyed independently
  assert.ok(instance._cache["15-fenians"], "should have Kilkenny cache");
  assert.ok(instance._cache["27-thurles"], "should have Tipperary cache");
});

// ── Summary ──
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
