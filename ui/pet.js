// Original Clawd pixel silhouette © 2026 Bon Yeung (Claude-Meter).
// Local adaptation: activity scenes, props, and shared animation renderer.
(() => {
  const busy = ['typing', 'cooking', 'tennis', 'photo', 'flight'];
  const titles = { typing:'小螃蟹在打电脑', cooking:'小螃蟹在做饭', tennis:'小螃蟹在打网球', photo:'小螃蟹举起相机拍照', flight:'小螃蟹开飞机', music:'听听歌，等你回来', done:'完成啦，撒花！', pause:'小螃蟹休息一下', unknown:'稍候片刻' };
  const titlesEn = { typing:'Crab is typing away', cooking:'Crab is cooking', tennis:'Crab is playing tennis', photo:'Crab is taking a photo', flight:'Crab is flying a plane', music:'Some music while you\'re away', done:'Done — confetti!', pause:'Crab is taking a break', unknown:'One moment' };
  const body = ['.OOOOOOOOO.', '.OOKOOOKOO.', 'OOOKOOOKOOO', '.OOOOOOOOO.', '.OOOOOOOOO.', '.O.O...O.O.'];
  const relaxed = ['.OOOOOOOOO.', '.OOOOOOOOO.', 'OOKKOOOKKOO', '.OOOOOOOOO.', '.OOOOOOOOO.', '.O.O...O.O.'];
  const cheer = ['O.OOOOOOO.O', 'OOOKOOOKOOO', '.OOKOOOKOO.', '.OOOOOOOOO.', '.OOOOOOOOO.', '..O.O.O.O..'];
  const confetti = ['#edb779', '#acd5b4', '#e5a2b3', '#83c4da', '#c1b5ee'];
  const cycleMs = 16000;

  function sceneFor(state, time, reduced = false, offset = 0) {
    if (state === 'working') return busy[((reduced ? 0 : Math.floor(time / cycleMs)) + offset) % busy.length];
    if (state === 'done') return 'done';
    if (state === 'waiting' || state === 'idle') return 'music';
    if (state === 'error' || state === 'interrupted' || state === 'warning') return 'pause';
    return 'unknown';
  }

  function draw(canvas, options = {}) {
    const time = options.time ?? Date.now();
    const reduced = !!options.reduced;
    const scene = options.scene || sceneFor(options.state || 'idle', time, reduced, options.offset || 0);
    const ctx = canvas.getContext('2d');
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return scene;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    window.CrabTexture?.draw(ctx, canvas, { width, height, dpr, scene, theme:options.theme, time, reduced });
    const cell = Math.max(1, Math.floor(Math.min(width / 48, height / 26) * 2) / 2);
    ctx.translate(Math.round((width - 48 * cell) / 2), Math.round((height - 26 * cell) / 2));
    ctx.scale(cell, cell);
    ctx.imageSmoothingEnabled = false;
    const frame = reduced ? 4 : Math.floor(time / 150);
    const light = options.theme === 'light';
    const ink = '#272930', orange = '#D97757';
    const muted = light ? '#7e858d' : '#a0a8b1';
    const pale = light ? '#f1f2ee' : '#e0e5e7';
    const edge = light ? '#65727e' : '#8995a0';
    const blue = light ? '#538bab' : '#9ac6dc';
    const green = light ? '#609a74' : '#a1c5a7';
    const gold = '#dbb576';
    const px = (x,y,w,h,c) => { ctx.fillStyle=c; ctx.fillRect(Math.round(x),Math.round(y),w,h); };
    const sprite = (shape,x,y) => shape.forEach((row,r)=>[...row].forEach((v,c)=> { if(v==='O'||v==='K') px(x+c,y+r,1,1,v==='O'?orange:ink); }));
    const crab = (x,y,pose=body) => { sprite(pose,x,y); if(!reduced && frame % 36 === 0 && pose===body) { px(x+3,y+1,1,1,orange); px(x+7,y+1,1,1,orange); } };
    // Every joint shares an actual pixel edge, including while the body moves.
    const arm = points => {
      for (let i=1;i<points.length;i++) {
        const [ax,ay]=points[i-1], [bx,by]=points[i];
        px(Math.min(ax,bx),ay,Math.abs(bx-ax)+1,1,orange);
        px(bx,Math.min(ay,by),1,Math.abs(by-ay)+1,orange);
      }
    };
    const ground = () => px(5,23,38,1,light?'rgba(40,55,65,.08)':'rgba(230,240,255,.09)');
    const sparkle = (x,y,c) => { px(x,y-1,1,3,c);px(x-1,y,3,1,c); };
    if (scene !== 'flight') ground();

    if (scene === 'typing') {
      // A chair, computer screen with changing code lines, and alternating typing claws.
      px(8,15,2,8,edge); px(8,21,14,2,edge); px(11,23,2,1,edge);
      crab(11,13);
      px(25,5,15,11,edge); px(26,6,13,9,ink); px(27,7,3,1,green); px(27,9,7,1,blue);
      px(29,11,5+(frame%3),1,gold); px(27,13,4,1,green);
      if(reduced || frame%6<3) px(33,13,1,1,pale);
      px(31,16,3,2,edge); px(23,18,18,2,edge); px(25,18,13,1,pale);
      px(7,20,35,1,'#b0947e'); px(9,21,2,3,'#9b8472'); px(39,21,2,3,'#9b8472');
      px(21,17+(frame%2),4,1,orange); px(22,18-(frame%2),3,1,orange);
      px(5,15,3,4,pale); px(8,16,1,2,pale); px(5,14,3,1,'#99745b');
    } else if (scene === 'cooking') {
      // Chef hat, saucepan, gentle rising steam, and a stirring spoon.
      crab(11,14);
      px(12,10,9,3,pale); px(11,8,11,3,pale); px(13,6,3,3,pale); px(18,6,3,3,pale);
      px(23,20,19,2,'#b0947e'); px(25,22,2,2,'#9b8472'); px(38,22,2,2,'#9b8472');
      px(28,16,11,4,edge); px(26,16,2,1,edge); px(39,16,2,1,edge); px(29,15,9,1,green);
      const stir = [-1,0,1,0][frame%4];
      const spoonX = 28+stir;
      px(spoonX,12,1,7,'#d6b88e'); px(spoonX+1,11,1,2,'#d6b88e');
      arm([[20,17],[23,17],[23,16],[spoonX-1,16]]);
      px(spoonX-1,15,2,1,orange); px(spoonX-1,17,2,1,orange);
      for(let n=0;n<3;n++) { const up=(frame+n*2)%6; px(30+n*3+(up%2),13-up,1,2,light?'rgba(82,94,98,.4)':'rgba(236,241,240,.5)'); }
      px(7,21,3,2,green);px(8,19,1,3,green);
    } else if (scene === 'tennis') {
      // Headband, racket, ball flight, and the edge of the net.
      const bounce = [0,0,1,1,0,0,-1,-1][frame%8];
      crab(11+bounce,14);
      px(12+bounce,14,9,1,pale);px(21+bounce,15,2,1,pale);
      const swing=frame%8<4?0:1;
      px(28,7-swing,6,1,edge);px(26,9-swing,1,6,edge);px(35,9-swing,1,6,edge);px(28,16-swing,6,1,edge);
      px(27,8-swing,1,1,edge);px(34,8-swing,1,1,edge);px(27,15-swing,1,1,edge);px(34,15-swing,1,1,edge);
      for(let x=28;x<35;x+=2) px(x,9-swing,1,6,light?'#b0c1bd':'#bccbc5');
      for(let y=10;y<15;y+=2) px(28,y-swing,7,1,light?'#b0c1bd':'#bccbc5');
      // Grip the racket below its center; both the elbow and hand follow the pose.
      px(30,16-swing,3,2,edge); px(31,17-swing,1,5,'#b0947e');
      const handY = 19-swing;
      arm([[20+bounce,17],[24,17],[24,handY],[30,handY]]);
      px(30,handY-1,2,1,orange); px(30,handY+1,2,1,orange);
      const ball=[[41,7],[39,6],[37,7],[35,9],[34,11],[36,10],[39,9],[42,10]][frame%8];
      px(ball[0],ball[1],2,2,'#d0d983');px(ball[0],ball[1],1,1,pale);
      px(43,13,1,10,edge);px(40,14,6,1,edge);px(40,18,6,1,muted);
      px(41,14,1,9,muted);px(45,14,1,9,muted);
    } else if (scene === 'photo') {
      // Lift the camera to eye level, press the shutter, then lower it again.
      // Keep the face visible beside a distinct lens, flash and neck strap.
      const phase = frame % 20;
      const lift = reduced || (phase >= 4 && phase < 16) ? 0 : 3;
      crab(29,14);
      px(9,16,1,5,green);px(7,18,2,1,green);px(10,17,2,1,green);
      px(7,21,5,2,'#b0947e');px(8,13,3,3,'#e7abc1');px(7,14,5,1,'#e7abc1');px(9,14,1,1,gold);
      px(31,16,1,5,ink);px(28,20,4,1,ink);px(27,18+lift,1,2,ink);
      px(20,12+lift,12,7,edge);px(21,13+lift,10,5,ink);
      px(23,10+lift,4,2,edge);px(24,10+lift,2,1,pale);px(29,11+lift,2,1,orange);
      px(22,13+lift,3,5,pale);px(21,14+lift,5,3,pale);
      px(22,14+lift,3,3,ink);px(23,14+lift,1,2,blue);px(27,13+lift,2,1,pale);
      arm([[34,17],[34,18+lift],[28,18+lift]]);
      arm([[34,16],[33,16],[33,16+lift],[30,16+lift]]);
      if(!reduced && phase >= 8 && phase < 10) { sparkle(17,11,pale);px(14,11,1,1,pale); }
    } else if (scene === 'flight') {
      // A seated aviator, cream-and-coral airframe, swept wing and rotating propeller.
      // All parts share the same bob so the pilot, hand and aircraft stay attached.
      const bob = reduced ? 0 : [0,0,0,-1,-1,-1,0,0,0,1,1,1][Math.floor(frame/2)%12];
      const part = (x,y,w,h,c) => px(x,y+bob,w,h,c);
      const cream = '#f2eee2', coral = '#D97757', leather = '#82603d';
      // Scarf, pilot and leather cap with silver goggles.
      part(14,12,7,1,'#b46349'); part(12,11,5,1,'#b46349'); part(11,12,3,1,'#b46349');
      crab(18,10+bob);
      part(18,8,11,2,leather); part(20,6,8,3,leather); part(17,9,13,1,'#674c32');
      part(20,6,8,1,'#b18a51'); part(21,6,3,2,edge); part(25,6,3,2,edge);
      part(22,6,1,2,pale); part(26,6,1,2,pale); part(24,7,1,1,'#b6a07b');
      // Tail, tapered fuselage and orange underside.
      part(5,12,1,5,cream); part(6,13,1,4,cream); part(7,14,2,3,cream);
      part(5,16,34,2,cream); part(6,18,29,1,coral); part(12,19,22,1,cream);
      part(7,15,8,1,cream); part(7,16,7,1,'#c98a6b');
      part(33,15,7,3,cream); part(39,15,2,3,coral); part(40,16,2,1,'#b36348');
      // Windshield and a dark control stick sit ahead of the connected hand.
      part(29,12,1,3,blue); part(30,11,1,4,blue); part(30,11,1,1,pale);
      part(32,13,1,3,ink); part(31,13,2,1,ink);
      arm([[27,12+bob],[28,12+bob],[28,14+bob],[31,14+bob]]);
      // Near wing is joined to the hull and sweeps back below the cockpit.
      part(22,17,8,1,cream); part(20,18,8,1,cream); part(18,19,8,1,cream);
      part(16,20,8,1,cream); part(15,21,6,1,coral); part(19,20,5,1,'#d4cabc');
      // The propeller changes silhouette without detaching from its hub.
      const spin = reduced ? 0 : frame%4;
      if (spin === 0) { part(43,10,1,12,coral); part(42,10,1,2,cream); part(44,20,1,2,cream); }
      else if (spin === 1) { part(42,11,1,5,cream); part(43,14,1,5,coral); part(44,18,1,3,cream); }
      else if (spin === 2) { part(42,13,2,7,'#db9b7d'); part(44,15,1,3,cream); }
      else { part(44,11,1,4,cream); part(43,14,1,5,coral); part(42,18,1,3,cream); }
      part(41,16,3,1,coral); part(42,16,1,1,cream);
    } else if (scene === 'music' || scene === 'unknown' || scene === 'pause') {
      // A cushion and headphones: waiting stays calm and distinct from active work.
      px(15,22,17,2,blue);px(16,21,15,1,blue);
      const sway = reduced ? 0 : [0,0,1,1,0,0,-1,-1][frame%8];
      crab(18+sway,15,relaxed);
      px(19+sway,11,9,2,ink);px(17+sway,13,2,4,ink);px(28+sway,13,2,4,ink);
      px(16+sway,16,2,4,blue);px(29+sway,16,2,4,blue);
      if(scene==='music') {
        const rise=reduced?0:Math.floor(frame/3)%3;
        px(35,8-rise,1,5,green);px(36,8-rise,3,1,green);px(34,12-rise,2,2,green);
        px(11,10+rise,1,4,gold);px(12,10+rise,2,1,gold);px(10,13+rise,2,2,gold);
      } else { px(35,16,1,1,muted);px(38,16,1,1,muted);px(41,16,1,1,muted); }
    } else if (scene === 'done') {
      const hop=reduced?1:[0,1,2,1,0,0][frame%6];
      crab(19,15-hop,cheer);
      for(let i=0;i<22;i++) {
        const x=5+(i*17)%38;
        const y=reduced?3+(i*7)%15:2+(frame+i*5)%19;
        px(x+(reduced?0:Math.floor(frame/3+i)%2),y,1,i%3?1:2,confetti[i%confetti.length]);
      }
      sparkle(13,10,gold);sparkle(35,11,green);
    }
    return scene;
  }
  window.CrabPet = { draw, sceneFor, titles, titlesEn, busy, cycleMs };
})();
