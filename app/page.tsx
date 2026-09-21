'use client';

import dynamic from 'next/dynamic';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { NetworkLocation } from '../components/NetworkMap';
import type { LayoutFinalization } from '../components/FieldLayoutMap';
import {
  importedActivities,
  importedLocations,
  importedPlanning,
  importedSource,
  importedTrials,
  importedUsers,
  sourceSummary,
} from './data/rede';

const NetworkMap = dynamic(() => import('../components/NetworkMap'), { ssr: false });
const FieldLayoutMap = dynamic(() => import('../components/FieldLayoutMap'), { ssr: false });

type Screen = 'dashboard' | 'mapa' | 'ensaios' | 'planejamento' | 'operacional' | 'campo' | 'atividade' | 'historico' | 'resultados' | 'usuarios' | 'cadastros' | 'detalhe';
type ActivityStream = 'operational' | 'field';
type MacroGroup = 'Ensaios' | 'Coleção' | 'Founder' | 'PD' | 'Multiqualidades' | 'Outro';
type MacroStage = 'Semeadura' | 'Condução' | 'Colheita';
type PhenologyVisit = 'Semeadura' | 'Perfilhamento' | 'Alongamento' | 'Emborrachamento' | 'Espigamento' | 'Enchimento de grão' | 'Maturidade';
type Activity = { id: number; date: string; trial: string; type: string; owner: string; notes: string; plannedId?: string; qualityScore?: number; qualityClass?: string; locationId?: string; scope?: string; macroGroup?: MacroGroup; macroStage?: MacroStage; checks?: string[]; photos?: string[]; details?: Record<string, string>; alertCategory?: string; qualityPenalty?: number; plotIds?: string[] };
type PlannedActivity = { id: string; trialId: string; locationId?: string; areaCategory?: string; activityTemplateId?: string; activity: string; category: string; start: string; end: string; owner: string; priority: string; status: string; notes: string; originalStart: string; originalEnd: string; version: number };
type Trial = { id: string; name: string; type: string; subtype?: string; year: number; cycle: string; locationId: string; plots: number; sowing: string; harvest: string; owner: string; rawStatus: string; priority: string; notes: string; place: string; city: string; status: string; progress: number; next: string; nextDate: string; date: string; fieldName?: string; area?: number; mapId?: string; areaCategory?: string; issueCount?: number; affectedPlots?: string[]; lostPlots?: string[]; layoutPenalty?: number };
type ViewContext = { locationId?: string; operational?: 'ok' | 'late' };
type PlanningWizardConfig = { locationId: string; trialIds: string[]; profile: 'Essencial' | 'Completo' | 'Monitoramento' };
type HarvestStatus = 'Ativa' | 'Encerrada';
type Harvest = { id: string; name: string; status: HarvestStatus; createdAt: string; updatedAt: string; quality: number };
type HarvestSnapshot = { locations: NetworkLocation[]; trials: Trial[]; schedule: PlannedActivity[]; activities: Activity[]; source: Record<string, unknown>[]; updatedAt: string };
type DynamicFieldType = 'text' | 'select' | 'number' | 'date';
type DynamicField = { id: string; label: string; type: DynamicFieldType; options: string[]; entity: ActivityStream | 'both'; visibleField: boolean; visibleOperational: boolean };
type ActivityTemplate = { id: string; name: string; stream: ActivityStream; stage: PhenologyVisit; offset: number; categories: string[]; enabled: boolean };

const defaultActivityTemplates: ActivityTemplate[] = [
  { id: 'op-sowing', name: 'Semeadura', stream: 'operational', stage: 'Semeadura', offset: 0, categories: ['Ensaios','Coleções','PDs','Founder','Segregantes','Ensaios de N','Ensaios de fungicida','Nursery','Multiqualidades'], enabled: true },
  { id: 'field-tillering', name: 'Inspeção de perfilhamento', stream: 'field', stage: 'Perfilhamento', offset: 20, categories: ['Ensaios','Coleções','PDs','Founder','Segregantes','Ensaios de N','Ensaios de fungicida','Nursery','Multiqualidades'], enabled: true },
  { id: 'op-fertilizer', name: 'Adubação de cobertura', stream: 'operational', stage: 'Alongamento', offset: 35, categories: ['Ensaios','Coleções','PDs','Founder','Segregantes','Ensaios de N','Nursery','Multiqualidades'], enabled: true },
  { id: 'field-labeling', name: 'Bandeiramento e corredores', stream: 'field', stage: 'Alongamento', offset: 40, categories: ['Ensaios','Coleções','PDs','Founder','Segregantes','Nursery','Multiqualidades'], enabled: true },
  { id: 'op-fungicide', name: 'Aplicação de fungicida', stream: 'operational', stage: 'Espigamento', offset: 65, categories: ['Ensaios','Coleções','PDs','Founder','Segregantes','Ensaios de fungicida','Nursery','Multiqualidades'], enabled: true },
  { id: 'field-heading', name: 'Inspeção de espigamento', stream: 'field', stage: 'Espigamento', offset: 70, categories: ['Ensaios','Coleções','PDs','Founder','Segregantes','Ensaios de N','Ensaios de fungicida','Nursery','Multiqualidades'], enabled: true },
  { id: 'field-grainfill', name: 'Inspeção de enchimento de grão', stream: 'field', stage: 'Enchimento de grão', offset: 90, categories: ['Ensaios','Coleções','PDs','Founder','Segregantes','Ensaios de N','Ensaios de fungicida','Nursery','Multiqualidades'], enabled: true },
  { id: 'op-harvest', name: 'Colheita', stream: 'operational', stage: 'Maturidade', offset: 120, categories: ['Ensaios','Coleções','PDs','Founder','Segregantes','Ensaios de N','Ensaios de fungicida','Nursery','Multiqualidades'], enabled: true },
];

const defaultDynamicFields: DynamicField[] = [
  { id: 'weather', label: 'Condição climática', type: 'select', options: ['Ensolarado', 'Nublado', 'Chuva recente'], entity: 'both', visibleField: true, visibleOperational: true },
  { id: 'field-technician', label: 'Técnico responsável', type: 'text', options: [], entity: 'field', visibleField: true, visibleOperational: false },
  { id: 'application-volume', label: 'Volume de aplicação (L/ha)', type: 'number', options: [], entity: 'operational', visibleField: false, visibleOperational: true },
];

function confirmAction(message: string, action: () => void) {
  if (window.confirm(message)) action();
}

const baseLocations: NetworkLocation[] = importedLocations.map((location) => ({ ...location }));
const baseTrials: Trial[] = importedTrials.map((trial) => ({ ...trial }));
const basePlanning: PlannedActivity[] = importedPlanning.map((activity) => ({ ...activity }));
const baseActivities: Activity[] = importedActivities.map((activity) => activity);
const locations: NetworkLocation[] = baseLocations.map((location) => ({ ...location }));
const trials: Trial[] = baseTrials.map((trial) => ({ ...trial }));
const initialPlanning: PlannedActivity[] = basePlanning.map((activity) => ({ ...activity }));
const initialActivities: Activity[] = baseActivities.map((activity) => ({ ...activity }));
const blankTrial: Trial = { id: '', name: '', type: '', year: 2026, cycle: 'Safra 2026', locationId: '', plots: 0, sowing: sourceSummary.importedAt, harvest: sourceSummary.importedAt, owner: '', rawStatus: 'Planejado', priority: 'Normal', notes: '', place: '', city: '', status: 'Planejado', progress: 0, next: '', nextDate: sourceSummary.importedAt, date: '' };
const currentUser = importedUsers[0];
const totalRegions = 0;
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

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  return Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000);
}

function qualityFrom(values: { establishment?: number; uniformity: number; weeds: number; disease: number }) {
  const establishment = values.establishment ?? values.uniformity;
  const score = Math.round(100 * (.3 * ((establishment - 1) / 4) + .25 * ((values.uniformity - 1) / 4) + .25 * (1 - (values.weeds - 1) / 4) + .2 * (1 - (values.disease - 1) / 4)));
  return { score, label: score >= 85 ? 'Excelente' : score >= 70 ? 'Adequado' : score >= 50 ? 'Atenção' : 'Crítico' };
}

function adversePenalty(category: string, quantity: number, manual?: number) {
  if (manual && manual > 0) return Math.min(100, manual);
  const unit = category === 'Parcela perdida' ? 1 : category === 'Linha entupida' ? .3 : category === 'Fitotoxidez' ? 1.5 : category === 'Atraso na aplicação' ? 2 : category === 'Sobredose de N' ? 2.5 : 1;
  return Math.min(100, Math.round(unit * Math.max(1, quantity) * 10) / 10);
}

function trialQuality(trial: Trial, activities: Activity[]) {
  const registered = activities.find((activity) => activity.trial === trial.id && typeof activity.qualityScore === 'number');
  const baseScore = registered?.qualityScore ?? (trial.priority === 'Crítica' ? 46 : trial.priority === 'Alta' ? 64 : 76);
  const applicableAlerts = activities.filter((activity) => (activity.trial === trial.id || (activity.locationId === trial.locationId && (activity.scope === 'Local inteiro' || activity.scope === 'Tipo de ensaio' && activity.macroGroup === macroGroupFor(trial)))) && Number(activity.qualityPenalty ?? 0) > 0);
  const penalty = Math.min(100, applicableAlerts.reduce((sum, activity) => sum + Number(activity.qualityPenalty ?? 0), 0));
  const score = Math.max(0, Math.round(baseScore - (trial.layoutPenalty ?? 0) - penalty));
  const label = score >= 85 ? 'Excelente' : score >= 70 ? 'Adequado' : score >= 50 ? 'Atenção' : 'Crítico';
  const tone = score >= 85 ? 'excellent' : score >= 70 ? 'adequate' : score >= 50 ? 'attention' : 'critical';
  return { score, label, tone, measured: Boolean(registered), penalty: penalty + (trial.layoutPenalty ?? 0), alerts: applicableAlerts };
}

function groupFromCategory(category?: string): MacroGroup {
  const value = String(category ?? '').toLowerCase();
  if (value.includes('founder')) return 'Founder';
  if (value.includes('cole')) return 'Coleção';
  if (value.includes('multi')) return 'Multiqualidades';
  if (/^pd|\bpd\b/.test(value)) return 'PD';
  if (value.includes('outro')) return 'Outro';
  return 'Ensaios';
}

function macroGroupFor(trial: Trial): MacroGroup {
  if (trial.areaCategory) return groupFromCategory(trial.areaCategory);
  const value = `${trial.type} ${trial.name}`.toLowerCase();
  if (value.includes('founder')) return 'Founder';
  if (value.includes('cole')) return 'Coleção';
  if (value.includes('multi')) return 'Multiqualidades';
  if (/(^|[\s_-])pd([\s_-]|$)/.test(value)) return 'PD';
  if (value.includes('outro')) return 'Outro';
  return 'Ensaios';
}

function qualityTone(score: number): Exclude<NonNullable<NetworkLocation['qualityTone']>, 'neutral'> {
  return score >= 85 ? 'excellent' : score >= 70 ? 'adequate' : score >= 50 ? 'attention' : 'critical';
}

function localityOverview(locationId: string, trialList: Trial[], activities: Activity[], schedule: PlannedActivity[]) {
  const localTrials = trialList.filter((trial) => trial.locationId === locationId);
  const planted = localTrials.filter((trial) => trial.sowing <= sourceSummary.importedAt).length;
  const plantedPercent = localTrials.length ? Math.round((planted / localTrials.length) * 100) : 0;
  const stages = localTrials.filter((trial) => trial.sowing <= sourceSummary.importedAt).map(phenologicalStage);
  const stage = stages.sort((a, b) => stages.filter((item) => item === b).length - stages.filter((item) => item === a).length)[0] ?? 'Pré-semeadura';
  const quality = localTrials.length ? Math.round(localTrials.reduce((sum, trial) => sum + trialQuality(trial, activities).score, 0) / localTrials.length) : 0;
  const ids = new Set(localTrials.map((trial) => trial.id));
  const localPlan = schedule.filter((item) => ids.has(item.trialId));
  const completion = (matcher: (item: PlannedActivity) => boolean, fallback: number) => {
    const items = localPlan.filter(matcher);
    return items.length ? Math.round((items.filter((item) => item.status === 'Concluído').length / items.length) * 100) : fallback;
  };
  const sowing = Math.max(plantedPercent, completion((item) => /seme|identifica|etiqueta/i.test(`${item.activity} ${item.category}`), plantedPercent));
  const conduction = completion((item) => !/seme|identifica|etiqueta|colhe/i.test(`${item.activity} ${item.category}`), plantedPercent > 0 ? 35 : 0);
  const harvest = Math.max(Math.round((localTrials.filter((trial) => trial.harvest <= sourceSummary.importedAt).length / Math.max(localTrials.length, 1)) * 100), completion((item) => /colhe/i.test(`${item.activity} ${item.category}`), 0));
  const groups = [...new Set(localTrials.map(macroGroupFor))];
  return { localTrials, planted, plantedPercent, stage, quality, tone: qualityTone(quality), sowing, conduction, harvest, groups };
}

function phenologicalStage(trial: Trial) {
  const days = daysBetween(trial.sowing, sourceSummary.importedAt);
  if (days < 0) return 'Pré-semeadura';
  if (days <= 10) return 'Emergência';
  if (days <= 25) return 'Perfilhamento';
  if (days <= 45) return 'Alongamento';
  if (days <= 65) return 'Espigamento';
  if (days <= 85) return 'Enchimento de grãos';
  return 'Maturação';
}

function QualityBadge({ trial, activities }: { trial: Trial; activities: Activity[] }) {
  const quality = trialQuality(trial, activities);
  return <span className={`quality-badge ${quality.tone}`}><i />{quality.label}<b>{quality.score}</b>{!quality.measured && <small>estimada</small>}</span>;
}

const navItems: { screen: Screen; icon: string; label: string }[] = [
  { screen: 'dashboard', icon: '⌂', label: 'Visão geral' },
  { screen: 'mapa', icon: '🗺', label: 'Mapa da rede' },
  { screen: 'ensaios', icon: '🌱', label: 'Ensaios' },
  { screen: 'planejamento', icon: '▦', label: 'Planejamento' },
  { screen: 'operacional', icon: '⚒', label: 'Registro operacional' },
  { screen: 'campo', icon: '✓', label: 'Registro de campo' },
  { screen: 'historico', icon: '↺', label: 'Histórico' },
  { screen: 'resultados', icon: '▥', label: 'Resultados' },
  { screen: 'cadastros', icon: '⚙', label: 'Gerenciamento' },
  { screen: 'usuarios', icon: '♙', label: 'Usuários' },
];

function Status({ kind, children }: { kind: 'ok' | 'attention' | 'late'; children: React.ReactNode }) {
  return <span className={`status-pill ${kind}`}><i />{children}</span>;
}

function splitCsvLine(line: string, separator: string) {
  const cells: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === separator && !quoted) { cells.push(value.trim()); value = ''; }
    else value += char;
  }
  cells.push(value.trim());
  return cells;
}

async function readSpreadsheet(file: File, dataset: string) {
  let matrix: (string | number | boolean)[][] = [];
  if (file.name.toLowerCase().endsWith('.csv')) {
    const text = await file.text();
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
    const separator = (lines[0]?.match(/;/g)?.length ?? 0) > (lines[0]?.match(/,/g)?.length ?? 0) ? ';' : ',';
    matrix = lines.map((line) => splitCsvLine(line, separator));
  } else {
    const { Workbook } = await import('exceljs');
    const workbook = new Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const desired = workbook.worksheets.find((sheet) => sheet.name.toLowerCase().includes(dataset.toLowerCase().replace('configurações','configuracoes')) || sheet.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(dataset.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''))) ?? workbook.worksheets[0];
    desired.eachRow((row) => matrix.push((row.values as unknown[]).slice(1).map((value) => value instanceof Date ? value.toISOString().slice(0, 10) : typeof value === 'object' && value && 'text' in value ? String((value as { text: string }).text) : String(value ?? ''))));
  }
  const headerIndex = matrix.findIndex((row) => row.map((value) => String(value).trim().toLowerCase()).includes('local_codigo'));
  const resolvedHeaderIndex = headerIndex >= 0 ? headerIndex : 0;
  const headers = (matrix[resolvedHeaderIndex] ?? []).map((value) => String(value).trim().toLowerCase());
  const rows = matrix.slice(resolvedHeaderIndex + 1).filter((row) => row.some((value) => String(value).trim())).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
  return headers.includes('local_codigo') ? rows.filter((row) => String(row.local_codigo ?? '').trim()) : rows;
}

