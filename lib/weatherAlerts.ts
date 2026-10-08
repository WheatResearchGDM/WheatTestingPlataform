export type WeatherSourceVote = {
  id: string;
  name: string;
  voted: boolean;
  explicitHail: boolean;
  weatherCode: number;
  cape: number;
  precipitation: number;
  gust: number;
};

export type WeatherAlert = {
  id: string;
  locationId: string;
  locationName: string;
  eventDate: string;
  detectedAt: string;
  type: 'Granizo provável';
  consensus: number;
  totalSources: number;
  sources: WeatherSourceVote[];
};

const weatherModels = [
  { id: 'ecmwf_ifs025', name: 'ECMWF · IFS' },
  { id: 'gfs_seamless', name: 'NOAA · GFS' },
  { id: 'icon_seamless', name: 'DWD · ICON' },
] as const;

type HourlyResponse = {
  hourly?: {
    time?: string[];
    weather_code?: number[];
    precipitation?: number[];
    showers?: number[];
    wind_gusts_10m?: number[];
    cape?: number[];
  };
};

function dailyVotes(response: HourlyResponse, source: typeof weatherModels[number]) {
  const hourly = response.hourly;
  const result = new Map<string, WeatherSourceVote>();
  (hourly?.time ?? []).forEach((time, index) => {
    const date = time.slice(0, 10);
    const weatherCode = Number(hourly?.weather_code?.[index] ?? 0);
    const precipitation = Number(hourly?.precipitation?.[index] ?? 0) + Number(hourly?.showers?.[index] ?? 0);
    const gust = Number(hourly?.wind_gusts_10m?.[index] ?? 0);
    const cape = Number(hourly?.cape?.[index] ?? 0);
    const explicitHail = weatherCode === 96 || weatherCode === 99;
    const convectiveHailSignal = cape >= 900 && precipitation >= 2 && gust >= 45;
    const voted = explicitHail || convectiveHailSignal;
    const current = result.get(date);
    if (!current || Number(voted) * 100000 + cape + gust > Number(current.voted) * 100000 + current.cape + current.gust) {
      result.set(date, { id: source.id, name: source.name, voted, explicitHail, weatherCode, cape, precipitation: Math.round(precipitation * 10) / 10, gust: Math.round(gust) });
    }
  });
  return result;
}

async function fetchModel(latitude: number, longitude: number, model: typeof weatherModels[number], pastDays: number) {
  const query = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: 'weather_code,precipitation,showers,wind_gusts_10m,cape',
    past_days: String(pastDays),
    forecast_days: '1',
    timezone: 'America/Sao_Paulo',
    models: model.id,
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`);
  if (!response.ok) throw new Error(`${model.name}: resposta ${response.status}`);
  return dailyVotes(await response.json() as HourlyResponse, model);
}

export async function scanHailAlerts(locations: Array<{ id: string; name: string; lat: number; lng: number }>, pastDays = 7) {
  const detectedAt = new Date().toISOString();
  const alerts: WeatherAlert[] = [];
  const errors: string[] = [];
  for (const location of locations) {
    const settled = await Promise.allSettled(weatherModels.map((model) => fetchModel(location.lat, location.lng, model, pastDays)));
    settled.forEach((result) => { if (result.status === 'rejected') errors.push(`${location.name}: ${String(result.reason)}`); });
    const available = settled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    if (available.length < 3) continue;
    const dates = new Set(available.flatMap((votes) => [...votes.keys()]));
    dates.forEach((eventDate) => {
      const sources = available.map((votes) => votes.get(eventDate)).filter((vote): vote is WeatherSourceVote => Boolean(vote));
      const consensus = sources.filter((source) => source.voted).length;
      if (consensus < 2) return;
      alerts.push({ id: `hail-${location.id}-${eventDate}`, locationId: location.id, locationName: location.name, eventDate, detectedAt, type: 'Granizo provável', consensus, totalSources: sources.length, sources });
    });
  }
  return { alerts, errors, checkedAt: detectedAt };
}

