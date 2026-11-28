const layers = [
  { id: "fences", label: "Fences" },
  { id: "normalWalls", label: "Walls, normal" },
  { id: "virtualWalls", label: "Walls, virtual" },
  { id: "atticWalls", label: "Walls, attic" },
  { id: "roomLabels", label: "Room labels" },
  { id: "doors", label: "Doors" },
  { id: "compass", label: "Compass" },
] as const;

export type LayerVisibility = Record<(typeof layers)[number]["id"], boolean>;

export const Layers = ({
  visibility,
  onChange,
}: {
  visibility: LayerVisibility;
  onChange: (visibility: LayerVisibility) => void;
}) => (
  <section aria-label="Layers">
    <div className="layer-description">2D plan visibility</div>
    <div className="layer-list">
      {layers.map(({ id, label }) => (
        <label key={id}>
          <input
            type="checkbox"
            checked={visibility[id]}
            onChange={(event) => onChange({ ...visibility, [id]: event.target.checked })}
          />
          {label}
        </label>
      ))}
    </div>
  </section>
);
