import assert from "node:assert/strict";
import test from "node:test";

function action(overrides) {
  return {
    action: "place_search",
    destinationQuery: null,
    destinationLabel: null,
    tripDays: null,
    startDate: null,
    placeQuery: null,
    placeLabel: null,
    placeType: null,
    cuisineQuery: null,
    cuisineLabel: null,
    minRating: null,
    budgetAmount: null,
    budgetCurrency: null,
    time: null,
    explanation: "准备执行行程动作",
    ...overrides,
  };
}

test("agent returns every intent as a strict action array", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only-key";
  let requestBody;

  global.fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      output_text: JSON.stringify({
        actions: [
          action({
            action: "shopping_search",
            placeQuery: "Printemps Haussmann, Paris",
            placeLabel: "巴黎春天",
            time: "17:30",
            explanation: "先安排巴黎春天购物",
          }),
          action({
            action: "dining_search",
            cuisineQuery: "French restaurant",
            cuisineLabel: "法国菜",
            time: "19:30",
            explanation: "再安排法国晚餐",
          }),
        ],
        explanation: "先购物，再吃法国晚餐",
      }),
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("agent-actions-test", `${process.pid}-${Date.now()}`);
    const { default: worker } = await import(workerUrl.href);
    const response = await worker.fetch(
      new Request("http://localhost/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "今晚去吃法国大餐顺便去巴黎春天购物", location: { name: "巴黎", lat: 48.86, lng: 2.35 } }),
      }),
      { OPENAI_API_KEY: "test-only-key", ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
      { waitUntil() {}, passThroughOnException() {} },
    );
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(data.actions.map((item) => item.action), ["shopping_search", "dining_search"]);
    assert.equal(data.action.action, "shopping_search");
    assert.equal(requestBody.text.format.strict, true);
    assert.equal(requestBody.text.format.schema.properties.actions.type, "array");
    assert.equal(requestBody.text.format.schema.properties.actions.minItems, 1);
    assert.equal(requestBody.text.format.schema.properties.actions.maxItems, 6);
    assert.equal(requestBody.text.format.schema.properties.actions.items.additionalProperties, false);
    assert.ok(requestBody.text.format.schema.properties.actions.items.properties.action.enum.includes("nearby_search"));
    assert.ok(requestBody.text.format.schema.properties.actions.items.properties.placeType.enum.includes("pharmacy"));
    assert.ok(requestBody.text.format.schema.properties.actions.items.properties.placeType.enum.includes("craft"));
    assert.match(requestBody.instructions, /所有独立意图/);
    assert.match(requestBody.instructions, /shopping_search 和 dining_search/);
    assert.match(requestBody.instructions, /附近生活地点或小型商铺/);
    assert.match(requestBody.instructions, /附近有药店吗/);
    assert.match(requestBody.instructions, /巴黎手工艺品商店/);
    assert.match(requestBody.instructions, /明确说了城市/);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});
