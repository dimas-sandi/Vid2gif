/**
 * Vid2GIF - Auto FPS & Photorealistic Color Calculator Engine (Fixed 240x240 HD)
 * Enforces rich 256/192/128 color palettes for smooth skin tones while dynamically tuning FPS.
 */
class TFTCalculator {
  /**
   * Calculate optimum FPS & color palette given duration and target size in KB for fixed 240x240 HD resolution.
   * @param {number} durationSec - Video clip duration in seconds.
   * @param {number} targetFps - User's desired FPS cap.
   * @param {number} targetSizeKb - Target max GIF file size in KB.
   * @returns {Object} Calculated parameters (resolution: 240, colors: 256/192/128, fps, totalFrames, estSizeKb, status)
   */
  static calculate(durationSec, targetFps, targetSizeKb) {
    const duration = Math.max(0.1, durationSec);
    const targetKb = Math.max(10, targetSizeKb);

    const res = 240;
    const pixelsPerFrame = 240 * 240;

    // Available FPS steps (down to 3 FPS for extreme duration limits)
    const fpsSteps = [24, 20, 18, 15, 12, 10, 8, 6, 5, 4, 3];
    // Rich color options strictly preserved (Never drop below 128 colors to keep skin tones smooth!)
    const colorOptions = [256, 192, 128];

    let bestFps = Math.min(24, Math.max(3, targetFps));
    let bestColors = 256;
    let bestEstKb = 0;
    let foundOptimal = false;

    const validFpsSteps = fpsSteps.filter((f) => f <= bestFps);
    if (validFpsSteps.length === 0) validFpsSteps.push(3);

    for (const fps of validFpsSteps) {
      const totalFrames = Math.max(1, Math.round(duration * fps));
      for (const colors of colorOptions) {
        const bitsPerPixel = Math.log2(colors);
        const estBytesPerFrame = (pixelsPerFrame * (bitsPerPixel / 8) * 0.38) + 45;
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
      bestFps = 3;
      bestColors = 128; // Strict floor: 128 colors minimum to protect faces/skin tones
      const totalFrames = Math.max(1, Math.round(duration * 3));
      const estBytesPerFrame = (pixelsPerFrame * (7 / 8) * 0.32) + 40;
      bestEstKb = (estBytesPerFrame * totalFrames + 1024) / 1024;
    }

    const totalFrames = Math.max(1, Math.round(duration * bestFps));

    let status = 'success';
    let statusMessage = `240x240 HD (${bestColors} Warna). FPS disesuaikan ke ${bestFps} FPS agar pas di bawah ${targetKb} KB!`;

    if (bestEstKb > targetKb) {
      status = 'exceeded';
      statusMessage = `Peringatan: Durasi video terlalu panjang untuk target ${targetKb} KB pada 240x240! Sistem akan menyesuaikan FPS otomatis.`;
    } else if (bestEstKb > targetKb * 0.85) {
      status = 'warning';
      statusMessage = `FPS disesuaikan ke ${bestFps} FPS untuk menjaga ukuran di bawah ${targetKb} KB (Palet 256 Warna HD Terjaga).`;
    }

    return {
      durationSec: duration,
      fps: bestFps,
      recommendedRes: 240,
      recommendedColors: bestColors,
      totalFrames: totalFrames,
      targetSizeKb: targetKb,
      estimatedSizeKb: Math.round(bestEstKb),
      status: status,
      statusMessage: statusMessage
    };
  }

  /**
   * Step-Down Helper for Fixed 240x240 HD Resolution
   * Reduces FPS while strictly preserving rich color depth (256/192/128 colors) for smooth skin tones.
   */
  static getNextLowerConfig(currentRes, currentColors, currentFps) {
    const fpsSteps = [24, 20, 18, 15, 12, 10, 8, 6, 5, 4, 3];
    const colorOptions = [256, 192, 128];

    let nextFps = currentFps;
    let nextColors = currentColors;

    // Step 1: Lower FPS first to preserve color palette
    const fpsIdx = fpsSteps.indexOf(currentFps);
    if (fpsIdx >= 0 && fpsIdx < fpsSteps.length - 1) {
      nextFps = fpsSteps[fpsIdx + 1];
      nextColors = 256;
      return { res: 240, colors: nextColors, fps: nextFps };
    }

    // Step 2: If FPS is already low, drop colors slightly (down to 192 or 128 minimum)
    const colorIdx = colorOptions.indexOf(currentColors);
    if (colorIdx >= 0 && colorIdx < colorOptions.length - 1) {
      nextColors = colorOptions[colorIdx + 1];
      return { res: 240, colors: nextColors, fps: nextFps };
    }

    if (currentFps > 3) {
      nextFps = Math.max(3, currentFps - 1);
      nextColors = 128;
      return { res: 240, colors: nextColors, fps: nextFps };
    }

    return { res: 240, colors: nextColors, fps: nextFps };
  }
}

window.TFTCalculator = TFTCalculator;
