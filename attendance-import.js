(function(root){
    'use strict';
    const MAX_FILES=6,MAX_FILE_BYTES=10*1024*1024,MAX_TOTAL_BYTES=36*1024*1024;
    const ALIAS_KEY='jeotjaAttendanceAliasesV1';
    const compoundSurnames=['남궁','황보','제갈','선우','사공','서문','독고','동방','어금','망절'];
    const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const cleanText=value=>String(value??'').normalize('NFKC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/gu,'').trim();
    function nameKey(value){
        return cleanText(value).replace(/[(（\[]\s*(?:나|본인|방장|부방장)\s*[)）\]]/gu,'').replace(/^\d{1,3}[.)]\s*/u,'').replace(/[^\p{L}\p{N}]/gu,'').toLocaleLowerCase('ko');
    }
    function givenName(value){
        if(!/^[가-힣]{3,5}$/u.test(value))return '';
        const given=compoundSurnames.some(s=>value.startsWith(s))?value.slice(2):value.slice(1);
        return given.length>=2?given:'';
    }
    function rosterIndex(players){
        return (Array.isArray(players)?players:[]).filter(p=>p&&typeof p.name==='string'&&p.name.trim()).map(p=>{
            const name=cleanText(p.name),key=nameKey(name);
            return {id:p.id==null?'name:'+name:'id:'+p.id,name,key,given:givenName(key)};
        });
    }
    function readAliases(storage){
        try{
            const values=JSON.parse(storage?.getItem(ALIAS_KEY)||'[]');
            return Array.isArray(values)?values.filter(a=>a&&typeof a.key==='string'&&a.key.length<=60&&typeof a.id==='string'&&typeof a.name==='string').slice(-200):[];
        }catch{return [];}
    }
    function distance(a,b){
        a=[...a];b=[...b];let prior=Array.from({length:b.length+1},(_,i)=>i);
        for(let i=0;i<a.length;i++){
            const next=[i+1];for(let j=0;j<b.length;j++)next.push(Math.min(next[j]+1,prior[j+1]+1,prior[j]+(a[i]===b[j]?0:1)));prior=next;
        }
        return prior[b.length];
    }
    function matchName(text,roster,aliases=[],confidence=100){
        const key=nameKey(text),forms=[key];if(key.endsWith('님'))forms.push(key.slice(0,-1));
        const exact=roster.filter(p=>forms.includes(p.key));
        const given=roster.filter(p=>p.given&&forms.includes(p.given));
        let kind='unknown',candidates=[];
        if(exact.length){kind=exact.length===1?'exact':'ambiguous';candidates=exact;}
        else if(given.length){kind=given.length===1?'given':'ambiguous';candidates=given;}
        else {
            const alias=aliases.find(a=>a.key===key),player=alias&&roster.find(p=>p.id===alias.id&&p.name===alias.name);
            if(player){kind='alias';candidates=[player];}
            else if(key.length>=2&&key.length<=20){
                const suggestions=roster.map(p=>{
                    const names=[p.key,p.given].filter(Boolean);
                    const score=Math.min(...names.map(n=>Math.min(distance(key,n),distance(key.normalize('NFD'),n.normalize('NFD'))*.7)));
                    return {player:p,score};
                }).filter(p=>p.score<=1.4).sort((a,b)=>a.score-b.score||a.player.name.localeCompare(b.player.name,'ko'));
                if(suggestions.length){kind='suggestion';candidates=suggestions.slice(0,4).map(p=>p.player);}
            }
        }
        const reliable=Number.isFinite(confidence)&&confidence>=(kind==='given'?70:60);
        return {key,kind,candidates,automatic:reliable&&['exact','given','alias'].includes(kind)?candidates[0].id:null};
    }
    function isNoise(text){
        const key=nameKey(text);
        if(!/[\p{L}]/u.test(key)||key.length<2||key.length>35)return true;
        return /^(?:(?:참석|불참|미정|참여|미참여|투표|참석자|참여자|투표자|결과|총|선택|완료|확인|닫기|카카오톡|kakaotalk)(?:목록|결과|하기|인원|자)?\d*(?:명|표)?|\d+(?:명|표)|(?:오전|오후)\d+|\d+월\d+일(?:[월화수목금토일]요일)?|[월화수목금토일]요일)$/u.test(key);
    }
    function lineNames(text,roster,aliases){
        text=cleanText(text);if(!text)return [];
        const direct=matchName(text,roster,aliases);
        if(['exact','given','alias','ambiguous'].includes(direct.kind))return [text];
        if(isNoise(text))return [];
        const delimited=text.split(/[,，、;；|•·\t]+/u).map(cleanText).filter(Boolean);
        if(delimited.length>1)return delimited.flatMap(part=>lineNames(part,roster,aliases));
        const words=text.split(/\s+/u).filter(word=>!isNoise(word));
        const known=words.filter(word=>['exact','given','alias','ambiguous'].includes(matchName(word,roster,aliases).kind));
        // A label such as "문찬우 아빠" is not the player "문찬우" followed by another attendee.
        if(words.length>1&&known.length===words.length)return words.filter(word=>nameKey(word).length<=20);
        if(nameKey(text).length>20||words.length>4)return [];
        return [text];
    }
    function analyzeSources(sources,players,aliases=[]){
        const roster=rosterIndex(players),entries=[],seen=new Map(),warnings=[];
        for(const source of sources){
            const lines=source.lines||String(source.text||'').split(/\r?\n/u).map(text=>({text,confidence:100}));
            const mixed=lines.some(line=>/(?:^|\s|[([【])(불참|미정|기권|참석\s*불가)(?:$|\s|\d|[)\]】])/u.test(cleanText(line.text)));
            if(mixed)warnings.push(source.name||'사진');
            lines.slice(0,200).forEach((line,index)=>{
                lineNames(line.text,roster,aliases).forEach((text,part)=>{
                    if(entries.length>=160)return;
                    const match=matchName(text,roster,aliases,Number.isFinite(line.confidence)?line.confidence:0);
                    const automatic=mixed?null:match.automatic;
                    if(automatic&&seen.has(automatic)){seen.get(automatic).occurrences++;return;}
                    const entry={id:source.id+':'+index+':'+part,text,key:match.key,kind:match.kind,candidates:match.candidates,
                        selectedId:automatic||'',selectedName:automatic?match.candidates[0].name:'',manual:false,occurrences:1,mixed};
                    entries.push(entry);if(automatic)seen.set(automatic,entry);
                });
            });
        }
        return {entries,warnings};
    }
    function selectionPlan(entries,players,current=[],mode='replace'){
        if(entries.some(entry=>!entry.selectedId))throw Error('확인이 필요한 이름을 연결하거나 제외해주세요.');
        const roster=rosterIndex(players),names=new Set();
        for(const entry of entries){
            if(entry.selectedId==='-')continue;
            const player=roster.find(p=>p.id===entry.selectedId&&p.name===entry.selectedName);
            if(!player)throw Error('선수 명단이 바뀌었어요. 이름을 다시 확인해주세요.');
            if(roster.filter(p=>p.name===player.name).length!==1)throw Error('같은 전체 이름의 선수가 여러 명이에요. 선수 명단에서 이름을 구분해주세요.');
            names.add(player.name);
        }
        if(!names.size)throw Error('적용할 참석 선수를 한 명 이상 선택해주세요.');
        if(mode==='add')for(const name of current)if(roster.some(p=>p.name===name))names.add(name);
        return [...names];
    }
    function aliasesAfterReview(entries,players,aliases){
        const roster=rosterIndex(players),next=new Map(aliases.map(a=>[a.key,a]));
        for(const entry of entries){
            if(!entry.manual||!entry.selectedId||entry.selectedId==='-'||entry.key.length<2||entry.key.length>60)continue;
            // A shared given name is inherently ambiguous; never remember it as one person's alias.
            const direct=matchName(entry.text,roster,[]);
            if(['exact','given','ambiguous'].includes(direct.kind))continue;
            const player=roster.find(p=>p.id===entry.selectedId&&p.name===entry.selectedName);
            const conflict=entries.some(other=>other.key===entry.key&&other.selectedId!=='-'&&other.selectedId!==entry.selectedId);
            if(player&&!conflict)next.set(entry.key,{key:entry.key,id:player.id,name:player.name});
        }
        return [...next.values()].slice(-200);
    }
    function ocrLines(data){
        const lines=[];
        for(const block of data.blocks||[])for(const paragraph of block.paragraphs||[])for(const line of paragraph.lines||[]){
            if(line.text?.trim())lines.push({text:line.text.trim(),confidence:Number(line.confidence)||0});
        }
        return lines.length?lines:String(data.text||'').split(/\r?\n/u).filter(text=>text.trim()).map(text=>({text,confidence:Number(data.confidence)||0}));
    }
    // Pinned Tesseract.js 7 worker protocol. Owning the Worker lets cancel/timeout stop even initialization.
    class OcrClient {
        constructor({Worker=root.Worker,base,onProgress=()=>{},timeout=90000}={}){
            if(!Worker)throw Error('이 브라우저에서는 사진 인식을 사용할 수 없어요. 최신 브라우저에서 열어주세요.');
            this.worker=new Worker(new URL('worker.min.js',base).href);this.jobs=new Map();this.next=0;this.closed=false;this.base=base;this.timeout=timeout;
            this.worker.onmessage=event=>{
                const message=event.data,job=this.jobs.get(message?.jobId);if(this.closed||!job)return;
                if(message.status==='progress'){onProgress(message.data||{});return;}
                clearTimeout(job.timer);this.jobs.delete(message.jobId);
                if(message.status==='resolve')job.resolve(message.data);
                else job.reject(Error('사진 인식 중 문제가 생겼어요. 사진을 다시 확인해주세요.'));
            };
            this.worker.onerror=event=>{event.preventDefault?.();this.stop(Error('사진 인식 파일을 불러오지 못했어요. 연결을 확인하고 다시 시도해주세요.'));};
        }
        request(action,payload,transfer=[]){
            if(this.closed)return Promise.reject(Error('사진 인식이 취소됐습니다.'));
            const jobId='attendance-'+(++this.next);
            return new Promise((resolve,reject)=>{
                const timer=setTimeout(()=>this.stop(Error('사진 인식 시간이 길어지고 있어요. 캡처를 작게 나누어 다시 시도해주세요.')),this.timeout);
                this.jobs.set(jobId,{resolve,reject,timer});
                try{this.worker.postMessage({workerId:'attendance',jobId,action,payload},transfer);}catch(error){this.stop(error);}
            });
        }
        async initialize(){
            await this.request('load',{options:{lstmOnly:true,corePath:this.base,logging:false}});
            await this.request('loadLanguage',{langs:'kor+eng',options:{langPath:this.base.replace(/\/$/u,''),lstmOnly:true,gzip:true,cachePath:'footsal-ocr-v7',cacheMethod:'write'}});
            await this.request('initialize',{langs:'kor+eng',oem:1,config:{load_system_dawg:'0',load_freq_dawg:'0'}});
            // Polls are vertical name lists. Sparse mode can split Hangul syllables into unrelated fragments.
            await this.request('setParameters',{params:{tessedit_pageseg_mode:'6',preserve_interword_spaces:'1',user_defined_dpi:'300'}});
        }
        recognize(bytes){return this.request('recognize',{image:bytes,options:{},output:{text:true,blocks:true}},[bytes.buffer]);}
        stop(error=Error('사진 인식이 취소됐습니다.')){
            if(this.closed)return;this.closed=true;this.worker.terminate();
            for(const job of this.jobs.values()){clearTimeout(job.timer);job.reject(error);}this.jobs.clear();
        }
    }
    function maskProfileShapes(pixels){
        // Large, dense profile shapes can make a text line twice as tall as its Hangul letters.
        // Remove only isolated, nearly square ink components in the left profile column.
        const {width,height,data}=pixels,step=Math.max(1,Math.ceil(width/600)),sw=Math.ceil(width/step),sh=Math.ceil(height/step),scanWidth=Math.floor(sw*.45);
        const mask=new Uint8Array(scanWidth*sh),queue=new Uint32Array(mask.length),boxes=[];
        for(let y=0;y<sh;y++)for(let x=0;x<scanWidth;x++)mask[y*scanWidth+x]=data[(y*step*width+x*step)*4]<125?1:0;
        const minimum=Math.max(24,sw*.055);
        for(let start=0;start<mask.length;start++){
            if(!mask[start])continue;let head=0,tail=1,minX=scanWidth,minY=sh,maxX=0,maxY=0;queue[0]=start;mask[start]=0;
            while(head<tail){
                const at=queue[head++],x=at%scanWidth,y=Math.floor(at/scanWidth);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
                if(x&&mask[at-1]){mask[at-1]=0;queue[tail++]=at-1;}
                if(x+1<scanWidth&&mask[at+1]){mask[at+1]=0;queue[tail++]=at+1;}
                if(y&&mask[at-scanWidth]){mask[at-scanWidth]=0;queue[tail++]=at-scanWidth;}
                if(y+1<sh&&mask[at+scanWidth]){mask[at+scanWidth]=0;queue[tail++]=at+scanWidth;}
            }
            const w=maxX-minX+1,h=maxY-minY+1;
            if(minX>=sw*.3||maxX>=scanWidth-1||w<minimum||h<minimum||w/h<.65||w/h>1.5||tail/(w*h)<.68)continue;
            boxes.push({x:Math.max(0,(minX-1)*step),y:Math.max(0,(minY-1)*step),right:Math.min(width,(maxX+2)*step),bottom:Math.min(height,(maxY+2)*step)});
        }
        for(const box of boxes)for(let y=box.y;y<box.bottom;y++)for(let x=box.x;x<box.right;x++){const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=255;}
        return boxes;
    }
    async function prepareImage(file,document){
        const image=new root.Image(),url=root.URL.createObjectURL(file);
        try{
            image.src=url;await image.decode();
            const w=image.naturalWidth,h=image.naturalHeight;
            if(!w||!h||w*h>18000000||w>10000||h>16000)throw Error('사진이 너무 커요. 이름 목록을 여러 장으로 나눠 캡처해주세요.');
            const scale=Math.min(2,1200/w,8000/h,Math.sqrt(6000000/(w*h)));
            const canvas=document.createElement('canvas');canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);
            const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
            const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);let dark=0,count=0;
            for(let i=0;i<pixels.data.length;i+=400){if(pixels.data[i]*.299+pixels.data[i+1]*.587+pixels.data[i+2]*.114<105)dark++;count++;}
            const invert=dark/count>.6;
            for(let i=0;i<pixels.data.length;i+=4){let gray=pixels.data[i]*.299+pixels.data[i+1]*.587+pixels.data[i+2]*.114;if(invert)gray=255-gray;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=gray;pixels.data[i+3]=255;}
            maskProfileShapes(pixels);
            ctx.putImageData(pixels,0,0);
            const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));canvas.width=canvas.height=1;
            if(!blob)throw Error('사진을 읽지 못했어요. PNG 또는 JPG 캡처로 다시 시도해주세요.');
            return new Uint8Array(await blob.arrayBuffer());
        }catch(error){if(error.message?.includes('사진'))throw error;throw Error('사진을 읽지 못했어요. PNG, JPG, WEBP 파일을 선택해주세요.');}
        finally{image.src='';root.URL.revokeObjectURL(url);}
    }
    function createImporter(environment=root){
        const document=environment.document;
        let dialog,options={},sources=[],entries=[],warnings=[],aliases=[],client=null,sequence=0,nextSource=0,busy=false,priorFocus,priorOverflow,reviewRoster='';
        const base=new URL('assets/ocr/',document.baseURI).href;
        const storage=()=>{try{return environment.localStorage;}catch{return null;}};
        const $=selector=>dialog.querySelector(selector);
        const rosterSignature=()=>JSON.stringify(rosterIndex(options.players()).map(p=>[p.id,p.name]).sort((a,b)=>a[0].localeCompare(b[0])));
        function ensure(){
            if(dialog)return;
            dialog=document.createElement('dialog');dialog.className='ai-dialog';dialog.setAttribute('aria-labelledby','aiTitle');
            dialog.innerHTML=`
                <header class="ai-header"><div><span class="ai-eyebrow">참석 명단</span><h2 id="aiTitle" tabindex="-1">캡처로 선수 선택</h2></div><button type="button" class="ai-close" data-ai="close" aria-label="명단 가져오기 닫기">×</button></header>
                <div class="ai-body">
                    <p class="ai-intro">카톡에서 <b>‘참석’에 투표한 이름 목록</b>을 캡처해주세요.<br>성이 없어도 등록된 선수와 연결해 드려요.</p>
                    <div class="ai-upload"><input id="aiFiles" type="file" accept="image/png,image/jpeg,image/webp" multiple class="ai-file"><label for="aiFiles" class="ai-add">＋ 캡처 사진 추가</label><span>최대 6장 · 사진당 10MB</span></div>
                    <div class="ai-photos" data-ai="photos"></div>
                    <div class="ai-preview" hidden><button type="button" class="ai-secondary" data-ai="preview-close">사진 접기</button><img alt="선택한 캡처 크게 보기"></div>
                    <div class="ai-read-controls"><button type="button" class="ai-primary" data-ai="read" disabled>사진에서 이름 읽기</button><button type="button" class="ai-secondary" data-ai="stop" hidden>인식 중단</button></div>
                    <div class="ai-progress" hidden><progress max="1" value="0"></progress><span data-ai="progress-text">사진 인식 준비 중…</span></div>
                    <p class="ai-notice" role="status" data-ai="notice"></p>
                    <section class="ai-review" hidden>
                        <div class="ai-review-heading"><h3 tabindex="-1">참석 선수 확인</h3><strong data-ai="count"></strong></div>
                        <p class="ai-help">틀린 이름은 연결할 선수를 바꾸고, 참석자가 아니면 ‘제외’를 선택해주세요.</p>
                        <p class="ai-warning" data-ai="warning" hidden></p><div class="ai-rows" data-ai="rows"></div>
                        <button type="button" class="ai-text-button" data-ai="ignore" hidden>미확인 이름 제외</button>
                        <details class="ai-text-edit"><summary>읽은 글자 직접 수정</summary>
                            <label for="aiTextSource">수정할 사진</label><select id="aiTextSource"></select>
                            <label for="aiText">이름을 한 줄에 한 명씩 적어주세요.</label><textarea id="aiText" rows="6" maxlength="8000" spellcheck="false"></textarea>
                            <button type="button" class="ai-secondary" data-ai="text-apply">수정한 이름으로 다시 확인</button>
                        </details>
                        <label class="ai-remember"><input type="checkbox" data-ai="remember" checked>직접 연결한 별명을 이 기기에 기억</label>
                        <fieldset class="ai-mode"><legend>참석 명단 적용</legend><label><input type="radio" name="aiMode" value="replace" checked>이번 명단으로 선택 바꾸기</label><label><input type="radio" name="aiMode" value="add">현재 선택에 추가하기</label></fieldset>
                    </section>
                    <p class="ai-local-note">사진은 이 브라우저에서 읽으며 서버에 저장하지 않습니다.</p>
                </div>
                <footer class="ai-footer"><span data-ai="summary">사진을 추가해주세요.</span><button type="button" class="ai-primary" data-ai="apply" disabled>선택 적용</button></footer>`;
            document.body.appendChild(dialog);
            const resize=()=>{const viewport=environment.visualViewport;dialog.style.setProperty('--ai-height',(viewport?.height||environment.innerHeight)+'px');dialog.style.setProperty('--ai-top',(viewport?.offsetTop||0)+'px');};
            environment.visualViewport?.addEventListener('resize',resize);environment.visualViewport?.addEventListener('scroll',resize);environment.addEventListener?.('resize',resize);resize();
            dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
            dialog.addEventListener('keydown',event=>event.stopPropagation());
            dialog.addEventListener('click',event=>{
                const button=event.target.closest('button[data-ai]');if(!button||button.disabled)return;
                const action=button.dataset.ai;
                if(action==='close')close();else if(action==='read')read();else if(action==='stop')stop();
                else if(action==='remove')removeSource(button.dataset.source);else if(action==='apply')apply();else if(action==='ignore')ignorePending();
                else if(action==='text-apply')editText();
                else if(action==='preview')previewSource(button.dataset.source);else if(action==='preview-close')hidePreview();
            });
            dialog.addEventListener('change',event=>{
                if(event.target.id==='aiFiles'){addFiles([...event.target.files]);event.target.value='';}
                else if(event.target.id==='aiTextSource')refreshEditor();
                else if(event.target.dataset.entry){choose(event.target.dataset.entry,event.target.value);}
                else if(event.target.name==='aiMode')updateSummary();
            });
        }
        function notice(text=''){ $('[data-ai="notice"]').textContent=text; }
        function setBusy(value){
            busy=value;dialog.setAttribute('aria-busy',String(value));$('.ai-progress').hidden=!value;
            $('[data-ai="stop"]').hidden=!value;$('#aiFiles').disabled=value;
            $('[data-ai="read"]').disabled=value||!sources.some(source=>!source.lines);
            dialog.querySelectorAll('[data-ai="remove"], [data-ai="text-apply"], [data-entry], #aiTextSource, #aiText, .ai-mode input').forEach(el=>el.disabled=value);
            $('[data-ai="ignore"]').disabled=value;updateSummary();
        }
        function photos(){
            $('[data-ai="photos"]').innerHTML=sources.map(source=>`<div class="ai-photo"><button type="button" class="ai-photo-view" data-ai="preview" data-source="${source.id}" aria-label="${source.number}번 사진 크게 보기"><img src="${escape(source.url)}" alt="" loading="lazy"><span>${source.number}번 사진<small>${source.edited?'직접 수정':source.lines?'인식 완료':source.error?'인식 실패':'인식 대기'}</small></span></button><button type="button" class="ai-remove" data-ai="remove" data-source="${source.id}" aria-label="${source.number}번 사진 제거"${busy?' disabled':''}>×</button></div>`).join('');
        }
        function previewSource(id){
            const source=sources.find(s=>s.id===id);if(!source)return;
            $('.ai-preview img').src=source.url;$('.ai-preview').hidden=false;scrollTo($('.ai-preview'));
        }
        function hidePreview(){$('.ai-preview').hidden=true;$('.ai-preview img').removeAttribute('src');}
        function scrollTo(element){const body=$('.ai-body');body.scrollTop+=element.getBoundingClientRect().top-body.getBoundingClientRect().top-12;}
        function addFiles(files){
            if(busy)return;const errors=[];
            for(const file of files){
                if(sources.length>=MAX_FILES){errors.push('사진은 최대 6장까지 넣을 수 있어요.');break;}
                if(!['image/png','image/jpeg','image/webp'].includes(file.type)||!file.size){errors.push('PNG, JPG, WEBP 사진을 선택해주세요.');continue;}
                if(file.size>MAX_FILE_BYTES){errors.push('사진 한 장은 10MB 이하여야 해요.');continue;}
                if(sources.reduce((sum,s)=>sum+s.file.size,0)+file.size>MAX_TOTAL_BYTES){errors.push('사진 전체 용량은 36MB 이하여야 해요.');break;}
                const number=++nextSource;sources.push({id:'photo-'+number,number,name:file.name,file,url:environment.URL.createObjectURL(file),lines:null});
            }
            photos();setBusy(false);notice([...new Set(errors)].join(' '));
        }
        function removeSource(id){
            if(busy)return;const source=sources.find(s=>s.id===id);if(!source)return;
            hidePreview();environment.URL.revokeObjectURL(source.url);sources=sources.filter(s=>s.id!==id);photos();review(true);setBusy(false);notice();
        }
        function review(preserve=false){
            const previous=new Map(entries.map(entry=>[entry.id,entry]));
            const analyzed=analyzeSources(sources.filter(s=>s.lines),options.players(),aliases);entries=analyzed.entries;warnings=analyzed.warnings;
            const current=rosterIndex(options.players());
            if(preserve)for(const entry of entries){
                const old=previous.get(entry.id);
                if(old?.manual&&old.key===entry.key&&(old.selectedId==='-'||current.some(p=>p.id===old.selectedId&&p.name===old.selectedName))){entry.selectedId=old.selectedId;entry.selectedName=old.selectedName;entry.manual=true;}
            }
            renderRows();refreshEditor();
        }
        function refreshEditor(){
            const previous=$('#aiTextSource').value,completed=sources.filter(s=>s.lines);
            $('#aiTextSource').innerHTML=completed.map(source=>`<option value="${source.id}">${source.number}번 사진</option>`).join('');
            if(completed.some(s=>s.id===previous))$('#aiTextSource').value=previous;
            const source=completed.find(s=>s.id===$('#aiTextSource').value);$('#aiText').value=source?source.lines.map(line=>line.text).join('\n'):'';
        }
        function renderRows(){
            const roster=rosterIndex(options.players()).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
            reviewRoster=rosterSignature();
            $('.ai-review').hidden=!sources.some(s=>s.lines);
            $('[data-ai="warning"]').hidden=!warnings.length;
            $('[data-ai="warning"]').textContent=warnings.length?'불참·미정 항목이 함께 읽힌 사진이 있어요. 해당 사진의 이름은 참석자인지 직접 확인해주세요.':'';
            $('[data-ai="rows"]').innerHTML=entries.map(entry=>{
                const recommended=entry.candidates.map(p=>p.id),ordered=[...roster.filter(p=>recommended.includes(p.id)),...roster.filter(p=>!recommended.includes(p.id))];
                const label=entry.selectedId==='-'?'제외':!entry.selectedId?'확인 필요':entry.manual?'직접 확인':entry.kind==='given'?'성이 없는 이름':entry.kind==='alias'?'기억한 별명':'이름 일치';
                return `<div class="ai-row${entry.selectedId?'':' ai-pending'}" data-row="${entry.id}"><div><span class="ai-raw">${escape(entry.text)}</span><small>${label}${entry.occurrences>1?' · '+entry.occurrences+'곳에서 인식':''}</small></div><label class="ai-choice"><span class="ai-sr">${escape(entry.text)}에 연결할 선수</span><select data-entry="${entry.id}"${busy?' disabled':''}><option value=""${!entry.selectedId?' selected':''}>선수 선택</option><option value="-"${entry.selectedId==='-'?' selected':''}>이 이름 제외</option>${ordered.map(player=>`<option value="${escape(player.id)}"${entry.selectedId===player.id?' selected':''}>${escape(player.name)}</option>`).join('')}</select></label></div>`;
            }).join('');
            updateSummary();
        }
        function choose(id,value){
            const entry=entries.find(e=>e.id===id);if(!entry||busy)return;
            const player=rosterIndex(options.players()).find(p=>p.id===value);
            entry.selectedId=player?player.id:value==='-'?'-':'';entry.selectedName=player?.name||'';entry.manual=true;
            const row=dialog.querySelector('[data-row="'+id+'"]');row.classList.toggle('ai-pending',!entry.selectedId);
            row.querySelector('small').textContent=value==='-'?'제외':player?'직접 확인':'확인 필요';updateSummary();
        }
        function updateSummary(){
            const ids=new Set(entries.filter(e=>e.selectedId&&e.selectedId!=='-').map(e=>e.selectedId)),pending=entries.filter(e=>!e.selectedId).length,unread=sources.filter(s=>!s.lines).length;
            const names=new Set(entries.filter(e=>e.selectedId&&e.selectedId!=='-').map(e=>e.selectedName));
            if($('[name="aiMode"]:checked').value==='add')for(const name of options.selected())if(options.players().some(p=>p.name===name))names.add(name);
            $('[data-ai="count"]').textContent=ids.size+'명 선택';
            $('[data-ai="summary"]').textContent=busy?'사진에서 이름을 읽고 있어요…':unread?unread+'장 인식 대기':pending?pending+'개 이름을 확인해주세요.':ids.size?'총 '+names.size+'명을 선택합니다.':sources.length?'읽은 이름을 확인하거나 직접 수정해주세요.':'사진을 추가해주세요.';
            $('[data-ai="apply"]').disabled=busy||pending>0||unread>0||!ids.size;
            $('[data-ai="apply"]').textContent=ids.size?names.size+'명 선택 적용':'선택 적용';
            $('[data-ai="ignore"]').hidden=!pending;$('[data-ai="ignore"]').textContent='미확인 '+pending+'개 이름 제외';
        }
        function ignorePending(){if(busy)return;for(const entry of entries)if(!entry.selectedId){entry.selectedId='-';entry.manual=true;}renderRows();}
        function editText(){
            if(busy)return;const text=$('#aiText').value.trim();
            if(!text){notice('수정할 이름을 입력해주세요.');return;}
            if(sources.some(s=>!s.lines)){notice('인식하지 못한 사진을 제거하거나 다시 읽은 뒤 수정해주세요.');return;}
            const source=sources.find(s=>s.id===$('#aiTextSource').value);if(!source)return;
            // Keep corrections attached to their photo when another capture is added or removed.
            source.lines=text.split(/\r?\n/u).map(text=>({text,confidence:100}));source.edited=true;
            review(true);photos();notice('수정한 이름을 반영했어요. 참석 선수를 확인해주세요.');scrollTo($('.ai-review-heading'));
        }
        async function read(){
            if(busy||!sources.some(s=>!s.lines))return;
            if(!/^https?:$/u.test(environment.location.protocol)){notice('사진 인식은 게시된 사이트 주소에서 사용할 수 있어요. GitHub Pages 주소로 열어주세요.');return;}
            const token=++sequence;notice();setBusy(true);let item=0;
            const pending=sources.filter(s=>!s.lines);
            const progress=data=>{
                if(token!==sequence)return;const reading=data.status==='recognizing text';
                $('.ai-progress progress').value=reading?(item+Math.max(0,Math.min(1,Number(data.progress)||0)))/pending.length:0;
                $('[data-ai="progress-text"]').textContent=reading?(item+1)+' / '+pending.length+'장 · 이름 읽는 중':'사진 인식 준비 중…';
            };
            try{
                client=new OcrClient({Worker:environment.Worker,base,onProgress:progress});const running=client;await running.initialize();
                for(const source of pending){
                    if(token!==sequence)return;source.error=false;
                    try{
                        const bytes=await prepareImage(source.file,document);if(token!==sequence)return;
                        const data=await running.recognize(bytes);if(token!==sequence)return;
                        source.lines=ocrLines(data);item++;photos();
                    }catch(error){if(token!==sequence)return;source.error=true;throw error;}
                }
                review(true);notice(entries.length?'인식한 이름과 인원을 확인한 뒤 적용해주세요.':'이름을 찾지 못했어요. 이름이 크게 보이는 캡처로 다시 시도하거나 읽은 글자를 직접 수정해주세요.');
                hidePreview();$('.ai-review h3').focus({preventScroll:true});scrollTo($('.ai-review-heading'));
            }catch(error){if(token===sequence){review(true);notice(error.message||'사진 인식에 실패했어요. 다시 시도해주세요.');}}
            finally{if(token===sequence){client?.stop();client=null;photos();setBusy(false);}}
        }
        function stop(){sequence++;client?.stop();client=null;setBusy(false);photos();review(true);notice('인식을 중단했어요. 완료된 사진은 유지됩니다.');}
        function apply(){
            if(busy||$('[data-ai="apply"]').disabled)return;
            try{
                if(options.canApply?.()===false)throw Error('팀 구성이 끝난 뒤 명단을 적용해주세요.');
                if(reviewRoster!==rosterSignature()){review(true);throw Error('선수 명단이 바뀌었어요. 이름을 다시 확인한 뒤 적용해주세요.');}
                const players=options.players(),names=selectionPlan(entries,players,options.selected(),$('[name="aiMode"]:checked').value);
                options.apply(names);
                let remembered=true;
                if($('[data-ai="remember"]').checked){aliases=aliasesAfterReview(entries,players,aliases);if(aliases.length)try{const local=storage();if(!local)throw Error('storage unavailable');local.setItem(ALIAS_KEY,JSON.stringify(aliases));}catch{remembered=false;}}
                close();options.notify?.(names.length+'명을 선택했어요.'+(remembered?'':' 별명은 이 기기에 저장하지 못했습니다.'));
            }catch(error){notice(error.message);}
        }
        function open(config){
            ensure();if(dialog.open)return;options=config;
            if(!options.players().length){options.notify?.('선수 명단을 불러온 뒤 다시 열어주세요.');return;}
            if(options.canApply?.()===false){options.notify?.('팀 구성이 끝난 뒤 명단을 가져와주세요.');return;}
            aliases=readAliases(storage());sources=[];entries=[];warnings=[];nextSource=0;
            priorFocus=options.returnFocus||document.activeElement;priorOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
            notice();photos();renderRows();refreshEditor();hidePreview();$('.ai-text-edit').open=false;$('[name="aiMode"][value="replace"]').checked=true;$('[data-ai="remember"]').checked=true;setBusy(false);
            dialog.showModal();$('.ai-body').scrollTop=0;$('#aiTitle').focus({preventScroll:true});
        }
        function close(){
            if(!dialog?.open)return;sequence++;client?.stop();client=null;
            for(const source of sources)environment.URL.revokeObjectURL(source.url);sources=[];entries=[];warnings=[];busy=false;
            hidePreview();$('[data-ai="photos"]').innerHTML='';$('[data-ai="rows"]').innerHTML='';$('#aiFiles').value='';$('#aiText').value='';$('#aiTextSource').innerHTML='';
            dialog.close();document.body.style.overflow=priorOverflow;priorFocus?.focus({preventScroll:true});
        }
        return {open,close};
    }
    const api={nameKey,givenName,rosterIndex,matchName,analyzeSources,selectionPlan,aliasesAfterReview,readAliases,ocrLines,maskProfileShapes,OcrClient,createImporter};
    if(typeof module!=='undefined'&&module.exports)module.exports=api;
    else root.AttendanceImport=createImporter();
})(typeof window!=='undefined'?window:globalThis);
