import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTrailheadPayload, listStates } from "../src/trailhead.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(rootDir, "catalog", "trails.json");
const publicDir = path.join(rootDir, "public");
const apiDir = path.join(publicDir, "api");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const generatedDate = process.env.TRAILHEAD_DATE || new Date().toISOString().slice(0, 10);

await rm(apiDir, { force: true, recursive: true });
await mkdir(apiDir, { recursive: true });

await writeJson(path.join(apiDir, "states.json"), {
  generated_at: new Date().toISOString(),
  generated_for_date: generatedDate,
  states: listStates(catalog)
});

await writeJson(path.join(apiDir, "catalog.json"), {
  metadata: catalog.metadata,
  states: listStates(catalog)
});

let fileCount = 2;
for (const [stateKey, state] of Object.entries(catalog.states)) {
  for (let maxDifficulty = 1; maxDifficulty <= 10; maxDifficulty += 1) {
    for (const seasonalOnly of [true, false]) {
      const payload = buildTrailheadPayload(catalog, {
        state: stateKey,
        max_difficulty: String(maxDifficulty),
        seasonal_only: String(seasonalOnly),
        date: generatedDate
      });

      for (const stateSegment of getStatePathAliases(stateKey, state.label)) {
        for (const seasonalSegment of getSeasonalPathAliases(seasonalOnly)) {
          const outputPath = path.join(
            apiDir,
            stateSegment,
            `difficulty-${maxDifficulty}`,
            `seasonal-${seasonalSegment}.json`
          );
          await writeJson(outputPath, payload);
          fileCount += 1;
        }
      }
    }
  }
}

await writeFile(
  path.join(publicDir, "index.html"),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Trailhead TRMNL API</title>
  </head>
  <body>
    <h1>Trailhead TRMNL API</h1>
    <p>Static JSON endpoint for the Trailhead private TRMNL plugin.</p>
    <p>Generated for ${generatedDate}.</p>
  </body>
</html>
`
);

console.log(`Generated ${fileCount} static API files in public/api for ${generatedDate}`);

async function writeJson(outputPath, value) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(value)}\n`);
}

function getStatePathAliases(stateKey, label) {
  return unique([stateKey, label, label.toLowerCase()]);
}

function getSeasonalPathAliases(seasonalOnly) {
  return seasonalOnly ? ["true", "1", "yes", "on"] : ["false", "0", "no", "off", ""];
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null))];
}
