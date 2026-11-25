// Debug utilities. Only active when settings debug=true or TAHOE_CC_DEBUG=1.
// dumpActorTree(actor, maxDepth=5): prints actor type, style_class, visible,
// allocation box, child index to console.debug.
// Never call in production paths — only on enable()/disable() with debug flag.

export function dumpActorTree(actor, maxDepth = 5, depth = 0, childIdx = 0) {
    if (!actor || depth > maxDepth) return;
    const indent = '  '.repeat(depth);
    let allocStr = '';
    try {
        const box = actor.get_allocation_box?.();
        if (box) {
            const w = Math.round(box.get_width());
            const h = Math.round(box.get_height());
            const x = Math.round(box.x1);
            const y = Math.round(box.y1);
            allocStr = `(${x},${y} ${w}x${h})`;
        }
    } catch (e) {}

    const info = [
        `#${childIdx}`,
        actor.constructor?.name ?? '?',
        actor.style_class ? `[${actor.style_class}]` : '',
        actor.visible ? 'vis' : 'HID',
        allocStr,
    ].filter(Boolean).join(' ');
    console.debug(`[TahoeCC] ${indent}${info}`);

    const n = actor.get_n_children?.() ?? 0;
    for (let i = 0; i < n; i++) {
        const child = actor.get_child_at_index?.(i);
        if (child) dumpActorTree(child, maxDepth, depth + 1, i);
    }
}

export function dumpMarkedTree(label, actor, maxDepth = 6) {
    console.debug(`[TahoeCC] ${label}_BEGIN`);
    dumpActorTree(actor, maxDepth);
    console.debug(`[TahoeCC] ${label}_END`);
}
