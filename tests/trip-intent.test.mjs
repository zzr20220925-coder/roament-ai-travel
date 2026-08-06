import assert from "node:assert/strict";
import test from "node:test";
import { parseDestinationIntent, parseDestinationIntents } from "../lib/trip-intent.ts";

const now = new Date(2026, 7, 5, 12, 0, 0);

const globalCases = [
  ["我想去纽约五天，九月1号开始", "纽约", 5, "2026-09-01"],
  ["9月1号开始去巴黎5天", "巴黎", 5, "2026-09-01"],
  ["东京旅行五天", "东京", 5, null],
  ["帮我安排伦敦四天行程", "伦敦", 4, null],
  ["曼谷玩3天", "曼谷", 3, null],
  ["去迪拜度假七天", "迪拜", 7, null],
  ["悉尼6日游，2026-12-02出发", "悉尼", 6, "2026-12-02"],
  ["去São Paulo玩四天", "São Paulo", 4, null],
  ["I want to visit Reykjavík for 4 days starting September 1", "Reykjavík", 4, "2026-09-01"],
  ["Travel to Cape Town for 8 days from October 12, 2026", "Cape Town", 8, "2026-10-12"],
];

test("recognizes representative worldwide destinations without city-specific rules", () => {
  for (const [input, destination, days, startDate] of globalCases) {
    const result = parseDestinationIntent(input, now);
    assert.ok(result, input);
    assert.equal(result.destinationQuery, destination, input);
    assert.equal(result.days, days, input);
    assert.equal(result.startDate, startDate, input);
  }
});

test("does not turn an ordinary landmark request into a multi-day trip", () => {
  assert.equal(parseDestinationIntent("我想去凯旋门", now), null);
  assert.equal(parseDestinationIntent("9月1号去凯旋门", now), null);
});

test("caps very long requests and defaults unspecific trips to three days", () => {
  assert.equal(parseDestinationIntent("去冰岛旅行", now)?.days, 3);
  assert.equal(parseDestinationIntent("去罗马30天", now)?.days, 14);
});

test("splits a multi-city request into independently viewable trips", () => {
  const trips = parseDestinationIntents("纽约玩五天再去巴黎", now);
  assert.deepEqual(trips.map((trip) => [trip.destinationQuery, trip.days]), [["纽约", 5], ["巴黎", 3]]);

  const datedTrips = parseDestinationIntents("9月1日去东京4天，然后去首尔2天", now);
  assert.deepEqual(datedTrips.map((trip) => [trip.destinationQuery, trip.days, trip.startDate]), [
    ["东京", 4, "2026-09-01"],
    ["首尔", 2, null],
  ]);
});