export default function Home() {
  const [phase, setPhase] = useState<'login' | 'profile' | 'app'>('login');
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [dataVersion, setDataVersion] = useState(0);
  const [registeredTrials, setRegisteredTrials] = useState<Trial[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(window.localStorage.getItem('field-wheat-trials-clean-v1') ?? '[]'); } catch { return []; }
  });
  const allTrials = useMemo(() => [...registeredTrials, ...trials], [registeredTrials, dataVersion]);
  const [selectedTrial, setSelectedTrial] = useState<Trial>(blankTrial);
  const [selectedPlan, setSelectedPlan] = useState<PlannedActivity | null>(null);
  const [schedule, setSchedule] = useState<PlannedActivity[]>(() => {
    if (typeof window === 'undefined') return initialPlanning;
    const saved = window.localStorage.getItem('field-wheat-schedule-clean-v1');
    if (!saved) return initialPlanning;
    try { return JSON.parse(saved); } catch { return initialPlanning; }
  });
  const [activities, setActivities] = useState<Activity[]>(() => {
    if (typeof window === 'undefined') return initialActivities;
    const saved = window.localStorage.getItem('field-wheat-activities-clean-v1');
    if (!saved) return initialActivities;
    try { return JSON.parse(saved); } catch { return initialActivities; }
  });
  const [toast, setToast] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewContext, setViewContext] = useState<ViewContext>({});
  const [harvests, setHarvests] = useState<Harvest[]>(() => {
    if (typeof window === 'undefined') return [{ id: 'safra-2026', name: 'Safra 2026', status: 'Ativa', createdAt: '2026-01-01', updatedAt: '', quality: 0 }];
    try { const saved = JSON.parse(localStorage.getItem('field-wheat-harvests-v2') ?? '[]') as Harvest[]; return saved.length ? saved : [{ id: 'safra-2026', name: 'Safra 2026', status: 'Ativa', createdAt: '2026-01-01', updatedAt: '', quality: 0 }]; } catch { return [{ id: 'safra-2026', name: 'Safra 2026', status: 'Ativa', createdAt: '2026-01-01', updatedAt: '', quality: 0 }]; }
  });
  const [activeHarvestId, setActiveHarvestId] = useState(() => typeof window === 'undefined' ? 'safra-2026' : localStorage.getItem('field-wheat-active-harvest-v2') || 'safra-2026');
  const [lastUpdated, setLastUpdated] = useState(() => typeof window === 'undefined' ? '' : localStorage.getItem('field-wheat-last-update-v2') || '');
  const [activityFields, setActivityFields] = useState<DynamicField[]>(() => {
    if (typeof window === 'undefined') return defaultDynamicFields;
    try { const saved = JSON.parse(localStorage.getItem('field-wheat-dynamic-fields-v1') ?? '[]') as DynamicField[]; return saved.length ? saved : defaultDynamicFields; } catch { return defaultDynamicFields; }
  });
  const [activityTemplates, setActivityTemplates] = useState<ActivityTemplate[]>(() => {
    if (typeof window === 'undefined') return defaultActivityTemplates;
    try { const saved = JSON.parse(localStorage.getItem('field-wheat-activity-templates-v2') ?? '[]') as ActivityTemplate[]; return saved.length ? saved : defaultActivityTemplates; } catch { return defaultActivityTemplates; }
  });
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [pendingSync, setPendingSync] = useState(() => typeof window === 'undefined' ? 0 : Number(localStorage.getItem('field-wheat-pending-sync-v1') ?? 0));
  const activeHarvest = harvests.find((harvest) => harvest.id === activeHarvestId) ?? harvests[0];

  function updateActivityFields(next: DynamicField[]) {
    setActivityFields(next);
    localStorage.setItem('field-wheat-dynamic-fields-v1', JSON.stringify(next));
  }

  function updateActivityTemplates(next: ActivityTemplate[]) {
    setActivityTemplates(next);
    localStorage.setItem('field-wheat-activity-templates-v2', JSON.stringify(next));
  }

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => undefined);
    const updateConnection = () => {
      const connected = navigator.onLine;
      setOnline(connected);
      if (connected) { localStorage.setItem('field-wheat-pending-sync-v1', '0'); setPendingSync(0); }
    };
    window.addEventListener('online', updateConnection); window.addEventListener('offline', updateConnection);
    return () => { window.removeEventListener('online', updateConnection); window.removeEventListener('offline', updateConnection); };
  }, []);

  function qualityAverage(items: Activity[]) {
    const scored = items.filter((item) => typeof item.qualityScore === 'number');
    return scored.length ? Math.round(scored.reduce((sum, item) => sum + (item.qualityScore ?? 0), 0) / scored.length) : 0;
  }

  function persistHarvestSnapshot(snapshot?: Partial<HarvestSnapshot>, harvestId = activeHarvestId) {
    const all = JSON.parse(localStorage.getItem('field-wheat-harvest-data-v2') ?? '{}') as Record<string, HarvestSnapshot>;
    const updatedAt = snapshot?.updatedAt ?? new Date().toISOString();
    all[harvestId] = { locations: snapshot?.locations ?? [...locations], trials: snapshot?.trials ?? allTrials, schedule: snapshot?.schedule ?? schedule, activities: snapshot?.activities ?? activities, source: snapshot?.source ?? JSON.parse(localStorage.getItem('field-wheat-unified-source-v1') ?? '[]'), updatedAt };
    localStorage.setItem('field-wheat-harvest-data-v2', JSON.stringify(all));
    return updatedAt;
  }

  function touchHarvest(updatedAt: string, activityItems = activities) {
    setLastUpdated(updatedAt); localStorage.setItem('field-wheat-last-update-v2', updatedAt);
    const next = harvests.map((harvest) => harvest.id === activeHarvestId ? { ...harvest, updatedAt, quality: qualityAverage(activityItems) } : harvest);
    setHarvests(next); localStorage.setItem('field-wheat-harvests-v2', JSON.stringify(next));
  }

  useEffect(() => {
    try {
      const snapshots = JSON.parse(localStorage.getItem('field-wheat-harvest-data-v2') ?? '{}') as Record<string, HarvestSnapshot>;
      const snapshot = snapshots[activeHarvestId];
      const storedLocations = JSON.parse(localStorage.getItem('field-wheat-locations-clean-v1') ?? '[]') as NetworkLocation[];
      const storedTrials = JSON.parse(localStorage.getItem('field-wheat-imported-trials-clean-v1') ?? '[]') as Trial[];
      const savedLocations = snapshot?.locations?.length ? snapshot.locations : storedLocations.length ? storedLocations : baseLocations;
      const savedTrials = snapshot?.trials?.length ? snapshot.trials : storedTrials.length ? storedTrials : baseTrials;
      locations.splice(0, locations.length, ...savedLocations);
      trials.splice(0, trials.length, ...savedTrials);
      if (snapshot?.locations?.length || snapshot?.trials?.length) { setSchedule(snapshot.schedule); setActivities(snapshot.activities); setLastUpdated(snapshot.updatedAt); localStorage.setItem('field-wheat-unified-source-v1', JSON.stringify(snapshot.source)); }
      if (savedTrials[0]) setSelectedTrial(savedTrials[0]);
      setDataVersion((value) => value + 1);
    } catch { /* A base incorporada permanece disponível quando o armazenamento local é inválido. */ }
  }, []);

  useEffect(() => {
    const workflowVersion = `base-${sourceSummary.importedAt}-v1`;
    if (localStorage.getItem('field-wheat-workflow-version') === workflowVersion) return;
    if (!locations.length || !trials.length) {
      const seededLocations = baseLocations.map((location) => ({ ...location }));
      const seededTrials = baseTrials.map((trial) => ({ ...trial }));
      const seededSchedule = basePlanning.map((activity) => ({ ...activity }));
      const seededActivities = baseActivities.map((activity) => ({ ...activity }));
      locations.splice(0, locations.length, ...seededLocations);
      trials.splice(0, trials.length, ...seededTrials);
      setSchedule(seededSchedule); setActivities(seededActivities); setSelectedTrial(seededTrials[0] ?? blankTrial);
      localStorage.setItem('field-wheat-locations-clean-v1', JSON.stringify(seededLocations));
      localStorage.setItem('field-wheat-imported-trials-clean-v1', JSON.stringify(seededTrials));
      localStorage.setItem('field-wheat-schedule-clean-v1', JSON.stringify(seededSchedule));
      localStorage.setItem('field-wheat-activities-clean-v1', JSON.stringify(seededActivities));
      localStorage.setItem('field-wheat-unified-source-v1', JSON.stringify(importedSource));
      const updatedAt = new Date().toISOString();
      try {
        const snapshots = JSON.parse(localStorage.getItem('field-wheat-harvest-data-v2') ?? '{}') as Record<string, HarvestSnapshot>;
        snapshots[activeHarvestId] = { locations: seededLocations, trials: seededTrials, schedule: seededSchedule, activities: seededActivities, source: importedSource.map((row) => ({ ...row })), updatedAt };
        localStorage.setItem('field-wheat-harvest-data-v2', JSON.stringify(snapshots));
      } catch { /* O app continua com a base incorporada mesmo sem o histórico local. */ }
      setLastUpdated(updatedAt); setDataVersion((value) => value + 1);
    }
    localStorage.setItem('field-wheat-workflow-version', workflowVersion);
  }, []);

  function switchHarvest(harvestId: string) {
    persistHarvestSnapshot();
    const snapshots = JSON.parse(localStorage.getItem('field-wheat-harvest-data-v2') ?? '{}') as Record<string, HarvestSnapshot>;
    const snapshot = snapshots[harvestId] ?? { locations: [], trials: [], schedule: [], activities: [], source: [], updatedAt: '' };
    locations.splice(0, locations.length, ...snapshot.locations); trials.splice(0, trials.length, ...snapshot.trials);
    setRegisteredTrials([]); setSchedule(snapshot.schedule); setActivities(snapshot.activities); setSelectedTrial(snapshot.trials[0] ?? blankTrial); setLastUpdated(snapshot.updatedAt);
    localStorage.setItem('field-wheat-unified-source-v1', JSON.stringify(snapshot.source)); localStorage.setItem('field-wheat-active-harvest-v2', harvestId); setActiveHarvestId(harvestId); setDataVersion((value) => value + 1); go('dashboard');
  }

  function createHarvest(name: string, clonePlanning: boolean) {
    const normalized = name.trim(); if (!normalized) return;
    persistHarvestSnapshot();
    const id = `safra-${normalized.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
    const now = new Date().toISOString();
    const source = clonePlanning ? JSON.parse(localStorage.getItem('field-wheat-unified-source-v1') ?? '[]').map((row: Record<string, unknown>) => ({ ...row, safra: normalized, data_realizada: '', checklist_concluido: '', observacoes: '', fotos: '', nota_qualidade: '', classificacao: '', status_planejamento: 'Não iniciado' })) : [];
    const newSnapshot: HarvestSnapshot = { locations: clonePlanning ? locations.map((item) => ({ ...item })) : [], trials: clonePlanning ? allTrials.map((item) => ({ ...item, cycle: normalized, rawStatus: 'Planejado', status: 'Planejado', progress: 0 })) : [], schedule: clonePlanning ? schedule.map((item) => ({ ...item, status: 'Não iniciado', version: 1 })) : [], activities: [], source, updatedAt: now };
    const snapshots = JSON.parse(localStorage.getItem('field-wheat-harvest-data-v2') ?? '{}'); snapshots[id] = newSnapshot; localStorage.setItem('field-wheat-harvest-data-v2', JSON.stringify(snapshots));
    const nextHarvests = [...harvests, { id, name: normalized, status: 'Ativa' as const, createdAt: now, updatedAt: now, quality: 0 }]; setHarvests(nextHarvests); localStorage.setItem('field-wheat-harvests-v2', JSON.stringify(nextHarvests)); switchHarvest(id); setToast(`${normalized} criada ${clonePlanning ? 'com o planejamento-base da safra anterior' : 'vazia'}.`); setTimeout(() => setToast(''), 3500);
  }

  function setHarvestStatus(harvestId: string, status: HarvestStatus) {
    const next = harvests.map((harvest) => harvest.id === harvestId ? { ...harvest, status, quality: harvest.id === activeHarvestId ? qualityAverage(activities) : harvest.quality, updatedAt: new Date().toISOString() } : harvest); setHarvests(next); localStorage.setItem('field-wheat-harvests-v2', JSON.stringify(next)); persistHarvestSnapshot(); setToast(status === 'Encerrada' ? 'Safra encerrada e bloqueada para novos registros.' : 'Safra reaberta pelo administrador.'); setTimeout(() => setToast(''), 3500);
  }

  const go = (next: Screen) => { setScreen(next); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  function openFiltered(context: ViewContext) {
    setViewContext(context);
    go('ensaios');
  }

  function saveActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeHarvest?.status === 'Encerrada') { setToast('Safra encerrada. Um administrador precisa reabri-la antes de registrar atividades.'); setTimeout(() => setToast(''), 4000); return; }
    const data = new FormData(event.currentTarget);
    const establishment = Number(data.get('establishment') ?? 3);
    const uniformity = Number(data.get('uniformity') ?? 3);
    const weeds = Number(data.get('weeds') ?? 3);
    const disease = Number(data.get('disease') ?? 3);
    const calculatedScore = Number(data.get('calculatedQualityScore'));
    const baseQuality = qualityFrom({ establishment, uniformity, weeds, disease });
    const quality = Number.isFinite(calculatedScore) && calculatedScore > 0
      ? { score: calculatedScore, label: calculatedScore >= 85 ? 'Excelente' : calculatedScore >= 70 ? 'Adequado' : calculatedScore >= 50 ? 'Atenção' : 'Crítico' }
      : baseQuality;
    const plannedId = String(data.get('plannedId') || '');
    const locationId = String(data.get('locationId') || selectedTrial.locationId);
    const activePlan = schedule.find((item) => item.id === plannedId);
    const areaCategory = String(data.get('areaCategory') || activePlan?.areaCategory || 'Ensaios');
    const macroGroup = String(data.get('macroGroup') || data.get('baseMacroGroup') || groupFromCategory(areaCategory)) as MacroGroup;
    const macroStage = String(data.get('macroStage') || 'Condução') as MacroStage;
    const recordStream = String(data.get('recordStream') || 'field') as ActivityStream;
    const scope = String(data.get('scope') || data.get('baseScope') || 'Categoria da área');
    const selectedTrialId = String(data.get('adverseTrial') || '');
    const matchingTrial = allTrials.find((trial) => trial.id === selectedTrialId) ?? allTrials.find((trial) => trial.locationId === locationId && (trial.areaCategory === areaCategory || macroGroupFor(trial) === macroGroup)) ?? selectedTrial;
    const alertCategory = String(data.get('adverseCategory') || ''); const adverseQuantity = Number(data.get('adverseQuantity') || 1);
    const penalty = alertCategory ? adversePenalty(alertCategory, adverseQuantity, Number(data.get('manualPenalty') || 0)) : 0;
    const photoFiles = Array.from(data.entries()).filter(([key, entry]) => (key.startsWith('checkPhoto-') || key === 'riskPhotos' || key === 'photos' || key === 'adversePhotos') && entry instanceof File && entry.size > 0).map(([, entry]) => (entry as File).name);
    const next: Activity = {
      id: Date.now(),
      date: new Date(`${data.get('date')}T12:00:00`).toLocaleDateString('pt-BR'),
      trial: matchingTrial.id,
      type: String(data.get('visitStage') || macroStage),
      owner: currentUser?.name ?? 'Igor',
      notes: String(data.get('notes')) || 'Atividade registrada sem observações.',
      plannedId: plannedId || undefined,
      qualityScore: recordStream === 'field' ? quality.score : undefined,
      qualityClass: recordStream === 'field' ? quality.label : undefined,
      locationId,
      scope,
      macroGroup,
      macroStage,
      checks: data.getAll('checks').map(String),
      photos: photoFiles,
      alertCategory: alertCategory || undefined,
      qualityPenalty: penalty || undefined,
      plotIds: String(data.get('adversePlotIds') || '').split(/[;,\s]+/).map((item) => item.trim()).filter(Boolean),
      details: { categoria_area: areaCategory, estadio: String(data.get('visitStage') || data.get('stage') || ''), fluxo: activityStreamFor(schedule.find((item) => item.id === plannedId)), enchimento_plantado: String(data.get('fillPlanted') || ''), produto: String(data.get('product') || ''), dose: String(data.get('dose') || ''), estabelecimento: String(establishment), uniformidade: String(uniformity), daninhas: String(weeds), doencas: String(disease), controle_daninhas: String(data.get('weedControl') || ''), oidio: String(data.get('oidio') || ''), ferrugem: String(data.get('ferrugem') || ''), manchas: String(data.get('manchas') || ''), ocorrencia: String(data.get('adverseDescription') || ''), quantidade_afetada: String(adverseQuantity), ...Object.fromEntries([...data.entries()].filter(([key]) => key.startsWith('dynamic-')).map(([key, value]) => [key.slice(8), String(value)])) },
    };
    const updated = [next, ...activities];
    setActivities(updated);
    window.localStorage.setItem('field-wheat-activities-clean-v1', JSON.stringify(updated));
    if (!navigator.onLine) { const queued = pendingSync + 1; localStorage.setItem('field-wheat-pending-sync-v1', String(queued)); setPendingSync(queued); }
    if (plannedId) {
      const nextSchedule = schedule.map((item) => item.id === plannedId ? { ...item, status: 'Concluído' } : item);
      setSchedule(nextSchedule);
      window.localStorage.setItem('field-wheat-schedule-clean-v1', JSON.stringify(nextSchedule));
      const updatedAt = persistHarvestSnapshot({ activities: updated, schedule: nextSchedule }); touchHarvest(updatedAt, updated);
    } else {
      const updatedAt = persistHarvestSnapshot({ activities: updated }); touchHarvest(updatedAt, updated);
    }
    setSelectedPlan(null);
    setToast(recordStream === 'field' ? `Registro de campo salvo em ${locations.find((location) => location.id === locationId)?.name}. Qualidade: ${quality.label} (${quality.score}/100).` : `Registro operacional salvo em ${locations.find((location) => location.id === locationId)?.name}.`);
    go('historico');
    setTimeout(() => setToast(''), 3500);
  }

  function openPlannedActivity(item: PlannedActivity) {
    setSelectedPlan(item);
    const trial = allTrials.find((entry) => entry.id === item.trialId);
    if (trial) setSelectedTrial(trial);
    go(activityStreamFor(item) === 'operational' ? 'operacional' : 'campo');
  }

  function reprogramTrial(trialId: string, actualSowing: string) {
    const trial = allTrials.find((entry) => entry.id === trialId);
    if (!trial || !actualSowing) return;
    const offset = daysBetween(trial.sowing, actualSowing);
    const nextSchedule = schedule.map((item) => item.trialId === trialId && item.status !== 'Concluído'
      ? { ...item, start: addDays(item.originalStart, offset), end: addDays(item.originalEnd, offset), version: item.version + 1 }
      : item);
    setSchedule(nextSchedule);
    window.localStorage.setItem('field-wheat-schedule-clean-v1', JSON.stringify(nextSchedule));
    setToast(`${trialId}: cronograma recalculado em ${offset >= 0 ? '+' : ''}${offset} dias.`);
    setTimeout(() => setToast(''), 3500);
  }

  function importPlanningRows(rows: Record<string, unknown>[]) {
    const imported = rows.map((row, index): PlannedActivity => {
      const start = String(row.data_prevista ?? row.inicio ?? sourceSummary.importedAt).slice(0, 10);
      const id = String(row.planejamento_id ?? `PLAN-IMPORT-${Date.now()}-${index + 1}`);
      return { id, trialId: String(row.ensaio_id ?? ''), activity: String(row.atividade ?? 'Atividade de campo'), category: String(row.etapa ?? 'Condução'), start, end: String(row.data_fim ?? start).slice(0, 10), owner: String(row.responsavel ?? 'Equipe de campo'), priority: String(row.prioridade ?? 'Normal'), status: String(row.status ?? 'Planejado'), notes: String(row.observacoes ?? 'Importado por planilha'), originalStart: start, originalEnd: String(row.data_fim ?? start).slice(0, 10), version: 1 };
    }).filter((item) => item.trialId && allTrials.some((trial) => trial.id === item.trialId));
    const ids = new Set(imported.map((item) => item.id));
    const updated = [...imported, ...schedule.filter((item) => !ids.has(item.id))];
    setSchedule(updated);
    localStorage.setItem('field-wheat-schedule-clean-v1', JSON.stringify(updated));
    setToast(`${imported.length} atividades de planejamento carregadas da planilha.`);
    setTimeout(() => setToast(''), 3500);
  }

  function importOperationalDataset(dataset: string, rows: Record<string, unknown>[]) {
    if (dataset === 'Planejamento') { importPlanningRows(rows); return; }
    if (dataset === 'Localidades') {
      const imported = rows.map((row): NetworkLocation => ({ id: String(row.id), name: String(row.nome), city: String(row.cidade), region: String(row.regiao), lat: Number(row.latitude), lng: Number(row.longitude), trials: 0, plots: 0, status: 'ok' }));
      locations.splice(0, locations.length, ...imported);
      localStorage.setItem('field-wheat-locations-clean-v1', JSON.stringify(imported));
      setDataVersion((value) => value + 1);
      setToast(`${imported.length} localidades carregadas.`);
    } else if (dataset === 'Campos') {
      localStorage.setItem('field-wheat-fields-clean-v1', JSON.stringify(rows));
      setToast(`${rows.length} campos carregados. Agora importe os ensaios.`);
    } else if (dataset === 'Ensaios') {
      const fields = JSON.parse(localStorage.getItem('field-wheat-fields-clean-v1') ?? '[]') as Record<string, unknown>[];
      const imported = rows.map((row, index): Trial => {
        const field = fields.find((item) => String(item.campo_id) === String(row.campo_id));
        const location = locations.find((item) => item.id === String(field?.localidade_id ?? row.localidade_id)) ?? locations[0];
        const sowing = String(row.data_semeadura ?? sourceSummary.importedAt).slice(0,10);
        const id = String(row.ensaio_id ?? `ENS-${index + 1}`);
        return { id, name: String(row.nome ?? id), type: String(row.grupo ?? row.tipo ?? 'Outro'), year: Number(sowing.slice(0,4)) || 2026, cycle: 'Safra 2026', locationId: location?.id ?? '', plots: Number(row.parcelas ?? 0), sowing, harvest: addDays(sowing, 120), owner: String(row.responsavel ?? 'Equipe de campo'), rawStatus: 'Planejado', priority: String(row.prioridade ?? 'Normal'), notes: String(row.observacoes ?? ''), place: location?.name ?? '', city: location?.city ?? '', status: 'Planejado', progress: 0, next: 'Semeadura', nextDate: sowing, date: formatDate(sowing), fieldName: String(field?.nome ?? row.campo_id ?? '') };
      }).filter((trial) => trial.locationId);
      trials.splice(0, trials.length, ...imported);
      localStorage.setItem('field-wheat-imported-trials-clean-v1', JSON.stringify(imported));
      if (imported[0]) setSelectedTrial(imported[0]);
      setDataVersion((value) => value + 1);
      setToast(`${imported.length} ensaios carregados e vinculados aos campos.`);
    } else if (dataset === 'Atividades') {
      const imported = rows.map((row, index): Activity => ({ id: Date.now() + index, date: String(row.data ?? ''), trial: String(row.ensaio_id ?? ''), type: String(row.etapa ?? 'Visita'), owner: String(row.responsavel ?? 'Equipe de campo'), notes: String(row.observacoes ?? ''), locationId: String(row.localidade_id ?? ''), qualityScore: Number(row.nota_qualidade ?? 0) || undefined, qualityClass: String(row.classificacao ?? '') || undefined }));
      setActivities(imported);
      localStorage.setItem('field-wheat-activities-clean-v1', JSON.stringify(imported));
      setToast(`${imported.length} registros de atividade carregados.`);
    } else {
      setToast(`${rows.length} configurações validadas.`);
    }
    setTimeout(() => setToast(''), 3500);
  }

  function importUnifiedPlanning(rows: Record<string, unknown>[]) {
    if (activeHarvest?.status === 'Encerrada') { setToast('Safra encerrada. Reabra-a no Gerenciamento antes de substituir o planejamento.'); setTimeout(() => setToast(''), 4000); return; }
    const clean = (value: unknown) => String(value ?? '').trim();
    const date = (value: unknown, fallback: string = sourceSummary.importedAt) => clean(value).slice(0, 10) || fallback;
    const unique = <T,>(items: T[], key: (item: T) => string) => [...new Map(items.map((item) => [key(item), item])).values()];
    const importedLocations = unique(rows.map((row): NetworkLocation => ({
      id: clean(row.local_codigo), name: clean(row.local_nome), city: [clean(row.municipio), clean(row.uf)].filter(Boolean).join(' - '),
      region: (({ 'VCU I': 'VCU_1', 'VCU II': 'VCU_2', 'VCU III': 'VCU_3' } as Record<string, string>)[clean(row.vcu_regiao).toUpperCase()] ?? clean(row.vcu_regiao)) || 'VCU_1',
      lat: Number(row.latitude) || -29.63, lng: Number(row.longitude) || -53.05, trials: 0, plots: 0, status: 'ok',
    })).filter((item) => item.id && item.name), (item) => item.id);
    const importedTrials = unique(rows.map((row, index): Trial => {
      const sowing = date(row.data_semeadura);
      const location = importedLocations.find((item) => item.id === clean(row.local_codigo));
      const id = clean(row.ensaio_codigo) || `ENS-${index + 1}`;
      return { id, name: clean(row.ensaio_nome) || id, type: clean(row.grupo) || 'Outro', subtype: clean(row.subtipo_ensaio), year: Number(sowing.slice(0, 4)) || 2026, cycle: `Safra ${sowing.slice(0, 4) || '2026'}`, locationId: clean(row.local_codigo), plots: Number(row.parcelas) || 0, sowing, harvest: addDays(sowing, 120), owner: clean(row.responsavel) || 'Equipe de campo', rawStatus: clean(row.status_planejamento) || 'Planejado', priority: clean(row.prioridade) || 'Normal', notes: clean(row.observacoes), place: location?.name ?? clean(row.local_nome), city: location?.city ?? clean(row.municipio), status: clean(row.status_planejamento) || 'Planejado', progress: 0, next: clean(row.atividade_descricao) || 'Visita de campo', nextDate: date(row.data_prevista, sowing), date: formatDate(date(row.data_prevista, sowing)), fieldName: clean(row.campo_nome) || clean(row.campo_codigo) };
    }).filter((item) => item.locationId), (item) => item.id);
    const importedSchedule = unique(rows.map((row, index): PlannedActivity => {
      const start = date(row.data_prevista, date(row.data_semeadura));
      const rawStatus = clean(row.status_planejamento) || 'Não iniciado';
      return { id: clean(row.visita_codigo) || `VIS-${index + 1}`, trialId: clean(row.ensaio_codigo), activity: clean(row.atividade_descricao) || 'Atividade de campo', category: clean(row.estadio_fenologico) || 'Condução', start, end: start, owner: clean(row.responsavel) || 'Equipe de campo', priority: clean(row.prioridade) || 'Média', status: /finalizado|conclu[ií]do/i.test(rawStatus) ? 'Concluído' : rawStatus, notes: clean(row.observacoes) || 'Importado da planilha unificada', originalStart: start, originalEnd: start, version: 1 };
    }).filter((item) => item.trialId), (item) => item.id);
    const importedActivities = rows.filter((row) => clean(row.data_realizada)).map((row, index): Activity => {
      const score = Number(row.nota_qualidade) || undefined;
      const maxDisease = Math.max(Number(row.oidio_nota) || 0, Number(row.ferrugem_nota) || 0, Number(row.manchas_nota) || 0, 1);
      const calculated = qualityFrom({ establishment: Number(row.estabelecimento_nota) || 3, uniformity: Number(row.uniformidade_nota) || 3, weeds: Number(row.daninhas_nota) || 3, disease: maxDisease });
      const qualityScore = score ?? calculated.score;
      return { id: Date.now() + index, date: formatDate(date(row.data_realizada)), trial: clean(row.ensaio_codigo), type: clean(row.estadio_fenologico) || 'Visita', owner: clean(row.responsavel) || 'Equipe de campo', notes: clean(row.observacoes) || 'Registro importado da planilha unificada', plannedId: clean(row.visita_codigo), qualityScore, qualityClass: clean(row.classificacao) || (qualityScore >= 85 ? 'Excelente' : qualityScore >= 70 ? 'Adequado' : qualityScore >= 50 ? 'Atenção' : 'Crítico'), locationId: clean(row.local_codigo), macroGroup: (clean(row.grupo) || 'Outro') as MacroGroup, macroStage: (/semeadura/i.test(clean(row.estadio_fenologico)) ? 'Semeadura' : /maturidade|colheita/i.test(clean(row.estadio_fenologico)) ? 'Colheita' : 'Condução') as MacroStage, checks: clean(row.checklist_concluido) ? [clean(row.checklist_concluido)] : [], photos: clean(row.fotos) ? clean(row.fotos).split(/[;,]/).map((item) => item.trim()).filter(Boolean) : [], details: { estabelecimento: clean(row.estabelecimento_nota), uniformidade: clean(row.uniformidade_nota), daninhas: clean(row.daninhas_nota), controle_daninhas: clean(row.controle_daninhas), oidio: clean(row.oidio_nota), ferrugem: clean(row.ferrugem_nota), manchas: clean(row.manchas_nota), qualidade_grupo: clean(row.qualidade_grupo_nota) } };
    });
    importedLocations.forEach((location) => { const localTrials = importedTrials.filter((trial) => trial.locationId === location.id); location.trials = localTrials.length; location.plots = localTrials.reduce((sum, trial) => sum + trial.plots, 0); });
    locations.splice(0, locations.length, ...importedLocations);
    trials.splice(0, trials.length, ...importedTrials);
    setRegisteredTrials([]); setSchedule(importedSchedule); setActivities(importedActivities);
    if (importedTrials[0]) setSelectedTrial(importedTrials[0]);
    localStorage.setItem('field-wheat-locations-clean-v1', JSON.stringify(importedLocations));
    localStorage.setItem('field-wheat-imported-trials-clean-v1', JSON.stringify(importedTrials));
    localStorage.setItem('field-wheat-trials-clean-v1', '[]');
    localStorage.setItem('field-wheat-schedule-clean-v1', JSON.stringify(importedSchedule));
    localStorage.setItem('field-wheat-activities-clean-v1', JSON.stringify(importedActivities));
    localStorage.setItem('field-wheat-unified-source-v1', JSON.stringify(rows));
    const updatedAt = persistHarvestSnapshot({ locations: importedLocations, trials: importedTrials, schedule: importedSchedule, activities: importedActivities, source: rows });
    touchHarvest(updatedAt, importedActivities);
    setDataVersion((value) => value + 1);
    setToast(`${importedLocations.length} locais, ${importedTrials.length} ensaios e ${importedSchedule.length} atividades previstas carregados.`);
    setTimeout(() => setToast(''), 4500);
  }

  function createPlanningFromWizard(config: PlanningWizardConfig) {
    const templates = config.profile === 'Essencial'
      ? [['Visita · Semeadura','Semeadura',0],['Visita · Perfilhamento','Perfilhamento',20],['Visita · Maturidade','Maturidade',120]]
      : config.profile === 'Monitoramento'
        ? [['Visita · Perfilhamento','Perfilhamento',20],['Visita · Alongamento','Alongamento',40],['Visita · Espigamento','Espigamento',70],['Visita · Enchimento de grão','Enchimento de grão',90]]
        : [['Visita · Semeadura','Semeadura',0],['Visita · Perfilhamento','Perfilhamento',20],['Visita · Alongamento','Alongamento',40],['Visita · Emborrachamento','Emborrachamento',55],['Visita · Espigamento','Espigamento',70],['Visita · Enchimento de grão','Enchimento de grão',90],['Visita · Maturidade','Maturidade',120]];
    const generated = config.trialIds.flatMap((trialId) => { const trial = allTrials.find((item) => item.id === trialId); if (!trial) return []; return templates.map(([activity, category, offset], index) => { const date = addDays(trial.sowing, Number(offset)); return { id: `CLICK-${Date.now()}-${trialId}-${index}`, trialId, activity: String(activity), category: String(category), start: date, end: date, owner: trial.owner, priority: trial.priority, status: 'Planejado', notes: `Gerado pelo assistente para ${trial.place}`, originalStart: date, originalEnd: date, version: 1 } satisfies PlannedActivity; }); });
    const updated = [...generated, ...schedule];
    setSchedule(updated);
    localStorage.setItem('field-wheat-schedule-clean-v1', JSON.stringify(updated));
    setToast(`${generated.length} atividades geradas para ${config.trialIds.length} ensaio(s).`);
    setTimeout(() => setToast(''), 3500);
  }

  function finalizeLayoutPlanning(payload: LayoutFinalization) {
    if (activeHarvest?.status === 'Encerrada') { setToast('Safra encerrada. Reabra-a antes de finalizar uma implantação.'); return; }
    const locationCity = /\s-\s[A-Z]{2}$/.test(payload.location.city) ? payload.location.city : `${payload.location.city} - RS`;
    const nextLocation: NetworkLocation = { id: payload.location.id, name: payload.location.name, city: locationCity, region: 'CROQUI', lat: payload.location.lat, lng: payload.location.lng, trials: payload.allocations.length, plots: payload.allocations.reduce((sum, allocation) => sum + allocation.plotCount, 0), status: 'ok' };
    const areaText = payload.areaType.toLowerCase();
    const group: MacroGroup = areaText.includes('cole') ? 'Coleção' : areaText.includes('founder') ? 'Founder' : /^pd/.test(areaText) ? 'PD' : areaText.includes('multi') ? 'Multiqualidades' : areaText.includes('outro') ? 'Outro' : 'Ensaios';
    const year = Number(payload.plannedSowingDate.slice(0, 4)) || new Date().getFullYear();
    const impactKinds = new Set(['Linha entupida','Falha de semeadura','Passada de pulverizador','Fitotoxidez','Parcela perdida']);
    const createdTrials: Trial[] = payload.allocations.map((allocation) => {
      const allocationPlots = payload.plots.filter((plot) => plot.allocationId === allocation.id || plot.trialId === allocation.id);
      const affectedPlots = allocationPlots.filter((plot) => impactKinds.has(payload.plotIssues[plot.plotId]?.kind)).map((plot) => plot.plotId);
      const lostPlots = allocationPlots.filter((plot) => payload.plotIssues[plot.plotId]?.kind === 'Parcela perdida').map((plot) => plot.plotId);
      const affectedRatio = affectedPlots.length / Math.max(allocation.plotCount, 1);
      const layoutPenalty = affectedRatio <= .1 ? 0 : Math.min(40, Math.round((affectedRatio - .1) * 50));
      return { id: `${allocation.id}-${nextLocation.id}-${payload.mapId}`, name: allocation.name, type: group, subtype: payload.areaType, areaCategory: payload.areaType, mapId: payload.mapId, year, cycle: activeHarvest?.name ?? `Safra ${year}`, locationId: nextLocation.id, plots: allocation.plotCount, sowing: payload.plannedSowingDate, harvest: addDays(payload.plannedSowingDate, 120), owner: 'Wheat Team', rawStatus: 'Planejado', priority: 'Normal', notes: `Criado pelo ${payload.mapName} · ${payload.fileName}`, place: nextLocation.name, city: nextLocation.city, status: 'Planejado', progress: 0, next: 'Semeadura', nextDate: payload.plannedSowingDate, date: formatDate(payload.plannedSowingDate), fieldName: payload.mapName, issueCount: affectedPlots.length, affectedPlots, lostPlots, layoutPenalty };
    });
    const selectedTemplates = activityTemplates.filter((template) => template.enabled && (template.categories.includes(payload.areaType) || template.categories.includes('*')));
    const representativeTrial = createdTrials[0];
    const createdSchedule: PlannedActivity[] = representativeTrial ? selectedTemplates.map((template) => { const plannedDate = addDays(payload.plannedSowingDate, template.offset); return { id: `${nextLocation.id}-${payload.mapId}-${template.id}`, trialId: representativeTrial.id, locationId: nextLocation.id, areaCategory: payload.areaType, activityTemplateId: template.id, activity: template.name, category: template.stage, start: plannedDate, end: plannedDate, owner: 'Wheat Team', priority: 'Normal', status: 'Não iniciado', notes: `Atividade da categoria ${payload.areaType} · ${payload.mapName}`, originalStart: plannedDate, originalEnd: plannedDate, version: 1 }; }) : [];
    const previousLocationTrialIds = new Set(allTrials.filter((trial) => trial.locationId === nextLocation.id && trial.mapId === payload.mapId).map((trial) => trial.id));
    const trialIds = new Set(createdTrials.map((trial) => trial.id));
    const removedTrialIds = new Set([...previousLocationTrialIds].filter((id) => !trialIds.has(id)));
    const nextTrials = [...allTrials.filter((trial) => !(trial.locationId === nextLocation.id && trial.mapId === payload.mapId)), ...createdTrials];
    const nextSchedule = [...schedule.filter((item) => !(item.locationId === nextLocation.id && item.areaCategory === payload.areaType && item.id.includes(payload.mapId)) && !previousLocationTrialIds.has(item.trialId)), ...createdSchedule];
    const nextActivities = activities.filter((item) => !removedTrialIds.has(item.trial));
    const nextLocations = [...locations.filter((item) => item.id !== nextLocation.id), { ...nextLocation, trials: nextTrials.filter((trial) => trial.locationId === nextLocation.id).length, plots: nextTrials.filter((trial) => trial.locationId === nextLocation.id).reduce((sum, trial) => sum + trial.plots, 0) }];
    const existingSource = JSON.parse(localStorage.getItem('field-wheat-unified-source-v1') ?? '[]') as Record<string, unknown>[];
    const nextRows = payload.allocations.flatMap((allocation) => { const trialId = `${allocation.id}-${nextLocation.id}-${payload.mapId}`; return selectedTemplates.map((template) => ({ safra: activeHarvest?.name, tipo_registro: 'Croqui de implantação', mapa_id: payload.mapId, mapa_nome: payload.mapName, local_codigo: nextLocation.id, local_nome: nextLocation.name, municipio: payload.location.city, latitude: nextLocation.lat, longitude: nextLocation.lng, tipo_area: payload.areaType, arquivo_croqui: payload.fileName, ensaio_codigo: trialId, ensaio_nome: allocation.name, codigo_alocacao: allocation.code, cor_ensaio: allocation.color, parcela_inicial: allocation.startPlotId, parcela_final: allocation.endPlotId, parcelas: allocation.plotCount, primeira_parcela_latitude: allocation.firstPlotCoordinate[0], primeira_parcela_longitude: allocation.firstPlotCoordinate[1], data_semeadura_prevista: payload.plannedSowingDate, visita_codigo: `${nextLocation.id}-${payload.mapId}-${template.id}`, atividade_descricao: template.name, estadio_fenologico: template.stage, data_prevista: addDays(payload.plannedSowingDate, template.offset), status_planejamento: 'Não iniciado' })); });
    const nextSource = [...existingSource.filter((row) => !(String(row.local_codigo) === nextLocation.id && String(row.mapa_id) === payload.mapId)), ...nextRows];
    locations.splice(0, locations.length, ...nextLocations); trials.splice(0, trials.length, ...nextTrials); setRegisteredTrials([]); setSchedule(nextSchedule); setActivities(nextActivities);
    localStorage.setItem('field-wheat-locations-clean-v1', JSON.stringify(nextLocations)); localStorage.setItem('field-wheat-imported-trials-clean-v1', JSON.stringify(nextTrials)); localStorage.setItem('field-wheat-schedule-clean-v1', JSON.stringify(nextSchedule)); localStorage.setItem('field-wheat-activities-clean-v1', JSON.stringify(nextActivities)); localStorage.setItem('field-wheat-unified-source-v1', JSON.stringify(nextSource));
    const updatedAt = persistHarvestSnapshot({ locations: nextLocations, trials: nextTrials, schedule: nextSchedule, activities: nextActivities, source: nextSource }); touchHarvest(updatedAt, nextActivities); setDataVersion((value) => value + 1); setToast(`${payload.mapName}: ${createdTrials.length} ensaio(s) e ${createdSchedule.length} atividades por categoria programadas.`); setTimeout(() => setToast(''), 4500);
  }

  function addManagedLocation(input: { code: string; name: string; city: string; uf: string; region: string; lat: number; lng: number }) {
    if (activeHarvest?.status === 'Encerrada') { setToast('Safra encerrada. Reabra-a para editar cadastros.'); return; }
    const nextLocation: NetworkLocation = { id: input.code.trim().toUpperCase(), name: input.name.trim(), city: `${input.city.trim()} - ${input.uf.trim().toUpperCase()}`, region: ({ 'VCU I': 'VCU_1', 'VCU II': 'VCU_2', 'VCU III': 'VCU_3' } as Record<string, string>)[input.region] ?? input.region, lat: input.lat || -29.63, lng: input.lng || -53.05, trials: 0, plots: 0, status: 'ok' };
    const nextLocations = [...locations.filter((item) => item.id !== nextLocation.id), nextLocation]; locations.splice(0, locations.length, ...nextLocations); localStorage.setItem('field-wheat-locations-clean-v1', JSON.stringify(nextLocations));
    const source = JSON.parse(localStorage.getItem('field-wheat-unified-source-v1') ?? '[]') as Record<string, unknown>[]; const nextSource = [...source.filter((row) => String(row.local_codigo) !== nextLocation.id || row.ensaio_codigo), { safra: activeHarvest?.name, local_codigo: nextLocation.id, local_nome: nextLocation.name, municipio: input.city, uf: input.uf.toUpperCase(), latitude: nextLocation.lat, longitude: nextLocation.lng, vcu_regiao: input.region, tipo_registro: 'Localidade' }]; localStorage.setItem('field-wheat-unified-source-v1', JSON.stringify(nextSource));
    const updatedAt = persistHarvestSnapshot({ locations: nextLocations, source: nextSource }); touchHarvest(updatedAt); setDataVersion((value) => value + 1); setToast(`${nextLocation.name} adicionada à ${activeHarvest?.name}.`); setTimeout(() => setToast(''), 3500);
  }

  function addManagedTrials(input: { locationIds: string[]; trialCode: string; trialName: string; group: MacroGroup; subtype: string; fieldCode: string; fieldName: string; plots: number; sowing: string; owner: string; priority: string }) {
    if (activeHarvest?.status === 'Encerrada' || !input.locationIds.length) { setToast(activeHarvest?.status === 'Encerrada' ? 'Safra encerrada. Reabra-a para editar cadastros.' : 'Selecione pelo menos uma localidade.'); return; }
    const stages: [PhenologyVisit, number][] = [['Semeadura',0],['Perfilhamento',20],['Alongamento',40],['Emborrachamento',55],['Espigamento',70],['Enchimento de grão',90],['Maturidade',120]];
    const createdTrials: Trial[] = []; const createdSchedule: PlannedActivity[] = []; const createdRows: Record<string, unknown>[] = [];
    input.locationIds.forEach((locationId) => { const location = locations.find((item) => item.id === locationId); if (!location) return; const id = `${input.trialCode.trim().toUpperCase()}-${locationId}`; const trial: Trial = { id, name: input.trialName.trim(), type: input.group, subtype: input.group === 'Ensaios' ? input.subtype : '', year: Number(input.sowing.slice(0,4)) || 2026, cycle: activeHarvest?.name ?? 'Safra', locationId, plots: input.plots, sowing: input.sowing, harvest: addDays(input.sowing,120), owner: input.owner, rawStatus: 'Planejado', priority: input.priority, notes: 'Cadastro realizado no Gerenciamento', place: location.name, city: location.city, status: 'Planejado', progress: 0, next: 'Semeadura', nextDate: input.sowing, date: formatDate(input.sowing), fieldName: input.fieldName };
      createdTrials.push(trial); stages.forEach(([stage, offset], index) => { const plannedDate = addDays(input.sowing, offset); const visitId = `${id}-V${index + 1}`; createdSchedule.push({ id: visitId, trialId: id, activity: `Visita · ${stage}`, category: stage, start: plannedDate, end: plannedDate, owner: input.owner, priority: input.priority, status: 'Não iniciado', notes: 'Gerado automaticamente pelo cadastro administrativo', originalStart: plannedDate, originalEnd: plannedDate, version: 1 }); createdRows.push({ safra: activeHarvest?.name, local_codigo: location.id, local_nome: location.name, municipio: location.city.split(' - ')[0], uf: location.city.split(' - ')[1] ?? '', latitude: location.lat, longitude: location.lng, vcu_regiao: location.region.replace('_1',' I').replace('_2',' II').replace('_3',' III'), campo_codigo: input.fieldCode, campo_nome: input.fieldName, ensaio_codigo: id, ensaio_nome: input.trialName, grupo: input.group, subtipo_ensaio: input.group === 'Ensaios' ? input.subtype : '', parcelas: input.plots, data_semeadura: input.sowing, visita_codigo: visitId, atividade_descricao: `Visita · ${stage}`, estadio_fenologico: stage, data_prevista: plannedDate, responsavel: input.owner, prioridade: input.priority, status_planejamento: 'Não iniciado' }); }); });
    const nextTrials = [...allTrials.filter((item) => !createdTrials.some((created) => created.id === item.id)), ...createdTrials]; const nextSchedule = [...schedule.filter((item) => !createdSchedule.some((created) => created.id === item.id)), ...createdSchedule]; const existingSource = JSON.parse(localStorage.getItem('field-wheat-unified-source-v1') ?? '[]') as Record<string, unknown>[]; const visitIds = new Set(createdRows.map((row) => String(row.visita_codigo))); const nextSource = [...existingSource.filter((row) => !visitIds.has(String(row.visita_codigo))), ...createdRows];
    trials.splice(0, trials.length, ...nextTrials); setRegisteredTrials([]); setSchedule(nextSchedule); localStorage.setItem('field-wheat-imported-trials-clean-v1', JSON.stringify(nextTrials)); localStorage.setItem('field-wheat-schedule-clean-v1', JSON.stringify(nextSchedule)); localStorage.setItem('field-wheat-unified-source-v1', JSON.stringify(nextSource)); const nextLocations = locations.map((location) => ({ ...location, trials: nextTrials.filter((trial) => trial.locationId === location.id).length, plots: nextTrials.filter((trial) => trial.locationId === location.id).reduce((sum, trial) => sum + trial.plots, 0) })); locations.splice(0, locations.length, ...nextLocations); const updatedAt = persistHarvestSnapshot({ locations: nextLocations, trials: nextTrials, schedule: nextSchedule, source: nextSource }); touchHarvest(updatedAt); setDataVersion((value) => value + 1); setToast(`${createdTrials.length} ensaio(s) e ${createdSchedule.length} visitas adicionados.`); setTimeout(() => setToast(''), 4000);
  }

  function deleteManagedTrial(trialId: string) {
    if (activeHarvest?.status === 'Encerrada') { setToast('Safra encerrada. Reabra-a para excluir ensaios.'); return; }
    const nextTrials = allTrials.filter((trial) => trial.id !== trialId);
    const nextSchedule = schedule.filter((item) => item.trialId !== trialId);
    const nextActivities = activities.filter((item) => item.trial !== trialId);
    const nextLocations = locations.map((location) => ({ ...location, trials: nextTrials.filter((trial) => trial.locationId === location.id).length, plots: nextTrials.filter((trial) => trial.locationId === location.id).reduce((sum, trial) => sum + trial.plots, 0) }));
    const source = JSON.parse(localStorage.getItem('field-wheat-unified-source-v1') ?? '[]') as Record<string, unknown>[];
    const nextSource = source.filter((row) => String(row.ensaio_codigo ?? '') !== trialId);
    trials.splice(0, trials.length, ...nextTrials); locations.splice(0, locations.length, ...nextLocations); setRegisteredTrials([]); setSchedule(nextSchedule); setActivities(nextActivities);
    localStorage.setItem('field-wheat-imported-trials-clean-v1', JSON.stringify(nextTrials)); localStorage.setItem('field-wheat-trials-clean-v1', '[]'); localStorage.setItem('field-wheat-locations-clean-v1', JSON.stringify(nextLocations)); localStorage.setItem('field-wheat-schedule-clean-v1', JSON.stringify(nextSchedule)); localStorage.setItem('field-wheat-activities-clean-v1', JSON.stringify(nextActivities)); localStorage.setItem('field-wheat-unified-source-v1', JSON.stringify(nextSource));
    const updatedAt = persistHarvestSnapshot({ locations: nextLocations, trials: nextTrials, schedule: nextSchedule, activities: nextActivities, source: nextSource }); touchHarvest(updatedAt, nextActivities); setDataVersion((value) => value + 1); setToast('Ensaio excluído do planejamento, dos registros e da base de gestão.'); setTimeout(() => setToast(''), 3500);
  }

  function deleteManagedLocation(locationId: string) {
    if (activeHarvest?.status === 'Encerrada') { setToast('Safra encerrada. Reabra-a para excluir locais.'); return; }
    const removedTrialIds = new Set(allTrials.filter((trial) => trial.locationId === locationId).map((trial) => trial.id));
    const nextTrials = allTrials.filter((trial) => trial.locationId !== locationId);
    const nextSchedule = schedule.filter((item) => !removedTrialIds.has(item.trialId));
    const nextActivities = activities.filter((item) => item.locationId !== locationId && !removedTrialIds.has(item.trial));
    const nextLocations = locations.filter((location) => location.id !== locationId);
    const source = JSON.parse(localStorage.getItem('field-wheat-unified-source-v1') ?? '[]') as Record<string, unknown>[];
    const nextSource = source.filter((row) => String(row.local_codigo ?? '') !== locationId);
    trials.splice(0, trials.length, ...nextTrials); locations.splice(0, locations.length, ...nextLocations); setRegisteredTrials([]); setSchedule(nextSchedule); setActivities(nextActivities);
    localStorage.removeItem(`field-wheat-layout-${activeHarvestId}-${locationId}`); localStorage.setItem('field-wheat-imported-trials-clean-v1', JSON.stringify(nextTrials)); localStorage.setItem('field-wheat-trials-clean-v1', '[]'); localStorage.setItem('field-wheat-locations-clean-v1', JSON.stringify(nextLocations)); localStorage.setItem('field-wheat-schedule-clean-v1', JSON.stringify(nextSchedule)); localStorage.setItem('field-wheat-activities-clean-v1', JSON.stringify(nextActivities)); localStorage.setItem('field-wheat-unified-source-v1', JSON.stringify(nextSource));
    const updatedAt = persistHarvestSnapshot({ locations: nextLocations, trials: nextTrials, schedule: nextSchedule, activities: nextActivities, source: nextSource }); touchHarvest(updatedAt, nextActivities); setDataVersion((value) => value + 1); setToast('Local e dados vinculados excluídos.'); setTimeout(() => setToast(''), 3500);
  }

  function saveFieldTrial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const location = locations.find((item) => item.id === String(data.get('location'))) ?? locations[0];
    if (!location) { setToast('Importe ou cadastre uma localidade antes de criar o ensaio.'); setTimeout(() => setToast(''), 3500); return; }
    const sowing = String(data.get('sowing'));
    const sequence = allTrials.length + 1;
    const id = `ENS2026_${String(sequence).padStart(3, '0')}`;
    const nextTrial: Trial = {
      id,
      name: String(data.get('trialName')).trim().toUpperCase(),
      type: String(data.get('trialType')),
      year: 2026,
      cycle: 'Safra 2026',
      locationId: location.id,
      plots: Number(data.get('plots')),
      sowing,
      harvest: addDays(sowing, 100),
      owner: String(data.get('owner')),
      rawStatus: 'Planejado',
      priority: String(data.get('priority')),
      notes: String(data.get('notes') || 'Cadastro administrativo'),
      place: location.name.replace(' - RS', '').replace('-RS', ''),
      city: location.city,
      status: String(data.get('priority')) === 'Crítica' ? 'Atenção' : 'Em andamento',
      progress: 0,
      next: 'Identificação',
      nextDate: addDays(sowing, 3),
      date: formatDate(addDays(sowing, 3)),
      fieldName: String(data.get('fieldName')),
      area: Number(data.get('area')),
    };
    const profile = String(data.get('profile'));
    const standardTemplates = [
      ['Identificação', 'Implantação', 3], ['Etiquetagem', 'Implantação', 7], ['Herbicida', 'Manejo', 12],
      ['Manejo de N1', 'Adubação', 20], ['Avaliação de doenças', 'Avaliação', 45], ['Colheita', 'Colheita', 100],
    ] as const;
    const templates = profile === 'Implantação' ? standardTemplates.slice(0, 4) : profile === 'Monitoramento' ? [standardTemplates[0], standardTemplates[4], standardTemplates[5]] : standardTemplates;
    const generated: PlannedActivity[] = templates.map(([activity, category, offset], index) => {
      const date = addDays(sowing, offset);
      return { id: `ADM-${Date.now()}-${index + 1}`, trialId: id, activity, category, start: date, end: date, owner: nextTrial.owner, priority: nextTrial.priority, status: 'Planejado', notes: `Gerado pelo cadastro do campo ${nextTrial.fieldName}`, originalStart: date, originalEnd: date, version: 1 };
    });
    const nextTrials = [nextTrial, ...registeredTrials];
    const nextSchedule = [...generated, ...schedule];
    setRegisteredTrials(nextTrials);
    setSchedule(nextSchedule);
    window.localStorage.setItem('field-wheat-trials-clean-v1', JSON.stringify(nextTrials));
    window.localStorage.setItem('field-wheat-schedule-clean-v1', JSON.stringify(nextSchedule));
    setSelectedTrial(nextTrial);
    setToast(`${id} criado com ${generated.length} atividades planejadas.`);
    go('ensaios');
    setTimeout(() => setToast(''), 4000);
  }

  if (phase === 'login') {
    return (
      <main className="login-shell">
        <section className="login-story">
          <Brand light />
          <div className="story-copy">
            <span className="eyebrow">Plataforma colaborativa</span>
            <h1>Field Wheat Testing</h1>
            <p>Plataforma de gerenciamento operacional para planejar, registrar e acompanhar a rede experimental de trigo.</p>
            <div className="network-summary">
              <div><b>{locations.length}</b><span>locais ativos</span></div><div><b>{allTrials.length}</b><span>ensaios</span></div><div><b>{allTrials.reduce((sum, trial) => sum + trial.plots, 0).toLocaleString('pt-BR')}</b><span>parcelas</span></div>
            </div>
          </div>
          <div className="field-lines" aria-hidden="true"><span /><span /><span /><span /><span /></div>
          <div className="login-watermark">Wheat Team GDM Seeds</div>
        </section>
        <section className="login-panel">
          <div className="login-card">
            <span className="mobile-brand">Field Wheat Testing</span>
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
            <label>Instituição<input defaultValue="GDM Seeds" /></label>
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
      <div className="app-main">
        <header className="app-header">
          <div className="topbar">
            <Brand compact />
            <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Abrir menu">☰</button>
            <div className="search-box">⌕ <span>Buscar ensaios, locais ou atividades…</span><kbd>⌘ K</kbd></div>
            <div className="top-actions"><span className={`sync-indicator ${online ? 'online' : 'offline'}`}><i />{online ? pendingSync ? `Sincronizando ${pendingSync}` : 'Sincronizado' : `${pendingSync} pendente(s)`}</span><button aria-label="Notificações">♢<i /></button><div className="avatar">IG</div><div className="user-copy"><b>{currentUser?.name ?? 'Igor'}</b><span>{currentUser?.role ?? 'Administrador'}</span></div></div>
          </div>
          <nav className={menuOpen ? 'top-navigation open' : 'top-navigation'} aria-label="Navegação principal">
            {navItems.map((item) => <button key={item.screen} className={`${screen === item.screen ? 'active' : ''} ${(['mapa','planejamento','operacional','campo'] as Screen[]).includes(item.screen) ? 'mobile-core' : 'desktop-extra'}`} onClick={() => go(item.screen)}><span>{item.icon}</span>{item.label}</button>)}
          </nav>
        </header>

        <main className="content">
          {screen === 'dashboard' && <Dashboard trialList={allTrials} activities={activities} schedule={schedule} harvests={harvests} activeHarvestId={activeHarvestId} onHarvest={switchHarvest} onNavigate={go} onFilter={openFiltered} onTrial={(trial) => { setSelectedTrial(trial); go('detalhe'); }} />}
          {screen === 'mapa' && <MapScreen harvestId={activeHarvestId} trialList={allTrials} activities={activities} schedule={schedule} onLocation={(locationId) => openFiltered({ locationId })} />}
          {screen === 'ensaios' && <TrialsScreen trialList={allTrials} activities={activities} schedule={schedule} context={viewContext} onClearContext={() => setViewContext({})} onNew={() => go('cadastros')} onTrial={(trial) => { setSelectedTrial(trial); go('detalhe'); }} />}
          {screen === 'planejamento' && <PlanningScreen trialList={allTrials} schedule={schedule} onActivity={openPlannedActivity} onReprogram={reprogramTrial} />}
          {screen === 'operacional' && <PhenologyActivityForm mode="operational" dynamicFields={activityFields} trialList={allTrials} activities={activities} schedule={schedule} onSave={saveActivity} defaultTrial={selectedTrial.id} selectedPlan={selectedPlan} />}
          {(screen === 'campo' || screen === 'atividade') && <PhenologyActivityForm mode="field" dynamicFields={activityFields} trialList={allTrials} activities={activities} schedule={schedule} onSave={saveActivity} defaultTrial={selectedTrial.id} selectedPlan={selectedPlan} />}
          {screen === 'historico' && <HistoryScreen activities={activities} onNew={() => go('campo')} />}
          {screen === 'resultados' && <ResultsScreen trialList={allTrials} activities={activities} schedule={schedule} />}
          {screen === 'cadastros' && <AdminRegistrationScreen registeredTrials={registeredTrials} trialList={allTrials} activities={activities} schedule={schedule} harvests={harvests} activeHarvestId={activeHarvestId} lastUpdated={lastUpdated} dynamicFields={activityFields} onDynamicFields={updateActivityFields} activityTemplates={activityTemplates} onActivityTemplates={updateActivityTemplates} onSave={saveFieldTrial} onImportDataset={importOperationalDataset} onImportUnified={importUnifiedPlanning} onCreatePlanning={createPlanningFromWizard} onAddLocation={addManagedLocation} onAddTrials={addManagedTrials} onCreateHarvest={createHarvest} onHarvestStatus={setHarvestStatus} onHarvest={switchHarvest} onFinalizeLayout={finalizeLayoutPlanning} onDeleteTrial={deleteManagedTrial} onDeleteLocation={deleteManagedLocation} />}
          {screen === 'usuarios' && <UsersScreen />}
          {screen === 'detalhe' && <TrialDetail trial={selectedTrial} activities={activities} schedule={schedule} onBack={() => go('ensaios')} onActivity={() => { setSelectedPlan(null); go('campo'); }} onPlannedActivity={openPlannedActivity} />}
        </main>
      </div>
      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  );
}

function Brand({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return <div className={`brand-mark ${light ? 'light' : ''} ${compact ? 'compact' : ''}`}><span>FW</span><div><strong>Field Wheat Testing</strong><small>Plataforma de gerenciamento operacional</small></div></div>;
}

function PageHead({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy: string; action?: React.ReactNode }) {
  return <div className="page-head"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{copy}</p></div>{action}</div>;
}

function Dashboard({ trialList, activities, schedule, harvests, activeHarvestId, onHarvest, onNavigate, onFilter, onTrial }: { trialList: Trial[]; activities: Activity[]; schedule: PlannedActivity[]; harvests: Harvest[]; activeHarvestId: string; onHarvest: (id: string) => void; onNavigate: (s: Screen) => void; onFilter: (context: ViewContext) => void; onTrial: (trial: Trial) => void }) {
  const [alertsOpen, setAlertsOpen] = useState(false);
  const criticalFieldAlerts: { id: string; locationId: string; type: string; detail: string; time: string; level: string }[] = [];
  const localityStages = locations.map((location) => ({ location, ...localityOverview(location.id, trialList, activities, schedule) })).filter((item) => item.localTrials.length > 0);
  const alertCountFor = (locationId: string) => criticalFieldAlerts.filter((alert) => alert.locationId === locationId).length;
  const qualityLocations: NetworkLocation[] = locations.map((location) => {
    const overview = localityOverview(location.id, trialList, activities, schedule);
    return overview.localTrials.length ? { ...location, qualityTone: overview.tone, qualityScore: overview.quality, plantedPercent: overview.plantedPercent, phenologicalStage: overview.stage, alertCount: alertCountFor(location.id) } : { ...location, qualityTone: 'neutral', plantedPercent: 0, phenologicalStage: 'Sem ensaios', alertCount: 0 };
  });
  const totalPlanted = trialList.filter((trial) => trial.sowing <= sourceSummary.importedAt).length;
  const plantedPercent = trialList.length ? Math.round((totalPlanted / trialList.length) * 100) : 0;
  const qualityByRegion = (region: string) => {
    const locationIds = new Set(locations.filter((location) => location.region === region).map((location) => location.id));
    const regionTrials = trialList.filter((trial) => locationIds.has(trial.locationId));
    return regionTrials.length ? Math.round(regionTrials.reduce((sum, trial) => sum + trialQuality(trial, activities).score, 0) / regionTrials.length) : 0;
  };
  const vcu1Quality = qualityByRegion('VCU_1');
  const vcu2Quality = qualityByRegion('VCU_2');
  const totalAlerts = criticalFieldAlerts.length;
  const phaseStatus = (locationId: string, stage: MacroStage, value: number) => {
    if (value >= 100) return { tone: 'finished', label: 'Finalizado' };
    if (value <= 0) return { tone: 'not-started', label: 'Não iniciado' };
    const localIds = new Set(trialList.filter((trial) => trial.locationId === locationId).map((trial) => trial.id));
    const matchesStage = (item: PlannedActivity) => stage === 'Semeadura'
      ? /seme|identifica|etiqueta/i.test(`${item.activity} ${item.category}`)
      : stage === 'Colheita'
        ? /colhe|pré-colhe/i.test(`${item.activity} ${item.category}`)
        : !/seme|identifica|etiqueta|colhe|pré-colhe/i.test(`${item.activity} ${item.category}`);
    const overdue = schedule.some((item) => localIds.has(item.trialId) && matchesStage(item) && item.status !== 'Concluído' && item.start < sourceSummary.importedAt);
    return overdue ? { tone: 'late', label: 'Em atraso' } : { tone: 'in-progress', label: 'Em andamento' };
  };
  const dateToIso = (value: string) => value.includes('/') ? value.split('/').reverse().join('-') : value.slice(0, 10);
  const recentActivities = [...activities].sort((a, b) => dateToIso(b.date).localeCompare(dateToIso(a.date))).slice(0, 2).reverse();
  const pending = schedule.filter((item) => item.status !== 'Concluído').sort((a, b) => Math.abs(daysBetween(sourceSummary.importedAt, a.start)) - Math.abs(daysBetween(sourceSummary.importedAt, b.start)));
  const currentPlan = pending[0];
  const nextPlans = currentPlan ? pending.filter((item) => item.id !== currentPlan.id && item.start >= currentPlan.start).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 2) : [];
  const doneState = (activity: Activity) => {
    const actual = dateToIso(activity.date);
    const plan = schedule.find((item) => item.id === activity.plannedId);
    return plan && actual > plan.end ? 'late' : 'ok';
  };
  const doneLate = recentActivities.filter((activity) => doneState(activity) === 'late').length;
  return <>
    <div className="dashboard-overview">
    <PageHead eyebrow={`${harvests.find((item) => item.id === activeHarvestId)?.name ?? 'Safra'} · visão operacional`} title="Visão geral operacional" copy="Implantação, qualidade e atividades de campo consolidadas por região e localidade." action={<div className="harvest-switch"><label>Safra<select value={activeHarvestId} onChange={(event) => onHarvest(event.target.value)}>{harvests.map((harvest) => <option key={harvest.id} value={harvest.id}>{harvest.name}{harvest.status === 'Encerrada' ? ' · encerrada' : ''}</option>)}</select></label><div className="dashboard-register-actions"><button className="secondary-button" onClick={() => onNavigate('operacional')}>⚒ Registro operacional</button><button className="primary-button" onClick={() => onNavigate('campo')}>✓ Registro de campo</button></div></div>} />
    <section className="dashboard-analytics">
      <button className="dashboard-chart-card seeded-chart" onClick={() => onFilter({})}><div className="dashboard-donut" style={{ background: `conic-gradient(#2f7450 0 ${plantedPercent}%,#e4e9e2 ${plantedPercent}% 100%)` }}><span><b>{plantedPercent}%</b><small>semeados</small></span></div><div><small>IMPLANTAÇÃO DA REDE</small><h2>{totalPlanted} de {trialList.length}</h2><p>ensaios já semeados</p></div><i>↗</i></button>
      <article className="dashboard-chart-card vcu-chart"><div className="chart-card-head"><div><small>QUALIDADE MÉDIA</small><h2>VCU I e VCU II</h2></div><span>0–100</span></div><div className="vcu-bars"><label><span><b>VCU I</b><em>{vcu1Quality}</em></span><i><u style={{ width: `${vcu1Quality}%` }} /></i></label><label><span><b>VCU II</b><em>{vcu2Quality}</em></span><i><u style={{ width: `${vcu2Quality}%` }} /></i></label></div></article>
      <button className="dashboard-chart-card alert-chart" aria-expanded={alertsOpen} onClick={() => setAlertsOpen(!alertsOpen)}><span className={totalAlerts ? 'alert-orb active' : 'alert-orb'} aria-hidden="true">🔔</span><div><small>NOTIFICAÇÕES GRAVES</small><h2>{totalAlerts}</h2><p><b>{new Set(criticalFieldAlerts.map((alert) => alert.locationId)).size}</b> localidades exigem conferência imediata</p></div><i>{alertsOpen ? '↑' : '↓'}</i></button>
    </section>
    {alertsOpen && <section className="card critical-alert-center"><div className="card-head"><div><span className="eyebrow">CENTRAL DE OCORRÊNCIAS</span><h2>Problemas graves em campo</h2><p>Somente erros operacionais que exigem conferência aparecem neste painel.</p></div><button className="text-button" onClick={() => setAlertsOpen(false)}>Fechar ×</button></div><div className="critical-alert-list">{criticalFieldAlerts.map((alert) => { const location = locations.find((item) => item.id === alert.locationId); return <button key={alert.id} onClick={() => onFilter({ locationId: alert.locationId })}><span className="critical-alert-icon">!</span><span><small>{alert.level} · {alert.time}</small><b>{alert.type}</b><p>{alert.detail}</p></span><span className="critical-alert-location"><small>LOCALIDADE</small><b>◎ {location?.name}</b><em>Ver ensaios →</em></span></button>; })}</div></section>}
    <section className="card dashboard-map-card">
      <div className="card-head"><div><h2>Localidades com ensaios em condução</h2><p>Visualização por satélite com implantação, estádio, qualidade e ocorrências graves por local.</p></div><button className="text-button" onClick={() => onNavigate('mapa')}>Abrir mapa completo →</button></div>
      <NetworkMap locations={qualityLocations} compact onSelect={(locationId) => onFilter({ locationId })} />
      <div className="map-legend quality-legend"><span><i className="excellent" />Excelente</span><span><i className="adequate" />Adequado</span><span><i className="attention" />Atenção</span><span><i className="critical" />Crítico</span><small>Passe o mouse para ver o resumo da área</small></div>
    </section>
    <section className="card locality-progress-card">
      <div className="card-head"><div><h2>Andamento por localidade</h2><p>Situação de cada etapa operacional e condição atual dos ensaios.</p></div><div className="phase-legend"><span><i className="not-started" />Não iniciado</span><span><i className="finished" />Finalizado</span><span><i className="in-progress" />Em andamento</span><span><i className="late" />Em atraso</span></div></div>
      <div className="locality-progress-table"><div className="locality-progress-head"><span>Localidade</span><span>Semeadura</span><span>Condução</span><span>Colheita</span><span>Estádio previsto</span><span>Qualidade</span><span>Alertas</span></div>{localityStages.map((item) => { const alerts = alertCountFor(item.location.id); const phases = ([['Semeadura',item.sowing],['Condução',item.conduction],['Colheita',item.harvest]] as const).map(([stage,value]) => ({ value, ...phaseStatus(item.location.id, stage, value) })); return <button key={item.location.id} onClick={() => onFilter({ locationId: item.location.id })}><span className="locality-name"><i className={item.tone} /><span><b>{item.location.name}</b><small>{item.localTrials.length} ensaios · {item.location.region.replace('_',' ')}</small></span></span>{phases.map((phase,index) => <span className={`phase-cell ${phase.tone}`} key={index}><i /><span><b>{phase.label}</b><small>{phase.value}%</small></span></span>)}<span className="stage-chip">{item.stage}</span><span className={`quality-cell ${item.tone}`}><b>{item.quality}</b><small>{item.tone === 'excellent' ? 'Excelente' : item.tone === 'adequate' ? 'Adequado' : item.tone === 'attention' ? 'Atenção' : 'Crítico'}</small></span><span className={alerts ? 'alert-cell active' : 'alert-cell'}>{alerts ? `! ${alerts}` : '✓ 0'}</span></button>; })}</div>
    </section>
    <section className="card operations-timeline-card"><div className="card-head"><div><h2>Linha do tempo das avaliações</h2><p>Duas últimas atividades, atividade atual mais próxima e as duas seguintes.</p></div><button className="text-button" onClick={() => onNavigate('planejamento')}>Ver calendário →</button></div><div className="timeline-status-summary"><span className={totalAlerts ? 'warning' : 'success'}><i>{totalAlerts ? '!' : '✓'}</i><b>{totalAlerts ? `${totalAlerts} alertas ativos` : 'Nenhum alerta ativo'}</b></span><span><i>✓</i><b>{recentActivities.length - doneLate} realizadas em dia</b></span><span className={doneLate ? 'warning' : ''}><i>↺</i><b>{doneLate} realizadas com atraso</b></span></div><div className="operations-timeline">
      {recentActivities.map((activity) => { const state = doneState(activity); const trial = trialList.find((item) => item.id === activity.trial); return <article className="timeline-event past" key={`done-${activity.id}`}><span className="timeline-point">✓</span><small>ÚLTIMA REALIZADA</small><time>{activity.date}</time><h3>{activity.macroStage ?? activity.type}</h3><p>{activity.locationId ? locations.find((location) => location.id === activity.locationId)?.name : trial?.place ?? activity.trial}</p><em className={`timeline-status ${state}`}>{state === 'late' ? 'Realizada com atraso' : 'Realizada em dia'}</em></article>; })}
      {currentPlan && <TimelinePlan item={currentPlan} label="ATUAL MAIS PRÓXIMA" trialList={trialList} onTrial={onTrial} />}
      {nextPlans.map((item, index) => <TimelinePlan key={item.id} item={item} label={`PRÓXIMA ${index + 1}`} trialList={trialList} onTrial={onTrial} />)}
    </div></section>
    </div>
  </>;
}

function TimelinePlan({ item, label, trialList, onTrial }: { item: PlannedActivity; label: string; trialList: Trial[]; onTrial: (trial: Trial) => void }) {
  const trial = trialList.find((entry) => entry.id === item.trialId);
  const late = item.start < sourceSummary.importedAt;
  return <button className={`timeline-event ${late ? 'late' : 'next'}`} onClick={() => trial && onTrial(trial)}><span className="timeline-point">{late ? '!' : '○'}</span><small>{label}</small><time>{formatDate(item.start)}</time><h3>{item.activity}</h3><p>{trial?.place ?? item.trialId} · {trial ? macroGroupFor(trial) : 'Ensaios'}</p><em className={`timeline-status ${late ? 'late' : 'planned'}`}>{late ? 'Alerta de atraso' : 'Programada'}</em></button>;
}

function MacroProgress({ value }: { value: number }) {
  return <span className="macro-progress"><span><i style={{ width: `${value}%` }} /></span><b>{value}%</b></span>;
}

function MapScreen({ harvestId, trialList, activities, schedule, onLocation }: { harvestId: string; trialList: Trial[]; activities: Activity[]; schedule: PlannedActivity[]; onLocation: (locationId: string) => void }) {
  const [selected, setSelected] = useState(locations[0]?.id ?? '');
  const [layoutOpen, setLayoutOpen] = useState(false);
  const current = locations.find((location) => location.id === selected) ?? locations[0];
  if (!current) return <><PageHead eyebrow="Consulta geográfica" title="Mapa da rede" copy="Visualização das áreas cadastradas pela equipe de gerenciamento." /><section className="card no-results"><span>⌖</span><h2>Nenhuma área cadastrada</h2><p>Um administrador pode cadastrar a primeira área em Gerenciamento → Cadastro de local.</p></section></>;
  const localTrials = trialList.filter((trial) => trial.locationId === current.id);
  const qualityLocations: NetworkLocation[] = locations.map((location) => { const scores = trialList.filter((trial) => trial.locationId === location.id).map((trial) => trialQuality(trial, activities).score); if (!scores.length) return { ...location, qualityTone: 'neutral' }; const score = Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length); return { ...location, qualityTone: qualityTone(score), qualityScore: score }; });
  const overview = localityOverview(current.id, trialList, activities, schedule);
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${current.lat},${current.lng}`;
  const wazeUrl = `https://www.waze.com/ul?ll=${current.lat},${current.lng}&navigate=yes`;
  return <><PageHead eyebrow="Consulta geográfica" title="Mapa da rede" copy="Mapa somente para visualização. Cadastros e alterações ficam protegidos no módulo Gerenciamento." />
    <section className="mobile-location-strip" aria-label="Acesso rápido aos locais">{locations.map((location) => <button className={location.id === current.id ? 'active' : ''} key={location.id} onClick={() => setSelected(location.id)}><b>{location.name}</b><small>{location.city}</small></button>)}</section>
    <section className="map-layout"><div className="card map-full"><NetworkMap locations={qualityLocations} onSelect={setSelected} /><div className="map-legend floating quality-legend"><span><i className="excellent" />Excelente</span><span><i className="adequate" />Adequado</span><span><i className="attention" />Atenção</span><span><i className="critical" />Crítico</span></div></div>
      <aside className="card location-panel"><div className="selected-location-heading"><span><small>ÁREA SELECIONADA</small><b>{current.id}</b></span><button className="secondary-button" onClick={() => setLayoutOpen(true)}>▦ Abrir Croqui</button></div><h2>{current.name}</h2><p>{current.city} · Rio Grande do Sul</p><div className="route-actions"><a href={googleMapsUrl} target="_blank" rel="noreferrer">Google Maps</a><a href={wazeUrl} target="_blank" rel="noreferrer">Waze</a></div><div className="location-metrics"><div><b>{overview.plantedPercent}%</b><span>semeado</span></div><div><b>{overview.quality}</b><span>qualidade</span></div></div><div className="selected-stage"><small>ESTÁDIO PREDOMINANTE</small><b>{overview.stage}</b></div><div className="location-macro"><label>Semeadura <MacroProgress value={overview.sowing} /></label><label>Condução <MacroProgress value={overview.conduction} /></label><label>Colheita <MacroProgress value={overview.harvest} /></label></div><hr /><h3>Grupos em campo</h3><div className="group-chips">{overview.groups.map((group) => <span key={group}>{group}</span>)}</div><h3>Ensaios e qualidade</h3>{localTrials.slice(0, 4).map((trial) => { const quality = trialQuality(trial, activities); return <div className="mini-trial quality-mini" key={trial.id}><i className={quality.tone} /><span>{trial.name}</span><b>{trial.areaCategory || trial.subtype || macroGroupFor(trial)}</b><small>{quality.label} · {quality.score}{trial.lostPlots?.length ? ` · ${trial.lostPlots.length} perdida(s)` : ''}</small></div>; })}{localTrials.length === 0 && <p className="empty-copy">Nenhum ensaio vinculado a esta área.</p>}<button className="secondary-button location-action" onClick={() => onLocation(current.id)} disabled={localTrials.length === 0}>Ver lista de ensaios →</button><small className="coordinates">{current.lat.toFixed(4)}, {current.lng.toFixed(4)}</small></aside>
    </section>{layoutOpen && <FieldLayoutMap readOnly harvestId={harvestId} location={current} trials={localTrials} onClose={() => setLayoutOpen(false)} />}</>;
}

