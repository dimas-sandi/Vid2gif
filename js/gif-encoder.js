/**
 * DMZ Eye Animator — GIF Encoder Engine
 * 
 * HIGH QUALITY MODE: Exact brute-force nearest-color matching (no cache).
 * Global palette (NeuQuant trains once) + Floyd-Steinberg dithering.
 * Quality on par with ezgif.com.
 */

// --- NeuQuant Color Quantizer ---
class NeuQuant {
  constructor(pixels, samplefac, numColors = 256) {
    this.netsize = numColors;
    this.maxnetpos = this.netsize - 1;
    this.initrad = Math.floor(this.netsize / 8);
    this.radiusbiasshift = 6;
    this.radiusbias = 1 << this.radiusbiasshift;
    this.initbiasradius = this.initrad * this.radiusbias;
    this.alphabiasshift = 10;
    this.alphabias = 1 << this.alphabiasshift;
    this.ncycles = 100;
    this.radbiasshift = 8;
    this.radbias = 1 << this.radbiasshift;
    this.alpharadbshift = this.alphabiasshift + this.radbiasshift;
    this.alpharadbias = 1 << this.alpharadbshift;

    this.pixels = pixels;
    this.samplefac = Math.max(1, samplefac);

    this.network = new Array(this.netsize);
    for (let i = 0; i < this.netsize; i++) {
      this.network[i] = new Float64Array(4);
      const v = (i * 256) / this.netsize;
      this.network[i][0] = v;
      this.network[i][1] = v;
      this.network[i][2] = v;
    }

    this.bias = new Float64Array(this.netsize);
    this.freq = new Float64Array(this.netsize);
    this.radpower = new Float64Array(this.initrad);

    const f = 1.0 / this.netsize;
    for (let i = 0; i < this.netsize; i++) {
      this.freq[i] = f;
      this.bias[i] = 0.0;
    }
  }

  // Output palette — reads directly from sorted network (indices match lookupRGB)
  colorMap() {
    const map = new Uint8Array(this.netsize * 3);
    let k = 0;
    for (let i = 0; i < this.netsize; i++) {
      map[k++] = Math.max(0, Math.min(255, Math.round(this.network[i][0])));
      map[k++] = Math.max(0, Math.min(255, Math.round(this.network[i][1])));
      map[k++] = Math.max(0, Math.min(255, Math.round(this.network[i][2])));
    }
    return map;
  }

  setUpArrays() {
    // Selection sort network by green channel
    for (let i = 0; i < this.netsize; i++) {
      let smallpos = i;
      let smallval = this.network[i][1];
      for (let j = i + 1; j < this.netsize; j++) {
        if (this.network[j][1] < smallval) {
          smallpos = j;
          smallval = this.network[j][1];
        }
      }
      if (i !== smallpos) {
        let t;
        t = this.network[i][0]; this.network[i][0] = this.network[smallpos][0]; this.network[smallpos][0] = t;
        t = this.network[i][1]; this.network[i][1] = this.network[smallpos][1]; this.network[smallpos][1] = t;
        t = this.network[i][2]; this.network[i][2] = this.network[smallpos][2]; this.network[smallpos][2] = t;
      }
    }
  }

  alterneigh(rad, i, r, g, b) {
    const lo = Math.max(i - rad, -1);
    const hi = Math.min(i + rad, this.netsize);
    let j = i + 1, k = i - 1, m = 1;
    while (j < hi || k > lo) {
      const a = this.radpower[m++];
      if (j < hi) {
        const p = this.network[j++];
        p[0] -= (a * (p[0] - r)) / this.alpharadbias;
        p[1] -= (a * (p[1] - g)) / this.alpharadbias;
        p[2] -= (a * (p[2] - b)) / this.alpharadbias;
      }
      if (k > lo) {
        const p = this.network[k--];
        p[0] -= (a * (p[0] - r)) / this.alpharadbias;
        p[1] -= (a * (p[1] - g)) / this.alpharadbias;
        p[2] -= (a * (p[2] - b)) / this.alpharadbias;
      }
    }
  }

  altersingle(alpha, i, r, g, b) {
    const p = this.network[i];
    p[0] -= (alpha * (p[0] - r)) / this.alphabias;
    p[1] -= (alpha * (p[1] - g)) / this.alphabias;
    p[2] -= (alpha * (p[2] - b)) / this.alphabias;
  }

