'use client';

import dynamic from 'next/dynamic';
import { FormEvent, useMemo, useState } from 'react';
import type { NetworkLocation } from '../components/NetworkMap';
import {
  importedActivities,
  importedLocations,
  importedPlanning,
  importedTrials,
  importedUsers,
  sourceSummary,
} from './data/rede';

const NetworkMap = dynamic(() => import('../components/NetworkMap'), { ssr: false });

type Screen = 'dashboard' | 'mapa' | 'ensaios' | 'planejamento' | 'atividade' | 'historico' | 'resultados' | 'usuarios' | 'detalhe';
type Activity = { id: number; date: string; trial: string; type: string; owner: string; notes: string };

const locations: NetworkLocation[] = importedLocations.map((location) => ({ ...location }));
const trials = importedTrials.map((trial) => ({ ...trial }));
const planning = importedPlanning.map((item) => ({ ...item }));
const initialActivities: Activity[] = importedActivities.map((activity) => ({
  id: activity.id,
  date: activity.date,
  trial: activity.trial,
  type: activity.type,
  owner: activity.owner,
  notes: activity.notes,
}));
const currentUser = importedUsers[0];
const totalRegions = new Set(importedLocations.map((location) => location.region)).size;
const upcomingTrials = [...trials]
  .filter((trial) => trial.nextDate >= sourceSummary.importedAt)
  .sort((a, b) => a.nextDate.localeCompare(b.nextDate));

function dateParts(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  return {
    day: String(date.getDate()).padStart(2, '0'),
    month: date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase(),
  };
}

function formatDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR');
}

const navItems: { screen: Screen; icon: string; label: string }[] = [
  { screen: 'dashboard', icon: '⌂', label: 'Visão geral' },
  { screen: 'mapa', icon: '◎', label: 'Mapa da rede' },
  { screen: 'ensaios', icon: '◇', label: 'Ensaios' },
  { screen: 'planejamento', icon: '▤', label: 'Planejamento' },
  { screen: 'atividade', icon: '＋', label: 'Registrar atividade' },
  { screen: 'historico', icon: '↺', label: 'Histórico' },
  { screen: 'resultados', icon: '▥', label: 'Resultados' },
  { screen: 'usuarios', icon: '♙', label: 'Usuários' },
];

function Status({ kind, children }: { kind: 'ok' | 'attention' | 'late'; children: React.ReactNode }) {
  return <span className={`status-pill ${kind}`}><i />{children}</span>;
}

