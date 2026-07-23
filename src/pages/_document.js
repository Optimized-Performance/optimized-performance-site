import { Html, Head, Main, NextScript } from 'next/document';
import { fontVariables } from '../lib/fonts';
import { RESEARCH_MODE } from '../lib/brand';

// Custom document so we can hide the SSR-rendered research/age gate for
// already-verified visitors BEFORE first paint (no flash). Only emitted in
// research mode — with the gate gone (clean lab-supply posture), this script/
// style would just leave a stray "research-gate" reference in the HTML source
// for no reason, so we omit it entirely when RESEARCH_MODE is off.
const HIDE_GATE_STYLE = '.rg-verified #research-gate{display:none!important}';
// The gate is a LOGIN WALL (2026-07-23): hidden pre-paint only when a customer
// session exists, signalled by the non-HttpOnly opp_customer_present marker
// cookie (set/cleared alongside the HttpOnly session cookie — see
// lib/customer-session). The old localStorage attestation flag no longer
// hides the gate on its own; attestation happens as part of sign-up/sign-in.
const HIDE_GATE_SCRIPT =
  "try{if(document.cookie.indexOf('opp_customer_present=1')!==-1){document.documentElement.classList.add('rg-verified')}}catch(e){}";

export default function Document() {
  return (
    // Font variables live on <html> so the :root font tokens in globals.css
    // resolve to the real next/font families (see lib/fonts.js for the story).
    <Html lang="en" className={fontVariables}>
      <Head>
        {RESEARCH_MODE && <style dangerouslySetInnerHTML={{ __html: HIDE_GATE_STYLE }} />}
      </Head>
      <body>
        {RESEARCH_MODE && <script dangerouslySetInnerHTML={{ __html: HIDE_GATE_SCRIPT }} />}
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
