const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const TeamBuilder = require('../team-builder.js');
const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

function extract(name) {
    const start = new RegExp('^        function ' + name + '\\(', 'm').exec(source);
    assert(start, name);
    const rest = source.slice(start.index);
    const end = /^        }\r?$/m.exec(rest);
    assert(end, name + ' closing brace');
    return rest.slice(0, end.index + end[0].length);
}

function setup(teamCount) {
    const sizes = Array.isArray(teamCount) ? teamCount : Array(teamCount).fill(6);
    let nextId = 0;
    const teams = sizes.map(size => Array.from({length:size}, () => {
        const i = nextId++;
        return {id:'p'+i, name:'선수'+i, tier:'B', rating:4};
    }));
    const elements = new Map(), storage = new Map(), messages = [], renderedSizes = [];
    const context = vm.createContext({
        TeamBuilder, console,
        currentTeamsData:teams, currentTeamSizes:teams.map(t=>t.length),
        currentTeamMeta:{onFieldCount:6, mode:'futsal', confirmed:false},
        playerTeamLocks:Object.create(null), pendingPlayerSwap:null, teamGenerationRunning:false, isAdmin:true,
        CONFIRMED_TEAM_HISTORY_KEY:'confirmed',
        document:{getElementById:id=>{if(!elements.has(id)) elements.set(id,{});return elements.get(id);},querySelectorAll:()=>[]},
        localStorage:{getItem:key=>storage.get(key)||null, setItem:(key,value)=>storage.set(key,value)},
        renderTeams:()=>{renderedSizes.push([...context.currentTeamSizes]);context.updatePlayerSwapSelection();},
        showToast:message=>messages.push(message)
    });
    for(const name of [
        'getEffectiveWeight','readTeamHistory','makeTeamHistoryEntry','markTeamsUnconfirmed','confirmCurrentTeams',
        'updatePlayerSwapSelection','clearPlayerSwapSelection','selectPlayerForSwap','swapTeamPlayers',
        'finishManualTeamEdit','togglePlayerLock','movePlayerToTeam'
    ]) {
        vm.runInContext(extract(name), context);
    }
    return {context,storage,elements,messages,renderedSizes};
}

test('6 versus 6 permits a two-step exchange and saves only the completed roster',()=>{
    const {context:c,storage,elements}=setup(2);
    c.confirmCurrentTeams();
    const saved=storage.get('confirmed');
    c.movePlayerToTeam('선수0',0,1);
    assert.deepEqual(c.currentTeamSizes,[5,7]);
    assert(c.currentTeamsData[1].some(p=>p.id==='p0'));
    assert.equal(c.currentTeamMeta.confirmed,false);
    assert.equal(elements.get('confirmTeamsBtn').disabled,false);
    c.confirmCurrentTeams();
    assert.equal(storage.get('confirmed'),saved);
    c.movePlayerToTeam('선수6',1,0);
    assert.deepEqual(c.currentTeamSizes,[6,6]);
    assert(c.currentTeamsData[0].some(p=>p.id==='p6'));
    c.confirmCurrentTeams();
    const history=JSON.parse(storage.get('confirmed'));
    assert.equal(history.length,2);
    assert(history[0].teams[0].some(p=>p.id==='p6'));
    assert(history[0].teams[1].some(p=>p.id==='p0'));
});

test('6 versus 6 versus 6 permits a three-team cycle without loss or duplication',()=>{
    const {context:c}=setup(3);
    const originalIds=c.currentTeamsData.flat().map(p=>p.id).sort();
    c.movePlayerToTeam('선수0',0,1);
    assert.deepEqual(c.currentTeamSizes,[5,7,6]);
    c.movePlayerToTeam('선수6',1,2);
    assert.deepEqual(c.currentTeamSizes,[5,6,7]);
    c.movePlayerToTeam('선수12',2,0);
    assert.deepEqual(c.currentTeamSizes,[6,6,6]);
    assert.deepEqual(c.currentTeamsData.flat().map(p=>p.id).sort(),originalIds);
    assert(c.currentTeamsData[0].some(p=>p.id==='p12'));
    assert(c.currentTeamsData[1].some(p=>p.id==='p0'));
    assert(c.currentTeamsData[2].some(p=>p.id==='p6'));
});

test('a locked player stays fixed until unlocked, then may leave a full six-player team',()=>{
    const {context:c}=setup(2);
    c.togglePlayerLock('p0',0);
    c.movePlayerToTeam('선수0',0,1);
    assert.deepEqual(c.currentTeamSizes,[6,6]);
    c.togglePlayerLock('p0',0);
    c.movePlayerToTeam('선수0',0,1);
    assert.deepEqual(c.currentTeamSizes,[5,7]);
});