function NewAreaDialog({ harvestName, onClose, onSubmit }: { harvestName: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [areaCode, setAreaCode] = useState('');
  const year = harvestName.match(/\d{4}/)?.[0] ?? String(new Date().getFullYear());
  const generatedName = `${areaCode.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '')}${year.slice(-2)}`;
  return <div className="new-area-modal" role="dialog" aria-modal="true" aria-label="Nova área por croqui"><button className="layout-backdrop" onClick={onClose} aria-label="Fechar" /><form className="new-area-dialog" onSubmit={onSubmit}><header><div><span>NOVA IMPLANTAÇÃO</span><h2>Criar área pelo croqui</h2><p>O nome será gerado automaticamente pelo código da área e pela safra.</p></div><button type="button" onClick={onClose}>×</button></header><div className="new-area-fields"><label>Código da área<input name="code" value={areaCode} onChange={(event) => setAreaCode(event.target.value)} required placeholder="Ex.: PF01" /></label><div className="generated-area-name"><small>NOME AUTOMÁTICO</small><b>{generatedName || `CODIGO${year.slice(-2)}`}</b><span>{harvestName}</span></div><label>Cidade<input name="city" required placeholder="Ex.: Passo Fundo" /></label><div><label>Latitude inicial<input name="lat" type="number" step="any" defaultValue="-28.2625" /></label><label>Longitude inicial<input name="lng" type="number" step="any" defaultValue="-52.4083" /></label></div></div><footer><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button">Abrir posicionamento do croqui</button></footer></form></div>;
}

function TrialsScreen({ trialList, activities, schedule, context, onClearContext, onTrial, onNew }: { trialList: Trial[]; activities: Activity[]; schedule: PlannedActivity[]; context: ViewContext; onClearContext: () => void; onTrial: (trial: Trial) => void; onNew: () => void }) {
  const [query, setQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState(context.locationId ?? 'Todos');
  const [qualityFilter, setQualityFilter] = useState('Todas');
  const [trialNameFilter, setTrialNameFilter] = useState('Todos');
  const fieldIsLate = (trial: Trial) => {
    const field = trial.fieldName || trial.locationId;
    const fieldTrialIds = new Set(trialList.filter((item) => (item.fieldName || item.locationId) === field).map((item) => item.id));
    return schedule.some((item) => fieldTrialIds.has(item.trialId) && item.start < sourceSummary.importedAt && item.status !== 'Concluído');
  };
  const filtered = trialList.filter((trial) => {
    const quality = trialQuality(trial, activities);
    const matchesContext = !context.operational || (context.operational === 'late' ? fieldIsLate(trial) : !fieldIsLate(trial));
    return matchesContext && (locationFilter === 'Todos' || trial.locationId === locationFilter) && (qualityFilter === 'Todas' || quality.label === qualityFilter) && (trialNameFilter === 'Todos' || trial.name === trialNameFilter) && `${trial.name} ${trial.id} ${trial.place} ${trial.fieldName ?? ''}`.toLowerCase().includes(query.toLowerCase());
  });
  return <><PageHead eyebrow="Safra 2026 · Dataverse" title="Ensaios" copy={`${trialList.length} ensaios disponíveis, com protocolos, parcelas, responsáveis e andamento.`} action={<button className="primary-button" onClick={onNew}>＋ Novo campo e ensaio</button>} />
    {(context.locationId || context.operational) && <div className="active-context"><span>Filtro aplicado:</span><b>{context.locationId ? locations.find((location) => location.id === context.locationId)?.name : context.operational === 'late' ? 'Campos em atraso' : 'Campos em dia'}</b><button onClick={() => { setLocationFilter('Todos'); onClearContext(); }}>× Limpar</button></div>}
    <section className="toolbar"><label className="filter-search">⌕<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar ensaio ou campo" /></label><label className="filter-select">Nome do ensaio<select value={trialNameFilter} onChange={(event) => setTrialNameFilter(event.target.value)}><option>Todos</option>{[...new Set(trialList.map((trial) => trial.name))].sort().map((name) => <option key={name}>{name}</option>)}</select></label><label className="filter-select">Localidade<select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}><option>Todos</option>{locations.map((location) => <option value={location.id} key={location.id}>{location.name}</option>)}</select></label><label className="filter-select">Qualidade<select value={qualityFilter} onChange={(event) => setQualityFilter(event.target.value)}><option>Todas</option><option>Excelente</option><option>Adequado</option><option>Atenção</option><option>Crítico</option></select></label></section>
    <section className="quality-scale"><span><i className="excellent" />Excelente</span><span><i className="adequate" />Adequado</span><span><i className="attention" />Atenção</span><span><i className="critical" />Crítico</span><small>A cor representa qualidade, não situação operacional.</small></section>
    <section className="trial-grid">{filtered.map((trial) => { const quality = trialQuality(trial, activities); return <button className={`trial-card quality-card ${quality.tone}`} key={trial.id} onClick={() => onTrial(trial)}><div className="trial-card-top"><span>{trial.areaCategory ?? trial.type}</span><QualityBadge trial={trial} activities={activities} /></div><h2>{trial.name}</h2><p>◎ {trial.place} · RS{trial.fieldName ? ` · ${trial.fieldName}` : ''}</p>{quality.alerts.length > 0 && <div className="trial-alert-preview"><b>! {quality.alerts.length} alerta(s) · −{quality.penalty}%</b><small>{quality.alerts.slice(0,2).map((alert) => `${alert.alertCategory}${alert.plotIds?.length ? ` · PlotID ${alert.plotIds.join(', ')}` : ''}`).join(' | ')}</small></div>}<div className="trial-stats"><span><b>{trial.plots.toLocaleString('pt-BR')}</b> parcelas</span><span><b>{phenologicalStage(trial)}</b> estádio</span></div>{Boolean(trial.issueCount) && <div className="trial-issue-summary"><b>{trial.issueCount} alerta(s) de implantação</b>{Boolean(trial.lostPlots?.length) && <small>Parcelas perdidas: {trial.lostPlots?.join(', ')}</small>}{Boolean(trial.layoutPenalty) && <small>Impacto na qualidade: -{trial.layoutPenalty} pontos</small>}</div>}<div className="progress quality-progress"><i style={{ width: `${quality.score}%` }} /></div><div className="next-action"><small>PRÓXIMA AÇÃO · {formatDate(trial.nextDate)}</small><b>{trial.next}</b></div></button>; })}</section>
    {filtered.length === 0 && <section className="card no-results"><span>◇</span><h2>Nenhum ensaio neste recorte</h2><p>Limpe um dos filtros para ampliar a visualização.</p></section>}
  </>;
}

function PlanningScreen({ trialList, schedule, onActivity, onReprogram }: { trialList: Trial[]; schedule: PlannedActivity[]; onActivity: (item: PlannedActivity) => void; onReprogram: (trialId: string, date: string) => void }) {
  const [month, setMonth] = useState(8);
  const [trialFilter, setTrialFilter] = useState('Todas');
  const [reprogramTrial, setReprogramTrial] = useState<string>(trialList[0]?.id ?? '');
  const [actualSowing, setActualSowing] = useState<string>(trialList[0]?.sowing ?? '');
  const monthDate = new Date(2026, month, 1);
  const firstMondayOffset = (monthDate.getDay() + 6) % 7;
  const gridStart = new Date(2026, month, 1 - firstMondayOffset);
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
  const areaCategories = [...new Set(schedule.map((item) => item.areaCategory).filter(Boolean))] as string[];
  const events = schedule.filter((item) => trialFilter === 'Todas' || item.areaCategory === trialFilter);
  const upcoming = [...events].filter((item) => item.status !== 'Concluído').sort((a,b) => a.start.localeCompare(b.start)).slice(0, 8);
  const monthLabel = monthDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return <><PageHead eyebrow="Agenda operacional" title="Calendário da safra" copy="Clique em uma atividade para abrir o registro já parametrizado." action={<button className="secondary-button">Exportar planejamento</button>} />
    <section className="planning-tools card"><div><label>Filtrar categoria da área<select value={trialFilter} onChange={(event) => setTrialFilter(event.target.value)}><option>Todas</option>{areaCategories.map((category) => <option key={category}>{category}</option>)}</select></label></div><div className="calendar-legend"><span><i className="operational" />Registro operacional</span><span><i className="field" />Registro de campo</span><span><i className="done" />Concluído</span><span><i className="revised" />Reprogramado</span></div></section>
    <section className="mobile-planning-list">{upcoming.map((item) => { const location = locations.find((entry) => entry.id === item.locationId) ?? locations.find((entry) => trialList.find((trial) => trial.id === item.trialId)?.locationId === entry.id); return <article className="card" key={`mobile-${item.id}`}><span><small>{item.areaCategory ?? 'Área'} · {formatDate(item.start)}</small><b>{item.activity}</b><em>{location?.name}</em></span><div>{location && <><a href={`https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`} target="_blank" rel="noreferrer">Ir para área</a><a href={`https://www.waze.com/ul?ll=${location.lat},${location.lng}&navigate=yes`} target="_blank" rel="noreferrer">Waze</a></>}<button onClick={() => onActivity(item)}>Registrar</button></div></article>; })}</section>
    <section className="card calendar-card"><header><button onClick={() => setMonth((value) => Math.max(4, value - 1))}>‹</button><h2>{monthLabel}</h2><button onClick={() => setMonth((value) => Math.min(10, value + 1))}>›</button></header><div className="calendar-weekdays">{['SEG','TER','QUA','QUI','SEX','SÁB','DOM'].map((day) => <b key={day}>{day}</b>)}</div><div className="calendar-grid">{days.map((date) => { const iso = date.toISOString().slice(0, 10); const dayEvents = events.filter((item) => item.start === iso).slice(0, 4); return <div className={`calendar-day ${date.getMonth() !== month ? 'outside' : ''} ${iso === sourceSummary.importedAt ? 'today' : ''}`} key={iso}><span>{date.getDate()}</span>{dayEvents.map((item) => <button key={item.id} className={`calendar-event ${activityStreamFor(item)} ${item.status === 'Concluído' ? 'done' : item.version > 1 ? 'revised' : ''}`} onClick={() => onActivity(item)} title={`${item.areaCategory ?? 'Área'} · ${item.activity}`}><b>{item.activity}</b><small>{item.areaCategory ?? item.trialId.replace('ENS2026_', '#')}</small></button>)}</div>; })}</div></section>
    <section className="card reprogram-panel"><div><span className="eyebrow">AUTOMAÇÃO SIMULADA</span><h2>Atualizar pela semeadura real</h2><p>As atividades ainda abertas são reposicionadas pelo mesmo número de dias, mantendo a data original e a versão do cronograma.</p></div><div className="reprogram-fields"><label>Ensaio<select value={reprogramTrial} onChange={(event) => { const id = event.target.value; setReprogramTrial(id); setActualSowing(trialList.find((trial) => trial.id === id)?.sowing ?? ''); }}>{trialList.map((trial) => <option key={trial.id}>{trial.id}</option>)}</select></label><label>Semeadura real<input type="date" value={actualSowing} onChange={(event) => setActualSowing(event.target.value)} /></label><button className="primary-button" onClick={() => onReprogram(reprogramTrial, actualSowing)}>Recalcular cronograma</button></div></section>
  </>;
}

function ActivityForm({ trialList, onSave, defaultTrial, selectedPlan }: { trialList: Trial[]; onSave: (event: FormEvent<HTMLFormElement>) => void; defaultTrial: string; selectedPlan: PlannedActivity | null }) {
  const defaultLocation = trialList.find((trial) => trial.id === (selectedPlan?.trialId ?? defaultTrial))?.locationId ?? locations[0].id;
  const [locationId, setLocationId] = useState(defaultLocation);
  const [scope, setScope] = useState<'Área total' | 'Grupo específico'>('Grupo específico');
  const [macroGroup, setMacroGroup] = useState<MacroGroup>(macroGroupFor(trialList.find((trial) => trial.id === (selectedPlan?.trialId ?? defaultTrial)) ?? trialList[0]));
  const [macroStage, setMacroStage] = useState<MacroStage>(selectedPlan?.category === 'Colheita' ? 'Colheita' : /seme|implanta|identifica|etiqueta/i.test(`${selectedPlan?.activity ?? ''} ${selectedPlan?.category ?? ''}`) ? 'Semeadura' : 'Condução');
  const [quality, setQuality] = useState({ uniformity: 4, weeds: 2, disease: 2 });
  const [photoNames, setPhotoNames] = useState<string[]>([]);
  const score = qualityFrom(quality);
  const checks: Record<MacroStage, string[]> = {
    Semeadura: ['Área e solo conferidos', 'Sementes e tratamentos conferidos', 'Regulagem e profundidade verificadas', 'Identificação e croqui instalados'],
    Condução: ['Estádio fenológico confirmado', 'Daninhas avaliadas', 'Pragas e doenças avaliadas', 'Manejo executado conforme protocolo', 'Fotos gerais e de detalhe registradas'],
    Colheita: ['Umidade e maturação conferidas', 'Parcelas aptas demarcadas', 'Equipamento limpo e regulado', 'Pesagem e identificação conferidas'],
  };
  return <><PageHead eyebrow="Diário de campo · Fluxo macro" title="Registrar atividade" copy="Escolha o local, defina a abrangência e conclua os checks operacionais com evidências." />
    <form className="activity-layout" onSubmit={onSave}>{selectedPlan && <section className="activity-context"><div><span>ATIVIDADE PLANEJADA</span><b>{selectedPlan.activity}</b><small>{selectedPlan.trialId} · {formatDate(selectedPlan.start)} · versão {selectedPlan.version}</small></div><Status kind={selectedPlan.version > 1 ? 'attention' : 'ok'}>{selectedPlan.version > 1 ? 'Reprogramada' : 'No prazo'}</Status></section>}<input type="hidden" name="plannedId" value={selectedPlan?.id ?? ''} />
      <section className="card form-card macro-form-card"><div className="section-number">01</div><div><h2>Local e abrangência</h2><p>Primeiro defina onde o registro será aplicado.</p></div><div><div className="form-grid"><label>Localidade<select name="locationId" value={locationId} onChange={(event) => setLocationId(event.target.value)}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label><label>Data da atividade<input name="date" type="date" defaultValue={selectedPlan?.start ?? sourceSummary.importedAt} required /></label></div><div className="scope-choice"><label><input type="radio" name="scope" value="Área total" checked={scope === 'Área total'} onChange={() => setScope('Área total')} /><span><b>Área total</b><small>Registro válido para toda a localidade</small></span></label><label><input type="radio" name="scope" value="Grupo específico" checked={scope === 'Grupo específico'} onChange={() => setScope('Grupo específico')} /><span><b>Somente um grupo</b><small>Ensaios, coleção, founder ou multiqualidades</small></span></label></div>{scope === 'Grupo específico' && <div className="macro-group-choice">{(['Ensaios','Coleção','Founder','Multiqualidades'] as MacroGroup[]).map((group) => <label key={group}><input type="radio" name="macroGroup" value={group} checked={macroGroup === group} onChange={() => setMacroGroup(group)} /><span>{group}</span></label>)}</div>}<input type="hidden" name="macroGroup" value={macroGroup} /></div></section>
      <section className="card form-card macro-form-card"><div className="section-number">02</div><div><h2>Etapa operacional</h2><p>O protocolo e os checks acompanham a etapa escolhida.</p></div><div><div className="macro-stage-choice">{(['Semeadura','Condução','Colheita'] as MacroStage[]).map((stage) => <label key={stage}><input type="radio" name="macroStage" value={stage} checked={macroStage === stage} onChange={() => setMacroStage(stage)} /><span><i>{stage === 'Semeadura' ? '◉' : stage === 'Condução' ? '✦' : '◆'}</i><b>{stage}</b></span></label>)}</div><div className="checklist"><h3>Checks obrigatórios de {macroStage.toLowerCase()}</h3>{checks[macroStage].map((check) => <label key={check}><input type="checkbox" name="checks" value={check} required /><span>✓</span>{check}</label>)}</div><div className="form-grid management-fields"><label>Estádio fenológico observado<input name="stage" placeholder="Ex.: Perfilhamento / Z2.3" /></label><label>Produto ou insumo<input name="product" placeholder="Se aplicável" /></label><label>Dose / regulagem<input name="dose" placeholder="Ex.: 0,75 L/ha" /></label><label>Condição da operação<select name="condition"><option>Conforme planejado</option><option>Executado com ressalva</option><option>Não executado</option></select></label></div></div></section>
      <section className="card form-card macro-form-card"><div className="section-number">03</div><div><h2>Evidências e qualidade</h2><p>Registre fotos do andamento e a condição observada no campo.</p></div><div><label className="photo-drop"><input name="photos" type="file" accept="image/*" multiple capture="environment" onChange={(event) => setPhotoNames(Array.from(event.target.files ?? []).map((file) => file.name))} /><span>▧</span><b>Adicionar fotos da cultura</b><small>Câmera ou galeria · visão geral e detalhes dos checks</small></label>{photoNames.length > 0 && <div className="photo-file-list">{photoNames.map((name) => <span key={name}>✓ {name}</span>)}</div>}<div className="parameter-grid"><QualityRange name="uniformity" label="Uniformidade" value={quality.uniformity} positive onChange={(value) => setQuality({ ...quality, uniformity: value })} /><QualityRange name="weeds" label="Pressão de daninhas" value={quality.weeds} onChange={(value) => setQuality({ ...quality, weeds: value })} /><QualityRange name="disease" label="Severidade de doenças" value={quality.disease} onChange={(value) => setQuality({ ...quality, disease: value })} /></div><div className={`quality-preview quality-${score.label.toLowerCase().replace('í','i').replace('ç','c')}`}><span>Classificação calculada</span><b>{score.score}<small>/100</small></b><em>{score.label}</em></div><label className="full notes-field">Observações<textarea name="notes" rows={4} placeholder="Condições, desvios, decisões e recomendações para a próxima visita…" /></label></div></section>
      <section className="form-actions"><span>Nesta demonstração, os dados ficam salvos neste navegador.</span><div><button type="reset" className="secondary-button">Limpar</button><button type="submit" className="primary-button">✓ Salvar e concluir</button></div></section></form>
  </>;
}

function visitFromPlan(plan?: PlannedActivity | null): PhenologyVisit {
  const value = `${plan?.activity ?? ''} ${plan?.category ?? ''}`.toLowerCase();
  if (/matur|colhe/.test(value)) return 'Maturidade';
  if (value.includes('enchimento')) return 'Enchimento de grão';
  if (/espig|doença|sanit|fungicida/.test(value)) return 'Espigamento';
  if (value.includes('emborrach')) return 'Emborrachamento';
  if (value.includes('along')) return 'Alongamento';
  if (/perfilh|estabelecimento|daninha|capina/.test(value)) return 'Perfilhamento';
  return 'Semeadura';
}

function activityStreamFor(plan?: PlannedActivity | null): ActivityStream {
  const value = `${plan?.activity ?? ''} ${plan?.category ?? ''}`.toLowerCase();
  return /seme|plantio|fungic|herbic|pulver|adub|fertiliz|colhe|irrig|aplica/.test(value) ? 'operational' : 'field';
}

function PhenologyActivityForm({ trialList, activities, schedule, onSave, defaultTrial, selectedPlan, mode, dynamicFields }: { trialList: Trial[]; activities: Activity[]; schedule: PlannedActivity[]; onSave: (event: FormEvent<HTMLFormElement>) => void; defaultTrial: string; selectedPlan: PlannedActivity | null; mode: ActivityStream; dynamicFields: DynamicField[] }) {
  const defaultLocation = selectedPlan?.locationId ?? trialList.find((trial) => trial.id === (selectedPlan?.trialId ?? defaultTrial))?.locationId ?? locations[0]?.id ?? '';
  const [locationId, setLocationId] = useState(defaultLocation);
  const initialPlan = selectedPlan && activityStreamFor(selectedPlan) === mode ? selectedPlan : schedule.find((item) => item.status !== 'Concluído' && activityStreamFor(item) === mode && (item.locationId === defaultLocation || trialList.find((trial) => trial.id === item.trialId)?.locationId === defaultLocation)) ?? null;
  const [activePlanId, setActivePlanId] = useState(initialPlan?.id ?? '');
  const [visitStage, setVisitStage] = useState<PhenologyVisit>(visitFromPlan(initialPlan));
  const [visitDate, setVisitDate] = useState(initialPlan?.start ?? sourceSummary.importedAt);
  const [quality, setQuality] = useState({ establishment: 4, uniformity: 4, weeds: 2, disease: 1 });
  const [groupRatings, setGroupRatings] = useState<Record<string, { score: number; condition: string; notes: string }>>({});
  const [checkedItems, setCheckedItems] = useState<string[]>([]);
  const [adverseScope, setAdverseScope] = useState('');
  const [adverseGroup, setAdverseGroup] = useState<MacroGroup>('Ensaios');
  const [adverseTrial, setAdverseTrial] = useState('');
  const localTrials = trialList.filter((trial) => trial.locationId === locationId);
  const availablePlans = schedule.filter((item) => item.status !== 'Concluído' && activityStreamFor(item) === mode && (item.locationId === locationId || localTrials.some((trial) => trial.id === item.trialId))).sort((a,b) => a.start.localeCompare(b.start));
  const activePlan = schedule.find((item) => item.id === activePlanId) ?? null;
  const activeAreaCategory = activePlan?.areaCategory ?? localTrials[0]?.areaCategory ?? localTrials[0]?.type ?? 'Ensaios';
  const categoryTrials = localTrials.filter((trial) => (trial.areaCategory ?? trial.type) === activeAreaCategory);
  const installedGroups = [...new Set(categoryTrials.map(macroGroupFor))];
  const visitOrder: PhenologyVisit[] = ['Semeadura','Perfilhamento','Alongamento','Emborrachamento','Espigamento','Enchimento de grão','Maturidade'];
  const protocols: Record<PhenologyVisit, { focus: string; checks: string[] }> = {
    Semeadura: { focus: 'Implantação, regulagem e identificação da área', checks: ['Área, solo e croqui conferidos','Sementes e tratamentos conferidos','Regulagem, densidade e profundidade verificadas','Parcelas e grupos identificados'] },
    Perfilhamento: { focus: 'Estabelecimento, uniformidade e pressão inicial de daninhas', checks: ['Foi semeado o enchimento da área','Estabelecimento da cultura avaliado','Uniformidade das plantas avaliada','Pressão e causa das plantas daninhas registradas'] },
    Alongamento: { focus: 'Correções da visita anterior e organização dos ensaios', checks: ['Controle de daninhas conferido quando necessário','Bandeiramento dos ensaios realizado','Corredores limpos e acessíveis','Necessidade de roçagem avaliada'] },
    Emborrachamento: { focus: 'Condição geral, nutrição e preparação sanitária', checks: ['Estádio confirmado em campo','Acamamento e vigor avaliados','Manejo previsto conferido','Condição geral de cada grupo registrada'] },
    Espigamento: { focus: 'Estado sanitário e início do acompanhamento de doenças', checks: ['Incidência de oídio avaliada','Ferrugens avaliadas','Manchas foliares avaliadas','Uniformidade de espigamento registrada'] },
    'Enchimento de grão': { focus: 'Sanidade, enchimento e evolução geral do campo', checks: ['Persistência de doenças avaliada','Enchimento e uniformidade registrados','Danos, falhas e acamamento conferidos','Visão geral de cada grupo registrada'] },
    Maturidade: { focus: 'Condição final do campo e aptidão para colheita', checks: ['Maturidade e umidade conferidas','Parcelas aptas demarcadas','Perdas e acamamento avaliados','Sequência de colheita confirmada'] },
  };
  const activityName = activePlan?.activity ?? '';
  const activityChecks = mode === 'operational'
    ? /seme|plantio/i.test(activityName)
      ? ['Área, solo e croqui conferidos','Sementes e tratamentos conferidos','Regulagem, densidade e profundidade verificadas','Parcelas e grupos identificados']
      : /fungic|pulver/i.test(activityName)
        ? ['Produto e lote conferidos','Dose e volume de calda conferidos','Condição climática registrada','Aplicação concluída na área prevista']
        : /adub|fertiliz/i.test(activityName)
          ? ['Fonte e lote do adubo conferidos','Dose e regulagem conferidas','Distribuição uniforme verificada','Aplicação concluída na área prevista']
          : /colhe/i.test(activityName)
            ? ['Maturidade e umidade conferidas','Parcelas aptas demarcadas','Equipamento limpo e regulado','Pesagem e identificação conferidas']
            : ['Ordem operacional conferida','Insumos e equipamento conferidos','Execução concluída na área prevista']
    : /etiquet|identifica/i.test(activityName)
      ? ['Identificação dos ensaios conferida','Etiquetas instaladas e legíveis','Itens faltantes repostos']
      : /roç|corredor/i.test(activityName)
        ? ['Necessidade de roçagem confirmada','Corredores e acessos liberados','Roçagem concluída sem dano às parcelas']
        : protocols[visitStage].checks.filter((check) => check !== 'Foi semeado o enchimento da área');
  const latestWeedEvent = activities.find((activity) => (activity.locationId === locationId || localTrials.some((trial) => trial.id === activity.trial)) && (Number(activity.details?.daninhas ?? 0) >= 3 || activity.details?.controle_daninhas));
  const pendingWeedControl = Boolean(latestWeedEvent && Number(latestWeedEvent.details?.daninhas ?? 0) >= 3 && latestWeedEvent.details?.controle_daninhas !== 'Sim, controle confirmado');
  const ratingFor = (group: MacroGroup) => groupRatings[group] ?? { score: 4, condition: 'Adequado', notes: '' };
  const updateGroup = (group: MacroGroup, update: Partial<{ score: number; condition: string; notes: string }>) => setGroupRatings((current) => ({ ...current, [group]: { ...ratingFor(group), ...update } }));
  const fieldQuality = qualityFrom(quality);
  const combinedScore = fieldQuality.score;
  const combined = { score: combinedScore, label: combinedScore >= 85 ? 'Excelente' : combinedScore >= 70 ? 'Adequado' : combinedScore >= 50 ? 'Atenção' : 'Crítico' };
  const macroStage: MacroStage = visitStage === 'Semeadura' ? 'Semeadura' : visitStage === 'Maturidade' ? 'Colheita' : 'Condução';
  const assessments = JSON.stringify(Object.fromEntries(installedGroups.map((group) => [group, ratingFor(group)])));
  const showDisease = visitStage === 'Espigamento' || visitStage === 'Enchimento de grão';
  const activeDynamicFields = dynamicFields.filter((field) => (field.entity === mode || field.entity === 'both') && (mode === 'field' ? field.visibleField : field.visibleOperational));

  return <><PageHead eyebrow={mode === 'operational' ? 'Execução · Manejo e implantação' : 'Inspeção · Acompanhamento de campo'} title={mode === 'operational' ? 'Registro operacional' : 'Registro de campo'} copy={mode === 'operational' ? 'Registre semeadura, aplicações, adubação e demais operações previstas.' : 'Registre inspeções, etiquetagem, roçagem e avaliações da cultura.'} />
    <form className="activity-layout phenology-activity" onSubmit={onSave}>
      {activePlan && <section className="activity-context"><div><span>VISITA PREVISTA NO PLANEJAMENTO</span><b>{activePlan.activity}</b><small>{activePlan.trialId} · {formatDate(activePlan.start)} · versão {activePlan.version}</small></div><Status kind={activePlan.start < sourceSummary.importedAt ? 'attention' : 'ok'}>{activePlan.start < sourceSummary.importedAt ? 'Em atraso' : 'No prazo'}</Status></section>}
      <input type="hidden" name="plannedId" value={activePlan?.id ?? ''} /><input type="hidden" name="recordStream" value={mode} /><input type="hidden" name="baseScope" value="Categoria da área" /><input type="hidden" name="areaCategory" value={activeAreaCategory} /><input type="hidden" name="baseMacroGroup" value={installedGroups[0] ?? groupFromCategory(activeAreaCategory)} /><input type="hidden" name="macroStage" value={macroStage} /><input type="hidden" name="visitStage" value={visitStage} /><input type="hidden" name="groupAssessments" value={assessments} /><input type="hidden" name="calculatedQualityScore" value={combined.score} />

      <section className="card visit-header"><div className="form-grid"><label>Localidade<select name="locationId" value={locationId} onChange={(event) => { const nextLocation = event.target.value; const nextPlan = schedule.find((item) => item.status !== 'Concluído' && activityStreamFor(item) === mode && (item.locationId === nextLocation || trialList.find((trial) => trial.id === item.trialId)?.locationId === nextLocation)); setLocationId(nextLocation); setActivePlanId(nextPlan?.id ?? ''); setVisitStage(visitFromPlan(nextPlan)); setVisitDate(nextPlan?.start ?? sourceSummary.importedAt); setGroupRatings({}); setCheckedItems([]); }}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label><label>Atividade planejada por categoria<select value={activePlanId} required onChange={(event) => { const plan = schedule.find((item) => item.id === event.target.value); setActivePlanId(event.target.value); setVisitStage(visitFromPlan(plan)); setVisitDate(plan?.start ?? sourceSummary.importedAt); setCheckedItems([]); }}><option value="">Selecione</option>{availablePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.areaCategory ?? 'Área'} · {plan.activity} · {formatDate(plan.start)}</option>)}</select></label><label>Data realizada<input name="date" type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} required /></label></div><div className="visit-summary"><span><b>{activeAreaCategory}</b><small>categoria da atividade</small></span><span><b>{categoryTrials.length}</b><small>ensaios abrangidos</small></span><span><b>{availablePlans.length}</b><small>atividades abertas</small></span></div></section>

      <section className="card form-card visit-stage-card"><div className="section-number">01</div><div><h2>Roteiro previsto</h2><p>A fase e os itens vêm do planejamento e não são alterados durante o registro.</p></div><div><div className="phenology-steps phenology-readonly">{visitOrder.map((stage, index) => <span className={visitStage === stage ? 'active' : visitOrder.indexOf(stage) < visitOrder.indexOf(visitStage) ? 'done' : ''} key={stage}><i>{String(index + 1).padStart(2,'0')}</i><b>{stage}</b></span>)}</div><div className="visit-focus"><span>FOCO DESTA VISITA</span><b>{protocols[visitStage].focus}</b></div></div></section>

      <section className="card form-card protocol-check-card"><div className="section-number">02</div><div><h2>Checklist da atividade</h2><p>Cada atividade exibe somente os itens previstos para a categoria selecionada.</p></div><div>
        <div className="checklist visit-checklist"><h3>{activePlan?.activity ?? visitStage} · itens obrigatórios</h3>{activityChecks.map((check) => <div className="check-with-photo" key={check}><label><input type="checkbox" name="checks" value={check} required checked={checkedItems.includes(check)} onChange={(event) => setCheckedItems(event.target.checked ? [...checkedItems, check] : checkedItems.filter((item) => item !== check))} /><span>✓</span>{check}</label></div>)}</div>
        {mode === 'operational' && /seme|plantio/i.test(activePlan?.activity ?? '') && <div className="sowing-confirmation"><label>Foi plantado o enchimento?<select name="fillPlanted" required defaultValue=""><option value="" disabled>Selecione</option><option>Sim</option><option>Não</option><option>Não se aplica</option></select></label></div>}
        {mode === 'field' && pendingWeedControl && visitStage !== 'Perfilhamento' && <div className="weed-followup"><span className="weed-alert-icon">!</span><div><small>PENDÊNCIA DA VISITA ANTERIOR</small><h3>O controle de plantas daninhas foi realizado?</h3><p>A pressão registrada foi {latestWeedEvent?.details?.daninhas}/5. Confirme a ação corretiva.</p><div><label><input type="radio" name="weedControl" value="Sim, controle confirmado" required />Sim, realizado</label><label><input type="radio" name="weedControl" value="Parcialmente realizado" required />Parcial</label><label><input type="radio" name="weedControl" value="Não realizado" required />Não realizado</label></div></div></div>}
        {mode === 'field' && <><div className="field-observation-grid score-box-grid"><ScoreBoxes name="establishment" label="Estabelecimento da cultura" value={quality.establishment} positive onChange={(value) => setQuality({ ...quality, establishment: value })} /><ScoreBoxes name="uniformity" label="Uniformidade" value={quality.uniformity} positive onChange={(value) => setQuality({ ...quality, uniformity: value })} /><ScoreBoxes name="weeds" label="Pressão de daninhas" value={quality.weeds} onChange={(value) => setQuality({ ...quality, weeds: value })} /><ScoreBoxes name="disease" label="Severidade de doenças" value={quality.disease} onChange={(value) => setQuality({ ...quality, disease: value })} /></div>{showDisease && <DiseaseFields />}{(quality.weeds > 3 || quality.disease > 3) && <div className="risk-alert"><b>Alerta técnico ativo</b><small>{quality.weeds > 3 ? `Pressão de daninhas ${quality.weeds}/5` : ''}{quality.weeds > 3 && quality.disease > 3 ? ' · ' : ''}{quality.disease > 3 ? `Doenças ${quality.disease}/5` : ''}</small></div>}<div className={`quality-preview quality-${combined.label.toLowerCase().replace('í','i').replace('ç','c')}`}><span>Qualidade consolidada do campo</span><b>{combined.score}<small>/100</small></b><em>{combined.label}</em></div></>}
        {mode === 'operational' && /fungic|herbic|insetic|aplica|pulver/i.test(activePlan?.activity ?? '') && <div className="form-grid management-fields optional-fields"><span className="optional-label">Campos complementares · opcionais para aplicações</span><label>Produto ou insumo<input name="product" placeholder="Ex.: fungicida ou herbicida" /></label><label>Dose / regulagem<input name="dose" placeholder="Ex.: 0,75 L/ha" /></label><label>Condição da atividade<select name="condition"><option>Conforme planejado</option><option>Executado com ressalva</option><option>Não executado</option></select></label></div>}
        <div className="adverse-report"><div className="adverse-title"><span>!</span><div><h3>Reporte de situação adversa</h3><p>Opcional. O desconto será aplicado à qualidade conforme a abrangência escolhida.</p></div></div><div className="form-grid"><label>Abrangência<select name="scope" value={adverseScope} onChange={(event) => { setAdverseScope(event.target.value); setAdverseTrial(''); }}><option value="">Nenhuma ocorrência</option><option>Local inteiro</option><option>Tipo de ensaio</option><option>Ensaio específico</option></select></label>{adverseScope && <label>Categoria<select name="adverseCategory" defaultValue=""><option value="" disabled>Selecione</option><option>Parcela perdida</option><option>Linha entupida</option><option>Fitotoxidez</option><option>Atraso na aplicação</option><option>Sobredose de N</option><option>Outro</option></select></label>}{(adverseScope === 'Tipo de ensaio' || adverseScope === 'Ensaio específico') && <label>Tipo de ensaio<select name="macroGroup" value={adverseGroup} onChange={(event) => { setAdverseGroup(event.target.value as MacroGroup); setAdverseTrial(''); }}>{installedGroups.map((group) => <option key={group}>{group}</option>)}</select></label>}{adverseScope === 'Ensaio específico' && <label>Ensaio<select name="adverseTrial" value={adverseTrial} onChange={(event) => setAdverseTrial(event.target.value)}><option value="">Selecione</option>{localTrials.filter((trial) => macroGroupFor(trial) === adverseGroup).map((trial) => <option key={trial.id} value={trial.id}>{trial.id} · {trial.name}</option>)}</select></label>}{adverseScope && <><label>Quantidade afetada<input name="adverseQuantity" type="number" min="1" defaultValue="1" /></label><label>PlotID(s)<input name="adversePlotIds" placeholder="Ex.: 1201; 1202" /></label><label className="full">Descrição<textarea name="adverseDescription" rows={3} placeholder="Descreva o ocorrido, impacto e ação recomendada" /></label><label className="full adverse-photo">Imagem da ocorrência<input name="adversePhotos" type="file" accept="image/*" capture="environment" multiple /></label></>}</div>{adverseScope && <small className="penalty-hint">Regra padrão: parcela perdida −1% por unidade; linha entupida −0,3% por unidade (10 linhas = −3%); demais categorias seguem pesos configurados.</small>}</div>
      </div></section>

      {mode === 'operational' && /fungic|herbic|insetic|aplica|pulver/i.test(activePlan?.activity ?? '') && activeDynamicFields.length > 0 && <section className="card form-card dynamic-record-fields"><div className="section-number">03</div><div><h2>Campos complementares</h2><p>Opcionais e exibidos somente para aplicações.</p></div><div className="form-grid">{activeDynamicFields.map((field) => <DynamicFieldInput key={field.id} field={field} />)}</div></section>}

      <section className="card quick-note-card"><label>Anotação rápida<textarea name="notes" rows={3} placeholder="Registre ocorrências, decisões e recomendações para a próxima visita…" /></label></section>

      <section className="form-actions"><span>O registro fica salvo offline neste dispositivo e entra na fila de sincronização quando a conexão retornar.</span><div><button type="reset" className="secondary-button">Limpar</button><button type="submit" className="primary-button" disabled={!installedGroups.length || !activePlan}>✓ Salvar visita</button></div></section>
    </form>
  </>;
}

