import {FIELDS,DEFAULT_PLACE} from '../public/core.mjs';
export function forecastFixture({place=DEFAULT_PLACE,temperature=20,now=Date.now()}={}){
 const start=Math.floor(now/3600000)*3600,time=Array.from({length:72},(_,i)=>start+i*3600),hourly={time},units={time:'unixtime'};
 for(const [key,[name,unit]]of Object.entries(FIELDS)){units[name]=unit;hourly[name]=time.map((_,i)=>key==='temperature'?temperature+Math.sin(i/4)*3:key==='pressure'?1013:key==='humidity'?60:key==='direction'?90:key==='wind'?12:key==='cloud'?40:0);}
 hourly.weather_code=time.map(()=>2);hourly.apparent_temperature=time.map(()=>temperature);hourly.visibility=time.map(()=>20000);hourly.uv_index=time.map(()=>0);
 const daily={time:Array.from({length:3},(_,i)=>start+i*86400),weather_code:[2,3,0],temperature_2m_min:[18,17,19],temperature_2m_max:[25,24,26],precipitation_sum:[0,2,0],wind_speed_10m_max:[18,20,12],sunrise:[start-3600,start+82800,start+169200],sunset:[start+36000,start+122400,start+208800],uv_index_max:[5,6,4]};
 return {latitude:place.lat,longitude:place.lon,timezone:place.timezone,hourly,hourly_units:units,current:{time:start,temperature_2m:temperature,relative_humidity_2m:60,wind_speed_10m:12,precipitation:0,weather_code:2,apparent_temperature:temperature,is_day:1,pressure_msl:1013,cloud_cover:40,wind_direction_10m:90},current_units:units,daily,daily_units:{time:'unixtime',temperature_2m_min:'°C',temperature_2m_max:'°C',precipitation_sum:'mm',wind_speed_10m_max:'km/h'}};
}
export function gridFixture(bounds,now=Date.now()){
 const t=Math.floor(now/3600000)*3600;return Array.from({length:81},(_,i)=>{const lat=bounds[0]+(bounds[2]-bounds[0])*Math.floor(i/9)/8,lon=((bounds[1]+(bounds[3]-bounds[1])*(i%9)/8+180)%360+360)%360-180,hourly={time:Array.from({length:97},(_,j)=>t+(j-24)*3600)},hourly_units={time:'unixtime'};
 for(const [key,[name,unit]]of Object.entries(FIELDS)){hourly_units[name]=unit;hourly[name]=hourly.time.map(()=>key==='temperature'?0:key==='pressure'?1013:key==='humidity'?60:key==='direction'?90:key==='wind'?12:key==='cloud'?40:0);}return {latitude:lat,longitude:lon,hourly,hourly_units};});
}
