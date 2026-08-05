import { NextRequest, NextResponse } from "next/server";

type NominatimPlace = {
  place_id?: number;
  osm_id?: number;
  osm_type?: "node" | "way" | "relation";
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
  type?: string;
  category?: string;
  addresstype?: string;
  namedetails?: Record<string, string>;
  extratags?: Record<string, string>;
};

const cache = new Map<string, { expires: number; value: unknown }>();
let lastSearchAt = 0;

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

async function respectPublicRateLimit() {
  const wait = Math.max(0, 1_100 - (Date.now() - lastSearchAt));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastSearchAt = Date.now();
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { query?: string; label?: string; location?: { name?: string; lat?: number; lng?: number } };
  const query = body.query?.trim();
  const lat = body.location?.lat;
  const lng = body.location?.lng;
  if (!query) return NextResponse.json({ error: "请告诉我想去的地点" }, { status: 400 });
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ error: "缺少旅行中心位置" }, { status: 400 });

  const cacheKey = `${lat!.toFixed(2)},${lng!.toFixed(2)}:${query.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return NextResponse.json(cached.value, { headers: { "Cache-Control": "public, max-age=900" } });

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "10");
  url.searchParams.set("accept-language", "zh-CN,en");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("namedetails", "1");
  url.searchParams.set("extratags", "1");
  url.searchParams.set("bounded", "0");
  url.searchParams.set("viewbox", `${lng! - 0.5},${lat! + 0.35},${lng! + 0.5},${lat! - 0.35}`);

  try {
    await respectPublicRateLimit();
    const response = await fetch(url, {
      headers: { "User-Agent": "michi-ai-travel/1.0 (+https://michi-ai-travel.zzr20220925.chatgpt.site)", "Accept-Language": "zh-CN,en;q=0.8" },
      signal: AbortSignal.timeout(9_000),
    });
    if (!response.ok) return NextResponse.json({ error: "开放地点服务暂时不可用" }, { status: 502 });

    const raw = await response.json() as NominatimPlace[];
    const center = { lat: lat!, lng: lng! };
    const places = raw.flatMap((item) => {
      const placeLat = Number(item.lat);
      const placeLng = Number(item.lon);
      const distance = distanceKm(center, { lat: placeLat, lng: placeLng });
      const name = item.namedetails?.["name:zh"] ?? body.label?.trim() ?? item.namedetails?.name ?? item.name ?? item.display_name?.split(",")[0];
      if (!name || !Number.isFinite(placeLat) || !Number.isFinite(placeLng) || distance > 100) return [];
      const localName = item.namedetails?.name ?? item.namedetails?.["name:en"] ?? item.name ?? name;
      const kind = item.type ?? item.addresstype ?? item.category ?? "place";
      const openingHours = item.extratags?.opening_hours;
      return [{
        id: `osm-${item.osm_type ?? "place"}-${item.osm_id ?? item.place_id}`,
        name,
        localName,
        category: "attraction" as const,
        lat: placeLat,
        lng: placeLng,
        distance: distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`,
        address: item.display_name ?? body.location?.name ?? "地址待确认",
        icon: "景",
        opening: openingHours ? `开放时间 ${openingHours}` : "开放时间待确认",
        summary: `这是 OpenStreetMap 匹配到的真实地点。已经以 ${body.location?.name ?? "旅行中心"} 为起点加入路线。`,
        tip: "开放时间、票务和具体入口可能变化，出发前请通过官方渠道确认。",
        tags: ["OpenStreetMap", kind],
        famous: true,
        distanceKm: distance,
      }];
    }).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 5).map(({ distanceKm: ignored, ...place }) => {
      void ignored;
      return place;
    });

    const value = { configured: true, provider: "openstreetmap", places };
    cache.set(cacheKey, { expires: Date.now() + 4 * 60 * 60 * 1000, value });
    return NextResponse.json(value, { headers: { "Cache-Control": "public, max-age=900" } });
  } catch {
    return NextResponse.json({ error: "开放地点服务连接超时，请稍后重试" }, { status: 504 });
  }
}
