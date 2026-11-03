'use client';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { canvas, divIcon, DomEvent } from 'leaflet';
import { Marker, Polygon, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { translateSilhouette } from '../lib/layoutGeometry';
type Point = [number, number];

/** Pointer preview is isolated from the committed parcel layer. First click picks up; second fixes. */
export default memo(function LayoutMovePreview({ center, silhouettes, onPending, onConfirm }: { center: Point; silhouettes: Array<{ id: string; positions: Point[]; color: string }>; onPending: (value: boolean) => void; onConfirm: (center: Point) => void }) {
  const [target, setTarget] = useState<Point | null>(null);
  const active = useRef(false), position = useRef<Point>(center), frame = useRef<number | null>(null);
  const controls = useRef<HTMLDivElement>(null);
  const map = useMap();
  const renderer = useMemo(() => canvas({ padding: .5, pane: 'layout-preview' }), []);
  const cancel = () => { active.current = false; setTarget(null); onPending(false); };
  const fix = (point: Point) => { active.current = false; position.current = point; setTarget(null); onPending(false); onConfirm(point); };
  useEffect(() => { const pane = map.getPane('layout-preview') ?? map.createPane('layout-preview'); pane.style.pointerEvents = 'none'; pane.style.zIndex = '450'; }, [map]);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); renderer.remove(); }, [renderer]);
  useEffect(() => { active.current = false; position.current = center; setTarget(null); onPending(false); }, [center[0], center[1], onPending]);
  useEffect(() => { if (controls.current) DomEvent.disableClickPropagation(controls.current); }, [Boolean(target)]);
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && active.current) { event.preventDefault(); cancel(); } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [onPending]);
  const follow = (point: Point) => { position.current = point; if (frame.current === null) frame.current = requestAnimationFrame(() => { frame.current = null; if (active.current) setTarget(position.current); }); };
  useMapEvents({
    mousemove(event) {
      if (!active.current || (event.originalEvent.target as Element | null)?.closest?.('.layout-move-confirm')) return;
      follow([event.latlng.lat, event.latlng.lng]);
    },
    click(event) { if (active.current) fix([event.latlng.lat, event.latlng.lng]); },
  });
  return <>{target && silhouettes.map((outline) => <Polygon key={outline.id} renderer={renderer} interactive={false} positions={translateSilhouette(outline.positions, center, target)} pathOptions={{ color: outline.color, weight: 2, dashArray: '6 4', fillColor: outline.color, fillOpacity: .5 }} />)}<Marker position={target ?? center} opacity={.5} bubblingMouseEvents={false} icon={divIcon({ className: 'layout-anchor-icon', html: '<span>✥</span>', iconSize: [32, 32], iconAnchor: [16, 16] })} eventHandlers={{ mousemove: (event) => { if (active.current) follow([event.latlng.lat, event.latlng.lng]); }, click: (event) => { if (active.current) fix([event.latlng.lat, event.latlng.lng]); else { position.current = center; active.current = true; setTarget(center); onPending(true); } } }}><Tooltip>{target ? 'Clique para fixar o croqui' : 'Clique para mover o croqui'}</Tooltip></Marker>{target && <div ref={controls} className="layout-move-confirm" role="group" aria-label="Posicionar croqui"><span>Mova o cursor e clique no mapa para fixar · Esc cancela</span><button type="button" onClick={cancel}>Cancelar movimento</button><button type="button" onClick={() => fix(position.current)}>Fixar aqui</button></div>}</>;
});
