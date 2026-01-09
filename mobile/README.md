Expo DriverApp example

Este diretório contém um exemplo mínimo de `DriverApp` pronto para ser usado dentro de um projeto Expo.

Recomendações de instalação (Expo):

1. Instalar o Expo (se ainda não tiver):
   - npm install --global expo-cli
   - ou usar: npx create-expo-app my-driver-app

2. Criar um novo projeto Expo e copiar `DriverApp.expo.js` para `App.js` ou importar como componente:
   - npx create-expo-app my-driver-app
   - cd my-driver-app
   - npm install react-native-maps @gorhom/bottom-sheet react-native-vector-icons expo-av

3. Permissões e configurações:
   - Siga as instruções de `react-native-maps` para configurar Google Maps API (Android/iOS) e permissões.
   - `@gorhom/bottom-sheet` requer Reanimated v2; siga o guia de integração do Expo se usar Managed Workflow.

4. Rodar o app:
   - expo start

Notas:
- O exemplo em `DriverApp.expo.js` é intencionalmente mínimo: o `playJingle` é um placeholder para que você adicione `expo-av` (ou outra lib) e carregue um arquivo de som.
- Para comportamento de navegação, `openGoogleMaps` usa um esquema de URL simples — teste no dispositivo físico.
- Eu criei um scaffold Expo mínimo neste diretório com:
  - `package.json` (scripts `start`, `android`, `ios`, `web`)
  - `App.js` (registro do DriverApp)
  - `app.json` (config com permissões de localização)
  - `babel.config.js` (inclui `react-native-reanimated/plugin` para `@gorhom/bottom-sheet`)

Instruções rápidas para rodar localmente (Expo):

1. Instalar dependências via Yarn ou npm (recomendo usar `npx expo install` para as libs nativas):

   npx expo install react-native-maps @gorhom/bottom-sheet react-native-vector-icons expo-av react-native-reanimated react-native-gesture-handler

2. Iniciar o Metro/Expo:

   npm run start

3. Testar no dispositivo físico (recomendado para mapas e intent de navegação) usando Expo Go ou um build local.

Notas importantes:
- `@gorhom/bottom-sheet` exige `react-native-reanimated` e configuração do plugin (já adicionado em `babel.config.js`). Siga a documentação do Reanimated se houver problemas.
- `react-native-maps` requer configuração de API key e ajustes nativos (Android/iOS) — siga a documentação oficial.

**Atenção sobre chaves de API:** eu adicionei a chave fornecida ao `app.json` para testes locais, mas **não** é seguro commitar chaves sensíveis em repositórios públicos. Recomendo usar variáveis de ambiente ou segredos do serviço de CI (ou `expo secrets`) em produção e remover a chave do repositório.

- **Jingle:** por padrão o `playJingle` usa um som demo embutido (data URI) para funcionar sem dependências externas. Se preferir usar um arquivo real, coloque `jingle.mp3` em `mobile/assets/` (já existe um placeholder `mobile/assets/jingle.mp3`) e ajuste `playJingle` para usar `require('./assets/jingle.mp3')`. Se não quiser comitá-lo, mantenha `mobile/assets/*.mp3` no `.gitignore`.

- Se preferir, eu posso criar o projeto Expo completo (instalar dependências e configurar Reanimated) dentro deste repo; quer que eu prossiga com esse passo?