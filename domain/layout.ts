export type LayoutPlot = { plotId: string; row: number; col: number; genotype: string; genealogy?: string; trialId: string; sourceTrialId?: string; allocationId?: string; excelColor?: string };

export type MapStyle = 'satellite' | 'google' | 'street';

export type TrialAllocation = { id: string; code: string; name: string; startPlotId: string; endPlotId: string; color: string; plotCount: number };

export type IssueKind = 'Observação' | 'Alerta' | 'Troca de genótipo' | 'Linha entupida' | 'Falha de semeadura' | 'Passada de pulverizador' | 'Fitotoxidez' | 'Parcela perdida' | 'Outro';

export type PlotIssue = { kind: IssueKind; note: string; replacementGenotype?: string; updatedAt: string };

export type LayoutSettings = { generatedFromList?: boolean; widthHorizontal?: boolean; plotLength: number; plotWidth: number; gapLength: number; gapWidth: number; rotation: number; flipX: boolean; flipY: boolean; mapStyle: MapStyle; showPlotIds: boolean; center: [number, number]; trialLabels: Record<string, string>; trialVisibility: Record<string, boolean> };

export type AreaMetadata = { city: string; areaType: string; plannedSowingDate: string; detectionThreshold: number; mapId?: string; mapName?: string };

export type LayoutSnapshot = { plots: LayoutPlot[] | null; fileName: string; savedAt: string; settings?: Partial<LayoutSettings>; allocations?: TrialAllocation[]; plotIssues?: Record<string, PlotIssue>; metadata?: AreaMetadata };

export type LayoutFinalization = { storageUpdates?: Record<string, string | null>; continueEditing?: boolean; mapId: string; mapName: string; location: { id: string; name: string; city: string; lat: number; lng: number; region?: string; rha?: string }; areaType: string; plannedSowingDate: string; fileName: string; allocations: Array<TrialAllocation & { firstPlotCoordinate: [number, number] }>; plots: LayoutPlot[]; plotIssues: Record<string, PlotIssue> };

