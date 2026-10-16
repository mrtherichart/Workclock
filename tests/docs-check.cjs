"use strict";
// Keep documentation links and screenshots from silently going stale.
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const docs=path.join(root,"docs");
const pages=["README.md",...fs.readdirSync(docs).filter(f=>f.endsWith(".md")).map(f=>"docs/"+f)];
let links=0,images=0;
for(const rel of pages){
  const file=path.join(root,rel);
  const text=fs.readFileSync(file,"utf8");
  for(const m of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)){
    const target=m[1].trim();
    if(/^(?:https?:|mailto:|#)/i.test(target))continue;
    const local=path.resolve(path.dirname(file),decodeURIComponent(target.split("#")[0]));
    if(!local.startsWith(root+path.sep)||!fs.existsSync(local))throw Error(rel+": broken link to "+target);
    links++;
    if(m[0].startsWith("![")){
      const header=fs.readFileSync(local).subarray(0,8).toString("hex");
      if(header!=="89504e470d0a1a0a")throw Error("Bad PNG screenshot: "+target);
      images++;
    }
  }
}
if(images<5)throw Error("Expected screenshots for all five guide workflows");
console.log("Documentation: "+pages.length+" Markdown pages, "+links+" local links, "+images+" screenshots checked.");
