import type { Wall } from "../Wall";

export const DEFAULT_NEW_OPENING_WIDTH_MM = 900;

export type OpeningPlacement = { distanceAlongWall: number; width: number };

export const wallLengthMillimetres = (wall: Wall) =>
  Math.hypot(wall.to.x.metres - wall.from.x.metres, wall.to.y.metres - wall.from.y.metres) * 1000;

// Places an opening of up to `desiredWidth` in the free gap containing `click`, keeping the
// centre an integer number of millimetres. The opening shrinks to fit a gap smaller than desired
// and slides along the gap rather than shrinking when the click is near its edge.
export const placeOpening = (
  wallLength: number,
  existing: { distanceAlongWall: number; width: number }[],
  click: number,
  desiredWidth = DEFAULT_NEW_OPENING_WIDTH_MM,
): OpeningPlacement | undefined => {
  if (!(click >= 0 && click <= wallLength)) return;
  const spans = existing.map(({ distanceAlongWall, width }) => ({
    left: distanceAlongWall - width / 2,
    right: distanceAlongWall + width / 2,
  }));
  if (spans.some((span) => span.left < click && click < span.right)) return;
  const low = Math.ceil(Math.max(0, ...spans.filter((span) => span.right <= click).map((span) => span.right)));
  const high = Math.floor(Math.min(wallLength, ...spans.filter((span) => span.left >= click).map((span) => span.left)));
  let width = Math.min(desiredWidth, high - low);
  if (width % 2 !== 0) width -= 1;
  if (width <= 0) return;
  const left = Math.min(Math.max(Math.round(click - width / 2), low), high - width);
  return { distanceAlongWall: left + width / 2, width };
};

export const placeOpeningOnWall = (wall: Wall, click: number): OpeningPlacement | undefined =>
  placeOpening(
    wallLengthMillimetres(wall),
    wall.openings.map((opening) => ({
      distanceAlongWall: opening.distanceAlongWall.toJson(),
      width: opening.width.toJson(),
    })),
    click,
  );
