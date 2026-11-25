#!/usr/bin/env gjs
// GJS ES module test runner for pure logic modules.
// Run: gjs -m tests/run.js
//
// Uses a minimal assert harness — no external deps.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {Disposables} from '../src/lib/disposables.js';
import {validateLayout, DEFAULT_LAYOUT} from '../src/lib/layoutConfig.js';
import {planLayout} from '../src/lib/layoutPlan.js';
import {normalizeMetadata} from '../src/lib/mprisMetadata.js';
import {pickActivePlayer} from '../src/lib/playerSelection.js';
import {
    snapshot,
    move,
    restore,
    restoreAll,
    addStyleClass,
    removeAddedStyleClasses,
} from '../src/lib/reparent.js';

// ── Harness ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(cond, label) {
    if (cond) {
        console.log(`  ✓ ${label}`);
        passed++;
    } else {
        console.error(`  ✗ FAIL: ${label}`);
        failed++;
    }
}

function assertEq(a, b, label) {
    const ok = JSON.stringify(a) === JSON.stringify(b);
    if (ok) {
        console.log(`  ✓ ${label}`);
        passed++;
    } else {
        console.error(`  ✗ FAIL: ${label}`);
        console.error(`      got:      ${JSON.stringify(a)}`);
        console.error(`      expected: ${JSON.stringify(b)}`);
        failed++;
    }
}

function suite(name, fn) {
    console.log(`\n── ${name} ──`);
    fn();
}

// ── Fake GLib/Gio for Disposables timeout/idle/cancellable ───────────────────
// (Those methods are NOT tested here; we only test connect/add/dispose.)

// ── Tests: Disposables ───────────────────────────────────────────────────────

suite('Disposables', () => {
    // connect/disconnect
    {
        let disconnected = false;
        const fakeObj = {
            connect(_sig, _cb) { return 42; },
            disconnect(id) { if (id === 42) disconnected = true; },
        };
        const d = new Disposables();
        d.connect(fakeObj, 'notify', () => {});
        assert(d.size === 1, 'size is 1 after connect');
        d.dispose();
        assert(disconnected, 'disconnect called on dispose');
        assert(d.size === 0, 'size is 0 after dispose');
    }

    // add + dispose order (LIFO)
    {
        const order = [];
        const d = new Disposables();
        d.add(() => order.push(1));
        d.add(() => order.push(2));
        d.add(() => order.push(3));
        d.dispose();
        assertEq(order, [3, 2, 1], 'dispose runs in LIFO order');
    }

    // dispose is idempotent (calling twice must not throw)
    {
        const d = new Disposables();
        d.add(() => {});
        d.dispose();
        let threw = false;
        try { d.dispose(); } catch (e) { threw = true; }
        assert(!threw, 'second dispose does not throw');
        assert(d.size === 0, 'size 0 after double dispose');
    }

    // error in one item does not stop others
    {
        const order = [];
        const d = new Disposables();
        d.add(() => order.push('a'));
        d.add(() => { throw new Error('boom'); });
        d.add(() => order.push('b'));
        let threw = false;
        try { d.dispose(); } catch (e) { threw = true; }
        assert(!threw, 'dispose does not propagate item error');
        assert(order.includes('a') && order.includes('b'), 'both non-throwing items ran');
    }

    // connect: bad disconnect is swallowed
    {
        const fakeObj = {
            connect() { return 99; },
            disconnect() { throw new Error('already gone'); },
        };
        const d = new Disposables();
        d.connect(fakeObj, 'test', () => {});
        let threw = false;
        try { d.dispose(); } catch (e) { threw = true; }
        assert(!threw, 'bad disconnect swallowed');
    }

    // cancellable(): returns Gio.Cancellable and cancels on dispose
    {
        const d = new Disposables();
        const c = d.cancellable();
        assert(c instanceof Gio.Cancellable, 'cancellable() returns Gio.Cancellable');
        assert(!c.is_cancelled(), 'cancellable not cancelled initially');
        assert(d.size === 1, 'size is 1 after cancellable()');
        d.dispose();
        assert(c.is_cancelled(), 'cancellable cancelled on dispose()');
        assert(d.size === 0, 'size is 0 after dispose()');
    }

    // timeout() / idle() cancelled on dispose before firing
    {
        const d = new Disposables();
        let timeoutCalled = false;
        let idleCalled = false;
        const tid = d.timeout(10, () => { timeoutCalled = true; return GLib.SOURCE_REMOVE; });
        const iid = d.idle(() => { idleCalled = true; return GLib.SOURCE_REMOVE; });
        assert(tid > 0 && iid > 0, 'timeout() and idle() return valid GLib source IDs');
        assert(d.size === 2, 'size is 2 after timeout + idle');
        d.dispose();

        const loop = GLib.MainLoop.new(null, false);
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 25, () => { loop.quit(); return GLib.SOURCE_REMOVE; });
        loop.run();

        assert(!timeoutCalled, 'disposed timeout never fires');
        assert(!idleCalled, 'disposed idle never fires');
    }

    // timeout() / idle() fired with SOURCE_REMOVE: dispose() does not remove already-removed source
    {
        const d = new Disposables();
        let idleFired = false;
        let timeoutFired = false;
        d.idle(() => { idleFired = true; return GLib.SOURCE_REMOVE; });
        d.timeout(1, () => { timeoutFired = true; return GLib.SOURCE_REMOVE; });

        const loop = GLib.MainLoop.new(null, false);
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 20, () => { loop.quit(); return GLib.SOURCE_REMOVE; });
        loop.run();

        assert(idleFired, 'idle fired when not disposed');
        assert(timeoutFired, 'timeout fired when not disposed');
        let threw = false;
        try { d.dispose(); } catch (e) { threw = true; }
        assert(!threw, 'dispose() after SOURCE_REMOVE does not throw');
        assert(d.size === 0, 'size is 0 after dispose()');
    }
});

