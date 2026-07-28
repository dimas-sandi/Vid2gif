/**
 * Vid2GIF - WhatsApp Style Interactive Cropper Engine
 * Supports 1:1 square ratio, drag-to-pan, pinch/wheel zoom, center snap, and TFT mask previews.
 * Features 2-Stage Multi-Pass High-Quality Video Resampler (240x240 FIX) with Motion Blending.
 */
class VideoCropper {
  constructor(canvasElement, videoElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.video = videoElement;

    // Transform State
    this.zoom = 1.0;
    this.minZoom = 1.0;
    this.maxZoom = 4.0;
    this.panX = 0;
    this.panY = 0;

    // Mask Mode: 'round' (GC9A01 1.28" TFT) or 'square'
    this.maskMode = 'round';

    // Drag tracking
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.initialPanX = 0;
    this.initialPanY = 0;

    // Touch gesture tracking
    this.initialPinchDistance = null;
    this.initialZoomOnPinch = 1.0;

    // Intermediate Canvas for 2-Stage Step-Down Resampling (eliminates aliasing & moiré)
    this.intCanvas = document.createElement('canvas');
    this.intCanvas.width = 480;
    this.intCanvas.height = 480;
    this.intCtx = this.intCanvas.getContext('2d');

    // Motion blend cache
    this.prevImageData = null;

    // Animation frame callback
    this.animFrameId = null;
    this.onTransformChange = null;

    this.initEvents();
  }

