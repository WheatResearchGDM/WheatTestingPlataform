export type ListEntry = { plotId: string; trial: string; genotype: string; genealogy?: string };
export type ListLayoutOptions = { rows: number; width: number; length: number; strip: number; trialOrder?: string[]; trialRows?: Record<string, number>; breaks?: Record<string, number[]> };

/** Each trial starts a fresh ten-column block; input order is never randomized. */
export function generateListLayout(entries: ListEntry[], options: ListLayoutOptions) {
  const { rows, width, length, strip } = options;
  if (!Number.isInteger(rows) || rows < 1 || rows > 500) throw new Error('Informe entre 1 e 500 rows por bloco.');
  if (![width, length, strip].every((n) => Number.isFinite(n) && n > 0)) throw new Error('As dimensões devem ser maiores que zero.');
  if (strip + 0.000001 < width * 10) throw new Error(`A faixa precisa ter pelo menos ${(width * 10).toFixed(2)} m para acomodar 10 parcelas.`);
  if (!entries.length || entries.length > 10000) throw new Error('Carregue de 1 a 10.000 parcelas.');
  const seen = new Set<string>();
  const groups = new Map<string, ListEntry[]>();
  entries.forEach((entry, index) => {
    if (!entry.plotId.trim() || !entry.trial.trim() || !entry.genotype.trim()) throw new Error(`Linha ${index + 2}: preencha PlotID, Ensaio e Genótipo.`);
    if (seen.has(entry.plotId)) throw new Error(`PlotID duplicado: ${entry.plotId}.`);
    seen.add(entry.plotId);
    if (!groups.has(entry.trial)) groups.set(entry.trial, []); groups.get(entry.trial)!.push(entry);
  });
  const plots: Array<{ plotId: string; row: number; col: number; genotype: string; genealogy?: string; trialId: string; allocationId: string }> = [];
  const allocations: Array<{ id: string; code: string; name: string; startPlotId: string; endPlotId: string; color: string; plotCount: number }> = [];
  const colors = ['#1f77b4', '#e07b39', '#3f8f5b', '#8d5bb4', '#d5a021', '#c44e52'];
  let blockOffset = 0; let usedRows = 0;
  const order = [...new Set([...(options.trialOrder ?? []), ...groups.keys()])].filter((name) => groups.has(name));
  order.forEach((name) => {
    const items = groups.get(name)!;
    const trialRows = options.trialRows?.[name] ?? rows;
    if (!Number.isInteger(trialRows) || trialRows < 1 || trialRows > 500) throw new Error(`Rows inválidas para ${name}. Use de 1 a 500.`);
    const cuts = [...new Set(options.breaks?.[name] ?? [])].sort((a, b) => a - b);
    if (cuts.some((cut) => !Number.isInteger(cut) || cut < 1 || cut >= items.length)) throw new Error(`Quebras de ${name}: use posições entre 1 e ${items.length - 1}.`);
    let start = 0;
    const chunks = [...cuts, items.length].map((end) => { const chunk = items.slice(start, end); start = end; return chunk; });
    const id = 'lista-' + encodeURIComponent(name);
    chunks.forEach((chunk) => {
    chunk.forEach((entry, index) => {
      const block = Math.floor(index / (trialRows * 10));
      const within = index % (trialRows * 10);
      const row = Math.floor(within / 10);
      const col = row % 2 ? 9 - within % 10 : within % 10;
      usedRows = Math.max(usedRows, row + 1);
      const { trial: _trial, ...parcel } = entry;
      plots.push({ ...parcel, row: row + 1, col: (blockOffset + block) * 10 + col + 1, trialId: id, allocationId: id });
    });
    blockOffset += Math.ceil(chunk.length / (trialRows * 10));
    });
    allocations.push({ id, code: name, name, startPlotId: items[0].plotId, endPlotId: items[items.length - 1].plotId, color: colors[allocations.length % colors.length], plotCount: items.length });

  });
  // Empty strip space is distributed between columns, preserving parcel dimensions.
  const gap = (strip - width * 10) / 9;
  return { plots, allocations, gap, width: blockOffset * strip + Math.max(0, blockOffset - 1) * gap, height: usedRows * length, blocks: blockOffset };
}
