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

export type LocationWeather = {
  locationId: string;
  locationName: string;
  checkedAt: string;
  condition: string;
  temperature: number;
  precipitation: number;
  sources: WeatherModelCondition[];
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

export async function fetchWeatherConditions(locations: Array<{ id: string; name: string; lat: number; lng: number }>) {
  const checkedAt = new Date().toISOString();
  const snapshots: LocationWeather[] = [];
  const errors: string[] = [];
  for (const location of locations) {
    const settled = await Promise.allSettled(weatherModels.map((model) => fetchModel(location.lat, location.lng, model)));
    const sources = settled.map((result, index): WeatherModelCondition => {
      if (result.status === 'fulfilled') return result.value;
      errors.push(`${location.name} · ${weatherModels[index].name}: ${String(result.reason)}`);
      return { id: weatherModels[index].id, name: weatherModels[index].name, available: false, condition: 'Indisponível', weatherCode: -1, temperature: 0, humidity: 0, precipitation: 0, gust: 0, observedAt: checkedAt };
    });
    const available = sources.filter((source) => source.available);
    const mostFrequentCondition = [...new Set(available.map((source) => source.condition))].sort((a, b) => available.filter((source) => source.condition === b).length - available.filter((source) => source.condition === a).length)[0] ?? 'Sem dados';
    const average = (key: 'temperature' | 'precipitation') => available.length ? Math.round(available.reduce((sum, source) => sum + source[key], 0) / available.length * 10) / 10 : 0;
    snapshots.push({ locationId: location.id, locationName: location.name, checkedAt, condition: mostFrequentCondition, temperature: average('temperature'), precipitation: average('precipitation'), sources });
  }
  return { snapshots, errors, checkedAt };
}
