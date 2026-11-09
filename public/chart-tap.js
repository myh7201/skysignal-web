/* Pointer-up commits a tap before WebView releases implicit touch capture.
   Synthetic click/leave events after release must never cancel or duplicate it. */
(function(root){'use strict';
function bind(element,{viewport,onTap,threshold=12}){
 let active=null,ignoreClick=false;
 const moved=e=>Math.hypot(e.clientX-active.x,e.clientY-active.y)>threshold||Math.abs((viewport?.scrollLeft||0)-active.left)>2||Math.abs((viewport?.scrollTop||0)-active.top)>2;
 element.onpointerdown=e=>{ignoreClick=false;active=e.isPrimary===false||e.button>0?null:{x:e.clientX,y:e.clientY,left:viewport?.scrollLeft||0,top:viewport?.scrollTop||0,id:e.pointerId,type:e.pointerType,moved:false};};
 element.onpointermove=e=>{if(active&&(active.id===undefined||e.pointerId===undefined||active.id===e.pointerId)&&moved(e))active.moved=true;};
 element.onpointerup=e=>{if(!active)return;if(active.id!==undefined&&e.pointerId!==undefined&&active.id!==e.pointerId)return;const commit=!active.moved&&!moved(e);active=null;ignoreClick=true;if(commit)onTap(e);};
 element.onpointercancel=()=>{active=null;ignoreClick=true;};
 element.onpointerleave=()=>{if(active?.type==='mouse')active.moved=true;};
 element.onclick=e=>{if(ignoreClick){ignoreClick=false;return;}active=null;onTap(e);};
 return {cancel(){active=null;ignoreClick=true;}};
}
function svgX(svg,event,width){
 try{const matrix=svg.getScreenCTM?.();if(matrix&&svg.createSVGPoint){const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;return p.matrixTransform(matrix.inverse()).x;}}catch{}
 const r=svg.getBoundingClientRect();return r.width?(event.clientX-r.left)/r.width*width:null;
}
const api={bind,svgX};root.ChartTap=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
