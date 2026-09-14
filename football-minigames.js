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
        penalty:{title:'골든 부트',tag:'GOLDEN BOOT',color:'#ef9564',action:'슛!',hint:'조준선이 링에 들어오면 탭',intro:'정중앙 슛으로 키퍼를 돌파! 5번째 골든 찬스는 정밀 슛 보너스가 두 배.',controls:'화면 탭 / Space',pattern:['움직이는 표적','키퍼의 압박','흔들리는 골문']},
        pass:{title:'티키타카',tag:'TIKI TAKA',color:'#79bdd0',action:'패스!',hint:'화살표가 동료를 향할 때 탭',intro:'황금 동료를 노릴까, 세 명에게 골고루 연결할까? 트라이앵글을 완성하면 추가 점수!',controls:'화면 탭 / Space',pattern:['동료가 움직인다!','수비가 들어온다!','좁아지는 패스 길']},
        goalkeeper:{title:'골든 글러브',tag:'GOLDEN GLOVE',color:'#ab9bd8',action:'펀칭!',hint:'좌우로 드래그 · 강슛은 펀칭',intro:'착지 표시를 따라 움직여 선방! 노란 강슛은 도착할 때 펀칭하세요.',controls:'드래그 / ← → · 펀칭 Space',pattern:['강슛! 펀칭으로 막아!','휘어지는 커브 슛','연속 슛, 다음 공까지!']},
        dribble:{title:'터치라인 점프',tag:'TOUCHLINE JUMP',color:'#f1af75',action:'점프!',hint:'꾹 누르면 높이 · 공중에서 한 번 더',intro:'태클을 뛰어넘고 공을 헤딩하세요. 더블 점프로 황금 루트에 도전!',controls:'탭 / Space · 길게 눌러 높이',pattern:['높은 태클 등장','연속 태클! 더블 점프','흔들리는 수비 라인']},
        donghyun:{title:'동현이를 막아라',tag:'SWAP & KICK',color:'#e5ba65',action:'타일 바꾸기',hint:'타일 하나를 옆 칸으로 밀어 같은 색 3개!',intro:'타일을 하나씩 바꿔 동현이를 밀어내세요. 4개는 로켓, 5개와 교차 매치는 폭탄!',controls:'옆 칸으로 스와이프 / 두 타일 탭 · 3개부터 팡!',pattern:['방해 타일 등장','네 번째 색 등장!','철벽 타일을 깨라!']}
    });
    function difficulty(id,time=0) {
        const t=finite(time),stage=Math.min(3,Math.floor(t/25));
        if(id==='penalty')return {stage,aimSpeed:1.55+t*.022,width:11+32/(1+t/125)+12*Math.exp(-t/12),limit:.7+4/(1+t/80),drift:t<25?0:Math.min(42,(t-20)*.7),guard:t>=50,guardWidth:22+24*t/(t+100)};
        if(id==='pass')return {stage,aimSpeed:1.6+t*.018,radius:12+28/(1+t/150)+8*Math.exp(-t/12),limit:.8+4.3/(1+t/90),ballSpeed:780+t*1.8,drift:t<25?0:Math.min(36,(t-20)*.6),defenders:t<50?0:t<75?1:2,defenderSpeed:38+t*.7};
        if(id==='goalkeeper')return {stage,flight:.4+1.3/(1+t/72),interval:.22+1.28/(1+t/85),radius:19+24/(1+t/150),punchWindow:.045+.175/(1+t/110),power:t>=25,curve:t>=50,relay:t>=75};
        if(id==='dribble')return {stage,speed:245+t*3+Math.pow(Math.max(0,t-100),1.3)*.04,gap:.48+1.45/(1+t/110),high:t>=25,relay:t>=50,moving:t>=75};
        return {stage,speed:2+t*.055+Math.pow(Math.max(0,t-45),2)*.0008,blockers:t>=25,armored:t>=75,blockerEvery:5+11/(1+t/80),colors:t>=50?4:3};
    }
    class ArcadeModel {
        constructor(seed=1) {
            this.random=randomFrom(seed);this.time=0;this.score=0;this.hearts=1;this.combo=0;this.maxCombo=0;
            this.fever=0;this.feverTime=0;this.fevers=0;this.ended=false;this.endReason='';this.immune=0;this.accumulator=0;this.events=[];this.lastStage=0;
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
            this.hearts--;this.combo=0;this.fever=Math.max(0,this.fever-25);this.immune=grace;this.endReason=message;this.emit('hit',x,y,message);
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
        stats(){return {time:this.time,elapsed:this.time,maxCombo:this.maxCombo,maxLevel:this.level,fevers:this.fevers,endReason:this.endReason};}
    }
    class ShotGame extends ArcadeModel {
        constructor(seed){super(seed);this.id='penalty';this.round=0;this.goals=0;this.perfects=0;this.goldenGoals=0;this.shots=0;this.state='aim';this.flight=null;this.poseAge=1;this.nextRound();}
        nextRound(){this.round++;this.state='aim';this.flight=null;this.remaining=this.profile.limit;this.phase=this.random()*TAU;this.targetBase=105+this.random()*270;this.side=this.random()>.5?1:-1;this.poseAge=0;}
        get aimX(){return 240+170*Math.sin(this.phase);}
        get targetX(){return clamp(this.targetBase+Math.sin(this.time*1.4)*this.profile.drift,78,402);}
        get guardX(){return 240+140*Math.sin(this.time*1.25+1);}
        get goldenShot(){return this.round%5===0;}
        shoot(){
            if(this.state!=='aim'||this.ended)return false;
            const x=this.aimX,error=Math.abs(x-this.targetX),p=this.profile;
            const perfect=error<=p.width*.32,blocked=p.guard&&Math.abs(x-this.guardX)<p.guardWidth&&!perfect;
            this.flight={x,age:0,duration:.34,goal:error<=p.width&&!blocked,perfect,blocked,golden:this.goldenShot,targetX:this.targetX,guardX:this.guardX};
            this.state='flight';this.shots++;this.poseAge=0;this.emit('kick',240,590);return true;
        }
        step(dt){
            this.poseAge+=dt;
            if(this.state==='aim'){
                this.phase+=this.profile.aimSpeed*dt;this.remaining-=dt;
                if(this.remaining<=0){this.hit('슛 시간이 끝났어요.',240,300);this.state='reset';this.resetIn=.4;}
            }else if(this.state==='flight'){
                this.flight.age+=dt;
                if(this.flight.age>=this.flight.duration){
                    const f=this.flight;
                    if(f.goal){const golden=f.perfect&&f.golden;this.goals++;if(f.perfect)this.perfects++;if(golden)this.goldenGoals++;this.award(golden?480:f.perfect?240:130,f.x,265,golden?'GOLDEN SHOT!':f.perfect?'PERFECT!':'GOAL!',golden?3:f.perfect?2:1);}
                    else this.hit(f.blocked?'키퍼 선방!':'아깝다!',f.x,265);
                    this.state='reset';this.resetIn=.42;
                }
            }else if((this.resetIn-=dt)<=0)this.nextRound();
        }
        stats(){return {...super.stats(),round:this.round,goals:this.goals,perfects:this.perfects,goldenGoals:this.goldenGoals,accuracy:Math.round(this.goals/Math.max(1,this.shots)*100)};}
    }
    class PassGame extends ArcadeModel {
        constructor(seed){super(seed);this.id='pass';this.holderX=240;this.travel=0;this.phase=0;this.state='aim';this.passes=0;this.shots=0;this.centerHits=0;this.route=[];this.triangles=0;this.targets=[];this.defenders=[];this.ball=null;this.nextPlay();}
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
                    const receiver=target.baseX??target.x;this.route=this.route.includes(receiver)?[receiver]:[...this.route,receiver];
                    const triangle=this.route.length===3;if(triangle){this.triangles++;this.route=[];}
                    this.award((perfect?160:90)*(target.golden?1.7:1)+(triangle?240:0),target.x,target.y,triangle?'TRIANGLE!':target.golden?'GOLDEN PASS!':perfect?'PERFECT!':'ONE TWO!',triangle?3:perfect?2:1);
                    this.nextHolder=target.x;this.state='move';this.resetIn=.24;this.transition=0;
                }else if(b.y<160||b.x<20||b.x>460||b.age>1.3){this.hit('터치 아웃!',clamp(b.x,40,440),clamp(b.y,200,600));this.state='reset';this.resetIn=.35;}
            }else{
                this.resetIn-=dt;
                if(this.state==='move'){this.transition+=dt;this.travel+=900*dt;}
                if(this.resetIn<=0){if(this.state==='move')this.holderX=clamp(this.nextHolder,140,340);this.ball=null;this.nextPlay();}
            }
        }
        stats(){return {...super.stats(),passes:this.passes,accuracy:Math.round(this.passes/Math.max(1,this.shots)*100),centerHits:this.centerHits,triangles:this.triangles};}
    }
    class KeeperGame extends ArcadeModel {
        constructor(seed){super(seed);this.id='goalkeeper';this.x=240;this.targetX=240;this.balls=[];this.spawnIn=1;this.shotNo=0;this.saves=0;this.justSaves=0;this.conceded=0;this.punchTime=0;this.punchAt=-1;this.punchCooldown=0;this.lastLanding=240;}
        move(x){if(!this.ended&&Number.isFinite(x))this.targetX=clamp(x,48,432);}
        punch(){if(this.ended||this.punchCooldown>0)return false;this.punchAt=this.time;this.punchTime=this.profile.punchWindow;this.punchCooldown=.68;this.emit('punch',this.x,581);return true;}
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
                if(this.ended)break;
                b.age+=dt;if(b.age<b.duration)continue;b.resolved=true;
                const near=Math.abs(this.x-b.targetX)<=this.profile.radius+15,punching=this.punchTime>0;
                if(near&&(!b.power||punching)){const just=punching&&this.time-this.punchAt<=.075;this.saves++;if(just)this.justSaves++;this.award((b.power?100:punching?75:45)+(just?65:0),b.targetX,540,just?'JUST SAVE!':b.power?'POWER SAVE!':punching?'PERFECT!':'SAVE!',just?3:punching?2:1);}
                else{this.conceded++;this.hit(near&&b.power?'강슛은 펀칭!':'골!',b.targetX,580,.05);}
            }
            this.balls=this.balls.filter(b=>!b.resolved);
        }
        stats(){return {...super.stats(),saves:this.saves,justSaves:this.justSaves,saveRate:Math.round(this.saves/Math.max(1,this.saves+this.conceded)*100)};}
    }
    class JumpGame extends ArcadeModel {
        constructor(seed){super(seed);this.id='dribble';this.y=0;this.vy=0;this.jumps=0;this.holding=false;this.holdTime=0;this.jumpAge=0;this.landAge=1;this.spawnIn=1.2;this.objects=[];this.wave=0;this.distance=0;this.dodged=0;this.lowClears=0;this.coins=0;this.headings=0;this.headerChain=0;this.maxHeaderChain=0;}
        jump(){
            if(this.ended||this.jumps>=2)return false;
            this.vy=this.jumps?560:630;this.jumps++;this.holding=true;this.holdTime=0;this.jumpAge=0;this.emit('jump',110,604-this.y,this.jumps===2?'DOUBLE!':'');return true;
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
            this.landAge+=dt;
            if(this.jumps){this.jumpAge+=dt;this.holdTime+=dt;this.vy-=1850*(this.holding&&this.holdTime<.16&&this.vy>0?.66:1)*dt;this.y+=this.vy*dt;if(this.y<=0){this.y=0;this.vy=0;this.jumps=0;this.holding=false;this.landAge=0;this.emit('land',110,606);}}
            for(const o of this.objects){
                if(this.ended)break;
                const oldX=o.x;o.x-=p.speed*dt;if(o.resolved)continue;
                const height=o.height+(o.moving?Math.sin(this.time*7)*14:0);
                // Inset body contact: extended boots and motion trails are not the hitbox.
                const crossing=oldX>=88&&o.x<=132,at=clamp((oldX-110)/(oldX-o.x||1),0,1),crossY=lerp(oldY,this.y,at);
                if(o.kind==='tackle'&&crossing)o.clearance=Math.min(o.clearance??Infinity,crossY-height);
                if(o.kind==='coin'&&distanceToSegment(110,height-68,oldX,oldY,o.x,this.y)<42){o.resolved=true;this.coins++;this.headings++;this.headerChain++;this.maxHeaderChain=Math.max(this.maxHeaderChain,this.headerChain);const trick=this.headerChain%3===0;this.award((o.golden?230:100)+(trick?120:0),o.x,604-height,trick?'HEADER HAT-TRICK!':o.golden?'GOLDEN HEADER!':'HEADER!',trick?3:2);}
                else if(o.kind==='tackle'&&crossing&&crossY<height+7){o.resolved=true;this.hit('태클!',110,584,.8);}
                else if(o.kind==='tackle'&&o.x<65){o.resolved=true;this.dodged++;const low=o.clearance>=7&&o.clearance<=24;if(low)this.lowClears++;this.award(low?150:90,110,540-this.y,low?'CLOSE CLEAR!':'CLEAR!',low?2:1);}
                else if(o.kind==='coin'&&o.x<65){o.resolved=true;this.headerChain=0;}
            }
            this.objects=this.objects.filter(o=>o.x>-60&&!(o.resolved&&o.kind==='coin'));
        }
        stats(){return {...super.stats(),dodged:this.dodged,coins:this.coins,headings:this.headings,lowClears:this.lowClears,maxHeaderChain:this.maxHeaderChain};}
    }
    const COLS=4,ROWS=5,CELL=100,GRID_X=40,GRID_Y=200;
    function matchGroups(grid) {
        const groups=[];
        for(const axis of ['row','column'])for(let line=0;line<(axis==='row'?ROWS:COLS);line++){
            let run=[],color=-1;
            const flush=()=>{if(run.length>=3)groups.push({axis,cells:run});run=[];};
            for(let i=0;i<=(axis==='row'?COLS:ROWS);i++){
                const r=axis==='row'?line:i,c=axis==='row'?i:line,tile=grid[r]?.[c];
                if(!tile||tile.hp||tile.color!==color){flush();color=tile&&!tile.hp?tile.color:-1;}
                if(tile&&!tile.hp)run.push({r,c});
            }
        }
        return groups;
    }
    function swapMoves(grid) {
        const moves=[];
        for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)for(const [dr,dc] of [[1,0],[0,1]]){
            const nr=r+dr,nc=c+dc,a=grid[r]?.[c],b=grid[nr]?.[nc];if(!a||!b||a.hp||b.hp)continue;
            grid[r][c]=b;grid[nr][nc]=a;
            const groups=matchGroups(grid),size=new Set(groups.flatMap(g=>g.cells.map(p=>p.r*COLS+p.c))).size;
            grid[r][c]=a;grid[nr][nc]=b;
            if(size||a.special||b.special)moves.push({a:{r,c},b:{r:nr,c:nc},size,value:size+(a.special?5:0)+(b.special?5:0)});
        }
        return moves;
    }
    class ComboGame extends ArcadeModel {
        constructor(seed){
            super(seed);this.id='donghyun';this.grid=Array.from({length:ROWS},()=>Array(COLS).fill(null));
            this.pressure=15;this.settle=0;this.blockIn=20;this.state='idle';this.selected=null;this.press=null;this.dragTarget=null;
            this.animation=null;this.clearing=[];this.cascade=0;this.matches=0;this.moves=0;this.maxChain=0;this.bombs=0;this.clears=0;this.clutchSaves=0;this.clutchReady=true;this.idleTime=0;
            this.fillStable();this.ensureMove();
        }
        tile(){return {color:Math.floor(this.random()*this.profile.colors),hp:0,special:false,fall:0};}
        cellAt(x,y){const c=Math.floor((x-GRID_X)/CELL),r=Math.floor((y-GRID_Y)/CELL);return c>=0&&c<COLS&&r>=0&&r<ROWS?{r,c}:null;}
        movable(p){return !!p&&!!this.grid[p.r]?.[p.c]&&!this.grid[p.r][p.c].hp;}
        neighbor(a,b){return !!a&&!!b&&Math.abs(a.r-b.r)+Math.abs(a.c-b.c)===1;}
        fillStable(fixed=false){
            for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
                const old=this.grid[r][c];if(old?.hp)continue;
                const tile=this.tile(),allowed=[];
                for(let color=0;color<this.profile.colors;color++){
                    const same=t=>t&&!t.hp&&t.color===color;
                    if(c>=2&&same(this.grid[r][c-1])&&same(this.grid[r][c-2]))continue;
                    if(r>=2&&same(this.grid[r-1][c])&&same(this.grid[r-2][c]))continue;
                    allowed.push(color);
                }
                tile.color=fixed&&r<2&&c<3?(r+c)%2:allowed[Math.floor(this.random()*allowed.length)];
                tile.special=old?.special||false;this.grid[r][c]=tile;
            }
        }
        begin(x,y){if(this.ended||this.state!=='idle')return false;const p=this.cellAt(x,y);this.press=this.movable(p)?{...p,x,y}:null;this.dragTarget=null;return !!this.press;}
        drag(x,y){
            if(!this.press||this.ended||this.state!=='idle')return;
            const dx=x-this.press.x,dy=y-this.press.y;
            if(Math.max(Math.abs(dx),Math.abs(dy))<20){this.dragTarget=null;return;}
            const p={r:this.press.r+(Math.abs(dy)>Math.abs(dx)?Math.sign(dy):0),c:this.press.c+(Math.abs(dx)>=Math.abs(dy)?Math.sign(dx):0)};
            this.dragTarget=this.movable(p)?p:null;
        }
        release(){
            const p=this.press,target=this.dragTarget;this.press=null;this.dragTarget=null;
            if(!p||this.ended||this.state!=='idle')return false;
            if(target)return this.swap(p,target);
            if(this.neighbor(this.selected,p))return this.swap(this.selected,p);
            this.selected=this.selected?.r===p.r&&this.selected?.c===p.c?null:{r:p.r,c:p.c};return false;
        }
        cancel(){this.press=null;this.dragTarget=null;this.selected=null;}
        swap(a,b){
            if(this.ended||this.state!=='idle'||!this.neighbor(a,b)||!this.movable(a)||!this.movable(b))return false;
            this.cancel();this.idleTime=0;this.moves++;this.cascade=0;
            this.lastSwap={a:{r:a.r,c:a.c},b:{r:b.r,c:b.c}};this.exchange(a,b);this.animate('swap',.14,this.lastSwap);return true;
        }
        exchange(a,b){[this.grid[a.r][a.c],this.grid[b.r][b.c]]=[this.grid[b.r][b.c],this.grid[a.r][a.c]];}
        animate(type,duration,extra={}){this.state=type;this.settle=duration;this.animation={type,duration,age:0,...extra};}
        clearMatches(groups,activated=[]){
            const cells=new Map(groups.flatMap(g=>g.cells).map(p=>[p.r*COLS+p.c,p]));
            for(const p of activated)cells.set(p.r*COLS+p.c,p);
            if(!cells.size)return false;
            const queue=[...cells.values()],exploded=new Set();
            while(queue.length){const p=queue.pop(),key=p.r*COLS+p.c,tile=this.grid[p.r][p.c];if(!tile?.special||exploded.has(key))continue;exploded.add(key);this.bombs++;
                for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
                    const inside=tile.special==='row'?r===p.r:tile.special==='column'?c===p.c:Math.abs(r-p.r)<=1&&Math.abs(c-p.c)<=1;
                    if(!inside)continue;const k=r*COLS+c;if(!cells.has(k)){const next={r,c};cells.set(k,next);queue.push(next);}
                }
            }
            const damaged=new Set();
            for(const {r,c} of [...cells.values()])for(const [dr,dc] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]){
                const nr=r+dr,nc=c+dc,tile=this.grid[nr]?.[nc],key=nr*COLS+nc;
                if(tile?.hp&&!damaged.has(key)){tile.hp--;damaged.add(key);if(!tile.hp){this.clears++;cells.set(key,{r:nr,c:nc});}}
            }
            const largest=groups.slice().sort((a,b)=>b.cells.length-a.cells.length)[0];
            const crossing=groups.flatMap(g=>g.cells).length>new Set(groups.flatMap(g=>g.cells).map(p=>p.r*COLS+p.c)).size;
            if(!exploded.size&&largest&&(largest.cells.length>=4||crossing)){
                const preferred=this.lastSwap?.b,p=preferred&&cells.has(preferred.r*COLS+preferred.c)?preferred:largest.cells[Math.floor(largest.cells.length/2)];
                this.grid[p.r][p.c].special=crossing||largest.cells.length>=5?'burst':largest.axis;cells.delete(p.r*COLS+p.c);
            }
            this.clearing=[...cells.values()].filter(p=>!this.grid[p.r][p.c].hp);
            for(const p of this.clearing)this.emit('pop',GRID_X+(p.c+.5)*CELL,GRID_Y+(p.r+.5)*CELL,'',this.grid[p.r][p.c].color);
            this.cascade++;this.matches++;this.maxChain=Math.max(this.maxChain,this.cascade);
            const clutch=this.clutchReady&&this.pressure>=80;if(clutch){this.clutchSaves++;this.clutchReady=false;}
            this.pressure=Math.max(0,this.pressure-(4+this.clearing.length*1.9+Math.min(5,this.cascade-1)*2));if(this.pressure<55)this.clutchReady=true;
            this.award(this.clearing.length*12+this.cascade*20+exploded.size*45+(clutch?80:0),240,196,clutch?'CLUTCH KICK!':this.cascade>1?this.cascade+' CHAIN!':exploded.size?'ROCKET KICK!':'MATCH KICK!',clutch?3:this.cascade>1||largest?.cells.length>=4?2:1);
            this.animate('pop',.17);return true;
        }
        fall(){
            for(const p of this.clearing)this.grid[p.r][p.c]=null;this.clearing=[];
            let maxFall=0;
            for(let c=0;c<COLS;c++){
                const kept=this.grid.map((row,r)=>({tile:row[c],r})).filter(p=>p.tile),count=ROWS-kept.length;
                const next=[...Array.from({length:count},(_,i)=>({tile:this.tile(),r:i-count})),...kept];
                for(let r=0;r<ROWS;r++){const p=next[r];this.grid[r][c]=p.tile;p.tile.fall=r-p.r;maxFall=Math.max(maxFall,p.tile.fall);}
            }
            this.animate('fall',.17+maxFall*.015);
        }
        ensureMove(){
            if(swapMoves(this.grid).length)return;
            this.cancel();
            for(let attempt=0;attempt<40;attempt++){this.fillStable();if(swapMoves(this.grid).length){if(this.time>0)this.emit('shuffle',240,190,'새 패스 길!');return;}}
            const blockers=this.grid.flat().filter(t=>t.hp).slice(0,5),specials=this.grid.flat().filter(t=>t.special).map(t=>t.special);
            this.grid=Array.from({length:ROWS},()=>Array(COLS).fill(null));
            blockers.forEach((tile,r)=>{this.grid[r][3]=tile;});this.fillStable(true);
            for(let i=0;i<specials.length;i++){const tile=this.grid.flat().filter(t=>!t.hp)[i];if(tile)tile.special=specials[i];}
            if(this.time>0)this.emit('shuffle',240,190,'새 패스 길!');
        }
        step(dt){
            const p=this.profile;this.pressure=Math.min(100,this.pressure+p.speed*dt);this.blockIn-=dt;this.idleTime+=dt;
            if(this.pressure>=100){this.hit('동현이의 골!',360,165);this.cancel();return;}
            if(this.animation){
                this.animation.age+=dt;this.settle=Math.max(0,this.animation.duration-this.animation.age);if(this.settle>0)return;
                const animation=this.animation;this.animation=null;
                if(animation.type==='swap'){
                    const groups=matchGroups(this.grid),activated=[animation.a,animation.b].filter(p=>this.grid[p.r][p.c].special);
                    if(!this.clearMatches(groups,activated)){this.exchange(animation.a,animation.b);this.animate('return',.12,{a:animation.a,b:animation.b});this.combo=0;}
                }else if(animation.type==='pop')this.fall();
                else if(animation.type==='fall'){
                    for(const row of this.grid)for(const tile of row)tile.fall=0;
                    if(!this.clearMatches(matchGroups(this.grid))){this.state='idle';this.ensureMove();}
                }else{this.state='idle';this.ensureMove();}
                return;
            }
            if(p.blockers&&this.blockIn<=0&&!this.press){
                this.blockIn=p.blockerEvery;
                const free=[];for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)if(!this.grid[r][c].hp&&!this.grid[r][c].special&&!(this.selected?.r===r&&this.selected?.c===c))free.push({r,c});
                if(free.length&&this.grid.flat().filter(t=>t.hp).length<5){const cell=free[Math.floor(this.random()*free.length)];this.grid[cell.r][cell.c].hp=p.armored?2:1;this.ensureMove();}
            }
        }
        stats(){return {...super.stats(),maxChain:this.maxChain,matches:this.matches,moves:this.moves,bombs:this.bombs,blockerCleared:this.clears,clutchSaves:this.clutchSaves};}
    }
    const MODELS={penalty:ShotGame,pass:PassGame,goalkeeper:KeeperGame,dribble:JumpGame,donghyun:ComboGame};
    function createModel(id,seed=1){if(!MODELS[id])throw new Error('Unknown arcade game: '+id);return new MODELS[id](seed);}

    // The browser view is defined below; models above also run without a DOM.
    function createMiniGames(){
        let dialog,canvas,ctx,model,session,phase='closed',raf=0,last=0,visualTime=0,countdown=0,endWait=0;
        let pointer=null,keyboardMode=false,keys=new Set(),effects=[],rings=[],labels=[],toast=null,shake=0,audioContext,sound=true,previousFocus,lastReward=null,displayPressure=15;
        const nodes=new Map(),pitchCache=new Map();
        const reduced=root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const colors=['#ec9272','#72bcd1','#e9c96e','#b1a0d4'];
        const $=s=>{if(!nodes.has(s))nodes.set(s,dialog.querySelector(s));return nodes.get(s);},escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        const setText=(node,value)=>{value=String(value);if(node.textContent!==value)node.textContent=value;};
        const icon={pause:'Ⅱ',close:'×',sound:'♪'};
        function ensure(){
            if(dialog)return;
            dialog=document.createElement('dialog');dialog.className='am-dialog';dialog.setAttribute('aria-labelledby','amTitle');
            dialog.innerHTML=`<div class="am-shell"><header class="am-header"><div><small data-am="tag"></small><strong id="amTitle"></strong></div><div class="am-tools"><button type="button" data-am-action="sound" aria-label="소리 끄기">${icon.sound}</button><button type="button" data-am-action="pause" aria-label="일시정지">${icon.pause}</button><button type="button" data-am-action="close" aria-label="게임 센터로">${icon.close}</button></div></header><div class="am-stage"><canvas width="480" height="720" tabindex="0" role="application"></canvas><div class="am-hud"><div><small data-am="name"></small><strong data-am="score">0</strong></div><div class="am-vitals"><span data-am="level">Lv.1</span><small data-am="time">00:00</small></div></div><div class="am-streak"><b data-am="combo">READY?</b><span class="am-fever"><i data-am="fever"></i><b data-am="feverText">FEVER</b></span></div><div class="am-banner" data-am="banner" aria-live="polite" hidden></div><div class="am-countdown" data-am="countdown" hidden></div></div><section class="am-home" data-am="home"><span class="am-kicker">ONE MORE TRY</span><h2 data-am="homeTitle"></h2><p data-am="intro"></p><div class="am-best">MY BEST <b data-am="best">0</b><small data-am="rival"></small></div><button type="button" class="am-primary" data-am-action="start">경기 시작 <span>→</span></button><small data-am="help"></small></section><div class="am-controls" data-am="controls" hidden><p data-am="hint"></p><div class="am-buttons"><button type="button" data-am-action="left" aria-label="왼쪽으로 이동">←</button><button type="button" class="am-primary" data-am-action="action"></button><button type="button" data-am-action="right" aria-label="오른쪽으로 이동">→</button></div><small data-am="target"></small></div><section class="am-pause" data-am="pause" hidden><span>HALF TIME</span><h2>잠깐, 숨 고르기</h2><p>준비되면 다시 뛰어요.</p><button type="button" class="am-primary" data-am-action="resume">계속하기 →</button><button type="button" class="am-secondary" data-am-action="close">게임 센터로</button></section></div>`;
            document.body.appendChild(dialog);canvas=$('canvas');ctx=canvas.getContext('2d');
            root.FootballArcade.guardGestures(dialog,()=>['playing','countdown','paused','ending'].includes(phase));
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
                e.preventDefault();keyboardMode=false;pointer=e.pointerId;canvas.setPointerCapture(pointer);const p=point(e);
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
            model=createModel(id,1);effects=[];rings=[];labels=[];toast=null;lastReward=null;displayPressure=15;visualTime=0;shake=0;keys.clear();pointer=null;keyboardMode=false;endWait=0;focusCell={r:0,c:0};
            const info=INFO[id];dialog.dataset.game=id;dialog.style.setProperty('--am-accent',info.color);$('#amTitle').textContent=info.title;
            for(const [node,value] of Object.entries({tag:info.tag,homeTitle:info.title,intro:info.intro,help:info.controls+' · '+(id==='donghyun'?'골을 허용하면 종료':'한 번 실패하면 종료'),hint:info.hint,name:session.playerName,best:Math.floor(session.best||0).toLocaleString('ko-KR'),rival:session.rival?session.rival.playerName+' · '+session.rival.score.toLocaleString('ko-KR')+'점에 도전':'첫 기록을 남겨보세요'}))$('[data-am="'+node+'"]').textContent=value;
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
                keyboardMode=true;
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
            for(const ring of rings)ring.age+=dt;rings=rings.filter(ring=>ring.age<ring.duration);
            if(model.id==='donghyun')displayPressure=model.ended||model.pressure>=displayPressure?model.pressure:lerp(displayPressure,model.pressure,1-Math.exp(-16*dt));
            for(const l of labels){l.life-=dt;l.y-=dt*24;}labels=labels.filter(l=>l.life>0);shake=Math.max(0,shake-dt);
            if(toast){toast.life-=dt;if(toast.life<=0)toast=null;}hud();draw();raf=requestAnimationFrame(frame);
        }
        function events(){for(const event of model.takeEvents()){
            if(event.type==='pattern'||event.type==='shuffle'){toast={text:event.text,life:event.type==='pattern'?2.1:1.2};tone('perfect');}
            if(event.type==='fever')tone('perfect');
            if(['score','perfect','hit'].includes(event.type)){
                labels=model.id==='donghyun'?[]:labels.filter(label=>Math.abs(label.x-event.x)>100||Math.abs(label.y-event.y)>42);
                labels.push({...event,life:1.05});tone(event.type);if(event.type==='hit')shake=.2;else lastReward={...event,time:visualTime};
            }
            if(!reduced&&['kick','punch','jump','land','perfect','hit'].includes(event.type)){
                rings.push({x:event.x,y:event.y,age:0,duration:event.type==='perfect'?.42:.25,radius:event.type==='perfect'?66:event.type==='land'?32:46,color:event.type==='hit'?'#ffb18e':event.type==='perfect'?'#ffe39c':'#eef9df',flat:event.type==='jump'||event.type==='land'});
            }
            if(['perfect','score','pop','hit'].includes(event.type)&&!reduced){
                const color=event.type==='hit'?'#ed947c':event.type==='pop'?colors[event.value]:'#ffe097';
                for(let i=0;i<(event.type==='perfect'?16:7);i++)effects.push({x:event.x,y:event.y,vx:Math.cos(i*2.4)*95,vy:-80-Math.sin(i*1.7)*120,life:.5+(i%3)*.12,color});
            }
        }if(labels.length>8)labels.splice(0,labels.length-8);if(rings.length>16)rings.splice(0,rings.length-16);if(effects.length>180)effects.splice(0,effects.length-180);}
        function hud(){
            setText($('[data-am="score"]'),model.score.toLocaleString('ko-KR'));setText($('[data-am="level"]'),'Lv.'+model.level);
            setText($('[data-am="time"]'),String(Math.floor(model.time/60)).padStart(2,'0')+':'+String(Math.floor(model.time%60)).padStart(2,'0'));
            setText($('[data-am="combo"]'),model.combo?model.combo+' COMBO ×'+((1+Math.min(3,Math.floor(model.combo/6)))*(model.feverTime>0?2:1)):'KEEP IT GOING');
            const fever=$('[data-am="fever"]'),transform='scaleX('+((model.feverTime>0?model.feverTime/6:model.fever/100).toFixed(3))+')';if(fever.style.transform!==transform)fever.style.transform=transform;setText($('[data-am="feverText"]'),model.feverTime>0?'FEVER ×2':'FEVER');dialog.classList.toggle('am-on-fire',model.feverTime>0);
            const banner=$('[data-am="banner"]');if(banner.hidden!==!toast)banner.hidden=!toast;if(toast)setText(banner,toast.text);
            const next=session.rival?.score||session.best||0;setText($('[data-am="target"]'),next>model.score?'목표까지 '+(next-model.score+1).toLocaleString('ko-KR')+'점':model.score>0?'새 기록을 이어가세요!':INFO[model.id].controls);
            const golden=model.id==='penalty'&&model.goldenShot,ready=model.id==='goalkeeper'&&model.punchCooldown<=0&&model.balls.some(b=>b.duration-b.age<.16);
            const bonus=golden||ready?'true':'false';if(dialog.dataset.bonus!==bonus)dialog.dataset.bonus=bonus;
            if(model.id==='goalkeeper'){const button=$('[data-am-action="action"]');if(button.disabled!==(model.punchCooldown>0))button.disabled=model.punchCooldown>0;setText(button,model.punchCooldown>0?'준비 중…':ready?'지금 펀칭!':'펀칭!');}
            if(model.id==='penalty')setText($('[data-am-action="action"]'),golden?'골든 슛!':'슛!');
        }
        function round(x,y,w,h,r,fill,stroke=null,lw=2){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}}
        function line(x1,y1,x2,y2,color,width=2){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
        function circle(x,y,r,fill,stroke=null,lw=2){ctx.beginPath();ctx.arc(x,y,r,0,TAU);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}}
        function text(label,x,y,size=18,color='#fff6dc',outline=false){ctx.textAlign='center';ctx.font='900 '+size+'px Pretendard, -apple-system, sans-serif';ctx.lineJoin='round';if(outline){ctx.strokeStyle='#254c40';ctx.lineWidth=5;ctx.strokeText(label,x,y);}ctx.fillStyle=color;ctx.fillText(label,x,y);}
        function shadow(x,y,r,alpha=.2){ctx.fillStyle='rgba(16,56,40,'+alpha+')';ctx.beginPath();ctx.ellipse(x,y,r,r*.23,0,0,TAU);ctx.fill();}
        function human(x,feet,size,pose='standing',role='player',extra={}){
            ctx.save();ctx.translate(x,feet);
            root.FootballArcade.drawMascot(ctx,0,-size*.361,size,{role,pose,animationTime:visualTime,motionAge:pose==='kick'?(model.flight?.age??model.ball?.age??.18):undefined,...extra});ctx.restore();
        }
        function ball(x,y,r=15,rotation=0,golden=false){
            ctx.save();ctx.translate(x,y);ctx.rotate(rotation);circle(0,0,r,golden?'#ffe48d':'#fffcf1',golden?'#c99848':'#365346',Math.max(1,r*.07));
            ctx.fillStyle=golden?'#bc8a36':'#365346';ctx.beginPath();for(let i=0;i<5;i++){const a=i*TAU/5-Math.PI/2;ctx.lineTo(Math.cos(a)*r*.43,Math.sin(a)*r*.43);}ctx.closePath();ctx.fill();
            for(let i=0;i<5;i++){const a=i*TAU/5-Math.PI/2;line(Math.cos(a)*r*.43,Math.sin(a)*r*.43,Math.cos(a)*r*.92,Math.sin(a)*r*.92,ctx.fillStyle,r*.09);}ctx.restore();
        }
        function pitch(theme='day',offset=0){
            if(!pitchCache.has(theme)){
                const layer=document.createElement('canvas');layer.width=W*2;layer.height=H*2;const ink=layer.getContext('2d');ink.scale(2,2);root.FootballArcade.drawStadium(ink);
                ink.fillStyle=theme==='night'?'#19364ead':theme==='sunset'?'#87522e27':'#25645219';ink.fillRect(0,0,W,H);
                const vignette=ink.createRadialGradient(240,440,120,240,400,470);vignette.addColorStop(0,'#152a3400');vignette.addColorStop(1,theme==='night'?'#102c43b0':'#193f4360');ink.fillStyle=vignette;ink.fillRect(0,0,W,H);
                if(theme!=='day')for(const x of [40,440]){const glow=ink.createRadialGradient(x,150,5,x,210,300);glow.addColorStop(0,theme==='night'?'#bde9ff70':'#ffd99c80');glow.addColorStop(1,'#ffedbc00');ink.fillStyle=glow;ink.fillRect(0,100,W,570);}
                pitchCache.set(theme,layer);
            }
            ctx.drawImage(pitchCache.get(theme),0,0,W,H);
        }
        function goal(x=50,y=248,w=380,h=158){
            ctx.save();round(x+7,y+8,w,h,4,'#142e3540');round(x,y,w,h,4,'#183f477d');ctx.strokeStyle='#ecf1d649';ctx.lineWidth=1;
            for(let i=1;i<14;i++)line(x+i*w/14,y,x+i*w/14,y+h,'#ecf1d642');for(let i=1;i<6;i++)line(x,y+i*h/6,x+w,y+i*h/6,'#ecf1d642');
            ctx.strokeStyle='#fff9dc';ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(x,y+h);ctx.lineTo(x,y);ctx.lineTo(x+w,y);ctx.lineTo(x+w,y+h);ctx.stroke();line(x,y+h,x+w,y+h,'#d5e3b4',3);ctx.restore();
        }
        function timer(remaining,max,y=450){round(120,y,240,7,4,'#244e4255');round(120,y,240*clamp(remaining/max,0,1),7,4,remaining<1?'#ee9a78':'#ffde85');}
        function shotScene(){
            const m=model,home=phase==='home',p=m.profile;pitch('sunset');goal();
            round(143,174,194,29,14,m.goldenShot?'#ffdb89':'#284f47cf');text(m.goldenShot?'★ GOLDEN CHANCE':'ROUND '+m.round,240,194,13,m.goldenShot?'#365343':'#f1edd4');
            if(lastReward&&visualTime-lastReward.time<.36&&!reduced){ctx.globalAlpha=(1-(visualTime-lastReward.time)/.36)*.3;round(55,253,370,148,3,'#ffe6a0');ctx.globalAlpha=1;}
            line(90,420,390,420,'#dfebbc88');ctx.strokeStyle='#dfebbc88';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(240,580,93,22,0,0,TAU);ctx.stroke();
            const shot=m.flight&&m.state!=='aim'?m.flight:null,tx=home?325:shot?shot.targetX:m.targetX;ctx.save();ctx.shadowBlur=reduced?0:22;ctx.shadowColor='#ffdf87';circle(tx,314,p.width,'#f7d66a22','#ffdf85',5);circle(tx,314,p.width*.32,'#ffedbabb','#fff5d5',2);ctx.restore();
            text(m.goldenShot?'★ PERFECT ×2':'PERFECT',tx,314-p.width-15,m.goldenShot?16:12,'#ffdf85',true);
            const gx=p.guard?(shot?lerp(shot.guardX,shot.blocked?shot.x:shot.guardX,clamp(shot.age/shot.duration,0,1)):m.guardX):240;shadow(gx,402,29);human(gx,400,92,'standing','defender',{lean:p.guard?Math.cos(m.time*1.25)*.2:0});
            if(p.guard){round(gx-p.guardWidth,360,p.guardWidth*2,45,10,'#ed977245');text('BLOCK',gx,351,12,'#ffe0c5',true);}
            const ax=home?325:m.aimX;
            if(m.state==='aim'||home){ctx.save();ctx.setLineDash([10,12]);line(240,580,ax,314,'#fff5c380',3);ctx.restore();circle(ax,314,9,'#fffadd','#365a46',2);line(ax-16,314,ax+16,314,'#fff9df',2);line(ax,298,ax,330,'#fff9df',2);}
            shadow(212,613,42);human(212,609,155,m.ended?'standing':m.state==='flight'?'kick':m.state==='reset'&&m.flight?.goal?'celebrate':'standing','player',m.ended?{motionMode:'fall',motionAge:.85-endWait}:{});
            if(m.state==='flight'||(m.state==='reset'&&m.flight)){
                const f=m.flight,t=clamp(f.age/f.duration,0,1);for(let i=3;i>=1;i--){const a=Math.max(0,t-i*.055);ctx.globalAlpha=.1;ball(lerp(248,f.x,a),lerp(600,314,a)-Math.sin(a*Math.PI)*45,lerp(22,11,a),a*8);}ctx.globalAlpha=1;
                ball(lerp(248,f.x,t),lerp(600,314,t)-Math.sin(t*Math.PI)*45,lerp(22,11,t),t*8,f.golden);
            }else ball(254,605,22,visualTime*.15,m.goldenShot);
            if(phase==='playing'&&m.state==='aim')timer(m.remaining,p.limit,443);
            text('GOLDEN BOOT',240,680,15,'#e7edb1');
        }
        function passScene(){
            const m=model;pitch('day',m.travel);
            for(let i=-2;i<8;i++){ctx.fillStyle=i%2?'#7fae731a':'#1d4c3410';ctx.fillRect(53,175+(i*100+m.travel)%750,374,100);}
            line(33,170,33,720,'#eaf1cfa6',3);line(447,170,447,720,'#eaf1cfa6',3);line(33,390+(m.travel%360),447,390+(m.travel%360),'#eaf1cf60',3);
            ctx.strokeStyle='#eaf1cf60';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(240,390+(m.travel%360),85,45,0,0,TAU);ctx.stroke();
            for(const t of m.targets){
                if(m.route.length===2&&!m.route.includes(t.baseX))circle(t.x,t.y,t.r+16,'#a6ead324','#a6ead3',3);
                ctx.save();ctx.setLineDash([5,5]);circle(t.x,t.y,t.r+8,t.golden?'#ffe6a026':'#e5f6d511',t.golden?'#ffdb77':'#dff3d0',2);ctx.restore();shadow(t.x,t.y+7,28);human(t.x,t.y,100,'running','player',{phaseOffset:t.phase});
                if(t.golden)text('★',t.x-31,t.y-64,19,'#ffe295',true);
            }
            for(const d of m.defenders){shadow(d.x,d.y+6,28);circle(d.x,d.y,28,'#f49f7140');human(d.x,d.y,96,'running','defender',{lean:Math.cos(m.time*m.profile.defenderSpeed/80+d.baseX)*.18});}
            if(m.state==='aim'||phase==='home'){
                const angle=m.angle,ex=m.holderX+Math.sin(angle)*200,ey=590-Math.cos(angle)*200;
                ctx.save();ctx.setLineDash([10,9]);line(m.holderX,581,ex,ey,'#fff4c5',4);ctx.restore();
                ctx.save();ctx.translate(ex,ey);ctx.rotate(angle);ctx.fillStyle='#ffe18f';ctx.beginPath();ctx.moveTo(-11,10);ctx.lineTo(0,-14);ctx.lineTo(11,10);ctx.fill();ctx.restore();timer(m.remaining,m.profile.limit,647);
            }
            const move=m.state==='move'?clamp(m.transition/.24,0,1):0,hx=lerp(m.holderX,m.nextHolder||m.holderX,move);
            shadow(hx,602,35);human(hx,598,126,m.state==='flight'?'kick':move?'running':'standing','player',m.ended?{motionMode:'fall',motionAge:.85-endWait}:{});
            if(m.ball&&m.state==='flight'){ctx.save();ctx.globalAlpha=.3;line(m.ball.x-m.ball.vx*.07,m.ball.y-m.ball.vy*.07,m.ball.x,m.ball.y,'#fff4d1',10);ctx.restore();ball(m.ball.x,m.ball.y,14,visualTime*8);}else ball(hx+32,601,17,visualTime*2);
            round(128,665,224,30,15,'#214b48df');text('TRIANGLE',184,685,11,'#e5edc5');
            for(let i=0;i<3;i++){const x=251+i*29;if(i<2)line(x,680,x+29,680,'#c9e5d388',2);circle(x,680,7,m.route.includes([105,240,375][i])?'#ffdd8a':'#53786c','#cee4cc',1);}
        }
        function keeperScene(){
            const m=model;pitch('night');goal(35,449,410,204);
            // The net is behind the goalkeeper; the visible landing rings never change target.
            for(const x of [100,240,380]){ctx.save();ctx.setLineDash([4,6]);circle(x,598,m.profile.radius+15,'#fff7d410','#eee7c33d',2);ctx.restore();}
            const kickAge=Math.min(...m.balls.map(b=>b.age),1);shadow(240,305,21);human(240,302,83,kickAge<.34?'kick':'standing','player',{motionAge:kickAge});ball(259,306,12,visualTime*.1);
            for(const b of [...m.balls].sort((a,b)=>a.age/a.duration-b.age/b.duration)){
                const t=clamp(b.age/b.duration,0,1),curve=b.curve?Math.sin(t*Math.PI)*(b.fromX>b.targetX?65:-65):0;
                const x=lerp(b.fromX,b.targetX,t)+curve,y=lerp(321,584,t)-Math.sin(t*Math.PI)*54;
                const just=b.duration-b.age<=.075,ringColor=just?'#b7ffdc':b.power?'#ffe092':'#d5f3ea';
                circle(b.targetX,598,29+Math.sin(t*Math.PI)*7,just?'#b7ffdc42':b.power?'#ffe09e26':'#e1f6eb20',ringColor,just?5:3);
                ctx.strokeStyle=ringColor;ctx.lineWidth=5;ctx.beginPath();ctx.arc(b.targetX,598,36,-Math.PI/2,-Math.PI/2+TAU*t);ctx.stroke();
                if(just)text('JUST!',b.targetX,650,16,ringColor,true);else if(b.power)text('PUNCH!',b.targetX,650,14,'#ffe092',true);else if(b.curve)text('CURVE',b.targetX,650,12,'#dfe9ff',true);
                ctx.save();ctx.globalAlpha=.4;line(x-(b.targetX-b.fromX)*.1,y-40,x,y,b.power?'#ffe194':'#e8f3df',8);ctx.restore();ball(x,y,lerp(10,29,t),t*10,b.power);
            }
            shadow(m.x,620,37);if(m.punchTime>0){circle(m.x,568,53,'#ffe19b33','#fff1b6',5);text('PUNCH!',m.x,496,18,'#ffe092',true);}
            human(m.x,618,122,Math.abs(m.targetX-m.x)>3?'running':'standing','defender',{lean:clamp((m.targetX-m.x)/220,-.4,.4),...(m.punchTime>0?{motionMode:'punch',motionAge:m.time-m.punchAt}:{}),...(m.ended?{motionMode:'fall',motionAge:.85-endWait}:{})});
            text('←  MOVE & SAVE  →',240,698,14,'#deead0');
        }
        function jumpScene(){
            const m=model,sky=ctx.createLinearGradient(0,0,0,330);sky.addColorStop(0,'#82bfd1');sky.addColorStop(1,'#dce8bb');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
            for(let i=0;i<4;i++){const x=((i*175-m.distance*.025)%700+700)%700-90;ctx.fillStyle='#f5f7df66';ctx.beginPath();ctx.ellipse(x,153+(i%2)*24,52,10,0,0,TAU);ctx.fill();}
            root.FootballArcade.drawStadium(ctx,0,140,480,195,[0,0,1024,270]);
            const offset=m.distance*.16%480;for(let i=0;i<2;i++)root.FootballArcade.drawStadium(ctx,i*480-offset,325,480,287,[180,350,640,1050]);
            ctx.fillStyle='#799c583d';ctx.fillRect(0,325,480,287);
            for(let i=0;i<6;i++){const x=((i*130-m.distance*.18)%780+780)%780-130;round(x,354,104,35,3,i%2?'#e6d4a2':'#cf997a');text(i%2?'FC ARCADE':'PLAY!',x+52,377,12,'#385745');}
            ctx.fillStyle='#729861';ctx.fillRect(0,571,480,50);line(0,603,480,603,'#f2efc6',5);ctx.fillStyle='#c59c79';ctx.fillRect(0,622,480,98);
            for(let i=0;i<9;i++){const x=((i*95-m.distance)%855+855)%855-95;line(x,649,x+64,649,'#ead0ac',3);line(x-25,695,x+34,695,'#dcb696',2);}
            for(const o of m.objects){if(o.kind==='coin'){const y=604-o.height;ctx.save();ctx.shadowBlur=reduced?0:16;ctx.shadowColor=o.golden?'#ffe391':'#fff4d1';ball(o.x,y,17,visualTime*3,o.golden);ctx.restore();if(o.golden)text('★',o.x,y-28,19,'#ffe092',true);}
                else{const height=o.height+(o.moving?Math.sin(m.time*7)*14:0);shadow(o.x,608,30);human(o.x,607-(height-o.height),o.height>50?90:87,o.height>50?'running':'sliding','defender');for(let j=0;j<3;j++)line(o.x+28,588-j*9,o.x+46+j*5,588-j*9,'#fff0c099',2);if(o.moving)text('↕',o.x,604-height-24,24,'#ffe9b4',true);}}
            shadow(110,607,34*(1-m.y/650));human(110,604-m.y,121,'running','player',{lean:m.jumps?.12:0,...(m.jumps?{motionMode:'jump',motionAge:m.jumpAge}:m.landAge<.16?{motionMode:'land',motionAge:m.landAge}:{}),...(m.ended?{motionMode:'fall',motionAge:.85-endWait}:{})});
            if(m.jumps===2){ctx.save();ctx.globalAlpha=.6;line(84,620-m.y,84,661-m.y,'#e8f5d1',3);line(131,620-m.y,131,650-m.y,'#e8f5d1',3);ctx.restore();}
            round(33,665,144,29,15,'#3258469c');text('JUMP '+('● '.repeat(2-m.jumps)+ '○ '.repeat(m.jumps)),105,685,12,'#ffe5a1');
            if(m.headerChain){round(284,665,163,29,15,'#325846bc');text('HEADER '+(m.headerChain%3||3)+' / 3',365,685,12,'#ffe5a1');}
            const next=m.objects.find(o=>o.kind==='tackle'&&!o.resolved&&o.x>132);if(m.time<12&&next&&(next.x-110)/m.profile.speed<.55&&m.jumps===0)text('↑ 점프!',110,453,20,'#fff2be',true);
            if(phase==='home'){human(363,601,101,'sliding','defender');ball(285,461,19,visualTime,true);}
        }
        function puzzleScene(){
            const m=model;ctx.fillStyle='#eae8cf';ctx.fillRect(0,0,W,H);ctx.fillStyle='#d9dfbf';
            for(let i=0;i<10;i++){ctx.save();ctx.translate(i*85-170,0);ctx.rotate(.25);ctx.fillRect(0,0,36,820);ctx.restore();}
            round(26,130,428,61,18,'#638a6c');round(57,149,322,17,9,'#365b48');round(57,149,322*displayPressure/100,17,9,m.pressure>72?'#eb9675':'#eac878');
            const recoil=lastReward?visualTime-lastReward.time:1;
            goal(402,137,28,40);const dx=64+displayPressure*3.25;shadow(dx,182,20);human(dx,182,71,'running','defender',recoil<.3?{motionMode:'hit',motionAge:recoil}:{lean:m.pressure>72?.24:0});ball(dx+20,180,8,visualTime*5);
            if(m.pressure>=80)text('DANGER!',245,143,11,'#ffe1b1');
            round(31,196,418,510,22,'#41664f');
            const animation=m.animation,progress=animation?clamp(animation.age/animation.duration,0,1):1,ease=1-Math.pow(1-progress,3);
            ctx.save();ctx.beginPath();ctx.rect(GRID_X,GRID_Y,COLS*CELL,ROWS*CELL);ctx.clip();
            for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)round(GRID_X+c*CELL+5,GRID_Y+r*CELL+5,90,90,17,'#294e40');
            for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
                const tile=m.grid[r][c];let x=GRID_X+c*CELL+5,y=GRID_Y+r*CELL+5;
                if(animation?.type==='fall')y-=tile.fall*CELL*(1-ease);
                if(animation?.type==='swap'||animation?.type==='return'){
                    const a=animation.a,b=animation.b;
                    if(r===a.r&&c===a.c){x+=(b.c-a.c)*CELL*(1-ease);y+=(b.r-a.r)*CELL*(1-ease);}
                    if(r===b.r&&c===b.c){x+=(a.c-b.c)*CELL*(1-ease);y+=(a.r-b.r)*CELL*(1-ease);}
                }
                ctx.save();if(animation?.type==='pop'&&m.clearing.some(p=>p.r===r&&p.c===c)){ctx.translate(x+45,y+45);ctx.scale(Math.max(.02,1-progress),Math.max(.02,1-progress));ctx.translate(-x-45,-y-45);ctx.globalAlpha=1-progress*.6;}
                const fall=0;round(x,y+4,90,85,17,tile.hp?'#465b50':'#2c4c414f');round(x,y,90,85,17,tile.hp?'#66786c':colors[tile.color],tile.special?'#fff2ae':'#ffffff3b',tile.special?4:2);
                round(x+9,y+7,72,5,3,'#ffffff35');
                if(tile.hp){round(x+25,y+20-fall,40,39,7,'#c0cbb2');line(x+32,y+32-fall,x+58,y+32-fall,'#657f6c',4);if(tile.hp>1)line(x+32,y+45-fall,x+58,y+45-fall,'#657f6c',4);text(tile.hp===2?'Ⅱ':'Ⅰ',x+45,y+73-fall,13,'#f5f0d6');}
                else{
                    if(tile.special){circle(x+45,y+43-fall,31,'#354f45','#ffe496',3);text(tile.special==='row'?'↔':tile.special==='column'?'↕':'★',x+45,y+54-fall,34,'#ffe496');}
                    else{ball(x+45,y+42-fall,25,0,tile.color===2);text(['K','P','G','★'][tile.color],x+73,y+75-fall,12,'#ffffffb8');}
                }
                const selected=m.press||m.selected;
                if(selected?.r===r&&selected?.c===c)round(x+2,y+2,86,81,16,'#fff6ca24','#fff5bf',4);
                if(document.activeElement===canvas&&keyboardMode&&focusCell.r===r&&focusCell.c===c)round(x+1,y+1,88,83,16,null,'#fff9ea',4);
                ctx.restore();
            }
            if(m.press&&m.dragTarget){const a=m.press,b=m.dragTarget;line(GRID_X+(a.c+.5)*CELL,GRID_Y+(a.r+.5)*CELL,GRID_X+(b.c+.5)*CELL,GRID_Y+(b.r+.5)*CELL,'#fff5d5',7);circle(GRID_X+(b.c+.5)*CELL,GRID_Y+(b.r+.5)*CELL,13,'#fff5d5');}
            ctx.restore();
        }
        function draw(){
            if(!ctx||!model)return;ctx.clearRect(0,0,W,H);ctx.save();if(shake>0&&!reduced)ctx.translate(Math.sin(visualTime*80)*shake*15,0);
            ({penalty:shotScene,pass:passScene,goalkeeper:keeperScene,dribble:jumpScene,donghyun:puzzleScene}[model.id])();
            for(const ring of rings){const t=ring.age/ring.duration;ctx.globalAlpha=(1-t)*.7;ctx.strokeStyle=ring.color;ctx.lineWidth=4*(1-t)+1;ctx.beginPath();ctx.ellipse(ring.x,ring.y,10+ring.radius*t,(10+ring.radius*t)*(ring.flat?.25:1),0,0,TAU);ctx.stroke();}ctx.globalAlpha=1;
            for(const p of effects){ctx.globalAlpha=clamp(p.life*3,0,1);round(p.x,p.y,6,4,1,p.color);}ctx.globalAlpha=1;
            for(const l of labels){ctx.globalAlpha=clamp(l.life*3,0,1);text(l.text,clamp(l.x,135,345),clamp(l.y,220,590),l.type==='perfect'?23:19,l.type==='hit'?'#ffc5ab':'#fff1b2',true);}ctx.globalAlpha=1;
            if(phase==='ending'){ctx.fillStyle='#264c424d';ctx.fillRect(0,0,W,H);text('FULL TIME',240,377,47,'#fff0ca',true);}
            ctx.restore();
        }
        // Read-only diagnostics also let automated input tests observe the same coordinates the player sees.
        function snapshot(){return model?JSON.parse(JSON.stringify({...model,random:undefined,events:undefined,profile:model.profile,aimX:model.aimX,targetX:model.targetX,guardX:model.guardX,angle:model.angle,phase})):null;}
        return {open,close,snapshot,info:INFO};
    }
    if(typeof module!=='undefined'&&module.exports)module.exports={INFO,difficulty,createModel,ShotGame,PassGame,KeeperGame,JumpGame,ComboGame,matchGroups,swapMoves,randomFrom,W,H,COLS,ROWS,CELL,GRID_X,GRID_Y};
    else root.FootballMiniGames=createMiniGames();
})(typeof window!=='undefined'?window:globalThis);