  contest(r, g, b) {
    let bestd = 1e30, bestbiasd = 1e30, bestpos = -1, bestbiaspos = -1;
    for (let i = 0; i < this.netsize; i++) {
      const p = this.network[i];
      const dist = Math.abs(p[0] - r) + Math.abs(p[1] - g) + Math.abs(p[2] - b);
      if (dist < bestd) { bestd = dist; bestpos = i; }
      const biasdist = dist - (this.bias[i] >> (this.alphabiasshift - this.radbiasshift));
      if (biasdist < bestbiasd) { bestbiasd = biasdist; bestbiaspos = i; }
      const beta = this.freq[i] >> this.radbiasshift;
      this.freq[i] -= beta;
      this.bias[i] += beta << this.alphabiasshift;
    }
    this.freq[bestpos] += 1 << (this.alphabiasshift - this.radbiasshift);
    this.bias[bestpos] -= 1 << this.alphabiasshift;
    return bestbiaspos;
  }

  learn() {
    const len = this.pixels.length;
    const alphadec = 30 + (this.samplefac - 1) / 3;
    const samplepixels = Math.floor(len / (4 * this.samplefac));
    const delta = Math.max(1, Math.floor(samplepixels / this.ncycles));
    let alpha = this.alphabias;
    let radius = this.initbiasradius;
    let rad = radius >> this.radiusbiasshift;
    if (rad <= 1) rad = 0;

    for (let i = 0; i < rad; i++) {
      this.radpower[i] = alpha * (((rad * rad - i * i) * this.radbias) / (rad * rad));
    }

    const step = 4 * this.samplefac;
    let pix = 0;

    for (let i = 0; i < samplepixels; i++) {
      const r = this.pixels[pix] & 0xff;
      const g = this.pixels[pix + 1] & 0xff;
      const b = this.pixels[pix + 2] & 0xff;

      const j = this.contest(r, g, b);
      this.altersingle(alpha, j, r, g, b);
      if (rad !== 0) this.alterneigh(rad, j, r, g, b);

      pix += step;
      if (pix >= len) pix = 0;

      if (i % delta === 0) {
        alpha -= alpha / alphadec;
        radius -= radius / this.radiusbias;
        rad = radius >> this.radiusbiasshift;
        if (rad <= 1) rad = 0;
        for (let k = 0; k < rad; k++) {
          this.radpower[k] = alpha * (((rad * rad - k * k) * this.radbias) / (rad * rad));
        }
      }
    }
  }

  // Exact nearest-color lookup — O(256) but precise (no cache error)
  lookupRGB(r, g, b) {
    let bestd = 1e9, best = 0;
    for (let i = 0; i < this.netsize; i++) {
      const dr = this.network[i][0] - r;
      const dg = this.network[i][1] - g;
      const db = this.network[i][2] - b;
      const d = dr * dr + dg * dg + db * db;
      if (d < bestd) { bestd = d; best = i; }
    }
    return best;
  }
}

// --- GIF Encoder ---
class GIFEncoder {
  constructor(width, height) {
    this.width = Math.floor(width);
    this.height = Math.floor(height);
    this.out = [];
    this.frameCount = 0;
    this.delay = 10;
    this.repeat = 0;
    this.colorCount = 256;

    this.enableDelta = false;
    this.deltaThreshold = 0;
    this.transparentIndex = -1;
    this.prevFramePixels = null;

    this.globalNQ = null;
    this.globalColorMap = null;
  }

  setDelay(ms) { this.delay = Math.round(ms / 10); }
  setRepeat(r) { this.repeat = r; }
  setColorCount(c) { this.colorCount = c; }
  setDeltaCompression(enabled, threshold = 0) {
    this.enableDelta = enabled;
    this.deltaThreshold = threshold;
  }

  buildGlobalPalette(sampledPixels) {
    // sampleFac=1 → trains on every pixel = best palette quality
    // For large buffers, scale up slightly to stay fast
    const sampleFac = Math.max(1, Math.floor(sampledPixels.length / 200000));
    this.globalNQ = new NeuQuant(sampledPixels, sampleFac, this.colorCount);
    this.globalNQ.learn();
    this.globalNQ.setUpArrays();
    this.globalColorMap = this.globalNQ.colorMap();
  }

  start() {
    this.out = [];
    this.frameCount = 0;
    this.prevFramePixels = null;
    this._writeStr("GIF89a");
    this._writeLSD();
    if (this.globalColorMap) this._writeColorTable(this.globalColorMap);
  }

