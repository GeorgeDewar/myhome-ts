import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { union, type MultiPolygon, type Polygon } from "polygon-clipping";
import type { JsonGeoreference } from "../model/json/Document";
import { roomPolygon } from "../model/geom/roomPolygon";
import type { Room } from "../model/Room";
import { mapScales, planToGeographic } from "./georeference";
import type { PlanView2DStatus } from "./PlanView2D";

maplibregl.setWorkerUrl(mapWorkerUrl);

export type BaseMapSettings = {
  enabled: boolean;
  key: string;
  type: "street" | "aerial";
  insideOpacity: number;
  outsideOpacity: number;
};

export const BaseMap = ({
  settings,
  reference,
  status,
  rooms,
  version,
  level,
}: {
  settings: BaseMapSettings;
  reference: JsonGeoreference;
  status: PlanView2DStatus;
  rooms: Room[];
  version: number;
  level: number;
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<maplibregl.Map>(null);
  const stateRef = useRef({ settings, reference, status, rooms });
  const [error, setError] = useState("");
  useLayoutEffect(() => {
    stateRef.current = { settings, reference, status, rooms };
  });

  useEffect(() => {
    if (!mapContainer.current || !canvasRef.current || !settings.key) return;
    const canvas = canvasRef.current;
    const container = mapContainer.current;
    const style = settings.type === "street" ? "topolite-v2" : "labels-v2";
    const key = encodeURIComponent(settings.key);
    const map = new maplibregl.Map({
      container,
      style: `https://basemaps.linz.govt.nz/v1/tiles/topographic-v2/WebMercatorQuad/style/${style}.json?api=${key}`,
      interactive: false,
      attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
      maxZoom: 24,
    });
    mapRef.current = map;
    setError("");

    const resize = () => {
      const { clientWidth, clientHeight } = canvas;
      if (!clientWidth || !clientHeight) return;
      const size = Math.ceil(Math.hypot(clientWidth, clientHeight) * 1.1);
      container.style.width = `${size}px`;
      container.style.height = `${size}px`;
      map.resize();
    };
    const updateCamera = () => {
      const { reference, status } = stateRef.current;
      const { clientWidth, clientHeight } = canvas;
      if (!clientWidth || !clientHeight) return;
      const centre = {
        x: status.offset.x + clientWidth / (2 * status.scale),
        y: status.offset.y + clientHeight / (2 * status.scale),
      };
      const location = planToGeographic(reference, centre);
      const pixelsPerProjectedMetre = status.scale / mapScales(reference.latitude).east;
      const zoom = Math.log2((pixelsPerProjectedMetre * 2 * Math.PI * 6378137) / 512);
      map.jumpTo({ center: [location.longitude, location.latitude], zoom });
    };
    const paint = () => {
      const { settings, reference, status, rooms } = stateRef.current;
      const context = canvas.getContext("2d");
      if (!context || !canvas.clientWidth || !canvas.clientHeight) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * ratio);
      canvas.height = Math.round(canvas.clientHeight * ratio);
      const polygons = rooms
        .map(roomPolygon)
        .filter((points) => points.length >= 3 && points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)))
        .map((points): Polygon => [
          [...points.map(({ x, y }): [number, number] => [x, y]), [points[0].x, points[0].y]],
        ]);
      let interior: MultiPolygon = [];
      try {
        if (polygons.length) interior = union(polygons[0], ...polygons.slice(1));
      } catch (cause) {
        console.error("Could not calculate the basemap room mask", cause);
        setError("Could not display the basemap: a room has invalid geometry.");
        return;
      }
      const addRooms = () => {
        for (const polygon of interior)
          for (const ring of polygon) {
            context.moveTo(ring[0][0], ring[0][1]);
            for (const point of ring.slice(1)) context.lineTo(point[0], point[1]);
            context.closePath();
          }
      };
      const draw = (opacity: number, inside: boolean) => {
        if (opacity <= 0) return;
        context.save();
        context.setTransform(
          status.scale * ratio,
          0,
          0,
          status.scale * ratio,
          -status.offset.x * status.scale * ratio,
          -status.offset.y * status.scale * ratio,
        );
        context.beginPath();
        if (!inside)
          context.rect(
            status.offset.x,
            status.offset.y,
            canvas.clientWidth / status.scale,
            canvas.clientHeight / status.scale,
          );
        addRooms();
        context.clip("evenodd");
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.globalAlpha = opacity;
        context.translate(canvas.clientWidth / 2, canvas.clientHeight / 2);
        context.rotate((-reference.bearing * Math.PI) / 180);
        const metresPerPixel = (2 * Math.PI * 6378137) / (512 * 2 ** map.getZoom());
        const scales = mapScales(reference.latitude);
        context.scale((status.scale * metresPerPixel) / scales.east, (status.scale * metresPerPixel) / scales.north);
        const source = map.getCanvas();
        context.drawImage(
          source,
          -container.clientWidth / 2,
          -container.clientHeight / 2,
          container.clientWidth,
          container.clientHeight,
        );
        context.restore();
      };
      draw(settings.outsideOpacity, false);
      draw(settings.insideOpacity, true);
    };
    map.on("error", (event) => {
      console.error(
        "LINZ basemap error:",
        event.error.message.replaceAll(settings.key, "[redacted]").replaceAll(key, "[redacted]"),
      );
      setError("Could not load the LINZ basemap. Check the API key and network connection.");
    });
    map.on("render", paint);
    map.on("style.load", () => {
      if (settings.type !== "aerial") return;
      map.addSource("linz-aerial", {
        type: "raster",
        tiles: [`https://basemaps.linz.govt.nz/v1/tiles/aerial/WebMercatorQuad/{z}/{x}/{y}.webp?api=${key}`],
        tileSize: 256,
        maxzoom: 22,
      });
      map.addLayer({ id: "linz-aerial", type: "raster", source: "linz-aerial" }, map.getStyle().layers[0]?.id);
      map.addLayer({
        id: "linz-building-outlines",
        type: "line",
        source: "LINZ Basemaps",
        "source-layer": "buildings",
        filter: ["==", ["get", "kind"], "building"],
        paint: { "line-color": "#ffffff", "line-width": 1.5 },
      });
    });
    const observer = new ResizeObserver(() => {
      resize();
      updateCamera();
    });
    observer.observe(canvas);
    resize();
    updateCamera();
    return () => {
      observer.disconnect();
      map.off("render", paint);
      map.remove();
      mapRef.current = null;
    };
  }, [settings.key, settings.type]);

  useEffect(() => {
    const map = mapRef.current;
    const canvas = canvasRef.current;
    if (!map || !canvas || !canvas.clientWidth || !canvas.clientHeight) return;
    const centre = {
      x: status.offset.x + canvas.clientWidth / (2 * status.scale),
      y: status.offset.y + canvas.clientHeight / (2 * status.scale),
    };
    const location = planToGeographic(reference, centre);
    const zoom = Math.log2(((status.scale / mapScales(reference.latitude).east) * 2 * Math.PI * 6378137) / 512);
    map.jumpTo({ center: [location.longitude, location.latitude], zoom });
    map.triggerRepaint();
  }, [
    reference,
    status.scale,
    status.offset.x,
    status.offset.y,
    settings.insideOpacity,
    settings.outsideOpacity,
    version,
    level,
  ]);

  return (
    <>
      <div className="basemap-renderer" ref={mapContainer} aria-hidden="true" />
      <canvas className="basemap-canvas" ref={canvasRef} aria-hidden="true" />
      <div className="basemap-north" aria-label="North direction">
        <span style={{ transform: `rotate(${-reference.bearing}deg)` }}>↑</span> N
      </div>
      <div className="basemap-attribution">
        ©{" "}
        <a href="https://www.linz.govt.nz/linz-copyright" target="_blank" rel="noreferrer">
          LINZ CC BY 4.0
        </a>{" "}
        <a
          href="https://www.linz.govt.nz/data/linz-data/linz-basemaps/data-attribution"
          target="_blank"
          rel="noreferrer"
        >
          Basemap contributors
        </a>
      </div>
      {error && (
        <div className="basemap-error" role="alert">
          {error}
        </div>
      )}
    </>
  );
};
