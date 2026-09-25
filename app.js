'use strict';
/* ============ Sounding Things Out — prototype, full-vision sketch ============ */
/* utils */
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const uid=()=>Math.random().toString(36).slice(2,10);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(m,ms=2600){const d=document.createElement('div');d.className='toast';d.textContent=m;$('#toasts').appendChild(d);setTimeout(()=>d.remove(),ms);}
function openModal(html){$('#modalSheet').innerHTML=html;$('#modal').classList.remove('hidden');}
function closeModal(){$('#modal').classList.add('hidden');}
$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal();});

/* ============ state ============ */
const NOTES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const SCALES={penta:[0,2,4,7,9],major:[0,2,4,5,7,9,11]};
const VIBES=[
 {id:'dreamy', name:'Dreamy', key:'A', bpm:92,  color:'#7dd3fc', tune:.35, verb:.65, echo:.5, brief:'You are a band recording at 3am in a cabin, snow falling outside the glass. Everything floats. Nothing is rushed. Let notes ring until they dissolve.'},
 {id:'hype',   name:'Hype',   key:'E', bpm:128, color:'#ff4d5e', tune:.55, verb:.25, echo:.2, brief:'You just got off stage to 5,000 screaming people and ran straight into the studio. Bottle that adrenaline. Louder is a love language.'},
 {id:'moody',  name:'Moody',  key:'D', bpm:76,  color:'#b48cff', tune:.3,  verb:.7,  echo:.65,brief:'Film-noir band. A detective story with no words. Every note is a clue. Leave space — the silence is playing too.'},
 {id:'funky',  name:'Funky',  key:'G', bpm:104, color:'#ffb020', tune:.45, verb:.3,  echo:.35,brief:'You are the house band at the funkiest basement party in town. The groove is the boss. If your hips aren\'t moving, the take doesn\'t count.'},
 {id:'tender', name:'Tender', key:'C', bpm:84,  color:'#35d07f', tune:.25, verb:.55, echo:.4, brief:'You\'re writing the song for the slow dance at your best friend\'s wedding. Mean every word. This one is going to make somebody cry (happy).'},
 {id:'wild',   name:'Wild',   key:'F#',bpm:140, color:'#ff8c42', tune:.7,  verb:.35, echo:.3, brief:'Garage band. First rehearsal. The neighbors already called the cops once. Play like the tape is rolling and the rent is due.'},
];
const S={
  me:{uid:uid(),name:'',bio:'',photo:''},
  screen:'lobby', sessionId:null,
  sessions:[], chat:[], presence:[],
  transport:{bpm:120,metro:true,loop:false,playing:false,recording:false,armedTrack:null,recSource:'mic',key:'C',vibe:null,cover:null},
  stayInKey:true, inst:'drums', scopeView:'wave',
  tracks:[], // {id,name,kind,buffer,offset,gain,mute,solo,tune,echo,verb,color,live}
  vibe:VIBES[3],
};
function saveLS(){try{
  localStorage.setItem('mm_me',JSON.stringify(S.me));
  localStorage.setItem('mm_vibe',S.vibe.id);
  localStorage.setItem('mm_sessions',JSON.stringify(S.sessions));
}catch(e){}}
function loadLS(){try{
  const m=JSON.parse(localStorage.getItem('mm_me')||'null'); if(m&&m.uid)S.me=m;
  const v=VIBES.find(x=>x.id===localStorage.getItem('mm_vibe')); if(v)S.vibe=v;
  const ss=JSON.parse(localStorage.getItem('mm_sessions')||'[]'); if(Array.isArray(ss))S.sessions=ss;
}catch(e){}}
const curSession=()=>S.sessions.find(s=>s.id===S.sessionId)||null;

/* ============ nav ============ */
function go(name){
  S.screen=name;
  $$('#tabbar button').forEach(b=>b.classList.toggle('on',b.dataset.s===name));
  $$('.screen').forEach(s=>s.classList.toggle('active',s.id==='screen-'+name));
  if(name==='studio')renderStudio();
  if(name==='lobby')renderLobby();
  if(name==='play')renderInstrument();
  if(name==='warmup')renderWarmup();
  if(name==='learn')renderLessons();
  if(name==='me')renderProfile();
  window.scrollTo(0,0);
}
$$('#tabbar button').forEach(b=>b.onclick=()=>go(b.dataset.s));

/* ============ firebase sync layer (lights up when firebase-config.js is filled in) ============ */
const FB={on:false,db:null,rtdb:null};
function loadScript(src){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s);});}
async function initFirebase(){
  const cfg=window.FIREBASE_CONFIG;
  if(!cfg||!cfg.apiKey||String(cfg.apiKey).includes('PASTE')){net('offline');return;}
  try{
    await loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
    await loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js');
    await loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js');
    await loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js');
    firebase.initializeApp(cfg);
    await firebase.auth().signInAnonymously();
    const u=firebase.auth().currentUser; if(u)S.me.uid=u.uid;
    FB.db=firebase.firestore(); FB.rtdb=firebase.database(); FB.on=true; net('live');
    // presence
    const meRef=FB.rtdb.ref('mm_presence/'+S.me.uid);
    FB.rtdb.ref('.info/connected').on('value',snap=>{ if(snap.val()===true){meRef.onDisconnect().remove(); meRef.set({name:S.me.name||'Guest',photo:S.me.photo||'',ts:Date.now()});} });
    FB.rtdb.ref('mm_presence').on('value',snap=>{const v=snap.val()||{};S.presence=Object.entries(v).map(([id,p])=>({uid:id,...p}));renderPresence();});
    // chat
    FB.rtdb.ref('mm_chat').limitToLast(30).on('value',snap=>{const v=snap.val()||{};S.chat=Object.values(v).sort((a,b)=>a.ts-b.ts);renderChat();});
    // sessions
    FB.db.collection('mm_sessions').orderBy('updatedAt','desc').limit(20).onSnapshot(qs=>{
      const remote=[]; qs.forEach(d=>remote.push({id:d.id,...d.data()}));
      const local=S.sessions.filter(s=>!remote.find(r=>r.id===s.id));
      S.sessions=[...remote,...local];
      renderLobby(); if(S.screen==='studio')renderStudio();
    });
    // profile
    const pd=await FB.db.collection('mm_profiles').doc(S.me.uid).get();
    if(pd.exists){const p=pd.data(); if(p.name)S.me={...S.me,...p}; renderProfile();}
  }catch(e){console.warn('firebase off',e);net('offline');}
}
function net(st){const d=$('#netdot');d.className=st==='live'?'live':'offline';d.title=st==='live'?'live sync':'offline sketch mode';}
function fbSessionWrite(s){ if(!FB.on)return; FB.db.collection('mm_sessions').doc(s.id).set({...s,updatedAt:Date.now()},{merge:true}).catch(()=>{}); }
function fbChatPush(m){ if(FB.on){FB.rtdb.ref('mm_chat').push(m);} }
function fbProfileWrite(){ if(!FB.on)return; FB.db.collection('mm_profiles').doc(S.me.uid).set({name:S.me.name,bio:S.me.bio,photo:S.me.photo},{merge:true}).catch(()=>{}); }

/* ============ people (real only — presence fills in when Firebase is live) ============ */
function personName(id){ if(id===S.me.uid)return S.me.name||'You'; const p=S.presence.find(p=>p.uid===id); if(p)return p.name; return 'Guest'; }
function avatarHTML(id,cls=''){ const p=S.presence.find(p=>p.uid===id); const photo=(id===S.me.uid?S.me.photo:(p&&p.photo))||'';
  const nm=esc(personName(id));
  if(photo)return `<img class="avatar ${cls}" src="${photo}" title="${nm}" alt="${nm}">`;
  return `<div class="avatar ${cls}" title="${nm}">${esc(nm[0]||'?')}</div>`;
}

/* ============ AUDIO ENGINE ============ */
const AU={ctx:null,master:null,music:null,instBus:null,cap:null,analyser:null,micStream:null,noiseBuf:null,ir:null,
  metroTimer:null,nextBeat:0,nextStep:0,playT0:0,playing:false,loopTimer:null,scopeRAF:0,mr:null,mrChunks:[],monSrc:null,tuneTimer:null};

function ac(){ if(!AU.ctx){ const C=window.AudioContext||window.webkitAudioContext; AU.ctx=new C();
  AU.master=AU.ctx.createGain(); AU.master.gain.value=.9;
  AU.analyser=AU.ctx.createAnalyser(); AU.analyser.fftSize=2048;
  AU.master.connect(AU.analyser); AU.analyser.connect(AU.ctx.destination);
  AU.music=AU.ctx.createGain(); AU.music.connect(AU.master);
  AU.instBus=AU.ctx.createGain(); AU.instBus.connect(AU.music);
  AU.cap=AU.ctx.createMediaStreamDestination();
  AU.noiseBuf=makeNoise(AU.ctx);
} if(AU.ctx.state==='suspended')AU.ctx.resume(); return AU.ctx; }
function makeNoise(c){const b=c.createBuffer(1,c.sampleRate*1,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;return b;}
function makeIR(c,dur=1.8,dec=2.5){const r=c.sampleRate,l=Math.floor(r*dur),b=c.createBuffer(2,l,r);
  for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);for(let i=0;i<l;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/l,dec);}return b;}
const mtof=m=>440*Math.pow(2,(m-69)/12);
const ftom=f=>69+12*Math.log2(f/440);
function keyRoot(){return 60+NOTES.indexOf(S.transport.key);}
function nearestScale(m,scale){const sc=SCALES[scale||'major'];let best=m,bd=1e9;for(let o=-2;o<=2;o++)for(const iv of sc){const cand=keyRoot()+iv+o*12;const d=Math.abs(cand-m);if(d<bd){bd=d;best=cand;}}return best;}
function snapToKey(m){return S.stayInKey?nearestScale(m,'major'):m;}