// ── Tests: layoutConfig ──────────────────────────────────────────────────────

suite('layoutConfig — validateLayout', () => {
    // empty string → default
    {
        const {layout, warnings} = validateLayout('');
        assertEq(layout, DEFAULT_LAYOUT, 'empty string → default layout');
        assert(warnings.length === 0, 'no warnings for empty string');
    }

    // null → default
    {
        const {layout, warnings} = validateLayout(null);
        assertEq(layout, DEFAULT_LAYOUT, 'null → default layout');
        assert(warnings.length === 0, 'no warnings for null');
    }

    // invalid JSON → default + warning
    {
        const {layout, warnings} = validateLayout('not json }{');
        assertEq(layout, DEFAULT_LAYOUT, 'invalid JSON → default layout');
        assert(warnings.length > 0, 'invalid JSON produces warning');
        assert(warnings[0].startsWith('Invalid JSON'), 'warning mentions Invalid JSON');
    }

    // missing blocks → default + warning
    {
        const {layout, warnings} = validateLayout('{"version":1}');
        assertEq(layout, DEFAULT_LAYOUT, 'missing blocks → default');
        assert(warnings.some(w => w.includes('Missing blocks')), 'warning for missing blocks');
    }

    // valid custom layout
    {
        const custom = JSON.stringify({
            version: 2,
            blocks: [
                {type: 'tiles', id: 'my-tiles', items: ['wifi']},
                {type: 'overflow', id: 'overflow'},
            ],
        });
        const {layout, warnings} = validateLayout(custom);
        assert(layout.version === 2, 'custom version preserved');
        assert(layout.blocks.length === 2, 'both blocks kept');
        assert(warnings.length === 0, 'no warnings for valid layout');
    }

    // unknown block type → skipped + warning
    {
        const json = JSON.stringify({
            version: 1,
            blocks: [
                {type: 'unknown-type', id: 'x'},
                {type: 'tiles', id: 'good', items: []},
            ],
        });
        const {layout, warnings} = validateLayout(json);
        assert(layout.blocks.length === 1, 'unknown block type filtered out');
        assert(warnings.some(w => w.includes('Unknown block type')), 'warning for unknown type');
    }

    // block missing id → skipped + warning
    {
        const json = JSON.stringify({
            version: 1,
            blocks: [
                {type: 'tiles', items: []},  // no id
                {type: 'sliders', id: 'ok', items: []},
            ],
        });
        const {layout, warnings} = validateLayout(json);
        assert(layout.blocks.length === 1, 'block without id filtered out');
        assert(warnings.some(w => w.includes('missing id')), 'warning for missing id');
    }
});

// ── Tests: layoutPlan ────────────────────────────────────────────────────────

