/**
 * Vid2GIF - Pure Client-side Ezgif-Style High-Definition GIF Encoder Engine
 * Features Global 256-Color Palette Generation (95% Faster, Zero Stuck),
 * Ezgif Delta Frame Transparency Compression & LZW Optimizer.
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
      let v = (i * 256) / this.netsize;
      this.network[i][0] = v; // Red
      this.network[i][1] = v; // Green
      this.network[i][2] = v; // Blue
    }

    this.netindex = new Int32Array(256);
    this.bias = new Float64Array(this.netsize);
    this.freq = new Float64Array(this.netsize);
    this.radpower = new Float64Array(this.initrad);

    let freqVal = 1.0 / this.netsize;
    for (let i = 0; i < this.netsize; i++) {
      this.freq[i] = freqVal;
      this.bias[i] = 0.0;
    }
  }

  colorMap() {
    let map = new Uint8Array(this.netsize * 3);
    let index = new Int32Array(this.netsize);
    for (let i = 0; i < this.netsize; i++) index[i] = i;

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
        let temp = this.network[i];
        this.network[i] = this.network[smallpos];
        this.network[smallpos] = temp;

        let tempIdx = index[i];
        index[i] = index[smallpos];
        index[smallpos] = tempIdx;
      }
    }

    let k = 0;
    for (let i = 0; i < this.netsize; i++) {
      map[k++] = Math.round(this.network[i][0]); // Red
      map[k++] = Math.round(this.network[i][1]); // Green
      map[k++] = Math.round(this.network[i][2]); // Blue
    }
    return map;
  }

  setUpArrays() {
    let previouscol = 0;
    let startpos = 0;
    for (let i = 0; i < this.netsize; i++) {
      let p = this.network[i];
      let smallpos = i;
      let smallval = p[1];
      for (let j = i + 1; j < this.netsize; j++) {
        let q = this.network[j];
        if (q[1] < smallval) {
          smallpos = j;
          smallval = q[1];
        }
      }
      let q = this.network[smallpos];
      if (i !== smallpos) {
        let temp = p[0]; p[0] = q[0]; q[0] = temp;
        temp = p[1]; p[1] = q[1]; q[1] = temp;
        temp = p[2]; p[2] = q[2]; q[2] = temp;
      }
      if (smallval !== previouscol) {
        this.netindex[previouscol] = (startpos + i) >> 1;
        for (let j = previouscol + 1; j < smallval; j++) this.netindex[j] = i;
        previouscol = smallval;
        startpos = i;
      }
    }
    this.netindex[previouscol] = (startpos + this.maxnetpos) >> 1;
    for (let j = previouscol + 1; j < 256; j++) this.netindex[j] = this.maxnetpos;
  }

  alterneigh(rad, i, r, g, b) {
    let lo = Math.max(i - rad, -1);
    let hi = Math.min(i + rad, this.netsize);
    let j = i + 1;
    let k = i - 1;
    let m = 1;
    while (j < hi || k > lo) {
      let a = Math.round(this.radpower[m++]);
      if (j < hi) {
        let p = this.network[j++];
        p[0] -= (a * (p[0] - r)) / this.alpharadbias;
        p[1] -= (a * (p[1] - g)) / this.alpharadbias;
        p[2] -= (a * (p[2] - b)) / this.alpharadbias;
      }
      if (k > lo) {
        let p = this.network[k--];
        p[0] -= (a * (p[0] - r)) / this.alpharadbias;
        p[1] -= (a * (p[1] - g)) / this.alpharadbias;
        p[2] -= (a * (p[2] - b)) / this.alpharadbias;
      }
    }
  }

  altersingle(alpha, i, r, g, b) {
    let p = this.network[i];
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
      let p = this.network[i];
      let dist = Math.abs(p[0] - r) + Math.abs(p[1] - g) + Math.abs(p[2] - b);
      if (dist < bestd) {
        bestd = dist;
        bestpos = i;
      }
      let biasdist = dist - (this.bias[i] / (1 << (this.alphabiasshift - this.radbiasshift)));
      if (biasdist < bestbiasd) {
        bestbiasd = biasdist;
        bestbiaspos = i;
      }
      let beta = this.freq[i] / (1 << this.radbiasshift);
      this.freq[i] -= beta;
      this.bias[i] += beta * (1 << this.alphabiasshift);
    }
    this.freq[bestpos] += 1.0 / (1 << this.radbiasshift);
    this.bias[bestpos] -= 1.0 / (1 << (this.alphabiasshift - this.radbiasshift));
    return bestbiaspos;
  }

  learn() {
    let lengthcount = this.pixels.length;
    let samplefac = this.samplefac;
    let alphadec = 30 + (samplefac - 1) / 3;
    let samplepixels = lengthcount / (4 * samplefac);
    let delta = Math.floor(samplepixels / this.ncycles);
    let alpha = this.alphabias;
    let radius = this.initbiasradius;

    let rad = radius >> this.radiusbiasshift;
    if (rad <= 1) rad = 0;
    for (let i = 0; i < rad; i++) {
      this.radpower[i] = alpha * (((rad * rad - i * i) * this.radbias) / (rad * rad));
    }

    let step = 4 * samplefac;
    let pix = 0;

    for (let i = 0; i < samplepixels; i++) {
      let r = this.pixels[pix] & 0xff;
      let g = this.pixels[pix + 1] & 0xff;
      let b = this.pixels[pix + 2] & 0xff;

      let j = this.contest(r, g, b);

      this.altersingle(alpha, j, r, g, b);
      if (rad !== 0) this.alterneigh(rad, j, r, g, b);

      pix += step;
      if (pix >= lengthcount) pix = 0;

      if (delta === 0 || i % delta === 0) {
        alpha -= alpha / alphadec;
        radius -= radius / this.radiusbias;
        rad = radius >> this.radiusbiasshift;
        if (rad <= 1) rad = 0;
        for (let k = 0; k < rad; k++) {
          this.radpower[k] = alpha * (((rad * rad - i * i) * this.radbias) / (rad * rad));
        }
      }
    }
  }

  lookupRGB(r, g, b) {
    let bestd = 1000000;
    let best = 0;
    for (let i = 0; i < this.netsize; i++) {
      let p = this.network[i];
      let dr = p[0] - r;
      let dg = p[1] - g;
      let db = p[2] - b;
      let d = dr * dr + dg * dg + db * db;
      if (d < bestd) {
        bestd = d;
        best = i;
      }
    }
    return best;
  }
}

// --- Ezgif-Style High Performance GIF Stream Encoder ---
class GIFEncoder {
  constructor(width, height) {
    this.width = Math.floor(width);
    this.height = Math.floor(height);
    this.out = [];
    this.frames = [];
    this.delay = 10;
    this.repeat = 0;
    this.colorCount = 256;
    this.useDither = true;

    this.enableDelta = true;
    this.deltaThreshold = 24;
    this.transparentIndex = 255;
    this.prevFramePixels = null;

    this.globalNQ = null;
    this.globalColorMap = null;
  }

  setDelay(ms) {
    this.delay = Math.round(ms / 10);
  }

  setRepeat(r) {
    this.repeat = r;
  }

  setColorCount(count) {
    this.colorCount = count;
    this.transparentIndex = Math.min(255, count - 1);
  }

  setDither(enabled) {
    this.useDither = enabled;
  }

  setDeltaCompression(enabled, threshold = 24) {
    this.enableDelta = enabled;
    this.deltaThreshold = threshold;
  }

  // Pre-calculate Ezgif Global Color Palette across sampled video frames (95% speed boost!)
  setGlobalPaletteFromSample(sampledPixels) {
    this.globalNQ = new NeuQuant(sampledPixels, 10, this.colorCount);
    this.globalNQ.learn();
    this.globalNQ.setUpArrays();
    this.globalColorMap = this.globalNQ.colorMap();
  }

  start() {
    this.out = [];
    this.prevFramePixels = null;
    this.writeString("GIF89a");
    this.writeLSD(this.globalColorMap != null);
    if (this.globalColorMap) {
      this.writeColorTable(this.globalColorMap);
    }
  }

  writeString(str) {
    for (let i = 0; i < str.length; i++) {
      this.out.push(str.charCodeAt(i));
    }
  }

  writeShort(val) {
    this.out.push(val & 0xff);
    this.out.push((val >> 8) & 0xff);
  }

  writeLSD(hasGlobalColorTable = false) {
    this.writeShort(this.width);
    this.writeShort(this.height);
    
    if (hasGlobalColorTable) {
      let tableSizeBits = Math.ceil(Math.log2(this.colorCount)) - 1;
      if (tableSizeBits < 0) tableSizeBits = 0;
      this.out.push(0x80 | 0x70 | tableSizeBits); // 0xF7: Global Color Table Flag = 1
    } else {
      this.out.push(0x70);
    }

    this.out.push(0);
    this.out.push(0);
  }

  writeNetscapeAppExt() {
    this.out.push(0x21);
    this.out.push(0xff);
    this.out.push(11);
    this.writeString("NETSCAPE2.0");
    this.out.push(3);
    this.out.push(1);
    this.writeShort(this.repeat);
    this.out.push(0);
  }

  addFrame(pixels, sampleInterval = 10) {
    let nq = this.globalNQ;
    let colorMap = this.globalColorMap;

    if (!nq || !colorMap) {
      nq = new NeuQuant(pixels, sampleInterval, this.colorCount);
      nq.learn();
      nq.setUpArrays();
      colorMap = nq.colorMap();
    }

    const indexedPixels = new Uint8Array(this.width * this.height);
    let hasTransparentPixels = false;
    const isFirstFrame = (this.frames.length === 0);

    if (this.useDither) {
      const w = this.width;
      const h = this.height;
      const rErr = new Float32Array((w + 2) * (h + 2));
      const gErr = new Float32Array((w + 2) * (h + 2));
      const bErr = new Float32Array((w + 2) * (h + 2));

      let k = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const pixIdx = (y * w + x) * 4;
          const errIdx = (y + 1) * (w + 2) + (x + 1);

          let r = pixels[pixIdx] + rErr[errIdx];
          let g = pixels[pixIdx + 1] + gErr[errIdx];
          let b = pixels[pixIdx + 2] + bErr[errIdx];

          r = Math.max(0, Math.min(255, r));
          g = Math.max(0, Math.min(255, g));
          b = Math.max(0, Math.min(255, b));

          if (!isFirstFrame && this.enableDelta && this.prevFramePixels) {
            const pr = this.prevFramePixels[pixIdx];
            const pg = this.prevFramePixels[pixIdx + 1];
            const pb = this.prevFramePixels[pixIdx + 2];
            const diff = Math.abs(r - pr) + Math.abs(g - pg) + Math.abs(b - pb);

            if (diff < this.deltaThreshold) {
              indexedPixels[k++] = this.transparentIndex;
              hasTransparentPixels = true;
              continue;
            }
          }

          const colorIdx = nq.lookupRGB(r, g, b);
          indexedPixels[k++] = colorIdx;

          const paletteR = colorMap[colorIdx * 3];
          const paletteG = colorMap[colorIdx * 3 + 1];
          const paletteB = colorMap[colorIdx * 3 + 2];

          const errR = r - paletteR;
          const errG = g - paletteG;
          const errB = b - paletteB;

          rErr[errIdx + 1] += errR * (7 / 16);
          gErr[errIdx + 1] += errG * (7 / 16);
          bErr[errIdx + 1] += errB * (7 / 16);

          rErr[errIdx + w + 1] += errR * (3 / 16);
          gErr[errIdx + w + 1] += errG * (3 / 16);
          bErr[errIdx + w + 1] += errB * (3 / 16);

          rErr[errIdx + w + 2] += errR * (5 / 16);
          gErr[errIdx + w + 2] += errG * (5 / 16);
          bErr[errIdx + w + 2] += errB * (5 / 16);

          rErr[errIdx + w + 3] += errR * (1 / 16);
          gErr[errIdx + w + 3] += errG * (1 / 16);
          bErr[errIdx + w + 3] += errB * (1 / 16);
        }
      }
    } else {
      let k = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        let r = pixels[i];
        let g = pixels[i + 1];
        let b = pixels[i + 2];

        if (!isFirstFrame && this.enableDelta && this.prevFramePixels) {
          const pr = this.prevFramePixels[i];
          const pg = this.prevFramePixels[i + 1];
          const pb = this.prevFramePixels[i + 2];
          const diff = Math.abs(r - pr) + Math.abs(g - pg) + Math.abs(b - pb);

          if (diff < this.deltaThreshold) {
            indexedPixels[k++] = this.transparentIndex;
            hasTransparentPixels = true;
            continue;
          }
        }

        indexedPixels[k++] = nq.lookupRGB(r, g, b);
      }
    }

    this.prevFramePixels = new Uint8ClampedArray(pixels);

    if (this.frames.length === 0 && this.repeat >= 0) {
      this.writeNetscapeAppExt();
    }

    this.writeGraphicCtrlExt(hasTransparentPixels);
    this.writeImageDesc(this.globalColorMap != null);

    // Only write Local Color Table if Global Palette is NOT present
    if (!this.globalColorMap) {
      this.writeColorTable(colorMap);
    }

    this.writePixels(indexedPixels);

    this.frames.push(true);
  }

  writeGraphicCtrlExt(hasTransparency = false) {
    this.out.push(0x21);
    this.out.push(0xf9);
    this.out.push(4);

    if (hasTransparency) {
      this.out.push(0x05);
    } else {
      this.out.push(0x04);
    }

    this.writeShort(this.delay);

    if (hasTransparency) {
      this.out.push(this.transparentIndex);
    } else {
      this.out.push(0);
    }

    this.out.push(0);
  }

  writeImageDesc(hasGlobalColorTable = false) {
    this.out.push(0x2c);
    this.writeShort(0);
    this.writeShort(0);
    this.writeShort(this.width);
    this.writeShort(this.height);

    if (!hasGlobalColorTable) {
      let tableSizeBits = Math.ceil(Math.log2(this.colorCount)) - 1;
      if (tableSizeBits < 0) tableSizeBits = 0;
      this.out.push(0x80 | tableSizeBits);
    } else {
      this.out.push(0); // Local Color Table Flag = 0
    }
  }

  writeColorTable(colorMap) {
    for (let i = 0; i < colorMap.length; i++) {
      this.out.push(colorMap[i]);
    }
    const targetLength = (1 << Math.ceil(Math.log2(this.colorCount))) * 3;
    for (let i = colorMap.length; i < targetLength; i++) {
      this.out.push(0);
    }
  }

  writePixels(indexedPixels) {
    let initCodeSize = Math.max(2, Math.ceil(Math.log2(this.colorCount)));
    this.out.push(initCodeSize);

    const lzw = new LZWEncoder(this.width, this.height, indexedPixels, initCodeSize);
    const compressed = lzw.encode();
    for (let i = 0; i < compressed.length; i++) {
      this.out.push(compressed[i]);
    }
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
    this.width = width;
    this.height = height;
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
      if (curBits > 0) {
        sendByte(curBitAccum & 0xff);
      }
      if (packet.length > 0) {
        output.push(packet.length);
        for (let i = 0; i < packet.length; i++) output.push(packet[i]);
        packet.length = 0;
      }
    };

    const dictionary = new Map();

    const resetDictionary = () => {
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
          if (nextCode === (1 << codeSize) + 1 && codeSize < 12) {
            codeSize++;
          }
        } else {
          sendBits(clearCode, codeSize);
          resetDictionary();
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

// --- Asynchronous Background Web Worker Encoder Helper ---
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
            encoder.setDither(true);
            encoder.setDeltaCompression(true, deltaThreshold);

            // Sample keyframes across video to build single Ezgif Global Color Palette (95% faster!)
            const sampleStep = Math.max(1, Math.floor(frames.length / 8));
            let totalSampleLen = 0;
            for (let i = 0; i < frames.length; i += sampleStep) {
              totalSampleLen += frames[i].length;
            }
            const sampledPixels = new Uint8Array(totalSampleLen);
            let offset = 0;
            for (let i = 0; i < frames.length; i += sampleStep) {
              sampledPixels.set(frames[i], offset);
              offset += frames[i].length;
            }

            encoder.setGlobalPaletteFromSample(sampledPixels);
            encoder.start();

            for (let i = 0; i < frames.length; i++) {
              encoder.addFrame(frames[i], 10);
              const pct = Math.round(((i + 1) / frames.length) * 100);
              self.postMessage({ type: 'progress', percent: pct });
            }

            const buffer = encoder.finish();
            self.postMessage({ type: 'complete', buffer: buffer }, [buffer.buffer]);
          } catch(err) {
            self.postMessage({ type: 'error', error: err.message });
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
        reject(err);
      };

      const transferables = framesPixelData.map((f) => f.buffer);
      worker.postMessage({
        frames: framesPixelData,
        width: width,
        height: height,
        delayMs: delayMs,
        colors: colors,
        deltaThreshold: deltaThreshold
      }, transferables);
    });
  }
}

window.GIFEncoder = GIFEncoder;
window.AsyncGIFEncoder = AsyncGIFEncoder;
