import type { LayoutPlot, TrialAllocation } from '../domain/layout';
import { isUtilityId } from './layoutValidation';

export const categoryAllocationId = '__CATEGORY__';

/** Keep named trials intact and group only the remaining parcels under the map category. */
export function prepareLayout(plots: LayoutPlot[], allocations: TrialAllocation[], category: string) {
  const named = allocations.filter((item) => item.id !== categoryAllocationId);
  const ids = new Set(named.map((item) => item.id));
  const remaining = plots.filter((plot) => !isUtilityId(plot.plotId) && !ids.has(plot.allocationId ?? plot.trialId));
  if (!remaining.length) return { plots, allocations: named };
  const frequency = new Map<string, number>();
  remaining.forEach((plot) => { if (plot.excelColor) frequency.set(plot.excelColor, (frequency.get(plot.excelColor) ?? 0) + 1); });
  const color = [...frequency].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '#8f9992';
  let name = category.trim() || 'Ensaios';
  if (named.some((item) => item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) name += ' · parcelas a identificar';
  const pending: TrialAllocation = { id: categoryAllocationId, code: name, name, startPlotId: remaining[0].plotId, endPlotId: remaining[remaining.length - 1].plotId, color, plotCount: remaining.length };
  return { plots: plots.map((plot) => !isUtilityId(plot.plotId) && !ids.has(plot.allocationId ?? plot.trialId) ? { ...plot, trialId: categoryAllocationId, allocationId: categoryAllocationId } : plot), allocations: [...named, pending] };
}
