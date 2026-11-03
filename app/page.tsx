'use client';

import dynamic from 'next/dynamic';
import { FormEvent, createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Screen, ActivityStream, MacroGroup, MacroStage, PhenologyVisit, Activity, PlannedActivity, Trial, ViewContext, PlanningWizardConfig, HarvestStatus, Harvest, HarvestSnapshot, DynamicFieldType, DynamicField, ActivityTemplate, AppRole } from '../domain/types';
import type { NetworkLocation } from '../components/NetworkMap';
import type { LayoutSnapshot } from '../domain/layout';
import type { LayoutFinalization } from '../components/FieldLayoutMap';
import { fetchWeatherConditions, type LocationWeather } from '../lib/weatherAlerts';
import RoutePlanner from '../components/RoutePlanner';
import { readArray, readJson } from '../lib/storage';
import { saveHarvestBundle } from '../lib/harvestRepository';
import { buildFieldPlanning } from '../lib/fieldPlanning';
import { groupFromCategory, macroGroupFor } from '../lib/trialGroups';
import { actualSowingDate, activityAppliesToTrial, isTrialHarvested } from '../lib/fieldStatus';
import { todayIso } from '../lib/dates';
import { addDays } from '../lib/dates';
import { parseLayout, stringifyLayout } from '../lib/layoutStorage';
import { mountNavigationAssistant } from '../lib/navigation-assistant.js';
import MobileAgenda from '../components/MobileAgenda';
import { PhotoCapture, ActivityPhotoGallery } from '../components/ActivityPhotos';
import { saveActivityPhotos, deleteActivityPhotos } from '../lib/activityPhotos';
import {
  importedUsers,
  sourceSummary,
} from './data/rede';

const NetworkMap = dynamic(() => import('../components/NetworkMap'), { ssr: false });
const FieldLayoutMap = dynamic(() => import('../components/FieldLayoutMap'), { ssr: false });


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

const baseLocations: NetworkLocation[] = [];
const baseTrials: Trial[] = [];
const basePlanning: PlannedActivity[] = [];
const baseActivities: Activity[] = [];
const initialPlanning: PlannedActivity[] = basePlanning.map((activity) => ({ ...activity }));
const initialActivities: Activity[] = baseActivities.map((activity) => ({ ...activity }));
const blankTrial: Trial = { id: '', name: '', type: '', year: 2026, cycle: 'Safra 2026', locationId: '', plots: 0, sowing: sourceSummary.importedAt, harvest: sourceSummary.importedAt, owner: '', rawStatus: 'Planejado', priority: 'Normal', notes: '', place: '', city: '', status: 'Planejado', progress: 0, next: '', nextDate: sourceSummary.importedAt, date: '' };
const currentUser = importedUsers[0];
const roleScreens: Record<AppRole, Screen[]> = {
  Administrador: ['dashboard','mapa','rotas','clima','ensaios','planejamento','operacional','campo','atividade','historico','usuarios','cadastros','detalhe'],
  Gestor: ['dashboard','mapa','rotas','clima','ensaios','planejamento','operacional','campo','atividade','historico','cadastros','detalhe'],
  RA: ['dashboard','mapa','rotas','clima','ensaios','planejamento','operacional','campo','atividade','historico','cadastros','detalhe'],
  'Técnico responsável': ['dashboard','mapa','rotas','clima','ensaios','planejamento','operacional','campo','atividade','historico','detalhe'],
};
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
  const registered = activities.find((activity) => activityAppliesToTrial(activity, trial) && typeof activity.qualityScore === 'number');
  const baseScore = registered?.qualityScore ?? (trial.priority === 'Crítica' ? 46 : trial.priority === 'Alta' ? 64 : 76);
  const applicableAlerts = activities.filter((activity) => (activity.trial === trial.id || (activity.locationId === trial.locationId && (activity.scope === 'Local inteiro' || activity.scope === 'Tipo de ensaio' && activity.macroGroup === macroGroupFor(trial)))) && Number(activity.qualityPenalty ?? 0) > 0);
  const penalty = Math.min(100, applicableAlerts.reduce((sum, activity) => sum + Number(activity.qualityPenalty ?? 0), 0));
  const score = Math.max(0, Math.round(baseScore - (trial.layoutPenalty ?? 0) - penalty));
  const label = score >= 85 ? 'Excelente' : score >= 70 ? 'Adequado' : score >= 50 ? 'Atenção' : 'Crítico';
  const tone = score >= 85 ? 'excellent' : score >= 70 ? 'adequate' : score >= 50 ? 'attention' : 'critical';
  return { score, label, tone, measured: Boolean(registered), penalty: penalty + (trial.layoutPenalty ?? 0), alerts: applicableAlerts };
}





function qualityTone(score: number): Exclude<NonNullable<NetworkLocation['qualityTone']>, 'neutral'> {
  return score >= 85 ? 'excellent' : score >= 70 ? 'adequate' : score >= 50 ? 'attention' : 'critical';
}

function activityDateIso(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = value.split('/');
  return parts.length === 3 ? parts.reverse().join('-') : value.slice(0, 10);
}



function rhaCode(value?: string) {
  const number = String(value ?? '').match(/[123]/)?.[0] ?? '1';
  return `RHA_${number}`;
}

function rhaLabel(value?: string) {
  return rhaCode(value).replace('_1', ' I').replace('_2', ' II').replace('_3', ' III');
}

function localityOverview(locationId: string, trialList: Trial[], activities: Activity[], schedule: PlannedActivity[]) {
  const localTrials = trialList.filter((trial) => trial.locationId === locationId);
  const actualSowingDates = new Map(localTrials.map((trial) => [trial.id, actualSowingDate(trial, activities, schedule)]));
  const planted = localTrials.filter((trial) => Boolean(actualSowingDates.get(trial.id))).length;
  const plantedPercent = localTrials.length ? Math.round((planted / localTrials.length) * 100) : 0;
  const stages = localTrials.flatMap((trial) => { const sowingDate = actualSowingDates.get(trial.id); return sowingDate ? [phenologicalStage(trial, sowingDate)] : []; });
  const stage = stages.sort((a, b) => stages.filter((item) => item === b).length - stages.filter((item) => item === a).length)[0] ?? 'Pré-semeadura';
  const quality = localTrials.length ? Math.round(localTrials.reduce((sum, trial) => sum + trialQuality(trial, activities).score, 0) / localTrials.length) : 0;
  const ids = new Set(localTrials.map((trial) => trial.id));
  const localPlan = schedule.filter((item) => ids.has(item.trialId));
  const completion = (matcher: (item: PlannedActivity) => boolean, fallback: number) => {
    const items = localPlan.filter(matcher);
    return items.length ? Math.round((items.filter((item) => item.status === 'Concluído').length / items.length) * 100) : fallback;
  };
  const sowing = plantedPercent;
  const conduction = completion((item) => !/seme|identifica|etiqueta|colhe/i.test(`${item.activity} ${item.category}`), plantedPercent > 0 ? 35 : 0);
  const harvest = Math.round(localTrials.filter((trial) => isTrialHarvested(trial, activities, schedule)).length / Math.max(localTrials.length, 1) * 100);
  const groups = [...new Set(localTrials.map(macroGroupFor))];
  return { localTrials, planted, plantedPercent, stage, quality, tone: qualityTone(quality), sowing, conduction, harvest, groups };
}

