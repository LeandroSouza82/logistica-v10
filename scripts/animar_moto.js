const { createClient } = require('@supabase/supabase-js');

// Lê configurações (prioriza variáveis de ambiente)
const supabaseUrl = process.env.SUPABASE_URL || 'https://uqxoadxqcwidxqsfayem.supabase.co';
const supabaseSecretKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;

if (!supabaseSecretKey) {
    console.error('❌ Service Role Key não encontrada. Defina SUPABASE_SERVICE_ROLE_KEY no ambiente.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseSecretKey);

// Parâmetros via CLI: --id <id> --interval <ms> --center <lat> <lng>
const argv = process.argv.slice(2);
let motoristaId = '1';
let intervalMs = 2000;
let centerLat = -27.6485;
let centerLng = -48.6671;

for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--id') motoristaId = argv[++i] || motoristaId;
    if (arg === '--interval') intervalMs = Number(argv[++i]) || intervalMs;
    if (arg === '--center') { centerLat = Number(argv[++i]) || centerLat; centerLng = Number(argv[++i]) || centerLng; }
}

// Função para simular o movimento
async function animarMotorista() {
    console.log(`🚀 Iniciando rastreio em tempo real para motorista id=${motoristaId} (interval=${intervalMs}ms)...`);

    // Coordenadas iniciais
    let lat = centerLat;
    let lng = centerLng;

    const timer = setInterval(async () => {
        try {
            // Simula um pequeno movimento
            lat += (Math.random() - 0.5) * 0.001;
            lng += (Math.random() - 0.5) * 0.001;

            const { error } = await supabase
                .from('motoristas')
                .update({
                    lat: lat,
                    lng: lng,
                    ultimo_sinal: new Date().toISOString()
                })
                .eq('id', motoristaId);

            if (error) {
                console.error('❌ Erro ao atualizar:', error.message);
            } else {
                console.log(`📍 Moto movida para: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
            }
        } catch (e) {
            console.error('❌ Exceção ao atualizar:', e?.message || e);
        }
    }, intervalMs);

    process.on('SIGINT', () => {
        clearInterval(timer);
        console.log('\n🛑 Animação interrompida pelo usuário.');
        process.exit(0);
    });
}

animarMotorista();