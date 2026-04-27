
'use client'

import React from "react";

function getSportBackground(sports = []) {
  const list = Array.isArray(sports) ? sports : [sports];

  if (list.some((s) => String(s).toLowerCase().includes("trail"))) {
    return "/images/trailrunner-bg.svg";
  }

  if (list.some((s) => String(s).toLowerCase().includes("running"))) {
    return "/images/runner-bg.svg";
  }

  if (list.some((s) => String(s).toLowerCase().includes("cycling"))) {
    return "/images/roadcycling-bg.svg";
  }

  if (
    list.some((s) =>
      String(s).toLowerCase().includes("gravel") ||
      String(s).toLowerCase().includes("mtb") ||
      String(s).toLowerCase().includes("mountain")
    )
  ) {
    return "/images/gravel-mtb-bg.svg";
  }

  return null;
}

export default function EventCard({ event }) {

  const sports = event?.sports || [];
  const sportBackground = getSportBackground(sports);

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: "22px",
        padding: "28px",
        background: "linear-gradient(180deg,#0f0f0f,#050505)",
        boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
        color: "white",
        marginBottom: "22px"
      }}
    >

      {sportBackground && (
        <img
          src={sportBackground}
          alt=""
          aria-hidden="true"
          style={{
            position: "absolute",
            right: "-80px",
            top: "40px",
            width: "70%",
            maxWidth: "420px",
            height: "auto",
            opacity: 0.35,
            zIndex: 0,
            pointerEvents: "none",
            filter: "drop-shadow(0 0 30px rgba(215,255,0,0.35))"
          }}
        />
      )}

      <div style={{ position: "relative", zIndex: 2 }}>

        <div style={{color:"#d7ff00",fontWeight:600,marginBottom:8}}>
          {sports.join(" • ")}
        </div>

        <h2 style={{fontSize:28,fontWeight:700,marginBottom:16}}>
          {event.title}
        </h2>

        <div style={{opacity:.85,marginBottom:10}}>
          📍 {event.location}
        </div>

        <div style={{
          display:"inline-block",
          padding:"8px 14px",
          borderRadius:20,
          background:"#1c1c1c",
          marginBottom:20
        }}>
          {event.distance} km
        </div>

        <div style={{opacity:.85,marginBottom:10}}>
          📅 {event.date}
        </div>

        <div style={{opacity:.85}}>
          ⏰ {event.time}
        </div>

      </div>
    </div>
  );
}
