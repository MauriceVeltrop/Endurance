export default function TrainingsPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#050505",
        color: "white",
        padding: 24,
      }}
    >
      <h1>Training Sessions</h1>

      <div
        style={{
          display: "flex",
          gap: 16,
          overflowX: "auto",
          paddingBottom: 16,
        }}
      >
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            style={{
              minWidth: 280,
              borderRadius: 28,
              padding: 20,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <div style={{ color: "#e4ef16", fontWeight: 900 }}>
              Running
            </div>

            <h2>Evening Tempo Run</h2>

            <p style={{ color: "rgba(255,255,255,0.7)" }}>
              5:30/km · Landgraaf
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