function DynamicFieldInput({ field }: { field: DynamicField }) {
  const name = `dynamic-${field.id}`;
  if (field.type === 'select') return <label>{field.label}<select name={name}><option value="">Selecione</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select></label>;
  return <label>{field.label}<input name={name} type={field.type === 'number' ? 'number' : field.type} step={field.type === 'number' ? 'any' : undefined} /></label>;
}

function DiseaseFields() {
  const options = <><option value="0">0 · Ausente</option><option value="1">1 · Traços</option><option value="2">2 · Baixa</option><option value="3">3 · Moderada</option><option value="4">4 · Alta</option><option value="5">5 · Severa</option></>;
  return <div className="disease-grid"><label>Oídio<select name="oidio" defaultValue="0">{options}</select></label><label>Ferrugem<select name="ferrugem" defaultValue="0">{options}</select></label><label>Manchas foliares<select name="manchas" defaultValue="0">{options}</select></label></div>;
}

function ScoreBoxes({ name, label, value, positive = false, onChange }: { name: string; label: string; value: number; positive?: boolean; onChange: (value: number) => void }) {
  const labels = positive ? ['Muito ruim','Ruim','Regular','Bom','Excelente'] : ['Ausente','Baixa','Moderada','Alta','Severa'];
  return <fieldset className="score-boxes"><legend>{label}</legend><div>{[1,2,3,4,5].map((score) => <label className={value === score ? 'active' : ''} key={score}><input type="radio" name={name} value={score} checked={value === score} onChange={() => onChange(score)} /><b>{score}</b><small>{labels[score - 1]}</small></label>)}</div></fieldset>;
}