  addFrame(pixels) {
    const nq = this.globalNQ;
    const cmap = this.globalColorMap;
    if (!nq || !cmap) return;

    const w = this.width, h = this.height;
    const total = w * h;
    const indexed = new Uint8Array(total);
    let hasTransp = false;
    const isFirst = (this.frameCount === 0);

    // Floyd-Steinberg dithering with EXACT nearest-color (no cache)
    const ew = w + 2;
    const rE = new Float32Array(ew * (h + 1));
    const gE = new Float32Array(ew * (h + 1));
    const bE = new Float32Array(ew * (h + 1));

    let k = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const pi = (y * w + x) * 4;
        const ei = y * ew + x + 1;

        let r = pixels[pi] + rE[ei];
        let g = pixels[pi + 1] + gE[ei];
        let b = pixels[pi + 2] + bE[ei];
        r = r < 0 ? 0 : r > 255 ? 255 : r;
        g = g < 0 ? 0 : g > 255 ? 255 : g;
        b = b < 0 ? 0 : b > 255 ? 255 : b;

        // Delta compression
        if (!isFirst && this.enableDelta && this.prevFramePixels) {
          const diff = Math.abs(r - this.prevFramePixels[pi])
                     + Math.abs(g - this.prevFramePixels[pi + 1])
                     + Math.abs(b - this.prevFramePixels[pi + 2]);
          if (diff < this.deltaThreshold) {
            indexed[k++] = this.transparentIndex;
            hasTransp = true;
            continue;
          }
        }

        // EXACT nearest color — full precision, no cache artifacts
        const idx = nq.lookupRGB(r | 0, g | 0, b | 0);
        indexed[k++] = idx;

        // Error diffusion (Floyd-Steinberg)
        const er = r - cmap[idx * 3];
        const eg = g - cmap[idx * 3 + 1];
        const eb = b - cmap[idx * 3 + 2];

        rE[ei + 1]       += er * 0.4375;
        gE[ei + 1]       += eg * 0.4375;
        bE[ei + 1]       += eb * 0.4375;

        rE[ei + ew - 1]  += er * 0.1875;
        gE[ei + ew - 1]  += eg * 0.1875;
        bE[ei + ew - 1]  += eb * 0.1875;

        rE[ei + ew]      += er * 0.3125;
        gE[ei + ew]      += eg * 0.3125;
        bE[ei + ew]      += eb * 0.3125;

        rE[ei + ew + 1]  += er * 0.0625;
        gE[ei + ew + 1]  += eg * 0.0625;
        bE[ei + ew + 1]  += eb * 0.0625;
      }
    }

    this.prevFramePixels = new Uint8ClampedArray(pixels);

    if (this.frameCount === 0 && this.repeat >= 0) this._writeNetscape();

    this._writeGCE(hasTransp);
    this._writeImageDesc();
    this._writeLZW(indexed);
    this.frameCount++;
  }

  finish() {
    this.out.push(0x3b);
    return new Uint8Array(this.out);
  }

  // --- Internal GIF structure writers ---
  _writeStr(s) { for (let i = 0; i < s.length; i++) this.out.push(s.charCodeAt(i)); }
  _writeShort(v) { this.out.push(v & 0xff, (v >> 8) & 0xff); }

  _writeLSD() {
    this._writeShort(this.width);
    this._writeShort(this.height);
    const bits = Math.ceil(Math.log2(this.colorCount)) - 1;
    this.out.push(this.globalColorMap ? (0x80 | 0x70 | Math.max(0, bits)) : 0x70);
    this.out.push(0, 0);
  }

  _writeColorTable(map) {
    for (let i = 0; i < map.length; i++) this.out.push(map[i]);
    const target = (1 << Math.ceil(Math.log2(this.colorCount))) * 3;
    for (let i = map.length; i < target; i++) this.out.push(0);
  }

  _writeNetscape() {
    this.out.push(0x21, 0xff, 11);
    this._writeStr("NETSCAPE2.0");
    this.out.push(3, 1);
    this._writeShort(this.repeat);
    this.out.push(0);
  }

  _writeGCE(hasTransp) {
    this.out.push(0x21, 0xf9, 4);
    this.out.push(hasTransp ? 0x05 : 0x04);
    this._writeShort(this.delay);
    this.out.push(hasTransp ? this.transparentIndex : 0);
    this.out.push(0);
  }

  _writeImageDesc() {
    this.out.push(0x2c);
    this._writeShort(0); this._writeShort(0);
    this._writeShort(this.width); this._writeShort(this.height);
    this.out.push(0); // no local color table
  }

  _writeLZW(indexed) {
    const minCode = Math.max(2, Math.ceil(Math.log2(this.colorCount)));
    this.out.push(minCode);

    const clearCode = 1 << minCode;
    const eofCode = clearCode + 1;
    let codeSize = minCode + 1;
    let nextCode = eofCode + 1;

    let bits = 0, buf = 0;
    const output = [];
    const packet = [];

    const emit = (b) => {
      packet.push(b);
      if (packet.length === 255) {
        output.push(255);
        for (let i = 0; i < 255; i++) output.push(packet[i]);
        packet.length = 0;
      }
    };

    const send = (code, sz) => {
      buf |= (code << bits);
      bits += sz;
      while (bits >= 8) { emit(buf & 0xff); buf >>= 8; bits -= 8; }
    };

    const flush = () => {
      if (bits > 0) emit(buf & 0xff);
      if (packet.length > 0) {
        output.push(packet.length);
        for (let i = 0; i < packet.length; i++) output.push(packet[i]);
        packet.length = 0;
      }
    };

    const dict = new Map();
    const resetDict = () => { dict.clear(); codeSize = minCode + 1; nextCode = eofCode + 1; };

    send(clearCode, codeSize);
    let prefix = indexed[0];

    for (let i = 1; i < indexed.length; i++) {
      const k = indexed[i];
      const key = (prefix << 16) | k;
      if (dict.has(key)) {
        prefix = dict.get(key);
      } else {
        send(prefix, codeSize);
        if (nextCode < 4096) {
          dict.set(key, nextCode++);
          if (nextCode === (1 << codeSize) + 1 && codeSize < 12) codeSize++;
        } else {
          send(clearCode, codeSize);
          resetDict();
        }
        prefix = k;
      }
    }

    send(prefix, codeSize);
    send(eofCode, codeSize);
    flush();

    for (let i = 0; i < output.length; i++) this.out.push(output[i]);
    this.out.push(0);
  }
}

