"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent, SymbolLayerSpecification } from "maplibre-gl";
import { parseDestinationIntents } from "@/lib/trip-intent";
import type { WeatherData } from "@/lib/weather";

type Category = "attraction" | "restaurant" | "shopping";
type StopStatus = "done" | "now" | "next" | "optional";
type Scenario = "rain" | "late" | "tired" | "budget";
type GuideMode = "quick" | "deep" | "family";
type Currency = "EUR" | "USD" | "GBP" | "JPY" | "CNY";

type Place = {
  id: string;
  name: string;
  localName: string;
  category: Category;
  lat: number;
  lng: number;
  distance: string;
  address: string;
  icon: string;
  opening: string;
  summary: string;
  tip: string;
  tags: string[];
  famous?: boolean;
};

type ExploreResult = {
  location: { name: string; lat: number; lng: number };
  places: Place[];
};

type TripStop = {
  id: string;
  time: string;
  endTime: string;
  place: Place;
  status: StopStatus;
  transit: string;
  note: string;
};

type TripDay = {
  day: number;
  title: string;
  stops: TripStop[];
};

type SavedTrip = {
  id: string;
  title: string;
  destinationQuery: string;
  startDate: string | null;
  location: ExploreResult["location"];
  places: Place[];
  tripDays: TripDay[];
};

type AIPlanResponse = {
  configured?: boolean;
  summary?: string;
  days?: Array<{
    day: number;
    title: string;
    stops: Array<{ placeId: string; time: string; endTime: string; optional: boolean; note: string }>;
  }>;
  error?: string;
};

type DiningIntent = { cuisine: string; cuisineLabel: string; minRating: number; budget: number; currency: Currency; time: string };
type AgentAction = {
  action: "destination_plan" | "place_search" | "dining_search" | "weather_replan" | "delay_replan" | "fatigue_replan" | "budget_replan" | "open_planner" | "general";
  destinationQuery: string | null;
  destinationLabel: string | null;
  tripDays: number | null;
  startDate: string | null;
  placeQuery: string | null;
  placeLabel: string | null;
  cuisineQuery: string | null;
  cuisineLabel: string | null;
  minRating: number | null;
  budgetAmount: number | null;
  budgetCurrency: Currency | null;
  time: string | null;
  explanation: string;
};
type DiningResult = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number | null;
  userRatingCount: number | null;
  priceLabel: string;
  budgetFit: "exact" | "approximate" | "unknown" | "outside";
  priceEvidence: string;
  openingLabel: string;
  openAtRequestedTime: boolean | null;
  distance: string;
  detailsUri: string;
  source: "openstreetmap";
};
type OpenRoute = {
  duration?: string;
  distanceMeters?: number;
  geometry?: { coordinates?: number[][] };
  legs?: Array<{ duration?: string; distanceMeters?: number }>;
};

const scenarioCopy: Record<Scenario, { label: string; icon: IconName; prompt: string }> = {
  rain: { label: "下雨了", icon: "rain", prompt: "现在下雨了，请尽量换成室内地点并减少露天步行，保留最重要的行程。" },
  late: { label: "晚了 1 小时", icon: "clock", prompt: "我比原计划晚了 1 小时，请重排行程，减少赶路但尽量保留最值得去的地点。" },
  tired: { label: "我有点累", icon: "rest", prompt: "我现在有点累，请减少步行与站数，安排更松弛并允许提前回酒店。" },
  budget: { label: "降低今天预算", icon: "wallet", prompt: "请降低今天的预算，优先免费景点和公共空间，同时保持行程体验。" },
};

type IconName = "route" | "clock" | "ticket" | "spark" | "rain" | "rest" | "wallet" | "arrow" | "map" | "book" | "hotel" | "close" | "edit" | "offline" | "send" | "calendar" | "dining" | "star" | "plus";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    route: <><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h2a4 4 0 0 0 4-4v-4a4 4 0 0 1 4-4"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    ticket: <><path d="M4 7a2 2 0 0 0 0 4v6h16v-6a2 2 0 0 0 0-4V5H4z"/><path d="M12 7v2m0 4v2"/></>,
    spark: <><path d="m12 3 1.2 4.1L17 9l-3.8 1.9L12 15l-1.2-4.1L7 9l3.8-1.9z"/><path d="m5 14 .7 2.3L8 17.5l-2.3 1.2L5 21l-.7-2.3L2 17.5l2.3-1.2z"/></>,
    rain: <><path d="M7 17h10a4 4 0 0 0 .6-7.9A6 6 0 0 0 6.3 8.3 4.5 4.5 0 0 0 7 17Z"/><path d="m8 20-1 2m5-2-1 2m5-2-1 2"/></>,
    rest: <><path d="M5 9v9m14-9v9M5 14h14M7 9h10a2 2 0 0 1 2 2v3H5v-3a2 2 0 0 1 2-2Z"/></>,
    wallet: <><path d="M4 7h14a2 2 0 0 1 2 2v9H6a2 2 0 0 1-2-2z"/><path d="M4 7V6a2 2 0 0 1 2-2h11v3m0 5h3"/></>,
    arrow: <><path d="M5 12h14m-5-5 5 5-5 5"/></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15m6-12v15"/></>,
    book: <><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22zM20 5.5A3.5 3.5 0 0 0 16.5 2H13v17h3.5A3.5 3.5 0 0 1 20 22z"/></>,
    hotel: <><path d="M5 21V6l7-3 7 3v15M9 8h1m4 0h1M9 12h1m4 0h1M9 16h6v5"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    edit: <><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z"/><path d="m14 7 3 3"/></>,
    offline: <><path d="M5 12a7 7 0 0 1 11.6-5.3M4 4l16 16M8.5 16a5 5 0 0 1 6.8-.3M12 20h.01"/></>,
    send: <><path d="m3 4 18 8-18 8 4-8z"/><path d="M7 12h14"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 10h18"/></>,
    dining: <><path d="M7 3v7a3 3 0 0 0 3 3V3M7 8h3M9 13v8"/><path d="M16 3v18M16 3c3 1 4 4 4 7h-4"/></>,
    star: <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.4l6.1-.9z"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function buildTimeline(places: Place[]): TripStop[] {
  const attractions = places.filter((place) => place.category === "attraction");
  const restaurants = places.filter((place) => place.category === "restaurant");
  const shopping = places.filter((place) => place.category === "shopping");
  const prioritized = [restaurants[0], attractions[0], attractions[1], shopping[0], attractions[2], attractions[3], ...places];
  const seen = new Set<string>();
  const picks = prioritized.filter((place): place is Place => place != null && !seen.has(place.id) && Boolean(seen.add(place.id))).slice(0, 5);
  const times = [["09:00", "09:45"], ["10:40", "13:00"], ["13:30", "15:00"], ["16:00", "17:30"], ["18:30", "19:30"]];
  return picks.map((place, index) => ({
    id: `stop-${index}-${place.id}`,
    time: times[index][0],
    endTime: times[index][1],
    place,
    status: index === 0 ? "done" : index === 1 ? "now" : "next",
    transit: index === 0 ? "从酒店步行 6 分钟" : index === 1 ? "地铁 18 分钟" : index === 2 ? "步行 12 分钟" : index === 3 ? "步行＋短途公交" : "日落前抵达",
    note: index === 0 ? "已完成" : index === 1 ? "已预约 · 建议现在准备出发" : index === 2 ? "顺路休息，不需要赶时间" : index === 3 ? "根据体力可缩短" : "保留 20 分钟机动时间",
  }));
}

