import assert from "node:assert/strict";
import test from "node:test";

import { detectNearbyPlaceType, nearbyPlaceDefinitions } from "../lib/place-intent.ts";
import { nearbyPlaceSearchConfig } from "../lib/place-search-config.ts";

test("recognizes useful small-place categories in Chinese and English", () => {
  const cases = [
    ["附近有没有药店", "pharmacy"],
    ["找巴黎手工艺品商店", "craft"],
    ["想找一家独立书店", "bookstore"],
    ["附近的跳蚤市场", "market"],
    ["酒店边上有没有便利店", "convenience"],
    ["哪里可以洗衣服", "laundry"],
    ["找个 ATM 取现金", "atm"],
    ["附近行李寄存", "luggage"],
    ["Where is the nearest pharmacy?", "pharmacy"],
    ["Find a craft shop", "craft"],
  ];

  for (const [prompt, expected] of cases) {
    assert.equal(detectNearbyPlaceType(prompt), expected, prompt);
  }
});

test("every nearby type has a usable open-map search definition", () => {
  for (const definition of Object.values(nearbyPlaceDefinitions)) {
    assert.ok(definition.label);
    assert.ok(definition.searchTerm);
  }
  for (const config of Object.values(nearbyPlaceSearchConfig)) {
    assert.ok(config.icon);
    assert.ok(config.radiusMeters >= 3_000);
    assert.ok(config.selectors.every((selector) => selector.startsWith("[")));
  }
});