test('a temporarily empty team can be refilled and cannot be confirmed prematurely',()=>{
    const {context:c,storage}=setup(2);
    for(let i=0;i<6;i++) c.movePlayerToTeam('선수'+i,0,1);
    assert.deepEqual(c.currentTeamSizes,[0,12]);
    c.confirmCurrentTeams();
    assert.equal(storage.has('confirmed'),false);
    for(let i=6;i<12;i++) c.movePlayerToTeam('선수'+i,1,0);
    assert.deepEqual(c.currentTeamSizes,[6,6]);
    c.confirmCurrentTeams();
    assert.equal(JSON.parse(storage.get('confirmed')).length,1);
});

test('two selections atomically swap a confirmed 6 versus 6 roster and require reconfirmation',()=>{
    const {context:c,storage,elements,renderedSizes}=setup(2);
    const original=c.currentTeamsData.map(team=>team.slice());
    c.confirmCurrentTeams();
    const saved=storage.get('confirmed');
    c.selectPlayerForSwap('p0',0);
    assert.deepEqual(c.currentTeamsData,original);
    assert.equal(c.currentTeamMeta.confirmed,true);
    assert.equal(elements.get('cancelPlayerSwapBtn').hidden,false);
    c.selectPlayerForSwap('p6',1);
    assert.deepEqual(c.currentTeamSizes,[6,6]);
    assert.deepEqual(renderedSizes,[[6,6]]);
    assert.deepEqual(c.currentTeamsData,[[original[1][0],...original[0].slice(1)],[original[0][0],...original[1].slice(1)]]);
    assert.equal(c.pendingPlayerSwap,null);
    assert.equal(elements.get('cancelPlayerSwapBtn').hidden,true);
    assert.equal(c.currentTeamMeta.confirmed,false);
    assert.equal(elements.get('confirmTeamsBtn').disabled,false);
    assert.equal(storage.get('confirmed'),saved);
    c.confirmCurrentTeams();
    const history=JSON.parse(storage.get('confirmed'));
    assert.equal(history.length,2);
    assert.equal(history[0].teams[0][0].id,'p6');
    assert.equal(history[0].teams[1][0].id,'p0');
});

test('swaps preserve every team size and player in three-team, uneven and soccer rosters',()=>{
    for(const sizes of [[6,6,6],[7,6],[7,7,6],[14,14]]) {
        const {context:c}=setup(sizes);
        if(sizes[0]===14) c.currentTeamMeta={onFieldCount:11,mode:'soccer',confirmed:false};
        const before=c.currentTeamsData.map(team=>team.slice());
        const ids=before.flat().map(p=>p.id).sort();
        const last=sizes.length-1;
        const first=before[0][2],second=before[last][3];
        c.selectPlayerForSwap(first.id,0);
        c.selectPlayerForSwap(second.id,last);
        assert.deepEqual(c.currentTeamSizes,sizes);
        assert.deepEqual(c.currentTeamsData.map(team=>team.length),sizes);
        assert.deepEqual(c.currentTeamsData.flat().map(p=>p.id).sort(),ids);
        assert.equal(c.currentTeamsData[0][2],second);
        assert.equal(c.currentTeamsData[last][3],first);
        if(last===2) assert.deepEqual(c.currentTeamsData[1],before[1]);
        assert.equal(c.currentTeamMeta.onFieldCount,sizes[0]===14?11:6);
    }
});

test('selecting the same player cancels and selecting a teammate changes the pending player',()=>{
    const {context:c,storage,elements}=setup(2);
    const original=JSON.stringify(c.currentTeamsData);
    c.selectPlayerForSwap('p0',0);
    c.selectPlayerForSwap('p0',0);
    assert.equal(c.pendingPlayerSwap,null);
    assert.equal(elements.get('cancelPlayerSwapBtn').hidden,true);
    c.selectPlayerForSwap('p0',0);
    c.selectPlayerForSwap('p1',0);
    assert.equal(c.pendingPlayerSwap.playerId,'p1');
    assert.equal(JSON.stringify(c.currentTeamsData),original);
    c.clearPlayerSwapSelection();
    assert.equal(c.pendingPlayerSwap,null);
    c.selectPlayerForSwap('p6',1);
    assert.equal(JSON.stringify(c.currentTeamsData),original);
    assert.equal(storage.size,0);
    c.selectPlayerForSwap('p1',0);
    assert.equal(c.currentTeamsData[1][0].id,'p1');
    assert.equal(c.currentTeamsData[0][0].id,'p0');
});

test('either locked participant blocks swaps while unrelated locks survive successful swaps',()=>{
    for(const [lockedId,lockedTeam] of [['p0',0],['p6',1]]) {
        const {context:c,messages}=setup(2);
        const original=JSON.stringify(c.currentTeamsData);
        c.togglePlayerLock('p1',0);
        c.togglePlayerLock(lockedId,lockedTeam);
        assert.equal(c.swapTeamPlayers('p0',0,'p6',1),false);
        c.selectPlayerForSwap(lockedId,lockedTeam);
        assert.equal(c.pendingPlayerSwap,null);
        assert.equal(JSON.stringify(c.currentTeamsData),original);
        assert.match(messages.at(-1),/자물쇠를 해제/);
        c.togglePlayerLock(lockedId,lockedTeam);
        c.selectPlayerForSwap('p0',0);
        c.selectPlayerForSwap('p6',1);
        assert.equal(c.currentTeamsData[0][0].id,'p6');
        assert.equal(c.playerTeamLocks.p1,0);
        assert.equal(Object.keys(c.playerTeamLocks).length,1);
        assert.equal(c.currentTeamsData[0][1].id,'p1');
    }
});

