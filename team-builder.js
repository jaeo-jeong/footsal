(function (root) {
    'use strict';

    const TIER_WEIGHTS = Object.freeze({ '황제': 11, S: 10, 'A+': 8, A: 6.5, 'A-': 5.5, 'B+': 5, B: 4, C: 2.5, D: 1 });
    const TIERS = Object.keys(TIER_WEIGHTS);
    const EPSILON = 1e-9;
    const identity = player => String(player.id || player.name);
    const weight = player => Number.isFinite(player.rating) ? player.rating : (TIER_WEIGHTS[player.tier] || 4);
    const copyTeams = teams => teams.map(team => team.slice());
    const teamKey = teams => JSON.stringify(teams.map(team => team.map(identity).sort()).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
    const pairKey = (a, b) => JSON.stringify([identity(a), identity(b)].sort());

    function shuffle(items, random = Math.random) {
        const result = items.slice();
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }

    function validate(roster, sizes, locks = {}) {
        if (!Array.isArray(roster) || !Array.isArray(sizes) || sizes.length < 2 ||
            sizes.some(size => !Number.isInteger(size) || size < 1) ||
            sizes.reduce((sum, size) => sum + size, 0) !== roster.length ||
            Math.max(...sizes) - Math.min(...sizes) > 1) {
            throw new Error('팀 인원은 전체 선수 수와 일치하고 팀 간 차이가 1명 이하여야 합니다.');
        }
        if (roster.some(p => !p || !p.name || !Object.hasOwn(TIER_WEIGHTS, p.tier)) ||
            new Set(roster.map(identity)).size !== roster.length) {
            throw new Error('선수 이름·티어 또는 중복 선수를 확인해주세요.');
        }
        const ids = new Set(roster.map(identity));
        const lockedCounts = sizes.map(() => 0);
        for (const [id, team] of Object.entries(locks)) {
            if (!ids.has(id) || !Number.isInteger(team) || team < 0 || team >= sizes.length) {
                throw new Error('고정한 선수의 팀이 없습니다. 잠금을 해제하거나 팀 수를 유지해주세요.');
            }
            if (++lockedCounts[team] > sizes[team]) throw new Error('팀 ' + (team + 1) + '의 고정 선수가 정원보다 많습니다. 일부 잠금을 해제해주세요.');
        }
    }

    function averageMetrics(sums, sizes) {
        const averages = sums.map((sum, i) => sum / sizes[i]);
        const mean = averages.reduce((sum, value) => sum + value, 0) / sizes.length;
        return {
            spread: Math.max(...averages) - Math.min(...averages),
            variance: averages.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sizes.length
        };
    }

    function tierViolations(teams) {
        return TIERS.reduce((total, tier) => {
            const counts = teams.map(team => team.filter(p => p.tier === tier).length);
            return total + Math.max(0, Math.max(...counts) - Math.min(...counts) - 1);
        }, 0);
    }

    function metrics(teams) {
        const tierScore = TIERS.reduce((score, tier) => {
            const counts = teams.map(t => t.filter(p => p.tier === tier).length);
            const total = counts.reduce((sum, n) => sum + n, 0), base = Math.floor(total / teams.length), remainder = total % teams.length;
            const ideal = (teams.length - remainder) * base * base + remainder * (base + 1) ** 2;
            return score + counts.reduce((sum, n) => sum + n * n, 0) - ideal;
        }, 0);
        return { ...averageMetrics(teams.map(t => t.reduce((sum, p) => sum + weight(p), 0)), teams.map(t => t.length)), stacking: tierViolations(teams), tierScore };
    }

    function better(a, b) {
        return a.spread < b.spread - EPSILON || (Math.abs(a.spread - b.spread) <= EPSILON && a.variance < b.variance - EPSILON);
    }

    // Every tier gets floor(count / teams) seats per team. Its remainder goes to
    // distinct teams with the most seats left. Balanced capacities keep this feasible.
    function draft(roster, sizes, random = Math.random, locks = {}) {
        validate(roster, sizes, locks);
        const teams = sizes.map((_, i) => roster.filter(p => locks[identity(p)] === i));
        const groups = TIERS.map(tier => shuffle(roster.filter(p => p.tier === tier && !Object.hasOwn(locks, identity(p))), random).sort((a, b) => weight(b) - weight(a)));
        const lockedQuotas = Object.keys(locks).length ? allocateLockedQuotas(roster, sizes, locks, random) : null;
        const baseSeats = groups.reduce((sum, group) => sum + Math.floor(group.length / sizes.length), 0);
        const extrasLeft = sizes.map(size => size - baseSeats);
        const sums = teams.map(team => team.reduce((sum, p) => sum + weight(p), 0));
        for (const [tierIndex, group] of groups.entries()) {
            const quotas = lockedQuotas ? lockedQuotas[tierIndex].slice() : sizes.map(() => Math.floor(group.length / sizes.length));
            if (!lockedQuotas) {
                const extraTeams = shuffle(sizes.map((_, i) => i), random).sort((a, b) => extrasLeft[b] - extrasLeft[a]);
                for (const i of extraTeams.slice(0, group.length % sizes.length)) { quotas[i]++; extrasLeft[i]--; }
            }
            for (const player of group) {
                const available = shuffle(quotas.map((_, i) => i).filter(i => quotas[i] > 0), random);
                available.sort((a, b) => sums[a] / sizes[a] - sums[b] / sizes[b]);
                const i = available[0];
                teams[i].push(player);
                sums[i] += weight(player);
                quotas[i]--;
            }
        }
        return teams;
    }

    // Min-cost flow assigns remaining tier seats around locks. Incremental square
    // costs minimize total tier-count variance exactly, including unavoidable stacking.
    function allocateLockedQuotas(roster, sizes, locks, random) {
        const source = 0, tierStart = 1, teamStart = 1 + TIERS.length, sink = teamStart + sizes.length;
        const graph = Array.from({ length: sink + 1 }, () => []);
        function edge(from, to, cap, cost) {
            const forward = { to, cap, cost, reverse: graph[to].length };
            const back = { to: from, cap: 0, cost: -cost, reverse: graph[from].length };
            graph[from].push(forward); graph[to].push(back);
            return forward;
        }
        const fixed = sizes.map((_, i) => roster.filter(p => locks[identity(p)] === i));
        const available = sizes.map((size, i) => size - fixed[i].length);
        const seatEdges = TIERS.map(() => sizes.map(() => []));
        for (const ti of shuffle(TIERS.map((_, i) => i), random)) {
            const remaining = roster.filter(p => p.tier === TIERS[ti] && !Object.hasOwn(locks, identity(p))).length;
            edge(source, tierStart + ti, remaining, 0);
            for (const team of shuffle(sizes.map((_, i) => i), random)) {
                const count = fixed[team].filter(p => p.tier === TIERS[ti]).length;
                for (let slot = 1; slot <= Math.min(remaining, available[team]); slot++) {
                    seatEdges[ti][team].push(edge(tierStart + ti, teamStart + team, 1, 2 * (count + slot) - 1));
                }
            }
        }
        available.forEach((capacity, i) => edge(teamStart + i, sink, capacity, 0));
        const required = available.reduce((sum, n) => sum + n, 0);
        for (let sent = 0; sent < required; sent++) {
            const distance = graph.map(() => Infinity), previous = graph.map(() => null);
            distance[source] = 0;
            // Residual reverse edges can have negative costs; Bellman-Ford keeps
            // each integral augmentation optimal without an external solver.
            for (let pass = 0; pass < graph.length - 1; pass++) {
                let changed = false;
                for (let from = 0; from < graph.length; from++) graph[from].forEach((e, index) => {
                    if (e.cap > 0 && distance[from] + e.cost < distance[e.to]) {
                        distance[e.to] = distance[from] + e.cost; previous[e.to] = [from, index]; changed = true;
                    }
                });
                if (!changed) break;
            }
            if (!previous[sink]) throw new Error('고정 선수를 유지할 수 있는 팀 정원이 없습니다.');
            for (let to = sink; to !== source;) {
                const [from, index] = previous[to], e = graph[from][index];
                e.cap--; graph[to][e.reverse].cap++; to = from;
            }
        }
        return seatEdges.map(row => row.map(edges => edges.reduce((sum, e) => sum + 1 - e.cap, 0)));
    }

    // Cached totals/counts make a proposed exchange O(number of teams), not O(roster).
    // Tier quotas are hard constraints; even a perfect average cannot override them.
    function optimize(teams, locks = {}) {
        const sizes = teams.map(t => t.length);
        const sums = teams.map(t => t.reduce((sum, p) => sum + weight(p), 0));
        const counts = teams.map(t => Object.fromEntries(TIERS.map(tier => [tier, t.filter(p => p.tier === tier).length])));

        for (let iteration = 0; iteration < 80; iteration++) {
            let best = averageMetrics(sums, sizes);
            let move = null;
            function consider(indices, positions, incoming) {
                const outgoing = indices.map((i, slot) => teams[i][positions[slot]]);
                if (outgoing.some(p => Object.hasOwn(locks, identity(p)))) return;
                const tierDelta = indices.reduce((delta, i, slot) => outgoing[slot].tier === incoming[slot].tier ? delta :
                    delta + 2 * (counts[i][incoming[slot].tier] - counts[i][outgoing[slot].tier] + 1), 0);
                if (tierDelta !== 0) return;
                if (outgoing.every((p, slot) => weight(p) === weight(incoming[slot]))) return;
                const before = indices.map(i => sums[i]);
                indices.forEach((i, slot) => { sums[i] += weight(incoming[slot]) - weight(outgoing[slot]); });
                const score = averageMetrics(sums, sizes);
                if (better(score, best)) { best = score; move = { indices, positions, incoming }; }
                indices.forEach((i, slot) => { sums[i] = before[slot]; });
            }
            for (let a = 0; a < teams.length; a++) for (let b = a + 1; b < teams.length; b++) {
                for (let pa = 0; pa < sizes[a]; pa++) for (let pb = 0; pb < sizes[b]; pb++) {
                    consider([a, b], [pa, pb], [teams[b][pb], teams[a][pa]]);
                }
            }
            // Try a three-team cycle only after pair exchanges stop improving.
            if (!move) {
                for (let a = 0; a < teams.length; a++) for (let b = a + 1; b < teams.length; b++) for (let c = b + 1; c < teams.length; c++) {
                    for (let pa = 0; pa < sizes[a]; pa++) for (let pb = 0; pb < sizes[b]; pb++) for (let pc = 0; pc < sizes[c]; pc++) {
                        consider([a, b, c], [pa, pb, pc], [teams[c][pc], teams[a][pa], teams[b][pb]]);
                        consider([a, b, c], [pa, pb, pc], [teams[b][pb], teams[c][pc], teams[a][pa]]);
                    }
                }
            }
            if (!move) break;
            move.indices.forEach((i, slot) => {
                const out = teams[i][move.positions[slot]], incoming = move.incoming[slot];
                sums[i] += weight(incoming) - weight(out);
                counts[i][out.tier]--;
                counts[i][incoming.tier]++;
                teams[i][move.positions[slot]] = incoming;
            });
        }
        return teams;
    }

    function selectCandidate(candidates, { history = [], previews = [], lastKey = '', onFieldCount, random = Math.random } = {}) {
        const alternatives = candidates.filter(t => teamKey(t) !== lastKey);
        const eligible = alternatives.length ? alternatives : candidates;
        const pairs = new Map(), debts = new Map();
        const records = [...previews.slice(0, 5), ...history.slice(0, 20)];
        let totalHistoryWeight = 0;
        records.forEach((entry, index) => {
            const importance = records.length - index;
            totalHistoryWeight += importance;
            entry.teams.forEach(team => {
                for (let a = 0; a < team.length; a++) for (let b = a + 1; b < team.length; b++) {
                    const key = pairKey(team[a], team[b]);
                    pairs.set(key, (pairs.get(key) || 0) + importance);
                }
            });
        });
        // With equal substitutions, rest fraction is (roster - starters) / roster.
        // Measure each player's excess relative to that match's participant average.
        history.slice(0, 20).forEach(entry => {
            if (!Number.isInteger(entry.onFieldCount) || entry.teams.some(t => t.length < entry.onFieldCount)) return;
            const total = entry.teams.reduce((sum, t) => sum + t.length, 0);
            const expected = (total - entry.teams.length * entry.onFieldCount) / total;
            entry.teams.forEach(team => team.forEach(player => {
                const id = identity(player);
                debts.set(id, (debts.get(id) || 0) + (team.length - entry.onFieldCount) / team.length - expected);
            }));
        });
        let best = Infinity, chosen = eligible[0], ties = 0;
        for (const teams of eligible) {
            let repetition = 0, pairCount = 0, rotation = 0;
            const total = teams.reduce((sum, t) => sum + t.length, 0);
            const starters = onFieldCount || Math.min(...teams.map(t => t.length));
            const expected = (total - teams.length * starters) / total;
            teams.forEach(team => {
                for (let a = 0; a < team.length; a++) for (let b = a + 1; b < team.length; b++) {
                    repetition += pairs.get(pairKey(team[a], team[b])) || 0;
                    pairCount++;
                }
                team.forEach(player => {
                    const debt = debts.get(identity(player)) || 0;
                    const next = debt + (team.length - starters) / team.length - expected;
                    rotation += next * next;
                });
            });
            const score = repetition / Math.max(1, pairCount * totalHistoryWeight) + rotation / total;
            if (score < best - EPSILON) { best = score; chosen = teams; ties = 1; }
            else if (Math.abs(score - best) <= EPSILON && random() < 1 / ++ties) chosen = teams;
        }
        return chosen;
    }

    async function generate(roster, sizes, options = {}) {
        const locks = options.locks || {};
        validate(roster, sizes, locks);
        const random = options.random || Math.random;
        const yieldTask = options.yieldTask || (() => Promise.resolve());
        const pool = new Map();
        let bestTeams, bestScore;
        function add(teams) {
            const score = metrics(teams);
            if (bestScore && score.tierScore !== bestScore.tierScore) return;
            if (!bestScore || better(score, bestScore)) { bestScore = score; bestTeams = copyTeams(teams); }
            if (pool.size < 200) pool.set(teamKey(teams), { teams: copyTeams(teams), score });
        }
        for (let attempt = 0; attempt < 12; attempt++) {
            add(optimize(draft(roster, sizes, random, locks), locks));
            await yieldTask();
        }
        // Perturb within the same hard tier quotas, including same-tier exchanges.
        for (let trial = 0; trial < 600; trial++) {
            const variant = copyTeams(bestTeams);
            const swaps = 1 + Math.floor(random() * 4);
            for (let s = 0; s < swaps; s++) {
                const a = Math.floor(random() * sizes.length);
                let b = Math.floor(random() * (sizes.length - 1));
                if (b >= a) b++;
                const pa = Math.floor(random() * sizes[a]), pb = Math.floor(random() * sizes[b]);
                if (Object.hasOwn(locks, identity(variant[a][pa])) || Object.hasOwn(locks, identity(variant[b][pb]))) continue;
                [variant[a][pa], variant[b][pb]] = [variant[b][pb], variant[a][pa]];
            }
            const score = metrics(variant);
            if (score.tierScore === bestScore.tierScore && score.spread <= bestScore.spread + 0.3 + EPSILON) add(variant);
            if (trial % 100 === 99) await yieldTask();
        }
        // Always retain the best result even after the candidate cache fills.
        pool.set(teamKey(bestTeams), { teams: bestTeams, score: bestScore });
        let candidates = [], tolerance = 0.1;
        for (let step = 1; step <= 3; step++) {
            tolerance = step * 0.1;
            candidates = [...pool.values()].filter(x => x.score.spread <= bestScore.spread + tolerance + EPSILON).map(x => x.teams);
            if (candidates.length >= 8) break;
        }
        const chosen = selectCandidate(candidates, { ...options, random });
        // Locked players pin team numbers as well as teammates.
        const teams = Object.keys(locks).length ? chosen : shuffle(chosen, random);
        return { teams, teamSizes: teams.map(t => t.length), metrics: metrics(teams), bestSpread: bestScore.spread, tolerance, candidateCount: candidates.length, repeated: teamKey(teams) === options.lastKey };
    }

    const api = { TIER_WEIGHTS, TIERS, identity, weight, shuffle, teamKey, pairKey, validate, metrics, tierViolations, draft, optimize, selectCandidate, generate };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.TeamBuilder = api;
    if (typeof WorkerGlobalScope !== 'undefined' && root instanceof WorkerGlobalScope) {
        root.onmessage = async event => {
            try { root.postMessage({ result: await generate(event.data.roster, event.data.sizes, event.data.options) }); }
            catch (error) { root.postMessage({ error: error.message }); }
        };
    }
})(typeof self !== 'undefined' ? self : globalThis);
