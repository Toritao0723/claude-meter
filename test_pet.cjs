const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sandbox = { window:{ devicePixelRatio:1 } };
vm.runInNewContext(fs.readFileSync(require.resolve('./ui/pet.js'), 'utf8'), sandbox);

// Capture final visible pixels, including prop occlusion, at the native sprite grid.
function raster(scene, frame, reduced = false) {
  const pixels = new Map();
  const ctx = {
    fillStyle:'', setTransform() {}, translate() {}, scale() {},
    clearRect() { pixels.clear(); },
    fillRect(x,y,w,h) {
      for (let yy = y; yy < y+h; yy++) for (let xx = x; xx < x+w; xx++) pixels.set(`${xx},${yy}`, this.fillStyle);
    },
  };
  const canvas = { width:48, height:26, clientWidth:48, clientHeight:26, getContext:()=>ctx };
  sandbox.window.CrabPet.draw(canvas, { scene, time:frame*150, theme:'dark', reduced });
  return pixels;
}
function connected(pixels, from) {
  const found = new Set(), todo = [from];
  while (todo.length) {
    const [x,y] = todo.pop(), key = `${x},${y}`;
    if (found.has(key) || pixels.get(key) !== '#D97757') continue;
    found.add(key);
    todo.push([x-1,y], [x+1,y], [x,y-1], [x,y+1]);
  }
  return found;
}
for (const scene of ['typing','cooking','tennis','photo','flight']) {
  test(`${scene}: hands stay visibly connected to the body throughout the animation`, () => {
    for (const reduced of [false,true]) for (let timeFrame=0; timeFrame<360; timeFrame++) {
      const frame = reduced ? 4 : timeFrame;
      let body, hands;
      if (scene === 'typing') { body=[16,16]; hands=[[24,17+frame%2],[24,18-frame%2]]; }
      if (scene === 'cooking') { body=[15,17]; const x=28+[-1,0,1,0][frame%4]; hands=[[x-1,16]]; }
      if (scene === 'tennis') { body=[15+[0,0,1,1,0,0,-1,-1][frame%8],17]; hands=[[30,19-(frame%8<4?0:1)]]; }
      if (scene === 'photo') { body=[36,17]; const lift=reduced || frame%20>=4 && frame%20<16 ? 0 : 3; hands=[[30,16+lift],[28,18+lift]]; }
      if (scene === 'flight') { const bob=reduced?0:[0,0,0,-1,-1,-1,0,0,0,1,1,1][Math.floor(frame/2)%12]; body=[24,12+bob]; hands=[[31,14+bob]]; }
      const pixels = raster(scene,timeFrame,reduced), reached = connected(pixels,body);
      for (const hand of hands) assert.ok(reached.has(hand.join(',')), `${scene}, frame ${frame}, reduced ${reduced}: detached hand at ${hand}`);
    }
  });
}

test('flight appears in automatic rotation and manual scene selection', () => {
  const pet=sandbox.window.CrabPet;
  assert.ok(pet.busy.includes('flight'));
  assert.equal(pet.sceneFor('working',64000),'flight');
  assert.equal(pet.sceneFor('working',80000),'typing');
  assert.equal(pet.sceneFor('working',0,true,4),'flight');
});
test('Reduce Motion freezes the pilot and propeller', () => {
  assert.deepEqual(raster('flight',0,true),raster('flight',99,true));
  assert.notDeepEqual(raster('flight',0),raster('flight',6));
});
