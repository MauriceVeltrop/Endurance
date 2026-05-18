"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CROP_PRESETS, cropImageToFile, createObjectUrl, revokeObjectUrl } from "../lib/imageCropper";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeName(file, fallback) {
  const original = file?.name || fallback || "cropped-image.jpg";
  const base = original.replace(/\.[^.]+$/, "");
  return `${base}-cropped.jpg`;
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
  const dragRef = useRef(null);
  const [imageUrl, setImageUrl] = useState("");
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [crop, setCrop] = useState({ x: 0, y: 0, width: 1, height: 1 });
  const [busy, setBusy] = useState(false);

  const aspectLabel = useMemo(() => (mode === "avatar" ? "Square avatar" : "Wide training hero"), [mode]);

  useEffect(() => {
    const url = createObjectUrl(file);
    setImageUrl(url);
    setReady(false);

    return () => revokeObjectUrl(url);
  }, [file]);

  function setupCrop() {
    const image = imageRef.current;
    if (!image) return;

    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;
    const aspect = preset.aspectRatio || 1;

    let width = naturalWidth;
    let height = width / aspect;

    if (height > naturalHeight) {
      height = naturalHeight;
      width = height * aspect;
    }

    setCrop({
      x: Math.max(0, (naturalWidth - width) / 2),
      y: Math.max(0, (naturalHeight - height) / 2),
      width,
      height,
    });
    setZoom(1);
    setReady(true);
  }

  function moveCrop(deltaX, deltaY) {
    const image = imageRef.current;
    if (!image) return;

    setCrop((current) => ({
      ...current,
      x: clamp(current.x + deltaX, 0, image.naturalWidth - current.width),
      y: clamp(current.y + deltaY, 0, image.naturalHeight - current.height),
    }));
  }

  function startDrag(event) {
    const point = event.touches?.[0] || event;
    dragRef.current = {
      x: point.clientX,
      y: point.clientY,
    };
  }

  function duringDrag(event) {
    if (!dragRef.current) return;
    const point = event.touches?.[0] || event;
    const scale = imageRef.current ? imageRef.current.naturalWidth / imageRef.current.clientWidth : 1;
    const dx = (dragRef.current.x - point.clientX) * scale;
    const dy = (dragRef.current.y - point.clientY) * scale;
    dragRef.current = { x: point.clientX, y: point.clientY };
    moveCrop(dx, dy);
  }

  function endDrag() {
    dragRef.current = null;
  }

  async function confirmCrop() {
    if (!imageRef.current || busy) return;
    setBusy(true);

    try {
      const croppedFile = await cropImageToFile({
        image: imageRef.current,
        crop,
        zoom,
        preset,
        fileName: safeName(file, mode === "avatar" ? "avatar.jpg" : "training-photo.jpg"),
      });

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
              onLoad={setupCrop}
              style={{
                ...styles.image,
                transform: `scale(${zoom})`,
              }}
              draggable={false}
            />
          ) : null}

          {ready ? (
            <div
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

        <p style={styles.help}>Drag the image to position it. Use zoom to frame the subject.</p>

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
    height: "min(56vh, 420px)",
    overflow: "hidden",
    borderRadius: 24,
    background: "#050505",
    border: "1px solid rgba(255,255,255,0.10)",
    touchAction: "none",
    display: "grid",
    placeItems: "center",
  },
  image: {
    maxWidth: "100%",
    maxHeight: "100%",
    userSelect: "none",
    pointerEvents: "none",
    transition: "transform 120ms ease",
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
