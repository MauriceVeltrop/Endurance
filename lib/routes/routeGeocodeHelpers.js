import { cleanRouteLocationName, pickHumanLocationLabel } from "./routeTitleHelpers";

export async function resolveHumanLocationLabelFromCoordinates({ lat, lon }) {
  const safeLat = Number(lat);
  const safeLon = Number(lon);

  if (!Number.isFinite(safeLat) || !Number.isFinite(safeLon)) return "";

  try {
    const response = await fetch(`/api/geocode/reverse?lat=${encodeURIComponent(safeLat)}&lon=${encodeURIComponent(safeLon)}`);
    if (!response.ok) return "";
    const data = await response.json();
    return pickHumanLocationLabel(data);
  } catch (error) {
    console.warn("Could not resolve route endpoint location", error);
    return "";
  }
}

export async function resolvePlaceNameFromCoordinates({ lat, lon }) {
  const safeLat = Number(lat);
  const safeLon = Number(lon);

  if (!Number.isFinite(safeLat) || !Number.isFinite(safeLon)) return "";

  try {
    const response = await fetch(`/api/geocode/reverse?lat=${encodeURIComponent(safeLat)}&lon=${encodeURIComponent(safeLon)}`);
    if (!response.ok) return "";
    const data = await response.json();

    return cleanRouteLocationName(
      data?.place ||
      data?.city ||
      data?.town ||
      data?.village ||
      data?.municipality ||
      data?.locality ||
      data?.county ||
      data?.label ||
      data?.display_name ||
      ""
    );
  } catch (error) {
    console.warn("Could not resolve route start location", error);
    return "";
  }
}
