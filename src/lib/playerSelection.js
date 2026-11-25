// PURE — no Shell imports. Unit-testable.
// players: Map<busName, PlayerState>
// prev: previously selected busName or null
// Returns busName or null.

export function pickActivePlayer(players, prev) {
    const all = [...players.values()];
    // Filter out playerctld proxy daemon
    const real = all.filter(p => !p.busName.includes('playerctld'));
    // Filter dead/empty stopped players
    const alive = real.filter(p => !(p.status === 'Stopped' && !p.title));

    const playing = alive.filter(p => p.status === 'Playing');
    if (playing.length > 0) {
        // Stickiness: keep prev if still Playing unless a newer player started
        if (prev && players.has(prev) && players.get(prev).status === 'Playing') {
            const prevActive = players.get(prev).lastActive ?? 0;
            const newerExists = playing.some(p => p.busName !== prev && (p.lastActive ?? 0) > prevActive);
            if (!newerExists) return prev;
        }
        // Pick most recently active
        return playing.reduce((a, b) => ((a.lastActive ?? 0) >= (b.lastActive ?? 0) ? a : b)).busName;
    }

    const paused = alive.filter(p => p.status === 'Paused' || p.status === 'Stopped');
    if (paused.length > 0) {
        return paused.reduce((a, b) => ((a.lastActive ?? 0) >= (b.lastActive ?? 0) ? a : b)).busName;
    }

    return null;
}
