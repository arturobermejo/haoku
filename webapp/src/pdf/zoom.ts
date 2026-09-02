/** How the reader decides the render scale. 1 = PDF points at 96dpi. */
export type ZoomMode = { kind: 'reading' } | { kind: 'fit' } | { kind: 'manual'; scale: number }

/** Sheets render at ~760px wide by default, the width the design was drawn at. */
export const READING_WIDTH = 760
/** Room kept on each side of the sheet when fitting to the viewport. */
export const FIT_MARGIN = 48
/** Space reserved on both sides of the document column for future cards. */
export const WORKSPACE_GUTTER = 360

export const MIN_SCALE = 0.4
export const MAX_SCALE = 4
export const ZOOM_STEP = 1.1

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

export function resolveScale(mode: ZoomMode, widestPage: number, containerWidth: number): number {
  switch (mode.kind) {
    case 'reading':
      return clampScale(READING_WIDTH / widestPage)
    case 'fit':
      return clampScale((containerWidth - 2 * FIT_MARGIN) / widestPage)
    case 'manual':
      return clampScale(mode.scale)
  }
}
