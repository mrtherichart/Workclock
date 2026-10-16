/* Test-only Android bridge. This file is injected by linux-ui-smoke.cjs and is never packaged. */
(() => {
  "use strict";
  const d = new Date();
  d.setHours(12,0,0,0);
  d.setDate(d.getDate() - ((d.getDay()+6)%7));
  const key = [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
  const start = new Date(d.getFullYear(),d.getMonth(),d.getDate(),7).toISOString();
  const stop = new Date(d.getFullYear(),d.getMonth(),d.getDate(),16).toISOString();
  localStorage.setItem("workclock-v4",JSON.stringify({
    version:4,
    locations:[{id:"linux-work",type:"work",name:"Test Workshop",lat:52.0907,lon:5.1214,radius:150}],
    history:[{id:"linux-smoke-day",date:key,start,stop,breakMin:30,status:"confirmed",
      manuallyAdded:true,commuteOut:{km:10},commuteBack:{km:10},
      segments:[{id:"linux-smoke-seg",start,stop,projectName:"Linux test project"}]}]
  }));
  const calls = [];
  window.WorkClockAndroid = {
    appVersion:()=>"linux-mock",
    permissionStatus:()=>JSON.stringify({location:true,precise:true,background:true,services:true,geofences:"active",notification:true}),
    getEvents:()=>"[]",
    acknowledgeEvent:id=>calls.push(["ack",id]),
    syncPlaces:json=>calls.push(["syncPlaces",json]),
    requestForegroundTracking:()=>calls.push(["foreground"]),
    requestBackgroundTracking:()=>calls.push(["background"]),
    requestNotifications:()=>calls.push(["notifications"]),
    testNotification:()=>calls.push(["testNotification"]),
    showNotification:(title,body,tag)=>calls.push(["showNotification",title,body,tag]),
    refreshLocation:()=>calls.push(["refresh"]),
    checkForUpdates:()=>calls.push(["updates"]),
    installUpdate:()=>calls.push(["install"]),
    exportBackup:json=>calls.push(["exportBackup",json]),
    importBackup:()=>calls.push(["importBackup"]),
    backupFolderEnabled:()=>false,
    selectBackupFolder:()=>calls.push(["selectBackupFolder"]),
    saveFolderBackup:json=>calls.push(["saveFolderBackup",json]),
    openPlaceOnMap:id=>calls.push(["openPlaceOnMap",id])
  };
  const errors=[];
  window.addEventListener("error",e=>errors.push(e.message||"JavaScript error"));
  window.addEventListener("unhandledrejection",e=>errors.push(String(e.reason||"Unhandled rejection")));
  function assert(condition,message){if(!condition)throw Error(message)}
  window.addEventListener("load",()=>{
    setTimeout(()=>{
      try {
        assert(!errors.length,errors.join("; "));
        assert(document.querySelector("#timer"),"Today view failed to initialize");
        assert(document.querySelector("#viewHistory"),"History view is missing");
        const places=document.querySelector('.navBtn[data-target="places"]');
        places.click();
        const mapLink=document.querySelector(".placeNameButton");
        assert(mapLink&&mapLink.textContent.includes("Test Workshop"),"Saved place map link missing");
        mapLink.click();
        assert(calls.some(c=>c[0]==="openPlaceOnMap"&&c[1]==="linux-work"),"Map bridge was not invoked");
        const settings=document.querySelector('.navBtn[data-target="settings"]');
        settings.click();
        assert(document.getElementById("restoreSnapshot"),"Safety snapshot restore is missing");
        const history=document.querySelector('.navBtn[data-target="history"]');
        assert(history,"History navigation is missing");
        history.click();
        document.getElementById("historyShowWeek").click();
        assert(!document.getElementById("weekSheetPanel").classList.contains("hidden"),"Weekstaat did not open");
        assert(document.getElementById("weekTableBody").querySelectorAll("tr").length===7,"Weekstaat must have seven days");
        assert(document.getElementById("weekTotalHours").textContent==="8u30","Work hours were not calculated correctly");
        assert(document.getElementById("weekTotalKm").textContent==="20","Kilometre total was incorrect");
        const jump=document.getElementById("weekJumpGo");
        assert(jump,"Week number jump is missing");
        assert(document.getElementById("weekProjectSelect"),"Project filter is missing");
        assert(document.getElementById("weekProjects").textContent.includes("Linux test project"),"Project not shown");
        const before=document.getElementById("weekHeading").textContent;
        document.getElementById("weekPrevious").click();
        assert(document.getElementById("weekHeading").textContent!==before,"Previous-week control failed");
        document.getElementById("weekNext").click();
        assert(document.getElementById("weekHeading").textContent===before,"Next-week control failed");
        document.getElementById("historyShowDays").click();
        assert(!document.getElementById("historyDaysPanel").classList.contains("hidden"),"Day view did not open");
        assert(!errors.length,errors.join("; "));
        document.body.dataset.linuxSmoke="pass";
        document.body.dataset.linuxSmokeNote="native bridge, history, weekly times, km and navigation";
      }catch(e){
        document.body.dataset.linuxSmoke="fail";
        document.body.dataset.linuxSmokeNote=(e?.stack||String(e)).slice(0,800);
      }
    },75);
  });
})();