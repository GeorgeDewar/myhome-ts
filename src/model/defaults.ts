import type { JsonDefaults, JsonSash } from "./json/Document";

/** Defaults set at one level of the hierarchy (room, level, building, plan, or an item's own overrides). */
export type DefaultsScope = JsonDefaults | undefined;

/** Scopes ordered from nearest (most specific) to furthest. */
export type DefaultsScopes = readonly DefaultsScope[];

export const resolveDefault = <E extends keyof JsonDefaults, P extends keyof NonNullable<JsonDefaults[E]>>(
  scopes: DefaultsScopes,
  element: E,
  property: P,
): NonNullable<JsonDefaults[E]>[P] | undefined => {
  for (const scope of scopes) {
    const value = (scope?.[element] as Record<P, unknown> | undefined)?.[property];
    if (value !== undefined) return value as NonNullable<JsonDefaults[E]>[P];
  }
  return undefined;
};

// A sill takes the trim colour of the nearest scope that sets either.
export const resolveTrimColour = (
  scopes: DefaultsScopes,
  element: "interiorTrim" | "exteriorTrim",
  property: "colour" | "sillColour",
) => {
  for (const scope of scopes) {
    const trim = scope?.[element];
    const value = property === "sillColour" ? (trim?.sillColour ?? trim?.colour) : trim?.colour;
    if (value !== undefined) return value;
  }
  return undefined;
};

export const resolveSashProperty = <F extends keyof JsonSash>(scopes: DefaultsScopes, field: F): JsonSash[F] | undefined => {
  for (const scope of scopes) {
    const value = scope?.window?.sash?.[field];
    if (value !== undefined) return value;
  }
  return undefined;
};