function phenologicalStage(trial: Trial, sowingDate = trial.sowing) {
  const days = daysBetween(sowingDate, new Date().toISOString().slice(0, 10));
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
  { screen: 'clima', icon: '☁', label: 'Condições climáticas' },
  { screen: 'ensaios', icon: '🌱', label: 'Ensaios' },
  { screen: 'planejamento', icon: '▦', label: 'Planejamento' },
  { screen: 'rotas', icon: '⌖', label: 'Rotas' },
  { screen: 'operacional', icon: '⚒', label: 'Registro operacional' },
  { screen: 'campo', icon: '✓', label: 'Registro de campo' },
  { screen: 'historico', icon: '↺', label: 'Histórico' },

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

const ProgramLocations = createContext<NetworkLocation[] | null>(null);
function locationProgram(location: NetworkLocation): 'U' | 'K' | 'X' {
  // Compatibility keeps legacy sites in their existing folder; new sites always store program independently.
  return location.program ?? ({ RHA_1: 'U', RHA_2: 'K', RHA_3: 'X' } as const)[rhaCode(location.rha || location.region) as 'RHA_1' | 'RHA_2' | 'RHA_3'];
}
const programs = [
  { id: 'U', name: 'Programa U', program: 'Programa U' },
  { id: 'K', name: 'Programa K', program: 'Programa K' },
  { id: 'X', name: 'Programa X', program: 'Programa X' },
];
export default function Home() {
  const [locations, setLocations] = useState<NetworkLocation[]>(() => readArray('field-wheat-locations-clean-v1'));
  const [trials, setTrials] = useState<Trial[]>(() => readArray('field-wheat-imported-trials-clean-v1'));
  const [programId, setProgramId] = useState('Brasil');
  const [phase, setPhase] = useState<'login' | 'profile' | 'app'>('login');
  const [savingActivity, setSavingActivity] = useState(false);
  const [areaBackupAvailable, setAreaBackupAvailable] = useState(() => typeof window !== 'undefined' && Boolean(localStorage.getItem('field-wheat-area-backup-v1')));
  function resetAreas() {
    if (currentRole !== 'Administrador') return;
    try {
      const snapshot: HarvestSnapshot = { locations: [...locations], trials: allTrials, schedule, activities, source: JSON.parse(localStorage.getItem('field-wheat-unified-source-v1') ?? '[]'), updatedAt: new Date().toISOString() };
      const keys = Object.keys(localStorage).filter((key) => locations.some((location) => key === `field-wheat-layout-${activeHarvestId}-${location.id}` || key === `field-wheat-layout-catalog-${activeHarvestId}-${location.id}`));
      const layouts = Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)]));
      // Persist recovery data before removing any current records.
      localStorage.setItem('field-wheat-area-backup-v1', JSON.stringify({ harvestId: activeHarvestId, snapshot, layouts }));
      const empty: HarvestSnapshot = { locations: [], trials: [], schedule: [], activities: [], source: [], updatedAt: new Date().toISOString() };
      persistHarvestSnapshot(empty);
      keys.forEach((key) => localStorage.removeItem(key));
      for (const key of ['field-wheat-locations-clean-v1', 'field-wheat-imported-trials-clean-v1', 'field-wheat-trials-clean-v1', 'field-wheat-schedule-clean-v1', 'field-wheat-activities-clean-v1', 'field-wheat-unified-source-v1']) localStorage.setItem(key, '[]');
      setLocations([]); setTrials([]); setRegisteredTrials([]); setSchedule([]); setActivities([]); setSelectedTrial(blankTrial); setSelectedPlan(null); setWeatherConditions([]); setWeatherCheckedAt(''); localStorage.removeItem('field-wheat-weather-conditions-v2'); localStorage.removeItem('field-wheat-weather-checked-v2'); setAreaBackupAvailable(true);
      setToast('Áreas da safra limpas. Uma cópia recuperável foi preservada neste navegador.');
    } catch { setToast('Não foi possível preservar a cópia de segurança. A limpeza não foi concluída.'); }
  }
  function restoreAreas() {
    if (currentRole !== 'Administrador' || locations.length) return;
    try {
      const backup = JSON.parse(localStorage.getItem('field-wheat-area-backup-v1') ?? 'null') as { harvestId: string; snapshot: HarvestSnapshot; layouts: Record<string, string> } | null;
      if (!backup || backup.harvestId !== activeHarvestId) { setToast('A cópia pertence a outra safra. Selecione a safra correspondente para recuperá-la.'); return; }
      const snapshot = backup.snapshot;
      Object.entries(backup.layouts).forEach(([key, value]) => localStorage.setItem(key, value));
      persistHarvestSnapshot(snapshot);
      localStorage.setItem('field-wheat-unified-source-v1', JSON.stringify(snapshot.source));
      setLocations(snapshot.locations); setTrials(snapshot.trials); setRegisteredTrials([]); setSchedule(snapshot.schedule); setActivities(snapshot.activities); setSelectedTrial(snapshot.trials[0] ?? blankTrial);
      setToast('Cópia das áreas recuperada.');
    } catch { setToast('Não foi possível recuperar a cópia das áreas.'); }
  }
  useEffect(() => {
    if (phase !== 'app') return;
    return mountNavigationAssistant();
  }, [phase]);
  const [currentRole, setCurrentRole] = useState<AppRole>(() => typeof window === 'undefined' ? 'Administrador' : (localStorage.getItem('field-wheat-current-role-v1') as AppRole) || 'Administrador');
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [registeredTrials, setRegisteredTrials] = useState<Trial[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(window.localStorage.getItem('field-wheat-trials-clean-v1') ?? '[]'); } catch { return []; }
  });
  const allTrials = useMemo(() => [...new Map([...trials, ...registeredTrials].map((trial) => [trial.id, trial])).values()], [registeredTrials, trials]);
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
  const [weatherConditions, setWeatherConditions] = useState<LocationWeather[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('field-wheat-weather-conditions-v2') ?? '[]'); } catch { return []; }
  });
  const [weatherChecking, setWeatherChecking] = useState(false);
  const [weatherCheckedAt, setWeatherCheckedAt] = useState(() => typeof window === 'undefined' ? '' : localStorage.getItem('field-wheat-weather-checked-v2') ?? '');
  const activeHarvest = harvests.find((harvest) => harvest.id === activeHarvestId) ?? harvests[0];

  function updateActivityFields(next: DynamicField[]) {
    setActivityFields(next);
    localStorage.setItem('field-wheat-dynamic-fields-v1', JSON.stringify(next));
  }

  function updateActivityTemplates(next: ActivityTemplate[]) {
    setActivityTemplates(next);
    localStorage.setItem('field-wheat-activity-templates-v2', JSON.stringify(next));
  }

  async function refreshWeatherConditions() {
    if (!locations.length || weatherChecking) return;
    setWeatherChecking(true);
    try {
      const sowingDates = Object.fromEntries(locations.flatMap((location) => { const dates = allTrials.filter((trial) => trial.locationId === location.id).map((trial) => actualSowingDate(trial, activities, schedule)).filter((date): date is string => Boolean(date)).sort(); return dates[0] ? [[location.id, dates[0]]] : []; }));
      const result = await fetchWeatherConditions(locations, sowingDates);
      setWeatherConditions(result.snapshots); setWeatherCheckedAt(result.checkedAt);
      localStorage.setItem('field-wheat-weather-conditions-v2', JSON.stringify(result.snapshots));
      localStorage.setItem('field-wheat-weather-checked-v2', result.checkedAt);
      setToast(`Condições climáticas atualizadas para ${result.snapshots.length} localidade(s).`);
      if (result.errors.length) console.warn('Fontes meteorológicas indisponíveis:', result.errors);
    } catch { setToast('Não foi possível consultar as fontes meteorológicas agora.'); }
    finally { setWeatherChecking(false); setTimeout(() => setToast(''), 4500); }
  }

  useEffect(() => {
    if (phase === 'app' && !weatherChecking && (!weatherConditions.length || !weatherCheckedAt || Date.now() - new Date(weatherCheckedAt).getTime() > 3 * 60 * 60 * 1000)) void refreshWeatherConditions();
    // A primeira consulta ocorre somente ao entrar na plataforma; as demais são manuais.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

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
      const savedLocations = (snapshot ? snapshot.locations : storedLocations.length ? storedLocations : baseLocations).map((location) => ({ ...location, program: locationProgram(location) }));
      const savedTrials = snapshot ? snapshot.trials : storedTrials.length ? storedTrials : baseTrials;
      setLocations(savedLocations);
      setTrials(savedTrials);
      if (snapshot) { setSchedule(snapshot.schedule); setActivities(snapshot.activities); setLastUpdated(snapshot.updatedAt); localStorage.setItem('field-wheat-unified-source-v1', JSON.stringify(snapshot.source)); }
      if (savedTrials[0]) setSelectedTrial(savedTrials[0]);

    } catch { /* A base incorporada permanece disponível quando o armazenamento local é inválido. */ }
  }, []);


  function switchHarvest(harvestId: string) {
    persistHarvestSnapshot();
    const snapshots = JSON.parse(localStorage.getItem('field-wheat-harvest-data-v2') ?? '{}') as Record<string, HarvestSnapshot>;
    const snapshot = snapshots[harvestId] ?? { locations: [], trials: [], schedule: [], activities: [], source: [], updatedAt: '' };
    setLocations(snapshot.locations); setTrials(snapshot.trials);
    setRegisteredTrials([]); setSchedule(snapshot.schedule); setActivities(snapshot.activities); setSelectedTrial(snapshot.trials[0] ?? blankTrial); setLastUpdated(snapshot.updatedAt);
    localStorage.setItem('field-wheat-unified-source-v1', JSON.stringify(snapshot.source)); localStorage.setItem('field-wheat-active-harvest-v2', harvestId); setActiveHarvestId(harvestId);  go('dashboard');
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

  const scopedLocations = locations.filter((location) => programId === 'Brasil' || locationProgram(location) === programId);
  const scopedLocationIds = new Set(scopedLocations.map((location) => location.id));
  const scopedTrials = allTrials.filter((trial) => scopedLocationIds.has(trial.locationId));
  const scopedTrialIds = new Set(scopedTrials.map((trial) => trial.id));
  const scopedSchedule = schedule.filter((item) => item.locationId ? scopedLocationIds.has(item.locationId) : scopedTrialIds.has(item.trialId));
  const scopedActivities = activities.filter((item) => item.locationId ? scopedLocationIds.has(item.locationId) : scopedTrialIds.has(item.trial));
  const activeProgram = programs.find((program) => program.id === programId);
  function assignLocationProgram(locationId: string, program: 'U' | 'K' | 'X') {
    const nextLocations = locations.map((location) => ({ ...location, program: location.id === locationId ? program : locationProgram(location) }));
    setLocations(nextLocations);
    localStorage.setItem('field-wheat-locations-clean-v1', JSON.stringify(nextLocations));
    const source = JSON.parse(localStorage.getItem('field-wheat-unified-source-v1') ?? '[]') as Record<string, unknown>[];
    const nextSource = source.map((row) => String(row.local_codigo) === locationId ? { ...row, programa: program } : row);
    localStorage.setItem('field-wheat-unified-source-v1', JSON.stringify(nextSource));
    const updatedAt = persistHarvestSnapshot({ locations: nextLocations, source: nextSource });
    touchHarvest(updatedAt);
  }
  const selectProgram = (id: string) => { setProgramId(id); if (screen === 'detalhe') setScreen('ensaios'); setSelectedPlan(null); setViewContext({}); setSelectedTrial(allTrials.find((trial) => locations.some((location) => location.id === trial.locationId && locationProgram(location) === id)) ?? blankTrial); };
  const go = (next: Screen) => { if (programId === 'Brasil' && !['dashboard','usuarios'].includes(next)) { setToast('Abra um programa para acessar o acompanhamento operacional.'); return; } setScreen(next); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  function openFiltered(context: ViewContext) {
    setViewContext(context);
    go('ensaios');
  }

  async function saveActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingActivity) return;
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
    if (programId === 'Brasil' || !scopedLocationIds.has(locationId)) { setToast('Selecione um local do programa ativo para registrar a atividade.'); return; }
    const activePlan = schedule.find((item) => item.id === plannedId);
    const areaCategory = String(data.get('areaCategory') || activePlan?.areaCategory || 'Ensaios');
    const macroGroup = String(data.get('macroGroup') || data.get('baseMacroGroup') || groupFromCategory(areaCategory)) as MacroGroup;
    const macroStage = String(data.get('macroStage') || 'Condução') as MacroStage;
    const recordStream = String(data.get('recordStream') || 'field') as ActivityStream;
    const scope = String(data.get('scope') || data.get('baseScope') || 'Categoria da área');
    const selectedTrialId = String(data.get('adverseTrial') || '');
    const matchingTrial = allTrials.find((trial) => trial.id === selectedTrialId) ?? allTrials.find((trial) => trial.id === activePlan?.trialId) ?? allTrials.find((trial) => trial.locationId === locationId && (trial.areaCategory === areaCategory || macroGroupFor(trial) === macroGroup)) ?? selectedTrial;
    const fillDate = String(data.get('fillPlannedDate') || '');
    const needsFill = data.get('fillPlanted') === 'Não';
    if (needsFill && (!/^\d{4}-\d{2}-\d{2}$/.test(fillDate) || fillDate < String(data.get('date')))) { setToast('Informe a data prevista do plantio do enchimento, igual ou posterior à data do registro.'); return; }
    const alertCategory = String(data.get('adverseCategory') || ''); const adverseQuantity = Number(data.get('adverseQuantity') || 1);
    const penalty = alertCategory ? adversePenalty(alertCategory, adverseQuantity, Number(data.get('manualPenalty') || 0)) : 0;
    const selectedPhotos = Array.from(data.entries()).filter(([key, entry]) => (key.startsWith('checkPhoto-') || ['riskPhotos','photos','cameraPhoto','adversePhotos'].includes(key)) && entry instanceof File && entry.size > 0).map(([, entry]) => entry as File);
    const activityId = Date.now();
    let storedPhotoIds: string[] = [];
    let recordCommitted = false;
    setSavingActivity(true);
    try {
    storedPhotoIds = await saveActivityPhotos(activityId, selectedPhotos);
    const photoFiles = selectedPhotos.map((file) => file.name);
    const next: Activity = {
      id: activityId,
      date: new Date(`${data.get('date')}T12:00:00`).toLocaleDateString('pt-BR'),
      trial: matchingTrial.id,
      type: String(data.get('visitStage') || macroStage),
      owner: currentUser?.name ?? 'Igor',
      notes: String(data.get('notes')) || 'Atividade registrada sem observações.',
      stream: recordStream,
      plannedId: plannedId || undefined,
      qualityScore: recordStream === 'field' ? quality.score : undefined,
      qualityClass: recordStream === 'field' ? quality.label : undefined,
      locationId,
      scope,
      macroGroup,
      macroStage,
      checks: data.getAll('checks').map(String),
      photos: photoFiles,
      photoIds: storedPhotoIds,
      alertCategory: alertCategory || undefined,
      qualityPenalty: penalty || undefined,
      plotIds: String(data.get('adversePlotIds') || '').split(/[;,\s]+/).map((item) => item.trim()).filter(Boolean),
      details: { categoria_area: areaCategory, estadio: String(data.get('visitStage') || data.get('stage') || ''), estadio_previsto: String(data.get('expectedStage') || ''), motivo_alteracao_estadio: String(data.get('stageReason') || ''), fluxo: recordStream, condicao_operacao: String(data.get('condition') || ''), enchimento_plantado: String(data.get('fillPlanted') || ''), data_prevista_enchimento: needsFill ? fillDate : '', produto: String(data.get('product') || ''), dose: String(data.get('dose') || ''), estabelecimento: String(establishment), uniformidade: String(uniformity), daninhas: String(weeds), doencas: String(disease), controle_daninhas: String(data.get('weedControl') || ''), oidio: String(data.get('oidio') || ''), ferrugem: String(data.get('ferrugem') || ''), manchas: String(data.get('manchas') || ''), ocorrencia: String(data.get('adverseDescription') || ''), quantidade_afetada: String(adverseQuantity), ...Object.fromEntries([...data.entries()].filter(([key]) => key.startsWith('dynamic-')).map(([key, value]) => [key.slice(8), String(value)])) },
    };
    const updated = [next, ...activities];
    let nextSchedule = schedule;
    if (plannedId || needsFill) {
      nextSchedule = schedule.map((item) => item.id === plannedId ? { ...item, status: 'Concluído' } : item);
      if (needsFill) {
        const pendingFill = nextSchedule.find((item) => item.locationId === locationId && item.areaCategory === areaCategory && item.activityTemplateId === 'op-fill-sowing' && item.status !== 'Concluído');
        const fillPlan: PlannedActivity = { id: pendingFill?.id ?? `fill-${activityId}`, trialId: matchingTrial.id, locationId, areaCategory, activityTemplateId: 'op-fill-sowing', activity: 'Plantio do enchimento', category: 'Operacional', start: fillDate, end: fillDate, owner: activePlan?.owner ?? next.owner, priority: 'Normal', status: 'Não iniciado', notes: `Enchimento não plantado no registro de ${next.date}. Abrangência: ${areaCategory}.`, originalStart: pendingFill?.originalStart ?? fillDate, originalEnd: pendingFill?.originalEnd ?? fillDate, version: pendingFill ? pendingFill.version + 1 : 1 };
        nextSchedule = [...nextSchedule.filter((item) => item.id !== fillPlan.id), fillPlan];
      }
    }
    const snapshot: HarvestSnapshot = { locations, trials: allTrials, schedule: nextSchedule, activities: updated, source: readJson('field-wheat-unified-source-v1', []), updatedAt: new Date().toISOString() };
    const queued = navigator.onLine ? pendingSync : pendingSync + 1;
    const nextHarvests = saveHarvestBundle(activeHarvestId, snapshot, harvests, { 'field-wheat-pending-sync-v1': String(queued) });
    recordCommitted = true;
    setActivities(updated); setSchedule(nextSchedule); setHarvests(nextHarvests); setLastUpdated(snapshot.updatedAt); setPendingSync(queued);
    setSelectedPlan(null);
    setToast(recordStream === 'field' ? `Registro de campo salvo em ${locations.find((location) => location.id === locationId)?.name}. Qualidade: ${quality.label} (${quality.score}/100).` : `Registro operacional salvo em ${locations.find((location) => location.id === locationId)?.name}.`);
    go('historico');
    setTimeout(() => setToast(''), 3500);
    } catch (error) {
      if (!recordCommitted) await deleteActivityPhotos(storedPhotoIds).catch(() => undefined);
      setToast(recordCommitted ? 'Registro salvo neste aparelho. Não foi possível atualizar todos os resumos; recarregue a página.' : error instanceof Error ? error.message : 'Não foi possível salvar o registro. Tente novamente.');
    } finally { setSavingActivity(false); }
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
      setLocations(imported);
      localStorage.setItem('field-wheat-locations-clean-v1', JSON.stringify(imported));

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
      setTrials(imported);
      localStorage.setItem('field-wheat-imported-trials-clean-v1', JSON.stringify(imported));
      if (imported[0]) setSelectedTrial(imported[0]);

      setToast(`${imported.length} ensaios carregados e vinculados aos campos.`);
    } else if (dataset === 'Atividades') {
      const imported = rows.map((row, index): Activity => { const stage = String(row.etapa ?? 'Visita'); const stream: ActivityStream = /semeadura|aduba|aplica|colheita/i.test(stage) ? 'operational' : 'field'; return { id: Date.now() + index, date: String(row.data ?? ''), trial: String(row.ensaio_id ?? ''), type: stage, stream, owner: String(row.responsavel ?? 'Equipe de campo'), notes: String(row.observacoes ?? ''), locationId: String(row.localidade_id ?? ''), macroStage: /semeadura/i.test(stage) ? 'Semeadura' : /colheita|maturidade/i.test(stage) ? 'Colheita' : 'Condução', qualityScore: Number(row.nota_qualidade ?? 0) || undefined, qualityClass: String(row.classificacao ?? '') || undefined }; });
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
      id: clean(row.local_codigo), name: clean(row.local_nome), city: [clean(row.municipio), clean(row.uf)].filter(Boolean).join(' - '), program: (['U','K','X'].includes(clean(row.programa)) ? clean(row.programa) : programId === 'Brasil' ? 'U' : programId) as 'U' | 'K' | 'X',
      region: rhaCode(clean(row.rha_regiao) || clean(row.vcu_regiao)), rha: rhaCode(clean(row.rha_regiao) || clean(row.vcu_regiao)),
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
      const stage = clean(row.estadio_fenologico) || 'Visita';
      const stream: ActivityStream = /operacional/i.test(clean(row.tipo_registro)) || /semeadura|aduba|aplica|colheita/i.test(stage) ? 'operational' : 'field';
      return { id: Date.now() + index, date: formatDate(date(row.data_realizada)), trial: clean(row.ensaio_codigo), type: stage, stream, owner: clean(row.responsavel) || 'Equipe de campo', notes: clean(row.observacoes) || 'Registro importado da planilha unificada', plannedId: clean(row.visita_codigo), qualityScore, qualityClass: clean(row.classificacao) || (qualityScore >= 85 ? 'Excelente' : qualityScore >= 70 ? 'Adequado' : qualityScore >= 50 ? 'Atenção' : 'Crítico'), locationId: clean(row.local_codigo), macroGroup: (clean(row.grupo) || 'Outro') as MacroGroup, macroStage: (/semeadura/i.test(stage) ? 'Semeadura' : /maturidade|colheita/i.test(stage) ? 'Colheita' : 'Condução') as MacroStage, checks: clean(row.checklist_concluido) ? [clean(row.checklist_concluido)] : [], photos: clean(row.fotos) ? clean(row.fotos).split(/[;,]/).map((item) => item.trim()).filter(Boolean) : [], details: { fluxo: stream, estabelecimento: clean(row.estabelecimento_nota), uniformidade: clean(row.uniformidade_nota), daninhas: clean(row.daninhas_nota), controle_daninhas: clean(row.controle_daninhas), oidio: clean(row.oidio_nota), ferrugem: clean(row.ferrugem_nota), manchas: clean(row.manchas_nota), qualidade_grupo: clean(row.qualidade_grupo_nota) } };
    });
    importedLocations.forEach((location) => { const localTrials = importedTrials.filter((trial) => trial.locationId === location.id); location.trials = localTrials.length; location.plots = localTrials.reduce((sum, trial) => sum + trial.plots, 0); });
    setLocations(importedLocations);
    setTrials(importedTrials);
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
    if (activeHarvest?.status === 'Encerrada') throw new Error('Safra encerrada. Reabra-a antes de salvar o croqui.');
    const current: HarvestSnapshot = { locations, trials: allTrials, schedule, activities, source: readJson('field-wheat-unified-source-v1', []), updatedAt: lastUpdated };
    const snapshot = buildFieldPlanning(payload, current, activityTemplates, { program: (programId === 'Brasil' ? 'U' : programId) as 'U' | 'K' | 'X', rha: rhaCode(payload.location.rha || payload.location.region), harvestName: activeHarvest?.name ?? '' });
    const nextHarvests = saveHarvestBundle(activeHarvestId, snapshot, harvests, payload.storageUpdates);
    setLocations(snapshot.locations); setTrials(snapshot.trials); setRegisteredTrials([]); setSchedule(snapshot.schedule); setActivities(snapshot.activities); setHarvests(nextHarvests); setLastUpdated(snapshot.updatedAt);
    setToast('Mapa, ensaios e planejamento salvos.'); setTimeout(() => setToast(''), 4500);
  }

  function addManagedLocation(input: { code: string; name: string; city: string; uf: string; region: string; lat: number; lng: number }) {
    if (activeHarvest?.status === 'Encerrada') { setToast('Safra encerrada. Reabra-a para editar cadastros.'); return; }
    const nextLocation: NetworkLocation = { id: input.code.trim().toUpperCase(), name: input.name.trim(), city: `${input.city.trim()} - ${input.uf.trim().toUpperCase()}`, program: (programId === 'Brasil' ? 'U' : programId) as 'U' | 'K' | 'X', region: rhaCode(input.region), rha: rhaCode(input.region), lat: input.lat || -29.63, lng: input.lng || -53.05, trials: 0, plots: 0, status: 'ok' };
    const nextLocations = [...locations.filter((item) => item.id !== nextLocation.id), nextLocation]; setLocations(nextLocations); localStorage.setItem('field-wheat-locations-clean-v1', JSON.stringify(nextLocations));
    const source = JSON.parse(localStorage.getItem('field-wheat-unified-source-v1') ?? '[]') as Record<string, unknown>[]; const nextSource = [...source.filter((row) => String(row.local_codigo) !== nextLocation.id || row.ensaio_codigo), { safra: activeHarvest?.name, programa: nextLocation.program, local_codigo: nextLocation.id, local_nome: nextLocation.name, municipio: input.city, uf: input.uf.toUpperCase(), latitude: nextLocation.lat, longitude: nextLocation.lng, rha_regiao: rhaLabel(nextLocation.rha), tipo_registro: 'Localidade' }]; localStorage.setItem('field-wheat-unified-source-v1', JSON.stringify(nextSource));
    const updatedAt = persistHarvestSnapshot({ locations: nextLocations, source: nextSource }); touchHarvest(updatedAt);  setToast(`${nextLocation.name} adicionada à ${activeHarvest?.name}.`); setTimeout(() => setToast(''), 3500);
  }

  function addManagedTrials(input: { locationIds: string[]; trialCode: string; trialName: string; group: MacroGroup; subtype: string; fieldCode: string; fieldName: string; plots: number; sowing: string; owner: string; priority: string }) {
    if (activeHarvest?.status === 'Encerrada' || !input.locationIds.length) { setToast(activeHarvest?.status === 'Encerrada' ? 'Safra encerrada. Reabra-a para editar cadastros.' : 'Selecione pelo menos uma localidade.'); return; }
    const stages: [PhenologyVisit, number][] = [['Semeadura',0],['Perfilhamento',20],['Alongamento',40],['Emborrachamento',55],['Espigamento',70],['Enchimento de grão',90],['Maturidade',120]];
    const createdTrials: Trial[] = []; const createdSchedule: PlannedActivity[] = []; const createdRows: Record<string, unknown>[] = [];
    input.locationIds.forEach((locationId) => { const location = locations.find((item) => item.id === locationId); if (!location) return; const id = `${input.trialCode.trim().toUpperCase()}-${locationId}`; const trial: Trial = { id, name: input.trialName.trim(), type: input.group, subtype: input.group === 'Ensaios' ? input.subtype : '', year: Number(input.sowing.slice(0,4)) || 2026, cycle: activeHarvest?.name ?? 'Safra', locationId, plots: input.plots, sowing: input.sowing, harvest: addDays(input.sowing,120), owner: input.owner, rawStatus: 'Planejado', priority: input.priority, notes: 'Cadastro realizado no Gerenciamento', place: location.name, city: location.city, status: 'Planejado', progress: 0, next: 'Semeadura', nextDate: input.sowing, date: formatDate(input.sowing), fieldName: input.fieldName };
      createdTrials.push(trial); stages.forEach(([stage, offset], index) => { const plannedDate = addDays(input.sowing, offset); const visitId = `${id}-V${index + 1}`; createdSchedule.push({ id: visitId, trialId: id, activity: `Visita · ${stage}`, category: stage, start: plannedDate, end: plannedDate, owner: input.owner, priority: input.priority, status: 'Não iniciado', notes: 'Gerado automaticamente pelo cadastro administrativo', originalStart: plannedDate, originalEnd: plannedDate, version: 1 }); createdRows.push({ safra: activeHarvest?.name, local_codigo: location.id, local_nome: location.name, municipio: location.city.split(' - ')[0], uf: location.city.split(' - ')[1] ?? '', latitude: location.lat, longitude: location.lng, vcu_regiao: location.region.replace('_1',' I').replace('_2',' II').replace('_3',' III'), campo_codigo: input.fieldCode, campo_nome: input.fieldName, ensaio_codigo: id, ensaio_nome: input.trialName, grupo: input.group, subtipo_ensaio: input.group === 'Ensaios' ? input.subtype : '', parcelas: input.plots, data_semeadura: input.sowing, visita_codigo: visitId, atividade_descricao: `Visita · ${stage}`, estadio_fenologico: stage, data_prevista: plannedDate, responsavel: input.owner, prioridade: input.priority, status_planejamento: 'Não iniciado' }); }); });
    const nextTrials = [...allTrials.filter((item) => !createdTrials.some((created) => created.id === item.id)), ...createdTrials]; const nextSchedule = [...schedule.filter((item) => !createdSchedule.some((created) => created.id === item.id)), ...createdSchedule]; const existingSource = JSON.parse(localStorage.getItem('field-wheat-unified-source-v1') ?? '[]') as Record<string, unknown>[]; const visitIds = new Set(createdRows.map((row) => String(row.visita_codigo))); const nextSource = [...existingSource.filter((row) => !visitIds.has(String(row.visita_codigo))), ...createdRows];
    setTrials(nextTrials); setRegisteredTrials([]); setSchedule(nextSchedule); localStorage.setItem('field-wheat-imported-trials-clean-v1', JSON.stringify(nextTrials)); localStorage.setItem('field-wheat-schedule-clean-v1', JSON.stringify(nextSchedule)); localStorage.setItem('field-wheat-unified-source-v1', JSON.stringify(nextSource)); const nextLocations = locations.map((location) => ({ ...location, trials: nextTrials.filter((trial) => trial.locationId === location.id).length, plots: nextTrials.filter((trial) => trial.locationId === location.id).reduce((sum, trial) => sum + trial.plots, 0) })); setLocations(nextLocations); const updatedAt = persistHarvestSnapshot({ locations: nextLocations, trials: nextTrials, schedule: nextSchedule, source: nextSource }); touchHarvest(updatedAt);  setToast(`${createdTrials.length} ensaio(s) e ${createdSchedule.length} visitas adicionados.`); setTimeout(() => setToast(''), 4000);
  }

  function reportImplementationIssue(input: { locationId: string; trialId: string; plotIds: string[]; category: string; description: string }) {
    const target = allTrials.find((trial) => trial.id === input.trialId && trial.locationId === input.locationId);
    if (!target || !input.plotIds.length) return;
    const affectedPlots = [...new Set([...(target.affectedPlots ?? []), ...input.plotIds])];
    const lostPlots = input.category === 'Parcela perdida' ? [...new Set([...(target.lostPlots ?? []), ...input.plotIds])] : target.lostPlots ?? [];
    const updatedTrial = { ...target, affectedPlots, lostPlots, issueCount: affectedPlots.length, layoutPenalty: Math.min(40, Math.round(affectedPlots.length / Math.max(target.plots, 1) * 100)) };
    const nextTrials = allTrials.map((trial) => trial.id === target.id ? updatedTrial : trial);
    const alert: Activity = { id: Date.now(), date: new Date().toLocaleDateString('pt-BR'), trial: target.id, type: 'Problema de implantação', stream: 'field', owner: currentUser?.name ?? 'Equipe', notes: input.description, locationId: input.locationId, scope: 'Ensaio específico', macroGroup: macroGroupFor(target), macroStage: 'Semeadura', alertCategory: input.category, qualityPenalty: adversePenalty(input.category, input.plotIds.length), plotIds: input.plotIds, details: { ocorrencia: input.description, origem: 'Gerenciamento · implantação' } };
    const nextActivities = [alert, ...activities];
    setTrials(nextTrials); setRegisteredTrials([]); setActivities(nextActivities);
    localStorage.setItem('field-wheat-imported-trials-clean-v1', JSON.stringify(nextTrials)); localStorage.setItem('field-wheat-trials-clean-v1', '[]'); localStorage.setItem('field-wheat-activities-clean-v1', JSON.stringify(nextActivities));
    const catalogKey = `field-wheat-layout-catalog-${activeHarvestId}-${input.locationId}`;
    try { const catalog = parseLayout<Array<Record<string, any>>>(localStorage.getItem(catalogKey) ?? '[]'); const updatedCatalog = catalog.map((snapshot) => snapshot.metadata?.mapId === target.mapId ? { ...snapshot, plotIssues: { ...(snapshot.plotIssues ?? {}), ...Object.fromEntries(input.plotIds.map((plotId) => [plotId, { kind: input.category, note: input.description, replacementGenotype: '', updatedAt: new Date().toISOString() }])) }, savedAt: new Date().toISOString() } : snapshot); localStorage.setItem(catalogKey, stringifyLayout(updatedCatalog)); const legacyKey = `field-wheat-layout-${activeHarvestId}-${input.locationId}`; const activeSnapshot = updatedCatalog.find((snapshot) => snapshot.metadata?.mapId === target.mapId); if (activeSnapshot) localStorage.removeItem(legacyKey); } catch { /* preserva o reporte mesmo quando o croqui legado não está disponível */ }
    const updatedAt = persistHarvestSnapshot({ trials: nextTrials, activities: nextActivities }); touchHarvest(updatedAt, nextActivities);
    setToast(`${input.plotIds.length} PlotID(s) atualizados automaticamente no croqui de ${target.name}.`); setTimeout(() => setToast(''), 4000);
  }

  function deleteManagedTrial(trialId: string) {
    if (activeHarvest?.status === 'Encerrada') { setToast('Reabra a safra para excluir ensaios.'); return; }
    const target = allTrials.find((trial) => trial.id === trialId); if (!target) return;
    const nextTrials = allTrials.filter((trial) => trial.id !== trialId);
    const fallback = nextTrials.find((trial) => trial.locationId === target.locationId && trial.mapId === target.mapId && trial.areaCategory === target.areaCategory);
    const nextSchedule = schedule.filter((plan) => plan.trialId !== trialId || Boolean(fallback)).map((plan) => plan.trialId === trialId && fallback ? { ...plan, trialId: fallback.id } : plan);
    const nextActivities = activities.filter((activity) => activity.trial !== trialId || Boolean(fallback && activity.scope !== 'Ensaio específico')).map((activity) => activity.trial === trialId && fallback ? { ...activity, trial: fallback.id } : activity);
    const nextLocations = locations.map((location) => ({ ...location, trials: nextTrials.filter((trial) => trial.locationId === location.id).length, plots: nextTrials.filter((trial) => trial.locationId === location.id).reduce((sum, trial) => sum + trial.plots, 0) }));
    try {
      const catalogKey = 'field-wheat-layout-catalog-' + activeHarvestId + '-' + target.locationId;
      const catalog = parseLayout<LayoutSnapshot[]>(localStorage.getItem(catalogKey) ?? '[]');
      const updatedCatalog = catalog.map((snapshot) => {
        if (snapshot.metadata?.mapId !== target.mapId) return snapshot;
        const removed = new Set((snapshot.allocations ?? []).filter((allocation) => allocation.name === target.name || allocation.id + '-' + target.locationId + '-' + target.mapId === trialId).map((allocation) => allocation.id));
        return { ...snapshot, allocations: snapshot.allocations?.filter((allocation) => !removed.has(allocation.id)), plots: snapshot.plots?.map((plot) => removed.has(plot.allocationId ?? plot.trialId) ? { ...plot, trialId: 'UNASSIGNED', allocationId: undefined } : plot) ?? null };
      });
      const snapshot: HarvestSnapshot = { locations: nextLocations, trials: nextTrials, schedule: nextSchedule, activities: nextActivities, source: readJson<Record<string, unknown>[]>('field-wheat-unified-source-v1', []).filter((row) => String(row.ensaio_codigo ?? '') !== trialId), updatedAt: new Date().toISOString() };
      const nextHarvests = saveHarvestBundle(activeHarvestId, snapshot, harvests, { [catalogKey]: stringifyLayout(updatedCatalog), ['field-wheat-layout-' + activeHarvestId + '-' + target.locationId]: null });
      setTrials(nextTrials); setLocations(nextLocations); setRegisteredTrials([]); setSchedule(nextSchedule); setActivities(nextActivities); setHarvests(nextHarvests); setLastUpdated(snapshot.updatedAt); setToast('Ensaio removido. As parcelas ficaram livres no croqui para nova alocação.');
    } catch (error) { setToast(error instanceof Error ? error.message : 'Não foi possível excluir o ensaio.'); }
  }

  function deleteManagedLocation(locationId: string) {
    if (activeHarvest?.status === 'Encerrada') { setToast('Reabra a safra para excluir locais.'); return; }
    const removed = new Set(allTrials.filter((trial) => trial.locationId === locationId).map((trial) => trial.id));
    const snapshot: HarvestSnapshot = { locations: locations.filter((location) => location.id !== locationId), trials: allTrials.filter((trial) => trial.locationId !== locationId), schedule: schedule.filter((plan) => plan.locationId !== locationId && !removed.has(plan.trialId)), activities: activities.filter((activity) => activity.locationId !== locationId && !removed.has(activity.trial)), source: readJson<Record<string, unknown>[]>('field-wheat-unified-source-v1', []).filter((row) => String(row.local_codigo ?? '') !== locationId), updatedAt: new Date().toISOString() };
    try {
      const nextHarvests = saveHarvestBundle(activeHarvestId, snapshot, harvests, { ['field-wheat-layout-' + activeHarvestId + '-' + locationId]: null, ['field-wheat-layout-catalog-' + activeHarvestId + '-' + locationId]: null });
      setLocations(snapshot.locations); setTrials(snapshot.trials); setRegisteredTrials([]); setSchedule(snapshot.schedule); setActivities(snapshot.activities); setHarvests(nextHarvests); setLastUpdated(snapshot.updatedAt); setToast('Local e croquis vinculados removidos.');
    } catch (error) { setToast(error instanceof Error ? error.message : 'Não foi possível excluir o local.'); }
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
          <div className="story-copy">
            <div className="login-title"><img src="/WheatTestingPlataform/wheat-testing-brazil-logo-white.png" alt="Logo Wheat Testing Brazil" /><h1>Field Wheat Testing</h1></div>
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
            <div className="mobile-brand"><Brand compact /></div>
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
            <label>Função<select value={currentRole} onChange={(event) => setCurrentRole(event.target.value as AppRole)}><option>Administrador</option><option>Gestor</option><option>RA</option><option>Técnico responsável</option></select></label>
            <label>Locais de acesso<input defaultValue={currentUser?.locations ?? 'Todos'} /></label>
          </div>
          <button className="primary-button wide" onClick={() => { localStorage.setItem('field-wheat-current-role-v1', currentRole); if (window.matchMedia('(max-width: 760px)').matches) { selectProgram(locations[0] ? locationProgram(locations[0]) : 'U'); setScreen('planejamento'); } setPhase('app'); }}>Entrar na plataforma <span>→</span></button>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className={menuOpen ? 'sidebar nav-rail open' : 'sidebar nav-rail'} aria-label="Menu principal">
        <Brand light compact />
        <nav aria-label="Navegação principal">
          {navItems.filter((item) => roleScreens[currentRole].includes(item.screen) && (programId !== 'Brasil' || ['dashboard','usuarios'].includes(item.screen))).map((item) => <button data-route={item.screen} aria-current={screen === item.screen ? 'page' : undefined} title={item.label} key={item.screen} className={screen === item.screen ? 'active' : ''} onClick={() => go(item.screen)}><span className="nav-icon"><NavIcon screen={item.screen} /></span><span className="nav-label">{item.label}</span></button>)}
        </nav>
        <div className="sidebar-help"><span>?</span><div><b>Precisa de ajuda?</b><small>Suporte da plataforma</small></div></div>
      </aside>
      {menuOpen && <button className="sidebar-backdrop" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />}
      <div className="app-main">
        <header className="app-header">
          <div className="topbar">
            <Brand compact />
            <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Abrir menu">☰</button>
            <div className="search-box">⌕ <span>Buscar ensaios, locais ou atividades…</span><kbd>⌘ K</kbd></div>
            <div className="top-actions"><span className={`sync-indicator ${online ? 'online' : 'offline'}`}><i />{online ? 'Online · dados locais' : 'Offline · dados locais'}</span><button aria-label="Notificações">♢<i /></button><div className="avatar">IG</div><div className="user-copy"><b>{currentUser?.name ?? 'Igor'}</b><span>{currentRole}</span></div></div>
          </div>
        </header>

        <main className="content">
          <section className="mobile-only mobile-program-header" aria-label="Programa de trabalho"><label>Programa<select aria-label="Programa de trabalho" disabled={savingActivity} value={programId} onChange={(event) => selectProgram(event.target.value)}><option value="Brasil">Brasil · síntese</option>{programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}</select></label><button className="secondary-button" onClick={() => go('historico')} disabled={savingActivity || programId === 'Brasil'}>Meus registros</button></section>
          {(screen === 'campo' || screen === 'operacional' || screen === 'atividade') && <div className="mobile-only mobile-record-tabs" aria-label="Tipo de registro"><button className={screen !== 'operacional' ? 'active' : ''} disabled={savingActivity} onClick={() => { setSelectedPlan(null); go('campo'); }}>Inspeção de campo</button><button className={screen === 'operacional' ? 'active' : ''} disabled={savingActivity} onClick={() => { setSelectedPlan(null); go('operacional'); }}>Operação / manejo</button></div>}
          <section className="program-hierarchy" aria-label="Pastas de programas">
            <button data-program="Brasil" className={programId === 'Brasil' ? 'active' : ''} onClick={() => selectProgram('Brasil')}><svg role="img" aria-label="Bandeira do Brasil" width="26" height="18" viewBox="0 0 26 18"><rect width="26" height="18" rx="2" fill="#159447"/><path d="M13 2 24 9 13 16 2 9Z" fill="#ffdf32"/><circle cx="13" cy="9" r="4.3" fill="#2255a1"/><path d="M9 7.6Q13 7 17 10" fill="none" stroke="white" strokeWidth="1"/></svg> Brasil<small>Síntese nacional</small></button>
            <div>{programs.map((program) => <button data-program={program.id} key={program.id} className={programId === program.id ? 'active' : ''} onClick={() => selectProgram(program.id)}><span>▱ {program.name}</span><small>{locations.filter((location) => locationProgram(location) === program.id).length} locais · {allTrials.filter((trial) => locations.some((location) => location.id === trial.locationId && locationProgram(location) === program.id)).length} ensaios</small></button>)}</div>
          </section>
          <div className="program-breadcrumb">Brasil{activeProgram ? ` / ${activeProgram.name}` : ' / Síntese nacional'}</div>
          {screen === 'cadastros' && ['Administrador','Gestor','RA'].includes(currentRole) && <details className="card program-assignment"><summary>Organizar locais por programa · independente da RHA</summary><p>Transferir o local preserva seus ensaios, croquis, RHA e registros.</p>{locations.map((location) => <label key={location.id}><span>{location.name} · {rhaLabel(location.rha || location.region)}</span><select aria-label={`Programa de ${location.name}`} value={locationProgram(location)} onChange={(event) => assignLocationProgram(location.id, event.target.value as 'U' | 'K' | 'X')}>{programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}</select></label>)}</details>}
          {screen === 'cadastros' && currentRole === 'Administrador' && <section className="card area-reset-panel"><div><b>Preparar novos cadastros</b><p>Limpa os locais, ensaios e registros vinculados da safra ativa em todos os programas, preservando uma cópia recuperável neste navegador.</p></div><button type="button" className="secondary-button" disabled={!locations.length} onClick={resetAreas}>Limpar áreas da safra com cópia de segurança</button>{areaBackupAvailable && <button type="button" className="secondary-button" disabled={Boolean(locations.length)} onClick={restoreAreas}>Recuperar áreas anteriores</button>}</section>}
          <ProgramLocations.Provider value={scopedLocations}><div key={programId} className={programId === 'Brasil' ? 'national-summary' : 'program-workspace'}>
          {screen === 'dashboard' && <><Dashboard trialList={scopedTrials} activities={scopedActivities} schedule={scopedSchedule} harvests={harvests} activeHarvestId={activeHarvestId} onHarvest={switchHarvest} onNavigate={go} onFilter={openFiltered} onTrial={(trial) => { setSelectedTrial(trial); go('detalhe'); }} /></>}
          {screen === 'mapa' && <MapScreen harvestId={activeHarvestId} trialList={scopedTrials} activities={scopedActivities} schedule={scopedSchedule} weatherConditions={weatherConditions.filter((item) => scopedLocationIds.has(item.locationId))} weatherChecking={weatherChecking} weatherCheckedAt={weatherCheckedAt} onRefreshWeather={refreshWeatherConditions} onLocation={(locationId) => openFiltered({ locationId })} />}
          {screen === 'clima' && <WeatherScreen weatherConditions={weatherConditions.filter((item) => scopedLocationIds.has(item.locationId))} weatherChecking={weatherChecking} weatherCheckedAt={weatherCheckedAt} onRefresh={refreshWeatherConditions} />}
          {screen === 'ensaios' && <TrialsScreen trialList={scopedTrials} activities={scopedActivities} schedule={scopedSchedule} context={viewContext} onClearContext={() => setViewContext({})} onNew={() => go('cadastros')} onTrial={(trial) => { setSelectedTrial(trial); go('detalhe'); }} />}
          {screen === 'planejamento' && <><div className="mobile-only"><MobileAgenda schedule={scopedSchedule} trials={scopedTrials} locations={scopedLocations} onRecord={openPlannedActivity} /></div><div className="desktop-only"><PlanningScreen trialList={scopedTrials} schedule={scopedSchedule} weatherConditions={weatherConditions.filter((item) => scopedLocationIds.has(item.locationId))} onActivity={openPlannedActivity} onReprogram={reprogramTrial} /></div></>}
          {screen === 'rotas' && <><PageHead eyebrow="Logística de campo" title="Rotas" copy="Organize os locais da semana ou monte uma visita avulsa." /><RoutePlanner locations={scopedLocations} trials={scopedTrials} schedule={scopedSchedule} weather={weatherConditions.filter((item) => scopedLocationIds.has(item.locationId))} /></>}
          {screen === 'operacional' && <PhenologyActivityForm saving={savingActivity} mode="operational" dynamicFields={activityFields} trialList={scopedTrials} activities={scopedActivities} schedule={scopedSchedule} onSave={saveActivity} defaultTrial={selectedTrial.id} selectedPlan={selectedPlan} />}
          {(screen === 'campo' || screen === 'atividade') && <PhenologyActivityForm saving={savingActivity} mode="field" dynamicFields={activityFields} trialList={scopedTrials} activities={scopedActivities} schedule={scopedSchedule} onSave={saveActivity} defaultTrial={selectedTrial.id} selectedPlan={selectedPlan} />}
          {screen === 'historico' && <HistoryScreen activities={scopedActivities} onNew={() => go('campo')} />}

          {screen === 'cadastros' && <AdminRegistrationScreen registeredTrials={registeredTrials} trialList={scopedTrials} activities={scopedActivities} schedule={scopedSchedule} harvests={harvests} activeHarvestId={activeHarvestId} lastUpdated={lastUpdated} dynamicFields={activityFields} onDynamicFields={updateActivityFields} activityTemplates={activityTemplates} onActivityTemplates={updateActivityTemplates} onSave={saveFieldTrial} onImportDataset={importOperationalDataset} onImportUnified={importUnifiedPlanning} onCreatePlanning={createPlanningFromWizard} onAddLocation={addManagedLocation} onAddTrials={addManagedTrials} onCreateHarvest={createHarvest} onHarvestStatus={setHarvestStatus} onHarvest={switchHarvest} onFinalizeLayout={finalizeLayoutPlanning} onDeleteTrial={deleteManagedTrial} onDeleteLocation={deleteManagedLocation} onReportImplementation={reportImplementationIssue} />}
          {screen === 'usuarios' && <UsersScreen />}
          {screen === 'detalhe' && <TrialDetail trial={selectedTrial} activities={scopedActivities} schedule={scopedSchedule} onBack={() => go('ensaios')} onActivity={() => { setSelectedPlan(null); go('campo'); }} onPlannedActivity={openPlannedActivity} />}
          </div></ProgramLocations.Provider>
        </main>
      </div>
      {toast && <div className="toast">✓ {toast}</div>}
      <nav className="mobile-bottom-nav" aria-label="Acessos de campo">{([{ screen: 'planejamento', label: 'Agenda' }, { screen: 'campo', label: 'Registrar' }, { screen: 'rotas', label: 'Rotas' }, { screen: 'mapa', label: 'Mapa' }] as const).map((item) => { const active = screen === item.screen || item.screen === 'campo' && (screen === 'operacional' || screen === 'atividade'); return <button key={item.screen} aria-current={active ? 'page' : undefined} className={active ? 'active' : ''} disabled={savingActivity} onClick={() => { if (programId === 'Brasil') { selectProgram(locations[0] ? locationProgram(locations[0]) : 'U'); setScreen(item.screen); } else go(item.screen); }}><NavIcon screen={item.screen} /><span>{item.label}</span></button>; })}</nav>
    </div>
  );
}

