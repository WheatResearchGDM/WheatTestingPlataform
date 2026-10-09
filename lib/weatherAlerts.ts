export type WeatherModelCondition = {
  id: string;
  name: string;
  available: boolean;
  condition: string;
  weatherCode: number;
  temperature: number;
  humidity: number;
  precipitation: number;
  gust: number;
  observedAt: string;
};

export type WeatherHistorySource = {
  id: string;
  name: string;
  available: boolean;
  accumulatedPrecipitation: number;
  stormDays: number;
  hailDays: number;
};

export type WeatherEvent = {
  date: string;
  type: 'Tempestade' | 'Granizo';
  sources: string[];
  precipitation: number;
  gust: number;
};

export type WeatherDay = {
  date: string;
  condition: string;
  weatherCode: number;
  precipitation: number;
  temperatureMax: number;
  temperatureMin: number;
};

export type LocationWeather = {
  locationId: string;
  locationName: string;
  checkedAt: string;
  condition: string;
  temperature: number;
  precipitation: number;
  sources: WeatherModelCondition[];
  sowingDate?: string;
  accumulatedPrecipitation?: number;
  historySources?: WeatherHistorySource[];
  events?: WeatherEvent[];
  week?: WeatherDay[];
};

const weatherModels = [
  { id: 'ecmwf_ifs025', name: 'ECMWF/IFS' },
  { id: 'gfs_seamless', name: 'NOAA/GFS' },
  { id: 'icon_seamless', name: 'DWD/ICON' },
] as const;

type CurrentResponse = {
  current?: {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    precipitation?: number;
    weather_code?: number;
    wind_gusts_10m?: number;
  };
};

type DailyResponse = {
  daily?: {
    time?: string[];
    weather_code?: number[];
    precipitation_sum?: number[];
    wind_gusts_10m_max?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
  };
};

export function weatherCodeLabel(code: number) {
  if (code === 0) return 'Céu limpo';
  if (code === 1) return 'Predominantemente limpo';
  if (code === 2) return 'Parcialmente nublado';
  if (code === 3) return 'Nublado';
  if (code === 45 || code === 48) return 'Neblina';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Garoa';
  if ([61, 63, 65, 66, 67].includes(code)) return 'Chuva';
  if ([71, 73, 75, 77].includes(code)) return 'Neve';
  if ([80, 81, 82].includes(code)) return 'Pancadas de chuva';
  if (code === 85 || code === 86) return 'Pancadas de neve';
  if (code === 95) return 'Trovoadas';
  if (code === 96 || code === 99) return 'Trovoadas com granizo';
  return 'Condição variável';
}

async function fetchModel(latitude: number, longitude: number, model: typeof weatherModels[number]) {
  const query = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_gusts_10m',
    timezone: 'America/Sao_Paulo',
    models: model.id,
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`);
  if (!response.ok) throw new Error(`${model.name}: resposta ${response.status}`);
  const current = (await response.json() as CurrentResponse).current;
  if (!current) throw new Error(`${model.name}: condição atual indisponível`);
  const weatherCode = Number(current.weather_code ?? 0);
  return {
    id: model.id,
    name: model.name,
    available: true,
    condition: weatherCodeLabel(weatherCode),
    weatherCode,
    temperature: Math.round(Number(current.temperature_2m ?? 0) * 10) / 10,
    humidity: Math.round(Number(current.relative_humidity_2m ?? 0)),
    precipitation: Math.round(Number(current.precipitation ?? 0) * 10) / 10,
    gust: Math.round(Number(current.wind_gusts_10m ?? 0)),
    observedAt: current.time ?? new Date().toISOString(),
  } satisfies WeatherModelCondition;
}

async function fetchHistory(latitude: number, longitude: number, model: typeof weatherModels[number], startDate: string, endDate: string) {
  const query = new URLSearchParams({
    latitude: String(latitude), longitude: String(longitude), start_date: startDate, end_date: endDate,
    daily: 'weather_code,precipitation_sum,wind_gusts_10m_max', timezone: 'America/Sao_Paulo', models: model.id,
  });
  const response = await fetch(`https://historical-forecast-api.open-meteo.com/v1/forecast?${query}`);
  if (!response.ok) throw new Error(`${model.name} histórico: resposta ${response.status}`);
  const daily = (await response.json() as DailyResponse).daily;
  if (!daily) throw new Error(`${model.name}: histórico indisponível`);
  const days = (daily.time ?? []).map((date, index) => ({ date, weatherCode: Number(daily.weather_code?.[index] ?? 0), precipitation: Math.round(Number(daily.precipitation_sum?.[index] ?? 0) * 10) / 10, gust: Math.round(Number(daily.wind_gusts_10m_max?.[index] ?? 0)) }));
  return { model, days, accumulatedPrecipitation: Math.round(days.reduce((sum, day) => sum + day.precipitation, 0) * 10) / 10 };
}