// --- Web Worker Encoder ---
class AsyncGIFEncoder {
  static encodeInWorker(framesPixelData, width, height, delayMs, colors, deltaThreshold, onProgress) {
    return new Promise((resolve, reject) => {
      const src = `
        ${NeuQuant.toString()}
        ${GIFEncoder.toString()}

        self.onmessage = function(e) {
          try {
            const { frames, width, height, delayMs, colors, deltaThreshold } = e.data;

            const enc = new GIFEncoder(width, height);
            enc.setDelay(delayMs);
            enc.setColorCount(colors);
            enc.setDeltaCompression(false, 0);

            // Build global palette from sampled keyframes
            const step = Math.max(1, Math.floor(frames.length / 6));
            let len = 0;
            for (let i = 0; i < frames.length; i += step) len += frames[i].length;
            const sampled = new Uint8Array(len);
            let off = 0;
            for (let i = 0; i < frames.length; i += step) {
              sampled.set(frames[i], off);
              off += frames[i].length;
            }

            self.postMessage({ type: 'progress', percent: 5 });
            enc.buildGlobalPalette(sampled);
            self.postMessage({ type: 'progress', percent: 10 });

            enc.start();

            for (let i = 0; i < frames.length; i++) {
              enc.addFrame(frames[i]);
              self.postMessage({ type: 'progress', percent: 10 + Math.round(((i + 1) / frames.length) * 90) });
            }

            const buf = enc.finish();
            self.postMessage({ type: 'done', buffer: buf }, [buf.buffer]);
          } catch(err) {
            self.postMessage({ type: 'error', error: err.message });
          }
        };
      `;

      const blob = new Blob([src], { type: 'application/javascript' });
      const worker = new Worker(URL.createObjectURL(blob));

      worker.onmessage = (e) => {
        if (e.data.type === 'progress') { if (onProgress) onProgress(e.data.percent); }
        else if (e.data.type === 'done') { worker.terminate(); resolve(e.data.buffer); }
        else if (e.data.type === 'error') { worker.terminate(); reject(new Error(e.data.error)); }
      };
      worker.onerror = (err) => { worker.terminate(); reject(new Error(err.message)); };

      worker.postMessage({
        frames: framesPixelData, width, height, delayMs, colors, deltaThreshold
      }, framesPixelData.map(f => f.buffer));
    });
  }
}

window.GIFEncoder = GIFEncoder;
window.AsyncGIFEncoder = AsyncGIFEncoder;
