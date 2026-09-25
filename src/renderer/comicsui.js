(function() {
  const $ = sel => document.querySelector(sel);
  const esc = U.escapeHtml;
  let activeId = null;
  let previewScale = 1;
  let previewBoxes = [];
  let drag = null;
  const ComicsUI = {
    wire() {
      $('#btn-comic-new-page').addEventListener('click', () => this.create('page'));
      $('#btn-comic-new-story').addEventListener('click', () => this.create('story'));
      State.on('comics', () => this.renderRail());
      State.on('comicsBusy', ({running: running, projectId: projectId}) => {
        if (projectId === activeId) this.renderWork(); else this.renderRail();
        if (!running) this.repaint();
      });
    },
    render() {
      this.renderRail();
      this.renderWork();
    },
    create(kind, seed = {}) {
      const p = Comics.create({
        name: kind === 'story' ? 'Untitled story' : 'Untitled comic',
        kind: kind,
        panels: kind === 'story' ? 1 : 4,
        ...seed
      });
      activeId = p.id;
      this.render();
      const box = $('#cm-premise');
      if (box) {
        box.focus();
        box.setSelectionRange(box.value.length, box.value.length);
      }
    },
    active() {
      return activeId ? Comics.get(activeId) : null;
    },
    renderRail() {
      const root = $('#comic-projects');
      if (!root) return;
      const list = Comics.data.projects;
      if (!list.length) {
        root.innerHTML = `<div class="hint">No projects yet. A <b>comic page</b> is panels in\n          gutters with the words drawn on top. An <b>illustrated story</b> is one picture with\n          the text beside it.</div>`;
        return;
      }
      root.innerHTML = list.map(p => {
        const done = p.panels.filter(x => x.fname).length;
        const thumb = p.page && p.page.url || (p.panels.find(x => x.url) || {}).url || '';
        return `<div class="comic-proj ${p.id === activeId ? 'on' : ''}" data-proj="${p.id}">\n          ${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy" />` : `<div class="arch-nothumb">▥</div>`}\n          <div class="cp-info">\n            <div class="cp-name">${esc(p.title || p.name)}</div>\n            <div class="hint">${p.kind === 'story' ? 'story' : `${p.panels.length} panels`} ·\n              ${done}/${p.panels.length} drawn${p.page ? ' · composed' : ''}</div>\n          </div>\n        </div>`;
      }).join('');
      root.querySelectorAll('[data-proj]').forEach(el => el.addEventListener('click', () => {
        activeId = el.dataset.proj;
        this.render();
      }));
    },
    guideHtml() {
      return `\n        <div class="panel">\n          <div class="panel-head"><h2>How a comic gets made here</h2></div>\n          <ol class="cm-guide">\n            <li><b>Write the premise.</b> One or two sentences saying what happens. Everything below is written from it.</li>\n            <li><b>Get a model sheet.</b> A fixed physical description of the character, written once — hair, eyes,\n              body, outfit. It is pasted word for word into every panel prompt, and it is the main reason the\n              character stays the same person across the page.</li>\n            <li><b>Get a script.</b> One call writes every panel: the beat, the image prompt, the caption and the\n              spoken lines. All of it is editable afterwards.</li>\n            <li><b>Draw the panels.</b> Each panel is generated through the Perchance tab, one at a time — so leave\n              that tab alone while it runs. Every take is kept, and you can pick a different one later.</li>\n            <li><b>Compose the page.</b> The panels are laid out in gutters and the words are drawn on top. The\n              finished page lands in Review as one ordinary card — panels themselves are never published, only the page.</li>\n          </ol>\n          <div class="hint" style="margin-top:12px">A <b>comic page</b> is several panels in gutters with the words\n            drawn on top. An <b>illustrated story</b> is a single picture with a block of prose beside it. Both end up\n            as one image in Review.</div>\n          <div class="btn-row" style="margin-top:14px">\n            <button class="btn primary" id="cm-guide-page">+ Comic page</button>\n            <button class="btn" id="cm-guide-story">+ Illustrated story</button>\n            <button class="btn ghost" id="cm-guide-example">Start from an example</button>\n          </div>\n          <div class="hint" style="margin-top:8px">The example fills in a premise and theme so you can press\n            straight through the steps once and see what comes out.${Comics.data.projects.length ? ' Your existing projects are on the left — click one to carry on with it.' : ''}</div>\n        </div>`;
    },
    wireGuide() {
      const bind = (sel, fn) => {
        const el = $(sel);
        if (el) el.addEventListener('click', fn);
      };
      bind('#cm-guide-page', () => this.create('page'));
      bind('#cm-guide-story', () => this.create('story'));
      bind('#cm-guide-example', () => this.create('page', {
        name: 'Wrong bottle',
        premise: 'A tiny robot gets lost in a huge library and, over four panels, ' + 'finds its way home by following a paper bird.',
        theme: 'lost robot adventure'
      }));
    },
    steps(p) {
      const drawn = p.panels.filter(x => x.fname).length;
      const scripted = p.panels.filter(x => (x.prompt || x.beat || '').trim()).length;
      return [ {
        id: 'premise',
        n: 1,
        label: 'Premise',
        done: !!p.premise.trim(),
        note: p.premise.trim() ? '' : 'write it'
      }, {
        id: 'bible',
        n: 2,
        label: 'Model sheet',
        done: !!p.bible.characters.length,
        note: p.bible.characters.length ? `${p.bible.characters.length} character${p.bible.characters.length > 1 ? 's' : ''}` : ''
      }, {
        id: 'script',
        n: 3,
        label: 'Script',
        done: scripted > 0 && scripted === p.panels.length,
        note: scripted ? `${scripted}/${p.panels.length}` : ''
      }, {
        id: 'panels',
        n: 4,
        label: 'Panels drawn',
        done: drawn > 0 && drawn === p.panels.length,
        note: drawn ? `${drawn}/${p.panels.length}` : ''
      }, {
        id: 'page',
        n: 5,
        label: 'Page',
        done: !!p.page,
        note: p.page ? 'in Review' : ''
      } ];
    },
    nextAction(p) {
      const step = this.steps(p).find(s => !s.done);
      const drawn = p.panels.filter(x => x.fname).length;
      const left = p.panels.length - drawn;
      switch (step && step.id) {
       case 'premise':
        return {
          label: 'Start with the premise',
          cost: 'Two sentences is plenty — everything else is written from it.',
          run: () => {
            const b = $('#cm-premise');
            if (b) {
              b.focus();
              b.scrollIntoView({
                block: 'center'
              });
            }
          }
        };

       case 'bible':
        return {
          label: 'Write the model sheet',
          cost: 'One writer call. Fixes what the character looks like, so every panel can repeat it.',
          run: () => this.run('#cm-next', 'Writing the model sheet…', async () => {
            await Comics.writeBible(p);
            this.renderWork();
          })
        };

       case 'script':
        return {
          label: 'Write the script',
          cost: `One writer call. Beats, image prompts, captions and dialogue for all ${p.panels.length} panels.`,
          run: () => this.run('#cm-next', 'Writing the script…', async () => {
            await Comics.writeScript(p);
            this.renderWork();
          })
        };

       case 'panels':
        return {
          label: drawn ? `Draw the remaining ${left} panel${left > 1 ? 's' : ''}` : `Draw all ${p.panels.length} panels`,
          cost: 'Runs through the Perchance tab — leave that tab alone while it works, and expect about a minute per panel.',
          run: () => this.generateAll(p, false)
        };

       default:
        return {
          label: p.page ? 'Compose the page again' : 'Compose the page → Review',
          cost: 'Lays the panels out, draws the words on top, and sends one finished page to Review as a normal card.',
          run: () => this.exportPage(p)
        };
      }
    },
    renderWork() {
      const root = $('#comic-work');
      if (!root) return;
      const p = this.active();
      if (!p) {
        root.innerHTML = this.guideHtml();
        this.wireGuide();
        return;
      }
      const L = window.ComicLayout;
      const templates = Object.entries(L.LAYOUTS).filter(([, t]) => p.kind === 'story' ? t.kind === 'story' : t.kind === 'page');
      const drawn = p.panels.filter(x => x.fname).length;
      const steps = this.steps(p);
      const current = (steps.find(s => !s.done) || {}).id;
      const next = this.nextAction(p);
      root.innerHTML = `\n        <div class="panel">\n          <div class="panel-head">\n            <h2>${esc(p.title || p.name)} <span class="hint">${p.kind === 'story' ? 'illustrated story' : `${p.panels.length}-panel page`}</span></h2>\n            <div class="btn-row">\n              <button class="btn ghost small" id="cm-rename">Rename</button>\n              <button class="btn ghost small danger" id="cm-delete">Delete project</button>\n            </div>\n          </div>\n          <div class="cm-steps" id="cm-steps">\n            ${steps.map(s => `<div class="cm-step ${s.done ? 'done' : ''} ${s.id === current ? 'now' : ''}" data-goto="${s.id}"\n                title="Jump to this part of the page">\n              <span class="cs-n">${s.done ? '✓' : s.n}</span>\n              <span class="cs-l">${s.label}</span>\n              ${s.note ? `<span class="cs-note">${esc(s.note)}</span>` : ''}\n            </div>`).join('<span class="cm-arrow">›</span>')}\n          </div>\n          <div class="cm-next">\n            <button class="btn primary" id="cm-next" ${Comics.busy ? 'disabled' : ''}>${esc(next.label)}</button>\n            ${current === 'bible' ? `<button class="btn" id="cm-writeall" ${Comics.busy ? 'disabled' : ''}>Model sheet + script in one go</button>` : ''}\n            <span class="hint">${esc(next.cost)}</span>\n          </div>\n          <div id="cm-status" class="hint">${Comics.busy ? 'Drawing…' : ''}</div>\n        </div>\n\n        <div class="panel" id="cm-sec-premise">\n          <div class="panel-head"><h2>1 · What it is about</h2></div>\n          <label class="fld"><span>The premise <em>(the model sheet, the script and every panel prompt are written from this)</em></span>\n            <textarea id="cm-premise" rows="3" placeholder="e.g. a tiny robot gets lost in a huge library and finds its way home over four panels">${esc(p.premise)}</textarea></label>\n          <div class="fld-row">\n            <label class="fld"><span>Theme</span><input id="cm-theme" type="text" value="${esc(p.theme)}" placeholder="e.g. lost robot adventure" /></label>\n            <label class="fld slim"><span>Tone</span><input id="cm-tone" type="text" value="${esc(p.tone)}" placeholder="playful" /></label>\n            <label class="fld slim"><span>Panels</span>\n              <input id="cm-count" type="number" min="1" max="12" value="${p.panels.length}" /></label>\n          </div>\n          <details class="fold">\n            <summary>Generation settings <em>— consistency, candidates, panel shape</em></summary>\n            <div class="fld-row">\n              <label class="fld"><span>Consistency</span>\n                <select id="cm-vision">\n                  <option value="off" ${p.visionMode === 'off' ? 'selected' : ''}>No vision — repeat the model sheet in every panel</option>\n                  <option value="continuity" ${p.visionMode === 'continuity' ? 'selected' : ''}>Vision — read each finished panel and carry it forward</option>\n                </select></label>\n              <label class="fld slim"><span>Candidates / panel</span>\n                <input id="cm-cands" type="number" min="1" max="6" value="${p.candidatesPerPanel}" /></label>\n              <label class="fld slim"><span>Panel shape</span>\n                <select id="cm-shape">\n                  <option value="" ${!p.shape ? 'selected' : ''}>whatever is set</option>\n                  <option value="square" ${p.shape === 'square' ? 'selected' : ''}>square</option>\n                  <option value="portrait" ${p.shape === 'portrait' ? 'selected' : ''}>portrait</option>\n                  <option value="landscape" ${p.shape === 'landscape' ? 'selected' : ''}>landscape</option>\n                </select></label>\n            </div>\n            <div class="hint">${p.visionMode === 'off' ? 'No vision calls at all: the character description is written once and pasted into every panel prompt. Fast, works on a text-only provider, and it is most of what keeps the character the same.' : 'Each finished panel is read back by the vision model, and what it actually shows is folded into the next panel — this is what catches the details the prompt never specified. Costs one vision call per panel, plus one per candidate it judges.'}</div>\n          </details>\n          <div class="btn-row" style="margin-top:12px">\n            <button class="btn ghost small" id="cm-bible">Rewrite the model sheet</button>\n            <button class="btn ghost small" id="cm-script">Rewrite the script</button>\n            <button class="btn ghost small" id="cm-genall" ${Comics.busy ? 'disabled' : ''}>Draw ${drawn ? 'the rest' : 'every panel'}</button>\n            ${drawn ? `<button class="btn ghost small" id="cm-redraw" ${Comics.busy ? 'disabled' : ''}>Redraw all</button>` : ''}\n          </div>\n          <div class="hint">Any of these can be re-run at any time. Rewriting the script keeps the panel images that are already drawn.</div>\n        </div>\n\n        ${p.bible.characters.length ? `\n        <div class="panel" id="cm-sec-bible">\n          <div class="panel-head"><h2>2 · Model sheet <span class="hint">pasted verbatim into every panel prompt</span></h2></div>\n          <div class="hint" style="margin-bottom:10px">Edit these freely — whatever is written here is what the\n            generator is told about the character in every single panel, so this is the most direct control you have\n            over "is it still the same girl in panel four".</div>\n          ${p.bible.characters.map((c, i) => `\n            <div class="fld-row">\n              <label class="fld slim"><span>Name</span><input type="text" data-bib="name" data-i="${i}" value="${esc(c.name)}" /></label>\n              <label class="fld"><span>Fixed description</span><input type="text" data-bib="look" data-i="${i}" value="${esc(c.look)}" /></label>\n              <label class="fld"><span>After a change <em>(optional)</em></span><input type="text" data-bib="transformTo" data-i="${i}" value="${esc(c.transformTo || '')}" /></label>\n            </div>`).join('')}\n          <div class="fld-row">\n            <label class="fld"><span>Setting</span><input type="text" id="cm-setting" value="${esc(p.bible.setting)}" /></label>\n            <label class="fld"><span>Rendering style</span><input type="text" id="cm-style" value="${esc(p.bible.style)}" /></label>\n          </div>\n        </div>` : ''}\n\n        <div class="panel" id="cm-sec-script">\n          <div class="panel-head"><h2>3 · The script, panel by panel <span class="hint">and 4 · the drawings</span></h2>\n            <div class="btn-row"><button class="btn ghost small" id="cm-addpanel">+ Panel</button></div>\n          </div>\n          <div class="hint" style="margin-bottom:10px">The <b>beat</b> is what happens, for you to read. The\n            <b>image prompt</b> is what the generator is told — the model sheet is added to the front of it\n            automatically, so do not repeat the character description here. <b>Caption</b> and the speech lines are\n            drawn onto the page afterwards, never by the generator.</div>\n          <div class="comic-panels" id="cm-panels"></div>\n        </div>\n\n        ${p.kind === 'story' ? `\n        <div class="panel">\n          <div class="panel-head"><h2>The story text</h2>\n            <div class="btn-row"><button class="btn small" id="cm-writestory">Write it</button></div>\n          </div>\n          <textarea id="cm-story" rows="8" placeholder="The prose that sits beside the picture.">${esc(p.story)}</textarea>\n          <div class="hint">It shrinks to fit its column when the page is composed. If it has to\n            shrink past legibility the activity log says so — shorten it or use a taller layout.</div>\n        </div>` : ''}\n\n        <div class="panel" id="cm-sec-page">\n          <div class="panel-head"><h2>5 · The page</h2>\n            <div class="btn-row">\n              <button class="btn" id="cm-recompose">Refresh preview</button>\n              <button class="btn primary" id="cm-export">Compose → Review</button>\n            </div>\n          </div>\n          <div class="fld-row">\n            <label class="fld"><span>Layout</span>\n              <select id="cm-template">\n                ${templates.map(([id, t]) => `<option value="${id}" ${p.template === id ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}\n                <option value="auto" ${p.template === 'auto' ? 'selected' : ''}>Auto grid</option>\n              </select></label>\n            <div class="checkbox-row" style="margin:0 0 12px auto"><input type="checkbox" id="cm-showtitle" ${p.style.showTitle ? 'checked' : ''} /><span>Draw the title on the page</span></div>\n          </div>\n          <details class="fold">\n            <summary>Page size &amp; lettering <em>— dimensions, gutters, fonts, colour</em></summary>\n            <div class="fld-row">\n              <label class="fld slim"><span>Width</span><input type="number" id="cm-w" min="600" max="4000" step="50" value="${p.geom.width}" /></label>\n              <label class="fld slim"><span>Height</span><input type="number" id="cm-h" min="600" max="5000" step="50" value="${p.geom.height}" /></label>\n              <label class="fld slim"><span>Gutter</span><input type="number" id="cm-gut" min="0" max="120" value="${p.geom.gutter}" /></label>\n              <label class="fld slim"><span>Border</span><input type="number" id="cm-bord" min="0" max="20" value="${p.style.panelBorderWidth}" /></label>\n              <label class="fld slim"><span>Page colour</span><input type="color" id="cm-pagebg" value="${esc(hexOf(p.style.pageBg))}" /></label>\n            </div>\n            <div class="fld-row">\n              <label class="fld slim"><span>Lettering</span>\n                <select id="cm-font">\n                  ${[ '"Comic Sans MS", "Segoe UI", sans-serif', '"Segoe UI", sans-serif', 'Georgia, serif', '"Trebuchet MS", sans-serif', 'Impact, sans-serif' ].map(f => `<option value='${esc(f)}' ${p.style.font === f ? 'selected' : ''}>${esc(f.split(',')[0].replace(/"/g, ''))}</option>`).join('')}\n                </select></label>\n              <label class="fld slim"><span>Caption size</span><input type="number" id="cm-capsize" min="10" max="60" value="${p.style.captionSize}" /></label>\n              <label class="fld slim"><span>Bubble size</span><input type="number" id="cm-bubsize" min="10" max="60" value="${p.style.bubbleSize}" /></label>\n              ${p.kind === 'story' ? `<label class="fld slim"><span>Story size</span><input type="number" id="cm-storysize" min="10" max="60" value="${p.style.storySize}" /></label>` : ''}\n            </div>\n          </details>\n          <div class="comic-stage" id="cm-stage">\n            <canvas id="cm-canvas"></canvas>\n          </div>\n          <div class="hint">This preview <b>is</b> the composer, drawn smaller — what you see here is what gets\n            exported. Drag a speech bubble to move it; drag its tail tip to point it at whoever is speaking. Both are\n            stored relative to the panel, so they survive a change of page size. The words themselves are edited on\n            the panels above.</div>\n        </div>`;
      this.wireWork(p);
      this.renderPanels(p);
      this.repaint();
    },
    wireWork(p) {
      const save = patch => {
        Comics.update(p.id, patch);
      };
      const bind = (sel, ev, fn) => {
        const el = $(sel);
        if (el) el.addEventListener(ev, fn);
      };
      bind('#cm-premise', 'input', U.debounce(e => save({
        premise: e.target.value
      }), 400));
      bind('#cm-theme', 'input', U.debounce(e => save({
        theme: e.target.value
      }), 400));
      bind('#cm-tone', 'input', U.debounce(e => save({
        tone: e.target.value
      }), 400));
      bind('#cm-vision', 'change', e => save({
        visionMode: e.target.value
      }));
      bind('#cm-cands', 'change', e => save({
        candidatesPerPanel: Math.max(1, Math.min(6, Number(e.target.value) || 2))
      }));
      bind('#cm-shape', 'change', e => save({
        shape: e.target.value
      }));
      bind('#cm-count', 'change', e => {
        Comics.setPanelCount(p, Number(e.target.value));
        this.renderWork();
      });
      bind('#cm-setting', 'input', U.debounce(e => {
        p.bible.setting = e.target.value;
        Comics.persist();
      }, 400));
      bind('#cm-style', 'input', U.debounce(e => {
        p.bible.style = e.target.value;
        Comics.persist();
      }, 400));
      bind('#cm-story', 'input', U.debounce(e => save({
        story: e.target.value
      }), 400));
      document.querySelectorAll('[data-bib]').forEach(inp => inp.addEventListener('input', U.debounce(() => {
        const c = p.bible.characters[Number(inp.dataset.i)];
        if (c) {
          c[inp.dataset.bib] = inp.value;
          Comics.persist();
        }
      }, 400)));
      bind('#cm-rename', 'click', async () => {
        const name = await askText({
          title: 'Rename',
          label: 'Title',
          value: p.title || p.name
        });
        if (name) {
          save({
            title: name,
            name: name
          });
          this.render();
        }
      });
      bind('#cm-delete', 'click', async () => {
        const withFiles = confirm(`Delete "${p.title || p.name}"?\n\nOK also deletes its panel images from disk.\nCancel keeps the images and deletes only the project.`);
        await Comics.remove(p.id, {
          withFiles: withFiles
        });
        activeId = null;
        this.render();
      });
      const next = this.nextAction(p);
      bind('#cm-next', 'click', () => next.run());
      bind('#cm-writeall', 'click', () => this.run('#cm-writeall', 'Writing the model sheet, then the script…', async () => {
        await Comics.writeScript(p);
        this.renderWork();
      }));
      document.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => {
        const target = $('#cm-sec-' + (el.dataset.goto === 'panels' ? 'script' : el.dataset.goto));
        if (target) target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
        if (el.dataset.goto === 'premise') {
          const b = $('#cm-premise');
          if (b) b.focus();
        }
      }));
      bind('#cm-bible', 'click', () => this.run('#cm-bible', 'Writing the model sheet…', async () => {
        await Comics.writeBible(p);
        this.renderWork();
      }));
      bind('#cm-script', 'click', () => this.run('#cm-script', 'Writing the script…', async () => {
        await Comics.writeScript(p);
        this.renderWork();
      }));
      bind('#cm-writestory', 'click', () => this.run('#cm-writestory', 'Writing the story…', async () => {
        await Comics.writeStory(p);
        this.renderWork();
      }));
      bind('#cm-genall', 'click', () => this.generateAll(p, false));
      bind('#cm-redraw', 'click', () => this.generateAll(p, true));
      bind('#cm-addpanel', 'click', () => {
        Comics.setPanelCount(p, p.panels.length + 1);
        this.renderWork();
      });
      const geom = (key, sel, min, max) => bind(sel, 'change', e => {
        p.geom[key] = Math.max(min, Math.min(max, Number(e.target.value) || min));
        Comics.persist();
        this.repaint();
      });
      geom('width', '#cm-w', 600, 4e3);
      geom('height', '#cm-h', 600, 5e3);
      geom('gutter', '#cm-gut', 0, 120);
      const style = (key, sel, transform = v => v) => bind(sel, 'change', e => {
        p.style[key] = transform(e.target.value);
        Comics.persist();
        this.repaint();
      });
      style('panelBorderWidth', '#cm-bord', v => Number(v) || 0);
      style('font', '#cm-font');
      style('captionSize', '#cm-capsize', v => Number(v) || 22);
      style('bubbleSize', '#cm-bubsize', v => Number(v) || 22);
      style('storySize', '#cm-storysize', v => Number(v) || 26);
      style('pageBg', '#cm-pagebg');
      bind('#cm-showtitle', 'change', e => {
        p.style.showTitle = e.target.checked;
        Comics.persist();
        this.repaint();
      });
      bind('#cm-template', 'change', e => {
        save({
          template: e.target.value
        });
        this.repaint();
      });
      bind('#cm-recompose', 'click', () => this.repaint());
      bind('#cm-export', 'click', () => this.exportPage(p));
      this.wireCanvas(p);
    },
    async run(sel, label, fn) {
      const btn = $(sel);
      const status = $('#cm-status');
      if (btn) btn.disabled = true;
      if (status) status.textContent = label;
      try {
        await fn();
        if ($('#cm-status')) $('#cm-status').textContent = '';
      } catch (e) {
        if ($('#cm-status')) $('#cm-status').textContent = '';
        window.toast(e.message, 'err');
        State.addLog('Comic: ' + e.message, 'err');
      } finally {
        const b = $(sel);
        if (b) b.disabled = false;
      }
    },
    async generateAll(p, redoAll) {
      const status = $('#cm-status');
      try {
        await Comics.generateAll(p, {
          redoAll: redoAll,
          onProgress: ({done: done, total: total, panel: panel}) => {
            if (status) {
              status.textContent = panel ? `Drawing panel ${panel.n} — ${done + 1} of ${total}. This uses the Perchance tab, so leave it alone.` : `Done — ${total} panel(s).`;
            }
            this.renderPanels(p);
          }
        });
        this.renderWork();
        window.toast('Every panel drawn.', 'ok');
      } catch (e) {
        if (status) status.textContent = '';
        window.toast(e.message, 'err');
        State.addLog('Comic generation stopped: ' + e.message, 'err');
        this.renderPanels(p);
      }
    },
    renderPanels(p) {
      const root = $('#cm-panels');
      if (!root) return;
      const changes = (p.bible.characters || []).some(c => c.transformTo);
      root.innerHTML = p.panels.map((panel, i) => `\n        <div class="comic-panel ${panel.status}" data-panel="${panel.id}">\n          <div class="cpan-art">\n            ${panel.url ? `<img src="${esc(panel.url)}" alt="" data-zoomp="${esc(panel.url)}" />` : `<div class="cpan-empty">${panel.status === 'generating' ? 'drawing…' : `panel ${i + 1}`}</div>`}\n            <span class="cpan-n">${i + 1}</span>\n          </div>\n          <div class="cpan-body">\n            <div class="fld-row">\n              <label class="fld"><span>Beat <em>(what happens)</em></span>\n                <input type="text" data-p="beat" data-id="${panel.id}" value="${esc(panel.beat)}" /></label>\n              ${changes ? `<label class="fld slim" style="max-width:150px"><span>Body <em>(which description)</em></span>\n                <select data-p="stage" data-id="${panel.id}">\n                  ${[ [ '', 'auto' ], [ 'before', 'before' ], [ 'changing', 'mid-change' ], [ 'after', 'after' ] ].map(([v, l]) => `<option value="${v}" ${(panel.stage || '') === v ? 'selected' : ''}>${l}${v === '' ? ` (${window.comicPanelStage(panel)})` : ''}</option>`).join('')}\n                </select></label>` : ''}\n            </div>\n            <label class="fld"><span>Image prompt <em>(what the generator is told — the model sheet is added automatically)</em></span>\n              <textarea rows="3" data-p="prompt" data-id="${panel.id}">${esc(panel.prompt)}</textarea></label>\n            <label class="fld"><span>Caption</span>\n              <input type="text" data-p="caption" data-id="${panel.id}" value="${esc(panel.caption)}" /></label>\n            <div class="cpan-lines">\n              ${(panel.dialogue || []).map((d, di) => `\n                <div class="cpan-line">\n                  <input type="text" class="cl-speaker" data-d="speaker" data-id="${panel.id}" data-di="${di}" value="${esc(d.speaker)}" placeholder="who" />\n                  <input type="text" class="cl-text" data-d="text" data-id="${panel.id}" data-di="${di}" value="${esc(d.text)}" placeholder="what they say" />\n                  <select class="cl-kind" data-d="kind" data-id="${panel.id}" data-di="${di}">\n                    <option value="speech" ${d.kind !== 'thought' ? 'selected' : ''}>speech</option>\n                    <option value="thought" ${d.kind === 'thought' ? 'selected' : ''}>thought</option>\n                  </select>\n                  <button class="btn ghost small" data-delline="${panel.id}:${di}">✕</button>\n                </div>`).join('')}\n              <button class="btn ghost small" data-addline="${panel.id}">+ line</button>\n            </div>\n            ${panel.error ? `<div class="hint err">${esc(panel.error)}</div>` : ''}\n            ${panel.continuity && panel.continuity.carryOver ? `<div class="hint" title="Read from the finished panel and handed to the next one">seen: ${esc(panel.continuity.carryOver)}</div>` : ''}\n            <div class="btn-row">\n              <button class="btn small" data-draw="${panel.id}" ${Comics.busy ? 'disabled' : ''}>${panel.fname ? 'Redraw' : 'Draw'}</button>\n              <button class="btn ghost small" data-showprompt="${panel.id}">See full prompt</button>\n              ${(panel.candidates || []).length > 1 ? `<button class="btn ghost small" data-cands="${panel.id}">${panel.candidates.length} takes</button>` : ''}\n              ${p.panels.length > 1 ? `<button class="btn ghost small" data-delpanel="${panel.id}">🗑</button>` : ''}\n            </div>\n          </div>\n        </div>`).join('');
      const find = id => p.panels.find(x => x.id === id);
      root.querySelectorAll('[data-p]').forEach(inp => inp.addEventListener('input', U.debounce(() => {
        const panel = find(inp.dataset.id);
        if (!panel) return;
        panel[inp.dataset.p] = inp.value;
        Comics.persist();
        if (inp.dataset.p === 'caption') this.repaint();
        if (inp.dataset.p === 'stage') this.renderPanels(p);
      }, 350)));
      root.querySelectorAll('[data-d]').forEach(inp => inp.addEventListener('input', U.debounce(() => {
        const panel = find(inp.dataset.id);
        const line = panel && panel.dialogue[Number(inp.dataset.di)];
        if (!line) return;
        line[inp.dataset.d] = inp.value;
        Comics.persist();
        this.repaint();
      }, 350)));
      root.querySelectorAll('[data-addline]').forEach(b => b.addEventListener('click', () => {
        const panel = find(b.dataset.addline);
        panel.dialogue = panel.dialogue || [];
        panel.dialogue.push({
          speaker: '',
          text: '',
          kind: 'speech',
          ...window.comicBubblePlacement(panel.dialogue.length)
        });
        Comics.persist();
        this.renderPanels(p);
      }));
      root.querySelectorAll('[data-delline]').forEach(b => b.addEventListener('click', () => {
        const [id, di] = b.dataset.delline.split(':');
        const panel = find(id);
        panel.dialogue.splice(Number(di), 1);
        Comics.persist();
        this.renderPanels(p);
        this.repaint();
      }));
      root.querySelectorAll('[data-draw]').forEach(b => b.addEventListener('click', async () => {
        this.renderPanels(p);
        try {
          await Comics.generatePanel(p, b.dataset.draw);
          this.repaint();
        } catch (e) {
          window.toast(e.message, 'err');
        } finally {
          this.renderPanels(p);
        }
      }));
      root.querySelectorAll('[data-showprompt]').forEach(b => b.addEventListener('click', () => {
        const panel = find(b.dataset.showprompt);
        showText('What the generator is sent for this panel', Comics.panelPrompt(p, panel));
      }));
      root.querySelectorAll('[data-cands]').forEach(b => b.addEventListener('click', () => this.openCandidates(p, find(b.dataset.cands))));
      root.querySelectorAll('[data-delpanel]').forEach(b => b.addEventListener('click', () => {
        p.panels = p.panels.filter(x => x.id !== b.dataset.delpanel);
        p.panels.forEach((x, i) => {
          x.n = i + 1;
        });
        p.panelCount = p.panels.length;
        Comics.persist();
        this.renderWork();
      }));
      root.querySelectorAll('[data-zoomp]').forEach(img => img.addEventListener('click', () => {
        const root2 = $('#modal-root');
        root2.innerHTML = `<div class="modal-backdrop"><img class="modal-img" src="${esc(img.dataset.zoomp)}" /></div>`;
        root2.querySelector('.modal-backdrop').addEventListener('click', () => {
          root2.innerHTML = '';
        });
      }));
    },
    openCandidates(project, panel) {
      const root = $('#modal-root');
      root.innerHTML = `<div class="modal-backdrop"><div class="panel pick-panel">\n        <div class="panel-head"><h2>Takes for panel ${panel.n}</h2>\n          <button class="btn ghost small" data-close>✕</button></div>\n        <div class="ref-picker">\n          ${(panel.candidates || []).map(c => `<div class="ref-pick ${c.fname === panel.fname ? 'on' : ''}" data-cand="${esc(c.fname)}">\n            <img src="${esc(c.url)}" alt="" loading="lazy" />\n            <div class="rp-meta">${c.fname === panel.fname ? 'in use' : 'use this'}</div>\n          </div>`).join('')}\n        </div>\n      </div></div>`;
      const close = () => {
        root.innerHTML = '';
      };
      root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
      root.querySelector('.modal-backdrop').addEventListener('click', e => {
        if (e.target.classList.contains('modal-backdrop')) close();
      });
      root.querySelectorAll('[data-cand]').forEach(el => el.addEventListener('click', () => {
        Comics.choose(project, panel, el.dataset.cand);
        close();
        this.renderPanels(project);
        this.repaint();
      }));
    },
    async repaint() {
      const p = this.active();
      const canvas = $('#cm-canvas');
      const stage = $('#cm-stage');
      if (!p || !canvas || !stage) return;
      const avail = Math.max(320, stage.clientWidth - 24);
      previewScale = Math.min(1, avail / p.geom.width);
      try {
        await Comics.compose(p, {
          scale: previewScale,
          canvas: canvas
        });
        const layout = ComicLayout.layoutFor(p.template, p.panels.length);
        const titleH = p.style.showTitle && p.title ? Math.round(54 * previewScale) : 0;
        const body = {
          width: canvas.width,
          height: canvas.height - titleH,
          margin: Math.round(p.geom.margin * previewScale),
          gutter: Math.round(p.geom.gutter * previewScale)
        };
        previewBoxes = ComicLayout.panelBoxes(layout, body).map(b => ({
          ...b,
          y: b.y + titleH
        }));
      } catch (e) {
        State.addLog('Comic preview failed: ' + e.message, 'err');
      }
    },
    wireCanvas(project) {
      const canvas = $('#cm-canvas');
      if (!canvas) return;
      const toPanelSpace = ev => {
        const rect = canvas.getBoundingClientRect();
        const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
        const y = (ev.clientY - rect.top) * (canvas.height / rect.height);
        for (let i = 0; i < previewBoxes.length; i++) {
          const b = previewBoxes[i];
          if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
            return {
              panelIdx: i,
              nx: (x - b.x) / b.w,
              ny: (y - b.y) / b.h
            };
          }
        }
        return null;
      };
      canvas.addEventListener('mousedown', ev => {
        const hit = toPanelSpace(ev);
        if (!hit) return;
        const panel = project.panels[hit.panelIdx];
        if (!panel || !(panel.dialogue || []).length) return;
        let best = null;
        panel.dialogue.forEach((d, di) => {
          const fallback = window.comicBubblePlacement(di);
          const a = d.anchor || fallback.anchor;
          const t = d.tailTo || fallback.tailTo;
          const dTail = Math.hypot(hit.nx - t.x, hit.ny - t.y);
          const dBody = Math.hypot(hit.nx - a.x, hit.ny - a.y);
          if (dTail < .08 && (!best || dTail < best.dist)) best = {
            di: di,
            part: 'tail',
            dist: dTail
          }; else if (dBody < .2 && (!best || dBody < best.dist)) best = {
            di: di,
            part: 'anchor',
            dist: dBody
          };
        });
        if (!best) return;
        ev.preventDefault();
        drag = {
          panelIdx: hit.panelIdx,
          lineIdx: best.di,
          part: best.part
        };
        canvas.classList.add('dragging');
      });
      const move = ev => {
        if (!drag) return;
        const hit = toPanelSpace(ev);
        if (!hit || hit.panelIdx !== drag.panelIdx) return;
        const line = project.panels[drag.panelIdx].dialogue[drag.lineIdx];
        const point = {
          x: Math.max(.02, Math.min(.98, hit.nx)),
          y: Math.max(.02, Math.min(.98, hit.ny))
        };
        if (drag.part === 'tail') line.tailTo = point; else line.anchor = point;
        this.repaint();
      };
      canvas.addEventListener('mousemove', move);
      window.addEventListener('mouseup', () => {
        if (!drag) return;
        drag = null;
        canvas.classList.remove('dragging');
        Comics.persist();
      });
    },
    async exportPage(p) {
      const missing = p.panels.filter(x => !x.fname).length;
      if (missing && !confirm(`${missing} panel(s) have no image yet — they will be drawn as empty boxes.\n\nCompose anyway?`)) return;
      await this.run('#cm-export', 'Composing…', async () => {
        const card = await Comics.exportPage(p, {
          writeMetadata: false
        });
        window.toast('Composed and sent to Review.', 'ok');
        this.renderWork();
        return card;
      });
    }
  };
  function hexOf(value) {
    const v = String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) return v;
    const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(v);
    if (m) return '#' + [ m[1], m[2], m[3] ].map(n => Number(n).toString(16).padStart(2, '0')).join('');
    return '#0f0d0c';
  }
  function showText(title, text) {
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-backdrop"><div class="panel ask-panel" style="max-width:720px">\n      <div class="panel-head"><h2>${esc(title)}</h2><button class="btn ghost small" data-close>✕</button></div>\n      <textarea rows="12" readonly>${esc(text)}</textarea>\n      <div class="btn-row" style="margin-top:10px;justify-content:flex-end">\n        <button class="btn" data-copy>⧉ Copy</button>\n        <button class="btn primary" data-close>Close</button>\n      </div>\n    </div></div>`;
    const close = () => {
      root.innerHTML = '';
    };
    root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    root.querySelector('[data-copy]').addEventListener('click', () => {
      window.ala.clip.text(text);
      window.toast('Copied.', 'ok');
    });
    root.querySelector('.modal-backdrop').addEventListener('click', e => {
      if (e.target.classList.contains('modal-backdrop')) close();
    });
  }
  function askText({title: title, label: label, value: value = ''}) {
    return new Promise(resolve => {
      const root = $('#modal-root');
      root.innerHTML = `<div class="modal-backdrop"><div class="panel ask-panel">\n        <div class="panel-head"><h2>${esc(title)}</h2><button class="btn ghost small" data-close>✕</button></div>\n        <label class="fld"><span>${esc(label)}</span><input type="text" id="ask-text" value="${esc(value)}" /></label>\n        <div class="btn-row" style="margin-top:12px;justify-content:flex-end">\n          <button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>OK</button>\n        </div>\n      </div></div>`;
      const done = v => {
        root.innerHTML = '';
        resolve(v);
      };
      root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => done(null)));
      const read = () => done(root.querySelector('#ask-text').value.trim() || null);
      root.querySelector('[data-ok]').addEventListener('click', read);
      const input = root.querySelector('#ask-text');
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          read();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          done(null);
        }
      });
      input.focus();
      input.select();
    });
  }
  window.ComicsUI = ComicsUI;
})();