export default function Home() {
  const [phase, setPhase] = useState<'login' | 'profile' | 'app'>('login');
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [selectedTrial, setSelectedTrial] = useState(trials[0]);
  const [activities, setActivities] = useState<Activity[]>(() => {
    if (typeof window === 'undefined') return initialActivities;
    const saved = window.localStorage.getItem('rede-rs-activities-excel-v1');
    if (!saved) return initialActivities;
    try { return JSON.parse(saved); } catch { return initialActivities; }
  });
  const [toast, setToast] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const go = (next: Screen) => { setScreen(next); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const overdue = useMemo(() => trials.filter((trial) => trial.status === 'Atenção').length, []);

  function saveActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next: Activity = {
      id: Date.now(),
      date: new Date(`${data.get('date')}T12:00:00`).toLocaleDateString('pt-BR'),
      trial: String(data.get('trial')),
      type: String(data.get('type')),
      owner: currentUser?.name ?? 'Igor',
      notes: String(data.get('notes')) || 'Atividade registrada sem observações.',
    };
    const updated = [next, ...activities];
    setActivities(updated);
    window.localStorage.setItem('rede-rs-activities-excel-v1', JSON.stringify(updated));
    setToast('Atividade salva e adicionada ao histórico.');
    go('historico');
    setTimeout(() => setToast(''), 3500);
  }

  if (phase === 'login') {
    return (
      <main className="login-shell">
        <section className="login-story">
          <Brand light />
          <div className="story-copy">
            <span className="eyebrow">Plataforma colaborativa</span>
            <h1>Uma visão única de cada ensaio, em cada região.</h1>
            <p>Planeje, registre e acompanhe a rede experimental de trigo do Rio Grande do Sul — do plantio aos resultados.</p>
            <div className="network-summary">
              <div><b>{sourceSummary.locations}</b><span>locais ativos</span></div><div><b>{sourceSummary.trials}</b><span>ensaios</span></div><div><b>{sourceSummary.plots.toLocaleString('pt-BR')}</b><span>parcelas</span></div>
            </div>
          </div>
          <div className="field-lines" aria-hidden="true"><span /><span /><span /><span /><span /></div>
        </section>
        <section className="login-panel">
          <div className="login-card">
            <span className="mobile-brand">Rede de Ensaios RS</span>
            <p className="eyebrow">Bem-vindo de volta</p>
            <h2>Acesse a plataforma</h2>
            <p className="muted">Entre com sua conta institucional para continuar.</p>
            <button type="button" className="google-button" onClick={() => setPhase('profile')}><span className="google-g">G</span>Continuar com Google</button>
            <div className="demo-note"><span>i</span><p><strong>Ambiente demonstrativo</strong>O login e os dados desta versão são simulados.</p></div>
            <p className="support-copy">Precisa de ajuda? <a href="mailto:suporte@rededeensaios.rs">Fale com o suporte</a></p>
          </div>
        </section>
      </main>
    );
  }

  if (phase === 'profile') {
    return (
      <main className="profile-shell">
        <header><Brand /><span>Etapa 1 de 1</span></header>
        <section className="profile-card">
          <div className="avatar large">IG</div>
          <p className="eyebrow">Complete seu perfil</p>
          <h1>Como você participa da rede?</h1>
          <p className="muted">Essas informações ajudam a organizar responsáveis, atividades e permissões.</p>
          <div className="form-grid">
            <label>Nome completo<input defaultValue={currentUser?.name ?? 'Igor'} /></label>
            <label>Instituição<input defaultValue="Rede de Ensaios RS" /></label>
            <label>Função<select defaultValue={currentUser?.role ?? 'Administrador'}><option>Administrador</option><option>Pesquisador</option><option>Campo</option></select></label>
            <label>Locais de acesso<input defaultValue={currentUser?.locations ?? 'Todos'} /></label>
          </div>
          <button className="primary-button wide" onClick={() => setPhase('app')}>Entrar na plataforma <span>→</span></button>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
        <Brand light compact />
        <nav aria-label="Navegação principal">
          <small>REDE EXPERIMENTAL</small>
          {navItems.slice(0, 6).map((item) => <button key={item.screen} className={screen === item.screen ? 'active' : ''} onClick={() => go(item.screen)}><span>{item.icon}</span>{item.label}</button>)}
          <small>GESTÃO</small>
          {navItems.slice(6).map((item) => <button key={item.screen} className={screen === item.screen ? 'active' : ''} onClick={() => go(item.screen)}><span>{item.icon}</span>{item.label}</button>)}
        </nav>
        <div className="sidebar-help"><span>?</span><div><b>Central de ajuda</b><small>Guias e suporte</small></div></div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Abrir menu">☰</button>
          <div className="search-box">⌕ <span>Buscar ensaios, locais ou atividades…</span><kbd>⌘ K</kbd></div>
          <div className="top-actions"><button aria-label="Notificações">♢<i /></button><div className="avatar">IG</div><div className="user-copy"><b>{currentUser?.name ?? 'Igor'}</b><span>{currentUser?.role ?? 'Administrador'}</span></div></div>
        </header>

        <main className="content">
          {screen === 'dashboard' && <Dashboard onNavigate={go} onTrial={(trial) => { setSelectedTrial(trial); go('detalhe'); }} overdue={overdue} />}
          {screen === 'mapa' && <MapScreen />}
          {screen === 'ensaios' && <TrialsScreen onTrial={(trial) => { setSelectedTrial(trial); go('detalhe'); }} />}
          {screen === 'planejamento' && <PlanningScreen />}
          {screen === 'atividade' && <ActivityForm onSave={saveActivity} defaultTrial={selectedTrial.id} />}
          {screen === 'historico' && <HistoryScreen activities={activities} onNew={() => go('atividade')} />}
          {screen === 'resultados' && <ResultsScreen />}
          {screen === 'usuarios' && <UsersScreen />}
          {screen === 'detalhe' && <TrialDetail trial={selectedTrial} onBack={() => go('ensaios')} onActivity={() => go('atividade')} />}
        </main>
      </div>
      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  );
}

function Brand({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return <div className={`brand-mark ${light ? 'light' : ''} ${compact ? 'compact' : ''}`}><span>RS</span><div><strong>Rede de Ensaios</strong><small>Pesquisa que conecta o campo</small></div></div>;
}

function PageHead({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy: string; action?: React.ReactNode }) {
  return <div className="page-head"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{copy}</p></div>{action}</div>;
}

function Dashboard({ onNavigate, onTrial, overdue }: { onNavigate: (s: Screen) => void; onTrial: (trial: typeof trials[0]) => void; overdue: number }) {
  return <>
    <PageHead eyebrow="Safra 2026 · Dados do Excel" title={`Bom dia, ${currentUser?.name ?? 'Igor'}.`} copy="Aqui está o panorama importado da planilha em 28 de agosto de 2026." action={<button className="primary-button" onClick={() => onNavigate('atividade')}>＋ Registrar atividade</button>} />
    <section className="kpi-grid">
      <article><span className="kpi-icon green">◇</span><div><small>Ensaios ativos</small><b>{sourceSummary.trials}</b><em>{sourceSummary.plots.toLocaleString('pt-BR')} parcelas</em></div></article>
      <article><span className="kpi-icon amber">◎</span><div><small>Locais na rede</small><b>{sourceSummary.locations}</b><em>{totalRegions} regiões cadastradas</em></div></article>
      <article><span className="kpi-icon red">!</span><div><small>Requerem atenção</small><b>{overdue}</b><em>prioridade crítica no Excel</em></div></article>
      <article><span className="kpi-icon blue">✓</span><div><small>Atividades realizadas</small><b>{sourceSummary.activities}</b><em>{sourceSummary.plans} atividades planejadas</em></div></article>
    </section>
    <section className="dashboard-grid">
      <article className="card map-card">
        <div className="card-head"><div><h2>Rede no Rio Grande do Sul</h2><p>Os pontos usam latitude e longitude reais.</p></div><button className="text-button" onClick={() => onNavigate('mapa')}>Explorar mapa →</button></div>
        <NetworkMap locations={locations} compact />
        <div className="map-legend"><span><i className="ok" />Em dia</span><span><i className="attention" />Atenção</span><span><i className="late" />Atrasado</span><small>Tamanho = nº de parcelas</small></div>
      </article>
      <article className="card attention-card">
        <div className="card-head"><div><h2>Próximas ações</h2><p>Prioridades da sua rede</p></div><span className="count-badge">4</span></div>
        {upcomingTrials.slice(0, 4).map((trial, index) => { const date = dateParts(trial.nextDate); return <button className="action-row" key={trial.id} onClick={() => onTrial(trial)}><span className={`date-block ${index === 0 ? 'urgent' : ''}`}><b>{date.day}</b><small>{date.month}</small></span><span><b>{trial.next}</b><small>{trial.name}</small><em>{trial.place}</em></span><i>›</i></button>; })}
        <button className="card-footer" onClick={() => onNavigate('planejamento')}>Ver planejamento completo</button>
      </article>
    </section>
    <section className="card trial-summary">
      <div className="card-head"><div><h2>Ensaios em andamento</h2><p>Atualizações recentes dos campos experimentais.</p></div><button className="text-button" onClick={() => onNavigate('ensaios')}>Ver todos →</button></div>
      <div className="table-wrap"><table><thead><tr><th>Ensaio</th><th>Local</th><th>Progresso</th><th>Status</th><th>Próxima ação</th></tr></thead><tbody>{trials.slice(0, 3).map((trial) => <tr key={trial.id} onClick={() => onTrial(trial)}><td><b>{trial.name}</b><small>{trial.id}</small></td><td>{trial.place}</td><td><div className="progress"><i style={{ width: `${trial.progress}%` }} /></div><small>{trial.progress}%</small></td><td>{trial.status === 'Atenção' ? <Status kind="attention">Atenção</Status> : <Status kind="ok">Em dia</Status>}</td><td>{trial.next}<small>{trial.date}</small></td></tr>)}</tbody></table></div>
    </section>
  </>;
}

function MapScreen() {
  const [selected, setSelected] = useState(locations[0].id);
  const current = locations.find((location) => location.id === selected) ?? locations[0];
  return <><PageHead eyebrow="Georreferenciamento" title="Mapa da rede" copy="Visualize os locais experimentais por status, volume de parcelas e região." />
    <section className="map-layout"><div className="card map-full"><NetworkMap locations={locations} onSelect={setSelected} /><div className="map-legend floating"><span><i className="ok" />Em dia</span><span><i className="attention" />Atenção</span><span><i className="late" />Atrasado</span></div></div>
      <aside className="card location-panel"><span className="eyebrow">Local selecionado</span><h2>{current.name}</h2><p>{current.city} · Rio Grande do Sul</p><div className="location-metrics"><div><b>{current.trials}</b><span>ensaios</span></div><div><b>{current.plots.toLocaleString('pt-BR')}</b><span>parcelas</span></div></div><Status kind={current.status}>{current.status === 'ok' ? 'Em dia' : current.status === 'attention' ? 'Atenção' : 'Atrasado'}</Status><hr /><h3>Ensaios neste local</h3>{trials.filter((t) => t.locationId === current.id).map((t) => <div className="mini-trial" key={t.id}><span>{t.id}</span><b>{t.name}</b></div>)}{!trials.some((t) => t.locationId === current.id) && <p className="empty-copy">Nenhum ensaio vinculado a este local.</p>}<small className="coordinates">{current.lat.toFixed(4)}, {current.lng.toFixed(4)}</small></aside>
    </section></>;
}

function TrialsScreen({ onTrial }: { onTrial: (trial: typeof trials[0]) => void }) {
  const [query, setQuery] = useState('');
  const filtered = trials.filter((trial) => `${trial.name} ${trial.id} ${trial.place}`.toLowerCase().includes(query.toLowerCase()));
  return <><PageHead eyebrow="Safra 2026 · Excel" title="Ensaios" copy={`${sourceSummary.trials} ensaios importados, com protocolos, parcelas, responsáveis e andamento.`} action={<button className="primary-button">＋ Novo ensaio</button>} />
    <section className="toolbar"><label className="filter-search">⌕<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar ensaio ou local" /></label><button>Todos os status⌄</button><button>Todos os locais⌄</button></section>
    <section className="trial-grid">{filtered.map((trial) => <button className="trial-card" key={trial.id} onClick={() => onTrial(trial)}><div className="trial-card-top"><span>{trial.id}</span>{trial.status === 'Atenção' ? <Status kind="attention">Atenção</Status> : <Status kind="ok">Em dia</Status>}</div><h2>{trial.name}</h2><p>◎ {trial.place} · RS</p><div className="trial-stats"><span><b>{trial.plots.toLocaleString('pt-BR')}</b> parcelas</span><span><b>{trial.progress}%</b> concluído</span></div><div className="progress"><i style={{ width: `${trial.progress}%` }} /></div><div className="next-action"><small>PRÓXIMA AÇÃO · {formatDate(trial.nextDate)}</small><b>{trial.next}</b></div></button>)}</section>
  </>;
}

function PlanningScreen() {
  const [visibleCount, setVisibleCount] = useState(12);
  const months = ['MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV'];
  const seasonStart = new Date('2026-05-01T12:00:00').getTime();
  const seasonEnd = new Date('2026-11-30T12:00:00').getTime();
  const seasonSpan = seasonEnd - seasonStart;
  const milestones = [...planning]
    .filter((item) => item.start >= sourceSummary.importedAt)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 3);
  const getTrial = (trialId: string) => trials.find((trial) => trial.id === trialId);
  return <><PageHead eyebrow="Calendário da safra · Excel" title="Planejamento" copy={`${sourceSummary.plans} atividades planejadas para os ${sourceSummary.trials} ensaios da rede.`} action={<button className="secondary-button">Exportar planejamento</button>} />
    <section className="card gantt-card"><div className="gantt-head"><h2>Safra de inverno · 2026</h2><div><button>‹</button><span>Hoje · 28 ago</span><button>›</button></div></div><div className="gantt"><div className="gantt-months"><span />{months.map((m) => <b key={m}>{m}</b>)}</div>{trials.slice(0, visibleCount).map((trial, index) => { const left = Math.max(0, ((new Date(`${trial.sowing}T12:00:00`).getTime() - seasonStart) / seasonSpan) * 100); const width = Math.max(3, ((new Date(`${trial.harvest}T12:00:00`).getTime() - new Date(`${trial.sowing}T12:00:00`).getTime()) / seasonSpan) * 100); return <div className="gantt-row" key={trial.id}><div><b>{trial.id}</b><span>{trial.place}</span></div><div className="gantt-track"><i className={`bar tone-${index % 3}`} style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}>{trial.progress}%</i><em style={{ left: '56%' }} /></div></div>; })}</div>{visibleCount < trials.length && <button className="card-footer" onClick={() => setVisibleCount((count) => Math.min(count + 12, trials.length))}>Mostrar mais ensaios ({trials.length - visibleCount} restantes)</button>}</section>
    <section className="milestone-grid">{milestones.map((item, index) => { const trial = getTrial(item.trialId); const date = dateParts(item.start); return <article key={item.id}><span>{date.day} {date.month}</span><div><b>{item.activity}</b><small>{item.trialId} · {trial?.place ?? 'Local não informado'}</small></div><Status kind={index === 0 ? 'attention' : 'ok'}>{index === 0 ? 'Próximo' : 'Planejado'}</Status></article>; })}</section>
  </>;
}

