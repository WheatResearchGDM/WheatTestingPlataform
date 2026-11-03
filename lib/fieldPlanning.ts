import { plotIssueFor } from './plotIdentity';
import type { LayoutFinalization } from '../domain/layout';
import type { ActivityTemplate, HarvestSnapshot, MacroGroup, PlannedActivity, Trial } from '../domain/types';
import { addDays } from './dates';

export function buildFieldPlanning(payload: LayoutFinalization, current: HarvestSnapshot, templates: ActivityTemplate[], context: { program: 'U' | 'K' | 'X'; rha: string; harvestName: string }): HarvestSnapshot {
  if (!payload.allocations.length) throw new Error('Defina pelo menos um ensaio antes de salvar.');
  const existingLocation = current.locations.find((location) => location.id === payload.location.id);
  if (existingLocation?.program && existingLocation.program !== context.program) throw new Error('Esse código de local já pertence a outro programa. Use um código diferente.');
  const city = /\s-\s[A-Z]{2}$/.test(payload.location.city) ? payload.location.city : `${payload.location.city} - RS`;
  const previousTrials = current.trials.filter((trial) => trial.locationId === payload.location.id && trial.mapId === payload.mapId);
  const area = payload.areaType.toLowerCase();
  const group: MacroGroup = area.includes('cole') ? 'Coleção' : area.includes('founder') ? 'Founder' : /^pd/.test(area) ? 'PD' : area.includes('multi') ? 'Multiqualidades' : area.includes('outro') ? 'Outro' : 'Ensaios';
  const parcelsByAllocation = new Map<string, typeof payload.plots>();
  for (const plot of payload.plots) {
    const id = plot.allocationId ?? plot.trialId;
    if (!parcelsByAllocation.has(id)) parcelsByAllocation.set(id, []);
    parcelsByAllocation.get(id)!.push(plot);
  }
  const impactKinds = new Set(['Linha entupida', 'Falha de semeadura', 'Passada de pulverizador', 'Fitotoxidez', 'Parcela perdida']);
  const newTrials: Trial[] = payload.allocations.map((allocation) => {
    const id = `${allocation.id}-${payload.location.id}-${payload.mapId}`;
    const previous = previousTrials.find((trial) => trial.name === allocation.name) ?? previousTrials.find((trial) => trial.id === id);
    const parcels = parcelsByAllocation.get(allocation.id) ?? [];
    const affectedPlots = parcels.filter((plot) => impactKinds.has(plotIssueFor(payload.plotIssues, plot)?.kind ?? '')).map((plot) => plot.plotId);
    const lostPlots = parcels.filter((plot) => plotIssueFor(payload.plotIssues, plot)?.kind === 'Parcela perdida').map((plot) => plot.plotId);
    return { ...previous, id: previous?.id ?? id, name: allocation.name, type: group, subtype: payload.areaType, areaCategory: payload.areaType, mapId: payload.mapId, year: Number(payload.plannedSowingDate.slice(0, 4)), cycle: context.harvestName, locationId: payload.location.id, plots: parcels.length, sowing: payload.plannedSowingDate, harvest: addDays(payload.plannedSowingDate, 120), owner: previous?.owner ?? 'Wheat Team', rawStatus: previous?.rawStatus ?? 'Planejado', priority: previous?.priority ?? 'Normal', notes: previous?.notes ?? `Criado pelo ${payload.mapName}`, place: payload.location.name, city, status: previous?.status ?? 'Planejado', progress: previous?.progress ?? 0, next: previous?.next ?? 'Semeadura', nextDate: previous?.nextDate ?? payload.plannedSowingDate, date: payload.plannedSowingDate, fieldName: payload.mapName, issueCount: affectedPlots.length, affectedPlots, lostPlots, layoutPenalty: Math.min(40, Math.max(0, Math.round((affectedPlots.length / Math.max(1, parcels.length) - .1) * 50))) };
  });
  if (new Set(newTrials.map((trial) => trial.id)).size !== newTrials.length) throw new Error('A edição criaria dois ensaios com a mesma identificação. Confira os nomes e intervalos.');
  const retainedIds = new Set(newTrials.map((trial) => trial.id));
  const removedIds = new Set(previousTrials.filter((trial) => !retainedIds.has(trial.id)).map((trial) => trial.id));
  if (current.activities.some((activity) => removedIds.has(activity.trial))) throw new Error('Há registros vinculados a ensaios removidos desta prévia. Preserve esses ensaios ou use a exclusão explícita no Gerenciamento.');
  const selectedTemplates = templates.filter((template) => template.enabled && (template.categories.includes(payload.areaType) || template.categories.includes('*')));
  const newPlans: PlannedActivity[] = selectedTemplates.map((template) => {
    const id = `${payload.location.id}-${payload.mapId}-${template.id}`;
    const previous = current.schedule.find((plan) => plan.id === id);
    const date = addDays(payload.plannedSowingDate, template.offset);
    // A map edit never reopens completed operations or changes their dates.
    if (previous?.status === 'Concluído') return { ...previous, trialId: retainedIds.has(previous.trialId) ? previous.trialId : newTrials[0].id, areaCategory: payload.areaType };
    return { ...previous, id, trialId: previous && retainedIds.has(previous.trialId) ? previous.trialId : newTrials[0].id, locationId: payload.location.id, areaCategory: payload.areaType, activityTemplateId: template.id, activity: template.name, category: template.stage, start: date, end: date, owner: previous?.owner ?? 'Wheat Team', priority: previous?.priority ?? 'Normal', status: previous?.status ?? 'Não iniciado', notes: previous?.notes ?? `Atividade de ${payload.areaType}`, originalStart: previous?.originalStart ?? date, originalEnd: previous?.originalEnd ?? date, version: previous ? previous.version + Number(previous.start !== date) : 1 };
  });
  const newPlanIds = new Set(newPlans.map((plan) => plan.id));
  const schedule = [...current.schedule.filter((plan) => !newPlanIds.has(plan.id) && !removedIds.has(plan.trialId)), ...newPlans];
  const trials = [...current.trials.filter((trial) => !previousTrials.some((previous) => previous.id === trial.id)), ...newTrials];
  const localTrials = trials.filter((trial) => trial.locationId === payload.location.id);
  const location = { ...existingLocation, ...payload.location, city, program: existingLocation?.program ?? context.program, rha: context.rha, region: context.rha, trials: localTrials.length, plots: localTrials.reduce((sum, trial) => sum + trial.plots, 0), status: existingLocation?.status ?? 'ok' as const };
  const rows = newTrials.map((trial, index) => ({ programa: location.program, local_codigo: location.id, local_nome: location.name, municipio: city, latitude: location.lat, longitude: location.lng, tipo_area: payload.areaType, mapa_id: payload.mapId, mapa_nome: payload.mapName, arquivo_croqui: payload.fileName, ensaio_codigo: trial.id, ensaio_nome: trial.name, grupo: group, parcela_inicial: payload.allocations[index].startPlotId, parcela_final: payload.allocations[index].endPlotId, parcelas: trial.plots, data_semeadura_prevista: payload.plannedSowingDate }));
  return { locations: [...current.locations.filter((item) => item.id !== location.id), location], trials, schedule, activities: current.activities, source: [...current.source.filter((row) => !(String(row.local_codigo) === location.id && String(row.mapa_id) === payload.mapId)), ...rows], updatedAt: new Date().toISOString() };
}
