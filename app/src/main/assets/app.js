
(() => {
"use strict";
const $=s=>document.querySelector(s);
const STORAGE_KEY="workclock-v4";
const PREVIOUS_KEYS=["workclock-v3","workclock-prototype-v1"];
const HOLD_MS=1200;
const HOLD_MOVE_PX=10;
const OSRM_ENDPOINT="https://router.project-osrm.org/route/v1/driving/";
const DEFAULT_SETTINGS={automationDays:[1,2,3,4,5],startFrom:"05:00",startUntil:"11:30",finishFrom:"13:00",finishUntil:"21:00",defaultRadius:150,routingProvider:"osrm",orsKey:""};
let state=loadState();
let currentPosition=null,editingLocationId=null,timerInterval=null;
let pendingProjectAction=null;
let manualEditDayId=null;
let manualSegmentDraft=[];
let manualOriginalTimestamps=null;
const activeHoldCancels=new Set();
window.addEventListener("scroll",()=>{for(const cancel of [...activeHoldCancels])cancel();},{passive:true});

function uid(prefix="id"){if(globalThis.crypto?.randomUUID)return `${prefix}-${crypto.randomUUID()}`;return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`}
function nowISO(){return new Date().toISOString()}
function deepCopy(x){return JSON.parse(JSON.stringify(x))}
function localDateKey(d=new Date()){const p=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`}
function localDateTime(dateStr,timeStr){if(!dateStr||!timeStr)return null;const [y,m,d]=dateStr.split("-").map(Number),[hh,mm]=timeStr.split(":").map(Number),x=new Date(y,m-1,d,hh,mm,0,0);return Number.isFinite(x.getTime())?x:null}
function timeValue(v){if(!v)return "";const d=v instanceof Date?v:new Date(v),p=n=>String(n).padStart(2,"0");return `${p(d.getHours())}:${p(d.getMinutes())}`}
function parseTime(s){const [h,m]=String(s).split(":").map(Number);return h*60+m}
function minutesOfDay(d=new Date()){return d.getHours()*60+d.getMinutes()}
function inWindow(date,from,to){const n=minutesOfDay(date),a=parseTime(from),b=parseTime(to);return n>=a&&n<=b}
function fmtTime(v){if(!v)return "—";const d=v instanceof Date?v:new Date(v);return d.toLocaleTimeString(undefined, {hour:"2-digit",minute:"2-digit",hourCycle:"h23"})}
function fmtDate(v){const d=v instanceof Date?v:new Date(v);return d.toLocaleDateString([], {weekday:"short",day:"numeric",month:"short",year:"numeric"})}
function fmtDuration(ms){ms=Math.max(0,Number(ms)||0);const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000);return `${h}h ${String(m).padStart(2,"0")}m`}
function fmtTimer(ms){ms=Math.max(0,Number(ms)||0);const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000),s=Math.floor((ms%60000)/1000);return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`}
function esc(x){return String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}

function newState(){return {version:4,locations:[],projects:[],routeCache:{},currentDay:null,history:[],presence:{currentId:null,currentType:null,currentName:null,changedAt:null,source:null,lastHomeId:null,lastWorkId:null},settings:deepCopy(DEFAULT_SETTINGS)}}
function validLocation(x){return x&&["home","work"].includes(x.type)&&Number.isFinite(Number(x.lat))&&Number.isFinite(Number(x.lon))}
function normalizeSegment(s,fallbackStart=null,fallbackStop=null,legacyName="Unspecified project (legacy)"){if(!s&&!(fallbackStart&&fallbackStop))return null;const start=s?.start||fallbackStart,stop=s?.stop||fallbackStop;if(!start||!stop)return null;return {id:s?.id||uid("seg"),start,stop,projectId:s?.projectId||null,projectName:String(s?.projectName||s?.name||legacyName).trim()||legacyName,createdAt:s?.createdAt||nowISO()}}
function normalizeDay(d){if(!d||typeof d!=="object")return null;const day={id:d.id||uid("day"),date:d.date||localDateKey(d.start?new Date(d.start):new Date()),start:d.start||null,stop:d.stop||null,breakMin:Number(d.breakMin)||0,startSource:d.startSource||null,stopSource:d.stopSource||null,status:d.status||"draft",commuteOut:d.commuteOut||null,commuteBack:d.commuteBack||null,workplaceId:d.workplaceId||null,startHomeId:d.startHomeId||null,endHomeId:d.endHomeId||null,manuallyAdded:!!d.manuallyAdded,createdAt:d.createdAt||d.addedAt||nowISO(),segments:[]};if(Array.isArray(d.segments)&&d.segments.length)day.segments=d.segments.map(x=>normalizeSegment(x)).filter(Boolean);else if(day.start&&day.stop)day.segments=[normalizeSegment(null,day.start,day.stop)];return day}
function migrateOld(old){const n=newState();if(!old||typeof old!=="object")return n;if(Array.isArray(old.locations))n.locations=old.locations.filter(validLocation).map(x=>({...x,lat:Number(x.lat),lon:Number(x.lon),radius:Number(x.radius)||150}));else{const homes=Array.isArray(old.homes)?old.homes:(old.home?[old.home]:[]),works=Array.isArray(old.workplaces)?old.workplaces:[];for(const h of homes)if(validLocation({...h,type:"home"}))n.locations.push({id:h.id||uid("loc"),type:"home",name:h.name||"Home",lat:Number(h.lat),lon:Number(h.lon),radius:Number(h.radius)||150,createdAt:h.created||nowISO(),lastVisitedAt:h.lastVisited||null});for(const w of works)if(validLocation({...w,type:"work"}))n.locations.push({id:w.id||uid("loc"),type:"work",name:w.name||"Workplace",lat:Number(w.lat),lon:Number(w.lon),radius:Number(w.radius)||150,createdAt:w.created||nowISO(),lastVisitedAt:w.lastVisited||null})}n.routeCache=old.routeCache&&typeof old.routeCache==="object"?old.routeCache:{};n.history=Array.isArray(old.history)?old.history.map(normalizeDay).filter(Boolean):[];n.currentDay=old.currentDay?normalizeDay(old.currentDay):null;n.presence={...n.presence,...(old.presence||{})};const s=old.settings||{};n.settings={...n.settings,...s,startFrom:s.startFrom||s.morningStart||n.settings.startFrom,startUntil:s.startUntil||s.morningEnd||n.settings.startUntil,finishFrom:s.finishFrom||s.finishStart||n.settings.finishFrom,finishUntil:s.finishUntil||s.finishEnd||n.settings.finishUntil,defaultRadius:Number(s.defaultRadius)||150};if(Array.isArray(old.projects))n.projects=old.projects;rebuildProjectCatalog(n);return n}
function rebuildProjectCatalog(target=state){const map=new Map();for(const p of Array.isArray(target.projects)?target.projects:[]){const name=String(p.name||"").trim();if(name)map.set(name.toLowerCase(),{id:p.id||uid("proj"),name,lastUsedAt:p.lastUsedAt||null,useCount:Number(p.useCount)||0})}for(const day of [...(target.history||[]),target.currentDay].filter(Boolean))for(const seg of day.segments||[]){const name=String(seg.projectName||"").trim();if(!name)continue;const k=name.toLowerCase();if(!map.has(k))map.set(k,{id:seg.projectId||uid("proj"),name,lastUsedAt:seg.stop||day.stop||null,useCount:1});const p=map.get(k);seg.projectId=p.id;seg.projectName=p.name}target.projects=[...map.values()].sort((a,b)=>a.name.localeCompare(b.name))}
function validateState(s){const n=newState();if(!s||typeof s!=="object")return n;n.locations=Array.isArray(s.locations)?s.locations.filter(validLocation).map(x=>({...x,lat:Number(x.lat),lon:Number(x.lon),radius:Number(x.radius)||150})):[];n.routeCache=s.routeCache&&typeof s.routeCache==="object"?s.routeCache:{};n.history=Array.isArray(s.history)?s.history.map(normalizeDay).filter(Boolean):[];n.currentDay=s.currentDay?normalizeDay(s.currentDay):null;n.presence={...n.presence,...(s.presence||{})};n.settings={...n.settings,...(s.settings||{})};n.settings.defaultRadius=Number(n.settings.defaultRadius)||150;n.projects=Array.isArray(s.projects)?s.projects:[];rebuildProjectCatalog(n);return n}
function loadState(){try{const raw=localStorage.getItem(STORAGE_KEY);if(raw)return validateState(JSON.parse(raw));for(const key of PREVIOUS_KEYS){const legacy=localStorage.getItem(key);if(legacy){const migrated=migrateOld(JSON.parse(legacy));localStorage.setItem(STORAGE_KEY,JSON.stringify(migrated));return migrated}}}catch(e){console.error("State load failed",e)}return newState()}
let syncedPlacesJSON=null;
function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));syncAndroidPlaces()}catch(e){console.error("Persist failed",e);setNotice("mainMessage","Could not save WorkClock data on this device.","bad")}}
function syncAndroidPlaces(){try{const json=JSON.stringify(state.locations.map(({id,name,type,lat,lon,radius})=>({id,name,type,lat,lon,radius})));if(json===syncedPlacesJSON)return;WorkClockAndroid.syncPlaces(json);syncedPlacesJSON=json}catch(e){console.warn("Android place sync failed",e)}}
function refreshAndroidStatus(){
  try{
    const p=JSON.parse(WorkClockAndroid.permissionStatus());
    const confidence=$("#placeConfidence");
    if(confidence)confidence.textContent=!p.services?"Phone location is switched off.":!p.precise?"Precise location permission needed.":!p.background?"Background permission needed for arrival alerts.":p.geofences==="active"?"Android background place detection is active.":p.geofences==="no-saved-places"?"Save a home or workplace to enable detection.":"Background detection: "+String(p.geofences||"not configured");
    $("#nativeTrackingBox").classList.remove("hidden");
    const notifReady=p.notification===true;
    $("#enableNotifications").textContent=notifReady?"Notifications on":"Enable notifications";
    $("#enableNotifications").disabled=notifReady;
    setNotice("notificationHelp",notifReady?"Reminders are enabled. Use Test notification to check delivery.":"Notifications are off. Enable them to receive reminders.",notifReady?"good":"");
    const trackingReady=p.background&&p.geofences==="active";
    $("#enableNativeBackground").classList.toggle("hidden",trackingReady);
    $("#enableNativeBackground").textContent=p.background?"Retry background setup":"Enable background location";
    const summary=!p.location?"Android location permission not granted. Tap Enable location above.":
      !p.services?"Phone location services are OFF. Turn on Location in Android quick settings.":
      !p.precise?"Approximate location only. Precise location is required for background place detection.":
      !p.background?"Foreground location enabled. For background detection, tap above and allow location all the time.":
      p.geofences==="active"?"Background place detection active.":
      p.geofences==="no-saved-places"?"Location enabled. Save home and work locations to enable background reminders.":
      p.geofences?.startsWith("error:")?`Background detection failed: ${p.geofences.slice(6)}`:
      `Background setup: ${p.geofences||"checking"}`;
    setNotice("nativeTrackingHelp",summary+(p.location&&!trackingReady?` · Precise: ${p.precise?"yes":"no"} · Background: ${p.background?"yes":"no"}`:""),
      p.services&&p.geofences==="active"?"good":p.services?"":"bad");
  }catch(e){console.warn("Android status failed",e)}
}
window.__WorkClockNativeLocation=function(position){
  if(!position||!Number.isFinite(Number(position.lat))||!Number.isFinite(Number(position.lon)))return;
  const fix={lat:Number(position.lat),lon:Number(position.lon),accuracy:Number(position.accuracy)||0};
  currentPosition=fix;
  $("#enableLocation").textContent="Refresh location";
  $("#locationHelp").textContent=`Location found · accuracy about ${Math.round(fix.accuracy)} m.`;
  processPosition(fix,{source:"gps"});
  refreshAndroidStatus();
};
window.__WorkClockNativeLocationError=function(error){
  $("#enableLocation").textContent="Retry location";
  $("#locationHelp").textContent=error?.message||"Android could not obtain your location.";
  $("#gpsStatus").textContent="Location unavailable";
  $("#gpsStatus").className="pill bad";
  refreshAndroidStatus();
};
let syncingAndroidEvents=false;
async function applyNotificationDecision(event){
  const action=String(event.action||""),stamp=Number(event.at)||Date.now(),date=new Date(stamp);
  const d=getToday();
  if(action==="START_NOW"){
    if(!d.start)applyStart(date.toISOString(),"android-notification");
    else setNotice("mainMessage","Work was already started.");
  } else if(action==="START_EARLIER"){
    window.__activateWorkClockView?.("today");
    showTimeChoice("start","When did work actually start?");
  } else if(action==="NOT_WORKING"){
    setNotice("mainMessage","No workday started.");
  } else if(action==="FINISH_NOW"){
    if(d.start&&!d.stop)requestStop(date.toISOString(),"android-notification");
    else setNotice("mainMessage","No running workday to finish.");
  } else if(action==="FINISH_EARLIER"){
    if(d.start&&!d.stop){window.__activateWorkClockView?.("today");showTimeChoice("stop","When did you actually finish?")}
  } else if(action==="STILL_WORKING"){
    setNotice("mainMessage","Work continues.");
  }
}
async function syncAndroidEvents(){
  if(syncingAndroidEvents)return;
  syncingAndroidEvents=true;
  try{
    syncAndroidPlaces();refreshAndroidStatus();
    let events=[];
    try{events=JSON.parse(WorkClockAndroid.getEvents()||"[]")}
    catch(e){console.warn("Cannot read Android events",e);return}
    events.sort((a,b)=>(Number(a.at)||0)-(Number(b.at)||0));
    for(const event of events){
      const loc=locationById(event.placeId);
      try{
        if(event.transition==="ACTION"){
          await applyNotificationDecision(event);
        }else if(loc){
          const at=Number(event.at)||Date.now();
          const age=Date.now()-at;
          if(event.transition==="ENTER"){
            await processPosition({lat:loc.lat,lon:loc.lon,accuracy:Math.max(100,loc.radius||150)},
              {source:"android",eventAt:at});
          }else if(event.transition==="EXIT"&&loc.type==="work"){
            // Persist the original geofence timestamp, not the time the app opened.
            const previousAt=new Date(state.presence.changedAt||0).getTime();
            if(!Number.isFinite(previousAt)||at>=previousAt){
              state.presence.currentId=null;state.presence.currentType=null;state.presence.currentName=null;
              state.presence.changedAt=new Date(at).toISOString();
              state.presence.source="android";state.presence.lastWorkId=loc.id;
              persist();renderStatus(null,"android");
            }
            const d=getToday();
            if(age>=-60000&&age<2*3600000&&d.start&&!d.stop&&isAutomationDay(new Date(at))){
              showTimeChoice("stop",`Android detected leaving ${loc.name} at ${fmtTime(at)}. When did you finish?`);
            }
          }
        }
        WorkClockAndroid.acknowledgeEvent(event.id);
      }catch(e){console.error("Failed to process Android location event",e);break}
    }
    renderAttention();
  }finally{syncingAndroidEvents=false}
}
window.__WorkClockNativeSync=syncAndroidEvents;
window.__WorkClockBackupResult=message=>setNotice("backupMessage",message);
window.__WorkClockReceiveImport=function(raw){try{const parsed=JSON.parse(raw);if(!parsed||typeof parsed!=="object"||!Array.isArray(parsed.locations)||!Array.isArray(parsed.history))throw new Error("Not a valid WorkClock backup");if(!confirm("Replace existing WorkClock data with this backup? A safety copy of your current data will be stored on this device."))return;saveSafetySnapshot("Before importing data");state=validateState(parsed);persist();resetLocationEditor();resetManualEditor();renderAll();renderSettings();refreshAndroidStatus();setNotice("backupMessage","Backup imported. Workdays and places restored.","good")}catch(e){setNotice("backupMessage","Import failed: "+(e.message||e),"bad")}};
function showFolderBackupStatus(){
  const enabled=!!WorkClockAndroid.backupFolderEnabled();
  $("#backupFolderStatus").textContent=enabled?
    "Automatic daily folder backups enabled. Each day overwrites that day's backup file.":
    "Only app-local safety copies are enabled. Choose a folder for backups outside the app.";
}
function writeBackupToFolder(force=false){
  try{
    if(!state.history.length||!WorkClockAndroid.backupFolderEnabled())return;
    const today=localDateKey();
    if(!force&&localStorage.getItem("workclock-last-folder-backup")===today)return;
    WorkClockAndroid.saveFolderBackup(JSON.stringify(state));
    localStorage.setItem("workclock-last-folder-backup",today);
  }catch(e){console.warn("Backup folder unavailable",e)}
}
window.__WorkClockBackupFolderStatus=function(enabled){
  showFolderBackupStatus();
  if(enabled){writeBackupToFolder(true);setNotice("backupMessage","Automatic backup folder selected.","good")}
};
const SNAPSHOT_KEY="workclock-safety-snapshots-v1";
const SNAPSHOT_LIMIT_BYTES=650000;
function readSafetySnapshots(){
  try{const list=JSON.parse(localStorage.getItem(SNAPSHOT_KEY)||"[]");return Array.isArray(list)?list:[]}
  catch{return []}
}
function saveSafetySnapshot(reason){
  try{
    if(!state.history.length&&!dayHasData(state.currentDay))return false;
    const data=JSON.stringify(state);
    if(data.length>SNAPSHOT_LIMIT_BYTES)return false;
    const recent=readSafetySnapshots().filter(s=>s&&typeof s.data==="string"&&s.data.length<=SNAPSHOT_LIMIT_BYTES);
    recent.unshift({at:nowISO(),reason,data});
    localStorage.setItem(SNAPSHOT_KEY,JSON.stringify(recent.slice(0,3)));
    return true;
  }catch(e){console.warn("Could not make local safety snapshot",e);return false}
}
function maybeDailySnapshot(){
  const today=localDateKey();
  try{
    const last=localStorage.getItem("workclock-last-daily-snapshot");
    if(last===today||!state.history.length)return;
    if(saveSafetySnapshot("Daily safety copy"))localStorage.setItem("workclock-last-daily-snapshot",today);
    writeBackupToFolder();
  }catch(e){console.warn("Daily snapshot unavailable",e)}
}
function restoreSafetySnapshot(){
  const list=readSafetySnapshots();
  if(!list.length)return setNotice("backupMessage","No safety snapshots yet. Export your data to a file for long-term backups.","bad");
  const mostRecent=list[0];
  if(!confirm("Restore the safety copy from "+new Date(mostRecent.at).toLocaleString()+"? Current entries will be replaced."))return;
  try{
    const recovered=validateState(JSON.parse(mostRecent.data));
    saveSafetySnapshot("Before restoring safety copy");
    state=recovered;persist();renderAll();renderSettings();resetManualEditor();
    setNotice("backupMessage","Safety snapshot restored.","good");
  }catch(e){setNotice("backupMessage","Restore failed: "+e.message,"bad")}
}
function exportWorkClockBackup(){WorkClockAndroid.exportBackup(JSON.stringify(state,null,2))}
function importWorkClockBackup(){WorkClockAndroid.importBackup()}
const noticeTimers=new Map();function setNotice(id,text,kind=""){const el=$("#"+id);if(!el)return;el.textContent=text;if(id==="mainMessage"){el.className="toast show"+(kind?` ${kind}`:"");if(noticeTimers.has(id))clearTimeout(noticeTimers.get(id));noticeTimers.set(id,setTimeout(()=>el.classList.remove("show"),4200));return}el.className="notice"+(kind?` ${kind}`:"")}
function ensureProject(name){name=String(name||"").trim();if(!name)return null;let p=state.projects.find(x=>x.name.toLowerCase()===name.toLowerCase());if(!p){p={id:uid("proj"),name,lastUsedAt:nowISO(),useCount:0};state.projects.push(p)}p.lastUsedAt=nowISO();p.useCount=(Number(p.useCount)||0)+1;renderProjectSuggestions();return p}
function renderProjectSuggestions(){const dl=$("#projectSuggestions");if(!dl)return;dl.innerHTML=state.projects.slice().sort((a,b)=>(new Date(b.lastUsedAt||0))-(new Date(a.lastUsedAt||0))||a.name.localeCompare(b.name)).map(p=>`<option value="${esc(p.name)}"></option>`).join("")}
function isAutomationDay(date=new Date()){return state.settings.automationDays.includes(date.getDay())}
function blankDay(date=localDateKey()){return {id:uid("day"),date,start:null,stop:null,breakMin:30,startSource:null,stopSource:null,status:"draft",commuteOut:null,commuteBack:null,workplaceId:null,startHomeId:null,endHomeId:null,manuallyAdded:false,createdAt:nowISO(),segments:[]}}
function dayHasData(day){return !!(day&&(day.start||day.stop||day.commuteOut||day.commuteBack||(Array.isArray(day.segments)&&day.segments.length)))}
function getToday(){
  const key=localDateKey();
  if(!state.currentDay){state.currentDay=blankDay(key);persist()}
  else if(state.currentDay.date!==key){
    if(!dayHasData(state.currentDay)){state.currentDay=blankDay(key);persist()}
    else if(state.currentDay.stop){
      // Preserve a previous completed-but-unconfirmed workday as a draft.
      // Never silently merge its hours with the next day's clock.
      if(!state.history.some(d=>d.id===state.currentDay.id)){
        const previous=deepCopy(state.currentDay);previous.status="draft";
        state.history.push(previous);
      }
      state.currentDay=blankDay(key);persist();
    }
    // A running overnight shift stays active on its original start date.
  }
  return state.currentDay
}
function findDay(id){if(state.currentDay?.id===id)return state.currentDay;return state.history.find(x=>x.id===id)||null}
function locationById(id){return state.locations.find(x=>x.id===id)||null}
function locationsOf(type){return state.locations.filter(x=>x.type===type)}
function openSegmentStart(day){return day.segments?.length?day.segments[day.segments.length-1].stop:day.start}
function coverageError(day){if(!(day.start&&day.stop))return "Start and finish are required.";if(!Array.isArray(day.segments)||!day.segments.length)return "At least one project section is required.";const eps=1000;if(Math.abs(new Date(day.segments[0].start)-new Date(day.start))>eps)return "The first project section must start with the workday.";for(let i=0;i<day.segments.length;i++){const s=day.segments[i];if(!String(s.projectName||"").trim())return `Project section ${i+1} has no name.`;if(!(new Date(s.stop)>new Date(s.start)))return `Project section ${i+1} has an invalid time range.`;if(i&&Math.abs(new Date(s.start)-new Date(day.segments[i-1].stop))>eps)return `There is a gap or overlap before project section ${i+1}.`}if(Math.abs(new Date(day.segments.at(-1).stop)-new Date(day.stop))>eps)return "The last project section must end with the workday.";return null}
function appendProjectSegment(day,start,stop,projectName){const p=ensureProject(projectName);if(!p)throw new Error("Project name required");const a=new Date(start),b=new Date(stop);if(!(b>a))throw new Error("Project section must have positive duration");const seg={id:uid("seg"),start:a.toISOString(),stop:b.toISOString(),projectId:p.id,projectName:p.name,createdAt:nowISO()};day.segments.push(seg);return seg}

function haversineM(a,b){const R=6371000,p1=a.lat*Math.PI/180,p2=b.lat*Math.PI/180,dp=(b.lat-a.lat)*Math.PI/180,dl=(b.lon-a.lon)*Math.PI/180,q=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.atan2(Math.sqrt(q),Math.sqrt(1-q))}
function nearestSavedLocation(pos){let best=null;for(const loc of state.locations){const m=haversineM(pos,loc);if(m<=(loc.radius||150)&&(!best||m<best.distanceM))best={...loc,distanceM:m}}return best}

function wireHold(el,callback){if(!el)return;const fill=el.querySelector(".fill");let start=0,raf=null,active=false,done=false,startX=0,startY=0,pointerId=null;const reset=()=>{active=false;done=false;pointerId=null;if(raf)cancelAnimationFrame(raf);raf=null;if(fill)fill.style.width="0%";activeHoldCancels.delete(reset)};const frame=()=>{if(!active||el.disabled)return reset();const p=Math.min(1,(performance.now()-start)/HOLD_MS);if(fill)fill.style.width=`${p*100}%`;if(p>=1){active=false;done=true;activeHoldCancels.delete(reset);if(navigator.vibrate)navigator.vibrate(60);Promise.resolve(callback()).catch(e=>console.error(e));setTimeout(()=>{if(fill)fill.style.width="0%";done=false},120);return}raf=requestAnimationFrame(frame)};el.addEventListener("pointerdown",e=>{if(el.disabled||e.button>0)return;startX=e.clientX;startY=e.clientY;pointerId=e.pointerId;active=true;done=false;start=performance.now();activeHoldCancels.add(reset);frame()});el.addEventListener("pointermove",e=>{if(!active||e.pointerId!==pointerId)return;if(Math.abs(e.clientY-startY)>HOLD_MOVE_PX||Math.abs(e.clientX-startX)>HOLD_MOVE_PX)reset()});el.addEventListener("pointerup",()=>{if(!done)reset()});el.addEventListener("pointercancel",reset);el.addEventListener("lostpointercapture",()=>{if(!done)reset()});el.addEventListener("contextmenu",e=>e.preventDefault())}

let customTimeKind="start";
function localDateTimeValue(date){const n=number=>String(number).padStart(2,"0");return `${date.getFullYear()}-${n(date.getMonth()+1)}-${n(date.getDate())}T${n(date.getHours())}:${n(date.getMinutes())}`}
function showTimeChoice(kind,reason){const isStart=kind==="start";customTimeKind=kind;$("#timeModalTitle").textContent=isStart?"When did you start?":"When did you finish?";$("#timeModalText").textContent=reason||"Choose the closest option.";const box=$("#timeChoices");box.innerHTML="";$("#customTimeEditor").classList.add("hidden");$("#customTimeError").classList.add("hidden");const options=[["Now",0],["15 min ago",15],["30 min ago",30],["45 min ago",45],["60 min ago",60],[isStart?"Not working":"Still working",null]];for(const [label,minutes] of options){const b=document.createElement("button");b.type="button";b.textContent=label;b.addEventListener("click",()=>{hideTimeChoice();if(minutes===null)return;const ts=new Date(Date.now()-minutes*60000).toISOString();if(isStart)applyStart(ts,"assisted");else requestStop(ts,"assisted")});box.appendChild(b)}const custom=document.createElement("button");custom.type="button";custom.className="customTimeChoice";custom.textContent="Custom · enter exact time";custom.addEventListener("click",()=>{const editor=$("#customTimeEditor");editor.classList.remove("hidden");$("#customTimeError").classList.add("hidden");const day=getToday();const existing=isStart?day.start:day.stop;$("#customTimeInput").value=localDateTimeValue(existing?new Date(existing):new Date());$("#customTimeInput").focus()});box.appendChild(custom);$("#timeModal").classList.add("show")}
function confirmCustomTime(){const input=$("#customTimeInput"),message=$("#customTimeError"),date=new Date(input.value),day=getToday(),isStart=customTimeKind==="start";let error="";if(!input.value||!Number.isFinite(date.getTime()))error="Enter a valid date and time.";else if(date.getTime()>Date.now()+59999)error="The time cannot be in the future.";else if(!isStart&&!day.start)error="Set a start time first.";else if(!isStart&&date.getTime()<=new Date(day.start).getTime())error="Finish must be after start.";else if(!isStart&&day.segments.length&&date.getTime()<=new Date(day.segments.at(-1).start).getTime())error="Finish must be after the last project started.";else if(isStart&&day.segments.length&&date.getTime()>=new Date(day.segments[0].stop).getTime())error="Start must be before the first project finished.";if(error){message.textContent=error;message.classList.remove("hidden");return}hideTimeChoice();if(isStart)applyStart(date.toISOString(),"custom");else requestStop(date.toISOString(),"custom")}

function hideTimeChoice(){$("#timeModal").classList.remove("show")}
function applyStart(iso,source){const d=getToday(),t=new Date(iso);if(d.segments.length&&!(new Date(d.segments[0].stop)>t)){setNotice("mainMessage","The new start would be after the first project section ends.","bad");return}d.start=t.toISOString();d.startSource=source;if(d.segments.length)d.segments[0].start=d.start;if(d.stop&&new Date(d.stop)<=t){d.stop=null;d.segments=[]}d.status="draft";persist();renderAll();setNotice("mainMessage",`Start set to ${fmtTime(d.start)}.`,"good")}
function requestStop(iso,source){const d=getToday(),t=new Date(iso);if(!d.start)return setNotice("mainMessage","Set a start time first.","bad");if(!(t>new Date(d.start)))return setNotice("mainMessage","Finish must be after start.","bad");if(d.stop&&d.segments.length){const last=d.segments.at(-1);if(!(t>new Date(last.start)))return setNotice("mainMessage","The finish would be before the final project section starts.","bad");d.stop=t.toISOString();d.stopSource=source;last.stop=d.stop;persist();renderAll();setNotice("mainMessage",`Finish changed to ${fmtTime(d.stop)}.`,"good");return}openProjectNaming({mode:"finish",marker:t.toISOString(),source})}
function openProjectNaming(action){const d=getToday(),start=openSegmentStart(d);if(!start)return setNotice("mainMessage","Start work first.","bad");if(!(new Date(action.marker)>new Date(start)))return setNotice("mainMessage","Project marker must be after the current section started.","bad");pendingProjectAction={...action,dayId:d.id,segmentStart:start};$("#projectModalTitle").textContent=action.mode==="split"?"Name the project you just finished":"What was the last project?";$("#projectModalText").textContent=action.mode==="split"?`Marker saved at ${fmtTime(action.marker)}. Work continues after this marker.`:`Work finish is ${fmtTime(action.marker)}. Name the final project section before the day is stopped.`;$("#projectModalInput").value="";setNotice("projectModalMessage","Type a project name or choose a previous one.");$("#projectModal").classList.add("show");setTimeout(()=>$("#projectModalInput").focus(),50)}
function saveProjectNaming(){if(!pendingProjectAction)return;const name=$("#projectModalInput").value.trim();if(!name)return setNotice("projectModalMessage","Project name is required.","bad");const day=findDay(pendingProjectAction.dayId);if(!day)return cancelProjectNaming();try{appendProjectSegment(day,pendingProjectAction.segmentStart,pendingProjectAction.marker,name);if(pendingProjectAction.mode==="finish"){day.stop=pendingProjectAction.marker;day.stopSource=pendingProjectAction.source||"manual";day.status="draft";setNotice("mainMessage",`Finish set to ${fmtTime(day.stop)}. Review the day and confirm it.`,"good")}else setNotice("mainMessage",`Project section saved. Work continues from ${fmtTime(pendingProjectAction.marker)}.`,"good");pendingProjectAction=null;$("#projectModal").classList.remove("show");persist();renderAll()}catch(e){setNotice("projectModalMessage",e.message||String(e),"bad")}}
function cancelProjectNaming(){pendingProjectAction=null;$("#projectModal").classList.remove("show");setNotice("mainMessage","Project marker cancelled. Work continues unchanged.")}
function endProjectNow(){const d=getToday();if(!(d.start&&!d.stop))return;openProjectNaming({mode:"split",marker:nowISO(),source:"quick-project"})}

async function routeBetween(from,to){if(!from||!to)return null;const provider=state.settings.routingProvider||"osrm",key=`${provider}:${from.id}>${to.id}`;if(state.routeCache[key])return state.routeCache[key];try{let result;if(provider==="ors"){const apiKey=(state.settings.orsKey||"").trim();if(!apiKey)throw new Error("OpenRouteService API key missing");const r=await fetch("https://api.openrouteservice.org/v2/directions/driving-car",{method:"POST",headers:{Authorization:apiKey,"Content-Type":"application/json"},body:JSON.stringify({coordinates:[[from.lon,from.lat],[to.lon,to.lat]],preference:"shortest"})});if(!r.ok)throw new Error(`ORS HTTP ${r.status}`);const j=await r.json(),summary=j.routes?.[0]?.summary;if(!summary)throw new Error("No route returned");result={km:summary.distance/1000,seconds:summary.duration,source:"OpenRouteService shortest",updatedAt:nowISO()}}else{const url=`${OSRM_ENDPOINT}${from.lon},${from.lat};${to.lon},${to.lat}?overview=false&alternatives=false&steps=false`,r=await fetch(url,{cache:"no-store"});if(!r.ok)throw new Error(`OSRM HTTP ${r.status}`);const j=await r.json(),route=j.routes?.[0];if(!route)throw new Error("No route returned");result={km:route.distance/1000,seconds:route.duration,source:"OSRM road route",updatedAt:nowISO()}}state.routeCache[key]=result;
    const entries=Object.entries(state.routeCache);
    if(entries.length>150){
      entries.sort((a,b)=>String(a[1]?.updatedAt||"").localeCompare(String(b[1]?.updatedAt||"")));
      for(const [oldKey] of entries.slice(0,entries.length-120))delete state.routeCache[oldKey];
    }
    persist();return result}catch(e){console.warn("Route calculation failed",e);return null}}
async function attachCommute(dayId,slot,from,to){const route=await routeBetween(from,to),day=findDay(dayId);if(!day)return;if(!route){setNotice("mainMessage",`Road distance could not be calculated for ${from.name} → ${to.name}.`,"bad");return}day[slot]={fromId:from.id,toId:to.id,from:from.name,to:to.name,km:route.km,source:route.source,at:nowISO()};if(slot==="commuteOut"){day.startHomeId=from.type==="home"?from.id:day.startHomeId;day.workplaceId=to.type==="work"?to.id:day.workplaceId}if(slot==="commuteBack"){day.endHomeId=to.type==="home"?to.id:day.endHomeId;day.workplaceId=from.type==="work"?from.id:day.workplaceId}persist();renderAll()}
function pendingReturnDay(){
  const all=[state.currentDay,...state.history].filter(Boolean);
  const eligible=all.filter(day=>{
    if(!day.start||!day.stop||day.commuteBack||!day.workplaceId||day.manuallyAdded)return false;
    const stop=new Date(day.stop).getTime();
    if(!Number.isFinite(stop))return false;
    const age=Date.now()-stop;
    return age>=-5*60*1000&&age<=7*24*3600000;
  }).sort((a,b)=>new Date(b.stop)-new Date(a.stop));

  const candidate=eligible[0];
  if(!candidate)return null;

  const candidateStop=new Date(candidate.stop).getTime();
  const laterWorkday=all.some(day=>
    day.id!==candidate.id &&
    day.start &&
    new Date(day.start).getTime()>candidateStop
  );
  return laterWorkday?null:candidate;
}
async function recoverPendingReturn(home,{source="gps"}={}){
  if(home?.type!=="home")return false;
  const candidate=pendingReturnDay();
  if(!candidate)return false;
  const work=locationById(candidate.workplaceId);
  if(work?.type!=="work")return false;

  const route=await routeBetween(work,home);
  const day=findDay(candidate.id);
  if(!route||!day||day.commuteBack)return false;

  day.commuteBack={
    fromId:work.id,
    toId:home.id,
    from:work.name,
    to:home.name,
    km:route.km,
    source:route.source,
    at:nowISO()
  };
  day.endHomeId=home.id;
  day.workplaceId=work.id;
  persist();
  renderAll();

  const label=day===state.currentDay?"today's draft":fmtDate(day.start);
  setNotice("mainMessage",`Added missing return commute to ${label}: ${work.name} → ${home.name}, ${route.km.toFixed(1)} km.`,"good");
  return true;
}
function updatePresence(found,source,at=nowISO()){
  if(found){const loc=locationById(found.id);if(loc)loc.lastVisitedAt=at}
  const prev={...state.presence};state.presence.currentId=found?.id||null;state.presence.currentType=found?.type||null;state.presence.currentName=found?.name||null;state.presence.changedAt=at;state.presence.source=source;if(found?.type==="home")state.presence.lastHomeId=found.id;if(found?.type==="work")state.presence.lastWorkId=found.id;persist();return prev}
async function processPosition(pos,{source="gps",force=false,forcePreviousId=null,eventAt=null}={}){
  currentPosition={lat:Number(pos.lat),lon:Number(pos.lon),accuracy:Number(pos.accuracy)||null};
  const found=nearestSavedLocation(currentPosition);
  const staleAndroidEvent=source==="android"&&eventAt&&Date.now()-Number(eventAt)>2*3600000;
  if(staleAndroidEvent){
    // Old events cannot move the live GPS position backward in time.
    // An old home arrival can still restore a missing journey on a confirmed day.
    if(found?.type==="home")await recoverPendingReturn(found,{source});
    return;
  }
  let prev={...state.presence};

  if(forcePreviousId){
    const p=locationById(forcePreviousId);
    prev={...prev,currentId:p?.id||null,currentType:p?.type||null,currentName:p?.name||null};
  }

  const unchanged=found?.id===state.presence.currentId;
  if(!unchanged||force)prev=updatePresence(found,source,eventAt?new Date(eventAt).toISOString():nowISO());
  renderStatus(found,source);

  // Recovery happens before the normal short-circuits. Merely opening the app
  // while already at a saved home can therefore complete a previously
  // confirmed workday whose return route is still missing.
  if(found?.type==="home"){
    await recoverPendingReturn(found,{source});
  }

  if(unchanged&&!force)return;
  if(!force&&!isAutomationDay(eventAt?new Date(eventAt):new Date()))return;

  const day=getToday(),
        now=eventAt?new Date(eventAt):new Date(),
        startOK=force||inWindow(now,state.settings.startFrom,state.settings.startUntil),
        finishOK=force||inWindow(now,state.settings.finishFrom,state.settings.finishUntil);

  if(found?.type==="work"){
    const original=locationById(found.id);
    if(original)original.lastVisitedAt=nowISO();
    day.workplaceId=found.id;

    const homeId=prev.currentType==="home"?prev.currentId:prev.lastHomeId,
          home=locationById(homeId);
    if(home?.type==="home"&&!day.commuteOut){
      attachCommute(day.id,"commuteOut",home,found);
    }

    if(!day.start&&startOK){
      showTimeChoice("start",`${force?"Simulation: ":""}Detected at ${found.name}. How long ago did you start?`);
      notifyUser("WorkClock",`You are at ${found.name}, but work is not started.`,{tag:"workclock-start-missing"});
    }
  }

  if(prev.currentType==="work"&&!found&&day.start&&!day.stop&&finishOK){
    showTimeChoice("stop",`${force?"Simulation: ":""}Detected leaving ${prev.currentName}. When did you finish?`);
    notifyUser("WorkClock","You appear to have left work while the timer is running.",{tag:"workclock-finish-missing"});
  }

  if(found?.type==="home"){
    const workId=prev.currentType==="work"?prev.currentId:prev.lastWorkId,
          work=locationById(workId);

    // Never attach a return route to an empty new day. If the real workday was
    // already confirmed, recoverPendingReturn() above updates History instead.
    if(day.start&&work?.type==="work"&&!day.commuteBack){
      attachCommute(day.id,"commuteBack",work,found);
    }

    if(day.start&&!day.stop&&finishOK&&work?.type==="work"){
      showTimeChoice("stop",`${force?"Simulation: ":""}You arrived at ${found.name}. When did you finish work?`);
      notifyUser("WorkClock",`You are at ${found.name}, but today's finish time is missing.`,{tag:"workclock-home-finish-missing"});
    }
  }

  persist();
  renderAll();
}