function Brand({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return <div className={`brand-mark ${light ? 'light' : ''} ${compact ? 'compact' : ''}`}><span className="brand-logo"><img src="/WheatTestingPlataform/wheat-testing-brazil-logo-white.png" alt="Wheat Testing Brazil" /></span><div><strong>Wheat Testing Brazil</strong><small>Field research platform</small></div></div>;
}

function NavIcon({ screen }: { screen: Screen }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<Screen, React.ReactNode> = {
    dashboard: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10M9 20v-6h6v6"/></>,
    mapa: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z"/><path d="M9 3v15M15 6v15"/></>,
    clima: <><path d="M17.5 19H7a5 5 0 1 1 1.2-9.85A6.5 6.5 0 0 1 20.4 11 4 4 0 0 1 17.5 19Z"/><path d="M8 22h8M10 16h4"/></>,
    ensaios: <><path d="M12 21V10"/><path d="M12 14c-4 0-7-2.4-7-6 4 0 7 2.4 7 6ZM12 10c4 0 7-2.4 7-6-4 0-7 2.4-7 6Z"/></>,
    planejamento: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></>,
    rotas: <><path d="M5 4h5v5H5zM14 15h5v5h-5zM10 6h6v9M5 9v8h9"/></>,
    operacional: <><path d="m14.7 6.3 3-3a4 4 0 0 1-5 5l-7 7a2.1 2.1 0 0 0 3 3l7-7a4 4 0 0 1 5-5l-3 3Z"/></>,
    campo: <><path d="M9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>,
    atividade: <><path d="M9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>,
    historico: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,

    cadastros: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4a1.7 1.7 0 0 0 1-1.6V2h4v.3A1.7 1.7 0 0 0 15 4a1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    usuarios: <><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 8M18 14a6 6 0 0 1 4 7"/></>,
    detalhe: <><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>{paths[screen]}</svg>;
}

function PageHead({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy: string; action?: React.ReactNode }) {
  return <div className="page-head"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{copy}</p></div>{action}</div>;
}

function Dashboard({ trialList, activities, schedule, harvests, activeHarvestId, onHarvest, onTrial }: { trialList: Trial[]; activities: Activity[]; schedule: PlannedActivity[]; harvests: Harvest[]; activeHarvestId: string; onHarvest: (id: string) => void; onNavigate: (s: Screen) => void; onFilter: (context: ViewContext) => void; onTrial: (trial: Trial) => void }) {
  const locations = useContext(ProgramLocations) ?? baseLocations;
  const [qualityOpen, setQualityOpen] = useState(false);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const applies = activityAppliesToTrial;
  const harvested = (trial: Trial) => isTrialHarvested(trial, activities, schedule);
  const planted = trialList.filter((trial) => Boolean(actualSowingDate(trial, activities, schedule)));
  const harvestedCount = trialList.filter(harvested).length;
  const conducting = planted.filter((trial) => !harvested(trial));
  const plantedPercent = trialList.length ? Math.round(planted.length / trialList.length * 100) : 0;
  const seasonPhase = harvestedCount ? 'harvest' : trialList.length && planted.length === trialList.length ? 'conducting' : 'sowing';
  const conductionPercent = conducting.length ? Math.round(conducting.reduce((sum, trial) => {
    const sowing = actualSowingDate(trial, activities, schedule)!;
    return sum + Math.min(100, Math.max(0, daysBetween(sowing, today) / Math.max(1, daysBetween(sowing, trial.harvest)) * 100));
  }, 0) / conducting.length) : 0;
  const seasonPercent = seasonPhase === 'harvest' ? Math.round(harvestedCount / trialList.length * 100) : seasonPhase === 'conducting' ? conductionPercent : plantedPercent;
  const nextCandidates = trialList.filter((trial) => seasonPhase === 'sowing' ? !planted.includes(trial) : !harvested(trial)).map((trial) => {
    const plans = schedule.filter((plan) => plan.trialId === trial.id && plan.status !== 'Concluído' && (seasonPhase === 'sowing' ? /semeadura/i.test(plan.activity) && !/enchimento/i.test(plan.activity) : /colheita/i.test(plan.activity))).sort((a, b) => a.start.localeCompare(b.start));
    return { trial, date: plans[0]?.start ?? (seasonPhase === 'sowing' ? trial.sowing : trial.harvest) };
  }).filter((item) => item.date).sort((a, b) => a.date.localeCompare(b.date));
  const nextMilestone = nextCandidates[0];
  const milestoneDays = nextMilestone ? daysBetween(today, nextMilestone.date) : undefined;
  const qualityAverage = trialList.length ? Math.round(trialList.reduce((sum, trial) => sum + trialQuality(trial, activities).score, 0) / trialList.length) : 0;
  const completed = activities.filter((activity) => activity.plannedId && !activity.alertCategory);
  const completedLate = completed.filter((activity) => { const plan = schedule.find((item) => item.id === activity.plannedId); return plan && activityDateIso(activity.date) > plan.end; }).length;
  const overdue = schedule.filter((plan) => plan.status !== 'Concluído' && plan.end < today).length;
  const ranked = locations.map((location) => ({ location, overview: localityOverview(location.id, trialList, activities, schedule) })).filter((entry) => entry.overview.localTrials.length).sort((a, b) => b.overview.quality - a.overview.quality);
  const qualityDetail = (trial: Trial) => {
    const quality = trialQuality(trial, activities);
    const records = activities.filter((activity) => applies(activity, trial));
    const field = records.find((activity) => activity.stream === 'field' && activity.qualityScore !== undefined);
    const unique = new Map(quality.alerts.map((alert) => [alert.id, alert]));
    return <article className="macro-trial-quality" key={trial.id}><button className="text-button" onClick={() => onTrial(trial)}>{trial.name} · {trial.place}</button><b>{quality.score}/100{!quality.measured ? ' · estimada' : ''}</b><div className="quality-indicator-chips"><span>Daninhas: {field?.details?.daninhas ? field.details.daninhas + '/5' : 'não avaliado'}</span><span>Doenças: {field?.details?.doencas ? field.details.doencas + '/5' : 'não avaliado'}</span><span>Falhas de implantação: {trial.affectedPlots?.length ?? 0} parcelas</span><span>Parcelas perdidas: {trial.lostPlots?.length ?? 0}</span></div>{[...unique.values()].map((alert) => <p key={alert.id}><b>{alert.alertCategory}</b> · {alert.details?.ocorrencia || alert.notes}{alert.plotIds?.length ? ' · PlotIDs: ' + alert.plotIds.join(', ') : ''} · −{alert.qualityPenalty}%</p>)}{!unique.size && <p>{quality.measured ? 'Sem ocorrências com penalidade registradas.' : 'Sem avaliação de qualidade registrada; nota de referência.'}</p>}</article>;
  };
  return <div className="macro-dashboard"><PageHead eyebrow="Síntese da rede" title="Visão geral" copy="Implantação, condução, colheita, cumprimento das atividades e condição experimental dos locais." action={<label>Safra<select value={activeHarvestId} onChange={(event) => onHarvest(event.target.value)}>{harvests.map((harvest) => <option value={harvest.id} key={harvest.id}>{harvest.name.match(/\d{4}/)?.[0] ?? harvest.name}</option>)}</select></label>} />
    <section className="macro-kpis"><article className="card"><small>{seasonPhase === 'harvest' ? 'ANDAMENTO DA COLHEITA' : seasonPhase === 'conducting' ? 'CONDUÇÃO DOS ENSAIOS' : 'ANDAMENTO DA SEMEADURA'}</small><strong>{trialList.length ? `${seasonPercent}%` : '—'}</strong><p>{seasonPhase === 'harvest' ? `${harvestedCount} de ${trialList.length} colhidos · ${conducting.length} em condução${planted.length < trialList.length ? ` · ${trialList.length - planted.length} não semeados` : ''}` : seasonPhase === 'conducting' ? `${conducting.length} ensaios em campo · progresso temporal até a colheita prevista` : `${planted.length} de ${trialList.length} implantados`}</p></article><article className="card"><small>{seasonPhase === 'sowing' ? 'PRÓXIMA SEMEADURA PREVISTA' : 'PRÓXIMA COLHEITA PREVISTA'}</small><strong>{milestoneDays === undefined ? '—' : milestoneDays < 0 ? `${Math.abs(milestoneDays)} dias em atraso` : milestoneDays === 0 ? 'Hoje' : `${milestoneDays} dias`}</strong><p>{nextMilestone ? `${locations.find((location) => location.id === nextMilestone.trial.locationId)?.name ?? nextMilestone.trial.place} · ${formatDate(nextMilestone.date)}` : harvestedCount && harvestedCount === trialList.length ? 'Colheita concluída em todos os ensaios' : 'Sem previsão cadastrada'}</p></article><button className="card macro-quality-button" onClick={() => setQualityOpen(!qualityOpen)} aria-expanded={qualityOpen}><small>QUALIDADE MÉDIA DOS ENSAIOS</small><strong>{trialList.length ? qualityAverage : '—'}<em>/100</em></strong><p>Ver indicadores e fatores de impacto ↓</p></button></section>
    <section className="card macro-activity-summary"><span><b>{conducting.length}</b> ensaios em condução</span><span><b>{harvestedCount}</b> colhidos</span><span><b>{completed.length - completedLate}</b> atividades realizadas em dia</span><span><b>{completedLate}</b> realizadas com atraso</span><span><b>{overdue}</b> atividades pendentes em atraso</span></section>
    {qualityOpen && <section className="card macro-quality-detail"><h2>O que impactou a qualidade dos ensaios</h2>{trialList.length ? trialList.map(qualityDetail) : <p>Nenhum ensaio cadastrado neste programa.</p>}</section>}
    <section className="card macro-localities"><div className="card-head"><div><h2>Andamento e condição por localidade</h2><p>Ordenado por qualidade experimental. Abra um local para conferir implantação, colheita e erros dos ensaios.</p></div></div><div className="table-wrap"><table><thead><tr><th>Local / qualidade</th><th>Semeadura</th><th>Condução até a colheita</th><th>Colheita</th><th>Estádio previsto</th><th>Ocorrências</th></tr></thead><tbody>{ranked.map(({ location, overview }, index) => {
      const local = overview.localTrials;
      const localPlanted = local.filter((trial) => actualSowingDate(trial, activities, schedule));
      const progress = localPlanted.length ? Math.round(localPlanted.reduce((sum, trial) => { const sowing = actualSowingDate(trial, activities, schedule)!; return sum + Math.min(100, Math.max(0, daysBetween(sowing, today) / Math.max(1, daysBetween(sowing, trial.harvest)) * 100)); }, 0) / localPlanted.length) : 0;
      const harvestPercent = local.length ? Math.round(local.filter(harvested).length / local.length * 100) : 0;
      const errors = activities.filter((activity) => Boolean(activity.alertCategory) && local.some((trial) => applies(activity, trial)));
      const dates = localPlanted.map((trial) => actualSowingDate(trial, activities, schedule)!).sort();
      return <tr key={location.id}><td><details><summary><b>#{index + 1} {location.name}</b><small>{overview.quality}/100 · {rhaLabel(location.rha || location.region)} · Programa {locationProgram(location)}</small></summary><div className="local-quality-expanded">{local.map(qualityDetail)}</div></details></td><td><MacroProgress value={overview.plantedPercent} /><small>{dates.length ? dates[0] === dates.at(-1) ? formatDate(dates[0]) : formatDate(dates[0]) + ' a ' + formatDate(dates.at(-1)!) : 'Não iniciada'}</small></td><td><MacroProgress value={progress} /><small>{localPlanted.length ? progress >= 100 ? 'Janela prevista de colheita atingida' : 'Progresso do ciclo previsto' : 'Aguardando semeadura'}</small></td><td><MacroProgress value={harvestPercent} /><small>{local.map((trial) => trial.harvest).sort()[0] ? 'Prevista: ' + formatDate(local.map((trial) => trial.harvest).sort()[0]) : 'Sem previsão'}</small></td><td>{overview.stage}</td><td><b>{errors.length}</b> reportes<small>{local.reduce((sum, trial) => sum + (trial.affectedPlots?.length ?? 0), 0)} parcelas com falhas</small></td></tr>;
    })}</tbody></table></div>{!ranked.length && <p>Nenhum local com ensaios neste programa.</p>}</section>
  </div>;
}
function MacroProgress({ value }: { value: number }) {
  return <span className="macro-progress"><span><i style={{ width: `${value}%` }} /></span><b>{value}%</b></span>;
}

function weatherSymbol(condition: string) {
  if (/trovoada|granizo/i.test(condition)) return '⛈';
  if (/chuva|garoa/i.test(condition)) return '🌧';
  if (/nublado|neblina/i.test(condition)) return '☁';
  if (/limpo/i.test(condition)) return '☀';
  return '◌';
}

function WeatherWeekCalendar({ weather, compact = false }: { weather: LocationWeather; compact?: boolean }) {
  const week = (weather.week ?? []).slice(0, 7);
  return <section className={`weather-week ${compact ? 'compact' : ''}`}><header><div><small>PRÓXIMOS 7 DIAS</small><b>Condição da semana</b></div><span>Precipitação prevista</span></header>{week.length ? <div className="weather-week-days">{week.map((day) => { const date = new Date(`${day.date}T12:00:00`); return <article key={day.date} title={day.condition}><small>{date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</small><b>{date.getDate()}</b><i>{weatherSymbol(day.condition)}</i><span>{day.temperatureMin}° / {day.temperatureMax}°</span><em>{day.precipitation.toFixed(1)} mm</em></article>; })}</div> : <p className="weather-week-empty">Previsão semanal indisponível nesta consulta.</p>}</section>;
}

function WeatherScreen({ weatherConditions, weatherChecking, weatherCheckedAt, onRefresh }: { weatherConditions: LocationWeather[]; weatherChecking: boolean; weatherCheckedAt: string; onRefresh: () => void }) {
  const locations = useContext(ProgramLocations) ?? baseLocations;
  const [selected, setSelected] = useState('');
  const [historyLimit, setHistoryLimit] = useState(10);
  const current = weatherConditions.find((weather) => weather.locationId === selected);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const dates = Array.from({ length: 7 }, (_, index) => addDays(today, index));
  return <><PageHead eyebrow="Previsão por local" title="Condições climáticas" copy="Consulte a condição e a precipitação prevista nos próximos sete dias. Clique no local para abrir o histórico desde a semeadura." action={<button className="primary-button" onClick={onRefresh} disabled={weatherChecking}>{weatherChecking ? 'Atualizando…' : 'Atualizar previsão'}</button>} />
    {weatherCheckedAt && <p>Atualizado em {new Date(weatherCheckedAt).toLocaleString('pt-BR')}</p>}
    <section className="card climate-sheet"><div className="table-wrap"><table><thead><tr><th>Localidade</th>{dates.map((date) => <th key={date}>{new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</th>)}</tr></thead><tbody>{locations.map((location) => { const weather = weatherConditions.find((item) => item.locationId === location.id); return <tr key={location.id}><th><button className={selected === location.id ? 'active' : ''} onClick={() => { setSelected(location.id); setHistoryLimit(10); }}>{location.name}</button></th>{dates.map((date) => { const day = weather?.week?.find((item) => item.date === date); return <td key={date}>{day ? <><span>{weatherSymbol(day.condition)} {day.condition}</span><b>{day.precipitation.toFixed(1)} mm</b><small>{day.temperatureMin}° / {day.temperatureMax}°C</small></> : <span>Sem previsão disponível</span>}</td>; })}</tr>; })}</tbody></table></div>{!locations.length && <p>Nenhum local cadastrado neste programa.</p>}</section>
    {current && <section className="card climate-history"><h2>{current.locationName} · histórico climático</h2><WeatherWeekCalendar weather={current} />{current.sowingDate ? <><p>Desde {formatDate(current.sowingDate)} · {(current.accumulatedPrecipitation ?? 0).toFixed(1)} mm acumulados na média das fontes disponíveis</p><div className="weather-history-sources">{(current.historySources ?? []).map((source) => <article key={source.id}><b>{source.name}</b><strong>{source.available ? source.accumulatedPrecipitation.toFixed(1) + ' mm' : 'Indisponível'}</strong><small>{source.stormDays} dias com tempestade · {source.hailDays} com granizo</small></article>)}</div><div className="weather-event-list">{(current.events ?? []).slice(0, historyLimit).map((event) => <article key={event.date}><b>{formatDate(event.date)} · {event.type}</b><p>{event.sources.join(', ')} · {event.precipitation.toFixed(1)} mm · rajada {event.gust} km/h</p></article>)}{!(current.events ?? []).length && <p>Nenhuma tempestade ou granizo indicado no período consultado.</p>}{(current.events ?? []).length > historyLimit && <button className="secondary-button" onClick={() => setHistoryLimit((limit) => limit + 10)}>Carregar mais 10</button>}</div></> : <p>Aguardando registro operacional de semeadura para iniciar o histórico.</p>}</section>}
  </>;
}

function WeatherLocationSummary({ weather, checking, checkedAt, onRefresh }: { weather?: LocationWeather; checking: boolean; checkedAt: string; onRefresh: () => void }) {
  return <section className="map-weather-panel"><header><div><small>CONDIÇÃO CLIMÁTICA</small><b>{weather ? `${weather.temperature.toFixed(1)}°C · ${weather.condition}` : 'Dados não consultados'}</b></div><button type="button" onClick={onRefresh} disabled={checking}>{checking ? '…' : '↻'}</button></header>{weather && <><div className="map-weather-sources">{weather.sources.map((source) => <span key={source.id}><b>{source.name}</b><small>{source.available ? `${source.temperature.toFixed(1)}°C · ${source.condition}` : 'Indisponível'}</small></span>)}</div>{weather.sowingDate ? <div className="map-weather-history"><span><b>{(weather.accumulatedPrecipitation ?? 0).toFixed(1)} mm</b><small>acumulados desde {formatDate(weather.sowingDate)}</small></span><span><b>{(weather.events ?? []).length}</b><small>alerta(s) de tempestade/granizo</small></span></div> : <p className="map-weather-waiting">Histórico aguardando registro operacional de semeadura.</p>}<WeatherWeekCalendar weather={weather} compact /></>}{checkedAt && <small>Atualizado em {new Date(checkedAt).toLocaleString('pt-BR')}</small>}</section>;
}

function MapScreen({ harvestId, trialList, activities, schedule, weatherConditions, weatherChecking, weatherCheckedAt, onRefreshWeather, onLocation }: { harvestId: string; trialList: Trial[]; activities: Activity[]; schedule: PlannedActivity[]; weatherConditions: LocationWeather[]; weatherChecking: boolean; weatherCheckedAt: string; onRefreshWeather: () => void; onLocation: (locationId: string) => void }) {
  const locations = useContext(ProgramLocations) ?? baseLocations;
  const [selected, setSelected] = useState(locations[0]?.id ?? '');
  const [layoutOpen, setLayoutOpen] = useState(false);
  const current = locations.find((location) => location.id === selected) ?? locations[0];
  if (!current) return <><PageHead eyebrow="Consulta geográfica" title="Mapa da rede" copy="Visualização das áreas cadastradas pela equipe de gerenciamento." /><section className="card no-results"><span>⌖</span><h2>Nenhuma área cadastrada</h2><p>Um administrador pode cadastrar a primeira área em Gerenciamento → Cadastro de local.</p></section></>;
  const localTrials = trialList.filter((trial) => trial.locationId === current.id);
  const qualityLocations: NetworkLocation[] = locations.map((location) => { const weather = weatherConditions.find((item) => item.locationId === location.id); const scores = trialList.filter((trial) => trial.locationId === location.id).map((trial) => trialQuality(trial, activities).score); if (!scores.length) return { ...location, qualityTone: 'neutral', weather }; const score = Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length); return { ...location, qualityTone: qualityTone(score), qualityScore: score, weather }; });
  const overview = localityOverview(current.id, trialList, activities, schedule);
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${current.lat},${current.lng}`;
  const wazeUrl = `https://www.waze.com/ul?ll=${current.lat},${current.lng}&navigate=yes`;
  return <><PageHead eyebrow="Consulta geográfica" title="Mapa da rede" copy="Mapa somente para visualização. Cadastros e alterações ficam protegidos no módulo Gerenciamento." />
    <section className="mobile-location-strip" aria-label="Acesso rápido aos locais">{locations.map((location) => <button className={location.id === current.id ? 'active' : ''} key={location.id} onClick={() => setSelected(location.id)}><b>{location.name}</b><small>{location.city}</small></button>)}</section>
    <section className="map-layout"><div className="network-map-column"><div className="card map-full"><NetworkMap locations={qualityLocations} onSelect={setSelected} /><div className="map-legend floating quality-legend"><span><i className="excellent" />Excelente</span><span><i className="adequate" />Adequado</span><span><i className="attention" />Atenção</span><span><i className="critical" />Crítico</span></div></div><WeatherLocationSummary weather={weatherConditions.find((item) => item.locationId === current.id)} checking={weatherChecking} checkedAt={weatherCheckedAt} onRefresh={onRefreshWeather} /></div>
      <aside className="card location-panel"><div className="selected-location-heading"><span><small>ÁREA SELECIONADA</small><b>{current.id}</b></span><button className="secondary-button" onClick={() => setLayoutOpen(true)}>▦ Abrir Croqui</button></div><h2>{current.name}</h2><p>{current.city} · Rio Grande do Sul</p><div className="route-actions"><a href={googleMapsUrl} target="_blank" rel="noreferrer">Google Maps</a><a href={wazeUrl} target="_blank" rel="noreferrer">Waze</a></div><div className="location-metrics"><div><b>{overview.plantedPercent}%</b><span>semeado</span></div><div><b>{overview.quality}</b><span>qualidade</span></div></div><div className="selected-stage"><small>ESTÁDIO PREDOMINANTE</small><b>{overview.stage}</b></div><div className="location-macro"><label>Semeadura <MacroProgress value={overview.sowing} /></label><label>Condução <MacroProgress value={overview.conduction} /></label><label>Colheita <MacroProgress value={overview.harvest} /></label></div><hr /><h3>Grupos em campo</h3><div className="group-chips">{overview.groups.map((group) => <span key={group}>{group}</span>)}</div><h3>Ensaios e qualidade</h3>{localTrials.slice(0, 4).map((trial) => { const quality = trialQuality(trial, activities); return <div className="mini-trial quality-mini" key={trial.id}><i className={quality.tone} /><span>{trial.name}</span><b>{trial.areaCategory || trial.subtype || macroGroupFor(trial)}</b><small>{quality.label} · {quality.score}{trial.lostPlots?.length ? ` · ${trial.lostPlots.length} perdida(s)` : ''}</small></div>; })}{localTrials.length === 0 && <p className="empty-copy">Nenhum ensaio vinculado a esta área.</p>}<button className="secondary-button location-action" onClick={() => onLocation(current.id)} disabled={localTrials.length === 0}>Ver lista de ensaios →</button><small className="coordinates">{current.lat.toFixed(4)}, {current.lng.toFixed(4)}</small></aside>
    </section>{layoutOpen && <FieldLayoutMap readOnly harvestId={harvestId} location={current} trials={localTrials} onClose={() => setLayoutOpen(false)} />}</>;
}

function NewAreaDialog({ harvestName, onClose, onSubmit }: { harvestName: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [areaCode, setAreaCode] = useState('');
  const generatedName = areaCode.trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, '');
  return <div className="new-area-modal" role="dialog" aria-modal="true" aria-label="Nova área por croqui"><button className="layout-backdrop" onClick={onClose} aria-label="Fechar" /><form className="new-area-dialog" onSubmit={onSubmit}><header><div><span>NOVA IMPLANTAÇÃO</span><h2>Criar área pelo croqui</h2><p>O nome do local será o código informado, sem acrescentar o ano.</p></div><button type="button" onClick={onClose}>×</button></header><div className="new-area-fields"><label>Código da área<input name="code" value={areaCode} onChange={(event) => setAreaCode(event.target.value)} required placeholder="Ex.: PF01" /></label><div className="generated-area-name"><small>NOME AUTOMÁTICO</small><b>{generatedName || 'CÓDIGO'}</b><span>{harvestName}</span></div><div><label>Cidade<input name="city" required placeholder="Ex.: Passo Fundo" /></label><label>Região homogênea de adaptação (RHA)<select name="rha" required defaultValue="RHA_1"><option value="RHA_1">RHA I</option><option value="RHA_2">RHA II</option><option value="RHA_3">RHA III</option></select></label></div><div><label>Latitude inicial<input name="lat" type="number" step="any" defaultValue="-28.2625" /></label><label>Longitude inicial<input name="lng" type="number" step="any" defaultValue="-52.4083" /></label></div></div><footer><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button">Abrir posicionamento do croqui</button></footer></form></div>;
}

function TrialsScreen({ trialList, activities, schedule, context, onClearContext, onTrial, onNew }: { trialList: Trial[]; activities: Activity[]; schedule: PlannedActivity[]; context: ViewContext; onClearContext: () => void; onTrial: (trial: Trial) => void; onNew: () => void }) {
  const locations = useContext(ProgramLocations) ?? baseLocations;
  const [query, setQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState(context.locationId ?? 'Todos');
  const [qualityFilter, setQualityFilter] = useState('Todas');
  const [trialNameFilter, setTrialNameFilter] = useState('Todos');
  const fieldIsLate = (trial: Trial) => {
    const field = trial.fieldName || trial.locationId;
    const fieldTrialIds = new Set(trialList.filter((item) => (item.fieldName || item.locationId) === field).map((item) => item.id));
    return schedule.some((item) => fieldTrialIds.has(item.trialId) && item.start < todayIso() && item.status !== 'Concluído');
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
    <section className="trial-grid">{filtered.map((trial) => { const quality = trialQuality(trial, activities); const sowingDate = actualSowingDate(trial, activities, schedule); return <button className={`trial-card quality-card ${quality.tone}`} key={trial.id} onClick={() => onTrial(trial)}><div className="trial-card-top"><span>{trial.areaCategory ?? trial.type}</span><QualityBadge trial={trial} activities={activities} /></div><h2>{trial.name}</h2><p>◎ {trial.place} · RS{trial.fieldName ? ` · ${trial.fieldName}` : ''}</p>{quality.alerts.length > 0 && <div className="trial-alert-preview"><b>! {quality.alerts.length} alerta(s) · −{quality.penalty}%</b><small>{quality.alerts.slice(0,2).map((alert) => `${alert.alertCategory}${alert.plotIds?.length ? ` · PlotID ${alert.plotIds.join(', ')}` : ''}`).join(' | ')}</small></div>}<div className="trial-stats"><span><b>{trial.plots.toLocaleString('pt-BR')}</b> parcelas</span><span><b>{sowingDate ? phenologicalStage(trial, sowingDate) : 'Não semeado'}</b> estádio</span></div>{Boolean(trial.issueCount) && <div className="trial-issue-summary"><b>{trial.issueCount} alerta(s) de implantação</b>{Boolean(trial.lostPlots?.length) && <small>Parcelas perdidas: {trial.lostPlots?.join(', ')}</small>}{Boolean(trial.layoutPenalty) && <small>Impacto na qualidade: -{trial.layoutPenalty} pontos</small>}</div>}<div className="progress quality-progress"><i style={{ width: `${quality.score}%` }} /></div><div className="next-action"><small>PRÓXIMA AÇÃO · {formatDate(trial.nextDate)}</small><b>{trial.next}</b></div></button>; })}</section>
    {filtered.length === 0 && <section className="card no-results"><span>◇</span><h2>Nenhum ensaio neste recorte</h2><p>Limpe um dos filtros para ampliar a visualização.</p></section>}
  </>;
}

function PlanningScreen({ trialList, schedule, onActivity, onReprogram }: { trialList: Trial[]; schedule: PlannedActivity[]; weatherConditions: LocationWeather[]; onActivity: (item: PlannedActivity) => void; onReprogram: (trialId: string, date: string) => void }) {
  const locations = useContext(ProgramLocations) ?? baseLocations;
  const calendarToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const [month, setMonth] = useState(() => { const date = new Date(`${calendarToday}T12:00:00`); return date.getFullYear() * 12 + date.getMonth(); });
  const [trialFilter, setTrialFilter] = useState('Todas');
  const [reprogramTrial, setReprogramTrial] = useState<string>(trialList[0]?.id ?? '');
  const [actualSowing, setActualSowing] = useState<string>(trialList[0]?.sowing ?? '');
  const monthDate = new Date(Math.floor(month / 12), month % 12, 1);
  const firstMondayOffset = (monthDate.getDay() + 6) % 7;
  const gridStart = new Date(Math.floor(month / 12), month % 12, 1 - firstMondayOffset);
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
    <section className="card calendar-card"><header><button onClick={() => setMonth((value) => value - 1)}>‹</button><h2>{monthLabel}</h2><button onClick={() => setMonth((value) => value + 1)}>›</button></header><div className="calendar-weekdays">{['SEG','TER','QUA','QUI','SEX','SÁB','DOM'].map((day) => <b key={day}>{day}</b>)}</div><div className="calendar-grid">{days.map((date) => { const iso = date.toISOString().slice(0, 10); const dayEvents = events.filter((item) => item.start === iso).slice(0, 4); return <div className={`calendar-day ${date.getMonth() !== monthDate.getMonth() ? 'outside' : ''} ${iso === calendarToday ? 'today' : ''}`} key={iso}><span>{date.getDate()}</span>{dayEvents.map((item) => { const trial = trialList.find((entry) => entry.id === item.trialId); const location = locations.find((entry) => entry.id === (item.locationId ?? trial?.locationId)); const trialTypes = [...new Set(trialList.filter((entry) => entry.locationId === location?.id && (entry.areaCategory ?? entry.type) === (item.areaCategory ?? trial?.areaCategory ?? trial?.type)).map((entry) => entry.areaCategory ?? entry.type))]; return <button key={item.id} className={`calendar-event ${activityStreamFor(item)} ${item.status === 'Concluído' ? 'done' : item.version > 1 ? 'revised' : ''}`} onClick={() => onActivity(item)} title={`${location?.name ?? 'Local'} · ${item.activity} · ${trialTypes.join(', ')}`}><b>{item.activity}</b><small>◎ {location?.name ?? 'Local não informado'}</small><em>{trialTypes.join(', ') || item.areaCategory || trial?.type || 'Ensaios'}</em></button>; })}</div>; })}</div></section>
    <section className="card reprogram-panel"><div><span className="eyebrow">AUTOMAÇÃO SIMULADA</span><h2>Atualizar pela semeadura real</h2><p>As atividades ainda abertas são reposicionadas pelo mesmo número de dias, mantendo a data original e a versão do cronograma.</p></div><div className="reprogram-fields"><label>Ensaio<select value={reprogramTrial} onChange={(event) => { const id = event.target.value; setReprogramTrial(id); setActualSowing(trialList.find((trial) => trial.id === id)?.sowing ?? ''); }}>{trialList.map((trial) => <option key={trial.id}>{trial.id}</option>)}</select></label><label>Semeadura real<input type="date" value={actualSowing} onChange={(event) => setActualSowing(event.target.value)} /></label><button className="primary-button" onClick={() => onReprogram(reprogramTrial, actualSowing)}>Recalcular cronograma</button></div></section>
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

function PhenologyActivityForm({ trialList, activities, schedule, onSave, defaultTrial, selectedPlan, mode, dynamicFields, saving = false }: { trialList: Trial[]; activities: Activity[]; schedule: PlannedActivity[]; onSave: (event: FormEvent<HTMLFormElement>) => void; defaultTrial: string; selectedPlan: PlannedActivity | null; mode: ActivityStream; dynamicFields: DynamicField[]; saving?: boolean }) {
  const locations = useContext(ProgramLocations) ?? baseLocations;
  const defaultLocation = selectedPlan?.locationId ?? trialList.find((trial) => trial.id === (selectedPlan?.trialId ?? defaultTrial))?.locationId ?? locations[0]?.id ?? '';
  const [locationId, setLocationId] = useState(defaultLocation);
  const initialPlan = selectedPlan && activityStreamFor(selectedPlan) === mode ? selectedPlan : schedule.find((item) => item.status !== 'Concluído' && activityStreamFor(item) === mode && (item.locationId === defaultLocation || trialList.find((trial) => trial.id === item.trialId)?.locationId === defaultLocation)) ?? null;
  const [activePlanId, setActivePlanId] = useState(initialPlan?.id ?? '');
  const [visitStage, setVisitStage] = useState<PhenologyVisit>(visitFromPlan(initialPlan));
  const [stageEditing, setStageEditing] = useState(false);
  const [fillPlanted, setFillPlanted] = useState('');
  const [visitDate, setVisitDate] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }));
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
  const establishmentRecord = activities.find((activity) => activity.locationId === locationId && activity.stream === 'field' && activity.details?.estadio === 'Perfilhamento' && activity.details?.categoria_area === activeAreaCategory);
  const establishmentScore = visitStage === 'Perfilhamento' ? quality.establishment : Number(establishmentRecord?.details?.estabelecimento ?? quality.establishment);
  const uniformityScore = visitStage === 'Perfilhamento' ? quality.uniformity : Number(establishmentRecord?.details?.uniformidade ?? quality.uniformity);
  const pendingWeedControl = Boolean(latestWeedEvent && Number(latestWeedEvent.details?.daninhas ?? 0) >= 3 && latestWeedEvent.details?.controle_daninhas !== 'Sim, controle confirmado');
  const ratingFor = (group: MacroGroup) => groupRatings[group] ?? { score: 4, condition: 'Adequado', notes: '' };
  const fieldQuality = qualityFrom({ ...quality, establishment: establishmentScore, uniformity: uniformityScore });
  const combinedScore = fieldQuality.score;
  const combined = { score: combinedScore, label: combinedScore >= 85 ? 'Excelente' : combinedScore >= 70 ? 'Adequado' : combinedScore >= 50 ? 'Atenção' : 'Crítico' };
  const expectedStage = visitFromPlan(activePlan);
  const macroStage: MacroStage = mode === 'operational' ? (/enchimento/i.test(activityName) ? 'Condução' : /colhe/i.test(activityName) ? 'Colheita' : /seme|plantio/i.test(activityName) ? 'Semeadura' : 'Condução') : visitStage === 'Semeadura' ? 'Semeadura' : visitStage === 'Maturidade' ? 'Colheita' : 'Condução';
  const assessments = JSON.stringify(Object.fromEntries(installedGroups.map((group) => [group, ratingFor(group)])));
  const activeDynamicFields = dynamicFields.filter((field) => (field.entity === mode || field.entity === 'both') && (mode === 'field' ? field.visibleField : field.visibleOperational));

  return <><PageHead eyebrow={mode === 'operational' ? 'Execução · Manejo e implantação' : 'Inspeção · Acompanhamento de campo'} title={mode === 'operational' ? 'Registro operacional' : 'Registro de campo'} copy={mode === 'operational' ? 'Registre semeadura, aplicações, adubação e demais operações previstas.' : 'Registre inspeções, etiquetagem, roçagem e avaliações da cultura.'} />
    <form className="activity-layout phenology-activity" onSubmit={onSave}>
      {activePlan && <section className="activity-context"><div><span>VISITA PREVISTA NO PLANEJAMENTO</span><b>{activePlan.activity}</b><small>{activePlan.trialId} · {formatDate(activePlan.start)} · versão {activePlan.version}</small></div><Status kind={activePlan.start < todayIso() ? 'attention' : 'ok'}>{activePlan.start < todayIso() ? 'Em atraso' : 'No prazo'}</Status></section>}
      <input type="hidden" name="plannedId" value={activePlan?.id ?? ''} /><input type="hidden" name="recordStream" value={mode} /><input type="hidden" name="baseScope" value="Categoria da área" /><input type="hidden" name="areaCategory" value={activeAreaCategory} /><input type="hidden" name="baseMacroGroup" value={installedGroups[0] ?? groupFromCategory(activeAreaCategory)} /><input type="hidden" name="macroStage" value={macroStage} /><input type="hidden" name="visitStage" value={visitStage} /><input type="hidden" name="expectedStage" value={expectedStage} /><input type="hidden" name="groupAssessments" value={assessments} /><input type="hidden" name="calculatedQualityScore" value={combined.score} />

      <section className="card visit-header"><div className="form-grid"><label>Localidade<select name="locationId" value={locationId} onChange={(event) => { const nextLocation = event.target.value; const nextPlan = schedule.find((item) => item.status !== 'Concluído' && activityStreamFor(item) === mode && (item.locationId === nextLocation || trialList.find((trial) => trial.id === item.trialId)?.locationId === nextLocation)); setLocationId(nextLocation); setActivePlanId(nextPlan?.id ?? ''); setVisitStage(visitFromPlan(nextPlan)); setStageEditing(false); setFillPlanted(''); setVisitDate(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })); setGroupRatings({}); setCheckedItems([]); }}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label><label>Atividade planejada por categoria<select value={activePlanId} required onChange={(event) => { const plan = schedule.find((item) => item.id === event.target.value); setActivePlanId(event.target.value); setVisitStage(visitFromPlan(plan)); setStageEditing(false); setFillPlanted(''); setVisitDate(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })); setCheckedItems([]); }}><option value="">Selecione</option>{availablePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.areaCategory ?? 'Área'} · {plan.activity} · {formatDate(plan.start)}</option>)}</select></label><label>Data realizada<input name="date" type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} required /></label></div><div className="visit-summary"><span><b>{activeAreaCategory}</b><small>categoria da atividade</small></span><span><b>{categoryTrials.length}</b><small>ensaios abrangidos</small></span><span><b>{availablePlans.length}</b><small>atividades abertas</small></span></div></section>

      <section className="card form-card visit-stage-card"><div className="section-number">01</div><div><h2>Fase do campo</h2><p>A fase prevista é consolidada automaticamente. Altere somente se houver divergência em campo.</p></div><div><div className="observed-stage"><span><small>FASE PREVISTA</small><b>{expectedStage}</b></span><button type="button" className="secondary-button" onClick={() => { setStageEditing(!stageEditing); setVisitStage(expectedStage); setCheckedItems([]); }}>{stageEditing ? 'Usar fase prevista' : 'Alterar fase observada'}</button></div>{stageEditing && <div className="form-grid"><label>Fase observada<select value={visitStage} onChange={(event) => { setVisitStage(event.target.value as PhenologyVisit); setCheckedItems([]); }}>{visitOrder.map((stage) => <option key={stage}>{stage}</option>)}</select></label>{visitStage !== expectedStage && <label>Motivo da divergência<input name="stageReason" required placeholder="Descreva a diferença observada" /></label>}</div>}</div></section>

      <section className="card form-card protocol-check-card"><div className="section-number">02</div><div><h2>Checklist da atividade</h2><p>Cada atividade exibe somente os itens previstos para a categoria selecionada.</p></div><div>
        <div className="checklist visit-checklist"><h3>{activePlan?.activity ?? visitStage} · itens obrigatórios</h3>{activityChecks.map((check) => <div className="check-with-photo" key={check}><label><input type="checkbox" name="checks" value={check} required checked={checkedItems.includes(check)} onChange={(event) => setCheckedItems(event.target.checked ? [...checkedItems, check] : checkedItems.filter((item) => item !== check))} /><span>✓</span>{check}</label></div>)}</div>
        {mode === 'operational' && /seme|plantio/i.test(activePlan?.activity ?? '') && <div className="sowing-confirmation"><label>Foi plantado o enchimento?<select name="fillPlanted" required value={fillPlanted} onChange={(event) => setFillPlanted(event.target.value)}><option value="" disabled>Selecione</option><option>Sim</option><option>Não</option><option>Não se aplica</option></select></label>{fillPlanted === 'Não' && <label>Data prevista para plantar o enchimento<input name="fillPlannedDate" type="date" min={visitDate} required /><small>Será criada uma atividade de Plantio do enchimento no calendário deste local e categoria.</small></label>}</div>}
        {mode === 'field' && pendingWeedControl && visitStage !== 'Perfilhamento' && <div className="weed-followup"><span className="weed-alert-icon">!</span><div><small>PENDÊNCIA DA VISITA ANTERIOR</small><h3>O controle de plantas daninhas foi realizado?</h3><p>A pressão registrada foi {latestWeedEvent?.details?.daninhas}/5. Confirme a ação corretiva.</p><div><label><input type="radio" name="weedControl" value="Sim, controle confirmado" required />Sim, realizado</label><label><input type="radio" name="weedControl" value="Parcialmente realizado" required />Parcial</label><label><input type="radio" name="weedControl" value="Não realizado" required />Não realizado</label></div></div></div>}
        {mode === 'field' && <><div className="field-observation-grid score-box-grid">{visitStage === 'Perfilhamento' ? <><ScoreBoxes name="establishment" label="Estabelecimento da cultura" value={quality.establishment} positive onChange={(value) => setQuality({ ...quality, establishment: value })} /><ScoreBoxes name="uniformity" label="Uniformidade" value={quality.uniformity} positive onChange={(value) => setQuality({ ...quality, uniformity: value })} /></> : <div className="locked-establishment"><span>🔒</span><div><b>Estabelecimento e uniformidade bloqueados</b><p>Essas notas são definidas somente na inspeção de perfilhamento{establishmentRecord ? `: ${establishmentScore}/5 e ${uniformityScore}/5` : '. Ainda não há avaliação registrada para esta área'}.</p></div><input type="hidden" name="establishment" value={establishmentScore} /><input type="hidden" name="uniformity" value={uniformityScore} /></div>}<ScoreBoxes name="weeds" label="Pressão de daninhas" value={quality.weeds} onChange={(value) => setQuality({ ...quality, weeds: value })} /><ScoreBoxes name="disease" label="Severidade de doenças" value={quality.disease} onChange={(value) => setQuality({ ...quality, disease: value })} /></div><DiseaseFields />{(quality.weeds > 3 || quality.disease > 3) && <div className="risk-alert"><b>Alerta técnico ativo</b><small>{quality.weeds > 3 ? `Pressão de daninhas ${quality.weeds}/5` : ''}{quality.weeds > 3 && quality.disease > 3 ? ' · ' : ''}{quality.disease > 3 ? `Doenças ${quality.disease}/5` : ''}</small></div>}<div className={`quality-preview quality-${combined.label.toLowerCase().replace('í','i').replace('ç','c')}`}><span>Qualidade consolidada do campo</span><b>{combined.score}<small>/100</small></b><em>{combined.label}</em></div></>}
        {mode === 'operational' && /fungic|herbic|insetic|aplica|pulver/i.test(activePlan?.activity ?? '') && <div className="form-grid management-fields optional-fields"><span className="optional-label">Campos complementares · opcionais para aplicações</span><label>Produto ou insumo<input name="product" placeholder="Ex.: fungicida ou herbicida" /></label><label>Dose / regulagem<input name="dose" placeholder="Ex.: 0,75 L/ha" /></label><label>Condição da atividade<select name="condition"><option>Conforme planejado</option><option>Executado com ressalva</option><option>Não executado</option></select></label></div>}
        <div className="adverse-report"><div className="adverse-title"><span>!</span><div><h3>Reporte de situação adversa</h3><p>Opcional. O desconto será aplicado à qualidade conforme a abrangência escolhida.</p></div></div><div className="form-grid"><label>Abrangência<select name="scope" value={adverseScope} onChange={(event) => { setAdverseScope(event.target.value); setAdverseTrial(''); }}><option value="">Nenhuma ocorrência</option><option>Local inteiro</option><option>Tipo de ensaio</option><option>Ensaio específico</option></select></label>{adverseScope && <label>Categoria<select name="adverseCategory" defaultValue=""><option value="" disabled>Selecione</option><option>Parcela perdida</option><option>Linha entupida</option><option>Fitotoxidez</option><option>Atraso na aplicação</option><option>Sobredose de N</option><option>Outro</option></select></label>}{(adverseScope === 'Tipo de ensaio' || adverseScope === 'Ensaio específico') && <label>Tipo de ensaio<select name="macroGroup" value={adverseGroup} onChange={(event) => { setAdverseGroup(event.target.value as MacroGroup); setAdverseTrial(''); }}>{installedGroups.map((group) => <option key={group}>{group}</option>)}</select></label>}{adverseScope === 'Ensaio específico' && <label>Ensaio<select name="adverseTrial" value={adverseTrial} onChange={(event) => setAdverseTrial(event.target.value)}><option value="">Selecione</option>{localTrials.filter((trial) => macroGroupFor(trial) === adverseGroup).map((trial) => <option key={trial.id} value={trial.id}>{trial.id} · {trial.name}</option>)}</select></label>}{adverseScope && <><label>Quantidade afetada<input name="adverseQuantity" type="number" min="1" defaultValue="1" /></label><label>PlotID(s)<input name="adversePlotIds" placeholder="Ex.: 1201; 1202" /></label><label className="full">Descrição<textarea name="adverseDescription" rows={3} placeholder="Descreva o ocorrido, impacto e ação recomendada" /></label><label className="full adverse-photo">Imagem da ocorrência<input name="adversePhotos" type="file" accept="image/*" capture="environment" multiple /></label></>}</div>{adverseScope && <small className="penalty-hint">Regra padrão: parcela perdida −1% por unidade; linha entupida −0,3% por unidade (10 linhas = −3%); demais categorias seguem pesos configurados.</small>}</div>
      </div></section>

      {mode === 'operational' && /fungic|herbic|insetic|aplica|pulver/i.test(activePlan?.activity ?? '') && activeDynamicFields.length > 0 && <section className="card form-card dynamic-record-fields"><div className="section-number">03</div><div><h2>Campos complementares</h2><p>Opcionais e exibidos somente para aplicações.</p></div><div className="form-grid">{activeDynamicFields.map((field) => <DynamicFieldInput key={field.id} field={field} />)}</div></section>}

      <section className="card quick-note-card"><PhotoCapture /><label>Anotação rápida<textarea name="notes" rows={3} placeholder="O que foi observado ou realizado?" /></label></section>

      <section className="form-actions"><span>O registro e as fotos ficam guardados neste navegador. Confira depois em Meus registros.</span><div><button type="reset" className="secondary-button">Limpar</button><button type="submit" className="primary-button" disabled={saving || !installedGroups.length || !activePlan}>{saving ? 'Salvando registro e fotos…' : '✓ Salvar atividade'}</button></div></section>
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

