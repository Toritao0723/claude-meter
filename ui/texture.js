// One landscape renderer for every activity, using Tori Patterns' photo sampler.
// Small terrain/palette variations; baked layers are reused across scene rotations.
(() => {
  const cache = new WeakMap();
  const presets = {
    typing:  {kind:'hills', phase:.15, trees:12, ink:'#c5d4cf', light:'#465b55', speed:.10},
    cooking: {kind:'hills', phase:.48, trees:5, ink:'#d8cbb3', light:'#65533f', speed:.06},
    tennis:  {kind:'meadow', phase:.8, trees:7, ink:'#c1d4b9', light:'#49613f', speed:.10},
    photo:   {kind:'dunes', phase:.3, trees:0, ink:'#ddd0b6', light:'#695640', speed:.13},
    flight:  {kind:'peaks', phase:0, trees:13, ink:'#d6d4c9', light:'#485158', speed:1},
    music:   {kind:'hills', phase:.6, trees:9, ink:'#c5d0df', light:'#485a70', speed:.05, moon:true, lake:true},
    done:    {kind:'meadow', phase:.1, trees:8, ink:'#d8cdbd', light:'#655743', speed:.10},
    pause:   {kind:'hills', phase:.6, trees:9, ink:'#c5d0df', light:'#485a70', speed:.05, moon:true, lake:true},
  };
  const fract = x => x-Math.floor(x);
  const hash = n => fract(Math.sin(n*127.1+31.7)*43758.5453);
  const triangle = x => 1-Math.abs(2*fract(x)-1);
  function source(width,height,near,preset) {
    const c=document.createElement('canvas'); c.width=width; c.height=height;
    const g=c.getContext('2d'); g.fillStyle='#000'; g.fillRect(0,0,width,height);
    const ridge = u => {
      const x=u+preset.phase;
      if(preset.kind==='peaks') return height*(near
        ? 1.05-.40*triangle(x*4+.1)-.06*triangle(x*9)
        : .8-.43*triangle(x*3+.2)-.13*triangle(x*7+.4));
      const wave=.5+.32*Math.sin(x*Math.PI*4)+.18*Math.sin(x*Math.PI*8+.7);
      const amplitude=preset.kind==='dunes'?.26:preset.kind==='meadow'?.23:.36;
      return height*((near?1.01:.75)-amplitude*wave*(near?.7:1));
    };
    const vertices=[];
    for(let x=0;x<=width;x+=2) vertices.push([x,ridge(x/width)]);
    const mountain = g.createLinearGradient(0,height*.25,0,height);
    mountain.addColorStop(0,near?'#b0b0b0':'#929292');
    mountain.addColorStop(1,near?'#303030':'#242424');
    g.fillStyle=mountain;g.beginPath();g.moveTo(0,height);
    for(const [x,y] of vertices) g.lineTo(x,y);
    g.lineTo(width,height);g.closePath();g.fill();
    // Faceted rock: light and shadow follow the slope beneath each summit.
    g.save();g.clip();
    for(let i=0;i<(preset.kind==='peaks'?16:8);i++) {
      const x=i*width/16, top=ridge(x/width);
      g.fillStyle=i%2?'rgba(230,230,230,.23)':preset.kind==='peaks'?'rgba(0,0,0,.5)':'rgba(0,0,0,.22)';
      g.beginPath();g.moveTo(x,top);g.lineTo(x+width*.07,height);g.lineTo(x-width*.035,height);g.closePath();g.fill();
    }
    // Thin snow bands and broken contour lines preserve crisp mountain edges.
    g.strokeStyle=near?'#b7b7b7':'#d7d7d7';g.lineWidth=near?1.5:2.5;
    g.beginPath();for(const [i,[x,y]] of vertices.entries()) i?g.lineTo(x,y+2):g.moveTo(x,y+2);g.stroke();
    g.strokeStyle='rgba(220,220,220,.25)';g.lineWidth=.7;
    for(let line=0;line<5;line++) {
      g.beginPath();for(const [i,[x,y]] of vertices.entries()) {
        const yy=y+7+line*height*.073+Math.sin(x*.09+line)*3;
        i?g.lineTo(x,yy):g.moveTo(x,yy);
      }g.stroke();
    }
    g.restore();
    if(near && preset.lake) {
      g.fillStyle='#080808';g.fillRect(width*.22,height*.81,width*.56,height*.19);
      g.strokeStyle='#696969';g.lineWidth=1;
      for(let j=0;j<5;j++) {g.beginPath();g.moveTo(width*(.24+j*.02),height*(.84+j*.03));g.lineTo(width*(.76-j*.02),height*(.84+j*.03));g.stroke();}
    }
    if(!near && preset.moon) {
      g.fillStyle='#a8a8a8';g.beginPath();g.arc(width*.79,height*.17,height*.075,0,Math.PI*2);g.fill();
      g.fillStyle='#000';g.beginPath();g.arc(width*.815,height*.15,height*.071,0,Math.PI*2);g.fill();
    }
    if(near) {
      // Uneven tree heights, alternating branch tiers, and a visible central trunk.
      for(let i=0;i<preset.trees;i++) {
        const x=(i+.3)*width/preset.trees, bottom=height*(.98+.07*hash(i));
        if(preset.lake && x>width*.24 && x<width*.76) continue;
        const treeH=height*(.14+.2*hash(i+14)), treeW=treeH*.43;
        g.strokeStyle='#aaa';g.lineWidth=1;g.beginPath();g.moveTo(x,bottom-treeH);g.lineTo(x,bottom);g.stroke();
        for(let j=0;j<5;j++) {
          const y=bottom-treeH+j*treeH*.16, w=treeW*(.26+j*.19);
          g.fillStyle=j%2?'#696969':'#c6c6c6';
          g.beginPath();g.moveTo(x,y);g.lineTo(x+w*.5,y+treeH*.28);g.lineTo(x-w*.5,y+treeH*.28);g.closePath();g.fill();
        }
      }
    }
    return c;
  }
  function bake(width,height,dpr,light,near,preset) {
    const layer=document.createElement('canvas');layer.width=Math.round(width*dpr);layer.height=Math.round(height*dpr);
    const ctx=layer.getContext('2d');ctx.scale(dpr,dpr);
    const artwork=source(Math.round(width*3),Math.round(height*3),near,preset);
    const grid=window.PatternField.imageToGrid(artwork,Math.ceil(width/(width<180?2.4:3)));
    window.PatternField.draw(ctx,width,height,grid,{
      ink:light?preset.light:preset.ink, opacity:near?.62:.40, edge:near?.38:.25,
      style:near?'characters':'diagonal',
    });
    return layer;
  }
  function draw(ctx,canvas,{width,height,dpr,scene,theme,time,reduced}) {
    const light=theme==='light', sizeKey=`${width}:${height}:${dpr}:${light}`;
    const name=presets[scene]?scene:'pause', preset=presets[name];
    let saved=cache.get(canvas);
    if(!saved || saved.sizeKey!==sizeKey) {
      saved={sizeKey,scenes:new Map()};cache.set(canvas,saved);
    }
    let data=saved.scenes.get(name);
    if(!data) {
      data={far:bake(width,height,dpr,light,false,preset),near:bake(width,height,dpr,light,true,preset)};
      saved.scenes.set(name,data);
    }
    const seconds=reduced?0:time/1000;
    ctx.save();
    // A darker valley lets pale characters read while the surrounding panel stays glass.
    ctx.fillStyle=light?'rgba(235,230,215,.16)':'rgba(10,18,24,.27)';ctx.fillRect(0,0,width,height);
    for(const [layer,speed] of [[data.far,1.1],[data.near,2.5]]) {
      const offset=Math.round((seconds*speed*preset.speed%width)*dpr)/dpr;
      ctx.drawImage(layer,-offset,0,width,height);
      ctx.drawImage(layer,width-offset,0,width,height);
    }
    const rgb=light?'65,82,95':'220,220,205';
    // Thin cloud / wind marks cross the open sky, with small, slow star glints.
    ctx.font=`${width<180?4.5:5.5}px Menlo, monospace`;ctx.textAlign='left';
    for(let i=0;i<5;i++) {
      const x=(width*(.13+i*.23)-seconds*.7*preset.speed%width+width)%width;
      const y=height*(.10+.065*(i%3));
      ctx.fillStyle=`rgba(${rgb},.30)`;ctx.fillText(i%2?'_ . _':'- -',x,y);
    }
    for(let i=0;i<(preset.moon||name==='flight'?10:5);i++) {
      const x=width*(.05+.9*hash(i+60)), y=height*(.08+.33*hash(i+80));
      const glow=reduced?.35:.22+.22*(.5+.5*Math.sin(seconds*.9+i*2.3));
      ctx.fillStyle=`rgba(${rgb},${glow})`;ctx.fillRect(Math.round(x),Math.round(y),1,1);
      if(i%4===0) { ctx.globalAlpha=.6;ctx.fillRect(Math.round(x)-1,Math.round(y),3,1);ctx.fillRect(Math.round(x),Math.round(y)-1,1,3);ctx.globalAlpha=1; }
    }
    ctx.restore();
  }
  window.CrabTexture={draw};
})();
