'use client';

import type { Workbook } from 'exceljs';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { divIcon } from 'leaflet';
import { MapContainer, Marker, Polygon, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { LayoutPlot, MapStyle, TrialAllocation, IssueKind, PlotIssue, LayoutSettings, AreaMetadata, LayoutSnapshot, LayoutFinalization } from '../domain/layout';
export type { LayoutPlot, LayoutFinalization, PlotIssue, TrialAllocation } from '../domain/layout';
import LayoutMovePreview from './LayoutMovePreview';
import { parsePlantingSheet, spreadsheetText } from '../lib/plantingImport';
import { trialSilhouettes } from '../lib/layoutGeometry';
import { duplicatePlotIds, plotCellKey, plotIssueFor } from '../lib/plotIdentity';
import { prepareLayout } from '../lib/prepareLayout';
import { validateLayout } from '../lib/layoutValidation';
import { writeStorageBatch } from '../lib/storage';
import ListLayoutBeta from './ListLayoutBeta';
import { parseLayout, stringifyLayout } from '../lib/layoutStorage';

type LayoutTrial = { id: string; name: string; type: string; subtype?: string; plots: number };

const defaultAreaTypes = ['Ensaios', 'Coleções', 'PDs', 'Founder', 'Segregantes', 'Ensaios de N', 'Ensaios de fungicida', 'Nursery', 'Multiqualidades', 'Outro'];

const palette = ['#1f77b4','#e07b39','#3f8f5b','#8d5bb4','#d5a021','#c44e52','#2f8f9d','#7a6b3a'];

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[character] ?? character);
}

function isUtilityPlot(plot: LayoutPlot) {
  const label = plot.plotId.trim().toUpperCase();
  return label.includes('PULV') || label.includes('LNX');
}

