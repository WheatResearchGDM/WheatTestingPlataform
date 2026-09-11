'use client';

import { useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from 'react-leaflet';

export type NetworkLocation = {
  id: string;
  name: string;
  city: string;
  region: string;
  lat: number;
  lng: number;
  trials: number;
  plots: number;
  status: 'ok' | 'attention' | 'late';
  qualityTone?: 'excellent' | 'adequate' | 'attention' | 'critical' | 'neutral';
  qualityScore?: number;
  plantedPercent?: number;
  phenologicalStage?: string;
  alertCount?: number;
};

const statusColors = { ok: '#4d885e', attention: '#d9a72f', late: '#c95b45' };
const statusLabels = { ok: 'Em dia', attention: 'Atenção', late: 'Atrasado' };
const qualityColors = { excellent: '#24744c', adequate: '#6f953d', attention: '#d19a24', critical: '#b84d3d', neutral: '#98a19b' };
const qualityLabels = { excellent: 'Excelente', adequate: 'Adequado', attention: 'Atenção', critical: 'Crítico', neutral: 'Sem dados' };

export default function NetworkMap({
  locations,
  compact = false,
  onSelect,
}: {
  locations: NetworkLocation[];
  compact?: boolean;
  onSelect?: (id: string) => void;
}) {
  const [mapStyle, setMapStyle] = useState<'satellite' | 'street'>('satellite');

  return (
    <div className="network-map-shell">
      <div className="map-style-switch" aria-label="Estilo de visualização do mapa">
        <button className={mapStyle === 'satellite' ? 'active' : ''} onClick={() => setMapStyle('satellite')} type="button">Satélite</button>
        <button className={mapStyle === 'street' ? 'active' : ''} onClick={() => setMapStyle('street')} type="button">Mapa</button>
      </div>
      <MapContainer
      center={[-29.63, -53.05]}
      zoom={compact ? 6 : 7}
      scrollWheelZoom={!compact}
      className={compact ? 'leaflet-map compact' : 'leaflet-map'}
    >
      {mapStyle === 'satellite' ? <TileLayer
        key="satellite"
        attribution='Tiles &copy; Esri'
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      /> : <TileLayer
        key="street"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />}
      {locations.map((location) => (
        <CircleMarker
          key={location.id}
          center={[location.lat, location.lng]}
          radius={Math.max(9, Math.min(18, 7 + location.plots / 24))}
          pathOptions={{
            color: '#fffdf8',
            weight: 3,
            fillColor: location.qualityTone ? qualityColors[location.qualityTone] : statusColors[location.status],
            fillOpacity: 0.96,
          }}
          eventHandlers={{
            click: () => onSelect?.(location.id),
            mouseover: (event) => event.target.openPopup(),
            mouseout: (event) => event.target.closePopup(),
          }}
        >
          <Tooltip permanent direction="top" offset={[0, -10]} opacity={1} className="map-location-label">
            <b>{location.name.replace(/\s*-?\s*RS$/i, '')}</b>
            <small>{location.trials} ensaios</small>
          </Tooltip>
          <Popup>
            <div className="map-popup">
              <span className={`status-dot ${location.qualityTone ?? location.status}`} />
              <strong>{location.name}</strong>
              <span>{location.city} · RS</span>
              <div><b>{location.trials}</b> ensaios · <b>{location.plots}</b> parcelas</div>
              {location.plantedPercent !== undefined && <div><b>{location.plantedPercent}%</b> semeados · {location.phenologicalStage}</div>}
              {location.alertCount !== undefined && <div><b>{location.alertCount}</b> alerta(s) de campo</div>}
              <small>{location.qualityTone === 'neutral' ? 'Sem ensaios avaliados' : location.qualityTone ? `Qualidade ${qualityLabels[location.qualityTone]} · ${location.qualityScore ?? 0}/100` : statusLabels[location.status]}</small>
            </div>
          </Popup>
        </CircleMarker>
      ))}
      </MapContainer>
    </div>
  );
}
