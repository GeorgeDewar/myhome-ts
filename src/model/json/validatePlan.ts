import Ajv2020 from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";
import schema from "../../../schema.json";
import { isValidPositiveDistance, isValidPositionInMillimetres } from "../geom/Distance";
import { Point2D } from "../geom/Point2D";
import { DEFAULT_OPENING_HEIGHT_METRES, sashFields } from "../Opening";
import type {
  JsonBuilding,
  JsonColour,
  JsonDefaults,
  JsonFence,
  JsonGeoreference,
  JsonLevel,
  JsonOpening,
  JsonOpeningItem,
  JsonPlan,
  JsonRoom,
  JsonRoomDefaults,
  JsonWall,
} from "./Document";

type PlanShell = Omit<JsonPlan, "buildings" | "fences" | "georeference" | "colours" | "defaults"> & {
  buildings?: unknown[]; fences?: unknown[]; colours?: unknown[]; georeference?: unknown; defaults?: unknown;
};
type BuildingShell = Omit<JsonBuilding, "levels" | "defaults"> & { levels: unknown[]; defaults?: unknown };
type LevelShell = Omit<JsonLevel, "walls" | "rooms" | "defaults"> & {
  walls?: unknown[]; rooms?: unknown[]; defaults?: unknown;
};
type WallShell = Omit<JsonWall, "openings"> & { openings?: unknown[] };
type OpeningShell = Omit<JsonOpening, "contents"> & { contents?: unknown[] };
type RoomShell = Omit<JsonRoom, "defaults"> & { defaults?: unknown };

const buildingSchema = schema.properties.buildings.items;
const levelSchema = buildingSchema.properties.levels.items;
const wallSchema = schema.$defs.wall;
const roomSchema = schema.$defs.room;
const openingSchema = wallSchema.properties.openings.items;
const ajv = new Ajv2020({ strict: false, strictNumbers: true, allErrors: true });
// Children and defaults are validated separately so that a problem in one doesn't discard the whole parent
const shallowSchema = <T extends { properties: object }>(source: T, children: string[]) => {
  const properties: Record<string, unknown> = { ...source.properties };
  for (const child of children) properties[child] = { type: "array" };
  if ("defaults" in properties) properties.defaults = {};
  return { ...source, properties, $defs: schema.$defs };
};

const validatePlan = ajv.compile<PlanShell>({
  ...shallowSchema(schema, ["fences", "buildings", "colours"]),
  properties: { ...schema.properties, fences: { type: "array" }, buildings: { type: "array" }, colours: { type: "array" }, georeference: {}, defaults: {} },
});
const validateDefaults = ajv.compile<JsonDefaults>({ ...schema.$defs.defaults, $defs: schema.$defs });
const validateRoomDefaults = ajv.compile<JsonRoomDefaults>({ ...schema.$defs.roomDefaults, $defs: schema.$defs });
const validateGeoreference = ajv.compile<JsonGeoreference>(schema.properties.georeference);
const validateColour = ajv.compile<JsonColour>(schema.properties.colours.items);
const validateFence = ajv.compile<JsonFence>({ ...schema.properties.fences.items, $defs: schema.$defs });
const validateBuilding = ajv.compile<BuildingShell>(shallowSchema(buildingSchema, ["levels"]));
const validateLevel = ajv.compile<LevelShell>(shallowSchema(levelSchema, ["walls", "rooms"]));
const validateWall = ajv.compile<WallShell>(shallowSchema(wallSchema, ["openings"]));
const validateRoom = ajv.compile<RoomShell>(shallowSchema(roomSchema, []));
const validateOpening = ajv.compile<OpeningShell>(shallowSchema(openingSchema, ["contents"]));
const openingItemSchemas = openingSchema.properties.contents.items.anyOf;
const openingItemValidators = {
  StandardDoor: ajv.compile<JsonOpeningItem>({ ...openingItemSchemas[0], $defs: schema.$defs }),
  SlidingDoor: ajv.compile<JsonOpeningItem>({ ...openingItemSchemas[1], $defs: schema.$defs }),
  Window: ajv.compile<JsonOpeningItem>({ ...openingItemSchemas[2], $defs: schema.$defs }),
  Post: ajv.compile<JsonOpeningItem>(openingItemSchemas[3]),
};

