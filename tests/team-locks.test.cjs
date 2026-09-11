const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const TeamBuilder = require('../team-builder.js');
const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

function extract(name) {
    const start = new RegExp('^        (?:async )?function ' + name + '\\(', 'm').exec(source);
    assert(start, name);
    const rest = source.slice(start.index);
    const end = /^        }\r?$/m.exec(rest);
    assert(end, name + ' closing brace');
    return rest.slice(0, end.index + end[0].length);
}

function setup() {
    const players = Array.from({length:18}, (_, i) => ({id:'p'+i,name:'선수'+i,tier:'B',baseTier:'B',rating:4}));
    const teams = [players.slice(0,6),players.slice(6,12)];
    const elements = new Map(), messages = [], calls = [], subscribers = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id,{value:'auto',textContent:id,disabled:false,style:{}});
        return elements.get(id);
    };
    const c = vm.createContext({
        TeamBuilder, console, players, selectedPlayers:new Set(players.slice(0,12).map(p=>p.name)),
        currentTeamsData:teams, currentTeamSizes:[6,6], currentTeamMeta:{mode:'futsal',onFieldCount:6},
        playerTeamLocks:Object.create(null), pendingPlayerSwap:null, teamConfigurationVersion:0, teamGenerationRunning:false,
        tierWeights:TeamBuilder.TIER_WEIGHTS, searchQuery:'', tierFilter:'all', isAdmin:true,
        playersListener:null, votesListener:null, latestVotes:null, ratingRefreshSequence:0,
        teamPreviewHistory:[], CONFIRMED_TEAM_HISTORY_KEY:'confirmed', visibleTeamHistory:[],
        document:{getElementById:element,querySelectorAll:()=>[]},
        renderPlayers:()=>{}, updateSelectionCounter:()=>{}, sortPlayersByName:()=>{}, renderTierTable:()=>{},
        renderTeams:(teams,sizes)=>{c.currentTeamsData=teams;c.currentTeamSizes=sizes;c.renderedLocks=Object.keys(c.playerTeamLocks);c.updatePlayerSwapSelection();},
        showToast:message=>messages.push(message), showConfirm:async()=>true,
        readTeamHistory:()=>[], makeTeamHistoryEntry:(teams,meta)=>({teams,...meta}),
        markTeamsUnconfirmed:()=>{c.currentTeamMeta.confirmed=false;},
        updateTiersFromVotes:async()=>{},
        db:{collection:name=>({
            onSnapshot:callback=>{subscribers.set(name,callback);return()=>subscribers.delete(name);},
            doc:()=>({delete:async()=>{}}), where:()=>({get:async()=>({empty:true})})
        })},
        generateTeamsOffThread:async(roster,sizes,options)=>{
            calls.push(options);
            return TeamBuilder.generate(roster,sizes,options);
        }
    });
    for(const name of [
        'updatePlayerSwapSelection','clearPlayerSwapSelection','selectPlayerForSwap','swapTeamPlayers','finishManualTeamEdit','updateUIForPermission',
        'resetPlayerLocks','prepareTeamGeneration','getSelectedPlayerIds','setSelectedPlayers',
        'togglePlayerSelection','selectAllPlayers','deselectAllPlayers','filterPlayers',
        'togglePlayerLock','normalizePlayer','setupRealtimeListener','deletePlayerById',
        'getEffectiveWeight','getFutsalTeamSizes','computeEvenTeamSizes','getSoccerTeamSizes',
        'runTeamGeneration','generateFutsalTeams','generateSoccerTeams','restoreTeamHistory'
    ]) vm.runInContext(extract(name),c);
    c.togglePlayerLock('p0',0);
    c.togglePlayerLock('p6',1);
    return {c,elements,messages,calls,subscribers};
}

const lockCount = c => Object.keys(c.playerTeamLocks).length;

test('adding or deselecting any player immediately releases all locks and redraws them',()=>{
    for(const [name,checked] of [['선수12',true],['선수1',false],['선수0',false]]) {
        const {c,messages}=setup();
        c.togglePlayerSelection(name,checked);
        assert.equal(lockCount(c),0);
        assert.equal(c.renderedLocks.length,0);
        assert.equal(messages.length,1);
    }
});

test('bulk and filtered selection changes release all locks once',()=>{
    for(const action of ['selectAllPlayers','deselectAllPlayers']) {
        const {c,messages}=setup();
        c[action]();
        assert.equal(lockCount(c),0);
        assert.equal(messages.length,1);
    }
    const {c}=setup();
    c.searchQuery='선수12';
    c.selectAllPlayers();
    assert(c.selectedPlayers.has('선수12'));
    assert.equal(c.selectedPlayers.size,13);
    assert.equal(lockCount(c),0);
});

