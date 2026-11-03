import type { LocationWeather } from '../lib/weatherAlerts';

export type NetworkLocation = {
  id: string;
  name: string;
  city: string;
  region: string;
  rha?: string;
  program?: 'U' | 'K' | 'X';
  lat: number;
  lng: number;
  trials: number;
  plots: number;
  status: 'ok' | 'attention' | 'late';
  qualityTone?: 'excellent' | 'adequate' | 'attention' | 'critical' | 'neutral';
  qualityScore?: number;
  plantedPercent?: number;
  phenologicalStage?: string;
  alertCount?: number;
  weather?: LocationWeather;
};

export type Screen = 'dashboard' | 'mapa' | 'clima' | 'ensaios' | 'planejamento' | 'rotas' | 'operacional' | 'campo' | 'atividade' | 'historico' | 'usuarios' | 'cadastros' | 'detalhe';

export type ActivityStream = 'operational' | 'field';

export type MacroGroup = 'Ensaios' | 'Coleção' | 'Founder' | 'PD' | 'Multiqualidades' | 'Outro';

export type MacroStage = 'Semeadura' | 'Condução' | 'Colheita';

export type PhenologyVisit = 'Semeadura' | 'Perfilhamento' | 'Alongamento' | 'Emborrachamento' | 'Espigamento' | 'Enchimento de grão' | 'Maturidade';

export type Activity = { id: number; date: string; trial: string; type: string; owner: string; notes: string; stream?: ActivityStream; plannedId?: string; qualityScore?: number; qualityClass?: string; locationId?: string; scope?: string; macroGroup?: MacroGroup; macroStage?: MacroStage; checks?: string[]; photos?: string[]; photoIds?: string[]; details?: Record<string, string>; alertCategory?: string; qualityPenalty?: number; plotIds?: string[] };

export type PlannedActivity = { id: string; trialId: string; locationId?: string; areaCategory?: string; activityTemplateId?: string; activity: string; category: string; start: string; end: string; owner: string; priority: string; status: string; notes: string; originalStart: string; originalEnd: string; version: number };

export type Trial = { id: string; name: string; type: string; subtype?: string; year: number; cycle: string; locationId: string; plots: number; sowing: string; harvest: string; owner: string; rawStatus: string; priority: string; notes: string; place: string; city: string; status: string; progress: number; next: string; nextDate: string; date: string; fieldName?: string; area?: number; mapId?: string; areaCategory?: string; issueCount?: number; affectedPlots?: string[]; lostPlots?: string[]; layoutPenalty?: number };

export type ViewContext = { locationId?: string; operational?: 'ok' | 'late' };

export type PlanningWizardConfig = { locationId: string; trialIds: string[]; profile: 'Essencial' | 'Completo' | 'Monitoramento' };

export type HarvestStatus = 'Ativa' | 'Encerrada';

export type Harvest = { id: string; name: string; status: HarvestStatus; createdAt: string; updatedAt: string; quality: number };

export type HarvestSnapshot = { locations: NetworkLocation[]; trials: Trial[]; schedule: PlannedActivity[]; activities: Activity[]; source: Record<string, unknown>[]; updatedAt: string };

export type DynamicFieldType = 'text' | 'select' | 'number' | 'date';

export type DynamicField = { id: string; label: string; type: DynamicFieldType; options: string[]; entity: ActivityStream | 'both'; visibleField: boolean; visibleOperational: boolean };

export type ActivityTemplate = { id: string; name: string; stream: ActivityStream; stage: PhenologyVisit; offset: number; categories: string[]; enabled: boolean };

export type AppRole = 'Administrador' | 'Gestor' | 'RA' | 'Técnico responsável';

