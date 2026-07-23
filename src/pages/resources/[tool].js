import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import SEO from '../../components/SEO'
import { Icon } from '../../components/Primitives'
import { TOOLS_META } from '../../lib/resources/tools-meta'
import { resourcesAllowed } from '../../lib/resources/gate'

// A single gated tool, iframed from /api/tools/[tool] (same account gate on
// both layers). The iframe document posts its scrollHeight up so the frame
// grows with the content and the page scrolls as one surface.
export default function ResourceTool({ slug }) {
  const meta = TOOLS_META.find((t) => t.slug === slug)
  const frameRef = useRef(null)
  const [height, setHeight] = useState(1200)

  useEffect(() => {
    const onMessage = (e) => {
      if (e.origin !== window.location.origin) return
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return
      if (e.data?.type === 'syngyn-tool-height' && Number.isFinite(e.data.height)) {
        setHeight(Math.max(480, Math.ceil(e.data.height)))
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return (
    <>
      <SEO title={meta.name} description="Member research tools." path={`/resources/${slug}`} noindex />
      <div className="max-w-container mx-auto px-4 md:px-6 pt-6">
        <Link
          href="/resources"
          className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink transition-colors"
        >
          <Icon name="chevLeft" size={16} />
          <span>All resources</span>
        </Link>
      </div>
      <iframe
        ref={frameRef}
        src={`/api/tools/${slug}`}
        title={meta.name}
        style={{ height: `${height}px` }}
        className="block w-full border-0"
      />
    </>
  )
}

export async function getServerSideProps(context) {
  const slug = context.params.tool
  if (!TOOLS_META.some((t) => t.slug === slug)) return { notFound: true }
  if (!(await resourcesAllowed(context))) return { notFound: true }
  return { props: { slug } }
}
