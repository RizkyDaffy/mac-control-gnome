// leak-loop.js — Looking Glass / Shell evaluator script to verify zero actor/source leaks.
// Usage in nested shell Looking Glass (Alt+F2 → lg → Evaluator), or via Eval D-Bus:
//   Paste or load this snippet while the extension is installed.
//   Runs disable() + enable() 20 times and asserts before === after (tolerance 0).

(() => {
    const UUID = 'tahoe-control-center@local';
    const qs = Main.panel.statusArea.quickSettings;
    const ext = Main.extensionManager.lookup(UUID);
    if (!ext || !ext.stateObj)
        throw new Error(`[TahoeCC leak-loop] Extension ${UUID} not loaded`);

    function countDescendants(actor) {
        let total = 1;
        const n = actor.get_n_children?.() ?? 0;
        for (let i = 0; i < n; i++)
            total += countDescendants(actor.get_child_at_index(i));
        return total;
    }

    function countMacCc(actor) {
        let count = actor.style_class?.includes('mac-cc') ? 1 : 0;
        const n = actor.get_n_children?.() ?? 0;
        for (let i = 0; i < n; i++)
            count += countMacCc(actor.get_child_at_index(i));
        return count;
    }

    function snapshot() {
        return {
            boxChildren: qs.menu.box.get_n_children(),
            gridChildren: qs.menu._grid.get_n_children(),
            overlayChildren: qs.menu._overlay.get_n_children(),
            totalDescendants: countDescendants(qs.menu.actor),
            macCcCount: countMacCc(qs.menu.actor),
        };
    }

    // Start from disabled baseline so macCcCount === 0
    if (ext.stateObj._controller)
        ext.stateObj.disable();

    const before = snapshot();
    if (before.macCcCount !== 0)
        throw new Error(`[TahoeCC leak-loop] Baseline not clean: macCcCount=${before.macCcCount}`);

    for (let i = 0; i < 20; i++) {
        ext.stateObj.enable();
        ext.stateObj.disable();
    }

    const after = snapshot();
    const diffs = [];
    for (const k of Object.keys(before)) {
        if (before[k] !== after[k])
            diffs.push(`${k}: before=${before[k]} after=${after[k]}`);
    }

    // Re-enable to restore working dev state
    ext.stateObj.enable();

    if (diffs.length > 0)
        throw new Error(`[TahoeCC leak-loop] FAIL: ${diffs.join(', ')}`);

    log(`[TahoeCC leak-loop] PASS (20x enable/disable): ${JSON.stringify(after)}`);
    return `PASS: ${JSON.stringify(after)}`;
})();