/* per-track chain — same recipe for live ctx and OfflineAudioContext */
function buildTrackChain(c,t,bpm){
  const input=c.createGain();
  // --- auto-tune: modulated delay pitch shifter (prototype effect) ---
  const D=0.012, dl=c.createDelay(0.05); dl.delayTime.value=D/2;
  const saw=c.createOscillator(); saw.type='sawtooth'; saw.frequency.value=1.5;
  const g1=c.createGain(); g1.gain.value=0; const off=c.createConstantSource?c.createConstantSource():null;
  saw.connect(g1); g1.connect(dl.delayTime); if(off){off.offset.value=D/2;off.connect(dl.delayTime);off.start();} saw.start();
  const dry=c.createGain(), wet=c.createGain(); wet.gain.value=0;
  input.connect(dry); input.connect(dl); dl.connect(wet);
  const post=c.createGain(); dry.connect(post); wet.connect(post);
  // --- echo ---
  const echoSend=c.createGain(); echoSend.gain.value=(t.echo||0)*.5;
  const delay=c.createDelay(1.5); delay.delayTime.value=clamp(60/bpm*.75,.05,1.2);
  const fb=c.createGain(); fb.gain.value=.38; delay.connect(fb); fb.connect(delay);
  const echoMix=c.createGain(); echoMix.gain.value=.6;
  post.connect(echoSend); echoSend.connect(delay); delay.connect(echoMix);
  // --- reverb ---
  const verbSend=c.createGain(); verbSend.gain.value=(t.verb||0)*.55;
  const conv=c.createConvolver(); conv.buffer=AU.ir||(AU.ir=makeIR(c));
  const verbMix=c.createGain(); verbMix.gain.value=.7;
  post.connect(verbSend); verbSend.connect(conv); conv.connect(verbMix);
  // --- out ---
  const out=c.createGain(); out.gain.value=(t.mute?0:(t.gain??.8));
  post.connect(out); echoMix.connect(out); verbMix.connect(out);
  return {input,out,post,
    setTune(cents,amt){ const s=Math.pow(2,(cents||0)/1200); const f=clamp(Math.abs(s-1)/D,.2,9);
      saw.frequency.value=f; g1.gain.value=(s>=1?-1:1)*D/2*(amt>0?1:0); wet.gain.value=clamp(amt||0,0,1); },
    setFX(){ echoSend.gain.value=(t.echo||0)*.5; verbSend.gain.value=(t.verb||0)*.55; out.gain.value=(t.mute?0:(t.gain??.8)); delay.delayTime.value=clamp(60/(S.transport.bpm)*.75,.05,1.2); },
    srcs:[] };
}
function ensureLive(t){ ac(); if(!t.live){ t.live=buildTrackChain(AU.ctx,t,S.transport.bpm); t.live.out.connect(AU.music);} else t.live.setFX(); }

/* ---- pitch detection (autocorrelation) ---- */
const _pa=new Float32Array(2048);
function detectPitch(analyser){ analyser.getFloatTimeDomainData(_pa); const sr=AU.ctx.sampleRate,N=_pa.length;
  let rms=0; for(let i=0;i<N;i++)rms+=_pa[i]*_pa[i]; rms=Math.sqrt(rms/N); if(rms<0.012)return null;
  const c=new Float32Array(N); for(let i=0;i<N;i++){let s=0;for(let j=0;j<N-i;j++)s+=_pa[i]*_pa[j];c[i]=s;}
  let d=0; while(d<N-2&&c[d]>c[d+1])d++; let mx=-1,mp=-1; for(let i=d;i<N;i++)if(c[i]>mx){mx=c[i];mp=i;}
  if(mp<=0)return null; let T0=mp; const x1=c[mp-1],x2=c[mp],x3=c[mp+1]||0, a=(x1+x3-2*x2)/2, b=(x3-x1)/2; if(a)T0=mp-b/(2*a);
  const f=sr/T0; return (f>50&&f<1200)?f:null; }
function noteName(f){const m=Math.round(ftom(f));return NOTES[((m%12)+12)%12]+(Math.floor(m/12)-1);}

/* ---- metronome + transport ---- */
function click(t,accent){const c=AU.ctx,o=c.createOscillator(),g=c.createGain();o.type='square';o.frequency.value=accent?1960:1240;
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(accent?.5:.28,t+.004);g.gain.exponentialRampToValueAtTime(.0001,t+.06);
  o.connect(g);g.connect(AU.master);o.start(t);o.stop(t+.08);}
function schedAhead(){const c=AU.ctx,spb=60/S.transport.bpm,step=spb/4;
  while(AU.nextStepT<c.currentTime+.18){
    if(AU.nextStep%4===0&&S.transport.metro)click(AU.nextStepT,AU.nextStep%16===0);
    drumStep(AU.nextStep,AU.nextStepT);
    AU.nextStep++;AU.nextStepT+=step;
  }}
function drumStep(s,t){const p=S.drums;if(!p||!S.transport.playing)return;const i=s%16;
  if(p.kick[i])kick(AU.ctx,AU.music,t); if(p.snare[i])snare(AU.ctx,AU.music,t);
  if(p.hat[i])hat(AU.ctx,AU.music,t); if(p.clap[i])clap(AU.ctx,AU.music,t);
  markStep(i);}
function markStep(i){$$('#drumSeq .cell').forEach(el=>el.classList.toggle('now',+el.dataset.i===i));}
function startTransport(){ac();if(AU.playing)return;AU.playing=true;S.transport.playing=true;
  AU.nextStep=0;AU.nextStepT=AU.ctx.currentTime+.08;
  AU.metroTimer=setInterval(schedAhead,30);
  // start clip sources
  const t0=AU.nextStepT, anySolo=S.tracks.some(t=>t.solo);
  S.tracks.forEach(t=>{ensureLive(t);if(!t.buffer)return;if(t.mute)return;if(anySolo&&!t.solo)return;
    const src=AU.ctx.createBufferSource();src.buffer=t.buffer;src.connect(t.live.input);
    src.start(t0,(t.offset||0)%t.buffer.duration);t.live.srcs.push(src);});
  scheduleLoop(); updateTransportUI();}
function scheduleLoop(){clearTimeout(AU.loopTimer);if(!S.transport.loop)return;
  let dur=4*60/S.transport.bpm; S.tracks.forEach(t=>{if(t.buffer)dur=Math.max(dur,t.buffer.duration);});
  AU.loopTimer=setTimeout(()=>{if(!AU.playing)return;stopClips();const t0=AU.ctx.currentTime+.05;const anySolo=S.tracks.some(t=>t.solo);
    S.tracks.forEach(t=>{if(!t.buffer||t.mute||(anySolo&&!t.solo))return;const src=AU.ctx.createBufferSource();src.buffer=t.buffer;src.connect(t.live.input);src.start(t0,(t.offset||0)%t.buffer.duration);t.live.srcs.push(src);});
    scheduleLoop();},dur*1000);}
function stopClips(){S.tracks.forEach(t=>{if(t.live){t.live.srcs.forEach(s=>{try{s.stop()}catch(e){}});t.live.srcs=[];}});}
function stopTransport(){if(!AU.playing&&!S.transport.recording)return;
  clearInterval(AU.metroTimer);clearTimeout(AU.loopTimer);stopClips();AU.playing=false;S.transport.playing=false;
  if(S.transport.recording)finishRecording(); updateTransportUI(); markStep(-1);}
function togglePlay(){ac();AU.playing?stopTransport():startTransport();}

/* ---- count-in ---- */
function countIn(then){ac();const spb=60/S.transport.bpm;let n=4;
  $('#countOverlay').classList.remove('hidden');
  const tick=()=>{ if(n===0){$('#countOverlay').classList.add('hidden');then&&then();return;}
    $('#countNum').textContent=n; click(AU.ctx.currentTime+.02,n===4); n--; setTimeout(tick,spb*1000); };
  tick();}

/* ---- recording ---- */
async function toggleRec(){ac();
  if(S.transport.recording){stopTransport();return;}
  const t=S.tracks.find(x=>x.id===S.transport.armedTrack);
  if(!t){toast('Add a track and arm it (⏺) first');go('studio');return;}
  countIn(async()=>{
    S.transport.recording=true;S.transport.recSource=t.kind==='mic'?'mic':'inst';
    ensureLive(t);
    try{
      if(S.transport.recSource==='mic'){
        const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
        AU.micStream=stream; const src=AU.ctx.createMediaStreamSource(stream);
        AU.monSrc=src; src.connect(t.live.input);
        const man=AU.ctx.createAnalyser();man.fftSize=2048;src.connect(man);AU.micAnalyser=man;
        startTuneLoop(t);
        AU.mr=new MediaRecorder(stream);AU.mrChunks=[];
        AU.mr.ondataavailable=e=>{if(e.data.size)AU.mrChunks.push(e.data);};
        AU.mr.onstop=()=>decodeChunks(t);
        AU.mr.start();
      }else{
        AU.instBus.connect(AU.cap);
        AU.mr=new MediaRecorder(AU.cap.stream);AU.mrChunks=[];
        AU.mr.ondataavailable=e=>{if(e.data.size)AU.mrChunks.push(e.data);};
        AU.mr.onstop=()=>{AU.instBus.disconnect(AU.cap);decodeChunks(t);};
        AU.mr.start();
      }
      if(!AU.playing)startTransport(); else updateTransportUI();
      toast('🔴 Recording — play or sing!');
    }catch(e){S.transport.recording=false;toast('Mic unavailable: '+e.message);}
  });}
