import { NorFabric, CapabilityPolicy, IPCBus, ProcessManager, bytesToHex, hexToBytes } from "./core.js";
import { buildAppCatalog } from "./apps.js";

const $ = s => document.querySelector(s);
const desktop = $("#desktop");
const wmLayer = $("#windows");
const dock = $("#dock");
const trace = [];
let zCounter = 20;
let focusedPid = null;
let schedulerTimer = null;
let drawT = 0;

const fabric = new NorFabric(128);
const policy = new CapabilityPolicy();
const ipc = new IPCBus(log);
const pm = new ProcessManager({ fabric, policy, ipc, trace: log });
const catalog = buildAppCatalog();

const defaultSeed = new Uint8Array([0x74,0x2D,0x91,0xC6,0x38,0xA5,0x5A,0xE1,0x33,0x0F,0xC0,0x55,0xA9,0x16,0x7B,0xD2]);

function log(message){
  trace.push(`${new Date().toLocaleTimeString()} · ${message}`);
  if(trace.length>160) trace.shift();
  refreshMonitorWindows();
}

function boot(bytes){
  fabric.setBytes(bytes);
  $("#bootSeed").value = bytesToHex(bytes);
  $("#bootPanel").classList.add("hidden");
  localStorage.setItem("vbsos.bootseed", bytesToHex(bytes));
  log("boot state fabric");
  spawn("monitor");
  spawn("world");
  startScheduler();
  renderDock();
  updateSystemBadges();
}