const describeError = (error: ErrorObject | undefined) => {
  if (!error) return "invalid value";
  if (error.keyword === "required") return `missing required property '${error.params.missingProperty}'`;
  if (error.keyword === "unevaluatedProperties") return `unexpected property '${error.params.unevaluatedProperty}'`;
  if (error.keyword === "additionalProperties") return `unexpected property '${error.params.additionalProperty}'`;
  return `${error.instancePath || "value"} ${error.message ?? "is invalid"}`;
};

const isValid = <T>(validator: ValidateFunction<T>, value: unknown, path: string, warnings: string[]): value is T => {
  if (validator(value)) return true;
  const errors = validator.errors ?? [];
  const invalid = errors.find((error) => error.keyword !== "unevaluatedProperties" && error.keyword !== "additionalProperties");
  if (invalid || errors.length === 0) {
    warnings.push(`${path}: ${describeError(invalid)}; ignored.`);
    return false;
  }
  for (const error of errors) {
    warnings.push(`${path}${error.instancePath}: ${describeError(error)}; property ignored.`);
  }
  return true;
};

const validDimensions = (values: Record<string, number | undefined>, path: string, warnings: string[]) => {
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined && !isValidPositiveDistance(value)) {
      warnings.push(`${path}: ${name} is too small to save as a positive distance; ignored.`);
      return false;
    }
  }
  return true;
};

const validLine = (start: JsonFence["start"], end: JsonFence["end"], path: string, warnings: string[]) => {
  if (![...start, ...end].every(isValidPositionInMillimetres)) {
    warnings.push(`${path}: position cannot be accurately represented in integer millimetres; ignored.`);
    return false;
  }
  const from = Point2D.fromJson(start);
  const to = Point2D.fromJson(end);
  const dx = to.x.metres - from.x.metres;
  const dy = to.y.metres - from.y.metres;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (!Number.isFinite(length) || length === 0) {
    warnings.push(`${path}: start and end must define a finite, non-zero line; ignored.`);
    return false;
  }
  return true;
};

const duplicate = <T>(seen: Set<T>, value: T, label: string, path: string, warnings: string[]) => {
  if (seen.has(value)) {
    warnings.push(`${path}: duplicate ${label} '${value}'; ignored.`);
    return true;
  }
  seen.add(value);
  return false;
};

const COLOUR_KEYS = new Set(["colour", "sillColour"]);

// Returns a copy without references to colours that aren't defined in the plan. Arrays are left alone, as the
// objects within them are checked as they are validated.
const withKnownColours = <T>(value: T, path: string, colourIds: ReadonlySet<string>, warnings: string[]): T => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (COLOUR_KEYS.has(key) && typeof child === "string" && !colourIds.has(child)) {
      warnings.push(`${path}.${key}: unknown colour '${child}'; ignored.`);
    } else {
      result[key] = withKnownColours(child, `${path}.${key}`, colourIds, warnings);
    }
  }
  return result as T;
};

// Unknown properties are warned about by isValid; they must not be carried into the model, which writes them back out
const withoutUnknownProperties = <T>(value: T, errors: readonly ErrorObject[] | null | undefined): T => {
  const copy = structuredClone(value);
  for (const error of errors ?? []) {
    if (error.keyword !== "unevaluatedProperties") continue;
    const parent = error.instancePath
      .split("/")
      .slice(1)
      .reduce<unknown>((object, key) => (object as Record<string, unknown> | undefined)?.[key], copy);
    if (parent !== null && typeof parent === "object") delete (parent as Record<string, unknown>)[error.params.unevaluatedProperty];
  }
  return copy;
};

// Removing unknown properties and colours can leave empty groups behind, which carry no information
const withoutEmptyObjects = <T extends object>(value: T): T | undefined => {
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const kept = child !== null && typeof child === "object" ? withoutEmptyObjects(child) : child;
    if (kept !== undefined) result[key] = kept;
  }
  return Object.keys(result).length === 0 ? undefined : (result as T);
};

