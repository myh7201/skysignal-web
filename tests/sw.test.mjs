import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('offline installation reloads versioned assets matching the production page',async()=>{
 const handlers={},requested=[];let installed,activated=false;
 const self={registration:{scope:'https://example.test/skysignal-web/'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:()=>{activated=true;}};
 const caches={open:async()=>({addAll:async entries=>requested.push(...entries)})};
 vm.runInNewContext(fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),{self,caches,URL,Request});
 handlers.install({waitUntil:promise=>installed=promise});await installed;
 assert(activated);assert(requested.length>0);assert(requested.every(r=>r.cache==='reload'),'A fresh shell cannot reuse an old HTTP-cache response');
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 for(const [,asset] of html.matchAll(/(?:src|href)="(\.\/[^"\s]+\.(?:css|m?js)(?:\?[^"\s]+)?)"/g)){
  assert(requested.some(r=>r.url===new URL(asset,self.registration.scope).href),'Offline install must include '+asset);
 }
 for(const asset of ['styles.css','app.mjs','map/model-grid.js','map/model-map.js'])assert(requested.some(r=>r.url.includes('/'+asset+'?v=')),asset+' must have a release identifier');
});
