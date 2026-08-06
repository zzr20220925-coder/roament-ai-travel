import assert from "node:assert/strict";
import test from "node:test";
import { buildWeatherUrl, normalizeWeather } from "../lib/weather.ts";

test("weather request asks for local timezone, 16 days, sunrise and sunset", () => {
  const url = buildWeatherUrl(40.7128, -74.006);
  assert.equal(url.origin, "https://api.open-meteo.com");
  assert.equal(url.searchParams.get("timezone"), "auto");
  assert.equal(url.searchParams.get("forecast_days"), "16");
  assert.match(url.searchParams.get("current") ?? "", /temperature_2m/);
  assert.match(url.searchParams.get("daily") ?? "", /sunrise/);
  assert.match(url.searchParams.get("daily") ?? "", /sunset/);
});

test("weather data is normalized into Chinese conditions and local sun times", () => {
  const data = normalizeWeather({
    timezone: "America/New_York",
    timezone_abbreviation: "EDT",
    current: {
      time: "2026-08-06T09:00",
      temperature_2m: 24.4,
      apparent_temperature: 25.1,
      precipitation: 0,
      weather_code: 1,
      wind_speed_10m: 12.2,
      is_day: 1,
    },
    daily: {
      time: ["2026-08-06"],
      weather_code: [1],
      temperature_2m_max: [28],
      temperature_2m_min: [20],
      precipitation_probability_max: [18],
      sunrise: ["2026-08-06T05:59"],
      sunset: ["2026-08-06T20:05"],
    },
  });

  assert.equal(data.provider, "open-meteo");
  assert.equal(data.current.label, "大致晴朗");
  assert.equal(data.daily[0].sunrise, "05:59");
  assert.equal(data.daily[0].sunset, "20:05");
  assert.equal(data.timezoneAbbreviation, "EDT");
});
