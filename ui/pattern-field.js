// Adapted from Tori Patterns Photo Lab, js/engine/photo.js.
// https://patterns.toritao.com/#/photo — luminance sampling, edge emphasis,
// character density and diagonal rendering. Local canvases only.
(() => {
  function imageToGrid(src, cols) {
    const rows = Math.max(1, Math.round(cols * src.height / src.width * .55));
    const canvas = document.createElement('canvas');
    canvas.width = cols; canvas.height = rows;
    const ctx = canvas.getContext('2d', { willReadFrequently:true });
    ctx.drawImage(src, 0, 0, cols, rows);
    const rgba = ctx.getImageData(0, 0, cols, rows).data;
    const values = new Float32Array(cols * rows);
    for (let i=0;i<values.length;i++) values[i] = (.2126*rgba[i*4] + .7152*rgba[i*4+1] + .0722*rgba[i*4+2]) / 255;
    return { cols, rows, values };
  }
  function draw(ctx, width, height, grid, { ink, opacity=.6, edge=.3, style='characters' }) {
    const cw = width/grid.cols, ch = height/grid.rows, chars = ' .:-=+*#%@';
    const sample = (x,y) => grid.values[y*grid.cols+x];
    ctx.save();
    ctx.font = `${Math.min(cw*1.6,ch)*1.02}px Menlo, ui-monospace, monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = ink;
    for (let y=0;y<grid.rows;y++) for (let x=0;x<grid.cols;x++) {
      let v = sample(x,y);
      const right = x<grid.cols-1 ? sample(x+1,y) : v;
      const below = y<grid.rows-1 ? sample(x,y+1) : v;
      const gradient = (Math.abs(v-right)+Math.abs(v-below))*2;
      v = Math.max(0,Math.min(1,v+gradient*edge*1.6-edge*.12));
      if (v<.08) continue;
      const glyph = style==='diagonal' ? (v>.72 ? '╳' : (x+y)%2 ? '╱' : '╲') : chars[Math.min(chars.length-1,Math.floor(v*chars.length))];
      if (glyph===' ') continue;
      ctx.globalAlpha = opacity*(.35+v*.65);
      ctx.fillText(glyph,(x+.5)*cw,(y+.5)*ch);
    }
    ctx.restore();
  }
  window.PatternField = { imageToGrid, draw };
})();
