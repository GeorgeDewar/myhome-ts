export const Compass = ({ bearing }: { bearing?: number }) => {
  if (bearing === undefined) return null;

  return (
    <svg className="plan-compass" viewBox="0 0 72 72" role="img" aria-label="Compass: north, east, south and west">
      <circle cx="36" cy="36" r="34" fill="white" fillOpacity="0.0" stroke="#64748b" strokeOpacity="0.5" />
      <g transform={`translate(36 36) rotate(${-bearing})`}>
        <path d="M 0 -18 L 0 18 M -18 0 L 18 0" fill="none" stroke="#64748b" />
        <path d="M 0 -20 L -3 -12 L 0 -14 L 3 -12 Z" fill="#b42318" />
        {(
          [
            ["N", 0, -27],
            ["E", 27, 0],
            ["S", 0, 27],
            ["W", -27, 0],
          ] as const
        ).map(([label, x, y]) => (
          <text
            key={label}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            transform={`rotate(${bearing} ${x} ${y})`}
            fill={label === "N" ? "#b42318" : "#243b53"}
          >
            {label}
          </text>
        ))}
      </g>
    </svg>
  );
};
