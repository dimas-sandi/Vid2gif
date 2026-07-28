/**
 * Vid2GIF - Auto FPS & Compression Calculator Engine (Fixed 240x240 Native TFT)
 * Fixes resolution to 240x240 px and dynamically tunes FPS & palette colors to hit target size.
 */
class TFTCalculator {
  /**
   * Calculate optimum FPS & color palette given duration and target size in KB for fixed 240x240 resolution.
   * @param {number} durationSec - Video clip duration in seconds.
   * @param {number} targetFps - User's desired FPS.
   * @param {number} targetSizeKb - Target max GIF file size in KB.
   * @returns {Object} Calculated parameters (resolution: 240, colors, fps, totalFrames, estSizeKb, status)
   */
  static calculate(durationSec, targetFps, targetSizeKb) {
    const duration = Math.max(0.1, durationSec);
    const targetKb = Math.max(10, targetSizeKb);

    // FIXED NATIVE RESOLUTION FOR 1.28" TFT LCD
    const res = 240;
    const pixelsPerFrame = 240 * 240;

    // Available FPS steps (from high smooth 24 down to 5 FPS)
    const fpsSteps = [24, 20, 18, 15, 12, 10, 8, 6, 5];
    const colorOptions = [256, 192, 128, 96, 64, 48, 32];

    let bestFps = Math.min(24, Math.max(5, targetFps));
    let bestColors = 256;
    let bestEstKb = 0;
    let foundOptimal = false;

    // Start testing from user desired FPS down to 5 FPS
    const validFpsSteps = fpsSteps.filter((f) => f <= bestFps);
    if (validFpsSteps.length === 0) validFpsSteps.push(5);

    for (const fps of validFpsSteps) {
      const totalFrames = Math.max(1, Math.round(duration * fps));
      for (const colors of colorOptions) {
        const bitsPerPixel = Math.log2(colors);
        // Empirical LZW compression estimate at 240x240
        const estBytesPerFrame = (pixelsPerFrame * (bitsPerPixel / 8) * 0.36) + 40;
        const estTotalBytes = estBytesPerFrame * totalFrames + 1024;
        const estTotalKb = estTotalBytes / 1024;

        if (estTotalKb <= targetKb * 0.95) {
          bestFps = fps;
          bestColors = colors;
          bestEstKb = estTotalKb;
          foundOptimal = true;
          break;
        }
      }
      if (foundOptimal) break;
    }

    if (!foundOptimal) {
      bestFps = 5;
      bestColors = 32;
      const totalFrames = Math.max(1, Math.round(duration * 5));
      const estBytesPerFrame = (pixelsPerFrame * (5 / 8) * 0.30) + 40;
      bestEstKb = (estBytesPerFrame * totalFrames + 1024) / 1024;
    }

    const totalFrames = Math.max(1, Math.round(duration * bestFps));

    let status = 'success';
    let statusMessage = `Resolusi FIX 240x240 px. FPS disesuaikan ke ${bestFps} FPS agar pas di bawah ${targetKb} KB!`;

    if (bestEstKb > targetKb) {
      status = 'exceeded';
      statusMessage = `Peringatan: Durasi video terlalu panjang untuk target ${targetKb} KB pada 240x240! Sistem akan meminimalkan FPS & warna otomatis.`;
    } else if (bestEstKb > targetKb * 0.85) {
      status = 'warning';
      statusMessage = `FPS disesuaikan ke ${bestFps} FPS untuk menjaga ukuran di bawah ${targetKb} KB.`;
    }

    return {
      durationSec: duration,
      fps: bestFps,
      recommendedRes: 240, // STRICTLY FIXED TO 240
      recommendedColors: bestColors,
      totalFrames: totalFrames,
      targetSizeKb: targetKb,
      estimatedSizeKb: Math.round(bestEstKb),
      status: status,
      statusMessage: statusMessage
    };
  }

  /**
   * Smart Step-Down Helper for Fixed 240x240 Resolution
   * Tunes FPS and colors down while strictly maintaining 240x240 resolution.
   */
  static getNextLowerConfig(currentRes, currentColors, currentFps) {
    const fpsSteps = [24, 20, 18, 15, 12, 10, 8, 6, 5];
    const colorOptions = [256, 192, 128, 96, 64, 48, 32];

    let nextFps = currentFps;
    let nextColors = currentColors;

    // Step 1: Lower colors
    const colorIdx = colorOptions.indexOf(currentColors);
    if (colorIdx >= 0 && colorIdx < colorOptions.length - 1) {
      nextColors = colorOptions[colorIdx + 1];
      return { res: 240, colors: nextColors, fps: nextFps };
    }

    // Step 2: Lower FPS and reset colors to 128
    const fpsIdx = fpsSteps.indexOf(currentFps);
    if (fpsIdx >= 0 && fpsIdx < fpsSteps.length - 1) {
      nextFps = fpsSteps[fpsIdx + 1];
      nextColors = 128;
      return { res: 240, colors: nextColors, fps: nextFps };
    } else if (currentFps > 5) {
      nextFps = Math.max(5, currentFps - 2);
      nextColors = 64;
      return { res: 240, colors: nextColors, fps: nextFps };
    }

    return { res: 240, colors: nextColors, fps: nextFps };
  }
}

window.TFTCalculator = TFTCalculator;
