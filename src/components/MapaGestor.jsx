import React, { useState, useCallback, useEffect } from 'react';
import { GoogleMap, Marker, Polyline } from '@react-google-maps/api';

const centroPalhoca = { lat: -27.6438, lng: -48.6674 };

function MapaGestor({ pedidosNoRascunho = [], posicaoMoto = null, height = 500, isLoaded = true }) {
    const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!googleMapsApiKey) {
        return <div style={{ color: '#f87171', padding: 12 }}>Chave do Google Maps não configurada. Configure a variável `VITE_GOOGLE_MAPS_API_KEY`.</div>;
    }
    const [map, setMap] = useState(null);

    const onLoad = useCallback((mapInstance) => setMap(mapInstance), []);

    // Ajusta o zoom automaticamente para mostrar todos os pinos da região
    useEffect(() => {
        if (map && (pedidosNoRascunho.length > 0 || posicaoMoto)) {
            try {
                const bounds = new window.google.maps.LatLngBounds();
                pedidosNoRascunho.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
                if (posicaoMoto) bounds.extend(posicaoMoto);
                map.fitBounds(bounds);
            } catch (e) {
                console.warn('Falha ao ajustar bounds no mapa:', e);
            }
        }
    }, [map, pedidosNoRascunho, posicaoMoto]);

    const rotaPath = posicaoMoto
        ? [posicaoMoto, ...pedidosNoRascunho.map((p) => ({ lat: p.lat, lng: p.lng }))]
        : pedidosNoRascunho.map((p) => ({ lat: p.lat, lng: p.lng }));

    if (!isLoaded) {
        return <div style={{ color: '#94a3b8', padding: 10 }}>Carregando mapa...</div>;
    }

    return (
        <GoogleMap
            mapContainerStyle={{ width: '100%', height }}
            center={posicaoMoto || centroPalhoca}
            zoom={12}
            onLoad={onLoad}
            options={{ disableDefaultUI: true, zoomControl: true }}
        >
            {/* Pino da Moto (Onde o motorista está agora) */}
            {posicaoMoto && (
                <Marker
                    position={posicaoMoto}
                    // Ícone de moto dos KML shapes do Google
                    icon="https://maps.google.com/mapfiles/kml/shapes/motorcycling.png"
                    title="Motorista Atual"
                />
            )}

            {/* Pinos dos Pedidos (O que o gestor está adicionando) */}
            {pedidosNoRascunho.map((pedido, index) => (
                <Marker
                    key={pedido.id ?? index}
                    position={{ lat: pedido.lat, lng: pedido.lng }}
                    label={`${index + 1}`}
                    title={pedido.endereco}
                />
            ))}

            {/* Linha da Rota Otimizada ligando os pontos */}
            {rotaPath.length > 1 && (
                <Polyline path={rotaPath} options={{ strokeColor: '#FF0000', strokeWeight: 2 }} />
            )}
        </GoogleMap>
    );
}

export default MapaGestor;
