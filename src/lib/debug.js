// Debug utilities. Only active when settings debug=true or TAHOE_CC_DEBUG=1.
// dumpActorTree(actor, maxDepth=5): prints actor type, style_class, visible,
// allocation, parent, child index to console.debug.
// Never call in production paths — only on enable() with debug flag.

export function dumpActorTree(actor, maxDepth = 5, depth = 0) {
    if (depth > maxDepth) return;
    const indent = '  '.repeat(depth);
    const info = [
        actor.constructor?.name ?? '?',
        actor.style_class ? `[${actor.style_class}]` : '',
        actor.visible ? 'vis' : 'HID',
    ].filter(Boolean).join(' ');
    console.debug(`[TahoeCC] ${indent}${info}`);
    const n = actor.get_n_children?.() ?? 0;
    for (let i = 0; i < n; i++) {
        const child = actor.get_child_at_index?.(i);
        if (child) dumpActorTree(child, maxDepth, depth + 1);
    }
}
