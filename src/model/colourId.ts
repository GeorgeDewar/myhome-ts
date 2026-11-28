export const slugifyColourName = (name: string) =>
  name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export const uniqueColourId = (name: string, takenIds: readonly string[]) => {
  const base = slugifyColourName(name);
  if (!base) return "";
  let id = base;
  for (let suffix = 2; takenIds.includes(id); suffix++) id = `${base}-${suffix}`;
  return id;
};
