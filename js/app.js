/**
 * Vid2GIF - Main Application Controller
 * Handles Navigation Tabs, Video-to-GIF converter, and GIF Resizer & Optimizer engines.
 */
document.addEventListener('DOMContentLoaded', () => {

  // --- Navigation Tab Switching ---
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;

      tabBtns.forEach((b) => b.classList.remove('active'));
      tabContents.forEach((c) => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(targetTab).classList.add('active');
    });
  });

  // ================= TAB 1: VIDEO TO GIF =================
  const dropzone = document.getElementById('dropzone');
  const videoInput = document.getElementById('video-input');
  const workspace = document.getElementById('workspace');
  const sourceVideo = document.getElementById('source-video');
  const cropperCanvas = document.getElementById('cropper-canvas');

  const zoomSlider = document.getElementById('zoom-slider');
  const zoomValue = document.getElementById('zoom-value');
  const btnCenterCrop = document.getElementById('btn-center-crop');
  const btnResetCrop = document.getElementById('btn-reset-crop');
  const btnMaskRound = document.getElementById('btn-mask-round');
  const btnMaskSquare = document.getElementById('btn-mask-square');

  const btnPlayVideo = document.getElementById('btn-play-video');
  const trimStartInput = document.getElementById('trim-start');
  const trimEndInput = document.getElementById('trim-end');
  const clipDurationLabel = document.getElementById('clip-duration');
  const videoDurBadge = document.getElementById('video-dur-badge');

  const targetSizeInput = document.getElementById('target-size-kb');
  const targetFpsSlider = document.getElementById('target-fps');
  const fpsDisplay = document.getElementById('fps-display');
  const presetBtns = document.querySelectorAll('.preset-btn');

  const calcStatusTag = document.getElementById('calc-status-tag');
  const calcRes = document.getElementById('calc-res');
  const calcTotalFrames = document.getElementById('calc-total-frames');
  const calcColors = document.getElementById('calc-colors');
  const calcEstSize = document.getElementById('calc-est-size');
  const calcMessage = document.getElementById('calc-message');

  const chkManualOverride = document.getElementById('chk-manual-override');
  const manualControls = document.getElementById('manual-controls');
  const manualRes = document.getElementById('manual-res');
  const manualColors = document.getElementById('manual-colors');

  const btnGenerateGif = document.getElementById('btn-generate-gif');
  const progressContainer = document.getElementById('progress-container');
  const progressStatusText = document.getElementById('progress-status-text');
  const progressPercent = document.getElementById('progress-percent');
  const progressBarFill = document.getElementById('progress-bar-fill');

  const resultCard = document.getElementById('result-card');
  const gifResultImg = document.getElementById('gif-result-img');
  const resultSizeBadge = document.getElementById('result-size-badge');
  const resFinalSize = document.getElementById('res-final-size');
  const resFinalResolution = document.getElementById('res-final-resolution');
  const resFinalDiff = document.getElementById('res-final-diff');
  const btnDownloadGif = document.getElementById('btn-download-gif');
  const btnToggleCArray = document.getElementById('btn-toggle-carray');
  const carrayContainer = document.getElementById('carray-container');
  const carrayText = document.getElementById('carray-text');
  const btnCopyCArray = document.getElementById('btn-copy-carray');

  const renderCanvas = document.getElementById('render-canvas');

  let videoCropper = new VideoCropper(cropperCanvas, sourceVideo);
  let currentVideoCalc = null;
  let currentVideoGifBytes = null;

  videoCropper.onTransformChange = () => {
    zoomSlider.value = videoCropper.zoom;
    zoomValue.textContent = `${videoCropper.zoom.toFixed(1)}x`;
  };

  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault(); dropzone.classList.remove('dragover');
    if (e.dataTransfer.files?.length > 0) loadVideoFile(e.dataTransfer.files[0]);
  });

  videoInput.addEventListener('change', (e) => {
    if (e.target.files?.length > 0) loadVideoFile(e.target.files[0]);
  });

  function loadVideoFile(file) {
    if (!file.type.startsWith('video/')) {
      alert('Mohon pilih file video yang valid (MP4, WebM, MOV).');
      return;
    }

    const url = URL.createObjectURL(file);
    sourceVideo.src = url;
    sourceVideo.load();

    sourceVideo.onloadedmetadata = () => {
      dropzone.classList.add('hidden');
      workspace.classList.remove('hidden');
      btnGenerateGif.disabled = false;

      const dur = sourceVideo.duration;
      videoDurBadge.textContent = `Total Durasi: ${dur.toFixed(1)}s`;

      trimStartInput.max = dur;
      trimEndInput.max = dur;
      trimStartInput.value = '0.0';
      trimEndInput.value = Math.min(3.0, dur).toFixed(1);

      videoCropper.resetTransform();
      videoCropper.startRenderLoop();

      updateClipDuration();
    };
  }

  btnPlayVideo.addEventListener('click', () => {
    if (sourceVideo.paused) {
      sourceVideo.currentTime = parseFloat(trimStartInput.value) || 0;
      sourceVideo.play();
      btnPlayVideo.innerHTML = '<i class="fa-solid fa-pause"></i> Pause';
    } else {
      sourceVideo.pause();
      btnPlayVideo.innerHTML = '<i class="fa-solid fa-play"></i> Play';
    }
  });

  sourceVideo.addEventListener('timeupdate', () => {
    const endT = parseFloat(trimEndInput.value) || sourceVideo.duration;
    if (sourceVideo.currentTime >= endT) {
      sourceVideo.pause();
      sourceVideo.currentTime = parseFloat(trimStartInput.value) || 0;
      btnPlayVideo.innerHTML = '<i class="fa-solid fa-play"></i> Play';
    }
  });

  trimStartInput.addEventListener('input', updateClipDuration);
  trimEndInput.addEventListener('input', updateClipDuration);

  function updateClipDuration() {
    let start = parseFloat(trimStartInput.value) || 0;
    let end = parseFloat(trimEndInput.value) || sourceVideo.duration;

    if (start < 0) start = 0;
    if (end > sourceVideo.duration) end = sourceVideo.duration;
    if (start >= end) start = Math.max(0, end - 0.5);

    trimStartInput.value = start.toFixed(1);
    trimEndInput.value = end.toFixed(1);

    const clipDur = end - start;
    clipDurationLabel.textContent = `${clipDur.toFixed(1)}s`;

    runVideoCalculator();
  }

  zoomSlider.addEventListener('input', (e) => videoCropper.setZoom(parseFloat(e.target.value)));
  btnCenterCrop.addEventListener('click', () => videoCropper.centerCrop());
  btnResetCrop.addEventListener('click', () => videoCropper.resetTransform());

  btnMaskRound.addEventListener('click', () => {
    btnMaskRound.classList.add('active'); btnMaskSquare.classList.remove('active');
    videoCropper.setMaskMode('round');
  });

  btnMaskSquare.addEventListener('click', () => {
    btnMaskSquare.classList.add('active'); btnMaskRound.classList.remove('active');
    videoCropper.setMaskMode('square');
  });

  targetSizeInput.addEventListener('input', runVideoCalculator);
  targetFpsSlider.addEventListener('input', (e) => {
    fpsDisplay.textContent = `${e.target.value} FPS`;
    runVideoCalculator();
  });

  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      presetBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      targetSizeInput.value = btn.dataset.size;
      runVideoCalculator();
    });
  });

  chkManualOverride.addEventListener('change', () => {
    manualControls.classList.toggle('hidden', !chkManualOverride.checked);
    runVideoCalculator();
  });

  manualRes.addEventListener('change', runVideoCalculator);
  manualColors.addEventListener('change', runVideoCalculator);

  function runVideoCalculator() {
    const start = parseFloat(trimStartInput.value) || 0;
    const end = parseFloat(trimEndInput.value) || sourceVideo.duration || 3;
    const duration = Math.max(0.1, end - start);
    const fps = parseInt(targetFpsSlider.value, 10);
    const targetKb = parseInt(targetSizeInput.value, 10) || 500;

    const calc = TFTCalculator.calculate(duration, fps, targetKb);
    currentVideoCalc = calc;

    let exportRes = calc.recommendedRes;
    let exportColors = calc.recommendedColors;

    if (chkManualOverride.checked) {
      exportRes = parseInt(manualRes.value, 10);
      exportColors = parseInt(manualColors.value, 10);
    }

    calcRes.textContent = `${exportRes} x ${exportRes} px`;
    calcTotalFrames.textContent = `${calc.totalFrames} Frames`;
    calcColors.textContent = `${exportColors} Warna`;
    calcEstSize.textContent = `~${calc.estimatedSizeKb} KB`;
    calcMessage.textContent = calc.statusMessage;

    calcStatusTag.className = 'status-badge';
    if (calc.status === 'success') {
      calcStatusTag.classList.add('status-success');
      calcStatusTag.textContent = 'Optimal';
    } else if (calc.status === 'warning') {
      calcStatusTag.classList.add('status-warning');
      calcStatusTag.textContent = 'Mendekati Batas';
    } else {
      calcStatusTag.classList.add('status-exceeded');
      calcStatusTag.textContent = 'Saran: Kurangi FPS';
    }
  }

  btnGenerateGif.addEventListener('click', async () => {
    if (!sourceVideo || sourceVideo.readyState < 2) return;

    btnGenerateGif.disabled = true;
    progressContainer.classList.remove('hidden');
    resultCard.classList.add('hidden');

    sourceVideo.pause();

    const startT = parseFloat(trimStartInput.value) || 0;
    const endT = parseFloat(trimEndInput.value) || sourceVideo.duration;
    const duration = Math.max(0.1, endT - startT);
    const fps = parseInt(targetFpsSlider.value, 10);
    const frameInterval = 1 / fps;
    const totalFrames = Math.max(1, Math.round(duration * fps));

    let exportRes = currentVideoCalc.recommendedRes;
    let exportColors = currentVideoCalc.recommendedColors;

    if (chkManualOverride.checked) {
      exportRes = parseInt(manualRes.value, 10);
      exportColors = parseInt(manualColors.value, 10);
    }

    renderCanvas.width = exportRes;
    renderCanvas.height = exportRes;
    const renderCtx = renderCanvas.getContext('2d');

    const encoder = new GIFEncoder(exportRes, exportRes);
    encoder.setDelay(1000 / fps);
    encoder.setColorCount(exportColors);
    encoder.start();

    for (let i = 0; i < totalFrames; i++) {
      const currentTime = startT + i * frameInterval;
      await seekVideoTo(sourceVideo, currentTime);

      videoCropper.exportFrameToCanvas(renderCanvas);

      const imgData = renderCtx.getImageData(0, 0, exportRes, exportRes);
      encoder.addFrame(imgData.data, 10);

      const percent = Math.round(((i + 1) / totalFrames) * 100);
      progressPercent.textContent = `${percent}%`;
      progressBarFill.style.width = `${percent}%`;
      progressStatusText.textContent = `Memproses frame ${i + 1} / ${totalFrames}...`;

      await new Promise((r) => setTimeout(r, 10));
    }

    progressStatusText.textContent = 'Membuat stream file GIF...';
    await new Promise((r) => setTimeout(r, 20));

    const gifBuffer = encoder.finish();
    currentVideoGifBytes = gifBuffer;

    const blob = new Blob([gifBuffer], { type: 'image/gif' });
    const gifUrl = URL.createObjectURL(blob);

    gifResultImg.src = gifUrl;
    btnDownloadGif.href = gifUrl;

    const finalSizeKb = Math.round(gifBuffer.length / 1024);
    resultSizeBadge.textContent = `${finalSizeKb} KB`;
    resFinalSize.textContent = `${finalSizeKb} KB (${gifBuffer.length.toLocaleString()} bytes)`;
    resFinalResolution.textContent = `${exportRes} x ${exportRes} px @ ${fps} FPS`;

    const targetKb = parseInt(targetSizeInput.value, 10) || 500;
    const diff = targetKb - finalSizeKb;
    resFinalDiff.className = diff >= 0 ? 'badge badge-success' : 'badge status-exceeded';
    resFinalDiff.textContent = diff >= 0 ? `Aman (-${diff} KB dari target)` : `Melebihi target (+${Math.abs(diff)} KB)`;

    progressContainer.classList.add('hidden');
    resultCard.classList.remove('hidden');
    btnGenerateGif.disabled = false;

    resultCard.scrollIntoView({ behavior: 'smooth' });
  });

  function seekVideoTo(video, time) {
    return new Promise((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      video.addEventListener('seeked', onSeeked);
      video.currentTime = time;
    });
  }

  btnToggleCArray.addEventListener('click', () => {
    if (!currentVideoGifBytes) return;
    carrayContainer.classList.toggle('hidden');
    if (!carrayContainer.classList.contains('hidden')) generateCArrayCode(currentVideoGifBytes, carrayText, manualRes.value);
  });

  btnCopyCArray.addEventListener('click', () => copyToClipboard(carrayText, btnCopyCArray));

  // ================= TAB 2: GIF RESIZER & OPTIMIZER =================
  const gifDropzone = document.getElementById('gif-dropzone');
  const gifFileInput = document.getElementById('gif-file-input');
  const gifWorkspace = document.getElementById('gif-workspace');
  const gifCropperCanvas = document.getElementById('gif-cropper-canvas');

  const gifZoomSlider = document.getElementById('gif-zoom-slider');
  const gifZoomValue = document.getElementById('gif-zoom-value');
  const gifBtnCenter = document.getElementById('gif-btn-center');
  const gifBtnReset = document.getElementById('gif-btn-reset');
  const gifBtnMaskRound = document.getElementById('gif-btn-mask-round');
  const gifBtnMaskSquare = document.getElementById('gif-btn-mask-square');

  const gifOrigSizeBadge = document.getElementById('gif-orig-size-badge');
  const gifOrigDim = document.getElementById('gif-orig-dim');
  const gifOrigFrames = document.getElementById('gif-orig-frames');

  const gifTargetKbInput = document.getElementById('gif-target-kb');
  const gifTargetFpsSlider = document.getElementById('gif-target-fps');
  const gifFpsDisplay = document.getElementById('gif-fps-display');
  const gifPresetBtns = document.querySelectorAll('.gif-preset-btn');

  const gifCalcStatusTag = document.getElementById('gif-calc-status-tag');
  const gifCalcRes = document.getElementById('gif-calc-res');
  const gifCalcFrames = document.getElementById('gif-calc-frames');
  const gifCalcColors = document.getElementById('gif-calc-colors');
  const gifCalcEstSize = document.getElementById('gif-calc-est-size');
  const gifCalcMessage = document.getElementById('gif-calc-message');

  const btnResizeGif = document.getElementById('btn-resize-gif');
  const gifProgressContainer = document.getElementById('gif-progress-container');
  const gifProgressStatusText = document.getElementById('gif-progress-status-text');
  const gifProgressPercent = document.getElementById('gif-progress-percent');
  const gifProgressBarFill = document.getElementById('gif-progress-bar-fill');

  const gifResultCard = document.getElementById('gif-result-card');
  const gifResizedImg = document.getElementById('gif-resized-img');
  const gifResultSizeBadge = document.getElementById('gif-result-size-badge');
  const gifFinalSize = document.getElementById('gif-final-size');
  const gifFinalResolution = document.getElementById('gif-final-resolution');
  const gifFinalDiff = document.getElementById('gif-final-diff');
  const btnDownloadResizedGif = document.getElementById('btn-download-resized-gif');
  const btnToggleGifCArray = document.getElementById('btn-toggle-gif-carray');
  const gifCArrayContainer = document.getElementById('gif-carray-container');
  const gifCArrayText = document.getElementById('gif-carray-text');
  const btnCopyGifCArray = document.getElementById('btn-copy-gif-carray');

  // GIF Resizer State
  let decodedGifData = null; // { width, height, frames: [{canvas, delay}] }
  let gifOriginalFileBytes = 0;
  let gifCurrentCalc = null;
  let gifResizedBytes = null;
  let gifPlaybackIdx = 0;
  let gifPlaybackTimer = null;

  // Mock video wrapper so VideoCropper works seamlessly on decoded GIF frames!
  const mockGifVideo = {
    videoWidth: 240,
    videoHeight: 240,
    readyState: 4
  };

  let gifCropper = new VideoCropper(gifCropperCanvas, mockGifVideo);
  gifCropper.onTransformChange = () => {
    gifZoomSlider.value = gifCropper.zoom;
    gifZoomValue.textContent = `${gifCropper.zoom.toFixed(1)}x`;
  };

  gifDropzone.addEventListener('dragover', (e) => { e.preventDefault(); gifDropzone.classList.add('dragover'); });
  gifDropzone.addEventListener('dragleave', () => gifDropzone.classList.remove('dragover'));
  gifDropzone.addEventListener('drop', (e) => {
    e.preventDefault(); gifDropzone.classList.remove('dragover');
    if (e.dataTransfer.files?.length > 0) loadGifFile(e.dataTransfer.files[0]);
  });

  gifFileInput.addEventListener('change', (e) => {
    if (e.target.files?.length > 0) loadGifFile(e.target.files[0]);
  });

  async function loadGifFile(file) {
    if (!file.name.toLowerCase().endsWith('.gif')) {
      alert('Mohon pilih file animasi GIF (.gif) yang valid.');
      return;
    }

    gifOriginalFileBytes = file.size;
    const arrayBuffer = await file.arrayBuffer();

    try {
      const decoder = new GIFDecoder(arrayBuffer);
      decodedGifData = decoder.decode();

      if (!decodedGifData.frames || decodedGifData.frames.length === 0) {
        throw new Error('Gagal membaca frame animasi GIF!');
      }

      mockGifVideo.videoWidth = decodedGifData.width;
      mockGifVideo.videoHeight = decodedGifData.height;

      gifOrigDim.textContent = `${decodedGifData.width} x ${decodedGifData.height} px`;
      gifOrigFrames.textContent = `${decodedGifData.frames.length} Frame`;
      gifOrigSizeBadge.textContent = `${Math.round(file.size / 1024)} KB`;

      gifDropzone.classList.add('hidden');
      gifWorkspace.classList.remove('hidden');
      btnResizeGif.disabled = false;

      gifCropper.resetTransform();
      startGifPlaybackLoop();
      runGifResizerCalculator();

    } catch (err) {
      alert('Gagal mendecode GIF: ' + err.message);
    }
  }

  function startGifPlaybackLoop() {
    if (gifPlaybackTimer) clearInterval(gifPlaybackTimer);
    if (!decodedGifData || decodedGifData.frames.length === 0) return;

    gifPlaybackIdx = 0;
    const playNext = () => {
      const frame = decodedGifData.frames[gifPlaybackIdx];
      // Inject frame canvas into cropper video draw source
      gifCropper.video = frame.canvas;
      gifCropper.render();

      gifPlaybackIdx = (gifPlaybackIdx + 1) % decodedGifData.frames.length;
    };

    playNext();
    gifPlaybackTimer = setInterval(playNext, 100);
  }

  gifZoomSlider.addEventListener('input', (e) => gifCropper.setZoom(parseFloat(e.target.value)));
  gifBtnCenter.addEventListener('click', () => gifCropper.centerCrop());
  gifBtnReset.addEventListener('click', () => gifCropper.resetTransform());

  gifBtnMaskRound.addEventListener('click', () => {
    gifBtnMaskRound.classList.add('active'); gifBtnMaskSquare.classList.remove('active');
    gifCropper.setMaskMode('round');
  });

  gifBtnMaskSquare.addEventListener('click', () => {
    gifBtnMaskSquare.classList.add('active'); gifBtnMaskRound.classList.remove('active');
    gifCropper.setMaskMode('square');
  });

  gifTargetKbInput.addEventListener('input', runGifResizerCalculator);
  gifTargetFpsSlider.addEventListener('input', (e) => {
    gifFpsDisplay.textContent = `${e.target.value} FPS`;
    runGifResizerCalculator();
  });

  gifPresetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      gifPresetBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      gifTargetKbInput.value = btn.dataset.size;
      runGifResizerCalculator();
    });
  });

  function runGifResizerCalculator() {
    if (!decodedGifData) return;

    // Calculate original total duration from frame delays
    let totalDurMs = 0;
    decodedGifData.frames.forEach((f) => totalDurMs += (f.delay || 100));
    const durationSec = Math.max(0.2, totalDurMs / 1000);

    const fps = parseInt(gifTargetFpsSlider.value, 10);
    const targetKb = parseInt(gifTargetKbInput.value, 10) || 400;

    const calc = TFTCalculator.calculate(durationSec, fps, targetKb);
    gifCurrentCalc = calc;

    gifCalcRes.textContent = `${calc.recommendedRes} x ${calc.recommendedRes} px`;
    gifCalcFrames.textContent = `${calc.totalFrames} Frames`;
    gifCalcColors.textContent = `${calc.recommendedColors} Warna`;
    gifCalcEstSize.textContent = `~${calc.estimatedSizeKb} KB`;
    gifCalcMessage.textContent = calc.statusMessage;

    gifCalcStatusTag.className = 'status-badge';
    if (calc.status === 'success') {
      gifCalcStatusTag.classList.add('status-success');
      gifCalcStatusTag.textContent = 'Optimal';
    } else if (calc.status === 'warning') {
      gifCalcStatusTag.classList.add('status-warning');
      gifCalcStatusTag.textContent = 'Mendekati Batas';
    } else {
      gifCalcStatusTag.classList.add('status-exceeded');
      gifCalcStatusTag.textContent = 'Saran: Kurangi FPS';
    }
  }

  // --- Process & Resize GIF ---
  btnResizeGif.addEventListener('click', async () => {
    if (!decodedGifData) return;

    btnResizeGif.disabled = true;
    gifProgressContainer.classList.remove('hidden');
    gifResultCard.classList.add('hidden');

    const exportRes = gifCurrentCalc.recommendedRes;
    const exportColors = gifCurrentCalc.recommendedColors;
    const targetFps = parseInt(gifTargetFpsSlider.value, 10);

    renderCanvas.width = exportRes;
    renderCanvas.height = exportRes;
    const renderCtx = renderCanvas.getContext('2d');

    const encoder = new GIFEncoder(exportRes, exportRes);
    encoder.setDelay(1000 / targetFps);
    encoder.setColorCount(exportColors);
    encoder.start();

    // Frame Subsampling: Map source GIF frames to target FPS rate
    const sourceFrames = decodedGifData.frames;
    let totalDurMs = 0;
    sourceFrames.forEach((f) => totalDurMs += (f.delay || 100));
    const totalDurationSec = totalDurMs / 1000;
    const targetFrameCount = Math.max(1, Math.round(totalDurationSec * targetFps));

    for (let i = 0; i < targetFrameCount; i++) {
      // Pick corresponding source frame
      const progress = i / targetFrameCount;
      const sourceIdx = Math.min(sourceFrames.length - 1, Math.floor(progress * sourceFrames.length));

      const srcFrame = sourceFrames[sourceIdx];
      gifCropper.video = srcFrame.canvas;

      gifCropper.exportFrameToCanvas(renderCanvas);

      const imgData = renderCtx.getImageData(0, 0, exportRes, exportRes);
      encoder.addFrame(imgData.data, 10);

      const percent = Math.round(((i + 1) / targetFrameCount) * 100);
      gifProgressPercent.textContent = `${percent}%`;
      gifProgressBarFill.style.width = `${percent}%`;
      gifProgressStatusText.textContent = `Memproses frame ${i + 1} / ${targetFrameCount}...`;

      await new Promise((r) => setTimeout(r, 10));
    }

    gifProgressStatusText.textContent = 'Mengompresi file GIF...';
    await new Promise((r) => setTimeout(r, 20));

    const gifBuffer = encoder.finish();
    gifResizedBytes = gifBuffer;

    const blob = new Blob([gifBuffer], { type: 'image/gif' });
    const gifUrl = URL.createObjectURL(blob);

    gifResizedImg.src = gifUrl;
    btnDownloadResizedGif.href = gifUrl;

    const finalSizeKb = Math.round(gifBuffer.length / 1024);
    gifResultSizeBadge.textContent = `${finalSizeKb} KB`;
    gifFinalSize.textContent = `${finalSizeKb} KB (${gifBuffer.length.toLocaleString()} bytes)`;
    gifFinalResolution.textContent = `${exportRes} x ${exportRes} px @ ${targetFps} FPS`;

    const targetKb = parseInt(gifTargetKbInput.value, 10) || 400;
    const diff = targetKb - finalSizeKb;
    gifFinalDiff.className = diff >= 0 ? 'badge badge-success' : 'badge status-exceeded';
    gifFinalDiff.textContent = diff >= 0 ? `Aman (-${diff} KB dari target)` : `Melebihi target (+${Math.abs(diff)} KB)`;

    gifProgressContainer.classList.add('hidden');
    gifResultCard.classList.remove('hidden');
    btnResizeGif.disabled = false;

    gifResultCard.scrollIntoView({ behavior: 'smooth' });
  });

  btnToggleGifCArray.addEventListener('click', () => {
    if (!gifResizedBytes) return;
    gifCArrayContainer.classList.toggle('hidden');
    if (!gifCArrayContainer.classList.contains('hidden')) generateCArrayCode(gifResizedBytes, gifCArrayText, gifCurrentCalc.recommendedRes);
  });

  btnCopyGifCArray.addEventListener('click', () => copyToClipboard(gifCArrayText, btnCopyGifCArray));

  // Helper Functions
  function generateCArrayCode(bytes, targetTextarea, resolution) {
    let code = `// Vid2GIF TFT 1.28" Export\n`;
    code += `// Resolution: ${resolution}x${resolution}, Total Bytes: ${bytes.length}\n`;
    code += `#include <pgmspace.h>\n\n`;
    code += `const uint8_t tft_gif_data[${bytes.length}] PROGMEM = {\n  `;

    const maxSample = Math.min(bytes.length, 3000);
    const lines = [];
    let currentLine = '';

    for (let i = 0; i < maxSample; i++) {
      const hex = '0x' + bytes[i].toString(16).padStart(2, '0').toUpperCase();
      currentLine += hex + ', ';
      if ((i + 1) % 12 === 0) {
        lines.push(currentLine);
        currentLine = '';
      }
    }
    if (currentLine) lines.push(currentLine);

    if (bytes.length > maxSample) {
      lines.push(`/* ... ${bytes.length - maxSample} bytes lainnya ... */`);
    }

    code += lines.join('\n  ');
    code += `\n};\n`;
    targetTextarea.value = code;
  }

  function copyToClipboard(textarea, btn) {
    textarea.select();
    navigator.clipboard.writeText(textarea.value);
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Tersalin!';
    setTimeout(() => { btn.innerHTML = origHtml; }, 2000);
  }
});
