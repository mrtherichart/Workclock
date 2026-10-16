/* Linux-only clean-install walkthrough check. Not shipped inside the Android APK. */
(() => {
  "use strict";
  // Simulate a genuinely new user before WorkClock's application script loads.
  for(const key of ["workclock-v4","workclock-v3","workclock-prototype-v1","workclock-first-run-hints-v1","workclock-first-run-started-v1","workclock-first-run-skip-place-v1"])
    localStorage.removeItem(key);
  const calls=[];
  const nativeEvents=[];
  window.WorkClockAndroid={
    appVersion:()=>"linux-first-run",
    permissionStatus:()=>JSON.stringify({location:true,precise:true,background:true,
      services:true,geofences:"active",notification:true}),
    getEvents:()=>JSON.stringify(nativeEvents),
    acknowledgeEvent:id=>{calls.push(["ack",id]);const i=nativeEvents.findIndex(x=>x.id===id);if(i>=0)nativeEvents.splice(i,1)},
    syncPlaces:json=>calls.push(["places",json]),
    requestForegroundTracking:()=>{},
    requestBackgroundTracking:()=>{},
    requestNotifications:()=>{},
    testNotification:()=>{},
    showNotification:()=>{},
    refreshLocation:()=>{},
    checkForUpdates:()=>{},
    installUpdate:()=>{},
    exportBackup:()=>{},
    importBackup:()=>{},
    backupFolderEnabled:()=>false,
    selectBackupFolder:()=>{},
    saveFolderBackup:()=>{},
    openPlaceOnMap:()=>{}
  };
  const errors=[];
  window.addEventListener("error",event=>errors.push(event.message||"JavaScript error"));
  window.addEventListener("unhandledrejection",event=>errors.push(String(event.reason)));
  function check(ok,message){if(!ok)throw Error(message)}
  window.addEventListener("load",()=>{
    setTimeout(async()=>{
      try{
        check(!errors.length,errors.join("; "));
        const guide=document.getElementById("rhythmGuide"),
              message=document.getElementById("rhythmGuideMessage"),
              go=document.getElementById("rhythmGuideAction"),
              placeHint=document.getElementById("rhythmPlacesHint");
        check(!guide.classList.contains("hidden"),"Fresh user should see one getting-started card");
        check(!!(guide.compareDocumentPosition(document.querySelector("#viewToday .hero"))&Node.DOCUMENT_POSITION_FOLLOWING),
          "Getting-started card must appear above the timer");
        check(getComputedStyle(guide).backgroundImage.includes("linear-gradient"),"Guide should have a visible yellow background");
        check(document.getElementById("rhythmGuideStep").textContent.includes("GETTING STARTED"),"Guide heading missing");
        check(message.textContent.includes("Save a place"),"Initial tip should offer optional place setup");
        check(!go.classList.contains("hidden"),"Initial tip should offer a useful action");
        const skip=document.getElementById("rhythmGuideSkip");
        check(!skip.classList.contains("hidden"),"Manual users must be able to skip GPS setup");
        skip.click();
        check(message.textContent.includes("Hold the Start"),"Skipping places should immediately advance to logging work");
        check(go.classList.contains("hidden"),"Start tip does not need another button");
        check(localStorage.getItem("workclock-first-run-skip-place-v1")==="yes","Optional setup skip was not remembered");
        document.querySelector('.navBtn[data-target="settings"]').click();
        document.getElementById("rhythmGuideReplay").click();
        check(!guide.classList.contains("hidden"),"Replaying tips should reopen them");
        check(message.textContent.includes("Save a place"),"Replay must offer setup again");
        go.click();
        check(document.getElementById("viewPlaces").classList.contains("active"),"Places action did not navigate");
        check(!placeHint.classList.contains("hidden"),"Contextual place hint missing");
        check(!!(placeHint.compareDocumentPosition(document.querySelector("#viewPlaces .card"))&Node.DOCUMENT_POSITION_FOLLOWING),
          "Places help must appear above the first form");
        document.getElementById("locName").value="My Workshop";
        document.getElementById("locType").value="work";
        document.getElementById("locLat").value="52.0907";
        document.getElementById("locLon").value="5.1214";
        document.getElementById("saveLocation").click();
        check(document.querySelectorAll("#locationList .location").length===1,"Place not saved");
        check(placeHint.classList.contains("hidden"),"Place tip should disappear after adding a place");
        document.querySelector('.navBtn[data-target="today"]').click();
        check(message.textContent.includes("Hold the Start"),"Next tip should describe the start action");
        check(go.classList.contains("hidden"),"No redundant next button should appear");
        // Native notification choices should move guidance through the real workday states.
        nativeEvents.push({id:"test-start",transition:"ACTION",action:"START_NOW",at:Date.now()});
        await window.__WorkClockNativeSync();
        check(document.getElementById("rhythmGuideStep").textContent==="WHILE YOU WORK",
          "Starting work should advance to the working hint");
        nativeEvents.push({id:"test-finish",transition:"ACTION",action:"FINISH_NOW",at:Date.now()+15000});
        await window.__WorkClockNativeSync();
        check(document.getElementById("projectModal").classList.contains("show"),
          "Finishing a first day should ask for the project");
        document.getElementById("projectModalInput").value="Workshop Project";
        document.getElementById("saveProjectModal").click();
        check(document.getElementById("rhythmGuideStep").textContent==="FINISH YOUR DAY",
          "Saving the project finish should show the confirm-your-day hint");

        document.getElementById("rhythmGuideDismiss").click();
        check(guide.classList.contains("hidden"),"Dismiss should hide hints");
        check(localStorage.getItem("workclock-first-run-hints-v1")==="dismissed","Dismiss preference not saved");
        document.querySelector('.navBtn[data-target="settings"]').click();
        document.getElementById("rhythmGuideReplay").click();
        check(document.getElementById("viewToday").classList.contains("active"),"Replay should return to Today");
        check(!guide.classList.contains("hidden"),"Replay should restore the contextual tip");
        check(!errors.length,errors.join("; "));
        document.body.dataset.linuxSmoke="pass";
        document.body.dataset.linuxSmokeNote="fresh setup, progressive tip, dismissal and replay";
      }catch(error){
        document.body.dataset.linuxSmoke="fail";
        document.body.dataset.linuxSmokeNote=(error?.stack||String(error)).slice(0,800);
      }
    },75);
  });
})();