/* Android-only runtime: browser permissions, service workers and web GPS are not bundled. */
async function notifyUser(title,body,{tag="workclock-reminder"}={}){
  try{WorkClockAndroid.showNotification(title,body,tag);return true}
  catch(e){console.warn("Android notification failed",e);return false}
}
function enableNotifications(){
  WorkClockAndroid.requestNotifications();
  setNotice("notificationHelp","Android notification permission requested. Check the system prompt or app settings.");
  refreshAndroidStatus();
}
function testNotification(){
  WorkClockAndroid.testNotification();
  setNotice("notificationHelp","Android test notification requested.","good");
}
function requestLocation(){
  $("#locationHelp").textContent="Finding your position…";
  WorkClockAndroid.requestForegroundTracking();
  refreshAndroidStatus();
}
function refreshPermissionUI(){refreshAndroidStatus();}

function addLocation(type,name,lat,lon,radius){const loc={id:uid("loc"),type,name:name.trim()||`${type==="home"?"Home":"Workplace"} ${locationsOf(type).length+1}`,lat:Number(lat),lon:Number(lon),radius:Number(radius)||state.settings.defaultRadius,createdAt:nowISO(),lastVisitedAt:null};if(!validLocation(loc)||loc.lat<-90||loc.lat>90||loc.lon<-180||loc.lon>180)throw new Error("Invalid coordinates");state.locations.push(loc);state.routeCache={};persist();return loc}
function resetLocationEditor(){editingLocationId=null;$("#locationEditorTitle").textContent="Add location";$("#saveLocation").textContent="Add location";$("#locType").value="home";$("#locName").value="";$("#locLat").value="";$("#locLon").value="";$("#locRadius").value=state.settings.defaultRadius;setNotice("locationEditorMessage","You can add any number of homes and workplaces.")}
function editLocation(id){const l=locationById(id);if(!l)return;editingLocationId=id;$("#locationEditorTitle").textContent="Edit location";$("#saveLocation").textContent="Save changes";$("#locType").value=l.type;$("#locName").value=l.name;$("#locLat").value=l.lat;$("#locLon").value=l.lon;$("#locRadius").value=l.radius;setNotice("locationEditorMessage",`Editing ${l.name}.`);$("#locationEditorTitle").scrollIntoView({behavior:"smooth",block:"start"})}
function saveLocationEditor(){const type=$("#locType").value,name=$("#locName").value.trim(),lat=Number($("#locLat").value),lon=Number($("#locLon").value),radius=Number($("#locRadius").value);if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<-90||lat>90||lon<-180||lon>180){setNotice("locationEditorMessage","Enter valid latitude and longitude.","bad");return}if(!Number.isFinite(radius)||radius<30){setNotice("locationEditorMessage","Detection radius must be at least 30 m.","bad");return}if(editingLocationId){const l=locationById(editingLocationId);if(!l)return;Object.assign(l,{type,name:name||l.name,lat,lon,radius});state.routeCache={};persist();setNotice("locationEditorMessage",`Saved ${l.name}.`,"good")}else{const l=addLocation(type,name,lat,lon,radius);setNotice("locationEditorMessage",`Added ${l.name}.`,"good")}resetLocationEditor();renderAll()}
function deleteLocation(id){const l=locationById(id);if(!l)return;if(!confirm(`Delete saved location “${l.name}”? Historical records keep their stored names and kilometres.`))return;state.locations=state.locations.filter(x=>x.id!==id);state.routeCache={};for(const key of ["currentId","lastHomeId","lastWorkId"])if(state.presence[key]===id)state.presence[key]=null;persist();renderAll();setNotice("locationEditorMessage",`Deleted ${l.name}.`,"good")}
function addCurrentLocation(type){if(!currentPosition){setNotice("locationEditorMessage","No current GPS position is available. Enable location first or add coordinates manually.","bad");return}const l=addLocation(type,"",currentPosition.lat,currentPosition.lon,state.settings.defaultRadius);renderAll();setNotice("locationEditorMessage",`Added ${l.name} from current GPS position.`,"good")}

