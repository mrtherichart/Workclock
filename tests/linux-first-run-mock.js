/* Linux-only clean-install walkthrough check. Not shipped inside the Android APK. */
(() => {
  "use strict";
  // Simulate a genuinely new user before WorkClock's application script loads.
  for(const key of ["workclock-v4","workclock-v3","workclock-prototype-v1","workclock-first-run-hints-v1"])
    localStorage.removeItem(key);
  const calls=[];
  window.WorkClockAndroid={
    appVersion:()=>"linux-first-run",
    permissionStatus:()=>JSON.stringify({location:true,precise:true,background:true,
      services:true,geofences:"active",notification:true}),
    getEvents:()=>"[]",
    acknowledgeEvent:id=>calls.push(["ack",id]),
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
    setTimeout(()=>{
      try{
        check(!errors.length,errors.join("; "));
        const guide=document.getElementById("rhythmGuide"),
              message=document.getElementById("rhythmGuideMessage"),
              go=document.getElementById("rhythmGuideAction"),
              placeHint=document.getElementById("rhythmPlacesHint");
        check(!guide.classList.contains("hidden"),"Fresh user should see one small tip");
        check(message.textContent.includes("home or workplace"),"Initial tip should mention places");
        check(!go.classList.contains("hidden"),"Initial tip should offer a useful action");
        go.click();
        check(document.getElementById("viewPlaces").classList.contains("active"),"Places action did not navigate");
        check(!placeHint.classList.contains("hidden"),"Contextual place hint missing");
        document.getElementById("locName").value="My Workshop";
        document.getElementById("locType").value="work";
        document.getElementById("locLat").value="52.0907";
        document.getElementById("locLon").value="5.1214";
        document.getElementById("saveLocation").click();
        check(document.querySelectorAll("#locationList .location").length===1,"Place not saved");
        check(placeHint.classList.contains("hidden"),"Place tip should disappear after adding a place");
        document.querySelector('.navBtn[data-target="today"]').click();
        check(message.textContent.includes("hold Start"),"Next tip should describe the start action");
        check(go.classList.contains("hidden"),"No redundant next button should appear");
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