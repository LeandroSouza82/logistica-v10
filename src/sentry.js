// Lightweight Sentry wrapper: only reports if @sentry/browser is installed and SENTRY_DSN provided.
export function captureException(e) {
    try {
        // eslint-disable-next-line global-require
        const Sentry = require('@sentry/browser');
        const dsn = import.meta.env.VITE_SENTRY_DSN;
        if (Sentry && dsn) {
            if (!Sentry.getCurrentHub || !Sentry.getCurrentHub()._haveInitialized) {
                try { Sentry.init({ dsn }); } catch (err) { /* ignore */ }
            }
            if (typeof Sentry.captureException === 'function') Sentry.captureException(e);
        }
    } catch (err) {
        // package not installed or other error — ignore to keep app resilient
        // console.warn('Sentry not available:', err?.message || err);
    }
}