function renderStatus(found=null,source=null){const auto=isAutomationDay();$("#dayAutomationStatus").textContent=auto?"Auto ON":"Auto OFF";$("#dayAutomationStatus").className=`pill ${auto?"good":""}`;if(currentPosition){$("#gpsStatus").textContent=`${source==="simulation"?"SIM":"Location"} ${currentPosition.lat.toFixed(5)}, ${currentPosition.lon.toFixed(5)}`;$("#gpsStatus").className="pill good"}const loc=found||locationById(state.presence.currentId);$("#placeStatus").textContent=loc?`At ${loc.name}`:"No saved place";$("#notificationStatus").textContent="Android reminders"}
function projectLines(day){if(!day.segments?.length)return '<div class="meta">No completed project sections yet.</div>';return `<div class="projectList">${day.segments.map(s=>`<div class="projectLine"><span class="name">${esc(s.projectName)}</span><span class="time">${fmtTime(s.start)}–${fmtTime(s.stop)} · ${fmtDuration(new Date(s.stop)-new Date(s.start))}</span></div>`).join("")}</div>`}
function renderToday(){const d=getToday(),running=!!(d.start&&!d.stop),stopped=!!(d.start&&d.stop),main=$("#mainHold");document.body.classList.toggle("work-running",running);document.body.classList.toggle("work-review",stopped);const openStart=openSegmentStart(d);const stateEl=$("#workState"),sectionEl=$("#currentSection");if(stateEl){stateEl.textContent=running?"WORKING":stopped?"READY TO REVIEW":"OFF THE CLOCK";stateEl.className=`workState ${running?"active":stopped?"review":""}`}if(sectionEl){sectionEl.innerHTML=running?`<span>Current section</span><strong>Started ${fmtTime(openStart)}</strong>`:stopped?`<span>Workday</span><strong>${d.segments.length} project${d.segments.length===1?"":"s"}</strong>`:`<span>Current section</span><strong>Starts when you clock in</strong>`};main.disabled=stopped;main.classList.toggle("finish",running);main.querySelector("span").textContent=running?"HOLD TO FINISH WORK":stopped?"WORKDAY STOPPED — REVIEW BELOW":"HOLD TO START WORK";$("#endProject").disabled=!running;$("#endProject").classList.toggle("hidden",!running);$("#projectQuickHelp").textContent=running?`Current section started ${fmtTime(openSegmentStart(d))}. Tap End Project / Switch to place an exact marker without stopping work.`:"Start work first. A project marker does not stop the work timer.";$("#timerLabel").textContent=running?`Working since ${fmtTime(d.start)}`:stopped?`Draft finished at ${fmtTime(d.stop)}`:"Not working";$("#editStart").disabled=!d.start;$("#editStop").disabled=!d.stop;$("#clearDraft").disabled=!d.start&&!d.stop&&!d.commuteOut&&!d.commuteBack;const gross=d.start&&d.stop?new Date(d.stop)-new Date(d.start):null,net=gross===null?null:Math.max(0,gross-d.breakMin*60000),km=(d.commuteOut?.km||0)+(d.commuteBack?.km||0),coverage=d.stop?coverageError(d):null;$("#todayReview").innerHTML=`<div class="summaryGrid"><div class="summaryStat"><span>Start</span><strong>${fmtTime(d.start)}</strong></div><div class="summaryStat"><span>Finish</span><strong>${fmtTime(d.stop)}</strong></div><div class="summaryStat"><span>Worked</span><strong>${net===null?"—":fmtDuration(net)}</strong></div><div class="summaryStat"><span>Road</span><strong>${km?km.toFixed(1)+" km":"—"}</strong></div></div>${d.commuteOut?`<div class="meta">Out · ${esc(d.commuteOut.from)} → ${esc(d.commuteOut.to)} · ${d.commuteOut.km.toFixed(1)} km</div>`:""}${d.commuteBack?`<div class="meta">Back · ${esc(d.commuteBack.from)} → ${esc(d.commuteBack.to)} · ${d.commuteBack.km.toFixed(1)} km</div>`:(d.start&&d.stop&&d.workplaceId&&!d.manuallyAdded?`<div class="notice">Return route pending · open WorkClock when you reach a saved home.</div>`:"")}${projectLines(d)}${coverage?`<div class="notice bad">${esc(coverage)}</div>`:""}`;$("#breakChips").innerHTML="";for(const n of [0,15,30,45,60,75,90]){const b=document.createElement("button");b.type="button";b.className=`chip ${d.breakMin===n?"selected":""}`;b.textContent=n?`${n} min`:"No break";b.addEventListener("click",()=>{d.breakMin=n;persist();renderToday()});$("#breakChips").appendChild(b)}$("#confirmDayHold").disabled=!(d.start&&d.stop&&!coverage);updateTimer()}
function renderLocations(){
  const list=$("#locationList");
  list.innerHTML="";
  if(!state.locations.length)list.innerHTML='<div class="meta">No saved locations yet.</div>';
  for(const l of state.locations){
    const el=document.createElement("div");el.className="location";
    const visit=l.lastVisitedAt?new Date(l.lastVisitedAt):null;
    const visitText=visit&&Number.isFinite(visit.getTime())?"Last detected "+fmtDate(visit):"Not detected yet";
    el.innerHTML=`<div class="locationHead"><div><div class="placeTitleLine"><button type="button" class="placeNameButton" title="Open in Maps">${esc(l.name)}<span class="placeExternalArrow" aria-hidden="true">↗</span></button><span class="placeKind">(${l.type==="home"?"home":"work"})</span></div><div class="meta">${esc(visitText)} · detection radius ${Number(l.radius)||150} m</div></div><div class="actions"><button class="btn small edit">Edit</button><button class="btn small del">Delete</button></div></div>`;
    el.querySelector(".placeNameButton").addEventListener("click",()=>WorkClockAndroid.openPlaceOnMap(l.id));
    el.querySelector(".edit").addEventListener("click",()=>editLocation(l.id));
    el.querySelector(".del").addEventListener("click",()=>deleteLocation(l.id));
    list.appendChild(el);
  }
  fillLocationSelects();
}
function fillSelect(el,items,placeholder,preferred=null){const old=preferred??el.value;el.innerHTML=`<option value="">${esc(placeholder)}</option>`+items.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("");if(items.some(x=>x.id===old))el.value=old;else if(items.length===1)el.value=items[0].id}
function fillLocationSelects(){const homes=locationsOf("home"),works=locationsOf("work");fillSelect($("#simHome"),homes,"Choose home");fillSelect($("#simWork"),works,"Choose workplace");fillSelect($("#manualStartHome"),homes,"Choose start home");fillSelect($("#manualEndHome"),homes,"Choose return home");fillSelect($("#manualWork"),works,"Choose workplace");updateManualModeUI()}
function renderSettings(){const s=state.settings;$("#startFrom").value=s.startFrom;$("#startUntil").value=s.startUntil;$("#finishFrom").value=s.finishFrom;$("#finishUntil").value=s.finishUntil;$("#defaultRadius").value=s.defaultRadius;$("#routingProvider").value=s.routingProvider;$("#orsKey").value=s.orsKey}