function decodeChunks(t){const blob=new Blob(AU.mrChunks,{type:AU.mr.mimeType||'audio/webm'});
  blob.arrayBuffer().then(ab=>AU.ctx.decodeAudioData(ab)).then(buf=>{t.buffer=buf;t.offset=0;drawWave(t);toast('Take kept ✓');renderTracks();})
  .catch(()=>toast('Could not decode that take'));
  AU.mrChunks=[];}
function finishRecording(){S.transport.recording=false;
  clearInterval(AU.tuneTimer);
  if(AU.mr&&AU.mr.state!=='inactive'){try{AU.mr.stop();}catch(e){}}
  if(AU.micStream){AU.micStream.getTracks().forEach(x=>x.stop());AU.micStream=null;}
  if(AU.monSrc){try{AU.monSrc.disconnect();}catch(e){}AU.monSrc=null;}
  updateTransportUI();renderTracks();}
/* live auto-tune correction loop while recording/monitoring mic */
function startTuneLoop(t){clearInterval(AU.tuneTimer);
  AU.tuneTimer=setInterval(()=>{ if(!AU.micAnalyser||!t.live)return;
    const f=detectPitch(AU.micAnalyser); if(!f){t.live.setTune(0,0);return;}
    const m=ftom(f), near=nearestScale(Math.round(m),'major'), cents=(near-m)*100;
    t.live.setTune(cents,(t.tune||0));
  },110);}

/* ---- drum synths ---- */
function kick(c,dest,t){const o=c.createOscillator(),g=c.createGain();o.type='sine';
  o.frequency.setValueAtTime(160,t);o.frequency.exponentialRampToValueAtTime(42,t+.11);
  g.gain.setValueAtTime(.9,t);g.gain.exponentialRampToValueAtTime(.001,t+.24);
  o.connect(g);g.connect(dest);o.start(t);o.stop(t+.26);}
function noiseHit(c,dest,t,{dur,f,type,Q}){const s=c.createBufferSource();s.buffer=AU.noiseBuf;
  const f2=c.createBiquadFilter();f2.type=type;f2.frequency.value=f;f2.Q.value=Q||1;
  const g=c.createGain();g.gain.setValueAtTime(.5,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);
  s.connect(f2);f2.connect(g);g.connect(dest);s.start(t);s.stop(t+dur+.02);}
function snare(c,dest,t){noiseHit(c,dest,t,{dur:.18,f:1800,type:'bandpass',Q:.8});
  const o=c.createOscillator(),g=c.createGain();o.type='triangle';o.frequency.value=190;
  g.gain.setValueAtTime(.4,t);g.gain.exponentialRampToValueAtTime(.001,t+.1);o.connect(g);g.connect(dest);o.start(t);o.stop(t+.12);}
function hat(c,dest,t,open){noiseHit(c,dest,t,{dur:open?.28:.045,f:7500,type:'highpass'});}
function clap(c,dest,t){[0,.02,.041].forEach(d=>noiseHit(c,dest,t+d,{dur:.09,f:1300,type:'bandpass',Q:1.6}));}

/* ---- wav export ---- */
function encodeWAV(buf){const n=buf.length,ch=Math.min(2,buf.numberOfChannels),sr=buf.sampleRate;
  const bytes=44+n*ch*2,ab=new ArrayBuffer(bytes),v=new DataView(ab);
  const ws=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
  ws(0,'RIFF');v.setUint32(4,bytes-8,true);ws(8,'WAVE');ws(12,'fmt ');v.setUint32(16,16,true);
  v.setUint16(20,1,true);v.setUint16(22,ch,true);v.setUint32(24,sr,true);
  v.setUint32(28,sr*ch*2,true);v.setUint16(32,ch*2,true);v.setUint16(34,16,true);ws(36,'data');v.setUint32(40,n*ch*2,true);
  const chans=[];for(let c2=0;c2<ch;c2++)chans.push(buf.getChannelData(c2));
  let o=44;for(let i=0;i<n;i++)for(let c2=0;c2<ch;c2++){const x=clamp(chans[c2][i],-1,1);v.setInt16(o,x<0?x*32768:x*32767,true);o+=2;}
  return new Blob([ab],{type:'audio/wav'});}

/* ============ LOBBY ============ */
S.drums={kick:[1,0,0,0,0,0,1,0,1,0,0,0,0,0,1,0],snare:[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,1],hat:[1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],clap:[0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0]};
function renderLobby(){renderPresence();renderChat();
  const dl=$('#doorList');dl.innerHTML='';
  if(!S.sessions.length)dl.innerHTML='<p class="fine">No sessions yet — open the first door.</p>';
  [...S.sessions].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).forEach(s=>{
    const open=s.door==='open', member=s.members.includes(S.me.uid);
    const d=document.createElement('div');d.className='door '+(open?'open':'recording');
    d.innerHTML=`<div class="lampdot"></div>${s.cover?`<img class="cover" src="${s.cover}">`:''}
      <div class="sign"><div class="stext">${open?'🟢 OPEN SESSION':'🔴 RECORDING'}</div>
      <h3>${esc(s.name)}</h3><div class="vibe">${esc(s.desc||'')}</div>
      <div class="row" style="margin-top:6px">${s.members.slice(0,5).map(m=>avatarHTML(m,'sm')).join('')}<span class="fine">${s.members.length} in</span></div></div>
      <div>${member?`<button class="mini primary" data-enter="${s.id}">Enter</button>`:`<button class="mini" data-join="${s.id}">${open?'Join':'Knock'}</button>`}</div>`;
    dl.appendChild(d);
  });
  dl.querySelectorAll('[data-enter]').forEach(b=>b.onclick=()=>enterSession(b.dataset.enter));
  dl.querySelectorAll('[data-join]').forEach(b=>b.onclick=()=>requestJoin(b.dataset.join));
}
function renderPresence(){const r=$('#presenceRow');if(!r)return;
  const all=[...S.presence]; if(!all.find(p=>p.uid===S.me.uid))all.unshift({uid:S.me.uid,name:S.me.name||'You',photo:S.me.photo});
  r.innerHTML=all.map(p=>{const photo=p.uid===S.me.uid?S.me.photo:p.photo;const nm=esc(p.name||'Guest');
    return `<div class="avwrap">${photo?`<img class="avatar" src="${photo}" alt="${nm}">`:`<div class="avatar">${esc(nm[0]||'?')}</div>`}<div>${nm}</div></div>`;}).join('');
  $('#onlineCount').textContent=all.length+' hanging';}
function renderChat(){const c=$('#spitball');if(!c)return;
  c.innerHTML=S.chat.map(m=>`<div class="msg ${m.uid===S.me.uid?'me':''}"><b>${esc(m.name)}:</b> ${esc(m.text)}</div>`).join('');
  c.scrollTop=c.scrollHeight;}
function sendSpit(){const i=$('#spitInput'),v=i.value.trim();if(!v)return;
  const m={uid:S.me.uid,name:S.me.name||'Guest',text:v,ts:Date.now()};
  if(FB.on)fbChatPush(m); else {S.chat.push(m);renderChat();} i.value='';}

/* ---- new session ---- */
function newSessionModal(pref){
  openModal(`<h3>Open a new session 🚪</h3>
   <p class="fine">Name it like a band would.</p>
   <input id="nsName" placeholder="e.g. Sunday Jam" maxlength="30" value="${esc(pref&&pref.name||'')}">
   <h3 style="margin-top:12px">Vibe</h3><div class="chips" id="nsVibes">${VIBES.map(v=>`<button data-v="${v.id}" class="${v.id===(pref&&pref.vibe||S.vibe.id)?'on':''}">${v.name}</button>`).join('')}</div>
   <h3>Who can walk in?</h3>
   <div class="seg" id="nsPolicy"><button data-p="open" class="on">Open door</button><button data-p="vote">Knock + vote</button><button data-p="locked">Locked</button></div>
   <p class="fine" id="nsPolicyHelp">Anyone can join anytime. Green light on the door.</p>
   <div class="row" style="margin-top:14px"><button class="ghost" id="nsCancel">Cancel</button><button class="primary" id="nsGo" style="flex:1">Open the door →</button></div>`);
  let vibe=(pref&&pref.vibe)||S.vibe.id, policy='open';
  $('#nsVibes').querySelectorAll('button').forEach(b=>b.onclick=()=>{$('#nsVibes').querySelectorAll('button').forEach(x=>x.classList.remove('on'));b.classList.add('on');vibe=b.dataset.v;});
  const help={open:'Anyone can join anytime. Green light on the door.',vote:'When the red light is on, newcomers knock and members vote. Majority wins; you break ties.',locked:'Door stays shut unless you personally let someone in.'};
  $('#nsPolicy').querySelectorAll('button').forEach(b=>b.onclick=()=>{$('#nsPolicy').querySelectorAll('button').forEach(x=>x.classList.remove('on'));b.classList.add('on');policy=b.dataset.p;$('#nsPolicyHelp').textContent=help[policy];});
  $('#nsCancel').onclick=closeModal;
  $('#nsGo').onclick=()=>{const name=$('#nsName').value.trim()||'Untitled Session';closeModal();createSession({name,vibe,policy});};
}
function createSession({name,vibe,policy}){
  const v=VIBES.find(x=>x.id===vibe)||S.vibe;
  const s={id:uid(),name,vibe:v.id,key:v.key,bpm:v.bpm,door:'open',policy,creator:S.me.uid,
    members:[S.me.uid],joinReq:[],cover:S.transport.cover||null,desc:v.name+' · '+v.bpm+' BPM · key of '+v.key,createdAt:Date.now(),_tracks:[]};
  S.sessions.unshift(s);fbSessionWrite(s);saveLS();enterSession(s.id);
  toast('🚪 "'+name+'" is open — green light!');
}
function enterSession(id){const s=S.sessions.find(x=>x.id===id);if(!s)return;
  if(S.sessionId){const prev=curSession();if(prev)prev._tracks=S.tracks;}
  S.sessionId=id;S.tracks=s._tracks||[];
  Object.assign(S.transport,{bpm:s.bpm,key:s.key,vibe:s.vibe,armedTrack:null,recording:false});
  go('studio');}
