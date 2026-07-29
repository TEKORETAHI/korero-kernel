(()=>{
  'use strict';
  const C=globalThis.CanvasRenderingContext2D;
  if(C&&C.prototype&&!C.prototype.roundRect){
    C.prototype.roundRect=function(x,y,w,h,r=0){
      let rr=Array.isArray(r)?Number(r[0]||0):Number(r||0);
      rr=Math.max(0,Math.min(rr,Math.abs(w)/2,Math.abs(h)/2));
      this.moveTo(x+rr,y);
      this.lineTo(x+w-rr,y);
      this.quadraticCurveTo(x+w,y,x+w,y+rr);
      this.lineTo(x+w,y+h-rr);
      this.quadraticCurveTo(x+w,y+h,x+w-rr,y+h);
      this.lineTo(x+rr,y+h);
      this.quadraticCurveTo(x,y+h,x,y+h-rr);
      this.lineTo(x,y+rr);
      this.quadraticCurveTo(x,y,x+rr,y);
      this.closePath();
      return this;
    };
  }
  function crash(message){
    if(document.getElementById('vbsCrash'))return;
    const el=document.createElement('div');
    el.id='vbsCrash';
    el.style.cssText='position:fixed;z-index:9999;left:10px;right:10px;top:135px;padding:12px;border:1px solid #ff7388;border-radius:14px;background:#170b12;color:#fff;font:12px system-ui;white-space:pre-wrap;box-shadow:0 20px 70px #000';
    el.textContent='VBS RENDER ERROR\n'+message;
    document.body.appendChild(el);
  }
  addEventListener('error',e=>crash(String(e.message||e.error||'Unknown error')));
  addEventListener('unhandledrejection',e=>crash('Promise: '+String(e.reason||'Unknown rejection')));
})();
