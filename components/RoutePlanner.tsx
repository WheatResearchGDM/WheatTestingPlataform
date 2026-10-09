'use client';

import { useMemo, useState } from 'react';
import type { LocationWeather } from '../lib/weatherAlerts';

type Location = { id: string; name: string; city: string; lat: number; lng: number };
type Trial = { id: string; locationId: string; name: string; type: string; areaCategory?: string };
type Plan = { id: string; trialId: string; locationId?: string; areaCategory?: string; activity: string; start: string; status: string };
type Point = { lat: number; lng: number; label?: string };

const distanceKm = (a: Point, b: Point) => {
  const rad = (value: number) => value * Math.PI / 180;
  const dLat = rad(b.lat - a.lat); const dLng = rad(b.lng - a.lng);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

export default function RoutePlanner({ locations, trials, schedule, weather }: { locations: Location[]; trials: Trial[]; schedule: Plan[]; weather: LocationWeather[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const limitDate = new Date(`${today}T12:00:00`); limitDate.setDate(limitDate.getDate() + (7 - limitDate.getDay()) % 7);
  const limit = limitDate.toISOString().slice(0, 10);
  const weeklyPlans = schedule.filter((item) => item.status !== 'Concluído' && item.start >= today && item.start <= limit);
  const weeklyLocationIds = [...new Set(weeklyPlans.map((item) => item.locationId ?? trials.find((trial) => trial.id === item.trialId)?.locationId).filter(Boolean))] as string[];
  const [mode, setMode] = useState<'week' | 'extra'>('week');
  const [selected, setSelected] = useState<string[]>(weeklyLocationIds);
  const [extraSelected, setExtraSelected] = useState<string[]>([]);
  const [originId, setOriginId] = useState(locations[0]?.id ?? '');
  const [liveOrigin, setLiveOrigin] = useState<Point | null>(null);
  const [fieldMinutes, setFieldMinutes] = useState(90);
  const [startTime, setStartTime] = useState('07:30');
  const targetIds = mode === 'week' ? selected : extraSelected;
  const origin = liveOrigin ?? locations.find((location) => location.id === originId) ?? locations[0];
  const route = useMemo(() => {
    if (!origin) return [];
    const remaining = locations.filter((location) => targetIds.includes(location.id));
    const ordered: Array<Location & { distance: number }> = [];
    let cursor: Point = origin;
    while (remaining.length) {
      remaining.sort((a, b) => distanceKm(cursor, a) - distanceKm(cursor, b));
      const next = remaining.shift()!; const distance = distanceKm(cursor, next);
      ordered.push({ ...next, distance }); cursor = next;
    }
    return ordered;
  }, [locations, targetIds.join('|'), originId, liveOrigin]);
  const totalDistance = route.reduce((sum, item) => sum + item.distance, 0);
  const totalMinutes = route.length * fieldMinutes;
  const routeUrl = route.length && origin ? `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${route.at(-1)!.lat},${route.at(-1)!.lng}${route.length > 1 ? `&waypoints=${route.slice(0, -1).map((item) => `${item.lat},${item.lng}`).join('|')}` : ''}&travelmode=driving` : '';
  const startParts = startTime.split(':').map(Number); let elapsed = 0;
  const rainAlerts = [...new Map(weeklyPlans.flatMap((plan) => { const trial = trials.find((item) => item.id === plan.trialId); const locationId = plan.locationId ?? trial?.locationId; const day = weather.find((item) => item.locationId === locationId)?.week?.find((item) => item.date === plan.start); return day && day.precipitation >= 5 ? [[`${locationId}-${plan.start}-${plan.activity}`, { plan, trial, location: locations.find((item) => item.id === locationId), rain: day.precipitation }]] : []; })).values()];

  return <section className="card route-planner"><header><div><span className="eyebrow">PLANEJADOR INTELIGENTE</span><h2>Rota otimizada de atividades</h2><p>As áreas com atividades até domingo vêm selecionadas. Acrescente ou remova locais e ajuste a permanência em campo.</p></div><div className="route-mode"><button className={mode === 'week' ? 'active' : ''} onClick={() => setMode('week')}>Agenda da semana</button><button className={mode === 'extra' ? 'active' : ''} onClick={() => setMode('extra')}>Visita avulsa</button></div></header>
    <div className="route-settings"><label>Saída<select value={originId} onChange={(event) => { setOriginId(event.target.value); setLiveOrigin(null); }}>{locations.map((location) => <option value={location.id} key={location.id}>{location.name}</option>)}</select></label><button type="button" className="secondary-button" onClick={() => navigator.geolocation?.getCurrentPosition((position) => setLiveOrigin({ lat: position.coords.latitude, lng: position.coords.longitude, label: 'Minha localização' }))}>⌖ Usar localização atual</button><label>Início<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label><label>Permanência/local<input type="number" min="15" step="15" value={fieldMinutes} onChange={(event) => setFieldMinutes(Number(event.target.value))} /> min</label></div>
    {<div className="route-location-picker">{locations.map((location) => <label key={location.id}><input type="checkbox" checked={targetIds.includes(location.id)} onChange={(event) => { const update = event.target.checked ? [...targetIds, location.id] : targetIds.filter((id) => id !== location.id); mode === 'week' ? setSelected(update) : setExtraSelected(update); }} /><span>✓</span><b>{location.name}</b><small>{location.city}</small></label>)}</div>}
    {rainAlerts.length > 0 && <div className="route-rain-alert"><span>☂</span><div><b>{rainAlerts.length} atividade(s) com risco de chuva</b>{rainAlerts.slice(0, 4).map(({ plan, location, rain }) => <small key={plan.id}>{plan.start.split('-').reverse().join('/')} · {location?.name} · {plan.activity} · {rain.toFixed(1)} mm — considerar remanejamento</small>)}</div></div>}
    <div className="route-summary"><span><b>{route.length}</b><small>paradas</small></span><span><b>{totalDistance.toFixed(0)} km</b><small>distância em linha reta</small></span><span><b>{Math.floor(totalMinutes / 60)}h {totalMinutes % 60}min</b><small>permanência em campo</small></span>{routeUrl && <a href={routeUrl} target="_blank" rel="noreferrer">Abrir percurso no Google Maps →</a>}</div>
    <div className="route-stops">{route.map((location, index) => { const travel = 0; elapsed += travel; const arrival = new Date(2020, 0, 1, startParts[0], startParts[1] + elapsed); const plans = weeklyPlans.filter((plan) => (plan.locationId ?? trials.find((trial) => trial.id === plan.trialId)?.locationId) === location.id); const groupedPlans = [...new Map(plans.map((plan) => { const trial = trials.find((item) => item.id === plan.trialId); const category = plan.areaCategory ?? trial?.areaCategory ?? trial?.type ?? 'Ensaios'; const key = `${plan.start}-${plan.activity}-${category}`; return [key, { plan, category, count: plans.filter((item) => { const itemTrial = trials.find((trial) => trial.id === item.trialId); return item.start === plan.start && item.activity === plan.activity && (item.areaCategory ?? itemTrial?.areaCategory ?? itemTrial?.type ?? 'Ensaios') === category; }).length }]; })).values()]; elapsed += fieldMinutes; return <article key={location.id}><i>{index + 1}</i><div><b>{location.name}</b><small>{location.distance.toFixed(0)} km desde a parada anterior</small>{groupedPlans.map(({ plan, category, count }) => <span key={`${plan.id}-${category}`}>{plan.activity} · {category}{count > 1 ? ` · ${count} ensaios` : ''}</span>)}</div></article>; })}{!route.length && <p>Selecione ao menos um destino.</p>}</div>
    <footer><small>O tempo de deslocamento e as condições da via são calculados ao abrir o Google Maps ou Waze. A estimativa interna mostra apenas a permanência em campo; integração automática de tempos requer configurar Google Routes.</small></footer>
  </section>;
}
