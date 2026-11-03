'use client';
import { memo, useEffect, useMemo, useState } from 'react';
import { canvas, divIcon, type Marker as LeafletMarker, type LeafletEvent } from 'leaflet';
import { Marker, Polygon, Tooltip, useMap } from 'react-leaflet';
import { translateSilhouette } from '../lib/layoutGeometry';
type Point = [number, number];

/** Drag state is isolated here: the parcel layer is not rerendered during movement. */
export default memo(function LayoutMovePreview({ center, silhouettes, onPending, onConfirm }: { center: Point; silhouettes: Array<{ id: string; positions: Point[]; color: string }>; onPending: (value: boolean) => void; onConfirm: (center: Point) => void }) {
  const [target, setTarget] = useState<Point | null>(null);
  const map = useMap();
  useEffect(() => { const pane = map.getPane('layout-preview') ?? map.createPane('layout-preview'); pane.style.pointerEvents = 'none'; pane.style.zIndex = '450'; }, [map]);
  // A separate canvas prevents preview animation from redrawing every committed parcel.
  const renderer = useMemo(() => canvas({ padding: .5, pane: 'layout-preview' }), []);
  useEffect(() => () => { renderer.remove(); }, [renderer]);
  useEffect(() => { setTarget(null); onPending(false); }, [center[0], center[1], onPending]);
  const move = (event: LeafletEvent) => { const point = (event.target as LeafletMarker).getLatLng(); setTarget([point.lat, point.lng]); };
  return <>{target && silhouettes.map((outline) => <Polygon key={outline.id} renderer={renderer} interactive={false} positions={translateSilhouette(outline.positions, center, target)} pathOptions={{ color: outline.color, weight: 2, dashArray: '6 4', fillColor: outline.color, fillOpacity: .5 }} />)}<Marker position={target ?? center} draggable opacity={.5} icon={divIcon({ className: 'layout-anchor-icon', html: '<span>✥</span>', iconSize: [32, 32], iconAnchor: [16, 16] })} eventHandlers={{ dragstart: () => { onPending(true); setTarget(center); }, drag: move, dragend: move }}><Tooltip>Arraste para visualizar a nova posição</Tooltip></Marker>{target && <div className="layout-move-confirm" role="group" aria-label="Confirmar posição do mapa" onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}><span>Prévia da silhueta · 50% de transparência</span><button type="button" onClick={() => { setTarget(null); onPending(false); }}>Cancelar movimento</button><button type="button" onClick={() => { onConfirm(target); setTarget(null); onPending(false); }}>Confirmar posição</button></div>}</>;
});
