import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the completed travel agent", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /<title>michi — 会接管变化的 AI 私人导游<\/title>/i);
  assert.match(html, /class="michi-shell"/);
  assert.match(html, /aria-label="今日行程地图"/);
  assert.match(html, /旅行中心/);
  assert.match(html, /我想去凯旋门/);
  assert.match(html, /9月1日开始去纽约5天/);
  assert.doesNotMatch(html, /今晚法国菜 · 4\.5\+ · €20/);
  assert.match(html, /OPEN MAP/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("uses OpenAI with verified open-map candidates and keeps responsive behavior", async () => {
  const [page, css, envExample, configRoute, diningRoute, placeSearchRoute, agentRoute, routesRoute, itineraryRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../app/api/config/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/dining/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/place-search/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/agent/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/routes/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/itinerary/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /tiles\.openfreemap\.org\/styles\/liberty/);
  assert.match(page, /openstreetmap\.org\/directions/);
  assert.match(page, /OPENSTREETMAP/);
  assert.match(page, /await import\("maplibre-gl"\)/);
  assert.doesNotMatch(page, /google\.com\/maps|GOOGLE ROUTE|GOOGLE PLACES/i);

  assert.match(configRoute, /apiKeyRequired:\s*false/);
  assert.match(configRoute, /OpenFreeMap/);
  assert.match(diningRoute, /nominatim\.openstreetmap\.org/);
  assert.match(placeSearchRoute, /nominatim\.openstreetmap\.org/);
  assert.match(placeSearchRoute, /provider:\s*"openstreetmap"/);
  assert.match(agentRoute, /place_search/);
  assert.match(agentRoute, /destination_plan/);
  assert.match(agentRoute, /tripDays/);
  assert.match(agentRoute, /startDate/);
  assert.match(routesRoute, /routing\.openstreetmap\.de/);
  assert.match(itineraryRoute, /api\.openai\.com\/v1\/responses/);
  assert.match(itineraryRoute, /type:\s*"json_schema"/);
  assert.match(itineraryRoute, /allowedIds\.has\(stop\.placeId\)/);
  assert.match(itineraryRoute, /tripStartDate/);
  assert.match(page, /resolvePlanDays/);
  assert.match(page, /planDestinationTrip/);
  assert.match(page, /OpenAI 正在按你的节奏、预算和兴趣编排多日路线/);
  assert.doesNotMatch(envExample, /GOOGLE_MAPS|GOOGLE_SEARCH/i);

  assert.match(css, /@media\(max-width:900px\)/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(css, /min-height:100svh/);
  assert.match(css, /height:min\(92svh,820px\)/);
});
