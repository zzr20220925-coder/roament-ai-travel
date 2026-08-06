import assert from "node:assert/strict";
import test from "node:test";

async function routeWorker(suffix) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("nearby-place-test", `${suffix}-${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

async function search(worker, body) {
  return worker.fetch(
    new Request("http://localhost/api/place-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("searches pharmacies by OSM category and keeps the real business name", async () => {
  const originalFetch = global.fetch;
  let overpassBody = "";
  global.fetch = async (url, init) => {
    assert.match(String(url), /overpass-api\.de\/api\/interpreter/);
    overpassBody = String(init?.body);
    return new Response(JSON.stringify({ elements: [{
      id: 101,
      type: "node",
      lat: 48.861,
      lon: 2.351,
      tags: { name: "Pharmacie du Centre", amenity: "pharmacy", opening_hours: "Mo-Sa 08:00-20:00" },
    }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const response = await search(await routeWorker("pharmacy"), {
      query: "pharmacy",
      label: "药店",
      category: "local",
      placeType: "pharmacy",
      location: { name: "巴黎", lat: 48.86, lng: 2.35 },
    });
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.match(decodeURIComponent(overpassBody), /\["amenity"="pharmacy"\]/);
    assert.equal(data.placeType, "pharmacy");
    assert.equal(data.places[0].name, "Pharmacie du Centre");
    assert.equal(data.places[0].category, "shopping");
    assert.equal(data.places[0].icon, "药");
  } finally {
    global.fetch = originalFetch;
  }
});

test("searches craft stores with multiple real OSM shop tags", async () => {
  const originalFetch = global.fetch;
  let overpassBody = "";
  global.fetch = async (url, init) => {
    if (String(url).includes("nominatim.openstreetmap.org")) {
      return new Response(JSON.stringify([{ lat: "48.86", lon: "2.35", display_name: "Paris, France" }]), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    overpassBody = String(init?.body);
    return new Response(JSON.stringify({ elements: [{
      id: 202,
      type: "way",
      center: { lat: 48.862, lon: 2.352 },
      tags: { "name:zh": "巴黎手作工坊", name: "Atelier de Paris", shop: "craft" },
    }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const response = await search(await routeWorker("craft"), {
      query: "handicraft shop, Paris",
      label: "巴黎手工艺品商店",
      category: "local",
      placeType: "craft",
      searchLocationQuery: "Paris, France",
      location: { name: "选择目的地", lat: 24, lng: 12 },
    });
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.match(decodeURIComponent(overpassBody), /craft\|handicraft\|art\|gift/);
    assert.match(decodeURIComponent(overpassBody), /around:12000,48\.86,2\.35/);
    assert.equal(data.placeType, "craft");
    assert.equal(data.places[0].name, "巴黎手作工坊");
    assert.equal(data.places[0].localName, "Atelier de Paris");
    assert.ok(data.places[0].tags.includes("手工艺品店"));
  } finally {
    global.fetch = originalFetch;
  }
});
