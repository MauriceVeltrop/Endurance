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
    width: 108,
    minWidth: 108,
    height: 132,
    borderRadius: 22,
    overflow: "hidden",
    background:
      "radial-gradient(circle at 78% 18%, rgba(228,239,22,0.16), transparent 34%), linear-gradient(145deg, #151915, #060706)",
    border: "1px solid rgba(255,255,255,0.10)",
    alignSelf: "start",
  },
  overlay: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.42)), radial-gradient(circle at 80% 12%, rgba(228,239,22,0.12), transparent 36%)",
    pointerEvents: "none",
  },
};
