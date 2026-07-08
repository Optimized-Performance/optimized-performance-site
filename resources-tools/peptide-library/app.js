/* Syngyn Peptide Research Library — UI. Deterministic; data from engine.js. */
(function () {
  const { PEPTIDES, GOALS, search } = window.PeptideLibrary

  const params = new URLSearchParams(location.search)
  const ref = params.get('ref')
  const refQ = ref ? `?ref=${encodeURIComponent(ref)}` : ''
  const BLUEPRINT = 'https://forgedbloodwork.com'
  document.getElementById('blueprintLink').href = BLUEPRINT + '/' + refQ

  const goalsEl = document.getElementById('goals')
  const listEl = document.getElementById('list')
  const countEl = document.getElementById('count')
  const emptyEl = document.getElementById('empty')
  const qEl = document.getElementById('q')

  let activeGoal = 'all'
  let query = ''
  const open = new Set()

  function renderGoals() {
    const chips = [{ id: 'all', name: 'All', icon: '' }, ...GOALS]
    goalsEl.innerHTML = chips
      .map((g) => `<span class="pchip ${activeGoal === g.id ? 'on' : ''}" data-g="${g.id}">${g.icon ? g.icon + ' ' : ''}${g.name}</span>`)
      .join('')
    goalsEl.querySelectorAll('.pchip').forEach((c) =>
      c.addEventListener('click', () => {
        activeGoal = c.dataset.g
        renderGoals(); renderList()
      })
    )
  }

  const markerChips = (markers) =>
    markers.map((m) => `<span class="chip mon">${m}</span>`).join('')

  function monoHtml(p) {
    const isOpen = open.has(p.id)
    return `
      <div class="mono ${isOpen ? 'open' : ''}" data-id="${p.id}">
        <button class="mono-head" type="button" aria-expanded="${isOpen}">
          <span class="mono-title">
            <span class="mn">${p.name}</span>
            ${p.code ? `<span class="mc">${p.code}</span>` : ''}
          </span>
          <span class="mono-cls">${p.cls}</span>
          <span class="mono-caret">${isOpen ? '–' : '+'}</span>
        </button>
        <div class="mono-body" ${isOpen ? '' : 'hidden'}>
          <div class="mono-sec">
            <span class="k">How it works</span>
            <p>${p.how}</p>
          </div>
          <div class="mono-sec">
            <span class="k">Researched for</span>
            <p>${p.researched}</p>
          </div>
          ${p.markers && p.markers.length ? `
          <div class="mono-sec">
            <span class="k">Markers the literature tracks</span>
            <div class="chips">${markerChips(p.markers)}</div>
            <a class="linkout" href="${BLUEPRINT}/${refQ}" target="_blank" rel="noopener" style="color:var(--info)">Read your panel on Forged Blueprint →</a>
          </div>` : ''}
          <div class="mono-links">
            <a href="/shop" target="_top">Source at Syngyn →</a>
            <a href="/resources/dosing-calculator" target="_top">Reconstitute in the Dosing Calculator →</a>
          </div>
        </div>
      </div>`
  }

  function renderList() {
    const list = search(PEPTIDES, activeGoal, query)
    countEl.textContent = `Showing ${list.length} of ${PEPTIDES.length} compounds`
    if (!list.length) {
      listEl.innerHTML = ''
      emptyEl.classList.remove('hidden')
      return
    }
    emptyEl.classList.add('hidden')
    listEl.innerHTML = list.map(monoHtml).join('')
    listEl.querySelectorAll('.mono-head').forEach((h) =>
      h.addEventListener('click', () => {
        const id = h.closest('.mono').dataset.id
        if (open.has(id)) open.delete(id)
        else open.add(id)
        renderList()
      })
    )
  }

  qEl.addEventListener('input', () => { query = qEl.value; renderList() })

  renderGoals()
  renderList()
})()
