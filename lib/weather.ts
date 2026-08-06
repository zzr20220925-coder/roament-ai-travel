export type OpenMeteoResponse = {
  timezone?: string;
  timezone_abbreviation?: string;
  current?: {
    time?: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    precipitation?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    is_day?: number;
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
    sunrise?: string[];
    sunset?: string[];
  };
  reason?: string;
};

export type WeatherData = {
  provider: "open-meteo";
  timezone: string;
  timezoneAbbreviation: string;
  current: {
    observedAt: string | null;
    temperature: number | null;
    apparentTemperature: number | null;
    precipitation: number | null;
    windSpeed: number | null;
    code: number | null;
    label: string;
    icon: string;
    isDay: boolean;
  };
  daily: Array<{
    date: string;
    code: number | null;
    label: string;
    icon: string;
    temperatureMax: number | null;
    temperatureMin: number | null;
    precipitationProbability: number | null;
    sunrise: string | null;
    sunset: string | null;
  }>;
};

function weatherLabel(code: number | undefined) {
  if (code === 0) return "晴朗";
  if (code === 1) return "大致晴朗";
  if (code === 2) return "局部多云";
  if (code === 3) return "阴天";
  if (code === 45 || code === 48) return "有雾";
  if (code != null && code >= 51 && code <= 57) return "毛毛雨";
  if (code != null && code >= 61 && code <= 67) return "有雨";
  if (code != null && code >= 71 && code <= 77) return "有雪";
  if (code != null && code >= 80 && code <= 82) return "阵雨";
  if (code != null && code >= 85 && code <= 86) return "阵雪";
  if (code != null && code >= 95) return "雷雨";
  return "天气待更新";
}

function weatherIcon(code: number | undefined, isDay = true) {
  if (code === 0) return isDay ? "☀️" : "🌙";
  if (code != null && code <= 2) return isDay ? "🌤️" : "☁️";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code != null && code >= 51 && code <= 67) return "🌧️";
  if (code != null && code >= 71 && code <= 77) return "🌨️";
  if (code != null && code >= 80 && code <= 82) return "🌦️";
  if (code != null && code >= 85 && code <= 86) return "🌨️";
  if (code != null && code >= 95) return "⛈️";
  return "🌡️";
}

function localTime(value: string | undefined) {
  return typeof value === "string" && value.includes("T") ? value.split("T")[1].slice(0, 5) : null;
}

export function buildWeatherUrl(latitude: number, longitude: number) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("current", "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day");
  url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "16");
  return url;
}

export function normalizeWeather(data: OpenMeteoResponse): WeatherData {
  if (!data.current) throw new Error(data.reason ?? "天气服务暂时不可用");
  const daily = (data.daily?.time ?? []).map((date, index) => {
    const code = data.daily?.weather_code?.[index];
    return {
      date,
      code: code ?? null,
      label: weatherLabel(code),
      icon: weatherIcon(code),
      temperatureMax: data.daily?.temperature_2m_max?.[index] ?? null,
      temperatureMin: data.daily?.temperature_2m_min?.[index] ?? null,
      precipitationProbability: data.daily?.precipitation_probability_max?.[index] ?? null,
      sunrise: localTime(data.daily?.sunrise?.[index]),
      sunset: localTime(data.daily?.sunset?.[index]),
    };
  });
  return {
    provider: "open-meteo",
    timezone: data.timezone ?? "auto",
    timezoneAbbreviation: data.timezone_abbreviation ?? "",
    current: {
      observedAt: data.current.time ?? null,
      temperature: data.current.temperature_2m ?? null,
      apparentTemperature: data.current.apparent_temperature ?? null,
      precipitation: data.current.precipitation ?? null,
      windSpeed: data.current.wind_speed_10m ?? null,
      code: data.current.weather_code ?? null,
      label: weatherLabel(data.current.weather_code),
      icon: weatherIcon(data.current.weather_code, data.current.is_day !== 0),
      isDay: data.current.is_day !== 0,
    },
    daily,
  };
}
