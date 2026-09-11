const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const builder = require('../team-builder.js');

// All Firebase traffic uses this local, shared fixture. No production reads/writes.
function installFirebaseFixture() {
    const listeners = new Map();
    function collection(name, filters = []) {
        const api = {
            name,
            where: (field, operator, value) => collection(name, [...filters, {field,operator,value}]),
            doc: (id = crypto.randomUUID()) => ({
                collection: name, id,
                get: async () => { const rows = await window.testDb({op:'get',name,id}); return doc(rows[0] || {id,data:null},name); },
                set: data => window.testDb({op:'write',name,id,data}),
                update: data => window.testDb({op:'write',name,id,data,merge:true}),
                delete: () => window.testDb({op:'delete',name,id})
            }),
            get: async () => snapshot(await window.testDb({op:'get',name,filters}),name),
            add: async data => { const ref=api.doc(); await ref.set(data); return ref; },
            onSnapshot: (callback, onError) => {
                const token = crypto.randomUUID();
                listeners.set(token,{name,callback,filters});
                api.get().then(value => { if(listeners.has(token)) callback(value); }).catch(onError);
                return () => listeners.delete(token);
            }
        };
        return api;
    }
    function doc(row,name) { return { id:row.id, data:()=>row.data, exists:!!row.data, ref:collection(name).doc(row.id) }; }
    function snapshot(rows,name) { return {docs:rows.map(row=>doc(row,name)),empty:!rows.length,size:rows.length}; }
    window.testDbEmit = async name => {
        for(const listener of listeners.values()) if(listener.name===name) listener.callback(await collection(name,listener.filters).get());
    };
    window.testDbListenerCount = () => listeners.size;
    const database = {
        collection,
        settings() {}, enablePersistence: async () => {},
        batch() {
            const operations=[];
            return {
                set: (ref,data)=>operations.push({op:'write',name:ref.collection,id:ref.id,data}),
                update: (ref,data)=>operations.push({op:'write',name:ref.collection,id:ref.id,data,merge:true}),
                delete: ref=>operations.push({op:'delete',name:ref.collection,id:ref.id}),
                commit: ()=>window.testDb({op:'batch',operations})
            };
        }
    };
    const firestore = ()=>database;
    firestore.FieldValue = {serverTimestamp:()=>Date.now()};
    window.firebase = {apps:[{}],firestore,initializeApp(){}};
}

test('inline application scripts parse', () => {
    const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
    for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
});

