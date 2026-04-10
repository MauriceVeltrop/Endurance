export const metadata = {
  title: "Endurance",
  description: "Platform voor geplande trainingen",
};

export default function RootLayout({ children }) {
  return (
    <html lang="nl">
      <body style={{ margin: 0, background: "#050505" }}>
        {children}
      </body>
    </html>
  );
}
