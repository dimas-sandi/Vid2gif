/**
 * Vid2GIF - Pure Client-side GIF Decoder Engine
 * Parses GIF89a/GIF87a binary files into array of canvas ImageData frames and frame delays.
 */
class GIFDecoder {
  constructor(arrayBuffer) {
    this.data = new Uint8Array(arrayBuffer);
    this.pos = 0;
    this.width = 0;
    this.height = 0;
    this.frames = [];
    this.gct = null;
    this.loopCount = 0;
  }

  readByte() {
    return this.data[this.pos++];
  }

  readShort() {
    const low = this.data[this.pos++];
    const high = this.data[this.pos++];
    return low | (high << 8);
  }

  readBytes(len) {
    const bytes = this.data.subarray(this.pos, this.pos + len);
    this.pos += len;
    return bytes;
  }

  readString(len) {
    let str = '';
    for (let i = 0; i < len; i++) {
      str += String.fromCharCode(this.readByte());
    }
    return str;
  }

  readColorTable(size) {
    const count = 1 << size;
    const colors = new Uint8Array(count * 3);
    for (let i = 0; i < count * 3; i++) {
      colors[i] = this.readByte();
    }
    return colors;
  }

  readSubBlocks() {
    const blocks = [];
    while (true) {
      const size = this.readByte();
      if (size === 0) break;
      blocks.push(this.readBytes(size));
    }
    return blocks;
  }

  decode() {
    const header = this.readString(6);
    if (header !== 'GIF87a' && header !== 'GIF89a') {
      throw new Error('File santer santer santer santer santer santer santer format GIF yang valid!');
    }

    this.width = this.readShort();
    this.height = this.readShort();

    const packed = this.readByte();
    const hasGCT = (packed & 0x80) !== 0;
    const gctSize = packed & 0x07;

    const bgIndex = this.readByte();
    const pixelAspect = this.readByte();

    if (hasGCT) {
      this.gct = this.readColorTable(gctSize + 1);
    }

    let gce = { delay: 10, transIndex: -1, disposal: 0 };
    let previousImageData = null;

    while (this.pos < this.data.length) {
      const b = this.readByte();
      if (b === 0x3b) {
        // GIF Trailer EOF
        break;
      }

      if (b === 0x21) {
        // Extension Introducer
        const label = this.readByte();
        if (label === 0xf9) {
          // Graphic Control Extension
          const blockSize = this.readByte(); // 4
          const gcePacked = this.readByte();
          const disposal = (gcePacked >> 2) & 0x07;
          const hasTrans = (gcePacked & 0x01) !== 0;
          const delay = this.readShort();
          const transIndex = this.readByte();
          this.readByte(); // block terminator (0)

          gce = {
            delay: delay > 0 ? delay * 10 : 100, // ms
            transIndex: hasTrans ? transIndex : -1,
            disposal: disposal
          };
        } else {
          // Other extension (App, Comment, etc.)
          this.readSubBlocks();
        }
      } else if (b === 0x2c) {
        // Image Descriptor
        const left = this.readShort();
        const top = this.readShort();
        const width = this.readShort();
        const height = this.readShort();

        const imgPacked = this.readByte();
        const hasLCT = (imgPacked & 0x80) !== 0;
        const lctSize = imgPacked & 0x07;

        let colorTable = this.gct;
        if (hasLCT) {
          colorTable = this.readColorTable(lctSize + 1);
        }

        const minCodeSize = this.readByte();
        const subBlocks = this.readSubBlocks();

        // Decompress LZW pixel indexes
        const indexedPixels = this.decompressLZW(minCodeSize, subBlocks, width * height);

        // Render frame RGBA onto canvas
        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = this.width;
        frameCanvas.height = this.height;
        const ctx = frameCanvas.getContext('2d');

        if (previousImageData && (gce.disposal === 1 || gce.disposal === 0)) {
          ctx.putImageData(previousImageData, 0, 0);
        }

        const imgData = ctx.getImageData(0, 0, this.width, this.height);
        const data = imgData.data;

        let ptr = 0;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const index = indexedPixels[ptr++];
            if (index !== gce.transIndex && colorTable) {
              const pixelX = left + x;
              const pixelY = top + y;
              if (pixelX < this.width && pixelY < this.height) {
                const i = (pixelY * this.width + pixelX) * 4;
                const ctIdx = index * 3;
                data[i] = colorTable[ctIdx];
                data[i + 1] = colorTable[ctIdx + 1];
                data[i + 2] = colorTable[ctIdx + 2];
                data[i + 3] = 255;
              }
            }
          }
        }

        ctx.putImageData(imgData, 0, 0);
        previousImageData = ctx.getImageData(0, 0, this.width, this.height);

        this.frames.push({
          canvas: frameCanvas,
          delay: gce.delay
        });

        // Reset GCE
        gce = { delay: 10, transIndex: -1, disposal: 0 };
      }
    }

    return {
      width: this.width,
      height: this.height,
      frames: this.frames
    };
  }

  decompressLZW(minCodeSize, subBlocks, expectedPixels) {
    let totalLen = 0;
    for (let i = 0; i < subBlocks.length; i++) {
      totalLen += subBlocks[i].length;
    }
    const compressed = new Uint8Array(totalLen);
    let offset = 0;
    for (let i = 0; i < subBlocks.length; i++) {
      compressed.set(subBlocks[i], offset);
      offset += subBlocks[i].length;
    }

    const clearCode = 1 << minCodeSize;
    const eofCode = clearCode + 1;

    let codeSize = minCodeSize + 1;
    let nextCode = eofCode + 1;

    const dictionary = new Array(4096);
    const dictLen = new Int32Array(4096);

    for (let i = 0; i < clearCode; i++) {
      dictionary[i] = [i];
      dictLen[i] = 1;
    }

    const output = new Uint8Array(expectedPixels);
    let outIdx = 0;

    let bitPos = 0;
    const getCode = () => {
      const bytePos = bitPos >> 3;
      const bitOffset = bitPos & 7;
      if (bytePos >= compressed.length) return eofCode;

      let code = compressed[bytePos] | (compressed[bytePos + 1] << 8) | (compressed[bytePos + 2] << 16);
      code = (code >> bitOffset) & ((1 << codeSize) - 1);
      bitPos += codeSize;
      return code;
    };

    let prevEntry = null;

    while (outIdx < expectedPixels) {
      const code = getCode();
      if (code === eofCode) break;

      if (code === clearCode) {
        codeSize = minCodeSize + 1;
        nextCode = eofCode + 1;
        prevEntry = null;
        continue;
      }

      let entry;
      if (code < nextCode) {
        entry = dictionary[code];
      } else if (code === nextCode && prevEntry) {
        entry = prevEntry.concat(prevEntry[0]);
      } else {
        break; // Corrupted GIF data
      }

      for (let i = 0; i < entry.length; i++) {
        if (outIdx < expectedPixels) {
          output[outIdx++] = entry[i];
        }
      }

      if (prevEntry && nextCode < 4096) {
        dictionary[nextCode++] = prevEntry.concat(entry[0]);
        if (nextCode === (1 << codeSize) && codeSize < 12) {
          codeSize++;
        }
      }

      prevEntry = entry;
    }

    return output;
  }
}

window.GIFDecoder = GIFDecoder;
