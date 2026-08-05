import { NextRequest, NextResponse } from "next/server";

type Currency = "EUR" | "USD" | "GBP" | "JPY" | "CNY";
type DiningIntent = {
  cuisine: string;
  cuisineLabel: string;
  minRating: number;
  budget: number;
  currency: Currency;
  time: string;
};
type NominatimPlace = {
  place_id?: number;
  osm_id?: number;
  osm_type?: "node" | "way" | "relation";
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
  namedetails?: Record<string, string>;
  extratags?: Record<string, string>;
};

const cuisineRules: Array<[RegExp, string, string]> = [
  [/法国|法餐|french/i, "French restaurant", "法国菜"],
  [/意大利|意餐|italian/i, "Italian restaurant", "意大利菜"],
  [/日料|日本|寿司|japanese|sushi/i, "Japanese restaurant", "日本料理"],
  [/西班牙|tapas|spanish/i, "Spanish restaurant", "西班牙菜"],
  [/海鲜|seafood/i, "Seafood restaurant", "海鲜"],
  [/素食|vegetarian|vegan/i, "Vegetarian restaurant", "素食"],
];
const cache = new Map<string, { expires: number; value: unknown }>();
let lastSearchAt = 0;

function parseIntent(prompt: string): DiningIntent {
  const cuisine = cuisineRules.find(([rule]) => rule.test(prompt));
  const numeric = [...prompt.matchAll(/\d(?:\.\d)?/g)]
    .map((match) => Number(match[0]))
    .find((value) => value >= 1 && value <= 5);
  const budgetMatch = prompt.match(/([€$£¥])\s*(\d{1,5})|(\d{1,5})\s*(欧元?|美元?|英镑|日元|人民币|EUR|USD|GBP|JPY|CNY)/i);
  const currencyText = `${budgetMatch?.[1] ?? ""}${budgetMatch?.[4] ?? ""}`;
  const currency: Currency = /\$|美元|USD/i.test(currencyText) ? "USD" : /£|英镑|GBP/i.test(currencyText) ? "GBP" : /日元|JPY/i.test(currencyText) ? "JPY" : /¥|人民币|CNY/i.test(currencyText) ? "CNY" : "EUR";
  const timeMatch = prompt.match(/(?:今晚|晚上?|晚餐|dinner).*?(\d{1,2})(?::(\d{2})|点(?:(\d{1,2})分?)?)/i);
  const hour = timeMatch ? Math.min(23, Math.max(17, Number(timeMatch[1]))) : 19;
  const minute = timeMatch?.[2] || timeMatch?.[3] ? Math.min(59, Number(timeMatch[2] ?? timeMatch[3])) : 30;
  return {
    cuisine: cuisine?.[1] ?? "Local restaurant",
    cuisineLabel: cuisine?.[2] ?? "当地餐厅",
    minRating: Math.min(5, Math.max(3.5, numeric ?? 4.5)),
    budget: Number(budgetMatch?.[2] ?? budgetMatch?.[3] ?? 20),
    currency,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function currencySymbol(currency: Currency) {
  return currency === "USD" ? "$" : currency === "GBP" ? "£" : currency === "JPY" || currency === "CNY" ? "¥" : "€";
}

function osmUri(place: NominatimPlace) {
  if (!place.osm_id || !place.osm_type) return "https://www.openstreetmap.org";
  return `https://www.openstreetmap.org/${place.osm_type}/${place.osm_id}`;
}

async function respectPublicRateLimit() {
  const wait = Math.max(0, 1_100 - (Date.now() - lastSearchAt));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastSearchAt = Date.now();
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { prompt?: string; location?: { name?: string; lat?: number; lng?: number }; intent?: Partial<DiningIntent> };
  const lat = body.location?.lat;
  const lng = body.location?.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ error: "缺少旅行中心位置" }, { status: 400 });

  const parsed = parseIntent(body.prompt ?? "今晚法国菜，人均 20 欧");
  const intent: DiningIntent = body.intent ? {
    cuisine: String(body.intent.cuisine ?? parsed.cuisine).slice(0, 80),
    cuisineLabel: String(body.intent.cuisineLabel ?? parsed.cuisineLabel).slice(0, 30),
    minRating: Math.min(5, Math.max(1, Number(body.intent.minRating ?? parsed.minRating))),
    budget: Math.max(0, Number(body.intent.budget ?? parsed.budget)),
    currency: (["EUR", "USD", "GBP", "JPY", "CNY"].includes(String(body.intent.currency)) ? body.intent.currency : parsed.currency) as Currency,
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.intent.time)) ? String(body.intent.time) : parsed.time,
  } : parsed;

  const cacheKey = `${lat!.toFixed(3)},${lng!.toFixed(3)}:${intent.cuisine.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return NextResponse.json(cached.value, { headers: { "Cache-Control": "public, max-age=900" } });

  const deltaLat = 0.04;
  const deltaLng = 0.055;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", intent.cuisine);
  url.searchParams.set("limit", "18");
  url.searchParams.set("accept-language", "zh-CN,en");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("namedetails", "1");
  url.searchParams.set("extratags", "1");
  url.searchParams.set("bounded", "1");
  url.searchParams.set("viewbox", `${lng! - deltaLng},${lat! + deltaLat},${lng! + deltaLng},${lat! - deltaLat}`);

  try {
    await respectPublicRateLimit();
    const response = await fetch(url, {
      headers: { "User-Agent": "michi-ai-travel/1.0 (+https://michi-ai-travel.zzr20220925.chatgpt.site)", "Accept-Language": "zh-CN,en;q=0.8" },
      signal: AbortSignal.timeout(9_000),
    });
    if (!response.ok) return NextResponse.json({ error: "开放地点服务暂时不可用" }, { status: 502 });
    const raw = await response.json() as NominatimPlace[];
    const center = { lat: lat!, lng: lng! };
    const symbol = currencySymbol(intent.currency);
    const places = raw.flatMap((item) => {
      const placeLat = Number(item.lat);
      const placeLng = Number(item.lon);
      const name = item.namedetails?.["name:zh"] ?? item.namedetails?.name ?? item.name ?? item.display_name?.split(",")[0];
      if (!name || !Number.isFinite(placeLat) || !Number.isFinite(placeLng)) return [];
      const distance = distanceKm(center, { lat: placeLat, lng: placeLng });
      const openingHours = item.extratags?.opening_hours;
      return [{
        id: String(item.place_id ?? `${item.osm_type}-${item.osm_id}`),
        name,
        address: item.display_name ?? body.location?.name ?? "地址待确认",
        lat: placeLat,
        lng: placeLng,
        rating: null,
        userRatingCount: null,
        priceLabel: "价格待确认",
        budgetFit: "unknown" as const,
        priceEvidence: `开放地图没有统一人均价格；目标 ${symbol}${intent.budget} 请在菜单中确认`,
        openingLabel: openingHours ? `营业时间 ${openingHours}` : `${intent.time} 营业状态待确认`,
        openAtRequestedTime: null,
        distance: distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`,
        detailsUri: osmUri(item),
        source: "openstreetmap" as const,
        cuisine: item.extratags?.cuisine ?? intent.cuisineLabel,
        distanceMeters: distance * 1000,
      }];
    }).sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, 8).map(({ distanceMeters, ...place }) => {
      void distanceMeters;
      return place;
    });

    const value = {
      configured: true,
      provider: "openstreetmap",
      intent,
      places,
      limitations: ["开放地图不提供统一评分", "人均价格与营业状态需到店前确认"],
    };
    cache.set(cacheKey, { expires: Date.now() + 4 * 60 * 60 * 1000, value });
    return NextResponse.json(value, { headers: { "Cache-Control": "public, max-age=900" } });
  } catch {
    return NextResponse.json({ error: "开放地点服务连接超时，请稍后重试" }, { status: 504 });
  }
}