function leaveSession(){const s=curSession();if(s)s._tracks=S.tracks;S.sessionId=null;S.tracks=[];go('lobby');}

/* ---- joining + voting ---- */
function requestJoin(id){const s=S.sessions.find(x=>x.id===id);if(!s)return;
  if(s.members.includes(S.me.uid)){enterSession(id);return;}
  const needsVote=(s.policy==='locked')||(s.policy==='vote'&&s.door==='recording');
  if(!needsVote){s.members.push(S.me.uid);fbSessionWrite(s);saveLS();enterSession(id);toast('You walked right in 🟢');return;}
  if(s.joinReq.find(r=>r.uid===S.me.uid)){toast('Already knocking…');return;}
  s.joinReq.push({uid:S.me.uid,votes:{}});fbSessionWrite(s);saveLS();renderLobby();
  toast('Knock knock… members are voting');
}
function castVote(s,reqUid,voterUid,yes){const r=s.joinReq.find(r=>r.uid===reqUid);if(!r||!s.members.includes(voterUid))return;
  r.votes[voterUid]=!!yes; fbSessionWrite(s);
  const ms=s.members, yesN=ms.filter(m=>r.votes[m]).length, noN=ms.filter(m=>r.votes[m]===false).length, voted=yesN+noN;
  let done=null;
  if(yesN>ms.length/2)done=true; else if(noN>=ms.length/2)done=false;
  else if(voted===ms.length){ done=yesN===noN ? !!r.votes[s.creator] : yesN>noN; }
  if(done===true){s.members.push(reqUid);s.joinReq=s.joinReq.filter(x=>x.uid!==reqUid);
    toast('🟢 '+personName(reqUid)+' was voted in!');}
  else if(done===false){s.joinReq=s.joinReq.filter(x=>x.uid!==reqUid);toast('The room voted no this time');}
  saveLS(); if(S.screen==='studio')renderStudio(); else renderLobby();}
function toggleDoor(){const s=curSession();if(!s||!s.members.includes(S.me.uid))return;
  s.door=s.door==='open'?'recording':'open';fbSessionWrite(s);saveLS();renderStudio();renderLobby();
  toast(s.door==='open'?'🟢 Door open — come on in!':'🔴 Recording — red light on');}

/* ============ STUDIO ============ */
function renderStudio(){const s=curSession();
  $('#noSession').classList.toggle('hidden',!!s);$('#sessionWrap').classList.toggle('hidden',!s);
  if(!s)return;
  const open=s.door==='open',ds=$('#doorSign');
  ds.className='door big '+(open?'open':'recording');
  $('#doorText').textContent=open?'OPEN SESSION — tap to go red':'● RECORDING — tap for green';
  ds.onclick=()=>{ if(s.members.includes(S.me.uid))toggleDoor(); else toast('Join the session first'); };
  $('#sessName').textContent=s.name;
  $('#sessMeta').textContent=`${(VIBES.find(v=>v.id===s.vibe)||{}).name||''} · ${s.bpm} BPM · key of ${s.key} · door: ${s.policy}`;
  $('#sessKey').textContent=s.key;$('#sessVibe').textContent=(VIBES.find(v=>v.id===s.vibe)||{}).name||'—';$('#keyLabel').textContent=s.key;
  $('#memberRow').innerHTML=s.members.map(m=>`<div class="avwrap">${avatarHTML(m,'sm')}<div>${esc(personName(m))}</div></div>`).join('');
  const jr=$('#joinReqs');jr.innerHTML='';
  s.joinReq.forEach(r=>{const d=document.createElement('div');d.className='joinreq';
    const yN=s.members.filter(m=>r.votes[m]).length,nN=s.members.filter(m=>r.votes[m]===false).length;
    d.innerHTML=`🚪 <b>${esc(personName(r.uid))}</b> is knocking… (${yN} yes / ${nN} no)
      <div class="row" style="margin-top:6px"><button class="mini" data-y="${r.uid}">Let in</button><button class="mini ghost" data-n="${r.uid}">Not now</button></div>`;
    jr.appendChild(d);});
  jr.querySelectorAll('[data-y]').forEach(b=>b.onclick=()=>castVote(s,b.dataset.y,S.me.uid,true));
  jr.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>castVote(s,b.dataset.n,S.me.uid,false));
  $('#bpm').value=S.transport.bpm;$('#bpmVal').textContent=S.transport.bpm;
  $('#metroChk').checked=S.transport.metro;$('#loopChk').checked=S.transport.loop;
  renderTracks();updateTransportUI();startScope();
}
function updateTransportUI(){$('#playBtn').textContent=AU.playing?'⏸ Stop':'▶ Play';
  const rb=$('#recBtn');rb.classList.toggle('armed',S.transport.recording);rb.textContent=S.transport.recording?'⏺ Stop':'⏺ Rec';}
function addTrack(kind,name){const colors={mic:'#ff4d5e',keys:'#6cb8ff',drums:'#ffb020',theremin:'#b48cff',motion:'#35d07f'};
  const icons={mic:'🎤',keys:'🎹',drums:'🥁',theremin:'📡',motion:'🤳'};
  const t={id:uid(),name:name||(icons[kind]+' '+(S.tracks.length+1)),kind,icon:icons[kind],buffer:null,offset:0,
    gain:.8,mute:false,solo:false,tune:kind==='mic'?.4:0,echo:.15,verb:.3,color:colors[kind],live:null};
  S.tracks.push(t);ensureLive(t);renderTracks();return t;}
function addTrackModal(){openModal(`<h3>Add a track</h3>
  <input id="tkName" placeholder="Track name (optional)" maxlength="24">
  <div class="chips" id="tkKind" style="margin-top:10px">
   <button data-k="mic" class="on">🎤 Mic / vocals</button><button data-k="keys">🎹 Keys</button>
   <button data-k="drums">🥁 Drums</button><button data-k="theremin">📡 Theremin</button><button data-k="motion">🤳 Motion</button></div>
  <p class="fine">Arm it (⏺) then hit Rec in the transport — you'll get a 1-2-3-4 count-in.</p>
  <div class="row" style="margin-top:10px"><button class="ghost" id="tkCancel">Cancel</button><button class="primary" id="tkGo" style="flex:1">Add track</button></div>`);
  let kind='mic';$('#tkKind').querySelectorAll('button').forEach(b=>b.onclick=()=>{$('#tkKind').querySelectorAll('button').forEach(x=>x.classList.remove('on'));b.classList.add('on');kind=b.dataset.k;});
  $('#tkCancel').onclick=closeModal;
  $('#tkGo').onclick=()=>{const t=addTrack(kind,$('#tkName').value.trim());closeModal();S.transport.armedTrack=t.id;renderTracks();toast(t.icon+' armed — hit ⏺ Rec up top');};}
function renderTracks(){const el=$('#trackList');if(!el)return;el.innerHTML='';
  if(!S.tracks.length)el.innerHTML='<p class="fine">No tracks yet. Add one — mic, keys, drums, theremin, motion…</p>';
  S.tracks.forEach(t=>{const d=document.createElement('div');d.className='track'+(S.transport.armedTrack===t.id?' armed':'');
    d.innerHTML=`<div class="trow"><span class="tname">${esc(t.name)}</span>
      <button class="mini ${S.transport.armedTrack===t.id?'on':''}" data-arm title="arm for recording">⏺</button>
      <button class="mini ${t.mute?'on':''}" data-mute>M</button><button class="mini ${t.solo?'on':''}" data-solo>S</button>
      <button class="mini ghost" data-snap title="snap clip to grid">🧲</button>
      <button class="mini ghost" data-del>✕</button></div>
      <canvas class="wave" width="600" height="56"></canvas>
      <div class="fx">
       <label>🎯 Auto-tune<input type="range" min="0" max="1" step="0.01" value="${t.tune}" data-fx="tune"></label>
       <label>🌀 Echo<input type="range" min="0" max="1" step="0.01" value="${t.echo}" data-fx="echo"></label>
       <label>🏛️ Reverb<input type="range" min="0" max="1" step="0.01" value="${t.verb}" data-fx="verb"></label>
       <label>🔊 Volume<input type="range" min="0" max="1.2" step="0.01" value="${t.gain}" data-fx="gain"></label>
       <label>⏱️ Offset<input type="range" min="0" max="4" step="0.01" value="${t.offset}" data-fx="offset"></label>
       <span class="fine" style="align-self:end">${t.buffer?t.buffer.duration.toFixed(1)+'s':'empty'}</span></div>`;
    el.appendChild(d);
    d.querySelector('[data-arm]').onclick=()=>{S.transport.armedTrack=S.transport.armedTrack===t.id?null:t.id;renderTracks();
      $('#armHint').textContent=S.transport.armedTrack?('recording into: '+t.name+' ('+t.kind+')'):'arm a track in Studio to record';};
    d.querySelector('[data-mute]').onclick=()=>{t.mute=!t.mute;ensureLive(t);renderTracks();};
    d.querySelector('[data-solo]').onclick=()=>{t.solo=!t.solo;renderTracks();};
    d.querySelector('[data-del]').onclick=()=>{if(t.live){try{t.live.out.disconnect();}catch(e){}}S.tracks=S.tracks.filter(x=>x!==t);if(S.transport.armedTrack===t.id)S.transport.armedTrack=null;renderTracks();};
    d.querySelector('[data-snap]').onclick=()=>{const beat=60/S.transport.bpm;t.offset=Math.round(t.offset/beat)*beat;renderTracks();toast('🧲 Snapped to grid');};
    d.querySelectorAll('[data-fx]').forEach(r=>r.oninput=()=>{t[r.dataset.fx]=+r.value;ensureLive(t);});
    t._canvas=d.querySelector('canvas');drawWave(t);});
}
function drawWave(t){const c=t._canvas;if(!c)return;const x=c.getContext('2d');x.clearRect(0,0,c.width,c.height);
  x.fillStyle='#101018';x.fillRect(0,0,c.width,c.height);
  if(!t.buffer){x.fillStyle='#555';x.font='12px sans-serif';x.fillText(t.kind==='mic'?'🎤 tap ⏺ then Rec to lay a vocal':t.icon+' record from the Play tab',10,32);return;}
  const d=t.buffer.getChannelData(0),step=Math.floor(d.length/c.width)||1;
  x.fillStyle=t.color;x.beginPath();x.moveTo(0,28);
  for(let i=0;i<c.width;i++){let mx=0;for(let j=i*step;j<(i+1)*step&&j<d.length;j+=4)mx=Math.max(mx,Math.abs(d[j]));
    x.lineTo(i,28-mx*26);x.lineTo(i,28+mx*26);}
  x.fill();
  // beat grid
  const beat=60/S.transport.bpm,pxPerSec=c.width/Math.max(t.buffer.duration,4);
  x.strokeStyle='rgba(255,255,255,.15)';for(let b=0;b*beat<t.buffer.duration+4;b++){x.beginPath();x.moveTo(b*beat*pxPerSec,0);x.lineTo(b*beat*pxPerSec,56);x.stroke();}}