function HistoryScreen({ activities, onNew }: { activities: Activity[]; onNew: () => void }) {
  const locations = useContext(ProgramLocations) ?? baseLocations;
  return <><PageHead eyebrow="Rastreabilidade" title="Histórico de manejo" copy="Todas as atividades registradas na rede, da mais recente para a mais antiga." action={<button className="primary-button" onClick={onNew}>＋ Nova atividade</button>} />
    <section className="toolbar"><button>Todos os ensaios⌄</button><button>Todos os tipos⌄</button><button>Últimos 30 dias⌄</button></section>
    <section className="card history-list">{activities.map((activity) => <article key={activity.id}><div className="timeline-dot" /><time>{activity.date}</time><div className="activity-icon">✓</div><div className="activity-copy"><span>{activity.macroStage ?? activity.type}</span><h2>{activity.notes}</h2><p><b>{activity.locationId ? locations.find((location) => location.id === activity.locationId)?.name : activity.trial}</b>{activity.scope ? ` · ${activity.scope}${activity.scope !== 'Área total' ? `: ${activity.macroGroup}` : ''}` : ''} · Registrado por {activity.owner}{activity.qualityScore !== undefined ? ` · Qualidade ${activity.qualityScore}/100 (${activity.qualityClass})` : ''}</p>{activity.checks && <small>{activity.checks.length} checks concluídos{activity.photos?.length ? ` · ${activity.photos.length} foto(s)` : ''}</small>}{Boolean(activity.photoIds?.length) && <details className="saved-record-photos"><summary>Ver {activity.photoIds?.length} foto(s) do registro</summary><ActivityPhotoGallery ids={activity.photoIds!} /></details>}</div><button aria-label="Mais opções">•••</button></article>)}</section>
  </>;
}

