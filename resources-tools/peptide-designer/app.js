/* Forged Peptide Designer — UI. Deterministic; everything from engine.js. */
(function () {
  const { PEPTIDES, GOALS, peptidesForGoals, design } = window.PeptideEngine

  const params = new URLSearchParams(location.search)
  const ref = params.get('ref')
  const refQ = ref ? `?ref=${encodeURIComponent(ref)}` : ''
  const OPP = '/shop'
  const BLUEPRINT = 'https://forgedbloodwork.com'
  const RECON = '/resources/dosing-calculator'
  document.getElementById('oppLink').href = OPP
  document.getElementById('shopLink').href = OPP
  document.getElementById('blueprintLink').href = BLUEPRINT + '/' + refQ
  document.getElementById('reconLink').href = RECON

  const goalsEl = document.getElementById('goals')
  const pepsEl = document.getElementById('peptides')
  const emptyEl = document.getElementById('empty')
  const outEl = document.getElementById('out')
  let selGoals = []
  let selPeps = []

  function renderGoals() {
    goalsEl.innerHTML = GOALS.map((g) => `<span class="pchip ${selGoals.includes(g.id) ? 'on' : ''}" data-g="${g.id}">${g.icon} ${g.name}</span>`).join('')
    goalsEl.querySelectorAll('.pchip').forEach((c) => c.addEventListener('click', () => {
      const id = c.dataset.g
      selGoals = selGoals.includes(id) ? selGoals.filter((x) => x !== id) : [...selGoals, id]
      renderGoals(); renderPeps()
    }))
  }
  function renderPeps() {
    const list = peptidesForGoals(selGoals)
    pepsEl.innerHTML = list.map((p) => `<span class="pchip ${selPeps.includes(p.id) ? 'on' : ''}" data-p="${p.id}">${p.name}${p.code ? ` <span class="code">${p.code}</span>` : ''}</span>`).join('')
    pepsEl.querySelectorAll('.pchip').forEach((c) => c.addEventListener('click', () => {
      const id = c.dataset.p
      selPeps = selPeps.includes(id) ? selPeps.filter((x) => x !== id) : [...selPeps, id]
      renderPeps(); renderOut()
    }))
  }
  const chips = (list, cls) => list.map((x) => `<span class="chip ${cls || ''}">${x}</span>`).join('')

  function renderOut() {
    const res = design(selPeps)
    if (res.empty) { emptyEl.classList.remove('hidden'); outEl.classList.add('hidden'); return }
    emptyEl.classList.add('hidden'); outEl.classList.remove('hidden')

    const pepHtml = res.items.map((p) => `
      <div class="pep">
        <div class="ph"><span class="pn">${p.name}</span>${p.code ? `<span class="pc">${p.code}</span>` : ''}</div>
        <div class="pr">${p.researched}</div>
        ${p.monitor.length ? `<div class="pmeta"><span class="k">Literature tracks</span>${chips(p.monitor, 'mon')}</div>` : ''}
      </div>`).join('')

    outEl.innerHTML = `
      <div class="sec-h">Your research list</div>
      ${pepHtml}

      ${res.reconstitute.length ? `
      <div class="sec-h">Reconstitution</div>
      <div class="panelbox">
        <div class="pr" style="margin:0;color:var(--muted)">${res.reconstitute.length} of your compounds are lyophilized (powder) — reconstitute with bacteriostatic water, then calculate your exact draw.</div>
        <a class="linkout" href="${RECON}" target="_top" style="color:var(--optimal);display:inline-block">Open the Dosing Calculator →</a>
      </div>` : ''}

      ${res.monitor.length ? `
      <div class="sec-h">Markers the literature tracks</div>
      <div class="panelbox">
        <div class="pr" style="margin:0 0 4px;color:var(--muted)">${res.ghLoad ? 'GH-axis and metabolic compounds move glucose, insulin and IGF-1 in the research — these are the markers to follow.' : 'Markers associated with your selected compounds in the literature.'}</div>
        <div class="chips">${chips(res.monitor, 'mon')}</div>
        <a class="linkout" href="${BLUEPRINT}/${refQ}" target="_blank" rel="noopener" style="color:var(--info);display:inline-block">Read your panel on Forged Blueprint →</a>
      </div>` : ''}

      <div class="sec-h">Source</div>
      <div class="panelbox">
        <div class="pr" style="margin:0;color:var(--muted)">Lab-tested research forms with public COAs.</div>
        <a class="linkout" href="${OPP}" target="_top" style="color:#9b8cff;display:inline-block">Browse at Syngyn →</a>
      </div>`
  }

  document.getElementById('leadForm').addEventListener('submit', async (e) => {
    e.preventDefault()
    const email = document.getElementById('leadEmail').value.trim()
    const msg = document.getElementById('leadMsg')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.style.color = 'var(--high)'; msg.textContent = 'Enter a valid email.'; return }
    try {
      await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'resources_designer', ref: ref || undefined }),
      })
    } catch {
      // offline/CORS fallback — don't lose the lead entirely
      try { localStorage.setItem('forged_peptide_lead', email) } catch {}
    }
    msg.style.color = 'var(--optimal)'; msg.textContent = '✓ Saved. Your sheet is on the way.'
    document.getElementById('leadForm').reset()
  })

  renderGoals()
  renderPeps()
  // Seed a recovery example
  selGoals = ['recovery']; selPeps = ['bpc', 'tb500']
  renderGoals(); renderPeps(); renderOut()
})()
