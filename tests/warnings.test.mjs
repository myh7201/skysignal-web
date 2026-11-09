import test from 'node:test';import assert from 'node:assert/strict';import {parseHKWarnings} from '../public/core.mjs';
test('Hong Kong warning order follows the user category order and rain-over-low-TC rule',()=>{
 const P=globalThis.WeatherPolicy||globalThis.window?.WeatherPolicy;
 
const cases=[
 ['WFNTSA','新界北部水浸特別報告'],['WFROST','霜凍警告'],['WFIREY','黃色火災危險警告'],['WFIRER','紅色火災危險警告'],['WL','山泥傾瀉警告'],['WTS','雷暴警告'],['WMSGNL','強烈季候風信號'],['WHOT','酷熱天氣警告'],['WCOLD','寒冷天氣警告'],['TC1','一號戒備信號'],['TC3','三號強風信號'],['WRAINA','黃色暴雨警告'],['WRAINR','紅色暴雨警告'],['WRAINB','黑色暴雨警告'],['TC8NE','八號東北烈風或暴風信號'],['TC9','九號烈風或暴風風力增強信號'],['TC10','十號颶風信號'],['WTMW','海嘯警告']
].map(([id,title])=>({id,title}));
const ids=list=>list.map(x=>x.id),sorted=P.ordered(cases);
assert.deepEqual(ids(sorted),['WTMW','TC10','TC9','TC8NE','WRAINB','WRAINR','WRAINA','TC3','TC1','WHOT','WCOLD','WMSGNL','WTS','WL','WFIRER','WFIREY','WFROST','WFNTSA']);
for(const tc of ['TC1','TC3'])for(const rain of ['WRAINA','WRAINR','WRAINB'])for(const pair of [[tc,rain],[rain,tc]])assert.deepEqual(ids(P.ordered(pair.map(id=>cases.find(x=>x.id===id)))),[rain,tc],'Every rain level must precede TC1 and TC3');
assert.deepEqual(ids(P.ordered(cases.filter(x=>['WHOT','WCOLD'].includes(x.id)).reverse())),['WCOLD','WHOT'],'Hot and cold have equal priority and preserve source order');
assert.equal(P.headline(cases.filter(x=>['WFIRER','WMSGNL'].includes(x.id)))[0].id,'WMSGNL','The home headline uses the same order as the full list');

 const summary=Object.fromEntries(cases.map(x=>[x.id,{name:x.title,code:x.id,actionCode:'ISSUE'}]));const parsed=parseHKWarnings(summary,null);assert.deepEqual(ids(parsed.items),ids(sorted));
});