function AdminRegistrationScreen({ registeredTrials, trialList, activities, schedule, harvests, activeHarvestId, lastUpdated, dynamicFields, onDynamicFields, activityTemplates, onActivityTemplates, onSave, onImportDataset, onImportUnified, onCreatePlanning, onCreateHarvest, onHarvestStatus, onHarvest, onFinalizeLayout, onDeleteTrial, onDeleteLocation, onReportImplementation }: { registeredTrials: Trial[]; trialList: Trial[]; activities: Activity[]; schedule: PlannedActivity[]; harvests: Harvest[]; activeHarvestId: string; lastUpdated: string; dynamicFields: DynamicField[]; onDynamicFields: (fields: DynamicField[]) => void; activityTemplates: ActivityTemplate[]; onActivityTemplates: (templates: ActivityTemplate[]) => void; onSave: (event: FormEvent<HTMLFormElement>) => void; onImportDataset: (dataset: string, rows: Record<string, unknown>[]) => void; onImportUnified: (rows: Record<string, unknown>[]) => void; onCreatePlanning: (config: PlanningWizardConfig) => void; onAddLocation: (input: { code: string; name: string; city: string; uf: string; region: string; lat: number; lng: number }) => void; onAddTrials: (input: { locationIds: string[]; trialCode: string; trialName: string; group: MacroGroup; subtype: string; fieldCode: string; fieldName: string; plots: number; sowing: string; owner: string; priority: string }) => void; onCreateHarvest: (name: string, clone: boolean) => void; onHarvestStatus: (id: string, status: HarvestStatus) => void; onHarvest: (id: string) => void; onFinalizeLayout: (payload: LayoutFinalization) => void; onDeleteTrial: (id: string) => void; onDeleteLocation: (id: string) => void; onReportImplementation: (input: { locationId: string; trialId: string; plotIds: string[]; category: string; description: string }) => void }) {
  const locations = useContext(ProgramLocations) ?? baseLocations;
  const [tab, setTab] = useState<'unified' | 'catalog' | 'fields' | 'templates' | 'harvests' | 'planner' | 'import' | 'records' | 'quality' | 'alerts' | 'implantation'>('unified');
  const [issueLocation, setIssueLocation] = useState(locations[0]?.id ?? '');
  const [issueTrial, setIssueTrial] = useState('');
  const issueRange = useMemo(() => {
    const trial = trialList.find((item) => item.id === issueTrial);
    if (!trial) return { start: '', end: '' };
    try {
      const rows = JSON.parse(localStorage.getItem('field-wheat-unified-source-v1') ?? '[]') as Record<string, unknown>[];
      const row = rows.find((item) => item.ensaio_codigo === trial.id);
      if (row?.parcela_inicial && row?.parcela_final) return { start: String(row.parcela_inicial), end: String(row.parcela_final) };
      const catalog = parseLayout(localStorage.getItem(`field-wheat-layout-catalog-${activeHarvestId}-${trial.locationId}`) ?? '[]') as Array<{ metadata?: { mapId?: string }; allocations?: Array<{ id: string; startPlotId: string; endPlotId: string }> }>;
      const allocation = catalog.find((map) => map.metadata?.mapId === trial.mapId)?.allocations?.find((item) => trial.id === `${item.id}-${trial.locationId}-${trial.mapId}`);
      return { start: allocation?.startPlotId ?? '', end: allocation?.endPlotId ?? '' };
    } catch { return { start: '', end: '' }; }
  }, [issueTrial, trialList, activeHarvestId]);
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
      const required = ['local_codigo','local_nome','vcu_regiao','ensaio_codigo','ensaio_nome','grupo','parcelas','data_semeadura','visita_codigo','atividade_descricao','estadio_fenologico','estadio_previsto','motivo_alteracao_estadio','enchimento_plantado','data_prevista_enchimento','data_prevista'];
      const headers = Object.keys(rows[0] ?? {});
      const missing = required.filter((column) => !headers.includes(column));
      const duplicateVisits = rows.map((row) => String(row.visita_codigo ?? '')).filter(Boolean).filter((id, index, all) => all.indexOf(id) !== index);
      const errors = [missing.length ? `Colunas ausentes: ${missing.join(', ')}` : '', duplicateVisits.length ? `Códigos de visita repetidos: ${[...new Set(duplicateVisits)].slice(0, 5).join(', ')}` : ''].filter(Boolean);
      setUnifiedResult({ name: file.name, rows, errors });
    } catch (error) { setUnifiedResult({ name: file.name, rows: [], errors: [error instanceof Error ? error.message : 'Não foi possível ler a planilha.'] }); }
    setImporting(false);
  }
  function submitHarvest(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); onCreateHarvest(String(data.get('harvestName')), clonePlanning); event.currentTarget.reset(); }
  function saveWeights() { localStorage.setItem('fwt-quality-weights', JSON.stringify(weights)); setSavedMessage('Pesos e componentes de qualidade salvos.'); setTimeout(() => setSavedMessage(''), 3000); }
  function addVariable(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const name = String(form.get('variable')).trim(); if (name && !variables.includes(name)) setVariables([...variables, name]); event.currentTarget.reset(); }
  function addLocation(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const next = [...adminLocations, { name: String(form.get('name')), city: String(form.get('city')), region: String(form.get('region')) }]; setAdminLocations(next); localStorage.setItem('fwt-admin-locations', JSON.stringify(next)); event.currentTarget.reset(); }
  function exportReport() {
    const rows = locations.map((location) => { const overview = localityOverview(location.id, trialList, activities, schedule); return [location.name, overview.localTrials.length, overview.plantedPercent, overview.stage, overview.quality, schedule.filter((item) => overview.localTrials.some((trial) => trial.id === item.trialId) && item.status !== 'Concluído' && item.start < todayIso()).length]; });
    const csv = [['Localidade','Ensaios','Percentual semeado','Estadio predominante','Qualidade media','Alertas'], ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"','""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'resumo-evolucao-campos.csv'; link.click(); URL.revokeObjectURL(url);
  }
  async function exportUnifiedReport() {
    const { Workbook } = await import('exceljs');
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Gestão da Safra', { views: [{ state: 'frozen', ySplit: 3, xSplit: 2 }] });
    const dynamicHeaders = dynamicFields.map((field) => `variavel_${field.id}`);
    const headers = ['programa','local_codigo','local_nome','municipio','uf','latitude','longitude','tipo_area','mapa_id','mapa_nome','arquivo_croqui','codigo_alocacao','cor_ensaio','campo_codigo','campo_nome','ensaio_codigo','ensaio_nome','grupo','subtipo_ensaio','parcela_inicial','parcela_final','primeira_parcela_latitude','primeira_parcela_longitude','parcelas','parcelas_com_alerta','parcelas_perdidas','penalidade_implantacao','data_semeadura_prevista','data_semeadura','visita_codigo','atividade_descricao','estadio_fenologico','data_prevista','responsavel','prioridade','status_planejamento','data_realizada','checklist_concluido','estabelecimento_nota','uniformidade_nota','daninhas_nota','controle_daninhas','oidio_nota','ferrugem_nota','manchas_nota','observacoes','fotos','nota_qualidade','classificacao','alerta_categoria','alerta_abrangencia','alerta_descricao','alerta_plotid','desconto_qualidade_pct', ...dynamicHeaders];
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
      const values: Record<string, unknown> = { ...original, programa: location ? locationProgram(location) : original.programa, local_codigo: location?.id, local_nome: location?.name, municipio: String(original.municipio ?? location?.city?.split(' - ')[0] ?? ''), uf: String(original.uf ?? location?.city?.split(' - ')[1] ?? ''), latitude: location?.lat, longitude: location?.lng, vcu_regiao: String(original.vcu_regiao ?? location?.region ?? '').replace('_1',' I').replace('_2',' II').replace('_3',' III'), tipo_area: trial?.areaCategory ?? original.tipo_area, mapa_id: trial?.mapId ?? original.mapa_id, mapa_nome: original.mapa_nome, cor_ensaio: original.cor_ensaio, campo_nome: trial?.fieldName, ensaio_codigo: trial?.id, ensaio_nome: trial?.name, grupo: trial?.type, subtipo_ensaio: trial?.subtype, parcelas: trial?.plots, parcelas_com_alerta: trial?.affectedPlots?.join('; '), parcelas_perdidas: trial?.lostPlots?.join('; '), penalidade_implantacao: trial?.layoutPenalty, data_semeadura_prevista: trial?.sowing, data_semeadura: trial ? actualSowingDate(trial, activities, schedule) : '', visita_codigo: plan.id, atividade_descricao: plan.activity, estadio_fenologico: record?.details?.estadio || visitFromPlan(plan), estadio_previsto: record?.details?.estadio_previsto || visitFromPlan(plan), motivo_alteracao_estadio: record?.details?.motivo_alteracao_estadio, enchimento_plantado: record?.details?.enchimento_plantado, data_prevista_enchimento: record?.details?.data_prevista_enchimento, data_prevista: plan.start, responsavel: plan.owner, prioridade: plan.priority, status_planejamento: record ? 'Finalizado' : plan.status, data_realizada: activityDate, checklist_concluido: record?.checks?.join('; '), estabelecimento_nota: record?.details?.estabelecimento, uniformidade_nota: record?.details?.uniformidade, daninhas_nota: record?.details?.daninhas, controle_daninhas: record?.details?.controle_daninhas, oidio_nota: record?.details?.oidio, ferrugem_nota: record?.details?.ferrugem, manchas_nota: record?.details?.manchas, observacoes: record?.notes ?? plan.notes, fotos: record?.photos?.join('; '), nota_qualidade: trial ? trialQuality(trial, activities).score : record?.qualityScore, classificacao: trial ? trialQuality(trial, activities).label : record?.qualityClass, alerta_categoria: applicableAlerts.map((item) => item.alertCategory).join('; '), alerta_abrangencia: applicableAlerts.map((item) => item.scope).join('; '), alerta_descricao: applicableAlerts.map((item) => item.details?.ocorrencia || item.notes).join(' | '), alerta_plotid: applicableAlerts.flatMap((item) => item.plotIds ?? []).join('; '), desconto_qualidade_pct: applicableAlerts.reduce((sum, item) => sum + Number(item.qualityPenalty ?? 0), 0) };
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
    <nav className="admin-tabs">{([['unified','Base de gestão'],['catalog','Cadastro de local'],['templates','Atividades por área'],['fields','Campos de registro'],['harvests','Safras e histórico'],['quality','Índices de qualidade'],['implantation','Problemas de implantação'],['alerts','Relatório e alertas']] as const).map(([id,label]) => <button className={tab === id ? 'active' : ''} onClick={() => setTab(id)} key={id}>{label}</button>)}</nav>
    {savedMessage && <div className="admin-saved">✓ {savedMessage}</div>}
    {tab === 'unified' && <UnifiedManagementPanel importing={importing} result={unifiedResult} lastUpdated={updatedLabel} locked={activeAdminHarvest?.status === 'Encerrada'} scheduleCount={schedule.length} onFile={importUnifiedFile} onLoad={(rows) => { onImportUnified(rows); setSavedMessage('Planejamento atualizado e salvo.'); setTimeout(() => setSavedMessage(''), 3000); }} onExport={exportUnifiedReport} />}
    {tab === 'catalog' && <CroquiCatalogPanel harvestId={activeHarvestId} harvestName={activeAdminHarvest?.name ?? 'Safra 2026'} locked={activeAdminHarvest?.status === 'Encerrada'} locationsList={locations} trialList={trialList} schedule={schedule} onFinalize={onFinalizeLayout} onDeleteTrial={onDeleteTrial} onDeleteLocation={onDeleteLocation} />}
    {tab === 'fields' && <ActivityFieldManager fields={dynamicFields} onChange={onDynamicFields} />}
    {tab === 'templates' && <ActivityTemplateManager templates={activityTemplates} onChange={onActivityTemplates} />}
    {tab === 'harvests' && <HarvestManagementPanel harvests={harvests} activeId={activeHarvestId} clonePlanning={clonePlanning} onClone={setClonePlanning} onCreate={submitHarvest} onSelect={onHarvest} onStatus={onHarvestStatus} />}
    {tab === 'implantation' && <section className="card implementation-report"><div><span className="eyebrow">ATUALIZAÇÃO DIRETA DO CROQUI</span><h2>Reportar problema de implantação</h2><p>Informe os PlotIDs uma única vez. O ensaio, os indicadores de qualidade e o mapa da área serão atualizados automaticamente.</p></div><form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); onReportImplementation({ locationId: String(data.get('locationId')), trialId: String(data.get('trialId')), category: String(data.get('category')), plotIds: String(data.get('plotIds')).split(/[;,\s]+/).filter(Boolean), description: String(data.get('description')) }); event.currentTarget.reset(); }}><div className="form-grid"><label>Local<select name="locationId" value={issueLocation} onChange={(event) => { setIssueLocation(event.target.value); setIssueTrial(''); }}>{locations.map((location) => <option value={location.id} key={location.id}>{location.name}</option>)}</select></label><label>Ensaio<select name="trialId" required value={issueTrial} onChange={(event) => setIssueTrial(event.target.value)}><option value="">Selecione</option>{trialList.filter((trial) => trial.locationId === issueLocation).map((trial) => <option value={trial.id} key={trial.id}>{trial.name} · {trial.id}</option>)}</select></label>{issueTrial && <div className="plot-range-preview"><b>Intervalo do ensaio</b><span>PlotID inicial: {issueRange.start || 'Não disponível'}</span><span>PlotID final: {issueRange.end || 'Não disponível'}</span></div>}<label>Tipo de problema<select name="category"><option>Parcela perdida</option><option>Linha entupida</option><option>Falha de semeadura</option><option>Passada de pulverizador</option><option>Fitotoxidez</option><option>Outro</option></select></label><label>PlotIDs<input name="plotIds" required placeholder="Ex.: 1201; 1202; 1203" /></label><label className="full">Descrição<textarea name="description" required rows={4} placeholder="Descreva a ocorrência e a ação recomendada" /></label></div><button className="primary-button">Atualizar ensaio e croqui</button></form></section>}
    {tab === 'import' && <section className="admin-data-grid"><article className="card admin-upload-card"><span className="eyebrow">FONTE ÚNICA DE DADOS</span><h2>Carregar planejamento operacional</h2><p>O mesmo arquivo cria locais, campos, ensaios, calendário fenológico e atividades previstas. Cada linha representa uma visita para um ensaio.</p><label className="spreadsheet-drop"><input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => importUnifiedFile(event.target.files?.[0])} /><span>▤</span><b>{importing ? 'Lendo e validando…' : 'Selecionar planilha unificada'}</b><small>.xlsx, .xls ou .csv</small></label><a className="template-download" href="planejamento-unificado-field-wheat-testing.xlsx" download>↓ Baixar modelo oficial</a><button className="secondary-button" type="button" disabled={!schedule.length} onClick={exportUnifiedReport}>↓ Exportar arquivo final com registros</button></article><article className="card import-validation"><div className="card-head"><div><h2>Validação e distribuição</h2><p>Uma importação alimenta todas as funcionalidades da plataforma.</p></div></div><div className="rule-flow"><span><b>Planilha</b><small>planejamento unificado</small></span><i>→</i><span><b>Plataforma</b><small>mapa, ensaios e agenda</small></span><i>→</i><span><b>Saída</b><small>registros e relatório final</small></span></div>{!unifiedResult ? <div className="empty-admin"><span>✓</span><p>Baixe o modelo, preencha as colunas verdes e carregue o arquivo aqui.</p></div> : <><div className={unifiedResult.errors.length ? 'import-state error' : 'import-state success'}><b>{unifiedResult.errors.length ? 'Arquivo com pendências' : 'Base unificada carregada'}</b><small>{unifiedResult.name} · {unifiedResult.rows.length} linhas</small>{unifiedResult.errors.map((error) => <em key={error}>{error}</em>)}</div>{!unifiedResult.errors.length && <div className="metric-list"><div><span>Locais</span><b>{new Set(unifiedResult.rows.map((row) => row.local_codigo)).size}</b></div><div><span>Ensaios</span><b>{new Set(unifiedResult.rows.map((row) => row.ensaio_codigo)).size}</b></div><div><span>Visitas previstas</span><b>{unifiedResult.rows.length}</b></div><div><span>Registros realizados</span><b>{unifiedResult.rows.filter((row) => row.data_realizada).length}</b></div></div>}</>}</article></section>}
    {tab === 'planner' && <section className="card click-planner"><div className="planner-heading"><div><span className="eyebrow">ASSISTENTE DE PLANEJAMENTO</span><h2>Monte o planejamento sem preencher planilhas</h2><p>As atividades e datas são geradas automaticamente a partir da semeadura prevista de cada ensaio.</p></div><span className="planner-count"><b>{plannerTrials.length}</b><small>selecionados</small></span></div><div className="planner-steps"><section><span className="step-number">1</span><h3>Tipo de ensaio</h3><p>Use um tipo para reduzir a lista.</p><div className="planner-choice-row">{['Todos',...[...new Set(trialList.map((trial) => trial.type))]].map((type) => <button className={plannerType === type ? 'active' : ''} onClick={() => { setPlannerType(type); setPlannerTrials([]); }} key={type}>{type}</button>)}</div></section><section><span className="step-number">2</span><h3>Localidade</h3><p>Selecione onde os ensaios serão conduzidos.</p><div className="planner-location-grid">{locations.filter((location) => trialList.some((trial) => trial.locationId === location.id)).map((location) => <button className={plannerLocation === location.id ? 'active' : ''} key={location.id} onClick={() => { setPlannerLocation(location.id); setPlannerTrials([]); }}><i>◎</i><span><b>{location.name}</b><small>{trialList.filter((trial) => trial.locationId === location.id).length} ensaios</small></span></button>)}</div></section><section><span className="step-number">3</span><h3>Quais ensaios estarão neste planejamento?</h3><p>Marque um, vários ou todos os ensaios disponíveis no local.</p><button className="select-all-trials" onClick={() => setPlannerTrials(plannerTrials.length === availablePlannerTrials.length ? [] : availablePlannerTrials.map((trial) => trial.id))}>{plannerTrials.length === availablePlannerTrials.length && availablePlannerTrials.length ? 'Desmarcar todos' : 'Selecionar todos'}</button><div className="planner-trial-list">{availablePlannerTrials.map((trial) => <label key={trial.id}><input type="checkbox" checked={plannerTrials.includes(trial.id)} onChange={() => setPlannerTrials(plannerTrials.includes(trial.id) ? plannerTrials.filter((id) => id !== trial.id) : [...plannerTrials, trial.id])} /><span>✓</span><div><b>{trial.name}</b><small>{trial.id} · {trial.type} · semeadura {formatDate(trial.sowing)}</small></div></label>)}{availablePlannerTrials.length === 0 && <p className="empty-copy">Nenhum ensaio deste tipo está vinculado ao local.</p>}</div></section><section><span className="step-number">4</span><h3>Protocolo de atividades</h3><p>Escolha um conjunto pré-estabelecido.</p><div className="planner-profiles">{([['Essencial','3 atividades','Semeadura, estabelecimento e colheita'],['Completo','7 atividades','Implantação, manejos, avaliações e colheita'],['Monitoramento','4 atividades','Avaliações e colheita']] as const).map(([profile,count,copy]) => <button className={plannerProfile === profile ? 'active' : ''} onClick={() => setPlannerProfile(profile)} key={profile}><b>{profile}</b><span>{count}</span><small>{copy}</small></button>)}</div></section></div><div className="planner-review"><div><small>RESUMO</small><b>{locations.find((location) => location.id === plannerLocation)?.name}</b><span>{plannerTrials.length} ensaio(s) · protocolo {plannerProfile}</span></div><button className="primary-button" disabled={!plannerTrials.length} onClick={() => { onCreatePlanning({ locationId: plannerLocation, trialIds: plannerTrials, profile: plannerProfile }); setPlannerTrials([]); }}>Gerar planejamento e calendário →</button></div></section>}
    {tab === 'import' && <section className="admin-data-grid"><article className="card admin-upload-card"><span className="eyebrow">BASE EXCEL / CSV</span><h2>Importar dados operacionais</h2><p>Selecione a tabela correspondente. O arquivo é validado antes de substituir a base salva neste navegador.</p><label>Tipo de informação<select value={dataset} onChange={(event) => { setDataset(event.target.value); setImportResult(null); }}>{Object.keys(requiredColumns).map((name) => <option key={name}>{name}</option>)}</select></label><label className="spreadsheet-drop"><input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => importFile(event.target.files?.[0])} /><span>▤</span><b>{importing ? 'Lendo planilha…' : 'Selecionar Excel ou CSV'}</b><small>.xlsx, .xls ou .csv</small></label><a className="template-download" href="modelo-field-wheat-testing.xlsx" download>↓ Baixar modelo formatado</a></article><article className="card import-validation"><div className="card-head"><div><h2>Validação da estrutura</h2><p>Colunas obrigatórias para {dataset.toLowerCase()}</p></div></div><div className="required-columns">{requiredColumns[dataset].map((column) => <span key={column}>{column}</span>)}</div>{!importResult ? <div className="empty-admin"><span>✓</span><p>Envie uma planilha para conferir a estrutura e visualizar as primeiras linhas.</p></div> : <><div className={importResult.errors.length ? 'import-state error' : 'import-state success'}><b>{importResult.errors.length ? 'Arquivo com pendências' : 'Arquivo validado'}</b><small>{importResult.name} · {importResult.rows.length} registros</small>{importResult.errors.map((error) => <em key={error}>{error}</em>)}</div>{!importResult.errors.length && <div className="import-preview">{importResult.rows.slice(0,3).map((row,index) => <code key={index}>{Object.values(row).slice(0,4).join(' · ')}</code>)}</div>}</>}</article></section>}
    {tab === 'records' && <><section className="admin-config-grid"><form className="card quick-admin-form" onSubmit={addLocation}><span className="eyebrow">LOCALIDADES</span><h2>Adicionar localidade</h2><label>Nome<input name="name" required placeholder="Ex.: Não-Me-Toque - RS" /></label><label>Município<input name="city" required /></label><label>RHA<select name="region"><option value="RHA_1">RHA I</option><option value="RHA_2">RHA II</option><option value="RHA_3">RHA III</option></select></label><button className="secondary-button">Adicionar localidade</button><small>{locations.length + adminLocations.length} localidades configuradas</small></form><article className="card admin-catalog"><h2>Itens configuráveis</h2>{[['Localidades',locations.length + adminLocations.length],['Grupos de manejo',4],['Protocolos',3],['Variáveis de atividade',variables.length]].map(([name,count]) => <div key={name}><span>{name}</span><b>{count}</b><button>Editar</button></div>)}</article></section><details className="manual-trial card"><summary>Cadastro manual de campo e ensaio</summary><form className="admin-register-form" onSubmit={onSave}><div className="form-grid"><label>Nome do campo<input name="fieldName" required /></label><label>Localidade<select name="location">{locations.map((location) => <option value={location.id} key={location.id}>{location.name}</option>)}</select></label><label>Área (ha)<input name="area" type="number" step="0.1" required /></label><label>Solo<select name="soil"><option>Latossolo</option><option>Nitossolo</option><option>Outro</option></select></label><label>Nome do ensaio<input name="trialName" required /></label><label>Tipo<select name="trialType"><option>VCU</option><option>PRYT</option><option>EYT</option></select></label><label>Parcelas<input name="plots" type="number" defaultValue="60" required /></label><label>Prioridade<select name="priority"><option>Normal</option><option>Alta</option><option>Crítica</option></select></label><label>Responsável<select name="owner">{importedUsers.map((user) => <option key={user.id}>{user.name}</option>)}</select></label><label>Semeadura prevista<input name="sowing" type="date" defaultValue="2026-06-15" required /></label></div><input type="hidden" name="profile" value="Completo" /><button className="primary-button">Criar campo e planejamento</button><small>{registeredTrials.length} cadastro(s) manual(is) nesta sessão.</small></form></details></>}
    {tab === 'quality' && <section className="quality-admin-grid"><article className="card weight-editor"><div className="card-head"><div><h2>Média ponderada de qualidade</h2><p>Os pesos devem totalizar 100%.</p></div><b className={Object.values(weights).reduce((sum: number, value: unknown) => sum + Number(value),0) === 100 ? 'weight-total valid' : 'weight-total'}>{Object.values(weights).reduce((sum: number, value: unknown) => sum + Number(value),0)}%</b></div>{Object.entries(weights).map(([key,value]) => <label key={key}><span>{key.charAt(0).toUpperCase()+key.slice(1)}<b>{Number(value)}%</b></span><input type="range" min="0" max="50" value={Number(value)} onChange={(event) => setWeights({ ...weights, [key]: Number(event.target.value) })} /></label>)}<button className="primary-button" onClick={saveWeights}>Salvar regra de cálculo</button></article><article className="card variable-editor"><h2>Componentes da avaliação</h2><p>Campos exibidos nos checks de qualidade do ensaio.</p><div>{variables.map((variable) => <span key={variable}>✓ {variable}<button onClick={() => setVariables(variables.filter((item) => item !== variable))}>×</button></span>)}</div><form onSubmit={addVariable}><input name="variable" placeholder="Nova variável de qualidade" required /><button className="secondary-button">Adicionar</button></form></article></section>}
    {tab === 'alerts' && <section className="alert-report-grid"><article className="card alert-rule-card"><span className="eyebrow">REGRA DE ACOMPANHAMENTO</span><h2>Pressão de plantas daninhas</h2><p>Quando a pressão for detectada em uma visita, uma verificação obrigatória é criada automaticamente para a visita seguinte.</p><div className="rule-flow"><span><b>Visita X</b><small>Pressão detectada ≥ nível 3</small></span><i>→</i><span><b>Alerta aberto</b><small>Solicitar ação corretiva</small></span><i>→</i><span><b>Visita Y</b><small>Resolvido, parcial ou não resolvido</small></span></div><div className="form-grid"><label>Nível de disparo<select><option>3 - Moderada</option><option>2 - Baixa</option><option>4 - Alta</option></select></label><label>Prazo da revisita<input type="number" defaultValue="7" /> dias</label></div><label className="rule-toggle"><input type="checkbox" defaultChecked /> Regra ativa para toda a rede</label></article><article className="card report-card"><span className="eyebrow">RELATÓRIO GERENCIAL</span><h2>Evolução dos campos</h2><p>Resumo por localidade com implantação, estádio, qualidade média e alertas pendentes.</p><div><span><b>{trialList.length}</b><small>ensaios</small></span><span><b>{activities.length}</b><small>registros</small></span><span><b>{schedule.filter((item) => item.status !== 'Concluído' && item.start < todayIso()).length}</b><small>alertas</small></span></div><button className="primary-button" onClick={exportReport}>↓ Emitir relatório CSV</button></article></section>}
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
      if (!code) return;
    const selectedRha = rhaCode(String(data.get('rha')));
    const draft: NetworkLocation = { id: code, name: code, city: String(data.get('city')).trim(), region: selectedRha, rha: selectedRha, lat: Number(data.get('lat')) || -29.63, lng: Number(data.get('lng')) || -53.05, trials: 0, plots: 0, status: 'ok' };
    setDraftLocation(draft); setSelectedLocationId(code); setNewAreaOpen(false); setLayoutOpen(true);
  }
  function openLayout(location: NetworkLocation) { setDraftLocation(null); setSelectedLocationId(location.id); setLayoutOpen(true); }
  return <><section className="management-grid croqui-catalog"><article className="card management-form"><span className="eyebrow">FLUXO OFICIAL DE CADASTRO</span><h2>Cadastro de local por croqui</h2><p>Crie a área, carregue o Excel, posicione as parcelas e defina cada ensaio manualmente pelo intervalo de PlotID/Trat. Ao concluir, a área entra imediatamente em Áreas cadastradas.</p><div className="croqui-flow"><span><b>1</b>Código e coordenada</span><span><b>2</b>Croqui Excel</span><span><b>3</b>Ensaios por PlotID</span><span><b>4</b>Área cadastrada</span></div><button className="primary-button wide" disabled={locked} onClick={() => setNewAreaOpen(true)}>＋ Nova área por croqui ou lista beta</button><p>Opção beta: após abrir a área, selecione Gerar croqui por lista e carregue PlotID, Ensaio e Genótipo.</p>{locked && <small className="locked-copy">A safra está encerrada. Reabra-a para alterar cadastros.</small>}</article><article className="card admin-catalog management-area-catalog"><div className="card-head"><div><h2>Áreas cadastradas</h2><p>Edite croquis e remova ensaios com confirmação de segurança.</p></div><b>{locationsList.length}</b></div>{locationsList.map((location) => { const localTrials = trialList.filter((trial) => trial.locationId === location.id); const localSchedule = schedule.filter((item) => localTrials.some((trial) => trial.id === item.trialId)); return <section className="managed-area" key={location.id}><header><span><b>{location.name}</b><small>{location.id} · {location.city} · {location.plots} parcelas</small></span><strong>{localSchedule.length} atividades</strong><button className="secondary-button" disabled={locked} onClick={() => openLayout(location)}>Editar croqui</button><button className="danger-button" disabled={locked} onClick={() => confirmAction(`Excluir ${location.name} e todos os seus ensaios, atividades e registros?`, () => onDeleteLocation(location.id))}>Excluir local</button></header><div className="managed-trials">{localTrials.map((trial) => <div key={trial.id}><span><b>{trial.name}</b><small>{trial.id} · {trial.plots} parcelas</small></span><button className="danger-link" disabled={locked} onClick={() => confirmAction(`Excluir o ensaio ${trial.name}? O planejamento e os registros vinculados também serão removidos.`, () => onDeleteTrial(trial.id))}>Excluir ensaio</button></div>)}{localTrials.length === 0 && <small>Nenhum ensaio finalizado neste croqui.</small>}</div></section>; })}{locationsList.length === 0 && <div className="empty-admin"><span>⌖</span><p>Nenhuma área finalizada pelo croqui.</p></div>}</article></section>{newAreaOpen && <NewAreaDialog harvestName={harvestName} onClose={() => setNewAreaOpen(false)} onSubmit={startArea} />}{layoutOpen && current && <FieldLayoutMap harvestId={harvestId} location={current} trials={trialList.filter((trial) => trial.locationId === current.id)} onClose={() => { setLayoutOpen(false); setDraftLocation(null); }} onFinalize={(payload) => { onFinalize(payload); if (!payload.continueEditing) { setLayoutOpen(false); setDraftLocation(null); } setSelectedLocationId(payload.location.id); }} />}</>;
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

