// Client-safe registry for the cohort-gated /resources tools. Names and
// descriptions ONLY — the tool content itself lives in the generated
// tool-html-*.js modules, which are imported exclusively by the server-side
// API route so nothing tool-related ships in a public client bundle.
export const TOOLS_META = [
  {
    slug: 'dosing-calculator',
    name: 'Dosing & Reconstitution Calculator',
    blurb:
      'Pick a compound, get the exact draw — BAC water math, insulin-pin units, and multi-compound oil draws with a visual syringe.',
    icon: 'beaker',
  },
  {
    slug: 'peptide-designer',
    name: 'Peptide Protocol Designer',
    blurb:
      'Organize your research by goal — what each compound is studied for, how it reconstitutes, and which markers the literature tracks.',
    icon: 'doc',
  },
]
