(function(root){
    'use strict';
    const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
    const nonnegative=n=>Number.isFinite(n)?Math.max(0,n):0;
    function penalty(time=0,round=1){
        const pressure=Math.max(nonnegative(time)/22,Math.max(0,round-1)/3);
        const width=Math.max(8,44/(1+pressure*.22));
        return {level:1+Math.floor(pressure),width,perfectWidth:Math.max(2,width*.24),
            gaugeSpeed:Math.min(270,125+pressure*12),deadline:Math.max(3.2,8-pressure*.24),
            drift:pressure<2?0:Math.min(19,(pressure-1)*2.2),guards:pressure<1?1:pressure<4?2:3};
    }
    function penaltyBand(profile,phase=0){
        const center=50+Math.sin(phase)*profile.drift;
        return {start:center-profile.width/2,end:center+profile.width/2,pct:profile.width,
            redStart:center-profile.perfectWidth/2,redEnd:center+profile.perfectWidth/2,redPct:profile.perfectWidth,center};
    }
    function penaltyOutcome(position,band,zone,guards=[]){
        const perfect=position>=band.redStart&&position<=band.redEnd;
        const miss=!Number.isFinite(position)||position<band.start||position>band.end;
        return {miss,perfect:perfect&&!miss,saved:!miss&&!perfect&&guards.includes(zone)};
    }
    function passing(time=0){
        time=nonnegative(time);
        const pressure=time/18;
        return {level:1+Math.floor(pressure),radius:Math.max(13,23-pressure*1.5),speed:Math.min(4.8,1.05+pressure*.42),
            defenders:Math.min(5,1+Math.floor(time/16)),defenderSpeed:Math.min(4.8,1.2+time*.025),
            maxTargets:4,targetLife:Math.max(4.8,12-time*.065),
            bonus:Math.max(.12,.85-time*.012),drain:1+Math.min(1.5,time/90),
            patterns:time<12?['linear']:time<26?['linear','circular']:time<44?['linear','circular','zigzag']:['circular','zigzag','figure8'],
            movingGate:time>=34};
    }
    function classic(time=0,score=0){
        time=nonnegative(time);score=nonnegative(score);
        const pressure=Math.max(time/15,Math.sqrt(score/200));
        return {level:1+Math.floor(pressure),speed:Math.min(8.8,2.6+pressure*.38),density:Math.max(.42,1.3-pressure*.065),
            lateral:Math.min(1.6,pressure*.14),tracking:Math.min(.18,Math.max(0,pressure-2)*.022),
            bossEvery:24,gate:time>=35};
    }
    function keeper(time=0,saves=0){
        const pressure=Math.max(nonnegative(time)/18,nonnegative(saves)/5);
        return {level:1+Math.floor(pressure),speed:Math.max(310,1450*Math.pow(.88,pressure)),
            multi:Math.min(5,1+Math.floor(pressure/2)),gap:Math.max(160,300-pressure*10),
            recovery:Math.min(220,140+pressure*4),power:pressure>=3,curve:pressure>=5};
    }
    function puzzle(time=0){
        time=nonnegative(time);
        return {level:1+Math.floor(time/22),speed:1.4+time*.037+Math.max(0,time-70)*.017+Math.pow(Math.max(0,time-90),2)*.0008,
            blockerInterval:Math.max(6,18-time*.055),blockerCount:time<90?1:2,
            maxBlockers:time<45?3:time<90?5:7,armored:time>=75,pressure:time>=45};
    }
    function runner(time=0){
        time=nonnegative(time);
        return {level:1+Math.floor(time/12),speed:Math.min(1320,290+time*4.2+Math.max(0,time-75)*4),
            gap:Math.max(.39,1.32-time*.0065),relayGap:Math.max(.225,.43-Math.max(0,time-48)*.001),relayChance:time<48?0:Math.min(.85,.25+(time-48)/160),
            tripleChance:time<108?0:Math.min(.75,(time-108)/100),
            switchChance:time<24?0:Math.min(.7,.35+(time-24)/240)};
    }

    // Gameplay deadlines use active time; pausing preserves every pending result and shot.
    class PausableClock{
        constructor({now=()=>performance.now(),set=(fn,delay)=>setTimeout(fn,delay),clear=id=>clearTimeout(id)}={}){
            this.read=now;this.set=set;this.cancelTimer=clear;this.started=now();this.offset=0;
            this.pausedAt=null;this.tasks=new Map();this.nextId=1;
        }
        now(){return (this.pausedAt??this.read())-this.started-this.offset;}
        after(callback,delay){
            const task={id:this.nextId++,callback,due:this.now()+Math.max(0,delay),timer:null};
            this.tasks.set(task.id,task);if(this.pausedAt===null)this.arm(task);return task.id;
        }
        arm(task){task.timer=this.set(()=>{
            if(this.pausedAt!==null||!this.tasks.has(task.id))return;
            this.tasks.delete(task.id);task.callback();
        },Math.max(0,task.due-this.now()));}
        cancel(id){const task=this.tasks.get(id);if(task){this.cancelTimer(task.timer);this.tasks.delete(id);}}
        pause(){if(this.pausedAt!==null)return;this.pausedAt=this.read();for(const task of this.tasks.values()){this.cancelTimer(task.timer);task.timer=null;}}
        resume(){if(this.pausedAt===null)return;this.offset+=this.read()-this.pausedAt;this.pausedAt=null;for(const task of this.tasks.values())this.arm(task);}
        clear(){for(const id of this.tasks.keys())this.cancel(id);}
    }
    const rules={penalty,penaltyBand,penaltyOutcome,passing,classic,keeper,puzzle,runner,PausableClock,clamp};
    if(typeof module!=='undefined'&&module.exports)module.exports=rules;else root.FootballGameRules=rules;
})(typeof window!=='undefined'?window:globalThis);