// Weekstaat is a temporary view over saved workdays — no separate or duplicated data.
let weekSheetMode=localStorage.getItem("workclock-history-mode")==="week"?"week":"days";
let weekSheetAnchor=(()=>{const val=localStorage.getItem("workclock-week-anchor");if(!val||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(val))return null;const date=new Date(val+"T12:00:00");return Number.isFinite(date.getTime())?date:null})();
let weekProjectFilter="";
function mondayOfWeek(date){
  const d=new Date(date.getFullYear(),date.getMonth(),date.getDate(),12);
  d.setDate(d.getDate()-((d.getDay()+6)%7));return d;
}
function isoWeekData(monday){
  const thu=new Date(monday.getFullYear(),monday.getMonth(),monday.getDate(),12);
  thu.setDate(thu.getDate()+3);
  const year=thu.getFullYear();
  const jan4=mondayOfWeek(new Date(year,0,4,12));
  const week=1+Math.round((Date.UTC(thu.getFullYear(),thu.getMonth(),thu.getDate())-Date.UTC(jan4.getFullYear(),jan4.getMonth(),jan4.getDate()+3))/604800000);
  return {year,week};
}
function weekClock(iso){return iso?fmtTime(iso):"—"}
function weekDuration(minutes){const mins=Math.max(0,Math.floor(minutes));return `${Math.floor(mins/60)}u${String(mins%60).padStart(2,"0")}`}
function weekKm(km){if(!Number.isFinite(km))return "—";const n=km.toFixed(1);return n.endsWith(".0")?n.slice(0,-2):n}
function daysInWeek(anchor){
  const monday=mondayOfWeek(anchor);
  const keys=Array.from({length:7},(_,i)=>{const d=new Date(monday);d.setDate(monday.getDate()+i);return {date:d,key:localDateKey(d)}});
  const groups=new Map(keys.map(k=>[k.key,[]]));
  for(const day of [...state.history,...(state.currentDay?.start?[state.currentDay]:[])]){
    const key=day.date||((day.start&&localDateKey(new Date(day.start)))||"");
    if(groups.has(key)&&day.start)groups.get(key).push(day);
  }
  return keys.map(k=>({ ...k, entries:groups.get(k.key)}));
}
function renderWeekSheet(){
  const anchor=weekSheetAnchor||mondayOfWeek(new Date()),monday=mondayOfWeek(anchor);
  weekSheetAnchor=monday;
  localStorage.setItem("workclock-week-anchor",localDateKey(monday));
  const {year,week}=isoWeekData(monday),sunday=new Date(monday);
  sunday.setDate(monday.getDate()+6);
  const label=d=>d.toLocaleDateString("nl-NL",{day:"numeric",month:"short"});
  $("#weekHeading").textContent=`Week ${week}`;
   const selector=$("#weekProjectSelect");
  const names=[...new Set(state.history.flatMap(d=>(d.segments||[]).map(seg=>seg.projectName).filter(Boolean)))].sort((a,b)=>a.localeCompare(b));
  selector.innerHTML='<option value="">All projects</option>'+names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("");
  if(!names.includes(weekProjectFilter))weekProjectFilter="";
  selector.value=weekProjectFilter;
  $("#weekRange").textContent=`${label(monday)} – ${label(sunday)} ${year}`;
  $("#weekNow").disabled=localDateKey(monday)===localDateKey(mondayOfWeek(new Date()));
  const weekdays=["ma","di","wo","do","vr","za","zo"];
  const projects=new Set();
  let totalMinutes=0,totalDistance=0,hasDistance=false,hasDraft=false;
  $("#weekTableBody").innerHTML=daysInWeek(monday).map(({date,entries},i)=>{
    let first=null,last=null,minutes=0,breaks=0,km=0,validDistance=false,finishedCount=0;
    for(const d of entries){
      const start=new Date(d.start).getTime(),end=d.stop?new Date(d.stop).getTime():NaN;
      if(Number.isFinite(start)&&(!first||start<first))first=start;
      if(Number.isFinite(end)&&(!last||end>last))last=end;
      if(Number.isFinite(start)&&Number.isFinite(end)&&end>=start){
        const pause=Math.max(0,Number(d.breakMin)||0);
        minutes+=Math.max(0,Math.floor((end-start)/60000)-pause);
        breaks+=pause;finishedCount++;
      } else hasDraft=true;
      for(const c of [d.commuteOut,d.commuteBack]){
        if(c&&Number.isFinite(Number(c.km))){km+=Math.max(0,Number(c.km));validDistance=true;}
      }
      for(const seg of d.segments||[])if(seg.projectName)projects.add(seg.projectName.trim());
    }
    if(weekProjectFilter){
      const matching=entries.flatMap(d=>(d.segments||[]).filter(seg=>seg.projectName===weekProjectFilter).map(seg=>({day:d,seg})));
      if(!matching.length){first=null;last=null;minutes=0;breaks=0;validDistance=false;finishedCount=0;km=0;}
      else{
        first=Math.min(...matching.map(x=>new Date(x.seg.start).getTime()));
        last=Math.max(...matching.map(x=>new Date(x.seg.stop).getTime()));
        minutes=0;breaks=0;finishedCount=0;km=0;validDistance=false;
        for(const d of entries){
          const all=(d.segments||[]),hits=all.filter(seg=>seg.projectName===weekProjectFilter);
          if(!hits.length||!d.stop)continue;
          const gross=Math.max(0,Math.floor((new Date(d.stop)-new Date(d.start))/60000));
          const selected=hits.reduce((v,seg)=>v+Math.max(0,Math.round((new Date(seg.stop)-new Date(seg.start))/60000)),0);
          const pause=Math.round((Number(d.breakMin)||0)*selected/Math.max(1,gross));
          minutes+=Math.max(0,selected-pause);breaks+=pause;finishedCount++;
          if(all.length===hits.length){
            for(const c of [d.commuteOut,d.commuteBack])if(c&&Number.isFinite(Number(c.km))){km+=Math.max(0,Number(c.km));validDistance=true;}
          }
        }
      }
    }
    totalMinutes+=minutes;if(validDistance){totalDistance+=km;hasDistance=true;}
    const blank=!entries.length,partial=!!entries.length&&(finishedCount!==entries.length||entries.some(d=>d.status!=="confirmed"));if(partial)hasDraft=true;
    const dateLabel=`${String(date.getDate()).padStart(2,"0")}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getFullYear()).slice(-2)}`;
    const startLabel=first!==null?weekClock(first):"—",endLabel=last!==null?weekClock(last):"—";
    const pauseLabel=finishedCount?`${Math.floor(breaks/60)}:${String(breaks%60).padStart(2,"0")}`:"—";
    const hoursLabel=finishedCount?weekDuration(minutes):"—";
    const distLabel=validDistance?weekKm(km):"—";
    return `<tr data-date="${localDateKey(date)}" class="${blank?"weekBlank":""} ${partial?"weekDraft":""} ${entries.length?"weekAction":""}"><td>${weekdays[i]}${partial?"*":""}</td><td>${dateLabel}</td><td>${startLabel}</td><td>${endLabel}</td><td>${pauseLabel}</td><td>${hoursLabel}</td><td>${distLabel}</td></tr>`;
  }).join("");
  $("#weekTotalHours").textContent=totalMinutes?weekDuration(totalMinutes):"—";
  $("#weekTotalKm").textContent=hasDistance?weekKm(totalDistance):"—";
  $("#weekProjects").textContent=weekProjectFilter||[...projects].filter(Boolean).join(" · ")||"—";
  $("#weekFilterInfo").textContent=weekProjectFilter?"Project hours: breaks divided proportionally. Journeys are shown only when the whole workday belongs to this project. Tap a row to edit.":"Tap a day to edit it. Hours exclude breaks; kilometres use registered journeys.";
  $("#weekDraftNote").classList.toggle("hidden",!hasDraft);
}
window.__WorkClockRestoreHistoryMode=()=>showHistoryMode(weekSheetMode);
function showHistoryMode(mode){
  weekSheetMode=mode==="week"?"week":"days";
  localStorage.setItem("workclock-history-mode",weekSheetMode);
  $("#historyDaysPanel").classList.toggle("hidden",weekSheetMode!=="days");
  $("#weekSheetPanel").classList.toggle("hidden",weekSheetMode!=="week");
  $("#historyShowDays").classList.toggle("active",weekSheetMode==="days");
  $("#historyShowWeek").classList.toggle("active",weekSheetMode==="week");
  $("#historyShowDays").setAttribute("aria-pressed",String(weekSheetMode==="days"));
  $("#historyShowWeek").setAttribute("aria-pressed",String(weekSheetMode==="week"));
  if(weekSheetMode==="week")renderWeekSheet();
}
function attentionDays(){
  const issues=[];
  const d=state.currentDay;
  if(d&&dayHasData(d)){
    if(d.start&&!d.stop){
      // A running shift is normal, including one crossing midnight.
      // Only a clock left running for over 24 hours needs review.
      const elapsed=Date.now()-new Date(d.start).getTime();
      if(Number.isFinite(elapsed)&&elapsed>24*3600000)
        issues.push({day:d,reason:"Workday still running after 24 hours"});
    }
    else if(d.start&&d.stop)issues.push({day:d,reason:"Unconfirmed workday"});
  }
  for(const day of state.history){
    if(day.status!=="confirmed")issues.push({day,reason:"Unconfirmed previous day"});
    else if(day.start&&day.stop&&!day.manuallyAdded&&day.workplaceId&&!day.commuteBack)issues.push({day,reason:"Return trip missing"});
    else if(!day.start||!day.stop||!day.segments?.length)issues.push({day,reason:"Incomplete workday"});
  }
  return issues;
}
function renderAttention(){
  const issues=attentionDays(),card=$("#attentionStrip");
  card.classList.toggle("hidden",issues.length===0);
  $("#attentionLabel").textContent=`${issues.length} workday${issues.length===1?"":"s"} need attention`;
  const nav=$("#attentionNav");if(nav){nav.textContent=String(issues.length);nav.classList.toggle("hidden",!issues.length)}
}
function jumpToAttention(){
  const first=attentionDays()[0];if(!first)return;
  if(first.day===state.currentDay){window.__activateWorkClockView?.("today");return}
  const index=state.history.slice().sort((a,b)=>new Date(b.start)-new Date(a.start)).findIndex(d=>d.id===first.day.id);
  if(index>=historyLimit){historyLimit=index+1;renderHistory()}
  showHistoryMode("days");const el=$("#historyList").querySelector('[data-day-id="'+first.day.id+'"]');
  el?.scrollIntoView({behavior:"smooth",block:"center"});
}
let historyLimit=60;
function renderHistory(){const box=$("#historyList");$("#clearHistory").closest(".section").classList.toggle("hidden",!state.history.length);if(!state.history.length){box.innerHTML='<div class="meta">No confirmed workdays yet.</div>';$("#historyShowOlder").classList.add("hidden");return}box.innerHTML="";for(const d of state.history.slice().sort((a,b)=>new Date(b.start)-new Date(a.start)).slice(0,historyLimit)){const ms=Math.max(0,new Date(d.stop)-new Date(d.start)-d.breakMin*60000),km=(d.commuteOut?.km||0)+(d.commuteBack?.km||0),el=document.createElement("div");el.className="historyItem";el.dataset.dayId=d.id;el.innerHTML=`<div class="historyTop"><strong>${fmtDate(d.start)}</strong><strong>${fmtDuration(ms)}</strong></div><div class="meta">${fmtTime(d.start)}–${fmtTime(d.stop)} · break ${d.breakMin} min · ${km.toFixed(1)} km${d.manuallyAdded?" · manual entry":""}</div>${projectLines(d)}${d.commuteOut?`<div class="meta" style="margin-top:7px">${esc(d.commuteOut.from)} → ${esc(d.commuteOut.to)}: ${d.commuteOut.km.toFixed(1)} km</div>`:""}${d.commuteBack?`<div class="meta">${esc(d.commuteBack.from)} → ${esc(d.commuteBack.to)}: ${d.commuteBack.km.toFixed(1)} km</div>`:(!d.manuallyAdded&&d.workplaceId?`<div class="notice">Return route pending · open WorkClock at a saved home.</div>`:"")}<div class="buttonRow" style="margin-top:10px"><button class="hold mini editDay"><div class="fill"></div><span>HOLD TO EDIT</span></button><button class="hold mini danger deleteDay"><div class="fill"></div><span>HOLD TO DELETE</span></button></div>`;wireHold(el.querySelector(".editDay"),()=>beginEditDay(d.id));wireHold(el.querySelector(".deleteDay"),()=>deletePastDay(d.id));box.appendChild(el)}
const older=$("#historyShowOlder"),remaining=Math.max(0,state.history.length-historyLimit);
older.classList.toggle("hidden",remaining===0);older.textContent=remaining?`Show older workdays (${remaining} remaining)`:"";}
let renderInitialized=false;
function renderAll(){
  renderStatus();renderToday();renderProjectSuggestions();renderAttention();
  if(!renderInitialized){renderLocations();renderSettings();renderHistory();renderInitialized=true;return}
  const active=document.querySelector(".view.active")?.dataset.view;
  if(active==="places")renderLocations();
  // Settings inputs are intentionally left alone while the user is editing them.
  else if(active==="history"){renderHistory();if(weekSheetMode==="week")renderWeekSheet()}
}
window.__WorkClockRefreshView=function(name){
  if(name==="history"){renderHistory();renderAttention();if(weekSheetMode==="week")renderWeekSheet()}
  else if(name==="places"){renderLocations();refreshAndroidStatus()}
  else if(name==="settings")renderSettings();
};
function updateTimer(){const d=getToday();let ms=0;if(d.start)ms=(d.stop?new Date(d.stop):new Date())-new Date(d.start);$("#timer").textContent=fmtTimer(ms)}
function confirmToday(){const d=getToday(),err=coverageError(d);if(err){setNotice("mainMessage",err,"bad");return}const returnPending=!!(d.workplaceId&&!d.commuteBack&&!d.manuallyAdded);d.status="confirmed";state.history.push(deepCopy(d));state.history.sort((a,b)=>new Date(a.start)-new Date(b.start));state.currentDay=blankDay();persist();saveSafetySnapshot("Confirmed workday");writeBackupToFolder(true);renderAll();setNotice("mainMessage",returnPending?"Workday confirmed. Return route is pending and will be added when WorkClock sees you at a saved home.":"Workday confirmed and added to history.","good")}
function clearToday(){if(!confirm("Clear today's unconfirmed draft?"))return;saveSafetySnapshot("Before clearing draft");state.currentDay=blankDay();persist();renderAll();setNotice("mainMessage","Today's draft cleared.")}

