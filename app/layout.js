import "../styles/globals.css";
import "../styles/route-sport-grid.css";
import "../styles/training-photo-preview.css";
import TrainingSportDeduper from "../components/TrainingSportDeduper";

export const metadata = {
  title: "Endurance",
  description: "Verified Social Training Platform",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#050505",
          color: "white",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <TrainingSportDeduper />
        {children}
      </body>
    </html>
  );
}
