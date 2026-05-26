// app/routes/draw/page.js
import FullscreenRouteDrawPage from "../../../components/routes/FullscreenRouteDrawPage";

export const dynamic = "force-dynamic";
// route controls global css fix: controls CSS lives in styles/globals.css

export default function DrawRoutePage() {
  return <FullscreenRouteDrawPage />;
}
