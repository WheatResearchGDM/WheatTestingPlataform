'use client';
import { useMemo, useState } from 'react';
import { generateListLayout, type ListEntry, type ListLayoutOptions } from '../lib/listLayout';

type Result = ReturnType<typeof generateListLayout>;
export default function ListLayoutBeta({ disabled, onApply }: { disabled: boolean; onApply: (result: Result, options: ListLayoutOptions, fileName: string) => void }) {
  const [entries, setEntries] = useState<ListEntry[]>([]);
  const [fileName, setFileName] = useState('');
  const [options, setOptions] = useState({ rows: 10, width: 1.2, length: 6, strip: 12 });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const preview = useMemo(() => { try { return { result: entries.length ? generateListLayout(entries, options) : null, error: '' }; } catch (e) { return { result: null, error: (e as Error).message }; } }, [entries, options]);
  async function load(file?: File) {
    if (!file) return;
    setLoading(true); setError(''); setEntries([]);
    try {
      const { Workbook } = await import('exceljs');
      const book = new Workbook(); await book.xlsx.load(await file.arrayBuffer());
      const sheet = book.worksheets[0]; if (!sheet) throw new Error('Arquivo sem planilha.');
      const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const headers: Record<string, number> = {};
      sheet.getRow(1).eachCell((cell, col) => { headers[normalize(cell.text)] = col; });
      const plot = headers.plotid, trial = headers.ensaio, genotype = headers.genotipo;
      if (!plot || !trial || !genotype) throw new Error('Use os cabeçalhos PlotID, Ensaio e Genótipo na primeira linha. Genealogia é opcional.');
      const rows: ListEntry[] = [];
      sheet.eachRow((row, index) => {
        if (index === 1) return;
        const value = (col?: number) => col ? row.getCell(col).text.trim() : '';
        if (![value(plot), value(trial), value(genotype), value(headers.genealogia)].some(Boolean)) return;
        rows.push({ plotId: value(plot), trial: value(trial), genotype: value(genotype), genealogy: value(headers.genealogia) });
      });
      setEntries(rows); setFileName(file.name);
      if (!rows.length) throw new Error('A lista não contém parcelas.');
    } catch (e) { setEntries([]); setError((e as Error).message); }
    finally { setLoading(false); }
  }
  return <details className="layout-control list-layout-beta"><summary><b>Gerar croqui por lista · BETA</b></summary>
    <p>Excel com PlotID, Ensaio e Genótipo; Genealogia opcional. Preserva a ordem da lista dentro de cada ensaio, sem sortear tratamentos.</p>
    <label>Lista de parcelas (.xlsx)<input type="file" accept=".xlsx" disabled={disabled || loading} onChange={(e) => { void load(e.target.files?.[0]); e.target.value = ''; }} /></label>
    <div className="layout-input-grid">{([['rows', 'Número de rows por bloco'], ['width', 'Largura da parcela (m)'], ['length', 'Comprimento da parcela (m)'], ['strip', 'Largura da faixa (m)']] as const).map(([key, label]) => <label key={key}>{label}<input type="number" disabled={disabled} min={key === 'rows' ? 1 : 0.01} step={key === 'rows' ? 1 : 0.1} value={options[key]} onChange={(e) => setOptions({ ...options, [key]: Number(e.target.value) })} /></label>)}</div>
    <small>10 colunas fixas. Caminhamento: esquerda → direita na primeira row, direita → esquerda na seguinte. Cada ensaio inicia um bloco; excedentes continuam no próximo bloco à direita. A sobra da faixa vira espaço entre colunas. Rastros do pulverizador não são inseridos nesta beta.</small>
    {loading && <p role="status">Lendo lista…</p>}{(error || preview.error) && <p role="alert">{error || preview.error}</p>}
    {preview.result && <><p>{entries.length} parcelas · {preview.result.allocations.length} ensaios · {preview.result.blocks} blocos · {preview.result.width.toFixed(1)} × {preview.result.height.toFixed(1)} m</p><div style={{ overflow: 'auto', maxHeight: 240 }}><table><caption>Prévia · primeiros 100 PlotIDs</caption><thead><tr><th>Row</th>{Array.from({ length: Math.min(20, preview.result.blocks * 10) }, (_, i) => <th key={i}>{i + 1}</th>)}</tr></thead><tbody>{Array.from({ length: Math.min(options.rows, 10) }, (_, row) => <tr key={row}><th>{row + 1}</th>{Array.from({ length: Math.min(20, preview.result!.blocks * 10) }, (_, col) => { const plot = preview.result!.plots.slice(0, 100).find((p) => p.row === row + 1 && p.col === col + 1); return <td key={col} title={plot ? `${preview.result!.allocations.find((a) => a.id === plot.trialId)?.name} · ${plot.genotype}` : ''} style={{ borderBottom: `3px solid ${preview.result!.allocations.find((a) => a.id === plot?.trialId)?.color ?? 'transparent'}`, padding: 6 }}>{plot?.plotId ?? '—'}</td>; })}</tr>)}</tbody></table></div><button type="button" className="layout-action-button" disabled={disabled} onClick={() => onApply(preview.result!, options, fileName)}>Aplicar lista ao croqui</button><small>A aplicação substitui a prévia atual. Confira o mapa e conclua o cadastro para salvar.</small></>}
  </details>;
}

