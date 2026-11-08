(function(root){'use strict';
 const G=root.ModelGrid,models=[['ifs','ECMWF IFS'],['gfs','NOAA GFS'],['icon','DWD ICON'],['gem','GEM Global'],['aifs','ECMWF AIFS']];
 const recent=[];let active=null,sequence=0,memory={};
 const slot=time=>Math.floor((time-120000)/1800000);
 function mount({canvas,dock,status,context:c,make,btn,action,places=[]}){
  let disposed=false,data=null,pending='',pendingKey='',timer=null,requestTimer=null,flowFrame=null,paintFrame=null,poll=null,resizeObserver=null,particles=[],lastFlow=0,values=[],u=[],v=[],times=[],selected=0;
  let model=localStorage.getItem('modelMapModel')||'ifs',field=localStorage.getItem('modelMapLayer')||'temperature',accumulation=Number(localStorage.getItem('modelMapAccumulation')||1),flow=localStorage.getItem('modelMapFlow')!=='off';
  if(!models.some(m=>m[0]===model))model='ifs';if(!G.layers[field])field='temperature';if(![1,3,6,24].includes(accumulation))accumulation=1;
  const zone=c.place.timezone||'UTC',stamp=time=>new Intl.DateTimeFormat('zh-HK',{timeZone:zone,month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(time));
  const controls=make('section','model-map-controls'),selectors=make('div','model-map-selectors'),layerSelect=make('select'),modelSelect=make('select');
  layerSelect.setAttribute('aria-label','模型氣象圖層');modelSelect.setAttribute('aria-label','氣象模型');
  for(const [key,config]of Object.entries(G.layers)){const option=make('option','',config.label);option.value=key;layerSelect.append(option);}layerSelect.value=field;
  for(const [key,name]of models){const option=make('option','',name);option.value=key;modelSelect.append(option);}modelSelect.value=model;
  selectors.append(layerSelect,modelSelect);
  const legend=make('div','model-map-legend'),gradient=make('div','model-map-gradient'),scale=make('div','model-map-scale'),extra=make('div','model-map-extra'),rainSelect=make('select');
  rainSelect.setAttribute('aria-label','降水累積時段');for(const [n,label]of [[1,'每小時'],[3,'累積3小時'],[6,'累積6小時'],[24,'累積24小時']]){const option=make('option','',label);option.value=n;rainSelect.append(option);}rainSelect.value=accumulation;
  const flowLabel=make('label','model-flow-toggle'),flowToggle=make('input');flowToggle.type='checkbox';flowToggle.checked=flow;flowLabel.append(flowToggle,make('span','','風向流線'));
  extra.append(rainSelect,flowLabel);legend.append(gradient,scale);
  const bar=make('div','map-playback model-map-playback'),heading=make('div','map-time-heading'),timeText=make('strong','','模型預報'),counter=make('span'),slider=make('input'),buttons=make('div','map-playback-actions');
  slider.type='range';slider.min=0;slider.max=0;slider.value=0;slider.disabled=true;slider.setAttribute('aria-label','模型預報時間');heading.append(timeText,counter);
  const pause=()=>{clearInterval(timer);timer=null;play.innerHTML='▶';play.setAttribute('aria-pressed','false');};
  const previous=btn('‹',()=>{pause();chooseTime(Math.max(0,selected-1));});previous.setAttribute('aria-label','上一個預報時段');
  const play=btn('▶',()=>{if(timer){pause();return;}if(times.length<2)return;timer=setInterval(()=>chooseTime((selected+1)%times.length),1000);play.innerHTML='Ⅱ';play.setAttribute('aria-pressed','true');});play.setAttribute('aria-label','播放或暫停模型預報');play.setAttribute('aria-pressed','false');
  const next=btn('›',()=>{pause();chooseTime(Math.min(times.length-1,selected+1));});next.setAttribute('aria-label','下一個預報時段');
  const now=btn('現在',()=>{pause();chooseTime(closest(Date.now()));});now.setAttribute('aria-label','返回目前模型預報時段');
  const retry=btn('重試',()=>request(true),'model-map-retry');retry.hidden=true;
  now.className='model-map-now';buttons.append(previous,play,next);bar.append(heading,buttons,slider,now);controls.append(selectors,extra,legend,bar,retry);dock.prepend(controls);
  function updateLegend(){
   const config=G.layers[field];
   gradient.style.background='linear-gradient(90deg,'+config.colors.join(',')+')';scale.replaceChildren();
   scale.append(make('span','model-map-unit',config.unit));
   for(const n of config.stops)scale.append(make('span','',String(n)));
   legend.setAttribute('aria-label',config.label+' 色階（'+config.unit+'）：'+config.stops.join('、'));
   stage?.setAttribute('data-field',field);
   rainSelect.hidden=!['rain','snow'].includes(field);flowLabel.hidden=!['wind','gust'].includes(field);extra.hidden=rainSelect.hidden&&flowLabel.hidden;
  }
  let stage=null;updateLegend();
  if(!root.L){canvas.append(make('p','map-empty','地圖元件暫未載入，請重新開啟頁面。'));status.textContent='模型地圖未能啟動';return {map:null,dispose(){},resize(){},refresh(){},resetView(){}};}
  stage=make('div','interactive-radar model-map-stage');stage.setAttribute('data-field',field);canvas.append(stage);
  const map=L.map(stage,{zoomControl:false,minZoom:3,maxZoom:15,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false,inertia:false});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Weather: <a href="https://open-meteo.com/">Open-Meteo</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>)',maxZoom:18}).addTo(map);
  const samePlace=memory.place===c.place.id&&Math.abs((memory.lat||0)-c.place.lat)<.02&&Math.abs(G.wrap((memory.lon||0)-c.place.lon))<.02;
  map.setView(samePlace&&memory.center?memory.center:[c.place.lat,c.place.lon],samePlace&&memory.zoom?memory.zoom:10);
  const raster=make('canvas','model-field-canvas'),stream=make('canvas','model-flow-canvas');raster.setAttribute('aria-label','區域模型氣象預報');stream.setAttribute('aria-hidden','true');map.getPane('overlayPane').append(raster,stream);
  const ctx=raster.getContext('2d'),flowCtx=stream.getContext('2d'),offscreen=make('canvas'),offCtx=offscreen.getContext('2d');
  if(!ctx||!flowCtx||!offCtx){status.textContent='手機暫未支援模型圖層繪製';return {map,dispose(){},resize(){},refresh(){},resetView(){}};}
  const markers=new Set();for(const p of [c.place,...places]){
   if(!G.finite(p.lat)||!G.finite(p.lon)||markers.has(p.id))continue;markers.add(p.id);
   const point=p.id===c.place.id;
   L.circleMarker([p.lat,p.lon],{radius:point?5:4,color:point?'#fff':'#243b53',weight:point?2:1,fillColor:point?'#267bb5':'#fff',fillOpacity:1,pane:'markerPane'}).addTo(map).bindTooltip(p.displayName||p.name||'地點');
  }

  let picked=null,pointPopup=null,pointMarker=null,pointError='';
  function updatePoint(){
   if(disposed||!picked)return;
   const content=make('div','model-point-reading'),heading=make('strong','model-point-title','選定位置');
   content.setAttribute('role','status');content.setAttribute('aria-live','polite');content.append(heading);
   const current=data?.model===model&&times.length,index=current?data.times.indexOf(times[selected]):-1;
   const at=key=>current&&index>=0?G.sample(data,G.fieldValues(data,key,index,['rain','snow'].includes(key)?accumulation:1),picked.lat,picked.lon):null;
   const temperature=at('temperature'),reading=make('div','model-point-temperature',G.finite(temperature)?temperature.toFixed(1)+' °C':current?'此座標暫無氣溫資料':pointError?'氣溫暫未能載入':'正在載入氣溫…');content.append(reading);
   if(field!=='temperature'){
    const value=at(field),config=G.layers[field],label=G.finite(value)?new Intl.NumberFormat('zh-HK',{maximumFractionDigits:field==='pressure'?0:1}).format(value)+' '+config.unit:'未提供';
    content.append(make('div','model-point-field',config.label+' · '+label));
   }
   content.append(make('small','model-point-coordinates',picked.lat.toFixed(4)+', '+G.wrap(picked.lon).toFixed(4)),make('small','model-point-source',(models.find(m=>m[0]===model)?.[1]||model)+' · 模型預報'));
   if(current)content.append(make('small','model-point-time',stamp(times[selected])));
   if(pointError||data?.model===model&&data.error)content.append(make('small','model-point-error',pointError||data.error));
   if(!pointPopup)pointPopup=L.popup({className:'model-point-popup',maxWidth:Math.max(140,Math.min(190,map.getSize().x-144)),minWidth:140,autoPan:true,autoPanPaddingTopLeft:[16,64],autoPanPaddingBottomRight:[80,16],closeButton:true});
   pointPopup.setLatLng([picked.lat,picked.lon]).setContent(content).openOn(map);
   pointPopup.getElement?.()?.querySelector('.leaflet-popup-close-button')?.setAttribute('aria-label','關閉地圖讀數');
  }
  function pickPoint(event){
   if(disposed||!G.finite(event.latlng?.lat)||!G.finite(event.latlng?.lng))return;
   picked={lat:event.latlng.lat,lon:event.latlng.lng};
   if(pointMarker)pointMarker.setLatLng([picked.lat,picked.lon]);
   else pointMarker=L.circleMarker([picked.lat,picked.lon],{radius:5,color:'#fff',weight:2,fillColor:'#213e55',fillOpacity:1,interactive:false,pane:'markerPane'}).addTo(map);
   updatePoint();
  }
  map.on('click',pickPoint);
  map.on('popupclose',event=>{if(!disposed&&event.popup===pointPopup){picked=null;pointMarker?.remove();pointMarker=null;}});
  const inspect=btn('查看中心氣溫',()=>pickPoint({latlng:map.getCenter()}),'model-point-inspect');inspect.setAttribute('aria-label','查看地圖中心氣溫');canvas.append(inspect);

  function bounds(){const b=map.getBounds(),west=b.getWest(),east=b.getEast();return [Math.max(-85,b.getSouth()),west,Math.min(85,b.getNorth()),Math.min(west+360,east)];}
  function expanded(){const b=bounds(),dy=Math.max(.01,(b[2]-b[0])*.12),dx=Math.max(.01,(b[3]-b[1])*.12),center=G.wrap((b[1]+b[3])/2),span=Math.min(360,b[3]-b[1]+dx*2);return [Math.max(-85,Math.floor((b[0]-dy)*1000)/1000),Math.floor((center-span/2)*1000)/1000,Math.min(85,Math.ceil((b[2]+dy)*1000)/1000),Math.min(Math.floor((center-span/2)*1000)/1000+360,Math.ceil((center+span/2)*1000)/1000)];}
  function closest(time){if(!times.length)return 0;let best=0;for(let i=1;i<times.length;i++)if(Math.abs(times[i]-time)<Math.abs(times[best]-time))best=i;return best;}
  function chooseTime(index){
   if(!times.length)return;selected=index;memory.time=times[index];slider.value=index;
   timeText.textContent=stamp(times[index])+' · 預報';counter.textContent=(index+1)+' / '+times.length;slider.setAttribute('aria-valuetext',timeText.textContent);
   previous.disabled=index===0;next.disabled=index===times.length-1;updateFields();
  }
  function updateFields(){
   values=[];u=[];v=[];particles=[];flowCtx.clearRect(0,0,stream.width,stream.height);
   if(data?.model===model&&times.length&&data.available?.includes(field)){
    const index=data.times.indexOf(times[selected]);values=G.fieldValues(data,field,index,accumulation);
    const speed=G.fieldValues(data,'wind',index),direction=G.fieldValues(data,'direction',index);
    for(let i=0;i<speed.length;i++){const vector=G.vector(speed[i],direction[i]);u.push(vector?.u??null);v.push(vector?.v??null);}
   }
   if(data?.model===model&&values.some(G.finite)){const dry=['rain','snow'].includes(field)&&values.filter(G.finite).every(x=>x===0);status.textContent=data.error||(models.find(m=>m[0]===model)?.[1]||model)+' · 模型預報'+(dry?(field==='snow'?' · 範圍內未預報降雪':' · 範圍內未預報降水'):'')+' · '+Math.max(1,Math.round(data.samplingKm))+' 公里區域取樣 · Open-Meteo';}
   draw();startFlow();updatePoint();
  }
  function draw(){
   if(disposed)return;const size=map.getSize(),w=size.x,h=size.y;if(w<1||h<1)return;
   const origin=map.containerPointToLayerPoint([0,0]),transform='translate('+origin.x+'px,'+origin.y+'px)';raster.style.transform=transform;stream.style.transform=transform;
   for(const surface of [raster,stream]){surface.style.width=w+'px';surface.style.height=h+'px';surface.width=w;surface.height=h;}ctx.clearRect(0,0,w,h);
   if(!data||data.model!==model||!values.some(G.finite))return;
   const ow=Math.min(160,w),oh=Math.max(1,Math.round(h/w*ow));offscreen.width=ow;offscreen.height=oh;const image=offCtx.createImageData(ow,oh);
   const left=map.containerPointToLatLng([0,0]).lng,right=map.containerPointToLatLng([w,0]).lng;
   for(let y=0;y<oh;y++){
    const lat=map.containerPointToLatLng([0,(y+.5)/oh*h]).lat;
    for(let x=0;x<ow;x++){const lon=left+(x+.5)/ow*(right-left),value=G.sample(data,values,lat,lon),color=G.color(field,value,['rain','snow'].includes(field)?accumulation:1),at=(y*ow+x)*4;for(let i=0;i<4;i++)image.data[at+i]=color[i];}
   }
   offCtx.putImageData(image,0,0);ctx.imageSmoothingEnabled=true;ctx.drawImage(offscreen,0,0,w,h);
   if(['wind','gust'].includes(field)&&!flow){
    ctx.strokeStyle='#164057ce';ctx.lineWidth=1.2;
    for(let y=30;y<h;y+=60)for(let x=30;x<w;x+=60){const at=map.containerPointToLatLng([x,y]),east=G.sample(data,u,at.lat,at.lng),north=G.sample(data,v,at.lat,at.lng),length=Math.hypot(east,north);if(!G.finite(east)||!G.finite(north)||length<.5)continue;const dx=east/length*10,dy=-north/length*10;ctx.beginPath();ctx.moveTo(x-dx,y-dy);ctx.lineTo(x+dx,y+dy);ctx.moveTo(x+dx-dx*.5-dy*.4,y+dy-dy*.5+dx*.4);ctx.lineTo(x+dx,y+dy);ctx.lineTo(x+dx-dx*.5+dy*.4,y+dy-dy*.5-dx*.4);ctx.stroke();}
   }
   if(field==='pressure'){
    ctx.strokeStyle='#163d55b0';ctx.lineWidth=1;ctx.font='11px sans-serif';ctx.fillStyle='#12394f';const labels=[];
    for(const line of G.contours(data,values,4)){
     const points=line.points.map(p=>map.latLngToContainerPoint(p));ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);ctx.lineTo(points[1].x,points[1].y);ctx.stroke();
     const x=(points[0].x+points[1].x)/2,y=(points[0].y+points[1].y)/2;
     if(x>15&&y>15&&x<w-30&&y<h-15&&!labels.some(p=>Math.hypot(p.x-x,p.y-y)<85)){ctx.fillText(String(line.level),x+3,y-3);labels.push({x,y});}
    }
   }
  }
  function startFlow(){
   if(flowFrame!==null)cancelAnimationFrame(flowFrame);flowFrame=null;
   if(disposed||!flow||!['wind','gust'].includes(field)||!values.some(G.finite)||!u.some(G.finite))return;
   const tick=time=>{
    if(disposed)return;flowFrame=requestAnimationFrame(tick);if(time-lastFlow<40)return;const dt=Math.min(2,(time-lastFlow)/40||1);lastFlow=time;
    const w=stream.width,h=stream.height;if(!w||!h)return;flowCtx.globalCompositeOperation='destination-in';flowCtx.fillStyle='rgba(0,0,0,.91)';flowCtx.fillRect(0,0,w,h);flowCtx.globalCompositeOperation='source-over';flowCtx.strokeStyle='rgba(255,255,255,.85)';flowCtx.lineWidth=1;
    while(particles.length<Math.min(130,Math.round(w*h/2200)))particles.push({x:Math.random()*w,y:Math.random()*h,age:Math.random()*60});
    for(const p of particles){const at=map.containerPointToLatLng([p.x,p.y]),east=G.sample(data,u,at.lat,at.lng),north=G.sample(data,v,at.lat,at.lng);
     if(!G.finite(east)||!G.finite(north)||p.age++>65||p.x<0||p.y<0||p.x>w||p.y>h){p.x=Math.random()*w;p.y=Math.random()*h;p.age=0;continue;}
     const x=p.x+east*.045*dt,y=p.y-north*.045*dt;flowCtx.beginPath();flowCtx.moveTo(p.x,p.y);flowCtx.lineTo(x,y);flowCtx.stroke();p.x=x;p.y=y;
    }
   };flowFrame=requestAnimationFrame(tick);
  }
  function receive(result){
   if(disposed||result.requestId!==pending||result.model&&result.model!==model)return;pending='';pendingKey='';retry.hidden=true;
   if(!result.cells){pointError=result.error||'模型地圖未能載入';status.textContent=pointError;retry.hidden=false;updatePoint();return;}
   pointError='';
   data=result;recent.unshift(result);while(recent.length>2)recent.pop();
   times=data.times.filter(t=>t>=Math.floor(Date.now()/3600000)*3600000&&t<=Date.now()+72*3600000);slider.max=Math.max(0,times.length-1);slider.disabled=!times.length;play.disabled=times.length<2;
   for(const option of layerSelect.children)option.disabled=Boolean(data.completeFields&&!data.available.includes(option.value));
   const name=models.find(m=>m[0]===model)?.[1]||model;
   status.textContent=data.error||name+' · 模型預報 · '+Math.max(1,Math.round(data.samplingKm))+' 公里區域取樣 · Open-Meteo';
   if(!data.available.includes(field)){chooseTime(closest(memory.time||Date.now()));status.textContent=name+' 暫未提供這個圖層，請選其他圖層或模型';return;}
   chooseTime(closest(memory.time||Date.now()));
  }
  function request(force=false){
   if(disposed)return;const b=bounds();
   if(!force){
    const cached=recent.find(d=>d.model===model&&G.sameRegion(d,b)&&slot(d.checked||d.fetched)===slot(Date.now())&&(d.available.includes(field)||d.completeFields));
    if(cached){receive({...cached,requestId:pending='cache:'+ ++sequence});return;}
    if(data?.model===model&&G.sameRegion(data,b)&&slot(data.checked||data.fetched)===slot(Date.now())&&(data.available.includes(field)||data.completeFields))return;
   }
   const region=expanded(),key=JSON.stringify([model,region,field]);if(pendingKey===key&&!force)return;
   pending='map:'+Date.now()+':'+ ++sequence;pendingKey=key;pointError='';updatePoint();status.textContent='正在載入 '+(models.find(m=>m[0]===model)?.[1]||model)+' 區域預報…';retry.hidden=true;
   action('modelMap',{requestId:pending,model,field,bounds:region,force});
  }
  function schedule(){clearTimeout(requestTimer);requestTimer=setTimeout(()=>request(),650);}
  layerSelect.onchange=()=>{field=layerSelect.value;localStorage.setItem('modelMapLayer',field);updateLegend();updateFields();
   if(data?.model===model&&data.completeFields&&!data.available.includes(field))status.textContent='此模型暫未提供這個圖層，請切換模型';else schedule();
  };
  modelSelect.onchange=()=>{action('cancelModelMap');pending='';pendingKey='';model=modelSelect.value;pointError='';localStorage.setItem('modelMapModel',model);for(const option of layerSelect.children)option.disabled=false;updateFields();schedule();};
  rainSelect.onchange=()=>{accumulation=Number(rainSelect.value);localStorage.setItem('modelMapAccumulation',accumulation);updateLegend();updateFields();};
  flowToggle.onchange=()=>{flow=flowToggle.checked;localStorage.setItem('modelMapFlow',flow?'on':'off');flowCtx.clearRect(0,0,stream.width,stream.height);startFlow();};
  slider.oninput=()=>{pause();chooseTime(Number(slider.value));};
  map.on('move',()=>{if(paintFrame!==null)return;paintFrame=requestAnimationFrame(()=>{paintFrame=null;draw();});});
  map.on('moveend',()=>{const center=map.getCenter();memory={...memory,place:c.place.id,lat:c.place.lat,lon:c.place.lon,center:[center.lat,center.lng],zoom:map.getZoom()};schedule();});
  const result={map,receive,refresh:request,info(){return data?{...data,cells:undefined,times:undefined,layer:G.layers[field].label,accumulation:['rain','snow'].includes(field)?accumulation:null,validTime:times[selected]}:null;},resetView(){map.setView([c.place.lat,c.place.lon],10);},resize(){map.invalidateSize({pan:false});draw();},dispose(){
   if(disposed)return;disposed=true;pointPopup?.remove();pointMarker?.remove();map.off('click',pickPoint);pause();clearTimeout(requestTimer);clearInterval(poll);resizeObserver?.disconnect();if(flowFrame!==null)cancelAnimationFrame(flowFrame);if(paintFrame!==null)cancelAnimationFrame(paintFrame);action('cancelModelMap');if(active===result)active=null;
  }};
  if(typeof root.ResizeObserver==='function'){resizeObserver=new root.ResizeObserver(()=>{if(!disposed)result.resize();});resizeObserver.observe(canvas);}
  active=result;poll=setInterval(()=>request(),60000);schedule();return result;
 }
 const api={mount,receive:value=>active?.receive(value),models};root.ModelWeatherMap=api;
})(typeof window==='undefined'?globalThis:window);

