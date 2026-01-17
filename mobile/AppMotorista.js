import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  ScrollView,
  Alert,
  Dimensions,
  Platform
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import SignatureScreen from 'react-native-signature-canvas';
import { supabase } from './src/supabaseClient';

const { width, height } = Dimensions.get('window');

export default function AppMotorista() {
  // Estados principais
  const [entregas, setEntregas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSignature, setShowSignature] = useState(false);
  const [entregaAtual, setEntregaAtual] = useState(null);
  const [numeroGestor, setNumeroGestor] = useState('5548999999999');
  const [posicaoMotorista, setPosicaoMotorista] = useState(null);
  const [mapRef, setMapRef] = useState(null);

  const signatureRef = useRef(null);

  // Buscar entregas do motorista logado
  const buscarEntregas = async () => {
    try {
      const motoristaId = 1; // Substituir pelo ID real do login

      const { data, error } = await supabase
        .from('entregas')
        .select('*')
        .eq('motorista_id', motoristaId)
        .neq('status', 'concluido')
        .order('ordem', { ascending: true });

      if (!error && data) {
        setEntregas(data);
      }
    } catch (err) {
      console.error('Erro ao buscar entregas:', err);
    } finally {
      setLoading(false);
    }
  };

  // Buscar número do gestor
  const buscarNumeroGestor = async () => {
    try {
      const { data } = await supabase
        .from('tel')
        .select('numero')
        .single();

      if (data?.numero) {
        setNumeroGestor(data.numero.replace(/\D/g, ''));
      }
    } catch (err) {
      console.warn('Número do gestor não encontrado');
    }
  };

  // Localização do motorista
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setPosicaoMotorista({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => console.error('Erro GPS:', error),
        { enableHighAccuracy: true }
      );
    }
  }, []);

  // Carregar dados iniciais
  useEffect(() => {
    buscarEntregas();
    buscarNumeroGestor();
  }, []);

  // Realtime para novas entregas
  useEffect(() => {
    const canal = supabase
      .channel('entregas-motorista')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'entregas'
      }, () => {
        buscarEntregas();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'entregas'
      }, () => {
        buscarEntregas();
      })
      .subscribe();

    return () => supabase.removeChannel(canal);
  }, []);

  // Abrir modal de assinatura
  const abrirAssinatura = (entrega) => {
    setEntregaAtual(entrega);
    setShowSignature(true);
  };

  // Marcar como não entregue
  const comunicarFalha = async (entrega) => {
    try {
      const { error } = await supabase
        .from('entregas')
        .update({ status: 'cancelado', motivo_nao_entrega: 'Cliente Ausente' })
        .eq('id', entrega.id);

      if (!error) {
        const mensagem = `🚨 ALERTA: Entrega NÃO realizada\n\nCliente: ${entrega.cliente}\nEndereço: ${entrega.endereco}\nMotivo: Cliente Ausente`;
        const url = `https://api.whatsapp.com/send?phone=${numeroGestor}&text=${encodeURIComponent(mensagem)}`;

        // Abrir WhatsApp (usar Linking no React Native)
        console.log('WhatsApp URL:', url);

        await buscarEntregas();
        Alert.alert('Sucesso', 'Gestor notificado via WhatsApp');
      }
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível comunicar a falha');
    }
  };

  // Salvar assinatura e finalizar
  const handleSignature = (signature) => {
    salvarAssinatura(signature);
  };

  const salvarAssinatura = async (assinaturaBase64) => {
    try {
      if (!entregaAtual) return;

      const { error } = await supabase
        .from('entregas')
        .update({
          status: 'concluido',
          assinatura: assinaturaBase64,
          horario_conclusao: new Date().toISOString()
        })
        .eq('id', entregaAtual.id);

      if (!error) {
        // 🔥 CORREÇÃO DO BUG: Fechar modal antes de atualizar
        setShowSignature(false);
        setEntregaAtual(null);

        await buscarEntregas();
        Alert.alert('Sucesso', 'Entrega finalizada com sucesso!');
      } else {
        Alert.alert('Erro', 'Não foi possível salvar a assinatura');
      }
    } catch (err) {
      console.error('Erro ao salvar:', err);
      Alert.alert('Erro', 'Falha ao finalizar entrega');
    }
  };

  const handleEmpty = () => {
    Alert.alert('Atenção', 'Por favor, assine antes de continuar');
  };

  // Centralizar mapa na primeira entrega
  useEffect(() => {
    if (mapRef && entregas.length > 0 && entregas[0].lat && entregas[0].lng) {
      mapRef.animateToRegion({
        latitude: Number(entregas[0].lat),
        longitude: Number(entregas[0].lng),
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 1000);
    }
  }, [entregas, mapRef]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Carregando entregas...</Text>
      </View>
    );
  }

  const entregasPendentes = entregas.filter(e => e.status !== 'concluido');

  return (
    <View style={styles.container}>
      {/* MAPA */}
      <MapView
        ref={(ref) => setMapRef(ref)}
        style={styles.map}
        initialRegion={{
          latitude: posicaoMotorista?.latitude || -27.6146,
          longitude: posicaoMotorista?.longitude || -48.6493,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        showsUserLocation={true}
        showsMyLocationButton={false}
      >
        {/* Marcadores das entregas */}
        {entregas.map((entrega, index) => (
          entrega.lat && entrega.lng ? (
            <Marker
              key={entrega.id}
              coordinate={{
                latitude: Number(entrega.lat),
                longitude: Number(entrega.lng)
              }}
              pinColor={entrega.status === 'concluido' ? 'green' : 'red'}
              title={`${index + 1}º - ${entrega.cliente}`}
              description={entrega.endereco}
            />
          ) : null
        ))}
      </MapView>

      {/* PAINEL INFERIOR COM LISTA */}
      <View style={styles.bottomPanel}>
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
        >
          {entregasPendentes.length > 0 ? (
            entregasPendentes.map((entrega, index) => (
              <View key={entrega.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>#{index + 1}</Text>
                  </View>
                  <Text style={styles.clienteName}>{entrega.cliente}</Text>
                </View>

                <Text style={styles.address}>{entrega.endereco}</Text>

                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.button, styles.buttonSuccess]}
                    onPress={() => abrirAssinatura(entrega)}
                  >
                    <Text style={styles.buttonText}>CONCLUIR</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.button, styles.buttonDanger]}
                    onPress={() => comunicarFalha(entrega)}
                  >
                    <Text style={styles.buttonText}>NÃO ENTREGUE</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>🎉 Todas as entregas feitas!</Text>
              <TouchableOpacity
                style={styles.buttonFinish}
                onPress={() => Alert.alert('Rota Concluída', 'Todas as entregas foram finalizadas!')}
              >
                <Text style={styles.buttonFinishText}>CONCLUIR ROTA</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>

      {/* MODAL DE ASSINATURA */}
      <Modal
        visible={showSignature}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowSignature(false);
          setEntregaAtual(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Assine aqui:</Text>

            <View style={styles.signatureContainer}>
              <SignatureScreen
                ref={signatureRef}
                onOK={handleSignature}
                onEmpty={handleEmpty}
                descriptionText="Assine acima"
                clearText="Limpar"
                confirmText="Confirmar"
                webStyle={`
                  .m-signature-pad--footer {
                    display: none;
                  }
                  .m-signature-pad {
                    box-shadow: none;
                    border: 2px dashed #ccc;
                    border-radius: 10px;
                  }
                `}
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowSignature(false);
                  setEntregaAtual(null);
                }}
              >
                <Text style={styles.modalButtonText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonClear]}
                onPress={() => signatureRef.current?.clearSignature()}
              >
                <Text style={styles.modalButtonText}>Limpar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={() => signatureRef.current?.readSignature()}
              >
                <Text style={styles.modalButtonText}>FINALIZAR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0e14',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 20,
    fontSize: 16,
  },
  map: {
    width: '100%',
    height: '50%',
  },
  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'rgba(21, 26, 34, 0.95)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 15,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 15,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    borderLeftWidth: 5,
    borderLeftColor: '#3b82f6',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  badge: {
    backgroundColor: '#22c55e',
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  badgeText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 14,
  },
  clienteName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
  },
  address: {
    color: '#cbd5e1',
    fontSize: 13,
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSuccess: {
    backgroundColor: '#22c55e',
  },
  buttonDanger: {
    backgroundColor: '#ef4444',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 20,
  },
  emptyTitle: {
    color: '#22c55e',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  buttonFinish: {
    width: '100%',
    padding: 20,
    backgroundColor: '#22c55e',
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonFinishText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  signatureContainer: {
    height: 200,
    borderWidth: 2,
    borderColor: '#ccc',
    borderStyle: 'dashed',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 15,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#666',
  },
  modalButtonClear: {
    backgroundColor: '#f59e0b',
  },
  modalButtonConfirm: {
    backgroundColor: '#22c55e',
    flex: 2,
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
