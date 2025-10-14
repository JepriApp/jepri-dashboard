"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export const SANTA_MARTA_LOCATION_OBJECT = {
  lat: 11.225966,
  lng: -74.190294,
};
interface Position {
  lat: number;
  lng: number;
}
const SANTA_MARTA_LOCATION_TUPLE: [number, number] = [11.225966, -74.190294];
const DEFAULT_CONTAINER_WIDTH = 300;
const DEFAULT_CONTAINER_HEIGHT = 300;

function DraggableMarker({
  onChange,
  afterChange,
  initialPosition = SANTA_MARTA_LOCATION_OBJECT,
}: {
  onChange?: (pos: Position) => void;
  afterChange?: () => void;
  initialPosition?: Position;
}) {
  const [position, setPosition] = useState(initialPosition);
  const markerRef = useRef<L.Marker>(null);
  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker != null) {
          const newPos = marker.getLatLng();
          setPosition(newPos);
          onChange?.(newPos);
          if (afterChange) {
            afterChange();
          }
        }
      },
    }),
    [afterChange, onChange]
  );

  return (
    <Marker
      draggable={true}
      eventHandlers={eventHandlers}
      position={position}
      ref={markerRef}
    >
      <Popup minWidth={90}>
        <span>Esta es la ubicación de tu negocio</span>
      </Popup>
    </Marker>
  );
}

const FullscreenControl = (props: any) => {
  const map = props.map;
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const container = map.getContainer();

      try {
        if (!isFullscreen) {
          await container.requestFullscreen();
          setIsFullscreen(true);
        } else {
          await document.exitFullscreen();
          setIsFullscreen(false);
        }
      } catch (error) {
        console.error("Error toggling fullscreen:", error);
      }
    },
    [isFullscreen, map]
  );

  useEffect(() => {
    const handleFullscreenChange = (e: Event) => {
      e.stopPropagation();
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  return (
    <div
      className="leaflet-control-container"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="leaflet-top leaflet-right">
        <div className="leaflet-control-fullscreen leaflet-bar leaflet-control">
          <button
            type="button"
            onClick={toggleFullscreen}
            style={{
              width: "30px",
              height: "30px",
              backgroundColor: "white",
              border: "2px solid rgba(0,0,0,0.2)",
              borderRadius: "4px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {isFullscreen ? "⤓" : "⤢"}
          </button>
        </div>
      </div>
    </div>
  );
};

const LocationPicker = (props: {
  onChange?: (position: Position) => void;
  initialPosition?: Position;
  afterChange?: () => void;
  width?: number | string;
  height?: number | string;
}) => {
  const [map, setMap] = useState<L.Map | null>(null);
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconUrl: "/images/marker-icon.png",
      shadowUrl: "/images/marker-shadow.png",
      iconRetinaUrl: "/images/marker-icon-2x.png",
    });
  }, []);

  return (
    <MapContainer
      ref={setMap}
      center={props.initialPosition||SANTA_MARTA_LOCATION_TUPLE}
      zoom={13}
      scrollWheelZoom={true}
      style={{
        height: DEFAULT_CONTAINER_HEIGHT || props.height,
        width: DEFAULT_CONTAINER_WIDTH || props.width,
      }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <DraggableMarker
        onChange={props.onChange}
        initialPosition={props.initialPosition}
        afterChange={props.afterChange}
      />
      <FullscreenControl map={map} />
    </MapContainer>
  );
};

export default LocationPicker;