suite('layoutPlan — planLayout', () => {
    function makeItems(entries) {
        const m = new Map();
        for (const e of entries) m.set(e.id, e);
        return m;
    }

    // tiles: two visible → one row of 2
    {
        const config = {blocks: [{type: 'tiles', id: 'row', items: ['a', 'b']}]};
        const items = makeItems([
            {id: 'a', visible: true},
            {id: 'b', visible: true},
        ]);
        const plan = planLayout(config, items);
        assert(plan.length === 1, 'one block plan');
        assertEq(plan[0].rows, [['a', 'b']], 'two items → one row');
    }

    // tiles: three visible → row of 2, row of 1
    {
        const config = {blocks: [{type: 'tiles', id: 'row', items: ['a', 'b', 'c']}]};
        const items = makeItems([
            {id: 'a', visible: true},
            {id: 'b', visible: true},
            {id: 'c', visible: true},
        ]);
        const plan = planLayout(config, items);
        assertEq(plan[0].rows, [['a', 'b'], ['c']], 'three items → rows [2,1]');
    }

    // invisible item not placed
    {
        const config = {blocks: [{type: 'tiles', id: 'row', items: ['a', 'b']}]};
        const items = makeItems([
            {id: 'a', visible: true},
            {id: 'b', visible: false},
        ]);
        const plan = planLayout(config, items);
        assertEq(plan[0].rows, [['a']], 'invisible item excluded');
    }

    // empty block → not in plan
    {
        const config = {blocks: [{type: 'tiles', id: 'empty', items: ['x']}]};
        const items = makeItems([{id: 'x', visible: false}]);
        const plan = planLayout(config, items);
        assert(plan.length === 0, 'all-invisible block omitted');
    }

    // duplicate item claimed only once
    {
        const config = {blocks: [
            {type: 'tiles', id: 'first', items: ['a']},
            {type: 'tiles', id: 'second', items: ['a', 'b']},
        ]};
        const items = makeItems([
            {id: 'a', visible: true},
            {id: 'b', visible: true},
        ]);
        const plan = planLayout(config, items);
        assert(plan.length === 2, 'both blocks in plan');
        assertEq(plan[0].rows, [['a']], 'first block gets a');
        assertEq(plan[1].rows, [['b']], 'second block: a already claimed, only b');
    }

    // overflow: unclaimed items collected
    {
        const config = {blocks: [
            {type: 'tiles', id: 't', items: ['a']},
            {type: 'overflow', id: 'overflow'},
        ]};
        const items = makeItems([
            {id: 'a', visible: true},
            {id: 'b', visible: true},
        ]);
        const plan = planLayout(config, items);
        const overflow = plan.find(p => p.type === 'overflow');
        assert(!!overflow, 'overflow block present');
        assert(overflow.items.includes('b'), 'unclaimed item b in overflow');
        assert(!overflow.items.includes('a'), 'claimed item a not in overflow');
    }

    // sliders: one per row
    {
        const config = {blocks: [{type: 'sliders', id: 's', items: ['vol', 'bright']}]};
        const items = makeItems([
            {id: 'vol', visible: true},
            {id: 'bright', visible: true},
        ]);
        const plan = planLayout(config, items);
        assertEq(plan[0].rows, [['vol'], ['bright']], 'sliders: one per row');
    }

    // circles
    {
        const config = {blocks: [{type: 'circles', id: 'c', items: ['screenshot', 'lock']}]};
        const items = makeItems([
            {id: 'screenshot', visible: true},
            {id: 'lock', visible: true},
        ]);
        const plan = planLayout(config, items);
        assertEq(plan[0].items, ['screenshot', 'lock'], 'circles: single row');
    }

    // split: stack + card flag
    {
        const config = {blocks: [{type: 'split', id: 'conn', stack: ['wifi', 'bt'], card: 'music'}]};
        const items = makeItems([
            {id: 'wifi', visible: true},
            {id: 'bt', visible: true},
        ]);
        const plan = planLayout(config, items);
        assert(plan[0].type === 'split', 'split block type');
        assertEq(plan[0].stack, ['wifi', 'bt'], 'stack items');
        assert(plan[0].card === true, 'card flag true for music');
    }
});

// ── Tests: mprisMetadata ─────────────────────────────────────────────────────

