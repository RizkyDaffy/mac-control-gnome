// PURE — no Shell/Clutter/St imports. Unit-testable with plain gjs.

export function planLayout(config, items) {
    const claimed = new Set();
    const plan = [];

    for (const block of config.blocks) {
        if (block.type === 'overflow') continue; // handled after claimed set built

        const blockPlan = buildBlockPlan(block, items, claimed);
        if (blockPlan) plan.push(blockPlan);
    }

    // overflow: all visible unclaimed
    const overflowItems = [...items.values()].filter(it => !claimed.has(it.id) && it.visible);
    if (overflowItems.length > 0) {
        plan.push({block: 'overflow', type: 'overflow', items: overflowItems.map(i => i.id)});
    }

    return plan;
}

function buildBlockPlan(block, items, claimed) {
    const claimVisible = (id) => {
        if (claimed.has(id)) return null;
        const it = items.get(id);
        if (!it || !it.visible) return null;
        claimed.add(id);
        return id;
    };

    if (block.type === 'split') {
        const stack = (block.stack ?? []).map(claimVisible).filter(Boolean);
        // card presence: 'music' always attempted; controlled by settings at render time
        const card = block.card === 'music';
        if (stack.length === 0 && !card) return null;
        return {block: block.id, type: 'split', stack, card};
    }

    if (block.type === 'tiles') {
        const visible = (block.items ?? []).map(claimVisible).filter(Boolean);
        if (visible.length === 0) return null;
        const rows = [];
        for (let i = 0; i < visible.length; i += 2) rows.push(visible.slice(i, i + 2));
        return {block: block.id, type: 'tiles', rows};
    }

    if (block.type === 'sliders') {
        const visible = (block.items ?? []).map(claimVisible).filter(Boolean);
        if (visible.length === 0) return null;
        return {block: block.id, type: 'sliders', rows: visible.map(id => [id])};
    }

    if (block.type === 'circles') {
        const visible = (block.items ?? []).map(claimVisible).filter(Boolean);
        if (visible.length === 0) return null;
        return {block: block.id, type: 'circles', items: visible};
    }

    return null;
}
