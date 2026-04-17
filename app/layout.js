export const metadata = {
  title: "Endurance",
  description: "Train samen. Word sterker.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="nl">
      <head />
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: "#f4f4f4"
        }}
      >
        {children}
      </body>
    </html>
  );
}
