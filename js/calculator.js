/**
 * Vid2GIF - Smart Auto Resolution & Compression Calculator Engine
 * Calculates optimum export resolution, palette size, and memory constraints for 1.28" TFT display.
 * Includes conservative entropy modeling for high-resolution & high-detail videos.
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

    // Available target resolutions for 1.28" TFT display (native 240x240 down to 64x64)
    const resolutions = [240, 220, 200, 180, 160, 140, 120, 96, 80, 64];
    const colorOptions = [256, 192, 128, 96, 64, 48, 32, 16];

    let bestRes = 240;
    let bestColors = 256;
    let bestEstKb = 0;
    let foundOptimal = false;

    // Loop through resolutions and colors from best quality to smallest
    for (const res of resolutions) {
      for (const colors of colorOptions) {
        // High-res video frame entropy model:
        // LZW compression efficiency drops on detailed content, requiring conservative byte estimation
        const pixelsPerFrame = res * res;
        const bitsPerPixel = Math.log2(colors);
        const estBytesPerFrame = (pixelsPerFrame * (bitsPerPixel / 8) * 0.42) + 48;
        const estTotalBytes = estBytesPerFrame * totalFrames + 1024; // 1KB GIF header & metadata
        const estTotalKb = estTotalBytes / 1024;

        if (estTotalKb <= targetKb * 0.92) { // 92% safety margin for strict enforcement
          bestRes = res;
          bestColors = colors;
          bestEstKb = estTotalKb;
          foundOptimal = true;
          break;
        }
      }
      if (foundOptimal) break;
    }

    if (!foundOptimal) {
      bestRes = 64;
      bestColors = 16;
      const pixelsPerFrame = 64 * 64;
      const estBytesPerFrame = (pixelsPerFrame * 0.25) + 32;
      bestEstKb = (estBytesPerFrame * totalFrames + 1024) / 1024;
    }

    let status = 'success'; // 'success', 'warning', or 'exceeded'
    let statusMessage = 'Smart Engine: Ukuran diperkirakan pas di bawah target!';

    if (bestEstKb > targetKb) {
      status = 'exceeded';
      statusMessage = `Peringatan: Durasi/FPS terlalu tinggi untuk target ${targetKb} KB! Smart Engine akan menurunkan FPS/resolusi secara otomatis agar dipastikan muat.`;
    } else if (bestEstKb > targetKb * 0.85) {
      status = 'warning';
      statusMessage = 'Perkiraan mendekati batas target (Smart Auto-Fit akan menjaga agar tidak melebihi).';
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

  /**
   * Smart Step-Down Helper for Multi-pass Encoding
   * Returns the next lower quality configuration if an encoding attempt exceeded the target size.
   */
  static getNextLowerConfig(currentRes, currentColors, currentFps) {
    const resolutions = [240, 220, 200, 180, 160, 140, 120, 96, 80, 64];
    const colorOptions = [256, 192, 128, 96, 64, 48, 32, 16];

    let nextColors = currentColors;
    let nextRes = currentRes;
    let nextFps = currentFps;

    // Step 1: Reduce colors first
    const colorIdx = colorOptions.indexOf(currentColors);
    if (colorIdx >= 0 && colorIdx < colorOptions.length - 1) {
      nextColors = colorOptions[colorIdx + 1];
      return { res: nextRes, colors: nextColors, fps: nextFps };
    }

    // Step 2: If colors already low, drop resolution and reset colors to 128
    const resIdx = resolutions.indexOf(currentRes);
    if (resIdx >= 0 && resIdx < resolutions.length - 1) {
      nextRes = resolutions[resIdx + 1];
      nextColors = 128;
      return { res: nextRes, colors: nextColors, fps: nextFps };
    }

    // Step 3: Reduce FPS if resolution already very low
    if (nextFps > 5) {
      nextFps = Math.max(5, nextFps - 2);
      nextRes = 160;
      nextColors = 128;
      return { res: nextRes, colors: nextColors, fps: nextFps };
    }

    return { res: nextRes, colors: nextColors, fps: nextFps };
  }
}

window.TFTCalculator = TFTCalculator;