function tripDateLabel(startDate: string | null | undefined, offset: number) {
  const match = startDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + offset));
  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
}

function resolvePlanDays(data: AIPlanResponse, candidates: Place[], startDate?: string | null): TripDay[] {
  const placeById = new Map(candidates.map((place) => [place.id, place]));
  return (data.days ?? []).map((day, dayIndex) => {
    const stops = day.stops.flatMap((stop, index) => {
      const place = placeById.get(stop.placeId);
      if (!place) return [];
      return [{
        id: `ai-day-${day.day}-${index}-${place.id}`,
        time: stop.time,
        endTime: stop.endTime,
        place,
        status: stop.optional ? "optional" as const : index === 0 ? "now" as const : "next" as const,
        transit: "开放路线正在重新计算",
        note: stop.note,
      }];
    });
    const date = tripDateLabel(startDate, dayIndex);
    return { day: day.day, title: date ? `${date} · ${day.title}` : day.title, stops };
  }).filter((day) => day.stops.length > 0);
}

function shiftTime(time: string, minutes: number) {
  const [hour, minute] = time.split(":").map(Number);
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function durationMinutes(duration?: string) {
  return Math.max(1, Math.round(Number(duration?.replace("s", "") ?? 0) / 60));
}

function openDirectionsUrl(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }) {
  const route = encodeURIComponent(`${origin.lat},${origin.lng};${destination.lat},${destination.lng}`);
  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${route}`;
}

export default function Home() {
  const mapHostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const maplibreRef = useRef<typeof import("maplibre-gl") | null>(null);
  const [location, setLocation] = useState({ name: "选择目的地", lat: 24, lng: 12 });
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [timeline, setTimeline] = useState<TripStop[]>([]);
  const [tripDays, setTripDays] = useState<TripDay[]>([]);
  const [activeDay, setActiveDay] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [searching, setSearching] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [hotelEditor, setHotelEditor] = useState(false);
  const [tripPlanner, setTripPlanner] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideMode, setGuideMode] = useState<GuideMode>("quick");
  const [command, setCommand] = useState("");
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(null);
  const [replanning, setReplanning] = useState(false);
  const [updateNote, setUpdateNote] = useState("告诉我城市、酒店或旅行日期，我会从真实地点开始规划。");
  const [journeyStarted, setJourneyStarted] = useState(false);
  const [days, setDays] = useState(3);
  const [pace, setPace] = useState("松弛");
  const [budget, setBudget] = useState("适中");
  const [companions, setCompanions] = useState("两人");
  const [interests, setInterests] = useState(["历史建筑", "当地美食"]);
  const [diningOpen, setDiningOpen] = useState(false);
  const [diningLoading, setDiningLoading] = useState(false);
  const [diningResults, setDiningResults] = useState<DiningResult[]>([]);
  const [diningError, setDiningError] = useState("");
  const [diningIntent, setDiningIntent] = useState<DiningIntent | null>(null);
  const [openRoute, setOpenRoute] = useState<OpenRoute | null>(null);
  const [routeState, setRouteState] = useState<"idle" | "live" | "error">("idle");
  const [aiState, setAiState] = useState<"idle" | "live" | "unconfigured" | "error">("idle");
  const [aiThinking, setAiThinking] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState("");
  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([]);
  const [activeTripId, setActiveTripId] = useState("");
  const [tripLibraryOpen, setTripLibraryOpen] = useState(false);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");

  const currentStop = timeline.find((stop) => stop.status === "now") ?? timeline[0];
  const selected = places.find((place) => place.id === selectedId) ?? currentStop?.place ?? null;
  const hasJourney = Boolean(currentStop);
  const routeStops = useMemo(() => timeline.map((stop) => stop.place), [timeline]);
  const currentStopIndex = Math.max(0, timeline.findIndex((stop) => stop.id === currentStop?.id));
  const currentTransit = currentStop && openRoute?.legs?.[currentStopIndex]
    ? `步行 ${durationMinutes(openRoute.legs[currentStopIndex].duration)} 分钟 · ${((openRoute.legs[currentStopIndex].distanceMeters ?? 0) / 1000).toFixed(1)} km`
    : currentStop?.transit ?? "";
  const navigationUrl = currentStop ? openDirectionsUrl(location, currentStop.place) : "";

  useEffect(() => {
    let cancelled = false;
    async function bootMap() {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !mapHostRef.current) return;
      maplibreRef.current = maplibregl;
      const map = new maplibregl.Map({
        container: mapHostRef.current,
        style: "https://tiles.openfreemap.org/styles/liberty",
        center: [location.lng, location.lat],
        zoom: 2.2,
        pitch: 0,
        bearing: 0,
        maxPitch: 68,
        attributionControl: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
      map.on("load", () => {
        const layers = map.getStyle().layers ?? [];
        const labelLayer = layers.find((layer): layer is SymbolLayerSpecification => layer.type === "symbol" && Boolean(layer.layout?.["text-field"]));
        const labelFont = labelLayer?.layout?.["text-font"] ?? ["Noto Sans Regular"];
        try {
          map.addLayer({ id: "michi-buildings", source: "openmaptiles", "source-layer": "building", type: "fill-extrusion", minzoom: 14, paint: { "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 6], 0, "#e8e1d2", 40, "#c6c0ab", 120, "#8d9a8f"], "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6], "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0], "fill-extrusion-opacity": .82 } }, labelLayer?.id);
        } catch { /* Base style may not expose building heights. */ }
        map.addSource("michi-route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addSource("michi-stops", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addSource("michi-hotel", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "michi-route-shadow", type: "line", source: "michi-route", paint: { "line-color": "#fffaf0", "line-width": 9, "line-opacity": .9 } });
        map.addLayer({ id: "michi-route-line", type: "line", source: "michi-route", paint: { "line-color": "#183f38", "line-width": 3.5, "line-dasharray": [1.3, 1.4], "line-opacity": .88 } });
        map.addLayer({ id: "michi-stop-halo", type: "circle", source: "michi-stops", paint: { "circle-radius": ["case", ["==", ["get", "status"], "now"], 24, 15], "circle-color": ["match", ["get", "status"], "now", "#ee7054", "done", "#799189", "optional", "#c5ae63", "#1c6256"], "circle-opacity": .2, "circle-blur": .35 } });
        map.addLayer({ id: "michi-stop-core", type: "circle", source: "michi-stops", paint: { "circle-radius": ["case", ["==", ["get", "status"], "now"], 11, 8], "circle-color": ["match", ["get", "status"], "now", "#ee7054", "done", "#799189", "optional", "#c5ae63", "#1c6256"], "circle-stroke-color": "#fffaf0", "circle-stroke-width": 3 } });
        map.addLayer({ id: "michi-stop-label", type: "symbol", source: "michi-stops", layout: { "text-field": ["concat", ["get", "order"], "  ", ["get", "name"]], "text-font": labelFont, "text-size": 11, "text-anchor": "top", "text-offset": [0, 1.25], "text-allow-overlap": false, "text-optional": true }, paint: { "text-color": "#173b35", "text-halo-color": "#fffaf0", "text-halo-width": 2 } });
        map.addLayer({ id: "michi-hotel-halo", type: "circle", source: "michi-hotel", paint: { "circle-radius": 22, "circle-color": "#d7df8b", "circle-opacity": .42, "circle-blur": .3 } });
        map.addLayer({ id: "michi-hotel-core", type: "circle", source: "michi-hotel", paint: { "circle-radius": 9, "circle-color": "#173f38", "circle-stroke-color": "#e9efaa", "circle-stroke-width": 4 } });
        map.addLayer({ id: "michi-hotel-label", type: "symbol", source: "michi-hotel", layout: { "text-field": "酒店", "text-font": labelFont, "text-size": 11, "text-anchor": "bottom", "text-offset": [0, -1.3], "text-allow-overlap": true }, paint: { "text-color": "#173f38", "text-halo-color": "#fffaf0", "text-halo-width": 2 } });
        map.on("click", "michi-stop-core", (event: MapLayerMouseEvent) => {
          const feature = event.features?.[0];
          if (!feature) return;
          setSelectedId(String(feature.properties.id));
          setGuideMode("quick");
          setGuideOpen(true);
        });
        map.on("mouseenter", "michi-stop-core", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "michi-stop-core", () => { map.getCanvas().style.cursor = ""; });
        setMapReady(true);
      });
    }
    bootMap().catch(() => setUpdateNote("地图加载较慢，但今日行程仍可正常使用。"));
    return () => { cancelled = true; try { mapRef.current?.remove(); } catch { /* HMR may already have released it. */ } mapRef.current = null; };
  // Map instance is intentionally created once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = maplibreRef.current;
    if (!mapReady || !map || !maplibregl || !map.isStyleLoaded?.()) return;
    try {
      const coordinates: Array<[number, number]> = [[location.lng, location.lat], ...routeStops.map((place): [number, number] => [place.lng, place.lat])];
      const routeCoordinates = openRoute?.geometry?.coordinates?.length ? openRoute.geometry.coordinates : coordinates;
      (map.getSource("michi-route") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: routeStops.length ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: routeCoordinates } }] : [] });
      (map.getSource("michi-stops") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: timeline.map((stop, index) => ({ type: "Feature", properties: { id: stop.place.id, name: stop.place.name, order: String(index + 1).padStart(2, "0"), status: stop.status }, geometry: { type: "Point", coordinates: [stop.place.lng, stop.place.lat] } })) });
      (map.getSource("michi-hotel") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: routeStops.length ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [location.lng, location.lat] } }] : [] });
      if (!routeStops.length) return;
      const bounds = new maplibregl.LngLatBounds(coordinates[0], coordinates[0]);
      coordinates.forEach((point) => bounds.extend(point));
      map.fitBounds(bounds, { padding: { top: 110, right: 70, bottom: 110, left: 70 }, maxZoom: 14.8, pitch: 52, bearing: -16, duration: 950 });
    } catch { /* The next style-ready update will retry. */ }
  }, [location, mapReady, openRoute, routeStops, timeline]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadOpenRoute() {
      if (!routeStops.length) {
        setOpenRoute(null);
        setRouteState("idle");
        return;
      }
      try {
        const points = [{ lat: location.lat, lng: location.lng }, ...routeStops.map((place) => ({ lat: place.lat, lng: place.lng }))];
        const response = await fetch("/api/routes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points, travelMode: "WALK" }), signal: controller.signal });
        const data = await response.json() as { route?: OpenRoute };
        if (!response.ok || !data.route) {
          setOpenRoute(null);
          setRouteState("error");
          return;
        }
        setOpenRoute(data.route);
        setRouteState("live");
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setOpenRoute(null);
          setRouteState("error");
        }
      }
    }
    loadOpenRoute();
    return () => controller.abort();
  }, [location.lat, location.lng, routeStops]);

  useEffect(() => {
    const controller = new AbortController();
    if (!hasJourney) {
      return () => controller.abort();
    }
    async function loadWeather() {
      setWeatherLoading(true);
      setWeatherError("");
      setWeather(null);
      try {
        const response = await fetch(`/api/weather?lat=${encodeURIComponent(location.lat)}&lng=${encodeURIComponent(location.lng)}`, { signal: controller.signal });
        const data = await response.json() as WeatherData & { error?: string };
        if (!response.ok || !data.current) throw new Error(data.error ?? "天气服务暂时不可用");
        setWeather(data);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setWeather(null);
          setWeatherError(error instanceof Error ? error.message : "天气服务暂时不可用");
        }
      } finally {
        if (!controller.signal.aborted) setWeatherLoading(false);
      }
    }
    loadWeather();
    return () => controller.abort();
  }, [hasJourney, location.lat, location.lng]);

  async function explore(payload: { query?: string; lat?: number; lng?: number }) {
    setSearching(true);
    setUpdateNote("正在理解新的旅行中心，并重新编排今天…");
    try {
      const response = await fetch("/api/explore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as ExploreResult & { error?: string };
      if (!response.ok || !data.location) throw new Error(data.error ?? "没有找到这个地址");
      if (!data.places.length) throw new Error(`${data.location.name} 暂时没有足够的开放地图地点`);
      const nextTimeline = buildTimeline(data.places);
      if (!nextTimeline.length) throw new Error(`${data.location.name} 暂时无法生成可用行程`);
      setLocation(data.location);
      setPlaces(data.places);
      setTimeline(nextTimeline);
      setTripDays([{ day: 1, title: `${data.location.name} · 第一天`, stops: nextTimeline }]);
      setActiveDay(1);
      setSelectedId((nextTimeline[1] ?? nextTimeline[0]).place.id);
      setJourneyStarted(false);
      setActiveScenario(null);
      setHotelEditor(false);
      setUpdateNote(`已围绕 ${data.location.name} 重排：优先减少折返，并保留一段机动时间。`);
    } catch (error) {
      setUpdateNote(error instanceof Error ? error.message : "搜索遇到问题，请稍后重试");
    } finally {
      setSearching(false);
    }
  }

  function submitHotel(event: FormEvent) {
    event.preventDefault();
    if (query.trim()) explore({ query: query.trim() });
  }

  function applyScenario(scenario: Scenario, customText?: string, force = false) {
    if (replanning && !force) return;
    setReplanning(true);
    setActiveScenario(scenario);
    window.setTimeout(() => {
      if (scenario === "late") {
        setTimeline((current) => current.slice(0, -1).map((stop, index) => index < 1 ? stop : { ...stop, time: shiftTime(stop.time, 60), endTime: shiftTime(stop.endTime, 60), note: index === 1 ? "预约已保留，已压缩午间停留" : stop.note }));
        setUpdateNote("已整体顺延 1 小时，并移除最远的一站；晚餐时间不变，今天不会越走越赶。");
      } else if (scenario === "tired") {
        setTimeline((current) => current.map((stop, index) => index >= 3 ? { ...stop, status: "optional", note: "已改为可选，随时可以回酒店" } : stop));
        setUpdateNote("已把今天缩成三段主行程，步行量减少约 38%；后两站只在你还有体力时继续。");
      } else if (scenario === "budget") {
        const freePlaces = places.filter((place) => place.category === "attraction" && place.tags.some((tag) => /免费|花园|公园|散步/.test(tag)));
        setTimeline((current) => current.map((stop, index) => index === 3 && freePlaces[0] ? { ...stop, place: freePlaces[0], note: "替换为免费地点，附近可步行抵达" } : stop));
        setUpdateNote("已取消高消费停留，改为免费公共空间与平价用餐，预计今天可少花约 €45。");
      } else {
        const indoor = places.find((place) => place.category === "attraction" && /馆|museum|室内|gallery/i.test(`${place.name} ${place.localName} ${place.tags.join(" ")}`));
        if (indoor) setTimeline((current) => current.map((stop, index) => index === 2 ? { ...stop, place: indoor, note: "已替换为室内地点，避开主要降雨时段" } : stop));
        setUpdateNote("已把户外段换成室内参观，并将短途交通集中到降雨最强的时段。");
      }
      if (customText) setUpdateNote((note) => `已理解“${customText}”。${note}`);
      setReplanning(false);
    }, 620);
  }

  async function searchDining(prompt: string, intelligentIntent?: DiningIntent) {
    setDiningOpen(true);
    setDiningLoading(true);
    setDiningError("");
    setDiningResults([]);
    try {
      const response = await fetch("/api/dining", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, location, intent: intelligentIntent }) });
      const data = await response.json() as { configured?: boolean; intent?: DiningIntent; places?: DiningResult[]; limitations?: string[]; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "暂时没有找到合适的餐厅");
      }
      setDiningIntent(data.intent ?? null);
      setDiningResults(data.places ?? []);
      setUpdateNote(`已从 OpenStreetMap 找到 ${data.places?.length ?? 0} 家附近餐厅，选一家就能加入今天的路线。`);
    } catch (error) {
      setDiningError(error instanceof Error ? error.message : "餐厅搜索遇到问题，请稍后重试");
    } finally {
      setDiningLoading(false);
    }
  }

  function addDiningToTrip(result: DiningResult) {
    const time = diningIntent?.time ?? "19:30";
    const place: Place = {
      id: `dining-${result.id}`,
      name: result.name,
      localName: diningIntent?.cuisineLabel ?? "晚餐",
      category: "restaurant",
      lat: result.lat,
      lng: result.lng,
      distance: result.distance,
      address: result.address,
      icon: "食",
      opening: result.openingLabel,
      summary: `从 OpenStreetMap 找到的附近${diningIntent?.cuisineLabel ?? "餐厅"}候选。`,
      tip: "出发前查看菜单、营业时间和是否需要预订。",
      tags: ["晚餐", diningIntent?.cuisineLabel ?? "餐厅", "OpenStreetMap"],
    };
    const stop: TripStop = {
      id: `stop-dining-${result.id}`,
      time,
      endTime: shiftTime(time, 90),
      place,
      status: "next",
      transit: "路线正在重新计算",
      note: `${diningIntent?.cuisineLabel ?? "晚餐"} · ${result.distance} · 营业时间请确认`,
    };
    setPlaces((current) => [place, ...current.filter((item) => item.id !== place.id)]);
    setTimeline((current) => [...current.filter((item) => item.place.id !== place.id && !(item.place.category === "restaurant" && item.status !== "done" && item.time >= "18:00")), stop].sort((a, b) => a.time.localeCompare(b.time)));
    setSelectedId(place.id);
    setDiningOpen(false);
    setJourneyStarted(false);
    setUpdateNote(`已把 ${result.name} 加入今晚 ${time}，并开始用开放路线服务重新计算整条步行路线。`);
  }

  async function searchAndAddPlace(query: string, label?: string | null, requestedTime?: string | null) {
    setUpdateNote(`正在 OpenStreetMap 搜索“${label ?? query}”…`);
    const response = await fetch("/api/place-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, label, location }),
    });
    const data = await response.json() as { places?: Place[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? "暂时没有找到这个地点");
    const place = data.places?.[0];
    if (!place) throw new Error(`在 ${location.name} 附近没有找到“${label ?? query}”，可以补充城市或国家后重试`);

    const existingStop = timeline.find((stop) => stop.place.id === place.id);
    if (existingStop) {
      setSelectedId(place.id);
      setUpdateNote(`${place.name} 已经在今天 ${existingStop.time} 的行程里。`);
      return;
    }

    const explicitTime = requestedTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(requestedTime) ? requestedTime : null;
    const time = explicitTime ?? (currentStop ? shiftTime(currentStop.endTime, 30) : "10:00");
    const endTime = shiftTime(time, 90);
    const stop: TripStop = {
      id: `stop-place-${place.id}`,
      time,
      endTime,
      place,
      status: "next",
      transit: "开放路线正在重新计算",
      note: "已从 OpenStreetMap 找到 · 开放时间请出发前确认",
    };
    setPlaces((current) => [place, ...current.filter((item) => item.id !== place.id)]);
    setTimeline((current) => {
      const shifted = explicitTime ? current : current.map((item) => item.status !== "done" && item.time >= time
        ? { ...item, time: shiftTime(item.time, 120), endTime: shiftTime(item.endTime, 120) }
        : item);
      return [...shifted.filter((item) => item.place.id !== place.id), stop].sort((a, b) => a.time.localeCompare(b.time));
    });
    if (!currentStop) {
      setLocation({ name: place.localName || place.name, lat: place.lat, lng: place.lng });
      setTripDays([{ day: 1, title: `${place.name} · 第一天`, stops: [stop] }]);
    }
    setSelectedId(place.id);
    setJourneyStarted(false);
    setAiState("live");
    setUpdateNote(`已找到 ${place.name}，加入今天 ${time}；OpenStreetMap 步行路线正在重新计算。`);
  }

  function localPlaceQuery(text: string) {
    return text
      .replace(/^(我想|想要|我要|帮我|请|能不能|可以)?\s*(去|参观|看看|看|前往|加入|安排)?/i, "")
      .replace(/(加进|加入|放进|安排进)?\s*(今天|我的)?\s*(的)?\s*行程(里|中)?[。！？!?.]*$/i, "")
      .trim() || text.trim();
  }

  async function planDestinationTrip(prompt: string, destinationQuery: string, destinationLabel: string, requestedDays: number, requestedStartDate?: string | null) {
    const dayCount = Math.min(14, Math.max(1, Math.round(requestedDays || 3)));
    const startDate = requestedStartDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedStartDate) ? requestedStartDate : null;
    setPlanLoading(true);
    setPlanError("");
    setUpdateNote(`正在加载 ${destinationLabel} 的真实地点，并生成 ${dayCount} 天计划…`);
    try {
      const exploreResponse = await fetch("/api/explore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: destinationQuery }),
      });
      const explored = await exploreResponse.json() as ExploreResult & { error?: string };
      if (!exploreResponse.ok || !explored.location) throw new Error(explored.error ?? `没有找到 ${destinationLabel}`);
      if (explored.places.length < 2) throw new Error(`${destinationLabel} 的开放地图候选地点暂时不足`);

      setUpdateNote(`已找到 ${explored.places.length} 个 ${destinationLabel} 真实地点，OpenAI 正在编排 ${dayCount} 天路线…`);
      const planResponse = await fetch("/api/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "generate",
          prompt,
          location: explored.location,
          days: dayCount,
          startDate,
          pace,
          budget,
          companions,
          interests,
          candidates: explored.places,
        }),
      });
      const plan = await planResponse.json() as AIPlanResponse;
      if (!planResponse.ok) throw new Error(plan.error ?? "AI 暂时无法生成目的地行程");
      const plannedDays = resolvePlanDays(plan, explored.places, startDate);
      if (plannedDays.length !== dayCount || !plannedDays[0]?.stops.length) throw new Error("AI 没有返回完整的多日计划");

      setLocation(explored.location);
      setQuery(destinationQuery);
      setPlaces(explored.places);
      setDays(dayCount);
      setTripDays(plannedDays);
      setActiveDay(1);
      setTimeline(plannedDays[0].stops);
      setSelectedId(plannedDays[0].stops[0].place.id);
      setTripPlanner(false);
      setHotelEditor(false);
      setActiveScenario(null);
      setJourneyStarted(false);
      setAiState("live");
      const tripId = `${destinationQuery.toLocaleLowerCase()}::${startDate ?? "open"}`;
      const savedTrip: SavedTrip = {
        id: tripId,
        title: destinationLabel,
        destinationQuery,
        startDate,
        location: explored.location,
        places: explored.places,
        tripDays: plannedDays,
      };
      setSavedTrips((current) => [...current.filter((trip) => trip.id !== tripId), savedTrip]);
      setActiveTripId(tripId);
      const dateCopy = startDate ? `，从 ${tripDateLabel(startDate, 0)} 开始` : "";
      setUpdateNote(plan.summary ?? `已生成 ${destinationLabel} ${dayCount} 天计划${dateCopy}。`);
      return savedTrip;
    } catch (error) {
      setAiState("error");
      const message = error instanceof Error ? error.message : "目的地计划生成失败，请稍后重试";
      setPlanError(message);
      setUpdateNote(message);
      return null;
    } finally {
      setPlanLoading(false);
    }
  }

  function openSavedTrip(trip: SavedTrip) {
    if (activeTripId) {
      const synchronizedDays = tripDays.map((day) => day.day === activeDay ? { ...day, stops: timeline } : day);
      setSavedTrips((current) => current.map((item) => item.id === activeTripId ? { ...item, tripDays: synchronizedDays } : item));
    }
    const firstDay = trip.tripDays[0];
    if (!firstDay?.stops.length) return;
    setActiveTripId(trip.id);
    setLocation(trip.location);
    setQuery(trip.destinationQuery);
    setPlaces(trip.places);
    setDays(trip.tripDays.length);
    setTripDays(trip.tripDays);
    setActiveDay(firstDay.day);
    setTimeline(firstDay.stops);
    setSelectedId(firstDay.stops[0].place.id);
    setJourneyStarted(false);
    setActiveScenario(null);
    setTripLibraryOpen(false);
    setUpdateNote(`已打开 ${trip.title} 的 ${trip.tripDays.length} 天行程。`);
  }

  async function runLocalCommand(text: string) {
    const destinationIntents = parseDestinationIntents(text);
    if (destinationIntents.length) {
      for (const destinationIntent of destinationIntents) {
        await planDestinationTrip(text, destinationIntent.destinationQuery, destinationIntent.destinationLabel, destinationIntent.days, destinationIntent.startDate);
      }
      if (destinationIntents.length > 1) setTripLibraryOpen(true);
      return;
    }
    if (/吃|餐厅|晚餐|料理|法餐|法国|restaurant|dinner/i.test(text)) {
      await searchDining(text);
      return;
    }
    const scenario: Scenario | null = /雨|天气/.test(text) ? "rain" : /晚|迟|来不及/.test(text) ? "late" : /累|休息|走不动/.test(text) ? "tired" : /预算|省钱|便宜/.test(text) ? "budget" : null;
    if (scenario) applyScenario(scenario, text);
    else await searchAndAddPlace(localPlaceQuery(text), localPlaceQuery(text));
  }

  async function replanTrip(prompt: string, fallbackScenario?: Scenario) {
    if (replanning) return;
    let fallbackStarted = false;
    setReplanning(true);
    setAiThinking(true);
    setActiveScenario(fallbackScenario ?? null);
    setUpdateNote("OpenAI 正在结合真实地点与当前路线重新安排…");
    try {
      const response = await fetch("/api/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "modify",
          prompt,
          location,
          pace,
          budget,
          companions,
          interests,
          candidates: places,
          currentTimeline: timeline.map((stop) => ({ placeId: stop.place.id, name: stop.place.name, time: stop.time, endTime: stop.endTime, status: stop.status, note: stop.note })),
        }),
      });
      const data = await response.json() as AIPlanResponse;
      if (!response.ok) throw new Error(data.error ?? "AI 暂时无法修改行程");
      const plannedDays = resolvePlanDays(data, places);
      if (!plannedDays[0]?.stops.length) throw new Error("AI 没有返回可验证的地点");
      setTimeline(plannedDays[0].stops);
      setTripDays((current) => current.map((day) => day.day === activeDay ? { ...day, title: plannedDays[0].title, stops: plannedDays[0].stops } : day));
      setSelectedId(plannedDays[0].stops[0].place.id);
      setJourneyStarted(false);
      setAiState("live");
      setUpdateNote(data.summary ?? "已根据你的要求重新编排行程，路线正在更新。");
    } catch (error) {
      setAiState("error");
      if (fallbackScenario) {
        fallbackStarted = true;
        applyScenario(fallbackScenario, prompt, true);
      } else {
        setUpdateNote(error instanceof Error ? error.message : "AI 修改行程失败，请稍后重试");
      }
    } finally {
      setAiThinking(false);
      if (!fallbackStarted) setReplanning(false);
    }
  }

  async function submitCommand(event: FormEvent) {
    event.preventDefault();
    const text = command.trim();
    if (!text || aiThinking) return;
    setCommand("");
    setAiThinking(true);

    // Multi-day destination requests are deterministic enough to route locally.
    // Handle them before the model so an occasional `place_search` classification
    // cannot turn "纽约五天" into a single-place lookup.
    const destinationIntents = parseDestinationIntents(text);
    if (destinationIntents.length) {
      try {
        let completed = 0;
        for (const [index, destinationIntent] of destinationIntents.entries()) {
          setUpdateNote(`正在生成第 ${index + 1}/${destinationIntents.length} 段：${destinationIntent.destinationLabel} ${destinationIntent.days} 天…`);
          const trip = await planDestinationTrip(
            text,
            destinationIntent.destinationQuery,
            destinationIntent.destinationLabel,
            destinationIntent.days,
            destinationIntent.startDate,
          );
          if (trip) completed += 1;
        }
        if (completed > 1) {
          setTripLibraryOpen(true);
          setUpdateNote(`已分别保存 ${completed} 个城市行程，可以从“全部行程”随时切换。`);
        }
      } finally {
        setAiThinking(false);
      }
      return;
    }

    setUpdateNote("OpenAI 正在理解你的真实意图，并准备调用合适的旅行工具…");
    try {
      const response = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: text, location, timeline: timeline.map((stop) => ({ time: stop.time, name: stop.place.name, status: stop.status })) }) });
      const data = await response.json() as { configured?: boolean; action?: AgentAction; error?: string };
      if (!response.ok || !data.action) {
        setAiState(response.status === 503 ? "unconfigured" : "error");
        await runLocalCommand(text);
        return;
      }
      setAiState("live");
      const action = data.action;
      if (action.action === "destination_plan") {
        await planDestinationTrip(
          text,
          action.destinationQuery ?? action.destinationLabel ?? localPlaceQuery(text),
          action.destinationLabel ?? action.destinationQuery ?? "目的地",
          action.tripDays ?? 3,
          action.startDate,
        );
      } else if (action.action === "dining_search") {
        const intent: DiningIntent = {
          cuisine: action.cuisineQuery ?? "Local restaurant",
          cuisineLabel: action.cuisineLabel ?? "当地餐厅",
          minRating: action.minRating ?? 4,
          budget: action.budgetAmount ?? 20,
          currency: action.budgetCurrency ?? "EUR",
          time: action.time ?? "19:30",
        };
        setUpdateNote(action.explanation);
        await searchDining(text, intent);
      } else if (action.action === "place_search") {
        await searchAndAddPlace(action.placeQuery ?? localPlaceQuery(text), action.placeLabel ?? localPlaceQuery(text), action.time);
      } else if (action.action === "open_planner") {
        setTripPlanner(true);
        setUpdateNote(action.explanation);
      } else if (action.action === "weather_replan") await replanTrip(text, "rain");
      else if (action.action === "delay_replan") await replanTrip(text, "late");
      else if (action.action === "fatigue_replan") await replanTrip(text, "tired");
      else if (action.action === "budget_replan") await replanTrip(text, "budget");
      else await replanTrip(text);
    } catch (error) {
      setAiState("error");
      try {
        await runLocalCommand(text);
      } catch (fallbackError) {
        setUpdateNote(fallbackError instanceof Error ? fallbackError.message : error instanceof Error ? error.message : "暂时无法执行这个请求");
      }
    } finally {
      setAiThinking(false);
    }
  }

  function toggleInterest(value: string) {
    setInterests((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  function selectTripDay(dayNumber: number) {
    const synchronizedDays = tripDays.map((day) => day.day === activeDay ? { ...day, stops: timeline } : day);
    const day = synchronizedDays.find((item) => item.day === dayNumber);
    if (!day?.stops.length) return;
    setTripDays(synchronizedDays);
    setActiveDay(dayNumber);
    setTimeline(day.stops);
    setSelectedId(day.stops[0].place.id);
    setJourneyStarted(false);
    setUpdateNote(`已切换到第 ${dayNumber} 天：${day.title}。`);
  }

  async function generateTrip() {
    if (planLoading) return;
    setPlanLoading(true);
    setPlanError("");
    setUpdateNote("OpenAI 正在按你的节奏、预算和兴趣编排多日路线…");
    try {
      const response = await fetch("/api/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "generate",
          prompt: `制定 ${days} 天专属旅行计划`,
          location,
          days,
          pace,
          budget,
          companions,
          interests,
          candidates: places,
        }),
      });
      const data = await response.json() as AIPlanResponse;
      if (!response.ok) throw new Error(data.error ?? "AI 暂时无法生成行程");
      const plannedDays = resolvePlanDays(data, places);
      if (!plannedDays[0]?.stops.length) throw new Error("AI 没有返回可验证的地点");
      setTripDays(plannedDays);
      setActiveDay(1);
      setTimeline(plannedDays[0].stops);
      setSelectedId(plannedDays[0].stops[0].place.id);
      setTripPlanner(false);
      setJourneyStarted(false);
      setAiState("live");
      setUpdateNote(data.summary ?? `已按 ${days} 天、${pace}节奏和${budget}预算生成专属路线。`);
    } catch (error) {
      setAiState("error");
      setPlanError(error instanceof Error ? error.message : "生成失败，请稍后重试");
      setUpdateNote("AI 行程暂未生成，原路线已保留。");
    } finally {
      setPlanLoading(false);
    }
  }

  return (
    <main className="michi-shell">
      <header className="app-header">
        <button className="brand" aria-label="回到今日行程"><span>M</span><b>michi</b></button>
        <nav aria-label="主要功能"><button className="active">{hasJourney ? "今日行动" : "开始旅行"}</button>{hasJourney ? <button onClick={() => document.querySelector(".day-line")?.scrollIntoView({ behavior: "smooth" })}>行程总览</button> : null}</nav>
        <div className="header-actions">
          <button className="trip-center" onClick={() => setHotelEditor(true)}><Icon name="hotel" size={16}/><span><small>旅行中心</small><b>{hasJourney ? location.name : "选择城市或酒店"}</b></span><Icon name="edit" size={14}/></button>
          <button className="journeys-button" onClick={() => setTripLibraryOpen(true)}><Icon name="map" size={16}/>全部行程{savedTrips.length ? <b>{savedTrips.length}</b> : null}</button>
          {hasJourney ? <button className="offline" title="行程已在本机缓存"><Icon name="offline" size={16}/><span>离线可用</span></button> : null}
          <button className="plan-button" onClick={() => setTripPlanner(true)}><Icon name="calendar" size={16}/>行前计划</button>
          <button className="avatar" aria-label="个人账户">ZR</button>
        </div>
      </header>

      <section className={hasJourney ? "command-layout" : "command-layout welcome-mode"}>
        <div className="focus-pane">
          {currentStop ? <>
            <div className="today-context"><span>{location.name} · 当地行程</span><i/><span>第 {activeDay} 天</span></div>
            <div className="focus-head"><div><h1>早上好，<br/>今天交给我。</h1><p>你只需要按下一步走。天气、延误和体力变化，由我继续安排。</p></div><span className="day-mark">{String(activeDay).padStart(2, "0")}<small>DAY</small></span></div>
            <div className={weatherLoading ? "weather-glance loading" : "weather-glance"} aria-live="polite">
              {weatherLoading ? <><span className="weather-pulse"/><p>正在加载当地天气与日落时间…</p></> : weather ? <><span className="weather-icon" aria-hidden="true">{weather.current.icon}</span><div><b>{weather.current.temperature == null ? "—" : `${Math.round(weather.current.temperature)}°`} · {weather.current.label}</b><small>体感 {weather.current.apparentTemperature == null ? "—" : `${Math.round(weather.current.apparentTemperature)}°`} · 风速 {weather.current.windSpeed == null ? "—" : `${Math.round(weather.current.windSpeed)} km/h`}</small></div><div><b>降雨 {weather.daily[0]?.precipitationProbability ?? 0}%</b><small>{weather.current.precipitation ?? 0} mm</small></div><div><b>日出 {weather.daily[0]?.sunrise ?? "—"}</b><small>日落 {weather.daily[0]?.sunset ?? "—"}</small></div><em>{weather.timezoneAbbreviation || weather.timezone}</em></> : <><span className="weather-icon" aria-hidden="true">🌡️</span><p>{weatherError || "天气暂时不可用，不影响行程规划"}</p></>}
            </div>

            <article className="next-action">
              <div className="action-number">NEXT <b>01</b></div>
              <div className="action-copy">
                <p>下一站</p>
                <button onClick={() => { setSelectedId(currentStop.place.id); setGuideOpen(true); }}><h2>{currentStop.place.name}</h2><span>{currentStop.place.localName}</span></button>
                <div className="action-facts"><span><Icon name="clock" size={17}/><b>{currentStop.time} 离开酒店</b></span><span><Icon name="route" size={17}/><b>{currentTransit}</b></span><span><Icon name="ticket" size={17}/><b>{currentStop.place.opening}</b></span></div>
              </div>
              <div className="action-cta">
                {journeyStarted ? <a href={navigationUrl} target="_blank" rel="noreferrer">打开实时导航 <Icon name="arrow"/></a> : <button onClick={() => setJourneyStarted(true)}>开始这一程 <Icon name="arrow"/></button>}
                <small>{journeyStarted ? "已进入途中模式，路线变化会继续提醒" : "准备好后随时开始"}</small>
              </div>
            </article>

            <div className={replanning || aiThinking ? "live-update thinking" : "live-update"}><span><Icon name="spark" size={17}/></span><div><b>{aiThinking ? "OpenAI 正在理解并调用工具…" : replanning ? "正在重新计算今天…" : "Michi 正在照看你的今天"}</b><p>{updateNote}</p></div><i/></div>
          </> : <div className="welcome-copy">
            <span className="welcome-kicker"><Icon name="spark" size={16}/> AI TRAVEL COMPANION</span>
            <h1>今天想去哪里？</h1>
            <p>告诉我一个城市、酒店，或者一次包含多个目的地的旅行。我会用真实地点分别保存每一段行程。</p>
            <div className="welcome-examples"><button onClick={() => setCommand("9月1日开始去东京5天")}>东京 5 天</button><button onClick={() => setCommand("纽约玩五天再去巴黎")}>纽约＋巴黎</button><button onClick={() => setHotelEditor(true)}>输入酒店</button></div>
            <div className={aiThinking ? "welcome-status thinking" : "welcome-status"}><i/><span>{updateNote}</span></div>
          </div>}
        </div>

        <section className="route-map" aria-label="今日行程地图">
          <div ref={mapHostRef} className="map-host"/>
          <div className="map-wash"/>
          <header className="map-top"><div><span className="live-dot"/>{hasJourney ? routeState === "live" ? "OPEN ROUTE" : routeState === "error" ? "DIRECT LINE" : "ROUTING" : "OPEN WORLD"}</div><p>{hasJourney ? `今日路线 · ${timeline.length} 站` : "从世界任意城市开始"}</p><button aria-label="展开地图"><Icon name="map"/></button></header>
          {hasJourney ? <div className="map-key"><span><i className="hotel-color"/>酒店</span><span><i className="now-color"/>现在</span><span><i className="next-color"/>之后</span></div> : null}
          {routeState === "live" && hasJourney ? <small className="open-route-attribution">步行路线 · FOSSGIS OSRM</small> : null}
          {currentStop ? <button className="next-turn" onClick={() => setJourneyStarted(true)}><span><Icon name="route" size={21}/></span><div><small>下一段</small><b>{currentTransit}</b><p>预计 {currentStop.time} 出发</p></div><Icon name="arrow"/></button> : null}
        </section>

        {hasJourney ? <section className="day-line">
          <header><div><h2>第 {activeDay} 天怎么走</h2><p>{tripDays.find((day) => day.day === activeDay)?.title ?? "不是景点清单，而是一条可以随时改变的路线。"}</p></div><span>{timeline.filter((stop) => stop.status === "done").length}/{timeline.length} 完成</span></header>
          {tripDays.length > 1 ? <div className="day-tabs" aria-label="选择行程日期">{tripDays.map((day) => <button key={day.day} className={day.day === activeDay ? "active" : ""} onClick={() => selectTripDay(day.day)}>D{day.day}<span>{day.title}</span></button>)}</div> : null}
          <div className="timeline-list">
            {timeline.map((stop, index) => (
              <button key={stop.id} className={`timeline-row ${stop.status}`} onClick={() => { setSelectedId(stop.place.id); setGuideMode("quick"); setGuideOpen(true); }}>
                <time>{stop.time}<small>{stop.endTime}</small></time>
                <span className="timeline-node">{stop.status === "done" ? "✓" : String(index + 1).padStart(2, "0")}</span>
                <div><span>{stop.status === "now" ? "现在准备" : stop.status === "done" ? "已经完成" : stop.status === "optional" ? "体力允许再去" : stop.transit}</span><h3>{stop.place.name}</h3><p>{stop.note}</p></div>
                <Icon name={stop.status === "now" ? "arrow" : "book"} size={18}/>
              </button>
            ))}
          </div>
        </section> : null}

        <section className="ai-command" aria-label="AI 实时改行程">
          {hasJourney ? <div className="scenario-actions">
            {(Object.keys(scenarioCopy) as Scenario[]).map((scenario) => <button key={scenario} className={activeScenario === scenario ? "active" : ""} onClick={() => replanTrip(scenarioCopy[scenario].prompt, scenario)} disabled={replanning || aiThinking}><Icon name={scenarioCopy[scenario].icon} size={16}/>{scenarioCopy[scenario].label}</button>)}
            <span className={`engine-status ${aiState}`}><i/>{aiState === "live" ? "OPENAI + OPEN MAP" : "OPEN MAP"}</span>
          </div> : null}
          <form onSubmit={submitCommand}><span><Icon name="spark" size={19}/></span><input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="例如：9月1日开始去纽约5天，或者我想去凯旋门" aria-label="输入行程变化"/><button type="submit" aria-label="发送给 Michi" disabled={aiThinking || planLoading}><Icon name="send" size={18}/></button></form>
        </section>
      </section>

      {tripLibraryOpen ? <div className="drawer-layer"><section className="journeys-drawer" role="dialog" aria-modal="true" aria-labelledby="journeys-title"><button className="close-button" onClick={() => setTripLibraryOpen(false)} aria-label="关闭"><Icon name="close"/></button><header><span><Icon name="map" size={22}/></span><div><p>YOUR TRIPS</p><h2 id="journeys-title">全部行程</h2></div></header>{savedTrips.length ? <div className="journeys-list">{savedTrips.map((trip, index) => <button key={trip.id} className={trip.id === activeTripId ? "active" : ""} onClick={() => openSavedTrip(trip)}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{trip.title}</h3><p>{trip.startDate ? `${tripDateLabel(trip.startDate, 0)}开始 · ` : ""}{trip.tripDays.length} 天 · {trip.places.length} 个真实地点</p></div><Icon name="arrow" size={18}/></button>)}</div> : <div className="journeys-empty"><Icon name="calendar" size={28}/><h3>还没有保存的行程</h3><p>试试输入“纽约玩五天再去巴黎”，两座城市会分别保存在这里。</p></div>}</section></div> : null}

      {hotelEditor ? <div className="modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHotelEditor(false); }}><section className="hotel-dialog" role="dialog" aria-modal="true" aria-labelledby="hotel-title"><button className="close-button" onClick={() => setHotelEditor(false)} aria-label="关闭"><Icon name="close"/></button><Icon name="hotel" size={27}/><h2 id="hotel-title">从哪里开始今天？</h2><p>输入酒店、民宿或任意地址。Michi 会重新计算整天，而不只是移动地图中心。</p><form onSubmit={submitHotel}><label htmlFor="hotel-query">酒店或地址</label><div><input id="hotel-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：The Hoxton, Rome" autoFocus/><button disabled={searching}>{searching ? "正在重排…" : "设为旅行中心"}</button></div></form><div className="quick-places">{[{label:"巴黎",q:"Saint-Germain-des-Prés, Paris"},{label:"纽约",q:"Times Square, New York"},{label:"伦敦",q:"Covent Garden, London"},{label:"曼谷",q:"Siam, Bangkok"}].map((item) => <button key={item.label} onClick={() => { setQuery(item.q); explore({query:item.q}); }}>{item.label}</button>)}</div></section></div> : null}

      {tripPlanner ? <div className="drawer-layer"><section className="planner-drawer" role="dialog" aria-modal="true" aria-labelledby="planner-title"><button className="close-button" onClick={() => setTripPlanner(false)} aria-label="关闭"><Icon name="close"/></button><header><Icon name="calendar" size={24}/><h2 id="planner-title">先把旅行想清楚</h2><p>不是多塞几个景点，而是让每一天符合你的体力、预算和兴趣。</p></header><div className="planner-field days-field"><span>旅行天数</span><div><button onClick={() => setDays(Math.max(1, days - 1))}>−</button><b>{days} 天</b><button onClick={() => setDays(Math.min(14, days + 1))}>＋</button></div></div><div className="planner-field"><span>旅行节奏</span><div className="choice-line">{["慢游","松弛","充实"].map((item) => <button key={item} className={pace === item ? "active" : ""} onClick={() => setPace(item)}>{item}</button>)}</div></div><div className="planner-field"><span>每日预算</span><div className="choice-line">{["节省","适中","享受"].map((item) => <button key={item} className={budget === item ? "active" : ""} onClick={() => setBudget(item)}>{item}</button>)}</div></div><div className="planner-field"><span>同行方式</span><div className="choice-line">{["独自","两人","亲子"].map((item) => <button key={item} className={companions === item ? "active" : ""} onClick={() => setCompanions(item)}>{item}</button>)}</div></div><div className="planner-field"><span>真正想看的</span><div className="interest-grid">{["历史建筑","当地美食","城市摄影","设计购物","亲子友好","夜间体验"].map((item) => <button key={item} className={interests.includes(item) ? "active" : ""} onClick={() => toggleInterest(item)}>{interests.includes(item) ? "✓" : "+"} {item}</button>)}</div></div>{planError ? <p className="planner-error" role="alert">{planError}</p> : null}<button className="generate-plan" onClick={generateTrip} disabled={planLoading}><Icon name="spark"/>{planLoading ? "OpenAI 正在编排行程…" : "生成一条能真正走完的路线"}</button></section></div> : null}

      {diningOpen ? <div className="drawer-layer"><section className="dining-drawer" role="dialog" aria-modal="true" aria-labelledby="dining-title"><button className="close-button" onClick={() => setDiningOpen(false)} aria-label="关闭"><Icon name="close"/></button><header><span className="dining-kicker"><Icon name="dining" size={16}/> OPENAI × OPENSTREETMAP</span><h2 id="dining-title">附近吃什么</h2><p>{diningIntent ? `${diningIntent.time} · ${diningIntent.cuisineLabel}。已从 OpenStreetMap 搜索酒店附近的真实餐厅，选一家即可加入行程。` : "告诉我想吃的菜系，我会从 OpenStreetMap 找酒店附近的真实餐厅。"}</p></header>{diningLoading ? <div className="dining-loading" role="status"><span/><span/><span/><p>正在搜索附近真实餐厅与步行距离…</p></div> : null}{diningError ? <div className="dining-error"><Icon name="map" size={23}/><h3>地点搜索暂时不可用</h3><p>{diningError}</p><small>免费开放地图无需 API 密钥，可以稍后直接重试。</small></div> : null}{!diningLoading && !diningError && diningResults.length === 0 ? <div className="dining-empty"><p>附近没有找到对应菜系。可以换一个更宽泛的说法，例如“当地餐厅”或“晚餐”。</p></div> : null}<div className="dining-results">{diningResults.map((result, index) => <article className="dining-card" key={result.id}><div className="dining-rank">{String(index + 1).padStart(2, "0")}</div><div className="dining-card-copy"><header><div><h3>{result.name}</h3><p>{result.address}</p></div></header><div className="dining-meta"><span>{result.openingLabel}</span><span>{result.distance}</span></div><footer><a href={result.detailsUri} target="_blank" rel="noreferrer">查看开放地图详情</a><button onClick={() => addDiningToTrip(result)}><Icon name="plus" size={15}/>加入今晚行程</button></footer></div></article>)}</div>{diningResults.length ? <p className="open-data-attribution">地点数据来自 OpenStreetMap 社区 · 营业时间请出发前确认</p> : null}</section></div> : null}

      {guideOpen && selected ? <div className="guide-layer"><section className="guide-drawer" role="dialog" aria-modal="true" aria-labelledby="guide-title"><button className="close-button" onClick={() => setGuideOpen(false)} aria-label="关闭"><Icon name="close"/></button><div className="guide-visual"><span>{selected.icon}</span><div className="guide-skyline"><i/><i/><i/><i/></div></div><header><p>{selected.localName}</p><h2 id="guide-title">{selected.name}</h2><span>{selected.address}</span></header><div className="guide-modes"><button className={guideMode === "quick" ? "active" : ""} onClick={() => setGuideMode("quick")}>3 分钟速读</button><button className={guideMode === "deep" ? "active" : ""} onClick={() => setGuideMode("deep")}>10 分钟深读</button><button className={guideMode === "family" ? "active" : ""} onClick={() => setGuideMode("family")}>讲给孩子听</button></div><div className="guide-copy"><p className="guide-lead">{selected.summary}</p>{guideMode === "quick" ? <><h3>先看懂它</h3><p>{selected.name}真正值得看的，不只是最著名的正面画面，而是它如何连接周围街区、城市历史与今天的公共生活。</p><h3>到现场怎么走</h3><p>{selected.tip}</p></> : guideMode === "deep" ? <><h3>它从哪里来</h3><p>理解这里，可以从“谁建造、为谁服务、后来如何改变”三个问题开始。建筑与收藏不是孤立的对象，它们往往记录着城市权力、技术和普通生活的迁移。</p><h3>容易错过的细节</h3><p>{selected.tip} 观察入口方向、材料交接、修复痕迹和人群使用方式，往往比追逐一张标准照片更接近真实的地方。</p><h3>把它放回这座城市</h3><p>参观结束后不要立刻离开。绕到侧面街区走十分钟，看看尺度、店铺和居民生活如何变化，这一段才会把知识变成旅行记忆。</p></> : <><h3>把它想成一台时间机器</h3><p>这里就像一台很大的时间机器。不同年代的人把自己的想法、技术和生活习惯一层层留了下来，我们今天看到的是许多故事叠在一起。</p><h3>给孩子的观察任务</h3><p>找出三个不同形状的门或窗，再猜猜哪一个最老。不要急着公布答案，让孩子先说出自己的理由。</p></>}</div><div className="guide-actions"><button onClick={() => setGuideMode("deep")}><Icon name="book"/>继续深读</button><a href={openDirectionsUrl(location, selected)} target="_blank" rel="noreferrer">前往这里 <Icon name="arrow"/></a></div></section></div> : null}
    </main>
  );
}