function HarvestManagementPanel({ harvests, activeId, clonePlanning, onClone, onCreate, onSelect, onStatus }: { harvests: Harvest[]; activeId: string; clonePlanning: boolean; onClone: (value: boolean) => void; onCreate: (event: FormEvent<HTMLFormElement>) => void; onSelect: (id: string) => void; onStatus: (id: string, status: HarvestStatus) => void }) {
  return <section className="harvest-management"><form className="card new-harvest-card" onSubmit={onCreate}><span className="eyebrow">NOVA SAFRA</span><h2>Criar ciclo operacional</h2><label>Nome da safra<input name="harvestName" required placeholder="Safra 2027" /></label><label className="clone-option"><input type="checkbox" checked={clonePlanning} onChange={(event) => onClone(event.target.checked)} /><span><b>Copiar o planejamento da safra atual</b><small>Locais, ensaios e visitas são reaproveitados; registros e notas começam vazios.</small></span></label><button className="primary-button">Confirmar e criar safra</button></form><section className="card harvest-history"><div className="card-head"><div><h2>Histórico de safras</h2><p>Consulte qualidade e situação de cada ciclo.</p></div></div>{harvests.map((harvest) => <article key={harvest.id} className={harvest.id === activeId ? 'active' : ''}><button type="button" onClick={() => onSelect(harvest.id)}><span><b>{harvest.name}</b><small>{harvest.updatedAt ? `Atualizada em ${new Date(harvest.updatedAt).toLocaleDateString('pt-BR')}` : 'Sem atualização'}</small></span><strong>{harvest.quality}/100</strong><em>{harvest.status}</em></button>{harvest.id === activeId && <button className="secondary-button" type="button" onClick={() => onStatus(harvest.id, harvest.status === 'Ativa' ? 'Encerrada' : 'Ativa')}>{harvest.status === 'Ativa' ? 'Encerrar e bloquear registros' : 'Reabrir como administrador'}</button>}</article>)}</section></section>;
}