function QualityRange({ name, label, value, positive = false, onChange }: { name: string; label: string; value: number; positive?: boolean; onChange: (value: number) => void }) {
  return <label className="quality-range"><span>{label}<b>{value}/5</b></span><input name={name} type="range" min="1" max="5" value={value} onChange={(event) => onChange(Number(event.target.value))} /><small>{positive ? '1 = irregular · 5 = uniforme' : '1 = baixa · 5 = alta'}</small></label>;
}

function HistoryScreen({ activities, onNew }: { activities: Activity[]; onNew: () => void }) {
  return <><PageHead eyebrow="Rastreabilidade" title="Histórico de manejo" copy="Todas as atividades registradas na rede, da mais recente para a mais antiga." action={<button className="primary-button" onClick={onNew}>＋ Nova atividade</button>} />
    <section className="toolbar"><button>Todos os ensaios⌄</button><button>Todos os tipos⌄</button><button>Últimos 30 dias⌄</button></section>
    <section className="card history-list">{activities.map((activity) => <article key={activity.id}><div className="timeline-dot" /><time>{activity.date}</time><div className="activity-icon">✓</div><div className="activity-copy"><span>{activity.macroStage ?? activity.type}</span><h2>{activity.notes}</h2><p><b>{activity.locationId ? locations.find((location) => location.id === activity.locationId)?.name : activity.trial}</b>{activity.scope ? ` · ${activity.scope}${activity.scope !== 'Área total' ? `: ${activity.macroGroup}` : ''}` : ''} · Registrado por {activity.owner}{activity.qualityScore !== undefined ? ` · Qualidade ${activity.qualityScore}/100 (${activity.qualityClass})` : ''}</p>{activity.checks && <small>{activity.checks.length} checks concluídos{activity.photos?.length ? ` · ${activity.photos.length} foto(s)` : ''}</small>}</div><button aria-label="Mais opções">•••</button></article>)}</section>
  </>;
}