/* master scope */
function startScope(){cancelAnimationFrame(AU.scopeRAF);const c=$('#scope');if(!c)return;const x=c.getContext('2d');
  const specHist=[];
  const draw=()=>{AU.scopeRAF=requestAnimationFrame(draw);if(S.screen!=='studio')return;
    x.fillStyle='#0a0a10';x.fillRect(0,0,c.width,c.height);
    const an=AU.analyser;
    if(!an){x.fillStyle='#555';x.font='12px sans-serif';x.fillText('press play — the scope wakes up',10,80);return;}
    if(S.scopeView==='wave'){const d=new Float32Array(an.fftSize);an.getFloatTimeDomainData(d);
      x.strokeStyle='#ffb020';x.lineWidth=2;x.beginPath();
      for(let i=0;i<c.width;i++){const v=d[Math.floor(i/c.width*d.length)]||0;x.lineTo(i,80-v*70);}x.stroke();
    }else{const f=new Uint8Array(an.frequencyBinCount);an.getByteFrequencyData(f);
      specHist.push(f.slice(0,160));if(specHist.length>160)specHist.shift();
      const w=c.width/160;for(let i=0;i<specHist.length;i++)for(let j=0;j<160;j++){const v=specHist[i][j]/255;
        if(v>.02){x.fillStyle=`hsl(${240-v*240},80%,${20+v*50}%)`;x.fillRect(i*w,c.height-(j/160)*c.height,w+1,(j/160)*c.height+1);}}}};
  draw();}

/* ---- export + save ---- */
async function exportDemo(){const s=curSession();if(!s)return;
  const audible=S.tracks.filter(t=>t.buffer&&!t.mute&&( !S.tracks.some(x=>x.solo)||t.solo));
  if(!audible.length){toast('Nothing to export — record something first');return;}
  toast('Rendering demo…');
  let dur=4;audible.forEach(t=>dur=Math.max(dur,t.buffer.duration+(t.offset||0)));
  const sr=44100,oc=new OfflineAudioContext(2,Math.ceil(sr*dur),sr);
  audible.forEach(t=>{const ch=buildTrackChain(oc,t,S.transport.bpm);ch.out.connect(oc.destination);
    const src=oc.createBufferSource();src.buffer=t.buffer;src.connect(ch.input);src.start(t.offset||0);});
  try{const buf=await oc.startRendering();const blob=encodeWAV(buf);
    const d=new Date(),stamp=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    const slug=s.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,24)||'session';
    const fname=`demo-recording-${slug}-${stamp}.wav`;
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=fname;a.click();
    const demos=JSON.parse(localStorage.getItem('mm_demos')||'[]');demos.unshift({name:fname,session:s.name,ts:Date.now()});
    localStorage.setItem('mm_demos',JSON.stringify(demos.slice(0,20)));renderProfile();
    toast('⬇ Exported — labeled DEMO RECORDING');}
  catch(e){toast('Render failed: '+e.message);}}
function saveProject(){const s=curSession();if(!s)return;
  s._tracks=S.tracks;
  const proj={session:{id:s.id,name:s.name,vibe:s.vibe,key:s.key,bpm:s.bpm,door:s.door,cover:s.cover},
    tracks:S.tracks.map(t=>({name:t.name,kind:t.kind,gain:t.gain,mute:t.mute,solo:t.solo,tune:t.tune,echo:t.echo,verb:t.verb,offset:t.offset,hasAudio:!!t.buffer})),savedAt:Date.now()};
  try{localStorage.setItem('mm_project_'+s.id,JSON.stringify(proj));}catch(e){}
  if(FB.on)FB.db.collection('mm_projects').doc(s.id).set(proj).catch(()=>{});
  toast('💾 Project saved — tracks, FX & mixer, producer-desk style');}

/* ============ INSTRUMENTS ============ */
$$('#instSeg button').forEach(b=>b.onclick=()=>{S.inst=b.dataset.i;$$('#instSeg button').forEach(x=>x.classList.toggle('on',x===b));renderInstrument();});
$('#stayInKey').onchange=e=>{S.stayInKey=e.target.checked;};
function renderInstrument(){const el=$('#instArea');stopMotion();
  if(S.inst==='drums')return drumsUI(el);
  if(S.inst==='keys')return keysUI(el);
  if(S.inst==='theremin')return thereminUI(el);
  return motionUI(el);}
function armedTrack(){return S.tracks.find(t=>t.id===S.transport.armedTrack);}
function instPlay(fn){ac();fn(AU.ctx,AU.instBus,AU.ctx.currentTime);}

/* ---- drums ---- */
function drumsUI(el){
  const sounds=[['kick','🥁 Kick'],['snare','🪘 Snare'],['hat','🎩 Hat'],['ohat','✨ Open hat'],['clap','👏 Clap'],['tom','🛢️ Tom'],['shaker','🫙 Shaker'],['rim','🔔 Rim']];
  el.innerHTML=`<div class="padgrid">${sounds.map(s=>`<button class="pad" data-s="${s[0]}">${s[1]}</button>`).join('')}</div>
   <h3>Pattern sequencer <span class="fine">(plays with transport)</span></h3>
   <div id="drumSeq">${['kick','snare','hat','clap'].map(l=>`<div class="seqrow"><span class="seqlabel">${l}</span><div class="seq" data-lane="${l}">${S.drums[l].map((v,i)=>`<button class="cell ${v?'on':''}" data-i="${i}"></button>`).join('')}</div></div>`).join('')}</div>
   <div class="row"><button id="drumClear" class="ghost">Clear</button><button id="drumRender" class="primary" style="flex:1">⬇ Render 2 bars → armed track</button></div>`;
  el.querySelectorAll('.pad').forEach(p=>p.addEventListener('pointerdown',()=>{p.classList.add('hit');setTimeout(()=>p.classList.remove('hit'),120);
    instPlay((c,d,t)=>drumSound(p.dataset.s,c,d,t));}));
  el.querySelectorAll('#drumSeq .cell').forEach(c=>c.onclick=()=>{const lane=c.parentElement.dataset.lane,i=+c.dataset.i;
    S.drums[lane][i]=S.drums[lane][i]?0:1;c.classList.toggle('on');});
  $('#drumClear').onclick=()=>{Object.keys(S.drums).forEach(k=>S.drums[k]=S.drums[k].map(()=>0));renderInstrument();};
  $('#drumRender').onclick=renderDrumsToTrack;}
function drumSound(name,c,dest,t){ac();
  if(name==='kick')kick(c,dest,t);else if(name==='snare')snare(c,dest,t);
  else if(name==='hat')hat(c,dest,t);else if(name==='ohat')hat(c,dest,t,true);
  else if(name==='clap')clap(c,dest,t);
  else if(name==='tom'){const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.setValueAtTime(220,t);o.frequency.exponentialRampToValueAtTime(90,t+.15);g.gain.setValueAtTime(.7,t);g.gain.exponentialRampToValueAtTime(.001,t+.2);o.connect(g);g.connect(dest);o.start(t);o.stop(t+.22);}
  else if(name==='shaker')noiseHit(c,dest,t,{dur:.12,f:6000,type:'highpass'});
  else if(name==='rim')noiseHit(c,dest,t,{dur:.05,f:2200,type:'bandpass',Q:4});}
function renderDrumsToTrack(){ac();let t=armedTrack();if(!t)t=addTrack('drums');
  const spb=60/S.transport.bpm,dur=spb*8,sr=44100,oc=new OfflineAudioContext(2,Math.ceil(sr*dur)+sr,sr);
  const nb=oc.createBuffer(1,sr,sr),nd=nb.getChannelData(0);for(let i=0;i<nd.length;i++)nd[i]=Math.random()*2-1;
  const keep=AU.noiseBuf;AU.noiseBuf=nb;
  for(let s=0;s<32;s++){const tt=.1+s*spb/4,i=s%16,p=S.drums;
    if(p.kick[i])kick(oc,oc.destination,tt);if(p.snare[i])snare(oc,oc.destination,tt);
    if(p.hat[i])hat(oc,oc.destination,tt);if(p.clap[i])clap(oc,oc.destination,tt);}
  AU.noiseBuf=keep;
  oc.startRendering().then(buf=>{t.buffer=buf;t.offset=0;S.transport.armedTrack=t.id;drawWave(t);renderTracks();toast('🥁 2 bars on "'+t.name+'"');})
  .catch(e=>toast('Render failed'));}

