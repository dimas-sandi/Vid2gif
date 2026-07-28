/**
 * Vid2GIF - WhatsApp Style Interactive Cropper Engine
 * Supports 1:1 square ratio, drag-to-pan, pinch/wheel zoom, center snap, and TFT mask previews.
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
    this.panX = 0; // relative offset from center in px
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

    // Animation frame callback
    this.animFrameId = null;
    this.onTransformChange = null;

    this.initEvents();
  }

  initEvents() {
    const c = this.canvas;

    // Mouse Drag
    c.addEventListener('mousedown', (e) => this.onPointerDown(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => this.onPointerMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', () => this.onPointerUp());

    // Wheel Zoom
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      this.setZoom(this.zoom * zoomFactor);
    }, { passive: false });

    // Touch events for Mobile/Tablet
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
    this.maskMode = mode; // 'round' or 'square'
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
    if (!this.video || !this.video.videoWidth) return;

    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    const aspect = vw / vh;

    // Calculate base draw size inside 1:1 box
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

    // Draw background
    this.ctx.fillStyle = '#0a0d14';
    this.ctx.fillRect(0, 0, w, h);

    if (this.video && this.video.readyState >= 2) {
      const vw = this.video.videoWidth;
      const vh = this.video.videoHeight;
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
    } else {
      // Empty state placeholder inside cropper canvas
      this.ctx.fillStyle = '#1e293b';
      this.ctx.font = '14px Outfit, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('Pilih file video untuk mulai crop', w / 2, h / 2);
    }

    // Draw Mask & Grid Overlay
    this.drawOverlay();
  }

  drawOverlay() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;

    ctx.save();

    if (this.maskMode === 'round') {
      // Darken area outside circle (1.28" GC9A01 TFT shape)
      ctx.fillStyle = 'rgba(10, 13, 20, 0.75)';
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2, true);
      ctx.fill();

      // Draw subtle circular cyan outline
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
      ctx.stroke();

      // Rule of thirds crosshair inside circle
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w / 3, h * 0.15); ctx.lineTo(w / 3, h * 0.85);
      ctx.moveTo((w * 2) / 3, h * 0.15); ctx.lineTo((w * 2) / 3, h * 0.85);
      ctx.moveTo(w * 0.15, h / 3); ctx.lineTo(w * 0.85, h / 3);
      ctx.moveTo(w * 0.15, (h * 2) / 3); ctx.lineTo(w * 0.85, (h * 2) / 3);
      ctx.stroke();

    } else {
      // Square boundary
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, w - 2, h - 2);

      // Grid lines
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

  /**
   * Render frame directly onto a target offscreen canvas at specified target resolution (e.g. 240x240, 180x180)
   */
  exportFrameToCanvas(targetCanvas) {
    const tw = targetCanvas.width;
    const th = targetCanvas.height;
    const tctx = targetCanvas.getContext('2d');

    tctx.clearRect(0, 0, tw, th);
    tctx.fillStyle = '#000000';
    tctx.fillRect(0, 0, tw, th);

    if (!this.video || this.video.readyState < 2) return;

    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    const aspect = vw / vh;

    let baseW, baseH;
    if (aspect >= 1) {
      baseH = th;
      baseW = baseH * aspect;
    } else {
      baseW = tw;
      baseH = baseW / aspect;
    }

    const scaledW = baseW * this.zoom;
    const scaledH = baseH * this.zoom;

    // Scale pan according to target resolution ratio
    const scaleRatio = tw / this.canvas.width;
    const drawX = (tw - scaledW) / 2 + (this.panX * scaleRatio);
    const drawY = (th - scaledH) / 2 + (this.panY * scaleRatio);

    tctx.drawImage(this.video, drawX, drawY, scaledW, scaledH);
  }
}

window.VideoCropper = VideoCropper;
