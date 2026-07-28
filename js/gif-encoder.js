/**
 * Vid2GIF - Pure Client-side GIF Encoder Engine
 * Includes NeuQuant Color Quantization, LZW GIF Stream Encoder, and Spatial Noise Pre-filter.
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
    this.samplefac = samplefac;

    this.network = new Array(this.netsize);
    for (let i = 0; i < this.netsize; i++) {
      this.network[i] = new Float64Array(4);
      let v = (i * 256) / this.netsize;
      this.network[i][0] = v;
      this.network[i][1] = v;
      this.network[i][2] = v;
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
      map[k++] = Math.round(this.network[i][0]);
      map[k++] = Math.round(this.network[i][1]);
      map[k++] = Math.round(this.network[i][2]);
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

  alterneigh(rad, i, b, g, r) {
    let lo = Math.max(i - rad, -1);
    let hi = Math.min(i + rad, this.netsize);
    let j = i + 1;
    let k = i - 1;
    let m = 1;
    while (j < hi || k > lo) {
      let a = Math.round(this.radpower[m++]);
      if (j < hi) {
        let p = this.network[j++];
        p[0] -= (a * (p[0] - b)) / this.alpharadbias;
        p[1] -= (a * (p[1] - g)) / this.alpharadbias;
        p[2] -= (a * (p[2] - r)) / this.alpharadbias;
      }
      if (k > lo) {
        let p = this.network[k--];
        p[0] -= (a * (p[0] - b)) / this.alpharadbias;
        p[1] -= (a * (p[1] - g)) / this.alpharadbias;
        p[2] -= (a * (p[2] - r)) / this.alpharadbias;
      }
    }
  }

  altersingle(alpha, i, b, g, r) {
    let p = this.network[i];
    p[0] -= (alpha * (p[0] - b)) / this.alphabias;
    p[1] -= (alpha * (p[1] - g)) / this.alphabias;
    p[2] -= (alpha * (p[2] - r)) / this.alphabias;
  }

  contest(b, g, r) {
    let bestd = 1.0e30;
    let bestbiasd = bestd;
    let bestpos = -1;
    let bestbiaspos = bestpos;

    for (let i = 0; i < this.netsize; i++) {
      let p = this.network[i];
      let dist = Math.abs(p[0] - b) + Math.abs(p[1] - g) + Math.abs(p[2] - r);
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
      let b = this.pixels[pix] & 0xff;
      let g = this.pixels[pix + 1] & 0xff;
      let r = this.pixels[pix + 2] & 0xff;

      let j = this.contest(b, g, r);

      this.altersingle(alpha, j, b, g, r);
      if (rad !== 0) this.alterneigh(rad, j, b, g, r);

      pix += step;
      if (pix >= lengthcount) pix = 0;

      if (delta === 0 || i % delta === 0) {
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

  lookupRGB(b, g, r) {
    let bestd = 1000000;
    let best = 0;
    for (let i = 0; i < this.netsize; i++) {
      let p = this.network[i];
      let db = p[0] - b;
      let dg = p[1] - g;
      let dr = p[2] - r;
      let d = db * db + dg * dg + dr * dr;
      if (d < bestd) {
        bestd = d;
        best = i;
      }
    }
    return best;
  }
}

// --- GIF Stream Encoder & LZW Compressor ---
class GIFEncoder {
  constructor(width, height) {
    this.width = Math.floor(width);
    this.height = Math.floor(height);
    this.out = [];
    this.frames = [];
    this.delay = 10;
    this.repeat = 0;
    this.colorCount = 256;
  }

  setDelay(ms) {
    this.delay = Math.round(ms / 10);
  }

  setRepeat(r) {
    this.repeat = r;
  }

  setColorCount(count) {
    this.colorCount = count;
  }

  start() {
    this.out = [];
    this.writeString("GIF89a");
    this.writeLSD();
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

  writeLSD() {
    this.writeShort(this.width);
    this.writeShort(this.height);
    this.out.push(0x70);
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

  /**
   * Spatial noise reduction pre-filter for high-resolution video frames
   * Smooths pixel variance to drastically increase LZW compression efficiency
   */
  static applySpatialSmoothing(pixels, width, height) {
    const output = new Uint8ClampedArray(pixels.length);
    output.set(pixels);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;

        // 3x3 Box average for R, G, B channels
        let r = 0, g = 0, b = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nIdx = ((y + dy) * width + (x + dx)) * 4;
            r += pixels[nIdx];
            g += pixels[nIdx + 1];
            b += pixels[nIdx + 2];
          }
        }

        output[idx] = Math.round(r / 9);
        output[idx + 1] = Math.round(g / 9);
        output[idx + 2] = Math.round(b / 9);
      }
    }
    return output;
  }

  addFrame(pixels, sampleInterval = 10, smoothFilter = false) {
    let processedPixels = pixels;
    if (smoothFilter) {
      processedPixels = GIFEncoder.applySpatialSmoothing(pixels, this.width, this.height);
    }

    const nq = new NeuQuant(processedPixels, sampleInterval, this.colorCount);
    nq.learn();
    nq.setUpArrays();

    const colorMap = nq.colorMap();
    const indexedPixels = new Uint8Array(this.width * this.height);

    let k = 0;
    for (let i = 0; i < processedPixels.length; i += 4) {
      let b = processedPixels[i];
      let g = processedPixels[i + 1];
      let r = processedPixels[i + 2];
      indexedPixels[k++] = nq.lookupRGB(b, g, r);
    }

    if (this.frames.length === 0 && this.repeat >= 0) {
      this.writeNetscapeAppExt();
    }

    this.writeGraphicCtrlExt();
    this.writeImageDesc();
    this.writeColorTable(colorMap);
    this.writePixels(indexedPixels);

    this.frames.push(true);
  }

  writeGraphicCtrlExt() {
    this.out.push(0x21);
    this.out.push(0xf9);
    this.out.push(4);
    this.out.push(0x04);
    this.writeShort(this.delay);
    this.out.push(0);
    this.out.push(0);
  }

  writeImageDesc() {
    this.out.push(0x2c);
    this.writeShort(0);
    this.writeShort(0);
    this.writeShort(this.width);
    this.writeShort(this.height);
    let tableSizeBits = Math.ceil(Math.log2(this.colorCount)) - 1;
    if (tableSizeBits < 0) tableSizeBits = 0;
    this.out.push(0x80 | tableSizeBits);
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

window.GIFEncoder = GIFEncoder;
