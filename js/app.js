/**
 * Vid2GIF - Main Application Logic Controller
 * Integrates video decoding, interactive cropping, auto-size calculation, GIF encoding, and TFT simulation.
 */
document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const dropzone = document.getElementById('dropzone');
  const videoInput = document.getElementById('video-input');
  const workspace = document.getElementById('workspace');
  const sourceVideo = document.getElementById('source-video');
  const cropperCanvas = document.getElementById('cropper-canvas');

  // Cropper Controls
  const zoomSlider = document.getElementById('zoom-slider');
  const zoomValue = document.getElementById('zoom-value');
  const btnCenterCrop = document.getElementById('btn-center-crop');
  const btnResetCrop = document.getElementById('btn-reset-crop');
  const btnMaskRound = document.getElementById('btn-mask-round');
  const btnMaskSquare = document.getElementById('btn-mask-square');

  // Trimmer Controls
  const btnPlayVideo = document.getElementById('btn-play-video');
  const trimStartInput = document.getElementById('trim-start');
  const trimEndInput = document.getElementById('trim-end');
  const clipDurationLabel = document.getElementById('clip-duration');
  const videoDurBadge = document.getElementById('video-dur-badge');

  // Optimization Controls
  const targetSizeInput = document.getElementById('target-size-kb');
  const targetFpsSlider = document.getElementById('target-fps');
  const fpsDisplay = document.getElementById('fps-display');
  const presetBtns = document.querySelectorAll('.preset-btn');

  // Auto Calc UI Elements
  const calcStatusTag = document.getElementById('calc-status-tag');
  const calcRes = document.getElementById('calc-res');
  const calcTotalFrames = document.getElementById('calc-total-frames');
  const calcColors = document.getElementById('calc-colors');
  const calcEstSize = document.getElementById('calc-est-size');
  const calcMessage = document.getElementById('calc-message');

  // Manual Override
  const chkManualOverride = document.getElementById('chk-manual-override');
  const manualControls = document.getElementById('manual-controls');
  const manualRes = document.getElementById('manual-res');
  const manualColors = document.getElementById('manual-colors');

  // Conversion & Output
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

  // App State
  let cropper = null;
  let currentCalcResult = null;
  let currentGifBytes = null;

  // Initialize Cropper Engine
  cropper = new VideoCropper(cropperCanvas, sourceVideo);
  cropper.onTransformChange = () => {
    zoomSlider.value = cropper.zoom;
    zoomValue.textContent = `${cropper.zoom.toFixed(1)}x`;
  };

  // --- Drag and Drop File Loader ---
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      loadVideoFile(e.dataTransfer.files[0]);
    }
  });

  videoInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      loadVideoFile(e.target.files[0]);
    }
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
      // Default clip duration to min(3.0s, video duration)
      trimEndInput.value = Math.min(3.0, dur).toFixed(1);

      cropper.resetTransform();
      cropper.startRenderLoop();

      updateClipDuration();
    };
  }

  // --- Trimmer & Playback Controls ---
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

    runAutoCalculator();
  }

  // --- Cropper Toolbar Controls ---
  zoomSlider.addEventListener('input', (e) => {
    cropper.setZoom(parseFloat(e.target.value));
  });

  btnCenterCrop.addEventListener('click', () => cropper.centerCrop());
  btnResetCrop.addEventListener('click', () => cropper.resetTransform());

  btnMaskRound.addEventListener('click', () => {
    btnMaskRound.classList.add('active');
    btnMaskSquare.classList.remove('active');
    cropper.setMaskMode('round');
  });

  btnMaskSquare.addEventListener('click', () => {
    btnMaskSquare.classList.add('active');
    btnMaskRound.classList.remove('active');
    cropper.setMaskMode('square');
  });

  // --- Optimization & Auto Calculator ---
  targetSizeInput.addEventListener('input', runAutoCalculator);
  targetFpsSlider.addEventListener('input', (e) => {
    fpsDisplay.textContent = `${e.target.value} FPS`;
    runAutoCalculator();
  });

  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      presetBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      targetSizeInput.value = btn.dataset.size;
      runAutoCalculator();
    });
  });

  chkManualOverride.addEventListener('change', () => {
    if (chkManualOverride.checked) {
      manualControls.classList.remove('hidden');
    } else {
      manualControls.classList.add('hidden');
    }
    runAutoCalculator();
  });

  manualRes.addEventListener('change', runAutoCalculator);
  manualColors.addEventListener('change', runAutoCalculator);

  function runAutoCalculator() {
    const start = parseFloat(trimStartInput.value) || 0;
    const end = parseFloat(trimEndInput.value) || sourceVideo.duration || 3;
    const duration = Math.max(0.1, end - start);
    const fps = parseInt(targetFpsSlider.value, 10);
    const targetKb = parseInt(targetSizeInput.value, 10) || 500;

    const calc = TFTCalculator.calculate(duration, fps, targetKb);
    currentCalcResult = calc;

    // Apply manual overrides if enabled
    let exportRes = calc.recommendedRes;
    let exportColors = calc.recommendedColors;

    if (chkManualOverride.checked) {
      exportRes = parseInt(manualRes.value, 10);
      exportColors = parseInt(manualColors.value, 10);
    }

    // Update UI Summary Card
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
      calcStatusTag.textContent = 'Saran: Kurangi Durasi/FPS';
    }
  }

  // --- GIF Conversion Engine ---
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

    let exportRes = currentCalcResult.recommendedRes;
    let exportColors = currentCalcResult.recommendedColors;

    if (chkManualOverride.checked) {
      exportRes = parseInt(manualRes.value, 10);
      exportColors = parseInt(manualColors.value, 10);
    }

    // Prepare offscreen canvas at target export resolution
    renderCanvas.width = exportRes;
    renderCanvas.height = exportRes;
    const renderCtx = renderCanvas.getContext('2d');

    // Instantiate GIF Encoder
    const encoder = new GIFEncoder(exportRes, exportRes);
    encoder.setDelay(1000 / fps);
    encoder.setColorCount(exportColors);
    encoder.start();

    for (let i = 0; i < totalFrames; i++) {
      const currentTime = startT + i * frameInterval;

      // Seek video to frame time
      await seekVideoTo(sourceVideo, currentTime);

      // Render cropped video frame onto target canvas
      cropper.exportFrameToCanvas(renderCanvas);

      // Get frame RGBA pixels
      const imgData = renderCtx.getImageData(0, 0, exportRes, exportRes);
      encoder.addFrame(imgData.data, 10);

      // Update progress
      const percent = Math.round(((i + 1) / totalFrames) * 100);
      progressPercent.textContent = `${percent}%`;
      progressBarFill.style.width = `${percent}%`;
      progressStatusText.textContent = `Memproses frame ${i + 1} / ${totalFrames}...`;

      // Allow UI thread to update smooth progress
      await new Promise((r) => setTimeout(r, 10));
    }

    progressStatusText.textContent = 'Membuat stream file GIF...';
    await new Promise((r) => setTimeout(r, 20));

    const gifBuffer = encoder.finish();
    currentGifBytes = gifBuffer;

    const blob = new Blob([gifBuffer], { type: 'image/gif' });
    const gifUrl = URL.createObjectURL(blob);

    // Display Result
    gifResultImg.src = gifUrl;
    btnDownloadGif.href = gifUrl;

    const finalSizeKb = Math.round(gifBuffer.length / 1024);
    resultSizeBadge.textContent = `${finalSizeKb} KB`;
    resFinalSize.textContent = `${finalSizeKb} KB (${gifBuffer.length.toLocaleString()} bytes)`;
    resFinalResolution.textContent = `${exportRes} x ${exportRes} px @ ${fps} FPS`;

    const targetKb = parseInt(targetSizeInput.value, 10) || 500;
    const diff = targetKb - finalSizeKb;
    if (diff >= 0) {
      resFinalDiff.className = 'badge badge-success';
      resFinalDiff.textContent = `Aman (-${diff} KB di bawah target)`;
    } else {
      resFinalDiff.className = 'badge status-exceeded';
      resFinalDiff.textContent = `Melebihi target (+${Math.abs(diff)} KB)`;
    }

    progressContainer.classList.add('hidden');
    resultCard.classList.remove('hidden');
    btnGenerateGif.disabled = false;

    // Scroll smoothly to results
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

  // --- C-Array Generator (ESP32/Arduino TFT support) ---
  btnToggleCArray.addEventListener('click', () => {
    if (!currentGifBytes) return;

    if (carrayContainer.classList.contains('hidden')) {
      carrayContainer.classList.remove('hidden');
      generateCArrayCode();
    } else {
      carrayContainer.classList.add('hidden');
    }
  });

  function generateCArrayCode() {
    if (!currentGifBytes) return;
    const bytes = currentGifBytes;
    let code = `// Vid2GIF TFT 1.28" Export\n`;
    code += `// Resolution: ${manualRes.value}x${manualRes.value}, Total Bytes: ${bytes.length}\n`;
    code += `#include <pgmspace.h>\n\n`;
    code += `const uint8_t tft_gif_data[${bytes.length}] PROGMEM = {\n  `;

    const maxSample = Math.min(bytes.length, 3000); // sample snippet if large
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
    carrayText.value = code;
  }

  btnCopyCArray.addEventListener('click', () => {
    carrayText.select();
    navigator.clipboard.writeText(carrayText.value);
    btnCopyCArray.innerHTML = '<i class="fa-solid fa-check"></i> Tersalin!';
    setTimeout(() => {
      btnCopyCArray.innerHTML = '<i class="fa-solid fa-copy"></i> Salin Code';
    }, 2000);
  });
});
