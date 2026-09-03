export type CalloutTone = 'idea' | 'example' | 'warning' | 'why'
export const CALLOUT_TONES: CalloutTone[] = ['idea', 'example', 'warning', 'why']

export const CALLOUT_META: Record<CalloutTone, { glyph: string; label: string }> = {
  idea: { glyph: '◆', label: 'key idea' },
  example: { glyph: '●', label: 'in practice' },
  warning: { glyph: '△', label: 'careful' },
  why: { glyph: '?', label: 'why that was wrong' },
}

export const toneOf = (v: string | null | undefined): CalloutTone => ((CALLOUT_TONES as string[]).includes(v ?? '') ? (v as CalloutTone) : 'idea')