function ActivityForm({ onSave, defaultTrial }: { onSave: (event: FormEvent<HTMLFormElement>) => void; defaultTrial: string }) {
  return <><PageHead eyebrow="Diário de campo" title="Registrar atividade" copy="Documente uma operação, avaliação ou ocorrência em um ensaio." />
    <form className="activity-layout" onSubmit={onSave}><section className="card form-card"><div className="section-number">01</div><div><h2>Identificação</h2><p>Selecione o ensaio e a data da atividade.</p></div><div className="form-grid"><label>Ensaio<select name="trial" defaultValue={defaultTrial}>{trials.map((trial) => <option key={trial.id} value={trial.id}>{trial.id} · {trial.name}</option>)}</select></label><label>Data da atividade<input name="date" type="date" defaultValue="2026-08-28" required /></label></div></section>
      <section className="card form-card"><div className="section-number">02</div><div><h2>Detalhes da atividade</h2><p>Informe o tipo de manejo e as observações de campo.</p></div><div className="form-grid"><label>Tipo de atividade<select name="type" defaultValue="Avaliação de campo"><option>Avaliação de campo</option><option>Aplicação</option><option>Adubação</option><option>Semeadura</option><option>Colheita</option><option>Monitoramento</option></select></label><label>Responsável<input value={currentUser?.name ?? 'Igor'} readOnly /></label><label className="full">Observações<textarea name="notes" rows={5} placeholder="Descreva condições, produtos, doses e ocorrências relevantes…" /></label></div></section>
      <section className="form-actions"><span>Os dados serão salvos localmente nesta demonstração.</span><div><button type="reset" className="secondary-button">Limpar</button><button type="submit" className="primary-button">✓ Salvar atividade</button></div></section></form>
  </>;
}

