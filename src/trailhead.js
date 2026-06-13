export function buildTrailheadPayload(catalog, params = new URLSearchParams()) {
  const stateKey = normalizeState(catalog, getParam(params, "state"));
  const state = catalog.states[stateKey];
  const now = parseDate(getParam(params, "date")) || new Date();
  const month = now.getUTCMonth() + 1;
  const dayOfYear = getDayOfYear(now);
  const maxDifficulty = clampInteger(getParam(params, "max_difficulty"), 1, 10, 10);
  const seasonalOnly = parseBoolean(getParam(params, "seasonal_only"), true);

  const difficultyMatches = state.trails.filter((trail) => trail.difficulty <= maxDifficulty);
  let eligible = seasonalOnly
    ? difficultyMatches.filter((trail) => isMonthInSeason(month, trail.season))
    : difficultyMatches;

  const seasonMatched = eligible.length > 0;
  if (eligible.length === 0) {
    eligible = difficultyMatches.length > 0 ? difficultyMatches : state.trails;
  }

  if (eligible.length === 0) {
    return {
      plugin: "Trailhead",
      empty: true,
      message: "No trails are available for this state yet.",
      state: stateKey,
      state_label: state.label,
      generated_at: now.toISOString()
    };
  }

  const index = dayOfYear % eligible.length;
  const trail = eligible[index];

  return {
    plugin: "Trailhead",
    empty: false,
    generated_at: now.toISOString(),
    date: now.toISOString().slice(0, 10),
    state: stateKey,
    state_label: state.label,
    catalog: {
      version: catalog.metadata.version,
      updated: catalog.metadata.updated,
      note: catalog.metadata.route_note
    },
    filters: {
      max_difficulty: maxDifficulty,
      seasonal_only: seasonalOnly,
      season_matched: seasonMatched
    },
    cycle: {
      day_of_year: dayOfYear,
      index,
      index_display: index + 1,
      eligible_count: eligible.length,
      state_trail_count: state.trails.length
    },
    trail,
    trails: eligible,
    alternates: eligible
      .filter((candidate) => candidate.id !== trail.id)
      .slice(0, 3)
      .map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        difficulty: candidate.difficulty,
        length_mi: candidate.length_mi,
        obstacle_name: candidate.obstacle.name
      }))
  };
}

export function listStates(catalog) {
  return Object.entries(catalog.states).map(([key, value]) => ({
    key,
    label: value.label,
    trail_count: value.trails.length
  }));
}

function getParam(params, key) {
  if (typeof params.get === "function") {
    return params.get(key);
  }
  return params[key];
}

function normalizeState(catalog, rawState) {
  const key = String(rawState || "ut").trim().toLowerCase();
  return catalog.states[key] ? key : "ut";
}

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getDayOfYear(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const current = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((current - start) / 86400000);
}

function isMonthInSeason(month, season) {
  if (!season) return true;
  const start = season.start_month;
  const end = season.end_month;
  if (start <= end) {
    return month >= start && month <= end;
  }
  return month >= start || month <= end;
}

function parseBoolean(value, fallback) {
  if (value == null || value === "") return fallback;
  return !["false", "0", "no", "off"].includes(String(value).trim().toLowerCase());
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
