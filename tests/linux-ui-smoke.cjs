/* Headless Linux UI smoke test of the exact Android APK HTML, using a test-only bridge. */
"use strict";
const fs=require("node:fs");
const http=require("node:http");
const cp=require("node:child_process");
const assert=require("node:assert/strict");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const apkHtml=fs.readFileSync(path.join(root,"app/src/main/assets/index.html"),"utf8");
const mock=fs.readFileSync(path.join(__dirname,"linux-android-mock.js"),"utf8");
const forbidden=[
 "navigator.geolocation","navigator.serviceWorker","workclock-sw.js",
 "Notification.permission","new Notification(","__WorkClockTest",
 'id="backupFile"',"ensureNotificationWorker"
];
for(const token of forbidden)assert(!apkHtml.includes(token),"Browser-only code in production: "+token);
const scripts=[...apkHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
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
 if(req.url!=="/assets/index.html"){res.writeHead(404);res.end();return}
 res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});
 res.end(html);
});
server.listen(0,"127.0.0.1",()=>{
 const {port}=server.address();
 const args=["--headless=new","--disable-gpu","--no-sandbox","--disable-dev-shm-usage","--disable-background-networking","--no-first-run","--no-default-browser-check","--virtual-time-budget=2500","--dump-dom", "http://127.0.0.1:"+port+"/assets/index.html"];
 const result=cp.spawnSync(chromium,args,{encoding:"utf8",timeout:25000,maxBuffer:12*1024*1024});
 server.close();
 if(result.error){console.error(result.error);process.exitCode=1;return}
 if(result.status!==0){console.error("Chrome exited with",result.status,result.stderr?.slice(-1500));process.exitCode=1;return}
 const out=result.stdout||"";
 if(!out.includes('data-linux-smoke="pass"')){
   const fail=out.match(/data-linux-smoke-note="([^"]+)"/);
   console.error("Android HTML Linux smoke failed:",fail?.[1]||out.slice(-700));
   process.exitCode=1;return;
 }
 console.log("Android-only HTML passed Chromium headless UI smoke test with Linux-only bridge.");
});