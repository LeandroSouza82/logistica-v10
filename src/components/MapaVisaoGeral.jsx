import React, { useEffect, useRef } from 'react';
import { GoogleMap, Marker } from '@react-google-maps/api';
import { useMotoristasContext } from '../contexts/MotoristasContext';

const centroPadrao = { lat: -27.6608, lng: -48.7087 };

export default function MapaVisaoGeral({ visible }) {
    const mapRef = useRef(null);
    const { motoristas, activeDriver, activeMarker, isDriverActive } = useMotoristasContext();

    useEffect(() => {
        if (!mapRef.current) return;
        if (activeDriver && activeDriver.lat != null && activeDriver.lng != null) {
            try {
                mapRef.current.panTo({ lat: Number(activeDriver.lat), lng: Number(activeDriver.lng) });
                mapRef.current.setZoom(15);
            } catch (e) { /* ignore */ }
        }
    }, [activeDriver?.id, activeDriver?.lat, activeDriver?.lng]);

    return (
        <div className={`visao-geral-map ${!visible ? 'hidden' : ''}`} style={{ width: '100%', height: 420 }}>
            <GoogleMap
                key={activeDriver?.id || 'mapa-global'}
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={activeDriver && activeDriver.lat != null && activeDriver.lng != null ? { lat: Number(activeDriver.lat), lng: Number(activeDriver.lng) } : centroPadrao}
                zoom={activeDriver ? 15 : 13}
                onLoad={(mapInstance) => { mapRef.current = mapInstance; }}
                onUnmount={() => (mapRef.current = null)}
            >
                {motoristas.filter(m => m.lat != null && m.lng != null && isDriverActive(m)).map(m => (
                    <Marker
                        key={`marker-${m.id}-${m.lat}-${m.lng}`}
                        position={{ lat: Number(m.lat), lng: Number(m.lng) }}
                        icon={{ url: 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="18" fill="#3b82f6"/></svg>`) }}
                    />
                ))}

                {activeMarker && activeMarker.lat != null && activeMarker.lng != null && (
                    <Marker
                        key={`active-marker-${activeMarker.id}-${activeMarker.lat}-${activeMarker.lng}`}
                        position={{ lat: Number(activeMarker.lat), lng: Number(activeMarker.lng) }}
                        icon={{ url: 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><circle cx="24" cy="24" r="20" fill="#3b82f6"/><text x="24" y="29" font-size="16" text-anchor="middle" fill="#fff">🏍️</text></svg>`) }}
                    />
                )}
            </GoogleMap>
        </div>
    );
}