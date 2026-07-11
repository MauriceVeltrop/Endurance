import "../styles/globals.css";
import "../styles/route-sport-grid.css";
import "../styles/training-photo-preview.css";
import "../styles/training-route-selector.css";
import "../styles/garmin-route-importer.css";
import TrainingSportDeduper from "../components/TrainingSportDeduper";
import TrainingRouteSelector from "../components/TrainingRouteSelector";
import GarminRouteImporter from "../components/GarminRouteImporter";

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
        <TrainingRouteSelector />
        <GarminRouteImporter />
        {children}
      </body>
    </html>
  );
}