function excelFillColor(fill: unknown) {
  if (!fill || typeof fill !== 'object') return undefined;
  const source = fill as { type?: string; pattern?: string; fgColor?: { argb?: string; indexed?: number } };
  if (source.type !== 'pattern' || source.pattern === 'none') return undefined;
  const argb = source.fgColor?.argb?.replace(/^#/, '').toUpperCase();
  if (argb && /^[0-9A-F]{6}$/.test(argb)) return `#${argb}`;
  if (argb && /^[0-9A-F]{8}$/.test(argb) && argb.slice(0, 2) !== '00') return `#${argb.slice(2)}`;
  const indexedColors: Record<number, string> = {
    0:'#000000', 1:'#FFFFFF', 2:'#FF0000', 3:'#00FF00', 4:'#0000FF', 5:'#FFFF00', 6:'#FF00FF', 7:'#00FFFF',
    8:'#000000', 9:'#FFFFFF', 10:'#FF0000', 11:'#00FF00', 12:'#0000FF', 13:'#FFFF00', 14:'#FF00FF', 15:'#00FFFF',
    16:'#800000', 17:'#008000', 18:'#000080', 19:'#808000', 20:'#800080', 21:'#008080', 22:'#C0C0C0', 23:'#808080'
  };
  return source.fgColor?.indexed === undefined ? undefined : indexedColors[source.fgColor.indexed];
}

function ZoomTracker({ onZoom }: { onZoom: (zoom: number) => void }) {
  useMapEvents({ zoomend(event) { onZoom(event.target.getZoom()); } });
  return null;
}

function LayoutCenter({ center, dragging }: { center: [number, number]; dragging: boolean }) {
  const map = useMap();
  useEffect(() => { if (!dragging) map.panTo(center, { animate: false }); }, [map, center[0], center[1], dragging]);
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

export default function FieldLayoutMap({ location, trials, harvestId, onClose, onFinalize, readOnly = false }: { location: { id: string; name: string; city: string; lat: number; lng: number; region?: string; rha?: string }; trials: LayoutTrial[]; harvestId: string; onClose: () => void; onFinalize?: (payload: LayoutFinalization) => void; readOnly?: boolean }) {
  const legacyStorageKey = `field-wheat-layout-${harvestId}-${location.id}`;
  const catalogKey = `field-wheat-layout-catalog-${harvestId}-${location.id}`;
  const defaults: LayoutSettings = { plotLength: 1, plotWidth: 6, gapLength: .1, gapWidth: 0, rotation: Number(localStorage.getItem('field-wheat-last-rotation') || 0), flipX: false, flipY: false, mapStyle: 'google', showPlotIds: false, center: [location.lat, location.lng], trialLabels: {}, trialVisibility: {} };
  const [savedLayouts, setSavedLayouts] = useState<LayoutSnapshot[]>(() => { try { const catalog = parseLayout<LayoutSnapshot[]>(localStorage.getItem(catalogKey) ?? '[]') as LayoutSnapshot[]; if (catalog.length) return catalog; const legacy = parseLayout<LayoutSnapshot | null>(localStorage.getItem(legacyStorageKey) ?? 'null') as LayoutSnapshot | null; return legacy ? [{ ...legacy, metadata: { city: legacy.metadata?.city ?? location.city, areaType: legacy.metadata?.areaType ?? 'Ensaios', plannedSowingDate: legacy.metadata?.plannedSowingDate ?? '', detectionThreshold: legacy.metadata?.detectionThreshold ?? 1, mapId: 'mapa-1', mapName: legacy.metadata?.mapName ?? 'Mapa principal' } }] : []; } catch { return []; } });
  const [activeMapId, setActiveMapId] = useState(() => savedLayouts[0]?.metadata?.mapId ?? 'mapa-1');
  const [savedSnapshot, setSavedSnapshot] = useState<LayoutSnapshot | null>(() => savedLayouts[0] ?? null);
  const initial = { ...defaults, ...(savedSnapshot?.settings ?? {}) };
  const [widthHorizontal, setWidthHorizontal] = useState(initial.widthHorizontal ?? false);
  const [generatedFromList, setGeneratedFromList] = useState(initial.generatedFromList ?? false);
  const [plotLength, setPlotLength] = useState(initial.plotLength);
  const [plotWidth, setPlotWidth] = useState(initial.plotWidth);
  const [gapLength, setGapLength] = useState(initial.gapLength);
  const [gapWidth, setGapWidth] = useState(initial.gapWidth);
  const [rotation, setRotation] = useState(initial.rotation);
  useEffect(() => { if (isFinite(rotation)) localStorage.setItem('field-wheat-last-rotation', String(rotation)); }, [rotation]);
  const [movePending, setMovePending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
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
  const [isEditing, setIsEditing] = useState(() => !readOnly);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!dirty) return; const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; }; window.addEventListener('beforeunload', beforeUnload); return () => window.removeEventListener('beforeunload', beforeUnload); }, [dirty]);
  const [mapZoom, setMapZoom] = useState(19);
  const [fitBoundsToken, setFitBoundsToken] = useState(0);
  const [importing, setImporting] = useState(false);
  const importRequest = useRef(0);
  const activeMapRef = useRef(activeMapId);
  activeMapRef.current = activeMapId;
  const [importStatus, setImportStatus] = useState('');
  const workbookRef = useRef<Workbook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState('');
  const [importError, setImportError] = useState('');
  const [allocations, setAllocations] = useState<TrialAllocation[]>(() => savedSnapshot?.allocations ?? []);
  const [plotIssues, setPlotIssues] = useState<Record<string, PlotIssue>>(() => savedSnapshot?.plotIssues ?? {});
  const [selectedPlotId, setSelectedPlotId] = useState('');
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

  const plots = importedPlots ?? (savedSnapshot ? generatedPlots : []);
  const duplicateIds = useMemo(() => duplicatePlotIds(plots), [plots]);
  const duplicateKey = duplicateIds.join('|');
  const [ignoreDuplicates, setIgnoreDuplicates] = useState(false);
  useEffect(() => { setIgnoreDuplicates(false); }, [duplicateKey, fileName]);
  const trialIds = [...new Set(plots.map((plot) => plot.trialId))];
  const colors = Object.fromEntries(trialIds.map((id, index) => [id, id === 'PULV' ? '#212121' : id === 'LNX' ? '#d7b229' : id === 'UNASSIGNED' ? '#8f9992' : allocations.find((allocation) => allocation.id === id)?.color ?? palette[index % palette.length]]));
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

  const silhouettes = useMemo(() => trialSilhouettes(polygons).map((shape) => ({ ...shape, color: allocations.find((allocation) => allocation.id === shape.id)?.color ?? '#2d7a57' })), [polygons, allocations]);

  const otherMapPolygons = useMemo(() => savedLayouts.filter((snapshot) => snapshot.metadata?.mapId !== activeMapId).flatMap((snapshot) => {
    const source = snapshot.plots ?? []; const settings = { ...defaults, ...(snapshot.settings ?? {}) }; if (!source.length) return [];
    const rows = Math.max(1, ...source.map((plot) => plot.row)); const cols = Math.max(1, ...source.map((plot) => plot.col));
    const rad = settings.rotation * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad); const totalX = cols * settings.plotLength + Math.max(0, cols - 1) * settings.gapLength; const totalY = rows * settings.plotWidth + Math.max(0, rows - 1) * settings.gapWidth; const metersLat = 1 / 111111, metersLng = 1 / (111111 * Math.cos(settings.center[0] * Math.PI / 180));
    return source.map((plot) => { const col = settings.flipX ? cols - plot.col : plot.col - 1; const row = settings.flipY ? plot.row - 1 : rows - plot.row; const x0 = col * (settings.plotLength + settings.gapLength) - totalX / 2; const y0 = row * (settings.plotWidth + settings.gapWidth) - totalY / 2; const positions = [[x0,y0],[x0 + settings.plotLength,y0],[x0 + settings.plotLength,y0 + settings.plotWidth],[x0,y0 + settings.plotWidth]].map(([x,y]) => [settings.center[0] + (x * sin + y * cos) * metersLat, settings.center[1] + (x * cos - y * sin) * metersLng] as [number, number]); return { mapId: snapshot.metadata?.mapId ?? '', mapName: snapshot.metadata?.mapName ?? 'Mapa cadastrado', areaType: snapshot.metadata?.areaType ?? 'Área', plot, positions }; });
  }), [savedLayouts, activeMapId]);

  const firstPlotByTrial = useMemo(() => {
    const first: Record<string, LayoutPlot> = {};
    plots.filter((plot) => !isUtilityPlot(plot) && plot.trialId !== 'UNASSIGNED').forEach((plot) => { const current = first[plot.trialId]; if (!current || plot.row < current.row || (plot.row === current.row && plot.col < current.col)) first[plot.trialId] = plot; });
    return first;
  }, [plots]);

  const brokenSequencePlotIds = useMemo(() => {
    const broken = new Set<string>();
    if (generatedFromList) return broken;
    const grouped = new Map<string, LayoutPlot[]>();
    plots.filter((plot) => !isUtilityPlot(plot)).forEach((plot) => { const key = plot.allocationId ?? plot.trialId; if (!grouped.has(key)) grouped.set(key, []); grouped.get(key)!.push(plot); });
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
  }, [plots, detectionThreshold, generatedFromList]);

  function applyWorksheet(workbook: Workbook, name: string, source: string) {
    const sheet = workbook.getWorksheet(name);
    if (!sheet) throw new Error('Selecione uma aba válida do Excel.');
    const neutralPlots = parsePlantingSheet(sheet, excelFillColor);
    setSheetName(name); setGeneratedFromList(false); setWidthHorizontal(false);
    setImportedPlots(neutralPlots); setAllocations([]); setPlotIssues({}); setSelectedPlotId('');
    setTrialLabels({ PULV: 'Pista Pulverização', LNX: 'Linha auxiliar', UNASSIGNED: 'Parcelas sem ensaio' });
    setTrialVisibility({}); setFileName(source); setDirty(true); setImportError('');
    setFitBoundsToken((value) => value + 1);
    setImportStatus(neutralPlots.length.toLocaleString('pt-BR') + ' células carregadas da aba ' + name + '. Agora informe os nomes e intervalos dos ensaios.');
  }
  function changeWorksheet(name: string) {
    if (!workbookRef.current || (allocations.length && !window.confirm('Trocar a aba substitui as parcelas e os ensaios desta prévia. Continuar?'))) return;
    try { applyWorksheet(workbookRef.current, name, fileName); }
    catch (error) { setImportError(error instanceof Error ? error.message : 'Não foi possível ler esta aba.'); }
  }
  async function importLayout(file?: File) {
    if (!file || !isEditing) return;
    if (plots.length && !window.confirm('Substituir as parcelas deste mapa pelo novo Excel? Os outros mapas do local serão mantidos.')) return;
    const request = ++importRequest.current; const mapId = activeMapId;
    setImporting(true); setImportError(''); setImportStatus('Lendo o croqui…');
    try {
      const { Workbook } = await import('exceljs');
      const workbook = new Workbook(); await workbook.xlsx.load(await file.arrayBuffer());
      if (request !== importRequest.current || mapId !== activeMapRef.current) return;
      const sheets = workbook.worksheets.filter((sheet) => sheet.state === 'visible');
      if (!sheets.length) throw new Error('A planilha não possui abas visíveis.');
      workbookRef.current = workbook; setSheetNames(sheets.map((sheet) => sheet.name));
      // Prefer a populated sheet, while keeping every visible sheet available to the user.
      const first = sheets.find((sheet) => sheet.actualRowCount > 0) ?? sheets[0];
      applyWorksheet(workbook, first.name, file.name);
    } catch (error) {
      if (request === importRequest.current && mapId === activeMapRef.current) {
        setImportError(error instanceof Error ? error.message : 'Não foi possível ler o Excel. Use um arquivo .xlsx com os PlotIDs nas células.'); setImportStatus('');
      }
    } finally { if (request === importRequest.current) setImporting(false); }
  }

  async function importPlotData(file?: File) {
    if (!file || !isEditing || !importedPlots?.length) return;
    const request = ++importRequest.current; const mapId = activeMapId;
    setImporting(true); setImportError(''); setImportStatus('Vinculando dados pelo PlotID…');
    try {
      const { Workbook } = await import('exceljs'); const workbook = new Workbook(); await workbook.xlsx.load(await file.arrayBuffer());
      if (request !== importRequest.current || mapId !== activeMapRef.current) return;
      const sheet = workbook.worksheets[0]; if (!sheet) throw new Error('A planilha complementar não possui aba válida.');
      const headers = (sheet.getRow(1).values as unknown[]).slice(1).map((value) => String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
      const plotIndex = headers.findIndex((value) => ['plotid','plot_id','trat'].includes(value));
      const genotypeIndex = headers.findIndex((value) => /genotipo|genotype|nome/.test(value));
      const genealogyIndex = headers.findIndex((value) => /genealogia|genealogy|pedigree/.test(value));
      if (plotIndex < 0) throw new Error('Inclua uma coluna PlotID (ou Trat) no arquivo complementar.');
      const lookup = new Map<string, { genotype?: string; genealogy?: string }>();
      sheet.eachRow((row, number) => { if (number === 1) return; const id = spreadsheetText(row.getCell(plotIndex + 1)); if (id) lookup.set(id, { genotype: genotypeIndex >= 0 ? spreadsheetText(row.getCell(genotypeIndex + 1)) : undefined, genealogy: genealogyIndex >= 0 ? spreadsheetText(row.getCell(genealogyIndex + 1)) : undefined }); });
      let linked = 0; const updated = importedPlots.map((plot) => { const data = lookup.get(plot.plotId); if (!data) return plot; linked += 1; return { ...plot, genotype: data.genotype || plot.genotype, genealogy: data.genealogy || plot.genealogy }; });
      setImportedPlots(updated); setDirty(true); setImportStatus(`${linked} de ${importedPlots.length} parcelas vinculadas pelo PlotID.`);
    } catch (error) { setImportError(error instanceof Error ? error.message : 'Não foi possível ler o arquivo complementar.'); setImportStatus(''); } finally { if (request === importRequest.current) setImporting(false); }
  }

  function currentSettings(): LayoutSettings { return { generatedFromList, widthHorizontal, plotLength, plotWidth, gapLength, gapWidth, rotation, flipX, flipY, mapStyle, showPlotIds, center, trialLabels, trialVisibility }; }
  function saveLayout(startNew = false) {
    if (!isEditing || savingRef.current || importing) return;
    if (movePending) { setImportError('Clique no mapa para fixar o croqui ou cancele o posicionamento.'); return; }
    savingRef.current = true; setIsSaving(true); setImportError('');
    try {
      const saved = new Date().toISOString();
      const category = customAreaType.trim() || areaType;
      const metadata: AreaMetadata = { city: city.trim(), areaType: category, plannedSowingDate, detectionThreshold, mapId: activeMapId, mapName: category };
      const prepared = prepareLayout(importedPlots ?? [], allocations, category);
      const settings = { ...currentSettings(), trialLabels: { ...trialLabels, ...Object.fromEntries(prepared.allocations.map((item) => [item.id, item.name])) } };
      const snapshot: LayoutSnapshot = { plots: prepared.plots, fileName, savedAt: saved, settings, allocations: prepared.allocations, plotIssues, metadata };
      validateLayout(snapshot);
      const nextLayouts = [...savedLayouts.filter((item) => item.metadata?.mapId !== activeMapId), snapshot];
      const nextTypes = areaTypes.includes(category) ? areaTypes : [...areaTypes, category];
      const storageUpdates = { [catalogKey]: stringifyLayout(nextLayouts), [legacyStorageKey]: null, 'field-wheat-area-types-v1': JSON.stringify(nextTypes) };
      const firstCoordinates = new Map(prepared.allocations.map((allocation) => [allocation.id, polygons.find(({ plot }) => (plot.allocationId ?? plot.trialId) === allocation.id && plot.plotId === allocation.startPlotId)?.plotCenter ?? center]));
      const payload: LayoutFinalization = { storageUpdates, continueEditing: true, mapId: activeMapId, mapName: category, location: { ...location, city: city.trim(), lat: center[0], lng: center[1] }, areaType: category, plannedSowingDate, fileName, allocations: prepared.allocations.map((allocation) => ({ ...allocation, firstPlotCoordinate: firstCoordinates.get(allocation.id) ?? center })), plots: prepared.plots, plotIssues };
      if (onFinalize) onFinalize(payload); else writeStorageBatch(storageUpdates);
      setImportedPlots(prepared.plots); setAllocations(prepared.allocations); setTrialLabels(settings.trialLabels);
      setSavedLayouts(nextLayouts); setSavedSnapshot(snapshot); setSavedAt(saved); setDirty(false); setAreaTypes(nextTypes); setAreaType(category); setCustomAreaType('');
      setImportStatus('Mapa e planejamento salvos.');
      // Keep the editor open; save actions remain in the fixed toolbar.
      if (startNew) {
        workbookRef.current = null; setSheetNames([]); setSheetName(''); setActiveMapId('mapa-' + Date.now()); setSavedSnapshot(null); setImportedPlots([]); setFileName(''); setAllocations([]); setPlotIssues({}); setTrialLabels({}); setTrialVisibility({}); setSelectedPlotId(''); setSavedAt(''); setImportStatus('Mapa anterior salvo. Carregue as parcelas do próximo mapa.');
      }
      setIsEditing(true);
    } catch (error) { setImportError(error instanceof Error ? error.message : 'Não foi possível salvar o mapa.'); }
    finally { savingRef.current = false; setIsSaving(false); }
  }
  function restore(snapshot: LayoutSnapshot | null) {
    importRequest.current += 1; workbookRef.current = null; setSheetNames([]); setSheetName(''); setImportError(''); setImportStatus(''); setImporting(false); setMovePending(false);
    const settings = { ...defaults, ...(snapshot?.settings ?? {}) };
    setImportedPlots(snapshot?.plots ?? []); setFileName(snapshot?.fileName ?? ''); setSavedAt(snapshot?.savedAt ?? '');
    setGeneratedFromList(settings.generatedFromList ?? false); setWidthHorizontal(settings.widthHorizontal ?? false); setPlotLength(settings.plotLength); setPlotWidth(settings.plotWidth); setGapLength(settings.gapLength); setGapWidth(settings.gapWidth); setRotation(settings.rotation); setFlipX(settings.flipX); setFlipY(settings.flipY); setMapStyle(settings.mapStyle); setShowPlotIds(settings.showPlotIds);
    setCenter(settings.center); setCenterInput(`${settings.center[0].toFixed(6)}, ${settings.center[1].toFixed(6)}`); setTrialLabels(settings.trialLabels); setTrialVisibility(settings.trialVisibility); setAllocations(snapshot?.allocations ?? []); setPlotIssues(snapshot?.plotIssues ?? {}); setCity(snapshot?.metadata?.city ?? location.city.replace(/\s*-\s*[A-Z]{2}$/, '')); setAreaType(snapshot?.metadata?.areaType ?? 'Ensaios'); setPlannedSowingDate(snapshot?.metadata?.plannedSowingDate ?? ''); setDetectionThreshold(snapshot?.metadata?.detectionThreshold ?? 1); setSelectedPlotId(''); setDirty(false); setIsEditing(!readOnly);
  }
  function selectMap(mapId: string) { if ((dirty || movePending) && !window.confirm('Trocar de mapa sem salvar as alterações atuais?')) return; const snapshot = savedLayouts.find((item) => item.metadata?.mapId === mapId) ?? null; setActiveMapId(mapId); setSavedSnapshot(snapshot); restore(snapshot); }
  function newMap() { if ((dirty || movePending) && !window.confirm('Descartar as alterações não salvas e iniciar outro mapa? Use Salvar mapa e carregar outro para preservar este croqui.')) return; const id = `mapa-${Date.now()}`; setActiveMapId(id); setSavedSnapshot(null); restore(null); setIsEditing(true); }
  function applyCenter() {
    const parsed = centerInput.split(',').map((part) => Number(part.trim()));
    if (parsed.length !== 2 || parsed.some((value) => !Number.isFinite(value))) return;
    setCenter([parsed[0], parsed[1]]); setDirty(true);
  }
  function selectPlot(plotId: string) {
    setSelectedPlotId(plotId);
    const plot = plots.find((item) => plotCellKey(item) === plotId);
    const issue = plot ? plotIssueFor(plotIssues, plot) : undefined;
    setIssueKind(issue?.kind ?? 'Observação'); setIssueNote(issue?.note ?? ''); setReplacementGenotype(issue?.replacementGenotype ?? '');
  }
  function applyAllocation() {
    if (importing) return;
    const name = allocationName.trim();
    const ordered = [...plots].sort((a, b) => a.row - b.row || a.col - b.col);
    const startIndex = ordered.findIndex((plot) => plot.plotId === rangeStart.trim());
    const endIndex = ordered.findIndex((plot) => plot.plotId === rangeEnd.trim());
    if (!name || startIndex < 0 || endIndex < 0) { setImportError('Informe o nome do ensaio e PlotIDs inicial e final existentes no croqui.'); return; }
    const plotNumber = (value: string) => { const match = value.trim().match(/\d+(?:[.,]\d+)?(?!.*\d)/)?.[0]; return match ? Number(match.replace(',', '.')) : Number.NaN; };
    const startNumber = plotNumber(ordered[startIndex].plotId); const endNumber = plotNumber(ordered[endIndex].plotId);
    if (!Number.isFinite(startNumber) || !Number.isFinite(endNumber)) { setImportError('Os PlotIDs inicial e final precisam conter uma numeração Trat válida.'); return; }
    const minimum = Math.min(startNumber, endNumber), maximum = Math.max(startNumber, endNumber);
    const selected = plots.filter((plot) => !isUtilityPlot(plot) && (() => { const value = plotNumber(plot.plotId); return Number.isFinite(value) && value >= minimum && value <= maximum; })());
    if (!selected.length) { setImportError('Nenhuma parcela foi encontrada dentro do intervalo informado.'); return; }
    const selectedIds = new Set(selected.map((plot) => plot.plotId));
    const id = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || `ENSAIO-${allocations.length + 1}`;
    const existing = allocations.find((allocation) => allocation.id === id);
    const colorFrequency = selected.reduce<Record<string, number>>((frequency, plot) => { if (plot.excelColor) frequency[plot.excelColor] = (frequency[plot.excelColor] ?? 0) + 1; return frequency; }, {});
    const importedColor = Object.entries(colorFrequency).sort((a, b) => b[1] - a[1])[0]?.[0];
    const allocation: TrialAllocation = { id, code: name, name, startPlotId: ordered[startIndex].plotId, endPlotId: ordered[endIndex].plotId, color: importedColor || existing?.color || palette[allocations.length % palette.length], plotCount: selected.length };
    const updatedPlots = plots.map((plot) => selectedIds.has(plot.plotId) ? { ...plot, trialId: id, allocationId: id, sourceTrialId: plot.sourceTrialId ?? plot.trialId } : plot);
    const nextAllocations = [...allocations.filter((item) => item.id !== id), allocation].flatMap((item) => {
      const members = updatedPlots.filter((plot) => (plot.allocationId ?? plot.trialId) === item.id);
      return members.length ? [{ ...item, plotCount: members.length, startPlotId: members.some((plot) => plot.plotId === item.startPlotId) ? item.startPlotId : members[0].plotId, endPlotId: members.some((plot) => plot.plotId === item.endPlotId) ? item.endPlotId : members[members.length - 1].plotId }] : [];
    });
    setImportedPlots(updatedPlots); setAllocations(nextAllocations);
    setTrialLabels({ ...trialLabels, [id]: name }); setTrialVisibility({ ...trialVisibility, [id]: true }); setDirty(true); setSelectedPlotId(plotCellKey(ordered[startIndex])); setImportError('');
  }
  function removeAllocation(id: string) {
    if (importing) return;
    setImportedPlots(plots.map((plot) => (plot.allocationId ?? plot.trialId) === id ? { ...plot, trialId: 'UNASSIGNED', allocationId: undefined } : plot));
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
    const next = { ...plotIssues }; if (selectedPlot && next[selectedPlot.plotId]) next[selectedPlotId] = { kind: 'Observação', note: '', cleared: true, updatedAt: new Date().toISOString() }; else delete next[selectedPlotId]; setPlotIssues(next); setIssueKind('Observação'); setIssueNote(''); setReplacementGenotype(''); setDirty(true);
  }
  function issueColor(issue?: PlotIssue) {
    if (!issue) return '';
    if (issue.kind !== 'Observação' && issue.kind !== 'Troca de genótipo') return '#d33b32';
    if (issue.kind === 'Troca de genótipo') return '#e48621';
    return '#2e73b8';
  }
  function exportGeoJson() {
    const features = polygons.filter(({ plot }) => trialVisibility[plot.trialId] !== false).map(({ plot, positions }) => ({ type: 'Feature', properties: { parcela: plot.plotId, ensaio: plot.trialId, nome_ensaio: trialName(plot.trialId), genotipo: plot.genotype, linha: plot.row, coluna: plot.col, ocorrencia_tipo: plotIssueFor(plotIssues, plot)?.kind ?? '', ocorrencia: plotIssueFor(plotIssues, plot)?.note ?? '', genotipo_substituto: plotIssueFor(plotIssues, plot)?.replacementGenotype ?? '' }, geometry: { type: 'Polygon', coordinates: [[...positions.map(([lat,lng]) => [Number(lng.toFixed(7)),Number(lat.toFixed(7))]), [Number(positions[0][1].toFixed(7)),Number(positions[0][0].toFixed(7))]]] } }));
    const url = URL.createObjectURL(new Blob([JSON.stringify({ type:'FeatureCollection', features })], { type:'application/geo+json' }));
    const link = document.createElement('a'); link.href = url; link.download = `croqui-${location.id}.geojson`; link.click(); URL.revokeObjectURL(url);
  }

  function requestClose() { if (isSaving) return; if ((dirty || movePending) && !window.confirm('Fechar sem salvar as alterações do mapa?')) return; onClose(); }

  const setAndDirty = (action: () => void) => { action(); setDirty(true); };
  const visibleCount = plots.filter((plot) => trialVisibility[plot.trialId] !== false).length;
  const selectedPlot = plots.find((plot) => plotCellKey(plot) === selectedPlotId);

  const trialNamesKey = trials.map((trial) => trial.id + ':' + trial.name).join('|');
  const parcelLayer = useMemo(() => polygons.filter(({ plot }) => trialVisibility[plot.trialId] !== false).map(({ plot, positions, plotCenter }) => { const issue = plotIssueFor(plotIssues, plot); const selected = selectedPlotId === plotCellKey(plot); const sequenceBreak = isEditing && brokenSequencePlotIds.has(plot.plotId); const showMapLabel = !isUtilityPlot(plot); return <Fragment key={`${plot.plotId}-${plot.row}-${plot.col}`}><Polygon positions={positions} eventHandlers={{ click: () => selectPlot(plotCellKey(plot)) }} pathOptions={{ color: selected ? '#00d4ff' : issue ? issueColor(issue) : '#ffffff', weight: selected ? 3.5 : issue ? 2.4 : .7, fillColor: colors[plot.trialId] ?? '#4d885e', fillOpacity: selected ? .9 : .7 }}><Tooltip sticky><b>PlotID / Trat {plot.plotId}</b>{sequenceBreak && <><br /><strong style={{ color: '#c6382f' }}>Quebra de sequência</strong></>}<br />Ensaio: {trialName(plot.trialId)}<br />Linha {plot.row} · Coluna {plot.col}<br />Genótipo: {plot.genotype || 'não informado'}{plot.genealogy && <><br />Genealogia: {plot.genealogy}</>}{issue && <><br /><strong style={{ color: issueColor(issue) }}>{issue.kind}</strong><br />{issue.note}{issue.replacementGenotype && <><br />Novo genótipo: {issue.replacementGenotype}</>}</>}</Tooltip></Polygon>{showMapLabel && showPlotIds && mapZoom >= 18 && <Marker position={plotCenter} interactive={false} zIndexOffset={sequenceBreak ? 1200 : 0} icon={divIcon({ className:`layout-plot-id-icon${sequenceBreak ? ' sequence-break' : ''}`, html:`<span>${escapeHtml(plot.plotId)}</span>`, iconSize:[54,18], iconAnchor:[27,9] })} />}{issue && <Marker position={plotCenter} interactive={false} zIndexOffset={900} icon={divIcon({ className:`layout-issue-icon ${issue.kind === 'Observação' ? 'note' : 'alert'}`, html:'<span>!</span>', iconSize:[20,20], iconAnchor:[-8,10] })} />}{showMapLabel && firstPlotByTrial[plot.trialId]?.row === plot.row && firstPlotByTrial[plot.trialId]?.col === plot.col && <Marker position={positions[0]} interactive={false} zIndexOffset={1000} icon={divIcon({ className:'layout-trial-start-icon', html:`<span>${escapeHtml(trialName(plot.trialId))}</span>`, iconSize:[140,26], iconAnchor:[0,26] })} />}</Fragment>; }), [polygons, plotIssues, selectedPlotId, isEditing, brokenSequencePlotIds, showPlotIds, mapZoom, trialVisibility, allocations, trialLabels, trialNamesKey]);

  return <div className="layout-modal" role="dialog" aria-modal="true" aria-label={`Croqui de ${location.name}`}>
    <button type="button" className="layout-backdrop" onClick={requestClose} aria-label="Fechar janela do croqui" />
    <section className="layout-dialog">
      <header><div><span>CROQUI DA ÁREA · {location.id}</span><h2>{location.name}</h2><p>{location.city} · {visibleCount.toLocaleString('pt-BR')} parcelas</p></div><button type="button" className="layout-close" onClick={requestClose} aria-label="Fechar croqui">×</button></header>
      <div className="layout-workspace">
        <aside>
          <div className="layout-control layout-area-data"><h3>Dados da área</h3><label>Categoria de ensaio / nome do mapa<select disabled={!isEditing} value={areaType} onChange={(event) => setAndDirty(() => setAreaType(event.target.value))}>{areaTypes.map((type) => <option key={type}>{type}</option>)}</select></label>{areaType === 'Outro' && <label>Nova categoria<input disabled={!isEditing} value={customAreaType} onChange={(event) => setAndDirty(() => setCustomAreaType(event.target.value))} placeholder="Digite para salvar como nova opção" /></label>}<label>Cidade<input disabled={!isEditing} value={city} onChange={(event) => setAndDirty(() => setCity(event.target.value))} placeholder="Município da área" /></label><label>Data prevista de semeadura<input disabled={!isEditing} type="date" value={plannedSowingDate} onChange={(event) => setAndDirty(() => setPlannedSowingDate(event.target.value))} /></label><small className="layout-help">A data prevista gera o calendário fenológico quando o croqui for salvo.</small><div className={`layout-readiness ${city.trim() && plannedSowingDate && plots.length ? 'ready' : ''}`}>{city.trim() && plannedSowingDate && allocations.length ? 'Pronto para gerar a base de gestão e o calendário.' : 'Informe cidade e semeadura. Você pode nomear os ensaios depois de salvar.'}</div></div>
          <section className="layout-control layout-file-step"><h3>1. Carregar croqui do Excel</h3><p>Use o mapa em grade: cada célula representa uma parcela, com seu PlotID/Trat e a cor do Excel.</p><label>Arquivo do croqui (.xlsx)<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={!isEditing || importing || isSaving} onChange={(event) => { void importLayout(event.target.files?.[0]); event.target.value = ''; }} /></label>{sheetNames.length > 0 && <label>Aba do Excel<select disabled={importing || !isEditing} value={sheetName} onChange={(event) => changeWorksheet(event.target.value)}>{sheetNames.map((name) => <option key={name}>{name}</option>)}</select></label>}{fileName && <small>Arquivo atual: {fileName}</small>}{importStatus && <p role="status">{importStatus}</p>}{importError && <p role="alert">{importError}</p>}</section>
          {duplicateIds.length > 0 && !ignoreDuplicates && <section className="duplicate-warning" role="status"><b>PlotIDs repetidos: {duplicateIds.slice(0, 10).join(', ')}{duplicateIds.length > 10 ? '…' : ''}</b><p>Você pode continuar. As parcelas serão mantidas separadas pela posição no croqui.</p><button type="button" onClick={() => setIgnoreDuplicates(true)}>Ignorar aviso</button></section>}
          <div className="layout-control layout-allocation"><h3>2. Nomear os ensaios</h3><small className="layout-help">Opcional: nomeie agora ou depois de salvar. As parcelas ainda não identificadas serão agrupadas pela categoria do mapa. Informe o nome e o número Trat inicial e final. A cor do ensaio será trazida do preenchimento das células do Excel; PULV e LNX mantêm suas cores automáticas.</small>{isEditing && <div className={brokenSequencePlotIds.size ? 'sequence-diagnostic warning' : 'sequence-diagnostic'}><b>{brokenSequencePlotIds.size}</b><span>{brokenSequencePlotIds.size ? 'PlotIDs nas bordas de sequências interrompidas estão destacados em vermelho no mapa.' : 'Nenhuma quebra de sequência detectada.'}</span><label>Salto mínimo<input type="number" min="1" value={detectionThreshold} onChange={(event) => setDetectionThreshold(Number(event.target.value) || 1)} /></label></div>}{allocations.length > 0 && <div className="layout-allocation-list registration">{allocations.map((allocation) => <div key={allocation.id}><i style={{ background: allocation.color }} /><span><b>{allocation.name}</b><small>Trat inicial: {allocation.startPlotId} · Trat final: {allocation.endPlotId} · {allocation.plotCount} parcelas</small></span>{isEditing && <button className="allocation-delete" onClick={() => { if (window.confirm(`Remover o ensaio ${allocation.name} deste croqui?`)) removeAllocation(allocation.id); }}>Excluir</button>}</div>)}</div>}<details className="layout-advanced-detection" open><summary>Definir intervalo do ensaio</summary><div className="layout-input-grid"><label>Nome do ensaio<input disabled={!isEditing} value={allocationName} onChange={(event) => setAllocationName(event.target.value)} placeholder="Ex.: VCU I Precoce" /></label></div><div className="layout-range-grid"><label>Trat / parcela inicial<input list={`plot-options-${location.id}`} disabled={!isEditing} value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} /></label><button disabled={!isEditing || !selectedPlotId} onClick={() => setRangeStart(selectedPlot?.plotId ?? '')}>Usar selecionada</button><label>Trat / parcela final<input list={`plot-options-${location.id}`} disabled={!isEditing} value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} /></label><button disabled={!isEditing || !selectedPlotId} onClick={() => setRangeEnd(selectedPlot?.plotId ?? '')}>Usar selecionada</button></div><button className="layout-action-button" disabled={!isEditing || !allocationName.trim() || !rangeStart || !rangeEnd} onClick={applyAllocation}>Colorir e etiquetar ensaio</button></details></div>
          <div className="layout-control"><h3>3. Posicionar no mapa</h3><label>Rotação <span className="rotation-entry"><input disabled={!isEditing} type="number" min="-360" max="360" step=".1" value={rotation} onChange={(event) => setAndDirty(() => setRotation(Number(event.target.value)))} aria-label="Ângulo de rotação em graus" /><b>°</b></span><input disabled={!isEditing} type="range" min="0" max="360" step=".5" value={((rotation % 360) + 360) % 360} onChange={(event) => setAndDirty(() => setRotation(Number(event.target.value)))} /></label><div className="layout-coordinate"><input disabled={!isEditing} value={centerInput} onChange={(event) => setCenterInput(event.target.value)} aria-label="Coordenada central" /><button disabled={!isEditing} onClick={applyCenter}>Ir</button></div><small className="layout-help">Digite o ângulo exato ou use a barra. Clique no ícone de mover, escolha a posição e clique novamente para fixar.</small><label className="layout-check"><input disabled={!isEditing} type="checkbox" checked={flipX} onChange={(event) => setAndDirty(() => setFlipX(event.target.checked))} />Espelhar horizontal</label><label className="layout-check"><input disabled={!isEditing} type="checkbox" checked={flipY} onChange={(event) => setAndDirty(() => setFlipY(event.target.checked))} />Espelhar vertical</label></div>
          <div className="layout-control"><h3>Dimensões da parcela</h3><div className="layout-input-grid"><label>{widthHorizontal ? 'Largura (m)' : 'Comprimento'}<input disabled={!isEditing} type="number" min=".5" step=".5" value={plotLength} onChange={(event) => setAndDirty(() => setPlotLength(Number(event.target.value)))} /></label><label>{widthHorizontal ? 'Comprimento (m)' : 'Largura'}<input disabled={!isEditing} type="number" min=".2" step=".1" value={plotWidth} onChange={(event) => setAndDirty(() => setPlotWidth(Number(event.target.value)))} /></label><label>Espaçamento<input disabled={!isEditing} type="number" min="0" step=".1" value={gapLength} onChange={(event) => setAndDirty(() => setGapLength(Number(event.target.value)))} /></label><label>Entrelinhas<input disabled={!isEditing} type="number" min="0" step=".1" value={gapWidth} onChange={(event) => setAndDirty(() => setGapWidth(Number(event.target.value)))} /></label></div></div>
