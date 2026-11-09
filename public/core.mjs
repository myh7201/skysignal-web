import './warning-policy.js?v=0.52.0';
const warningDisplayPolicy=globalThis.WeatherPolicy||globalThis.window?.WeatherPolicy;
export const MODELS = Object.freeze({ifs:{name:'ECMWF IFS',api:'ecmwf_ifs025'},gfs:{name:'NOAA GFS',api:'ncep_gfs_global'},icon:{name:'DWD ICON',api:'icon_global'},gem:{name:'GEM Global',api:'cmc_gem_gdps'},aifs:{name:'ECMWF AIFS',api:'ecmwf_aifs025_single'}});
export const DEFAULT_PLACE = Object.freeze({id:'hong-kong',name:'香港',lat:22.3027,lon:114.1772,timezone:'Asia/Hong_Kong',countryCode:'HK',country:'香港'});
export const FIELDS = Object.freeze({temperature:['temperature_2m','°C',-100,70],humidity:['relative_humidity_2m','%',0,100],wind:['wind_speed_10m','km/h',0,500],direction:['wind_direction_10m','°',0,360],rain:['precipitation','mm',0,5000],gust:['wind_gusts_10m','km/h',0,600],cloud:['cloud_cover','%',0,100],snow:['snowfall','cm',0,2000],pressure:['pressure_msl','hPa',800,1150]});
export const finite = n => typeof n === 'number' && Number.isFinite(n);
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const wrap = n => ((n + 180) % 360 + 360) % 360 - 180;
export function validCoords(lat,lon){return finite(lat)&&finite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180;}
export function normalizePlace(p){
 const rawLat=p.lat??p.latitude,rawLon=p.lon??p.longitude;if(rawLat==null||rawLon==null||rawLat===''||rawLon==='')throw Error('地點座標無效');const lat=Number(rawLat),lon=Number(rawLon);if(!validCoords(lat,lon))throw Error('地點座標無效');
 let timezone=String(p.timezone||'UTC');try{new Intl.DateTimeFormat('zh-HK',{timeZone:timezone}).format();}catch{timezone='UTC';}
 return {id:String(p.id||`${lat.toFixed(4)},${lon.toFixed(4)}`),name:String(p.name||'所選位置').slice(0,80),lat,lon,timezone,countryCode:String(p.countryCode||p.country_code||'').toUpperCase(),country:String(p.country||''),admin:String(p.admin||p.admin1||''),locatedAt:p.locatedAt||null};
}
export function validateBounds(b){if(!Array.isArray(b)||b.length!==4||!b.every(finite)||b[0]<-85||b[2]>85||b[2]<=b[0]||b[3]<=b[1]||b[3]-b[1]>360||Math.abs(b[1])>720||Math.abs(b[3])>720)throw Error('地圖範圍無效');return b;}
export function gridCoordinates(bounds,side=9){
 const [south,west,north,east]=validateBounds(bounds);if(side!==9)throw Error('模型地圖固定使用 9×9 區域取樣');
 return Array.from({length:side*side},(_,i)=>({lat:south+(north-south)*Math.floor(i/side)/(side-1),lon:west+(east-west)*(i%side)/(side-1)}));
}
export function gridUrl(bounds,model){
 if(!MODELS[model])throw Error('未知氣象模型');const points=gridCoordinates(bounds),q=new URLSearchParams({latitude:points.map(p=>p.lat.toFixed(5)).join(','),longitude:points.map(p=>wrap(p.lon).toFixed(5)).join(','),elevation:points.map(()=>'nan').join(','),models:MODELS[model].api,hourly:Object.values(FIELDS).map(f=>f[0]).join(','),forecast_hours:'73',past_hours:'24',timeformat:'unixtime',timezone:'UTC',cell_selection:'nearest',wind_speed_unit:'kmh',precipitation_unit:'mm',temperature_unit:'celsius'});
 return 'https://api.open-meteo.com/v1/forecast?'+q;
}
export function distance(a,b){const r=Math.PI/180,h=Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lon-a.lon)*r/2)**2;return 6371*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));}
export function parseGrid(raw,bounds,model,now=Date.now()){
 const points=gridCoordinates(bounds);if(!Array.isArray(raw)||raw.length!==81)throw Error('模型地圖取樣數目不符');
 let times=null,useful=0;const available=new Set(),cells=points.map((p,i)=>{
  const point=raw[i],cell={lat:p.lat,lon:p.lon};if(!point||!validCoords(point.latitude,point.longitude)||distance({lat:p.lat,lon:wrap(p.lon)},{lat:point.latitude,lon:point.longitude})>200)return cell;
  const h=point.hourly,u=point.hourly_units,t=h?.time;if(!h||u?.time!=='unixtime'||!Array.isArray(t)||t.length<2||t.length>120)return cell;
  const ts=t.map(v=>finite(v)?v*1000:NaN);if(ts.some((v,j)=>!finite(v)||v<now-26*3600000||v>now+80*3600000||(j>0&&v-ts[j-1]!==3600000)))throw Error('模型時間軸不在有效範圍');
  if(!times)times=ts;if(times.length!==ts.length||times.some((v,j)=>v!==ts[j]))return cell;
  const fields={};for(const [key,[variable,unit,lo,hi]]of Object.entries(FIELDS)){
   const values=h[variable];if(u[variable]!==unit||!Array.isArray(values)||values.length!==times.length)continue;
   const series=values.map(v=>finite(v)&&v>=lo&&v<=hi?v:null);if(series.some(finite)){fields[key]=series;if(key!=='direction')available.add(key);}
  }
  if(Object.keys(fields).length){useful++;Object.assign(cell,{fields,gridLat:point.latitude,gridLon:point.longitude});}return cell;
 });
 if(!times||useful<4)throw Error('這個模型暫未提供足夠區域資料');
 return {model,modelName:MODELS[model].name,rows:9,cols:9,bounds:[...bounds],times,cells,available:[...available],completeFields:true,fetched:now,checked:now,source:'Open-Meteo',runVerified:false,samplingKm:distance(points[0],points[10])};
}
export function forecastUrl(place,model){
 place=normalizePlace(place);if(!MODELS[model])throw Error('未知氣象模型');
 const current='temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m';
 const q=new URLSearchParams({latitude:String(place.lat),longitude:String(place.lon),models:MODELS[model].api,current,hourly:current.replace(',is_day','')+',visibility,uv_index',daily:'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,wind_speed_10m_max,uv_index_max',forecast_days:'10',timezone:place.locatedAt?'auto':place.timezone,timeformat:'unixtime',wind_speed_unit:'kmh',temperature_unit:'celsius',precipitation_unit:'mm'});
 return 'https://api.open-meteo.com/v1/forecast?'+q;
}
const value=(n,lo=-Infinity,hi=Infinity)=>finite(n)&&n>=lo&&n<=hi?n:null;
export function parseForecast(raw,place,model,now=Date.now()){
 place=normalizePlace(place);if(raw?.error||!MODELS[model])throw Error(raw?.reason||'預報來源回應有誤');if(place.locatedAt&&raw.timezone)place=normalizePlace({...place,timezone:raw.timezone});
 if(!validCoords(raw.latitude,raw.longitude)||distance(place,{lat:raw.latitude,lon:raw.longitude})>160)throw Error('來源回傳的預報網格不符合所選地點');
 if(raw.hourly_units?.time!=='unixtime'||raw.hourly_units?.temperature_2m!=='°C'||raw.hourly_units?.wind_speed_10m!=='km/h'||raw.hourly_units?.precipitation!=='mm')throw Error('預報單位與預期不符');
 const t=raw.hourly?.time;if(!Array.isArray(t)||!t.length||t.length>400||!Array.isArray(raw.daily?.time))throw Error('來源缺少有效預報時間');
 const hours=t.map((time,i)=>{
  if(!finite(time)||(i&&time-t[i-1]!==3600))throw Error('逐小時預報時間軸不連續');
  const row={time:time*1000};for(const [key,[variable,unit,lo,hi]]of Object.entries(FIELDS)){const series=raw.hourly[variable];row[key]=raw.hourly_units[variable]===unit&&Array.isArray(series)&&series.length===t.length?value(series[i],lo,hi):null;}
  row.apparent=value(raw.hourly.apparent_temperature?.[i],-120,90);row.code=value(raw.hourly.weather_code?.[i],0,99);row.visibility=value(raw.hourly.visibility?.[i],0,1000000);row.uv=value(raw.hourly.uv_index?.[i],0,40);return row;
 });
 if(!hours.some(h=>finite(h.temperature)))throw Error('來源沒有可用的氣溫預報');
 const d=raw.daily,du=raw.daily_units||{},days=d.time.map((time,i)=>({time:finite(time)?time*1000:null,min:du.temperature_2m_min==='°C'?value(d.temperature_2m_min?.[i],-100,70):null,max:du.temperature_2m_max==='°C'?value(d.temperature_2m_max?.[i],-100,70):null,rain:du.precipitation_sum==='mm'?value(d.precipitation_sum?.[i],0,10000):null,wind:du.wind_speed_10m_max==='km/h'?value(d.wind_speed_10m_max?.[i],0,600):null,code:value(d.weather_code?.[i],0,99),sunrise:finite(d.sunrise?.[i])?d.sunrise[i]*1000:null,sunset:finite(d.sunset?.[i])?d.sunset[i]*1000:null,uv:value(d.uv_index_max?.[i],0,40)})).filter(d=>d.time&&finite(d.min)&&finite(d.max)&&d.min<=d.max);
 if(!days.length)throw Error('來源沒有可用的每日預報');
 const c=raw.current||{},cu=raw.current_units||{},closest=hours.reduce((a,b)=>Math.abs(a.time-now)<Math.abs(b.time-now)?a:b),current={...closest};
 if(finite(c.time)&&Math.abs(c.time*1000-now)<3600000){for(const [key,[variable,unit,lo,hi]]of Object.entries(FIELDS))if(cu[variable]===unit)current[key]=value(c[variable],lo,hi);current.time=c.time*1000;current.apparent=value(c.apparent_temperature,-120,90);current.code=value(c.weather_code,0,99);current.isDay=c.is_day===1;}
 return {place,model,checked:now,current,hours,days,gridLat:raw.latitude,gridLon:raw.longitude,source:'Open-Meteo',timezone:place.timezone};
}
export function weather(code){
 if(!finite(code))return {name:'天氣狀況暫缺',kind:'cloud'};
 if(code===0)return {name:'晴朗',kind:'sun'};if(code===1)return {name:'大致晴朗',kind:'partly'};if(code===2)return {name:'局部多雲',kind:'partly'};if(code===3)return {name:'陰天',kind:'cloud'};
 if([45,48].includes(code))return {name:'霧',kind:'fog'};if(code>=51&&code<=57)return {name:code>=56?'凍毛毛雨':'毛毛雨',kind:'rain'};if(code>=61&&code<=67)return {name:code>=66?'凍雨':'有雨',kind:'rain'};if(code>=71&&code<=77)return {name:'降雪',kind:'snow'};if(code>=80&&code<=82)return {name:'驟雨',kind:'rain'};if(code>=85&&code<=86)return {name:'驟雪',kind:'snow'};if(code>=95&&code<=99)return {name:'雷暴',kind:'storm'};return {name:'天氣狀況暫缺',kind:'cloud'};
}
export function number(n,digits=0){return finite(n)?n.toLocaleString('zh-HK',{maximumFractionDigits:digits,minimumFractionDigits:digits}):'—';}
export function stamp(time,zone='Asia/Hong_Kong',kind='full'){
 if(!finite(time))return '—';const options=kind==='hour'?{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}:kind==='day'?{month:'numeric',day:'numeric',weekday:'short'}:{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'};
 return new Intl.DateTimeFormat('zh-HK',{timeZone:zone,...options}).format(time);
}
export function direction(n){return finite(n)?['北','東北','東','東南','南','西南','西','西北'][Math.round(n/45)%8]:'—';}
export function wind(n,unit='kmh'){if(!finite(n))return '—';if(unit==='ms')return number(n/3.6,1)+' m/s';if(unit==='bft'){const limits=[1,6,12,20,29,39,50,62,75,89,103,118];return String(limits.filter(v=>n>=v).length)+' 級';}return number(n)+' km/h';}
export function hourWindow(data,now=Date.now(),count=24){return (data?.hours||[]).filter(h=>h.time>=Math.floor(now/3600000)*3600000).slice(0,count);}
export function chartPoints(rows,field,width=720,height=150){
 const values=rows.map(r=>r[field]).filter(finite);if(!values.length)return [];const low=Math.min(...values),high=Math.max(...values),span=Math.max(high-low,field==='temperature'?4:1);
 return rows.map((r,i)=>({x:24+i/Math.max(1,rows.length-1)*(width-48),y:height-20-(r[field]-low)/span*(height-45),value:r[field],valid:finite(r[field])}));
}
export async function fetchJSON(url,{signal,timeout=18000}={}){
 const controller=new AbortController(),abort=()=>controller.abort(signal?.reason);if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});let expired=false;
 const timer=setTimeout(()=>{expired=true;controller.abort();},timeout);
 try{const response=await fetch(url,{signal:controller.signal,credentials:'omit',headers:{Accept:'application/json'}});let raw;try{raw=await response.json();}catch{if(response.ok)throw Error('來源回傳格式無法辨認');raw={};}
  if(!response.ok)throw Error(response.status===429?'來源暫時限制請求，請稍候再試':`來源回應 HTTP ${response.status}${raw?.reason?'：'+String(raw.reason).slice(0,240):''}`);if(raw?.error)throw Error(String(raw.reason||'來源回應有誤'));return raw;
 }catch(e){if(expired)throw Error('來源連線逾時，請稍後重試');if(e.name==='TypeError')throw Error('無法連接資料來源，請檢查網絡後重試');throw e;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export function makeStore(storage){return {get(key,fallback=null){try{const value=JSON.parse(storage.getItem('skysignal:'+key));return value===null?fallback:value;}catch{return fallback;}},set(key,value){try{storage.setItem('skysignal:'+key,JSON.stringify(value));return true;}catch{return false;}},remove(key){try{storage.removeItem('skysignal:'+key);}catch{}}};}
export function chargeMap(store,now=Date.now()){
 const saved=store.get('map-budget',{}),slots={minute:Math.floor(now/60000),hour:Math.floor(now/3600000),day:Math.floor(now/86400000)},limits={minute:480,hour:4000,day:8000},next={};
 for(const key of Object.keys(slots)){const count=saved[key]?.slot===slots[key]?saved[key].count:0;if(count+81>limits[key])throw Error(key==='minute'?'地圖讀取較頻密，請在下一分鐘再試':'模型地圖本時段的請求已達上限，已載入圖層仍可使用');next[key]={slot:slots[key],count:count+81};}store.set('map-budget',next);
}
export const isHongKong=p=>p.countryCode==='HK'||(!p.countryCode&&p.lat>=22.14&&p.lat<22.55&&p.lon>=113.84&&p.lon<114.44);
export function officialSource(p){
 if(isHongKong(p))return {name:'香港天文台',url:'https://www.hko.gov.hk/tc/index.html'};
 const sources={JP:['日本氣象廳','https://www.jma.go.jp/bosai/warning/'],TW:['中央氣象署','https://www.cwa.gov.tw/V8/C/'],MO:['澳門地球物理氣象局','https://www.smg.gov.mo/'],CN:['中國氣象局','https://www.cma.gov.cn/'],US:['美國國家氣象局','https://www.weather.gov/'],GB:['英國氣象局','https://www.metoffice.gov.uk/weather/warnings-and-advice/uk-warnings'],CA:['加拿大環境部','https://weather.gc.ca/'],AU:['澳洲氣象局','https://www.bom.gov.au/']};const [name,url]=sources[p.countryCode]||['世界氣象組織 · 各地官方警告','https://severeweather.wmo.int/'];return {name,url};
}
export function parseHKWarnings(summary,details,now=Date.now()){
 if(!summary||typeof summary!=='object'||Array.isArray(summary)||Object.values(summary).some(s=>!s||typeof s!=='object'||typeof s.actionCode!=='string'))throw Error('官方警告摘要格式無效');
 const names={WMSGNL:'強烈季候風信號',WFIRE:'火災危險警告',WFROST:'霜凍警告',WHOT:'酷熱天氣警告',WCOLD:'寒冷天氣警告',WRAIN:'暴雨警告信號',WFNTSA:'新界北部水浸特別報告',WL:'山泥傾瀉警告',WTCSGNL:'熱帶氣旋警告信號',WTS:'雷暴警告',WTMW:'海嘯警告'};
 const list=Object.entries(summary).filter(([,s])=>s&&typeof s==='object'&&s.actionCode!=='CANCEL').map(([key,s])=>{const full=details?.details?.find(d=>d.warningStatementCode===key||d.warningStatementCode===s.code);return {id:s.code||key,title:String(s.name||names[key]||key),scope:'香港',level:s.type||'',issued:s.issueTime,updated:s.updateTime,description:Array.isArray(full?.contents)?full.contents.join('\n\n'):'官方暫未提供全文，請查看香港天文台。',source:'香港天文台',url:'https://www.hko.gov.hk/tc/wxinfo/warning.htm'};});
 return {status:'ok',checked:now,items:warningDisplayPolicy.ordered(list),source:'香港天文台',scope:'香港'};
}
export async function warningsFor(place,signal){
 if(isHongKong(place)){
  const [summary,details]=await Promise.allSettled([fetchJSON('https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=tc',{signal}),fetchJSON('https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warningInfo&lang=tc',{signal})]);
  if(summary.status==='rejected')throw summary.reason;return parseHKWarnings(summary.value,details.status==='fulfilled'?details.value:null);
 }
 if(place.countryCode==='US'){
  const raw=await fetchJSON(`https://api.weather.gov/alerts/active?point=${place.lat.toFixed(4)},${place.lon.toFixed(4)}`,{signal});if(!Array.isArray(raw.features))throw Error('官方警告格式無效');
  return {status:'ok',checked:Date.now(),source:'美國國家氣象局',scope:place.name,items:raw.features.map(f=>f.properties).filter(p=>p&&p.status==='Actual'&&p.messageType!=='Cancel'&&(!p.expires||Date.parse(p.expires)>Date.now())).map(p=>({id:p.id,title:p.event,level:p.severity,scope:p.areaDesc,issued:p.sent,updated:p.sent,description:[p.headline,p.description,p.instruction].filter(Boolean).join('\n\n'),source:'美國國家氣象局',url:'https://www.weather.gov/'}))};
 }
 return {status:'unsupported',checked:Date.now(),items:[],source:officialSource(place).name,scope:place.name};
}

