import { CATALOG } from "./catalog.generated.js";
import { buildTrailheadPayload, listStates } from "../src/trailhead.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=900"
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "content-type"
        }
      });
    }

    if (url.pathname === "/api/states") {
      return jsonResponse(listStates(CATALOG));
    }

    if (url.pathname === "/" || url.pathname === "/api/trailhead") {
      return jsonResponse(buildTrailheadPayload(CATALOG, url.searchParams));
    }

    return jsonResponse({ error: "not_found" }, 404);
  }
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: JSON_HEADERS
  });
}
