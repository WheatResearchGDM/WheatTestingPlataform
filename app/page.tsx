'use client';

import dynamic from 'next/dynamic';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { NetworkLocation } from '../components/NetworkMap';

const NetworkMap = dynamic(() => import('../components/NetworkMap'), { ssr: false });

type Screen = 'dashboard' | 'mapa' | 'ensaios' | 'planejamento' | 'atividade' | 'historico' | 'resultados' | 'usuarios' | 'detalhe';
type Activity = { id: number; date: string; trial: string; type: string; owner: string; notes: string };

const locations: NetworkLocation[] = [
  { id: 'loc-01', name: 'Campo Experimental Norte', city: 'Passo Fundo', lat: -28.2628, lng: -52.4068, trials: 6, plots: 288, status: 'ok' },
  { id: 'loc-02', name: 'Estação Campos de Cima', city: 'Vacaria', lat: -28.5122, lng: -50.9339, trials: 4, plots: 176, status: 'attention' },
  { id: 'loc-03', name: 'Área Experimental Central', city: 'Santa Maria', lat: -29.6842, lng: -53.8069, trials: 5, plots: 240, status: 'ok' },
  { id: 'loc-04', name: 'Núcleo Alto Jacuí', city: 'Cruz Alta', lat: -28.6384, lng: -53.6066, trials: 5, plots: 226, status: 'late' },
  { id: 'loc-05', name: 'Estação Sul', city: 'Pelotas', lat: -31.7654, lng: -52.3376, trials: 4, plots: 168, status: 'ok' },
  { id: 'loc-06', name: 'Fronteira Oeste', city: 'São Borja', lat: -28.6606, lng: -56.0044, trials: 4, plots: 186, status: 'attention' },
];

const trials = [
  { id: 'TRG-25-001', name: 'Valor de Cultivo e Uso — Trigo', place: 'Passo Fundo', crop: 'Trigo', plots: 72, status: 'Em andamento', progress: 68, next: 'Aplicação preventiva', date: '30 ago' },
  { id: 'TRG-25-014', name: 'Ensaio Estadual de Cultivares', place: 'Cruz Alta', crop: 'Trigo', plots: 54, status: 'Atenção', progress: 54, next: 'Avaliação de doenças', date: '28 ago' },
  { id: 'TRG-25-019', name: 'Manejo de Nitrogênio', place: 'Vacaria', crop: 'Trigo', plots: 48, status: 'Em andamento', progress: 61, next: 'Adubação de cobertura', date: '02 set' },
  { id: 'TRG-25-023', name: 'Rede de Fungicidas', place: 'Santa Maria', crop: 'Trigo', plots: 60, status: 'Em andamento', progress: 72, next: 'Leitura de severidade', date: '04 set' },
  { id: 'TRG-25-027', name: 'Competição de Linhagens', place: 'Pelotas', crop: 'Trigo', plots: 84, status: 'Em andamento', progress: 47, next: 'Contagem de estande', date: '06 set' },
];

