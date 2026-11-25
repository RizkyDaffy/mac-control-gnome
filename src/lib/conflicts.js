// conflicts.js — detects known layout-conflicting GNOME Shell extensions.
// Logs a one-time warning but does not prevent enable().

const CONFLICTS = [
    'quick-settings-tweaks@qwreey',
    'kstyles@kstyles.com',
    'compact-quick-settings@gnome.com',
    'unified-panel@gnome.com',
];

export function checkConflicts() {
    try {
        const enabled = global.settings?.get_strv('enabled-extensions') ?? [];
        for (const uuid of CONFLICTS) {
            if (enabled.includes(uuid))
                console.warn(`[TahoeCC] Conflicting extension detected: ${uuid}. Layout may not work correctly.`);
        }
    } catch (e) {
        console.debug('[TahoeCC] Could not check conflicts:', e.message);
    }
}
