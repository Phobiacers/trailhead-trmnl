import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(rootDir, "catalog", "trails.json");
const generatedPath = path.join(rootDir, "worker", "catalog.generated.js");
const importDir = path.join(rootDir, "trmnl-import");
const publicApiDir = path.join(rootDir, "public", "api");
const requiredImportFiles = [
  "settings.yml",
  "full.liquid",
  "half_horizontal.liquid",
  "half_vertical.liquid",
  "quadrant.liquid"
];

const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
validateCatalog(catalog);
await validateImportFiles();
await validateStaticApi();
await validateWorker();

console.log("Validation passed");

function validateCatalog(source) {
  if (!source.metadata || !source.states) {
    throw new Error("catalog/trails.json must include metadata and states");
  }

  const ids = new Set();
  for (const [stateKey, state] of Object.entries(source.states)) {
    if (!/^[a-z]{2}$/.test(stateKey)) {
      throw new Error(`State key must be two lowercase letters: ${stateKey}`);
    }
    if (!state.label || !Array.isArray(state.trails) || state.trails.length === 0) {
      throw new Error(`State ${stateKey} needs a label and at least one trail`);
    }

    for (const trail of state.trails) {
      const prefix = `${stateKey}/${trail.id || "missing-id"}`;
      required(prefix, trail, [
        "id",
        "name",
        "region",
        "difficulty",
        "length_mi",
        "elevation_gain_ft",
        "season",
        "highlight",
        "obstacle",
        "route",
        "profile"
      ]);

      if (ids.has(trail.id)) throw new Error(`Duplicate trail id: ${trail.id}`);
      ids.add(trail.id);
      if (trail.difficulty < 1 || trail.difficulty > 10) {
        throw new Error(`${prefix} difficulty must be 1-10`);
      }
      if (trail.length_mi <= 0 || trail.elevation_gain_ft < 0) {
        throw new Error(`${prefix} length/gain values are invalid`);
      }
      if (trail.season.start_month < 1 || trail.season.start_month > 12 || trail.season.end_month < 1 || trail.season.end_month > 12) {
        throw new Error(`${prefix} season months must be 1-12`);
      }
      required(prefix, trail.obstacle, ["name", "mile", "position_pct", "trace_x", "trace_y", "blurb"]);
      required(prefix, trail.route, ["path"]);
      required(prefix, trail.profile, ["points", "min_ft", "max_ft"]);
    }
  }
}

async function validateImportFiles() {
  for (const filename of requiredImportFiles) {
    const filePath = path.join(importDir, filename);
    await access(filePath);
    const fileStat = await stat(filePath);
    if (fileStat.size > 1024 * 1024) {
      throw new Error(`${filename} exceeds TRMNL's 1 MB template limit`);
    }
  }

  const settings = await readFile(path.join(importDir, "settings.yml"), "utf8");
  for (const expected of ["strategy: polling", "polling_url:", "custom_fields:", "field_type: select", "field_type: boolean"]) {
    if (!settings.includes(expected)) {
      throw new Error(`settings.yml is missing ${expected}`);
    }
  }

  if (!settings.includes(".github.io/")) {
    throw new Error("settings.yml should use a GitHub Pages polling URL");
  }

  for (const filename of requiredImportFiles.filter((name) => name.endsWith(".liquid"))) {
    const template = await readFile(path.join(importDir, filename), "utf8");
    for (const expected of ["route_path", "obstacle_name", "title_bar"]) {
      if (!template.includes(expected)) {
        throw new Error(`${filename} is missing ${expected}`);
      }
    }
  }
}

async function validateStaticApi() {
  const samplePath = path.join(publicApiDir, "ut", "difficulty-8", "seasonal-true.json");
  await access(samplePath).catch(() => {
    throw new Error("Static API files are missing. Run npm run generate:static first.");
  });

  const sample = JSON.parse(await readFile(samplePath, "utf8"));
  if (!sample.trail_name || sample.state !== "ut" || sample.max_difficulty !== 8) {
    throw new Error("Static API sample did not include the expected Utah trail payload");
  }
}

async function validateWorker() {
  await access(generatedPath).catch(() => {
    throw new Error("worker/catalog.generated.js is missing. Run npm run generate first.");
  });

  const workerModule = await import(pathToFileURL(path.join(rootDir, "worker", "index.js")).href);
  const response = await workerModule.default.fetch(
    new Request("https://trailhead.test/api/trailhead?state=ut&max_difficulty=8&seasonal_only=false&date=2026-06-13")
  );
  if (!response.ok) {
    throw new Error(`Worker returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (!payload.trail_name || payload.state !== "ut" || payload.empty) {
    throw new Error("Worker payload did not include the selected Utah trail");
  }
}

function required(prefix, object, keys) {
  for (const key of keys) {
    if (object[key] === undefined || object[key] === null || object[key] === "") {
      throw new Error(`${prefix} is missing ${key}`);
    }
  }
}
