import { describe, it, expect } from 'vitest'
import { normalizeSignoff } from './email-bot.js'

describe('normalizeSignoff', () => {
  it('rewrites the OPP signoff to Syngyn', () => {
    expect(normalizeSignoff('Thanks!\n\n— OPP Customer Service'))
      .toBe('Thanks!\n\n— Syngyn Customer Service')
  })

  it('rewrites the full Optimized Performance Peptides signoff', () => {
    expect(normalizeSignoff('Body\n\n- Optimized Performance Peptides Customer Service'))
      .toBe('Body\n\n— Syngyn Customer Service')
  })

  it('rewrites "Optimized Performance Customer Service" (no Peptides)', () => {
    expect(normalizeSignoff('x\n\nOptimized Performance Customer Service'))
      .toBe('x\n\n— Syngyn Customer Service')
  })

  it('leaves an already-correct Syngyn signoff unchanged', () => {
    const s = 'Body\n\n— Syngyn Customer Service'
    expect(normalizeSignoff(s)).toBe(s)
  })

  it('does NOT touch a legitimate body mention of the old brand', () => {
    // COAs genuinely still carry the OPP name during the rebrand — that
    // explanatory sentence must survive; only the trailing signoff is rewritten.
    const body = 'All our COAs are still under the Optimized Performance Peptides name while we work through the rebrand.\n\n— OPP Customer Service'
    const out = normalizeSignoff(body)
    expect(out).toContain('COAs are still under the Optimized Performance Peptides name')
    expect(out.endsWith('— Syngyn Customer Service')).toBe(true)
    expect(out).not.toContain('OPP Customer Service')
  })

  it('is a no-op when there is no CS signoff at all', () => {
    expect(normalizeSignoff('Just a note, no signoff')).toBe('Just a note, no signoff')
  })
})
