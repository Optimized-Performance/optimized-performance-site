import { describe, it, expect } from 'vitest'
import { bodyToParagraphs } from './marketing-email.js'

describe('bodyToParagraphs — broadcast button syntax', () => {
  it('renders a standalone [text](https://url) line as a gold CTA button', () => {
    const [para] = bodyToParagraphs(['[Open Full Catalog](https://syngyn.co/?cohort=social)'])
    expect(para).toContain('<a href="https://syngyn.co/?cohort=social"')
    expect(para).toContain('Open Full Catalog')
    expect(para).toContain('background:#F5A623')
  })

  it('keeps normal text escaped and joined with <br>', () => {
    const [para] = bodyToParagraphs(['Hey <fam> & friends', 'second line'])
    expect(para).toBe('Hey &lt;fam&gt; &amp; friends<br>second line')
  })

  it('does NOT buttonize non-http schemes or inline links', () => {
    const [a] = bodyToParagraphs(['[x](javascript:alert(1))'])
    expect(a).not.toContain('<a ')
    const [b] = bodyToParagraphs(['see [x](https://a.co) inline'])
    expect(b).not.toContain('<a ')
  })

  it('escapes HTML inside the button label', () => {
    const [para] = bodyToParagraphs(['[<b>Bold</b>](https://a.co)'])
    expect(para).toContain('&lt;b&gt;Bold&lt;/b&gt;')
    expect(para).not.toContain('<b>')
  })

  it('splits paragraphs on blank lines with the button standing alone', () => {
    const paras = bodyToParagraphs(['Intro text', '', '[Shop](https://syngyn.co)', '', 'Outro'])
    expect(paras).toHaveLength(3)
    expect(paras[1]).toContain('<a href="https://syngyn.co"')
  })
})
