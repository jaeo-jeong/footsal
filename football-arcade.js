(function (root) {
    'use strict';
    const GameRules=typeof module!=='undefined'&&module.exports?require('./football-game-rules.js'):root.FootballGameRules;
    const WIDTH = 480, HEIGHT = 720, PLAYER_Y = 556;
    const LANES = [120, 240, 360];
    const PLAYER_FRAMES = [[30,85,260,533],[295,116,333,501],[654,109,317,509],[962,91,270,511],[32,680,320,512],[340,862,341,329],[642,662,289,502],[937,704,311,488]];
    const DEFENDER_FRAMES = [[18,109,301,487],[359,109,265,491],[634,107,283,494],[933,155,312,445],[17,810,350,347],[331,684,308,476],[638,814,357,346],[964,660,276,469]];
    const RUN_FRAMES = [[31,40,295,574],[364,65,253,554],[632,36,286,582],[933,37,304,528],[49,648,274,572],[361,666,254,553],[639,650,268,569],[943,644,287,506]];
    const FRAME_SETS={player:PLAYER_FRAMES,runner:RUN_FRAMES,defender:DEFENDER_FRAMES};
    // A pose uses the same source scale as the standing model, including seated poses.
    const SPRITE_UNITS={player:529,runner:576,defender:487};
    // Source-space regions keep extended arms/boots out of adjacent poses.
    const FRAME_CLIPS={
        player:{
            2:[[628,0],[950,0],[950,475],[1000,510],[1000,627],[628,627]],
            3:[[950,0],[1254,0],[1254,627],[1000,627],[1000,510],[950,475]],
            4:[[0,627],[365,627],[365,1100],[330,1140],[330,1254],[0,1254]],
            5:[[365,627],[635,627],[635,960],[695,1000],[695,1254],[330,1254],[330,1140],[365,1100]],
            6:[[635,627],[935,627],[935,1254],[695,1254],[695,1000],[635,960]]
        },
        defender:{
            4:[[0,627],[345,627],[345,940],[325,970],[325,1000],[380,1050],[380,1254],[0,1254]],
            5:[[345,627],[638,627],[638,1254],[380,1254],[380,1050],[325,1000],[325,970],[345,940]],
            6:[[638,627],[970,627],[970,900],[1000,1000],[1000,1254],[638,1254]],
            7:[[970,627],[1254,627],[1254,1254],[1000,1254],[1000,1000],[970,900]]
        }
    };
    const FRAME_BASELINES={player:[618,1192],runner:[619,1220],defender:[601,1160]};
    function spriteGeometry(sheet,frame,height) {
        const source=FRAME_SETS[sheet][frame]||FRAME_SETS[sheet][0];
        const scale=height/SPRITE_UNITS[sheet];
        const baseline=FRAME_BASELINES[sheet][frame<4?0:1];
        return {source,scale,width:source[2]*scale,height:source[3]*scale,footGap:Math.max(0,baseline-source[1]-source[3])*scale,clip:FRAME_CLIPS[sheet]?.[frame]};
    }

    const TAU=Math.PI*2;
    const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
    // Animation has its own clock: it never changes collision positions, scores or the daily seed.
    function sampleCharacterMotion({role='player',mode='idle',time=0,cycle=0,age=0,lean=0,reduced=false}={}) {
        const phase=((cycle%1)+1)%1,step=Math.floor(phase*8),beat=Math.sin(phase*TAU*2);
        const moving=['run','dash','defend'].includes(mode),amount=reduced?0:1;
        let sheet=role==='defender'?'defender':'player',frame=0,lift=0,rotation=0,scaleX=1,scaleY=1;
        if(role==='defender') {
            if(mode==='fall')frame=age<.12?5:6;
            else if(mode==='hit')frame=5;
            else if(mode==='slide')frame=4;
            else if(mode==='celebrate'||mode==='punch')frame=7;
            else if(mode==='defend'||mode==='run')frame=Math.abs(lean)>.2?(lean<0?1:2):[0,1,3,2][Math.floor(phase*4)];
        } else {
            if(mode==='run'||mode==='dash') {
                sheet='runner';frame=step;
                if(mode==='dash'&&age<.13){sheet='player';frame=3;}
                else if(mode==='run'&&Math.abs(lean)>.55){sheet='player';frame=lean<0?1:2;}
            } else if(mode==='hit')frame=4;
            else if(mode==='fall')frame=age<.12?4:5;
            else if(mode==='celebrate')frame=6;
            else if(mode==='kick')frame=age<.05?0:7;
            else if(mode==='jump')frame=3;
            else if(mode==='land')frame=0;
        }
        if(moving) {
            lift=(1-Math.cos(phase*TAU*2))*1.1*amount;
            rotation=lean*.11*amount;
            scaleX=1-beat*.012*amount;scaleY=1+beat*.016*amount;
            if(mode==='dash'){scaleX+=.025*amount;scaleY-=.018*amount;lift+=2*amount;}
        } else if(mode==='idle') {
            scaleY=1+Math.sin(time*2.6)*.006*amount;rotation=Math.sin(time*1.8)*.012*amount;
        } else if(mode==='hit') {
            const recoil=Math.sin(clamp(age/.4,0,1)*Math.PI);
            rotation=-.12*recoil*amount;scaleY=1-.045*recoil*amount;scaleX=1+.025*recoil*amount;
        } else if(mode==='fall') {
            const settle=Math.exp(-age*10)*Math.sin(age*22);
            rotation=-.09*settle*amount;scaleY=1-.05*Math.abs(settle)*amount;
        } else if(mode==='celebrate')lift=Math.max(0,Math.sin(time*5))*6*amount;
        else if(mode==='slide')rotation=-.035*amount;
        else if(mode==='kick'){const kick=Math.sin(clamp(age/.34,0,1)*Math.PI);rotation=-.09*kick*amount;scaleX=1+.025*kick*amount;}
        else if(mode==='jump'){rotation=(age<.16?-.055:.045)*amount;scaleX=1-.025*Math.exp(-age*7)*amount;scaleY=1+.04*Math.exp(-age*7)*amount;}
        else if(mode==='land'){const land=Math.sin(clamp(age/.16,0,1)*Math.PI);scaleX=1+.045*land*amount;scaleY=1-.08*land*amount;}
        else if(mode==='punch'){const punch=Math.sin(clamp(age/.22,0,1)*Math.PI);lift=5*punch*amount;scaleY=1+.04*punch*amount;rotation=lean*.14*amount;}
        const ballX=Math.sin(phase*TAU)*6,ballLift=(1-Math.cos(phase*TAU*2))*1.8;
        return {sheet,frame,lift,rotation,scaleX,scaleY,ballX:ballX*amount,ballLift:ballLift*amount,shadowScale:1-lift*.018};
    }

    class CharacterMotion {
        constructor(x=0,cycle=0) {this.reset(x,cycle);}
        reset(x=0,cycle=0) {this.x=Number.isFinite(x)?x:0;this.time=0;this.cycle=Number.isFinite(cycle)?cycle:0;this.lean=0;this.age=0;this.mode='idle';this.role='player';}
        advance(dt,{x=this.x,speed=290,mode='idle',role='player'}={}) {
            if(!Number.isFinite(dt)||dt<=0)return;
            dt=Math.min(dt,.1);if(!Number.isFinite(x))x=this.x;if(!Number.isFinite(speed))speed=290;
            if(mode!==this.mode){this.mode=mode;this.age=0;}else this.age+=dt;
            this.time+=dt;this.role=role;
            const target=clamp((x-this.x)/(dt*780),-1,1);
            this.lean=target+(this.lean-target)*Math.exp(-18*dt);this.x=x;
            const cadence=1.65+clamp((speed-290)/360,0,1)*.8+(mode==='dash'?.65:0);
            this.cycle=(this.cycle+dt*cadence)%1;
        }
        sample(reduced=false) {return sampleCharacterMotion({role:this.role,mode:this.mode,time:this.time,cycle:this.cycle,age:this.age,lean:this.lean,reduced});}
    }

    class DribbleRun {
        constructor(random = Math.random) {
            this.random = random;
            this.time = 0; this.distance = 0; this.bonus = 0; this.hearts = 1;
            this.lane = 1; this.x = LANES[1]; this.objects = []; this.events = [];
            this.charge = 1; this.dashTime = 0; this.invincible = 0; this.hitTime = 0;
            this.combo = 0; this.maxCombo = 0; this.coins = 0; this.dodges = 0;
            this.spawnIn = 0.7; this.nextId = 0; this.ended = false; this.cleared = false;
            this.waves = 0; this.lastSafe = 1; this.nearMisses = 0; this.justDashes = 0;
            this.fever = 0; this.feverTime = 0; this.fevers = 0; this.accumulator = 0;
        }
        get score() { return Math.floor(this.distance) + this.bonus; }
        get level() { return GameRules.runner(this.time).level; }
        get speed() { return GameRules.runner(this.time).speed; }
        get multiplier() { return (1 + Math.min(3, Math.floor(this.combo / 8))) * (this.feverTime > 0 ? 2 : 1); }
        get dashCooldown() { return 11; }
        move(direction) {
            if (this.ended || !Number.isFinite(direction) || direction === 0) return;
            this.lane = Math.max(0, Math.min(2, this.lane + Math.sign(direction)));
        }
        dash() {
            if (this.ended || this.charge < 1) return false;
            this.charge = 0; this.dashTime = 0.42;
            this.events.push({type:'dash', x:this.x, y:PLAYER_Y});
            return true;
        }
        spawnWave() {
            const profile=GameRules.runner(this.time);
            const choices=[0,1,2].filter(lane=>this.level===1||lane!==this.lastSafe);
            const safe=choices[Math.floor(this.random()*choices.length)];
            const relay=profile.relayChance>0&&this.random()<profile.relayChance;
            const gates=relay?(profile.tripleChance>0&&this.random()<profile.tripleChance?3:2):1;
            const spacing=Math.max(225,this.speed*profile.relayGap);
            const addGate=(open,offset,index)=>{
                let blocked=[0,1,2].filter(lane=>lane!==open);
                if(this.waves<2||(!relay&&this.level<5&&this.waves%4===2))blocked=[blocked[Math.floor(this.random()*blocked.length)]];
                const mover=profile.switchChance>0&&this.random()<profile.switchChance?blocked.find(lane=>Math.abs(lane-open)===1):undefined;
                const gate=this.waves*3+index;
                for(const lane of blocked){
                    const shifting=lane===mover;
                    this.objects.push({id:this.nextId++,wave:this.waves,gate,type:'defender',lane,
                        x:LANES[shifting?open:lane],fromLane:shifting?open:lane,y:-90-offset,
                        resolved:false,sliding:shifting,shifting,closest:Infinity,safe:open,relay:index>0});
                }
                for(const y of [-50,-180])this.objects.push({id:this.nextId++,gate,type:'coin',lane:open,x:LANES[open],y:y-offset,value:15});
                if(this.level>=2&&this.waves%3===0&&index===0){const lane=blocked[0];this.objects.push({id:this.nextId++,gate,type:'coin',lane,x:LANES[lane],y:-90-offset,golden:true,value:80});}
            };
            addGate(safe,0,0);this.lastSafe=safe;
            if(relay){
                for(let i=1;i<gates;i++){
                    const next=[0,1,2].filter(lane=>Math.abs(lane-this.lastSafe)===1);
                    this.lastSafe=next[Math.floor(this.random()*next.length)];
                    addGate(this.lastSafe,spacing*i,i);
                }
                if(!this.relayIntroduced){this.relayIntroduced=true;this.events.push({type:'pattern',text:'원투 압박! 다음 빈칸까지 확인',x:240,y:240});}
                if(gates===3&&!this.tripleIntroduced){this.tripleIntroduced=true;this.events.push({type:'pattern',text:'3연속 압박! 리듬을 이어가!',x:240,y:240});}
            }
            this.waveDelay=profile.gap+(gates-1)*spacing/this.speed;this.waves++;
        }
        advance(dt) {
            if (this.ended || !Number.isFinite(dt) || dt <= 0) return;
            // Fixed substeps keep collision and movement identical at 30/60/120 Hz.
            this.accumulator += Math.min(dt, 0.1);
            while (this.accumulator >= 1/120 - 1e-9 && !this.ended) {
                this.tick(1/120);
                this.accumulator -= 1/120;
            }
        }
        tick(dt) {
            const oldLevel=this.level;
            this.time += dt;
            if(this.level!==oldLevel)this.events.push({type:'level',level:this.level,x:240,y:240});
            this.invincible = Math.max(0, this.invincible-dt);
            this.dashTime = Math.max(0, this.dashTime-dt);
            this.hitTime = Math.max(0, this.hitTime-dt);
            this.feverTime = Math.max(0,this.feverTime-dt);
            if(!this.feverTime)this.fever=Math.max(0,this.fever-dt*1.8);
            this.charge = Math.min(1, this.charge+dt*(this.feverTime>0?1.5:1)/this.dashCooldown);
            const difference = LANES[this.lane]-this.x;
            this.x += Math.sign(difference)*Math.min(Math.abs(difference), 780*dt);
            const speed = this.speed;
            this.distance += speed*dt/24;
            this.spawnIn -= dt;
            if (this.spawnIn <= 0) { this.spawnWave(); this.spawnIn += this.waveDelay; }
            for (const object of this.objects) {
                object.y += speed*dt;
                if(object.shifting) {
                    const progress=Math.max(0,Math.min(1,(object.y-190)/140));
                    object.x=LANES[object.fromLane]+(LANES[object.lane]-LANES[object.fromLane])*progress;
                }
                if (object.type === 'coin') {
                    if (!object.resolved && Math.abs(object.x-this.x)<34 && Math.abs(object.y-PLAYER_Y)<32) {
                        object.resolved=true; this.coins++;
                        const points=(object.value||15)*this.multiplier;
                        this.bonus+=points; this.charge=Math.min(1,this.charge+0.018);
                        this.addFever(object.golden?24:9);
                        this.events.push({type:'coin',x:object.x,y:object.y,points,golden:object.golden});
                    }
                } else if (!object.resolved) {
                    if(Math.abs(object.y-PLAYER_Y)<36)object.closest=Math.min(object.closest??Infinity,Math.abs(object.x-this.x));
                    if (Math.abs(object.x-this.x)<41 && Math.abs(object.y-PLAYER_Y)<30) {
                        if (this.dashTime>0) {
                            object.resolved=true; object.beaten=true; this.awardDodge(object, true);
                        } else if (this.invincible<=0) {
                            object.resolved=true; object.beaten=true; this.hearts--; this.combo=0; this.fever=0; this.feverTime=0;
                            this.invincible=0.95; this.hitTime=0.4;
                            this.events.push({type:'hit',x:this.x,y:PLAYER_Y-40});
                            if (this.hearts===0) { this.ended=true; break; }
                        } else object.resolved=true;
                    } else if (object.y>PLAYER_Y+38) {
                        object.resolved=true; this.awardDodge(object, false);
                    }
                }
            }
            this.objects=this.objects.filter(object=>object.y<HEIGHT+130 && !(object.type==='coin' && object.resolved));
        }
        addFever(amount) {
            if(this.feverTime>0)return;
            this.fever=Math.min(100,this.fever+amount);
            if(this.fever>=100){this.fever=0;this.feverTime=6;this.fevers++;this.events.push({type:'fever',x:240,y:240});}
        }
        awardDodge(object, dashed) {
            this.dodges++; this.combo++; this.maxCombo=Math.max(this.maxCombo,this.combo);
            const near=!dashed && object.closest>=41 && object.closest<80;
            if(near)this.nearMisses++;
            const just=dashed&&this.dashTime>.3;if(just)this.justDashes++;
            const points=(just?75:dashed?45:near?35:10)*this.multiplier;
            this.bonus+=points;
            this.addFever(dashed?12:near?18:3);
            this.events.push({type:dashed?'break':near?'near':'dodge',x:object.x,y:PLAYER_Y-95,points,combo:this.combo,just});
        }
        takeEvents() { return this.events.splice(0); }
    }

    function guardGestures(element,locked) {
        const prevent=event=>{if(locked()&&event.cancelable)event.preventDefault();};
        element.addEventListener('touchmove',prevent,{passive:false});
        element.addEventListener('touchstart',event=>{if(event.touches?.length>1)prevent(event);},{passive:false});
        element.addEventListener('gesturestart',prevent,{passive:false});
        element.addEventListener('gesturechange',prevent,{passive:false});
    }
    function createArcade() {
        const document=root.document;
        const assetBase=new URL('assets/arcade/', document.currentScript.src).href;
        const BEST_KEY='footsalDribbleRunBestV3', SOUND_KEY='footsalDribbleRunSound';
        const assetFiles={player:'poly-player-actions.png',runner:'poly-player-run.png',defender:'poly-defender.png',stadium:'stadium.png'};
        let settings={},rivalBeaten=false;
        let dialog, canvas, ctx, nodes={}, images={}, loading=null, phase='closed', run=null;
        let frameId=0, lastFrame=0, elapsed=0, countdown=0, previousPhase='playing', requestId=0, finishDelay=0, resultAge=0;
        let previousFocus=null, oldOverflow='', pointer=null, resizeObserver=null;
        let particles=[], labels=[], best=readNumber(BEST_KEY), audioContext=null;
        const playerMotion=new CharacterMotion(240),opponentMotions=new Map();
        let trails=[],lastTrail=0;
        let muted=readValue(SOUND_KEY)==='off';
        const reducedMotion=root.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const icons={
            close:'<path d="m6 6 12 12M18 6 6 18"/>',
            pause:'<path d="M8 5v14M16 5v14"/>',
            sound:'<path d="M11 4 5 9H2v6h3l6 5V4ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
            left:'<path d="m14 5-7 7 7 7"/>',right:'<path d="m10 5 7 7-7 7"/>',
            bolt:'<path d="m14 2-10 12h7l-1 8 10-13h-7l1-7Z"/>'
        };
        const icon=name=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">'+icons[name]+'</svg>';
        function readValue(key) { try { return root.localStorage.getItem(key); } catch { return null; } }
        function readNumber(key) { const value=Number(readValue(key)); return Number.isFinite(value)&&value>0?Math.floor(value):0; }
        function storeValue(key,value) { try { root.localStorage.setItem(key,String(value)); } catch { /* Play remains available without storage. */ } }
        function text(node,value) { value=String(value); if(node.textContent!==value) node.textContent=value; }
        function sound(type) {
            if (muted) return;
            try {
                if (!audioContext) audioContext=new (root.AudioContext||root.webkitAudioContext)();
                if (audioContext.state==='suspended') { audioContext.resume().catch(()=>{}); return; }
                const notes={coin:[880,1320],dodge:[440],break:[330,660,990],dash:[260,520],hit:[150,90],start:[440,554,659],finish:[523,659,784,1046]}[type]||[440];
                notes.forEach((frequency,i)=>{
                    const oscillator=audioContext.createOscillator(), gain=audioContext.createGain();
                    const start=audioContext.currentTime+i*0.065;
                    oscillator.type=type==='hit'?'triangle':'sine'; oscillator.frequency.setValueAtTime(frequency,start);
                    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(0.045,start+0.008);gain.gain.exponentialRampToValueAtTime(0.001,start+0.15);
                    oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start(start);oscillator.stop(start+0.17);
                });
            } catch { /* Sound is optional. */ }
        }
        function ensureDialog() {
            if (dialog) return;
            dialog=document.createElement('dialog');dialog.className='fa-dialog';dialog.setAttribute('aria-labelledby','faTitle');
            dialog.innerHTML=`<div class="fa-shell">
                <header class="fa-header"><div><span class="fa-eyebrow">JEOTJA FC · ARCADE</span><strong id="faTitle">드리블 런</strong></div>
                    <div class="fa-tools"><button type="button" data-action="sound" data-node="sound" class="fa-icon" aria-label="소리 끄기">${icon('sound')}</button><button type="button" data-action="close" class="fa-icon" aria-label="게임 닫기">${icon('close')}</button></div>
                </header>
                <div class="fa-stage">
                    <canvas data-node="canvas" width="480" height="720" tabindex="0" aria-label="드리블 런 경기장. 좌우 방향키로 이동, 스페이스 키로 대시, Escape 키로 일시정지합니다."></canvas>
                    <div class="fa-hud" data-node="hud" hidden><div class="fa-score"><small data-node="playerName">SCORE</small><strong data-node="score">0</strong></div><div class="fa-life"><small data-node="timer">Lv.1 · 0초</small></div><button type="button" class="fa-icon" data-action="pause" aria-label="일시정지">${icon('pause')}</button></div>
                    <div class="fa-streak" data-node="streak" hidden><span data-node="multiplier">0 COMBO · ×1</span><span class="fa-fever-meter"><i data-node="feverBar"></i><b data-node="feverLabel">FEVER</b></span></div>
                    <section class="fa-home" data-node="home" hidden><div class="fa-logo"><span>더 오래, 더 아슬아슬하게!</span><h2>드리블 <em>런</em></h2><div class="fa-best">MY BEST <b data-node="homeBest">0</b></div></div>
                        <div class="fa-start-box"><p><strong>한 번의 태클이면 경기 종료!</strong><br>코인과 연속 회피로 피버 · 점수 2배<br><span data-node="rival">어디까지 살아남을 수 있을까?</span></p><button type="button" class="fa-primary" data-action="start">킥오프 <span>→</span></button><small>좌우 스와이프 · 대시 0.4초 · 화살표는 수비 이동 예고</small></div>
                    </section>
                    <div class="fa-loading" data-node="loading"><div class="fa-loading-ball">⚽</div><strong data-node="loadMessage">경기장 준비 중</strong><progress data-node="progress" max="4" value="0" aria-label="게임 이미지 불러오기"></progress><button type="button" class="fa-primary" data-action="retry" data-node="retry" hidden>다시 불러오기</button></div>
                    <div class="fa-countdown" data-node="countdown" hidden aria-live="polite">3</div>
                    <section class="fa-panel" data-node="pause" hidden><span class="fa-eyebrow">HALF TIME</span><h2>잠깐, 숨 고르기</h2><p>준비되면 다시 달려볼까요?</p><button type="button" class="fa-primary" data-action="resume">계속하기 →</button><button type="button" class="fa-secondary" data-action="close">게임 센터로</button></section>
                    <section class="fa-panel fa-result" data-node="result" hidden><span class="fa-eyebrow" data-node="resultTag">GOOD RUN!</span><h2 data-node="resultTitle">다시 한 판?</h2><span class="fa-result-score" data-node="resultScore">0</span><span class="fa-result-unit">POINTS</span><p class="fa-record" data-node="record"></p><div class="fa-result-stats"><span>회피<b data-node="dodges">0</b></span><span>최대 연속<b data-node="combo">0</b></span><span>코인<b data-node="coins">0</b></span></div><button type="button" class="fa-primary" data-action="start">한 번 더! <span>↻</span></button><button type="button" class="fa-secondary" data-action="home">처음으로</button></section>
                </div>
                <div class="fa-controls" data-node="controls" hidden><button type="button" data-action="left" aria-label="왼쪽으로 이동">${icon('left')}</button><button type="button" data-action="dash" data-node="dash" class="fa-dash"><span>${icon('bolt')}<b data-node="dashLabel">대시!</b></span><i data-node="charge"></i></button><button type="button" data-action="right" aria-label="오른쪽으로 이동">${icon('right')}</button></div>
                <footer class="fa-footer" data-node="footer">생존 도전 · 같은 날에는 모두 같은 수비 패턴</footer>
                <span class="fa-sr" data-node="announce" role="status"></span>
            </div>`;
            document.body.appendChild(dialog);
            dialog.querySelectorAll('[data-node]').forEach(element=>nodes[element.dataset.node]=element);
            canvas=nodes.canvas;ctx=canvas.getContext('2d');
            guardGestures(dialog,()=>['playing','countdown','paused','finishing'].includes(phase));
            dialog.addEventListener('click',event=>{
                const button=event.target.closest('[data-action]');
                if(button&&!button.disabled) action(button.dataset.action);
                else if(event.target===dialog && phase!=='playing' && phase!=='countdown') close();
            });
            dialog.addEventListener('cancel',event=>{event.preventDefault();escape();});
            root.addEventListener('keydown',event=>{
                if(phase==='closed') return;
                event.stopImmediatePropagation();
                if(event.key==='Escape'){event.preventDefault();escape();}
                else if((phase==='playing'||phase==='countdown') && ['ArrowLeft','ArrowRight',' ','ArrowUp'].includes(event.key)) {
                    event.preventDefault();
                    if(phase==='playing') action(event.key==='ArrowLeft'?'left':event.key==='ArrowRight'?'right':'dash');
                }
            },true);
            canvas.addEventListener('pointerdown',event=>{
                if(phase!=='playing'||pointer||event.isPrimary===false||event.button>0)return;
                event.preventDefault();pointer={id:event.pointerId,x:event.clientX};canvas.setPointerCapture(event.pointerId);
            });
            canvas.addEventListener('pointermove',event=>{
                if(!pointer||pointer.id!==event.pointerId||phase!=='playing')return;
                const threshold=Math.max(18,canvas.getBoundingClientRect().width*0.07),delta=event.clientX-pointer.x;
                if(Math.abs(delta)>=threshold){action(delta<0?'left':'right');pointer.x=event.clientX;}
            });
            const clearPointer=event=>{if(pointer?.id===event.pointerId)pointer=null;};
            canvas.addEventListener('pointerup',clearPointer);canvas.addEventListener('pointercancel',clearPointer);canvas.addEventListener('lostpointercapture',clearPointer);
            document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
            root.addEventListener('blur',pause);
            root.addEventListener('resize',resize);
            if(root.ResizeObserver)resizeObserver=new root.ResizeObserver(resize);
            updateSoundButton();
        }
        function setPhase(next) {
            phase=next;dialog.dataset.phase=next;pointer=null;
            for(const name of ['home','loading','pause','result','countdown']) nodes[name].hidden=next!==(name==='pause'?'paused':name);
            nodes.hud.hidden=!['playing','countdown','paused','finishing'].includes(next);
            nodes.streak.hidden=nodes.hud.hidden;
            nodes.controls.hidden=!['playing','countdown','paused','finishing'].includes(next);
            nodes.controls.querySelectorAll('button').forEach(button=>button.disabled=next!=='playing');
            text(nodes.footer,['playing','countdown','paused'].includes(next)?'스와이프로 이동 · 방향키 / 스페이스도 가능':'생존 도전 · 같은 날에는 모두 같은 수비 패턴');
        }
        function loadImages() {
            if(loading)return loading;
            let count=0;nodes.progress.value=0;
            loading=Promise.all(Object.keys(assetFiles).map(name=>new Promise((resolve,reject)=>{
                const image=new Image();
                const timer=root.setTimeout(()=>{image.onload=image.onerror=null;image.src='';reject(new Error('timeout'));},20000);
                image.onload=()=>{root.clearTimeout(timer);images[name]=image;nodes.progress.value=++count;resolve();};
                image.onerror=()=>{root.clearTimeout(timer);reject(new Error(name));};
                image.src=assetBase+assetFiles[name];
            }))).catch(error=>{loading=null;throw error;});
            return loading;
        }
        async function open(options) {
            ensureDialog();
            if(dialog.open && phase!=='loading')return;
            if(options)settings=options;
            best=Number.isFinite(settings.best)?settings.best:readNumber(BEST_KEY);
            text(nodes.playerName,settings.playerName||'SCORE');
            text(nodes.rival,settings.rival?'다음 상대 '+settings.rival.playerName+' · '+settings.rival.score.toLocaleString()+'점':'어디까지 살아남을 수 있을까?');
            const token=++requestId;
            if(!dialog.open){previousFocus=document.activeElement;oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.showModal();}
            setPhase('loading');nodes.retry.hidden=true;text(nodes.loadMessage,'경기장 준비 중');
            resizeObserver?.observe(canvas);resize();
            try {await loadImages();if(token===requestId && dialog.open)home();}
            catch {if(token===requestId && dialog.open){text(nodes.loadMessage,'경기장을 불러오지 못했어요');nodes.retry.hidden=false;}}
        }
        function close(notify=true) {
            if(phase==='closed')return;
            if(notify&&phase==='finishing'){finish();return;}
            const onClose=settings.onClose;
            requestId++;phase='closed';pointer=null;run=null;stopFrames();resizeObserver?.disconnect();
            resetMotion();
            if(dialog?.open)dialog.close();
            document.body.style.overflow=oldOverflow;
            previousFocus?.focus({preventScroll:true});
            audioContext?.suspend().catch(()=>{});
            if(notify)onClose?.();
        }
        function home() {
            run=null;particles=[];labels=[];resetMotion();setPhase('home');text(nodes.homeBest,best.toLocaleString());
            dialog.querySelector('[data-action="start"]').focus({preventScroll:true});startFrames();
        }
        function start() {
            if(!['home','result'].includes(phase))return;
            const ticket=settings.onStart?.();
            if(settings.onStart&&!ticket)return;
            let seed=ticket?.seed;
            const random=Number.isInteger(seed)?()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;}:Math.random;
            sound('start');run=new DribbleRun(random);rivalBeaten=false;particles=[];labels=[];resetMotion();countdown=3;setPhase('countdown');
            text(nodes.countdown,3);canvas.focus({preventScroll:true});startFrames();
        }
        function pause() {
            if(!['playing','countdown'].includes(phase))return;
            previousPhase=phase;setPhase('paused');stopFrames();draw();dialog.querySelector('[data-action="resume"]').focus({preventScroll:true});
        }
        function resume() {
            if(phase!=='paused')return;
            setPhase(previousPhase);canvas.focus({preventScroll:true});startFrames();
        }
        function escape() {if(['playing','countdown'].includes(phase))pause();else if(phase==='paused')resume();else close();}
        function updateSoundButton(){nodes.sound.setAttribute('aria-pressed',String(!muted));nodes.sound.setAttribute('aria-label',muted?'소리 켜기':'소리 끄기');nodes.sound.classList.toggle('fa-muted',muted);}
        function action(name) {
            if(name==='close')return close();if(name==='retry')return open();if(name==='home')return home();
            if(name==='start')return start();if(name==='pause')return pause();if(name==='resume')return resume();
            if(name==='sound'){muted=!muted;storeValue(SOUND_KEY,muted?'off':'on');updateSoundButton();if(!muted)sound('coin');return;}
            if(phase!=='playing')return;
            if(name==='left')run.move(-1);if(name==='right')run.move(1);if(name==='dash')run.dash();
        }
        function finish() {
            if(settings.onFinish) {
                const score=run.score,detail={time:run.time,level:run.level,maxCombo:run.maxCombo,nearMisses:run.nearMisses,justDashes:run.justDashes,coins:run.coins,fevers:run.fevers,endReason:'수비수에게 막혔어요.'};
                const callback=settings.onFinish;close(false);callback(score,detail);return;
            }
            setPhase('result');resultAge=0;sound('finish');
            const record=run.score>best;if(record){best=run.score;storeValue(BEST_KEY,best);}
            text(nodes.resultTag,run.cleared?'FULL TIME!':'GOOD RUN!');text(nodes.resultTitle,run.cleared?'끝까지 돌파 성공!':'한 번만 더 해볼까?');
            text(nodes.resultScore,run.score.toLocaleString());text(nodes.record,record?'새로운 최고 기록!':'MY BEST '+best.toLocaleString());
            text(nodes.dodges,run.dodges);text(nodes.combo,run.maxCombo);text(nodes.coins,run.coins);
            text(nodes.announce,(run.cleared?'완주 성공. ':'경기 종료. ')+run.score+'점.');
            nodes.result.querySelector('[data-action="start"]').focus({preventScroll:true});
            if(record||run.cleared)burst(240,220,['#f9d76b','#fb8465','#e9f5cc'],45);
        }
        function resize() {
            if(!canvas||phase==='closed')return;
            const ratio=Math.min(root.devicePixelRatio||1,2);
            if(canvas.width!==WIDTH*ratio||canvas.height!==HEIGHT*ratio){canvas.width=WIDTH*ratio;canvas.height=HEIGHT*ratio;ctx.setTransform(ratio,0,0,ratio,0,0);}
            if(images.stadium)draw();
        }
        function startFrames(){stopFrames();lastFrame=0;frameId=root.requestAnimationFrame(frame);}
        function stopFrames(){if(frameId)root.cancelAnimationFrame(frameId);frameId=0;}
        function resetMotion(){playerMotion.reset(240);opponentMotions.clear();trails=[];lastTrail=0;}
        function animateCharacters(dt) {
            const mode=!run||phase==='countdown'?'idle':run.cleared?'celebrate':run.ended?'fall':run.hitTime>0?'hit':run.dashTime>0?'dash':'run';
            playerMotion.advance(dt,{x:run?.x??240,speed:run?.speed??290,mode});
            const activeIds=new Set();
            for(const object of run?.objects||[]) {
                if(object.type!=='defender')continue;
                activeIds.add(object.id);
                if(!opponentMotions.has(object.id))opponentMotions.set(object.id,new CharacterMotion(object.x,(object.id%8)/8));
                const motion=opponentMotions.get(object.id);
                const mode=object.beaten?'fall':object.sliding&&object.y>420?'slide':'defend';
                motion.advance(dt,{x:object.x,speed:run.speed,role:'defender',mode});
            }
            for(const id of opponentMotions.keys())if(!activeIds.has(id))opponentMotions.delete(id);
            trails=trails.filter(trail=>playerMotion.time-trail.time<.18);
            if(!reducedMotion&&mode==='dash'&&playerMotion.time-lastTrail>=.035) {
                trails.push({x:run.x,time:playerMotion.time,pose:playerMotion.sample()});lastTrail=playerMotion.time;
                if(trails.length>5)trails.shift();
            }
        }
        function frame(timestamp) {
            if(phase==='closed'||phase==='paused')return;
            const dt=lastFrame?Math.min(0.1,(timestamp-lastFrame)/1000):0;lastFrame=timestamp;elapsed+=dt;
            if(phase==='countdown'){countdown-=dt;text(nodes.countdown,Math.max(1,Math.ceil(countdown)));if(countdown<=0){setPhase('playing');sound('start');}}
            if(phase==='playing') {
                run.advance(dt);
                for(const event of run.takeEvents())effect(event);
                if(run.ended){finishDelay=run.cleared?0.8:0.55;setPhase('finishing');}
            }
            if(phase==='finishing'){finishDelay-=dt;if(finishDelay<=0)finish();}
            if(phase==='closed')return;
            animateCharacters(dt);
            if(phase==='result'){resultAge+=dt;text(nodes.resultScore,Math.floor(run.score*Math.min(1,resultAge/0.65)).toLocaleString());}
            particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=120*dt;p.life-=dt;});particles=particles.filter(p=>p.life>0);
            labels.forEach(label=>{label.y-=28*dt;label.life-=dt;});labels=labels.filter(label=>label.life>0);
            if(run){
                text(nodes.score,run.score.toLocaleString());
                text(nodes.timer,'Lv.'+run.level+' · '+Math.floor(run.time)+'초');nodes.charge.style.width=(run.charge*100)+'%';nodes.dash.disabled=phase!=='playing'||run.charge<1;
                text(nodes.dashLabel,run.charge>=1?'대시!':Math.ceil((1-run.charge)*run.dashCooldown/(run.feverTime>0?1.5:1))+'초');
                text(nodes.multiplier,run.combo+' COMBO · ×'+run.multiplier);nodes.feverBar.style.width=(run.feverTime>0?run.feverTime/6*100:run.fever)+'%';
                nodes.streak.classList.toggle('fa-on-fire',run.feverTime>0);text(nodes.feverLabel,run.feverTime>0?'FEVER ×2':'FEVER');
                if(settings.rival&&!rivalBeaten&&run.score>settings.rival.score){rivalBeaten=true;labels.push({x:240,y:270,text:'라이벌 추월!',color:'#fff4a2',life:1.6});sound('finish');}
            }
            draw();
            if((phase==='home'&&reducedMotion)||(phase==='result'&&resultAge>=1&&particles.length===0&&labels.length===0)){frameId=0;return;}
            frameId=root.requestAnimationFrame(frame);
        }
        function burst(x,y,colors,count=12) {
            if(reducedMotion)return;
            for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,speed=40+Math.random()*140;particles.push({x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed-50,life:0.4+Math.random()*0.55,color:colors[i%colors.length],size:3+Math.random()*4});}
            if(particles.length>120)particles.splice(0,particles.length-120);
        }
        function effect(event) {
            sound(event.type==='break'?'break':event.type);
            if(event.type==='hit'){burst(event.x,event.y,['#fff5d2','#ff9072'],20);text(nodes.announce,'충돌. 경기 종료.');}
            else if(event.type==='coin'){burst(event.x,event.y,['#ffe7a0','#ffbf44']);labels.push({x:event.x,y:event.y-15,text:'+'+event.points,color:'#ffe286',life:0.65});}
            else if(event.type==='dash')burst(event.x,event.y,['#abf5dd','#fff7db'],20);
            else if(event.type==='level'||event.type==='fever'||event.type==='near'||event.type==='pattern') {
                labels.push({x:240,y:event.type==='near'?360:240,text:event.type==='pattern'?event.text:event.type==='level'?'LEVEL '+event.level+' ↑':event.type==='fever'?'FEVER! ×2':'아슬아슬! +'+event.points,color:'#fff2a1',life:1.2});
                if(event.type==='fever')burst(240,350,['#ffd36b','#ff967d','#dfffe8'],40);
            }
            else if(event.type==='break'||event.combo%3===0){burst(event.x,event.y,['#f5ffdf','#ffe296']);labels.push({x:240,y:280,text:event.type==='break'?(event.just?'JUST DASH!':'돌파!'):event.combo+' COMBO',color:'#fff2a1',life:0.9});}
            if(labels.length>8)labels.shift();
        }
        function shadow(x,y,width,opacity=0.18){ctx.fillStyle='rgba(23,63,29,'+opacity+')';ctx.beginPath();ctx.ellipse(x,y,width,width*0.26,0,0,Math.PI*2);ctx.fill();}
        function paintCharacter(target,pose,x,feet,height,opacity=1){
            const {source:[sx,sy,sw,sh],width,height:drawHeight,footGap,clip,scale}=spriteGeometry(pose.sheet,pose.frame,height);
            if(!images[pose.sheet])return;
            target.save();target.globalAlpha*=opacity;target.translate(x,feet-pose.lift*height/108);target.rotate(pose.rotation);target.scale(pose.scaleX,pose.scaleY);
            if(clip){target.beginPath();clip.forEach(([px,py],i)=>target[i?'lineTo':'moveTo']((px-sx)*scale-width/2,(py-sy)*scale-drawHeight-footGap));target.closePath();target.clip();}
            target.drawImage(images[pose.sheet],sx,sy,sw,sh,-width/2,-drawHeight-footGap,width,drawHeight);target.restore();
        }
        function ball(x,y,r,rotation){
            shadow(x,y+r+4,r*0.8);ctx.save();ctx.translate(x,y);ctx.rotate(rotation);
            const gradient=ctx.createRadialGradient(-r*.35,-r*.4,1,0,0,r);gradient.addColorStop(0,'#fffefa');gradient.addColorStop(1,'#c7d7cb');
            ctx.fillStyle=gradient;ctx.strokeStyle='#314d43';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.stroke();
            ctx.fillStyle='#294b43';ctx.beginPath();for(let i=0;i<5;i++){const a=i*Math.PI*2/5-Math.PI/2;const px=Math.cos(a)*r*.47,py=Math.sin(a)*r*.47;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fill();
            for(let i=0;i<5;i++){const a=i*Math.PI*2/5-Math.PI/2;ctx.beginPath();ctx.moveTo(Math.cos(a)*r*.45,Math.sin(a)*r*.45);ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);ctx.stroke();}ctx.restore();
        }
        function coin(object){
            shadow(object.x,object.y+11,14,0.12);ctx.save();ctx.translate(object.x,object.y);ctx.scale(0.8+0.2*Math.sin(elapsed*5),1);
            if(object.golden){ctx.strokeStyle='#fff4a0';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,23,0,Math.PI*2);ctx.stroke();}
            ctx.fillStyle='#e89b36';ctx.strokeStyle='#80512f';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,16,0,Math.PI*2);ctx.fill();ctx.stroke();
            ctx.fillStyle='#ffe18a';ctx.beginPath();ctx.arc(-1,-2,12,0,Math.PI*2);ctx.fill();ctx.fillStyle='#b37527';ctx.font='900 19px sans-serif';ctx.textAlign='center';ctx.fillText('★',-1,5);ctx.restore();
        }
        function outlined(label,x,y,size,color='#fff8df'){
            ctx.font='900 '+size+'px Pretendard, sans-serif';ctx.textAlign='center';ctx.lineJoin='round';ctx.strokeStyle='#214d3c';ctx.lineWidth=5;ctx.strokeText(label,x,y);ctx.fillStyle=color;ctx.fillText(label,x,y);
        }
        function draw() {
            if(!ctx||!images.stadium||!images.player||!images.runner||!images.defender)return;
            ctx.clearRect(0,0,WIDTH,HEIGHT);ctx.save();
            if(run?.hitTime>0&&!reducedMotion&&phase==='playing')ctx.translate(Math.sin(elapsed*70)*run.hitTime*9,0);
            ctx.drawImage(images.stadium,0,0,WIDTH,HEIGHT);
            if(['home','loading'].includes(phase)||!run){
                const ready=sampleCharacterMotion({role:'defender',time:playerMotion.time,reduced:reducedMotion});
                shadow(108,425,32);paintCharacter(ctx,ready,108,425,93);
                shadow(365,389,30);paintCharacter(ctx,ready,365,389,89);
                shadow(241,465,46);paintCharacter(ctx,playerMotion.sample(reducedMotion),240,463,180);ball(287,466,22,elapsed*.3);
            } else {
                ctx.save();ctx.beginPath();ctx.rect(68,140,344,HEIGHT-140);ctx.clip();ctx.strokeStyle='rgba(247,255,225,.16)';ctx.lineWidth=2;ctx.setLineDash([14,40]);ctx.lineDashOffset=-run.distance*14;
                for(const x of [180,300]){ctx.beginPath();ctx.moveTo(x,140);ctx.lineTo(x,HEIGHT);ctx.stroke();}ctx.restore();
                if(!run.ended){
                    const danger=new Set(run.objects.filter(o=>o.type==='defender'&&!o.resolved&&o.y>PLAYER_Y-140&&o.y<PLAYER_Y+30).map(o=>o.lane));
                    for(const lane of danger){ctx.fillStyle='#e9956e24';ctx.beginPath();ctx.roundRect(LANES[lane]-47,PLAYER_Y-45,94,94,18);ctx.fill();ctx.strokeStyle='#ffdb9360';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(LANES[lane]-26,PLAYER_Y+38);ctx.lineTo(LANES[lane],PLAYER_Y+28);ctx.lineTo(LANES[lane]+26,PLAYER_Y+38);ctx.stroke();}
                    if(!reducedMotion){const speed=clamp((run.speed-290)/650,0,1);ctx.strokeStyle='rgba(235,255,235,'+(.08+speed*.18)+')';ctx.lineWidth=2;for(let i=0;i<8;i++){const x=i%2?428:52,y=150+(i*137+run.distance*18)%560;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+20+speed*60);ctx.stroke();}}
                }
                if(run.relayIntroduced){
                    const gates=new Map();
                    for(const object of run.objects.filter(o=>o.type==='defender'&&!o.resolved&&o.y<PLAYER_Y+30).sort((a,b)=>b.y-a.y))if(!gates.has(object.gate))gates.set(object.gate,object.safe);
                    const hints=[...gates.values()].slice(0,3).map(lane=>['왼쪽','가운데','오른쪽'][lane]);
                    if(hints.length)outlined('다음 빈칸  '+hints.join(' › '),240,190,15,'#fff2b7');
                }
                const renderObjects=run.objects.filter(object=>object.y>60).map(object=>({y:object.y,object}));renderObjects.push({y:PLAYER_Y,player:true});renderObjects.sort((a,b)=>a.y-b.y);
                for(const item of renderObjects){
                    if(item.player){
                        const pose=playerMotion.sample(reducedMotion);
                        const opacity=run.invincible>0&&run.hitTime<=0?0.55+Math.sin(run.time*28)*0.2:1;
                        shadow(run.x,PLAYER_Y+7,28*pose.shadowScale);
                        for(const trail of trails)paintCharacter(ctx,trail.pose,trail.x,PLAYER_Y+8+(playerMotion.time-trail.time)*100,108,(1-(playerMotion.time-trail.time)/.18)*.15);
                        if(run.dashTime>0){ctx.strokeStyle='#c7ffe0';ctx.lineWidth=4;ctx.beginPath();ctx.ellipse(run.x,PLAYER_Y-40,47,73,0,0,Math.PI*2);ctx.stroke();}
                        paintCharacter(ctx,pose,run.x,PLAYER_Y,108,opacity);
                        ball(run.x+pose.ballX,PLAYER_Y+19-pose.ballLift,14,playerMotion.cycle*TAU);
                    } else {
                        const object=item.object;if(object.type==='coin'){coin(object);continue;}
                        const pose=opponentMotions.get(object.id)?.sample(reducedMotion)||sampleCharacterMotion({role:'defender'});
                        if(object.shifting&&object.y>70&&object.y<330){
                            ctx.save();ctx.strokeStyle='#ffe591';ctx.fillStyle='#ffe591';ctx.lineWidth=4;ctx.setLineDash([7,5]);
                            ctx.beginPath();ctx.moveTo(LANES[object.fromLane],object.y+18);ctx.lineTo(LANES[object.lane],object.y+18);ctx.stroke();ctx.restore();
                            outlined(object.lane>object.fromLane?'→':'←',(LANES[object.fromLane]+LANES[object.lane])/2,object.y-94,30,'#ffe591');
                        }
                        shadow(object.x,object.y+4,30*pose.shadowScale);paintCharacter(ctx,pose,object.x,object.y,98,object.y>PLAYER_Y+80?0.8:1);
                    }
                }
                if(run.dashTime>0)outlined('DASH!',run.x,PLAYER_Y-147,24,'#d7ffe9');
            }
            for(const particle of particles){ctx.globalAlpha=Math.min(1,particle.life*2);ctx.fillStyle=particle.color;ctx.fillRect(particle.x,particle.y,particle.size,particle.size*.6);}ctx.globalAlpha=1;
            for(const label of labels){ctx.globalAlpha=Math.min(1,label.life*3);outlined(label.text,label.x,label.y,label.text.includes('COMBO')?33:25,label.color);}ctx.globalAlpha=1;
            ctx.restore();
        }
        let mascotId=0;
        function mascotMarkup(name='player',index=0) {
            const slots=name==='defender'?[['defender',0],['defender',1],['defender',4],['defender',6]]:[['player',0],['runner',0],['runner',4],['player',3],['player',1],['player',2],['player',4],['player',6]];
            const [sheet,pose]=slots[index]||slots[0],frame=FRAME_SETS[sheet][pose];
            const [x,y,w,h]=frame,clip=FRAME_CLIPS[sheet]?.[pose]||[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],id='fa-pose-'+(++mascotId);
            return '<svg class="fa-mascot" viewBox="'+frame.join(' ')+'" aria-hidden="true">'+(clip?'<defs><clipPath id="'+id+'"><polygon points="'+clip.map(p=>p.join(',')).join(' ')+'"/></clipPath></defs>':'')+'<image '+(clip?'clip-path="url(#'+id+')" ':'')+'href="'+assetBase+assetFiles[sheet]+'" width="1254" height="1254"/></svg>';
        }
        function legacyPose(options={}) {
            const enemy=options.role?options.role==='defender':options.gloves||['angry','surprised'].includes(options.expression)||options.number==='4';
            const role=enemy?'defender':'player';
            const mode=['celebrate','victory','jumping'].includes(options.pose)||options.expression==='celebrate'?'celebrate':options.pose==='sliding'?'slide':options.expression==='sad'?'fall':['hurt','dizzy'].includes(options.expression)?'hit':options.pose==='dash'?'dash':options.pose==='kick'?'kick':options.pose==='running'?'run':'idle';
            return {role,mode};
        }
        function legacyMotion(options={},portrait=false) {
            if(!portrait&&options.motion)return options.motion.sample(reducedMotion);
            const time=portrait?0:Number.isFinite(options.animationTime)?options.animationTime:root.performance.now()/1000;
            const pose=legacyPose(options);
            return sampleCharacterMotion({...pose,mode:options.motionMode||pose.mode,time,cycle:time*1.8+(options.phaseOffset||0),age:Number.isFinite(options.motionAge)?options.motionAge:1,lean:options.lean||0,reduced:portrait||reducedMotion});
        }
        function drawMascot(target,x,y,size,options={}) {
            const pose=legacyMotion(options),height=size*.95;
            target.save();target.translate(x,y);
            if(options.squash)target.scale(options.squash.sx||1,options.squash.sy||1);
            paintCharacter(target,pose,0,height*.38,height);target.restore();
        }
        function mascotPortraitMarkup(size=56,options={}) {
            const {sheet,frame}=legacyMotion(options,true);
            const [sx,sy,sw,sh]=FRAME_SETS[sheet][frame];
            const height=148*SPRITE_UNITS[sheet]/Math.max(sw,sh,SPRITE_UNITS[sheet]);
            const geometry=spriteGeometry(sheet,frame,height),id='fa-portrait-'+(++mascotId);
            const x=80-geometry.width/2-sx*geometry.scale,y=154-geometry.height-geometry.footGap-sy*geometry.scale;
            const width=Number.isFinite(size)?clamp(size,1,512):56;
            const polygon=geometry.clip?'<clipPath id="'+id+'-shape"><polygon points="'+geometry.clip.map(p=>p.join(',')).join(' ')+'"/></clipPath>':'';
            // Display the existing atlas directly. Canvas export is unavailable for local HTML
            // files and in browsers that block pixel readback; neither is needed to render a portrait.
            return '<svg class="fa-portrait" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="'+width+'" height="'+Math.round(width*.95)+'" aria-hidden="true" style="vertical-align:middle;flex-shrink:0"><defs><clipPath id="'+id+'"><rect x="'+sx+'" y="'+sy+'" width="'+sw+'" height="'+sh+'"/></clipPath>'+polygon+'</defs><g transform="translate('+x+' '+y+') scale('+geometry.scale+')" clip-path="url(#'+id+')"><image '+(polygon?'clip-path="url(#'+id+'-shape)" ':'')+'href="'+assetBase+assetFiles[sheet]+'" width="1254" height="1254"/></g></svg>';
        }
        const drawStadium=(target,x=0,y=0,width=WIDTH,height=HEIGHT,source=null)=>{
            if(!images.stadium)return;
            if(source)target.drawImage(images.stadium,...source,x,y,width,height);else target.drawImage(images.stadium,x,y,width,height);
        };
        return {open,close,prepare:()=>{ensureDialog();return loadImages();},guardGestures,mascotMarkup,drawMascot,drawStadium,mascotPortraitMarkup,createMotion:(x,cycle)=>new CharacterMotion(x,cycle)};
    }
    if(typeof module!=='undefined'&&module.exports)module.exports={DribbleRun,LANES,PLAYER_Y,PLAYER_FRAMES,RUN_FRAMES,DEFENDER_FRAMES,sampleCharacterMotion,CharacterMotion,spriteGeometry};
    else root.FootballArcade=createArcade();
})(typeof window!=='undefined'?window:globalThis);