test('unchanged selection, reordering, or a display-only search preserves locks',()=>{
    const {c,elements,messages}=setup();
    c.togglePlayerSelection('선수0',true);
    c.togglePlayerSelection('선수12',false);
    assert.equal(c.setSelectedPlayers([...c.selectedPlayers].reverse()),false);
    c.players=c.players.slice(0,12);
    c.selectAllPlayers();
    c.document.getElementById('playerSearchInput').value='선수0';
    c.filterPlayers();
    assert.equal(lockCount(c),2);
    assert.equal(c.teamConfigurationVersion,0);
    assert.equal(messages.length,0);
});

test('futsal/soccer switches release locks before generating while same-mode rerolls keep them',async()=>{
    for(const [from,to] of [['futsal','soccer'],['soccer','futsal']]) {
        const {c,calls}=setup();
        c.currentTeamMeta.mode=from;
        await c[to==='soccer'?'generateSoccerTeams':'generateFutsalTeams']();
        assert.equal(lockCount(c),0);
        assert.equal(Object.keys(calls[0].locks).length,0);
        assert.equal(c.currentTeamMeta.mode,to);
    }
    const {c,calls}=setup();
    await c.generateFutsalTeams();
    assert.equal(lockCount(c),2);
    assert.equal(calls[0].locks.p0,0);
    assert.equal(calls[0].locks.p6,1);
    assert(c.currentTeamsData[0].some(p=>p.id==='p0'));
    assert(c.currentTeamsData[1].some(p=>p.id==='p6'));
});

test('switching modes also releases locks if the requested game cannot yet be generated',()=>{
    const {c,calls}=setup();
    c.currentTeamMeta.mode='soccer';
    c.selectedPlayers=new Set(c.players.slice(0,8).map(p=>p.name));
    c.generateFutsalTeams();
    assert.equal(lockCount(c),0);
    assert.equal(calls.length,0);
});

test('team-count and on-field controls release locks through their actual change handlers',()=>{
    for(const id of ['teamCountSelect','onFieldCountSelect']) {
        const {c}=setup();
        const tag=new RegExp('<select\\b[^>]*id="'+id+'"[^>]*>').exec(source)[0];
        const handler=/onchange="([^"]+)"/.exec(tag);
        assert(handler,id+' change handler');
        vm.runInContext(handler[1],c);
        assert.equal(lockCount(c),0);
        assert.equal(c.teamConfigurationVersion,1);
    }
});

test('remote removal or replacement of a selected player releases locks, rating-only changes do not',()=>{
    for(const change of ['remove','replace','rating']) {
        const {c,subscribers}=setup();
        c.setupRealtimeListener();
        const rows=c.players.map(p=>({...p}));
        if(change==='remove') rows.splice(1,1);
        if(change==='replace') rows[1].id='replacement';
        if(change==='rating') rows[1].rating=4.2;
        subscribers.get('players')({docs:rows.map(p=>({id:p.id,data:()=>p}))});
        assert.equal(lockCount(c),change==='rating'?2:0);
    }
});

test('deleting a selected unlocked player releases the other players locks',async()=>{
    const {c}=setup();
    await c.deletePlayerById('p1');
    assert.equal(lockCount(c),0);
    assert(!c.selectedPlayers.has('선수1'));
});

test('restoring a previous composition releases all locks',()=>{
    const {c}=setup();
    c.visibleTeamHistory=[{teams:c.currentTeamsData,onFieldCount:6,mode:'futsal'}];
    c.restoreTeamHistory(0);
    assert.equal(lockCount(c),0);
    assert.equal(c.teamConfigurationVersion,1);
});

test('a fresh page initializes empty locks even with previous storage contents',()=>{
    const declaration=source.match(/^        let (?:playerTeamLocks|pendingPlayerSwap) = .*;$/gm).join('\n');
    const existingStorage={playerTeamLocks:JSON.stringify({p0:0,p6:1}),pendingPlayerSwap:JSON.stringify({playerId:'p1',teamIndex:0})};
    function freshPage() {
        const c=vm.createContext({localStorage:{getItem:key=>existingStorage[key]}});
        vm.runInContext(declaration,c);
        return c;
    }
    const first=freshPage();
    vm.runInContext('playerTeamLocks.p0 = 0; pendingPlayerSwap = {playerId:"p1",teamIndex:0};',first);
    assert.equal(vm.runInContext('Object.keys(playerTeamLocks).length',first),1);
    assert.equal(vm.runInContext('Object.keys(playerTeamLocks).length',freshPage()),0);
    assert.equal(vm.runInContext('pendingPlayerSwap',freshPage()),null);
});

