// components/trainings/TrainingStats.js
export default function TrainingStats({ training }) {
  const stats = [];

  if (training?.distance_km) stats.push({ label: "Distance", value: `${Number(training.distance_km).toFixed(Number(training.distance_km) % 1 ? 1 : 0)} km` });
  if (training?.estimated_duration_min) stats.push({ label: "Duration", value: `${training.estimated_duration_min} min` });
  if (training?.intensity_label) stats.push({ label: "Effort", value: training.intensity_label });
  if (training?.planning_type) stats.push({ label: "Planning", value: training.planning_type === "flexible" ? "Flexible" : "Fixed" });

  if (!stats.length) return null;

  return (
    <div className="training-stats">
      {stats.slice(0, 4).map((stat) => (
        <div key={stat.label} className="training-stat">
          <span>{stat.label}</span>
          <strong>{stat.value}</strong>
        </div>
      ))}
    </div>
  );
}