function HistoryScreen({ activities, onNew }: { activities: Activity[]; onNew: () => void }) {
  return <><PageHead eyebrow="Rastreabilidade" title="Histórico de manejo" copy="Todas as atividades registradas na rede, da mais recente para a mais antiga." action={<button className="primary-button" onClick={onNew}>＋ Nova atividade</button>} />
    <section className="toolbar"><button>Todos os ensaios⌄</button><button>Todos os tipos⌄</button><button>Últimos 30 dias⌄</button></section>
    <section className="card history-list">{activities.map((activity) => <article key={activity.id}><div className="timeline-dot" /><time>{activity.date}</time><div className="activity-icon">✓</div><div className="activity-copy"><span>{activity.type}</span><h2>{activity.notes}</h2><p><b>{activity.trial}</b> · Registrado por {activity.owner}</p></div><button aria-label="Mais opções">•••</button></article>)}</section>
  </>;
}

function ResultsScreen() {
  const trialsWithActivity = new Set(importedActivities.map((activity) => activity.trial)).size;
  const coverage = Math.round((trialsWithActivity / trials.length) * 100);
  const regions = [...new Set(importedLocations.map((location) => location.region))];
  const regionProgress = regions.map((region) => {
    const locationIds = new Set(importedLocations.filter((location) => location.region === region).map((location) => location.id));
    const regionTrials = trials.filter((trial) => locationIds.has(trial.locationId));
    const average = regionTrials.length ? Math.round(regionTrials.reduce((sum, trial) => sum + trial.progress, 0) / regionTrials.length) : 0;
    return { name: region, value: average };
  });
  return <><PageHead eyebrow="Consolidação" title="Resultados" copy="Indicadores preliminares e cobertura de dados da safra 2026." action={<button className="secondary-button">Exportar relatório</button>} />
    <section className="result-hero"><div><span className="eyebrow">COBERTURA IMPORTADA</span><h2>{trialsWithActivity} de {trials.length} ensaios têm atividade realizada registrada.</h2><p>A planilha contém {sourceSummary.activities} atividade realizada e {sourceSummary.plans} atividades planejadas.</p></div><div className="donut" style={{ background: `conic-gradient(var(--lime) ${coverage}%, rgba(255,255,255,.14) 0)` }}><b>{coverage}%</b><span>com registro</span></div></section>
    <section className="result-grid"><article className="card"><h2>Progresso médio por região</h2>{regionProgress.map(({ name, value }) => <div className="result-bar" key={name}><span>{name}</span><div><i style={{ width: `${value}%` }} /></div><b>{value}%</b></div>)}</article><article className="card"><h2>Dados importados</h2><div className="metric-list"><div><span>Ensaios</span><b>{sourceSummary.trials}</b></div><div><span>Atividades planejadas</span><b>{sourceSummary.plans}</b></div><div><span>Atividades realizadas</span><b>{sourceSummary.activities}</b></div><div><span>Usuários</span><b>{sourceSummary.users}</b></div></div></article></section>
  </>;
}

