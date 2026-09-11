const test = require('node:test');
const assert = require('node:assert/strict');
const builder = require('../team-builder.js');

function randomSeed(seed) {
    return () => { seed = (seed + 0x6D2B79F5) | 0; let t = seed; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const player = (i, tier = 'B', rating = builder.TIER_WEIGHTS[tier]) => ({ id: 'p' + i, name: '선수' + i, tier, rating });
const sizesFor = (n, k) => Array.from({ length: k }, (_, i) => Math.floor(n / k) + (i < n % k ? 1 : 0));
function verify(roster, sizes, result) {
    assert.deepEqual(result.teams.flat().map(p => p.id).sort(), roster.map(p => p.id).sort());
    assert.deepEqual(result.teamSizes.slice().sort((a,b) => a-b), sizes.slice().sort((a,b) => a-b));
    assert.deepEqual(result.teamSizes, result.teams.map(t => t.length));
    assert.equal(builder.tierViolations(result.teams), 0);
    assert(result.metrics.spread <= result.bestSpread + result.tolerance + 1e-9);
}

test('same-tier exchanges use continuous ratings', () => {
    const teams = [[4.4,4.4,4.4,3.6,3.6].map((r,i) => player(i,'B',r)), [4.4,3.6,3.6,3.6,3.6].map((r,i) => player(i+5,'B',r))];
    assert(Math.abs(builder.metrics(teams).spread - 0.32) < 1e-9);
    builder.optimize(teams);
    assert(builder.metrics(teams).spread < 1e-9);
});

test('all tiers, including emperor, must be distributed before average balance', async () => {
    const tiers = ['B+','B','S','A-','C','A+','B+','A-','C','A+'];
    const roster = tiers.map((tier,i) => player(i,tier));
    const result = await builder.generate(roster,[5,5], { random: randomSeed(1) });
    verify(roster,[5,5],result);
    assert(result.metrics.spread >= 0.6 - 1e-9); // Average 0 requires concentrating both C players.
    const emperors = Array.from({length:12},(_,i) => player(i, i<4 ? '황제' : 'B'));
    verify(emperors,[4,4,4],await builder.generate(emperors,[4,4,4],{random:randomSeed(2)}));
});

test('roster and tier invariants across sizes and rating distributions', async () => {
    let generations = 0;
    for (let n = 10; n <= 32; n++) for (let k = 2; k <= 4; k++) {
        if (Math.floor(n/k) < 5) continue;
        for (let sample = 0; sample < 3; sample++) {
            const random = randomSeed(n*100+k*10+sample);
            const roster = Array.from({length:n},(_,i) => {
                const tier = sample === 0 ? 'B' : builder.TIERS[Math.floor(random()*builder.TIERS.length)];
                return player(i,tier,Math.max(1,Math.min(11,builder.TIER_WEIGHTS[tier]+(random()-.5)*.8)));
            });
            const original = JSON.stringify(roster);
            const sizes = sizesFor(n,k);
            verify(roster,sizes,await builder.generate(roster,sizes,{random}));
            assert.equal(JSON.stringify(roster),original);
            generations++;
        }
    }
    console.log('Validated roster/tier/tolerance invariants for ' + generations + ' generations');
});

test('repeat avoidance excludes the last composition, including team-number changes', () => {
    const roster = Array.from({length:10},(_,i) => player(i));
    const a = [roster.slice(0,5),roster.slice(5)];
    const b = [[...roster.slice(0,4),roster[5]],[roster[4],...roster.slice(6)]];
    const history = [a,b,b,b,b].map(teams => ({teams,onFieldCount:5}));
    assert.equal(builder.teamKey(builder.selectCandidate([a,b],{history,lastKey:builder.teamKey(a.slice().reverse())})),builder.teamKey(b));
    assert.equal(builder.teamKey(builder.selectCandidate([a],{history,lastKey:builder.teamKey(a)})),builder.teamKey(a));
});

test('confirmed substitution burden breaks ties toward rotation', () => {
    const roster = Array.from({length:11},(_,i) => player(i));
    const a = [roster.slice(0,6),roster.slice(6)];
    const b = [[roster[0],...roster.slice(6)],roster.slice(1,6)];
    const history = Array.from({length:5},() => ({teams:a,onFieldCount:5}));
    const selected = builder.selectCandidate([a,b],{history,onFieldCount:5,random:randomSeed(1)});
    assert.equal(builder.teamKey(selected),builder.teamKey(b));
});

test('200 rerolls retain invariants and change compositions when alternatives exist', async () => {
    const random = randomSeed(6789);
    const roster = ['S','A+','A','A-','B+','B','C','D','S','A+','A','A-','B+'].map((tier,i)=>player(i,tier));
    const previews = [], keys = new Set(); let lastKey = '';
    for (let i=0;i<200;i++) {
        const result = await builder.generate(roster,[7,6],{random,previews,lastKey,onFieldCount:6});
        verify(roster,[7,6],result);
        if (result.candidateCount > 1) assert.notEqual(builder.teamKey(result.teams),lastKey);
        lastKey = builder.teamKey(result.teams); keys.add(lastKey);
        previews.unshift({teams:result.teams,onFieldCount:6}); previews.splice(5);
    }
    assert(keys.size > 20);
    console.log('200 rerolls produced ' + keys.size + ' distinct compositions');
});

test('invalid input fails explicitly', async () => {
    const roster = Array.from({length:10},(_,i)=>player(i));
    await assert.rejects(builder.generate(roster,[6,6]));
    await assert.rejects(builder.generate(roster,[8,2]));
    await assert.rejects(builder.generate([...roster.slice(0,9),roster[0]],[5,5]));
    await assert.rejects(builder.generate([player(0,'unknown'),...roster.slice(1)],[5,5]));
});

test('identifiers containing separators do not collide', () => {
    assert.notEqual(builder.pairKey({id:'a||b'},{id:'c'}),builder.pairKey({id:'a'},{id:'b||c'}));
});

test('locked players stay in their numbered teams through 60 rerolls', async () => {
    const roster = Array.from({length:17},(_,i)=>player(i,builder.TIERS[i%9]));
    const sizes = [6,5,6], locks = {p0:0,p1:0,p8:1,p12:2};
    const random = randomSeed(8181); let lastKey = '';
    for(let i=0;i<60;i++) {
        const result = await builder.generate(roster,sizes,{locks,random,lastKey,onFieldCount:5});
        assert.deepEqual(result.teamSizes,sizes);
        assert.deepEqual(result.teams.flat().map(p=>p.id).sort(),roster.map(p=>p.id).sort());
        for(const [id,team] of Object.entries(locks)) assert(result.teams[team].some(p=>p.id===id));
        assert.equal(result.metrics.tierScore,0);
        lastKey = builder.teamKey(result.teams);
    }
});

test('tier allocation around locks matches exhaustive search, including unavoidable stacking', async () => {
    const random = randomSeed(831), sizes = [4,4];
    for(let sample=0;sample<24;sample++) {
        const roster=Array.from({length:8},(_,i)=>player(i,['S','B','D'][Math.floor(random()*3)]));
        const locks={p0:0,p1:0,p2:sample%2,p7:1};
        let optimum=Infinity;
        for(let mask=0;mask<256;mask++) {
            const teams=[[],[]];roster.forEach((p,i)=>teams[(mask>>i)&1].push(p));
            if(teams[0].length!==4 || Object.entries(locks).some(([id,team])=>!teams[team].some(p=>p.id===id))) continue;
            optimum=Math.min(optimum,builder.metrics(teams).tierScore);
        }
        const result=await builder.generate(roster,sizes,{locks,random});
        assert.equal(result.metrics.tierScore,optimum);
        for(const [id,team] of Object.entries(locks)) assert(result.teams[team].some(p=>p.id===id));
    }
    const forced=[player(0,'S'),player(1,'S'),...Array.from({length:8},(_,i)=>player(i+2))];
    const result=await builder.generate(forced,[5,5],{locks:{p0:0,p1:0},random});
    assert(result.metrics.stacking>0);
    assert(result.teams[0].some(p=>p.id==='p0') && result.teams[0].some(p=>p.id==='p1'));
});

test('all-locked rosters are stable and unlocking restores random movement',async()=>{
    const roster=Array.from({length:10},(_,i)=>player(i));
    const locks=Object.fromEntries(roster.map((p,i)=>[p.id,i<5?0:1]));
    const random=randomSeed(741);
    const fixed=await builder.generate(roster,[5,5],{locks,random});
    assert.equal(fixed.candidateCount,1);
    assert.deepEqual(fixed.teams.map(t=>t.map(p=>p.id).sort()),[roster.slice(0,5).map(p=>p.id),roster.slice(5).map(p=>p.id)]);
    delete locks.p4;delete locks.p5;
    const unlocked=await builder.generate(roster,[5,5],{locks,random,lastKey:builder.teamKey(fixed.teams)});
    assert(unlocked.teams[1].some(p=>p.id==='p4'));
    assert(unlocked.teams[0].some(p=>p.id==='p5'));
});

test('impossible lock capacities and missing teams fail without moving locks',async()=>{
    const roster=Array.from({length:10},(_,i)=>player(i));
    await assert.rejects(builder.generate(roster,[5,5],{locks:{p0:3}}),/고정한 선수의 팀/);
    await assert.rejects(builder.generate(roster,[5,5],{locks:Object.fromEntries(roster.slice(0,6).map(p=>[p.id,0]))}),/정원/);
    await assert.rejects(builder.generate(roster,[5,5],{locks:{absent:0}}));
});

test('the designated keeper always joins a largest roster across sizes, tiers and team-number permutations',async()=>{
    const layouts=[[6,7],[7,6],[6,6,7],[6,7,6],[7,6,6],[6,7,7],[7,6,7],[7,7,6],[6,6,6,7],[11,12]];
    for(const [layout,sizes] of layouts.entries()) for(const [tierIndex,tier] of builder.TIERS.entries()) {
        const roster=Array.from({length:sizes.reduce((a,b)=>a+b,0)},(_,i)=>player(i,builder.TIERS[i%9]));
        roster[0]={...player(0,tier),name:'문찬우'};
        const before=JSON.stringify(roster), capacities=sizes.slice();
        const result=await builder.generate(roster,sizes,{largerTeamPlayerId:'p0',random:randomSeed(8700+layout*20+tierIndex)});
        verify(roster,sizes,result);
        assert.equal(result.teams.find(team=>team.some(p=>p.id==='p0')).length,Math.max(...sizes));
        assert.equal(result.largerTeamPlayerId,'p0');
        assert.equal(JSON.stringify(roster),before);
        assert.deepEqual(sizes,capacities);
    }
});

test('equal rosters do not restrict the keeper and omitting the rule preserves normal generation',async()=>{
    const roster=Array.from({length:12},(_,i)=>player(i));
    const normal=await builder.generate(roster,[6,6],{random:randomSeed(891)});
    const keeper=await builder.generate(roster,[6,6],{random:randomSeed(891),largerTeamPlayerId:'p0'});
    assert.deepEqual(keeper,normal);
    assert.equal(keeper.largerTeamPlayerId,undefined);
    const seen=new Set();
    const uneven=roster.concat(player(12));
    for(let i=0;i<20;i++) {
        const result=await builder.generate(uneven,[6,7],{random:randomSeed(910+i)});
        seen.add(result.teams.find(team=>team.some(p=>p.id==='p0')).length);
    }
    assert.deepEqual([...seen].sort(),[6,7]);
});

test('multiple large teams remain eligible through rerolls while unrelated numbered locks stay fixed',async()=>{
    const roster=Array.from({length:20},(_,i)=>player(i));
    const locks={p1:2}, seen=new Set(), keys=new Set(), random=randomSeed(29876);
    let lastKey='';
    for(let i=0;i<30;i++) {
        const result=await builder.generate(roster,[7,7,6],{locks,largerTeamPlayerId:'p0',random,lastKey});
        verify(roster,[7,7,6],result);
        seen.add(result.teams.findIndex(team=>team.some(p=>p.id==='p0')));
        assert(result.teams[2].some(p=>p.id==='p1'));
        assert.notEqual(builder.teamKey(result.teams),lastKey);
        lastKey=builder.teamKey(result.teams);keys.add(lastKey);
    }
    assert.deepEqual([...seen].sort(),[0,1]);
    assert(keys.size>10);
    assert.deepEqual(locks,{p1:2});
});

test('a keeper locked to a smaller team keeps that team number by reallocating the spare roster seat',async()=>{
    for(const sizes of [[6,7],[6,7,7],[6,6,7]]) {
        const roster=Array.from({length:sizes.reduce((a,b)=>a+b,0)},(_,i)=>player(i));
        const locks={p0:0,p1:1};
        const originalSizes=sizes.slice();
        const result=await builder.generate(roster,sizes,{locks,largerTeamPlayerId:'p0',random:randomSeed(539)});
        verify(roster,sizes,result);
        assert.equal(result.teamSizes[0],7);
        assert(result.teams[0].some(p=>p.id==='p0'));
        assert(result.teams[1].some(p=>p.id==='p1'));
        assert.deepEqual(sizes,originalSizes);
        assert.deepEqual(locks,{p0:0,p1:1});
    }
});

test('large-team choice attains the minimum tier concentration permitted by keeper and lock rules',async()=>{
    const sizes=[3,3,2];
    for(let sample=0;sample<7;sample++) {
        const random=randomSeed(409+sample);
        const roster=Array.from({length:8},(_,i)=>player(i,sample===0?(i<2?'S':'B'):['S','B','C'][Math.floor(random()*3)]));
        const locks=sample===0?{p1:0}:{p1:0,p2:sample%3};
        let optimum=Infinity;
        for(let code=0;code<3**8;code++) {
            let value=code;
            const teams=[[],[],[]];
            for(const p of roster) {teams[value%3].push(p);value=Math.floor(value/3);}
            if(teams.some((t,i)=>t.length!==sizes[i]) || teams[2].some(p=>p.id==='p0') ||
                Object.entries(locks).some(([id,i])=>!teams[i].some(p=>p.id===id))) continue;
            optimum=Math.min(optimum,builder.metrics(teams).tierScore);
        }
        const result=await builder.generate(roster,sizes,{locks,largerTeamPlayerId:'p0',random});
        assert.equal(result.metrics.tierScore,optimum);
        if(sample===0) {
            assert.equal(optimum,0);
            assert(result.teams[1].some(p=>p.id==='p0'));
        }
    }
});

test('conflicting full-team locks report an actionable error and never move locked players',async()=>{
    const roster=Array.from({length:13},(_,i)=>player(i));roster[0].name='문찬우';
    for(const pinKeeper of [false,true]) {
        const locks=Object.fromEntries(roster.slice(1,8).map(p=>[p.id,1]));
        if(pinKeeper) locks.p0=0;
        const before=JSON.stringify(locks);
        await assert.rejects(builder.generate(roster,[6,7],{locks,largerTeamPlayerId:'p0'}),/문찬우.*잠금.*해제/);
        assert.equal(JSON.stringify(locks),before);
    }
    await assert.rejects(builder.generate(roster,[6,7],{largerTeamPlayerId:'absent'}),/선택 명단/);
});

test('the worker entry point transports the same keeper placement rule',async()=>{
    const vm=require('node:vm'), fs=require('node:fs'), path=require('node:path');
    class WorkerScope {}
    const worker=new WorkerScope();
    let response;
    worker.postMessage=message=>{response=message;};
    const context=vm.createContext({self:worker,WorkerGlobalScope:WorkerScope});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../team-builder.js'),'utf8'),context);
    const roster=Array.from({length:19},(_,i)=>player(i));
    await worker.onmessage({data:{roster,sizes:[6,6,7],options:{largerTeamPlayerId:'p0'}}});
    assert(!response.error);
    assert.equal(response.result.teams.find(team=>team.some(p=>p.id==='p0')).length,7);
    assert.equal(response.result.largerTeamPlayerId,'p0');
});

module.exports = {randomSeed,player,sizesFor,verify};