test('selection and configuration changes cancel pending swaps even when there are no locks',()=>{
    for(const change of ['selection','teamCountSelect','onFieldCountSelect']) {
        const {c,elements}=setup();
        c.resetPlayerLocks();
        c.selectPlayerForSwap('p1',0);
        assert.equal(c.pendingPlayerSwap.playerId,'p1');
        if(change==='selection') c.togglePlayerSelection('선수12',true);
        else {
            const tag=new RegExp('<select\\b[^>]*id="'+change+'"[^>]*>').exec(source)[0];
            vm.runInContext(/onchange="([^"]+)"/.exec(tag)[1],c);
        }
        assert.equal(c.pendingPlayerSwap,null);
        assert.equal(elements.get('cancelPlayerSwapBtn').hidden,true);
    }
    const {c}=setup();
    c.selectPlayerForSwap('p1',0);
    c.setSelectedPlayers([...c.selectedPlayers].reverse());
    c.document.getElementById('playerSearchInput').value='선수0';
    c.filterPlayers();
    assert.equal(c.pendingPlayerSwap.playerId,'p1');
});

test('lock changes, history restoration and permission changes cancel pending swaps',()=>{
    for(const change of ['lock','history','permission']) {
        const {c,elements}=setup();
        c.selectPlayerForSwap('p1',0);
        if(change==='lock') c.togglePlayerLock('p1',0);
        if(change==='history') {
            c.visibleTeamHistory=[{teams:c.currentTeamsData,onFieldCount:6,mode:'futsal'}];
            c.restoreTeamHistory(0);
        }
        if(change==='permission') { c.isAdmin=false; c.updateUIForPermission(); }
        assert.equal(c.pendingPlayerSwap,null);
        assert.equal(elements.get('cancelPlayerSwapBtn').hidden,true);
        if(change==='permission') assert.equal(elements.get('playerSwapControls').hidden,true);
    }
});

test('reroll immediately cancels a swap and prevents selections while the worker is running',async()=>{
    const {c,elements}=setup();
    let release;
    c.generateTeamsOffThread=(roster,sizes,options)=>new Promise(resolve=>{
        release=async()=>resolve(await TeamBuilder.generate(roster,sizes,options));
    });
    c.selectPlayerForSwap('p1',0);
    const pending=c.generateFutsalTeams();
    assert.equal(c.pendingPlayerSwap,null);
    assert.equal(c.teamGenerationRunning,true);
    c.selectPlayerForSwap('p7',1);
    assert.equal(c.pendingPlayerSwap,null);
    await release();
    await pending;
    assert.equal(c.teamGenerationRunning,false);
    assert.equal(c.pendingPlayerSwap,null);
    assert.equal(lockCount(c),2);
    assert.match(elements.get('playerSwapSummary').textContent,/선수 이름을 한 명씩/);
    const selectable=c.currentTeamsData[1].find(p=>!Object.hasOwn(c.playerTeamLocks,p.id));
    c.selectPlayerForSwap(selectable.id,1);
    assert.equal(c.pendingPlayerSwap.playerId,selectable.id);
});

test('results computed with old locks are discarded if selection changes then changes back',async()=>{
    const {c}=setup();
    const original=c.currentTeamsData;
    let release;
    c.generateTeamsOffThread=(roster,sizes,options)=>new Promise(resolve=>{
        release=async()=>resolve(await TeamBuilder.generate(roster,sizes,options));
    });
    const pending=c.generateFutsalTeams();
    assert.equal(c.teamGenerationRunning,true);
    c.togglePlayerSelection('선수1',false);
    c.togglePlayerSelection('선수1',true);
    await release();
    await pending;
    assert.equal(c.currentTeamsData,original);
    assert.equal(c.teamPreviewHistory.length,0);
    assert.equal(lockCount(c),0);
    assert.equal(c.teamGenerationRunning,false);
    assert.equal(c.document.getElementById('futsalBtn').disabled,false);
});

test('changing on-field count during generation discards the old result',async()=>{
    const {c}=setup();
    const original=c.currentTeamsData;
    let release;
    c.generateTeamsOffThread=(roster,sizes,options)=>new Promise(resolve=>{
        release=async()=>resolve(await TeamBuilder.generate(roster,sizes,options));
    });
    const pending=c.generateFutsalTeams();
    c.document.getElementById('onFieldCountSelect').value='5';
    const tag=/<select\b[^>]*id="onFieldCountSelect"[^>]*>/.exec(source)[0];
    vm.runInContext(/onchange="([^"]+)"/.exec(tag)[1],c);
    await release();
    await pending;
    assert.equal(c.currentTeamsData,original);
    assert.equal(c.teamPreviewHistory.length,0);
    assert.equal(lockCount(c),0);
});