function UsersScreen() {
  return <><PageHead eyebrow="Equipe · Excel" title="Usuários" copy={`${sourceSummary.users} pessoas com acesso cadastradas na planilha.`} action={<button className="primary-button">＋ Convidar usuário</button>} />
    <section className="card permission-manager"><div className="card-head"><div><span className="eyebrow">HIERARQUIA DE ACESSO</span><h2>Gestão de permissões</h2><p>Os níveis herdam a leitura da plataforma e recebem apenas as ações necessárias ao seu fluxo.</p></div></div><div className="permission-flow">{([['Administrador','Acesso total, usuários e regras'],['Gestor','Indicadores, planejamento e configurações'],['RA','Áreas, atividades e reportes'],['Técnico responsável','Execução e registros de campo']] as const).map(([role, copy], index) => <article key={role}><i>{index + 1}</i><div><b>{role}</b><small>{copy}</small></div><span>{index === 0 ? 'Controle total' : 'Acesso subordinado'}</span></article>)}</div><div className="permission-matrix"><b>Recurso</b><b>ADM</b><b>Gestor</b><b>RA</b><b>Técnico</b>{[['Cadastros e permissões','✓','—','—','—'],['Indicadores e regras','✓','✓','Leitura','Leitura'],['Áreas e planejamento','✓','✓','✓','Leitura'],['Atividades e reportes','✓','✓','✓','✓']].flatMap((row) => row.map((cell, index) => <span key={`${row[0]}-${index}`}>{cell}</span>))}</div></section>
    <section className="user-grid">{importedUsers.map((user, index) => { const initials = user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(); return <article className="card user-card" key={user.id}><div className={`avatar color-${index}`}>{initials}</div><div><h2>{user.name}</h2><p>{user.role}</p><span>◎ {user.locations}</span></div><Status kind={user.active ? 'ok' : 'attention'}>{user.active ? 'Ativo' : 'Pendente'}</Status><button>•••</button></article>; })}</section>
  </>;
}

