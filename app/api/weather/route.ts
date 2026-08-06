import { NextRequest, NextResponse } from "next/server";
import { buildWeatherUrl, normalizeWeather, type OpenMeteoResponse } from "@/lib/weather";

export const maxDuration = 30;

const cache = new Map<string, { expires: number; value: unknown }>();

export async function GET(request: NextRequest) {
  const latitude = Number(request.nextUrl.searchParams.get("lat"));
  const longitude = Number(request.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return NextResponse.json({ error: "无效的天气坐标" }, { status: 400 });
  }

  const cacheKey = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return NextResponse.json(cached.value);

  try {
    const url = buildWeatherUrl(latitude, longitude);

    const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
    const data = await response.json() as OpenMeteoResponse;
    if (!response.ok) throw new Error(data.reason ?? "天气服务暂时不可用");
    const value = normalizeWeather(data);
    cache.set(cacheKey, { expires: Date.now() + 15 * 60 * 1000, value });
    return NextResponse.json(value, { headers: { "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=1800" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "天气服务暂时不可用" }, { status: 502 });
  }
}
