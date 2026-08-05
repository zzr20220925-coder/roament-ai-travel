import { NextRequest, NextResponse } from "next/server";

const queryMap = {
  attraction: "tourist attraction",
  restaurant: "restaurant",
  shopping: "shopping mall",
} as const;

type NominatimPlace = {
  place_id?: number;
  osm_id?: number;
  osm_type?: "node" | "way" | "relation";
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
  type?: string;
  namedetails?: Record<string, string>;
  extratags?: Record<string, string>;
};

const cache = new Map<string, { expires: number; value: unknown }>();

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    latitude: number;
    longitude: number;
    category?: keyof typeof queryMap;
    radius?: number;
  };
  if (!Number.isFinite(body.latitude) || !Number.isFinite(body.longitude)) {
    return NextResponse.json({ error: "缺少有效位置" }, { status: 400 });
  }

  const category = body.category ?? "attraction";
  const radius = Math.min(Math.max(body.radius ?? 2500, 500), 5000);
  const cacheKey = `${body.latitude.toFixed(3)},${body.longitude.toFixed(3)}:${category}:${radius}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return NextResponse.json(cached.value, { headers: { "Cache-Control": "public, max-age=900" } });

  const latDelta = radius / 111_000;
  const lngDelta = radius / Math.max(20_000, 111_000 * Math.cos(body.latitude * Math.PI / 180));
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", queryMap[category]);
  url.searchParams.set("limit", "12");
  url.searchParams.set("accept-language", "zh-CN,en");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("namedetails", "1");
  url.searchParams.set("extratags", "1");
  url.searchParams.set("bounded", "1");
  url.searchParams.set("viewbox", `${body.longitude - lngDelta},${body.latitude + latDelta},${body.longitude + lngDelta},${body.latitude - latDelta}`);

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "michi-ai-travel/1.0 (+https://michi-ai-travel.zzr20220925.chatgpt.site)", "Accept-Language": "zh-CN,en;q=0.8" },
      signal: AbortSignal.timeout(9_000),
    });
    if (!response.ok) return NextResponse.json({ error: "开放地点服务暂时不可用" }, { status: 502 });
    const data = await response.json() as NominatimPlace[];
    const places = data.flatMap((place) => {
      const latitude = Number(place.lat);
      const longitude = Number(place.lon);
      const name = place.namedetails?.["name:zh"] ?? place.namedetails?.name ?? place.name ?? place.display_name?.split(",")[0];
      if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
      const detailsUri = place.osm_id && place.osm_type ? `https://www.openstreetmap.org/${place.osm_type}/${place.osm_id}` : "https://www.openstreetmap.org";
      return [{
        id: String(place.place_id ?? `${place.osm_type}-${place.osm_id}`),
        displayName: { text: name },
        location: { latitude, longitude },
        shortFormattedAddress: place.display_name ?? "地址待确认",
        primaryType: place.type ?? category,
        currentOpeningHours: place.extratags?.opening_hours ? { text: place.extratags.opening_hours } : null,
        detailsUri,
      }];
    });
    const value = { provider: "openstreetmap", places };
    cache.set(cacheKey, { expires: Date.now() + 4 * 60 * 60 * 1000, value });
    return NextResponse.json(value, { headers: { "Cache-Control": "public, max-age=900" } });
  } catch {
    return NextResponse.json({ error: "开放地点服务连接超时，请稍后重试" }, { status: 504 });
  }
}
