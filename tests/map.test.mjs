import test from 'node:test';import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const gridContext={};vm.runInNewContext(fs.readFileSync(new URL('../public/map/model-grid.js',import.meta.url),'utf8'),gridContext);const G=gridContext.ModelGrid;
test('regional renderer handles layers, time, flow, panning, stale replies and cleanup',()=>{
const callbacks=new Map(),frames=new Map(),actions=[],maps=[],markers=[],popups=[];let serial=0;
const drawing={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},drawImage(){this.draws=(this.draws||0)+1;},clearRect(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText(){}};
function make(tag,className='',text=''){return {tagName:tag.toUpperCase(),className,textContent:text,children:[],style:{},attributes:{},value:'',setAttribute(k,v){this.attributes[k]=String(v);},getAttribute(k){return this.attributes[k];},append(...items){this.children.push(...items);},prepend(...items){this.children.unshift(...items);},replaceChildren(...items){this.children=items;},getContext(){return drawing;}};}
const btn=(text,fn,cls)=>Object.assign(make('button',cls,text),{onclick:fn});
const store=new Map();
const context={ModelGrid:G,console,Date,Intl,Math,Uint8ClampedArray,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v))},setTimeout:(fn,ms)=>{callbacks.set(++serial,{fn,ms,repeat:false});return serial;},clearTimeout:id=>callbacks.delete(id),setInterval:(fn,ms)=>{callbacks.set(++serial,{fn,ms,repeat:true});return serial;},clearInterval:id=>callbacks.delete(id),requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:id=>frames.delete(id)};
context.L={map(stage){const handlers={},map={center:{lat:43,lng:141},zoom:7,setView(p,z){this.center={lat:p[0],lng:p[1]};this.zoom=z;handlers.move?.();handlers.moveend?.();return this;},getZoom(){return this.zoom;},getPane(){return this.overlayPane||(this.overlayPane=make('div'));},containerPointToLayerPoint(p){return {x:p[0],y:p[1]};},getCenter(){return this.center;},getBounds(){const p=this.center;return {getWest:()=>p.lng-1,getEast:()=>p.lng+1,getSouth:()=>p.lat-1,getNorth:()=>p.lat+1};},getSize(){return {x:160,y:180};},containerPointToLatLng(p){return {lat:this.center.lat+1-p[1]/180*2,lng:this.center.lng-1+p[0]/160*2};},latLngToContainerPoint(p){return {x:(p[1]-this.center.lng+1)/2*160,y:(this.center.lat+1-p[0])/2*180};},on(name,fn){handlers[name]=fn;},invalidateSize(){},off(name,fn){if(handlers[name]===fn)delete handlers[name];},handlers};maps.push(map);return map;},tileLayer(){return {addTo(){}};},popup(options){const popup={options,setLatLng(point){this.point=point;return this;},setContent(content){this.content=content;return this;},openOn(map){this.map=map;this.closed=false;return this;},remove(){this.closed=true;this.map?.handlers.popupclose?.({popup:this});return this;}};popups.push(popup);return popup;},circleMarker(point,options){const record={point,options};markers.push(record);return {addTo(){return this;},bindTooltip(){return this;},setLatLng(point){record.point=point;return this;},remove(){record.removed=true;return this;}};}};
context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../public/map/model-map.js',import.meta.url),'utf8'),context);
const canvas=make('div'),dock=make('div'),status=make('p');
const mounted=context.ModelWeatherMap.mount({canvas,dock,status,context:{place:{id:'here',lat:43,lon:141,name:'目前位置',timezone:'Asia/Tokyo'}},make,btn,action:(name,data={})=>actions.push({name,data}),places:[{id:'saved',name:'酒店',lat:43.1,lon:141.2},{id:'here',lat:43,lon:141}]});
const all=node=>[node,...node.children.flatMap(all)],control=label=>all(dock).find(n=>n.attributes['aria-label']===label),requests=()=>actions.filter(a=>a.name==='modelMap');
function flush(){for(const [id,t]of [...callbacks])if(!t.repeat){callbacks.delete(id);t.fn();}}
function fixture(request,model=request.model){const b=request.bounds,t=Math.floor(Date.now()/3600000)*3600000;return {requestId:request.requestId,model,rows:2,cols:2,bounds:b,times:[t,t+3600000,t+7200000],fetched:Date.now(),samplingKm:25,available:Object.keys(G.layers),completeFields:true,cells:[0,1,2,3].map(i=>({fields:{temperature:[10+i,11+i,12+i],wind:[20,25,30],direction:[90,90,90],gust:[25,30,35],rain:[0,1,2],snow:[0,.1,.2],cloud:[10,20,30],humidity:[50,55,60],pressure:[1000+i*4,1001+i*4,1002+i*4]}}))};}
flush();assert.equal(requests().length,1);assert.equal(markers.length,2,'Current and saved points are displayed once');assert.equal(maps[0].getPane().children.length,2,'Weather canvases sit in the overlay pane below the marker pane');
const initial=requests().at(-1).data;context.ModelWeatherMap.receive(fixture(initial));
const slider=control('模型預報時間');assert.equal(slider.max,2);assert(!slider.disabled);assert(drawing.draws>0,'The actual renderer paints returned model data');
slider.value=0;slider.oninput();
const pointTemperature=()=>all(popups.at(-1).content).find(n=>n.className==='model-point-temperature').textContent;
const pick=(lat=43,lng=141)=>maps[0].handlers.click({latlng:{lat,lng}});
const pointRequests=requests().length;pick();assert.equal(pointTemperature(),'11.5 °C');assert.equal(popups.length,1);assert.equal(requests().length,pointRequests,'A point reads the downloaded regional data without another request');
pick(85,179);assert.equal(pointTemperature(),'此座標暫無氣溫資料','A coordinate outside coverage cannot masquerade as 0°C');
all(canvas).find(n=>n.className==='model-point-inspect').onclick();assert.equal(pointTemperature(),'11.5 °C','The keyboard-accessible centre button uses the same picker');
assert.equal(popups.length,1,'Repeated points reuse one popup');
slider.value=2;slider.oninput();assert.equal(pointTemperature(),'13.5 °C','The selected coordinate follows forecast time');const oldTime=all(dock).find(n=>n.className==='map-time-heading').children[0].textContent;
const model=control('氣象模型');model.value='gfs';model.onchange();assert.equal(pointTemperature(),'正在載入氣溫…','Switching models must not display the old model value');assert(actions.some(a=>a.name==='cancelModelMap'));
flush();let second=requests().at(-1).data;assert.equal(second.model,'gfs');
context.ModelWeatherMap.receive({requestId:second.requestId,model:'gfs',error:'來源連線失敗'});assert.equal(pointTemperature(),'氣溫暫未能載入','A failed new model cannot leave a permanent loading label');mounted.refresh(true);second=requests().at(-1).data;assert.equal(pointTemperature(),'正在載入氣溫…');
assert.equal(maps[0].center.lat,43);assert.equal(maps[0].center.lng,141,'Changing models preserves the viewport');
context.ModelWeatherMap.receive(fixture(initial));assert(status.textContent.includes('GFS'),'A late old-model response is ignored');
context.ModelWeatherMap.receive(fixture(second));assert.equal(slider.value,2,'Changing models preserves the absolute time');assert.equal(pointTemperature(),'13.5 °C');
assert.equal(all(dock).find(n=>n.className==='map-time-heading').children[0].textContent,oldTime);
mounted.refresh(true);const freshRequest=requests().at(-1).data,zeros=fixture(freshRequest);zeros.cells.forEach(cell=>cell.fields.temperature.fill(0));context.ModelWeatherMap.receive(zeros);assert.equal(pointTemperature(),'0.0 °C','A real zero remains a valid reading');mounted.refresh(true);const missingRequest=requests().at(-1).data,missing=fixture(missingRequest);missing.cells.forEach(cell=>delete cell.fields.temperature);context.ModelWeatherMap.receive(missing);assert.equal(pointTemperature(),'此座標暫無氣溫資料','Missing temperature cannot be fabricated');mounted.refresh(true);context.ModelWeatherMap.receive(fixture(requests().at(-1).data));
const layers=control('模型氣象圖層'),before=requests().length;
for(const field of Object.keys(G.layers)){layers.value=field;layers.onchange();flush();}
assert.equal(requests().length,before,'All returned layers share the same regional payload');
layers.value='wind';layers.onchange();flush();assert.equal(pointTemperature(),'13.5 °C','Temperature remains visible while inspecting wind');
const flowInput=all(dock).find(n=>n.tagName==='INPUT'&&n.type==='checkbox');flowInput.checked=false;flowInput.onchange();assert.equal(frames.size,0,'Flow can be stopped');
flowInput.checked=true;flowInput.onchange();assert(frames.size>0,'Flow can be restarted');
const play=control('播放或暫停模型預報');play.onclick();assert.equal(play.getAttribute('aria-pressed'),'true');
callbacks.forEach(t=>{if(t.repeat&&t.ms===1000)t.fn();});slider.value=1;slider.oninput();assert.equal(play.getAttribute('aria-pressed'),'false','Scrubbing pauses playback');
layers.value='rain';layers.onchange();control('降水累積時段').value='3';control('降水累積時段').onchange();flush();assert.equal(requests().length,before,'Changing accumulation does not download again');
popups.at(-1).remove();assert(markers.at(-1).removed);slider.oninput();assert(popups.at(-1).closed,'Changing time does not reopen a closed point');pick();
maps[0].setView([44,142],7);flush();assert(requests().length>before,'Moving beyond coverage loads a new region');
const pending=requests().at(-1).data;mounted.dispose();const last=status.textContent;context.ModelWeatherMap.receive(fixture(pending));assert.equal(status.textContent,last,'Leaving the map rejects late results');
assert.equal(popups.at(-1).closed,true);assert(!maps[0].handlers.click,'Disposal removes the map click listener');assert.equal(callbacks.size,0);assert.equal(frames.size,0);
console.log('PASS model map rendering, eight layers, viewport/time preservation, stale replies, saved markers, flow toggle, playback, accumulation, panning and cleanup.');

});
test('weather colours distinguish dry, wet and missing data and retain absolute units',()=>{
 assert.equal(G.color('rain',null)[3],0);
 assert(G.color('rain',0)[3]>0);
 assert.notDeepEqual(G.color('rain',0),G.color('rain',.1));
 assert.deepEqual(G.color('rain',3,1),G.color('rain',3,3));
 assert.deepEqual(G.color('wind',20),G.color('gust',20));
 assert.notDeepEqual(G.color('wind',10),G.color('wind',35));
});
