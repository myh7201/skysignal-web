(function(root){'use strict';
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 const layers={
  temperature:{label:'氣溫',unit:'°C',stops:[-30,-15,0,15,30,45],colors:['#61429c','#4a76bb','#6dc0db','#68c78d','#f3c861','#dc605a']},
  wind:{label:'風速及風向',unit:'km/h',stops:[0,10,25,50,80,120],colors:['#a4d7dc','#70bdb0','#83bf76','#e1c355','#da7858','#ad4c89']},
  rain:{label:'降水量',unit:'mm',stops:[0,.1,1,3,10,30,60],colors:['#dcecf4','#a3d9ee','#68b6d9','#4d93c6','#7774bd','#b75c9b','#d47666'],dry:true},
  gust:{label:'陣風',unit:'km/h',stops:[0,10,25,50,80,120],colors:['#a4d7dc','#70bdb0','#83bf76','#e1c355','#da7858','#ad4c89']},
  cloud:{label:'雲量',unit:'%',stops:[0,20,50,80,100],colors:['#537cac','#7c9bbc','#a5b8ce','#d1dbe5','#f1f4f7']},
  humidity:{label:'相對濕度',unit:'%',stops:[0,20,40,60,80,100],colors:['#d4b48b','#c6c59d','#99c8af','#70bdbe','#5f9ec0','#657db7']},
  snow:{label:'降雪量',unit:'cm',stops:[0,.1,1,3,10,20],colors:['#e3ecf6','#c0d8ec','#96b6dc','#8293c8','#9d77b8','#b96997'],dry:true},
  pressure:{label:'海平面氣壓',unit:'hPa',stops:[970,990,1010,1030,1050],colors:['#9675b9','#6598c3','#80bebd','#cbcb8b','#d49e73']}
 };
 function wrap(lon){return ((lon+180)%360+360)%360-180;}
 function unwrap(lon,center){return center+wrap(lon-center);}
 function fieldValues(data,key,index,accumulation=1){
  return data.cells.map(cell=>{
   const values=cell?.fields?.[key];if(!Array.isArray(values))return null;
   if(key!=='rain'&&key!=='snow')return finite(values[index])?values[index]:null;
   if(index-accumulation+1<0)return null;let sum=0;
   for(let i=index-accumulation+1;i<=index;i++){
    if(!finite(values[i])||(i>index-accumulation+1&&data.times[i]-data.times[i-1]!==3600000))return null;
    sum+=values[i];
   }
   return sum;
  });
 }
 function sample(data,values,lat,lon){
  if(!data||!values)return null;const b=data.bounds,nx=data.cols,ny=data.rows;
  lon=unwrap(lon,(b[1]+b[3])/2);
  const x=(lon-b[1])/(b[3]-b[1])*(nx-1),y=(lat-b[0])/(b[2]-b[0])*(ny-1);
  if(x<-.000001||y<-.000001||x>nx-1+.000001||y>ny-1+.000001)return null;
  const col=Math.min(nx-2,Math.max(0,Math.floor(x))),row=Math.min(ny-2,Math.max(0,Math.floor(y))),tx=Math.max(0,Math.min(1,x-col)),ty=Math.max(0,Math.min(1,y-row));
  const indices=[row*nx+col,row*nx+col+1,(row+1)*nx+col,(row+1)*nx+col+1],weights=[(1-tx)*(1-ty),tx*(1-ty),(1-tx)*ty,tx*ty];let value=0;
  for(let i=0;i<4;i++){if(weights[i]<1e-10)continue;const v=values[indices[i]];if(!finite(v))return null;value+=v*weights[i];}
  return value;
 }
 function color(key,value,accumulation=1){
  if(!finite(value))return [0,0,0,0];const config=layers[key],stops=config.stops.map(v=>config.dry?v*accumulation:v);
  if(config.dry&&value<.05)return [0,0,0,0];
  let i=0;while(i<stops.length-2&&value>stops[i+1])i++;
  const t=Math.max(0,Math.min(1,(value-stops[i])/(stops[i+1]-stops[i]))),rgb=hex=>[1,3,5].map(j=>parseInt(hex.slice(j,j+2),16)),a=rgb(config.colors[i]),b=rgb(config.colors[i+1]);
  return [...a.map((v,j)=>Math.round(v+(b[j]-v)*t)),155];
 }
 function contours(data,values,step=4){
  const valid=values.filter(finite);if(!valid.length)return [];const low=Math.floor(Math.min(...valid)/step)*step,high=Math.ceil(Math.max(...valid)/step)*step,result=[];
  const position=(r,c)=>[data.bounds[0]+r/(data.rows-1)*(data.bounds[2]-data.bounds[0]),data.bounds[1]+c/(data.cols-1)*(data.bounds[3]-data.bounds[1])];
  for(let level=low;level<=high&&level<=low+160;level+=step)for(let r=0;r<data.rows-1;r++)for(let c=0;c<data.cols-1;c++){
   const ids=[r*data.cols+c,r*data.cols+c+1,(r+1)*data.cols+c+1,(r+1)*data.cols+c],v=ids.map(i=>values[i]);if(!v.every(finite))continue;
   const p=[position(r,c),position(r,c+1),position(r+1,c+1),position(r+1,c)],hits=[];
   for(let i=0;i<4;i++){const j=(i+1)%4;if((v[i]<level)===(v[j]<level))continue;const t=(level-v[i])/(v[j]-v[i]);hits.push([p[i][0]+t*(p[j][0]-p[i][0]),p[i][1]+t*(p[j][1]-p[i][1])]);}
   for(let i=0;i+1<hits.length;i+=2)result.push({level,points:[hits[i],hits[i+1]]});
  }
  return result;
 }
 function vector(speed,direction){if(!finite(speed)||!finite(direction))return null;const a=direction*Math.PI/180;return {u:-speed*Math.sin(a),v:-speed*Math.cos(a)};}
 function sameRegion(data,bounds){
  if(!data?.bounds||!bounds)return false;const b=data.bounds,center=(b[1]+b[3])/2,w=unwrap(bounds[1],center),e=w+(bounds[3]-bounds[1]);
  return bounds[0]>=b[0]&&bounds[2]<=b[2]&&w>=b[1]&&e<=b[3];
 }
 const api={layers,finite,wrap,unwrap,fieldValues,sample,color,contours,vector,sameRegion};root.ModelGrid=api;if(typeof module==='object')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
