/**
 * Vid2GIF - Auto Resolution & Compression Calculator Engine
 * Calculates optimum export resolution, palette size, and memory constraints for 1.28" TFT display.
 */
class TFTCalculator {
  /**
   * Calculate optimum GIF configuration given duration, target FPS, and target size in KB.
   * @param {number} durationSec - Video clip duration in seconds.
   * @param {number} targetFps - Desired frames per second.
   * @param {number} targetSizeKb - Target max GIF file size in KB.
   * @returns {Object} Calculated parameters (resolution, colors, totalFrames, estSizeKb, status)
   */
  static calculate(durationSec, targetFps, targetSizeKb) {
    const duration = Math.max(0.1, durationSec);
    const fps = Math.max(1, Math.min(30, targetFps));
    const targetKb = Math.max(10, targetSizeKb);

    const totalFrames = Math.max(1, Math.round(duration * fps));
    const targetBytes = targetKb * 1024;
    const maxBytesPerFrame = targetBytes / totalFrames;

    // Available target resolutions for 1.28" TFT display (native 240x240 down to 96x96)
    const resolutions = [240, 200, 180, 160, 140, 120, 96];
    const colorOptions = [256, 128, 64, 32];

    let bestRes = 240;
    let bestColors = 256;
    let bestEstKb = 0;
    let foundOptimal = false;

    // Loop through resolutions and colors from best quality to smallest
    for (const res of resolutions) {
      for (const colors of colorOptions) {
        // Estimated compressed GIF bytes per frame based on area and color count
        // Baseline empirical multiplier: ~0.18 - 0.28 bytes/pixel at 256 colors with LZW
        const pixelsPerFrame = res * res;
        const bitsPerPixel = Math.log2(colors);
        const estBytesPerFrame = (pixelsPerFrame * (bitsPerPixel / 8) * 0.35) + 32;
        const estTotalBytes = estBytesPerFrame * totalFrames + 800; // 800 bytes GIF header & palette metadata
        const estTotalKb = estTotalBytes / 1024;

        if (estTotalKb <= targetKb) {
          bestRes = res;
          bestColors = colors;
          bestEstKb = estTotalKb;
          foundOptimal = true;
          break;
        }
      }
      if (foundOptimal) break;
    }

    // If even smallest setting exceeds target KB, select lowest settings with warning status
    if (!foundOptimal) {
      bestRes = 96;
      bestColors = 32;
      const pixelsPerFrame = 96 * 96;
      const estBytesPerFrame = (pixelsPerFrame * (5 / 8) * 0.30) + 32;
      bestEstKb = (estBytesPerFrame * totalFrames + 800) / 1024;
    }

    let status = 'success'; // 'success', 'warning', or 'exceeded'
    let statusMessage = 'Ukuran GIF pas dengan target!';

    if (bestEstKb > targetKb) {
      status = 'exceeded';
      statusMessage = `Peringatan: Durasi/FPS terlalu tinggi untuk target ${targetKb} KB! Target minimum ~${Math.ceil(bestEstKb)} KB.`;
    } else if (bestEstKb > targetKb * 0.85) {
      status = 'warning';
      statusMessage = 'Perkiraan ukuran mendekati batas target.';
    }

    return {
      durationSec: duration,
      fps: fps,
      totalFrames: totalFrames,
      targetSizeKb: targetKb,
      recommendedRes: bestRes,
      recommendedColors: bestColors,
      estimatedSizeKb: Math.round(bestEstKb),
      maxBytesPerFrame: Math.round(maxBytesPerFrame),
      status: status,
      statusMessage: statusMessage
    };
  }
}

window.TFTCalculator = TFTCalculator;
