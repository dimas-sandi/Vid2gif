/**
 * DMZ Eye Animator — GIF Encoder Engine
 * 
 * ROOT CAUSE FIX for 35% stuck:
 * The old lookupRGB() did a brute-force O(256) linear scan for EVERY pixel
 * of EVERY frame. For 45 frames × 57,600 pixels × 256 = 663 MILLION ops.
 * 
 * FIX: After NeuQuant training, we build a 32,768-entry (15-bit RGB) 
 * lookup cache table. Each pixel lookup is now O(1) instead of O(256).
 * This is 256× faster — encoding finishes in milliseconds, not minutes.
 */

// --- NeuQuant Color Quantizer (with O(1) Lookup Cache) ---
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

    const freqVal = 1.0 / this.netsize;
    for (let i = 0; i < this.netsize; i++) {
      this.freq[i] = freqVal;
      this.bias[i] = 0.0;
    }

    // O(1) lookup cache — built after learn()+setUpArrays()
    this.lookupCache = null;
  }

  // Read palette directly from network (already sorted by setUpArrays).
  // DO NOT re-sort here — indices must match buildLookupCache()!
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
    // Sort network by green for indexed lookup
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
        let temp;
        temp = this.network[i][0]; this.network[i][0] = this.network[smallpos][0]; this.network[smallpos][0] = temp;
        temp = this.network[i][1]; this.network[i][1] = this.network[smallpos][1]; this.network[smallpos][1] = temp;
        temp = this.network[i][2]; this.network[i][2] = this.network[smallpos][2]; this.network[smallpos][2] = temp;
      }
    }
  }

  alterneigh(rad, i, r, g, b) {
    const lo = Math.max(i - rad, -1);
    const hi = Math.min(i + rad, this.netsize);
    let j = i + 1;
    let k = i - 1;
    let m = 1;
    while (j < hi || k > lo) {
      const a = Math.round(this.radpower[m++]);
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
    let bestd = 1.0e30;
    let bestbiasd = bestd;
    let bestpos = -1;
    let bestbiaspos = bestpos;

    for (let i = 0; i < this.netsize; i++) {
      const p = this.network[i];
      const dist = Math.abs(p[0] - r) + Math.abs(p[1] - g) + Math.abs(p[2] - b);
      if (dist < bestd) { bestd = dist; bestpos = i; }
      const biasdist = dist - (this.bias[i] / (1 << (this.alphabiasshift - this.radbiasshift)));
      if (biasdist < bestbiasd) { bestbiasd = biasdist; bestbiaspos = i; }
      const beta = this.freq[i] / (1 << this.radbiasshift);
      this.freq[i] -= beta;
      this.bias[i] += beta * (1 << this.alphabiasshift);
    }
    this.freq[bestpos] += 1.0 / (1 << this.radbiasshift);
    this.bias[bestpos] -= 1.0 / (1 << (this.alphabiasshift - this.radbiasshift));
    return bestbiaspos;
  }

  learn() {
    const lengthcount = this.pixels.length;
    const samplefac = this.samplefac;
    const alphadec = 30 + (samplefac - 1) / 3;
    const samplepixels = lengthcount / (4 * samplefac);
    let delta = Math.max(1, Math.floor(samplepixels / this.ncycles));
    let alpha = this.alphabias;
    let radius = this.initbiasradius;

    let rad = radius >> this.radiusbiasshift;
    if (rad <= 1) rad = 0;
    for (let i = 0; i < rad; i++) {
      this.radpower[i] = alpha * (((rad * rad - i * i) * this.radbias) / (rad * rad));
    }

    const step = 4 * samplefac;
    let pix = 0;

    for (let i = 0; i < samplepixels; i++) {
      const r = this.pixels[pix] & 0xff;
      const g = this.pixels[pix + 1] & 0xff;
      const b = this.pixels[pix + 2] & 0xff;

      const j = this.contest(r, g, b);
      this.altersingle(alpha, j, r, g, b);
      if (rad !== 0) this.alterneigh(rad, j, r, g, b);

      pix += step;
      if (pix >= lengthcount) pix = 0;

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

  // Build O(1) lookup cache: 15-bit RGB → palette index (32,768 entries)
  buildLookupCache() {
    this.lookupCache = new Uint8Array(32768);
    for (let r5 = 0; r5 < 32; r5++) {
      const r = (r5 << 3) | 4; // center of bin
      for (let g5 = 0; g5 < 32; g5++) {
        const g = (g5 << 3) | 4;
        for (let b5 = 0; b5 < 32; b5++) {
          const b = (b5 << 3) | 4;
          const key = (r5 << 10) | (g5 << 5) | b5;
          // Brute-force search (done once during setup, not per-pixel)
          let bestd = 1e9;
          let best = 0;
          for (let i = 0; i < this.netsize; i++) {
            const p = this.network[i];
            const dr = p[0] - r;
            const dg = p[1] - g;
            const db = p[2] - b;
            const d = dr * dr + dg * dg + db * db;
            if (d < bestd) { bestd = d; best = i; }
          }
          this.lookupCache[key] = best;
        }
      }
    }
  }

  // O(1) cached lookup — 256× faster than brute-force per pixel
  lookupRGB(r, g, b) {
    if (this.lookupCache) {
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      return this.lookupCache[key];
    }
    // Fallback brute-force (should never be reached after buildLookupCache)
    let bestd = 1e9;
    let best = 0;
    for (let i = 0; i < this.netsize; i++) {
      const p = this.network[i];
      const dr = p[0] - r;
      const dg = p[1] - g;
      const db = p[2] - b;
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
    this.frames = [];
    this.delay = 10;
    this.repeat = 0;
    this.colorCount = 256;
    this.useDither = true; // Floyd-Steinberg dithering — safe with O(1) cache

    this.enableDelta = true;
    this.deltaThreshold = 24;
    this.transparentIndex = 255;
    this.prevFramePixels = null;

    this.globalNQ = null;
    this.globalColorMap = null;
  }

  setDelay(ms) { this.delay = Math.round(ms / 10); }
  setRepeat(r) { this.repeat = r; }
  setColorCount(count) {
    this.colorCount = count;
    this.transparentIndex = Math.min(255, count - 1);
  }
  setDither(enabled) { this.useDither = enabled; }
  setDeltaCompression(enabled, threshold = 24) {
    this.enableDelta = enabled;
    this.deltaThreshold = threshold;
  }

  setGlobalPaletteFromSample(sampledPixels) {
    // Lower sampleFac = better palette quality (more pixels sampled for training)
    const sampleFac = Math.max(10, Math.floor(sampledPixels.length / 60000));
    this.globalNQ = new NeuQuant(sampledPixels, sampleFac, this.colorCount);
    this.globalNQ.learn();
    this.globalNQ.setUpArrays();
    this.globalNQ.buildLookupCache(); // BUILD O(1) CACHE — this is the key fix
    this.globalColorMap = this.globalNQ.colorMap();
  }

  start() {
    this.out = [];
    this.prevFramePixels = null;
    this.writeString("GIF89a");
    this.writeLSD(this.globalColorMap != null);
    if (this.globalColorMap) this.writeColorTable(this.globalColorMap);
  }

  writeString(str) {
    for (let i = 0; i < str.length; i++) this.out.push(str.charCodeAt(i));
  }

  writeShort(val) {
    this.out.push(val & 0xff);
    this.out.push((val >> 8) & 0xff);
  }

  writeLSD(hasGCT = false) {
    this.writeShort(this.width);
    this.writeShort(this.height);
    if (hasGCT) {
      let bits = Math.ceil(Math.log2(this.colorCount)) - 1;
      if (bits < 0) bits = 0;
      this.out.push(0x80 | 0x70 | bits);
    } else {
      this.out.push(0x70);
    }
    this.out.push(0);
    this.out.push(0);
  }

  writeNetscapeAppExt() {
    this.out.push(0x21, 0xff, 11);
    this.writeString("NETSCAPE2.0");
    this.out.push(3, 1);
    this.writeShort(this.repeat);
    this.out.push(0);
  }

  addFrame(pixels) {
    const nq = this.globalNQ;
    const colorMap = this.globalColorMap;
    if (!nq || !colorMap) return;

    const w = this.width;
    const h = this.height;
    const totalPixels = w * h;
    const indexedPixels = new Uint8Array(totalPixels);
    let hasTransparent = false;
    const isFirst = (this.frames.length === 0);

    if (this.useDither) {
      // Floyd-Steinberg dithering with O(1) lookup — high quality + fast
      const errW = w + 2;
      const rErr = new Float32Array(errW * (h + 1));
      const gErr = new Float32Array(errW * (h + 1));
      const bErr = new Float32Array(errW * (h + 1));

      let k = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const pi = (y * w + x) * 4;
          const ei = y * errW + x + 1;

          let r = pixels[pi] + rErr[ei];
          let g = pixels[pi + 1] + gErr[ei];
          let b = pixels[pi + 2] + bErr[ei];
          r = Math.max(0, Math.min(255, r));
          g = Math.max(0, Math.min(255, g));
          b = Math.max(0, Math.min(255, b));

          // Delta compression
          if (!isFirst && this.enableDelta && this.prevFramePixels) {
            const diff = Math.abs(r - this.prevFramePixels[pi])
                       + Math.abs(g - this.prevFramePixels[pi + 1])
                       + Math.abs(b - this.prevFramePixels[pi + 2]);
            if (diff < this.deltaThreshold) {
              indexedPixels[k++] = this.transparentIndex;
              hasTransparent = true;
              continue;
            }
          }

          // O(1) color lookup
          const idx = nq.lookupRGB(r | 0, g | 0, b | 0);
          indexedPixels[k++] = idx;

          // Compute and diffuse error
          const er = r - colorMap[idx * 3];
          const eg = g - colorMap[idx * 3 + 1];
          const eb = b - colorMap[idx * 3 + 2];

          // Right neighbor
          rErr[ei + 1]       += er * 0.4375; // 7/16
          gErr[ei + 1]       += eg * 0.4375;
          bErr[ei + 1]       += eb * 0.4375;
          // Bottom-left
          rErr[ei + errW - 1] += er * 0.1875; // 3/16
          gErr[ei + errW - 1] += eg * 0.1875;
          bErr[ei + errW - 1] += eb * 0.1875;
          // Bottom
          rErr[ei + errW]     += er * 0.3125; // 5/16
          gErr[ei + errW]     += eg * 0.3125;
          bErr[ei + errW]     += eb * 0.3125;
          // Bottom-right
          rErr[ei + errW + 1] += er * 0.0625; // 1/16
          gErr[ei + errW + 1] += eg * 0.0625;
          bErr[ei + errW + 1] += eb * 0.0625;
        }
      }
    } else {
      // No-dither fast path
      let k = 0;
      for (let i = 0; i < totalPixels; i++) {
        const pi = i * 4;
        const r = pixels[pi];
        const g = pixels[pi + 1];
        const b = pixels[pi + 2];

        if (!isFirst && this.enableDelta && this.prevFramePixels) {
          const diff = Math.abs(r - this.prevFramePixels[pi])
                     + Math.abs(g - this.prevFramePixels[pi + 1])
                     + Math.abs(b - this.prevFramePixels[pi + 2]);
          if (diff < this.deltaThreshold) {
            indexedPixels[k++] = this.transparentIndex;
            hasTransparent = true;
            continue;
          }
        }

        indexedPixels[k++] = nq.lookupRGB(r, g, b);
      }
    }

    this.prevFramePixels = new Uint8ClampedArray(pixels);

    if (this.frames.length === 0 && this.repeat >= 0) this.writeNetscapeAppExt();

    this.writeGraphicCtrlExt(hasTransparent);
    this.writeImageDesc(true);
    this.writePixels(indexedPixels);
    this.frames.push(true);
  }

  writeGraphicCtrlExt(hasTransparency = false) {
    this.out.push(0x21, 0xf9, 4);
    this.out.push(hasTransparency ? 0x05 : 0x04);
    this.writeShort(this.delay);
    this.out.push(hasTransparency ? this.transparentIndex : 0);
    this.out.push(0);
  }

  writeImageDesc(hasGCT = false) {
    this.out.push(0x2c);
    this.writeShort(0);
    this.writeShort(0);
    this.writeShort(this.width);
    this.writeShort(this.height);
    this.out.push(hasGCT ? 0 : 0x80);
  }

  writeColorTable(colorMap) {
    for (let i = 0; i < colorMap.length; i++) this.out.push(colorMap[i]);
    const target = (1 << Math.ceil(Math.log2(this.colorCount))) * 3;
    for (let i = colorMap.length; i < target; i++) this.out.push(0);
  }

  writePixels(indexedPixels) {
    const initCodeSize = Math.max(2, Math.ceil(Math.log2(this.colorCount)));
    this.out.push(initCodeSize);
    const lzw = new LZWEncoder(this.width, this.height, indexedPixels, initCodeSize);
    const compressed = lzw.encode();
    for (let i = 0; i < compressed.length; i++) this.out.push(compressed[i]);
    this.out.push(0);
  }

  finish() {
    this.out.push(0x3b);
    return new Uint8Array(this.out);
  }
}

// --- LZW Encoder ---
class LZWEncoder {
  constructor(width, height, pixels, colorDepth) {
    this.pixels = pixels;
    this.initCodeSize = colorDepth;
  }

  encode() {
    const initCodeSize = this.initCodeSize;
    const clearCode = 1 << initCodeSize;
    const eofCode = clearCode + 1;

    let codeSize = initCodeSize + 1;
    let nextCode = eofCode + 1;
    const maxMaxCode = 4096;

    let curBitAccum = 0;
    let curBits = 0;
    const output = [];
    const packet = [];

    const sendByte = (b) => {
      packet.push(b);
      if (packet.length === 255) {
        output.push(255);
        for (let i = 0; i < 255; i++) output.push(packet[i]);
        packet.length = 0;
      }
    };

    const sendBits = (code, bits) => {
      curBitAccum |= (code << curBits);
      curBits += bits;
      while (curBits >= 8) {
        sendByte(curBitAccum & 0xff);
        curBitAccum >>= 8;
        curBits -= 8;
      }
    };

    const flush = () => {
      if (curBits > 0) sendByte(curBitAccum & 0xff);
      if (packet.length > 0) {
        output.push(packet.length);
        for (let i = 0; i < packet.length; i++) output.push(packet[i]);
        packet.length = 0;
      }
    };

    const dictionary = new Map();
    const resetDict = () => {
      dictionary.clear();
      codeSize = initCodeSize + 1;
      nextCode = eofCode + 1;
    };

    sendBits(clearCode, codeSize);
    let prefix = this.pixels[0];

    for (let i = 1; i < this.pixels.length; i++) {
      const k = this.pixels[i];
      const key = (prefix << 16) | k;

      if (dictionary.has(key)) {
        prefix = dictionary.get(key);
      } else {
        sendBits(prefix, codeSize);
        if (nextCode < maxMaxCode) {
          dictionary.set(key, nextCode++);
          if (nextCode === (1 << codeSize) + 1 && codeSize < 12) codeSize++;
        } else {
          sendBits(clearCode, codeSize);
          resetDict();
        }
        prefix = k;
      }
    }

    sendBits(prefix, codeSize);
    sendBits(eofCode, codeSize);
    flush();
    return output;
  }
}

// --- Web Worker Async Encoder ---
class AsyncGIFEncoder {
  static encodeInWorker(framesPixelData, width, height, delayMs, colors = 256, deltaThreshold = 24, onProgress = null) {
    return new Promise((resolve, reject) => {
      const workerCode = `
        ${NeuQuant.toString()}
        ${LZWEncoder.toString()}
        ${GIFEncoder.toString()}

        self.onmessage = function(e) {
          try {
            const { frames, width, height, delayMs, colors, deltaThreshold } = e.data;
            const encoder = new GIFEncoder(width, height);
            encoder.setDelay(delayMs);
            encoder.setColorCount(colors);
            encoder.setDither(false);
            encoder.setDeltaCompression(true, deltaThreshold);

            // Sample keyframes for global palette
            const sampleStep = Math.max(1, Math.floor(frames.length / 6));
            let totalLen = 0;
            for (let i = 0; i < frames.length; i += sampleStep) totalLen += frames[i].length;
            const sampled = new Uint8Array(totalLen);
            let off = 0;
            for (let i = 0; i < frames.length; i += sampleStep) {
              sampled.set(frames[i], off);
              off += frames[i].length;
            }

            self.postMessage({ type: 'progress', percent: 5 });

            encoder.setGlobalPaletteFromSample(sampled);

            self.postMessage({ type: 'progress', percent: 15 });

            encoder.start();

            for (let i = 0; i < frames.length; i++) {
              encoder.addFrame(frames[i]);
              const pct = 15 + Math.round(((i + 1) / frames.length) * 85);
              self.postMessage({ type: 'progress', percent: pct });
            }

            const buffer = encoder.finish();
            self.postMessage({ type: 'complete', buffer: buffer }, [buffer.buffer]);
          } catch(err) {
            self.postMessage({ type: 'error', error: err.message + ' | ' + err.stack });
          }
        };
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const worker = new Worker(URL.createObjectURL(blob));

      worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'progress') {
          if (onProgress) onProgress(msg.percent);
        } else if (msg.type === 'complete') {
          worker.terminate();
          resolve(msg.buffer);
        } else if (msg.type === 'error') {
          worker.terminate();
          reject(new Error(msg.error));
        }
      };

      worker.onerror = (err) => {
        worker.terminate();
        reject(new Error(err.message || 'Worker error'));
      };

      const transferables = framesPixelData.map((f) => f.buffer);
      worker.postMessage({
        frames: framesPixelData,
        width, height, delayMs, colors, deltaThreshold
      }, transferables);
    });
  }
}

window.GIFEncoder = GIFEncoder;
window.AsyncGIFEncoder = AsyncGIFEncoder;
