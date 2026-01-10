import React, { useEffect } from 'react';
import { useGoogleMap } from '@react-google-maps/api';

// Creates a google.maps.marker.AdvancedMarkerElement when available
export default function AdvancedMarker({ position, icon, title }) {
    const map = useGoogleMap();

    useEffect(() => {
        if (!map) return;
        const g = typeof window !== 'undefined' ? window.google : null;
        if (!g || !g.maps || !g.maps.marker || !g.maps.marker.AdvancedMarkerElement) return;

        const marker = new g.maps.marker.AdvancedMarkerElement({
            map,
            position,
            title,
            icon: icon ? { url: icon } : undefined,
        });

        return () => {
            try {
                marker.map = null;
            } catch (e) { /* ignore */ }
        };
    }, [map, position, icon, title]);

    return null;
}