function AdminRegistrationScreen({ registeredTrials, trialList, activities, schedule, harvests, activeHarvestId, lastUpdated, dynamicFields, onDynamicFields, activityTemplates, onActivityTemplates, onSave, onImportDataset, onImportUnified, onCreatePlanning, onAddLocation, onAddTrials, onCreateHarvest, onHarvestStatus, onHarvest, onFinalizeLayout, onDeleteTrial, onDeleteLocation }: { registeredTrials: Trial[]; trialList: Trial[]; activities: Activity[]; schedule: PlannedActivity[]; harvests: Harvest[]; activeHarvestId: string; lastUpdated: string; dynamicFields: DynamicField[]; onDynamicFields: (fields: DynamicField[]) => void; activityTemplates: ActivityTemplate[]; onActivityTemplates: (templates: ActivityTemplate[]) => void; onSave: (event: FormEvent<HTMLFormElement>) => void; onImportDataset: (dataset: string, rows: Record<string, unknown>[]) => void; onImportUnified: (rows: Record<string, unknown>[]) => void; onCreatePlanning: (config: PlanningWizardConfig) => void; onAddLocation: (input: { code: string; name: string; city: string; uf: string; region: string; lat: number; lng: number }) => void; onAddTrials: (input: { locationIds: string[]; trialCode: string; trialName: string; group: MacroGroup; subtype: string; fieldCode: string; fieldName: string; plots: number; sowing: string; owner: string; priority: string }) => void; onCreateHarvest: (name: string, clone: boolean) => void; onHarvestStatus: (id: string, status: HarvestStatus) => void; onHarvest: (id: string) => void; onFinalizeLayout: (payload: LayoutFinalization) => void; onDeleteTrial: (id: string) => void; onDeleteLocation: (id: string) => void }) {
  const [tab, setTab] = useState<'unified' | 'catalog' | 'fields' | 'templates' | 'harvests' | 'planner' | 'import' | 'records' | 'quality' | 'alerts'>('unified');
  const [dataset, setDataset] = useState('Ensaios');
  const [importResult, setImportResult] = useState<{ name: string; rows: Record<string, unknown>[]; errors: string[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [weights, setWeights] = useState(() => {
    if (typeof window === 'undefined') return { estabelecimento: 30, falhas: 25, daninhas: 20, doencas: 15, uniformidade: 10 };
    try { return JSON.parse(localStorage.getItem('fwt-quality-weights') ?? '') || { estabelecimento: 30, falhas: 25, daninhas: 20, doencas: 15, uniformidade: 10 }; } catch { return { estabelecimento: 30, falhas: 25, daninhas: 20, doencas: 15, uniformidade: 10 }; }
  });
  const [variables, setVariables] = useState(['Estabelecimento da cultura','Presença e percentual de falhas','Causa provável das falhas','Pressão de plantas daninhas','Severidade de doenças','Uniformidade do ensaio']);
  const [adminLocations, setAdminLocations] = useState<{ name: string; city: string; region: string }[]>(() => { if (typeof window === 'undefined') return []; try { return JSON.parse(localStorage.getItem('fwt-admin-locations') ?? '[]'); } catch { return []; } });
  const [savedMessage, setSavedMessage] = useState('');
  const [plannerLocation, setPlannerLocation] = useState(locations[0]?.id ?? '');
  const [plannerType, setPlannerType] = useState('Todos');
  const [plannerTrials, setPlannerTrials] = useState<string[]>([]);
  const [plannerProfile, setPlannerProfile] = useState<PlanningWizardConfig['profile']>('Completo');
  const [unifiedResult, setUnifiedResult] = useState<{ name: string; rows: Record<string, unknown>[]; errors: string[] } | null>(null);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [clonePlanning, setClonePlanning] = useState(true);
  const requiredColumns: Record<string, string[]> = { Localidades: ['id','nome','cidade','uf','latitude','longitude','regiao'], Campos: ['campo_id','localidade_id','nome','area_ha'], Ensaios: ['ensaio_id','campo_id','nome','grupo','data_semeadura','parcelas'], Planejamento: ['planejamento_id','localidade_id','ensaio_id','atividade','etapa','data_prevista','responsavel','prioridade','status'], Atividades: ['atividade_id','localidade_id','etapa','data','status'], Configurações: ['chave','valor'] };
  const availablePlannerTrials = trialList.filter((trial) => trial.locationId === plannerLocation && (plannerType === 'Todos' || trial.type === plannerType));
  async function importFile(file?: File) {
    if (!file) return;
    setImporting(true);
    try {
      const rows = await readSpreadsheet(file, dataset);
      const headers = Object.keys(rows[0] ?? {});
      const missing = requiredColumns[dataset].filter((column) => !headers.includes(column));
      const errors = missing.length ? [`Colunas ausentes: ${missing.join(', ')}`] : [];
      setImportResult({ name: file.name, rows, errors });
      if (!errors.length) { localStorage.setItem(`fwt-import-${dataset.toLowerCase()}`, JSON.stringify(rows)); onImportDataset(dataset, rows); }
    } catch (error) { setImportResult({ name: file.name, rows: [], errors: [error instanceof Error ? error.message : 'Não foi possível ler a planilha.'] }); }
    setImporting(false);
  }
  async function importUnifiedFile(file?: File) {
    if (!file) return;
    setImporting(true);
    try {
      const rows = await readSpreadsheet(file, 'Planejamento Unificado');
      const required = ['local_codigo','local_nome','vcu_regiao','ensaio_codigo','ensaio_nome','grupo','parcelas','data_semeadura','visita_codigo','atividade_descricao','estadio_fenologico','data_prevista'];
      const headers = Object.keys(rows[0] ?? {});
      const missing = required.filter((column) => !headers.includes(column));
      const duplicateVisits = rows.map((row) => String(row.visita_codigo ?? '')).filter(Boolean).filter((id, index, all) => all.indexOf(id) !== index);
      const errors = [missing.length ? `Colunas ausentes: ${missing.join(', ')}` : '', duplicateVisits.length ? `Códigos de visita repetidos: ${[...new Set(duplicateVisits)].slice(0, 5).join(', ')}` : ''].filter(Boolean);
      setUnifiedResult({ name: file.name, rows, errors });
    } catch (error) { setUnifiedResult({ name: file.name, rows: [], errors: [error instanceof Error ? error.message : 'Não foi possível ler a planilha.'] }); }
    setImporting(false);
  }
  function submitManagedLocation(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); onAddLocation({ code: String(data.get('code')), name: String(data.get('name')), city: String(data.get('city')), uf: String(data.get('uf')), region: String(data.get('region')), lat: Number(data.get('lat')), lng: Number(data.get('lng')) }); event.currentTarget.reset(); }
  function submitManagedTrials(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); onAddTrials({ locationIds: selectedLocations, trialCode: String(data.get('trialCode')), trialName: String(data.get('trialName')), group: String(data.get('group')) as MacroGroup, subtype: String(data.get('subtype') || ''), fieldCode: String(data.get('fieldCode')), fieldName: String(data.get('fieldName')), plots: Number(data.get('plots')), sowing: String(data.get('sowing')), owner: String(data.get('owner')), priority: String(data.get('priority')) }); setSelectedLocations([]); event.currentTarget.reset(); }
  function submitHarvest(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); onCreateHarvest(String(data.get('harvestName')), clonePlanning); event.currentTarget.reset(); }
  function saveWeights() { localStorage.setItem('fwt-quality-weights', JSON.stringify(weights)); setSavedMessage('Pesos e componentes de qualidade salvos.'); setTimeout(() => setSavedMessage(''), 3000); }
  function addVariable(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const name = String(form.get('variable')).trim(); if (name && !variables.includes(name)) setVariables([...variables, name]); event.currentTarget.reset(); }
  function addLocation(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const next = [...adminLocations, { name: String(form.get('name')), city: String(form.get('city')), region: String(form.get('region')) }]; setAdminLocations(next); localStorage.setItem('fwt-admin-locations', JSON.stringify(next)); event.currentTarget.reset(); }
  function exportReport() {
    const rows = locations.map((location) => { const overview = localityOverview(location.id, trialList, activities, schedule); return [location.name, overview.localTrials.length, overview.plantedPercent, overview.stage, overview.quality, schedule.filter((item) => overview.localTrials.some((trial) => trial.id === item.trialId) && item.status !== 'Concluído' && item.start < sourceSummary.importedAt).length]; });
    const csv = [['Localidade','Ensaios','Percentual semeado','Estadio predominante','Qualidade media','Alertas'], ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"','""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'resumo-evolucao-campos.csv'; link.click(); URL.revokeObjectURL(url);
  }
  async function exportUnifiedReport() {
    const { Workbook } = await import('exceljs');
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Gestão da Safra', { views: [{ state: 'frozen', ySplit: 3, xSplit: 2 }] });
    const dynamicHeaders = dynamicFields.map((field) => `variavel_${field.id}`);
    const headers = ['local_codigo','local_nome','municipio','uf','latitude','longitude','tipo_area','mapa_id','mapa_nome','arquivo_croqui','codigo_alocacao','cor_ensaio','campo_codigo','campo_nome','ensaio_codigo','ensaio_nome','grupo','subtipo_ensaio','parcela_inicial','parcela_final','primeira_parcela_latitude','primeira_parcela_longitude','parcelas','parcelas_com_alerta','parcelas_perdidas','penalidade_implantacao','data_semeadura_prevista','data_semeadura','visita_codigo','atividade_descricao','estadio_fenologico','data_prevista','responsavel','prioridade','status_planejamento','data_realizada','checklist_concluido','estabelecimento_nota','uniformidade_nota','daninhas_nota','controle_daninhas','oidio_nota','ferrugem_nota','manchas_nota','observacoes','fotos','nota_qualidade','classificacao','alerta_categoria','alerta_abrangencia','alerta_descricao','alerta_plotid','desconto_qualidade_pct', ...dynamicHeaders];
    worksheet.mergeCells(1, 1, 1, headers.length); worksheet.getCell('A1').value = 'FIELD WHEAT TESTING — BASE DE GESTÃO GERADA PELOS CROQUIS';
    worksheet.mergeCells(2, 1, 2, headers.length); worksheet.getCell('A2').value = 'POSICIONAMENTO, ENSAIOS, CALENDÁRIO E REGISTROS DE CAMPO';
    worksheet.addRow(headers);
    let source: Record<string, unknown>[] = [];
    try { source = JSON.parse(localStorage.getItem('field-wheat-unified-source-v1') ?? '[]'); } catch { source = []; }
    const sourceByVisit = new Map(source.map((row) => [String(row.visita_codigo ?? ''), row]));
    schedule.forEach((plan) => {
      const trial = trialList.find((item) => item.id === plan.trialId);
      const location = locations.find((item) => item.id === trial?.locationId);
      const record = activities.find((item) => item.plannedId === plan.id);
      const applicableAlerts = activities.filter((activity) => Number(activity.qualityPenalty ?? 0) > 0 && trial && (activity.trial === trial.id || (activity.locationId === trial.locationId && (activity.scope === 'Local inteiro' || activity.scope === 'Tipo de ensaio' && activity.macroGroup === macroGroupFor(trial)))));
      const original = sourceByVisit.get(plan.id) ?? {};
      const activityDate = record?.date?.includes('/') ? record.date.split('/').reverse().join('-') : record?.date ?? '';
      const values: Record<string, unknown> = { ...original, local_codigo: location?.id, local_nome: location?.name, municipio: String(original.municipio ?? location?.city?.split(' - ')[0] ?? ''), uf: String(original.uf ?? location?.city?.split(' - ')[1] ?? ''), latitude: location?.lat, longitude: location?.lng, vcu_regiao: String(original.vcu_regiao ?? location?.region ?? '').replace('_1',' I').replace('_2',' II').replace('_3',' III'), tipo_area: trial?.areaCategory ?? original.tipo_area, mapa_id: trial?.mapId ?? original.mapa_id, mapa_nome: original.mapa_nome, cor_ensaio: original.cor_ensaio, campo_nome: trial?.fieldName, ensaio_codigo: trial?.id, ensaio_nome: trial?.name, grupo: trial?.type, subtipo_ensaio: trial?.subtype, parcelas: trial?.plots, parcelas_com_alerta: trial?.affectedPlots?.join('; '), parcelas_perdidas: trial?.lostPlots?.join('; '), penalidade_implantacao: trial?.layoutPenalty, data_semeadura: trial?.sowing, visita_codigo: plan.id, atividade_descricao: plan.activity, estadio_fenologico: plan.category, data_prevista: plan.start, responsavel: plan.owner, prioridade: plan.priority, status_planejamento: record ? 'Finalizado' : plan.status, data_realizada: activityDate, checklist_concluido: record?.checks?.join('; '), estabelecimento_nota: record?.details?.estabelecimento, uniformidade_nota: record?.details?.uniformidade, daninhas_nota: record?.details?.daninhas, controle_daninhas: record?.details?.controle_daninhas, oidio_nota: record?.details?.oidio, ferrugem_nota: record?.details?.ferrugem, manchas_nota: record?.details?.manchas, observacoes: record?.notes ?? plan.notes, fotos: record?.photos?.join('; '), nota_qualidade: trial ? trialQuality(trial, activities).score : record?.qualityScore, classificacao: trial ? trialQuality(trial, activities).label : record?.qualityClass, alerta_categoria: applicableAlerts.map((item) => item.alertCategory).join('; '), alerta_abrangencia: applicableAlerts.map((item) => item.scope).join('; '), alerta_descricao: applicableAlerts.map((item) => item.details?.ocorrencia || item.notes).join(' | '), alerta_plotid: applicableAlerts.flatMap((item) => item.plotIds ?? []).join('; '), desconto_qualidade_pct: applicableAlerts.reduce((sum, item) => sum + Number(item.qualityPenalty ?? 0), 0) };
      dynamicFields.forEach((field) => { values[`variavel_${field.id}`] = record?.details?.[field.id] ?? ''; });
      worksheet.addRow(headers.map((header) => values[header] ?? ''));
    });
    const scheduledVisits = new Set(schedule.map((item) => item.id));
    source.filter((row) => !scheduledVisits.has(String(row.visita_codigo ?? ''))).forEach((row) => worksheet.addRow(headers.map((header) => row[header] ?? '')));
    worksheet.getRow(1).height = 30; worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 16 }; worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF174B38' } };
    worksheet.getRow(2).height = 24; worksheet.getRow(2).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }; worksheet.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D7656' } };
    worksheet.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } }; worksheet.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF174B38' } }; worksheet.getRow(3).height = 38;
    worksheet.columns.forEach((column, index) => { column.width = index === 15 || index === 31 ? 34 : index === 1 || index === 10 ? 25 : 17; column.alignment = { vertical: 'middle', wrapText: true }; });
    const buffer = await workbook.xlsx.writeBuffer(); const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); const link = document.createElement('a'); link.href = url; link.download = `field-wheat-testing-saida-${new Date().toISOString().slice(0,10)}.xlsx`; link.click(); URL.revokeObjectURL(url);
  }
  const activeAdminHarvest = harvests.find((harvest) => harvest.id === activeHarvestId);
  const updatedLabel = lastUpdated ? new Date(lastUpdated).toLocaleString('pt-BR') : 'nenhuma atualização registrada';
  return <><PageHead eyebrow="Acesso restrito · Administrador" title="Gerenciamento" copy="Planejamento, cadastros, safras, regras de qualidade e relatórios em uma única área." action={<div className={`harvest-lock ${activeAdminHarvest?.status === 'Encerrada' ? 'locked' : ''}`}><b>{activeAdminHarvest?.name}</b><span>{activeAdminHarvest?.status}</span></div>} />
    <nav className="admin-tabs">{([['unified','Base de gestão'],['catalog','Cadastro de local'],['templates','Atividades por área'],['fields','Campos de registro'],['harvests','Safras e histórico'],['quality','Índices de qualidade'],['alerts','Relatório e alertas']] as const).map(([id,label]) => <button className={tab === id ? 'active' : ''} onClick={() => setTab(id)} key={id}>{label}</button>)}</nav>
    {savedMessage && <div className="admin-saved">✓ {savedMessage}</div>}
    {tab === 'unified' && <UnifiedManagementPanel importing={importing} result={unifiedResult} lastUpdated={updatedLabel} locked={activeAdminHarvest?.status === 'Encerrada'} scheduleCount={schedule.length} onFile={importUnifiedFile} onLoad={(rows) => { onImportUnified(rows); setSavedMessage('Planejamento atualizado e salvo.'); setTimeout(() => setSavedMessage(''), 3000); }} onExport={exportUnifiedReport} />}
    {tab === 'catalog' && <CroquiCatalogPanel harvestId={activeHarvestId} harvestName={activeAdminHarvest?.name ?? 'Safra 2026'} locked={activeAdminHarvest?.status === 'Encerrada'} locationsList={locations} trialList={trialList} schedule={schedule} onFinalize={onFinalizeLayout} onDeleteTrial={onDeleteTrial} onDeleteLocation={onDeleteLocation} />}
    {tab === 'fields' && <ActivityFieldManager fields={dynamicFields} onChange={onDynamicFields} />}
    {tab === 'templates' && <ActivityTemplateManager templates={activityTemplates} onChange={onActivityTemplates} />}
    {tab === 'harvests' && <HarvestManagementPanel harvests={harvests} activeId={activeHarvestId} clonePlanning={clonePlanning} onClone={setClonePlanning} onCreate={submitHarvest} onSelect={onHarvest} onStatus={onHarvestStatus} />}
    {tab === 'import' && <section className="admin-data-grid"><article className="card admin-upload-card"><span className="eyebrow">FONTE ÚNICA DE DADOS</span><h2>Carregar planejamento operacional</h2><p>O mesmo arquivo cria locais, campos, ensaios, calendário fenológico e atividades previstas. Cada linha representa uma visita para um ensaio.</p><label className="spreadsheet-drop"><input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => importUnifiedFile(event.target.files?.[0])} /><span>▤</span><b>{importing ? 'Lendo e validando…' : 'Selecionar planilha unificada'}</b><small>.xlsx, .xls ou .csv</small></label><a className="template-download" href="planejamento-unificado-field-wheat-testing.xlsx" download>↓ Baixar modelo oficial</a><button className="secondary-button" type="button" disabled={!schedule.length} onClick={exportUnifiedReport}>↓ Exportar arquivo final com registros</button></article><article className="card import-validation"><div className="card-head"><div><h2>Validação e distribuição</h2><p>Uma importação alimenta todas as funcionalidades da plataforma.</p></div></div><div className="rule-flow"><span><b>Planilha</b><small>planejamento unificado</small></span><i>→</i><span><b>Plataforma</b><small>mapa, ensaios e agenda</small></span><i>→</i><span><b>Saída</b><small>registros e relatório final</small></span></div>{!unifiedResult ? <div className="empty-admin"><span>✓</span><p>Baixe o modelo, preencha as colunas verdes e carregue o arquivo aqui.</p></div> : <><div className={unifiedResult.errors.length ? 'import-state error' : 'import-state success'}><b>{unifiedResult.errors.length ? 'Arquivo com pendências' : 'Base unificada carregada'}</b><small>{unifiedResult.name} · {unifiedResult.rows.length} linhas</small>{unifiedResult.errors.map((error) => <em key={error}>{error}</em>)}</div>{!unifiedResult.errors.length && <div className="metric-list"><div><span>Locais</span><b>{new Set(unifiedResult.rows.map((row) => row.local_codigo)).size}</b></div><div><span>Ensaios</span><b>{new Set(unifiedResult.rows.map((row) => row.ensaio_codigo)).size}</b></div><div><span>Visitas previstas</span><b>{unifiedResult.rows.length}</b></div><div><span>Registros realizados</span><b>{unifiedResult.rows.filter((row) => row.data_realizada).length}</b></div></div>}</>}</article></section>}
    {tab === 'planner' && <section className="card click-planner"><div className="planner-heading"><div><span className="eyebrow">ASSISTENTE DE PLANEJAMENTO</span><h2>Monte o planejamento sem preencher planilhas</h2><p>As atividades e datas são geradas automaticamente a partir da semeadura prevista de cada ensaio.</p></div><span className="planner-count"><b>{plannerTrials.length}</b><small>selecionados</small></span></div><div className="planner-steps"><section><span className="step-number">1</span><h3>Tipo de ensaio</h3><p>Use um tipo para reduzir a lista.</p><div className="planner-choice-row">{['Todos',...[...new Set(trialList.map((trial) => trial.type))]].map((type) => <button className={plannerType === type ? 'active' : ''} onClick={() => { setPlannerType(type); setPlannerTrials([]); }} key={type}>{type}</button>)}</div></section><section><span className="step-number">2</span><h3>Localidade</h3><p>Selecione onde os ensaios serão conduzidos.</p><div className="planner-location-grid">{locations.filter((location) => trialList.some((trial) => trial.locationId === location.id)).map((location) => <button className={plannerLocation === location.id ? 'active' : ''} key={location.id} onClick={() => { setPlannerLocation(location.id); setPlannerTrials([]); }}><i>◎</i><span><b>{location.name}</b><small>{trialList.filter((trial) => trial.locationId === location.id).length} ensaios</small></span></button>)}</div></section><section><span className="step-number">3</span><h3>Quais ensaios estarão neste planejamento?</h3><p>Marque um, vários ou todos os ensaios disponíveis no local.</p><button className="select-all-trials" onClick={() => setPlannerTrials(plannerTrials.length === availablePlannerTrials.length ? [] : availablePlannerTrials.map((trial) => trial.id))}>{plannerTrials.length === availablePlannerTrials.length && availablePlannerTrials.length ? 'Desmarcar todos' : 'Selecionar todos'}</button><div className="planner-trial-list">{availablePlannerTrials.map((trial) => <label key={trial.id}><input type="checkbox" checked={plannerTrials.includes(trial.id)} onChange={() => setPlannerTrials(plannerTrials.includes(trial.id) ? plannerTrials.filter((id) => id !== trial.id) : [...plannerTrials, trial.id])} /><span>✓</span><div><b>{trial.name}</b><small>{trial.id} · {trial.type} · semeadura {formatDate(trial.sowing)}</small></div></label>)}{availablePlannerTrials.length === 0 && <p className="empty-copy">Nenhum ensaio deste tipo está vinculado ao local.</p>}</div></section><section><span className="step-number">4</span><h3>Protocolo de atividades</h3><p>Escolha um conjunto pré-estabelecido.</p><div className="planner-profiles">{([['Essencial','3 atividades','Semeadura, estabelecimento e colheita'],['Completo','7 atividades','Implantação, manejos, avaliações e colheita'],['Monitoramento','4 atividades','Avaliações e colheita']] as const).map(([profile,count,copy]) => <button className={plannerProfile === profile ? 'active' : ''} onClick={() => setPlannerProfile(profile)} key={profile}><b>{profile}</b><span>{count}</span><small>{copy}</small></button>)}</div></section></div><div className="planner-review"><div><small>RESUMO</small><b>{locations.find((location) => location.id === plannerLocation)?.name}</b><span>{plannerTrials.length} ensaio(s) · protocolo {plannerProfile}</span></div><button className="primary-button" disabled={!plannerTrials.length} onClick={() => { onCreatePlanning({ locationId: plannerLocation, trialIds: plannerTrials, profile: plannerProfile }); setPlannerTrials([]); }}>Gerar planejamento e calendário →</button></div></section>}
    {tab === 'import' && <section className="admin-data-grid"><article className="card admin-upload-card"><span className="eyebrow">BASE EXCEL / CSV</span><h2>Importar dados operacionais</h2><p>Selecione a tabela correspondente. O arquivo é validado antes de substituir a base salva neste navegador.</p><label>Tipo de informação<select value={dataset} onChange={(event) => { setDataset(event.target.value); setImportResult(null); }}>{Object.keys(requiredColumns).map((name) => <option key={name}>{name}</option>)}</select></label><label className="spreadsheet-drop"><input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => importFile(event.target.files?.[0])} /><span>▤</span><b>{importing ? 'Lendo planilha…' : 'Selecionar Excel ou CSV'}</b><small>.xlsx, .xls ou .csv</small></label><a className="template-download" href="modelo-field-wheat-testing.xlsx" download>↓ Baixar modelo formatado</a></article><article className="card import-validation"><div className="card-head"><div><h2>Validação da estrutura</h2><p>Colunas obrigatórias para {dataset.toLowerCase()}</p></div></div><div className="required-columns">{requiredColumns[dataset].map((column) => <span key={column}>{column}</span>)}</div>{!importResult ? <div className="empty-admin"><span>✓</span><p>Envie uma planilha para conferir a estrutura e visualizar as primeiras linhas.</p></div> : <><div className={importResult.errors.length ? 'import-state error' : 'import-state success'}><b>{importResult.errors.length ? 'Arquivo com pendências' : 'Arquivo validado'}</b><small>{importResult.name} · {importResult.rows.length} registros</small>{importResult.errors.map((error) => <em key={error}>{error}</em>)}</div>{!importResult.errors.length && <div className="import-preview">{importResult.rows.slice(0,3).map((row,index) => <code key={index}>{Object.values(row).slice(0,4).join(' · ')}</code>)}</div>}</>}</article></section>}
    {tab === 'records' && <><section className="admin-config-grid"><form className="card quick-admin-form" onSubmit={addLocation}><span className="eyebrow">LOCALIDADES</span><h2>Adicionar localidade</h2><label>Nome<input name="name" required placeholder="Ex.: Não-Me-Toque - RS" /></label><label>Município<input name="city" required /></label><label>Região<select name="region"><option>VCU_1</option><option>VCU_2</option></select></label><button className="secondary-button">Adicionar localidade</button><small>{locations.length + adminLocations.length} localidades configuradas</small></form><article className="card admin-catalog"><h2>Itens configuráveis</h2>{[['Localidades',locations.length + adminLocations.length],['Grupos de manejo',4],['Protocolos',3],['Variáveis de atividade',variables.length]].map(([name,count]) => <div key={name}><span>{name}</span><b>{count}</b><button>Editar</button></div>)}</article></section><details className="manual-trial card"><summary>Cadastro manual de campo e ensaio</summary><form className="admin-register-form" onSubmit={onSave}><div className="form-grid"><label>Nome do campo<input name="fieldName" required /></label><label>Localidade<select name="location">{locations.map((location) => <option value={location.id} key={location.id}>{location.name}</option>)}</select></label><label>Área (ha)<input name="area" type="number" step="0.1" required /></label><label>Solo<select name="soil"><option>Latossolo</option><option>Nitossolo</option><option>Outro</option></select></label><label>Nome do ensaio<input name="trialName" required /></label><label>Tipo<select name="trialType"><option>VCU</option><option>PRYT</option><option>EYT</option></select></label><label>Parcelas<input name="plots" type="number" defaultValue="60" required /></label><label>Prioridade<select name="priority"><option>Normal</option><option>Alta</option><option>Crítica</option></select></label><label>Responsável<select name="owner">{importedUsers.map((user) => <option key={user.id}>{user.name}</option>)}</select></label><label>Semeadura prevista<input name="sowing" type="date" defaultValue="2026-06-15" required /></label></div><input type="hidden" name="profile" value="Completo" /><button className="primary-button">Criar campo e planejamento</button><small>{registeredTrials.length} cadastro(s) manual(is) nesta sessão.</small></form></details></>}
    {tab === 'quality' && <section className="quality-admin-grid"><article className="card weight-editor"><div className="card-head"><div><h2>Média ponderada de qualidade</h2><p>Os pesos devem totalizar 100%.</p></div><b className={Object.values(weights).reduce((sum: number, value: unknown) => sum + Number(value),0) === 100 ? 'weight-total valid' : 'weight-total'}>{Object.values(weights).reduce((sum: number, value: unknown) => sum + Number(value),0)}%</b></div>{Object.entries(weights).map(([key,value]) => <label key={key}><span>{key.charAt(0).toUpperCase()+key.slice(1)}<b>{Number(value)}%</b></span><input type="range" min="0" max="50" value={Number(value)} onChange={(event) => setWeights({ ...weights, [key]: Number(event.target.value) })} /></label>)}<button className="primary-button" onClick={saveWeights}>Salvar regra de cálculo</button></article><article className="card variable-editor"><h2>Componentes da avaliação</h2><p>Campos exibidos nos checks de qualidade do ensaio.</p><div>{variables.map((variable) => <span key={variable}>✓ {variable}<button onClick={() => setVariables(variables.filter((item) => item !== variable))}>×</button></span>)}</div><form onSubmit={addVariable}><input name="variable" placeholder="Nova variável de qualidade" required /><button className="secondary-button">Adicionar</button></form></article></section>}
    {tab === 'alerts' && <section className="alert-report-grid"><article className="card alert-rule-card"><span className="eyebrow">REGRA DE ACOMPANHAMENTO</span><h2>Pressão de plantas daninhas</h2><p>Quando a pressão for detectada em uma visita, uma verificação obrigatória é criada automaticamente para a visita seguinte.</p><div className="rule-flow"><span><b>Visita X</b><small>Pressão detectada ≥ nível 3</small></span><i>→</i><span><b>Alerta aberto</b><small>Solicitar ação corretiva</small></span><i>→</i><span><b>Visita Y</b><small>Resolvido, parcial ou não resolvido</small></span></div><div className="form-grid"><label>Nível de disparo<select><option>3 - Moderada</option><option>2 - Baixa</option><option>4 - Alta</option></select></label><label>Prazo da revisita<input type="number" defaultValue="7" /> dias</label></div><label className="rule-toggle"><input type="checkbox" defaultChecked /> Regra ativa para toda a rede</label></article><article className="card report-card"><span className="eyebrow">RELATÓRIO GERENCIAL</span><h2>Evolução dos campos</h2><p>Resumo por localidade com implantação, estádio, qualidade média e alertas pendentes.</p><div><span><b>{trialList.length}</b><small>ensaios</small></span><span><b>{activities.length}</b><small>registros</small></span><span><b>{schedule.filter((item) => item.status !== 'Concluído' && item.start < sourceSummary.importedAt).length}</b><small>alertas</small></span></div><button className="primary-button" onClick={exportReport}>↓ Emitir relatório CSV</button></article></section>}
  </>;
}