async function fetchWeek(latitude: number, longitude: number) {
  const query = new URLSearchParams({
    latitude: String(latitude), longitude: String(longitude),
    daily: 'weather_code,precipitation_sum,temperature_2m_max,temperature_2m_min', forecast_days: '7', timezone: 'America/Sao_Paulo',
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`);
  if (!response.ok) throw new Error(`Previsão semanal: resposta ${response.status}`);
  const daily = (await response.json() as DailyResponse).daily;
  return (daily?.time ?? []).map((date, index): WeatherDay => {
    const weatherCode = Number(daily?.weather_code?.[index] ?? 0);
    return { date, weatherCode, condition: weatherCodeLabel(weatherCode), precipitation: Math.round(Number(daily?.precipitation_sum?.[index] ?? 0) * 10) / 10, temperatureMax: Math.round(Number(daily?.temperature_2m_max?.[index] ?? 0)), temperatureMin: Math.round(Number(daily?.temperature_2m_min?.[index] ?? 0)) };
  });
}

export async function fetchWeatherConditions(locations: Array<{ id: string; name: string; lat: number; lng: number }>, sowingDates: Record<string, string> = {}) {
  const checkedAt = new Date().toISOString();
  const today = checkedAt.slice(0, 10);
  const yesterdayDate = new Date(`${today}T12:00:00`); yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = yesterdayDate.toISOString().slice(0, 10);
  const snapshots: LocationWeather[] = [];
  const errors: string[] = [];
  for (const location of locations) {
    const [currentSettled, weekSettled] = await Promise.all([Promise.allSettled(weatherModels.map((model) => fetchModel(location.lat, location.lng, model))), Promise.allSettled([fetchWeek(location.lat, location.lng)])]);
    const sources = currentSettled.map((result, index): WeatherModelCondition => {
      if (result.status === 'fulfilled') return result.value;
      errors.push(`${location.name} · ${weatherModels[index].name}: ${String(result.reason)}`);
      return { id: weatherModels[index].id, name: weatherModels[index].name, available: false, condition: 'Indisponível', weatherCode: -1, temperature: 0, humidity: 0, precipitation: 0, gust: 0, observedAt: checkedAt };
    });
    const available = sources.filter((source) => source.available);
    const mostFrequentCondition = [...new Set(available.map((source) => source.condition))].sort((a, b) => available.filter((source) => source.condition === b).length - available.filter((source) => source.condition === a).length)[0] ?? 'Sem dados';
    const average = (key: 'temperature' | 'precipitation') => available.length ? Math.round(available.reduce((sum, source) => sum + source[key], 0) / available.length * 10) / 10 : 0;
    const sowingDate = sowingDates[location.id];
    const historySettled = sowingDate && sowingDate <= yesterday ? await Promise.allSettled(weatherModels.map((model) => fetchHistory(location.lat, location.lng, model, sowingDate, yesterday))) : [];
    const histories = historySettled.flatMap((result, index) => { if (result.status === 'fulfilled') return [result.value]; errors.push(`${location.name} · ${weatherModels[index].name}: ${String(result.reason)}`); return []; });
    const historySources = weatherModels.map((model) => { const history = histories.find((item) => item.model.id === model.id); return { id: model.id, name: model.name, available: Boolean(history), accumulatedPrecipitation: history?.accumulatedPrecipitation ?? 0, stormDays: history?.days.filter((day) => day.weatherCode >= 95).length ?? 0, hailDays: history?.days.filter((day) => day.weatherCode === 96 || day.weatherCode === 99).length ?? 0 } satisfies WeatherHistorySource; });
    const eventDates = new Set(histories.flatMap((history) => history.days.filter((day) => day.weatherCode >= 95).map((day) => day.date)));
    const events = [...eventDates].sort((a, b) => b.localeCompare(a)).map((date): WeatherEvent => { const matches = histories.flatMap((history) => history.days.filter((day) => day.date === date && day.weatherCode >= 95).map((day) => ({ ...day, source: history.model.name }))); const hail = matches.some((day) => day.weatherCode === 96 || day.weatherCode === 99); return { date, type: hail ? 'Granizo' : 'Tempestade', sources: matches.map((day) => day.source), precipitation: Math.max(0, ...matches.map((day) => day.precipitation)), gust: Math.max(0, ...matches.map((day) => day.gust)) }; });
    const accumulatedPrecipitation = histories.length ? Math.round(histories.reduce((sum, history) => sum + history.accumulatedPrecipitation, 0) / histories.length * 10) / 10 : 0;
    const week = weekSettled[0]?.status === 'fulfilled' ? weekSettled[0].value : [];
    if (weekSettled[0]?.status === 'rejected') errors.push(`${location.name} · previsão semanal: ${String(weekSettled[0].reason)}`);
    snapshots.push({ locationId: location.id, locationName: location.name, checkedAt, condition: mostFrequentCondition, temperature: average('temperature'), precipitation: average('precipitation'), sources, sowingDate, accumulatedPrecipitation, historySources, events, week });
  }
  return { snapshots, errors, checkedAt };
}
