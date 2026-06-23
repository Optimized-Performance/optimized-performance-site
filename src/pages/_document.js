import { Html, Head, Main, NextScript } from 'next/document';

// Custom document so we can hide the SSR-rendered research/age gate for
// already-verified visitors BEFORE first paint (no flash). The gate itself is
// server-rendered (see AgeGate.js + _app.js) so no-JS compliance scanners can
// detect a real "confirm on entry" gate; this script removes it instantly for
// returning users, and React unmounts it on hydration.
const HIDE_GATE_STYLE = '.rg-verified #research-gate{display:none!important}';
const HIDE_GATE_SCRIPT =
  "try{if(localStorage.getItem('opp-research-gate-v1')==='true'){document.documentElement.classList.add('rg-verified')}}catch(e){}";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <style dangerouslySetInnerHTML={{ __html: HIDE_GATE_STYLE }} />
      </Head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: HIDE_GATE_SCRIPT }} />
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