test('a pending swap cannot move a locked target and can finish with another unlocked target',()=>{
    const {context:c}=setup(2);
    c.togglePlayerLock('p6',1);
    const original=JSON.stringify(c.currentTeamsData);
    c.selectPlayerForSwap('p0',0);
    c.selectPlayerForSwap('p6',1);
    assert.equal(JSON.stringify(c.currentTeamsData),original);
    assert.equal(c.pendingPlayerSwap.playerId,'p0');
    c.selectPlayerForSwap('p7',1);
    assert.equal(c.currentTeamsData[1][0].id,'p6');
    assert.equal(c.currentTeamsData[1][1].id,'p0');
    assert.equal(c.playerTeamLocks.p6,1);
});

test('guests and generation in progress cannot select or swap players',()=>{
    for(const state of [{isAdmin:false},{teamGenerationRunning:true}]) {
        const {context:c,storage}=setup(2);
        const original=JSON.stringify(c.currentTeamsData);
        Object.assign(c,state);
        c.selectPlayerForSwap('p0',0);
        c.selectPlayerForSwap('p6',1);
        assert.equal(c.pendingPlayerSwap,null);
        assert.equal(c.swapTeamPlayers('p0',0,'p6',1),false);
        assert.equal(JSON.stringify(c.currentTeamsData),original);
        assert.equal(storage.size,0);
    }
});

test('invalid or stale player and team references cannot cause partial swaps',()=>{
    const {context:c}=setup(2);
    const original=JSON.stringify(c.currentTeamsData);
    for(const args of [['p0',0,'p1',0],['p0',0,'missing',1],['p0',0,'p6',9],['p0',9,'p6',1],['p6',0,'p0',1]]) {
        assert.equal(c.swapTeamPlayers(...args),false);
        assert.equal(JSON.stringify(c.currentTeamsData),original);
    }
    c.pendingPlayerSwap={playerId:'missing',teamIndex:0};
    c.selectPlayerForSwap('p6',1);
    assert.equal(c.pendingPlayerSwap.playerId,'p6');
    assert.equal(JSON.stringify(c.currentTeamsData),original);
    c.currentTeamsData=null;
    assert.doesNotThrow(()=>c.selectPlayerForSwap('p0',0));
    assert.equal(c.swapTeamPlayers('p0',0,'p6',1),false);
});

test('swaps use IDs even when names match and keep all player attributes',()=>{
    const {context:c}=setup(2);
    c.currentTeamsData.flat().forEach(p=>p.name='같은 이름');
    const first=c.currentTeamsData[0][3],second=c.currentTeamsData[1][2];
    Object.assign(first,{rating:4.2,manualTier:'B',win:3,custom:{position:'GK'}});
    c.selectPlayerForSwap(first.id,0);
    c.selectPlayerForSwap(second.id,1);
    assert.equal(c.currentTeamsData[0][3],second);
    assert.equal(c.currentTeamsData[1][2],first);
    assert.equal(c.currentTeamsData[1][2].custom.position,'GK');
    assert.equal(c.currentTeamsData[0][0].id,'p0');
    assert.equal(c.currentTeamsData[1][0].id,'p6');
});

test('manual cross-tier swaps warn about concentration without silently changing other players',()=>{
    const {context:c,elements}=setup(2);
    c.currentTeamsData[0][0].tier='S';
    c.currentTeamsData[1][0].tier='S';
    assert.equal(TeamBuilder.tierViolations(c.currentTeamsData),0);
    const before=c.currentTeamsData.map(team=>team.slice());
    c.selectPlayerForSwap('p0',0);
    c.selectPlayerForSwap('p7',1);
    assert(TeamBuilder.tierViolations(c.currentTeamsData)>0);
    assert.match(elements.get('teamGenerationSummary').textContent,/티어가 몰린/);
    assert.deepEqual(c.currentTeamsData[0].slice(1),before[0].slice(1));
    assert.equal(c.currentTeamsData[1][0],before[1][0]);
    assert.deepEqual(c.currentTeamsData[1].slice(2),before[1].slice(2));
});

test('a single-player move clears a pending swap before the next selection',()=>{
    const {context:c}=setup(2);
    c.selectPlayerForSwap('p0',0);
    c.movePlayerToTeam('선수1',0,1);
    assert.equal(c.pendingPlayerSwap,null);
    const afterMove=JSON.stringify(c.currentTeamsData);
    c.selectPlayerForSwap('p6',1);
    assert.equal(JSON.stringify(c.currentTeamsData),afterMove);
    assert.deepEqual(c.currentTeamSizes,[5,7]);
});

test('application inline JavaScript parses after editing',()=>{
    for(const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
});
