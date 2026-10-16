/* Standalone regression checks for the in-app Weekstaat, using built-in Node modules only. */
const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const html=fs.readFileSync("app/src/main/assets/index.html","utf8");
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
for(const [index,script] of scripts.entries())new vm.Script(script,{filename:`workclock-inline-${index}.js`});
assert(html.includes('id="weekSheetPanel"'));
assert(html.includes('id="weekTableBody"'));
for(const col of ["dag","datum","van","tot","pauze","totaal","zakelijke km"])assert(html.includes('>'+col+'</th>'));
const marker="// Weekstaat is a temporary view";
const start=html.indexOf(marker),end=html.indexOf("function renderHistory(){",start);
assert(start!==-1&&end>start,"Weekstaat calculations must exist");
const state={history:[],currentDay:null};
const elements=new Map();
function element(id){
  if(!elements.has(id))elements.set(id,{textContent:"",innerHTML:"",disabled:false,
    classList:{toggle(){}},setAttribute(){}});
  return elements.get(id);
}
const context=vm.createContext({
  state, Date,Intl,Map,Set,Math,Number,String,Array,
  localDateKey:d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-"),
  fmtTime:iso=>new Date(iso).toISOString().slice(11,16),
  $:selector=>element(selector.slice(1))
});
vm.runInContext(html.slice(start,end),context,{filename:"weekstaat.js"});
const run=expr=>vm.runInContext(expr,context);
const info=date=>run(`isoWeekData(mondayOfWeek(new Date(${JSON.stringify(date)})))`);
assert.equal(info("2026-09-28T12:00:00").week,40);
assert.equal(info("2025-12-29T12:00:00").year,2026);
assert.equal(info("2025-12-29T12:00:00").week,1);
assert.equal(info("2021-01-01T12:00:00").year,2020);
assert.equal(info("2021-01-01T12:00:00").week,53);
assert.equal(run("weekKm(46)"),"46");
assert.equal(run("weekKm(46.25)"),"46.3");
assert.equal(run("weekDuration(390)"),"6u30");
const make=(date,start,stop,pause=30,km=46)=>({
  date,start:date+"T"+start+":00",stop:stop?date+"T"+stop+":00":null,
  breakMin:pause,status:stop?"confirmed":"draft",
  commuteOut:km===null?null:{km:km/2},commuteBack:km===null?null:{km:km/2},
  segments:stop?[{projectName:"My Jewelry Marseille"}]:[]
});
state.history.push(
 make("2026-09-28","07:00","16:00"),
 make("2026-09-29","08:00","15:00"),
 make("2026-10-01","07:00","16:00"),
 make("2026-10-02","07:00","16:00")
);
run('weekSheetAnchor=mondayOfWeek(new Date(2026,8,28,12));renderWeekSheet()');
assert.equal(element("weekHeading").textContent,"Week 40");
assert.equal(element("weekTotalHours").textContent,"32u00");
assert.equal(element("weekTotalKm").textContent,"184");
assert.equal((element("weekTableBody").innerHTML.match(/<tr /g)||[]).length,7);
assert.match(element("weekTableBody").innerHTML,/<td>ma<\/td><td>28-09<\/td><td>07:00<\/td><td>16:00<\/td><td>0:30<\/td><td>8u30<\/td><td>46<\/td>/);
assert.match(element("weekTableBody").innerHTML,/<td>wo<\/td><td>30-09<\/td><td>—<\/td>/);
assert.match(element("weekProjects").textContent,/My Jewelry Marseille/);
state.currentDay=make("2026-10-16","07:00",null);
run('weekSheetAnchor=mondayOfWeek(new Date(2026,9,16,12));renderWeekSheet()');
assert.match(element("weekTableBody").innerHTML,/<td>vr\*<\/td><td>16-10<\/td><td>07:00<\/td><td>—<\/td>/);
assert.equal(element("weekTotalHours").textContent,"—");
state.currentDay=null;
state.history.push(make("2026-09-28","17:00","19:00",0,0));
run('weekSheetAnchor=mondayOfWeek(new Date(2026,8,28,12));renderWeekSheet()');
assert.equal(element("weekTotalHours").textContent,"34u00");
assert.equal(element("weekTotalKm").textContent,"184");
console.log("Weekstaat: inline JavaScript, ISO weeks, rows, totals, draft, kilometres and project tests passed.");
