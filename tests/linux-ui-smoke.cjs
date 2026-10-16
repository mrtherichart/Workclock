/* Headless Linux UI smoke test of the exact Android APK HTML, using a test-only bridge. */
"use strict";
const fs=require("node:fs");
const http=require("node:http");
const cp=require("node:child_process");
const assert=require("node:assert/strict");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const apkHtml=fs.readFileSync(path.join(root,"app/src/main/assets/index.html"),"utf8");
const firstRun=process.argv.includes("--first-run");
const mock=fs.readFileSync(path.join(__dirname,firstRun?"linux-first-run-mock.js":"linux-android-mock.js"),"utf8");
const appJs=fs.readFileSync(path.join(root,"app/src/main/assets/app.js"),"utf8");
const navigationJs=fs.readFileSync(path.join(root,"app/src/main/assets/navigation.js"),"utf8");
const forbidden=[
 "navigator.geolocation","navigator.serviceWorker","workclock-sw.js",
 "Notification.permission","new Notification(","__WorkClockTest",
 'id="backupFile"',"ensureNotificationWorker"
];
for(const token of forbidden)assert(![apkHtml,appJs,navigationJs].some(s=>s.includes(token)),"Browser-only code in production: "+token);
const scripts=[appJs,navigationJs];
const vm=require("node:vm");
for(const [i,script] of scripts.entries())new vm.Script(script,{filename:"app-script-"+i});
const chromium=process.env.CHROME_BIN||["chromium","chromium-browser","google-chrome-stable","google-chrome"].find(name=>{
  const p=cp.spawnSync("which",[name],{encoding:"utf8"});
  return p.status===0;
});
if(!chromium){console.error("Install Chromium/Chrome or set CHROME_BIN for the Linux UI test.");process.exit(1)}
const html=apkHtml.replace("<head>","<head>\n<script>\n"+mock+"\n</script>");
assert.notEqual(html,apkHtml,"Could not insert test bridge");
const server=http.createServer((req,res)=>{
 const assets={
    "/assets/index.html":[html,"text/html; charset=utf-8"],
    "/assets/app.js":[appJs,"text/javascript; charset=utf-8"],
    "/assets/navigation.js":[navigationJs,"text/javascript; charset=utf-8"],
    "/assets/style.css":[fs.readFileSync(path.join(root,"app/src/main/assets/style.css"),"utf8"),"text/css; charset=utf-8"]
 };
 const item=assets[req.url];
 if(!item){res.writeHead(404);res.end();return}
 res.writeHead(200,{"Content-Type":item[1],"Cache-Control":"no-store"});
 res.end(item[0]);
});
server.listen(0,"127.0.0.1",()=>{
 const {port}=server.address();
 if(process.argv.includes("--preview")){
   console.log(`Linux preview ready at http://127.0.0.1:${port}/assets/index.html`);
   console.log("This preview uses mocked Android services; nothing is added to the APK.");
   return;
 }
 const args=["--headless=new","--disable-gpu","--no-sandbox","--disable-dev-shm-usage","--disable-background-networking","--no-first-run","--no-default-browser-check","--virtual-time-budget=2500","--dump-dom", "http://127.0.0.1:"+port+"/assets/index.html"];
 // Use asynchronous spawn: the Node HTTP server must remain responsive while Chrome loads it.
 const child=cp.spawn(chromium,args,{stdio:["ignore","pipe","pipe"]});
 let out="",err="",timedOut=false;
 child.stdout.setEncoding("utf8");child.stderr.setEncoding("utf8");
 child.stdout.on("data",chunk=>{out+=chunk;if(out.length>12*1024*1024)child.kill("SIGKILL")});
 child.stderr.on("data",chunk=>{err+=chunk;if(err.length>250000)err=err.slice(-100000)});
 const timeout=setTimeout(()=>{timedOut=true;child.kill("SIGKILL")},25000);
 child.on("error",e=>{console.error(e);process.exitCode=1});
 child.on("close",code=>{
   clearTimeout(timeout);server.close();
   if(timedOut||code!==0){console.error("Chrome failed or timed out:",code,err.slice(-1500));process.exitCode=1;return}
   if(!out.includes('data-linux-smoke="pass"')){
     const fail=out.match(/data-linux-smoke-note="([^"]+)"/);
     console.error("Android HTML Linux smoke failed:",fail?.[1]||out.slice(-700));
     process.exitCode=1;return;
   }
   console.log((firstRun?"Fresh first-run guidance":"Existing-user app")+" passed Chromium smoke test.");
 });
});