export function clampZoom(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function pinchScaleFactor(deltaY: number) {
  return Math.exp(-deltaY * 0.003);
}