function UsersScreen() {
  return <><PageHead eyebrow="Equipe · Excel" title="Usuários" copy={`${sourceSummary.users} pessoas com acesso cadastradas na planilha.`} action={<button className="primary-button">＋ Convidar usuário</button>} />
    <section className="user-grid">{importedUsers.map((user, index) => { const initials = user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(); return <article className="card user-card" key={user.id}><div className={`avatar color-${index}`}>{initials}</div><div><h2>{user.name}</h2><p>{user.role}</p><span>◎ {user.locations}</span></div><Status kind={user.active ? 'ok' : 'attention'}>{user.active ? 'Ativo' : 'Pendente'}</Status><button>•••</button></article>; })}</section>
  </>;
}

function TrialDetail({ trial, onBack, onActivity }: { trial: typeof trials[0]; onBack: () => void; onActivity: () => void }) {
  return <><button className="back-button" onClick={onBack}>← Voltar para ensaios</button><PageHead eyebrow={trial.id} title={trial.name} copy={`${trial.place} · Safra 2026 · ${trial.plots} parcelas`} action={<button className="primary-button" onClick={onActivity}>＋ Registrar atividade</button>} />
    <section className="detail-grid"><article className="card protocol-card"><div className="card-head"><div><h2>Ficha do ensaio</h2><p>Informações gerais importadas do Excel.</p></div>{trial.status === 'Atenção' ? <Status kind="attention">Atenção</Status> : <Status kind="ok">Em dia</Status>}</div><dl><div><dt>Tipo do ensaio</dt><dd>{trial.type}</dd></div><div><dt>Ciclo</dt><dd>{trial.cycle}</dd></div><div><dt>Prioridade</dt><dd>{trial.priority}</dd></div><div><dt>Parcelas</dt><dd>{trial.plots.toLocaleString('pt-BR')}</dd></div><div><dt>Semeadura</dt><dd>{formatDate(trial.sowing)}</dd></div><div><dt>Responsável</dt><dd>{trial.owner}</dd></div></dl></article><article className="card progress-card"><span className="eyebrow">Progresso do ciclo</span><b>{trial.progress}%</b><div className="progress"><i style={{ width: `${trial.progress}%` }} /></div><ul><li className="done">Semeadura</li><li className="done">Emergência</li><li className="active">Desenvolvimento</li><li>Próximo manejo</li><li>Colheita · {formatDate(trial.harvest)}</li></ul></article></section>
    <section className="card detail-activity"><div className="card-head"><div><h2>Próximos manejos</h2><p>Atividades planejadas para este ensaio.</p></div></div>{planning.filter((item) => item.trialId === trial.id && item.start >= sourceSummary.importedAt).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 3).map((item, index) => { const date = dateParts(item.start); return <div className="management-row" key={item.id}><span>{date.day} {date.month}</span><div><b>{item.activity}</b><p>{item.category} · Responsável: {item.owner}</p></div><Status kind={index === 0 ? 'attention' : 'ok'}>{index === 0 ? 'Próximo' : 'Planejado'}</Status></div>; })}</section>
  </>;
}