function UnifiedManagementPanel({ importing, result, lastUpdated, locked, scheduleCount, onFile, onLoad, onExport }: { importing: boolean; result: { name: string; rows: Record<string, unknown>[]; errors: string[] } | null; lastUpdated: string; locked: boolean; scheduleCount: number; onFile: (file?: File) => void; onLoad: (rows: Record<string, unknown>[]) => void; onExport: () => void }) {
  return <section className="admin-data-grid"><article className="card admin-upload-card"><span className="eyebrow">BASE GERADA PELOS CROQUIS</span><h2>Gestão operacional da safra</h2><p>Localidades, ensaios, parcelas e calendário são criados ao finalizar o posicionamento de cada croqui no Mapa da rede.</p><div className="sync-status"><span>Última atualização</span><b>{lastUpdated}</b><small>{scheduleCount} atividades atualmente programadas.</small></div><button className="primary-button wide" type="button" disabled={!scheduleCount} onClick={onExport}>Baixar base de gestão em Excel</button><details className="legacy-import"><summary>Importar uma base anterior</summary><p>Use somente para recuperar um planejamento legado. Novas áreas devem ser cadastradas pelo croqui.</p><label className="spreadsheet-drop"><input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => onFile(event.target.files?.[0])} /><span>▦</span><b>{importing ? 'Lendo e validando…' : 'Selecionar base anterior'}</b><small>.xlsx, .xls ou .csv</small></label>{result && !result.errors.length && <button className="secondary-button wide" type="button" disabled={locked} onClick={() => onLoad(result.rows)}>Recuperar base anterior</button>}</details></article><article className="card import-validation"><div className="card-head"><div><h2>Fluxo atual</h2><p>O croqui é a origem das informações operacionais.</p></div></div><div className="rule-flow"><span><b>Croqui</b><small>área e parcelas</small></span><i>→</i><span><b>Ensaios</b><small>limites e localização</small></span><i>→</i><span><b>Calendário</b><small>atividades fenológicas</small></span></div>{!result ? <div className="empty-admin"><span>✓</span><p>Para cadastrar uma nova área, abra Mapa da rede e selecione Nova área por croqui.</p></div> : <div className={result.errors.length ? 'import-state error' : 'import-state success'}><b>{result.errors.length ? 'Base anterior com pendências' : 'Base anterior pronta para recuperação'}</b><small>{result.name} · {result.rows.length} linhas</small>{result.errors.map((error) => <em key={error}>{error}</em>)}</div>}</article></section>;
}