suite('mprisMetadata — normalizeMetadata', () => {
    // null/undefined → empty
    {
        const m = normalizeMetadata(null);
        assertEq(m, {title: '', artist: '', album: '', artUrl: null}, 'null → empty');
    }
    {
        const m = normalizeMetadata(undefined);
        assertEq(m, {title: '', artist: '', album: '', artUrl: null}, 'undefined → empty');
    }
    {
        const m = normalizeMetadata('string');
        assertEq(m, {title: '', artist: '', album: '', artUrl: null}, 'non-object → empty');
    }

    // normal Spotify-like metadata
    {
        const raw = {
            'xesam:title': '  Blinding Lights  ',
            'xesam:artist': ['The Weeknd'],
            'xesam:album': 'After Hours',
            'mpris:artUrl': 'https://i.scdn.co/image/abc123',
        };
        const m = normalizeMetadata(raw);
        assert(m.title === 'Blinding Lights', 'title trimmed');
        assert(m.artist === 'The Weeknd', 'artist from array');
        assert(m.album === 'After Hours', 'album present');
        assert(m.artUrl === 'https://i.scdn.co/image/abc123', 'https art URL kept');
    }

    // multiple artists joined
    {
        const raw = {'xesam:artist': ['Artist A', 'Artist B'], 'xesam:title': 'Song'};
        const m = normalizeMetadata(raw);
        assert(m.artist === 'Artist A, Artist B', 'multiple artists joined');
    }

    // artist as plain string
    {
        const raw = {'xesam:artist': 'Solo Artist', 'xesam:title': 'Track'};
        const m = normalizeMetadata(raw);
        assert(m.artist === 'Solo Artist', 'string artist kept');
    }

    // file: protocol art URL allowed
    {
        const raw = {'mpris:artUrl': 'file:///home/user/.cache/art.png'};
        const m = normalizeMetadata(raw);
        assert(m.artUrl === 'file:///home/user/.cache/art.png', 'file: art URL allowed');
    }

    // ftp: protocol rejected
    {
        const raw = {'mpris:artUrl': 'ftp://example.com/art.png'};
        const m = normalizeMetadata(raw);
        assert(m.artUrl === null, 'ftp: art URL rejected');
    }

    // malformed URL rejected
    {
        const raw = {'mpris:artUrl': 'not a url !!!'};
        const m = normalizeMetadata(raw);
        assert(m.artUrl === null, 'malformed URL → null');
    }

    // title truncated to 300 chars
    {
        const raw = {'xesam:title': 'x'.repeat(500)};
        const m = normalizeMetadata(raw);
        assert(m.title.length === 300, 'title truncated to 300');
    }

    // missing fields → empty strings
    {
        const m = normalizeMetadata({});
        assertEq(m, {title: '', artist: '', album: '', artUrl: null}, 'empty object → all empty');
    }

    // edge cases: empty/space/javascript art URLs + mixed-type artist/album
    {
        assert(normalizeMetadata({'mpris:artUrl': 'https://'}).artUrl === null, 'https:// without host → null');
        assert(normalizeMetadata({'mpris:artUrl': 'https://bad host/art.png'}).artUrl === null, 'URL with whitespace → null');
        assert(normalizeMetadata({'mpris:artUrl': 'javascript:alert(1)'}).artUrl === null, 'javascript: URL → null');
        const m = normalizeMetadata({
            'xesam:artist': [null, '', 'Valid Artist', 123],
            'xesam:album': 42,
            'xesam:title': 999,
        });
        assert(m.artist === 'Valid Artist', 'mixed-type artist array filters non-strings');
        assert(m.album === '' && m.title === '', 'non-string title/album → empty');
    }
});

// ── Tests: playerSelection ───────────────────────────────────────────────────