<details className="layout-control layout-extras" open={Boolean(selectedPlot)}><summary>Outras opções · mapas, dados e ocorrências</summary>
          <div className="layout-control layout-map-catalog"><h3>Mapas de plantio do local</h3><label>Mapa ativo<select value={activeMapId} onChange={(event) => selectMap(event.target.value)}>{savedLayouts.map((item) => <option key={item.metadata?.mapId} value={item.metadata?.mapId}>{item.metadata?.areaType ?? item.metadata?.mapName}</option>)}{!savedLayouts.some((item) => item.metadata?.mapId === activeMapId) && <option value={activeMapId}>Novo mapa</option>}</select></label>{!readOnly && <button className="layout-action-button" type="button" onClick={newMap}>＋ Inserir novo mapa de plantio</button>}<small className="layout-help">Cada mapa é salvo isoladamente por categoria; o local mantém o conjunto completo.</small></div>

          <label className={`layout-upload secondary ${!isEditing || !importedPlots?.length ? 'disabled' : ''}`}><input type="file" accept=".xlsx" disabled={!isEditing || !importedPlots?.length} onChange={(event) => importPlotData(event.target.files?.[0])} /><b>↔ Vincular dados das parcelas</b><small>Outro Excel com PlotID e, quando disponíveis, Genótipo e Genealogia</small></label>
          {!readOnly && <ListLayoutBeta disabled={!isEditing || importing || isSaving} onApply={(result, options, source) => {
            if (importedPlots?.length && !window.confirm('Substituir as parcelas e os ensaios da prévia atual pela lista?')) return false;
            workbookRef.current = null; setSheetNames([]); setSheetName('');
            setGeneratedFromList(true); setImportedPlots(result.plots); setAllocations(result.allocations);
            setTrialLabels(Object.fromEntries(result.allocations.map((a) => [a.id, a.name])));
            setTrialVisibility({}); setPlotIssues({}); setSelectedPlotId('');
            setWidthHorizontal(true); setPlotLength(options.width); setPlotWidth(options.length); setGapLength(result.gap); setGapWidth(0);
            setFlipX(false); setFlipY(false); setFileName(`Lista beta · ${source}`);
            setDirty(true); setImportError(''); setImportStatus(`${result.plots.length} parcelas geradas em zigue-zague. Confira e conclua o cadastro.`);
            setFitBoundsToken((value) => value + 1);
          }} />}
          {savedAt && <div className="layout-linked"><span>✓ CROQUI VINCULADO</span><b>{location.name}</b><small>{harvestId} · salvo em {new Date(savedAt).toLocaleString('pt-BR')}</small></div>}
          <datalist id={`plot-options-${location.id}`}>{[...new Set(plots.map((plot) => plot.plotId))].map((plotId) => <option key={plotId} value={plotId} />)}</datalist>
          <div className={`layout-control layout-occurrence ${selectedPlot ? 'selected' : ''}`}><h3>Ocorrência na implantação</h3>{selectedPlot ? <><div className="layout-selected-plot"><span>PARCELA SELECIONADA</span><b>{selectedPlot.plotId}</b><small>{trialName(selectedPlot.trialId)} · linha {selectedPlot.row}, coluna {selectedPlot.col}</small></div><label>Tipo<select disabled={!isEditing} value={issueKind} onChange={(event) => setIssueKind(event.target.value as IssueKind)}><option>Observação</option><option>Alerta</option><option>Troca de genótipo</option><option>Linha entupida</option><option>Falha de semeadura</option><option>Passada de pulverizador</option><option>Fitotoxidez</option><option>Parcela perdida</option><option>Outro</option></select></label>{issueKind === 'Troca de genótipo' && <label>Novo genótipo<input disabled={!isEditing} value={replacementGenotype} onChange={(event) => setReplacementGenotype(event.target.value)} placeholder="Identificação do substituto" /></label>}<label>Descrição<textarea disabled={!isEditing} value={issueNote} onChange={(event) => setIssueNote(event.target.value)} placeholder="Descreva o que ocorreu nesta parcela" /></label>{isEditing && <div className="layout-issue-actions"><button onClick={clearIssue} disabled={!selectedPlot || !plotIssueFor(plotIssues, selectedPlot)}>Remover</button><button className="layout-action-button" onClick={saveIssue} disabled={!issueNote.trim()}>Salvar ocorrência</button></div>}</> : <small className="layout-help">Clique em uma parcela do mapa para selecioná-la e registrar uma observação ou alerta.</small>}{plots.filter((plot) => Boolean(plotIssueFor(plotIssues, plot))).length > 0 && <div className="layout-issue-count"><b>{Object.keys(plotIssues).length}</b> parcelas com ocorrências registradas e vinculadas à qualidade</div>}</div>
          <div className="layout-control"><h3>Camada e identificação</h3><div className="segmented layout-map-options"><button disabled={!isEditing} className={mapStyle === 'satellite' ? 'active' : ''} onClick={() => setAndDirty(() => setMapStyle('satellite'))}>Esri</button><button disabled={!isEditing} className={mapStyle === 'google' ? 'active' : ''} onClick={() => setAndDirty(() => setMapStyle('google'))}>Google Earth</button><button disabled={!isEditing} className={mapStyle === 'street' ? 'active' : ''} onClick={() => setAndDirty(() => setMapStyle('street'))}>Mapa</button></div><label className="layout-check"><input type="checkbox" disabled={!isEditing} checked={showPlotIds} onChange={(event) => setAndDirty(() => setShowPlotIds(event.target.checked))} />Exibir PlotID nas parcelas</label><small className="layout-help">O nome do ensaio permanece sempre identificado em sua primeira parcela.</small></div>
          <div className="layout-control"><h3>Ensaios no croqui</h3><div className="layout-legend editable">{trialIds.map((id) => <span key={id}><input type="checkbox" disabled={!isEditing} checked={trialVisibility[id] !== false} onChange={(event) => setAndDirty(() => setTrialVisibility({ ...trialVisibility, [id]: event.target.checked }))} aria-label={`Exibir ${trialName(id)}`} /><i style={{ background: colors[id] }} /><b>{id}</b><input type="text" disabled={!isEditing} value={trialLabels[id] ?? trials.find((trial) => trial.id === id)?.name ?? (id === 'PULV' ? 'Pista Pulverização' : '')} placeholder={`Nome do ensaio ${id}`} onChange={(event) => renameAllocation(id, event.target.value)} /></span>)}</div></div>
          <button className="primary-button wide" onClick={exportGeoJson}>↓ Exportar GeoJSON</button>

