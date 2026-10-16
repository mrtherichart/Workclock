/* Generate documentation screenshots of the real APK UI using sample records.
 * Run in Linux with Node.js and Chromium. No Android permissions or real user data. */
"use strict";
const fs=require("node:fs");
const http=require("node:http");
const cp=require("node:child_process");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const assetDir=path.join(root,"app/src/main/assets");
const screenshotDir=path.join(root,"wiki-images");
fs.mkdirSync(screenshotDir,{recursive:true});
const chromium=process.env.CHROME_BIN||["chromium","google-chrome","google-chrome-stable"].find(cmd=>cp.spawnSync("which",[cmd]).status===0);
if(!chromium)throw Error("Chromium is required to capture screenshots.");
const baseHTML=fs.readFileSync(path.join(assetDir,"index.html"),"utf8");
const js=String.raw`
(function(){
  const today=new Date(),day=new Date(today.getFullYear(),today.getMonth(),today.getDate(),12);
  day.setDate(day.getDate()-(day.getDay()+6)%7);
  const key=date=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");
  const history=[0,1,2,3].map((offset,i)=>{
    const date=new Date(day);date.setDate(date.getDate()+offset);
    const start=new Date(date.getFullYear(),date.getMonth(),date.getDate(),i===1?8:7,0,0);
    const end=new Date(date.getFullYear(),date.getMonth(),date.getDate(),i===1?15:16,0,0);
    return {id:"sample-"+offset,date:key(date),start:start.toISOString(),stop:end.toISOString(),breakMin:30,
      status:"confirmed",manuallyAdded:true,commuteOut:{from:"Home",to:"Workshop",km:23},
      commuteBack:{from:"Workshop",to:"Home",km:23},
      segments:[{id:"section-"+offset,start:start.toISOString(),stop:end.toISOString(),projectName:"Sample cabinet job"}]};
  });
  localStorage.setItem("workclock-v4",JSON.stringify({
    version:4,
    locations:[
      {id:"home-demo",name:"Home",type:"home",lat:52.0907,lon:5.1214,radius:150},
      {id:"work-demo",name:"Sample workshop",type:"work",lat:52.1001,lon:5.1302,radius:150}
    ],
    history
  }));
  localStorage.setItem("workclock-first-run-hints-v1","completed");
  localStorage.setItem("workclock-week-anchor",key(day));
  localStorage.setItem("workclock-history-mode","days");
  const settings="documentation preview";
  window.WorkClockAndroid={
    appVersion:()=>settings,
    permissionStatus:()=>JSON.stringify({location:true,precise:true,background:true,
      notification:true,services:true,geofences:"active"}),
    getEvents:()=>"[]",acknowledgeEvent:()=>{},syncPlaces:()=>{},
    requestForegroundTracking:()=>{},requestBackgroundTracking:()=>{},
    requestNotifications:()=>{},testNotification:()=>{},showNotification:()=>{},
    refreshLocation:()=>{},checkForUpdates:()=>{},installUpdate:()=>{},
    exportBackup:()=>{},importBackup:()=>{},backupFolderEnabled:()=>false,
    selectBackupFolder:()=>{},saveFolderBackup:()=>{},openPlaceOnMap:()=>{}
  };
  addEventListener("load",()=>{
    const screen=new URLSearchParams(location.search).get("screen")||"today";
    const nav=screen==="weekstaat"?"history":screen;
    document.querySelector('[data-target="'+nav+'"]')?.click();
    if(screen==="weekstaat")document.getElementById("historyShowWeek")?.click();
    document.body.dataset.docScreen=screen;
  });
})();
`;
const html=baseHTML.replace("<head>","<head>\n<script>"+js+"</script>");
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,"http://localhost");
 const file=u.pathname==="/assets/index.html"?"index.html":path.basename(u.pathname);
 if(!["index.html","app.js","navigation.js","style.css"].includes(file)){res.writeHead(404);res.end();return}
 const content=file==="index.html"?html:fs.readFileSync(path.join(assetDir,file));
 const mime=file.endsWith(".css")?"text/css":file.endsWith(".js")?"text/javascript":"text/html";
 res.writeHead(200,{"Content-Type":mime+"; charset=utf-8","Cache-Control":"no-store"});
 res.end(content);
});
function capture(screen,url){
 return new Promise((resolve,reject)=>{
  const filepath=path.join(screenshotDir,screen+".png");
  const args=["--headless=new","--no-sandbox","--disable-gpu","--hide-scrollbars",
    "--disable-dev-shm-usage","--disable-background-networking","--no-first-run",
    "--force-device-scale-factor=2","--window-size=480,1040",
    "--virtual-time-budget=2500","--screenshot="+filepath,url+"?screen="+screen];
  const proc=cp.spawn(chromium,args,{stdio:["ignore","ignore","pipe"]});
  let stderr="";
  proc.stderr.on("data",d=>{stderr+=d.toString().slice(0,3000)});
  const timeout=setTimeout(()=>proc.kill("SIGKILL"),20000);
  proc.on("error",e=>{clearTimeout(timeout);reject(e)});
  proc.on("close",code=>{
    clearTimeout(timeout);
    if(code!==0)return reject(Error(screen+" chromium exit "+code+": "+stderr.slice(-600)));
    const image=fs.readFileSync(filepath);
    if(image.length<2000||image.toString("hex",0,8)!=="89504e470d0a1a0a")
      return reject(Error(screen+" screenshot missing or corrupt"));
    console.log(screen+": "+Math.round(image.length/1024)+" KB");
    resolve();
  });
 });
}
server.listen(0,"127.0.0.1",async()=>{
 try{
   const port=server.address().port;
   for(const screen of ["today","places","history","weekstaat","settings"])
     await capture(screen,"http://127.0.0.1:"+port+"/assets/index.html");
   console.log("Wiki screenshots written to wiki-images/");
 }catch(e){console.error(e);process.exitCode=1}
 finally{server.close()}
});