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
  const routeAnchors = getRouteAnchors(trail.route.path);
  return {
    plugin: "Trailhead",
    empty: false,
    generated_at: now.toISOString(),
    date: now.toISOString().slice(0, 10),
    state: stateKey,
    state_label: state.label,
    catalog_version: catalog.metadata.version,
    catalog_updated: catalog.metadata.updated,
    max_difficulty: maxDifficulty,
    seasonal_only: seasonalOnly,
    season_matched: seasonMatched,
    cycle_day_of_year: dayOfYear,
    cycle_index: index,
    cycle_index_display: index + 1,
    cycle_eligible_count: eligible.length,
    cycle_state_trail_count: state.trails.length,
    trail_id: trail.id,
    trail_name: trail.name,
    trail_region: trail.region,
    difficulty: trail.difficulty,
    length_mi: trail.length_mi,
    elevation_gain_ft: trail.elevation_gain_ft,
    season_label: trail.season.label,
    season_note: trail.season.note,
    highlight: trail.highlight,
    obstacle_name: trail.obstacle.name,
    obstacle_mile: trail.obstacle.mile,
    obstacle_position_pct: trail.obstacle.position_pct,
    obstacle_trace_x: trail.obstacle.trace_x,
    obstacle_trace_y: trail.obstacle.trace_y,
    obstacle_blurb: trail.obstacle.blurb,
    route_path: trail.route.path,
    route_start_x: routeAnchors.startX,
    route_start_y: routeAnchors.startY,
    route_end_x: routeAnchors.endX,
    route_end_y: routeAnchors.endY,
    profile_points: trail.profile.points,
    profile_min_ft: trail.profile.min_ft,
    profile_max_ft: trail.profile.max_ft
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

function getRouteAnchors(routePath) {
  const coordinates = [...String(routePath).matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number.parseFloat(match[0]));
  if (coordinates.length < 4) {
    return { startX: 6, startY: 43, endX: 94, endY: 31 };
  }
  return {
    startX: coordinates[0],
    startY: coordinates[1],
    endX: coordinates[coordinates.length - 2],
    endY: coordinates[coordinates.length - 1]
  };
}
