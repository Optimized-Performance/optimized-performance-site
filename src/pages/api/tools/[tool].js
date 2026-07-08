import { resourcesAllowed } from '../../../lib/resources/gate'
import { html as dosingCalculator } from '../../../lib/resources/tool-html-dosing-calculator'
import { html as peptideDesigner } from '../../../lib/resources/tool-html-peptide-designer'
import { html as peptideLibrary } from '../../../lib/resources/tool-html-peptide-library'

// Serves the self-contained tool documents that the /resources/[tool] pages
// iframe. STRICT cohort gate (see lib/resources/gate) — a cold visitor gets a
// bare 404, indistinguishable from the route not existing, so the tool
// content is invisible to AUP scanners crawling the domain.
//
// The HTML ships as generated string modules (static imports — always traced
// into the serverless bundle, never in a client bundle). Regenerate with
// `node scripts/build-resource-tools.js` after editing resources-tools/.
const TOOL_HTML = {
  'dosing-calculator': dosingCalculator,
  'peptide-designer': peptideDesigner,
  'peptide-library': peptideLibrary,
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const doc = TOOL_HTML[req.query.tool]
  const allowed = await resourcesAllowed({ req, res, query: req.query })
  if (!doc || !allowed) return res.status(404).end()

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  // Gated content: keep it out of shared caches and search indexes.
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('X-Robots-Tag', 'noindex, nofollow')
  return res.status(200).send(doc)
}
