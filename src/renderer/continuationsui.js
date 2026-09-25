(function() {
  const $ = sel => document.querySelector(sel);
  const esc = U.escapeHtml;
  const ANCHOR_PRESETS = {
    character: [ 'the character themself — species, body, hair, face, and any markings' ],
    'character+outfit': [ 'the character themself — species, body, hair, face, and any markings', 'the outfit and its colours, unless the direction explicitly changes it' ],
    'character+setting': [ 'the character themself — species, body, hair, face, and any markings', 'the location and the light' ],
    everything: [ 'the character themself — species, body, hair, face, and any markings', 'the outfit and its colours, unless the direction explicitly changes it', 'the location and the light' ]
  };
  let source = null;
  let written = [];
  let boardFilter = 'open';
  let lastSheet = null;
  const ContinuationsUI = {
    wire() {
      $('#btn-cont-pick').addEventListener('click', () => this.openDeviationPicker());
      $('#btn-cont-pick-card').addEventListener('click', () => this.openCardPicker());
      $('#btn-cont-comments').addEventListener('click', () => this.loadComments());
      $('#btn-cont-write').addEventListener('click', () => this.write());
      $('#btn-cont-save-request').addEventListener('click', () => this.saveRequest());
      document.querySelectorAll('[data-creq]').forEach(chip => chip.addEventListener('click', () => {
        boardFilter = chip.dataset.creq;
        document.querySelectorAll('[data-creq]').forEach(c => c.classList.toggle('active', c === chip));
        this.renderBoard();
      }));
      State.on('requests', () => {
        this.renderBoard();
        this.renderBadge();
      });
    },
    render() {
      this.renderSource();
      this.renderBoard();
      this.renderBadge();
    },
    renderBadge() {
      const badge = $('#badge-cont');
      if (!badge) return;
      const n = Continuations.open().length;
      badge.textContent = String(n);
      badge.hidden = n === 0;
    },
    loadSource(src) {
      source = {
        ...src
      };
      written = [];
      lastSheet = null;
      this.renderSource();
      this.renderResults();
      const state = $('#cont-comment-state');
      if (state) state.textContent = '';
      const list = $('#cont-comments');
      if (list) list.innerHTML = '';
      const vision = $('#cont-vision');
      if (vision) {
        vision.disabled = !source.fname;
        if (!source.fname) vision.checked = false;
        vision.closest('.checkbox-row').classList.toggle('disabled', !source.fname);
      }
    },
    renderSource() {
      const root = $('#cont-source');
      if (!root) return;
      if (!source) {
        root.innerHTML = `<div class="hint">Nothing chosen yet. “Pick published” lists what is\n          already on DeviantArt — that is where the requests come from. “Pick from library”\n          works for anything you have generated, published or not.</div>`;
        return;
      }
      const img = source.fname ? `ala://img/${encodeURIComponent(source.fname)}` : source.thumb || '';
      root.innerHTML = `<div class="cont-src-card">\n        ${img ? `<img src="${esc(img)}" alt="" />` : `<div class="arch-nothumb">◈</div>`}\n        <div class="cont-src-info">\n          <div class="cont-src-title">${esc(source.title || 'Untitled')}</div>\n          ${source.theme ? `<div class="hint">theme: ${esc(source.theme)}</div>` : ''}\n          <div class="cont-src-prompt">${source.prompt ? esc(source.prompt.slice(0, 320)) + (source.prompt.length > 320 ? '…' : '') : '<i>no prompt on record — the writer will work from the image alone, so switch the vision read on</i>'}</div>\n          ${!source.fname ? `<div class="hint">The image file is not on this machine, so it cannot be read by the vision model.</div>` : ''}\n        </div>\n      </div>`;
    },
    openDeviationPicker() {
      const root = $('#modal-root');
      const render = q => {
        const rows = Origins.search(q, {
          limit: 50
        });
        if (!rows.length) return `<div class="hint">Nothing matches. Sync the gallery on the Statistics tab if it looks empty.</div>`;
        return rows.map(({dev: dev, res: res}) => `<div class="archive-row" data-dev="${esc(dev.deviationId)}">\n          ${OriginsUI.thumbFor(dev, res)}\n          <div class="arch-main">\n            <div class="arch-title">${esc(dev.title || 'Untitled')}\n              ${res.prompt ? '' : `<span class="src-badge none">no prompt on record</span>`}</div>\n            <div class="arch-prompt">${esc((res.prompt || '').slice(0, 150))}</div>\n          </div>\n          <div class="arch-meta"><span>${dev.stats && dev.stats.favourites || 0} ♥</span></div>\n        </div>`).join('');
      };
      root.innerHTML = `<div class="modal-backdrop"><div class="panel pick-panel">\n        <div class="panel-head"><h2>Continue which deviation?</h2>\n          <button class="btn ghost small" data-close>✕</button></div>\n        <input id="cpick-search" type="search" placeholder="Search published titles, prompts, tags…" autocomplete="off" />\n        <div class="archive-list" id="cpick-list" style="margin-top:12px">${render('')}</div>\n      </div></div>`;
      const close = () => {
        root.innerHTML = '';
      };
      root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
      root.querySelector('.modal-backdrop').addEventListener('click', e => {
        if (e.target.classList.contains('modal-backdrop')) close();
      });
      const list = root.querySelector('#cpick-list');
      const bind = () => {
        OriginsUI.wireThumbFallback(list);
        list.querySelectorAll('[data-dev]').forEach(row => row.addEventListener('click', () => {
          const dev = Insights.perf.deviations.find(d => String(d.deviationId) === row.dataset.dev);
          if (!dev) return;
          const res = Origins.resolve(dev);
          close();
          this.loadSource({
            deviationId: String(dev.deviationId),
            title: dev.title,
            url: dev.url,
            prompt: res.prompt,
            theme: res.theme,
            fname: res.fname,
            thumb: dev.thumb
          });
        }));
      };
      bind();
      const search = root.querySelector('#cpick-search');
      search.addEventListener('input', U.debounce(() => {
        list.innerHTML = render(search.value);
        bind();
      }, 150));
      search.focus();
    },
    openCardPicker() {
      const root = $('#modal-root');
      const render = q => {
        const query = String(q || '').toLowerCase().trim();
        const cards = State.library.filter(c => c.prompt && ![ 'discarded' ].includes(c.status)).filter(c => !query || (c.metadata?.title || '').toLowerCase().includes(query) || (c.prompt || '').toLowerCase().includes(query) || (c.theme || '').toLowerCase().includes(query)).slice(0, 60);
        return cards.map(c => `<div class="ref-pick" data-card="${c.id}">\n          <img src="${c.url}" alt="" loading="lazy" />\n          <div class="rp-meta">${esc((c.metadata?.title || c.fname).slice(0, 28))}</div>\n        </div>`).join('') || `<div class="hint">Nothing matches.</div>`;
      };
      root.innerHTML = `<div class="modal-backdrop"><div class="panel pick-panel">\n        <div class="panel-head"><h2>Continue which picture?</h2>\n          <button class="btn ghost small" data-close>✕</button></div>\n        <input id="cpick2-search" type="search" placeholder="Search your library…" autocomplete="off" />\n        <div class="ref-picker" id="cpick2-grid" style="margin-top:12px">${render('')}</div>\n      </div></div>`;
      const close = () => {
        root.innerHTML = '';
      };
      root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
      root.querySelector('.modal-backdrop').addEventListener('click', e => {
        if (e.target.classList.contains('modal-backdrop')) close();
      });
      const grid = root.querySelector('#cpick2-grid');
      const bind = () => grid.querySelectorAll('[data-card]').forEach(el => el.addEventListener('click', () => {
        const c = State.library.find(x => x.id === el.dataset.card);
        if (!c) return;
        close();
        this.loadSource({
          deviationId: c.da && c.da.deviationId ? String(c.da.deviationId) : '',
          title: c.metadata?.title || c.fname,
          url: c.da && c.da.url || '',
          prompt: c.prompt,
          theme: c.theme,
          fname: c.fname,
          cardId: c.id
        });
      }));
      bind();
      const search = root.querySelector('#cpick2-search');
      search.addEventListener('input', U.debounce(() => {
        grid.innerHTML = render(search.value);
        bind();
      }, 150));
      search.focus();
    },
    async loadComments() {
      if (!source || !source.deviationId) {
        return window.toast('Pick a published deviation first — comments only exist on DeviantArt.', 'err');
      }
      const state = $('#cont-comment-state');
      const list = $('#cont-comments');
      state.textContent = '· reading…';
      list.innerHTML = '';
      const res = await Continuations.fetchComments(source.deviationId);
      if (!res.ok) {
        state.textContent = '';
        list.innerHTML = `<div class="hint err">Could not read the comments: ${esc(res.error || 'unknown')}.\n          Make sure the DeviantArt tab is logged in — this reads through the same session.</div>`;
        return;
      }
      if (!res.items.length) {
        state.textContent = '· none';
        list.innerHTML = `<div class="hint">No comments on this one.</div>`;
        return;
      }
      const hidden = Math.max(0, (res.total || 0) - res.items.length);
      state.textContent = hidden ? `· ${res.items.length} of ${res.total} (${hidden} are replies)` : `· ${res.items.length}`;
      list.innerHTML = res.items.slice(0, 25).map((c, i) => `\n        <div class="cont-comment ${c.matched.length ? 'wanted' : ''}" data-ci="${i}">\n          <div class="cc-head">\n            <b>${esc(c.author)}</b>\n            ${c.matched.length ? `<span class="src-badge deviantart">${esc(c.matched[0])}</span>` : ''}\n            ${c.mine ? `<span class="src-badge none">your reply</span>` : ''}\n            ${c.already ? `<span class="src-badge none">already saved</span>` : ''}\n            <span class="hint">${c.at ? new Date(c.at).toLocaleDateString() : ''}</span>\n          </div>\n          <div class="cc-text">${esc(c.text.slice(0, 420))}</div>\n          <div class="btn-row">\n            <button class="btn ghost small" data-use="${i}">Use this</button>\n            <button class="btn ghost small" data-save="${i}">Save as request</button>\n          </div>\n        </div>`).join('');
      list.querySelectorAll('[data-use]').forEach(b => b.addEventListener('click', () => {
        $('#cont-request').value = res.items[Number(b.dataset.use)].text;
        window.toast('Loaded into the request box.', 'ok');
      }));
      list.querySelectorAll('[data-save]').forEach(b => b.addEventListener('click', () => {
        const c = res.items[Number(b.dataset.save)];
        Continuations.add({
          deviationId: source.deviationId,
          title: source.title,
          url: source.url,
          text: c.text,
          author: c.author,
          source: 'comment'
        });
        window.toast('Saved to the request board.', 'ok');
      }));
    },
    async write() {
      if (!source) return window.toast('Pick something to continue first.', 'err');
      const btn = $('#btn-cont-write');
      const status = $('#cont-status');
      const count = Math.max(1, Math.min(8, Number($('#cont-count').value) || 2));
      const useVision = $('#cont-vision').checked;
      btn.disabled = true;
      status.textContent = useVision ? 'Reading the original, then writing…' : 'Writing…';
      try {
        const out = await Continuations.write({
          deviationId: source.deviationId,
          prompt: source.prompt,
          fname: source.fname,
          theme: source.theme,
          request: $('#cont-request').value,
          instruction: $('#cont-instruction').value,
          anchors: ANCHOR_PRESETS[$('#cont-anchor-preset').value] || ANCHOR_PRESETS.character,
          count: count,
          useVision: useVision,
          style: $('#cont-style').value,
          useGuidance: $('#cont-guidance').checked
        });
        written = out.prompts;
        lastSheet = out.sheet;
        status.textContent = `${written.length} written` + (out.sheetSource === 'vision' ? ' — the original was read first, so the details carry over.' : '.');
        this.renderResults();
      } catch (e) {
        status.textContent = '';
        window.toast('Could not write it: ' + e.message, 'err');
        State.addLog('Continuation failed: ' + e.message, 'err');
      } finally {
        btn.disabled = false;
      }
    },
    renderResults() {
      const root = $('#cont-results');
      if (!root) return;
      if (!written.length) {
        root.innerHTML = '';
        return;
      }
      root.innerHTML = `\n        ${lastSheet ? `<details class="cont-sheet"><summary>What the vision model saw in the original</summary><pre>${esc(lastSheet)}</pre></details>` : ''}\n        ${written.map((p, i) => `<div class="draft-prompt" data-i="${i}">\n          <textarea rows="4" data-cp="${i}">${esc(p)}</textarea>\n          <div class="btn-row">\n            <button class="btn small" data-queue1="${i}">Queue this one</button>\n            <button class="btn ghost small" data-copy="${i}">⧉ Copy</button>\n            <button class="btn ghost small" data-drop="${i}">Discard</button>\n          </div>\n        </div>`).join('')}\n        <div class="btn-row" style="margin-top:10px">\n          <button class="btn primary" id="btn-cont-queue-all">Queue all ${written.length}</button>\n        </div>`;
      root.querySelectorAll('[data-cp]').forEach(ta => ta.addEventListener('input', () => {
        written[Number(ta.dataset.cp)] = ta.value;
      }));
      root.querySelectorAll('[data-queue1]').forEach(b => b.addEventListener('click', () => this.queue([ written[Number(b.dataset.queue1)] ])));
      root.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => {
        window.ala.clip.text(written[Number(b.dataset.copy)]);
        window.toast('Copied.', 'ok');
      }));
      root.querySelectorAll('[data-drop]').forEach(b => b.addEventListener('click', () => {
        written.splice(Number(b.dataset.drop), 1);
        this.renderResults();
      }));
      const all = root.querySelector('#btn-cont-queue-all');
      if (all) all.addEventListener('click', () => this.queue(written));
    },
    queue(prompts) {
      const list = prompts.filter(p => String(p || '').trim());
      if (!list.length) return;
      Continuations.queue(list, {
        deviationId: source ? source.deviationId : '',
        theme: source ? source.theme : '',
        requestId: this._activeRequestId || null
      });
      window.toast(`${list.length} continuation prompt(s) queued — start the worker to generate them.`, 'ok');
      if (this._activeRequestId) this._activeRequestId = null;
      this.renderBoard();
    },
    saveRequest() {
      if (!source) return window.toast('Pick something to continue first.', 'err');
      const text = $('#cont-request').value.trim();
      const instruction = $('#cont-instruction').value.trim();
      if (!text && !instruction) return window.toast('Write the request or the direction first.', 'err');
      Continuations.add({
        deviationId: source.deviationId,
        title: source.title,
        url: source.url,
        text: text || instruction,
        instruction: instruction,
        source: 'manual'
      });
      window.toast('Saved to the request board.', 'ok');
    },
    renderBoard() {
      const root = $('#cont-board');
      if (!root) return;
      const all = Continuations.data.items;
      const items = boardFilter === 'all' ? all : all.filter(r => r.status === boardFilter);
      const count = $('#cont-board-count');
      if (count) count.textContent = all.length ? `· ${items.length} of ${all.length}` : '';
      if (!items.length) {
        root.innerHTML = `<div class="hint">${boardFilter === 'open' ? 'No open requests. Read the comments on a deviation and save the ones worth doing.' : 'Nothing here.'}</div>`;
        return;
      }
      root.innerHTML = items.map(r => {
        const made = (r.jobIds || []).length;
        return `<div class="cont-req" data-req="${r.id}">\n          <div class="cr-head">\n            <b>${esc(r.title || 'a deviation')}</b>\n            <span class="pill ${r.status === 'done' ? 'approved' : r.status === 'queued' ? 'metadata' : 'review'}">${esc(r.status)}</span>\n            ${r.author ? `<span class="hint">asked by ${esc(r.author)}</span>` : ''}\n            <span class="hint">${new Date(r.createdAt).toLocaleDateString()}</span>\n          </div>\n          <div class="cr-text">“${esc(r.text.slice(0, 300))}”</div>\n          ${r.instruction ? `<div class="hint">direction: ${esc(r.instruction)}</div>` : ''}\n          ${made ? `<div class="hint">${made} prompt(s) queued for it</div>` : ''}\n          <div class="btn-row">\n            <button class="btn small" data-load="${r.id}">Work on it</button>\n            ${r.status !== 'done' ? `<button class="btn ghost small" data-done="${r.id}">Mark done</button>` : ''}\n            ${r.url ? `<button class="btn ghost small" data-openreq="${r.id}">Open ↗</button>` : ''}\n            <button class="btn ghost small" data-del="${r.id}">🗑</button>\n          </div>\n        </div>`;
      }).join('');
      root.querySelectorAll('[data-load]').forEach(b => b.addEventListener('click', () => this.workOn(b.dataset.load)));
      root.querySelectorAll('[data-done]').forEach(b => b.addEventListener('click', () => Continuations.update(b.dataset.done, {
        status: 'done'
      })));
      root.querySelectorAll('[data-openreq]').forEach(b => b.addEventListener('click', () => {
        const r = all.find(x => x.id === b.dataset.openreq);
        if (r && r.url) window.ala.app.openExternal(r.url);
      }));
      root.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => Continuations.remove(b.dataset.del)));
    },
    workOn(requestId) {
      const req = Continuations.data.items.find(r => r.id === requestId);
      if (!req) return;
      const dev = Insights.perf.deviations.find(d => String(d.deviationId) === String(req.deviationId));
      const res = dev ? Origins.resolve(dev) : Origins.resolve(req.deviationId);
      this.loadSource({
        deviationId: req.deviationId,
        title: req.title || dev && dev.title || '',
        url: req.url || dev && dev.url || '',
        prompt: res.prompt,
        theme: res.theme,
        fname: res.fname,
        thumb: dev && dev.thumb
      });
      $('#cont-request').value = req.text || '';
      $('#cont-instruction').value = req.instruction || '';
      this._activeRequestId = requestId;
      window.toast('Loaded. Anything you queue now is recorded against this request.', '');
    }
  };
  window.ContinuationsUI = ContinuationsUI;
})();