/* ---- keys ---- */
let keyOsc=null;
function keysUI(el){
  const root=keyRoot();let html='<div class="piano" id="piano">';
  const wnotes=[];for(let o=0;o<2;o++)[0,2,4,5,7,9,11].forEach(iv=>wnotes.push(root+iv+o*12));
  const W=100/wnotes.length;let bi=0;
  wnotes.forEach((m,i)=>{html+=`<div class="wk" data-m="${m}" style="left:${i*W}%;width:${W}%"></div>`;});
  // black keys: after white index where semitone gap (0:C#,1:D#,3:F#,4:G#,5:A#)
  const blackAfter={0:1,1:3,3:6,4:8,5:10};
  for(let o=0;o<2;o++)for(const[wi,off]of Object.entries(blackAfter)){const i=o*7+ +wi;const m=wnotes[i]+1;
    html+=`<div class="bk" data-m="${m}" style="left:${(i+1)*W-W*0.3}%;width:${W*0.6}%"></div>`;}
  el.innerHTML=html+'</div><p class="fine">Tap to play. With “stay in key” on, wrong notes politely slide to the right one 😉</p><div class="row"><button class="primary" id="keysRec" style="flex:1">⏺ Arm keys & record from here</button></div>';
  const piano=$('#piano');
  piano.querySelectorAll('.wk,.bk').forEach(k=>{
    const down=e=>{e.preventDefault();ac();let m=+k.dataset.m;const snapped=snapToKey(m);
      if(snapped!==m){toast('🎯 snapped to '+NOTES[((snapped%12)+12)%12],900);}
      k.classList.add('hit');keyNote(snapped,true);k._m=snapped;};
    const up=()=>{k.classList.remove('hit');if(k._m!=null)keyNote(k._m,false);k._m=null;};
    k.addEventListener('pointerdown',down);k.addEventListener('pointerup',up);k.addEventListener('pointerleave',up);});
  $('#keysRec').onclick=()=>{let t=armedTrack();if(!t||t.kind!=='keys')t=addTrack('keys');
    S.transport.armedTrack=t.id;go('studio');setTimeout(()=>toggleRec(),400);};}
function keyNote(m,on){const c=AU.ctx;
  if(on){keyNote(m,false);const o=c.createOscillator(),o2=c.createOscillator(),g=c.createGain();
    o.type='triangle';o.frequency.value=mtof(m);o2.type='sine';o2.frequency.value=mtof(m)*2.001;
    const g2=c.createGain();g2.gain.value=.15;o2.connect(g2);g2.connect(g);
    g.gain.setValueAtTime(.0001,c.currentTime);g.gain.exponentialRampToValueAtTime(.5,c.currentTime+.01);
    g.gain.setTargetAtTime(.28,c.currentTime+.02,.4);
    o.connect(g);g.connect(AU.instBus);o.start();o2.start();keyOsc={o,o2,g,m};}
  else if(keyOsc&&keyOsc.m===m){const{o,o2,g}=keyOsc,t=c.currentTime;g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(.0001,t,.06);setTimeout(()=>{try{o.stop();o2.stop();}catch(e){}},300);keyOsc=null;}}

/* ---- theremin ---- */
let thNodes=null;
function thereminUI(el){
  el.innerHTML=`<div class="theremin" id="thPad"><div class="note" id="thNote">–</div><div class="dot" id="thDot"></div>
    <div style="position:absolute;bottom:10px;width:100%;text-align:center" class="fine">up = higher · sideways = louder</div></div>
   <label class="row"><input type="checkbox" id="thSnap" checked> Snap to scale</label>
   <div class="row"><button class="primary" id="thRec" style="flex:1">⏺ Arm theremin & record</button></div>`;
  const pad=$('#thPad'),dot=$('#thDot');
  const pos=e=>{const r=pad.getBoundingClientRect();const t=e.touches?e.touches[0]:e;
    return {x:clamp((t.clientX-r.left)/r.width,0,1),y:clamp((t.clientY-r.top)/r.height,0,1)};};
  const freq=p=>{const root=keyRoot();let f=mtof(root+24-p.y*24);
    if($('#thSnap').checked){const m=nearestScale(Math.round(ftom(f)),'major');f=mtof(m);}return f;};
  const start=e=>{e.preventDefault();ac();const p=pos(e),f=freq(p);
    const o=AU.ctx.createOscillator(),g=AU.ctx.createGain(),vib=AU.ctx.createOscillator(),vg=AU.ctx.createGain();
    o.type='sine';o.frequency.value=f;vib.frequency.value=5.5;vg.gain.value=f*.006;vib.connect(vg);vg.connect(o.frequency);
    g.gain.value=p.x*.5;o.connect(g);g.connect(AU.instBus);o.start();vib.start();
    thNodes={o,g,vib,p};dot.style.display='block';move(e);};
  const move=e=>{if(!thNodes)return;e.preventDefault();const p=pos(e),f=freq(p),t=AU.ctx.currentTime;
    thNodes.o.frequency.setTargetAtTime(f,t,.03);thNodes.g.gain.setTargetAtTime(.05+p.x*.45,t,.05);
    dot.style.left=(p.x*100)+'%';dot.style.top=(p.y*100)+'%';$('#thNote').textContent=noteName(f);};
  const end=()=>{if(!thNodes)return;const{o,g,vib}=thNodes,t=AU.ctx.currentTime;
    g.gain.setTargetAtTime(.0001,t,.08);setTimeout(()=>{try{o.stop();vib.stop();}catch(e){}},400);
    thNodes=null;dot.style.display='none';$('#thNote').textContent='–';};
  pad.addEventListener('pointerdown',start);pad.addEventListener('pointermove',move);
  pad.addEventListener('pointerup',end);pad.addEventListener('pointerleave',end);pad.addEventListener('pointercancel',end);
  $('#thRec').onclick=()=>{let t=armedTrack();if(!t||t.kind!=='theremin')t=addTrack('theremin');
    S.transport.armedTrack=t.id;go('studio');setTimeout(()=>toggleRec(),400);};}
function stopMotion(){ if(window._motCleanup){try{window._motCleanup();}catch(e){}window._motCleanup=null;} if(thNodes){try{thNodes.o.stop();}catch(e){}thNodes=null;} if(keyOsc){try{keyOsc.o.stop();keyOsc.o2.stop();}catch(e){}keyOsc=null;} }

/* ---- motion (tilt + camera) — the "i have no talent" instrument ---- */
function motionUI(el){
  el.innerHTML=`<div class="motionbox" id="motBox">
    <div style="font-size:40px">🤳</div>
    <p><b>The talent-optional instrument.</b><br><span class="fine">Move your phone — or just move. It only plays notes that fit the song.</span></p>
    <div class="row"><button class="primary" id="tiltBtn">📳 Tilt mode</button><button id="camBtn">📷 Camera mode</button></div>
    <div id="motNote" style="font-size:34px;font-weight:800;color:var(--acc)"></div>
    <canvas id="camView" width="160" height="120" class="hidden"></canvas>
    <button id="motStop" class="ghost hidden">Stop</button></div>
   <div class="row"><button class="primary" id="motRec" style="flex:1">⏺ Arm motion & record</button></div>`;
  $('#tiltBtn').onclick=startTilt; $('#camBtn').onclick=startCam;
  $('#motStop').onclick=stopMotion;
  $('#motRec').onclick=()=>{let t=armedTrack();if(!t||t.kind!=='motion')t=addTrack('motion');
    S.transport.armedTrack=t.id;go('studio');setTimeout(()=>toggleRec(),400);};}
let motOsc=null;
function motTone(m,vol){ac();const c=AU.ctx;
  if(!motOsc){const o=c.createOscillator(),g=c.createGain();o.type='triangle';o.connect(g);g.connect(AU.instBus);o.start();motOsc={o,g};}
  const t=c.currentTime;motOsc.o.frequency.setTargetAtTime(mtof(m),t,.05);motOsc.g.gain.setTargetAtTime(vol,t,.08);}
function motQuiet(){if(motOsc){const{o,g}=motOsc,t=AU.ctx.currentTime;g.gain.setTargetAtTime(.0001,t,.1);} }
async function startTilt(){ac();
  try{if(typeof DeviceOrientationEvent!=='undefined'&&DeviceOrientationEvent.requestPermission){await DeviceOrientationEvent.requestPermission();}}catch(e){}
  $('#motStop').classList.remove('hidden');$('#motNote').textContent='tilt me…';
  const root=keyRoot(),penta=SCALES.penta;
  const h=e=>{if(e.gamma==null)return;
    const idx=clamp(Math.round((e.gamma+45)/90*7),0,7);
    const m=root+penta[idx%5]+Math.floor(idx/5)*12;
    const vol=clamp(.15+Math.abs(e.beta||0)/90*.5,0,.6);
    motTone(m,vol);$('#motNote').textContent=NOTES[m%12];};
  window.addEventListener('deviceorientation',h);
  const old=window._motCleanup;window._motCleanup=()=>{window.removeEventListener('deviceorientation',h);motQuiet();$('#motStop').classList.add('hidden');$('#motNote').textContent='';if(old)old();};}
