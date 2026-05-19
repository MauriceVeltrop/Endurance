"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CROP_PRESETS, createObjectUrl, revokeObjectUrl } from "../lib/imageCropper";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeName(file, fallback) {
  const original = file?.name || fallback || "cropped-image.jpg";
  const base = original.replace(/\.[^.]+$/, "");
  return `${base}-cropped.jpg`;
}

function canvasToFile(canvas, fileName, mimeType = "image/jpeg", quality = 0.9) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not crop image."));
          return;
        }

        resolve(new File([blob], fileName, { type: mimeType }));
      },
      mimeType,
      quality
    );
  });
}

export default function ImageCropperModal({
  file,
  mode = "avatar",
  title,
  onCancel,
  onConfirm,
}) {
  const preset = CROP_PRESETS[mode] || CROP_PRESETS.avatar;
  const imageRef = useRef(null);
  const stageRef = useRef(null);
  const frameRef = useRef(null);
  const dragRef = useRef(null);

  const [imageUrl, setImageUrl] = useState("");
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);

  const aspectLabel = useMemo(
    () => (mode === "avatar" ? "Square avatar" : "Portrait training photo"),
    [mode]
  );

  useEffect(() => {
    const url = createObjectUrl(file);
    setImageUrl(url);
    setReady(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });

    return () => revokeObjectUrl(url);
  }, [file]);

  function setupImage() {
    setReady(true);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function getPoint(event) {
    return event.touches?.[0] || event;
  }

  function startDrag(event) {
    if (!ready) return;
    event.preventDefault();

    const point = getPoint(event);
    dragRef.current = {
      x: point.clientX,
      y: point.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  }

  function duringDrag(event) {
    if (!dragRef.current || !ready) return;
    event.preventDefault();

    const point = getPoint(event);
    const dx = point.clientX - dragRef.current.x;
    const dy = point.clientY - dragRef.current.y;

    setPan({
      x: dragRef.current.panX + dx,
      y: dragRef.current.panY + dy,
    });
  }

  function endDrag() {
    dragRef.current = null;
  }

  async function cropVisibleFrame() {
    const image = imageRef.current;
    const stage = stageRef.current;
    const frame = frameRef.current;

    if (!image || !stage || !frame) {
      throw new Error("Cropper is not ready.");
    }

    const stageRect = stage.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();

    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;

    const fitScale = Math.min(
      stageRect.width / naturalWidth,
      stageRect.height / naturalHeight
    );

    const renderedWidth = naturalWidth * fitScale * zoom;
    const renderedHeight = naturalHeight * fitScale * zoom;

    const renderedLeft =
      (stageRect.width - renderedWidth) / 2 + pan.x;
    const renderedTop =
      (stageRect.height - renderedHeight) / 2 + pan.y;

    const cropLeft = frameRect.left - stageRect.left;
    const cropTop = frameRect.top - stageRect.top;
    const cropWidth = frameRect.width;
    const cropHeight = frameRect.height;

    const sourceX = (cropLeft - renderedLeft) / (fitScale * zoom);
    const sourceY = (cropTop - renderedTop) / (fitScale * zoom);
    const sourceWidth = cropWidth / (fitScale * zoom);
    const sourceHeight = cropHeight / (fitScale * zoom);

    const outputWidth = preset.outputWidth || 900;
    const outputHeight = preset.outputHeight || 900;

    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;

    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";

    // Fill background for areas outside the image, instead of producing transparent edges.
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, outputWidth, outputHeight);

    ctx.drawImage(
      image,
      clamp(sourceX, 0, naturalWidth),
      clamp(sourceY, 0, naturalHeight),
      clamp(sourceWidth, 1, naturalWidth),
      clamp(sourceHeight, 1, naturalHeight),
      0,
      0,
      outputWidth,
      outputHeight
    );

    const fileName = safeName(
      file,
      mode === "avatar" ? "avatar.jpg" : "training-photo.jpg"
    );

    return canvasToFile(
      canvas,
      fileName,
      preset.mimeType || "image/jpeg",
      preset.quality ?? 0.9
    );
  }

  async function confirmCrop() {
    if (busy || !ready) return;
    setBusy(true);

    try {
      const croppedFile = await cropVisibleFrame();
      const previewUrl = URL.createObjectURL(croppedFile);
      onConfirm?.({ file: croppedFile, previewUrl });
    } finally {
      setBusy(false);
    }
  }

  if (!file) return null;

  return (
    <div style={styles.backdrop} role="dialog" aria-modal="true">
      <div style={styles.modal}>
        <div style={styles.header}>
          <div>
            <p style={styles.kicker}>{aspectLabel}</p>
            <h2 style={styles.title}>{title || preset.label}</h2>
          </div>
          <button type="button" onClick={onCancel} style={styles.iconButton} aria-label="Close">
            ×
          </button>
        </div>

        <div
          ref={stageRef}
          style={styles.stage}
          onMouseDown={startDrag}
          onMouseMove={duringDrag}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onTouchStart={startDrag}
          onTouchMove={duringDrag}
          onTouchEnd={endDrag}
        >
          {imageUrl ? (
            <img
              ref={imageRef}
              src={imageUrl}
              alt="Crop preview"
              onLoad={setupImage}
              style={{
                ...styles.image,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              }}
              draggable={false}
            />
          ) : null}

          {ready ? (
            <div
              ref={frameRef}
              style={{
                ...styles.cropFrame,
                aspectRatio: `${preset.aspectRatio}`,
              }}
            />
          ) : null}
        </div>

        <label style={styles.zoomLabel}>
          Zoom
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            style={styles.range}
          />
        </label>

        <p style={styles.help}>Drag the image itself to position it. Use zoom to frame the subject.</p>

        <div style={styles.actions}>
          <button type="button" onClick={onCancel} style={styles.secondaryButton}>
            Cancel
          </button>
          <button type="button" onClick={confirmCrop} disabled={busy || !ready} style={styles.primaryButton}>
            {busy ? "Cropping..." : "Use cropped image"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 999,
    display: "grid",
    placeItems: "center",
    padding: 16,
    background: "rgba(0,0,0,0.78)",
    backdropFilter: "blur(16px)",
  },
  modal: {
    width: "min(560px, 100%)",
    borderRadius: 30,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "linear-gradient(145deg, rgba(28,31,28,0.98), rgba(5,7,5,0.98))",
    color: "#fff",
    padding: 18,
    boxShadow: "0 32px 110px rgba(0,0,0,0.65)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
  },
  kicker: {
    margin: 0,
    color: "#d7ff3f",
    textTransform: "uppercase",
    letterSpacing: "0.22em",
    fontSize: 11,
    fontWeight: 950,
  },
  title: {
    margin: "5px 0 0",
    fontSize: 30,
    lineHeight: 1,
    letterSpacing: "-0.05em",
    fontWeight: 950,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    fontSize: 26,
    fontWeight: 900,
  },
  stage: {
    position: "relative",
    marginTop: 18,
    width: "100%",
    height: preset.aspectRatio < 1 ? "min(72vh, 680px)" : "min(56vh, 420px)",
    overflow: "hidden",
    borderRadius: 24,
    background: "#050505",
    border: "1px solid rgba(255,255,255,0.10)",
    touchAction: "none",
    display: "grid",
    placeItems: "center",
    cursor: "grab",
  },
  image: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
    userSelect: "none",
    pointerEvents: "none",
    transformOrigin: "center center",
    willChange: "transform",
  },
  cropFrame: {
    position: "absolute",
    width: "78%",
    maxHeight: "78%",
    border: "2px solid #d7ff3f",
    boxShadow: "0 0 0 9999px rgba(0,0,0,0.42), 0 0 30px rgba(215,255,63,0.28)",
    borderRadius: 24,
    pointerEvents: "none",
  },
  zoomLabel: {
    display: "grid",
    gap: 8,
    marginTop: 16,
    color: "rgba(255,255,255,0.74)",
    fontWeight: 900,
  },
  range: {
    width: "100%",
    accentColor: "#d7ff3f",
  },
  help: {
    margin: "12px 0 0",
    color: "rgba(255,255,255,0.54)",
    fontSize: 13,
    fontWeight: 650,
  },
  actions: {
    display: "grid",
    gridTemplateColumns: "1fr 1.4fr",
    gap: 10,
    marginTop: 18,
  },
  secondaryButton: {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 999,
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    padding: "13px 14px",
    fontWeight: 950,
  },
  primaryButton: {
    border: 0,
    borderRadius: 999,
    background: "#d7ff3f",
    color: "#050505",
    padding: "13px 14px",
    fontWeight: 950,
  },
};
