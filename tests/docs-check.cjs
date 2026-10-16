"use strict";
// The wiki pages live outside this repository; their screenshots stay here.
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const expected=["today.png","places.png","history.png","weekstaat.png","settings.png"];
for(const name of expected){
  const image=fs.readFileSync(path.join(root,"wiki-images",name));
  if(image.length<2000||image.subarray(0,8).toString("hex")!=="89504e470d0a1a0a")
    throw Error("Missing or invalid wiki screenshot: "+name);
}
const readme=fs.readFileSync(path.join(root,"README.md"),"utf8");
const wiki="https://github.com/mrtherichart/Workclock/wiki";
if(!readme.includes(wiki)||readme.includes("](docs/"))
  throw Error("README must link to the GitHub Wiki");
for(const slug of ["Getting-started","Places","Workday","Weeks","Backups","Development"]){
  if(!readme.includes(wiki+"/"+slug))throw Error("Missing Wiki link: "+slug);
}
console.log("README Wiki links and five screenshots checked.");
