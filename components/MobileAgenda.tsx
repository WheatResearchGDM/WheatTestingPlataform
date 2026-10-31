'use client';

import { useState } from 'react';

type Plan = { id: string; trialId: string; locationId?: string; areaCategory?: string; activity: string; start: string; end: string; status: string };
type Trial = { id: string; name: string; locationId: string; type: string; areaCategory?: string };
type Location = { id: string; name: string; lat: number; lng: number };

export default function MobileAgenda<T extends Plan>({ schedule, trials, locations, onRecord }: { schedule: T[]; trials: Trial[]; locations: Location[]; onRecord: (plan: T) => void }) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const [date, setDate] = useState(today);
  const [view, setView] = useState<'day' | 'pending'>('day');
  const [limit, setLimit] = useState(20);
  const pending = schedule.filter((plan) => plan.status !== 'Concluído');
  const items = (view === 'day' ? schedule.filter((plan) => plan.start === date) : pending).sort((a, b) => a.start.localeCompare(b.start));
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today + 'T12:00:00'); day.setDate(day.getDate() + index);
    return { iso: day.toLocaleDateString('en-CA'), label: day.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''), number: day.getDate() };
  });
  return <section className="mobile-agenda"><header><div><small>SEU TRABALHO EM CAMPO</small><h1>Agenda</h1></div><span>{pending.length} pendentes</span></header><div className="mobile-agenda-tabs"><button className={view === 'day' ? 'active' : ''} onClick={() => setView('day')}>Por dia</button><button className={view === 'pending' ? 'active' : ''} onClick={() => setView('pending')}>Todas as pendentes</button></div>{view === 'day' && <><div className="mobile-week-strip" aria-label="Próximos sete dias">{days.map((day) => <button key={day.iso} aria-pressed={date === day.iso} className={date === day.iso ? 'active' : ''} onClick={() => setDate(day.iso)}><small>{day.label}</small><b>{day.number}</b><i>{schedule.filter((plan) => plan.start === day.iso && plan.status !== 'Concluído').length || '—'}</i></button>)}</div><label className="mobile-agenda-date">Outra data<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></>}
    <div className="mobile-agenda-list">{items.slice(0, limit).map((plan) => {
      const trial = trials.find((item) => item.id === plan.trialId);
      const location = locations.find((item) => item.id === (plan.locationId ?? trial?.locationId));
      const done = plan.status === 'Concluído';
      const late = !done && plan.end < today;
      return <article className="card mobile-activity-card" key={plan.id}><div className="mobile-activity-meta"><b>{location?.name ?? 'Local não informado'}</b><span className={done ? 'done' : late ? 'late' : ''}>{done ? 'Registrada' : late ? 'Em atraso' : 'Programada'}</span></div><h2>{plan.activity}</h2><p>{plan.areaCategory ?? trial?.areaCategory ?? trial?.type ?? 'Ensaios'}{!plan.areaCategory && trial ? ' · ' + trial.name : ''}</p><time dateTime={plan.start}>{plan.start.split('-').reverse().join('/')}</time><footer>{location && <a href={`https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`} target="_blank" rel="noreferrer">Como chegar ↗</a>}<button className="primary-button" disabled={done} onClick={() => onRecord(plan)}>{done ? 'Concluída' : 'Registrar atividade'}</button></footer></article>;
    })}</div>{!items.length && <section className="card mobile-agenda-empty"><span>✓</span><h2>{view === 'day' ? 'Sem atividades nesta data' : 'Tudo em dia'}</h2><p>{view === 'day' ? 'Escolha outro dia ou veja as atividades pendentes deste programa.' : 'Não há atividades pendentes para este programa.'}</p>{view === 'day' && <button className="secondary-button" onClick={() => setView('pending')}>Ver pendentes</button>}</section>}{items.length > limit && <button className="secondary-button" onClick={() => setLimit((value) => value + 20)}>Mostrar mais atividades</button>}
  </section>;
}