function updateManualModeUI(){const mode=$("#manualDistanceMode").value,auto=mode==="auto",manual=mode==="manual",keep=mode==="keep";$("#manualStartHome").disabled=!auto;$("#manualEndHome").disabled=!auto;$("#manualCalculate").disabled=!auto;$("#manualKm").disabled=!manual;$("#manualDistanceMode").querySelector('option[value="keep"]').disabled=!manualEditDayId;if(keep&&!manualEditDayId)$("#manualDistanceMode").value="auto"}
async function manualDistancePreview(){const w=locationById($("#manualWork").value),h1=locationById($("#manualStartHome").value),h2=locationById($("#manualEndHome").value);if(w?.type!=="work"||h1?.type!=="home"||h2?.type!=="home"){setNotice("manualMessage","Choose a workplace, start home and return home.","bad");return null}setNotice("manualMessage","Calculating road distances…");const out=await routeBetween(h1,w),back=await routeBetween(w,h2);if(!out||!back){setNotice("manualMessage","Road-distance calculation failed. Check internet/routing settings.","bad");return null}const result={out,back,h1,h2,w,total:out.km+back.km};setNotice("manualMessage",`${h1.name} → ${w.name}: ${out.km.toFixed(1)} km · ${w.name} → ${h2.name}: ${back.km.toFixed(1)} km · total ${result.total.toFixed(1)} km`,"good");return result}
function repeatPreviousWorkday(){
  if(manualEditDayId)return setNotice("manualMessage","Cancel editing before copying another workday.","bad");
  const previous=state.history.filter(d=>d.start&&d.stop).sort((a,b)=>new Date(b.start)-new Date(a.start))[0];
  if(!previous)return setNotice("manualMessage","No completed workday to copy yet.","bad");
  const target=$("#manualDate").value;
  $("#manualStart").value=timeValue(previous.start);
  $("#manualFinish").value=timeValue(previous.stop);
  $("#manualBreak").value=String(previous.breakMin||0);
  $("#manualWork").value=previous.workplaceId||"";
  $("#manualStartHome").value=previous.startHomeId||"";
  $("#manualEndHome").value=previous.endHomeId||"";
  const canAuto=!!(previous.workplaceId&&previous.startHomeId&&previous.endHomeId);
  $("#manualDistanceMode").value=canAuto?"auto":"manual";
  $("#manualKm").value=((Number(previous.commuteOut?.km)||0)+(Number(previous.commuteBack?.km)||0)).toFixed(1);
  manualSegmentDraft=(previous.segments||[]).map((seg,i,all)=>({
    id:uid("draftseg"),projectName:seg.projectName||"",
    endTime:i<all.length-1?timeValue(seg.stop):null,endISO:null
  }));
  if(!manualSegmentDraft.length)manualSegmentDraft=[{id:uid("draftseg"),projectName:"",endTime:null,endISO:null}];
  $("#manualDate").value=target;
  renderManualSegments();updateManualModeUI();
  setNotice("manualMessage","Previous workday copied. Check the date, hours, workplace and kilometres before saving.","good");
}
function resetManualEditor(){manualEditDayId=null;manualOriginalTimestamps=null;const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);$("#manualTitle").textContent="Add a past workday manually";$("#manualSubtitle").textContent="For missed detection, forgotten registration, or work from before the app existed.";$("#manualDate").value=localDateKey(yesterday);$("#manualStart").value="07:00";$("#manualFinish").value="16:00";$("#manualBreak").value="30";$("#manualDistanceMode").value="auto";$("#manualKm").value="";$("#manualSaveHold span").textContent="HOLD TO ADD PAST WORKDAY";$("#cancelManualEdit").disabled=true;manualSegmentDraft=[{id:uid("draftseg"),projectName:"",endTime:null,endISO:null}];renderManualSegments();updateManualModeUI();setNotice("manualMessage","Choose the details for the historical workday.")}
function beginEditDay(id){const d=findDay(id);if(!d||d===state.currentDay)return;manualEditDayId=id;manualOriginalTimestamps={date:d.date||localDateKey(new Date(d.start)),startISO:d.start,stopISO:d.stop,startTime:timeValue(d.start),finishTime:timeValue(d.stop)};$("#manualTitle").textContent="Edit past workday";$("#manualSubtitle").textContent=`Editing ${fmtDate(d.start)}. Saving replaces this historical record.`;$("#manualDate").value=manualOriginalTimestamps.date;$("#manualStart").value=manualOriginalTimestamps.startTime;$("#manualFinish").value=manualOriginalTimestamps.finishTime;$("#manualBreak").value=String(d.breakMin);fillLocationSelects();$("#manualWork").value=d.workplaceId||"";$("#manualStartHome").value=d.startHomeId||"";$("#manualEndHome").value=d.endHomeId||"";$("#manualDistanceMode").value="keep";$("#manualKm").value=((d.commuteOut?.km||0)+(d.commuteBack?.km||0)).toFixed(1);manualSegmentDraft=(d.segments||[]).map((s,i,a)=>({id:s.id||uid("draftseg"),projectName:s.projectName||"",endTime:i<a.length-1?timeValue(s.stop):null,endISO:i<a.length-1?s.stop:null}));if(!manualSegmentDraft.length)manualSegmentDraft=[{id:uid("draftseg"),projectName:"",endTime:null,endISO:null}];$("#manualSaveHold span").textContent="HOLD TO SAVE CHANGES";$("#cancelManualEdit").disabled=false;renderManualSegments();updateManualModeUI();setNotice("manualMessage","Edit the day, then hold Save Changes.","good");$("#manualCard").classList.remove("collapsed");window.__activateWorkClockView?.("history");setTimeout(()=>$("#manualCard").scrollIntoView({behavior:"smooth",block:"start"}),40)}
function deletePastDay(id){const d=state.history.find(x=>x.id===id);if(!d)return;saveSafetySnapshot("Before deleting workday");state.history=state.history.filter(x=>x.id!==id);if(manualEditDayId===id)resetManualEditor();persist();renderHistory();renderAttention();setNotice("mainMessage",`Deleted ${fmtDate(d.start)} from history.`,"good")}
function renderManualSegments(){const box=$("#manualSegments");box.innerHTML="";manualSegmentDraft.forEach((seg,i)=>{const last=i===manualSegmentDraft.length-1,el=document.createElement("div");el.className=`manualSegment ${last?"last":""}`;el.dataset.segmentId=seg.id;el.innerHTML=`<div><label>Project ${i+1}</label><input class="segProject" list="projectSuggestions" autocomplete="off" placeholder="Type or choose project" value="${esc(seg.projectName)}"></div>${last?'<div><label>Ends</label><div class="until">At workday finish</div></div>':`<div><label>Ends at</label><input class="segEnd" type="time" value="${esc(seg.endTime||"")}"></div><button class="btn small removeSeg" title="Remove split">×</button>`}`;el.querySelector(".segProject").addEventListener("input",e=>seg.projectName=e.target.value);if(!last){el.querySelector(".segEnd").addEventListener("input",e=>{seg.endTime=e.target.value;seg.endISO=null});el.querySelector(".removeSeg").addEventListener("click",()=>{manualSegmentDraft.splice(i,1);renderManualSegments()})}box.appendChild(el)})}
function addManualSegmentSplit(){const start=$("#manualStart").value,finish=$("#manualFinish").value;if(!start||!finish)return setNotice("manualMessage","Set start and finish first.","bad");let prev=start;if(manualSegmentDraft.length>1)prev=manualSegmentDraft[manualSegmentDraft.length-2].endTime||start;const a=parseTime(prev),b=parseTime(finish)+(parseTime(finish)<=a?1440:0);if(b-a<10)return setNotice("manualMessage","There is not enough time left for another project section.","bad");const mid=(a+Math.round((b-a)/2/5)*5)%1440,p=n=>String(n).padStart(2,"0"),midStr=`${p(Math.floor(mid/60))}:${p(mid%60)}`;manualSegmentDraft.splice(manualSegmentDraft.length-1,0,{id:uid("draftseg"),projectName:"",endTime:midStr,endISO:null});renderManualSegments()}
function buildManualSegments(start,finish){if(!manualSegmentDraft.length)return {error:"At least one project section is required."};const out=[];let cursor=new Date(start);for(let i=0;i<manualSegmentDraft.length;i++){const draft=manualSegmentDraft[i],name=String(draft.projectName||"").trim();if(!name)return {error:`Project ${i+1} needs a name.`};let end;if(i===manualSegmentDraft.length-1)end=new Date(finish);else{if(!draft.endTime)return {error:`Project ${i+1} needs an end time.`};end=draft.endISO?new Date(draft.endISO):localDateTime($("#manualDate").value,draft.endTime);while(end<=cursor&&!draft.endISO)end.setDate(end.getDate()+1);if(!(end>cursor))return {error:`Project ${i+1} must end after it starts.`};if(end>=finish)return {error:`Project ${i+1} must end before the workday finish.`}}const p=ensureProject(name);out.push({id:draft.id?.startsWith("seg-")?draft.id:uid("seg"),start:cursor.toISOString(),stop:end.toISOString(),projectId:p.id,projectName:p.name,createdAt:nowISO()});cursor=new Date(end)}return {segments:out}}
async function saveManualDay(){const date=$("#manualDate").value,startTime=$("#manualStart").value,finishTime=$("#manualFinish").value,breakMin=Number($("#manualBreak").value)||0,mode=$("#manualDistanceMode").value;if(!date||!startTime||!finishTime){setNotice("manualMessage","Date, start and finish are required.","bad");return}let start=(manualEditDayId&&manualOriginalTimestamps&&date===manualOriginalTimestamps.date&&startTime===manualOriginalTimestamps.startTime)?new Date(manualOriginalTimestamps.startISO):localDateTime(date,startTime),finish=(manualEditDayId&&manualOriginalTimestamps&&date===manualOriginalTimestamps.date&&finishTime===manualOriginalTimestamps.finishTime)?new Date(manualOriginalTimestamps.stopISO):localDateTime(date,finishTime);if(!start||!finish){setNotice("manualMessage","Invalid date or time.","bad");return}if(finish<=start)finish.setDate(finish.getDate()+1);if(finish-start>24*3600000){setNotice("manualMessage","Workday cannot exceed 24 hours.","bad");return}const built=buildManualSegments(start,finish);if(built.error){setNotice("manualMessage",built.error,"bad");return}const existing=manualEditDayId?state.history.find(x=>x.id===manualEditDayId):null,day=existing?deepCopy(existing):blankDay(date);day.date=date;day.start=start.toISOString();day.stop=finish.toISOString();day.breakMin=breakMin;day.startSource=existing?.startSource||"manual-history";day.stopSource=existing?.stopSource||"manual-history";day.status="confirmed";day.manuallyAdded=existing?.manuallyAdded??true;day.segments=built.segments;const work=locationById($("#manualWork").value);day.workplaceId=work?.type==="work"?work.id:null;if(mode==="auto"){const calc=await manualDistancePreview();if(!calc)return;day.startHomeId=calc.h1.id;day.endHomeId=calc.h2.id;day.workplaceId=calc.w.id;day.commuteOut={fromId:calc.h1.id,toId:calc.w.id,from:calc.h1.name,to:calc.w.name,km:calc.out.km,source:calc.out.source,at:day.start};day.commuteBack={fromId:calc.w.id,toId:calc.h2.id,from:calc.w.name,to:calc.h2.name,km:calc.back.km,source:calc.back.source,at:day.stop}}else if(mode==="manual"){const km=Number($("#manualKm").value);if(!Number.isFinite(km)||km<0){setNotice("manualMessage","Enter valid total kilometres.","bad");return}day.startHomeId=null;day.endHomeId=null;day.commuteOut={fromId:null,toId:work?.id||null,from:"Manual total",to:work?.name||"Work",km,source:"manual kilometres",at:day.start};day.commuteBack=null}else if(mode==="none"){day.startHomeId=null;day.endHomeId=null;day.commuteOut=null;day.commuteBack=null}else if(mode==="keep"&&!existing){setNotice("manualMessage","There are no existing kilometres to keep.","bad");return}const err=coverageError(day);if(err){setNotice("manualMessage",err,"bad");return}if(existing){saveSafetySnapshot("Before editing workday");const ix=state.history.findIndex(x=>x.id===existing.id);state.history[ix]=day}else state.history.push(day);state.history.sort((a,b)=>new Date(a.start)-new Date(b.start));persist();writeBackupToFolder(true);renderAll();const msg=existing?`Saved changes to ${fmtDate(day.start)}.`:`Added ${fmtDate(day.start)}, ${fmtTime(day.start)}–${fmtTime(day.stop)}.`;resetManualEditor();setNotice("manualMessage",msg,"good")}
function saveSettings(){const r=Number($("#defaultRadius").value);if(!Number.isFinite(r)||r<30){setNotice("settingsMessage","Default radius must be at least 30 m.","bad");return}state.settings.startFrom=$("#startFrom").value;state.settings.startUntil=$("#startUntil").value;state.settings.finishFrom=$("#finishFrom").value;state.settings.finishUntil=$("#finishUntil").value;state.settings.defaultRadius=r;state.settings.routingProvider=$("#routingProvider").value;state.settings.orsKey=$("#orsKey").value.trim();state.routeCache={};persist();renderAll();setNotice("settingsMessage","Settings saved. Route cache cleared.","good")}

