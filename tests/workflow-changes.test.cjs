/* Local Node regressions for the November 2026 WorkClock adjustments. No APK mocks shipped. */
'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = 'app/src/main/';
const js = fs.readFileSync(root+'assets/app.js','utf8');
const html = fs.readFileSync(root+'assets/index.html','utf8');
const css = fs.readFileSync(root+'assets/style.css','utf8');
const scheduler = fs.readFileSync(root+'java/nl/workclock/app/WorkReminderScheduler.kt','utf8');
const geo = fs.readFileSync(root+'java/nl/workclock/app/GeoReceiver.kt','utf8');
const between = (a,b)=>{
  const start = js.indexOf(a), end = js.indexOf(b,start+a.length);
  assert(start>=0&&end>start,`Missing section: ${a}`);
  return js.slice(start,end);
};
const base=vm.createContext({Date,Number,String,Math,localDateKey:d=>d.toISOString().slice(0,10)});
base.state={workGeofences:{arrive:{at:Date.now()-4*60000},leave:{at:Date.now()-7*60000}}};
vm.runInContext(between('function recentWorkTime(','function closeWorkReminder('),base);
const now=Date.now();
assert.equal(new Date(base.recentWorkTime('start',now)).getTime(),base.state.workGeofences.arrive.at);
assert.equal(base.recentWorkTime('stop',now),null,'Seven minute departure must prompt for time');
assert.equal(base.recentWorkTime('start',now,now-5*60000),new Date(now-5*60000).toISOString());
assert.equal(base.recentWorkTime('start',now,now-5*60000-1),null);

// Picker should show full list when refocused after a click, regardless of selection.
function node(){return {value:'',listeners:{},children:[],classList:{add(){},remove(){}},addEventListener(k,fn){this.listeners[k]=fn},appendChild(child){this.children.push(child)},blur(){},set innerHTML(s){this.children=[]},get innerHTML(){return ''},removeAttribute(){}}}
const state={projects:[{name:'My Jewelry',lastUsedAt:'2026-10-01'},{name:'Stella Maris',lastUsedAt:'2026-09-01'},{name:'Work',lastUsedAt:'2026-09-03'}]};
const pick=vm.createContext({state,Set,Date,String,document:{createElement:node},setTimeout:()=>{},console});
vm.runInContext(between('function projectNames()','function isAutomationDay('),pick);
const input=node(),list=node();
pick.wireProjectPicker(input,list);
input.listeners.focus();assert.equal(list.children.length,3);
input.value='jew';input.listeners.input();assert.equal(list.children.length,1);
list.children[0].listeners.click();assert.equal(input.value,'My Jewelry');
input.listeners.focus();assert.equal(list.children.length,3,'Selecting a project must not filter the list on reopening');

// 24-hour rule is based on actual visits, not every data redraw.
const anchorSource=between('const WEEK_LAST_VISIT_KEY=','function isoWeekData(');
const storage=new Map([['workclock-week-anchor','2026-10-05'],['workclock-week-last-visit',String(now-25*3600000)]]);
const week=vm.createContext({Date,Number,String,Math,localStorage:{getItem:key=>storage.get(key),setItem:(key,v)=>storage.set(key,v)},localDateKey:d=>d.toISOString().slice(0,10)});
vm.runInContext(anchorSource,week);
week.markWeekViewed();assert.equal(week.weekSheetAnchor?.getTime?.()??vm.runInContext('weekSheetAnchor.getTime()',week),vm.runInContext('mondayOfWeek(new Date()).getTime()',week));
storage.set('workclock-week-last-visit',String(now-3600000));
vm.runInContext('weekSheetAnchor=new Date(2026,9,5,12);markWeekViewed();',week);
assert.equal(vm.runInContext('weekSheetAnchor.getDate()',week),5,'Recently viewed historical week should remain');

assert(!html.includes('list="projectSuggestions"'),'Native Android datalist should not be used');
assert(html.includes('id="projectPickerList"')&&css.includes('.projectPickerList'));
assert(html.includes('id="strongReminders"'));
assert(js.includes('const choices=[["Now",0],["5 min",5],["10 min",10],["15 min",15],["30 min",30],["1 hour",60],["2 hours",120],["3 hours",180]]'));
assert(js.includes('className="timeChoiceSkip"'));
assert(css.includes('weekControls #weekNow:disabled'));
assert(js.includes('localDateKey(date)===todayKey?"weekToday"'));
assert(scheduler.includes('MAX_STAGE = 3')&&scheduler.includes('INTERVAL = 10 * 60 * 1000L'));
assert(scheduler.includes('setAndAllowWhileIdle'));
assert(js.includes('window.__WorkClockWeekResume'));
assert(geo.includes('"workclock_strong_v1"')&&geo.includes('channel.setSound(null, null)'));
assert(!scheduler.includes('"home-"'),'Strong reminder must be restricted to work');
console.log('Workflow changes: 5-minute GPS, 24-hour week, project selection, intervals, and work-only native alerts passed.');

// v0.4.5: work alerts must not be presented as permissions or use the global uppercase label style.
const permissionSection=html.split('<h3>Permissions</h3>')[1].split('</div>\n        <div class="settingGroup">')[0];
const detectionSection=html.split('<h3>Automatic work detection</h3>')[1].split('<h3>Data and backups</h3>')[0];
assert(!permissionSection.includes('id="strongReminders"'));
assert(detectionSection.includes('id="strongReminders"') && detectionSection.includes('id="testStrongReminders"'));
assert(css.includes('.workAlertControl{') && css.includes('text-transform:none'));
assert(js.includes('WorkClockAndroid.testStrongReminder()'));
assert(js.includes('$("#strongReminders").addEventListener("change"'));
assert(geo.includes('tag == "strong-test" || (WorkReminderScheduler.enabled(context)'));
assert(geo.includes('fun testStrong(context: Context)'));
assert(!geo.includes('if (WorkReminderScheduler.enabled(context)) {\n                show(context, "WorkClock vibration test"'));
const activity=fs.readFileSync(root+'java/nl/workclock/app/MainActivity.kt','utf8');
assert(activity.includes('fun testStrongReminder()'));
console.log('Work alert UI: correct settings section, compact typography, immediate save, and one-shot native test wired.');
