"use client";

export default function TrainingImage({ image, title }) {
  const src = image?.src || "";
  const position = image?.position || "center center";

  return (
    <div
      aria-label={title ? `${title} photo` : "Training photo"}
      style={{
        ...styles.image,
        ...(src
          ? {
              backgroundImage: `url("${src}")`,
              backgroundPosition: position,
              backgroundSize: "cover",
              backgroundRepeat: "no-repeat",
            }
          : {}),
      }}
    >
      <div style={styles.overlay} />
    </div>
  );
}

const styles = {
  image: {
    position: "relative",
    width: "100%",
    minWidth: 0,
    height: "clamp(190px, 47vw, 285px)",
    borderRadius: 24,
    overflow: "hidden",
    background:
      "radial-gradient(circle at 78% 18%, rgba(228,239,22,0.11), transparent 34%), linear-gradient(145deg, #171c23, #06080c)",
    border: "1px solid rgba(255,255,255,0.085)",
    alignSelf: "start",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
  },
  overlay: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(180deg, rgba(0,0,0,0.12), rgba(0,0,0,0.12) 40%, rgba(0,0,0,0.58)), radial-gradient(circle at 82% 12%, rgba(228,239,22,0.08), transparent 36%)",
    pointerEvents: "none",
  },
};
