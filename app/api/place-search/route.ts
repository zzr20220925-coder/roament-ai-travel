import { NextRequest, NextResponse } from "next/server";
import { detectNearbyPlaceType, isNearbyPlaceType, nearbyPlaceDefinitions, type NearbyPlaceType } from "@/lib/place-intent";
import { nearbyPlaceSearchConfig } from "@/lib/place-search-config";

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
type OverpassElement = {
  id: number;
  type: "node" | "way" | "relation";
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
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

async function geocodeSearchCenter(query: string) {
  await respectPublicRateLimit();
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "1");
  url.searchParams.set("accept-language", "zh-CN,en");
  url.searchParams.set("addressdetails", "1");
  const response = await fetch(url, {
    headers: { "User-Agent": "michi-ai-travel/1.0 (+https://michi-ai-travel.zzr20220925.chatgpt.site)", "Accept-Language": "zh-CN,en;q=0.8" },
    signal: AbortSignal.timeout(9_000),
  });
  if (!response.ok) throw new Error("无法定位搜索城市");
  const item = (await response.json() as NominatimPlace[])[0];
  const lat = Number(item?.lat);
  const lng = Number(item?.lon);
  if (!item || !Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("无法定位搜索城市");
  return { name: item.display_name?.split(",").slice(0, 2).join(" · ") ?? query, lat, lng };
}

function distanceLabel(distance: number) {
  return distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`;
}

function taggedAddress(tags: Record<string, string>, fallback: string) {
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  return [street, tags["addr:suburb"], tags["addr:city"]].filter(Boolean).join(", ") || fallback;
}

async function searchNearbyType(center: { name: string; lat: number; lng: number }, placeType: NearbyPlaceType) {
  const definition = nearbyPlaceDefinitions[placeType];
  const searchConfig = nearbyPlaceSearchConfig[placeType];
  const statements = searchConfig.selectors.map((selector) => `nwr(around:${searchConfig.radiusMeters},${center.lat},${center.lng})${selector};`).join("");
  const overpassQuery = `[out:json][timeout:15];(${statements});out center tags;`;
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "michi-ai-travel/1.0 (+https://michi-ai-travel.zzr20220925.chatgpt.site)",
    },
    body: new URLSearchParams({ data: overpassQuery }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("开放地点分类服务暂时不可用");
  const data = await response.json() as { elements?: OverpassElement[] };
  return (data.elements ?? []).flatMap((item, index) => {
    const tags = item.tags ?? {};
    const lat = item.lat ?? item.center?.lat;
    const lng = item.lon ?? item.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    const distance = distanceKm(center, { lat: lat!, lng: lng! });
    if (distance * 1000 > searchConfig.radiusMeters * 1.08) return [];
    const name = tags["name:zh"] ?? tags.name ?? tags.brand ?? tags.operator ?? `${definition.label} ${index + 1}`;
    const localName = tags["name:en"] ?? tags.name ?? tags.brand ?? definition.label;
    const osmKind = tags.amenity ?? tags.shop ?? tags.locker ?? placeType;
    const openingHours = tags.opening_hours;
    return [{
      id: `osm-${item.type}-${item.id}`,
      name,
      localName,
      category: "shopping" as const,
      lat: lat!,
      lng: lng!,
      distance: distanceLabel(distance),
      address: taggedAddress(tags, center.name),
      icon: searchConfig.icon,
      opening: openingHours ? `开放时间 ${openingHours}` : "开放时间待确认",
      summary: `这是 OpenStreetMap 在当前旅行中心附近匹配到的真实${definition.label}。`,
      tip: "小型地点的营业时间与服务可能变化，出发前建议再次确认。",
      tags: ["OpenStreetMap", definition.label, osmKind.replaceAll("_", " ")],
      famous: false,
      distanceKm: distance,
    }];
  }).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 8).map(({ distanceKm: ignored, ...place }) => {
    void ignored;
    return place;
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { query?: string; label?: string; category?: "attraction" | "shopping" | "local"; placeType?: NearbyPlaceType | null; searchLocationQuery?: string | null; location?: { name?: string; lat?: number; lng?: number } };
  const query = body.query?.trim();
  const category = body.category === "shopping" || body.category === "local" ? body.category : "attraction";
  const lat = body.location?.lat;
  const lng = body.location?.lng;
  if (!query) return NextResponse.json({ error: "请告诉我想去的地点" }, { status: 400 });
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ error: "缺少旅行中心位置" }, { status: 400 });

  const inferredPlaceType = detectNearbyPlaceType(`${body.label ?? ""} ${query}`);
  const placeType = isNearbyPlaceType(body.placeType) ? body.placeType : inferredPlaceType;
  const definition = placeType ? nearbyPlaceDefinitions[placeType] : null;
  const searchConfig = placeType ? nearbyPlaceSearchConfig[placeType] : null;
  const searchLocationQuery = body.searchLocationQuery?.trim();
  const cacheKey = `${lat!.toFixed(3)},${lng!.toFixed(3)}:${searchLocationQuery?.toLowerCase() ?? "current"}:${category}:${placeType ?? "named"}:${query.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return NextResponse.json(cached.value, { headers: { "Cache-Control": "public, max-age=900" } });

  try {
    let center = { name: body.location?.name ?? "旅行中心", lat: lat!, lng: lng! };
    if (searchLocationQuery) {
      try {
        center = await geocodeSearchCenter(searchLocationQuery);
      } catch {
        // Keep the current travel center and let the full text fallback run below.
      }
    }
    if (category === "local" && placeType) {
      try {
        const nearbyPlaces = await searchNearbyType(center, placeType);
        if (nearbyPlaces.length) {
          const value = { configured: true, provider: "openstreetmap", placeType, places: nearbyPlaces };
          cache.set(cacheKey, { expires: Date.now() + 2 * 60 * 60 * 1000, value });
          return NextResponse.json(value, { headers: { "Cache-Control": "public, max-age=600" } });
        }
      } catch {
        // The public Overpass service can be busy; Nominatim below is the fallback.
      }
    }

    const url = new URL("https://nominatim.openstreetmap.org/search");
    const locationName = center.name.replaceAll("·", ",");
    const fallbackQuery = category === "local" && definition ? `${definition.searchTerm}${locationName ? `, ${locationName}` : ""}` : query;
    const latSpan = searchConfig ? Math.max(0.03, searchConfig.radiusMeters / 111_000) : 0.35;
    const lngSpan = searchConfig ? Math.max(0.04, searchConfig.radiusMeters / (111_000 * Math.max(0.25, Math.cos(center.lat * Math.PI / 180)))) : 0.5;
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("q", fallbackQuery);
    url.searchParams.set("limit", "12");
    url.searchParams.set("accept-language", "zh-CN,en");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("namedetails", "1");
    url.searchParams.set("extratags", "1");
    url.searchParams.set("bounded", category === "local" ? "1" : "0");
    url.searchParams.set("viewbox", `${center.lng - lngSpan},${center.lat + latSpan},${center.lng + lngSpan},${center.lat - latSpan}`);

    await respectPublicRateLimit();
    const response = await fetch(url, {
      headers: { "User-Agent": "michi-ai-travel/1.0 (+https://michi-ai-travel.zzr20220925.chatgpt.site)", "Accept-Language": "zh-CN,en;q=0.8" },
      signal: AbortSignal.timeout(9_000),
    });
    if (!response.ok) return NextResponse.json({ error: "开放地点服务暂时不可用" }, { status: 502 });

    const raw = await response.json() as NominatimPlace[];
    const places = raw.flatMap((item) => {
      const placeLat = Number(item.lat);
      const placeLng = Number(item.lon);
      const distance = distanceKm(center, { lat: placeLat, lng: placeLng });
      const name = item.namedetails?.["name:zh"] ?? item.namedetails?.name ?? item.namedetails?.["name:en"] ?? item.name ?? item.display_name?.split(",")[0] ?? body.label?.trim();
      if (!name || !Number.isFinite(placeLat) || !Number.isFinite(placeLng) || distance > 100) return [];
      const localName = item.namedetails?.name ?? item.namedetails?.["name:en"] ?? item.name ?? name;
      const kind = item.type ?? item.addresstype ?? item.category ?? "place";
      const openingHours = item.extratags?.opening_hours;
      return [{
        id: `osm-${item.osm_type ?? "place"}-${item.osm_id ?? item.place_id}`,
        name,
        localName,
        category: category === "attraction" ? "attraction" : "shopping",
        lat: placeLat,
        lng: placeLng,
        distance: distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`,
        address: item.display_name ?? body.location?.name ?? "地址待确认",
        icon: searchConfig?.icon ?? (category === "shopping" || category === "local" ? "购" : "景"),
        opening: openingHours ? `开放时间 ${openingHours}` : "开放时间待确认",
        summary: `这是 OpenStreetMap 匹配到的真实${definition?.label ?? "地点"}。已经以 ${body.location?.name ?? "旅行中心"} 为起点加入路线。`,
        tip: "开放时间、票务和具体入口可能变化，出发前请通过官方渠道确认。",
        tags: ["OpenStreetMap", definition?.label ?? (category === "shopping" || category === "local" ? "购物" : "景点"), kind],
        famous: category === "attraction",
        distanceKm: distance,
      }];
    }).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 5).map(({ distanceKm: ignored, ...place }) => {
      void ignored;
      return place;
    });

    const value = { configured: true, provider: "openstreetmap", placeType, places };
    cache.set(cacheKey, { expires: Date.now() + 4 * 60 * 60 * 1000, value });
    return NextResponse.json(value, { headers: { "Cache-Control": "public, max-age=900" } });
  } catch {
    return NextResponse.json({ error: "开放地点服务连接超时，请稍后重试" }, { status: 504 });
  }
}