const validDefaults = <T extends JsonDefaults>(
  validator: ValidateFunction<T>,
  input: unknown,
  path: string,
  colourIds: ReadonlySet<string>,
  warnings: string[],
): T | undefined => {
  if (input === undefined) return undefined;
  if (!isValid(validator, input, path, warnings)) return undefined;
  const value = withoutUnknownProperties(input, validator.errors);
  const dimensions: Record<string, number | undefined> = {
    "wall.width": value.wall?.width,
    "ceiling.height": value.ceiling?.height,
    "interiorDoor.thickness": value.interiorDoor?.thickness,
    "exteriorDoor.thickness": value.exteriorDoor?.thickness,
    ...Object.fromEntries(sashFields.map((field) => [`window.sash.${field}`, value.window?.sash?.[field]])),
  };
  return validDimensions(dimensions, path, warnings)
    ? withoutEmptyObjects(withKnownColours(value, path, colourIds, warnings))
    : undefined;
};

const withDefaults = <T extends object>(shell: T & { defaults?: unknown }, defaults: object | undefined) => {
  const { defaults: _unvalidated, ...rest } = shell;
  return { ...rest, ...(defaults === undefined ? {} : { defaults }) };
};

export const validatePlanJson = (input: unknown): { document: JsonPlan; warnings: string[] } => {
  const warnings: string[] = [];
  if (!isValid(validatePlan, input, "plan", warnings)) return { document: {}, warnings };
  const georeference = input.georeference !== undefined &&
    isValid(validateGeoreference, input.georeference, "georeference", warnings)
    ? input.georeference : undefined;

  const colours: JsonColour[] = [];
  const colourIds = new Set<string>();
  (input.colours ?? []).forEach((value, index) => {
    const path = `colours[${index}]`;
    if (!isValid(validateColour, value, path, warnings)) return;
    if (duplicate(colourIds, value.id, "colour id", path, warnings)) return;
    colours.push({ id: value.id, name: value.name,
      ...(value.description === undefined ? {} : { description: value.description }), value: value.value });
  });

  const fences: JsonFence[] = [];
  const fenceIds = new Set<string>();
  (input.fences ?? []).forEach((value, index) => {
    const path = `fences[${index}]`;
    if (!isValid(validateFence, value, path, warnings)) return;
    if (!validDimensions({ width: value.width, height: value.height }, path, warnings)) return;
    if (!validLine(value.start, value.end, path, warnings)) return;
    if (duplicate(fenceIds, value.id, "fence id", path, warnings)) return;
    fences.push(value);
  });

  const buildings: JsonBuilding[] = [];
  (input.buildings ?? []).forEach((buildingValue, buildingIndex) => {
    const buildingPath = `buildings[${buildingIndex}]`;
    if (!isValid(validateBuilding, buildingValue, buildingPath, warnings)) return;
    const levels: JsonLevel[] = [];
    const levelNumbers = new Set<number>();
    buildingValue.levels.forEach((levelValue, levelIndex) => {
      const levelPath = `${buildingPath}.levels[${levelIndex}]`;
      if (!isValid(validateLevel, levelValue, levelPath, warnings)) return;
      if (!validDimensions({ totalHeight: levelValue.totalHeight }, levelPath, warnings)) return;
      if (duplicate(levelNumbers, levelValue.number, "level number", levelPath, warnings)) return;

      const walls: JsonWall[] = [];
      const wallIds = new Set<string>();
      (levelValue.walls ?? []).forEach((wallValue, wallIndex) => {
        const wallPath = `${levelPath}.walls[${wallIndex}]`;
        if (!isValid(validateWall, wallValue, wallPath, warnings)) return;
        if (!validDimensions({ width: wallValue.width }, wallPath, warnings)) return;
        if (!validLine(wallValue.start, wallValue.end, wallPath, warnings)) return;
        if (duplicate(wallIds, wallValue.id, "wall id", wallPath, warnings)) return;

        const openings: JsonOpening[] = [];
        const openingIds = new Set<string>();
        (wallValue.openings ?? []).forEach((openingValue, openingIndex) => {
          const openingPath = `${wallPath}.openings[${openingIndex}]`;
          if (!isValid(validateOpening, openingValue, openingPath, warnings)) return;
          if (!validDimensions({ width: openingValue.width, height: openingValue.height }, openingPath, warnings))
            return;
          if (
            !isValidPositionInMillimetres(openingValue.distanceAlongWall) ||
            (openingValue.distanceFromFloor !== undefined &&
              !isValidPositionInMillimetres(openingValue.distanceFromFloor))
          ) {
            warnings.push(`${openingPath}: position cannot be accurately represented in integer millimetres; ignored.`);
            return;
          }
          if (duplicate(openingIds, openingValue.id, "opening id", openingPath, warnings)) return;
          const contents: JsonOpeningItem[] = [];
          (openingValue.contents ?? []).forEach((item, itemIndex) => {
            const itemPath = `${openingPath}.contents[${itemIndex}]`;
            const type = item !== null && typeof item === "object" && "type" in item ? item.type : undefined;
            if (type !== "StandardDoor" && type !== "SlidingDoor" && type !== "Window" && type !== "Post") {
              const reason =
                typeof type === "string"
                  ? `unknown opening item type '${type}'`
                  : "missing or invalid opening item type";
              warnings.push(`${itemPath}: ${reason}; ignored.`);
              return;
            }
            if (!isValid(openingItemValidators[type], item, itemPath, warnings)) return;
            if (!validDimensions({ width: item.width, height: item.height,
              ...((item.type === "StandardDoor" || item.type === "SlidingDoor") ? { thickness: item.thickness } : {}) },
            itemPath, warnings))
              return;
            if (item.type === "Window" && item.sash &&
              !validDimensions(Object.fromEntries(sashFields.map((field) => [field, item.sash?.[field]])), `${itemPath}.sash`, warnings)) return;
            if ((item.x !== undefined && !isValidPositionInMillimetres(item.x)) ||
              (item.y !== undefined && !isValidPositionInMillimetres(item.y))) {
              warnings.push(`${itemPath}: position cannot be accurately represented in integer millimetres; ignored.`);
              return;
            }
            const height = openingValue.height ?? DEFAULT_OPENING_HEIGHT_METRES * 1000;
            if ((item.x ?? 0) + (item.width ?? openingValue.width) > openingValue.width ||
                (item.y ?? 0) + (item.height ?? height) > height) {
              warnings.push(`${itemPath}: item extends outside the opening; ignored.`);
              return;
            }
            contents.push(withKnownColours(item, itemPath, colourIds, warnings));
          });
          openings.push({ ...withKnownColours(openingValue, openingPath, colourIds, warnings), contents });
        });
        walls.push({ ...withKnownColours(wallValue, wallPath, colourIds, warnings), openings });
      });

      const rooms: JsonRoom[] = [];
      (levelValue.rooms ?? []).forEach((roomValue, roomIndex) => {
        const roomPath = `${levelPath}.rooms[${roomIndex}]`;
        if (!isValid(validateRoom, roomValue, roomPath, warnings)) return;
        if (!validDimensions({ fontSize: roomValue.label?.fontSize }, roomPath, warnings)) return;
        if (roomValue.label?.position && !roomValue.label.position.every(isValidPositionInMillimetres)) {
          warnings.push(`${roomPath}: label position cannot be accurately represented in integer millimetres; ignored.`);
          return;
        }
        const missing = roomValue.walls.find(({ ref }) => !wallIds.has(ref));
        if (missing) {
          warnings.push(`${roomPath}: references unknown wall '${missing.ref}'; ignored.`);
          return;
        }
        rooms.push(withDefaults(roomValue, validDefaults(validateRoomDefaults, roomValue.defaults, `${roomPath}.defaults`, colourIds, warnings)));
      });
      levels.push(withDefaults({ ...levelValue, walls, rooms },
        validDefaults(validateDefaults, levelValue.defaults, `${levelPath}.defaults`, colourIds, warnings)));
    });
    buildings.push(withDefaults({ ...buildingValue, levels },
      validDefaults(validateDefaults, buildingValue.defaults, `${buildingPath}.defaults`, colourIds, warnings)));
  });

  return { document: withDefaults({ ...input, georeference, colours, fences, buildings },
    validDefaults(validateDefaults, input.defaults, "defaults", colourIds, warnings)), warnings };
};