const initialActivities: Activity[] = [
  { id: 1, date: '27/08/2026', trial: 'TRG-25-001', type: 'Avaliação de campo', owner: 'Marina Silva', notes: 'Avaliação de ferrugem e oídio concluída.' },
  { id: 2, date: '26/08/2026', trial: 'TRG-25-014', type: 'Aplicação', owner: 'Rafael Costa', notes: 'Aplicação T2 realizada conforme protocolo.' },
  { id: 3, date: '24/08/2026', trial: 'TRG-25-019', type: 'Adubação', owner: 'Carlos Mendes', notes: 'Cobertura nitrogenada — 60 kg/ha.' },
  { id: 4, date: '22/08/2026', trial: 'TRG-25-023', type: 'Monitoramento', owner: 'Ana Pires', notes: 'Coleta de dados meteorológicos e fenologia.' },
];

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
  const [activities, setActivities] = useState<Activity[]>(initialActivities);
  const [toast, setToast] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem('rede-rs-activities');
    if (saved) {
      try { setActivities(JSON.parse(saved)); } catch { /* mantém o demo inicial */ }
    }
  }, []);

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
      owner: 'Marina Silva',
      notes: String(data.get('notes')) || 'Atividade registrada sem observações.',
    };
    const updated = [next, ...activities];
    setActivities(updated);
    window.localStorage.setItem('rede-rs-activities', JSON.stringify(updated));
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
              <div><b>12</b><span>locais ativos</span></div><div><b>28</b><span>ensaios</span></div><div><b>1.284</b><span>parcelas</span></div>
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
          <div className="avatar large">MS</div>
          <p className="eyebrow">Complete seu perfil</p>
          <h1>Como você participa da rede?</h1>
          <p className="muted">Essas informações ajudam a organizar responsáveis, atividades e permissões.</p>
          <div className="form-grid">
            <label>Nome completo<input defaultValue="Marina Silva" /></label>
            <label>Instituição<input defaultValue="Embrapa Trigo" /></label>
            <label>Função<select defaultValue="Pesquisadora"><option>Pesquisadora</option><option>Técnico de campo</option><option>Coordenador</option></select></label>
            <label>Região principal<select defaultValue="Norte"><option>Norte</option><option>Central</option><option>Sul</option><option>Fronteira Oeste</option></select></label>
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
          <div className="top-actions"><button aria-label="Notificações">♢<i /></button><div className="avatar">MS</div><div className="user-copy"><b>Marina Silva</b><span>Pesquisadora</span></div></div>
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
    <PageHead eyebrow="Safra 2026" title="Bom dia, Marina." copy="Aqui está o panorama da rede nesta sexta-feira, 28 de agosto." action={<button className="primary-button" onClick={() => onNavigate('atividade')}>＋ Registrar atividade</button>} />
    <section className="kpi-grid">
      <article><span className="kpi-icon green">◇</span><div><small>Ensaios ativos</small><b>28</b><em>+4 desde julho</em></div></article>
      <article><span className="kpi-icon amber">◎</span><div><small>Locais na rede</small><b>12</b><em>4 regiões do RS</em></div></article>
      <article><span className="kpi-icon red">!</span><div><small>Requerem atenção</small><b>{overdue + 2}</b><em>2 prazos nesta semana</em></div></article>
      <article><span className="kpi-icon blue">✓</span><div><small>Atividades no mês</small><b>67</b><em>91% concluídas</em></div></article>
    </section>
    <section className="dashboard-grid">
      <article className="card map-card">
        <div className="card-head"><div><h2>Rede no Rio Grande do Sul</h2><p>Os pontos usam latitude e longitude reais.</p></div><button className="text-button" onClick={() => onNavigate('mapa')}>Explorar mapa →</button></div>
        <NetworkMap locations={locations} compact />
        <div className="map-legend"><span><i className="ok" />Em dia</span><span><i className="attention" />Atenção</span><span><i className="late" />Atrasado</span><small>Tamanho = nº de parcelas</small></div>
      </article>
      <article className="card attention-card">
        <div className="card-head"><div><h2>Próximas ações</h2><p>Prioridades da sua rede</p></div><span className="count-badge">4</span></div>
        {trials.slice(0, 4).map((trial, index) => <button className="action-row" key={trial.id} onClick={() => onTrial(trial)}><span className={`date-block ${index === 1 ? 'urgent' : ''}`}><b>{trial.date.split(' ')[0]}</b><small>{trial.date.split(' ')[1]}</small></span><span><b>{trial.next}</b><small>{trial.name}</small><em>{trial.place}</em></span><i>›</i></button>)}
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
      <aside className="card location-panel"><span className="eyebrow">Local selecionado</span><h2>{current.name}</h2><p>{current.city} · Rio Grande do Sul</p><div className="location-metrics"><div><b>{current.trials}</b><span>ensaios</span></div><div><b>{current.plots}</b><span>parcelas</span></div></div><Status kind={current.status}>{current.status === 'ok' ? 'Em dia' : current.status === 'attention' ? 'Atenção' : 'Atrasado'}</Status><hr /><h3>Ensaios neste local</h3>{trials.filter((t) => t.place === current.city).map((t) => <div className="mini-trial" key={t.id}><span>{t.id}</span><b>{t.name}</b></div>)}{!trials.some((t) => t.place === current.city) && <p className="empty-copy">Dados detalhados ainda não cadastrados.</p>}<small className="coordinates">{current.lat.toFixed(4)}, {current.lng.toFixed(4)}</small></aside>
    </section></>;
}

