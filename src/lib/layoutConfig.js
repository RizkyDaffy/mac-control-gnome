// PURE — no Shell/Clutter/St imports. Unit-testable with plain gjs.

export const DEFAULT_LAYOUT = {
    version: 1,
    blocks: [
        {type: 'split',    id: 'connectivity', stack: ['wifi', 'bluetooth'], card: 'music'},
        {type: 'tiles',    id: 'tiles-1',      items: ['dark-style', 'dnd']},
        {type: 'sliders',  id: 'sliders',      items: ['volume-output', 'brightness', 'volume-input']},
        {type: 'circles',  id: 'circles',      items: ['screenshot', 'settings', 'lock', 'power']},
        {type: 'tiles',    id: 'tiles-2',      items: ['power-mode', 'night-light', 'airplane-mode']},
        {type: 'overflow', id: 'overflow'},
    ],
};

const VALID_TYPES = new Set(['split', 'tiles', 'sliders', 'circles', 'overflow']);

// Returns {layout, warnings[]}. On invalid JSON/schema: returns default + warning.
export function validateLayout(json) {
    const warnings = [];
    let parsed;
    if (!json || json.trim() === '') return {layout: DEFAULT_LAYOUT, warnings};
    try { parsed = JSON.parse(json); } catch (e) {
        warnings.push(`Invalid JSON: ${e.message}`);
        return {layout: DEFAULT_LAYOUT, warnings};
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.blocks)) {
        warnings.push('Missing blocks array; using default');
        return {layout: DEFAULT_LAYOUT, warnings};
    }
    const blocks = parsed.blocks.filter(b => {
        if (!b || typeof b !== 'object') { warnings.push(`Skipped non-object block`); return false; }
        if (!VALID_TYPES.has(b.type)) { warnings.push(`Unknown block type: ${b.type}`); return false; }
        if (!b.id) { warnings.push(`Block missing id`); return false; }
        return true;
    });
    return {layout: {version: parsed.version ?? 1, blocks}, warnings};
}
