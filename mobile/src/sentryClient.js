// Lightweight Sentry wrapper for mobile (expo). It will only try to use @sentry/expo if installed and SENTRY_DSN provided.
export function captureException(e) {
    try {
        // Avoid static require so bundlers don't error when package is absent
        let Sentry = null;
        try {
            Sentry = eval('require')('@sentry/expo');
        } catch (reqErr) {
            Sentry = null;
        }
        const dsn = process.env.SENTRY_DSN || process.env.EXPO_PUBLIC_SENTRY_DSN;
        if (Sentry && dsn) {
            try { Sentry.init({ dsn }); } catch (err) { /* ignore */ }
            if (typeof Sentry.Native === 'object' && typeof Sentry.Native.captureException === 'function') {
                Sentry.Native.captureException(e);
            } else if (typeof Sentry.captureException === 'function') {
                Sentry.captureException(e);
            }
        }
    } catch (err) {
        // package not installed or other error — ignore to keep app resilient
        // console.warn('Sentry mobile not available:', err?.message || err);
    }
}
