import { Html, Head, Main, NextScript } from 'next/document';
import { fontVariables } from '../lib/fonts';
import { RESEARCH_MODE } from '../lib/brand';

// Custom document so we can hide the SSR-rendered research/age gate for
// already-verified visitors BEFORE first paint (no flash). Only emitted in
// research mode — with the gate gone (clean lab-supply posture), this script/
// style would just leave a stray "research-gate" reference in the HTML source
// for no reason, so we omit it entirely when RESEARCH_MODE is off.
const HIDE_GATE_STYLE = '.rg-verified #research-gate{display:none!important}';
const HIDE_GATE_SCRIPT =
  "try{if(localStorage.getItem('opp-research-gate-v1')==='true'){document.documentElement.classList.add('rg-verified')}}catch(e){}";

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
