'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { divIcon, type LeafletEvent, type Marker as LeafletMarker } from 'leaflet';
import { MapContainer, Marker, Polygon, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';

type LayoutTrial = { id: string; name: string; type: string; subtype?: string; plots: number };
export type LayoutPlot = { plotId: string; row: number; col: number; genotype: string; trialId: string; sourceTrialId?: string; allocationId?: string };
type MapStyle = 'satellite' | 'google' | 'street';
export type TrialAllocation = { id: string; code: string; name: string; startPlotId: string; endPlotId: string; color: string; plotCount: number };
export type IssueKind = 'Observação' | 'Alerta' | 'Troca de genótipo' | 'Linha trancada' | 'Falha de implantação' | 'Outro';
export type PlotIssue = { kind: IssueKind; note: string; replacementGenotype?: string; updatedAt: string };
type LayoutSettings = { plotLength: number; plotWidth: number; gapLength: number; gapWidth: number; rotation: number; flipX: boolean; flipY: boolean; mapStyle: MapStyle; showPlotIds: boolean; center: [number, number]; trialLabels: Record<string, string>; trialVisibility: Record<string, boolean> };
type AreaMetadata = { city: string; areaType: string; plannedSowingDate: string; detectionThreshold: number };
type LayoutSnapshot = { plots: LayoutPlot[] | null; fileName: string; savedAt: string; settings?: Partial<LayoutSettings>; allocations?: TrialAllocation[]; plotIssues?: Record<string, PlotIssue>; metadata?: AreaMetadata };
export type LayoutFinalization = { location: { id: string; name: string; city: string; lat: number; lng: number }; areaType: string; plannedSowingDate: string; fileName: string; allocations: Array<TrialAllocation & { firstPlotCoordinate: [number, number] }>; plots: LayoutPlot[]; plotIssues: Record<string, PlotIssue> };

const defaultAreaTypes = ['Ensaios', 'Coleções', 'PDs', 'Founder', 'Segregantes', 'Ensaios de N', 'Ensaios de fungicida', 'Nursery', 'Multiqualidades', 'Outro'];

const palette = ['#1f77b4','#e07b39','#3f8f5b','#8d5bb4','#d5a021','#c44e52','#2f8f9d','#7a6b3a'];

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[character] ?? character);
}

function isUtilityPlot(plot: LayoutPlot) {
  const label = plot.plotId.trim().toUpperCase();
  return label.includes('PULV') || label.includes('LNX');
}

function ZoomTracker({ onZoom }: { onZoom: (zoom: number) => void }) {
  useMapEvents({ zoomend(event) { onZoom(event.target.getZoom()); } });
  return null;
}

function FitLayoutBounds({ positions, token }: { positions: [number, number][][]; token: number }) {
  const map = useMap();
  const fittedToken = useRef(-1);
  useEffect(() => {
    if (!token || fittedToken.current === token || !positions.length) return;
    fittedToken.current = token;
    map.fitBounds(positions.flat(), { padding: [28, 28], maxZoom: 19 });
  }, [map, positions, token]);
  return null;
}

