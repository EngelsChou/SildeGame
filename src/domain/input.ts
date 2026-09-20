export interface KeyBindings {
  up: string;
  down: string;
  left: string;
  right: string;
  skill1: string;
  skill2: string;
}
export const DEFAULT_KEYS: KeyBindings = {
  up: "KeyW",
  down: "KeyS",
  left: "KeyA",
  right: "KeyD",
  skill1: "Digit1",
  skill2: "Digit2",
};
// Only physical gameplay keys: browser shortcuts and fixed fallback keys stay reserved.
export const canBindKey = (code: string) =>
  /^(Key[A-Z]|Digit[0-9]|Space|ShiftLeft|ShiftRight)$/.test(code);
export function isKeyBindings(value: unknown): value is KeyBindings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const codes = Object.keys(DEFAULT_KEYS).map((key) => candidate[key]);
  return (
    codes.every((code) => typeof code === "string" && canBindKey(code)) &&
    new Set(codes).size === codes.length
  );
}
