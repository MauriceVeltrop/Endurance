"use client";

import dynamic from "next/dynamic";

const DetailRouteMapClient = dynamic(() => import("./DetailRouteMapClient"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: "100%",
        height: 240,
        borderRadius: 18,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.10)",
      }}
    />
  ),
});

export default function DetailRouteMap(props) {
  return <DetailRouteMapClient {...props} />;
}