suite('playerSelection — pickActivePlayer', () => {
    function mp(busName, status, lastActive, title = 'Song') {
        return {busName, status, lastActive, title};
    }

    // no players → null
    {
        const r = pickActivePlayer(new Map(), null);
        assert(r === null, 'no players → null');
    }

    // single playing player
    {
        const players = new Map([['org.mpris.MediaPlayer2.spotify', mp('org.mpris.MediaPlayer2.spotify', 'Playing', 100)]]);
        const r = pickActivePlayer(players, null);
        assert(r === 'org.mpris.MediaPlayer2.spotify', 'single playing → that player');
    }

    // playerctld filtered out
    {
        const players = new Map([
            ['org.mpris.MediaPlayer2.playerctld', mp('org.mpris.MediaPlayer2.playerctld', 'Playing', 200)],
            ['org.mpris.MediaPlayer2.vlc', mp('org.mpris.MediaPlayer2.vlc', 'Paused', 50)],
        ]);
        const r = pickActivePlayer(players, null);
        assert(r === 'org.mpris.MediaPlayer2.vlc', 'playerctld filtered out');
    }

    // prefer Playing over Paused
    {
        const players = new Map([
            ['org.mpris.MediaPlayer2.rhythmbox', mp('org.mpris.MediaPlayer2.rhythmbox', 'Paused', 200)],
            ['org.mpris.MediaPlayer2.spotify', mp('org.mpris.MediaPlayer2.spotify', 'Playing', 100)],
        ]);
        const r = pickActivePlayer(players, null);
        assert(r === 'org.mpris.MediaPlayer2.spotify', 'Playing beats Paused');
    }

    // stickiness: keep prev if still Playing and no newer player
    {
        const players = new Map([
            ['org.mpris.MediaPlayer2.a', mp('org.mpris.MediaPlayer2.a', 'Playing', 100)],
            ['org.mpris.MediaPlayer2.b', mp('org.mpris.MediaPlayer2.b', 'Playing', 50)],
        ]);
        const r = pickActivePlayer(players, 'org.mpris.MediaPlayer2.a');
        assert(r === 'org.mpris.MediaPlayer2.a', 'sticky: keep prev Playing when no newer');
    }

    // newer player beats sticky prev
    {
        const players = new Map([
            ['org.mpris.MediaPlayer2.a', mp('org.mpris.MediaPlayer2.a', 'Playing', 100)],
            ['org.mpris.MediaPlayer2.b', mp('org.mpris.MediaPlayer2.b', 'Playing', 200)],
        ]);
        const r = pickActivePlayer(players, 'org.mpris.MediaPlayer2.a');
        assert(r === 'org.mpris.MediaPlayer2.b', 'newer player overrides sticky prev');
    }

    // Stopped + no title → filtered (dead)
    {
        const players = new Map([
            ['org.mpris.MediaPlayer2.dead', {busName: 'org.mpris.MediaPlayer2.dead', status: 'Stopped', lastActive: 999, title: ''}],
        ]);
        const r = pickActivePlayer(players, null);
        assert(r === null, 'Stopped empty title → dead → null');
    }

    // Stopped + title → treated as paused, returned
    {
        const players = new Map([
            ['org.mpris.MediaPlayer2.vlc', mp('org.mpris.MediaPlayer2.vlc', 'Stopped', 10, 'Some Track')],
        ]);
        const r = pickActivePlayer(players, null);
        assert(r === 'org.mpris.MediaPlayer2.vlc', 'Stopped with title → paused bucket → returned');
    }

    // most recently active paused wins
    {
        const players = new Map([
            ['org.mpris.MediaPlayer2.a', mp('org.mpris.MediaPlayer2.a', 'Paused', 50)],
            ['org.mpris.MediaPlayer2.b', mp('org.mpris.MediaPlayer2.b', 'Paused', 200)],
        ]);
        const r = pickActivePlayer(players, null);
        assert(r === 'org.mpris.MediaPlayer2.b', 'most recently active paused wins');
    }
});

// ── Tests: reparent ──────────────────────────────────────────────────────────

