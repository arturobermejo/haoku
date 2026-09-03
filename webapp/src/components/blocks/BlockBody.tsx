import type { Block } from '../../workspace/types'
import { CalloutBlock } from './CalloutBlock'
import { ComparisonBlock } from './ComparisonBlock'
import { DiagramBlock } from './DiagramBlock'
import { FlashcardsBlock } from './FlashcardsBlock'
import { HeadingBlock } from './HeadingBlock'
import { ImageBlock } from './ImageBlock'
import { ParagraphBlock } from './ParagraphBlock'
import { QuizBlock } from './QuizBlock'

export function BlockBody({ block }: { block: Block }) {
  switch (block.content.type) {
    case 'heading':
      return <HeadingBlock block={block} content={block.content} />
    case 'paragraph':
      return <ParagraphBlock block={block} content={block.content} />
    case 'callout':
      return <CalloutBlock block={block} content={block.content} />
    case 'diagram':
      return <DiagramBlock block={block} content={block.content} />
    case 'comparison':
      return <ComparisonBlock block={block} content={block.content} />
    case 'flashcards':
      return <FlashcardsBlock block={block} content={block.content} />
    case 'quiz':
      return <QuizBlock block={block} content={block.content} />
    case 'image':
      return <ImageBlock block={block} content={block.content} />
  }
}
