(function(root) {
    'use strict';
    const RUN_ID='dribble-run-v2';
    const TOTAL_ID='all-games';
    const RULE_VERSION=4;
    const GAMES=Object.freeze([
        {id:RUN_ID,title:'드리블 런',tag:'SURVIVAL',description:'원투 압박 · 황금 코인 · 피버 돌파',icon:'⚡',animal:'player',pose:1,color:'mint'},
        {id:'penalty',title:'골든 부트',tag:'TIMING SHOT',description:'원터치 정밀 슛 · 골든 링 · 키퍼 돌파',icon:'⚽',animal:'player',pose:5,color:'peach'},
        {id:'pass',title:'티키타카',tag:'ONE TOUCH PASS',description:'동료에게 패스 · 황금 루트 · 수비 돌파',icon:'🎯',animal:'player',pose:1,color:'sky'},
        {id:'goalkeeper',title:'골든 글러브',tag:'MOVE & SAVE',description:'좌우 선방 · 강슛 펀칭 · 커브와 연속 슛',icon:'🧤',animal:'defender',pose:1,color:'lavender'},
        {id:'donghyun',title:'동현이를 막아라',tag:'COMBO KICK',description:'컬러 연결 · 폭탄 연쇄 · 전방 압박',icon:'🧩',animal:'player',pose:7,color:'yellow'},
        {id:'dribble',title:'터치라인 점프',tag:'DOUBLE JUMP',description:'더블 점프 · 황금 헤딩 · 연속 태클',icon:'💨',animal:'player',pose:2,color:'rose'}
    ]);
    const validGame=id=>GAMES.some(game=>game.id===id);
    function normalizeName(value) {
        if(typeof value!=='string')throw new Error('본인 이름을 입력해주세요.');
        const name=value.normalize('NFKC').trim().replace(/\s+/gu,' ');
        if(!name || [...name].length>20 || /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/u.test(name))throw new Error('이름은 1~20자로 입력해주세요.');
        return name;
    }
    function dayKey(time=Date.now()) {return new Date(time+9*60*60*1000).toISOString().slice(0,10);}
    function dailySeed(date,gameId=RUN_ID) {
        let seed=2166136261;
        for(const char of gameId+':'+date)seed=Math.imul(seed^char.charCodeAt(0),16777619)>>>0;
        return seed;
    }
    function seededRandom(seed) {return ()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};}
    function cleanRecord(record) {
        if(!record || !validGame(record.gameId) || !Number.isSafeInteger(record.score) || record.score<0 || record.score>1e9)return null;
        const ruleVersion=record.ruleVersion??(record.gameId===RUN_ID?2:1);
        if(!Number.isSafeInteger(ruleVersion)||ruleVersion<1)return null;
        try {return {...record,ruleVersion,playerName:normalizeName(record.playerName)};}catch{return null;}
    }
    function rankRecords(records,gameId) {
        if(gameId===TOTAL_ID)return rankTotals(records);
        const best=new Map();
        for(const raw of records) {
            const record=cleanRecord(raw);
            if(!record || record.gameId!==gameId)continue;
            const prior=best.get(record.playerName);
            if(!prior || record.score>prior.score)best.set(record.playerName,record);
        }
        return assignRanks([...best.values()]);
    }
    function rankTotals(records) {
        const totals=new Map();
        for(const game of GAMES)for(const record of rankRecords(records,game.id)){
            if(!totals.has(record.playerName))totals.set(record.playerName,{playerName:record.playerName,score:0,gameScores:{},gamesPlayed:0});
            const total=totals.get(record.playerName);total.score+=record.score;total.gameScores[game.id]=record.score;total.gamesPlayed++;
        }
        return assignRanks([...totals.values()]);
    }
    function assignRanks(records) {
        const sorted=records.sort((a,b)=>b.score-a.score || a.playerName.localeCompare(b.playerName,'ko'));
        let rank=0;
        return sorted.map((record,index)=>{if(!index || record.score!==sorted[index-1].score)rank=index+1;return {...record,rank};});
    }
    function rivalFor(ranking,name,score=0) {
        const higher=ranking.filter(row=>row.playerName!==name && row.score>score);
        return higher.length ? higher[higher.length-1] : null;
    }
    function deadline(promise,ms=12000) {
        let timer;
        return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('연결 시간이 초과됐습니다.')),ms);})]).finally(()=>clearTimeout(timer));
    }
    class RecordBook {
        constructor({database=()=>null,storage=null,now=Date.now,timestamp=()=>new Date(),makeId=null}={}) {
            this.database=database;this.storage=storage;this.now=now;this.timestamp=timestamp;
            this.makeId=makeId||(()=>root.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
            this.key='footsalArcadeRecordsV2';this.records=[];this.finished=new Map();this.inflight=new Map();this.cache=new Map();this.fetchVersions=new Map();
            try {const rows=JSON.parse(storage?.getItem(this.key)||'[]');if(Array.isArray(rows))this.records=rows.map(cleanRecord).filter(r=>r&&typeof r.id==='string');}catch{/* Storage is optional. */}
        }
        begin(gameId,playerName) {
            if(!validGame(gameId))throw new Error('게임을 찾을 수 없습니다.');
            const startedAt=this.now(),date=dayKey(startedAt);
            return Object.freeze({id:this.makeId(),gameId,ruleVersion:RULE_VERSION,playerName:normalizeName(playerName),date,seed:dailySeed(date,gameId),startedAt});
        }
        persist() {
            // Pending runs are retained until explicitly retried; completed history is bounded.
            const synced=this.records.filter(r=>r.synced).slice(-200);
            const pending=this.records.filter(r=>!r.synced);
            this.records=[...synced,...pending];
            try {if(!this.storage)return false;this.storage.setItem(this.key,JSON.stringify(this.records));return true;}catch{return false;}
        }
        best(name,gameId) {
            let stored=0;
            try {
                const keys=['faBest:'+gameId+':'+encodeURIComponent(name),'faBest:v3:'+gameId+':'+encodeURIComponent(name)];
                stored=Math.max(0,...keys.map(key=>Number(this.storage?.getItem(key))).filter(n=>Number.isSafeInteger(n)&&n>=0&&n<=1e9));
            }catch{}
            const shared=this.cache.get(gameId)?.value.records||[];
            return Math.max(stored,...[...this.records,...shared].filter(r=>r.playerName===name&&r.gameId===gameId).map(r=>r.score),0);
        }
        rememberBest(record) {
            try {this.storage?.setItem('faBest:'+record.gameId+':'+encodeURIComponent(record.playerName),String(Math.max(record.score,this.best(record.playerName,record.gameId))));}catch{}
        }
        finish(ticket,score) {
            if(this.finished.has(ticket.id))return this.finished.get(ticket.id);
            const record=cleanRecord({...ticket,score,playedAt:this.now(),synced:false});
            if(!record)return Promise.reject(new Error('유효하지 않은 게임 점수입니다.'));
            const existing=this.records.find(r=>r.id===ticket.id);
            if(!existing){this.records.push(record);this.rememberBest(record);this.persist();}
            const task=this.submit(existing||record);
            this.finished.set(ticket.id,task);
            // Retain only recent in-memory receipts. Persisted run IDs also prevent duplicate entries.
            if(this.finished.size>100)this.finished.delete(this.finished.keys().next().value);
            return task;
        }
        submit(record) {
            if(this.inflight.has(record.id))return this.inflight.get(record.id);
            const task=(async()=>{
                let error=null;
                try {
                    const db=this.database();
                    if(!db)throw new Error('랭킹 서버에 연결되지 않았습니다.');
                    await deadline(db.collection('miniGameScores').doc(record.id).set({
                        playerName:record.playerName,gameId:record.gameId,score:record.score,date:record.date,
                        runId:record.id,ruleVersion:record.ruleVersion,
                        timestamp:this.timestamp()
                    }));
                    record.synced=true;this.cache.delete(record.gameId);
                    this.fetchVersions.set(record.gameId,(this.fetchVersions.get(record.gameId)||0)+1);
                }catch(cause){error=cause;}
                const persisted=this.persist();
                return {record:{...record},synced:!!record.synced,persisted,error};
            })().finally(()=>this.inflight.delete(record.id));
            this.inflight.set(record.id,task);return task;
        }
        retry(id) {
            const record=this.records.find(r=>r.id===id);
            if(!record)return Promise.reject(new Error('저장할 기록을 찾지 못했습니다.'));
            return this.submit(record);
        }
        async fetch(gameId,force=false) {
            if(gameId===TOTAL_ID){
                const results=await Promise.all(GAMES.map(game=>this.fetch(game.id,force)));
                const online=results.every(data=>data.online);
                return {records:results.flatMap(data=>data.records),online,partial:!online&&results.some(data=>data.online)};
            }
            const cached=this.cache.get(gameId);
            if(!force&&cached&&this.now()-cached.time<15000)return cached.value;
            const version=(this.fetchVersions.get(gameId)||0)+1;this.fetchVersions.set(gameId,version);
            try {
                const db=this.database();if(!db)throw new Error('랭킹 서버에 연결되지 않았습니다.');
                const snapshot=await deadline(db.collection('miniGameScores').where('gameId','==',gameId).get());
                const records=[];
                snapshot.forEach(doc=>{const record=cleanRecord({...doc.data(),id:doc.id});if(record&&record.gameId===gameId)records.push(record);});
                const value={records,online:!snapshot.metadata?.fromCache};
                if(version===this.fetchVersions.get(gameId))this.cache.set(gameId,{time:this.now(),value});
                return value;
            }catch(error){return {records:this.records.filter(r=>r.gameId===gameId),online:false,error};}
        }
    }
    function createCenter(environment=root) {
        const root=environment;
        const document=root.document;
        let config={},book=null,dialog,content,headerName,tabs,status;
        let playerName='',phase='closed',revision=0,priorFocus=null,priorOverflow='',active=null,result=null;
        let rankingGame=RUN_ID;
        const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        const number=value=>Number(value).toLocaleString('ko-KR');
        function storage(){try{return root.localStorage;}catch{return null;}}
        function configure(options){config=options;book=new RecordBook({...options,storage:storage()});}
        function checkAccess(){if(config.canAccess?.()===true)return true;close();return false;}
        function ensure() {
            if(dialog)return;
            dialog=document.createElement('dialog');dialog.className='fc-dialog';dialog.setAttribute('aria-labelledby','fcTitle');
            dialog.innerHTML=`<div class="fc-shell"><header class="fc-header"><div><span class="fc-kicker">JEOTJA FC · PLAY CLUB</span><h2 id="fcTitle">게임 센터<span>✦</span></h2></div><button type="button" class="fc-close" data-action="close" aria-label="게임 센터 닫기">✕</button></header><div class="fc-player-bar"><button type="button" data-action="name" data-node="name"></button><span>오늘의 도전, 한 판 더!</span></div><nav class="fc-tabs" aria-label="게임 센터 메뉴"><button type="button" data-action="games">게임 모음</button><button type="button" data-action="ranking">랭킹</button><button type="button" data-action="stats">내 기록</button></nav><main class="fc-content"></main><p class="fc-status" role="status"></p></div>`;
            document.body.appendChild(dialog);content=dialog.querySelector('main');headerName=dialog.querySelector('[data-node="name"]');tabs=dialog.querySelector('nav');status=dialog.querySelector('.fc-status');
            dialog.addEventListener('click',event=>{
                if(!checkAccess())return;
                const button=event.target.closest('button[data-action]');if(!button||button.disabled)return;
                const action=button.dataset.action;
                if(action==='close')close();else if(action==='name')showName();else if(action==='enter')enter();
                else if(action==='games')showGames();else if(action==='ranking')showRanking();else if(action==='stats')showStats();
                else if(action==='play')launch(button.dataset.game);else if(action==='again'&&result)launch(result.ticket.gameId);
                else if(action==='retry-score')retryScore(button.dataset.run);else if(action==='refresh')showRanking(true);
            });
            dialog.addEventListener('submit',event=>{event.preventDefault();if(checkAccess())enter();});
            dialog.addEventListener('change',event=>{
                if(!checkAccess())return;
                if(event.target.id==='fcRankGame'){rankingGame=event.target.value;showRanking();}
            });
            dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
            // Isolate this native dialog from the app's document-level modal shortcuts.
            dialog.addEventListener('keydown',event=>event.stopPropagation());
        }
        function visible(){if(!dialog.open)dialog.showModal();document.body.style.overflow='hidden';}
        function setView(next) {
            revision++;phase=next;status.textContent='';visible();
            const named=next!=='name';tabs.hidden=!named;headerName.parentElement.hidden=!named;
            headerName.textContent=playerName+' ✎';
            tabs.querySelectorAll('button').forEach(button=>button.setAttribute('aria-current',button.dataset.action===next?'page':'false'));
        }
        function focusTitle(){content.querySelector('h3')?.focus({preventScroll:true});}
        function open() {
            if(!checkAccess())return;
            if(phase!=='closed')return;
            if(!book)configure({});ensure();priorFocus=document.activeElement;priorOverflow=document.body.style.overflow;
            showName();
        }
        function close() {
            if(phase==='closed')return;
            const session=active;
            revision++;phase='closed';active=null;result=null;
            if(session?.gameId===RUN_ID)root.FootballArcade.close?.(false);
            else if(session)config.closeMiniGame?.();
            dialog?.close();
            document.body.style.overflow=priorOverflow;priorFocus?.focus({preventScroll:true});
        }
        function showName() {
            setView('name');
            let saved=playerName;try{saved=saved||storage()?.getItem('mgPlayerName')||'';}catch{}
            const names=[...new Set((config.names?.()||[]).filter(name=>typeof name==='string'))].sort((a,b)=>a.localeCompare(b,'ko'));
            content.innerHTML=`<section class="fc-welcome"><div class="fc-welcome-art">${mascot('player',7)}<span>★</span></div><span class="fc-kicker">READY, PLAYER?</span><h3 tabindex="-1">오늘의 주인공은?</h3><p>본인 이름을 입력해주세요.</p><form><label for="fcNickname">본인 이름</label><input id="fcNickname" name="name" list="fcNames" autocomplete="name" maxlength="40" placeholder="예: 문찬우" value="${escape(saved)}" required><datalist id="fcNames">${names.map(name=>`<option value="${escape(name)}"></option>`).join('')}</datalist><button type="submit" class="fc-primary">입장하기 <span>→</span></button></form></section>`;
            content.querySelector('input').focus({preventScroll:true});
        }
        function enter() {
            if(phase!=='name')return;
            try{playerName=normalizeName(content.querySelector('input').value);}catch(error){status.textContent=error.message;return;}
            try{storage()?.setItem('mgPlayerName',playerName);}catch{}
            showGames();
        }
        function mascot(animal,pose) {return root.FootballArcade?.mascotMarkup(animal,pose)||'';}
        function showGames() {
            setView('games');const token=revision,name=playerName;
            content.innerHTML=`<div class="fc-section-heading"><div><span class="fc-kicker">PICK & PLAY</span><h3 tabindex="-1">우리 팀 1등에 도전!</h3></div><span class="fc-game-count">${GAMES.length} GAMES</span></div><div class="fc-game-grid">${GAMES.map((game,index)=>`<button type="button" class="fc-card fc-${game.color}${index===0?' fc-featured':''}" data-action="play" data-game="${game.id}"><div class="fc-card-art"><span class="fc-game-tag">${game.tag}</span>${mascot(game.animal,game.pose)}<span class="fc-prop" aria-hidden="true">${game.icon}</span></div><div class="fc-card-body"><h4>${game.title}</h4><p>${game.description}</p><div class="fc-card-record" data-record="${game.id}">내 최고 ${number(book.best(name,game.id))}점 <span>랭킹 확인 중…</span></div><span class="fc-card-go">플레이 <b>↗</b></span></div></button>`).join('')}</div>`;
            focusTitle();
            GAMES.forEach(async game=>{
                const data=await book.fetch(game.id);if(token!==revision||name!==playerName)return;
                const rank=rankRecords(data.records,game.id),mine=rank.find(r=>r.playerName===name),leader=rank[0];
                const el=content.querySelector('[data-record="'+game.id+'"]');if(!el)return;
                const best=Math.max(book.best(name,game.id),mine?.score||0);
                el.innerHTML=`내 최고 <b>${number(best)}점</b><span>${data.online?(leader?'1위 '+escape(leader.playerName)+' · '+number(leader.score)+'점':'첫 랭킹의 주인공이 되어보세요'):'연결 대기 · 저장된 기록'}</span>`;
            });
        }
        function rankHTML(data,gameId) {
            const ranks=rankRecords(data.records,gameId),total=gameId===TOTAL_ID;
            const mine=ranks.find(row=>row.playerName===playerName),rival=rivalFor(ranks,playerName,mine?.score||0);
            const personal=mine?`${mine.rank}위 · ${number(mine.score)}점`:'아직 기록이 없어요';
            const rows=ranks.slice(0,10);
            if(mine&&!rows.includes(mine))rows.push(mine);
            const breakdown=total&&mine?'<details class="fc-total-breakdown"><summary>내 게임별 최고점 보기 ▾</summary><dl>'+GAMES.map(game=>'<dt>'+escape(game.title)+'</dt><dd>'+number(mine.gameScores[game.id]||0)+'점</dd>').join('')+'</dl></details>':'';
            return `${!data.online?'<p class="fc-offline">'+(data.partial?'일부 게임 기록을 불러오지 못해 확인된 기록만 보여드려요.':'랭킹 서버에 연결할 수 없어 저장된 기록을 보여드려요.')+'</p>':''}<div class="fc-my-rank"><span>${escape(playerName)}<b>${personal}</b></span><span>${rival?'다음 상대 <b>'+escape(rival.playerName)+' · '+number(rival.score-(mine?.score||0)+1)+'점 더!</b>':mine?'현재 공동 순위 포함 1위!':'첫 기록을 남겨보세요'}</span></div>${breakdown}${rows.length?`<table class="fc-rank-table"><caption class="fa-sr">누적 ${total?'전체 게임 총합':'게임별 최고 점수'} 순위</caption><thead><tr><th>순위</th><th>선수</th><th>${total?'총합 점수':'최고 점수'}</th></tr></thead><tbody>${rows.map(row=>`<tr${row.playerName===playerName?' class="fc-me"':''}><td>${row.rank<=3?['🥇','🥈','🥉'][row.rank-1]:row.rank}</td><td>${escape(row.playerName)}${row.playerName===playerName?'<small>나</small>':''}${total?'<small>'+row.gamesPlayed+'/'+GAMES.length+'개 게임</small>':''}</td><td>${number(row.score)}</td></tr>`).join('')}</tbody></table>`:'<p class="fc-empty">아직 등록된 점수가 없어요. 첫 기록에 도전해보세요!</p>'}`;

        }
        async function showRanking(force=false) {
            setView('ranking');const token=revision;
            content.innerHTML=`<div class="fc-section-heading"><h3 tabindex="-1">누적 랭킹</h3><button type="button" data-action="refresh" class="fc-text-button">새로고침 ↻</button></div><div class="fc-rank-filters"><label>게임<select id="fcRankGame"><option value="${TOTAL_ID}"${rankingGame===TOTAL_ID?' selected':''}>전체 게임 총합</option>${GAMES.map(game=>`<option value="${game.id}"${game.id===rankingGame?' selected':''}>${game.title}</option>`).join('')}</select></label></div><p class="fc-rank-note">${rankingGame===TOTAL_ID?'게임별 역대 개인 최고점 '+GAMES.length+'개 합산 · 미참여 게임 0점':'역대 개인 최고점 기준'} · 동점은 공동 순위</p><div data-node="ranking" aria-live="polite"><p class="fc-empty">순위 불러오는 중…</p></div>`;

            focusTitle();const data=await book.fetch(rankingGame,force);if(token!==revision)return;
            content.querySelector('[data-node="ranking"]').innerHTML=rankHTML(data,rankingGame);
        }
        async function showStats() {
            setView('stats');const token=revision,name=playerName;
            content.innerHTML='<div class="fc-section-heading"><h3 tabindex="-1">내 플레이 기록</h3></div><div data-node="stats"><p class="fc-empty">기록 불러오는 중…</p></div>';focusTitle();
            const all=await Promise.all(GAMES.map(game=>book.fetch(game.id)));if(token!==revision||name!==playerName)return;
            const pending=book.records.filter(row=>row.playerName===name&&!row.synced);
            content.querySelector('[data-node="stats"]').innerHTML=`<div class="fc-stat-list">${GAMES.map((game,index)=>{
                const data=all[index],records=data.records.filter(row=>row.playerName===name);
                const best=Math.max(book.best(name,game.id),...records.map(row=>row.score),0);
                const rank=rankRecords(data.records,game.id).find(row=>row.playerName===name);
                return `<button type="button" data-action="play" data-game="${game.id}" class="fc-stat-row"><span>${game.icon} ${game.title}<small>${data.online?records.length+'회 플레이':'이 기기 기록'}${rank?' · '+rank.rank+'위':''}</small></span><strong>${number(best)}<small>최고 점수</small></strong></button>`;
            }).join('')}</div>${pending.length?'<h4 class="fc-pending-title">전송 대기 기록</h4>'+pending.map(row=>`<div class="fc-pending"><span>${escape(GAMES.find(g=>g.id===row.gameId).title)} · ${number(row.score)}점</span><button type="button" data-action="retry-score" data-run="${escape(row.id)}">다시 저장</button></div>`).join(''):''}`;
        }
        async function launch(gameId) {
            if(!checkAccess())return;
            if(!validGame(gameId)||!playerName||phase==='game'||phase==='loading')return;
            const name=playerName;
            setView('loading');const token=revision;
            content.innerHTML='<p class="fc-empty">경기장을 준비하고 있어요…</p>';
            try {
                await root.FootballArcade.prepare();if(token!==revision||!checkAccess())return;
                phase='game';dialog.close();const session={gameId,name,ticket:null};active=session;
                const begin=()=>{if(active!==session)return;session.ticket=session.ticket||book.begin(gameId,name);return session.ticket;};
                const finish=(score,detail)=>{
                    if(active!==session||!session.ticket)return;
                    const ticket=session.ticket;active=null;
                    showResult(ticket,score,detail);
                };
                const exit=()=>{if(active!==session)return;active=null;showGames();};
                const cached=book.cache.get(gameId)?.value||{records:[],online:false};
                const ranks=rankRecords(cached.records,gameId),mine=ranks.find(row=>row.playerName===name);
                const rival=rivalFor(ranks,name,mine?.score||0),best=Math.max(book.best(name,gameId),mine?.score||0);
                if(gameId===RUN_ID) {
                    root.FootballArcade.open({playerName:name,best,rival,
                        onStart:begin,onFinish:finish,onClose:exit});
                }else (config.startMiniGame||config.startLegacy)(gameId,{playerName:name,best,rival,begin,finish,exit});
            }catch(error){if(token!==revision)return;active=null;showGames();status.textContent='게임을 불러오지 못했습니다. 다시 눌러주세요.';}
        }
        function resultMessage(saved) {
            if(saved.synced)return '랭킹에 기록을 등록했어요!';
            return saved.persisted?'이 기기에 기록을 보관했어요. 연결되면 다시 저장해주세요.':'기록을 저장하지 못했어요. 이 화면에서 다시 저장해주세요.';
        }
        async function showResult(ticket,score,detail={}) {
            const game=GAMES.find(g=>g.id===ticket.gameId),previousBest=book.best(ticket.playerName,ticket.gameId);
            setView('result');result={ticket,score};const token=revision;
            const fields={
                [RUN_ID]:[['생존',Math.floor(detail.time||0)+'초'],['최대 콤보',detail.maxCombo||0],['아슬아슬 회피',detail.nearMisses||0]],
                penalty:[['도달 라운드',detail.round||0],['골',detail.goals||0],['최대 콤보',detail.maxCombo||0]],
                pass:[['정확도',(detail.accuracy||0)+'%'],['정밀 패스',detail.centerHits||0],['최대 콤보',detail.maxCombo||0]],
                goalkeeper:[['세이브',detail.saves||0],['방어율',(detail.saveRate||0)+'%'],['최대 콤보',detail.maxCombo||0]],
                donghyun:[['생존',Math.floor(detail.elapsed||0)+'초'],['도달 레벨',detail.maxLevel||1],['최대 연쇄',detail.maxChain||0]],
                dribble:[['회피',detail.dodged||0],['헤딩',detail.headings||0],['최대 콤보',detail.maxCombo||0]]
            }[ticket.gameId];
            const stats='<div class="fc-result-stats">'+fields.map(([label,value])=>`<span>${label}<b>${escape(value)}</b></span>`).join('')+'</div>';
            content.innerHTML=`<section class="fc-result"><span class="fc-kicker">${escape(game.title)} · ${escape(ticket.playerName)}</span><div class="fc-result-mascot">${mascot('player',score>previousBest?7:0)}</div><h3 tabindex="-1">${score>previousBest?'내 최고 기록 갱신!':'좋아, 한 번 더!'}</h3><strong class="fc-final-score">${number(score)}<small>POINTS</small></strong>${stats}<p data-node="save" role="status">점수를 저장하는 중…</p><button type="button" data-node="retry" class="fc-text-button" data-action="retry-score" data-run="${escape(ticket.id)}" hidden>점수 다시 저장</button><div class="fc-result-buttons"><button type="button" class="fc-primary" data-action="again">한 번 더 ↻</button><button type="button" class="fc-secondary" data-action="games">다른 게임</button></div></section><h4 class="fc-result-ranking-title">누적 랭킹</h4><div data-node="ranking"><p class="fc-empty">순위 확인 중…</p></div>`;
            focusTitle();
            try {
                const saved=await book.finish(ticket,Math.floor(score));if(token!==revision)return;
                content.querySelector('[data-node="save"]').textContent=resultMessage(saved);content.querySelector('[data-node="retry"]').hidden=saved.synced;
                const data=await book.fetch(ticket.gameId,true);if(token!==revision)return;
                content.querySelector('[data-node="ranking"]').innerHTML=rankHTML(data,ticket.gameId);
            }catch(error){if(token===revision)status.textContent=error.message;}
        }
        async function retryScore(id) {
            const token=revision;
            const button=[...content.querySelectorAll('[data-run]')].find(el=>el.dataset.run===id);if(button)button.disabled=true;
            try {
                const saved=await book.retry(id);if(token!==revision)return;
                if(phase==='stats'){await showStats();status.textContent=resultMessage(saved);return;}
                content.querySelector('[data-node="save"]').textContent=resultMessage(saved);
                if(button){button.hidden=saved.synced;button.disabled=false;}
                const data=await book.fetch(saved.record.gameId,true);if(token!==revision)return;
                content.querySelector('[data-node="ranking"]').innerHTML=rankHTML(data,saved.record.gameId);
            }catch(error){if(token===revision){status.textContent=error.message;if(button)button.disabled=false;}}
        }
        return {configure,open,close};
    }
    if(typeof module!=='undefined'&&module.exports)module.exports={RUN_ID,TOTAL_ID,RULE_VERSION,GAMES,normalizeName,dayKey,dailySeed,seededRandom,rankRecords,rankTotals,rivalFor,RecordBook,createCenter};
    else root.FootballGameCenter=createCenter();
})(typeof window!=='undefined'?window:globalThis);
