/**
 * DMZ Eye Animator — Auto Calculator Engine (Fixed 240x240)
 * Calculates optimal FPS to fit target file size.
 */
class TFTCalculator {
  static calculate(durationSec, maxFps, targetSizeKb) {
    const duration = Math.max(0.1, durationSec);
    const targetKb = Math.max(10, targetSizeKb);
    const pixels = 240 * 240;

    // Try FPS from high to low until estimated size fits target
    const fpsSteps = [20, 18, 15, 12, 10, 8, 6, 5, 4, 3];
    const cap = Math.min(20, Math.max(3, maxFps));

    let bestFps = 3;
    let bestEst = 0;

    for (const fps of fpsSteps) {
      if (fps > cap) continue;
      const frames = Math.max(1, Math.round(duration * fps));
      // GIF cost estimate: ~1 byte/pixel (compressed) + overhead
      const estKb = (frames * pixels * 0.45 + 2048) / 1024;
      if (estKb <= targetKb * 0.92) {
        bestFps = fps;
        bestEst = estKb;
        break;
      }
      bestFps = fps;
      bestEst = estKb;
    }

    const totalFrames = Math.max(1, Math.round(duration * bestFps));

    let statusMessage;
    if (bestEst <= targetKb) {
      statusMessage = `${bestFps} FPS × ${totalFrames} frame ≈ ${Math.round(bestEst)} KB (muat di target ${targetKb} KB)`;
    } else {
      statusMessage = `${bestFps} FPS × ${totalFrames} frame ≈ ${Math.round(bestEst)} KB — mungkin melebihi ${targetKb} KB, FPS akan diturunkan otomatis.`;
    }

    return {
      fps: bestFps,
      colors: 256,
      totalFrames: totalFrames,
      estimatedSizeKb: Math.round(bestEst),
      statusMessage: statusMessage
    };
  }
}

window.TFTCalculator = TFTCalculator;
