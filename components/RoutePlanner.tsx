'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import type { LocationWeather } from '../lib/weatherAlerts';
import { calculateRoadRoute, type RoadResult } from '../lib/roadRoute';
const RoadRouteMap = dynamic(() => import('./RoadRouteMap'), { ssr: false });
type Location = { id: string; name: string; city: string; lat: number; lng: number };
type Trial = { id: string; locationId: string; name: string; type: string; areaCategory?: string };
type Plan = { id: string; trialId: string; locationId?: string; areaCategory?: string; activity: string; start: string; status: string };
const minutesText = (minutes: number) => `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}min`;
const clockText = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(Math.floor(minutes % 60)).padStart(2, '0')}${minutes >= 1440 ? ` (+${Math.floor(minutes / 1440)} dia)` : ''}`;

export default function RoutePlanner({ locations, trials, schedule, weather }: { locations: Location[]; trials: Trial[]; schedule: Plan[]; weather: LocationWeather[] }) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const offset = (days: number) => { const date = new Date(`${today}T12:00:00`); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); };
  const weeklyPlans = schedule.filter((plan) => plan.status !== 'Concluído' && plan.start >= offset(-5) && plan.start <= offset(5));
  const planLocation = (plan: Plan) => plan.locationId ?? trials.find((trial) => trial.id === plan.trialId)?.locationId;
  const [mode, setMode] = useState<'week' | 'extra'>('week');
  const [selected, setSelected] = useState<string[]>(() => [...new Set(weeklyPlans.map(planLocation).filter(Boolean))] as string[]);
  const [extraSelected, setExtraSelected] = useState<string[]>([]);
  const [originId, setOriginId] = useState(locations[0]?.id ?? '');
  const [liveOrigin, setLiveOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState('');
  const [fieldMinutes, setFieldMinutes] = useState(30);
  const [roundTrip, setRoundTrip] = useState(false);
  const [startTime, setStartTime] = useState(() => new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }));
  const [externalAllowed, setExternalAllowed] = useState(() => { try { return localStorage.getItem('field-wheat-osrm-consent-v1') === 'granted'; } catch { return false; } });
  const [retry, setRetry] = useState(0);
  const [calculation, setCalculation] = useState<{ key: string; result?: RoadResult; error?: string }>({ key: '' });
  const targetIds = mode === 'week' ? selected : extraSelected;
  const targets = locations.filter((location) => targetIds.includes(location.id));
  const origin = liveOrigin ?? locations.find((location) => location.id === originId) ?? locations[0];
  const points = origin ? [origin, ...targets] : [];
  const requestKey = JSON.stringify([points.map((point) => [point.lat, point.lng]), roundTrip]);
  useEffect(() => {
    if (!externalAllowed || points.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const deadline = setTimeout(() => controller.abort('timeout'), 20000);
      calculateRoadRoute(points, roundTrip, controller.signal).then((result) => {
        if (!controller.signal.aborted) setCalculation({ key: requestKey, result });
      }).catch((error) => {
        if (!controller.signal.aborted || controller.signal.reason === 'timeout') setCalculation({ key: requestKey, error: controller.signal.reason === 'timeout' ? 'O cálculo demorou mais que o esperado. Tente novamente.' : error.message });
      }).finally(() => clearTimeout(deadline));
    }, 600);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [requestKey, retry, externalAllowed]);
  const result = externalAllowed && calculation.key === requestKey ? calculation.result : undefined;
  const error = calculation.key === requestKey ? calculation.error : undefined;
  const route = result ? result.order.map((index) => targets[index - 1]) : [];
  const travelMinutes = result ? Math.round(result.legs.reduce((sum, leg) => sum + leg.seconds, 0) / 60) : 0;
  const totalKm = result ? result.legs.reduce((sum, leg) => sum + leg.meters, 0) / 1000 : 0;
  const stayMinutes = targets.length * fieldMinutes;
  const [hours, minutes] = startTime.split(':').map(Number);
  let elapsed = (hours || 0) * 60 + (minutes || 0);
  const toggle = (id: string) => {
    const next = targetIds.includes(id) ? targetIds.filter((value) => value !== id) : [...targetIds, id];
    if (next.length > 30) { setGeoError('Selecione até 30 locais por percurso.'); return; }
    mode === 'week' ? setSelected(next) : setExtraSelected(next);
  };
  const routePoints = origin && route.length ? [origin, ...route, ...(roundTrip ? [origin] : [])] : [];
  const mapsUrl = routePoints.length && routePoints.length <= 10 ? `https://www.google.com/maps/dir/?api=1&origin=${origin!.lat},${origin!.lng}&destination=${routePoints.at(-1)!.lat},${routePoints.at(-1)!.lng}&waypoints=${routePoints.slice(1, -1).map((point) => `${point.lat},${point.lng}`).join('|')}&travelmode=driving` : '';
  const rainy = weeklyPlans.filter((plan) => targets.some((location) => location.id === planLocation(plan)) && (weather.find((item) => item.locationId === planLocation(plan))?.week?.find((day) => day.date === plan.start)?.precipitation ?? 0) >= 5);
  return <section className="card route-planner"><header><div><span className="eyebrow">PERCURSO DE CAMPO</span><h2>Selecione os locais. A rota se organiza.</h2><p>Marque as áreas na lista ou no mapa para recalcular a ordem por tempo estimado de viagem nas estradas.</p></div><div className="route-mode"><button className={mode === 'week' ? 'active' : ''} onClick={() => setMode('week')}>Visitas próximas (±5 dias)</button><button className={mode === 'extra' ? 'active' : ''} onClick={() => setMode('extra')}>Visita avulsa</button></div></header>
  <div className="route-settings"><label>Saída<select value={originId} onChange={(event) => { setOriginId(event.target.value); setLiveOrigin(null); }}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select>{liveOrigin && <small>Usando sua localização atual</small>}</label><button type="button" className="secondary-button" onClick={() => { setGeoError(''); if (!navigator.geolocation) { setGeoError('Localização não disponível neste aparelho. Escolha um local de saída.'); return; } navigator.geolocation.getCurrentPosition((position) => setLiveOrigin({ lat: position.coords.latitude, lng: position.coords.longitude }), () => setGeoError('Não foi possível obter sua localização. Escolha um local de saída.'), { timeout: 15000 }); }}>⌖ Usar localização atual</button><label>Início<input type="time" required value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label><label>Permanência por local (min)<input type="number" min="1" max="720" value={fieldMinutes} onChange={(event) => setFieldMinutes(Math.min(720, Math.max(1, Number(event.target.value) || 30)))} /></label><label className="route-return"><input type="checkbox" checked={roundTrip} onChange={(event) => setRoundTrip(event.target.checked)} />Retornar à saída</label></div>
  {geoError && <p role="alert">{geoError}</p>}
  <div className="route-board"><aside className="route-selection"><div className="card-head"><h3>Locais · {targets.length} selecionados</h3><button className="text-button" onClick={() => mode === 'week' ? setSelected([]) : setExtraSelected([])}>Limpar</button></div><div className="route-location-picker">{locations.map((location) => <label key={location.id}><input type="checkbox" checked={targetIds.includes(location.id)} onChange={() => toggle(location.id)} /><span>✓</span><b>{location.name}</b><small>{location.city} · {weeklyPlans.filter((plan) => planLocation(plan) === location.id).length} atividades próximas</small></label>)}</div></aside><div className="route-map-panel"><RoadRouteMap stops={locations} origin={origin} coordinates={result?.coordinates ?? []} selected={result ? route.map((location) => location.id) : targetIds} onSelect={toggle} /><small>Clique nos locais para adicionar ou remover paradas.</small></div></div>
  <div className="route-service-consent"><p>O cálculo por estradas consulta o serviço público OSRM e envia as coordenadas das áreas selecionadas e do ponto de saída. Não envia nomes, ensaios ou registros.</p><button type="button" className="secondary-button" onClick={() => { const allowed = !externalAllowed; setExternalAllowed(allowed); try { localStorage.setItem('field-wheat-osrm-consent-v1', allowed ? 'granted' : 'denied'); } catch { /* Consent remains valid for this screen when storage is unavailable. */ } }}>{externalAllowed ? 'Desativar consulta externa' : 'Autorizar e calcular por estradas'}</button></div>
  <div role="status" aria-live="polite">{!targets.length ? 'Selecione ao menos um local para começar.' : !externalAllowed ? 'Autorize a consulta acima para calcular o percurso.' : error ? <><p>{error}</p><button className="secondary-button" onClick={() => { setCalculation({ key: '' }); setRetry(retry + 1); }}>Tentar novamente</button></> : !result ? 'Calculando percurso por estrada…' : <div className="route-summary"><span><b>{route.length}</b><small>paradas</small></span><span><b>{totalKm.toFixed(1)} km</b><small>percurso por estrada</small></span><span><b>{minutesText(travelMinutes + stayMinutes)}</b><small>{minutesText(travelMinutes)} em viagem + {minutesText(stayMinutes)} em campo</small></span>{mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer">Iniciar no Google Maps →</a>}</div>}</div>
  {result && <div className="route-stops">{route.map((location, index) => { elapsed += result.legs[index].seconds / 60; const arrival = clockText(elapsed); elapsed += fieldMinutes; const departure = clockText(elapsed); const tasks = [...new Set(weeklyPlans.filter((plan) => planLocation(plan) === location.id).map((plan) => `${plan.activity} · ${plan.areaCategory ?? trials.find((trial) => trial.id === plan.trialId)?.type ?? 'Ensaios'}`))]; return <article key={location.id}><i>{index + 1}</i><div><b>{location.name}</b><small>Chegada {arrival} · saída {departure} · {(result.legs[index].meters / 1000).toFixed(1)} km desde {index ? 'a parada anterior' : 'a saída'}</small>{tasks.map((task) => <span key={task}>{task}</span>)}<div className="route-stop-actions"><a href={`https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}&travelmode=driving`} target="_blank" rel="noreferrer">Navegar até aqui</a><a href={`https://www.waze.com/ul?ll=${location.lat},${location.lng}&navigate=yes`} target="_blank" rel="noreferrer">Waze</a><button className="text-button" onClick={() => toggle(location.id)}>Remover</button></div></div></article>; })}{roundTrip && <p>Retorno estimado à saída: {clockText(elapsed + result.legs[result.legs.length - 1].seconds / 60)}</p>}</div>}
  {rainy.length > 0 && <div className="route-rain-alert"><div><b>Atividades com chuva prevista · considerar remanejamento</b>{[...new Set(rainy.map((plan) => `${locations.find((location) => location.id === planLocation(plan))?.name} · ${plan.start.split('-').reverse().join('/')} · ${plan.activity}`))].slice(0, 6).map((text) => <small key={text}>{text}</small>)}</div></div>}
  <footer><small>Estradas e tempos estimados: OSRM / OpenStreetMap, sem trânsito em tempo real. {result && !result.exact ? 'Ordem aproximada para percursos com mais de 12 paradas. ' : ''}As coordenadas dos locais selecionados e da saída são consultadas no serviço de rotas. {route.length > 9 ? 'Para percursos longos, use a navegação por parada. ' : ''}Confirme os acessos rurais antes da viagem.</small></footer>
  </section>;
}