function startScheduler(){
  if(schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = setInterval(()=>{
    const p = pm.tick();
    if(p && p.type === "monitor") refreshWindow(p.pid);
    updateSystemBadges();
  }, 140);
}

function appById(id){ return catalog.find(a=>a.id===id); }

function spawn(appId){
  const desc = appById(appId);
  if(!desc) return null;
  const p = pm.spawn(desc);
  createWindow(p);
  renderDock();
  focusWindow(p.pid);
  return p;
}

function findRunning(appId){
  return pm.list().find(p=>p.appId===appId);
}

function openApp(appId){
  const running = findRunning(appId);
  if(running){ focusWindow(running.pid); return; }
  spawn(appId);
}

function kill(pid){
  const win = document.querySelector(`[data-pid="${pid}"]`);
  win?.remove();
  pm.kill(pid);
  if(focusedPid===pid) focusedPid=null;
  renderDock();
  updateSystemBadges();
}

function minimize(pid){
  const p=pm.get(pid); if(!p)return;
  p.window.minimized=true;
  document.querySelector(`[data-pid="${pid}"]`)?.classList.add("hidden");
  renderDock();
}

function restore(pid){
  const p=pm.get(pid); if(!p)return;
  p.window.minimized=false;
  const el=document.querySelector(`[data-pid="${pid}"]`);
  el?.classList.remove("hidden");
  focusWindow(pid);
}

function focusWindow(pid){
  focusedPid=pid;
  document.querySelectorAll(".window").forEach(w=>w.classList.remove("focused"));
  const el=document.querySelector(`[data-pid="${pid}"]`);
  if(!el)return;
  el.classList.add("focused");
  el.style.zIndex=String(++zCounter);
}

function createWindow(p){
  const el=document.createElement("section");
  el.className="window";
  el.dataset.pid=p.pid;
  el.style.left=`${p.window.x}px`;
  el.style.top=`${p.window.y}px`;
  el.style.width=`min(${p.window.w}px, calc(100vw - 24px))`;
  el.style.height=`min(${p.window.h}px, calc(100% - 24px))`;
  el.style.zIndex=String(++zCounter);
  el.innerHTML=`
    <div class="titlebar">
      <div class="titleleft"><span>${p.icon}</span><span>${escapeHtml(p.name)}</span><span class="muted small">pid ${p.pid}</span></div>
      <div class="windowControls"><button data-min>—</button><button data-close>×</button></div>
    </div>
    <div class="content"></div>`;
  wmLayer.appendChild(el);
  el.addEventListener("pointerdown",()=>focusWindow(p.pid));
  el.querySelector("[data-close]").onclick=e=>{e.stopPropagation();kill(p.pid)};
  el.querySelector("[data-min]").onclick=e=>{e.stopPropagation();minimize(p.pid)};
  makeDraggable(el,p);
  refreshWindow(p.pid);
}

function makeDraggable(el,p){
  const bar=el.querySelector(".titlebar");
  let drag=null;
  bar.addEventListener("pointerdown",e=>{
    if(e.target.closest("button"))return;
    e.preventDefault(); focusWindow(p.pid);
    const rect=el.getBoundingClientRect();
    const desk=desktop.getBoundingClientRect();
    drag={dx:e.clientX-rect.left,dy:e.clientY-rect.top,desk};
    bar.setPointerCapture?.(e.pointerId);
  });
  bar.addEventListener("pointermove",e=>{
    if(!drag)return;
    const x=Math.max(0,Math.min(drag.desk.width-el.offsetWidth,e.clientX-drag.desk.left-drag.dx));
    const y=Math.max(0,Math.min(drag.desk.height-el.offsetHeight,e.clientY-drag.desk.top-drag.dy));
    p.window.x=x;p.window.y=y;el.style.left=`${x}px`;el.style.top=`${y}px`;
  });
  ["pointerup","pointercancel"].forEach(type=>bar.addEventListener(type,()=>drag=null));
}

function refreshWindow(pid){
  const p=pm.get(pid); if(!p)return;
  const root=document.querySelector(`[data-pid="${pid}"] .content`); if(!root)return;
  const renderer = renderers[p.type];
  if(renderer) renderer(p,root);
}

function refreshMonitorWindows(){
  pm.list().filter(p=>p.type==="monitor").forEach(p=>refreshWindow(p.pid));
}

function renderDock(){
  dock.innerHTML=catalog.map(app=>{
    const p=findRunning(app.id);
    return `<button class="appIcon ${p?"running":""}" data-app="${app.id}" title="${escapeHtml(app.name)}">${app.icon}</button>`;
  }).join("");
  dock.querySelectorAll("[data-app]").forEach(btn=>btn.onclick=()=>{
    const appId=btn.dataset.app;
    const p=findRunning(appId);
    if(p?.window.minimized) restore(p.pid); else openApp(appId);
  });
}

function updateSystemBadges(){
  $("#procCount").textContent=`${pm.list().length} proc`;
  $("#fabricBadge").textContent=`${fabric.registerCount} bits`;
  $("#gateBadge").textContent=`${fabric.gates.length} NOR`;
}

function can(p, capability){ return policy.allows(p.pid,capability); }
function writeBit(p,index,value){
  if(!can(p,"fabric:write")){log(`denied pid ${p.pid} fabric:write`);return false}
  fabric.setRegister(index,value); return true;
}
function toggleBit(p,index){
  if(!can(p,"fabric:write")){log(`denied pid ${p.pid} fabric:write`);return false}
  fabric.toggle(index); return true;
}
function send(p,to,type,payload={}){
  if(!can(p,"ipc")){log(`denied pid ${p.pid} ipc`);return false}
  return ipc.send(p.pid,to,type,payload);
}

const MAZE=[
"#######",
"#.....#",
"#.###.#",
"#...#.#",
"###.#.#",
"#.....#",
"#######"
];

const renderers = {
  world(p,root){
    root.innerHTML=`
      <div class="stack">
        <div class="grid two">
          <div class="card"><div class="sectionTitle">Process projection</div><div class="kpi">${p.state.collected.length}/2</div><div class="muted small">cores collected</div></div>
          <div class="card"><div class="sectionTitle">Shared fabric</div><div class="kpi">${fabric.getRegister(96)?"ON":"OFF"}</div><div class="muted small">world-complete bit 96</div></div>
        </div>
        <div class="grid two">
          <div class="card"><div class="maze" data-maze></div></div>
          <div class="card stack"><div class="sectionTitle">Touch controls</div>
            <div class="touchpad">
              <span></span><button data-move="up">▲</button><span></span>
              <button data-move="left">◀</button><button data-move="down">▼</button><button data-move="right">▶</button>
            </div>
            <button data-send-booking>Broadcast WORLD state</button>
            <div class="muted small">Actions modify this process state and selected shared fabric bits.</div>
          </div>
        </div>
      </div>`;
    drawMaze(p,root.querySelector("[data-maze]"));
    root.querySelectorAll("[data-move]").forEach(b=>b.onclick=()=>worldMove(p,b.dataset.move));
    root.querySelector("[data-send-booking]").onclick=()=>{
      ipc.broadcast(p.pid,pm.list().map(x=>x.pid),"WORLD_STATUS",{collected:p.state.collected.length,completed:p.state.completed});
    };
  },

  booking(p,root){
    const times=["09:00","10:30","12:00","14:00"];
    root.innerHTML=`
      <div class="stack">
        <div class="grid two">
          <div class="card"><div class="sectionTitle">Bookings</div><div class="kpi">${p.state.slots.filter(Boolean).length}/4</div></div>
          <div class="card"><div class="sectionTitle">IPC messages</div><div class="kpi">${p.state.messageCount||0}</div></div>
        </div>
        <div class="grid two">
          ${times.map((t,i)=>`<button class="slot ${p.state.slots[i]?"active":""}" data-slot="${i}"><b>${t}</b><div class="muted small">${p.state.slots[i]?"reserved":"open"}</div></button>`).join("")}
        </div>
        <div class="card small muted">${p.state.lastMessage?`Last message: ${escapeHtml(p.state.lastMessage.type)} from pid ${p.state.lastMessage.from}`:"No IPC received yet."}</div>
      </div>`;
    root.querySelectorAll("[data-slot]").forEach(b=>b.onclick=()=>{
      const i=Number(b.dataset.slot);p.state.slots[i]=p.state.slots[i]?0:1;p.state.changes++;
      writeBit(p,64+i,p.state.slots[i]);log(`booking pid ${p.pid} slot ${i}=${p.state.slots[i]}`);refreshWindow(p.pid);
    });
  },

  course(p,root){
    const lessons=["Seed as boot state","NOR state fabric","Processes as projections","Capabilities and trace"];
    const progress=Math.round((p.state.lesson/(lessons.length-1))*100);
    root.innerHTML=`
      <div class="stack">
        <div class="card"><div class="sectionTitle">Lesson ${p.state.lesson+1}/${lessons.length}</div><h2>${lessons[p.state.lesson]}</h2>
          <p class="muted">${courseBody[p.state.lesson]}</p><div class="progress"><div style="width:${progress}%"></div></div></div>
        <div class="row"><button data-prev>Previous</button><button data-next>Next</button><button data-complete>Mark complete</button></div>
        <div class="card"><div class="sectionTitle">Shared completion bit</div><div class="kpi">${fabric.getRegister(88)}</div></div>
      </div>`;
    root.querySelector("[data-prev]").onclick=()=>{p.state.lesson=Math.max(0,p.state.lesson-1);refreshWindow(p.pid)};
    root.querySelector("[data-next]").onclick=()=>{p.state.lesson=Math.min(lessons.length-1,p.state.lesson+1);refreshWindow(p.pid)};
    root.querySelector("[data-complete]").onclick=()=>{p.state.completed=true;writeBit(p,88,1);log(`course pid ${p.pid} completed`);refreshWindow(p.pid)};
  },

  control(p,root){
    root.innerHTML=`
      <div class="stack">
        <div class="sectionTitle">Direct shared-fabric channels</div>
        ${p.state.channels.map((v,i)=>`<button class="channel" data-channel="${i}"><span>Channel ${i+1} · bit ${104+i}</span><span class="led ${v?"on":""}"></span></button>`).join("")}
        <button data-broadcast>Broadcast control pulse</button>
      </div>`;
    root.querySelectorAll("[data-channel]").forEach(b=>b.onclick=()=>{
      const i=Number(b.dataset.channel);p.state.channels[i]=p.state.channels[i]?0:1;writeBit(p,104+i,p.state.channels[i]);refreshWindow(p.pid);
    });
    root.querySelector("[data-broadcast]").onclick=()=>ipc.broadcast(p.pid,pm.list().map(x=>x.pid),"CONTROL_PULSE",{at:Date.now()});
  },

  monitor(p,root){
    const processes=pm.list();
    root.innerHTML=`
      <div class="stack">
        <div class="grid three">
          <div class="card"><div class="sectionTitle">Processes</div><div class="kpi">${processes.length}</div></div>
          <div class="card"><div class="sectionTitle">Registers</div><div class="kpi">${fabric.registerCount}</div></div>
          <div class="card"><div class="sectionTitle">NOR gates</div><div class="kpi">${fabric.gates.length}</div></div>
        </div>
        <div class="card"><div class="sectionTitle">Process table</div>
          ${processes.map(x=>`<div class="proc"><b>${x.pid}</b><span>${escapeHtml(x.name)}</span><span>${x.cpu}% cpu</span><button data-focus="${x.pid}">focus</button></div>`).join("")}
        </div>
        <div class="card"><div class="sectionTitle">Fabric bits 0–63</div><div class="bitgrid">
          ${fabric.snapshot(0,64).map((v,i)=>`<div class="bit ${v?"on":""}" data-bit="${i}">${i}</div>`).join("")}
        </div></div>
        <div class="card"><div class="sectionTitle">Trace</div><div class="trace">${trace.slice().reverse().map(x=>`<div>${escapeHtml(x)}</div>`).join("")}</div></div>
      </div>`;
    root.querySelectorAll("[data-focus]").forEach(b=>b.onclick=()=>focusWindow(Number(b.dataset.focus)));
    root.querySelectorAll("[data-bit]").forEach(b=>b.onclick=()=>{
      toggleBit(p,Number(b.dataset.bit));
    });
  }
};

const courseBody=[
  "The boot seed initializes the same state fabric every process sees. It is data, not executable code.",
  "Each state register is modeled as a cross-coupled NOR latch. NOR is the low-level storage/computation primitive.",
  "An app is a process descriptor plus a projection renderer. Multiple processes run concurrently against one shared fabric.",
  "Processes request capabilities. The policy decides whether they may write the fabric, use IPC, store locally, or accept touch input."
];

function drawMaze(p,el){
  if(!el)return;
  const cores=[[3,1],[1,5]];
  el.innerHTML="";
  for(let y=0;y<7;y++)for(let x=0;x<7;x++){
    const d=document.createElement("div");
    d.className=MAZE[y][x]==="#"?"wall":"floor";
    if(x===p.state.x&&y===p.state.y){d.className="you";d.textContent="●"}
    else {
      const ci=cores.findIndex(([cx,cy])=>cx===x&&cy===y);
      if(ci>=0&&!p.state.collected.includes(ci)){d.className+=" core";d.textContent="◆"}
      else if(x===5&&y===5){d.className+=" exit";d.textContent=p.state.collected.length===2?"▣":"□"}
    }
    el.appendChild(d);
  }
}

function worldMove(p,dir){
  const delta={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]}[dir];
  const [dx,dy]=delta;const nx=p.state.x+dx,ny=p.state.y+dy;
  toggleBit(p,{up:16,left:17,down:18,right:19}[dir]);
  if(MAZE[ny]?.[nx]==="."){p.state.x=nx;p.state.y=ny}
  [[3,1],[1,5]].forEach(([cx,cy],i)=>{if(nx===cx&&ny===cy&&!p.state.collected.includes(i)){p.state.collected.push(i);log(`world pid ${p.pid} collected core ${i}`)}});
  if(nx===5&&ny===5&&p.state.collected.length===2){p.state.completed=true;writeBit(p,96,1);log(`world pid ${p.pid} complete`)};
  refreshWindow(p.pid);
}

