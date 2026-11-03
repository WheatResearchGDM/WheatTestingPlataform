import type { Activity, PlannedActivity, Trial } from '../domain/types';
import { macroGroupFor } from './trialGroups';

export function activityAppliesToTrial(activity: Activity, trial: Trial) {
  if (activity.trial === trial.id) return true;
  if (activity.locationId !== trial.locationId || activity.scope === 'Ensaio específico') return false;
  if (activity.scope === 'Local inteiro' || activity.scope === 'Área total') return true;
  if (activity.scope === 'Tipo de ensaio' || activity.scope === 'Grupo específico') return activity.macroGroup === macroGroupFor(trial);
  return activity.details?.categoria_area === (trial.areaCategory ?? trial.type);
}
function isOperational(activity: Activity, plan?: PlannedActivity) {
  const stream = activity.stream ?? activity.details?.fluxo;
  return stream ? stream === 'operational' : /seme|plantio|fungic|herbic|pulver|adub|fertiliz|colhe|irrig|aplica/i.test(plan?.activity ?? '');
}
export function actualSowingDate(trial: Trial, activities: Activity[], schedule: PlannedActivity[]) {
  return activities.filter((activity) => {
    const plan = schedule.find((item) => item.id === activity.plannedId);
    return plan?.activityTemplateId !== 'op-fill-sowing' && !/plantio do enchimento/i.test(plan?.activity ?? '') && isOperational(activity, plan) && activity.macroStage === 'Semeadura' && activity.details?.condicao_operacao !== 'Não executado' && activityAppliesToTrial(activity, trial);
  }).map((activity) => /^\d{4}-/.test(activity.date) ? activity.date : activity.date.split('/').reverse().join('-')).sort()[0];
}
export function isTrialHarvested(trial: Trial, activities: Activity[], schedule: PlannedActivity[] = []) {
  return activities.some((activity) => isOperational(activity, schedule.find((plan) => plan.id === activity.plannedId)) && activity.macroStage === 'Colheita' && activity.details?.condicao_operacao !== 'Não executado' && activityAppliesToTrial(activity, trial));
}
