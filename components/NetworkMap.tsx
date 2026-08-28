'use client';

import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';

export type NetworkLocation = {
  id: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  trials: number;
  plots: number;
  status: 'ok' | 'attention' | 'late';
};

const statusColors = { ok: '#4d885e', attention: '#d9a72f', late: '#c95b45' };
const statusLabels = { ok: 'Em dia', attention: 'Atenção', late: 'Atrasado' };

export default function NetworkMap({
  locations,
  compact = false,
  onSelect,
}: {
  locations: NetworkLocation[];
  compact?: boolean;
  onSelect?: (id: string) => void;
}) {
  return (
    <MapContainer
      center={[-29.63, -53.05]}
      zoom={compact ? 6 : 7}
      scrollWheelZoom={!compact}
      className={compact ? 'leaflet-map compact' : 'leaflet-map'}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {locations.map((location) => (
        <CircleMarker
          key={location.id}
          center={[location.lat, location.lng]}
          radius={Math.max(9, Math.min(18, 7 + location.plots / 24))}
          pathOptions={{
            color: '#fffdf8',
            weight: 3,
            fillColor: statusColors[location.status],
            fillOpacity: 0.96,
          }}
          eventHandlers={{ click: () => onSelect?.(location.id) }}
        >
          <Popup>
            <div className="map-popup">
              <span className={`status-dot ${location.status}`} />
              <strong>{location.name}</strong>
              <span>{location.city} · RS</span>
              <div><b>{location.trials}</b> ensaios · <b>{location.plots}</b> parcelas</div>
              <small>{statusLabels[location.status]}</small>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
