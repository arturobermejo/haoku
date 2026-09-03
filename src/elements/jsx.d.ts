import type { DetailedHTMLProps, HTMLAttributes } from 'react'

type SpaceProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  editable?: string
  print?: string
  tone?: string
  cites?: string
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'space-callout': SpaceProps
      'space-diagram': SpaceProps
    }
  }
}
