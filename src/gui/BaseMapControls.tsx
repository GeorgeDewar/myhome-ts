import { useState } from "react";
import type { BaseMapSettings } from "../graphics2d/BaseMap";
import { mercatorLimit } from "../graphics2d/georeference";
import type { JsonGeoreference } from "../model/json/Document";

export const BaseMapControls = ({
  settings,
  onSettingsChange,
  reference,
  aligning,
  choosingPivot,
  onStart,
  onAdjust,
  onChoosePivot,
  onBearing,
  onApply,
  onCancel,
}: {
  settings: BaseMapSettings;
  onSettingsChange: (settings: BaseMapSettings) => void;
  reference?: JsonGeoreference;
  aligning: boolean;
  choosingPivot: boolean;
  onStart: (latitude: number, longitude: number) => void;
  onAdjust: () => void;
  onChoosePivot: () => void;
  onBearing: (bearing: number) => void;
  onApply: () => void;
  onCancel: () => void;
}) => {
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [keyDraft, setKeyDraft] = useState(settings.key);
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const start = () => {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!settings.key.trim()) return setError("Enter a LINZ API key first.");
    if (
      !latitude.trim() ||
      !longitude.trim() ||
      !Number.isFinite(lat) ||
      Math.abs(lat) > mercatorLimit ||
      !Number.isFinite(lon) ||
      Math.abs(lon) > 180
    )
      return setError("Enter a valid latitude and longitude.");
    setError("");
    onStart(lat, lon);
  };
  const locate = () => {
    if (!navigator.geolocation) return setError("Location is unavailable in this browser.");
    setError("");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLatitude(String(coords.latitude));
        setLongitude(String(coords.longitude));
        setLocating(false);
      },
      (failure) => {
        setError(`Could not determine location: ${failure.message}`);
        setLocating(false);
      },
    );
  };
  return (
    <section className="basemap-controls" aria-label="Basemap">
      <div className="panel-heading">Basemap</div>
      <label className="basemap-enabled">
        <input
          type="checkbox"
          checked={settings.enabled}
          disabled={aligning}
          onChange={(event) => onSettingsChange({ ...settings, enabled: event.target.checked })}
        />{" "}
        Show basemap
      </label>
      <label>
        LINZ API key
        <input
          type="password"
          value={keyDraft}
          autoComplete="off"
          onChange={(event) => setKeyDraft(event.target.value)}
        />
      </label>
      <button type="button" onClick={() => onSettingsChange({ ...settings, key: keyDraft.trim() })}>
        Set API key
      </button>
      <a href="https://basemaps.linz.govt.nz/" target="_blank" rel="noreferrer">
        Get a LINZ API key
      </a>
      <label>
        Map type
        <select
          value={settings.type}
          onChange={(event) =>
            onSettingsChange({ ...settings, type: event.target.value === "aerial" ? "aerial" : "street" })
          }
        >
          <option value="street">Street map</option>
          <option value="aerial">Aerial imagery</option>
        </select>
      </label>
      <label>
        Outside opacity
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={settings.outsideOpacity}
          onChange={(event) => onSettingsChange({ ...settings, outsideOpacity: Number(event.target.value) })}
        />
      </label>
      <label>
        Inside opacity
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={settings.insideOpacity}
          onChange={(event) => onSettingsChange({ ...settings, insideOpacity: Number(event.target.value) })}
        />
      </label>
      {!aligning && (
        <>
          <label>
            Latitude
            <input type="number" step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} />
          </label>
          <label>
            Longitude
            <input type="number" step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} />
          </label>
          <button type="button" onClick={locate} disabled={locating}>
            {locating ? "Locating..." : "Use current location"}
          </button>
          <button type="button" onClick={start}>
            Start alignment
          </button>
          {reference && (
            <button type="button" onClick={onAdjust} disabled={!settings.key.trim()}>
              Adjust alignment
            </button>
          )}
        </>
      )}
      {aligning && reference && (
        <>
          <p>Drag the map under the plan. Zoom and rotation stay centred on the anchor.</p>
          <button type="button" onClick={onChoosePivot} aria-pressed={choosingPivot}>
            Choose anchor on plan
          </button>
          <label>
            Bearing (degrees)
            <input
              type="number"
              step="0.1"
              value={reference.bearing}
              onChange={(event) => {
                if (event.target.value !== "" && Number.isFinite(event.target.valueAsNumber))
                  onBearing(event.target.valueAsNumber);
              }}
            />
          </label>
          <button type="button" onClick={onApply}>
            Apply alignment
          </button>
          <button type="button" onClick={onCancel}>
            Cancel alignment
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
};
