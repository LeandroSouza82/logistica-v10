-- Atualiza motorista id=1 com coordenadas de teste e marca como online
UPDATE public.motoristas
SET lat = '-27.6608',
    lng = '-48.7087',
    ultimo_sinal = now(),
    status = 'online'
WHERE id = 1;

-- Retorna o registro atualizado para verificação
SELECT id, nome, lat, lng, ultimo_sinal, status FROM public.motoristas WHERE id = 1;