function simulationSelection(){return {h:locationById($("#simHome").value),w:locationById($("#simWork").value)}}
function simAtHome(){const {h}=simulationSelection();if(h?.type!=="home")return setNotice("simMessage","Choose a home first.","bad");currentPosition={lat:h.lat,lon:h.lon};updatePresence(h,"simulation");renderStatus(h,"simulation");setNotice("simMessage",`Simulated position set to ${h.name}.`,"good")}
function simArrive(){const {h,w}=simulationSelection();if(h?.type!=="home"||w?.type!=="work")return setNotice("simMessage","Choose both a home and a workplace.","bad");currentPosition={lat:w.lat,lon:w.lon};state.presence.currentId=h.id;state.presence.currentType="home";state.presence.currentName=h.name;state.presence.lastHomeId=h.id;persist();setNotice("simMessage",`Simulating ${h.name} → ${w.name}.`,"good");processPosition(currentPosition,{source:"simulation",force:true,forcePreviousId:h.id})}
function simLeave(){const {w}=simulationSelection();if(w?.type!=="work")return setNotice("simMessage","Choose a workplace.","bad");const d=getToday();if(!d.start||d.stop)return setNotice("simMessage","Start a running work session first.","bad");state.presence.currentId=w.id;state.presence.currentType="work";state.presence.currentName=w.name;state.presence.lastWorkId=w.id;persist();const pos={lat:w.lat+(w.radius+300)/111320,lon:w.lon};currentPosition=pos;setNotice("simMessage",`Simulating departure from ${w.name}.`,"good");processPosition(pos,{source:"simulation",force:true,forcePreviousId:w.id})}
function simReturn(){const {h,w}=simulationSelection();if(h?.type!=="home"||w?.type!=="work")return setNotice("simMessage","Choose both a home and a workplace.","bad");const live=state.currentDay&&state.currentDay.start&&!state.currentDay.commuteBack?state.currentDay:null,pending=pendingReturnDay(),target=live||pending;if(!target)return setNotice("simMessage","There is no current or recently confirmed workday waiting for a return-home route.","bad");const origin=locationById(target.workplaceId)||w;if(origin?.type!=="work")return setNotice("simMessage","The pending workday has no saved workplace.","bad");state.presence.currentId=origin.id;state.presence.currentType="work";state.presence.currentName=origin.name;state.presence.lastWorkId=origin.id;persist();currentPosition={lat:h.lat,lon:h.lon};setNotice("simMessage",`Simulating ${origin.name} → ${h.name}.`,"good");processPosition(currentPosition,{source:"simulation",force:true,forcePreviousId:origin.id})}

