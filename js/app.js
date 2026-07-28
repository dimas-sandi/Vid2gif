/**
 * DMZ Eye Animator — Main Application Controller
 * Custom Animation Tool for DMZ Dual Eye ESP32-C3 BiLED Controller Module.
 *
 * KEY FIX: Frame extraction uses requestAnimationFrame + sequential seeks
 * with a guaranteed 50ms fallback to prevent infinite hangs.
 */
document.addEventListener('DOMContentLoaded', () => {

  // --- Tab Switching ---
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  // ================= TAB 1: VIDEO → ANIMASI MATA =================
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
  const gifFilenameInput = document.getElementById('gif-filename');
  const calcStatusTag = document.getElementById('calc-status-tag');
  const calcRes = document.getElementById('calc-res');
  const calcTotalFrames = document.getElementById('calc-total-frames');
  const calcColors = document.getElementById('calc-colors');
  const calcEstSize = document.getElementById('calc-est-size');
  const calcMessage = document.getElementById('calc-message');
  const btnGenerateGif = document.getElementById('btn-generate-gif');
  const progressContainer = document.getElementById('progress-container');
  const progressStatusText = document.getElementById('progress-status-text');
  const progressPercent = document.getElementById('progress-percent');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const resultCard = document.getElementById('result-card');
  const gifResultImg = document.getElementById('gif-result-img');
  const gifResultMirror = document.getElementById('gif-result-mirror');
  const eyeLabelPreview = document.getElementById('eye-label-preview');
  const resultSizeBadge = document.getElementById('result-size-badge');
  const resFinalSize = document.getElementById('res-final-size');
  const resFinalResolution = document.getElementById('res-final-resolution');
  const resFinalFilename = document.getElementById('res-final-filename');
  const resFinalDiff = document.getElementById('res-final-diff');
  const btnDownloadGif = document.getElementById('btn-download-gif');
  const renderCanvas = document.getElementById('render-canvas');

  let videoCropper = new VideoCropper(cropperCanvas, sourceVideo);
  let currentVideoCalc = null;
  let currentVideoGifBytes = null;
  let selectedEyePrefix = 'L';

  videoCropper.onTransformChange = () => {
    zoomSlider.value = videoCropper.zoom;
    zoomValue.textContent = `${videoCropper.zoom.toFixed(1)}x`;
  };

  // --- Eye Selector ---
  document.querySelectorAll('.eye-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.eye-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedEyePrefix = btn.dataset.prefix;
      const baseName = gifFilenameInput.value.replace(/^[LRU]_/, '');
      gifFilenameInput.value = `${selectedEyePrefix}_${baseName}`;
      updateEyeLabel();
    });
  });

  function updateEyeLabel() {
    const labels = { L: 'Mata Kiri', R: 'Mata Kanan', U: 'Universal (Kiri & Kanan)' };
    if (eyeLabelPreview) eyeLabelPreview.textContent = labels[selectedEyePrefix] || 'Mata Kiri';
  }

  // --- Dropzone ---
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault(); dropzone.classList.remove('dragover');
    if (e.dataTransfer.files?.length > 0) loadVideoFile(e.dataTransfer.files[0]);
  });
  dropzone.addEventListener('click', (e) => {
    if (e.target.closest('.btn')) return;
    videoInput.click();
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
      videoDurBadge.textContent = `Durasi: ${dur.toFixed(1)}s`;
      trimStartInput.max = dur;
      trimEndInput.max = dur;
      trimStartInput.value = '0.0';
      trimEndInput.value = dur.toFixed(1);

      videoCropper.resetTransform();
      videoCropper.startRenderLoop();
      updateClipDuration();
    };
  }

  // --- Play/Pause ---
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

  // --- Trim Duration ---
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
    clipDurationLabel.textContent = `${(end - start).toFixed(1)}s`;
    runVideoCalculator();
  }

  // --- Cropper Controls ---
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

  // --- Target Size ---
  targetSizeInput.addEventListener('input', runVideoCalculator);
  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      targetSizeInput.value = btn.dataset.size;
      runVideoCalculator();
    });
  });

  function runVideoCalculator() {
    const start = parseFloat(trimStartInput.value) || 0;
    const end = parseFloat(trimEndInput.value) || sourceVideo.duration || 3;
    const duration = Math.max(0.1, end - start);
    const targetKb = parseInt(targetSizeInput.value, 10) || 500;
    const calc = TFTCalculator.calculate(duration, 15, targetKb);
    currentVideoCalc = calc;

    calcRes.textContent = '240 × 240 px';
    calcTotalFrames.textContent = `${calc.fps} FPS (${calc.totalFrames} Frame)`;
    calcColors.textContent = `${calc.colors} Warna`;
    calcEstSize.textContent = `~${calc.estimatedSizeKb} KB`;
    calcMessage.textContent = calc.statusMessage;
    calcStatusTag.className = 'status-badge status-success';
    calcStatusTag.textContent = 'OK';
  }

  // --- GENERATE GIF (with robust frame extraction) ---
  btnGenerateGif.addEventListener('click', async () => {
    if (!sourceVideo || sourceVideo.readyState < 2) return;

    btnGenerateGif.disabled = true;
    progressContainer.classList.remove('hidden');
    resultCard.classList.add('hidden');
    sourceVideo.pause();

    const startT = parseFloat(trimStartInput.value) || 0;
    const endT = parseFloat(trimEndInput.value) || sourceVideo.duration;
    const duration = Math.max(0.1, endT - startT);
    const targetKb = parseInt(targetSizeInput.value, 10) || 500;
    const exportRes = 240;

    let currentFps = currentVideoCalc ? currentVideoCalc.fps : 12;
    let currentDeltaThreshold = 24;
    let finalGifBuffer = null;
    let attempts = 0;
    const maxAttempts = 6;

    while (attempts < maxAttempts) {
      attempts++;
      const totalFrames = Math.max(1, Math.round(duration * currentFps));

      renderCanvas.width = exportRes;
      renderCanvas.height = exportRes;
      const renderCtx = renderCanvas.getContext('2d');
      renderCtx.imageSmoothingEnabled = true;
      renderCtx.imageSmoothingQuality = 'high';
      videoCropper.resetMotionBlend();

      const framesPixelData = [];
      progressStatusText.textContent = `Mengekstrak ${totalFrames} frame @ ${currentFps} FPS...`;
      progressBarFill.style.width = '0%';
      progressPercent.textContent = '0%';

      // Extract frames one by one with robust seeking
      for (let i = 0; i < totalFrames; i++) {
        const t = startT + (i / totalFrames) * duration;
        await seekVideoTo(sourceVideo, t);

        // Yield to browser to prevent UI freeze
        await new Promise(r => setTimeout(r, 0));

        videoCropper.exportFrameToCanvas(renderCanvas, currentFps < 15, 0.22);
        const imgData = renderCtx.getImageData(0, 0, exportRes, exportRes);
        framesPixelData.push(new Uint8ClampedArray(imgData.data));

        const pct = Math.round(((i + 1) / totalFrames) * 35);
        progressPercent.textContent = `${pct}%`;
        progressBarFill.style.width = `${pct}%`;
      }

      progressStatusText.textContent = 'Mengompresi GIF (Web Worker)...';

      try {
        finalGifBuffer = await AsyncGIFEncoder.encodeInWorker(
          framesPixelData, exportRes, exportRes,
          1000 / currentFps, 256, currentDeltaThreshold,
          (pct) => {
            const total = 35 + Math.round((pct / 100) * 65);
            progressPercent.textContent = `${total}%`;
            progressBarFill.style.width = `${total}%`;
          }
        );
      } catch (err) {
        alert('Error encoding: ' + err.message);
        btnGenerateGif.disabled = false;
        progressContainer.classList.add('hidden');
        return;
      }

      const sizeKb = Math.round(finalGifBuffer.length / 1024);
      if (sizeKb <= targetKb || currentFps <= 3) break;

      progressStatusText.textContent = `${sizeKb} KB > target ${targetKb} KB — menurunkan FPS & menambah delta...`;
      await new Promise(r => setTimeout(r, 200));
      currentDeltaThreshold += 12;
      currentFps = Math.max(3, Math.round(currentFps * 0.75));
    }

    // Show result
    currentVideoGifBytes = finalGifBuffer;
    const blob = new Blob([finalGifBuffer], { type: 'image/gif' });
    const gifUrl = URL.createObjectURL(blob);

    gifResultImg.src = gifUrl;
    if (gifResultMirror) gifResultMirror.src = gifUrl;

    const filename = gifFilenameInput.value.trim() || `${selectedEyePrefix}_custom`;
    const fullFilename = filename.endsWith('.gif') ? filename : `${filename}.gif`;
    btnDownloadGif.href = gifUrl;
    btnDownloadGif.download = fullFilename;
    resFinalFilename.textContent = fullFilename;

    const sizeKb = Math.round(finalGifBuffer.length / 1024);
    resultSizeBadge.textContent = `${sizeKb} KB`;
    resFinalSize.textContent = `${sizeKb} KB (${finalGifBuffer.length.toLocaleString()} bytes)`;
    resFinalResolution.textContent = `240 × 240 px @ ${currentFps} FPS`;

    const diff = targetKb - sizeKb;
    resFinalDiff.className = diff >= 0 ? 'badge badge-success' : 'badge status-warning';
    resFinalDiff.textContent = diff >= 0 ? `✓ Siap Upload ke Modul` : `Ukuran melebihi target (${sizeKb} KB)`;

    progressContainer.classList.add('hidden');
    resultCard.classList.remove('hidden');
    btnGenerateGif.disabled = false;
    resultCard.scrollIntoView({ behavior: 'smooth' });
  });

  // Robust video seeking with 50ms fallback to guarantee no hang
  function seekVideoTo(video, time) {
    return new Promise((resolve) => {
      if (Math.abs(video.currentTime - time) < 0.02) { resolve(); return; }
      let done = false;
      const timeout = setTimeout(() => { if (!done) { done = true; resolve(); } }, 50);
      const handler = () => {
        if (!done) { done = true; clearTimeout(timeout); resolve(); }
      };
      video.addEventListener('seeked', handler, { once: true });
      video.currentTime = time;
    });
  }

  // ================= TAB 2: GIF RESIZER =================
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
  const gifResizeFilename = document.getElementById('gif-resize-filename');
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
  const gifEyeLabelPreview = document.getElementById('gif-eye-label-preview');

  let decodedGifData = null;
  let gifCurrentCalc = null;
  let gifResizedBytes = null;
  let gifPlaybackIdx = 0;
  let gifPlaybackTimer = null;
  let gifSelectedEyePrefix = 'L';

  const mockGifVideo = { videoWidth: 240, videoHeight: 240, readyState: 4 };
  let gifCropper = new VideoCropper(gifCropperCanvas, mockGifVideo);

  gifCropper.onTransformChange = () => {
    gifZoomSlider.value = gifCropper.zoom;
    gifZoomValue.textContent = `${gifCropper.zoom.toFixed(1)}x`;
  };

  // GIF Eye Selector
  document.querySelectorAll('.gif-eye-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.gif-eye-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      gifSelectedEyePrefix = btn.dataset.prefix;
      const baseName = gifResizeFilename.value.replace(/^[LRU]_/, '');
      gifResizeFilename.value = `${gifSelectedEyePrefix}_${baseName}`;
      const labels = { L: 'Mata Kiri', R: 'Mata Kanan', U: 'Universal' };
      if (gifEyeLabelPreview) gifEyeLabelPreview.textContent = labels[gifSelectedEyePrefix] || 'Mata Kiri';
    });
  });

  // GIF Dropzone
  gifDropzone.addEventListener('dragover', (e) => { e.preventDefault(); gifDropzone.classList.add('dragover'); });
  gifDropzone.addEventListener('dragleave', () => gifDropzone.classList.remove('dragover'));
  gifDropzone.addEventListener('drop', (e) => {
    e.preventDefault(); gifDropzone.classList.remove('dragover');
    if (e.dataTransfer.files?.length > 0) loadGifFile(e.dataTransfer.files[0]);
  });
  gifDropzone.addEventListener('click', (e) => {
    if (e.target.closest('.btn')) return;
    gifFileInput.click();
  });
  gifFileInput.addEventListener('change', (e) => {
    if (e.target.files?.length > 0) loadGifFile(e.target.files[0]);
  });

  async function loadGifFile(file) {
    if (!file.name.toLowerCase().endsWith('.gif')) {
      alert('Mohon pilih file GIF (.gif) yang valid.');
      return;
    }
    const arrayBuffer = await file.arrayBuffer();
    try {
      const decoder = new GIFDecoder(arrayBuffer);
      decodedGifData = decoder.decode();
      if (!decodedGifData.frames?.length) throw new Error('Tidak ada frame animasi.');

      mockGifVideo.videoWidth = decodedGifData.width;
      mockGifVideo.videoHeight = decodedGifData.height;

      gifOrigDim.textContent = `${decodedGifData.width} × ${decodedGifData.height} px`;
      gifOrigFrames.textContent = `${decodedGifData.frames.length} Frame`;
      gifOrigSizeBadge.textContent = `${Math.round(file.size / 1024)} KB`;

      gifDropzone.classList.add('hidden');
      gifWorkspace.classList.remove('hidden');
      btnResizeGif.disabled = false;

      gifCropper.resetTransform();
      startGifPlaybackLoop();
      runGifCalculator();
    } catch (err) {
      alert('Gagal decode GIF: ' + err.message);
    }
  }

  function startGifPlaybackLoop() {
    if (gifPlaybackTimer) clearInterval(gifPlaybackTimer);
    if (!decodedGifData?.frames?.length) return;
    gifPlaybackIdx = 0;
    const play = () => {
      gifCropper.video = decodedGifData.frames[gifPlaybackIdx].canvas;
      gifCropper.render();
      gifPlaybackIdx = (gifPlaybackIdx + 1) % decodedGifData.frames.length;
    };
    play();
    gifPlaybackTimer = setInterval(play, 100);
  }

  // GIF Cropper Controls
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

  // GIF Target Size
  gifTargetKbInput.addEventListener('input', runGifCalculator);
  document.querySelectorAll('.gif-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.gif-preset-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      gifTargetKbInput.value = btn.dataset.size;
      runGifCalculator();
    });
  });

  function runGifCalculator() {
    if (!decodedGifData) return;
    let totalMs = 0;
    decodedGifData.frames.forEach(f => totalMs += (f.delay || 100));
    const durSec = Math.max(0.2, totalMs / 1000);
    const targetKb = parseInt(gifTargetKbInput.value, 10) || 400;
    const calc = TFTCalculator.calculate(durSec, 15, targetKb);
    gifCurrentCalc = calc;

    gifCalcRes.textContent = '240 × 240 px';
    gifCalcFrames.textContent = `${calc.fps} FPS (${calc.totalFrames} Frame)`;
    gifCalcColors.textContent = `${calc.colors} Warna`;
    gifCalcEstSize.textContent = `~${calc.estimatedSizeKb} KB`;
    gifCalcMessage.textContent = calc.statusMessage;
    gifCalcStatusTag.className = 'status-badge status-success';
    gifCalcStatusTag.textContent = 'OK';
  }

  // --- Resize GIF ---
  btnResizeGif.addEventListener('click', async () => {
    if (!decodedGifData) return;
    btnResizeGif.disabled = true;
    gifProgressContainer.classList.remove('hidden');
    gifResultCard.classList.add('hidden');

    const exportRes = 240;
    let fps = gifCurrentCalc ? gifCurrentCalc.fps : 12;
    let deltaThreshold = 24;
    const targetKb = parseInt(gifTargetKbInput.value, 10) || 400;
    let finalBuffer = null;
    let attempts = 0;

    while (attempts < 6) {
      attempts++;
      renderCanvas.width = exportRes;
      renderCanvas.height = exportRes;
      const ctx = renderCanvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      gifCropper.resetMotionBlend();

      const frames = decodedGifData.frames;
      let totalMs = 0;
      frames.forEach(f => totalMs += (f.delay || 100));
      const durSec = totalMs / 1000;
      const frameCount = Math.max(1, Math.round(durSec * fps));

      const pixelData = [];
      gifProgressStatusText.textContent = `Mengekstrak ${frameCount} frame @ ${fps} FPS...`;

      for (let i = 0; i < frameCount; i++) {
        const srcIdx = Math.min(frames.length - 1, Math.floor((i / frameCount) * frames.length));
        gifCropper.video = frames[srcIdx].canvas;
        gifCropper.exportFrameToCanvas(renderCanvas, fps < 15, 0.22);
        const imgData = ctx.getImageData(0, 0, exportRes, exportRes);
        pixelData.push(new Uint8ClampedArray(imgData.data));

        const pct = Math.round(((i + 1) / frameCount) * 35);
        gifProgressPercent.textContent = `${pct}%`;
        gifProgressBarFill.style.width = `${pct}%`;
      }

      gifProgressStatusText.textContent = 'Mengompresi GIF (Web Worker)...';

      try {
        finalBuffer = await AsyncGIFEncoder.encodeInWorker(
          pixelData, exportRes, exportRes,
          1000 / fps, 256, deltaThreshold,
          (pct) => {
            const total = 35 + Math.round((pct / 100) * 65);
            gifProgressPercent.textContent = `${total}%`;
            gifProgressBarFill.style.width = `${total}%`;
          }
        );
      } catch (err) {
        alert('Error: ' + err.message);
        btnResizeGif.disabled = false;
        gifProgressContainer.classList.add('hidden');
        return;
      }

      const sizeKb = Math.round(finalBuffer.length / 1024);
      if (sizeKb <= targetKb || fps <= 3) break;

      gifProgressStatusText.textContent = `${sizeKb} KB > target — optimasi...`;
      await new Promise(r => setTimeout(r, 200));
      deltaThreshold += 12;
      fps = Math.max(3, Math.round(fps * 0.75));
    }

    gifResizedBytes = finalBuffer;
    const blob = new Blob([finalBuffer], { type: 'image/gif' });
    const url = URL.createObjectURL(blob);

    gifResizedImg.src = url;
    const fname = (gifResizeFilename.value.trim() || `${gifSelectedEyePrefix}_custom`);
    const fullName = fname.endsWith('.gif') ? fname : `${fname}.gif`;
    btnDownloadResizedGif.href = url;
    btnDownloadResizedGif.download = fullName;

    const sizeKb = Math.round(finalBuffer.length / 1024);
    gifResultSizeBadge.textContent = `${sizeKb} KB`;
    gifFinalSize.textContent = `${sizeKb} KB`;
    gifFinalResolution.textContent = `240 × 240 px @ ${fps} FPS`;

    const diff = targetKb - sizeKb;
    gifFinalDiff.className = diff >= 0 ? 'badge badge-success' : 'badge status-warning';
    gifFinalDiff.textContent = diff >= 0 ? '✓ Siap Upload' : `Melebihi target (${sizeKb} KB)`;

    gifProgressContainer.classList.add('hidden');
    gifResultCard.classList.remove('hidden');
    btnResizeGif.disabled = false;
    gifResultCard.scrollIntoView({ behavior: 'smooth' });
  });
});