function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}

$("#bootBtn").onclick=()=>{
  try{boot(hexToBytes($("#bootSeed").value,16))}catch(e){alert(e.message)}
};
$("#randomBoot").onclick=()=>{
  const b=new Uint8Array(16);crypto.getRandomValues(b);$("#bootSeed").value=bytesToHex(b);
};
$("#bootSeed").value=localStorage.getItem("vbsos.bootseed")||bytesToHex(defaultSeed);

const bg=$("#wallpaperCanvas"),bgctx=bg.getContext("2d");
function bgDraw(now){
  const r=bg.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.5),W=Math.floor(r.width*dpr),H=Math.floor(r.height*dpr);
  if(bg.width!==W||bg.height!==H){bg.width=W;bg.height=H}
  drawT=now/1000;
  bgctx.clearRect(0,0,W,H);
  const pts=[];
  for(let i=0;i<20;i++){
    const a=i/20*Math.PI*2+drawT*.025,rr=(.19+(i%5)*.028)*Math.min(W,H);
    pts.push({x:W*.5+Math.cos(a)*rr,y:H*.46+Math.sin(a)*rr*.72,on:fabric.getRegister(i)});
  }
  for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){
    if(((i+j)%6)!==0)continue;bgctx.strokeStyle="rgba(120,231,255,.035)";bgctx.lineWidth=dpr;
    bgctx.beginPath();bgctx.moveTo(pts[i].x,pts[i].y);bgctx.lineTo(pts[j].x,pts[j].y);bgctx.stroke();
  }
  for(const p of pts){bgctx.fillStyle=p.on?"rgba(120,231,255,.5)":"rgba(155,132,255,.2)";bgctx.beginPath();bgctx.arc(p.x,p.y,(p.on?4:2)*dpr,0,Math.PI*2);bgctx.fill()}
  requestAnimationFrame(bgDraw);
}
requestAnimationFrame(bgDraw);