$("#attentionStrip").addEventListener("click",jumpToAttention);
$("#historyShowOlder").addEventListener("click",()=>{historyLimit+=60;renderHistory()});
$("#historyShowDays").addEventListener("click",()=>showHistoryMode("days"));
$("#historyShowWeek").addEventListener("click",()=>showHistoryMode("week"));
$("#weekPrevious").addEventListener("click",()=>{weekSheetAnchor=mondayOfWeek(weekSheetAnchor||new Date());weekSheetAnchor.setDate(weekSheetAnchor.getDate()-7);renderWeekSheet()});
$("#weekNext").addEventListener("click",()=>{weekSheetAnchor=mondayOfWeek(weekSheetAnchor||new Date());weekSheetAnchor.setDate(weekSheetAnchor.getDate()+7);renderWeekSheet()});
$("#repeatPreviousDay").addEventListener("click",repeatPreviousWorkday);
$("#weekNow").addEventListener("click",()=>{weekSheetAnchor=mondayOfWeek(new Date());renderWeekSheet()});
function finishWeekNumberEdit(apply){
  const editor=$("#weekInlineEdit"),input=$("#weekInlineNumber"),heading=$("#weekHeading");
  if(editor.classList.contains("hidden"))return;
  if(apply){
    const year=isoWeekData(mondayOfWeek(weekSheetAnchor||new Date())).year;
    const week=Number(input.value);
    const lastWeek=isoWeekData(mondayOfWeek(new Date(year,11,28,12))).week;
    if(input.value.trim()===""||!Number.isInteger(week)||week<1||week>lastWeek){
      input.setCustomValidity("Choose a week between 1 and "+lastWeek);
      input.reportValidity();
      input.focus();
      return;
    }
    const monday=mondayOfWeek(new Date(year,0,4,12));
    monday.setDate(monday.getDate()+7*(week-1));
    weekSheetAnchor=monday;
  }
  input.setCustomValidity("");
  editor.classList.add("hidden");
  heading.classList.remove("hidden");
  if(apply)renderWeekSheet();
}
$("#weekHeading").addEventListener("click",()=>{
  const anchor=mondayOfWeek(weekSheetAnchor||new Date()),{year,week}=isoWeekData(anchor);
  const input=$("#weekInlineNumber");
  input.value=String(week);
  input.max=String(isoWeekData(mondayOfWeek(new Date(year,11,28,12))).week);
  input.setCustomValidity("");
  $("#weekHeading").classList.add("hidden");
  $("#weekInlineEdit").classList.remove("hidden");
  input.focus();
  input.select();
});
$("#weekInlineEdit").addEventListener("submit",e=>{e.preventDefault();finishWeekNumberEdit(true)});
$("#weekInlineNumber").addEventListener("input",e=>e.target.setCustomValidity(""));
$("#weekInlineNumber").addEventListener("keydown",e=>{
  if(e.key==="Escape"){e.preventDefault();finishWeekNumberEdit(false)}
});
$("#weekInlineNumber").addEventListener("blur",e=>{
  if(e.relatedTarget&&$("#weekInlineEdit").contains(e.relatedTarget))return;
  finishWeekNumberEdit(true);
});
$("#weekProjectSelect").addEventListener("change",e=>{weekProjectFilter=e.target.value;renderWeekSheet()});
$("#weekTableBody").addEventListener("click",e=>{
  const tr=e.target.closest("tr[data-date]");if(!tr)return;
  const found=state.history.filter(d=>(d.date||localDateKey(new Date(d.start)))===tr.dataset.date);
  if(found.length===1){showHistoryMode("days");beginEditDay(found[0].id)}
  else if(found.length>1){showHistoryMode("days");$("#historyList").querySelector('[data-day-id="'+found[0].id+'"]')?.scrollIntoView({behavior:"smooth",block:"center"})}
  else if(state.currentDay?.date===tr.dataset.date){window.__activateWorkClockView?.("today")}
});