test('real Chromium application flows with isolated shared Firebase fixture', {timeout:120000}, async t => {
    const server = http.createServer((req,res) => {
        const file = path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html')));
        if(!file.startsWith(root+path.sep)) {res.writeHead(403);res.end();return;}
        if(!fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404);res.end();return;}
        res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream');
        res.end(fs.readFileSync(file));
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const url='http://127.0.0.1:'+server.address().port;
    let browser;
    const pages=[],errors=[],collections=new Map();
    const roster=Array.from({length:28},(_,i)=>({id:'p'+i,name:'선수'+String(i).padStart(2,'0'),tier:builder.TIERS[i%9],baseTier:builder.TIERS[i%9],manualTier:null,win:0,draw:0,loss:0}));
    collections.set('players',new Map(roster.map(({id,...data})=>[id,data])));
    collections.set('votes',new Map());
    async function dbCall(call) {
        if(call.op==='batch') {
            for(const operation of call.operations) await dbCall({...operation,silent:true});
            for(const name of new Set(call.operations.map(op=>op.name))) emit(name);
            return;
        }
        if(!collections.has(call.name)) collections.set(call.name,new Map());
        const rows=collections.get(call.name);
        if(call.op==='get') return [...rows].filter(([id,data])=>(!call.id || call.id===id) && (call.filters||[]).every(f=>data[f.field]===f.value)).map(([id,data])=>({id,data}));
        if(call.op==='write') rows.set(call.id,{...(call.merge?rows.get(call.id):{}),...call.data});
        if(call.op==='delete') rows.delete(call.id);
        if(!call.silent) emit(call.name);
    }
    function emit(name) { for(const page of pages) setTimeout(()=>{if(!page.isClosed()) page.evaluate(name=>window.testDbEmit(name),name).catch(error=>errors.push(error.message));},0); }
    async function openPage({mobile=false,worker=true}={}) {
        const context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{});
        const page=await context.newPage(); pages.push(page);
        page.on('pageerror',error=>errors.push(error.message));
        await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.fulfill({status:200,body:'',contentType:'application/javascript'}));
        await page.exposeFunction('testDb',dbCall);
        await page.addInitScript(installFirebaseFixture);
        if(!worker) await page.addInitScript(()=>{window.Worker=undefined;});
        await page.goto(url);
        await page.waitForSelector('#adminModal.active');
        await page.evaluate(()=>enterAsGuest());
        await page.waitForFunction(()=>players.length===28);
        await page.waitForFunction(()=>players.every(p=>Number.isFinite(p.rating)));
        return page;
    }
    async function selectCount(page,n) {
        await page.evaluate(n=>{setSelectedPlayers(players.slice(0,n).map(p=>p.name));renderPlayers();},n);
    }
    async function generate(page) {
        await page.locator('#futsalBtn').click();
        await page.waitForFunction(()=>!teamGenerationRunning && !!currentTeamsData);
        return page.evaluate(()=>({teams:currentTeamsData,sizes:currentTeamSizes,meta:currentTeamMeta}));
    }
    try {
        browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL || 'chrome'});
        const page=await openPage();
        await t.test('worker generation, substitutions, rerolls and confirmed history',async()=>{
            await selectCount(page,13);
            let workerCount=0;page.on('worker',()=>workerCount++);
            const first=await generate(page);
            assert.equal(builder.tierViolations(first.teams),0);
            assert.deepEqual(first.sizes.slice().sort(),[6,7]);
            assert.equal(first.meta.onFieldCount,6);
            assert.equal(await page.evaluate(()=>readTeamHistory(CONFIRMED_TEAM_HISTORY_KEY).length),0);
            await page.locator('#confirmTeamsBtn').click();
            assert.equal(await page.evaluate(()=>readTeamHistory(CONFIRMED_TEAM_HISTORY_KEY).length),1);
            const saved=await page.evaluate(()=>localStorage.getItem(CONFIRMED_TEAM_HISTORY_KEY));
            let previous=builder.teamKey(first.teams);
            for(let i=0;i<6;i++) {const result=await generate(page);assert.notEqual(builder.teamKey(result.teams),previous);previous=builder.teamKey(result.teams);}
            assert.equal(await page.evaluate(()=>localStorage.getItem(CONFIRMED_TEAM_HISTORY_KEY)),saved);
            assert(workerCount>=7);
            await page.locator('button[onclick="showTeamHistory()"]').click();
            assert.match(await page.locator('#teamHistorySection').innerText(),/확정 경기/);
            await page.locator('.history-item').filter({hasText:'확정 경기'}).first().click();
            assert.equal(builder.teamKey(await page.evaluate(()=>currentTeamsData)),builder.teamKey(first.teams));
        });
        await t.test('minimum roster validation and explicit on-field count',async()=>{
            await selectCount(page,10);
            await page.locator('#teamCountSelect').selectOption('4');
            const old=await page.evaluate(()=>TeamBuilder.teamKey(currentTeamsData));
            await page.locator('#futsalBtn').click();
            assert.match(await page.locator('#toastContainer').innerText(),/팀별 최소 5명/);
            assert.equal(await page.evaluate(()=>TeamBuilder.teamKey(currentTeamsData)),old);
            await page.locator('#teamCountSelect').selectOption('2');
            await page.locator('#onFieldCountSelect').selectOption('6');
            await page.locator('#futsalBtn').click();
            assert.match(await page.locator('#toastContainer').innerText(),/출전 인원 이상의/);
            await page.locator('#onFieldCountSelect').selectOption('5');
            assert.equal((await generate(page)).meta.onFieldCount,5);
        });
        await t.test('6 versus 6 permits temporary underfilled teams during an exchange, then reconfirmation',async()=>{
            await page.evaluate(()=>{isAdmin=true;updateUIForPermission();});
            await selectCount(page,12);
            await page.locator('#onFieldCountSelect').selectOption('auto');
            const state=await generate(page);
            const outgoing=state.teams[0][0].name,incoming=state.teams[1][0].name;
            await page.locator('#confirmTeamsBtn').click();
            const saved=await page.evaluate(()=>localStorage.getItem(CONFIRMED_TEAM_HISTORY_KEY));
            await page.evaluate(name=>movePlayerToTeam(name,0,1),outgoing);
            assert.deepEqual(await page.evaluate(()=>currentTeamSizes),[5,7]);
            assert.equal(await page.locator('#confirmTeamsBtn').isDisabled(),false);
            assert.equal(await page.evaluate(()=>localStorage.getItem(CONFIRMED_TEAM_HISTORY_KEY)),saved);
            await page.locator('#confirmTeamsBtn').click();
            assert.equal(await page.evaluate(()=>localStorage.getItem(CONFIRMED_TEAM_HISTORY_KEY)),saved);
            await page.evaluate(name=>movePlayerToTeam(name,1,0),incoming);
            assert.deepEqual(await page.evaluate(()=>currentTeamSizes),[6,6]);
            await page.locator('#confirmTeamsBtn').click();
            assert.notEqual(await page.evaluate(()=>localStorage.getItem(CONFIRMED_TEAM_HISTORY_KEY)),saved);
        });
        await t.test('player-name buttons swap full teams, cancel selection and respect locks',async()=>{
            const state=await generate(page);
            const first=state.teams[0][0].id,second=state.teams[1][0].id;
            const button=id=>page.locator('[data-player-id="'+id+'"] .player-swap');
            await page.locator('#confirmTeamsBtn').click();
            const saved=await page.evaluate(()=>localStorage.getItem(CONFIRMED_TEAM_HISTORY_KEY));
            await button(first).click();
            assert.equal(await button(first).getAttribute('aria-pressed'),'true');
            assert.equal(await page.locator('#cancelPlayerSwapBtn').isVisible(),true);
            await button(second).click();
            assert.deepEqual(await page.evaluate(()=>currentTeamSizes),[6,6]);
            assert.equal(await page.locator('[data-player-id="'+first+'"]').getAttribute('data-team-index'),'1');
            assert.equal(await page.locator('[data-player-id="'+second+'"]').getAttribute('data-team-index'),'0');
            assert.equal(await page.locator('#cancelPlayerSwapBtn').isVisible(),false);
            assert.equal(await page.locator('#confirmTeamsBtn').isDisabled(),false);
            assert.equal(await page.evaluate(()=>localStorage.getItem(CONFIRMED_TEAM_HISTORY_KEY)),saved);
            const afterSwap=await page.evaluate(()=>TeamBuilder.teamKey(currentTeamsData));
            await button(second).click();
            await button(second).click();
            assert.equal(await button(second).getAttribute('aria-pressed'),'false');
            await button(second).click();
            await page.locator('#cancelPlayerSwapBtn').click();
            assert.equal(await page.evaluate(()=>TeamBuilder.teamKey(currentTeamsData)),afterSwap);
            await page.locator('[data-player-id="'+first+'"] .player-lock').click();
            assert.equal(await button(first).getAttribute('aria-disabled'),'true');
            // A locked target does not complete the pending exchange.
            await button(second).click();
            await button(first).evaluate(element=>element.click());
            assert.equal(await page.evaluate(()=>TeamBuilder.teamKey(currentTeamsData)),afterSwap);
            assert.equal(await page.evaluate(()=>pendingPlayerSwap.playerId),second);
            await page.locator('[data-player-id="'+first+'"] .player-lock').click();
            assert.equal(await page.evaluate(()=>pendingPlayerSwap),null);
            await button(second).click();
            await page.locator('#onFieldCountSelect').selectOption('5');
            assert.equal(await button(second).getAttribute('aria-pressed'),'false');
            assert.equal(await page.evaluate(()=>pendingPlayerSwap),null);
            await page.locator('#onFieldCountSelect').selectOption('auto');
        });
        const guest=await openPage();
        await t.test('guest votes update another open client; manual overrides survive and can be released',async()=>{
            await guest.locator('#voteBtn').click();
            await guest.waitForSelector('#voteModal.active');
            await guest.locator('#vote_idx_0').selectOption('S');
            await guest.locator('#vote_idx_1').selectOption('B');
            await guest.locator('#voteModal .btn-primary').click();
            await page.waitForFunction(()=>players[0].tier==='S' && players[0].rating>4);
            const firstName=await page.evaluate(()=>players[0].name);
            const card=page.locator('.player-card').filter({hasText:firstName});
            await card.locator('select').selectOption('D');
            await page.waitForFunction(()=>players[0].tier==='D' && players[0].rating===1);
            await guest.waitForFunction(()=>players[0].tier==='D' && players[0].rating===1);
            await page.evaluate(()=>updateTiersFromVotes());
            assert.equal(await page.evaluate(()=>players[0].rating),1);
            await card.locator('select').selectOption('auto');
            await page.waitForFunction(()=>players[0].tier==='S' && players[0].rating>4);
            await page.evaluate(()=>setupRealtimeListener());
            await page.waitForFunction(()=>window.testDbListenerCount()===2);
            // Removal of all known votes must restore the base tier, not stale derived ratings.
            collections.set('votes',new Map());emit('votes');
            await page.waitForFunction(()=>players.every(p=>p.tier===p.baseTier && p.rating===tierWeights[p.baseTier]));
        });
        await t.test('lock icons pin team numbers and reset when selection or game configuration changes',async()=>{
            const lockedPage=await openPage();
            // A same-tier roster makes the two unlocked players freely exchangeable.
            await lockedPage.evaluate(()=>players.forEach(p=>{p.tier='B';p.rating=4;}));
            await selectCount(lockedPage,12);
            const initial=await generate(lockedPage);
            const first=initial.teams[0][0].id;
            await lockedPage.locator('[data-player-id="'+first+'"] .player-lock').click();
            assert.equal(await lockedPage.locator('[data-player-id="'+first+'"] .player-lock').getAttribute('aria-pressed'),'true');
            for(let i=0;i<6;i++) {
                const result=await generate(lockedPage);
                assert(result.teams[0].some(p=>p.id===first));
                assert.equal(builder.tierViolations(result.teams),0);
            }
            await lockedPage.evaluate(()=>{
                currentTeamsData.forEach((team,i)=>team.forEach(p=>playerTeamLocks[TeamBuilder.identity(p)]=i));
                renderTeams(currentTeamsData,currentTeamSizes);
            });
            const allLocked=await lockedPage.evaluate(()=>currentTeamsData);
            const stable=await generate(lockedPage);
            assert.deepEqual(stable.teams.map(t=>t.map(p=>p.id).sort()),allLocked.map(t=>t.map(p=>p.id).sort()));
            const left=stable.teams[0][0].id,right=stable.teams[1][0].id;
            await lockedPage.locator('[data-player-id="'+left+'"] .player-lock').click();
            await lockedPage.locator('[data-player-id="'+right+'"] .player-lock').click();
            assert.equal(await lockedPage.locator('[data-player-id="'+left+'"] .player-lock').getAttribute('aria-pressed'),'false');
            const exchanged=await generate(lockedPage);
            assert(exchanged.teams[1].some(p=>p.id===left));
            assert(exchanged.teams[0].some(p=>p.id===right));
            fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
            await lockedPage.locator('#teamsContainer').screenshot({path:path.join(root,'test-results','teams-locks-desktop.png')});
            await lockedPage.evaluate(()=>resetPlayerLocks());
            await selectCount(lockedPage,20);
            await lockedPage.locator('#teamCountSelect').selectOption('4');
            const four=await generate(lockedPage);
            const lastPlayer=four.teams[3][0].id;
            await lockedPage.locator('[data-player-id="'+lastPlayer+'"] .player-lock').click();
            await lockedPage.locator('#teamCountSelect').selectOption('2');
            assert.equal(await lockedPage.evaluate(()=>Object.keys(playerTeamLocks).length),0);
            assert.equal(await lockedPage.locator('[data-player-id="'+lastPlayer+'"] .player-lock').getAttribute('aria-pressed'),'false');
            const two=await generate(lockedPage);
            assert.equal(two.teams.length,2);
            const locked=two.teams[0][0],other=two.teams[0][1];
            await lockedPage.locator('[data-player-id="'+locked.id+'"] .player-lock').click();
            const checkbox=lockedPage.locator('.player-card').filter({hasText:other.name}).locator('.player-checkbox');
            await checkbox.uncheck();
            assert.equal(await lockedPage.evaluate(()=>Object.keys(playerTeamLocks).length),0);
            await checkbox.check();
            await lockedPage.locator('[data-player-id="'+locked.id+'"] .player-lock').click();
            await lockedPage.locator('#soccerBtn').click();
            await lockedPage.waitForFunction(()=>!teamGenerationRunning && currentTeamMeta.mode==='soccer');
            assert.equal(await lockedPage.evaluate(()=>Object.keys(playerTeamLocks).length),0);
            await lockedPage.locator('.player-lock').first().click();
            await lockedPage.locator('#onFieldCountSelect').selectOption('5');
            assert.equal(await lockedPage.evaluate(()=>Object.keys(playerTeamLocks).length),0);
            await lockedPage.locator('.player-lock').first().click();
            await lockedPage.reload();
            await lockedPage.waitForSelector('#adminModal.active');
            assert.equal(await lockedPage.evaluate(()=>Object.keys(playerTeamLocks).length),0);
        });
        await t.test('mobile fallback without Worker and soccer substitutes',async()=>{
            const mobile=await openPage({mobile:true,worker:false});
            await mobile.evaluate(()=>{isAdmin=true;updateUIForPermission();});
            await selectCount(mobile,28);
            const result=await generate(mobile);
            assert.equal(builder.tierViolations(result.teams),0);
            assert.equal(result.meta.onFieldCount,6);
            assert(result.sizes.every(n=>n===7));
            const fixed=result.teams[1][0].id;
            await mobile.locator('[data-player-id="'+fixed+'"] .player-lock').tap();
            const rerolled=await generate(mobile);
            assert(rerolled.teams[1].some(p=>p.id===fixed));
            await mobile.locator('[data-player-id="'+fixed+'"] .player-lock').tap();
            const beforeSwap=await mobile.evaluate(()=>currentTeamsData);
            const from=beforeSwap[0][0].id,to=beforeSwap[2][0].id;
            await mobile.locator('[data-player-id="'+from+'"] .player-swap').tap();
            await mobile.locator('[data-player-id="'+to+'"] .player-swap').tap();
            assert.deepEqual(await mobile.evaluate(()=>currentTeamSizes),[7,7,7,7]);
            assert.equal(await mobile.locator('[data-player-id="'+from+'"]').getAttribute('data-team-index'),'2');
            assert.equal(await mobile.locator('[data-player-id="'+to+'"]').getAttribute('data-team-index'),'0');
            assert.equal(await mobile.locator('.mobile-move-select').count(),28);
            fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
            await mobile.locator('#teamsContainer').screenshot({path:path.join(root,'test-results','teams-locks-mobile.png')});
            await mobile.locator('#soccerBtn').click();
            await mobile.waitForFunction(()=>!teamGenerationRunning && currentTeamMeta.mode==='soccer');
            assert.equal(await mobile.evaluate(()=>currentTeamMeta.onFieldCount),11);
            await mobile.locator('button[onclick="openFutsalFMSetup()"]').click();
            assert.equal(await mobile.evaluate(()=>fmPositionState.a.starters.length),11);
            assert.equal(await mobile.evaluate(()=>fmPositionState.a.subs.length),3);
        });
        assert.deepEqual(errors,[]);
    } finally {
        if(browser) await browser.close();
        await new Promise(resolve=>server.close(resolve));
    }
});
