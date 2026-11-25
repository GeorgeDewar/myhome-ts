import { DEFAULT_OPENING_HEIGHT_METRES, type Opening, type OpeningItem } from "../Opening";
import { Distance, isValidPositionInMillimetres, isValidPositiveDistance } from "./Distance";

export type ItemRectangle = { x: number; y: number; width: number; height: number };

export const openingSize = (opening: Opening) => ({
  width: opening.width.toJson(),
  height: opening.height?.toJson() ?? DEFAULT_OPENING_HEIGHT_METRES * 1000,
});

export const itemRectangle = (opening: Opening, item: OpeningItem): ItemRectangle => {
  const size = openingSize(opening);
  return {
    x: item.x?.toJson() ?? 0,
    y: item.y?.toJson() ?? 0,
    width: item.width?.toJson() ?? size.width,
    height: item.height?.toJson() ?? size.height,
  };
};

export const largestEmptyRectangle = (
  width: number, height: number, items: ItemRectangle[], point: { x: number; y: number },
): ItemRectangle | undefined => {
  if (point.x < 0 || point.x >= width || point.y < 0 || point.y >= height ||
    items.some((item) => point.x >= item.x && point.x < item.x + item.width &&
      point.y >= item.y && point.y < item.y + item.height)) return;

  const leftEdges = [...new Set([0, ...items.map((item) => Math.ceil(item.x + item.width))])]
    .filter((edge) => edge <= point.x && isValidPositionInMillimetres(edge)).sort((a, b) => a - b);
  const rightEdges = [...new Set([width, ...items.map((item) => item.x)])]
    .filter((edge) => edge > point.x && edge <= width).sort((a, b) => a - b);
  let best: ItemRectangle | undefined;
  for (const x of leftEdges) {
    for (const right of rightEdges) {
      let top = 0;
      let bottom = height;
      let blocked = false;
      for (const item of items) {
        if (item.x >= right || item.x + item.width <= x) continue;
        if (item.y + item.height <= point.y) top = Math.max(top, item.y + item.height);
        else if (item.y > point.y) bottom = Math.min(bottom, item.y);
        else { blocked = true; break; }
      }
      const y = Math.ceil(top);
      const itemWidth = Distance.fromJson(right - x).toJson();
      const itemHeight = Distance.fromJson(bottom - y).toJson();
      if (blocked || y > point.y || !isValidPositionInMillimetres(y) ||
        !isValidPositiveDistance(itemWidth) || !isValidPositiveDistance(itemHeight) ||
        x + itemWidth > right || y + itemHeight > bottom) continue;
      if (!best || itemWidth * itemHeight > best.width * best.height) {
        best = { x, y, width: itemWidth, height: itemHeight };
      }
    }
  }
  return best;
};

export const emptySpaceMarkers = (width: number, height: number, items: ItemRectangle[]) => {
  const xs = [...new Set([0, width, ...items.flatMap((item) => [item.x, item.x + item.width])])].sort((a, b) => a - b);
  const ys = [...new Set([0, height, ...items.flatMap((item) => [item.y, item.y + item.height])])].sort((a, b) => a - b);
  const spaces: ItemRectangle[] = [];
  let previous: ItemRectangle[] = [];
  for (let j = 0; j < ys.length - 1; j++) {
    const row: ItemRectangle[] = [];
    for (let i = 0; i < xs.length - 1; i++) {
      const x = xs[i];
      const right = xs[i + 1];
      const y = ys[j];
      const bottom = ys[j + 1];
      if (items.some((item) => item.x < right && item.x + item.width > x &&
        item.y < bottom && item.y + item.height > y)) continue;
      const last = row.at(-1);
      if (last && last.x + last.width === x) last.width = right - last.x;
      else row.push({ x, y, width: right - x, height: bottom - y });
    }
    previous = row.map((space) => {
      const above = previous.find((item) => item.x === space.x && item.width === space.width &&
        item.y + item.height === space.y);
      if (above) {
        above.height = ys[j + 1] - above.y;
        return above;
      }
      spaces.push(space);
      return space;
    });
  }
  return spaces.flatMap((space) => {
    const left = Math.ceil(space.x);
    const top = Math.ceil(space.y);
    const right = space.x + space.width;
    const bottom = space.y + space.height;
    if (left >= right || top >= bottom) return [];
    const point = { x: (left + right) / 2, y: (top + bottom) / 2 };
    if (!largestEmptyRectangle(width, height, items, point)) return [];
    return [{ ...point, size: Math.min(right - left, bottom - top, Math.min(width, height) / 6) }];
  });
};

export const arrangementWarnings = (width: number, height: number, items: ItemRectangle[]) => {
  const xs = [...new Set([0, width, ...items.flatMap((item) => [item.x, item.x + item.width])])].sort((a, b) => a - b);
  const ys = [...new Set([0, height, ...items.flatMap((item) => [item.y, item.y + item.height])])].sort((a, b) => a - b);
  let gap = false;
  let overlap = false;
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const x = (xs[i] + xs[i + 1]) / 2;
      const y = (ys[j] + ys[j + 1]) / 2;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      const count = items.filter((item) =>
        x >= item.x && x < item.x + item.width && y >= item.y && y < item.y + item.height).length;
      if (count === 0) gap = true;
      if (count > 1) overlap = true;
    }
  }
  return { gap, overlap };
};
