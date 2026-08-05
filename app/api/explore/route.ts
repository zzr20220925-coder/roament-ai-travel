import { NextRequest, NextResponse } from "next/server";

type NominatimResult = { place_id?: number; display_name: string; lat: string; lon: string; class?: string; type?: string; namedetails?: Record<string, string>; extratags?: Record<string, string>; address?: { city?: string; town?: string; village?: string; suburb?: string; country?: string } };
type OverpassElement = { id: number; type: string; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

const cache = new Map<string, { expires: number; value: unknown }>();
let lastGeocodeAt = 0;

async function waitForGeocoder() {
  const wait = Math.max(0, 1100 - (Date.now() - lastGeocodeAt));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastGeocodeAt = Date.now();
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

async function geocode(body: { query?: string; lat?: number; lng?: number }) {
  const isReverse = Number.isFinite(body.lat) && Number.isFinite(body.lng);
  const cacheKey = isReverse ? `reverse:${body.lat?.toFixed(4)},${body.lng?.toFixed(4)}` : `search:${body.query?.trim().toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value as { name: string; lookup: string; lat: number; lng: number };

  await waitForGeocoder();

  const url = new URL(isReverse ? "https://nominatim.openstreetmap.org/reverse" : "https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("accept-language", "zh-CN,en");
  url.searchParams.set("addressdetails", "1");
  if (isReverse) {
    url.searchParams.set("lat", String(body.lat));
    url.searchParams.set("lon", String(body.lng));
    url.searchParams.set("zoom", "16");
  } else {
    url.searchParams.set("q", body.query?.trim() ?? "");
    url.searchParams.set("limit", "1");
  }
  const response = await fetch(url, { headers: { "User-Agent": "michi-ai-travel/1.0 (+https://michi-ai-travel.zzr20220925.chatgpt.site)", "Accept-Language": "zh-CN,en;q=0.8" } });
  if (!response.ok) throw new Error("全球地址服务暂时不可用");
  const raw = await response.json();
  const item = (Array.isArray(raw) ? raw[0] : raw) as NominatimResult | undefined;
  if (!item) throw new Error("没有找到这个位置，请加入城市和国家后重试");
  const city = item.address?.city ?? item.address?.town ?? item.address?.village ?? item.address?.suburb;
  const lookup = city ? `${city}${item.address?.country ? `, ${item.address.country}` : ""}` : item.display_name.split(",").slice(0, 3).join(",");
  const result = { name: city ? `${city}${item.address?.country ? ` · ${item.address.country}` : ""}` : item.display_name.split(",").slice(0, 2).join(" · "), lookup, lat: Number(item.lat), lng: Number(item.lon) };
  cache.set(cacheKey, { expires: Date.now() + 24 * 60 * 60 * 1000, value: result });
  return result;
}

async function famousPlaces(center: { name: string; lat: number; lng: number }): Promise<OverpassElement[]> {
  const cacheKey = `famous:${center.lat.toFixed(2)},${center.lng.toFixed(2)}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value as OverpassElement[];
  const searches = [
    '"tourist attraction"',
    "museum OR gallery",
    "palace OR castle OR monument OR landmark OR tower",
    "park OR garden OR cathedral OR temple OR shrine",
  ];
  const responses = await Promise.allSettled(searches.map(async (terms) => {
    const url = new URL("https://en.wikipedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("format", "json");
    url.searchParams.set("generator", "search");
    url.searchParams.set("gsrnamespace", "0");
    url.searchParams.set("gsrlimit", "24");
    url.searchParams.set("gsrsearch", `nearcoord:18km,${center.lat},${center.lng} (${terms})`);
    url.searchParams.set("prop", "coordinates|description|info");
    url.searchParams.set("colimit", "max");
    const response = await fetch(url, {
      headers: { "User-Agent": "michi-ai-travel/1.0 (+https://michi-ai-travel.zzr20220925.chatgpt.site)" },
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) return [];
    const data = await response.json() as { query?: { pages?: Record<string, { pageid: number; title: string; description?: string; length?: number; coordinates?: Array<{ lat: number; lon: number }> }> } };
    return Object.values(data.query?.pages ?? {});
  }));
  const pages = responses.flatMap((response) => response.status === "fulfilled" ? response.value : []);
  const excluded = /station|airport|railway|railroad|metro|route|bus|district|borough|neighbou?rhood|residential area|human settlement|town in|village in|politician|company|organization|school|college|government department/i;
  const seen = new Set<number>();
  const result = pages
    .filter((page) => {
      const coordinates = page.coordinates?.[0];
      if (!coordinates || seen.has(page.pageid) || excluded.test(page.description ?? "")) return false;
      seen.add(page.pageid);
      return distanceKm(center, { lat: coordinates.lat, lng: coordinates.lon }) <= 18;
    })
    .sort((a, b) => (b.length ?? 0) - (a.length ?? 0))
    .slice(0, 42)
    .map((page) => ({
      id: page.pageid,
      type: "wikipedia",
      lat: page.coordinates![0].lat,
      lon: page.coordinates![0].lon,
      tags: {
        name: page.title,
        "name:en": page.title,
        tourism: /museum/i.test(page.description ?? "") ? "museum" : /park|garden/i.test(page.description ?? "") ? "park" : "attraction",
        description: page.description ?? "Notable place with a dedicated encyclopedic article.",
        featured: "yes",
        wikipedia: `en:${page.title}`,
      },
    }));
  cache.set(cacheKey, { expires: Date.now() + 24 * 60 * 60 * 1000, value: result });
  return result;
}

async function nearby(center: { lat: number; lng: number }): Promise<OverpassElement[]> {
  const cacheKey = `nearby:${center.lat.toFixed(3)},${center.lng.toFixed(3)}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value as OverpassElement[];
  const search = async (query: string, category: "restaurant" | "shopping") => {
    await waitForGeocoder();
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "14");
    url.searchParams.set("accept-language", "zh-CN,en");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("namedetails", "1");
    url.searchParams.set("extratags", "1");
    url.searchParams.set("bounded", "1");
    url.searchParams.set("viewbox", `${center.lng - 0.04},${center.lat + 0.03},${center.lng + 0.04},${center.lat - 0.03}`);
    const response = await fetch(url, {
      headers: { "User-Agent": "michi-ai-travel/1.0 (+https://michi-ai-travel.zzr20220925.chatgpt.site)", "Accept-Language": "zh-CN,en;q=0.8" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    const results = await response.json() as NominatimResult[];
    return results.map((item, index): OverpassElement => ({
      id: item.place_id ?? (category === "restaurant" ? 700000 : 800000) + index,
      type: "nominatim",
      lat: Number(item.lat),
      lon: Number(item.lon),
      tags: {
        name: item.namedetails?.["name:zh"] ?? item.namedetails?.name ?? item.display_name.split(",")[0],
        "name:en": item.namedetails?.["name:en"] ?? "",
        amenity: category === "restaurant" ? item.type ?? "restaurant" : "",
        shop: category === "shopping" ? item.type ?? "department_store" : "",
        website: item.extratags?.website ?? "",
      },
    }));
  };
  try {
    const restaurants = await search("restaurant", "restaurant");
    let shopping = await search("department store", "shopping");
    if (!shopping.length) shopping = await search("shopping mall", "shopping");
    const result = [...restaurants, ...shopping];
    cache.set(cacheKey, { expires: Date.now() + 6 * 60 * 60 * 1000, value: result });
    return result;
  } catch {
    return [];
  }
}

function categoryOf(tags: Record<string, string>): "attraction" | "restaurant" | "shopping" {
  if (tags.amenity && /restaurant|cafe|food_court/.test(tags.amenity)) return "restaurant";
  if (tags.shop) return "shopping";
  return "attraction";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { query?: string; lat?: number; lng?: number };
    if (!body.query?.trim() && !(Number.isFinite(body.lat) && Number.isFinite(body.lng))) return NextResponse.json({ error: "请输入酒店或地址" }, { status: 400 });
    const location = await geocode(body);
    const [nearbyElements, cityFamous] = await Promise.all([nearby(location), famousPlaces(location)]);
    const elements = [...cityFamous, ...nearbyElements];
    const seen = new Set<string>();
    const mapped = elements.map((element) => {
      const tags = element.tags ?? {};
      const lat = element.lat ?? element.center?.lat;
      const lng = element.lon ?? element.center?.lon;
      const name = tags["name:zh"] ?? tags.name ?? tags["name:en"];
      if (!name || lat == null || lng == null) return null;
      const key = `${name}:${lat.toFixed(4)},${lng.toFixed(4)}`;
      if (seen.has(key)) return null;
      seen.add(key);
      const category = categoryOf(tags);
      const distance = distanceKm(location, { lat, lng });
      const subtype = tags.tourism ?? tags.historic ?? tags.amenity ?? tags.shop ?? "place";
      const icon = category === "restaurant" ? (tags.amenity === "cafe" ? "啡" : "食") : category === "shopping" ? "购" : tags.tourism === "museum" ? "馆" : tags.historic ? "古" : "景";
      return {
        id: `${element.type}-${element.id}`,
        name,
        localName: tags["name:en"] ?? subtype.replaceAll("_", " "),
        category,
        lat,
        lng,
        distance: distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`,
        address: [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]].filter(Boolean).join(" ") || location.name,
        icon,
        opening: tags.opening_hours ?? "出发前确认",
        summary: category === "restaurant" ? "从酒店周边实时发现的本地餐饮地点，适合结合当天动线安排一段不赶时间的用餐。" : category === "shopping" ? "位于当前旅行中心附近的购物地点，可作为休息、补给与了解当地生活方式的一站。" : tags.description ? `${tags.description}。它拥有独立的百科资料，是理解这座城市空间、历史或文化的一处重要坐标。` : "从当前旅行中心实时找到的文化或城市地标，值得放进行程并进一步了解它与当地的关系。",
        tip: tags.website ? "这里提供官方网站，开放时间与预约信息建议在出发前再次确认。" : "开放时间可能随季节变化；正式接入 AI 后会结合官方资料生成更深入的讲解。",
        tags: category === "restaurant" ? ["当地美食", subtype.replaceAll("_", " ")] : category === "shopping" ? ["购物", "生活方式"] : ["城市地标", subtype.replaceAll("_", " ")],
        famous: category === "attraction" && Boolean(tags.featured || tags.wikidata || tags.wikipedia),
        distanceMeters: distance * 1000,
      };
    }).filter(Boolean).sort((a, b) => a!.distanceMeters - b!.distanceMeters);
    const attractions = mapped.filter((place) => place?.category === "attraction");
    const famousCandidates = attractions.filter((place) => place?.famous);
    const nearestFamous = famousCandidates.slice(0, 8);
    const fartherFamous = famousCandidates.slice(8);
    const spreadCount = Math.min(10, fartherFamous.length);
    const citySpread = Array.from({ length: spreadCount }, (_, index) => fartherFamous[Math.round(index * (fartherFamous.length - 1) / Math.max(spreadCount - 1, 1))]);
    const famousAttractions = [...nearestFamous, ...citySpread];
    const localAttractions = attractions.filter((place) => !place?.famous).slice(0, 8);
    const restaurants = mapped.filter((place) => place?.category === "restaurant").slice(0, 8);
    const shopping = mapped.filter((place) => place?.category === "shopping").slice(0, 6);
    const balanced = [...famousAttractions, ...localAttractions, ...restaurants, ...shopping];
    const places = balanced.map((place) => {
      const { distanceMeters, ...publicPlace } = place!;
      void distanceMeters;
      return publicPlace;
    });
    return NextResponse.json({ location, places, source: "OpenStreetMap" }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "探索服务暂时不可用" }, { status: 502 });
  }
}
