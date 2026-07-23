# /resources tools — vendored sources

Syngyn-skinned copies of two Forged suite apps, served on-domain behind the
cohort gate as the members-only **Resources** section:

| slug | source app | live at |
|---|---|---|
| `dosing-calculator` | `forged-recon-calc` | `/resources/dosing-calculator` |
| `peptide-designer` | `forged-peptide-designer` | `/resources/peptide-designer` |

These copies are the **source of truth for the store's versions** — they have
Syngyn theming (black/gold tokens, Inter Tight), on-domain links (`/shop`,
`/resources/...`, `target="_top"` for parent navigation out of the iframe),
and lead capture pointed at `/api/newsletter/subscribe` (sources
`resources_recon` / `resources_designer`). The original Forged apps keep
living in their own repos for the Forged-side funnel; changes there do NOT
propagate here automatically.

## Editing / rebuilding

1. Edit the files in `resources-tools/<slug>/`.
2. Run `node scripts/build-resource-tools.js` — inlines each tool into a
   single HTML string module at `src/lib/resources/tool-html-<slug>.js`
   (committed, statically imported by `pages/api/tools/[tool].js`).
3. Commit both the source edit and the regenerated module.

## Gating (members-only access)

- Pages (`/resources`, `/resources/[tool]`) and the serving API route both
  404 for signed-out visitors via the ACCOUNT gate in
  `src/lib/resources/gate.js` (re-keyed 2026-07-23) — a valid customer
  session is the only credential; the tools are part of the signed-in
  member experience.
- Nav entry points (Header "Resources", tab bar) render client-side only for
  member sessions (`useCohortUi`, keyed to the account marker) — signed-out
  server HTML never mentions the path.
- Not in the sitemap; `noindex` everywhere; tool responses are
  `Cache-Control: private, no-store`.
- Kill-switch: set `RESOURCES_OFF=true` in Vercel to 404 the whole surface.