  initEvents() {
    const c = this.canvas;

    c.addEventListener('mousedown', (e) => this.onPointerDown(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => this.onPointerMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', () => this.onPointerUp());

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      this.setZoom(this.zoom * zoomFactor);
    }, { passive: false });

    c.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.onPointerDown(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 2) {
        this.isDragging = false;
        this.initialPinchDistance = this.getTouchDistance(e.touches);
        this.initialZoomOnPinch = this.zoom;
      }
    }, { passive: true });

    c.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && this.isDragging) {
        this.onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 2 && this.initialPinchDistance) {
        const currentDist = this.getTouchDistance(e.touches);
        const scale = currentDist / this.initialPinchDistance;
        this.setZoom(this.initialZoomOnPinch * scale);
      }
    }, { passive: true });

    c.addEventListener('touchend', () => {
      this.onPointerUp();
      this.initialPinchDistance = null;
    });
  }

  getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  onPointerDown(x, y) {
    this.isDragging = true;
    this.dragStartX = x;
    this.dragStartY = y;
    this.initialPanX = this.panX;
    this.initialPanY = this.panY;
    this.canvas.style.cursor = 'grabbing';
  }

  onPointerMove(x, y) {
    if (!this.isDragging) return;
    const dx = x - this.dragStartX;
    const dy = y - this.dragStartY;
    this.panX = this.initialPanX + dx;
    this.panY = this.initialPanY + dy;
    this.clampPan();
    this.render();
    if (this.onTransformChange) this.onTransformChange();
  }

  onPointerUp() {
    this.isDragging = false;
    this.canvas.style.cursor = 'grab';
  }

  setZoom(val) {
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, val));
    this.clampPan();
    this.render();
    if (this.onTransformChange) this.onTransformChange();
  }

  setMaskMode(mode) {
    this.maskMode = mode;
    this.render();
  }

  resetTransform() {
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.render();
    if (this.onTransformChange) this.onTransformChange();
  }

  centerCrop() {
    this.panX = 0;
    this.panY = 0;
    this.clampPan();
    this.render();
    if (this.onTransformChange) this.onTransformChange();
  }

  clampPan() {
    if (!this.video) return;
    const vw = this.video.videoWidth || this.video.width;
    const vh = this.video.videoHeight || this.video.height;
    if (!vw || !vh) return;

    const aspect = vw / vh;

    let baseW, baseH;
    if (aspect >= 1) {
      baseH = this.canvas.height;
      baseW = baseH * aspect;
    } else {
      baseW = this.canvas.width;
      baseH = baseW / aspect;
    }

    const scaledW = baseW * this.zoom;
    const scaledH = baseH * this.zoom;

    const maxPanX = Math.max(0, (scaledW - this.canvas.width) / 2);
    const maxPanY = Math.max(0, (scaledH - this.canvas.height) / 2);

    this.panX = Math.max(-maxPanX, Math.min(maxPanX, this.panX));
    this.panY = Math.max(-maxPanY, Math.min(maxPanY, this.panY));
  }

  startRenderLoop() {
    const loop = () => {
      this.render();
      this.animFrameId = requestAnimationFrame(loop);
    };
    if (!this.animFrameId) {
      loop();
    }
  }

  stopRenderLoop() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  render() {
    const w = this.canvas.width;
    const h = this.canvas.height;

    this.ctx.clearRect(0, 0, w, h);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';

    this.ctx.fillStyle = '#0a0d14';
    this.ctx.fillRect(0, 0, w, h);

    if (this.video) {
      const vw = this.video.videoWidth || this.video.width;
      const vh = this.video.videoHeight || this.video.height;

      if (vw && vh) {
        const aspect = vw / vh;

        let baseW, baseH;
        if (aspect >= 1) {
          baseH = h;
          baseW = baseH * aspect;
        } else {
          baseW = w;
          baseH = baseW / aspect;
        }

        const scaledW = baseW * this.zoom;
        const scaledH = baseH * this.zoom;

        const drawX = (w - scaledW) / 2 + this.panX;
        const drawY = (h - scaledH) / 2 + this.panY;

        this.ctx.drawImage(this.video, drawX, drawY, scaledW, scaledH);
      }
    }

    this.drawOverlay();
  }

  drawOverlay() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;

    ctx.save();

    if (this.maskMode === 'round') {
      ctx.fillStyle = 'rgba(10, 13, 20, 0.75)';
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2, true);
      ctx.fill();

      ctx.strokeStyle = 'rgba(6, 182, 212, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w / 3, h * 0.15); ctx.lineTo(w / 3, h * 0.85);
      ctx.moveTo((w * 2) / 3, h * 0.15); ctx.lineTo((w * 2) / 3, h * 0.85);
      ctx.moveTo(w * 0.15, h / 3); ctx.lineTo(w * 0.85, h / 3);
      ctx.moveTo(w * 0.15, (h * 2) / 3); ctx.lineTo(w * 0.85, (h * 2) / 3);
      ctx.stroke();

    } else {
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, w - 2, h - 2);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w / 3, 0); ctx.lineTo(w / 3, h);
      ctx.moveTo((w * 2) / 3, 0); ctx.lineTo((w * 2) / 3, h);
      ctx.moveTo(0, h / 3); ctx.lineTo(w, h / 3);
      ctx.moveTo(0, (h * 2) / 3); ctx.lineTo(w, (h * 2) / 3);
      ctx.stroke();
    }

    ctx.restore();
  }

  resetMotionBlend() {
    this.prevImageData = null;
  }

  /**
   * 2-Stage Step-Down Video Resampler:
   * Step 1: Render video to 480x480 intermediate canvas (preserves sharp details, eliminates 4K aliasing)
   * Step 2: Render 480x480 to final 240x240 target canvas with high-quality Lanczos-style smoothing
   */
  exportFrameToCanvas(targetCanvas, enableMotionBlend = true, blendFactor = 0.22) {
    const tw = targetCanvas.width;
    const th = targetCanvas.height;
    const tctx = targetCanvas.getContext('2d');

    if (!this.video) return;
    const vw = this.video.videoWidth || this.video.width;
    const vh = this.video.videoHeight || this.video.height;
    if (!vw || !vh) return;

    // --- STAGE 1: Render to Intermediate 480x480 Canvas ---
    const iw = 480;
    const ih = 480;
    const ictx = this.intCtx;

    ictx.imageSmoothingEnabled = true;
    ictx.imageSmoothingQuality = 'high';
    ictx.clearRect(0, 0, iw, ih);
    ictx.fillStyle = '#000000';
    ictx.fillRect(0, 0, iw, ih);

    const aspect = vw / vh;
    let baseW, baseH;
    if (aspect >= 1) {
      baseH = ih;
      baseW = baseH * aspect;
    } else {
      baseW = iw;
      baseH = baseW / aspect;
    }

    const scaledW = baseW * this.zoom;
    const scaledH = baseH * this.zoom;

    const scaleRatio = iw / this.canvas.width;
    const drawX = (iw - scaledW) / 2 + (this.panX * scaleRatio);
    const drawY = (ih - scaledH) / 2 + (this.panY * scaleRatio);

    ictx.drawImage(this.video, drawX, drawY, scaledW, scaledH);

    // --- STAGE 2: Render 480x480 Intermediate Canvas to 240x240 Target Canvas ---
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = 'high';
    tctx.clearRect(0, 0, tw, th);
    tctx.drawImage(this.intCanvas, 0, 0, iw, ih, 0, 0, tw, th);

    // Apply Motion Blending for low-FPS smooth motion
    if (enableMotionBlend) {
      const currImageData = tctx.getImageData(0, 0, tw, th);
      const curr = currImageData.data;

      if (this.prevImageData) {
        const prev = this.prevImageData.data;
        const bFactor = Math.min(0.35, Math.max(0.05, blendFactor));
        const invFactor = 1 - bFactor;

        for (let i = 0; i < curr.length; i += 4) {
          curr[i] = Math.round(curr[i] * invFactor + prev[i] * bFactor);
          curr[i + 1] = Math.round(curr[i + 1] * invFactor + prev[i + 1] * bFactor);
          curr[i + 2] = Math.round(curr[i + 2] * invFactor + prev[i + 2] * bFactor);
        }
        tctx.putImageData(currImageData, 0, 0);
      }

      this.prevImageData = currImageData;
    }
  }
}

window.VideoCropper = VideoCropper;