async function startCam(){ac();
  let stream;try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:320}}});}
  catch(e){toast('Camera unavailable');return;}
  const box=$('#motBox'),cv=$('#camView');cv.classList.remove('hidden');$('#motStop').classList.remove('hidden');
  const v=document.createElement('video');v.muted=true;v.playsInline=true;v.srcObject=stream;await v.play();
  const cx=cv.getContext('2d',{willReadFrequently:true});cx.drawImage(v,0,0,160,120);
  let prev=cx.getImageData(0,0,160,120),last=0,iv;
  const root=keyRoot(),penta=SCALES.penta;
  iv=setInterval(()=>{cx.drawImage(v,0,0,160,120);const cur=cx.getImageData(0,0,160,120);
    let diff=0;const a=prev.data,b=cur.data;for(let i=0;i<a.length;i+=16)diff+=Math.abs(a[i]-b[i]);
    diff/=(a.length/16*255);prev=cur;
    const bar=Math.min(1,diff*6);
    if(diff>.06&&Date.now()-last>320){last=Date.now();
      const m=root+penta[Math.floor(Math.random()*5)]+12;
      instPlay((c,d,t)=>{const o=c.createOscillator(),g=c.createGain();o.type='triangle';o.frequency.value=mtof(m);
        g.gain.setValueAtTime(.5,t);g.gain.exponentialRampToValueAtTime(.001,t+.5);o.connect(g);g.connect(d);o.start(t);o.stop(t+.55);});
      $('#motNote').textContent='✨ '+NOTES[m%12];}
  },120);
  const old=window._motCleanup;
  window._motCleanup=()=>{clearInterval(iv);stream.getTracks().forEach(t=>t.stop());cv.classList.add('hidden');$('#motStop').classList.add('hidden');$('#motNote').textContent='';if(old)old();};}

/* ============ WARM-UP ============ */
function renderWarmup(){const vc=$('#vibeChips');vc.innerHTML='';
  VIBES.forEach(v=>{const b=document.createElement('button');b.textContent=v.name;b.className=v.id===S.vibe.id?'on':'';
    b.onclick=()=>{S.vibe=v;saveLS();renderWarmup();};vc.appendChild(b);});
  const v=S.vibe;$('#briefName').textContent=v.name+' mode';
  $('#briefText').textContent=v.brief;
  $('#briefKey').textContent='Key of '+v.key;$('#briefBpm').textContent=v.bpm+' BPM';
  initCover();}
let coverDrawn=false;
function initCover(){const cv=$('#coverCanvas');if(cv._init)return;cv._init=true;
  const x=cv.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,300,300);
  const colors=['#0d0d12','#ff4d5e','#ffb020','#35d07f','#6cb8ff','#b48cff','#ff8c42','#7dd3fc','#ffffff'];
  let col=colors[1];const pal=$('#palette');pal.innerHTML='';
  colors.forEach(c=>{const b=document.createElement('button');b.className='swatch'+(c===col?' on':'');b.style.background=c;
    b.onclick=()=>{col=c;pal.querySelectorAll('.swatch').forEach(s=>s.classList.remove('on'));b.classList.add('on');};pal.appendChild(b);});
  let drawing=false,last=null;
  const p=e=>{const r=cv.getBoundingClientRect();const t=e.touches?e.touches[0]:e;
    return [(t.clientX-r.left)/r.width*300,(t.clientY-r.top)/r.height*300];};
  cv.addEventListener('pointerdown',e=>{e.preventDefault();drawing=true;last=p(e);coverDrawn=true;});
  cv.addEventListener('pointermove',e=>{if(!drawing)return;e.preventDefault();const q=p(e);
    x.strokeStyle=col;x.lineWidth=9;x.lineCap='round';x.beginPath();x.moveTo(...last);x.lineTo(...q);x.stroke();last=q;});
  ['pointerup','pointerleave','pointercancel'].forEach(ev=>cv.addEventListener(ev,()=>drawing=false));
  $('#coverClear').onclick=()=>{x.fillStyle='#fff';x.fillRect(0,0,300,300);coverDrawn=false;};
  $('#coverSave').onclick=()=>{S.transport.cover=cv.toDataURL('image/png');toast('🎨 Cover set — it\'ll hang on the session door');};
  $('#warmStart').onclick=()=>newSessionModal({vibe:S.vibe.id,name:''});}

/* ============ LESSONS ============ */
let lessonCleanup=null;
const LESSONS=[
 {id:'key',tag:'HARMONY 101',title:'Find the key together',body:'Before anyone plays a note, hum the home note together. If everyone can find this one note, you already sound like a band. Tap start, hum along — the needle shows how close you are.',
  build(el){pitchMeter(el,{target:keyRoot(),hint:'Hum until the needle parks in the green. That note is home.'});}},
 {id:'count',tag:'TIMING',title:'The mighty 1-2-3-4',body:'Great bands breathe together. Tap the big button exactly on each click. Don\'t think — feel it. 8 taps, then we score you (kindly).',
  build(el){clapGame(el);}},
 {id:'call',tag:'LISTENING',title:'Call & response',body:'Music is conversation. The app sings a little 4-note phrase — you sing it back on the buttons. Wrong notes are just jazz.',
  build(el){callResponse(el);}},
 {id:'stack',tag:'HARMONY 102',title:'Stack a harmony',body:'One person holds the home note (the drone). You sing ABOVE it — aim for the sparkly notes: the 3rd or the 5th. The meter tells you when you land one.',
  build(el){harmonyStack(el);}},
 {id:'fx',tag:'PRODUCER BRAIN',title:'Seasoning: FX',body:'Record 3 seconds of anything — your voice, a clap, a sneeze. Then drag the sliders and hear it turn into a record. Auto-tune is just confidence you can download.',
  build(el){fxPlayground(el);}},
];
function renderLessons(){const l=$('#lessonList');l.innerHTML='';
  LESSONS.forEach(ls=>{const d=document.createElement('div');d.className='lesson';
    d.innerHTML=`<div class="tag">${ls.tag}</div><h3>${ls.title}</h3><p>${ls.body.split('.')[0]}.</p>`;
    d.onclick=()=>openLesson(ls);l.appendChild(d);});
  $('#lessonList').classList.remove('hidden');$('#lessonDetail').classList.add('hidden');}
function openLesson(ls){if(lessonCleanup){lessonCleanup();lessonCleanup=null;}
  $('#lessonList').classList.add('hidden');$('#lessonDetail').classList.remove('hidden');
  const b=$('#lessonBody');b.innerHTML=`<div class="tag">${ls.tag}</div><h3>${ls.title}</h3><p>${ls.body}</p><div id="lw"></div>`;
  ls.build($('#lw'));
  lessonCleanup=()=>{const w=$('#lw');if(w&&w._cleanup)w._cleanup();};}
$('#lessonBack').onclick=()=>{if(lessonCleanup){lessonCleanup();lessonCleanup=null;}renderLessons();};

function pitchMeter(el,{target,hint}){el.innerHTML=`<div class="meter"><div class="zone" id="pmZ"></div><div class="needle" id="pmN"></div><div class="nlabel" id="pmT">—</div></div>
  <button class="primary" id="pmS">🎤 Start mic</button><p class="fine" id="pmH">${hint||''}</p>`;
  const zone=$('#pmZ');zone.style.left='40%';zone.style.width='20%';
  $('#pmS').onclick=async()=>{ac();$('#pmS').classList.add('hidden');
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    const src=AU.ctx.createMediaStreamSource(stream),an=AU.ctx.createAnalyser();an.fftSize=2048;src.connect(an);
    const iv=setInterval(()=>{const f=detectPitch(an),nd=$('#pmN'),t=$('#pmT');if(!nd)return;
      if(!f){t.textContent='…make a sound!';return;}
      const m=ftom(f),ref=target!=null?target:nearestScale(Math.round(m),'major'),cents=(m-ref)*100;
      nd.style.left=clamp(50+cents*.7,4,96)+'%';
      const nm=noteName(f);
      t.textContent=target!=null?`${nm} — ${Math.abs(cents)<15?'LOCKED IN ✓':cents>0?Math.round(cents)+'¢ sharp ↓':' '+Math.round(-cents)+'¢ flat ↑'}`:nm+(Math.abs(cents)>5?(cents>0?' ↑':' ↓'):' ✓');
      $('#pmH').textContent=target!=null?(Math.abs(cents)<15?'That\'s it — hold it! Feel that? That\'s home.':hint||''):'';},90);
    el._cleanup=()=>{clearInterval(iv);stream.getTracks().forEach(t=>t.stop());};};}
function clapGame(el){el.innerHTML=`<button class="bigTap" id="cgTap" disabled>TAP</button><div class="score" id="cgScore">press start</div>
  <button class="primary" id="cgStart" style="width:100%">Start (8 clicks)</button><p class="fine" id="cgFeed"></p>`;
  $('#cgStart').onclick=()=>{ac();$('#cgStart').classList.add('hidden');$('#cgTap').disabled=false;
    const beat=.6,t0=AU.ctx.currentTime+.15;let n=0,hits=[];
    const iv=setInterval(()=>{if(n>=8){clearInterval(iv);$('#cgTap').disabled=true;
        const good=hits.filter(h=>h<.09).length;$('#cgScore').textContent=good+'/8 locked in';
        $('#cgFeed').textContent=good>=7?'🔒 Certified pocket. The band fears you.':good>=4?'Solid! A couple drifted — breathe with the click.':'The click is your friend. Try feeling it in your chest, not your brain.';return;}
      click(AU.ctx.currentTime+.02,n===0);n++;},beat*1000);
    $('#cgTap').onclick=()=>{const now=AU.ctx.currentTime,ph=(now-t0)%beat,err=Math.min(ph,beat-ph);hits.push(err);
      $('#cgScore').textContent=err<.09?'✓ nice':err<.18?'~ close':'✗ drift';};};}