function TrialDetail({ trial, activities, schedule, onBack, onActivity, onPlannedActivity }: { trial: Trial; activities: Activity[]; schedule: PlannedActivity[]; onBack: () => void; onActivity: () => void; onPlannedActivity: (item: PlannedActivity) => void }) {
  const quality = trialQuality(trial, activities);
  return <><button className="back-button" onClick={onBack}>← Voltar para ensaios</button><PageHead eyebrow={trial.id} title={trial.name} copy={`${trial.place} · Safra 2026 · ${trial.plots} parcelas`} action={<button className="primary-button" onClick={onActivity}>＋ Registrar atividade</button>} />
    <section className="detail-grid"><article className="card protocol-card"><div className="card-head"><div><h2>Ficha do ensaio</h2><p>Informações gerais importadas do Excel.</p></div><QualityBadge trial={trial} activities={activities} /></div><dl><div><dt>Tipo do ensaio</dt><dd>{trial.type}</dd></div><div><dt>Estádio fenológico</dt><dd>{phenologicalStage(trial)}</dd></div><div><dt>Prioridade</dt><dd>{trial.priority}</dd></div><div><dt>Parcelas</dt><dd>{trial.plots.toLocaleString('pt-BR')}</dd></div><div><dt>Semeadura</dt><dd>{formatDate(trial.sowing)}</dd></div><div><dt>Responsável</dt><dd>{trial.owner}</dd></div></dl></article><article className="card progress-card"><span className="eyebrow">Progresso do ciclo</span><b>{trial.progress}%</b><div className="progress"><i style={{ width: `${trial.progress}%` }} /></div><ul><li className="done">Semeadura</li><li className="done">Emergência</li><li className="active">{phenologicalStage(trial)}</li><li>Próximo manejo</li><li>Colheita · {formatDate(trial.harvest)}</li></ul></article></section>
    {quality.alerts.length > 0 && <section className="card trial-alerts"><div className="card-head"><div><span className="eyebrow">ALERTAS QUE IMPACTAM A QUALIDADE</span><h2>Ocorrências abertas</h2><p>Desconto acumulado de {quality.penalty}% na qualidade deste ensaio.</p></div><strong>−{quality.penalty}%</strong></div>{quality.alerts.map((alert) => <article key={alert.id}><span>!</span><div><b>{alert.alertCategory}</b><p>{alert.details?.ocorrencia || alert.notes}</p><small>{alert.date} · {alert.scope}{alert.plotIds?.length ? ` · PlotID: ${alert.plotIds.join(', ')}` : ''}</small></div><em>−{alert.qualityPenalty}%</em></article>)}</section>}
    <section className="card detail-activity"><div className="card-head"><div><h2>Próximos manejos</h2><p>Clique em um manejo para realizar o registro.</p></div></div>{schedule.filter((item) => item.trialId === trial.id && item.start >= todayIso() && item.status !== 'Concluído').sort((a, b) => a.start.localeCompare(b.start)).slice(0, 3).map((item, index) => { const date = dateParts(item.start); return <button className="management-row" key={item.id} onClick={() => onPlannedActivity(item)}><span>{date.day} {date.month}</span><div><b>{item.activity}</b><p>{item.category} · Responsável: {item.owner}</p></div><Status kind={index === 0 ? 'attention' : 'ok'}>{item.version > 1 ? `Versão ${item.version}` : index === 0 ? 'Próximo' : 'Planejado'}</Status></button>; })}</section>
  </>;
}