</details>
        </aside>
        <div className={movePending ? 'layout-map layout-preview-pending' : 'layout-map'}>
          <MapContainer key={location.id} center={center} zoom={19} minZoom={3} maxZoom={24} zoomSnap={.25} zoomDelta={.5} wheelPxPerZoomLevel={40} scrollWheelZoom doubleClickZoom boxZoom preferCanvas className="leaflet-map layout-leaflet">
            <ZoomTracker onZoom={setMapZoom} />
            <LayoutCenter center={center} dragging={movePending} />
            <FitLayoutBounds positions={polygons.map((polygon) => polygon.positions)} token={fitBoundsToken} />
            {mapStyle === 'satellite' && <TileLayer attribution="Tiles &copy; Esri" maxNativeZoom={19} maxZoom={24} url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />}
            {mapStyle === 'google' && <TileLayer attribution="Google" maxNativeZoom={22} maxZoom={24} url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}" />}
            {mapStyle === 'street' && <TileLayer attribution="&copy; OpenStreetMap" maxNativeZoom={19} maxZoom={24} url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />}
            {otherMapPolygons.map(({ mapId, mapName: otherName, areaType: otherType, plot, positions }) => <Polygon key={`other-${mapId}-${plot.plotId}-${plot.row}-${plot.col}`} positions={positions} pathOptions={{ color:'#426a58', weight:.5, fillColor:'#8ca89a', fillOpacity:.24 }}><Tooltip><b>Mapa já alocado: {otherName}</b><br />{otherType} · PlotID {plot.plotId}</Tooltip></Polygon>)}
            {isEditing && plots.length > 0 && <LayoutMovePreview key={activeMapId} center={center} silhouettes={silhouettes} onPending={setMovePending} onConfirm={(next) => { setCenter(next); setCenterInput(`${next[0].toFixed(6)}, ${next[1].toFixed(6)}`); setDirty(true); }} />}
            {parcelLayer}
          </MapContainer>
          <div className="layout-zoom-indicator">Zoom {mapZoom.toFixed(2)} / 24 · {savedLayouts.length - (savedSnapshot ? 1 : 0)} mapa(s) já alocado(s)</div><div className="layout-map-hint">{selectedPlot ? `Parcela ${selectedPlot.plotId} selecionada. Use o painel para registrar a ocorrência.` : isEditing ? 'Os mapas translúcidos já estão alocados. Posicione o novo mapa sem sobreposição.' : 'Clique em uma parcela para consultar seus dados e ocorrências.'}</div>
        </div>
      </div>
      <footer className="layout-save-toolbar"><div role={importError ? 'alert' : 'status'}>{importError || (movePending ? 'Confirme ou cancele a prévia de posição antes de salvar.' : isSaving ? 'Salvando mapa e planejamento…' : dirty ? 'Alterações ainda não salvas' : savedAt ? 'Mapa salvo' : 'Carregue o Excel, nomeie os ensaios e posicione o croqui.')}</div>{!readOnly && <div className="layout-save-actions"><button type="button" disabled={isSaving} onClick={() => { if (isEditing) { if (!dirty || window.confirm('Descartar as alterações deste mapa?')) restore(savedSnapshot); } else setIsEditing(true); }}>{isEditing ? 'Cancelar alterações' : 'Editar mapa'}</button><button type="button" className="layout-save" disabled={!isEditing || importing || isSaving || movePending} onClick={() => saveLayout(true)}>Salvar e carregar outro</button><button type="button" className="layout-save" disabled={!isEditing || importing || isSaving || movePending} onClick={() => saveLayout()}>Salvar mapa</button></div>}</footer>
    </section>
  </div>;
}
