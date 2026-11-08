import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {parseHTML} from 'linkedom';import {forecastFixture} from './fixtures.mjs';
const pause=()=>new Promise(resolve=>setImmediate(resolve));
test('production UI loads data, navigates, searches, changes location/model and recovers from errors',async t=>{
 const {window,document}=parseHTML(fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8'));
 const values=new Map(),intervals=[],requests=[],mapEvents=[];let failWeather=false,holdWeather=false,release=null;
 Object.assign(globalThis,{window,document,location:{hash:'#home'},localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},requestAnimationFrame:fn=>{fn();return 1;}});
 Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});window.matchMedia=()=>({matches:false,addEventListener(){}});window.scrollTo=()=>{};
 const oldInterval=globalThis.setInterval,oldFetch=globalThis.fetch;globalThis.setInterval=fn=>{intervals.push(fn);return {unref(){}};};
 for(const d of document.querySelectorAll('dialog')){d.showModal=()=>d.setAttribute('open','');d.close=()=>d.removeAttribute('open');}
 window.ModelWeatherMap={mount({canvas,dock,context}){mapEvents.push(context.place);return {map:{remove(){},setZoom(){},getZoom(){return 7;}},dispose(){},resize(){},refresh(){},resetView(){}};}};
 globalThis.fetch=async(url,{signal}={})=>{const u=new URL(url);requests.push(u);if(u.hostname==='geocoding-api.open-meteo.com')return {ok:true,json:async()=>({results:[{id:1,name:'札幌 <測試>',latitude:43.06,longitude:141.35,timezone:'Asia/Tokyo',country_code:'JP',country:'日本'}]})};if(u.hostname==='data.weather.gov.hk')return {ok:true,json:async()=>u.searchParams.get('dataType')==='warnsum'?{WMSGNL:{name:'強烈季候風信號',actionCode:'ISSUE',code:'WMSGNL'}}:{details:[{warningStatementCode:'WMSGNL',contents:['正式警告內容']}]} };
  if(holdWeather){holdWeather=false;await new Promise(resolve=>{release=resolve;});}if(signal?.aborted)throw new DOMException('Aborted','AbortError');if(failWeather)throw new TypeError('offline');const p={lat:Number(u.searchParams.get('latitude')),lon:Number(u.searchParams.get('longitude')),timezone:u.searchParams.get('timezone')};return {ok:true,json:async()=>forecastFixture({place:p})};};
 try{
  await import('../public/app.mjs?dom-test');await pause();await pause();
  assert(document.querySelector('.weather-hero'));assert(document.body.textContent.includes('模型即時估算'));
  const band=document.querySelector('.home-condition-band');assert.equal(band.children[0].className,'hero-condition');assert.equal(band.children[1].className,'home-storm-entry');assert.equal(band.children[2].className,'hero-range');
  assert(!band.querySelector('.home-storm-entry').textContent.includes('›'));assert.equal(document.querySelectorAll('.hero-metrics>div>small').length,3);
  document.querySelector('[data-weather-details]').click();assert(document.querySelector('#info-content').textContent.includes('海平面氣壓'));document.querySelector('#info-dialog').close();assert(document.querySelector('.warning-banner').textContent.includes('強烈季候風信號'));
  const go=async hash=>{location.hash='#'+hash;window.dispatchEvent(new window.Event('hashchange'));await pause();};
  await go('forecast');assert(document.querySelector('.forecast-chart'));assert.equal(document.querySelectorAll('.daily-row').length,3);
  await go('warnings');assert(document.querySelector('.warning-description').textContent.includes('正式警告內容'));
  await go('maps');assert.equal(mapEvents.length,1);assert(document.querySelector('.map-canvas'));assert(document.querySelector('[aria-label="放大地圖"]'));
  await go('more');assert(document.querySelector('#theme-select'));document.querySelector('#theme-select').onchange({target:{value:'dark'}});assert.equal(document.documentElement.dataset.theme,'dark');
  await go('home');document.querySelector('[data-favorite]').click();assert(values.get('skysignal:favorites').includes('香港'));
  document.querySelector('#change-place').click();const query=document.querySelector('#place-query');query.value='札幌';document.querySelector('#search-form').onsubmit({preventDefault(){}});await pause();await pause();
  assert(document.querySelector('.search-result').textContent.includes('札幌 <測試>'));assert(!document.querySelector('.search-result 測試'));document.querySelector('[data-search-place]').click();await pause();await pause();assert(document.querySelector('#place-name').textContent.includes('札幌'));assert(document.querySelector('.weather-hero'));
  await go('warnings');assert(document.body.textContent.includes('暫未直接接入'));assert(!document.body.textContent.includes('官方來源目前沒有生效警告'));
  await go('forecast');const select=document.querySelector('[data-model]');Object.defineProperty(select,'value',{value:'gfs',configurable:true});select.dispatchEvent(new window.Event('change',{bubbles:true}));await pause();await pause();assert(requests.some(u=>u.searchParams.get('models')==='ncep_gfs_global'));
  failWeather=true;document.querySelector('#refresh').click();await pause();await pause();assert(document.querySelector('.inline-notice').textContent.includes('保留上次'));assert(document.querySelector('.daily-row'));
  failWeather=false;document.querySelector('[data-retry]').click();await pause();await pause();assert(!document.querySelector('.inline-notice'));
  holdWeather=true;document.querySelector('#refresh').click();await pause();document.querySelector('#change-place').click();document.querySelector('.quick-places button').click();await pause();await pause();release();await pause();await pause();assert.equal(document.querySelector('#place-name').textContent,'香港');assert(document.querySelector('.forecast-chart'));
 }finally{globalThis.setInterval=oldInterval;globalThis.fetch=oldFetch;}
});

