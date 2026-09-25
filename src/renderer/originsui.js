(function() {
  const $ = sel => document.querySelector(sel);
  const esc = U.escapeHtml;
  const TIER = {
    upload: {
      label: 'recorded at upload',
      cls: 'ok',
      note: 'This app uploaded it and wrote the prompt down at the time. Certain.'
    },
    manual: {
      label: 'linked by you',
      cls: 'ok',
      note: 'You matched this deviation to a card by hand.'
    },
    title: {
      label: 'matched by title',
      cls: '',
      note: 'Matched to a library card whose title is exactly the same. Reliable unless two pieces share a title.'
    },
    probable: {
      label: 'probable match',
      cls: 'warn',
      note: 'Matched by similar title only — check it before trusting it. Never used for learning.'
    },
    none: {
      label: 'no record',
      cls: 'dim',
      note: 'Published before the archive existed, or from another machine.'
    }
  };
  let archiveQuery = '';
  function thumbFor(dev, res) {
    const local = res && res.fname;
    if (local) return `<img src="ala://img/${encodeURIComponent(local)}" alt="" loading="lazy" />`;
    if (dev && dev.thumb) return `<img src="${esc(dev.thumb)}" alt="" loading="lazy" data-fallback />`;
    return `<div class="arch-nothumb">◈</div>`;
  }
  function wireThumbFallback(root) {
    root.querySelectorAll('img[data-fallback]').forEach(img => img.addEventListener('error', () => {
      const ph = document.createElement('div');
      ph.className = 'arch-nothumb';
      ph.textContent = '◈';
      ph.title = 'DeviantArt’s thumbnail link for this one has expired — re-sync to refresh it.';
      img.replaceWith(ph);
    }, {
      once: true
    }));
  }
  const OriginsUI = {
    wire() {
      const search = $('#archive-search');
      if (search) {
        search.addEventListener('input', U.debounce(e => {
          archiveQuery = e.target.value;
          this.renderList();
        }, 160));
        search.addEventListener('keydown', e => {
          if (e.key === 'Escape') {
            e.preventDefault();
            search.value = '';
            archiveQuery = '';
            this.renderList();
          }
        });
      }
      const rescan = $('#btn-archive-rescan');
      if (rescan) rescan.addEventListener('click', () => {
        Insights.relink();
        const added = Origins.backfill();
        if (added) Origins.persist();
        window.toast(added ? `${added} more deviation(s) matched to a prompt.` : 'Nothing new to match.', added ? 'ok' : '');
        this.render();
      });
    },
    render() {
      const cov = Origins.coverage();
      const el = $('#archive-coverage');
      if (el) {
        el.textContent = cov.total ? `· ${cov.known} of ${cov.total} have their prompt on record` : '· sync the gallery first';
        el.className = 'hint';
      }
      this.renderList();
    },
    renderList() {
      const root = $('#archive-list');
      if (!root) return;
      const rows = Origins.search(archiveQuery, {
        limit: 60
      });
      if (!rows.length) {
        root.innerHTML = `<div class="hint">${archiveQuery ? 'Nothing published matches that.' : 'Nothing synced yet — press “Sync newest” above.'}</div>`;
        return;
      }
      root.innerHTML = rows.map(({dev: dev, res: res}) => {
        const tier = TIER[res.link] || TIER.none;
        const when = dev.publishedAt ? new Date(dev.publishedAt).toLocaleDateString() : '';
        return `<div class="archive-row" data-dev="${esc(dev.deviationId)}" title="${esc(tier.note)}">\n          ${thumbFor(dev, res)}\n          <div class="arch-main">\n            <div class="arch-title">${esc(dev.title || 'Untitled')}\n              <span class="src-badge ${tier.cls === 'ok' ? 'deviantart' : 'none'}">${esc(tier.label)}</span>\n              ${res.link === 'none' && res.candidate ? `<span class="src-badge none">a likely card exists</span>` : ''}\n            </div>\n            <div class="arch-prompt">${res.prompt ? esc(res.prompt.slice(0, 190)) + (res.prompt.length > 190 ? '…' : '') : '<i>no prompt on record for this one</i>'}</div>\n          </div>\n          <div class="arch-meta">\n            <span>${esc(when)}</span>\n            <span>${dev.stats && dev.stats.favourites || 0} ♥</span>\n          </div>\n        </div>`;
      }).join('');
      wireThumbFallback(root);
      root.querySelectorAll('.archive-row').forEach(row => row.addEventListener('click', () => this.openModal(row.dataset.dev)));
    },
    openModal(deviationId) {
      const dev = Insights.perf.deviations.find(d => String(d.deviationId) === String(deviationId));
      if (!dev) return;
      const res = Origins.resolve(dev);
      const tier = TIER[res.link] || TIER.none;
      const m = Insights.metric(dev);
      const root = $('#modal-root');
      const image = res.fname ? `ala://img/${encodeURIComponent(res.fname)}` : dev.thumb || '';
      root.innerHTML = `<div class="modal-backdrop"><div class="panel origin-panel">\n        <div class="panel-head">\n          <h2>${esc(dev.title || 'Untitled')}</h2>\n          <button class="btn ghost small" data-close>✕</button>\n        </div>\n        <div class="origin-body">\n          <div class="origin-art">\n            ${image ? `<img src="${esc(image)}" alt="" />` : `<div class="arch-nothumb big">◈</div>`}\n            <div class="origin-stats">\n              <span><b>${(m.views || 0).toLocaleString()}</b> views</span>\n              <span><b>${m.favs}</b> favourites</span>\n              <span><b>${m.comments}</b> comments</span>\n              <span><b>${Math.round(m.perDay)}</b> /day</span>\n            </div>\n          </div>\n          <div class="origin-info">\n            <div class="origin-tier ${tier.cls}">${esc(tier.label)} — ${esc(tier.note)}</div>\n            ${res.prompt ? `\n              <label class="fld"><span>The prompt that generated it</span>\n                <textarea id="origin-prompt" rows="8" readonly>${esc(res.prompt)}</textarea></label>\n              <div class="origin-facts">\n                ${res.theme ? `<span><b>Theme</b> ${esc(res.theme)}</span>` : ''}\n                ${res.entry && res.entry.promptSource ? `<span><b>Source</b> ${esc(res.entry.promptSource)}</span>` : ''}\n                ${res.entry && res.entry.qcScore != null ? `<span><b>QC</b> ${esc(String(res.entry.qcScore))}/10</span>` : ''}\n                ${res.entry && res.entry.continuationOf ? `<span><b>Continues</b> an earlier deviation</span>` : ''}\n                ${res.entry && res.entry.upscaled ? `<span><b>Upscaled</b></span>` : ''}\n              </div>\n              ${(res.tags || []).length ? `<div class="origin-tags">${res.tags.map(t => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}\n            ` : `\n              <div class="hint">Nothing was recorded for this one. That is normal for anything\n                published before the archive existed, or uploaded from the browser.</div>\n              ${res.candidate ? `\n                <div class="origin-candidate">\n                  <div class="hint">The closest thing in the library — <b>${Math.round(res.candidate.score * 100)}%</b> title match:</div>\n                  <div class="cand-title">${esc(res.candidate.card.metadata?.title || '')}</div>\n                  <div class="cand-prompt">${esc((res.candidate.card.prompt || '').slice(0, 240))}</div>\n                  <button class="btn small" data-act="link">That is the one — link it</button>\n                </div>` : `<div class="hint">No card in the library has a similar enough title to suggest.</div>`}\n              <div class="btn-row"><button class="btn small" data-act="pick">Find the card by hand…</button></div>\n            `}\n          </div>\n        </div>\n        <div class="btn-row origin-actions">\n          ${res.prompt ? `<button class="btn" data-act="copy">⧉ Copy prompt</button>\n          <button class="btn" data-act="requeue">Generate this again</button>\n          <button class="btn primary" data-act="continue">↻ Continuation…</button>` : ''}\n          ${dev.url ? `<button class="btn ghost" data-act="open">Open on DeviantArt ↗</button>` : ''}\n          ${res.entry ? `<button class="btn ghost small" data-act="unlink" title="Forget this attribution — use it when the prompt shown is the wrong one">Wrong prompt</button>` : ''}\n        </div>\n      </div></div>`;
      const close = () => {
        root.innerHTML = '';
      };
      root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
      root.querySelector('.modal-backdrop').addEventListener('click', e => {
        if (e.target.classList.contains('modal-backdrop')) close();
      });
      const act = (name, fn) => {
        const btn = root.querySelector(`[data-act="${name}"]`);
        if (btn) btn.addEventListener('click', fn);
      };
      act('copy', () => {
        window.ala.clip.text(res.prompt);
        window.toast('Prompt copied.', 'ok');
      });
      act('open', () => window.ala.app.openExternal(dev.url));
      act('requeue', () => {
        const job = Pipeline.makeJob(res.prompt, res.theme || '', 'archive', String(dev.deviationId));
        State.queue.push(job);
        State.persistQueue();
        close();
        window.toast('Queued. Start the worker to generate it.', 'ok');
      });
      act('continue', () => {
        close();
        ContinuationsUI.loadSource({
          deviationId: String(dev.deviationId),
          title: dev.title,
          url: dev.url,
          prompt: res.prompt,
          theme: res.theme,
          fname: res.fname,
          thumb: dev.thumb
        });
        window.switchTab('continuations');
      });
      act('link', () => {
        Origins.linkManually(dev.deviationId, res.candidate.card);
        Insights.relink();
        close();
        this.render();
        window.toast('Linked — the prompt is on record now.', 'ok');
      });
      act('pick', () => {
        close();
        this.openCardPicker(dev);
      });
      act('unlink', () => {
        Origins.unlink(dev.deviationId);
        close();
        this.render();
        window.toast('Attribution removed.', '');
      });
    },
    openCardPicker(dev) {
      const root = $('#modal-root');
      const render = q => {
        const query = String(q || '').toLowerCase().trim();
        const cards = State.library.filter(c => c.prompt).filter(c => !query || (c.metadata?.title || '').toLowerCase().includes(query) || (c.prompt || '').toLowerCase().includes(query)).slice(0, 60);
        return cards.map(c => `<div class="ref-pick" data-card="${c.id}">\n          <img src="${c.url}" alt="" loading="lazy" />\n          <div class="rp-meta">${esc((c.metadata?.title || c.fname).slice(0, 28))}</div>\n        </div>`).join('') || `<div class="hint">No card matches that.</div>`;
      };
      root.innerHTML = `<div class="modal-backdrop"><div class="panel pick-panel">\n        <div class="panel-head"><h2>Which card made “${esc(dev.title || 'this')}”?</h2>\n          <button class="btn ghost small" data-close>✕</button></div>\n        <input id="pick-search" type="search" placeholder="Search titles and prompts…" autocomplete="off" />\n        <div class="ref-picker" id="pick-grid" style="margin-top:12px">${render('')}</div>\n      </div></div>`;
      const close = () => {
        root.innerHTML = '';
      };
      root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
      root.querySelector('.modal-backdrop').addEventListener('click', e => {
        if (e.target.classList.contains('modal-backdrop')) close();
      });
      const grid = root.querySelector('#pick-grid');
      const bind = () => grid.querySelectorAll('[data-card]').forEach(el => el.addEventListener('click', () => {
        const card = State.library.find(c => c.id === el.dataset.card);
        if (!card) return;
        Origins.linkManually(dev.deviationId, card);
        Insights.relink();
        close();
        this.render();
        window.toast('Linked.', 'ok');
      }));
      bind();
      const search = root.querySelector('#pick-search');
      search.addEventListener('input', U.debounce(() => {
        grid.innerHTML = render(search.value);
        bind();
      }, 150));
      search.focus();
    }
  };
  OriginsUI.thumbFor = thumbFor;
  OriginsUI.wireThumbFallback = wireThumbFallback;
  window.OriginsUI = OriginsUI;
})();
