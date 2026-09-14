(function(root) {
    'use strict';
    const W=480,H=720,STEP=1/120,TAU=Math.PI*2;
    const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
    const lerp=(a,b,t)=>a+(b-a)*t;
    const finite=n=>Number.isFinite(n)?Math.max(0,n):0;
    const randomFrom=seed=>{let n=seed>>>0;return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};};
    const distanceToSegment=(x,y,ax,ay,bx,by)=>{
        const dx=bx-ax,dy=by-ay,t=clamp(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1),0,1);
        return Math.hypot(x-ax-dx*t,y-ay-dy*t);
    };
    const INFO=Object.freeze({
        penalty:{title:'골든 부트',tag:'GOLDEN BOOT',color:'#ef9564',action:'슛!',hint:'조준선이 링에 들어오면 탭',intro:'움직이는 링을 노려 한 방! 정중앙 슛으로 키퍼를 뚫으세요.',controls:'화면 탭 / Space',pattern:['움직이는 표적','키퍼의 압박','흔들리는 골문']},
        pass:{title:'티키타카',tag:'TIKI TAKA',color:'#79bdd0',action:'패스!',hint:'화살표가 동료를 향할 때 탭',intro:'패스를 이어 경기장을 가르세요. 황금 동료와 정밀 패스는 더 높은 점수!',controls:'화면 탭 / Space',pattern:['동료가 움직인다!','수비가 들어온다!','좁아지는 패스 길']},
        goalkeeper:{title:'골든 글러브',tag:'GOLDEN GLOVE',color:'#ab9bd8',action:'펀칭!',hint:'좌우로 드래그 · 강슛은 펀칭',intro:'착지 표시를 따라 움직여 선방! 노란 강슛은 도착할 때 펀칭하세요.',controls:'드래그 / ← → · 펀칭 Space',pattern:['강슛! 펀칭으로 막아!','휘어지는 커브 슛','연속 슛, 다음 공까지!']},
        dribble:{title:'터치라인 점프',tag:'TOUCHLINE JUMP',color:'#f1af75',action:'점프!',hint:'꾹 누르면 높이 · 공중에서 한 번 더',intro:'태클을 뛰어넘고 공을 헤딩하세요. 더블 점프로 황금 루트에 도전!',controls:'탭 / Space · 길게 눌러 높이',pattern:['높은 태클 등장','연속 태클! 더블 점프','흔들리는 수비 라인']},
        donghyun:{title:'동현이를 막아라',tag:'COMBO KICK',color:'#e5ba65',action:'연결해서 킥!',hint:'같은 색 묶음 탭 · 드래그로 연결',intro:'같은 색을 모아 동현이를 밀어내세요. 큰 묶음은 폭탄과 연쇄로 이어집니다!',controls:'같은 색 2개 이상 · 드래그 연결',pattern:['방해 타일 등장','더 거센 전방 압박','철벽 타일을 깨라!']}
    });
    function difficulty(id,time=0) {
        const t=finite(time),stage=Math.min(3,Math.floor(t/25));
        if(id==='penalty')return {stage,aimSpeed:1.55+t*.022,width:11+32/(1+t/125),limit:.7+4/(1+t/80),drift:t<25?0:Math.min(42,(t-20)*.7),guard:t>=50,guardWidth:22+24*t/(t+100)};
        if(id==='pass')return {stage,aimSpeed:1.6+t*.018,radius:12+28/(1+t/150),limit:.8+4.3/(1+t/90),ballSpeed:780+t*1.8,drift:t<25?0:Math.min(36,(t-20)*.6),defenders:t<50?0:t<75?1:2,defenderSpeed:38+t*.7};
        if(id==='goalkeeper')return {stage,flight:.4+1.3/(1+t/72),interval:.22+1.28/(1+t/85),radius:19+24/(1+t/150),punchWindow:.045+.175/(1+t/110),power:t>=25,curve:t>=50,relay:t>=75};
        if(id==='dribble')return {stage,speed:245+t*3+Math.pow(Math.max(0,t-100),1.3)*.04,gap:.48+1.45/(1+t/110),high:t>=25,relay:t>=50,moving:t>=75};
        return {stage,speed:2+t*.055+Math.pow(Math.max(0,t-45),2)*.0008,blockers:t>=25,armored:t>=75,blockerEvery:5+11/(1+t/80),colors:t>=50?4:3};
    }
    class ArcadeModel {
        constructor(seed=1) {
            this.random=randomFrom(seed);this.time=0;this.score=0;this.hearts=3;this.combo=0;this.maxCombo=0;
            this.fever=0;this.feverTime=0;this.fevers=0;this.ended=false;this.immune=0;this.accumulator=0;this.events=[];this.lastStage=0;
        }
        get level(){return 1+Math.floor(this.time/20);}
        get profile(){return difficulty(this.id,this.time);}
        emit(type,x=240,y=340,text='',value=0) {
            if(this.events.length>=64)this.events.shift();this.events.push({type,x,y,text,value});
        }
        takeEvents(){return this.events.splice(0);}
        award(points,x,y,label='NICE!',quality=1) {
            if(this.ended)return;
            this.combo++;this.maxCombo=Math.max(this.combo,this.maxCombo);
            const multiplier=(1+Math.min(3,Math.floor(this.combo/6)))*(this.feverTime>0?2:1);
            const earned=Math.round(points*multiplier);this.score+=earned;
            this.fever=clamp(this.fever+quality*10,0,100);
            if(this.fever>=100&&this.feverTime<=0){this.fever=0;this.feverTime=6;this.fevers++;this.emit('fever',240,230,'FEVER! ×2');}
            this.emit(quality>=2?'perfect':'score',x,y,label+' +'+earned,earned);
        }
        hit(message,x=240,y=420,grace=.3) {
            if(this.ended||this.immune>0)return false;
            this.hearts--;this.combo=0;this.fever=Math.max(0,this.fever-25);this.immune=grace;this.emit('hit',x,y,message);
            if(this.hearts<=0){this.hearts=0;this.ended=true;this.emit('end',x,y,'FULL TIME');}
            return true;
        }
        advance(dt) {
            if(this.ended||!Number.isFinite(dt)||dt<=0)return;
            this.accumulator+=Math.min(dt,.1);
            while(this.accumulator>=STEP-1e-9&&!this.ended){
                this.accumulator-=STEP;this.time+=STEP;this.immune=Math.max(0,this.immune-STEP);this.feverTime=Math.max(0,this.feverTime-STEP);
                const stage=this.profile.stage;
                if(stage>this.lastStage){this.lastStage=stage;this.emit('pattern',240,180,INFO[this.id].pattern[stage-1]);}
                this.step(STEP);
            }
        }
        stats(){return {time:this.time,elapsed:this.time,maxCombo:this.maxCombo,maxLevel:this.level,fevers:this.fevers};}
    }
    class ShotGame extends ArcadeModel {
        constructor(seed){super(seed);this.id='penalty';this.round=0;this.goals=0;this.perfects=0;this.shots=0;this.state='aim';this.flight=null;this.poseAge=1;this.nextRound();}
        nextRound(){this.round++;this.state='aim';this.flight=null;this.remaining=this.profile.limit;this.phase=this.random()*TAU;this.targetBase=105+this.random()*270;this.side=this.random()>.5?1:-1;this.poseAge=0;}
        get aimX(){return 240+170*Math.sin(this.phase);}
        get targetX(){return clamp(this.targetBase+Math.sin(this.time*1.4)*this.profile.drift,78,402);}
        get guardX(){return 240+140*Math.sin(this.time*1.25+1);}
        shoot(){
            if(this.state!=='aim'||this.ended)return false;
            const x=this.aimX,error=Math.abs(x-this.targetX),p=this.profile;
            const perfect=error<=p.width*.32,blocked=p.guard&&Math.abs(x-this.guardX)<p.guardWidth&&!perfect;
            this.flight={x,age:0,duration:.34,goal:error<=p.width&&!blocked,perfect,blocked,targetX:this.targetX,guardX:this.guardX};
            this.state='flight';this.shots++;this.poseAge=0;this.emit('kick',240,590);return true;
        }
        step(dt){
            this.poseAge+=dt;
            if(this.state==='aim'){
                this.phase+=this.profile.aimSpeed*dt;this.remaining-=dt;
                if(this.remaining<=0){this.hit('서둘러 슛!',240,300);this.state='reset';this.resetIn=.4;}
            }else if(this.state==='flight'){
                this.flight.age+=dt;
                if(this.flight.age>=this.flight.duration){
                    const f=this.flight;
                    if(f.goal){this.goals++;if(f.perfect)this.perfects++;this.award(f.perfect?240:130,f.x,265,f.perfect?'PERFECT!':'GOAL!',f.perfect?2:1);}
                    else this.hit(f.blocked?'키퍼 선방!':'아깝다!',f.x,265);
                    this.state='reset';this.resetIn=.42;
                }
            }else if((this.resetIn-=dt)<=0)this.nextRound();
        }
        stats(){return {...super.stats(),round:this.round,goals:this.goals,perfects:this.perfects,accuracy:Math.round(this.goals/Math.max(1,this.shots)*100)};}
    }
    class PassGame extends ArcadeModel {
        constructor(seed){super(seed);this.id='pass';this.holderX=240;this.travel=0;this.phase=0;this.state='aim';this.passes=0;this.shots=0;this.centerHits=0;this.targets=[];this.defenders=[];this.ball=null;this.nextPlay();}
        nextPlay(){
            this.state='aim';this.remaining=this.profile.limit;this.phase=this.random()*TAU;
            const ys=[300,230,300];this.targets=[105,240,375].map((x,i)=>({baseX:x,x,y:ys[i],r:this.profile.radius,golden:i===this.passes%3,phase:i*2+this.random()}));
            this.defenders=Array.from({length:this.profile.defenders},(_,i)=>({x:90+i*260,y:380+i*44,baseX:90+i*260,direction:i? -1:1}));
        }
        get angle(){return Math.sin(this.phase)*.83;}
        shoot(){
            if(this.ended||this.state!=='aim')return false;
            const speed=this.profile.ballSpeed;this.ball={x:this.holderX,y:590,vx:Math.sin(this.angle)*speed,vy:-Math.cos(this.angle)*speed,age:0};
            this.state='flight';this.shots++;this.emit('kick',this.holderX,590);return true;
        }
        step(dt){
            this.phase+=this.profile.aimSpeed*dt;
            for(const t of this.targets)t.x=clamp(t.baseX+Math.sin(this.time*1.6+t.phase)*this.profile.drift,62,418);
            for(const d of this.defenders)d.x=240+Math.sin(this.time*this.profile.defenderSpeed/80+d.baseX)*138;
            if(this.state==='aim'){
                this.remaining-=dt;
                if(this.remaining<=0){this.hit('압박에 끊겼다!',this.holderX,550);this.state='reset';this.resetIn=.35;}
            }else if(this.state==='flight'){
                const b=this.ball,ox=b.x,oy=b.y;b.x+=b.vx*dt;b.y+=b.vy*dt;b.age+=dt;
                const defender=this.defenders.find(d=>distanceToSegment(d.x,d.y,ox,oy,b.x,b.y)<27);
                const target=this.targets.find(t=>distanceToSegment(t.x,t.y,ox,oy,b.x,b.y)<t.r+7);
                if(defender){this.hit('패스 차단!',defender.x,defender.y);this.state='reset';this.resetIn=.35;}
                else if(target){
                    const aim=Math.abs((target.x-b.x)*b.vy-(target.y-b.y)*b.vx)/Math.hypot(b.vx,b.vy),perfect=aim<target.r*.4;
                    this.passes++;if(perfect)this.centerHits++;
                    this.award((perfect?160:90)*(target.golden?1.7:1),target.x,target.y,target.golden?'GOLDEN PASS!':perfect?'PERFECT!':'ONE TWO!',perfect?2:1);
                    this.nextHolder=target.x;this.state='move';this.resetIn=.24;this.transition=0;
                }else if(b.y<160||b.x<20||b.x>460||b.age>1.3){this.hit('터치 아웃!',clamp(b.x,40,440),clamp(b.y,200,600));this.state='reset';this.resetIn=.35;}
            }else{
                this.resetIn-=dt;
                if(this.state==='move'){this.transition+=dt;this.travel+=900*dt;}
                if(this.resetIn<=0){if(this.state==='move')this.holderX=clamp(this.nextHolder,140,340);this.ball=null;this.nextPlay();}
            }
        }
        stats(){return {...super.stats(),passes:this.passes,accuracy:Math.round(this.passes/Math.max(1,this.shots)*100),centerHits:this.centerHits};}
    }
    class KeeperGame extends ArcadeModel {
        constructor(seed){super(seed);this.id='goalkeeper';this.x=240;this.targetX=240;this.balls=[];this.spawnIn=1;this.shotNo=0;this.saves=0;this.conceded=0;this.punchTime=0;this.punchCooldown=0;this.lastLanding=240;}
        move(x){if(!this.ended&&Number.isFinite(x))this.targetX=clamp(x,48,432);}
        punch(){if(this.ended||this.punchCooldown>0)return false;this.punchTime=this.profile.punchWindow;this.punchCooldown=.68;this.emit('punch',this.x,581);return true;}
        spawn(){
            this.shotNo++;const p=this.profile;
            // Even at extreme speed, consecutive landings must remain reachable.
            const reach=1050*(this.lastInterval||p.interval)*.85+p.radius*2;
            const targets=[100,240,380].filter(x=>Math.abs(x-this.lastLanding)<=reach),targetX=targets[Math.floor(this.random()*targets.length)];
            const power=p.power&&this.shotNo%4===0,curve=p.curve&&this.shotNo%3===0;
            const fromX=curve?clamp(targetX+(this.random()>.5?120:-120),65,415):180+this.random()*120;
            this.balls.push({id:this.shotNo,targetX,fromX,age:0,duration:p.flight,power,curve});this.lastLanding=targetX;
            this.spawnIn=p.interval*(p.relay&&this.shotNo%3===1?.75:1);this.lastInterval=this.spawnIn;
        }
        step(dt){
            this.x+=clamp(this.targetX-this.x,-1050*dt,1050*dt);this.punchTime=Math.max(0,this.punchTime-dt);this.punchCooldown=Math.max(0,this.punchCooldown-dt);
            this.spawnIn-=dt;if(this.spawnIn<=0)this.spawn();
            for(const b of this.balls){
                b.age+=dt;if(b.age<b.duration)continue;b.resolved=true;
                const near=Math.abs(this.x-b.targetX)<=this.profile.radius+15,punching=this.punchTime>0;
                if(near&&(!b.power||punching)){this.saves++;this.award(b.power?100:punching?75:45,b.targetX,540,b.power?'POWER SAVE!':punching?'PERFECT!':'SAVE!',punching?2:1);}
                else{this.conceded++;this.hit(near&&b.power?'강슛은 펀칭!':'골!',b.targetX,580,.05);}
            }
            this.balls=this.balls.filter(b=>!b.resolved);
        }
        stats(){return {...super.stats(),saves:this.saves,saveRate:Math.round(this.saves/Math.max(1,this.saves+this.conceded)*100)};}
    }
    class JumpGame extends ArcadeModel {
        constructor(seed){super(seed);this.id='dribble';this.y=0;this.vy=0;this.jumps=0;this.holding=false;this.holdTime=0;this.spawnIn=1.2;this.objects=[];this.wave=0;this.distance=0;this.dodged=0;this.coins=0;this.headings=0;}
        jump(){
            if(this.ended||this.jumps>=2)return false;
            this.vy=this.jumps?560:630;this.jumps++;this.holding=true;this.holdTime=0;this.emit('jump',110,604-this.y,this.jumps===2?'DOUBLE!':'');return true;
        }
        release(){this.holding=false;}
        spawn(){
            const p=this.profile;this.wave++;
            const height=p.high&&this.random()<.4?74:45;
            this.objects.push({kind:'tackle',x:570,height,width:42,moving:p.moving&&this.random()<.45,resolved:false});
            const relay=p.relay&&this.wave%3===0;
            if(relay)this.objects.push({kind:'tackle',x:570+p.speed*.3,height:45,width:42,resolved:false});
            this.objects.push({kind:'coin',x:570+p.speed*.12,height:this.random()<.5?145:225,golden:this.wave%3===0,resolved:false});
            this.spawnIn=p.gap*(.93+this.random()*.14)+(relay?.3:0);
        }
        step(dt){
            const p=this.profile,oldY=this.y;this.distance+=p.speed*dt;this.spawnIn-=dt;if(this.spawnIn<=0)this.spawn();
            if(this.jumps){this.holdTime+=dt;this.vy-=1850*(this.holding&&this.holdTime<.16&&this.vy>0?.66:1)*dt;this.y+=this.vy*dt;if(this.y<=0){this.y=0;this.vy=0;this.jumps=0;this.holding=false;}}
            for(const o of this.objects){
                const oldX=o.x;o.x-=p.speed*dt;if(o.resolved)continue;
                const height=o.height+(o.moving?Math.sin(this.time*7)*14:0);
                const crossing=oldX>=75&&o.x<=145,at=clamp((oldX-110)/(oldX-o.x||1),0,1),crossY=lerp(oldY,this.y,at);
                if(o.kind==='coin'&&distanceToSegment(110,height-68,oldX,oldY,o.x,this.y)<42){o.resolved=true;this.coins++;this.headings++;this.award(o.golden?230:100,o.x,604-height,o.golden?'GOLDEN HEADER!':'HEADER!',2);}
                else if(o.kind==='tackle'&&crossing&&crossY<height+7){o.resolved=true;this.hit('태클!',110,584,.8);}
                else if(o.kind==='tackle'&&o.x<65){o.resolved=true;this.dodged++;this.award(90,110,540-this.y,'CLEAR!',1);}
            }
            this.objects=this.objects.filter(o=>o.x>-60&&!(o.resolved&&o.kind==='coin'));
        }
        stats(){return {...super.stats(),dodged:this.dodged,coins:this.coins,headings:this.headings};}
    }
    const COLS=4,ROWS=5,CELL=100,GRID_X=40,GRID_Y=200;
    class ComboGame extends ArcadeModel {
        constructor(seed){
            super(seed);this.id='donghyun';this.grid=Array.from({length:ROWS},()=>Array.from({length:COLS},()=>this.tile()));
            this.pressure=15;this.settle=0;this.blockIn=20;this.chain=[];this.matches=0;this.maxChain=0;this.bombs=0;this.clears=0;this.ensureMove();
        }
        tile(){return {color:Math.floor(this.random()*(this.profile?.colors||3)),hp:0,special:false,fall:0};}
        cellAt(x,y){const c=Math.floor((x-GRID_X)/CELL),r=Math.floor((y-GRID_Y)/CELL);return c>=0&&c<COLS&&r>=0&&r<ROWS?{r,c}:null;}
        group(r,c){
            const tile=this.grid[r]?.[c];if(!tile||tile.hp)return [];
            const seen=new Set(),queue=[{r,c}],result=[];
            while(queue.length){const p=queue.pop(),key=p.r*COLS+p.c;if(seen.has(key))continue;seen.add(key);
                const t=this.grid[p.r]?.[p.c];if(!t||t.hp||t.color!==tile.color)continue;result.push(p);
                for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]])if(p.r+dr>=0&&p.r+dr<ROWS&&p.c+dc>=0&&p.c+dc<COLS)queue.push({r:p.r+dr,c:p.c+dc});
            }return result;
        }
        begin(x,y){if(this.ended||this.settle>0)return;const p=this.cellAt(x,y);this.chain=p&&!this.grid[p.r][p.c].hp?[p]:[];}
        drag(x,y){
            if(!this.chain.length||this.ended)return;const p=this.cellAt(x,y);if(!p)return;
            const last=this.chain[this.chain.length-1],tile=this.grid[p.r][p.c],first=this.chain[0];
            if(this.chain.length>1&&p.r===this.chain[this.chain.length-2].r&&p.c===this.chain[this.chain.length-2].c){this.chain.pop();return;}
            if(tile.hp||tile.color!==this.grid[first.r][first.c].color||Math.max(Math.abs(p.r-last.r),Math.abs(p.c-last.c))!==1||this.chain.some(n=>n.r===p.r&&n.c===p.c))return;
            this.chain.push(p);
        }
        release(){
            if(!this.chain.length||this.ended||this.settle>0){this.chain=[];return false;}
            const first=this.chain[0],cells=this.chain.length===1?this.group(first.r,first.c):this.chain.slice();this.chain=[];
            if(cells.length<2&&!this.grid[first.r][first.c].special)return false;
            this.clear(cells);return true;
        }
        cancel(){this.chain=[];}
        clear(cells){
            if(this.ended||this.settle>0||!cells.length)return;
            const selected=new Map(cells.map(p=>[p.r*COLS+p.c,p])),queue=cells.slice(),exploded=new Set();
            while(queue.length){const p=queue.pop(),key=p.r*COLS+p.c;if(!this.grid[p.r][p.c].special||exploded.has(key))continue;exploded.add(key);this.bombs++;
                for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){const r=p.r+dr,c=p.c+dc;if(r<0||r>=ROWS||c<0||c>=COLS)continue;const k=r*COLS+c;if(!selected.has(k)){const next={r,c};selected.set(k,next);queue.push(next);}}
            }
            const damaged=new Set();
            for(const {r,c} of selected.values())for(const [dr,dc] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]){
                const nr=r+dr,nc=c+dc,tile=this.grid[nr]?.[nc],key=nr*COLS+nc;
                if(tile?.hp&&!damaged.has(key)){tile.hp--;damaged.add(key);if(!tile.hp)this.clears++;}
            }
            let removed=0;
            for(const p of selected.values()){const tile=this.grid[p.r][p.c];if(tile.hp)continue;this.grid[p.r][p.c]=null;removed++;this.emit('pop',GRID_X+(p.c+.5)*CELL,GRID_Y+(p.r+.5)*CELL,'',tile.color);}
            this.matches++;this.maxChain=Math.max(this.maxChain,cells.length);this.pressure=Math.max(0,this.pressure-(4+removed*2.3+Math.max(0,cells.length-3)*2));
            this.award(removed*8+cells.length*cells.length*2,240,220,exploded.size?'CHAIN REACTION!':cells.length>=5?'SUPER KICK!':'COMBO KICK!',cells.length>=5?2:1);
            for(let c=0;c<COLS;c++){
                const kept=this.grid.map(row=>row[c]).filter(Boolean),count=ROWS-kept.length;
                const next=[...Array.from({length:count},()=>this.tile()),...kept];
                for(let r=0;r<ROWS;r++){this.grid[r][c]=next[r];next[r].fall=count?1:0;}
            }
            if(cells.length>=5&&!exploded.size){const origin=cells[0];this.grid[origin.r][origin.c].special=true;this.grid[origin.r][origin.c].hp=0;}
            this.settle=.17;this.ensureMove();
        }
        ensureMove(){
            if(this.grid.some((row,r)=>row.some((t,c)=>t.special||this.group(r,c).length>=2)))return;
            this.grid[ROWS-1][0]={...this.tile(),color:0};this.grid[ROWS-1][1]={...this.tile(),color:0};
        }
        step(dt){
            if(this.settle>0){this.settle=Math.max(0,this.settle-dt);for(const row of this.grid)for(const tile of row)tile.fall=this.settle/.17;return;}
            const p=this.profile;this.pressure+=p.speed*dt;
            if(this.pressure>=100){this.hit('동현이의 골!',360,165,.5);this.pressure=58;this.chain=[];this.settle=.5;}
            this.blockIn-=dt;
            if(p.blockers&&this.blockIn<=0){
                this.blockIn=p.blockerEvery;
                const free=[];for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)if(!this.grid[r][c].hp&&!this.grid[r][c].special&&!this.chain.some(n=>n.r===r&&n.c===c))free.push({r,c});
                const blocked=this.grid.flat().filter(tile=>tile.hp>0).length;if(free.length&&blocked<5){const cell=free[Math.floor(this.random()*free.length)];this.grid[cell.r][cell.c].hp=p.armored?2:1;this.ensureMove();}
            }
        }
        stats(){return {...super.stats(),maxChain:this.maxChain,matches:this.matches,bombs:this.bombs,blockerCleared:this.clears};}
    }
    const MODELS={penalty:ShotGame,pass:PassGame,goalkeeper:KeeperGame,dribble:JumpGame,donghyun:ComboGame};
    function createModel(id,seed=1){if(!MODELS[id])throw new Error('Unknown arcade game: '+id);return new MODELS[id](seed);}

    // The browser view is defined below; models above also run without a DOM.
    function createMiniGames(){
        let dialog,canvas,ctx,model,session,phase='closed',raf=0,last=0,visualTime=0,countdown=0,endWait=0;
        let pointer=null,keys=new Set(),effects=[],labels=[],toast=null,shake=0,audioContext,sound=true,previousFocus;
        const reduced=root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const colors=['#ec9272','#72bcd1','#e9c96e','#b1a0d4'];
        const $=s=>dialog.querySelector(s),escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        const icon={pause:'Ⅱ',close:'×',sound:'♪'};
        function ensure(){
            if(dialog)return;
            dialog=document.createElement('dialog');dialog.className='am-dialog';dialog.setAttribute('aria-labelledby','amTitle');
            dialog.innerHTML=`<div class="am-shell"><header class="am-header"><div><small data-am="tag"></small><strong id="amTitle"></strong></div><div class="am-tools"><button type="button" data-am-action="sound" aria-label="소리 끄기">${icon.sound}</button><button type="button" data-am-action="pause" aria-label="일시정지">${icon.pause}</button><button type="button" data-am-action="close" aria-label="게임 센터로">${icon.close}</button></div></header><div class="am-stage"><canvas width="480" height="720" tabindex="0" role="application"></canvas><div class="am-hud"><div><small data-am="name"></small><strong data-am="score">0</strong></div><div class="am-vitals"><span data-am="hearts">♥ ♥ ♥</span><small data-am="time">00:00</small></div></div><div class="am-streak"><b data-am="combo">READY?</b><span class="am-fever"><i data-am="fever"></i><b data-am="feverText">FEVER</b></span></div><div class="am-banner" data-am="banner" aria-live="polite" hidden></div><div class="am-countdown" data-am="countdown" hidden></div></div><section class="am-home" data-am="home"><span class="am-kicker">ONE MORE TRY</span><h2 data-am="homeTitle"></h2><p data-am="intro"></p><div class="am-best">MY BEST <b data-am="best">0</b><small data-am="rival"></small></div><button type="button" class="am-primary" data-am-action="start">경기 시작 <span>→</span></button><small data-am="help"></small></section><div class="am-controls" data-am="controls" hidden><p data-am="hint"></p><div class="am-buttons"><button type="button" data-am-action="left" aria-label="왼쪽으로 이동">←</button><button type="button" class="am-primary" data-am-action="action"></button><button type="button" data-am-action="right" aria-label="오른쪽으로 이동">→</button></div><small data-am="target"></small></div><section class="am-pause" data-am="pause" hidden><span>HALF TIME</span><h2>잠깐, 숨 고르기</h2><p>준비되면 다시 뛰어요.</p><button type="button" class="am-primary" data-am-action="resume">계속하기 →</button><button type="button" class="am-secondary" data-am-action="close">게임 센터로</button></section></div>`;
            document.body.appendChild(dialog);canvas=$('canvas');ctx=canvas.getContext('2d');
            dialog.addEventListener('cancel',e=>{e.preventDefault();if(phase==='playing'||phase==='countdown')pause();else if(phase==='paused')resume();else close();});
            dialog.addEventListener('click',e=>{
                const action=e.target.closest('[data-am-action]')?.dataset.amAction;
                if(action==='start')start();else if(action==='close')close();else if(action==='pause')pause();else if(action==='resume')resume();
                else if(action==='sound'){sound=!sound;updateSound();if(sound)tone('score');}
                else if(e.detail===0&&action==='action')act();
                else if(e.detail===0&&phase==='playing'&&['left','right'].includes(action))model.move?.(model.targetX+(action==='left'?-140:140));
            });
            dialog.addEventListener('keydown',keydown);dialog.addEventListener('keyup',e=>{keys.delete(e.code);if(['Space','ArrowUp'].includes(e.code))model?.release?.();});
            canvas.addEventListener('pointerdown',e=>{
                if(phase!=='playing'||pointer!==null||e.isPrimary===false||e.button>0)return;
                e.preventDefault();pointer=e.pointerId;canvas.setPointerCapture(pointer);const p=point(e);
                if(model.id==='goalkeeper')model.move(p.x);else if(model.id==='donghyun')model.begin(p.x,p.y);else act();
            });
            canvas.addEventListener('pointermove',e=>{if(e.pointerId!==pointer||phase!=='playing')return;e.preventDefault();const p=point(e);if(model.id==='goalkeeper')model.move(p.x);if(model.id==='donghyun')model.drag(p.x,p.y);});
            const release=e=>{if(e.pointerId!==pointer)return;pointer=null;if(phase==='playing'&&e.type==='pointerup')model?.release?.();else model?.cancel?.();if(model?.id==='dribble')model.release();};
            for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,release);
            for(const action of ['action','left','right']){
                const button=$('[data-am-action="'+action+'"]');
                button.addEventListener('pointerdown',e=>{if(phase!=='playing'||e.isPrimary===false)return;e.preventDefault();if(action==='action')act();else{model.move?.(model.targetX+(action==='left'?-140:140));}button.setPointerCapture?.(e.pointerId);});
                for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>{if(model?.id==='dribble')model.release();});
            }
            root.addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
            root.addEventListener('resize',()=>{if(phase!=='closed'){resize();draw();}});
        }
        function resize(){const b=canvas.getBoundingClientRect(),scale=Math.min(2,root.devicePixelRatio||1)*b.width/W;canvas.width=Math.round(W*scale);canvas.height=Math.round(H*scale);ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);}
        function point(e){const b=canvas.getBoundingClientRect();return {x:(e.clientX-b.left)*W/b.width,y:(e.clientY-b.top)*H/b.height};}
        function setPhase(next){phase=next;dialog.dataset.phase=next;$('[data-am="home"]').hidden=next!=='home';$('[data-am="controls"]').hidden=next==='home';$('[data-am="pause"]').hidden=next!=='paused';$('[data-am="countdown"]').hidden=next!=='countdown';$('[data-am-action="pause"]').disabled=!['playing','countdown'].includes(next);}
        function updateSound(){$('[data-am-action="sound"]').setAttribute('aria-label',sound?'소리 끄기':'소리 켜기');$('[data-am-action="sound"]').setAttribute('aria-pressed',String(sound));$('[data-am-action="sound"]').style.opacity=sound?'1':'.5';try{root.localStorage.setItem('footsalArcadeSound',sound?'on':'off');}catch{}}
        function tone(type){
            if(!sound)return;
            try{audioContext=audioContext||new (root.AudioContext||root.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
                if(audioContext.state!=='running')return;const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(),t=audioContext.currentTime;
                oscillator.type=type==='hit'?'triangle':'sine';oscillator.frequency.setValueAtTime(type==='hit'?170:type==='perfect'?880:520,t);oscillator.frequency.exponentialRampToValueAtTime(type==='hit'?60:1040,t+.1);
                gain.gain.setValueAtTime(.035,t);gain.gain.exponentialRampToValueAtTime(.001,t+.14);oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start(t);oscillator.stop(t+.15);
            }catch{/* Audio is optional. */}
        }
        function open(id,nextSession){
            ensure();if(phase!=='closed')close(false);session=nextSession;previousFocus=document.activeElement;
            model=createModel(id,1);effects=[];labels=[];toast=null;visualTime=0;shake=0;keys.clear();pointer=null;endWait=0;focusCell={r:0,c:0};
            const info=INFO[id];dialog.dataset.game=id;dialog.style.setProperty('--am-accent',info.color);$('#amTitle').textContent=info.title;
            for(const [node,value] of Object.entries({tag:info.tag,homeTitle:info.title,intro:info.intro,help:info.controls,hint:info.hint,name:session.playerName,best:Math.floor(session.best||0).toLocaleString('ko-KR'),rival:session.rival?session.rival.playerName+' · '+session.rival.score.toLocaleString('ko-KR')+'점에 도전':'첫 기록을 남겨보세요'}))$('[data-am="'+node+'"]').textContent=value;
            canvas.setAttribute('aria-label',info.title+'. '+info.controls);$('[data-am-action="action"]').textContent=info.action;$('[data-am-action="action"]').disabled=false;
            for(const side of ['left','right'])$('[data-am-action="'+side+'"]').hidden=id!=='goalkeeper';
            $('[data-am-action="action"]').hidden=id==='donghyun';
            // On small canvases, the puzzle's attacker needs the area under the score HUD.
            const streak=$('.am-streak');if(id==='donghyun')$('[data-am="controls"]').prepend(streak);else $('.am-stage').appendChild(streak);
            try{sound=root.localStorage.getItem('footsalArcadeSound')!=='off';}catch{}updateSound();setPhase('home');dialog.showModal();resize();hud();draw();$('[data-am-action="start"]').focus({preventScroll:true});loop();
        }
        function start(){
            if(phase!=='home')return;const ticket=session.begin();if(!ticket)return;model=createModel(model.id,ticket.seed);countdown=1.8;
            setPhase('countdown');$('[data-am="countdown"]').textContent='3';canvas.focus({preventScroll:true});tone('score');
        }
        function act(){if(phase!=='playing')return;if(model.id==='goalkeeper')model.punch();else if(model.id==='dribble')model.jump();else model.shoot?.();}
        let resumePhase='playing',focusCell={r:0,c:0};
        function keydown(e){
            if(e.code==='Escape'){e.preventDefault();e.stopPropagation();if(phase==='playing'||phase==='countdown')pause();else if(phase==='paused')resume();else close();return;}
            if(!['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyP','Enter'].includes(e.code))return;
            if(e.code==='Enter'&&e.target!==canvas)return;
            if(e.code==='Space'&&e.target.closest('button'))return;
            e.preventDefault();if(e.repeat)return;
            if(e.code==='KeyP'){phase==='paused'?resume():pause();return;}
            if(phase==='home'){if(e.code==='Space'||e.code==='Enter')start();return;}if(phase!=='playing')return;
            keys.add(e.code);
            if(model.id==='donghyun'){
                if(e.code==='ArrowLeft')focusCell.c=clamp(focusCell.c-1,0,COLS-1);if(e.code==='ArrowRight')focusCell.c=clamp(focusCell.c+1,0,COLS-1);
                if(e.code==='ArrowUp')focusCell.r=clamp(focusCell.r-1,0,ROWS-1);if(e.code==='ArrowDown')focusCell.r=clamp(focusCell.r+1,0,ROWS-1);
                if(e.code==='Enter'||e.code==='Space'){model.begin(GRID_X+(focusCell.c+.5)*CELL,GRID_Y+(focusCell.r+.5)*CELL);model.release();}
            }else if(e.code==='Space'||e.code==='Enter'||(model.id==='dribble'&&e.code==='ArrowUp'))act();
        }
        function pause(){if(!['playing','countdown'].includes(phase))return;resumePhase=phase;setPhase('paused');keys.clear();pointer=null;if(model.id==='dribble')model.release();else model.cancel?.();cancelAnimationFrame(raf);raf=0;$('[data-am-action="resume"]').focus({preventScroll:true});}
        function resume(){if(phase!=='paused')return;setPhase(resumePhase);canvas.focus({preventScroll:true});loop();}
        function close(notify=true){if(phase==='closed')return;if(phase==='ending'&&notify){finish();return;}cancelAnimationFrame(raf);raf=0;keys.clear();pointer=null;effects=[];labels=[];phase='closed';dialog.dataset.phase=phase;dialog.close();const old=session;session=null;if(notify)old?.exit();previousFocus?.focus?.({preventScroll:true});}
        function finish(){const old=session,score=model.score,stats=model.stats();close(false);old.finish(score,stats);}
        function loop(){cancelAnimationFrame(raf);last=root.performance.now();raf=requestAnimationFrame(frame);}
        function frame(now){
            raf=0;if(phase==='closed'||phase==='paused')return;const dt=clamp((now-last)/1000,0,.05);last=now;visualTime+=dt;
            if(phase==='countdown'){countdown-=dt;$('[data-am="countdown"]').textContent=countdown>.35?Math.ceil(countdown/.6):'GO!';if(countdown<=0)setPhase('playing');}
            if(phase==='playing'){
                if(model.id==='goalkeeper'){const direction=(keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0);if(direction)model.move(model.targetX+direction*820*dt);}
                model.advance(dt);events();if(model.ended){setPhase('ending');endWait=.85;}
            }else if(phase==='ending'){endWait-=dt;if(endWait<=0){finish();return;}}
            for(const p of effects){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=400*dt;}effects=effects.filter(p=>p.life>0);
            for(const l of labels){l.life-=dt;l.y-=dt*24;}labels=labels.filter(l=>l.life>0);shake=Math.max(0,shake-dt);
            if(toast){toast.life-=dt;if(toast.life<=0)toast=null;}hud();draw();raf=requestAnimationFrame(frame);
        }
        function events(){for(const event of model.takeEvents()){
            if(event.type==='pattern'||event.type==='fever'){toast={text:event.text,life:2.4};tone('perfect');}
            if(['score','perfect','hit'].includes(event.type)){labels.push({...event,life:1.05});tone(event.type);if(event.type==='hit')shake=.2;}
            if(['perfect','score','pop','hit'].includes(event.type)&&!reduced){
                const color=event.type==='hit'?'#ed947c':event.type==='pop'?colors[event.value]:'#ffe097';
                for(let i=0;i<(event.type==='perfect'?16:7);i++)effects.push({x:event.x,y:event.y,vx:Math.cos(i*2.4)*95,vy:-80-Math.sin(i*1.7)*120,life:.5+(i%3)*.12,color});
            }
        }if(labels.length>8)labels.splice(0,labels.length-8);if(effects.length>180)effects.splice(0,effects.length-180);}
        function hud(){
            $('[data-am="score"]').textContent=model.score.toLocaleString('ko-KR');$('[data-am="hearts"]').textContent='♥ '.repeat(model.hearts)+'♡ '.repeat(3-model.hearts);
            $('[data-am="time"]').textContent=String(Math.floor(model.time/60)).padStart(2,'0')+':'+String(Math.floor(model.time%60)).padStart(2,'0');
            $('[data-am="combo"]').textContent=model.combo?model.combo+' COMBO ×'+((1+Math.min(3,Math.floor(model.combo/6)))*(model.feverTime>0?2:1)):'KEEP IT GOING';
            $('[data-am="fever"]').style.width=(model.feverTime>0?model.feverTime/6*100:model.fever)+'%';$('[data-am="feverText"]').textContent=model.feverTime>0?'FEVER ×2':'FEVER';dialog.classList.toggle('am-on-fire',model.feverTime>0);
            const banner=$('[data-am="banner"]');banner.hidden=!toast;if(toast)banner.textContent=toast.text;
            const next=session.rival?.score||session.best||0;$('[data-am="target"]').textContent=next>model.score?'목표까지 '+(next-model.score+1).toLocaleString('ko-KR')+'점':model.score>0?'새 기록을 이어가세요!':INFO[model.id].controls;
            if(model.id==='goalkeeper'){$('[data-am-action="action"]').disabled=model.punchCooldown>0;$('[data-am-action="action"]').textContent=model.punchCooldown>0?'준비 중…':'펀칭!';}
        }
        function round(x,y,w,h,r,fill,stroke=null,lw=2){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}}
        function line(x1,y1,x2,y2,color,width=2){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
        function circle(x,y,r,fill,stroke=null,lw=2){ctx.beginPath();ctx.arc(x,y,r,0,TAU);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}}
        function text(label,x,y,size=18,color='#fff6dc',outline=false){ctx.textAlign='center';ctx.font='900 '+size+'px Pretendard, -apple-system, sans-serif';ctx.lineJoin='round';if(outline){ctx.strokeStyle='#254c40';ctx.lineWidth=5;ctx.strokeText(label,x,y);}ctx.fillStyle=color;ctx.fillText(label,x,y);}
        function shadow(x,y,r,alpha=.2){ctx.fillStyle='rgba(16,56,40,'+alpha+')';ctx.beginPath();ctx.ellipse(x,y,r,r*.23,0,0,TAU);ctx.fill();}
        function human(x,feet,size,pose='standing',role='player',extra={}){
            ctx.save();ctx.translate(x,feet);
            if(pose==='kick'&&!reduced)ctx.rotate(-Math.sin(clamp((model.poseAge??model.ball?.age??.2)/.34,0,1)*Math.PI)*.1);
            root.FootballArcade.drawMascot(ctx,0,-size*.361,size,{role,pose,animationTime:visualTime,...extra});ctx.restore();
        }
        function ball(x,y,r=15,rotation=0,golden=false){
            ctx.save();ctx.translate(x,y);ctx.rotate(rotation);circle(0,0,r,golden?'#ffe48d':'#fffcf1',golden?'#c99848':'#365346',Math.max(1,r*.07));
            ctx.fillStyle=golden?'#bc8a36':'#365346';ctx.beginPath();for(let i=0;i<5;i++){const a=i*TAU/5-Math.PI/2;ctx.lineTo(Math.cos(a)*r*.43,Math.sin(a)*r*.43);}ctx.closePath();ctx.fill();
            for(let i=0;i<5;i++){const a=i*TAU/5-Math.PI/2;line(Math.cos(a)*r*.43,Math.sin(a)*r*.43,Math.cos(a)*r*.92,Math.sin(a)*r*.92,ctx.fillStyle,r*.09);}ctx.restore();
        }
        function pitch(theme='day',offset=0){
            root.FootballArcade.drawStadium(ctx);ctx.fillStyle=theme==='night'?'#25385099':'#315d4624';ctx.fillRect(0,0,W,H);
            if(theme==='night'){
                for(const x of [45,435]){const glow=ctx.createRadialGradient(x,155,2,x,155,270);glow.addColorStop(0,'#ffedbc3d');glow.addColorStop(1,'#ffedbc00');ctx.fillStyle=glow;ctx.fillRect(0,110,W,530);}
            }
        }
        function goal(x=50,y=248,w=380,h=158){
            ctx.save();round(x,y,w,h,4,'#214c4577');ctx.strokeStyle='#ecf1d649';ctx.lineWidth=1;
            for(let i=1;i<14;i++)line(x+i*w/14,y,x+i*w/14,y+h,'#ecf1d642');for(let i=1;i<6;i++)line(x,y+i*h/6,x+w,y+i*h/6,'#ecf1d642');
            ctx.strokeStyle='#fff9dc';ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(x,y+h);ctx.lineTo(x,y);ctx.lineTo(x+w,y);ctx.lineTo(x+w,y+h);ctx.stroke();line(x,y+h,x+w,y+h,'#d5e3b4',3);ctx.restore();
        }
        function timer(remaining,max,y=450){round(120,y,240,7,4,'#244e4255');round(120,y,240*clamp(remaining/max,0,1),7,4,remaining<1?'#ee9a78':'#ffde85');}
        function shotScene(){
            const m=model,home=phase==='home',p=m.profile;pitch('day');goal();
            line(90,420,390,420,'#dfebbc88');ctx.strokeStyle='#dfebbc88';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(240,580,93,22,0,0,TAU);ctx.stroke();
            const shot=m.flight&&m.state!=='aim'?m.flight:null,tx=home?325:shot?shot.targetX:m.targetX;ctx.save();ctx.shadowBlur=reduced?0:22;ctx.shadowColor='#ffdf87';circle(tx,314,p.width,'#f7d66a22','#ffdf85',5);circle(tx,314,p.width*.32,'#ffedbabb','#fff5d5',2);ctx.restore();
            text('×2',tx,314-p.width-15,16,'#ffdf85',true);
            const gx=p.guard?(shot?lerp(shot.guardX,shot.blocked?shot.x:shot.guardX,clamp(shot.age/shot.duration,0,1)):m.guardX):240;shadow(gx,402,29);human(gx,400,92,'standing','defender',{lean:p.guard?Math.cos(m.time*1.25)*.2:0});
            if(p.guard){round(gx-p.guardWidth,360,p.guardWidth*2,45,10,'#ed977245');text('BLOCK',gx,351,12,'#ffe0c5',true);}
            const ax=home?325:m.aimX;
            if(m.state==='aim'||home){ctx.save();ctx.setLineDash([10,12]);line(240,580,ax,314,'#fff5c380',3);ctx.restore();circle(ax,314,9,'#fffadd','#365a46',2);line(ax-16,314,ax+16,314,'#fff9df',2);line(ax,298,ax,330,'#fff9df',2);}
            shadow(212,613,42);human(212,609,155,m.state==='flight'?'kick':'standing');
            if(m.state==='flight'||(m.state==='reset'&&m.flight)){
                const f=m.flight,t=clamp(f.age/f.duration,0,1);for(let i=3;i>=1;i--){const a=Math.max(0,t-i*.055);ctx.globalAlpha=.1;ball(lerp(248,f.x,a),lerp(600,314,a)-Math.sin(a*Math.PI)*45,lerp(22,11,a),a*8);}ctx.globalAlpha=1;
                ball(lerp(248,f.x,t),lerp(600,314,t)-Math.sin(t*Math.PI)*45,lerp(22,11,t),t*8);
            }else ball(254,605,22,visualTime*.15);
            if(phase==='playing'&&m.state==='aim')timer(m.remaining,p.limit,443);
            text('GOLDEN BOOT',240,680,15,'#e7edb1');
        }
        function passScene(){
            const m=model;pitch('day',m.travel);
            for(let i=-2;i<8;i++){ctx.fillStyle=i%2?'#7fae731a':'#1d4c3410';ctx.fillRect(53,175+(i*100+m.travel)%750,374,100);}
            line(33,170,33,720,'#eaf1cfa6',3);line(447,170,447,720,'#eaf1cfa6',3);line(33,390+(m.travel%360),447,390+(m.travel%360),'#eaf1cf60',3);
            ctx.strokeStyle='#eaf1cf60';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(240,390+(m.travel%360),85,45,0,0,TAU);ctx.stroke();
            for(const t of m.targets){
                ctx.save();ctx.setLineDash([5,5]);circle(t.x,t.y,t.r+8,t.golden?'#ffe6a026':'#e5f6d511',t.golden?'#ffdb77':'#dff3d0',2);ctx.restore();shadow(t.x,t.y+7,28);human(t.x,t.y,100,'running','player',{phaseOffset:t.phase});
                if(t.golden)text('★ ×1.7',t.x,t.y-105,14,'#ffe295',true);
            }
            for(const d of m.defenders){shadow(d.x,d.y+6,28);circle(d.x,d.y,28,'#f49f7140');human(d.x,d.y,96,'running','defender',{lean:Math.cos(m.time*m.profile.defenderSpeed/80+d.baseX)*.18});}
            if(m.state==='aim'||phase==='home'){
                const angle=m.angle,ex=m.holderX+Math.sin(angle)*200,ey=590-Math.cos(angle)*200;
                ctx.save();ctx.setLineDash([10,9]);line(m.holderX,581,ex,ey,'#fff4c5',4);ctx.restore();
                ctx.save();ctx.translate(ex,ey);ctx.rotate(angle);ctx.fillStyle='#ffe18f';ctx.beginPath();ctx.moveTo(-11,10);ctx.lineTo(0,-14);ctx.lineTo(11,10);ctx.fill();ctx.restore();timer(m.remaining,m.profile.limit,647);
            }
            const move=m.state==='move'?clamp(m.transition/.24,0,1):0,hx=lerp(m.holderX,m.nextHolder||m.holderX,move);
            shadow(hx,602,35);human(hx,598,126,m.state==='flight'?'kick':move?'running':'standing');
            if(m.ball&&m.state==='flight'){ctx.save();ctx.globalAlpha=.3;line(m.ball.x-m.ball.vx*.07,m.ball.y-m.ball.vy*.07,m.ball.x,m.ball.y,'#fff4d1',10);ctx.restore();ball(m.ball.x,m.ball.y,14,visualTime*8);}else ball(hx+32,601,17,visualTime*2);
            text('KEEP THE BALL MOVING',240,693,13,'#e5edc5');
        }
        function keeperScene(){
            const m=model;pitch('night');goal(35,449,410,204);
            // The net is behind the goalkeeper; the visible landing rings never change target.
            for(const x of [100,240,380]){ctx.save();ctx.setLineDash([4,6]);circle(x,598,m.profile.radius+15,'#fff7d410','#eee7c33d',2);ctx.restore();}
            shadow(240,305,21);human(240,302,83,m.balls.length?'kick':'standing');ball(259,306,12,visualTime*.1);
            for(const b of [...m.balls].sort((a,b)=>a.age/a.duration-b.age/b.duration)){
                const t=clamp(b.age/b.duration,0,1),curve=b.curve?Math.sin(t*Math.PI)*(b.fromX>b.targetX?65:-65):0;
                const x=lerp(b.fromX,b.targetX,t)+curve,y=lerp(321,584,t)-Math.sin(t*Math.PI)*54;
                circle(b.targetX,598,29+Math.sin(t*Math.PI)*7,b.power?'#ffe09e26':'#e1f6eb20',b.power?'#ffe092':'#d5f3ea',3);
                ctx.strokeStyle=b.power?'#ffe092':'#d5f3ea';ctx.lineWidth=5;ctx.beginPath();ctx.arc(b.targetX,598,36,-Math.PI/2,-Math.PI/2+TAU*t);ctx.stroke();
                if(b.power)text('PUNCH!',b.targetX,650,14,'#ffe092',true);else if(b.curve)text('CURVE',b.targetX,650,12,'#dfe9ff',true);
                ctx.save();ctx.globalAlpha=.4;line(x-(b.targetX-b.fromX)*.1,y-40,x,y,b.power?'#ffe194':'#e8f3df',8);ctx.restore();ball(x,y,lerp(10,29,t),t*10,b.power);
            }
            shadow(m.x,620,37);if(m.punchTime>0){circle(m.x,568,53,'#ffe19b33','#fff1b6',5);text('PUNCH!',m.x,496,18,'#ffe092',true);}
            human(m.x,618,122,m.punchTime>0?'celebrate':Math.abs(m.targetX-m.x)>3?'running':'standing','defender',{lean:clamp((m.targetX-m.x)/220,-.4,.4)});
            text('←  MOVE & SAVE  →',240,698,14,'#deead0');
        }
        function jumpScene(){
            const m=model,sky=ctx.createLinearGradient(0,0,0,330);sky.addColorStop(0,'#82bfd1');sky.addColorStop(1,'#dce8bb');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
            root.FootballArcade.drawStadium(ctx,0,140,480,195,[0,0,1024,270]);
            const offset=m.distance*.16%480;for(let i=0;i<2;i++)root.FootballArcade.drawStadium(ctx,i*480-offset,325,480,287,[180,350,640,1050]);
            ctx.fillStyle='#799c583d';ctx.fillRect(0,325,480,287);
            for(let i=0;i<6;i++){const x=((i*130-m.distance*.18)%780+780)%780-130;round(x,354,104,35,3,i%2?'#e6d4a2':'#cf997a');text(i%2?'FC ARCADE':'PLAY!',x+52,377,12,'#385745');}
            ctx.fillStyle='#729861';ctx.fillRect(0,571,480,50);line(0,603,480,603,'#f2efc6',5);ctx.fillStyle='#c59c79';ctx.fillRect(0,622,480,98);
            for(let i=0;i<9;i++){const x=((i*95-m.distance)%855+855)%855-95;line(x,649,x+64,649,'#ead0ac',3);line(x-25,695,x+34,695,'#dcb696',2);}
            for(const o of m.objects){if(o.kind==='coin'){const y=604-o.height;ctx.save();ctx.shadowBlur=reduced?0:16;ctx.shadowColor=o.golden?'#ffe391':'#fff4d1';ball(o.x,y,17,visualTime*3,o.golden);ctx.restore();if(o.golden)text('★',o.x,y-28,19,'#ffe092',true);}
                else{const height=o.height+(o.moving?Math.sin(m.time*7)*14:0);shadow(o.x,608,30);human(o.x,607-(height-o.height),o.height>50?90:87,o.height>50?'running':'sliding','defender');for(let j=0;j<3;j++)line(o.x+28,588-j*9,o.x+46+j*5,588-j*9,'#fff0c099',2);if(o.moving)text('↕',o.x,604-height-24,24,'#ffe9b4',true);}}
            shadow(110,607,34*(1-m.y/650));human(110,604-m.y,121,m.jumps?'dash':'running','player',{lean:m.jumps?.16:0});
            if(m.jumps===2){ctx.save();ctx.globalAlpha=.6;line(84,620-m.y,84,661-m.y,'#e8f5d1',3);line(131,620-m.y,131,650-m.y,'#e8f5d1',3);ctx.restore();}
            round(33,665,144,29,15,'#3258469c');text('JUMP '+('● '.repeat(2-m.jumps)+ '○ '.repeat(m.jumps)),105,685,12,'#ffe5a1');
            if(phase==='home'){human(363,601,101,'sliding','defender');ball(285,461,19,visualTime,true);}
        }
        function puzzleScene(){
            const m=model;ctx.fillStyle='#eae8cf';ctx.fillRect(0,0,W,H);ctx.fillStyle='#d9dfbf';
            for(let i=0;i<10;i++){ctx.save();ctx.translate(i*85-170,0);ctx.rotate(.25);ctx.fillRect(0,0,36,820);ctx.restore();}
            round(26,130,428,61,18,'#638a6c');round(57,149,322,17,9,'#365b48');round(57,149,322*m.pressure/100,17,9,m.pressure>72?'#eb9675':'#eac878');
            goal(402,137,28,40);const dx=64+m.pressure*3.25;shadow(dx,182,20);human(dx,182,71,'running','defender');ball(dx+20,180,8,visualTime*5);
            text('밀어내!',62,140,11,'#fff3cb');
            round(31,196,418,510,22,'#41664f');
            for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
                const tile=m.grid[r][c],x=GRID_X+c*CELL+5,y=GRID_Y+r*CELL+5,fall=Math.min(1,tile.fall)*12;
                round(x,y,90,90,17,'#294e40');round(x,y-fall,90,85,17,tile.hp?'#66786c':colors[tile.color],tile.special?'#fff2ae':'#ffffff3b',tile.special?4:2);
                if(tile.hp){round(x+25,y+20-fall,40,39,7,'#c0cbb2');line(x+32,y+32-fall,x+58,y+32-fall,'#657f6c',4);if(tile.hp>1)line(x+32,y+45-fall,x+58,y+45-fall,'#657f6c',4);text(tile.hp===2?'Ⅱ':'Ⅰ',x+45,y+73-fall,13,'#f5f0d6');}
                else{
                    if(tile.special){circle(x+45,y+43-fall,31,'#354f45','#ffe496',3);text('★',x+45,y+54-fall,34,'#ffe496');}
                    else{ball(x+45,y+42-fall,25,0,tile.color===2);text(['K','P','G','★'][tile.color],x+73,y+75-fall,12,'#ffffffb8');}
                }
                if(m.chain.some(p=>p.r===r&&p.c===c))round(x+2,y+2,86,81,16,'#fff6ca24','#fff5bf',4);
                if(document.activeElement===canvas&&keys.size&&focusCell.r===r&&focusCell.c===c)round(x+1,y+1,88,83,16,null,'#fff9ea',4);
            }
            if(m.chain.length>1){ctx.strokeStyle='#fff5d5';ctx.lineWidth=8;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();for(const p of m.chain)ctx.lineTo(GRID_X+(p.c+.5)*CELL,GRID_Y+(p.r+.5)*CELL);ctx.stroke();ctx.lineCap='butt';text(m.chain.length+' LINK',240,181,20,'#fff1b3',true);}
        }
        function draw(){
            if(!ctx||!model)return;ctx.clearRect(0,0,W,H);ctx.save();if(shake>0&&!reduced)ctx.translate(Math.sin(visualTime*80)*shake*15,0);
            ({penalty:shotScene,pass:passScene,goalkeeper:keeperScene,dribble:jumpScene,donghyun:puzzleScene}[model.id])();
            for(const p of effects){ctx.globalAlpha=clamp(p.life*3,0,1);round(p.x,p.y,6,4,1,p.color);}ctx.globalAlpha=1;
            for(const l of labels){ctx.globalAlpha=clamp(l.life*3,0,1);text(l.text,clamp(l.x,135,345),clamp(l.y,220,590),l.type==='perfect'?23:19,l.type==='hit'?'#ffc5ab':'#fff1b2',true);}ctx.globalAlpha=1;
            if(phase==='ending'){ctx.fillStyle='#264c424d';ctx.fillRect(0,0,W,H);text('FULL TIME',240,377,47,'#fff0ca',true);}
            ctx.restore();
        }
        // Read-only diagnostics also let automated input tests observe the same coordinates the player sees.
        function snapshot(){return model?JSON.parse(JSON.stringify({...model,random:undefined,events:undefined,profile:model.profile,aimX:model.aimX,targetX:model.targetX,angle:model.angle,phase})):null;}
        return {open,close,snapshot,info:INFO};
    }
    if(typeof module!=='undefined'&&module.exports)module.exports={INFO,difficulty,createModel,ShotGame,PassGame,KeeperGame,JumpGame,ComboGame,randomFrom,W,H,COLS,ROWS,CELL,GRID_X,GRID_Y};
    else root.FootballMiniGames=createMiniGames();
})(typeof window!=='undefined'?window:globalThis);
