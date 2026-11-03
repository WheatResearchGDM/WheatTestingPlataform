'use client';
import { useEffect } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
type Stop = { id: string; name: string; lat: number; lng: number };
function Bounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => { if (positions.length) map.fitBounds(positions, { padding: [30, 30], maxZoom: 13 }); }, [map, positions]);
  return null;
}
export default function RoadRouteMap({ stops, origin, coordinates, onSelect, selected }: { stops: Stop[]; origin?: { lat: number; lng: number }; coordinates: [number, number][]; selected: string[]; onSelect: (id: string) => void }) {
  const positions: [number, number][] = [...stops.map((stop): [number, number] => [stop.lat, stop.lng]), ...(origin ? [[origin.lat, origin.lng] as [number, number]] : [])];
  return <MapContainer className="road-route-map" center={positions[0] ?? [-28.2, -52.4]} zoom={9} scrollWheelZoom={false}><TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors' /><Bounds positions={coordinates.length ? coordinates : positions} />{coordinates.length > 0 && <Polyline positions={coordinates} pathOptions={{ color: '#287451', weight: 5 }} />}{stops.map((stop) => <CircleMarker key={stop.id} center={[stop.lat, stop.lng]} radius={selected.includes(stop.id) ? 12 : 8} pathOptions={{ color: selected.includes(stop.id) ? '#185d3e' : '#65778a', fillOpacity: .9 }} eventHandlers={{ click: () => onSelect(stop.id) }}><Tooltip permanent direction="top">{selected.includes(stop.id) ? `${selected.indexOf(stop.id) + 1}. ` : ''}{stop.name}</Tooltip></CircleMarker>)}{origin && <CircleMarker center={[origin.lat, origin.lng]} radius={5} pathOptions={{ color: '#2475c8' }}><Tooltip>Saída</Tooltip></CircleMarker>}</MapContainer>;
}