suite('reparent — snapshot, move, restoreAll', () => {
    function makeActor(name, opts = {}) {
        const children = [];
        const classes = new Set((opts.style_class ?? '').split(/\s+/).filter(Boolean));
        let parent = null;
        const actor = {
            name,
            visible: opts.visible ?? true,
            x_expand: opts.x_expand ?? false,
            y_expand: opts.y_expand ?? false,
            x_align: opts.x_align ?? 0,
            y_align: opts.y_align ?? 0,
            layout_manager: opts.layout_manager ?? null,
            get style_class() { return [...classes].join(' '); },
            add_style_class_name(cls) { classes.add(cls); },
            remove_style_class_name(cls) { classes.delete(cls); },
            has_style_class_name(cls) { return classes.has(cls); },
            get_parent() { return parent; },
            _setParent(p) { parent = p; },
            get_children() { return [...children]; },
            get_n_children() { return children.length; },
            add_child(c) {
                children.push(c);
                c._setParent(actor);
            },
            insert_child_at_index(c, idx) {
                const clamped = Math.max(0, Math.min(idx, children.length));
                children.splice(clamped, 0, c);
                c._setParent(actor);
            },
            remove_child(c) {
                const i = children.indexOf(c);
                if (i >= 0) {
                    children.splice(i, 1);
                    c._setParent(null);
                }
            },
        };
        return actor;
    }

    function makeGrid() {
        const meta = new Map();
        const layout_manager = {
            get_child_meta(_g, child) { return {columnSpan: meta.get(child) ?? 1}; },
            child_set_property(_g, child, prop, val) {
                if (prop === 'column-span') meta.set(child, val);
            },
        };
        const grid = makeActor('grid', {layout_manager});
        return {grid, meta};
    }

    // snapshot + move + restore (single item, style classes, colSpan, idempotent)
    {
        const {grid, meta} = makeGrid();
        const placeholder = makeActor('placeholder');
        const wifi = makeActor('wifi', {style_class: 'quick-toggle', x_expand: true, y_expand: false});
        const slider = makeActor('slider', {style_class: 'quick-slider', x_expand: true});

        grid.add_child(placeholder);
        grid.add_child(wifi);
        grid.add_child(slider);
        meta.set(wifi, 1);
        meta.set(slider, 2);

        const snapWifi = snapshot(wifi, grid);
        const snapSlider = snapshot(slider, grid);
        assert(snapWifi.index === 1, 'wifi snapshot index is 1 (after placeholder)');
        assert(snapWifi.colSpan === 1, 'wifi colSpan is 1');
        assert(snapSlider.index === 2, 'slider snapshot index is 2');
        assert(snapSlider.colSpan === 2, 'slider colSpan is 2');

        const row = makeActor('row');
        move(wifi, row, {xExpand: false, yExpand: true});
        move(slider, row);
        assert(wifi.get_parent() === row, 'wifi moved to row');
        assert(wifi.x_expand === false && wifi.y_expand === true, 'move applied props');
        assert(grid.get_n_children() === 1, 'grid retains only placeholder');

        addStyleClass(snapWifi, 'mac-cc-tile');
        assert(wifi.has_style_class_name('mac-cc-tile'), 'added style class');

        // Clear colSpan to verify restore sets it back
        meta.set(slider, 1);

        restoreAll([snapSlider, snapWifi]); // pass out of order to test ascending sort
        assertEq(grid.get_children().map(c => c.name), ['placeholder', 'wifi', 'slider'],
            'restoreAll restores exact order around placeholder');
        assert(!wifi.has_style_class_name('mac-cc-tile'), 'added style class removed on restore');
        assert(wifi.x_expand === true && wifi.y_expand === false, 'expand flags restored');
        assert(meta.get(slider) === 2, 'slider column-span restored to 2');

        // Idempotent second restore
        restore(snapWifi);
        restore(snapSlider);
        assertEq(grid.get_children().map(c => c.name), ['placeholder', 'wifi', 'slider'],
            'restore is idempotent');
    }

    // placeholder in middle + destroyed actor skipped safely
    {
        const {grid} = makeGrid();
        const a = makeActor('a');
        const placeholder = makeActor('placeholder');
        const b = makeActor('b');
        const c = makeActor('c');
        grid.add_child(a);
        grid.add_child(placeholder);
        grid.add_child(b);
        grid.add_child(c);

        const snaps = [snapshot(a, grid), snapshot(b, grid), snapshot(c, grid)];
        const dest = makeActor('dest');
        for (const s of snaps) move(s.actor, dest);

        // Simulate b destroyed while moved out
        snaps[1].destroyed = true;
        restoreAll(snaps);

        assertEq(grid.get_children().map(x => x.name), ['a', 'placeholder', 'c'],
            'destroyed actor skipped cleanly, remaining restored around placeholder');
        assert(b.get_parent() === dest, 'destroyed actor untouched by restore');
    }

    // removeAddedStyleClasses standalone
    {
        const {grid} = makeGrid();
        const a = makeActor('a', {style_class: 'orig'});
        grid.add_child(a);
        const s = snapshot(a, grid);
        addStyleClass(s, 'extra-1');
        addStyleClass(s, 'extra-1'); // duplicate ignored
        addStyleClass(s, 'extra-2');
        assert(s.addedStyleClasses.length === 2, 'duplicate style class not added twice');
        removeAddedStyleClasses(s);
        assert(a.has_style_class_name('orig') && !a.has_style_class_name('extra-1') && !a.has_style_class_name('extra-2'),
            'only added style classes removed');
    }
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
    console.error('TESTS FAILED');
    // Exit with non-zero code
    imports.system.exit(1);
} else {
    console.log('ALL TESTS PASSED');
}