export default function FieldLayoutMap({ location, trials, harvestId, onClose, onFinalize, readOnly = false }: { location: { id: string; name: string; city: string; lat: number; lng: number }; trials: LayoutTrial[]; harvestId: string; onClose: () => void; onFinalize?: (payload: LayoutFinalization) => void; readOnly?: boolean }) {
  const storageKey = `field-wheat-layout-${harvestId}-${location.id}`;
  const defaults: LayoutSettings = { plotLength: 5, plotWidth: 2, gapLength: .5, gapWidth: 0, rotation: 0, flipX: false, flipY: false, mapStyle: 'satellite', showPlotIds: true, center: [location.lat, location.lng], trialLabels: {}, trialVisibility: {} };
  const [savedSnapshot, setSavedSnapshot] = useState<LayoutSnapshot | null>(() => { try { return JSON.parse(localStorage.getItem(storageKey) ?? 'null') as LayoutSnapshot | null; } catch { return null; } });
  const initial = { ...defaults, ...(savedSnapshot?.settings ?? {}) };
  const [plotLength, setPlotLength] = useState(initial.plotLength);
  const [plotWidth, setPlotWidth] = useState(initial.plotWidth);
  const [gapLength, setGapLength] = useState(initial.gapLength);
  const [gapWidth, setGapWidth] = useState(initial.gapWidth);
  const [rotation, setRotation] = useState(initial.rotation);
  const [flipX, setFlipX] = useState(initial.flipX);
  const [flipY, setFlipY] = useState(initial.flipY);
  const [mapStyle, setMapStyle] = useState<MapStyle>(initial.mapStyle);
  const [showPlotIds, setShowPlotIds] = useState(initial.showPlotIds);
  const [center, setCenter] = useState<[number, number]>(initial.center);
  const [centerInput, setCenterInput] = useState(`${initial.center[0].toFixed(6)}, ${initial.center[1].toFixed(6)}`);
  const [trialLabels, setTrialLabels] = useState<Record<string, string>>(initial.trialLabels);
  const [trialVisibility, setTrialVisibility] = useState<Record<string, boolean>>(initial.trialVisibility);
  const [importedPlots, setImportedPlots] = useState<LayoutPlot[] | null>(() => savedSnapshot?.plots ?? null);
  const [fileName, setFileName] = useState(() => savedSnapshot?.fileName ?? '');
  const [savedAt, setSavedAt] = useState(() => savedSnapshot?.savedAt ?? '');
  const [isEditing, setIsEditing] = useState(() => !readOnly && !savedSnapshot);
  const [dirty, setDirty] = useState(false);
  const [mapZoom, setMapZoom] = useState(19);
  const [fitBoundsToken, setFitBoundsToken] = useState(0);
  const [importStatus, setImportStatus] = useState('');
  const [importError, setImportError] = useState('');
  const [allocations, setAllocations] = useState<TrialAllocation[]>(() => savedSnapshot?.allocations ?? []);
  const [plotIssues, setPlotIssues] = useState<Record<string, PlotIssue>>(() => savedSnapshot?.plotIssues ?? {});
  const [selectedPlotId, setSelectedPlotId] = useState('');
  const [allocationCode, setAllocationCode] = useState('');
  const [allocationName, setAllocationName] = useState('');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [issueKind, setIssueKind] = useState<IssueKind>('Observação');
  const [issueNote, setIssueNote] = useState('');
  const [replacementGenotype, setReplacementGenotype] = useState('');
  const savedMetadata = savedSnapshot?.metadata;
  const [city, setCity] = useState(savedMetadata?.city ?? location.city.replace(/\s*-\s*[A-Z]{2}$/, ''));
  const [areaTypes, setAreaTypes] = useState<string[]>(() => { try { const saved = JSON.parse(localStorage.getItem('field-wheat-area-types-v1') ?? '[]') as string[]; return [...new Set([...defaultAreaTypes, ...saved])]; } catch { return defaultAreaTypes; } });
  const [areaType, setAreaType] = useState(savedMetadata?.areaType ?? 'Ensaios');
  const [customAreaType, setCustomAreaType] = useState('');
  const [plannedSowingDate, setPlannedSowingDate] = useState(savedMetadata?.plannedSowingDate ?? '');
  const [detectionThreshold, setDetectionThreshold] = useState(savedMetadata?.detectionThreshold ?? 1);

  const generatedPlots = useMemo(() => {
    const next: LayoutPlot[] = [];
    const columns = 16;
    trials.forEach((trial) => {
      for (let index = 0; index < trial.plots; index += 1) {
        const position = next.length;
        next.push({ plotId: `${trial.id}-${String(index + 1).padStart(3, '0')}`, row: Math.floor(position / columns) + 1, col: position % columns + 1, genotype: `Tratamento ${index + 1}`, trialId: trial.id, sourceTrialId: trial.id });
      }
    });
    return next;
  }, [trials]);

  const plots = importedPlots ?? generatedPlots;
  const trialIds = [...new Set(plots.map((plot) => plot.trialId))];
  const colors = Object.fromEntries(trialIds.map((id, index) => [id, id === 'PULV' ? '#212121' : id === 'UNASSIGNED' ? '#8f9992' : allocations.find((allocation) => allocation.id === id)?.color ?? palette[index % palette.length]]));
  const maxRow = Math.max(1, ...plots.map((plot) => plot.row));
  const maxCol = Math.max(1, ...plots.map((plot) => plot.col));
  const trialName = (id: string) => trialLabels[id]?.trim() || trials.find((trial) => trial.id === id)?.name || (id === 'PULV' ? 'Pista Pulverização' : id === 'UNASSIGNED' ? 'Parcelas sem ensaio' : `Ensaio ${id}`);

  const polygons = useMemo(() => {
    const rad = rotation * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const totalX = maxCol * plotLength + Math.max(0, maxCol - 1) * gapLength;
    const totalY = maxRow * plotWidth + Math.max(0, maxRow - 1) * gapWidth;
    const metersLat = 1 / 111111;
    const metersLng = 1 / (111111 * Math.cos(center[0] * Math.PI / 180));
    return plots.map((plot) => {
      const col = flipX ? maxCol - plot.col : plot.col - 1;
      const row = flipY ? plot.row - 1 : maxRow - plot.row;
      const x0 = col * (plotLength + gapLength) - totalX / 2;
      const y0 = row * (plotWidth + gapWidth) - totalY / 2;
      const positions = [[x0,y0],[x0 + plotLength,y0],[x0 + plotLength,y0 + plotWidth],[x0,y0 + plotWidth]].map(([x,y]) => [center[0] + (x * sin + y * cos) * metersLat, center[1] + (x * cos - y * sin) * metersLng] as [number, number]);
      const plotCenter: [number, number] = [(positions[0][0] + positions[2][0]) / 2, (positions[0][1] + positions[2][1]) / 2];
      return { plot, positions, plotCenter };
    });
  }, [plots, maxCol, maxRow, plotLength, plotWidth, gapLength, gapWidth, rotation, flipX, flipY, center]);

  const firstPlotByTrial = useMemo(() => {
    const first: Record<string, LayoutPlot> = {};
    plots.filter((plot) => !isUtilityPlot(plot) && plot.trialId !== 'UNASSIGNED').forEach((plot) => { const current = first[plot.trialId]; if (!current || plot.row < current.row || (plot.row === current.row && plot.col < current.col)) first[plot.trialId] = plot; });
    return first;
  }, [plots]);

  const brokenSequencePlotIds = useMemo(() => {
    const broken = new Set<string>();
    const grouped = new Map<string, LayoutPlot[]>();
    plots.filter((plot) => !isUtilityPlot(plot)).forEach((plot) => { const key = plot.allocationId ?? plot.trialId; grouped.set(key, [...(grouped.get(key) ?? []), plot]); });
    grouped.forEach((group) => {
      const ordered = [...group].sort((a, b) => a.row - b.row || a.col - b.col);
      for (let index = 1; index < ordered.length; index += 1) {
        const previous = Number(ordered[index - 1].plotId.match(/\d+(?!.*\d)/)?.[0]);
        const current = Number(ordered[index].plotId.match(/\d+(?!.*\d)/)?.[0]);
        if (Number.isFinite(previous) && Number.isFinite(current) && Math.abs(current - previous) > detectionThreshold) {
          broken.add(ordered[index - 1].plotId); broken.add(ordered[index].plotId);
        }
      }
    });
    return broken;
  }, [plots, detectionThreshold]);

  function detectTrialRangesByPrefix(sourcePlots: LayoutPlot[]) {
    const grouped = new Map<string, LayoutPlot[]>();
    sourcePlots.forEach((plot) => {
      const code = plot.plotId.toUpperCase().includes('PULV') ? 'PULV' : plot.plotId.slice(0, 2);
      if (!/^\d{2}$/.test(code)) return;
      const group = grouped.get(code) ?? [];
      group.push(plot);
      grouped.set(code, group);
    });
    const codes = [...grouped.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    const detected = codes.map((code, index) => {
      const group = grouped.get(code) ?? [];
      const existing = allocations.find((allocation) => allocation.code === code || allocation.id === code);
      return {
        id: code,
        code,
        name: existing?.name ?? trialLabels[code] ?? `Ensaio ${code}`,
        startPlotId: group[0]?.plotId ?? '',
        endPlotId: group[group.length - 1]?.plotId ?? '',
        color: existing?.color ?? `hsl(${Math.round(index * (360 / Math.max(codes.length, 1)))}, 75%, 45%)`,
        plotCount: group.length,
      };
    });
    const nextPlots = sourcePlots.map((plot) => {
      const code = plot.plotId.toUpperCase().includes('PULV') ? 'PULV' : plot.plotId.slice(0, 2);
      return /^\d{2}$/.test(code)
        ? { ...plot, trialId: code, allocationId: code, sourceTrialId: plot.sourceTrialId ?? code }
        : { ...plot, trialId: code, sourceTrialId: plot.sourceTrialId ?? code };
    });
    return { nextPlots, detected };
  }

  function detectTrialRangesByJump(sourcePlots: LayoutPlot[]) {
    const ordered = [...sourcePlots].sort((a, b) => a.row - b.row || a.col - b.col);
    const groups: LayoutPlot[][] = [];
    let current: LayoutPlot[] = [];
    let previousNumber: number | null = null;
    ordered.forEach((plot) => {
      if (plot.plotId.toUpperCase().includes('PULV')) { if (current.length) groups.push(current); current = []; previousNumber = null; return; }
      const numericText = plot.plotId.match(/\d+/)?.[0] ?? '';
      const numeric = numericText ? Number(numericText) : NaN;
      const abruptChange = previousNumber !== null && Number.isFinite(numeric) && Math.abs(numeric - previousNumber) > detectionThreshold;
      if (abruptChange && current.length) { groups.push(current); current = []; }
      current.push(plot);
      previousNumber = Number.isFinite(numeric) ? numeric : previousNumber;
    });
    if (current.length) groups.push(current);
    const usedCodes = new Map<string, number>();
    const detected = groups.map((group, index) => {
      const firstDigits = group[0].plotId.match(/\d+/)?.[0] ?? '';
      const baseCode = firstDigits.slice(0, 2) || group[0].sourceTrialId || `ENS${index + 1}`;
      const occurrence = (usedCodes.get(baseCode) ?? 0) + 1; usedCodes.set(baseCode, occurrence);
      const id = occurrence === 1 ? baseCode : `${baseCode}-${occurrence}`;
      return { id, code: id, name: `Ensaio ${baseCode}`, startPlotId: group[0].plotId, endPlotId: group[group.length - 1].plotId, color: palette[index % palette.length], plotCount: group.length, plotIds: new Set(group.map((plot) => plot.plotId)) };
    });
    const nextPlots = sourcePlots.map((plot) => { const match = detected.find((allocation) => allocation.plotIds.has(plot.plotId)); return match ? { ...plot, trialId: match.id, allocationId: match.id, sourceTrialId: plot.sourceTrialId ?? plot.trialId } : plot; });
    return { nextPlots, detected: detected.map(({ plotIds: _plotIds, ...allocation }) => allocation) };
  }

  function runAutomaticDetection(sourcePlots = plots) {
    const { nextPlots, detected } = detectTrialRangesByPrefix(sourcePlots);
    setImportedPlots(nextPlots); setAllocations(detected); setTrialLabels({ ...trialLabels, ...Object.fromEntries(detected.map((allocation) => [allocation.id, allocation.name])) }); setDirty(true);
  }

  function runThresholdDetection() {
    const { nextPlots, detected } = detectTrialRangesByJump(plots);
    setImportedPlots(nextPlots); setAllocations(detected); setTrialLabels({ ...trialLabels, ...Object.fromEntries(detected.map((allocation) => [allocation.id, allocation.name])) }); setDirty(true);
    setImportStatus(`${detected.length} ensaios separados pelo limite de mudança ${detectionThreshold}.`);
  }

  async function importLayout(file?: File) {
    if (!file || !isEditing) return;
    setImportError(''); setImportStatus('Lendo o croqui…');
    try {
      const { Workbook } = await import('exceljs');
      const workbook = new Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const worksheet = workbook.worksheets[0];
      if (!worksheet) throw new Error('A planilha não possui uma aba válida.');
      const next: LayoutPlot[] = [];
      const totalRowsExcel = worksheet.actualRowCount || worksheet.rowCount || 1;
      const totalColumnsExcel = worksheet.actualColumnCount || worksheet.columnCount || 1;

      // Mesma regra do app_mapa_V5.1.html: percorre o Excel de baixo para cima,
      // preserva linhas/colunas vazias e usa os dois primeiros dígitos como código.
      for (let excelRow = totalRowsExcel; excelRow >= 1; excelRow -= 1) {
        const row = worksheet.getRow(excelRow);
        for (let excelCol = 1; excelCol <= totalColumnsExcel; excelCol += 1) {
          const rawValue = row.getCell(excelCol).value;
          if (rawValue === null || rawValue === undefined) continue;
          const structuredValue = typeof rawValue === 'object' ? rawValue as unknown as Record<string, unknown> : null;
          const resolvedValue = structuredValue
            ? structuredValue.result ?? structuredValue.text ?? (Array.isArray(structuredValue.richText) ? structuredValue.richText.map((item) => String((item as Record<string, unknown>).text ?? '')).join('') : '')
            : rawValue;
          const value = String(resolvedValue ?? '').trim();
          if (!value) continue;
          const prefix = value.toUpperCase().includes('PULV') ? 'PULV' : value.slice(0, 2);
          next.push({ plotId: value, row: totalRowsExcel - excelRow + 1, col: excelCol, genotype: `Trat-${value}`, trialId: prefix, sourceTrialId: prefix });
        }
      }
      if (!next.length) throw new Error('Nenhuma parcela foi encontrada na primeira aba do arquivo.');
      const detected = detectTrialRangesByPrefix(next);
      const nextLabels = { ...trialLabels, PULV: 'Pista Pulverização', ...Object.fromEntries(detected.detected.map((allocation) => [allocation.id, allocation.name])) };
      setImportedPlots(detected.nextPlots); setAllocations(detected.detected); setTrialLabels(nextLabels); setTrialVisibility({ ...trialVisibility, ...Object.fromEntries([...new Set(detected.nextPlots.map((plot) => plot.trialId))].map((code) => [code, true])) }); setFileName(file.name); setDirty(true); setFitBoundsToken(Date.now());
      setImportStatus(`${next.length.toLocaleString('pt-BR')} parcelas carregadas · ${detected.detected.length} códigos de ensaio identificados.`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Não foi possível ler o arquivo Excel.');
      setImportStatus('');
    }
  }

  function currentSettings(): LayoutSettings { return { plotLength, plotWidth, gapLength, gapWidth, rotation, flipX, flipY, mapStyle, showPlotIds, center, trialLabels, trialVisibility }; }
  function saveLayout() {
    const saved = new Date().toISOString();
    const resolvedAreaType = customAreaType.trim() || areaType;
    const metadata: AreaMetadata = { city: city.trim(), areaType: resolvedAreaType, plannedSowingDate, detectionThreshold };
    const snapshot: LayoutSnapshot = { plots: importedPlots, fileName, savedAt: saved, settings: currentSettings(), allocations, plotIssues, metadata };
    localStorage.setItem(storageKey, JSON.stringify(snapshot));
    if (customAreaType.trim() && !areaTypes.includes(customAreaType.trim())) { const nextTypes = [...areaTypes, customAreaType.trim()]; setAreaTypes(nextTypes); setAreaType(customAreaType.trim()); setCustomAreaType(''); localStorage.setItem('field-wheat-area-types-v1', JSON.stringify(nextTypes)); }
    const draftKey = 'field-wheat-layout-trial-drafts-v1';
    const currentDrafts = JSON.parse(localStorage.getItem(draftKey) ?? '[]') as Array<Record<string, unknown>>;
    const retainedDrafts = currentDrafts.filter((draft) => draft.harvestId !== harvestId || draft.locationId !== location.id);
    localStorage.setItem(draftKey, JSON.stringify([...retainedDrafts, ...allocations.map((allocation) => ({ ...allocation, harvestId, locationId: location.id, locationName: location.name, updatedAt: saved }))]));
    if (plannedSowingDate && city.trim() && allocations.length && onFinalize) {
      const finalizedAllocations = allocations.map((allocation) => { const firstPolygon = polygons.find(({ plot }) => plot.plotId === allocation.startPlotId); return { ...allocation, firstPlotCoordinate: firstPolygon?.plotCenter ?? center }; });
      onFinalize({ location: { ...location, city: city.trim(), lat: center[0], lng: center[1] }, areaType: resolvedAreaType, plannedSowingDate, fileName, allocations: finalizedAllocations, plots, plotIssues });
    }
    setSavedSnapshot(snapshot); setSavedAt(saved); setDirty(false); setIsEditing(false);
  }
  function restore(snapshot: LayoutSnapshot | null) {
    const settings = { ...defaults, ...(snapshot?.settings ?? {}) };
    setImportedPlots(snapshot?.plots ?? null); setFileName(snapshot?.fileName ?? ''); setSavedAt(snapshot?.savedAt ?? '');
    setPlotLength(settings.plotLength); setPlotWidth(settings.plotWidth); setGapLength(settings.gapLength); setGapWidth(settings.gapWidth); setRotation(settings.rotation); setFlipX(settings.flipX); setFlipY(settings.flipY); setMapStyle(settings.mapStyle); setShowPlotIds(settings.showPlotIds);
    setCenter(settings.center); setCenterInput(`${settings.center[0].toFixed(6)}, ${settings.center[1].toFixed(6)}`); setTrialLabels(settings.trialLabels); setTrialVisibility(settings.trialVisibility); setAllocations(snapshot?.allocations ?? []); setPlotIssues(snapshot?.plotIssues ?? {}); setCity(snapshot?.metadata?.city ?? location.city.replace(/\s*-\s*[A-Z]{2}$/, '')); setAreaType(snapshot?.metadata?.areaType ?? 'Ensaios'); setPlannedSowingDate(snapshot?.metadata?.plannedSowingDate ?? ''); setDetectionThreshold(snapshot?.metadata?.detectionThreshold ?? 250); setSelectedPlotId(''); setDirty(false); setIsEditing(false);
  }
  function unlinkLayout() { localStorage.removeItem(storageKey); setSavedSnapshot(null); restore(null); setIsEditing(true); }
  function applyCenter() {
    const parsed = centerInput.split(',').map((part) => Number(part.trim()));
    if (parsed.length !== 2 || parsed.some((value) => !Number.isFinite(value))) return;
    setCenter([parsed[0], parsed[1]]); setDirty(true);
  }
  function selectPlot(plotId: string) {
    setSelectedPlotId(plotId);
    const issue = plotIssues[plotId];
    setIssueKind(issue?.kind ?? 'Observação'); setIssueNote(issue?.note ?? ''); setReplacementGenotype(issue?.replacementGenotype ?? '');
  }
  function applyAllocation() {
    const code = allocationCode.trim(); const name = allocationName.trim();
    const ordered = [...plots].sort((a, b) => a.row - b.row || a.col - b.col);
    const startIndex = ordered.findIndex((plot) => plot.plotId === rangeStart.trim());
    const endIndex = ordered.findIndex((plot) => plot.plotId === rangeEnd.trim());
    if (!code || !name || startIndex < 0 || endIndex < 0) return;
    const from = Math.min(startIndex, endIndex), to = Math.max(startIndex, endIndex);
    const selectedIds = new Set(ordered.slice(from, to + 1).map((plot) => plot.plotId));
    const id = code.toUpperCase().replace(/[^A-Z0-9_-]+/g, '-');
    const existing = allocations.find((allocation) => allocation.id === id);
    const allocation: TrialAllocation = { id, code, name, startPlotId: ordered[from].plotId, endPlotId: ordered[to].plotId, color: existing?.color ?? palette[allocations.length % palette.length], plotCount: selectedIds.size };
    setImportedPlots(plots.map((plot) => selectedIds.has(plot.plotId) ? { ...plot, trialId: id, allocationId: id, sourceTrialId: plot.sourceTrialId ?? plot.trialId } : plot));
    setAllocations([...allocations.filter((item) => item.id !== id), allocation]);
    setTrialLabels({ ...trialLabels, [id]: name }); setTrialVisibility({ ...trialVisibility, [id]: true }); setDirty(true); setSelectedPlotId(ordered[from].plotId);
  }
  function removeAllocation(id: string) {
    setImportedPlots(plots.map((plot) => plot.allocationId === id ? { ...plot, trialId: 'UNASSIGNED', allocationId: undefined } : plot));
    setAllocations(allocations.filter((allocation) => allocation.id !== id)); setDirty(true);
  }
  function renameAllocation(id: string, name: string) {
    setAllocations(allocations.map((allocation) => allocation.id === id ? { ...allocation, name } : allocation));
    setTrialLabels({ ...trialLabels, [id]: name }); setDirty(true);
  }
  function saveIssue() {
    if (!selectedPlotId || !issueNote.trim()) return;
    setPlotIssues({ ...plotIssues, [selectedPlotId]: { kind: issueKind, note: issueNote.trim(), replacementGenotype: issueKind === 'Troca de genótipo' ? replacementGenotype.trim() : '', updatedAt: new Date().toISOString() } }); setDirty(true);
  }
  function clearIssue() {
    if (!selectedPlotId) return;
    const next = { ...plotIssues }; delete next[selectedPlotId]; setPlotIssues(next); setIssueKind('Observação'); setIssueNote(''); setReplacementGenotype(''); setDirty(true);
  }
  function issueColor(issue?: PlotIssue) {
    if (!issue) return '';
    if (issue.kind === 'Alerta' || issue.kind === 'Linha trancada' || issue.kind === 'Falha de implantação') return '#d33b32';
    if (issue.kind === 'Troca de genótipo') return '#e48621';
    return '#2e73b8';
  }
  function exportGeoJson() {
    const features = polygons.filter(({ plot }) => trialVisibility[plot.trialId] !== false).map(({ plot, positions }) => ({ type: 'Feature', properties: { parcela: plot.plotId, ensaio: plot.trialId, nome_ensaio: trialName(plot.trialId), genotipo: plot.genotype, linha: plot.row, coluna: plot.col, ocorrencia_tipo: plotIssues[plot.plotId]?.kind ?? '', ocorrencia: plotIssues[plot.plotId]?.note ?? '', genotipo_substituto: plotIssues[plot.plotId]?.replacementGenotype ?? '' }, geometry: { type: 'Polygon', coordinates: [[...positions.map(([lat,lng]) => [lng,lat]), [positions[0][1],positions[0][0]]]] } }));
    const url = URL.createObjectURL(new Blob([JSON.stringify({ type:'FeatureCollection', features }, null, 2)], { type:'application/geo+json' }));
    const link = document.createElement('a'); link.href = url; link.download = `croqui-${location.id}.geojson`; link.click(); URL.revokeObjectURL(url);
  }

  const setAndDirty = (action: () => void) => { action(); setDirty(true); };
  const visibleCount = plots.filter((plot) => trialVisibility[plot.trialId] !== false).length;
  const selectedPlot = plots.find((plot) => plot.plotId === selectedPlotId);

  return <div className="layout-modal" role="dialog" aria-modal="true" aria-label={`Croqui de ${location.name}`}>
    <button className="layout-backdrop" onClick={onClose} aria-label="Fechar croqui" />
    <section className="layout-dialog">
      <header><div><span>CROQUI DA ÁREA · {location.id}</span><h2>{location.name}</h2><p>{location.city} · {visibleCount.toLocaleString('pt-BR')} parcelas visíveis</p></div><div className="layout-header-actions">{readOnly ? <span className="layout-view-state">Somente consulta</span> : isEditing ? <><button className="layout-cancel" onClick={() => restore(savedSnapshot)}>Cancelar</button><button className="layout-save" onClick={saveLayout}>✓ Salvar croqui{dirty ? ' *' : ''}</button></> : <><span className="layout-view-state">Salvo</span><button className="layout-edit" onClick={() => setIsEditing(true)}>✎ Editar croqui</button></>}<button className="layout-close" onClick={onClose} aria-label="Fechar">×</button></div></header>
      <div className="layout-workspace">
        <aside>
          <label className={`layout-upload ${!isEditing ? 'disabled' : ''}`}><input type="file" accept=".xlsx" disabled={!isEditing} onChange={(event) => importLayout(event.target.files?.[0])} /><b>▦ Carregar mapa de plantio</b><small>{fileName ? `${fileName} · ${dirty ? 'alteração ainda não salva' : `vinculado a ${location.name}`}` : 'Excel em formato de grade, com uma parcela por célula'}</small>{importStatus && <em>{importStatus}</em>}{importError && <em className="error">Erro: {importError}</em>}</label>
          <div className="layout-control layout-area-data"><h3>Dados da área</h3><label>Cidade<input disabled={!isEditing} value={city} onChange={(event) => setAndDirty(() => setCity(event.target.value))} placeholder="Município da área" /></label><label>Data prevista de semeadura<input disabled={!isEditing} type="date" value={plannedSowingDate} onChange={(event) => setAndDirty(() => setPlannedSowingDate(event.target.value))} /></label><label>Categoria da área<select disabled={!isEditing} value={areaType} onChange={(event) => setAndDirty(() => setAreaType(event.target.value))}>{areaTypes.map((type) => <option key={type}>{type}</option>)}</select></label>{areaType === 'Outro' && <label>Nova categoria<input disabled={!isEditing} value={customAreaType} onChange={(event) => setAndDirty(() => setCustomAreaType(event.target.value))} placeholder="Digite para salvar como nova opção" /></label>}<small className="layout-help">A data prevista gera o calendário fenológico quando o croqui for salvo.</small><div className={`layout-readiness ${city.trim() && plannedSowingDate && allocations.length ? 'ready' : ''}`}>{city.trim() && plannedSowingDate && allocations.length ? 'Pronto para gerar a base de gestão e o calendário.' : 'Complete cidade, semeadura e ao menos um ensaio para gerar o planejamento.'}</div></div>
          {savedAt && <div className="layout-linked"><span>✓ CROQUI VINCULADO</span><b>{location.name}</b><small>{harvestId} · salvo em {new Date(savedAt).toLocaleString('pt-BR')}</small>{isEditing && <button onClick={unlinkLayout}>Usar parcelas do cadastro</button>}</div>}
          <datalist id={`plot-options-${location.id}`}>{plots.map((plot) => <option key={plot.plotId} value={plot.plotId} />)}</datalist>
          <div className="layout-control layout-allocation"><h3>Cadastro dos ensaios do croqui</h3><small className="layout-help">O padrão do app_mapa_V5.1 agrupa cada parcela pelos dois primeiros dígitos do PlotID. Quebras de sequência aparecem diretamente nos números das parcelas, sem colorir regiões inteiras.</small><div className="layout-prefix-actions"><button disabled={!isEditing || !plots.length} onClick={() => runAutomaticDetection()}>Reidentificar pelos 2 dígitos</button></div>{isEditing && <div className={brokenSequencePlotIds.size ? 'sequence-diagnostic warning' : 'sequence-diagnostic'}><b>{brokenSequencePlotIds.size}</b><span>{brokenSequencePlotIds.size ? 'PlotIDs nas bordas de sequências interrompidas estão destacados em vermelho no mapa.' : 'Nenhuma quebra de sequência detectada.'}</span><label>Salto mínimo<input type="number" min="1" value={detectionThreshold} onChange={(event) => setDetectionThreshold(Number(event.target.value) || 1)} /></label></div>}{allocations.length > 0 && <div className="layout-allocation-list registration">{allocations.map((allocation) => <div key={allocation.id}><i style={{ background: allocation.color }} /><span><b>Código {allocation.code}</b><input disabled={!isEditing} value={allocation.name} onChange={(event) => renameAllocation(allocation.id, event.target.value)} aria-label={`Nome do ensaio ${allocation.code}`} /><small>Primeira: {allocation.startPlotId} · última: {allocation.endPlotId} · {allocation.plotCount} parcelas</small></span>{isEditing && <button className="allocation-delete" onClick={() => { if (window.confirm(`Remover o ensaio ${allocation.name} deste croqui?`)) removeAllocation(allocation.id); }}>Excluir</button>}</div>)}</div>}<details className="layout-advanced-detection"><summary>Correção manual do intervalo</summary><div className="layout-input-grid"><label>Código do ensaio<input disabled={!isEditing} value={allocationCode} onChange={(event) => setAllocationCode(event.target.value)} placeholder="Ex.: VCU-01" /></label><label>Nome do ensaio<input disabled={!isEditing} value={allocationName} onChange={(event) => setAllocationName(event.target.value)} placeholder="Ex.: VCU I Precoce" /></label></div><div className="layout-range-grid"><label>Parcela inicial<input list={`plot-options-${location.id}`} disabled={!isEditing} value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} /></label><button disabled={!isEditing || !selectedPlotId} onClick={() => setRangeStart(selectedPlotId)}>Usar selecionada</button><label>Parcela final<input list={`plot-options-${location.id}`} disabled={!isEditing} value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} /></label><button disabled={!isEditing || !selectedPlotId} onClick={() => setRangeEnd(selectedPlotId)}>Usar selecionada</button></div><button className="layout-action-button" disabled={!isEditing || !allocationCode.trim() || !allocationName.trim() || !rangeStart || !rangeEnd} onClick={applyAllocation}>Criar ou corrigir ensaio</button></details></div>
          <div className={`layout-control layout-occurrence ${selectedPlot ? 'selected' : ''}`}><h3>Ocorrência na implantação</h3>{selectedPlot ? <><div className="layout-selected-plot"><span>PARCELA SELECIONADA</span><b>{selectedPlot.plotId}</b><small>{trialName(selectedPlot.trialId)} · linha {selectedPlot.row}, coluna {selectedPlot.col}</small></div><label>Tipo<select disabled={!isEditing} value={issueKind} onChange={(event) => setIssueKind(event.target.value as IssueKind)}><option>Observação</option><option>Alerta</option><option>Troca de genótipo</option><option>Linha trancada</option><option>Falha de implantação</option><option>Outro</option></select></label>{issueKind === 'Troca de genótipo' && <label>Novo genótipo<input disabled={!isEditing} value={replacementGenotype} onChange={(event) => setReplacementGenotype(event.target.value)} placeholder="Identificação do substituto" /></label>}<label>Descrição<textarea disabled={!isEditing} value={issueNote} onChange={(event) => setIssueNote(event.target.value)} placeholder="Descreva o que ocorreu nesta parcela" /></label>{isEditing && <div className="layout-issue-actions"><button onClick={clearIssue} disabled={!plotIssues[selectedPlotId]}>Remover</button><button className="layout-action-button" onClick={saveIssue} disabled={!issueNote.trim()}>Salvar ocorrência</button></div>}</> : <small className="layout-help">Clique em uma parcela do mapa para selecioná-la e registrar uma observação ou alerta.</small>}{Object.keys(plotIssues).length > 0 && <div className="layout-issue-count"><b>{Object.keys(plotIssues).length}</b> parcelas com ocorrências registradas</div>}</div>
          <div className="layout-control"><h3>Camada e identificação</h3><div className="segmented layout-map-options"><button disabled={!isEditing} className={mapStyle === 'satellite' ? 'active' : ''} onClick={() => setAndDirty(() => setMapStyle('satellite'))}>Esri</button><button disabled={!isEditing} className={mapStyle === 'google' ? 'active' : ''} onClick={() => setAndDirty(() => setMapStyle('google'))}>Google Earth</button><button disabled={!isEditing} className={mapStyle === 'street' ? 'active' : ''} onClick={() => setAndDirty(() => setMapStyle('street'))}>Mapa</button></div><label className="layout-check"><input type="checkbox" disabled={!isEditing} checked={showPlotIds} onChange={(event) => setAndDirty(() => setShowPlotIds(event.target.checked))} />Exibir PlotID nas parcelas</label><small className="layout-help">O nome do ensaio permanece sempre identificado em sua primeira parcela.</small></div>
          <div className="layout-control"><h3>Dimensões da parcela</h3><div className="layout-input-grid"><label>Comprimento<input disabled={!isEditing} type="number" min=".5" step=".5" value={plotLength} onChange={(event) => setAndDirty(() => setPlotLength(Number(event.target.value)))} /></label><label>Largura<input disabled={!isEditing} type="number" min=".2" step=".1" value={plotWidth} onChange={(event) => setAndDirty(() => setPlotWidth(Number(event.target.value)))} /></label><label>Espaçamento<input disabled={!isEditing} type="number" min="0" step=".1" value={gapLength} onChange={(event) => setAndDirty(() => setGapLength(Number(event.target.value)))} /></label><label>Entrelinhas<input disabled={!isEditing} type="number" min="0" step=".1" value={gapWidth} onChange={(event) => setAndDirty(() => setGapWidth(Number(event.target.value)))} /></label></div></div>
          <div className="layout-control"><h3>Posição e orientação</h3><label>Rotação <b>{rotation}°</b><input disabled={!isEditing} type="range" min="0" max="360" step=".5" value={rotation} onChange={(event) => setAndDirty(() => setRotation(Number(event.target.value)))} /></label><div className="layout-coordinate"><input disabled={!isEditing} value={centerInput} onChange={(event) => setCenterInput(event.target.value)} aria-label="Coordenada central" /><button disabled={!isEditing} onClick={applyCenter}>Ir</button></div><small className="layout-help">No modo de edição, arraste o marcador central para mover a grade.</small><label className="layout-check"><input disabled={!isEditing} type="checkbox" checked={flipX} onChange={(event) => setAndDirty(() => setFlipX(event.target.checked))} />Espelhar horizontal</label><label className="layout-check"><input disabled={!isEditing} type="checkbox" checked={flipY} onChange={(event) => setAndDirty(() => setFlipY(event.target.checked))} />Espelhar vertical</label></div>
          <div className="layout-control"><h3>Ensaios no croqui</h3><div className="layout-legend editable">{trialIds.map((id) => <span key={id}><input type="checkbox" disabled={!isEditing} checked={trialVisibility[id] !== false} onChange={(event) => setAndDirty(() => setTrialVisibility({ ...trialVisibility, [id]: event.target.checked }))} aria-label={`Exibir ${trialName(id)}`} /><i style={{ background: colors[id] }} /><b>{id}</b><input type="text" disabled={!isEditing} value={trialLabels[id] ?? trials.find((trial) => trial.id === id)?.name ?? (id === 'PULV' ? 'Pista Pulverização' : '')} placeholder={`Nome do ensaio ${id}`} onChange={(event) => setAndDirty(() => setTrialLabels({ ...trialLabels, [id]: event.target.value }))} /></span>)}</div></div>
          <button className="primary-button wide" onClick={exportGeoJson}>↓ Exportar GeoJSON</button>
        </aside>
        <div className="layout-map">
          <MapContainer key={`${location.id}-${center[0]}-${center[1]}`} center={center} zoom={19} minZoom={3} maxZoom={24} zoomSnap={.25} zoomDelta={.5} wheelPxPerZoomLevel={40} scrollWheelZoom doubleClickZoom boxZoom preferCanvas className="leaflet-map layout-leaflet">
            <ZoomTracker onZoom={setMapZoom} />
            <FitLayoutBounds positions={polygons.map((polygon) => polygon.positions)} token={fitBoundsToken} />
            {mapStyle === 'satellite' && <TileLayer attribution="Tiles &copy; Esri" maxNativeZoom={19} maxZoom={24} url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />}
            {mapStyle === 'google' && <TileLayer attribution="Google" maxNativeZoom={22} maxZoom={24} url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}" />}
            {mapStyle === 'street' && <TileLayer attribution="&copy; OpenStreetMap" maxNativeZoom={19} maxZoom={24} url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />}
            {isEditing && <Marker position={center} draggable icon={divIcon({ className:'layout-anchor-icon', html:'<span>✥</span>', iconSize:[32,32], iconAnchor:[16,16] })} eventHandlers={{ dragend: (event: LeafletEvent) => { const point = (event.target as LeafletMarker).getLatLng(); const next: [number, number] = [point.lat, point.lng]; setCenter(next); setCenterInput(`${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`); setDirty(true); } }} />}
            {polygons.filter(({ plot }) => trialVisibility[plot.trialId] !== false).map(({ plot, positions, plotCenter }) => { const issue = plotIssues[plot.plotId]; const selected = selectedPlotId === plot.plotId; const sequenceBreak = isEditing && brokenSequencePlotIds.has(plot.plotId); const showMapLabel = !isUtilityPlot(plot); return <Fragment key={`${plot.plotId}-${plot.row}-${plot.col}`}><Polygon positions={positions} eventHandlers={{ click: () => selectPlot(plot.plotId) }} pathOptions={{ color: selected ? '#00d4ff' : issue ? issueColor(issue) : '#ffffff', weight: selected ? 3.5 : issue ? 2.4 : .7, fillColor: colors[plot.trialId] ?? '#4d885e', fillOpacity: selected ? .9 : .7 }}><Tooltip sticky><b>Parcela {plot.plotId}</b>{sequenceBreak && <><br /><strong style={{ color: '#c6382f' }}>Quebra de sequência</strong></>}<br />Ensaio: {trialName(plot.trialId)}<br />Linha {plot.row} · Coluna {plot.col}<br />{plot.genotype}{issue && <><br /><strong style={{ color: issueColor(issue) }}>{issue.kind}</strong><br />{issue.note}{issue.replacementGenotype && <><br />Novo genótipo: {issue.replacementGenotype}</>}</>}</Tooltip></Polygon>{showMapLabel && showPlotIds && mapZoom >= 18 && <Marker position={plotCenter} interactive={false} zIndexOffset={sequenceBreak ? 1200 : 0} icon={divIcon({ className:`layout-plot-id-icon${sequenceBreak ? ' sequence-break' : ''}`, html:`<span>${escapeHtml(plot.plotId)}</span>`, iconSize:[54,18], iconAnchor:[27,9] })} />}{issue && <Marker position={plotCenter} interactive={false} zIndexOffset={900} icon={divIcon({ className:`layout-issue-icon ${issue.kind === 'Observação' ? 'note' : 'alert'}`, html:'<span>!</span>', iconSize:[20,20], iconAnchor:[-8,10] })} />}{showMapLabel && firstPlotByTrial[plot.trialId]?.plotId === plot.plotId && <Marker position={positions[0]} interactive={false} zIndexOffset={1000} icon={divIcon({ className:'layout-trial-start-icon', html:`<span>${escapeHtml(trialName(plot.trialId))}</span>`, iconSize:[140,26], iconAnchor:[0,26] })} />}</Fragment>; })}
          </MapContainer>
          <div className="layout-zoom-indicator">Zoom {mapZoom.toFixed(2)} / 24</div><div className="layout-map-hint">{selectedPlot ? `Parcela ${selectedPlot.plotId} selecionada. Use o painel para registrar a ocorrência.` : isEditing ? 'Clique em uma parcela para selecioná-la. A roda do mouse amplia até o zoom 24.' : 'Clique em uma parcela para consultar seus dados e ocorrências.'}</div>
        </div>
      </div>
    </section>
  </div>;
}