function TrialsScreen({ onTrial }: { onTrial: (trial: typeof trials[0]) => void }) {
  const [query, setQuery] = useState('');
  const filtered = trials.filter((trial) => `${trial.name} ${trial.id} ${trial.place}`.toLowerCase().includes(query.toLowerCase()));
  return <><PageHead eyebrow="Safra 2026" title="Ensaios" copy="Acompanhe protocolos, parcelas, responsáveis e andamento." action={<button className="primary-button">＋ Novo ensaio</button>} />
    <section className="toolbar"><label className="filter-search">⌕<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar ensaio ou local" /></label><button>Todos os status⌄</button><button>Todos os locais⌄</button></section>
    <section className="trial-grid">{filtered.map((trial) => <button className="trial-card" key={trial.id} onClick={() => onTrial(trial)}><div className="trial-card-top"><span>{trial.id}</span>{trial.status === 'Atenção' ? <Status kind="attention">Atenção</Status> : <Status kind="ok">Em dia</Status>}</div><h2>{trial.name}</h2><p>◎ {trial.place} · RS</p><div className="trial-stats"><span><b>{trial.plots}</b> parcelas</span><span><b>{trial.progress}%</b> concluído</span></div><div className="progress"><i style={{ width: `${trial.progress}%` }} /></div><div className="next-action"><small>PRÓXIMA AÇÃO · {trial.date}</small><b>{trial.next}</b></div></button>)}</section>
  </>;
}

function PlanningScreen() {
  const months = ['MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV'];
  return <><PageHead eyebrow="Calendário da safra" title="Planejamento" copy="Cronograma integrado dos ensaios e principais marcos de manejo." action={<button className="secondary-button">Exportar planejamento</button>} />
    <section className="card gantt-card"><div className="gantt-head"><h2>Safra de inverno · 2026</h2><div><button>‹</button><span>Hoje · 28 ago</span><button>›</button></div></div><div className="gantt"><div className="gantt-months"><span />{months.map((m) => <b key={m}>{m}</b>)}</div>{trials.map((trial, index) => <div className="gantt-row" key={trial.id}><div><b>{trial.id}</b><span>{trial.place}</span></div><div className="gantt-track"><i className={`bar tone-${index % 3}`} style={{ left: `${5 + index * 6}%`, width: `${48 - index * 3}%` }}>{trial.progress}%</i><em style={{ left: '57%' }} /></div></div>)}</div></section>
    <section className="milestone-grid"><article><span>28 AGO</span><div><b>Avaliação de doenças</b><small>TRG-25-014 · Cruz Alta</small></div><Status kind="late">Hoje</Status></article><article><span>02 SET</span><div><b>Adubação de cobertura</b><small>TRG-25-019 · Vacaria</small></div><Status kind="attention">Próximo</Status></article><article><span>06 SET</span><div><b>Contagem de estande</b><small>TRG-25-027 · Pelotas</small></div><Status kind="ok">Planejado</Status></article></section>
  </>;
}

function ActivityForm({ onSave, defaultTrial }: { onSave: (event: FormEvent<HTMLFormElement>) => void; defaultTrial: string }) {
  return <><PageHead eyebrow="Diário de campo" title="Registrar atividade" copy="Documente uma operação, avaliação ou ocorrência em um ensaio." />
    <form className="activity-layout" onSubmit={onSave}><section className="card form-card"><div className="section-number">01</div><div><h2>Identificação</h2><p>Selecione o ensaio e a data da atividade.</p></div><div className="form-grid"><label>Ensaio<select name="trial" defaultValue={defaultTrial}>{trials.map((trial) => <option key={trial.id} value={trial.id}>{trial.id} · {trial.name}</option>)}</select></label><label>Data da atividade<input name="date" type="date" defaultValue="2026-08-28" required /></label></div></section>
      <section className="card form-card"><div className="section-number">02</div><div><h2>Detalhes da atividade</h2><p>Informe o tipo de manejo e as observações de campo.</p></div><div className="form-grid"><label>Tipo de atividade<select name="type" defaultValue="Avaliação de campo"><option>Avaliação de campo</option><option>Aplicação</option><option>Adubação</option><option>Semeadura</option><option>Colheita</option><option>Monitoramento</option></select></label><label>Responsável<input value="Marina Silva" readOnly /></label><label className="full">Observações<textarea name="notes" rows={5} placeholder="Descreva condições, produtos, doses e ocorrências relevantes…" /></label></div></section>
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
  return <><PageHead eyebrow="Consolidação" title="Resultados" copy="Indicadores preliminares e cobertura de dados da safra 2026." action={<button className="secondary-button">Exportar relatório</button>} />
    <section className="result-hero"><div><span className="eyebrow">COBERTURA DA REDE</span><h2>82% dos ensaios já têm dados de campo atualizados.</h2><p>23 de 28 ensaios registraram ao menos uma avaliação nos últimos 14 dias.</p></div><div className="donut"><b>82%</b><span>atualizados</span></div></section>
    <section className="result-grid"><article className="card"><h2>Progresso por região</h2>{[['Norte',88],['Central',82],['Sul',76],['Fronteira Oeste',69]].map(([name, value]) => <div className="result-bar" key={name}><span>{name}</span><div><i style={{ width: `${value}%` }} /></div><b>{value}%</b></div>)}</article><article className="card"><h2>Dados coletados</h2><div className="metric-list"><div><span>Avaliações agronômicas</span><b>438</b></div><div><span>Registros de manejo</span><b>212</b></div><div><span>Leituras de doenças</span><b>164</b></div><div><span>Arquivos anexados</span><b>87</b></div></div></article></section>
  </>;
}

