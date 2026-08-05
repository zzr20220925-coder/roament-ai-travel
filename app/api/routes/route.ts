import { NextRequest, NextResponse } from "next/server";

type Point = { lat: number; lng: number };
type TravelMode = "WALK" | "DRIVE" | "BICYCLE";
type OsrmRoute = {
  duration?: number;
  distance?: number;
  geometry?: { coordinates?: number[][] };
  legs?: Array<{ duration?: number; distance?: number }>;
};

const cache = new Map<string, { expires: number; value: unknown }>();

function validPoint(point: Point) {
  return Number.isFinite(point.lat)
    && Number.isFinite(point.lng)
    && point.lat >= -90
    && point.lat <= 90
    && point.lng >= -180
    && point.lng <= 180;
}

function routingBase(mode: TravelMode) {
  if (mode === "DRIVE") return "https://routing.openstreetmap.de/routed-car";
  if (mode === "BICYCLE") return "https://routing.openstreetmap.de/routed-bike";
  return "https://routing.openstreetmap.de/routed-foot";
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { points?: Point[]; travelMode?: TravelMode };
  const points = (body.points ?? []).filter(validPoint).slice(0, 25);
  if (points.length < 2) return NextResponse.json({ error: "路线至少需要两个地点" }, { status: 400 });

  const travelMode = body.travelMode ?? "WALK";
  const coordinates = points.map((point) => `${point.lng.toFixed(6)},${point.lat.toFixed(6)}`).join(";");
  const cacheKey = `${travelMode}:${coordinates}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return NextResponse.json(cached.value, { headers: { "Cache-Control": "public, max-age=900" } });

  const url = new URL(`${routingBase(travelMode)}/route/v1/driving/${coordinates}`);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("steps", "false");

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "michi-ai-travel/1.0 (+https://michi-ai-travel.zzr20220925.chatgpt.site)" },
      signal: AbortSignal.timeout(12_000),
    });
    const data = await response.json() as { code?: string; routes?: OsrmRoute[]; message?: string };
    const result = data.routes?.[0];
    const routeCoordinates = result?.geometry?.coordinates;
    if (!response.ok || data.code !== "Ok" || !result || !routeCoordinates?.length) {
      return NextResponse.json({ error: data.message ?? "开放路线服务暂时不可用" }, { status: 502 });
    }

    const value = {
      configured: true,
      provider: "openstreetmap",
      route: {
        duration: `${Math.round(result.duration ?? 0)}s`,
        distanceMeters: Math.round(result.distance ?? 0),
        geometry: { coordinates: routeCoordinates },
        legs: (result.legs ?? []).map((leg) => ({
          duration: `${Math.round(leg.duration ?? 0)}s`,
          distanceMeters: Math.round(leg.distance ?? 0),
        })),
      },
    };
    cache.set(cacheKey, { expires: Date.now() + 30 * 60 * 1000, value });
    return NextResponse.json(value, { headers: { "Cache-Control": "public, max-age=900" } });
  } catch {
    return NextResponse.json({ error: "开放路线服务连接超时，请稍后重试" }, { status: 504 });
  }
}
