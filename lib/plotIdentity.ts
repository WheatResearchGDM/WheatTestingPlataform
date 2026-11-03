import type { LayoutPlot, PlotIssue } from '../domain/layout';

/** PlotID is a field label; row/column identify each separate cell, even when labels repeat. */
export function plotCellKey(plot: Pick<LayoutPlot, 'row' | 'col'>) { return `cell:${plot.row}:${plot.col}`; }
export function duplicatePlotIds(plots: Array<Pick<LayoutPlot, 'plotId'>>) {
  const seen = new Set<string>(), duplicates = new Set<string>();
  for (const plot of plots) { if (/PULV|LNX/i.test(plot.plotId)) continue; if (seen.has(plot.plotId)) duplicates.add(plot.plotId); seen.add(plot.plotId); }
  return [...duplicates];
}
export function plotIssueFor(issues: Record<string, PlotIssue>, plot: Pick<LayoutPlot, 'row' | 'col' | 'plotId'>) {
  const cell = issues[plotCellKey(plot)], legacy = issues[plot.plotId];
  const current = cell && legacy ? cell.updatedAt >= legacy.updatedAt ? cell : legacy : cell ?? legacy;
  return current?.cleared ? undefined : current;
}