function UsersScreen() {
  const users = [['Marina Silva','Pesquisadora','Passo Fundo','MS'],['Rafael Costa','Técnico de campo','Cruz Alta','RC'],['Ana Pires','Coordenadora','Santa Maria','AP'],['Carlos Mendes','Pesquisador','Vacaria','CM'],['Lívia Ramos','Técnica de campo','Pelotas','LR']];
  return <><PageHead eyebrow="Equipe" title="Usuários" copy="Pessoas com acesso ao ambiente demonstrativo da rede." action={<button className="primary-button">＋ Convidar usuário</button>} />
    <section className="user-grid">{users.map((user, index) => <article className="card user-card" key={user[0]}><div className={`avatar color-${index}`}>{user[3]}</div><div><h2>{user[0]}</h2><p>{user[1]}</p><span>◎ {user[2]} · RS</span></div><Status kind={index === 4 ? 'attention' : 'ok'}>{index === 4 ? 'Pendente' : 'Ativo'}</Status><button>•••</button></article>)}</section>
  </>;
}

function TrialDetail({ trial, onBack, onActivity }: { trial: typeof trials[0]; onBack: () => void; onActivity: () => void }) {
  return <><button className="back-button" onClick={onBack}>← Voltar para ensaios</button><PageHead eyebrow={trial.id} title={trial.name} copy={`${trial.place} · Safra 2026 · ${trial.plots} parcelas`} action={<button className="primary-button" onClick={onActivity}>＋ Registrar atividade</button>} />
    <section className="detail-grid"><article className="card protocol-card"><div className="card-head"><div><h2>Ficha do ensaio</h2><p>Informações gerais e protocolo experimental.</p></div>{trial.status === 'Atenção' ? <Status kind="attention">Atenção</Status> : <Status kind="ok">Em dia</Status>}</div><dl><div><dt>Cultura</dt><dd>Trigo</dd></div><div><dt>Delineamento</dt><dd>Blocos ao acaso</dd></div><div><dt>Repetições</dt><dd>4</dd></div><div><dt>Parcelas</dt><dd>{trial.plots}</dd></div><div><dt>Semeadura</dt><dd>12/06/2026</dd></div><div><dt>Responsável</dt><dd>Marina Silva</dd></div></dl></article><article className="card progress-card"><span className="eyebrow">Progresso do ciclo</span><b>{trial.progress}%</b><div className="progress"><i style={{ width: `${trial.progress}%` }} /></div><ul><li className="done">Semeadura</li><li className="done">Emergência</li><li className="active">Perfilhamento</li><li>Espigamento</li><li>Colheita</li></ul></article></section>
    <section className="card detail-activity"><div className="card-head"><div><h2>Próximos manejos</h2><p>Atividades planejadas para este ensaio.</p></div></div><div className="management-row"><span>28 AGO</span><div><b>{trial.next}</b><p>Execução conforme protocolo da rede.</p></div><Status kind={trial.status === 'Atenção' ? 'late' : 'attention'}>{trial.status === 'Atenção' ? 'Atrasado' : 'Próximo'}</Status></div><div className="management-row"><span>10 SET</span><div><b>Avaliação fenológica</b><p>Registro de estádio e uniformidade.</p></div><Status kind="ok">Planejado</Status></div></section>
  </>;
}
