/* Display policy only: never invent warning severity, forecast values or coverage. */
(function(root){'use strict';
function category(item){const t=[item.kind,item.id,item.title].join(' ');if(/海嘯|津波|tsunami/i.test(t))return 0;if(/地震|earthquake/i.test(t))return 0;if(/火山|volcano|volcanic/i.test(t))return 1;if(/颱風|台風|熱帶氣旋|tropical|hurricane|cyclone|^tc\b| TC\d/i.test(t))return 2;if(/暴雨|大雨|洪水|水浸|rain|flood/i.test(t))return 3;if(/酷熱|寒冷|高溫|低溫|heat|cold|freeze/i.test(t))return 4;if(/雷暴|雷電|閃電|thunder|lightning/i.test(t))return 5;return 6;}
// User-selected Hong Kong display order: L>A>B>C>H=I>E>D>G>K>J>F.
function hkWarning(item){
 const codes=[item.id,item.code,item.kind].filter(Boolean).map(x=>String(x).toUpperCase()),has=pattern=>codes.some(x=>pattern.test(x)),text=[item.title,item.level].filter(Boolean).join(' ');
 if(has(/^WTMW$/))return {order:0,kind:'tsunami',grade:0};
 if(has(/^(?:TC(?:1|3|8(?:NE|NW|SE|SW)?|9|10)|WTCSGNL)$/)){
  const code=codes.map(x=>x.match(/^TC(10|9|8|3|1)(?:NE|NW|SE|SW)?$/)).find(Boolean),label=text.match(/(十|九|八|三|一|10|9|8|3|1)號/),chinese={'十':10,'九':9,'八':8,'三':3,'一':1},grade=code?Number(code[1]):label?(chinese[label[1]]||Number(label[1])):Number(item.rank)||0;
  return {order:grade>=8?1:3,kind:'tc',grade};
 }
 if(has(/^WRAIN[ARB]?$/)){const code=codes.find(x=>/^WRAIN[ARB]$/.test(x));return {order:2,kind:'rain',grade:code?({A:1,R:2,B:3})[code.at(-1)]:/黑/.test(text)?3:/紅/.test(text)?2:/黃/.test(text)?1:0};}
 if(has(/^WHOT$/))return {order:4,kind:'hot',grade:0};
 if(has(/^WCOLD$/))return {order:4,kind:'cold',grade:0};
 if(has(/^WMSGNL$/))return {order:5,kind:'monsoon',grade:0};
 if(has(/^WTS$/))return {order:6,kind:'thunder',grade:0};
 if(has(/^WL$/))return {order:7,kind:'landslip',grade:0};
 if(has(/^WFIRE[RY]?$/)){const code=codes.find(x=>/^WFIRE[RY]$/.test(x));return {order:8,kind:'fire',grade:code?code.endsWith('R')?2:1:/紅/.test(text)?2:/黃/.test(text)?1:0};}
 if(has(/^WFROST$/))return {order:9,kind:'frost',grade:0};
 if(has(/^WFNTSA$/))return {order:10,kind:'flood',grade:0};
 return null;
}
function severity(x){return Number(x.rank??x.level)||({Extreme:4,Severe:3,Moderate:2,Minor:1})[x.severity]||0;}
function priority(a,b){const x=hkWarning(a),y=hkWarning(b);if(x&&y)return x.order-y.order||(x.kind===y.kind?y.grade-x.grade:0);return category(a)-category(b)||severity(b)-severity(a)||String(a.title||'').localeCompare(String(b.title||''));}
function ordered(items){return [...items].sort(priority);}
function headline(items){const sorted=ordered(items);return sorted.length&&category(sorted[0])===0?sorted.filter(x=>category(x)===0):sorted.slice(0,1);}
function sky(code,description,hour){const text=description||'',n=Number(code);let weather='';if(/雪|snow/i.test(text))weather='snow';else if(/雷|thunder/i.test(text)||n===65)weather='storm';else if(/雨|rain|shower/i.test(text)||[53,54,62,63,64].includes(n))weather='rain';else if(/霧|fog/i.test(text)||[83,84].includes(n))weather='fog';else if(/雲|cloud/i.test(text)||[60,61,76].includes(n))weather='cloud';return (hour<6||hour>=18?'night'+(weather?' '+weather:''):weather||'sun');}

function cycle(ids,id,step,home=''){const all=[home,...new Set(ids.filter(x=>x&&x!==home))];const i=Math.max(0,all.indexOf(id));return all[(i+step+all.length)%all.length];}
const api={category,ordered,headline,sky,cycle};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WeatherPolicy=api;
})(typeof window!=='undefined'?window:globalThis);
