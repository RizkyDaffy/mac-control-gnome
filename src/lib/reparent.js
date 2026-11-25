// Pure-ish actor reparenting helpers (no Shell/St imports so tests run in plain gjs).
// Never destroys actors we do not own.

export function snapshot(actor, grid = null) {
    const parent = actor.get_parent?.() ?? null;
    const children = parent?.get_children?.() ?? [];
    const index = children.indexOf(actor);
    const colSpan = grid?.layout_manager?.get_child_meta?.(grid, actor)?.columnSpan ?? 1;

    return {
        actor,
        parent,
        index,
        colSpan,
        visible: actor.visible,
        xExpand: actor.x_expand,
        yExpand: actor.y_expand,
        xAlign: actor.x_align,
        yAlign: actor.y_align,
        addedStyleClasses: [],
        destroyed: false,
    };
}

export function move(actor, newParent, props = {}) {
    if (!actor || !newParent) return;
    const curParent = actor.get_parent?.() ?? null;
    if (curParent && curParent !== newParent)
        curParent.remove_child(actor);
    if (curParent !== newParent)
        newParent.add_child(actor);

    if (props.xExpand !== undefined) actor.x_expand = props.xExpand;
    if (props.yExpand !== undefined) actor.y_expand = props.yExpand;
    if (props.xAlign !== undefined) actor.x_align = props.xAlign;
    if (props.yAlign !== undefined) actor.y_align = props.yAlign;
}

export function addStyleClass(snap, cls) {
    if (!snap || snap.destroyed || !snap.actor || !cls) return;
    if (!snap.addedStyleClasses.includes(cls)) {
        snap.actor.add_style_class_name?.(cls);
        snap.addedStyleClasses.push(cls);
    }
}

export function removeAddedStyleClasses(snap) {
    if (!snap || snap.destroyed || !snap.actor) return;
    for (const cls of snap.addedStyleClasses)
        snap.actor.remove_style_class_name?.(cls);
    snap.addedStyleClasses = [];
}

export function restore(snap) {
    if (!snap || snap.destroyed || !snap.actor || !snap.parent) return;

    removeAddedStyleClasses(snap);

    const curParent = snap.actor.get_parent?.() ?? null;
    if (curParent && curParent !== snap.parent)
        curParent.remove_child(snap.actor);

    if (curParent !== snap.parent) {
        const n = snap.parent.get_n_children?.() ?? 0;
        const targetIdx = snap.index >= 0 ? snap.index : n;
        const idx = Math.max(0, Math.min(targetIdx, n));
        if (snap.parent.insert_child_at_index)
            snap.parent.insert_child_at_index(snap.actor, idx);
        else
            snap.parent.add_child(snap.actor);
    }

    if (snap.xExpand !== undefined) snap.actor.x_expand = snap.xExpand;
    if (snap.yExpand !== undefined) snap.actor.y_expand = snap.yExpand;
    if (snap.xAlign !== undefined) snap.actor.x_align = snap.xAlign;
    if (snap.yAlign !== undefined) snap.actor.y_align = snap.yAlign;

    if (snap.parent.layout_manager?.child_set_property)
        snap.parent.layout_manager.child_set_property(snap.parent, snap.actor, 'column-span', snap.colSpan);
}

export function restoreAll(snapshots) {
    const sorted = [...snapshots].sort((a, b) => a.index - b.index);
    for (const snap of sorted)
        restore(snap);
}