wireHold($("#mainHold"),()=>{const d=getToday();if(!d.start)applyStart(nowISO(),"manual-hold");else if(!d.stop)showTimeChoice("stop","Manual finish. When did you actually finish?")});
wireHold($("#confirmDayHold"),confirmToday);wireHold($("#saveCurrentHome"),()=>addCurrentLocation("home"));wireHold($("#saveCurrentWork"),()=>addCurrentLocation("work"));wireHold($("#manualSaveHold"),saveManualDay);wireHold($("#clearHistory"),()=>{saveSafetySnapshot("Before clearing history");state.history=[];if(manualEditDayId)resetManualEditor();persist();renderHistory();renderAttention();setNotice("mainMessage","All confirmed history cleared.","good")});
$("#endProject").addEventListener("click",endProjectNow);$("#saveProjectModal").addEventListener("click",saveProjectNaming);$("#cancelProjectModal").addEventListener("click",cancelProjectNaming);$("#projectModalInput").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();saveProjectNaming()}});
$("#editStart").addEventListener("click",()=>showTimeChoice("start","Change today's start time."));$("#editStop").addEventListener("click",()=>showTimeChoice("stop","Change today's finish time."));$("#clearDraft").addEventListener("click",clearToday);$("#enableLocation").addEventListener("click",requestLocation);$("#enableNotifications").addEventListener("click",enableNotifications);$("#testNotification").addEventListener("click",testNotification);$("#closeTimeModal").addEventListener("click",hideTimeChoice);$("#confirmCustomTime").addEventListener("click",confirmCustomTime);$("#timeModal").addEventListener("click",e=>{if(e.target===$("#timeModal"))hideTimeChoice()});
$("#fillCurrentLocation").addEventListener("click",()=>{if(!currentPosition)return setNotice("locationEditorMessage","No current GPS position available.","bad");$("#locLat").value=currentPosition.lat;$("#locLon").value=currentPosition.lon;setNotice("locationEditorMessage","Filled current GPS coordinates.","good")});$("#saveLocation").addEventListener("click",saveLocationEditor);$("#cancelLocationEdit").addEventListener("click",resetLocationEditor);$("#saveSettings").addEventListener("click",saveSettings);$("#clearRouteCache").addEventListener("click",()=>{state.routeCache={};persist();setNotice("settingsMessage","Route cache cleared.","good")});
$("#enableNativeBackground").addEventListener("click",()=>{WorkClockAndroid.requestBackgroundTracking();setNotice("nativeTrackingHelp","Follow the Android permission screens, then reopen WorkClock. Choose Allow all the time where available.");});
// Native-only updater; leaves the existing web UI and saved data untouched.
const updateBox=$("#updatesSetting"),updateButton=$("#checkUpdates"),installButton=$("#installUpdate");
window.__WorkClockUpdateStatus=function(info){
  if(!info)return;
  const message=String(info.message||"");
  const stateName=String(info.state||"");
  if(stateName==="error")localStorage.removeItem("workclock-update-checked-at");
  setNotice("updateMessage",message,stateName==="error"||stateName==="migration"?"bad":stateName==="current"?"good":undefined);
  updateButton.disabled=stateName==="checking"||stateName==="downloading"||stateName==="installing";
  installButton.classList.toggle("hidden",stateName!=="available");
  installButton.disabled=stateName!=="available";
};
$("#updateVersion").textContent=`Installed: WorkClock ${WorkClockAndroid.appVersion()}`;
updateButton.addEventListener("click",()=>WorkClockAndroid.checkForUpdates());
installButton.addEventListener("click",()=>WorkClockAndroid.installUpdate());
// Check once on launch; the updater performs HTTP/network work off the UI thread.
const lastUpdateCheck=Number(localStorage.getItem("workclock-update-checked-at")||0);
if(!lastUpdateCheck||Date.now()-lastUpdateCheck>24*3600000){
  setTimeout(()=>{WorkClockAndroid.checkForUpdates();localStorage.setItem("workclock-update-checked-at",String(Date.now()))},1500);
}

$("#restoreSnapshot").addEventListener("click",restoreSafetySnapshot);
$("#chooseBackupFolder").addEventListener("click",()=>WorkClockAndroid.selectBackupFolder());
$("#exportBackup").addEventListener("click",exportWorkClockBackup);
$("#importBackup").addEventListener("click",importWorkClockBackup);
$("#simAtHome").addEventListener("click",simAtHome);$("#simArriveWork").addEventListener("click",simArrive);$("#simLeaveWork").addEventListener("click",simLeave);$("#simReturnHome").addEventListener("click",simReturn);$("#manualDistanceMode").addEventListener("change",updateManualModeUI);$("#manualCalculate").addEventListener("click",manualDistancePreview);$("#addManualSegment").addEventListener("click",addManualSegmentSplit);$("#cancelManualEdit").addEventListener("click",resetManualEditor);$("#manualStart").addEventListener("change",renderManualSegments);$("#manualFinish").addEventListener("change",renderManualSegments);

resetLocationEditor();resetManualEditor();maybeDailySnapshot();renderAll();showFolderBackupStatus();refreshPermissionUI();syncAndroidEvents();
function manageVisibleTimer(){
  if(document.hidden){if(timerInterval!==null){clearInterval(timerInterval);timerInterval=null}return}
  updateTimer();
  if(timerInterval===null)timerInterval=setInterval(updateTimer,1000);
}
document.addEventListener("visibilitychange",manageVisibleTimer);
window.__WorkClockTimerResume=manageVisibleTimer;
manageVisibleTimer();

})();
