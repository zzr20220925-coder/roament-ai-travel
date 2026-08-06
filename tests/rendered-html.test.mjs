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
  assert.match(html, /class="journey-column"/);
  assert.match(html, /class="journey-scroll"/);
  assert.match(html, /aria-label="今日行程地图"/);
  assert.match(html, /aria-label="切换为 3D 地图"/);
  assert.match(html, /旅行中心/);
  assert.match(html, /今天想去哪里？/);
  assert.match(html, /全部行程/);
  assert.match(html, /纽约＋巴黎/);
  assert.match(html, /我想去凯旋门/);
  assert.match(html, /9月1日开始去纽约5天/);
  assert.doesNotMatch(html, /卢浮宫|圣日耳曼|塞纳河日落|巴黎经典与左岸/);
  assert.doesNotMatch(html, /今晚法国菜 · 4\.5\+ · €20/);
  assert.match(html, /OPEN WORLD/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("uses OpenAI with verified open-map candidates and keeps responsive behavior", async () => {
  const [page, css, envExample, configRoute, diningRoute, placeSearchRoute, agentRoute, routesRoute, itineraryRoute, weatherRoute, weatherUtil, placeIntent] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../app/api/config/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/dining/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/place-search/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/agent/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/routes/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/itinerary/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/weather/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/weather.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/place-intent.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /tiles\.openfreemap\.org\/styles\/liberty/);
  assert.match(page, /openstreetmap\.org\/directions/);
  assert.match(page, /OPENSTREETMAP/);
  assert.match(page, /await import\("maplibre-gl"\)/);
  assert.doesNotMatch(page, /pitch: isMobile/);
  assert.match(page, /pitch: 0/);
  assert.match(page, /Math\.max\(map\.getZoom\(\), 15\.6\)/);
  assert.match(page, /"fill-extrusion-height"/);
  assert.match(page, /setMap3D\(\(current\) => !current\)/);
  assert.doesNotMatch(page, /google\.com\/maps|GOOGLE ROUTE|GOOGLE PLACES/i);

  assert.match(configRoute, /apiKeyRequired:\s*false/);
  assert.match(configRoute, /OpenFreeMap/);
  assert.match(diningRoute, /nominatim\.openstreetmap\.org/);
  assert.match(placeSearchRoute, /nominatim\.openstreetmap\.org/);
  assert.match(placeSearchRoute, /provider:\s*"openstreetmap"/);
  assert.match(placeSearchRoute, /overpass-api\.de\/api\/interpreter/);
  assert.match(placeSearchRoute, /searchNearbyType/);
  assert.match(placeSearchRoute, /geocodeSearchCenter/);
  assert.match(agentRoute, /place_search/);
  assert.match(agentRoute, /shopping_search/);
  assert.match(agentRoute, /nearby_search/);
  assert.match(agentRoute, /destination_plan/);
  assert.match(agentRoute, /actions:\s*plan\.actions\.slice\(0, 6\)|const actions = plan\.actions\.slice\(0, 6\)/);
  assert.match(agentRoute, /maxItems:\s*6/);
  assert.match(agentRoute, /tripDays/);
  assert.match(agentRoute, /startDate/);
  assert.match(routesRoute, /routing\.openstreetmap\.de/);
  assert.match(itineraryRoute, /api\.openai\.com\/v1\/responses/);
  assert.match(itineraryRoute, /type:\s*"json_schema"/);
  assert.match(itineraryRoute, /allowedIds\.has\(stop\.placeId\)/);
  assert.match(itineraryRoute, /tripStartDate/);
  assert.match(weatherRoute, /buildWeatherUrl/);
  assert.match(weatherUtil, /api\.open-meteo\.com\/v1\/forecast/);
  assert.match(weatherUtil, /sunrise,sunset/);
  assert.match(weatherUtil, /timezone.*auto/);
  assert.match(page, /weather-glance/);
  assert.match(page, /日落/);
  assert.match(page, /resolvePlanDays/);
  assert.match(page, /planDestinationTrip/);
  assert.match(page, /executeAgentActions/);
  assert.match(page, /for \(const \[index, action\] of actions\.entries\(\)\)/);
  assert.match(page, /action\.action === "shopping_search"/);
  assert.match(page, /action\.action === "nearby_search"/);
  assert.match(page, /detectNearbyPlaceType/);
  assert.match(page, /searchLocationQuery/);
  assert.match(placeIntent, /pharmacy/);
  assert.match(placeIntent, /craft/);
  assert.match(placeIntent, /luggage/);
  assert.match(page, /OpenAI 正在按你的节奏、预算和兴趣编排多日路线/);
  assert.doesNotMatch(envExample, /GOOGLE_MAPS|GOOGLE_SEARCH/i);

  assert.match(css, /@media\(max-width:900px\)/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(css, /min-height:100svh/);
  assert.match(css, /height:min\(92svh,820px\)/);
  assert.match(css, /\.journey-scroll\{[^}]*overflow-y:auto/);
  assert.match(css, /\.focus-pane\{[^}]*overflow:visible/);
  assert.match(css, /html,body\{overflow-x:hidden\}/);
  assert.match(css, /\.command-layout\{width:100%;max-width:100%;min-width:0;[^}]*overflow-x:clip/);
  assert.match(css, /\.focus-pane\{order:1;[^}]*overflow:hidden/);
  assert.match(css, /\.map-host,\.map-host\.maplibregl-map,[^}]*max-width:100%/);
  assert.match(css, /max-width:100dvw;overflow-x:hidden/);
  assert.match(css, /\.map-top \.map-dimension\.active/);
  assert.match(css, /\.route-map\{order:2;[^}]*min-height:390px/);
  assert.doesNotMatch(css, /@media\(max-width:900px\)\{body\{overflow:auto\}/);
  assert.match(css, /\.day-line\{[^}]*background:transparent/);
  assert.doesNotMatch(css, /grid-template-areas:"focus map" "timeline map"/);
});
