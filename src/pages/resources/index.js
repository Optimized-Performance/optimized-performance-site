import Link from 'next/link'
import SEO from '../../components/SEO'
import { Icon } from '../../components/Primitives'
import { TOOLS_META } from '../../lib/resources/tools-meta'
import { resourcesAllowed } from '../../lib/resources/gate'

// Members-only research tools hub. Server-gated: cold visitors get a real 404
// from getServerSideProps (strict cohort check — the COHORT_GATE_OFF catalog
// kill-switch is deliberately ignored here), so this page and everything under
// it never exists for unreferred traffic. Never link to /resources from any
// server-rendered public surface — nav entry points are client-side
// cohort-only (useCohortUi) by design.
export default function Resources() {
  return (
    <>
      <SEO title="Resources" description="Member research tools." path="/resources" noindex />
      <div className="max-w-narrow mx-auto px-6 py-12">
        <p className="font-mono text-xs uppercase tracking-premium text-accent mb-3">Members only</p>
        <h1 className="font-display text-3xl md:text-4xl text-ink tracking-display mb-3">Research resources</h1>
        <p className="text-ink-soft text-sm md:text-base mb-10 max-w-[60ch]">
          Reference tools for the community. Everything runs entirely in your browser — nothing you
          enter is saved, sent, or stored.
        </p>

        <div className="grid gap-5 sm:grid-cols-2">
          {TOOLS_META.map((t) => (
            <Link
              key={t.slug}
              href={`/resources/${t.slug}`}
              className="group block border border-line rounded-opp-lg bg-surface p-6 hover:border-accent transition-colors"
            >
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-opp border border-line text-accent mb-4 group-hover:border-accent transition-colors">
                <Icon name={t.icon} size={20} />
              </span>
              <h2 className="font-display text-lg text-ink mb-2">{t.name}</h2>
              <p className="text-ink-soft text-sm leading-relaxed">{t.blurb}</p>
              <span className="inline-block mt-4 text-sm text-accent">Open →</span>
            </Link>
          ))}
        </div>

        <p className="text-ink-mute text-xs mt-10 max-w-[70ch]">
          Educational reference only — these tools do not recommend, prescribe, or endorse any dose,
          compound, or protocol, and are not a substitute for a licensed medical professional.
        </p>
      </div>
    </>
  )
}

export async function getServerSideProps(context) {
  if (!(await resourcesAllowed(context))) return { notFound: true }
  return { props: {} }
}
