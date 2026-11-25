// PURE — no Shell imports. Unit-testable.
const MAX_LEN = 300;

export function normalizeMetadata(raw) {
    if (!raw || typeof raw !== 'object') return {title: '', artist: '', album: '', artUrl: null};
    const title = safeStr(raw['xesam:title']).slice(0, MAX_LEN);
    const artistRaw = raw['xesam:artist'];
    let artist = '';
    if (Array.isArray(artistRaw)) {
        artist = artistRaw.filter(s => s && typeof s === 'string').join(', ').slice(0, MAX_LEN);
    } else if (typeof artistRaw === 'string') {
        artist = artistRaw.slice(0, MAX_LEN);
    }
    const album = safeStr(raw['xesam:album']).slice(0, MAX_LEN);
    const rawUrl = raw['mpris:artUrl'];
    let artUrl = null;
    if (typeof rawUrl === 'string' && rawUrl && isValidArtUrl(rawUrl)) {
        artUrl = rawUrl;
    }
    return {title, artist, album, artUrl};
}

function isValidArtUrl(rawUrl) {
    if (/\s/.test(rawUrl)) return false;
    if (/^https?:\/\/[^/?#\s]+(?:[/?#][^\s]*)?$/i.test(rawUrl)) return true;
    if (/^file:\/\/(?:[^/\s]*)?\/[^\s]*$/i.test(rawUrl)) return true;
    return false;
}

function safeStr(v) {
    if (typeof v === 'string') return v.trim();
    return '';
}
