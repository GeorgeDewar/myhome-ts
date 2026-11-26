export const windowTypes = {
  awning: { sashRequired: true, description: "An opening sash hinged at the top." },
  fixed: { sashRequired: true, description: "A non-opening sash." },
  direct: { sashRequired: false, description: "Glass glazed directly into the frame, without a sash." },
} as const;

export type WindowType = keyof typeof windowTypes;

export const isWindowType = (value: string): value is WindowType => Object.hasOwn(windowTypes, value);
