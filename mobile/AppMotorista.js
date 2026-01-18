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

      // CORREÇÃO: Usando apenas colunas existentes no Supabase
      const { data, error } = await supabase
        .from('entregas')
        .select('id, status, cliente, endereco, motorista_id, observacoes, tipo, ordem, lat, lng, created_at')
        .eq('motorista_id', motoristaId)
        .neq('status', 'concluido')
        .order('ordem', { ascending: true });

      if (!error && data) {
        // 🔍 LOG DIAGNÓSTICO: Verificar dados recebidos do Supabase
        console.log('📊 DADOS DO SUPABASE:', JSON.stringify(data, null, 2));
        data.forEach(item => {
          console.log('ID:' + item.id + ' | STATUS:' + item.status + ' | TIPO_DO_BANCO:' + item.tipo);
        });
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

  // Helper: Determina cor e label baseado no tipo (comparação exata com banco)
  const getTipoStyle = (tipo) => {
    // Log de alerta para tipos vazios
    if (!tipo || tipo.trim() === '') {
      console.log('⚠️ Alerta: Pedido está sem tipo definido no banco');
    }

    const tipoTrim = String(tipo || '').trim();

    // Comparação EXATA com 'Entrega' (E maiúsculo como está no banco)
    if (tipoTrim === 'Entrega') {
      return {
        corFundo: '#E8F5E9',      // Verde Claro (fundo do card)
        corBorda: '#2E7D32',      // Verde Escuro (borda)
        corBadge: '#2E7D32',      // Verde Escuro (badge)
        label: '🚚 ENTREGA',
        icone: '🚚'
      };
    }

    // Comparação EXATA com 'Recolha' (como está no banco)
    if (tipoTrim === 'Recolha') {
      return {
        corFundo: '#E3F2FD',      // Azul Claro (fundo do card)
        corBorda: '#1565C0',      // Azul Escuro (borda)
        corBadge: '#1565C0',      // Azul Escuro (badge)
        label: '📦 RECOLHA',
        icone: '📦'
      };
    }

    // Padrão (Outros)
    return {
      corFundo: '#F5F5F5',        // Cinza Claro
      corBorda: '#616161',        // Cinza Escuro
      corBadge: '#616161',        // Cinza Escuro
      label: '📋 OUTROS',
      icone: '📋'
    };
  };

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
        {/* Contadores no Topo */}
        <View style={styles.contadoresContainer}>
          <View style={styles.contadorBox}>
            <Text style={styles.contadorNumero}>{entregas.filter(e => e.tipo === 'Entrega' && e.status !== 'concluido').length}</Text>
            <Text style={styles.contadorLabel}>🚚 Entregas</Text>
          </View>
          <View style={styles.contadorBox}>
            <Text style={styles.contadorNumero}>{entregas.filter(e => e.tipo === 'Recolha' && e.status !== 'concluido').length}</Text>
            <Text style={styles.contadorLabel}>📦 Recolhas</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
        >
          {entregasPendentes.length > 0 ? (
            entregasPendentes.map((entrega, index) => {
              // 🔍 DIAGNÓSTICO COMPLETO
              const tipoTratado = entrega.tipo ? String(entrega.tipo).toLowerCase().trim() : 'vazio';
              console.log('🔎 RENDERIZANDO ID:' + entrega.id + ' | STATUS:' + entrega.status + ' | TIPO_DO_BANCO:' + entrega.tipo + ' | TIPO_TRATADO:' + tipoTratado);

              let corFundo = '#E0E0E0'; // Cinza padrão
              let corBorda = '#9E9E9E';
              let labelTipo = entrega.tipo || 'TIPO_VAZIO';

              if (tipoTratado.includes('entrega')) {
                corFundo = '#C8E6C9'; // Verde
                corBorda = '#2E7D32';
                labelTipo = '🚚 ENTREGA';
              } else if (tipoTratado.includes('recolha') || tipoTratado.includes('coleta')) {
                corFundo = '#BBDEFB'; // Azul
                corBorda = '#1565C0';
                labelTipo = '📦 RECOLHA';
              } else {
                corFundo = '#FFF9C4'; // AMARELO (sinal de problema!)
                corBorda = '#F57C00';
                labelTipo = entrega.tipo || 'TIPO_VAZIO';
              }

              return (
                <View key={entrega.id} style={[
                  styles.card,
                  {
                    backgroundColor: corFundo,
                    borderLeftColor: corBorda,
                    borderLeftWidth: 6
                  }
                ]}>
                  {/* Badge DESTACADO com tipo de serviço no topo */}
                  <View style={[styles.tipoBadgeDestacado, { backgroundColor: corBorda }]}>
                    <Text style={styles.tipoLabelDestacado}>{labelTipo}</Text>
                  </View>

                  <View style={styles.cardHeader}>
                    <View style={[styles.badge, { backgroundColor: corBorda }]}>
                      <Text style={styles.badgeText}>#{index + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.clienteName}>{entrega.cliente}</Text>
                      <Text style={{ color: '#666', fontSize: 11, marginTop: 2 }}>ID: #{entrega.id}</Text>
                    </View>
                  </View>

                  {/* Endereço DESTACADO para leitura sob o sol */}
                  <Text style={styles.addressDestacado}>📍 {entrega.endereco}</Text>

                  {/* Observações se houver */}
                  {entrega.observacoes ? (
                    <Text style={styles.observacoes}>💬 {entrega.observacoes}</Text>
                  ) : null}

                  <View style={styles.buttonRow}>
                    <TouchableOpacity
                      style={[styles.button, styles.buttonSuccess]}
                      onPress={() => abrirAssinatura(entrega)}
                    >
                      <Text style={styles.buttonText}>✓ ENTREGUE</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.button, styles.buttonDanger]}
                      onPress={() => comunicarFalha(entrega)}
                    >
                      <Text style={styles.buttonText}>✗ NÃO ENTREGUE</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
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
  contadoresContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  contadorBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 10,
    paddingHorizontal: 25,
    borderRadius: 10,
    minWidth: 120,
  },
  contadorNumero: {
    color: '#22c55e',
    fontSize: 28,
    fontWeight: 'bold',
  },
  contadorLabel: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#FFFFFF', // Cor aplicada inline dinamicamente
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    borderLeftWidth: 6,
    borderLeftColor: '#000', // Cor aplicada inline dinamicamente
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  tipoBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  tipoLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  tipoBadgeDestacado: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  tipoLabelDestacado: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  observacoes: {
    color: '#fbbf24',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 8,
    marginBottom: 4,
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
    color: '#1a1a1a',
    fontSize: 17,
    fontWeight: 'bold',
  },
  address: {
    color: '#cbd5e1',
    fontSize: 13,
    marginBottom: 12,
  },
  addressDestacado: {
    color: '#333333',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    lineHeight: 22,
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
    backgroundColor: '#10b981',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  buttonDanger: {
    backgroundColor: '#f97316',
    shadowColor: '#f97316',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
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
