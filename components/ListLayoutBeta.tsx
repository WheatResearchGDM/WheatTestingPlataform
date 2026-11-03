'use client';
import { duplicatePlotIds } from '../lib/plotIdentity';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { generateListLayout, type ListEntry, type ListLayoutOptions } from '../lib/listLayout';

type Result = ReturnType<typeof generateListLayout>;
export default function ListLayoutBeta({ disabled, onApply }: { disabled: boolean; onApply: (result: Result, options: ListLayoutOptions, fileName: string) => boolean | void }) {
  const [previewBlock, setPreviewBlock] = useState(0);
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const [trialOrder, setTrialOrder] = useState<string[]>([]);
  const [trialRows, setTrialRows] = useState<Record<string, number>>({});
  const [breakText, setBreakText] = useState<Record<string, string>>({});
  const [ignoreDuplicates, setIgnoreDuplicates] = useState(false);
  const [entries, setEntries] = useState<ListEntry[]>([]);
  const [fileName, setFileName] = useState('');
  const [options, setOptions] = useState({ rows: 10, width: 1.2, length: 6, strip: 12 });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const preview = useMemo(() => { try { return { result: entries.length ? generateListLayout(entries, { ...options, trialOrder, trialRows, breaks: Object.fromEntries(Object.entries(breakText).map(([name, value]) => [name, value.trim() ? value.split(/[;,]+/).map(Number) : []])) }) : null, error: '' }; } catch (e) { return { result: null, error: (e as Error).message }; } }, [entries, options, trialOrder, trialRows, breakText]);
  useEffect(() => {
    if (!open) return;
    dialog.current?.focus();
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); opener.current?.focus(); }
      if (event.key === 'Tab') {
        const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)') ?? []);
        if (event.shiftKey && (document.activeElement === items[0] || document.activeElement === dialog.current)) { event.preventDefault(); items.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
      }
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [open]);
  const move = (index: number, direction: number) => { const next = [...trialOrder]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; setTrialOrder(next); };
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
      setIgnoreDuplicates(false); setEntries(rows); setTrialOrder([...new Set(rows.map((row) => row.trial))]); setTrialRows({}); setBreakText({}); setFileName(file.name);
      if (!rows.length) throw new Error('A lista não contém parcelas.');
    } catch (e) { setEntries([]); setError((e as Error).message); }
    finally { setLoading(false); }
  }
  const duplicateIds = useMemo(() => duplicatePlotIds(entries), [entries]);
  const previewCells = useMemo(() => new Map((preview.result?.plots ?? []).map((plot) => [plot.row + ':' + plot.col, plot])), [preview.result]);
  const trialCounts = useMemo(() => entries.reduce<Record<string, number>>((counts, entry) => { counts[entry.trial] = (counts[entry.trial] ?? 0) + 1; return counts; }, {}), [entries]);
  return <><button ref={opener} type="button" className="layout-action-button" disabled={disabled} onClick={() => setOpen(true)}>Gerar croqui por lista · BETA ↗</button>{open && createPortal(<div className="list-layout-window"><div ref={dialog} className="list-layout-dialog" role="dialog" aria-modal="true" aria-labelledby="list-layout-title" tabIndex={-1}><header><h2 id="list-layout-title">Configurar mapa por lista · BETA</h2><button type="button" className="secondary-button" onClick={() => { setOpen(false); opener.current?.focus(); }}>Voltar ao croqui</button></header><div className="list-layout-body">
    <p>Excel com PlotID, Ensaio e Genótipo; Genealogia opcional. Preserva a ordem da lista dentro de cada ensaio, sem sortear tratamentos.</p>
    <label>Lista de parcelas (.xlsx)<input type="file" accept=".xlsx" disabled={disabled || loading} onChange={(e) => { void load(e.target.files?.[0]); e.target.value = ''; }} /></label>
    <div className="layout-input-grid">{([['rows', 'Número de rows por bloco'], ['width', 'Largura da parcela (m)'], ['length', 'Comprimento da parcela (m)'], ['strip', 'Largura da faixa (m)']] as const).map(([key, label]) => <label key={key}>{label}<input type="number" disabled={disabled} min={key === 'rows' ? 1 : 0.01} step={key === 'rows' ? 1 : 0.1} value={options[key]} onChange={(e) => setOptions({ ...options, [key]: Number(e.target.value) })} /></label>)}</div>
    <small>10 colunas fixas. Caminhamento: esquerda → direita na primeira row, direita → esquerda na seguinte. Cada ensaio inicia um bloco; excedentes continuam no próximo bloco à direita. A sobra da faixa vira espaço entre colunas. Rastros do pulverizador não são inseridos nesta beta.</small>
    {!!trialOrder.length && <section><h3>Ordem de plantio e quebras</h3><p>Quebras usam a posição da entrada no ensaio. Ex.: 10,30 inicia novos blocos após a 10ª e a 30ª entrada.</p><div className="list-trial-order">{trialOrder.map((name, index) => <article key={name}><div><b>{index + 1}. {name}</b><small>{trialCounts[name]} entradas</small></div><button type="button" aria-label={`Subir ${name}`} disabled={!index} onClick={() => move(index, -1)}>↑</button><button type="button" aria-label={`Descer ${name}`} disabled={index === trialOrder.length - 1} onClick={() => move(index, 1)}>↓</button><label>Rows deste ensaio<input type="number" min="1" max="500" value={trialRows[name] ?? ''} placeholder={String(options.rows)} onChange={(event) => { const next = { ...trialRows }; if (!event.target.value) delete next[name]; else next[name] = Number(event.target.value); setTrialRows(next); }} /></label><label>Quebrar após as entradas<input value={breakText[name] ?? ''} placeholder="Ex.: 10,30" onChange={(event) => setBreakText({ ...breakText, [name]: event.target.value })} /></label></article>)}</div></section>}
    {duplicateIds.length > 0 && !ignoreDuplicates && <section className="duplicate-warning" role="status"><b>PlotIDs repetidos: {duplicateIds.slice(0, 10).join(', ')}</b><p>O aviso não impede a geração. Cada entrada será mantida na sua posição.</p><button type="button" onClick={() => setIgnoreDuplicates(true)}>Ignorar aviso</button></section>}
    {loading && <p role="status">Lendo lista…</p>}{(error || preview.error) && <p role="alert">{error || preview.error}</p>}
    {preview.result && <><p>{entries.length} parcelas · {preview.result.allocations.length} ensaios · {preview.result.blocks} blocos · {preview.result.width.toFixed(1)} × {preview.result.height.toFixed(1)} m</p><label>Bloco da prévia<select value={Math.min(previewBlock, preview.result.blocks - 1)} onChange={(event) => setPreviewBlock(Number(event.target.value))}>{Array.from({ length: preview.result.blocks }, (_, index) => <option key={index} value={index}>Bloco {index + 1}</option>)}</select></label><div style={{ overflow: 'auto', maxHeight: 320 }}><table><caption>Prévia do bloco · até 20 rows</caption><thead><tr><th>Row</th>{Array.from({ length: 10 }, (_, i) => <th key={i}>{i + 1}</th>)}</tr></thead><tbody>{Array.from({ length: Math.min(20, Math.max(...preview.result.plots.map((plot) => plot.row))) }, (_, row) => <tr key={row}><th>{row + 1}</th>{Array.from({ length: 10 }, (_, col) => { const plot = previewCells.get((row + 1) + ':' + (Math.min(previewBlock, preview.result!.blocks - 1) * 10 + col + 1)); return <td key={col} title={plot ? `${preview.result!.allocations.find((a) => a.id === plot.trialId)?.name} · ${plot.genotype}` : ''} style={{ borderBottom: `3px solid ${preview.result!.allocations.find((a) => a.id === plot?.trialId)?.color ?? 'transparent'}`, padding: 6 }}>{plot?.plotId ?? '—'}</td>; })}</tr>)}</tbody></table></div><small>A aplicação substitui a prévia atual. Confira o mapa e conclua o cadastro para salvar.</small></>}
  </div><footer><small>{preview.error || (preview.result ? preview.result.plots.length + ' parcelas prontas para aplicar' : 'Carregue a lista e confira a configuração.')}</small><button type="button" className="layout-action-button" disabled={disabled || loading || !preview.result} onClick={() => { if (onApply(preview.result!, options, fileName) !== false) { setOpen(false); opener.current?.focus(); } }}>Aplicar lista ao croqui</button></footer></div></div>, document.body)}</>;
}