function CroquiCatalogPanel({ harvestId, harvestName, locked, locationsList, trialList, schedule, onFinalize, onDeleteTrial, onDeleteLocation }: { harvestId: string; harvestName: string; locked: boolean; locationsList: NetworkLocation[]; trialList: Trial[]; schedule: PlannedActivity[]; onFinalize: (payload: LayoutFinalization) => void; onDeleteTrial: (id: string) => void; onDeleteLocation: (id: string) => void }) {
  const [newAreaOpen, setNewAreaOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [draftLocation, setDraftLocation] = useState<NetworkLocation | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const current = draftLocation ?? locationsList.find((location) => location.id === selectedLocationId) ?? null;
  function startArea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const code = String(data.get('code')).trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, '');
    const year = harvestName.match(/\d{4}/)?.[0] ?? String(new Date().getFullYear());
    if (!code) return;
    const draft: NetworkLocation = { id: code, name: `${code.replace(/[^A-Z0-9]+/g, '')}${year.slice(-2)}`, city: String(data.get('city')).trim(), region: 'CROQUI', lat: Number(data.get('lat')) || -29.63, lng: Number(data.get('lng')) || -53.05, trials: 0, plots: 0, status: 'ok' };
    setDraftLocation(draft); setSelectedLocationId(code); setNewAreaOpen(false); setLayoutOpen(true);
  }
  function openLayout(location: NetworkLocation) { setDraftLocation(null); setSelectedLocationId(location.id); setLayoutOpen(true); }
  return <><section className="management-grid croqui-catalog"><article className="card management-form"><span className="eyebrow">FLUXO OFICIAL DE CADASTRO</span><h2>Cadastro de local por croqui</h2><p>Crie a área, carregue o Excel, posicione as parcelas e defina cada ensaio manualmente pelo intervalo de PlotID/Trat. Ao concluir, a área entra imediatamente em Áreas cadastradas.</p><div className="croqui-flow"><span><b>1</b>Código e coordenada</span><span><b>2</b>Croqui Excel</span><span><b>3</b>Ensaios por PlotID</span><span><b>4</b>Área cadastrada</span></div><button className="primary-button wide" disabled={locked} onClick={() => setNewAreaOpen(true)}>＋ Nova área por croqui</button>{locked && <small className="locked-copy">A safra está encerrada. Reabra-a para alterar cadastros.</small>}</article><article className="card admin-catalog management-area-catalog"><div className="card-head"><div><h2>Áreas cadastradas</h2><p>Edite croquis e remova ensaios com confirmação de segurança.</p></div><b>{locationsList.length}</b></div>{locationsList.map((location) => { const localTrials = trialList.filter((trial) => trial.locationId === location.id); const localSchedule = schedule.filter((item) => localTrials.some((trial) => trial.id === item.trialId)); return <section className="managed-area" key={location.id}><header><span><b>{location.name}</b><small>{location.id} · {location.city} · {location.plots} parcelas</small></span><strong>{localSchedule.length} atividades</strong><button className="secondary-button" disabled={locked} onClick={() => openLayout(location)}>Editar croqui</button><button className="danger-button" disabled={locked} onClick={() => confirmAction(`Excluir ${location.name} e todos os seus ensaios, atividades e registros?`, () => onDeleteLocation(location.id))}>Excluir local</button></header><div className="managed-trials">{localTrials.map((trial) => <div key={trial.id}><span><b>{trial.name}</b><small>{trial.id} · {trial.plots} parcelas</small></span><button className="danger-link" disabled={locked} onClick={() => confirmAction(`Excluir o ensaio ${trial.name}? O planejamento e os registros vinculados também serão removidos.`, () => onDeleteTrial(trial.id))}>Excluir ensaio</button></div>)}{localTrials.length === 0 && <small>Nenhum ensaio finalizado neste croqui.</small>}</div></section>; })}{locationsList.length === 0 && <div className="empty-admin"><span>⌖</span><p>Nenhuma área finalizada pelo croqui.</p></div>}</article></section>{newAreaOpen && <NewAreaDialog harvestName={harvestName} onClose={() => setNewAreaOpen(false)} onSubmit={startArea} />}{layoutOpen && current && <FieldLayoutMap harvestId={harvestId} location={current} trials={trialList.filter((trial) => trial.locationId === current.id)} onClose={() => { setLayoutOpen(false); setDraftLocation(null); }} onFinalize={(payload) => { onFinalize(payload); setLayoutOpen(false); setDraftLocation(null); setSelectedLocationId(payload.location.id); }} />}</>;
}

function ActivityTemplateManager({ templates, onChange }: { templates: ActivityTemplate[]; onChange: (templates: ActivityTemplate[]) => void }) {
  const categories = defaultActivityTemplates[0].categories;
  const blank: ActivityTemplate = { id: '', name: '', stream: 'field', stage: 'Perfilhamento', offset: 20, categories: [], enabled: true };
  const [draft, setDraft] = useState<ActivityTemplate>(blank);
  const [editing, setEditing] = useState('');
  function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const id = editing || draft.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''); if (!id || !draft.categories.length) return; onChange([...templates.filter((item) => item.id !== id), { ...draft, id }]); setDraft(blank); setEditing(''); }
  return <section className="activity-template-manager"><form className="card dynamic-field-form" onSubmit={save}><span className="eyebrow">PLANEJAMENTO POR CATEGORIA</span><h2>{editing ? 'Editar atividade padrão' : 'Nova atividade padrão'}</h2><p>Selecione exatamente para quais categorias de área esta atividade será programada ao salvar o croqui.</p><label>Atividade<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Ex.: Aplicação de fungicida" /></label><div className="form-grid"><label>Tipo<select value={draft.stream} onChange={(event) => setDraft({ ...draft, stream: event.target.value as ActivityStream })}><option value="operational">Operacional</option><option value="field">Registro de campo</option></select></label><label>Estádio<select value={draft.stage} onChange={(event) => setDraft({ ...draft, stage: event.target.value as PhenologyVisit })}>{(['Semeadura','Perfilhamento','Alongamento','Emborrachamento','Espigamento','Enchimento de grão','Maturidade'] as PhenologyVisit[]).map((stage) => <option key={stage}>{stage}</option>)}</select></label><label>Dias após semeadura<input type="number" min="0" value={draft.offset} onChange={(event) => setDraft({ ...draft, offset: Number(event.target.value) })} /></label></div><fieldset className="template-categories"><legend>Categorias atendidas</legend>{categories.map((category) => <label key={category}><input type="checkbox" checked={draft.categories.includes(category)} onChange={(event) => setDraft({ ...draft, categories: event.target.checked ? [...draft.categories, category] : draft.categories.filter((item) => item !== category) })} />{category}</label>)}</fieldset><div className="dynamic-form-actions">{editing && <button type="button" className="secondary-button" onClick={() => { setEditing(''); setDraft(blank); }}>Cancelar</button>}<button className="primary-button">Salvar atividade padrão</button></div></form><article className="card dynamic-field-list"><div className="card-head"><div><h2>Atividades disponíveis</h2><p>O vínculo é usado nos novos mapas de plantio.</p></div><b>{templates.length}</b></div>{templates.map((template) => <div className="activity-template-row" key={template.id}><label><input type="checkbox" checked={template.enabled} onChange={(event) => onChange(templates.map((item) => item.id === template.id ? { ...item, enabled: event.target.checked } : item))} /></label><span><b>{template.name}</b><small>{template.stream === 'operational' ? 'Operacional' : 'Campo'} · {template.stage} · D+{template.offset}</small><em>{template.categories.join(' · ')}</em></span><button className="secondary-button" onClick={() => { setEditing(template.id); setDraft({ ...template, categories: [...template.categories] }); }}>Editar</button><button className="danger-link" onClick={() => confirmAction(`Excluir a atividade padrão ${template.name}?`, () => onChange(templates.filter((item) => item.id !== template.id)))}>Excluir</button></div>)}</article></section>;
}

function ActivityFieldManager({ fields, onChange }: { fields: DynamicField[]; onChange: (fields: DynamicField[]) => void }) {
  const emptyDraft: DynamicField = { id: '', label: '', type: 'text', options: [], entity: 'both', visibleField: true, visibleOperational: true };
  const [draft, setDraft] = useState<DynamicField>(emptyDraft);
  const [editingId, setEditingId] = useState('');
  function edit(field: DynamicField) { setEditingId(field.id); setDraft({ ...field, options: [...field.options] }); }
  function reset() { setEditingId(''); setDraft(emptyDraft); }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = editingId || draft.label.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    if (!id || !draft.label.trim()) return;
    const next = { ...draft, id, label: draft.label.trim(), options: draft.type === 'select' ? draft.options.filter(Boolean) : [] };
    onChange([...fields.filter((field) => field.id !== id), next]); reset();
  }
  function updateField(id: string, update: Partial<DynamicField>) { onChange(fields.map((field) => field.id === id ? { ...field, ...update } : field)); }
  return <section className="dynamic-field-manager"><form className="card dynamic-field-form" onSubmit={save}><span className="eyebrow">FORMULÁRIO DINÂMICO</span><h2>{editingId ? 'Editar variável' : 'Nova variável de atividade'}</h2><p>Defina o tipo de coleta e onde o campo ficará disponível.</p><label>Nome da variável<input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} required placeholder="Ex.: Umidade do solo" /></label><label>Tipo de campo<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as DynamicFieldType })}><option value="text">Texto</option><option value="select">Seleção</option><option value="number">Numérico</option><option value="date">Data</option></select></label>{draft.type === 'select' && <label>Opções<textarea value={draft.options.join('\n')} onChange={(event) => setDraft({ ...draft, options: event.target.value.split('\n') })} rows={4} placeholder={'Uma opção por linha'} /></label>}<label>Vincular a<select value={draft.entity} onChange={(event) => setDraft({ ...draft, entity: event.target.value as DynamicField['entity'] })}><option value="both">Ambos</option><option value="field">Registros de Campo</option><option value="operational">Operacional</option></select></label><div className="field-visibility"><label><input type="checkbox" checked={draft.visibleField} onChange={(event) => setDraft({ ...draft, visibleField: event.target.checked })} />Visível em Registros de Campo</label><label><input type="checkbox" checked={draft.visibleOperational} onChange={(event) => setDraft({ ...draft, visibleOperational: event.target.checked })} />Visível em Operacional</label></div><div className="dynamic-form-actions">{editingId && <button type="button" className="secondary-button" onClick={reset}>Cancelar</button>}<button className="primary-button">{editingId ? 'Salvar alterações' : 'Adicionar variável'}</button></div></form><article className="card dynamic-field-list"><div className="card-head"><div><h2>Campos configurados</h2><p>Controle a visibilidade sem excluir a estrutura dos registros.</p></div><b>{fields.length}</b></div>{fields.map((field) => <div className="dynamic-field-row" key={field.id}><span><b>{field.label}</b><small>{field.type === 'select' ? `Seleção · ${field.options.length} opções` : field.type === 'number' ? 'Numérico' : field.type === 'date' ? 'Data' : 'Texto'} · {field.entity === 'both' ? 'Ambos' : field.entity === 'field' ? 'Campo' : 'Operacional'}</small></span><label><input type="checkbox" checked={field.visibleField} onChange={(event) => updateField(field.id, { visibleField: event.target.checked })} />Campo</label><label><input type="checkbox" checked={field.visibleOperational} onChange={(event) => updateField(field.id, { visibleOperational: event.target.checked })} />Operacional</label><button className="secondary-button" onClick={() => edit(field)}>Editar</button><button className="danger-link" onClick={() => confirmAction(`Excluir a variável ${field.label}?`, () => onChange(fields.filter((item) => item.id !== field.id)))}>Excluir</button></div>)}</article></section>;
}

function CatalogManagementPanel({ locationsList, locked, selected, onToggle, onLocation, onTrials }: { locationsList: NetworkLocation[]; locked: boolean; selected: string[]; onToggle: (id: string) => void; onLocation: (event: FormEvent<HTMLFormElement>) => void; onTrials: (event: FormEvent<HTMLFormElement>) => void }) {
  const [group, setGroup] = useState<MacroGroup>('Ensaios');
  const [subtype, setSubtype] = useState('VCU');
  return <section className="management-grid">
    <form className="card management-form" onSubmit={onLocation}><fieldset disabled={locked}><span className="eyebrow">CADASTRO DIRETO</span><h2>Nova localidade</h2><div className="form-grid"><label>Código<input name="code" required placeholder="LOC-01" /></label><label>Nome<input name="name" required /></label><label>Município<input name="city" required /></label><label>UF<input name="uf" maxLength={2} required /></label><label>Região VCU<select name="region"><option>VCU I</option><option>VCU II</option><option>VCU III</option></select></label><label>Latitude<input name="lat" type="number" step="0.000001" /></label><label>Longitude<input name="lng" type="number" step="0.000001" /></label></div><button className="secondary-button">Adicionar localidade</button></fieldset></form>
    <form className="card management-form trial-batch" onSubmit={onTrials}><fieldset disabled={locked}><span className="eyebrow">ATRIBUIÇÃO POR LOCAL</span><h2>Indicar quais ensaios vão para cada local</h2><p>Configure um ensaio, marque exatamente os locais que irão recebê-lo e confirme. Repita para cada combinação necessária.</p><div className="form-grid assignment-type"><label>Grupo<select name="group" value={group} onChange={(event) => setGroup(event.target.value as MacroGroup)}><option>Ensaios</option><option>Coleção</option><option>Founder</option><option>PD</option><option>Multiqualidades</option><option>Outro</option></select></label>{group === 'Ensaios' && <label>Tipo de ensaio<select name="subtype" value={subtype} onChange={(event) => setSubtype(event.target.value)}><option>VCU</option><option>EYT</option><option>PRYT</option></select></label>}<label>Código-base<input name="trialCode" required /></label><label>Nome do ensaio<input name="trialName" required /></label></div><h3 className="assignment-heading">Locais que receberão este ensaio <b>{selected.length} selecionado(s)</b></h3><div className="location-checks">{locationsList.map((location) => <label key={location.id}><input type="checkbox" checked={selected.includes(location.id)} onChange={() => onToggle(location.id)} /><span>✓</span><b>{location.name}</b><small>{location.region.replace('_',' ')}</small></label>)}</div><div className="form-grid"><label>Código do campo<input name="fieldCode" required /></label><label>Nome do campo<input name="fieldName" required /></label><label>Parcelas por local<input name="plots" type="number" min="1" defaultValue="60" required /></label><label>Semeadura prevista<input name="sowing" type="date" required /></label><label>Responsável<input name="owner" defaultValue="Equipe de campo" required /></label><label>Prioridade<select name="priority"><option>Média</option><option>Alta</option><option>Crítica</option></select></label></div><button className="primary-button" disabled={!selected.length}>Atribuir {group === 'Ensaios' ? subtype : group} a {selected.length} local(is)</button></fieldset></form>
  </section>;
}

function HarvestManagementPanel({ harvests, activeId, clonePlanning, onClone, onCreate, onSelect, onStatus }: { harvests: Harvest[]; activeId: string; clonePlanning: boolean; onClone: (value: boolean) => void; onCreate: (event: FormEvent<HTMLFormElement>) => void; onSelect: (id: string) => void; onStatus: (id: string, status: HarvestStatus) => void }) {
  return <section className="harvest-management"><form className="card new-harvest-card" onSubmit={onCreate}><span className="eyebrow">NOVA SAFRA</span><h2>Criar ciclo operacional</h2><label>Nome da safra<input name="harvestName" required placeholder="Safra 2027" /></label><label className="clone-option"><input type="checkbox" checked={clonePlanning} onChange={(event) => onClone(event.target.checked)} /><span><b>Copiar o planejamento da safra atual</b><small>Locais, ensaios e visitas são reaproveitados; registros e notas começam vazios.</small></span></label><button className="primary-button">Confirmar e criar safra</button></form><section className="card harvest-history"><div className="card-head"><div><h2>Histórico de safras</h2><p>Consulte qualidade e situação de cada ciclo.</p></div></div>{harvests.map((harvest) => <article key={harvest.id} className={harvest.id === activeId ? 'active' : ''}><button type="button" onClick={() => onSelect(harvest.id)}><span><b>{harvest.name}</b><small>{harvest.updatedAt ? `Atualizada em ${new Date(harvest.updatedAt).toLocaleDateString('pt-BR')}` : 'Sem atualização'}</small></span><strong>{harvest.quality}/100</strong><em>{harvest.status}</em></button>{harvest.id === activeId && <button className="secondary-button" type="button" onClick={() => onStatus(harvest.id, harvest.status === 'Ativa' ? 'Encerrada' : 'Ativa')}>{harvest.status === 'Ativa' ? 'Encerrar e bloquear registros' : 'Reabrir como administrador'}</button>}</article>)}</section></section>;
}

function ResultsScreen({ trialList, activities, schedule }: { trialList: Trial[]; activities: Activity[]; schedule: PlannedActivity[] }) {
  const trialsWithActivity = new Set(activities.map((activity) => activity.trial)).size;
  const completed = schedule.filter((item) => item.status === 'Concluído').length;
  const coverage = schedule.length ? Math.round((completed / schedule.length) * 100) : 0;
  const scored = activities.filter((activity) => typeof activity.qualityScore === 'number');
  const averageQuality = scored.length ? Math.round(scored.reduce((sum, activity) => sum + (activity.qualityScore ?? 0), 0) / scored.length) : 0;
  const regions = [...new Set(locations.map((location) => location.region))];
  const regionProgress = regions.map((region) => {
    const locationIds = new Set<string>(locations.filter((location) => location.region === region).map((location) => location.id));
    const regionTrials = trialList.filter((trial) => locationIds.has(trial.locationId));
    const average = regionTrials.length ? Math.round(regionTrials.reduce((sum, trial) => sum + trial.progress, 0) / regionTrials.length) : 0;
    return { name: region, value: average };
  });
  return <><PageHead eyebrow="Consolidação" title="Resultados e qualidade" copy="Indicadores gerados pelos registros operacionais da safra 2026." action={<button className="secondary-button">Exportar relatório</button>} />
    <section className="result-hero"><div><span className="eyebrow">CONTROLE DA SAFRA</span><h2>{trialsWithActivity} ensaios registrados · qualidade média {averageQuality}/100.</h2><p>{completed} de {schedule.length} atividades do calendário foram concluídas.</p></div><div className="donut" style={{ background: `radial-gradient(circle,#315d46 56%,transparent 57%), conic-gradient(var(--lime) ${coverage}%, rgba(255,255,255,.14) 0)` }}><b>{coverage}%</b><span>executado</span></div></section>
    <section className="result-grid"><article className="card"><h2>Progresso médio por região</h2>{regionProgress.map(({ name, value }) => <div className="result-bar" key={name}><span>{name}</span><div><i style={{ width: `${value}%` }} /></div><b>{value}%</b></div>)}</article><article className="card"><h2>Dados importados</h2><div className="metric-list"><div><span>Ensaios</span><b>{trialList.length}</b></div><div><span>Atividades planejadas</span><b>{schedule.length}</b></div><div><span>Atividades realizadas</span><b>{activities.length}</b></div><div><span>Usuários</span><b>{sourceSummary.users}</b></div></div></article></section>
    <section className="card quality-table"><div className="card-head"><div><h2>Classificação dos campos</h2><p>Últimos registros com valorização e depreciação ponderadas.</p></div></div><div className="table-wrap"><table><thead><tr><th>Ensaio</th><th>Atividade</th><th>Data</th><th>Nota</th><th>Classificação</th></tr></thead><tbody>{scored.slice(0, 8).map((activity) => { const trial = trialList.find((item) => item.id === activity.trial); const adjusted = trial ? trialQuality(trial, activities).score : activity.qualityScore; return <tr key={activity.id}><td><b>{trial?.name ?? activity.trial}</b>{trial?.lostPlots?.length ? <small className="lost-plots">{trial.lostPlots.length} perdida(s): {trial.lostPlots.join(', ')}</small> : null}</td><td>{activity.type}</td><td>{activity.date}</td><td><b>{adjusted}/100</b></td><td><Status kind={(adjusted ?? 0) >= 70 ? 'ok' : (adjusted ?? 0) >= 50 ? 'attention' : 'late'}>{adjusted && adjusted >= 85 ? 'Excelente' : adjusted && adjusted >= 70 ? 'Adequado' : adjusted && adjusted >= 50 ? 'Atenção' : 'Crítico'}</Status></td></tr>; })}</tbody></table></div></section>
  </>;
}

function UsersScreen() {
  return <><PageHead eyebrow="Equipe · Excel" title="Usuários" copy={`${sourceSummary.users} pessoas com acesso cadastradas na planilha.`} action={<button className="primary-button">＋ Convidar usuário</button>} />
    <section className="user-grid">{importedUsers.map((user, index) => { const initials = user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(); return <article className="card user-card" key={user.id}><div className={`avatar color-${index}`}>{initials}</div><div><h2>{user.name}</h2><p>{user.role}</p><span>◎ {user.locations}</span></div><Status kind={user.active ? 'ok' : 'attention'}>{user.active ? 'Ativo' : 'Pendente'}</Status><button>•••</button></article>; })}</section>
  </>;
}

function TrialDetail({ trial, activities, schedule, onBack, onActivity, onPlannedActivity }: { trial: Trial; activities: Activity[]; schedule: PlannedActivity[]; onBack: () => void; onActivity: () => void; onPlannedActivity: (item: PlannedActivity) => void }) {
  const quality = trialQuality(trial, activities);
  return <><button className="back-button" onClick={onBack}>← Voltar para ensaios</button><PageHead eyebrow={trial.id} title={trial.name} copy={`${trial.place} · Safra 2026 · ${trial.plots} parcelas`} action={<button className="primary-button" onClick={onActivity}>＋ Registrar atividade</button>} />
    <section className="detail-grid"><article className="card protocol-card"><div className="card-head"><div><h2>Ficha do ensaio</h2><p>Informações gerais importadas do Excel.</p></div><QualityBadge trial={trial} activities={activities} /></div><dl><div><dt>Tipo do ensaio</dt><dd>{trial.type}</dd></div><div><dt>Estádio fenológico</dt><dd>{phenologicalStage(trial)}</dd></div><div><dt>Prioridade</dt><dd>{trial.priority}</dd></div><div><dt>Parcelas</dt><dd>{trial.plots.toLocaleString('pt-BR')}</dd></div><div><dt>Semeadura</dt><dd>{formatDate(trial.sowing)}</dd></div><div><dt>Responsável</dt><dd>{trial.owner}</dd></div></dl></article><article className="card progress-card"><span className="eyebrow">Progresso do ciclo</span><b>{trial.progress}%</b><div className="progress"><i style={{ width: `${trial.progress}%` }} /></div><ul><li className="done">Semeadura</li><li className="done">Emergência</li><li className="active">{phenologicalStage(trial)}</li><li>Próximo manejo</li><li>Colheita · {formatDate(trial.harvest)}</li></ul></article></section>
    {quality.alerts.length > 0 && <section className="card trial-alerts"><div className="card-head"><div><span className="eyebrow">ALERTAS QUE IMPACTAM A QUALIDADE</span><h2>Ocorrências abertas</h2><p>Desconto acumulado de {quality.penalty}% na qualidade deste ensaio.</p></div><strong>−{quality.penalty}%</strong></div>{quality.alerts.map((alert) => <article key={alert.id}><span>!</span><div><b>{alert.alertCategory}</b><p>{alert.details?.ocorrencia || alert.notes}</p><small>{alert.date} · {alert.scope}{alert.plotIds?.length ? ` · PlotID: ${alert.plotIds.join(', ')}` : ''}</small></div><em>−{alert.qualityPenalty}%</em></article>)}</section>}
    <section className="card detail-activity"><div className="card-head"><div><h2>Próximos manejos</h2><p>Clique em um manejo para realizar o registro.</p></div></div>{schedule.filter((item) => item.trialId === trial.id && item.start >= sourceSummary.importedAt && item.status !== 'Concluído').sort((a, b) => a.start.localeCompare(b.start)).slice(0, 3).map((item, index) => { const date = dateParts(item.start); return <button className="management-row" key={item.id} onClick={() => onPlannedActivity(item)}><span>{date.day} {date.month}</span><div><b>{item.activity}</b><p>{item.category} · Responsável: {item.owner}</p></div><Status kind={index === 0 ? 'attention' : 'ok'}>{item.version > 1 ? `Versão ${item.version}` : index === 0 ? 'Próximo' : 'Planejado'}</Status></button>; })}</section>
  </>;
}
