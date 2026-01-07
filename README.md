# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

---

## Deployment & environment variables 🔧

This app requires a Google Maps JS API key to render maps. Set the following environment variable in your deployment (Vercel) or in a local `.env` file:

- `VITE_GOOGLE_MAPS_API_KEY` — your Google Maps API key with Maps JavaScript API and Places API enabled.

If this variable is not set, the app will show a clear message and will not attempt to load Google Maps (prevents runtime errors in mobile browsers).

### How to test the registration / telefone validation flow

1. Open the app in production or locally and go to the registration flow.
2. Try to submit a registration without filling the `telefone` field — the app will now show a friendly message: "Telefone obrigatório. Por favor, informe um número com DDD (ex: 5511999999999)."
3. If the backend returns a database error about `telefone` (NOT NULL), you should now see a friendly message instead of a raw DB error.

If you want me to open a PR with these changes and a short description, say "abrir PR".
