/** Bundled demo sources (public/demo): three PDFs, reading notes and a diagram on memory in AI agents. */
export const DEMO_SOURCES: { file: string; type: string }[] = [
  { file: 'episodic-memory-for-agents.pdf', type: 'application/pdf' },
  { file: 'memory-systems-lecture-notes.pdf', type: 'application/pdf' },
  { file: 'support-agent-memory-case-study.pdf', type: 'application/pdf' },
  { file: 'reading-notes.md', type: 'text/markdown' },
  { file: 'memory-architecture.png', type: 'image/png' },
]

export const DEMO_TITLE = 'Memory in AI agents'

/** Fetches the bundled demo files as File objects, skipping names that are already present. */
export async function fetchDemoFiles(existingNames: Iterable<string>): Promise<File[]> {
  const present = new Set(existingNames)
  const wanted = DEMO_SOURCES.filter((d) => !present.has(d.file))
  return Promise.all(
    wanted.map(async ({ file, type }) => {
      const res = await fetch(`${import.meta.env.BASE_URL}demo/${file}`)
      if (!res.ok) throw new Error(`could not fetch demo file ${file} (${res.status})`)
      return new File([await res.blob()], file, { type })
    }),
  )
}
