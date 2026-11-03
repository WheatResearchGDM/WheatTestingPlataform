import type { LayoutSnapshot } from '../domain/layout';

export function isUtilityId(value: string) { return /PULV|LNX/i.test(value); }
export function validateLayout(snapshot: LayoutSnapshot) {
  const plots = snapshot.plots ?? [];
  if (!plots.length) throw new Error('Carregue as parcelas antes de salvar o mapa.');
  if (!snapshot.metadata?.city?.trim()) throw new Error('Informe a cidade da área.');
  const date = snapshot.metadata?.plannedSowingDate ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('Informe uma data prevista de semeadura válida.');
  const settings = snapshot.settings;
  if (![settings?.plotLength, settings?.plotWidth].every((value) => typeof value === 'number' && Number.isFinite(value) && value > 0)) throw new Error('As dimensões das parcelas devem ser maiores que zero.');
  if (![settings?.gapLength, settings?.gapWidth].every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0)) throw new Error('Os espaçamentos não podem ser negativos.');
  const center = settings?.center;
  if (!center || !center.every(Number.isFinite) || Math.abs(center[0]) > 90 || Math.abs(center[1]) > 180 || !Number.isFinite(settings?.rotation)) throw new Error('Confira as coordenadas e a rotação do mapa.');
  const allocations = snapshot.allocations ?? [];
  if (!allocations.length) throw new Error('Defina pelo menos um ensaio antes de salvar.');
  const ids = new Set(allocations.map((item) => item.id));
  const names = allocations.map((item) => item.name.trim().toLocaleLowerCase('pt-BR'));
  if (ids.size !== allocations.length || names.some((name) => !name) || new Set(names).size !== names.length) throw new Error('Cada ensaio precisa ter identificação e nome únicos neste mapa.');
  const seen = new Set<string>(), positions = new Set<string>();
  for (const plot of plots) {
    if (![plot.row, plot.col].every((n) => Number.isInteger(n) && n > 0)) throw new Error(`Posição inválida no PlotID ${plot.plotId}.`);
    const cell = `${plot.row}:${plot.col}`;
    if (positions.has(cell)) throw new Error(`Duas parcelas ocupam a mesma célula: ${cell}.`);
    positions.add(cell);
    if (isUtilityId(plot.plotId)) continue;
    if (!plot.plotId.trim() || seen.has(plot.plotId)) throw new Error(`PlotID vazio ou duplicado: ${plot.plotId}.`);
    seen.add(plot.plotId);
    if (!ids.has(plot.allocationId ?? plot.trialId)) throw new Error(`O PlotID ${plot.plotId} ainda não está vinculado a um ensaio.`);
  }
  for (const allocation of allocations) {
    const members = plots.filter((plot) => (plot.allocationId ?? plot.trialId) === allocation.id && !isUtilityId(plot.plotId));
    if (!members.length || members.length !== allocation.plotCount) throw new Error(`Confira a quantidade de parcelas do ensaio ${allocation.name}.`);
  }
}