function callResponse(el){const deg=[0,4,7,12],names=['1','3','5','8'];
  let phrase=[],guess=[],playing=false;
  el.innerHTML=`<div class="row" style="justify-content:center;gap:10px" id="crBtns">${deg.map((d,i)=>`<button class="bigTap" style="width:64px;height:64px;font-size:20px" data-i="${i}">${names[i]}</button>`).join('')}</div>
  <div class="row"><button class="primary" id="crPlay" style="flex:1">▶ Hear the phrase</button><button class="ghost" id="crNew">New phrase</button></div><p class="score" id="crFeed"></p>`;
  const playNote=(m,t)=>{const c=AU.ctx,o=c.createOscillator(),g=c.createGain();o.type='triangle';o.frequency.value=mtof(m);
    g.gain.setValueAtTime(.4,t);g.gain.exponentialRampToValueAtTime(.001,t+.4);o.connect(g);g.connect(AU.instBus);o.start(t);o.stop(t+.45);};
  const newPhrase=()=>{phrase=[0,1,2,3].map(()=>Math.floor(Math.random()*4));guess=[];$('#crFeed').textContent='';};
  const play=()=>{if(playing)return;playing=true;ac();const root=keyRoot(),t0=AU.ctx.currentTime+.1;
    phrase.forEach((d,i)=>playNote(root+deg[d],t0+i*.45));setTimeout(()=>playing=false,phrase.length*450+200);};
  newPhrase();$('#crPlay').onclick=play;$('#crNew').onclick=newPhrase;
  el.querySelectorAll('#crBtns button').forEach(b=>b.onclick=()=>{ac();const i=+b.dataset.i;playNote(keyRoot()+deg[i],AU.ctx.currentTime);
    guess.push(i);b.classList.add('hit');setTimeout(()=>b.classList.remove('hit'),150);
    if(guess.length===phrase.length){const ok=guess.every((g,j)=>g===phrase[j]);
      $('#crFeed').textContent=ok?'🎯 Nailed it!':'🎷 Close — hit “hear the phrase” and try again';guess=[];}});}
function harmonyStack(el){el.innerHTML=`<button class="primary" id="hsDrone" style="width:100%">🎹 Hold the home note (drone)</button>
  <div class="meter"><div class="zone" id="hsZ"></div><div class="needle" id="hsN"></div><div class="nlabel" id="hsT">—</div></div>
  <button class="primary hidden" id="hsMic">🎤 Sing over it</button><p class="fine" id="hsH">One friend holds the drone. You aim for the sparkly notes.</p>`;
  let drone=null;
  $('#hsDrone').onclick=e=>{ac();
    if(drone){drone.forEach(o=>{try{o.stop()}catch(x){}});drone=null;e.target.textContent='🎹 Hold the home note (drone)';return;}
    const c=AU.ctx,r=mtof(keyRoot()-12);drone=[-4,4].map(dt=>{const o=c.createOscillator(),g=c.createGain();
      o.type='sawtooth';o.frequency.value=r;o.detune.value=dt;g.gain.value=.05;o.connect(g);g.connect(AU.instBus);o.start();return o;});
    e.target.textContent='⏸ Stop drone';$('#hsMic').classList.remove('hidden');};
  $('#hsMic').onclick=async()=>{ac();$('#hsMic').classList.add('hidden');
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    const src=AU.ctx.createMediaStreamSource(stream),an=AU.ctx.createAnalyser();an.fftSize=2048;src.connect(an);
    const root=keyRoot(),zone=$('#hsZ');
    const iv=setInterval(()=>{const f=detectPitch(an);if(!f)return;const st=Math.round((ftom(f)-root)%12+12)%12;
      $('#hsT').textContent=noteName(f);
      const targets={4:'the 3rd 🎶',7:'the 5th ✨',0:'home (octave up!)',12:'home (octave up!)'};
      const near=Object.keys(targets).some(k=>Math.abs(st-k)<=0|| (k==12&&st==0));
      const good=[0,4,7].some(k=>{const d=Math.min(Math.abs(st-k),12-Math.abs(st-k));return d===0;});
      $('#hsN').style.left=(8+st/12*84)+'%';
      zone.style.left=(8+4/12*84-8)+'%';zone.style.width='16%';
      $('#hsH').textContent=good?('🎯 THAT\'S '+targets[st===0?0:st].toUpperCase()+' — hold it!'):'Slide around… the sparkly notes are the 3rd and the 5th.';},100);
    el._cleanup=()=>{clearInterval(iv);stream.getTracks().forEach(t=>t.stop());if(drone){drone.forEach(o=>{try{o.stop()}catch(x){}});drone=null;}};};}
function fxPlayground(el){el.innerHTML=`<button class="bigTap" id="fxRec">HOLD<br>3s</button>
  <div class="fx"><label>🎯 Auto-tune<input type="range" id="fxT" min="0" max="1" step="0.01" value="0.5"></label>
  <label>🌀 Echo<input type="range" id="fxE" min="0" max="1" step="0.01" value="0.3"></label>
  <label>🏛️ Reverb<input type="range" id="fxV" min="0" max="1" step="0.01" value="0.4"></label></div>
  <button class="primary hidden" id="fxPlay" style="width:100%;margin-top:8px">▶ Hear it seasoned</button>`;
  let buf=null;
  const rec=$('#fxRec');
  const down=async e=>{e.preventDefault();ac();
    try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mr=new MediaRecorder(stream),ch=[];mr.ondataavailable=x=>{if(x.data.size)ch.push(x.data);};
      mr.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());
        const ab=await new Blob(ch).arrayBuffer();buf=await AU.ctx.decodeAudioData(ab);$('#fxPlay').classList.remove('hidden');toast('Got it ✓');};
      mr.start();setTimeout(()=>mr.state!=='inactive'&&mr.stop(),3000);
    }catch(err){toast('Mic unavailable');}};
  rec.addEventListener('pointerdown',down);
  $('#fxPlay').onclick=async()=>{if(!buf)return;ac();
    const sr=44100,oc=new OfflineAudioContext(2,Math.ceil(sr*(buf.duration+.5)),sr);
    const t={tune:+$('#fxT').value,echo:+$('#fxE').value,verb:+$('#fxV').value,gain:.9,mute:false};
    const ch=buildTrackChain(oc,t,S.transport.bpm);ch.out.connect(oc.destination);
    const src=oc.createBufferSource();src.buffer=buf;src.connect(ch.input);
    // push a little pitch correction toward key for demo
    ch.setTune(0,t.tune);src.start();
    const out=await oc.startRendering();const s=AU.ctx.createBufferSource();s.buffer=out;s.connect(AU.music);s.start();};}

/* ============ PROFILE ============ */
function renderProfile(){$('#nameInput').value=S.me.name||'';$('#bioInput').value=S.me.bio||'';
  const pv=$('#photoPrev');
  if(S.me.photo){pv.src=S.me.photo;}else{pv.src=initialAvatar(S.me.name||'?');}
  const demos=JSON.parse(localStorage.getItem('mm_demos')||'[]');
  $('#demoList').innerHTML=demos.length?demos.map(d=>`<div class="kv"><span>🎵 ${esc(d.name)}</span><span class="fine">${new Date(d.ts).toLocaleDateString()}</span></div>`).join(''):'<p class="fine">Nothing exported yet.</p>';
  renderPresence();}
function initialAvatar(name){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');
  const h=[...name].reduce((a,c2)=>a+c2.charCodeAt(0),0);x.fillStyle=`hsl(${h%360},60%,38%)`;x.fillRect(0,0,128,128);
  x.fillStyle='#fff';x.font='bold 56px sans-serif';x.textAlign='center';x.textBaseline='middle';
  x.fillText((name.trim()[0]||'?').toUpperCase(),64,68);return c.toDataURL();}

/* ============ INIT ============ */
function init(){
  loadLS();
  $('#bpm').oninput=e=>{S.transport.bpm=+e.target.value;$('#bpmVal').textContent=e.target.value;};
  $('#metroChk').onchange=e=>S.transport.metro=e.target.checked;
  $('#loopChk').onchange=e=>S.transport.loop=e.target.checked;
  $('#playBtn').onclick=togglePlay;$('#recBtn').onclick=toggleRec;
  $('#countBtn').onclick=()=>countIn(()=>toast('…and you\'re in! Pocket = locked 🔒'));
  $('#addTrackBtn').onclick=addTrackModal;
  $('#exportBtn').onclick=exportDemo;$('#saveProjBtn').onclick=saveProject;
  $('#leaveSess').onclick=leaveSession;$('#goLobbyBtn').onclick=()=>go('lobby');
  $('#newSessionBtn').onclick=()=>newSessionModal();
  $('#spitSend').onclick=sendSpit;
  $('#spitInput').addEventListener('keydown',e=>{if(e.key==='Enter')sendSpit();});
  $$('#scopeSeg button').forEach(b=>b.onclick=()=>{S.scopeView=b.dataset.v;$$('#scopeSeg button').forEach(x=>x.classList.toggle('on',x===b));});
  $('#saveProfile').onclick=()=>{S.me.name=$('#nameInput').value.trim()||'Guest';S.me.bio=$('#bioInput').value.trim();
    saveLS();fbProfileWrite();renderPresence();toast('Profile saved ✓');};
  $('#avatarBtn').onclick=()=>{S.me.photo='';renderProfile();toast('Initials avatar on');};
  $('#photoInput').onchange=e=>{const f=e.target.files[0];if(!f)return;const img=new Image();
    img.onload=()=>{const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');
      const s=Math.min(img.width,img.height);x.drawImage(img,(img.width-s)/2,(img.height-s)/2,s,s,0,0,128,128);
      S.me.photo=c.toDataURL('image/jpeg',.8);$('#photoPrev').src=S.me.photo;URL.revokeObjectURL(img.src);};
    img.src=URL.createObjectURL(f);};
  if(!S.me.name){setTimeout(()=>{if(!S.me.name)toast('👋 Set your name on the Me tab!');},1500);}
  initFirebase();go('lobby');
}
document.addEventListener('DOMContentLoaded',init);
