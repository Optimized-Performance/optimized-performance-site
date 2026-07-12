import { Inter_Tight, JetBrains_Mono, Cinzel } from 'next/font/google';

// Site fonts, declared once and shared by _document (which attaches the CSS
// variables to <html>) and anything else that needs the objects.
//
// WHY <html>: the :root tokens in globals.css compose these variables
// (--font-body: var(--font-inter-tight, ...)). Custom properties resolve
// where they're DEFINED — on :root — so if the next/font variable classes sit
// on a wrapper div below <html>, the var() fallback fires at :root and the
// literal family names ("Inter Tight") go out instead of next/font's real
// registered families (__Inter_Tight_xxx). Nothing matches those literals, so
// the whole site silently rendered Helvetica/Arial. (Found 2026-07-11 while
// hunting the "site fonts read cheap" report — they weren't our fonts at all.)

export const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter-tight',
  display: 'swap',
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

// Display face for headings/product names — engraved lapidary serif, the
// premium posture that pairs with the gold script wordmark. Wired via
// --font-display in globals.css; reverting is a one-token change.
export const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-cinzel',
  display: 'swap',
});

export const fontVariables = `${interTight.variable} ${jetbrainsMono.variable} ${cinzel.variable}`;
