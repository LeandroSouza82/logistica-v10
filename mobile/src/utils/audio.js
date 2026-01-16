import { Audio } from 'expo-av';

let currentSound = null;

export async function initAudioMode() {
    try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false, allowsRecordingIOS: false });
    } catch (e) {
        // ignore—best effort
        console.warn('initAudioMode: failed', e);
    }
}

export async function playAlertSound(uri) {
    try {
        await initAudioMode();
        if (currentSound) {
            try { await currentSound.unloadAsync(); } catch (e) { /* ignore */ }
            currentSound = null;
        }
        let source = null;
        if (uri) source = { uri };
        else {
            try { source = require('../assets/jingle.mp3'); } catch (e) { /* asset not found, will try without source */ }
        }
        if (!source) return; // no audio asset available
        const { sound } = await Audio.Sound.createAsync(source, { shouldPlay: true, volume: 1.0 });
        currentSound = sound;
        sound.setOnPlaybackStatusUpdate((status) => {
            if (status.didJustFinish) {
                try { sound.unloadAsync(); } catch (e) { /* ignore */ }
                currentSound = null;
            }
        });
    } catch (e) {
        console.warn('playAlertSound error:', e);
    }
}

export async function stopSound() {
    try {
        if (currentSound) {
            await currentSound.stopAsync();
            try { await currentSound.unloadAsync(); } catch (e) { /* ignore */ }
            currentSound = null;
        }
    } catch (e) { /* ignore */ }
}
