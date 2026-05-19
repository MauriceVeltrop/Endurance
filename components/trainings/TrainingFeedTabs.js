// components/trainings/TrainingFeedTabs.js
export default function TrainingFeedTabs({ active = "upcoming", onChange }) {
  const tabs = [
    ["upcoming", "Upcoming"],
    ["flexible", "Flexible"],
    ["team", "Team"],
    ["nearby", "Nearby"],
  ];

  return (
    <div className="training-tabs" role="tablist">
      {tabs.map(([key, label]) => (
        <button
          key={key}
          type="button"
          className={active === key ? "active" : ""}
          onClick={() => onChange?.(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
