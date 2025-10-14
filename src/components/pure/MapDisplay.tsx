import React from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Corregir el problema de los iconos de Leaflet
// Esto es necesario porque Leaflet espera que las imágenes estén en una ubicación específica
const icon = L.icon({
  iconUrl: '/images/marker-icon.png',
  iconRetinaUrl: '/images/marker-icon-2x.png',
  shadowUrl: '/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

interface MapDisplayProps {
  position: {
    lat: number;
    lng: number;
  };
  readOnly?: boolean;
}

const MapDisplay: React.FC<MapDisplayProps> = ({ position, readOnly = true }) => {
  return (
    <MapContainer
      center={[position.lat, position.lng]}
      zoom={15}
      style={{ height: '100%', width: '100%', borderRadius: '8px' }}
      scrollWheelZoom={!readOnly}
      dragging={!readOnly}
      zoomControl={!readOnly}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[position.lat, position.lng]} icon={icon} />
    </MapContainer>
  );
};

export default MapDisplay;