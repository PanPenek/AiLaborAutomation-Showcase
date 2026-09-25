(function() {
  const $ = sel => document.querySelector(sel);
  const $$ = sel => [ ...document.querySelectorAll(sel) ];
  const {escapeHtml: esc, fmtTime: fmtTime} = U;
  let wvPerchance = null;
  let wvDa = null;
  let wvUpscale = null;
  let wvPatreon = null;
  let wvPixiv = null;
  let reviewFilter = 'review';
  let reviewSort = 'score';
  let reviewDir = 'desc';
  let reviewQuery = '';
  window.addEventListener('DOMContentLoaded', async () => {
    wvPerchance = $('#wv-perchance');
    wvDa = $('#wv-da');
    wvUpscale = $('#wv-upscale');
    wvPatreon = $('#wv-patreon');
    wvPixiv = $('#wv-pixiv');
    await State.init();
    const runtime = await window.ala.app.runtime();
    if (runtime.review) {
      $('.brand-sub').textContent = 'REVIEW COPY';
      $('.brand-sub').title = 'Separate data and browser sessions. Changes here do not update the main app.';
      State.addLog('REVIEW COPY — separate library/settings. Production is unchanged; publish manually only after checking the composer.');
    }
    await Insights.init();
    await Titles.init();
    await Origins.init();
    await Continuations.init();
    await Comics.init();
    Pipeline.attachDriver(wvPerchance);
    await Pipeline.driver.loadCatalogCache();
    reviewSort = State.settings.ui?.reviewSort || 'score';
    reviewDir = State.settings.ui?.reviewDir || 'desc';
    Theme.apply(State.settings.ui?.theme || Theme.DEFAULT);
    applyTabVisibility();
    wireNav();
    wireHealth();
    wireDashboard();
    wireQueuePanel();
    wirePromptLab();
    wireReview();
    wireDrafts();
    wireStatsTab();
    wireTeach();
    OriginsUI.wire();
    ContinuationsUI.wire();
    ComicsUI.wire();
    wirePerchanceTab();
    gotoPerchanceGenerator();
    wireUpscalerTab();
    wirePatreonTab();
    wireDaTab();
    PixivUI.wire();
    OverseerUI.wire();
    TriageUI.wire();
    renderSettings();
    wireSettings();
    await Overseer.init();
    State.on('queue', () => {
      renderQueue();
      renderFlow();
    });
    const paintReview = whenPaneVisible('review', renderReview);
    const paintDrafts = whenPaneVisible('drafts', renderDrafts);
    const paintPatreon = whenPaneVisible('patreon', renderPatreonStrip);
    const paintPixiv = whenPaneVisible('pixiv', () => PixivUI.render());
    State.on('library', () => {
      paintReview();
      paintDrafts();
      paintPatreon();
      paintPixiv();
      updateBadges();
      renderAutoStatus();
      renderFlow();
    });
    State.on('perf', () => {
      if ($('#pane-stats').classList.contains('active')) renderStatsTab();
    });
    State.on('origins', () => {
      if ($('#pane-stats').classList.contains('active')) OriginsUI.render();
    });
    State.on('playbook', () => {
      renderPlaybook();
      renderTeach();
      renderGuidanceState();
    });
    State.on('worker', renderWorker);
    State.on('log', renderLog);
    State.on('stats', renderStats);
    State.on('daAuthLost', ({message: message}) => {
      toast('Signed out of DeviantArt — open the DeviantArt tab and log in. ' + (message || ''), 'err');
      refreshDaStatus();
    });
    window.ala.da.onAuthChanged(({authenticated: authenticated, error: error, hint: hint}) => {
      if (authenticated) {
        toast('DeviantArt connected.', 'ok');
        State.addLog('DeviantArt OAuth completed.', 'ok');
      } else {
        toast('DeviantArt auth failed: ' + (error || 'unknown'), 'err');
        State.addLog('DeviantArt auth failed: ' + (error || 'unknown'), 'err');
        if (hint) {
          State.addLog(hint, 'err');
          toast(hint, 'err');
        }
      }
      refreshDaStatus();
    });
    window.ala.da.onIdentity(() => refreshDaStatus());
    renderQueue();
    renderFlow();
    renderReview();
    renderDrafts();
    renderWorker();
    renderLog();
    renderStats();
    renderStatsTab();
    renderUpscaleStrip();
    renderPatreonStrip();
    PixivUI.render();
    ContinuationsUI.render();
    updateBadges();
    refreshHealth();
    refreshDaStatus().then(() => {
      if (daReady.session.ok) refreshStashState();
    });
    setInterval(() => {
      if ($('#pane-dashboard').classList.contains('active')) refreshHealth();
    }, 3e4);
    maybeAutoSync();
    setInterval(refreshDaStatus, 12e4);
    window.addEventListener('beforeunload', () => {
      try {
        persistCardField.flush();
        State.flushPersists();
      } catch {}
    });
    State.addLog('App ready.');
  });
  async function maybeAutoSync() {
    if (!window.Insights || State.settings.learn?.enabled === false) return;
    if (State.settings.overseer?.autoSync?.enabled !== false) return;
    if (!Insights.syncIsStale()) return;
    if (Pipeline.running || window.AutoMode && AutoMode.running) return;
    const readiness = await window.ala.da.uploadReadiness().catch(() => null);
    if (!readiness || !readiness.session.ok) return;
    State.addLog(`DeviantArt stats are older than ${State.settings.learn.autoSyncHours}h — refreshing in the background.`);
    const res = await Insights.sync({
      withViews: true,
      quiet: true,
      limit: State.settings.learn?.syncLimit || 50
    }).catch(e => ({
      ok: false,
      error: e.message
    }));
    State.addLog(res.ok ? `Background sync done — ${res.items.length} deviation(s) read.` : `Background sync skipped: ${res.error}`, res.ok ? 'ok' : 'err');
    if (res.ok) renderStatsTab();
  }
  function wireNav() {
    $$('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    const NUM_TABS = [ 'dashboard', 'promptlab', 'review', 'drafts', 'stats', 'comics', 'continuations', 'perchance' ];
    document.addEventListener('keydown', e => {
      if (!e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.shiftKey) {
        if (e.code === 'KeyO') {
          e.preventDefault();
          switchTab('overseer');
          OverseerUI.focusInput();
        }
        return;
      }
      if (e.key === '0') {
        e.preventDefault();
        return switchTab('settings');
      }
      if (e.key >= '1' && e.key <= '9') {
        const tab = NUM_TABS[Number(e.key) - 1];
        if (tab && tabShown(tab)) {
          e.preventDefault();
          switchTab(tab);
        }
      }
    });
  }
  const stalePanes = new Set;
  const paneRenderers = {};
  function whenPaneVisible(tab, render) {
    paneRenderers[tab] = render;
    return () => {
      const pane = $('#pane-' + tab);
      if (pane && !pane.classList.contains('active')) {
        stalePanes.add(tab);
        return;
      }
      stalePanes.delete(tab);
      render();
    };
  }
  function reclaimKeyboard(tab) {
    const pane = $('#pane-' + (tab || currentTab()));
    if (!pane || pane.querySelector('webview')) return;
    if (document.activeElement && document.activeElement.tagName === 'WEBVIEW') document.activeElement.blur();
    window.focus();
  }
  const currentTab = () => {
    const on = $$('.nav-btn').find(b => b.classList.contains('active'));
    return on ? on.dataset.tab : 'dashboard';
  };
  window.addEventListener('focus', () => reclaimKeyboard());
  const pixivShown = () => State.settings?.ui?.showPixiv === true;
  const perchanceShown = () => (State.settings?.gen?.engine || 'perchance') !== 'comfy' || State.settings?.ui?.showPerchance === true;
  const daShown = () => State.settings?.ui?.showDeviantArt !== false;
  const TAB_VIS = [ {
    tab: 'pixiv',
    cls: 'pixiv-off',
    shown: pixivShown
  }, {
    tab: 'perchance',
    cls: 'perchance-off',
    shown: perchanceShown
  }, {
    tab: 'deviantart',
    cls: 'da-off',
    shown: daShown
  } ];
  const tabShown = tab => {
    const t = TAB_VIS.find(x => x.tab === tab);
    return !t || t.shown();
  };
  function applyTabVisibility() {
    for (const t of TAB_VIS) {
      const on = t.shown();
      document.documentElement.classList.toggle(t.cls, !on);
      if (!on && $('#pane-' + t.tab)?.classList.contains('active')) switchTab('dashboard');
    }
  }
  function switchTab(tab) {
    if (tab === 'pixiv' && !pixivShown()) return;
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $$('.tab-pane').forEach(p => p.classList.toggle('active', p.id === 'pane-' + tab));
    reclaimKeyboard(tab);
    if (stalePanes.delete(tab) && paneRenderers[tab]) paneRenderers[tab]();
    if (tab === 'stats' && window.Insights) {
      Insights.relink();
      renderStatsTab();
      OriginsUI.render();
    }
    if (tab === 'comics' && window.ComicsUI) ComicsUI.render();
    if (tab === 'continuations' && window.ContinuationsUI) ContinuationsUI.render();
    if (tab === 'pixiv' && window.PixivUI) PixivUI.refreshStatus();
    if (tab === 'overseer' && window.OverseerUI) {
      OverseerUI.render();
      OverseerUI.focusInput();
    }
  }
  function wireDashboard() {
    $('#btn-worker-start').addEventListener('click', () => Pipeline.start());
    $('#btn-worker-pause').addEventListener('click', () => Pipeline.stop());
    $('#btn-clear-log').addEventListener('click', () => {
      State.log = [];
      renderLog();
    });
    wireModeToggles();
    wireAutoMode();
  }
  const MODE_TOGGLES = [ {
    key: 'skipQc',
    boxes: [ '#set-skipqc-dash', '#set-skipqc' ],
    hint: '#skipqc-hint',
    onText: 'Images are generated and go straight to Review uninspected — nothing is auto-discarded. Fast, and the sorting is yours.',
    offText: 'Every image is inspected by the vision model before it reaches Review. Accurate, but it is the slowest step in the pipeline.',
    onLog: 'AI quality check switched OFF — new images go straight to Review.',
    offLog: 'AI quality check switched back ON.'
  }, {
    key: 'skipMetadata',
    boxes: [ '#set-skipmeta-dash', '#set-skipmeta' ],
    hint: '#skipmeta-hint',
    onText: 'No title, description or tags are written automatically. Cards arrive bare; press Write metadata on the ones you like and it is generated from that image’s own prompt.',
    offText: 'Every image that reaches Review already has a title, description and tags, written from the prompt that generated it.',
    onLog: 'Auto metadata switched OFF — new images land in Review bare.',
    offLog: 'Auto metadata switched back ON.'
  }, {
    key: 'expandedStorytelling',
    group: 'metadata',
    boxes: [ '#set-expandstory-dash', '#set-expandstory' ],
    hint: '#expandstory-hint',
    onText: 'Descriptions are written long — 300-450 words, shaped as a short story with her own voice in it. This overrides the length in Settings, and it costs more tokens and more time per card.',
    offText: () => {
      const key = String((State.settings.metadata || {}).descriptionStyle || 'story');
      const name = {
        brief: 'Brief, 2-4 sentences',
        story: 'Story, 4-7 sentences',
        scene: 'Scene, 8-12 sentences'
      }[key] || 'Story, 4-7 sentences';
      return `Descriptions are written at the length set in Settings (${name}) — unchanged.`;
    },
    onLog: 'Expanded storytelling switched ON — new descriptions are written long.',
    offLog: 'Expanded storytelling switched OFF — back to the length set in Settings.'
  } ];
  function wireModeToggles() {
    for (const t of MODE_TOGGLES) {
      const group = t.group || 'gen';
      const paint = () => {
        const on = !!(State.settings[group] || {})[t.key];
        for (const sel of t.boxes) {
          const el = $(sel);
          if (el) el.checked = on;
        }
        const hint = $(t.hint);
        if (hint) {
          const text = on ? t.onText : t.offText;
          hint.textContent = typeof text === 'function' ? text() : text;
          hint.className = 'hint' + (on ? ' ok' : '');
        }
      };
      for (const sel of t.boxes) {
        const el = $(sel);
        if (!el || el.dataset.modeBound) continue;
        el.dataset.modeBound = '1';
        el.addEventListener('change', async e => {
          State.settings = await window.ala.settings.patch({
            [group]: {
              [t.key]: e.target.checked
            }
          });
          paint();
          renderReview();
          State.addLog(e.target.checked ? t.onLog : t.offLog, 'ok');
        });
      }
      paint();
    }
  }
  function wireAutoMode() {
    const a = State.settings.auto || {};
    $('#auto-per-round').value = a.promptsPerRound ?? 4;
    $('#auto-hours').value = a.stopAfterHours ?? 8;
    $('#auto-backlog').value = a.maxReviewBacklog ?? 80;
    $('#auto-rate').value = a.maxImagesPerHour ?? 0;
    const numField = (sel, key) => $(sel).addEventListener('change', e => AutoMode.patch({
      [key]: Number(e.target.value) || 0
    }));
    numField('#auto-per-round', 'promptsPerRound');
    numField('#auto-hours', 'stopAfterHours');
    numField('#auto-backlog', 'maxReviewBacklog');
    numField('#auto-rate', 'maxImagesPerHour');
    $('#auto-learn').checked = a.useLearning !== false;
    $('#auto-exploit').value = Math.round((a.exploitRatio ?? .4) * 100);
    $('#auto-relearn').value = a.relearnEveryRounds ?? 4;
    const syncLearnRow = () => {
      $('#auto-learn-row').style.opacity = $('#auto-learn').checked ? '1' : '0.45';
    };
    syncLearnRow();
    $('#auto-learn').addEventListener('change', e => {
      AutoMode.patch({
        useLearning: e.target.checked
      });
      syncLearnRow();
    });
    $('#auto-exploit').addEventListener('change', e => AutoMode.patch({
      exploitRatio: Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100
    }));
    $('#auto-relearn').addEventListener('change', e => AutoMode.patch({
      relearnEveryRounds: Math.max(0, Number(e.target.value) || 0)
    }));
    $('#btn-auto-start').addEventListener('click', () => {
      const themes = (State.settings.auto?.themes || []).filter(t => String(t.theme || '').trim());
      if (!themes.length) return toast('Add at least one theme first.', 'err');
      AutoMode.start();
    });
    $('#btn-auto-stop').addEventListener('click', () => {
      AutoMode.stop();
      toast('Auto mode will stop after the current round.', 'ok');
    });
    $('#btn-auto-add-theme').addEventListener('click', async () => {
      const themes = [ ...State.settings.auto?.themes || [], {
        theme: '',
        example: ''
      } ];
      await AutoMode.patch({
        themes: themes
      });
      renderAutoThemes();
      $('#auto-themes input')?.focus();
    });
    State.on('auto', renderAutoStatus);
    setInterval(() => {
      if (AutoMode.running) renderAutoStatus();
    }, 2e4);
    renderAutoThemes();
    renderAutoStatus();
    if (a.enabled) {
      AutoMode.patch({
        enabled: false
      });
      const mins = a.startedAt ? Math.round((Date.now() - a.startedAt) / 6e4) : 0;
      State.addLog(`Auto mode was still marked running from a previous session (${a.roundsDone || 0} round(s), ${mins}m in) — it did not resume automatically. Press Start to continue.`, 'err');
      toast('Auto mode did not resume after the last shutdown — press Start to continue.', 'err');
    }
  }
  const persistThemes = U.debounce(themes => AutoMode.patch({
    themes: themes
  }), 600);
  function renderAutoThemes() {
    const root = $('#auto-themes');
    const themes = State.settings.auto?.themes || [];
    if (!themes.length) {
      root.innerHTML = `<div class="hint">No themes yet. Add one — the theme is what to explore\n        ("a lighthouse cat in a storm"), and the example prompt is one of your own prompts whose style\n        and detail level the LLM should imitate for that theme.</div>`;
      return;
    }
    root.innerHTML = themes.map((t, i) => `\n      <div class="draft-prompt" style="flex-direction:column;align-items:stretch;gap:6px">\n        <div style="display:flex;gap:8px;align-items:center">\n          <input type="text" data-theme="${i}" placeholder="Theme" value="${esc(t.theme || '')}" style="flex:1" />\n          <button class="btn ghost small" data-theme-del="${i}" title="Remove">✕</button>\n        </div>\n        <textarea rows="2" data-example="${i}" placeholder="Example prompt for this theme (optional — style reference)">${esc(t.example || '')}</textarea>\n      </div>`).join('');
    const read = () => [ ...root.querySelectorAll('[data-theme]') ].map(inp => ({
      theme: inp.value,
      example: root.querySelector(`[data-example="${inp.dataset.theme}"]`)?.value || ''
    }));
    root.querySelectorAll('[data-theme], [data-example]').forEach(el => el.addEventListener('input', () => {
      State.settings.auto.themes = read();
      persistThemes(State.settings.auto.themes);
    }));
    root.querySelectorAll('[data-theme-del]').forEach(b => b.addEventListener('click', async () => {
      const next = read();
      next.splice(Number(b.dataset.themeDel), 1);
      await AutoMode.patch({
        themes: next
      });
      renderAutoThemes();
    }));
  }
  function renderAutoStatus() {
    const s = AutoMode.snapshot();
    const el = $('#auto-status');
    $('#btn-auto-start').disabled = s.running;
    $('#btn-auto-stop').disabled = !s.running;
    if (!s.running) {
      el.textContent = s.stopReason ? `Stopped — ${s.stopReason}. ${s.backlog} card(s) waiting in Review.` : 'Off. Add a theme below, then start — it ideates prompts, generates, QCs, and parks everything in Review. It never uploads.';
      el.className = 'worker-status';
      return;
    }
    const mins = Math.floor(s.elapsedMs / 6e4);
    const elapsed = `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}m`;
    const stops = [];
    if (s.stopAfterHours) stops.push(`${s.stopAfterHours}h`);
    if (s.maxBacklog) stops.push(`${s.maxBacklog} cards`);
    el.textContent = `${s.status} · round ${s.rounds} · ${s.backlog} in review · ${elapsed} elapsed` + (stops.length ? ` · stops at ${stops.join(' or ')}` : '');
    el.className = 'worker-status';
  }
  async function refreshHealth() {
    await Health.refresh();
    renderHealth();
  }
  function renderHealth() {
    Health.render($('#health-rows'));
    Health.render($('#side-health'), {
      compact: true
    });
    if ($('#glance-rows')) Health.render($('#glance-rows'));
    const age = $('#health-age');
    if (age) {
      const rows = Health.rows();
      const bad = rows.filter(r => r.level === 'bad').length;
      const warn = rows.filter(r => r.level === 'warn').length;
      age.textContent = bad ? `· ${bad} blocking` : warn ? `· ${warn} need attention` : '· all clear';
      age.className = 'hint ' + (bad ? 'err' : warn ? '' : 'ok');
    }
  }
  async function testAllEngines(btn) {
    const label = btn.textContent;
    btn.disabled = true;
    const roles = [ 'ideation', 'metadata' ].concat(State.settings.gen.skipQc ? [] : [ 'vision' ]);
    const results = [];
    for (const role of roles) {
      btn.textContent = `Testing ${role}…`;
      try {
        const r = await Health.test(role);
        results.push(`${role}: ${r.provider} ${(r.ms / 1e3).toFixed(1)}s${r.fellBack ? ' (fell back)' : ''}`);
      } catch (e) {
        results.push(`${role}: FAILED — ${e.message}`);
      }
    }
    btn.disabled = false;
    btn.textContent = label;
    State.addLog('Engine test — ' + results.join(' · '), results.some(r => /FAILED|fell back/.test(r)) ? 'err' : 'ok');
    toast(results.join('\n'), results.some(r => /FAILED/.test(r)) ? 'err' : 'ok');
    await refreshHealth();
    return results;
  }
  function wireHealth() {
    $('#btn-health-refresh').addEventListener('click', refreshHealth);
    $('#btn-flow-review').addEventListener('click', () => switchTab('review'));
    $('#btn-health-testall').addEventListener('click', e => testAllEngines(e.currentTarget));
    State.on('llm', renderHealth);
  }
  function renderFlow() {
    const root = $('#flow-strip');
    if (!root) return;
    const n = pred => State.library.filter(pred).length;
    const steps = [ {
      k: 'queued',
      label: 'Queued',
      v: State.queue.filter(j => j.status === 'queued').length,
      tab: 'promptlab',
      anchor: 'panel-lab-queue',
      hint: 'prompts waiting to generate — opens the queue in the Prompt Lab'
    }, {
      k: 'qc',
      label: 'Inspecting',
      v: n(c => c.status === 'qc'),
      tab: 'review',
      hint: 'in the QC lane, while the next prompt generates'
    }, {
      k: 'qc_error',
      label: 'QC failed to run',
      v: n(c => c.status === 'qc_error'),
      tab: 'review',
      hint: 'kept, retryable'
    }, {
      k: 'review',
      label: 'Needs review',
      v: n(c => c.status === 'review'),
      tab: 'review',
      hint: 'waiting on you'
    }, {
      k: 'pick',
      label: 'Batches to pick',
      v: window.TriageUI ? TriageUI.count('review').batches : 0,
      tab: 'review',
      pick: true,
      hint: 'one decision per prompt — click to open Pick keepers'
    }, {
      k: 'approved',
      label: 'Approved',
      v: n(c => c.status === 'approved'),
      tab: 'drafts',
      hint: 'ready to upload'
    }, {
      k: 'drafted',
      label: 'Uploaded',
      v: n(c => c.status === 'drafted'),
      tab: 'drafts',
      hint: 'submitted, or waiting in Sta.sh'
    }, {
      k: 'upload_failed',
      label: 'Rejected by DA',
      v: n(c => c.status === 'upload_failed'),
      tab: 'drafts',
      hint: 'needs an edit'
    } ];
    root.innerHTML = steps.map((s, i) => `\n      <div class="flow-step ${s.v ? '' : 'zero'} ${s.k}" data-flow="${s.tab}" ${s.pick ? 'data-pick="1"' : ''} ${s.anchor ? `data-anchor="${s.anchor}"` : ''} title="${esc(s.hint)}">\n        <div class="fs-v">${s.v}</div>\n        <div class="fs-l">${esc(s.label)}</div>\n      </div>${i < steps.length - 1 ? '<span class="flow-arrow">›</span>' : ''}`).join('');
    root.querySelectorAll('[data-flow]').forEach(el => el.addEventListener('click', () => {
      switchTab(el.dataset.flow);
      if (el.dataset.pick && window.TriageUI) TriageUI.open();
      if (el.dataset.anchor) $('#' + el.dataset.anchor)?.scrollIntoView({
        block: 'start',
        behavior: 'smooth'
      });
    }));
  }
  let daReady = {
    method: 'session',
    session: {
      ok: false
    },
    api: {
      authenticated: false
    }
  };
  async function refreshDaStatus() {
    const r = await window.ala.da.uploadReadiness().catch(e => ({
      method: 'session',
      session: {
        ok: false,
        error: e.message
      },
      api: {
        authenticated: false
      }
    }));
    daReady = r;
    const usingApi = r.method === 'api';
    const ok = usingApi ? r.api.authenticated : r.session.ok;
    const who = usingApi ? r.api.username : r.session.username;
    Health.da = r;
    if ($('#pane-dashboard').classList.contains('active')) renderHealth();
    const panel = $('#da-status');
    if (!panel) return;
    if (usingApi) {
      panel.innerHTML = r.api.authenticated ? `<span class="hint ok">API connected${r.api.username ? ' as @' + esc(r.api.username) : ''}. Drafts upload via stash/submit.</span>` : `<span class="hint err">API not connected. OAuth only works with a <b>published, approved</b> DeviantArt application — an unpublished one always answers “Invalid client_id”.\n           Switch Settings → DeviantArt → Upload method to <b>Session</b> to upload right now.</span>`;
    } else {
      panel.innerHTML = r.session.ok ? `<span class="hint ok">Signed in as @${esc(r.session.username)} — uploading through your DeviantArt session.\n           ${r.session.drafts != null ? esc(String(r.session.drafts)) + ' item(s) already in Sta.sh.' : ''} No API app needed.</span>` : `<span class="hint err">Not signed in to DeviantArt: ${esc(r.session.error || 'unknown')}.\n           Open the <b>DeviantArt tab</b> and log in — the session persists, and uploads use it directly.</span>`;
    }
  }
  function renderStats() {
    const s = State.stats;
    $('#dash-gen').textContent = s.imagesGenerated || 0;
    const total = (s.imagesPassed || 0) + (s.imagesFailed || 0);
    $('#dash-pass').textContent = total ? Math.round(100 * (s.imagesPassed || 0) / total) + '%' : '—';
    $('#dash-pass-hint').textContent = `${s.imagesPassed || 0} passed / ${s.imagesFailed || 0} failed`;
    $('#dash-drafts').textContent = s.draftsUploaded || 0;
  }
  function renderWorker() {
    const w = State.worker;
    const auto = window.AutoMode && AutoMode.running;
    $('#worker-status').textContent = w.statusText || 'Idle';
    const pill = $('#worker-pill');
    pill.classList.toggle('running', !!w.running);
    $('#worker-pill-text').textContent = auto ? w.running ? 'Auto mode running' : 'Auto mode — worker idle' : w.running ? 'Worker running' : 'Worker idle';
    $('#btn-worker-start').disabled = !!w.running;
    $('#btn-worker-pause').disabled = !w.running;
  }
  function renderLog() {
    const root = $('#activity-log');
    root.innerHTML = State.log.slice(-120).reverse().map(l => `<div class="log-line ${l.kind}"><span class="log-time">${fmtTime(l.ts)}</span><span>${esc(l.msg)}</span></div>`).join('');
  }
  function updateBadges() {
    const review = State.library.filter(c => c.status === 'review' || c.status === 'qc_error').length;
    const drafts = State.library.filter(c => Pipeline.awaitingPublish(c) || c.status === 'upload_failed').length;
    const patreon = State.library.filter(c => c.status === 'approved' && destFor(c) === 'patreon').length;
    const agent = State.library.filter(c => c.promptSource === 'overseer' && c.status === 'review').length;
    const rb = $('#badge-review'), db = $('#badge-drafts'), pb = $('#badge-patreon'), ob = $('#badge-overseer');
    rb.hidden = !review;
    rb.textContent = review;
    db.hidden = !drafts;
    db.textContent = drafts;
    if (pb) {
      pb.hidden = !patreon;
      pb.textContent = patreon;
    }
    if (ob) {
      ob.hidden = !agent;
      ob.textContent = agent;
    }
  }
  function queuePrompts(prompts, theme, source = 'ideation') {
    const waiting = new Set(State.queue.filter(j => [ 'queued', 'generating', 'qc' ].includes(j.status)).map(j => j.prompt.trim()));
    let queued = 0, skipped = 0;
    for (const raw of prompts) {
      const text = typeof raw === 'string' ? raw : String(raw && raw.prompt || '');
      const controls = raw && typeof raw === 'object' && raw.controls || null;
      const t = text.trim();
      if (!t) continue;
      if (waiting.has(t)) {
        skipped++;
        continue;
      }
      waiting.add(t);
      State.queue.push(Pipeline.makeJob(text, theme, source, null, controls));
      queued++;
    }
    if (queued) State.persistQueue();
    return {
      queued: queued,
      skipped: skipped
    };
  }
  function wireQueuePanel() {
    const boxes = {
      manual: $('#manual-box'),
      paste: $('#paste-box')
    };
    const pasteBtn = $('#btn-paste-toggle');
    const setOpen = (which, open) => {
      boxes[which].hidden = !open;
      if (which === 'paste') {
        pasteBtn.setAttribute('aria-expanded', String(open));
        pasteBtn.textContent = open ? 'Paste list ▴' : 'Paste list ▾';
      }
    };
    const toggle = which => {
      const open = boxes[which].hidden;
      setOpen(which, open);
      if (open) boxes[which].querySelector('textarea').focus();
    };
    $('#btn-add-manual').addEventListener('click', () => toggle('manual'));
    pasteBtn.addEventListener('click', () => toggle('paste'));
    $$('[data-addclose]').forEach(b => b.addEventListener('click', () => setOpen(b.dataset.addclose === 'paste-box' ? 'paste' : 'manual', false)));
    const report = (queued, skipped) => {
      toast(`Queued ${queued} prompt(s).${skipped ? ` ${skipped} already in the queue — skipped.` : ''}` + `${queued && !Pipeline.running ? ' Start the worker on the Dashboard.' : ''}`, queued ? 'ok' : 'err');
      if (queued) State.addLog(`Queued ${queued} prompt(s) by hand.${skipped ? ` ${skipped} duplicate(s) skipped.` : ''}`);
    };
    $('#btn-manual-queue').addEventListener('click', () => {
      const ta = $('#manual-input');
      const text = ta.value.trim();
      if (!text) return toast('Write a prompt first.', 'err');
      const {queued: queued, skipped: skipped} = queuePrompts([ text ], '', 'manual');
      report(queued, skipped);
      ta.value = '';
      setOpen('manual', false);
    });
    $('#btn-paste-queue').addEventListener('click', () => {
      const ta = $('#paste-list-input');
      const lines = ta.value.split(/\r?\n/).map(s => s.trim()).filter(s => s.length >= 10);
      if (!lines.length) return toast('Nothing usable — each line needs at least 10 characters.', 'err');
      const {queued: queued, skipped: skipped} = queuePrompts(lines, '', 'manual');
      report(queued, skipped);
      ta.value = '';
      setOpen('paste', false);
    });
    $('#btn-clear-done').addEventListener('click', () => {
      const before = State.queue.length;
      State.queue = State.queue.filter(j => ![ 'done', 'failed' ].includes(j.status));
      State.persistQueue();
      toast(`Cleared ${before - State.queue.length} finished job(s).`, 'ok');
    });
  }
  function renderQueue() {
    const root = $('#queue-list');
    const waiting = State.queue.filter(j => j.status === 'queued').length;
    const countEl = $('#queue-count');
    if (countEl) countEl.textContent = State.queue.length ? `· ${waiting} waiting · ${State.queue.length} total` : '';
    if (!State.queue.length) {
      root.innerHTML = `<div class="hint">Queue is empty. "Queue all" under Generated prompts, a manual prompt, or a pasted list lands here.</div>`;
      return;
    }
    const firstQueuedId = (State.queue.find(j => j.status === 'queued') || {}).id;
    root.innerHTML = State.queue.map(j => `\n      <div class="queue-item ${State.worker.currentJobId === j.id ? 'current' : ''}">\n        <div class="q-meta">\n          <span class="pill ${j.status}">${j.status}</span>\n          ${j.attempts ? `<span>attempt ${j.attempts}</span>` : ''}\n          ${j.error ? `<span style="color:var(--red)">${esc(j.error)}</span>` : ''}\n          <span style="margin-left:auto">${fmtTime(j.createdAt)}</span>\n          ${j.status === 'queued' && j.id !== firstQueuedId ? `<button class="btn ghost small" data-qtop="${j.id}" title="Run this one next">⏫</button>` : ''}\n          <button class="btn ghost small" data-qdel="${j.id}">✕</button>\n        </div>\n        <div class="q-prompt">${esc(j.prompt)}</div>\n      </div>`).join('');
    root.querySelectorAll('[data-qdel]').forEach(b => b.addEventListener('click', () => {
      State.queue = State.queue.filter(j => j.id !== b.dataset.qdel);
      State.persistQueue();
    }));
    root.querySelectorAll('[data-qtop]').forEach(b => b.addEventListener('click', () => {
      const job = State.queue.find(j => j.id === b.dataset.qtop);
      if (!job) return;
      State.queue = [ job, ...State.queue.filter(j => j !== job) ];
      State.persistQueue();
    }));
  }
  let labResults = [];
  let labSkeleton = null;
  function wirePromptLab() {
    const modeSel = $('#lab-mode');
    modeSel.innerHTML = Object.entries(PromptLab.MODES).map(([k, m]) => `<option value="${k}">${esc(m.label)}</option>`).join('');
    modeSel.value = State.settings.promptLab?.defaultMode || 'similar';
    $('#lab-count').value = State.settings.promptLab?.defaultCount ?? 6;
    const showModeHint = () => {
      $('#lab-mode-hint').textContent = PromptLab.MODES[modeSel.value]?.hint || '';
    };
    showModeHint();
    modeSel.addEventListener('change', () => {
      showModeHint();
      window.ala.settings.patch({
        promptLab: {
          defaultMode: modeSel.value
        }
      }).then(s => {
        State.settings = s;
      });
    });
    $('#lab-count').addEventListener('change', e => window.ala.settings.patch({
      promptLab: {
        defaultCount: Number(e.target.value) || 6
      }
    }).then(s => {
      State.settings = s;
    }));
    $('#lab-guidance').addEventListener('change', e => PromptLab.patchProfile({
      useGuidance: e.target.checked
    }).then(renderGuidanceState));
    $('#lab-example').addEventListener('change', e => PromptLab.patchProfile({
      example: e.target.value
    }));
    $('#lab-theme').addEventListener('change', e => PromptLab.patchProfile({
      theme: e.target.value.trim()
    }));
    $('#btn-lab-run').addEventListener('click', runLab);
    $('#btn-lab-pick').addEventListener('click', openPromptPicker);
    $('#btn-lab-best').addEventListener('click', () => {
      const recipes = Insights.playbook && Insights.playbook.recipes || [];
      const best = recipes.find(r => r.prompt);
      if (!best) {
        return toast('No measured winner yet — sync DeviantArt stats on the Statistics tab first.', 'err');
      }
      $('#lab-example').value = best.prompt;
      $('#lab-theme').value = best.theme || '';
      $('#lab-mode').value = 'evolve';
      showModeHint();
      toast(`Loaded "${best.title}" — ${best.perDay} engagement/day.`, 'ok');
    });
    $('#btn-lab-queue').addEventListener('click', () => {
      const prompts = $$('#lab-results textarea').map(t => t.value.trim()).filter(Boolean);
      if (!prompts.length) return toast('Nothing to queue.', 'err');
      const theme = $('#lab-theme').value.trim();
      const mode = $('#lab-mode').value;
      const {queued: queued, skipped: skipped} = queuePrompts(prompts, theme, mode === 'evolve' ? 'evolved' : 'lab');
      labResults = [];
      renderLabResults();
      toast(`Queued ${queued} prompt(s).${skipped ? ` ${skipped} already in the queue — skipped.` : ''} Start the worker on the Dashboard.`, 'ok');
      State.addLog(`Prompt Lab queued ${queued} prompt(s).${skipped ? ` ${skipped} duplicate(s) skipped.` : ''}`);
    });
    $('#btn-lab-save-all').addEventListener('click', async () => {
      const prompts = $$('#lab-results textarea').map(t => t.value.trim()).filter(Boolean);
      if (!prompts.length) return toast('Nothing to save.', 'err');
      for (const p of prompts) await PromptLab.save(p, $('#lab-theme').value.trim());
      renderBank();
      toast(`Saved ${prompts.length} prompt(s) to the bank.`, 'ok');
    });
    $('#btn-bank-add').addEventListener('click', async () => {
      const prof = PromptLab.profile();
      const raw = await askText(`Add to the ${prof.label} bank`, '', {
        multiline: true,
        label: 'Your prompt — save several at once by separating them with a line containing only ---',
        placeholder: 'paste or write the prompt here…'
      });
      if (raw == null) return;
      const prompts = raw.split(/^\s*---\s*$/m).map(s => s.trim()).filter(s => s.length >= 10);
      if (!prompts.length) return toast('Nothing to save — write the prompt first.', 'err');
      for (const p of prompts) await PromptLab.save(p, 'handwritten');
      renderBank();
      toast(`Saved ${prompts.length} prompt(s) to the ${prof.label} bank.`, 'ok');
    });
    wireLabProfiles();
    applyLabProfile();
    renderLabResults();
    renderGuidanceState();
    wireLabRefs();
    wireLabStory();
  }
  function wireLabProfiles() {
    $$('#lab-profile-switch [data-profile]').forEach(chip => chip.addEventListener('click', async () => {
      const to = chip.dataset.profile;
      const from = PromptLab.activeProfileId();
      if (to === from) return;
      State.settings = await window.ala.settings.patch({
        promptLab: {
          activeProfile: to,
          profiles: {
            [from]: {
              example: $('#lab-example').value,
              theme: $('#lab-theme').value.trim(),
              useGuidance: $('#lab-guidance').checked,
              instructions: $('#lab-profile-instructions').value.trim()
            }
          }
        }
      });
      applyLabProfile();
      toast(`Switched to the ${PromptLab.profile().label} job — its example, theme and bank are restored.`, 'ok');
    }));
    $('#lab-profile-instructions').addEventListener('change', e => PromptLab.patchProfile({
      instructions: e.target.value.trim()
    }));
  }
  function applyLabProfile() {
    const id = PromptLab.activeProfileId();
    const p = PromptLab.profile();
    $$('#lab-profile-switch [data-profile]').forEach(c => c.classList.toggle('active', c.dataset.profile === id));
    $('#lab-profile-instructions').value = p.instructions || '';
    $('#lab-example').value = p.example || '';
    $('#lab-theme').value = p.theme || '';
    $('#lab-guidance').checked = p.useGuidance !== false;
    renderBank();
    renderGuidanceState();
  }
  let labStory = {
    text: '',
    breakdown: null
  };
  function wireLabStory() {
    const modeSel = $('#story-mode');
    modeSel.innerHTML = Object.entries(PromptLab.STORY_MODES).map(([k, m]) => `<option value="${k}">${esc(m.label)}</option>`).join('');
    const savedMode = State.settings.promptLab?.storyMode;
    modeSel.value = PromptLab.STORY_MODES[savedMode] ? savedMode : 'beats';
    $('#story-count').value = State.settings.promptLab?.storyCount ?? 6;
    const showHint = () => {
      $('#story-mode-hint').textContent = PromptLab.STORY_MODES[modeSel.value]?.hint || '';
    };
    showHint();
    modeSel.addEventListener('change', () => {
      showHint();
      window.ala.settings.patch({
        promptLab: {
          storyMode: modeSel.value
        }
      }).then(s => {
        State.settings = s;
      });
    });
    $('#story-count').addEventListener('change', e => window.ala.settings.patch({
      promptLab: {
        storyCount: Number(e.target.value) || 6
      }
    }).then(s => {
      State.settings = s;
    }));
    $('#btn-story-read').addEventListener('click', () => readStoryUi().catch(() => {}));
    $('#btn-story-run').addEventListener('click', runFromStory);
  }
  async function readStoryUi() {
    const text = $('#story-text').value.trim();
    const status = $('#story-status');
    if (!text) {
      toast('Write the story first.', 'err');
      const e = new Error('no story');
      e.reported = true;
      throw e;
    }
    if (labStory.breakdown && labStory.text === text) return labStory.breakdown;
    status.className = 'hint';
    status.textContent = 'Reading the story…';
    const btn = $('#btn-story-read');
    btn.disabled = true;
    try {
      const b = await PromptLab.readStory(text);
      labStory = {
        text: text,
        breakdown: b
      };
      renderStoryBreakdown();
      status.className = 'hint ok';
      status.textContent = `${(b.moments || []).length} key moment(s) found — the breakdown is below. ` + `If it missed the point, edit the story and read it again.`;
      return b;
    } catch (e) {
      status.className = 'hint err';
      status.textContent = 'Could not read the story: ' + e.message;
      e.reported = true;
      throw e;
    } finally {
      btn.disabled = false;
    }
  }
  async function runFromStory() {
    const btn = $('#btn-story-run');
    const status = $('#story-status');
    btn.disabled = true;
    try {
      const b = await readStoryUi();
      const mode = $('#story-mode').value;
      const count = Math.max(1, Math.min(16, Number($('#story-count').value) || 6));
      status.className = 'hint';
      status.textContent = `Writing ${count} prompt(s) from ${(b.moments || []).length} moment(s)…`;
      const res = await PromptLab.fromStory({
        story: labStory.text,
        breakdown: b,
        count: count,
        mode: mode,
        extra: $('#story-extra').value.trim(),
        avoid: recentPromptTexts(20),
        guidance: PromptLab.labGuidance({
          on: $('#lab-guidance').checked
        }),
        audience: PromptLab.audienceBlock()
      });
      labResults = res.prompts;
      renderLabResults();
      status.className = res.short ? 'hint warn' : 'hint ok';
      status.textContent = `${res.prompts.length} prompt(s) written by ${res.provider || 'the model'}` + `${res.dropped ? ` — ${res.dropped} near-duplicate(s) dropped` : ''}. They are in “Generated prompts” below.` + shortfallNote(res);
      $('#lab-results').scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      });
    } catch (e) {
      if (!e.reported) {
        status.className = 'hint err';
        status.textContent = 'Could not write prompts: ' + e.message;
      }
    } finally {
      btn.disabled = false;
    }
  }
  function renderStoryBreakdown() {
    const root = $('#story-breakdown');
    const b = labStory.breakdown;
    if (!b) {
      root.innerHTML = '';
      return;
    }
    const chars = (b.characters || []).filter(c => c && (c.name || c.look)).map(c => `<div class="skel-row"><span class="k">${esc(c.name || 'unnamed')}</span><span class="v">${esc(c.look || '—')}</span></div>`).join('');
    const moments = (b.moments || []).map((m, i) => `<div class="skel-row"><span class="k">${i + 1}</span><span class="v"><b>${esc(m.beat || '')}</b>${m.shows ? `<br />${esc(m.shows)}` : ''}</span></div>`).join('');
    root.innerHTML = `\n      <div class="hint" style="margin-top:10px"><b>Premise:</b> ${esc(b.premise || '—')}\n        ${b.arc ? `<br /><b>What changes:</b> ${esc(b.arc)}` : ''}\n        <br /><b>Setting:</b> ${esc(b.setting || '—')}${b.mood ? ` · <b>Mood:</b> ${esc(b.mood)}` : ''}</div>\n      ${chars ? `<div class="skel-list" style="margin-top:8px">${chars}</div>` : ''}\n      <div class="skel-list" style="margin-top:8px">${moments}</div>`;
  }
  function renderGuidanceState() {
    const p = Insights.playbook;
    const text = !p || p.source === 'none' ? '— nothing measured yet, so this currently adds nothing' : `— ${p.source === 'deviantart' ? `${p.daCount} published deviation(s)` : `${p.sampleSize} approve/reject decision(s)`}` + `${(p.lessons || []).length ? `, ${p.lessons.length} lesson(s)` : ''}`;
    const labState = $('#lab-guidance-state');
    if (labState) labState.textContent = text;
    const labEl = $('#lab-guidance-state');
    const prof = window.PromptLab ? PromptLab.profile() : null;
    if (labEl && prof && (prof.playbook || 'full') !== 'full') {
      labEl.textContent += ' · demoted to craft notes on this profile';
    }
  }
  function shortfallNote(res) {
    if (!res || !res.short) return '';
    return ` Asked for ${res.asked}, got ${res.prompts.length}: ` + (res.truncated ? 'the writer ran out of output budget — raise Max output tokens for the ideation' + ' engine in Settings → Engines, or ask for fewer at a time.' : 'the writer would not produce any more that were different enough from these.');
  }
  async function runLab() {
    const raw = $('#lab-example').value.trim();
    if (!raw) return toast('Paste an example prompt first.', 'err');
    const mode = $('#lab-mode').value;
    const examples = raw.split(/^\s*---\s*$/m).map(s => s.trim()).filter(Boolean);
    if (mode === 'remix' && examples.length < 2) {
      return toast('Remix needs at least two examples — separate them with a line containing only ---', 'err');
    }
    const count = Math.max(1, Math.min(16, Number($('#lab-count').value) || 6));
    const btn = $('#btn-lab-run'), status = $('#lab-status');
    btn.disabled = true;
    status.className = 'hint';
    const log = (msg, kind) => {
      status.textContent = msg;
      status.className = 'hint ' + (kind || '');
    };
    log('Working…');
    try {
      const res = await PromptLab.run({
        examples: mode === 'remix' ? examples : [ examples[0] ],
        count: count,
        mode: mode,
        theme: $('#lab-theme').value.trim(),
        avoid: recentPromptTexts(25),
        useGuidance: $('#lab-guidance').checked,
        useSkeleton: $('#lab-skeleton').checked,
        log: log
      });
      labResults = res.prompts;
      labSkeleton = res.skeleton;
      renderLabResults();
      renderSkeleton();
      log(`${res.prompts.length} prompt(s) below` + (res.dropped ? ` — ${res.dropped} near-duplicate(s) dropped` : '') + (res.usedGuidance ? ' · steered by what has performed best' : '') + '. Edit freely, then queue.' + shortfallNote(res), res.short ? 'warn' : 'ok');
    } catch (e) {
      log('Generation failed: ' + e.message, 'err');
    } finally {
      btn.disabled = false;
    }
  }
  function recentPromptTexts(n) {
    const seen = new Set;
    const out = [];
    for (const src of [ State.queue, State.library ]) {
      for (const item of src) {
        if (!item.prompt || seen.has(item.prompt)) continue;
        seen.add(item.prompt);
        out.push(item.prompt);
        if (out.length >= n) return out;
      }
    }
    return out;
  }
  function renderLabResults() {
    const root = $('#lab-results');
    $('#lab-count-out').textContent = labResults.length ? `· ${labResults.length}` : '';
    if (!labResults.length) {
      root.innerHTML = `<div class="hint">Nothing generated yet.</div>`;
      return;
    }
    root.innerHTML = labResults.map((p, i) => `\n      <div class="lab-result">\n        <textarea rows="4" data-idx="${i}">${esc(p)}</textarea>\n        <div class="lab-btns">\n          <button class="btn small" data-lab-queue="${i}" title="Queue just this one">→ Queue</button>\n          <button class="btn small" data-lab-save="${i}" title="Save to the bank">★ Save</button>\n          <button class="btn ghost small" data-lab-del="${i}" title="Remove">✕</button>\n        </div>\n      </div>`).join('');
    root.querySelectorAll('textarea').forEach(t => t.addEventListener('input', () => {
      labResults[Number(t.dataset.idx)] = t.value;
    }));
    root.querySelectorAll('[data-lab-queue]').forEach(b => b.addEventListener('click', () => {
      const p = labResults[Number(b.dataset.labQueue)];
      if (!p) return;
      const mode = $('#lab-mode').value;
      State.queue.push(Pipeline.makeJob(p, $('#lab-theme').value.trim(), mode === 'evolve' ? 'evolved' : 'lab'));
      State.persistQueue();
      toast('Queued.', 'ok');
    }));
    root.querySelectorAll('[data-lab-save]').forEach(b => b.addEventListener('click', async () => {
      await PromptLab.save(labResults[Number(b.dataset.labSave)], $('#lab-theme').value.trim());
      renderBank();
      toast('Saved to the bank.', 'ok');
    }));
    root.querySelectorAll('[data-lab-del]').forEach(b => b.addEventListener('click', () => {
      labResults.splice(Number(b.dataset.labDel), 1);
      renderLabResults();
    }));
  }
  function renderSkeleton() {
    const root = $('#lab-skeleton-out');
    if (!labSkeleton) {
      root.innerHTML = `<div class="hint">No breakdown for this run.</div>`;
      return;
    }
    const s = labSkeleton;
    const slots = [ 'subject', 'bodyDetail', 'wardrobe', 'pose', 'expression', 'setting', 'lighting', 'camera', 'mood', 'qualityTags' ];
    const rows = slots.map(k => {
      const v = s[k];
      const empty = v == null || v === '' || /^(null|none|n\/a|not specified)$/i.test(String(v));
      return `<div class="skel-row ${empty ? 'empty' : ''}">\n        <span class="k">${esc(k.replace(/([A-Z])/g, ' $1'))}</span>\n        <span class="v">${empty ? 'not specified in your prompt' : esc(String(v))}</span></div>`;
    }).join('');
    root.innerHTML = `<div class="skel-list">${rows}</div>\n      <div class="hint" style="margin-top:12px">\n        <b>Structure:</b> ${esc(s.structure || '—')}<br />\n        <b>Voice:</b> ${esc(s.voice || '—')}<br />\n        <b>Signature:</b> ${esc(s.signature || '—')} · <b>${esc(String(s.wordCount || '?'))}</b> words\n      </div>\n      ${(s.missingSlots || []).length ? `<div class="hint err" style="margin-top:8px">Slots your prompt leaves empty: ${esc((s.missingSlots || []).join(', '))}.\n           Filling these is usually the cheapest quality win available.</div>` : ''}`;
  }
  function renderBank() {
    const bank = PromptLab.bank();
    const prof = PromptLab.profile();
    const root = $('#lab-bank');
    $('#lab-bank-profile').textContent = prof.label;
    $('#lab-bank-count').textContent = bank.length ? `· ${bank.length}` : '';
    if (!bank.length) {
      root.innerHTML = `<div class="hint">Empty. Save prompts that work — they stay with the ${esc(prof.label)} job and become its source material.</div>`;
      return;
    }
    root.innerHTML = [ ...bank ].reverse().map(b => `\n      <div class="bank-row">\n        <div class="b-text">\n          <div class="b-meta">${fmtTime(b.savedAt)}${b.note ? ' · ' + esc(b.note) : ''}</div>\n          ${esc(b.text)}\n        </div>\n        <div class="d-actions">\n          <button class="btn small" data-bank-use="${b.id}">Use as source</button>\n          <button class="btn small" data-bank-queue="${b.id}">Queue</button>\n          <button class="btn ghost small" data-bank-del="${b.id}">✕</button>\n        </div>\n      </div>`).join('');
    root.querySelectorAll('[data-bank-use]').forEach(btn => btn.addEventListener('click', () => {
      const b = bank.find(x => x.id === btn.dataset.bankUse);
      if (b) {
        $('#lab-example').value = b.text;
        toast('Loaded as the source prompt.', 'ok');
      }
    }));
    root.querySelectorAll('[data-bank-queue]').forEach(btn => btn.addEventListener('click', () => {
      const b = bank.find(x => x.id === btn.dataset.bankQueue);
      if (!b) return;
      State.queue.push(Pipeline.makeJob(b.text, b.note || '', 'lab'));
      State.persistQueue();
      toast('Queued.', 'ok');
    }));
    root.querySelectorAll('[data-bank-del]').forEach(btn => btn.addEventListener('click', async () => {
      await PromptLab.remove(btn.dataset.bankDel);
      renderBank();
    }));
  }
  function openPromptPicker() {
    const seen = new Set;
    const rows = State.library.filter(c => c.prompt && !seen.has(c.prompt) && seen.add(c.prompt)).sort((a, b) => (b.qc && b.qc.score || 0) - (a.qc && a.qc.score || 0)).slice(0, 60);
    if (!rows.length) return toast('The library is empty — nothing to pick from yet.', 'err');
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-backdrop"><div class="panel" style="max-width:760px;max-height:80vh;overflow:auto;margin:0">\n      <div class="panel-head"><h2>Pick a source prompt</h2><button class="btn ghost small" data-close>✕</button></div>\n      <div class="drafts-list">\n        ${rows.map(c => `\n          <div class="draft-row" data-pick="${c.id}" style="cursor:pointer">\n            <img src="${c.url}" alt="" />\n            <div class="d-info">\n              <div class="d-title">${esc(c.metadata?.title || c.fname)}</div>\n              <div class="hint">${c.qc ? `QC ${c.qc.score}/10` : 'not inspected'}${c.theme ? ' · ' + esc(c.theme) : ''}${c.promptSource ? ' · ' + esc(c.promptSource) : ''}</div>\n              <div class="hint" style="margin-top:4px">${esc(String(c.prompt).slice(0, 200))}…</div>\n            </div>\n          </div>`).join('')}\n      </div></div></div>`;
    const close = () => {
      root.innerHTML = '';
    };
    root.querySelector('[data-close]').addEventListener('click', close);
    root.querySelector('.modal-backdrop').addEventListener('click', e => {
      if (e.target.classList.contains('modal-backdrop')) close();
    });
    root.querySelectorAll('[data-pick]').forEach(el => el.addEventListener('click', () => {
      const c = State.library.find(x => x.id === el.dataset.pick);
      if (c) {
        $('#lab-example').value = c.prompt;
        $('#lab-theme').value = c.theme || '';
      }
      close();
    }));
  }
  let labRefs = [];
  function refBadge(r) {
    if (r.state === 'reading') return 'reading…';
    if (r.state === 'error') return '✕ failed';
    const src = r.origin === 'deviantart' ? '◆' : r.origin === 'library' ? '▣' : '';
    if (r.state === 'read') return `${src} ✓ read`;
    return `${src} ${r.knownPrompt ? 'prompt on file' : 'not read'}`;
  }
  function wireLabRefs() {
    const modeSel = $('#ref-mode');
    modeSel.innerHTML = Object.entries(PromptLab.REF_MODES).map(([k, m]) => `<option value="${k}">${esc(m.label)}</option>`).join('');
    modeSel.value = State.settings.promptLab?.refMode || 'style';
    $('#ref-count').value = State.settings.promptLab?.refCount ?? 4;
    const showHint = () => {
      $('#ref-mode-hint').textContent = PromptLab.REF_MODES[modeSel.value]?.hint || '';
    };
    showHint();
    modeSel.addEventListener('change', () => {
      showHint();
      window.ala.settings.patch({
        promptLab: {
          refMode: modeSel.value
        }
      }).then(s => {
        State.settings = s;
      });
    });
    $('#ref-count').addEventListener('change', e => window.ala.settings.patch({
      promptLab: {
        refCount: Number(e.target.value) || 4
      }
    }).then(s => {
      State.settings = s;
    }));
    $('#btn-ref-library').addEventListener('click', openRefPicker);
    $('#btn-ref-da').addEventListener('click', openDaRefPicker);
    $('#btn-ref-file').addEventListener('click', () => $('#ref-file-input').click());
    $('#ref-file-input').addEventListener('change', async e => {
      const files = [ ...e.target.files || [] ];
      e.target.value = '';
      for (const f of files) {
        try {
          const dataUrl = await new Promise((resolve, reject) => {
            const r = new FileReader;
            r.onload = () => resolve(r.result);
            r.onerror = () => reject(new Error('could not read the file'));
            r.readAsDataURL(f);
          });
          const [head, b64] = String(dataUrl).split(',');
          addRef({
            base64: b64,
            mime: (head.match(/data:([^;]+)/) || [])[1] || f.type || 'image/jpeg',
            label: f.name,
            thumb: dataUrl,
            origin: 'file'
          });
        } catch (err) {
          toast(`Could not add ${f.name}: ${err.message}`, 'err');
        }
      }
      renderRefStrip();
    });
    $('#btn-ref-clear').addEventListener('click', () => {
      labRefs = [];
      renderRefStrip();
      renderRefBriefs();
    });
    $('#btn-ref-read').addEventListener('click', () => readRefs(true));
    $('#btn-ref-run').addEventListener('click', runFromRefs);
    renderRefStrip();
    renderRefBriefs();
  }
  function addRef(ref) {
    if (labRefs.length >= 8) return toast('Eight references is plenty — remove one first.', 'err');
    const key = ref.devId ? `d:${ref.devId}` : ref.cardId ? `c:${ref.cardId}` : null;
    if (key && labRefs.some(r => (r.devId ? `d:${r.devId}` : r.cardId ? `c:${r.cardId}` : null) === key)) {
      return toast('That one is already in the strip.', 'err');
    }
    labRefs.push({
      id: U.uid(),
      state: 'new',
      brief: null,
      error: null,
      origin: 'file',
      knownPrompt: null,
      promptLink: null,
      ...ref
    });
  }
  function renderRefStrip() {
    const strip = $('#ref-strip');
    if (!strip) return;
    const known = labRefs.filter(r => r.knownPrompt).length;
    $('#lab-ref-count').textContent = labRefs.length ? `· ${labRefs.length}${known ? `, ${known} with the original prompt` : ''}` : '';
    if (!labRefs.length) {
      strip.innerHTML = `<div class="hint">No references yet. Pull one off <b>DeviantArt</b> when a post does\n        well, pick a card from the <b>library</b>, or drop in an <b>image file</b> — a screenshot, someone\n        else's post, anything the vision model can see.</div>`;
      return;
    }
    strip.innerHTML = labRefs.map(r => `\n      <div class="ref-thumb ${r.state}${r.knownPrompt ? ' has-prompt' : ''}" data-ref="${r.id}"\n           title="${esc(r.label || '')}${r.knownPrompt ? '\n\nPrompt on file:\n' + esc(String(r.knownPrompt).slice(0, 300)) : ''}${r.error ? '\n\n' + esc(r.error) : ''}">\n        <img src="${esc(r.thumb)}" alt="" />\n        <div class="ref-badge">${esc(refBadge(r))}</div>\n        ${r.perDay ? `<div class="ref-perf" title="engagement per day since it was published">${r.perDay}</div>` : ''}\n        <button class="btn ghost small" data-refdel="${r.id}" title="Remove">✕</button>\n      </div>`).join('');
    strip.querySelectorAll('[data-refdel]').forEach(b => b.addEventListener('click', () => {
      labRefs = labRefs.filter(r => r.id !== b.dataset.refdel);
      renderRefStrip();
      renderRefBriefs();
    }));
    strip.querySelectorAll('.ref-thumb img').forEach(img => img.addEventListener('click', () => openImageModal(img.src)));
  }
  function renderRefBriefs() {
    const root = $('#ref-briefs');
    if (!root) return;
    const read = labRefs.filter(r => r.brief);
    if (!read.length) {
      root.innerHTML = '';
      return;
    }
    root.innerHTML = `<div class="hint" style="margin:12px 0 6px">What the reference amounts to in words\n      — this, not the picture, is what the writer works from:</div>` + read.map(r => {
      const b = r.brief;
      const rows = [ [ 'subject', b.subject ], [ 'wardrobe', b.wardrobe ], [ 'pose', b.pose ], [ 'setting', b.setting ], [ 'lighting', b.lighting ], [ 'camera', b.camera ], [ 'palette', b.palette ], [ 'style', Array.isArray(b.styleTags) ? b.styleTags.join(', ') : b.styleTags ] ];
      const how = b.source === 'prompt' ? '<span class="src-badge none">from its prompt only — the picture could not be loaded</span>' : b.source === 'prompt+vision' ? '<span class="src-badge deviantart">the real prompt, checked against the picture</span>' : '<span class="src-badge">read from the picture</span>';
      return `<div class="ref-brief">\n          <div class="rb-head">${esc(r.label || 'reference')} ${how}\n            <span class="hint"> · ${esc(b.engine || 'no vision call needed')}</span></div>\n          <div class="skel-list">${rows.map(([k, v]) => {
        const empty = v == null || String(v).trim() === '' || /^(null|none|n\/a|not (visible|specified))$/i.test(String(v));
        return `<div class="skel-row ${empty ? 'empty' : ''}"><span class="k">${esc(k)}</span><span class="v">${empty ? 'not visible' : esc(String(v))}</span></div>`;
      }).join('')}</div>\n          ${b.knownPrompt ? `<div class="hint" style="margin-top:6px"><b>The prompt that made it:</b> ${esc(b.knownPrompt)}</div>` : b.promptDraft ? `<div class="hint" style="margin-top:6px"><b>Reconstructed prompt:</b> ${esc(b.promptDraft)}</div>` : ''}\n        </div>`;
    }).join('');
  }
  async function readRefs(announce = false) {
    const todo = labRefs.filter(r => !r.brief && r.state !== 'reading');
    const status = $('#ref-status');
    if (!todo.length) {
      if (announce) toast(labRefs.length ? 'Every reference has already been read.' : 'Add a reference first.', labRefs.length ? 'ok' : 'err');
      return labRefs.filter(r => r.brief).length;
    }
    const route = await window.ala.llm.route('vision').catch(() => null);
    const limit = Math.max(1, route && route.maxConcurrency || 1);
    const lead = route && route.chain && route.chain[0];
    const blind = todo.filter(r => !r.base64).length;
    let done = 0;
    const paint = () => {
      status.className = 'hint';
      status.textContent = `Reading ${todo.length} reference(s)${lead ? ` with ${lead.name}` : ''}… ${done}/${todo.length}` + (blind ? ` (${blind} from the prompt alone — no picture)` : '');
    };
    paint();
    todo.forEach(r => {
      r.state = 'reading';
    });
    renderRefStrip();
    await U.mapLimit(todo, limit, async r => {
      try {
        if (r.base64) {
          const small = await Pipeline.downscaleForQc(r.base64, r.mime);
          r.brief = await PromptLab.readReference({
            base64: small.base64,
            mime: small.mime,
            label: r.label,
            knownPrompt: r.knownPrompt || ''
          });
        } else if (r.knownPrompt) {
          r.brief = await PromptLab.briefFromPrompt({
            prompt: r.knownPrompt,
            label: r.label
          });
        } else {
          throw new Error('no image and no prompt — nothing to read');
        }
        r.state = 'read';
        r.error = null;
      } catch (e) {
        r.state = 'error';
        r.error = e.message;
        State.addLog(`Could not read reference "${r.label}": ${e.message}`, 'err');
      } finally {
        done++;
        paint();
        renderRefStrip();
      }
    });
    const ok = labRefs.filter(r => r.brief).length;
    const failed = labRefs.filter(r => r.state === 'error').length;
    status.className = 'hint ' + (ok ? 'ok' : 'err');
    status.textContent = ok ? `${ok} reference(s) read${failed ? `, ${failed} failed (they are skipped)` : ''}. Breakdown below.` : `None of the references could be read${failed ? ' — the vision model refused or was unreachable.' : '.'}`;
    renderRefBriefs();
    return ok;
  }
  async function runFromRefs() {
    if (!labRefs.length) return toast('Add at least one reference image first.', 'err');
    const btn = $('#btn-ref-run');
    const status = $('#ref-status');
    btn.disabled = true;
    try {
      const ok = await readRefs();
      if (!ok) return;
      const mode = $('#ref-mode').value;
      const count = Math.max(1, Math.min(16, Number($('#ref-count').value) || 4));
      status.className = 'hint';
      status.textContent = `Writing ${count} prompt(s) from ${ok} reference(s)…`;
      const briefs = labRefs.filter(r => r.brief).map(r => r.brief);
      const res = await PromptLab.fromImages({
        briefs: briefs,
        count: count,
        mode: mode,
        theme: $('#ref-theme').value.trim(),
        extra: $('#ref-extra').value.trim(),
        avoid: recentPromptTexts(20),
        guidance: PromptLab.labGuidance({
          theme: $('#ref-theme').value.trim(),
          on: $('#lab-guidance').checked
        }),
        audience: PromptLab.audienceBlock()
      });
      labResults = res.prompts;
      renderLabResults();
      const known = briefs.filter(b => b.knownPrompt).length;
      status.className = res.short ? 'hint warn' : 'hint ok';
      status.textContent = `${res.prompts.length} prompt(s) written by ${res.provider || 'the model'}` + `${known ? `, ${known} reference(s) grounded in the prompt that actually made them` : ''}` + `${res.dropped ? ` — ${res.dropped} near-duplicate(s) dropped` : ''}. They are in “Generated prompts” below.` + shortfallNote(res);
      $('#lab-results').scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      });
    } catch (e) {
      status.className = 'hint err';
      status.textContent = 'Could not write prompts: ' + e.message;
    } finally {
      btn.disabled = false;
    }
  }
  function openRefPicker() {
    const all = State.library.filter(c => c.fname);
    if (!all.length) return toast('The library is empty — add an image file instead.', 'err');
    const root = $('#modal-root');
    const chosen = new Set;
    const PAGE = 120;
    let shown = PAGE;
    let query = '';
    let scope = 'live';
    const SCOPES = {
      live: c => [ 'review', 'approved', 'drafted' ].includes(c.status),
      review: c => c.status === 'review',
      approved: c => c.status === 'approved',
      drafted: c => c.status === 'drafted',
      discarded: c => [ 'discarded', 'rejected' ].includes(c.status),
      all: () => true
    };
    const rowsFor = () => {
      let rows = all.filter(SCOPES[scope] || SCOPES.all);
      if (query) {
        const q = query.toLowerCase();
        rows = rows.filter(c => [ c.metadata && c.metadata.title, c.prompt, c.theme, c.fname ].filter(Boolean).join(' ').toLowerCase().includes(q));
      }
      return [ ...rows ].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    };
    const paintAddBtn = () => {
      root.querySelector('[data-add]').textContent = chosen.size ? `Add ${chosen.size} selected` : 'Add selected';
    };
    const paint = () => {
      const rows = rowsFor();
      const page = rows.slice(0, shown);
      const withPrompt = page.filter(c => c.prompt).length;
      root.querySelector('#lib-ref-grid').innerHTML = page.length ? page.map(c => `\n        <div class="ref-pick ${chosen.has(c.id) ? 'on' : ''}" data-pick="${c.id}"\n             title="${esc(c.metadata && c.metadata.title || c.fname)}&#10;${esc(fmtTime(c.createdAt))}">\n          <img src="${c.url}" alt="" loading="lazy" />\n          <div class="rp-meta">${c.qc ? `${c.qc.score}/10` : esc(c.status)}${c.prompt ? ' · <b class="rp-known">✎</b>' : ''}</div>\n        </div>`).join('') : `<div class="hint">Nothing matches${query ? ` “${esc(query)}”` : ''} in this filter.</div>`;
      root.querySelector('#lib-ref-count').textContent = rows.length ? `${page.length} of ${rows.length} shown · ${withPrompt} carry the prompt that made them` : 'nothing here';
      const more = root.querySelector('[data-more]');
      more.hidden = page.length >= rows.length;
      more.textContent = `Show ${Math.min(PAGE, rows.length - page.length)} more`;
      paintAddBtn();
      root.querySelectorAll('[data-pick]').forEach(el => el.addEventListener('click', () => {
        const id = el.dataset.pick;
        if (chosen.has(id)) chosen.delete(id); else chosen.add(id);
        el.classList.toggle('on', chosen.has(id));
        paintAddBtn();
      }));
    };
    root.innerHTML = `<div class="modal-backdrop"><div class="panel" style="max-width:920px;max-height:84vh;overflow:auto;margin:0">\n      <div class="panel-head"><h2>Pick reference images</h2>\n        <div class="btn-row"><button class="btn primary small" data-add>Add selected</button>\n          <button class="btn ghost small" data-close>✕</button></div></div>\n      <div class="hint">Click to select. QC score is shown where the card was inspected, and a card that\n        still carries its generation prompt is marked ✎ — those give the writer the real words instead of a\n        guess made from the picture.</div>\n      <div class="filter-row" style="margin:10px 0">\n        <input id="lib-ref-search" type="search" placeholder="Search title, prompt, theme…" spellcheck="false" style="flex:1" />\n        <span class="sort-group"><label for="lib-ref-scope">Show</label>\n          <select id="lib-ref-scope">\n            <option value="live">In review, approved or drafted</option>\n            <option value="review">Awaiting review</option>\n            <option value="approved">Approved</option>\n            <option value="drafted">Published / drafted</option>\n            <option value="discarded">Discarded and rejected</option>\n            <option value="all">Everything</option>\n          </select></span>\n      </div>\n      <div class="hint" id="lib-ref-count"></div>\n      <div class="ref-picker" id="lib-ref-grid"></div>\n      <div style="text-align:center;padding:14px 0 4px"><button class="btn ghost" data-more hidden></button></div>\n    </div></div>`;
    const close = () => {
      root.innerHTML = '';
    };
    root.querySelector('[data-close]').addEventListener('click', close);
    root.querySelector('.modal-backdrop').addEventListener('click', e => {
      if (e.target.classList.contains('modal-backdrop')) close();
    });
    root.querySelector('#lib-ref-scope').addEventListener('change', e => {
      scope = e.target.value;
      shown = PAGE;
      paint();
    });
    root.querySelector('#lib-ref-search').addEventListener('input', e => {
      query = e.target.value.trim();
      shown = PAGE;
      paint();
    });
    root.querySelector('[data-more]').addEventListener('click', () => {
      shown += PAGE;
      paint();
    });
    paint();
    root.querySelector('[data-add]').addEventListener('click', async () => {
      const btn = root.querySelector('[data-add]');
      if (!chosen.size) return toast('Nothing selected.', 'err');
      btn.disabled = true;
      btn.textContent = 'Loading…';
      for (const id of chosen) {
        const card = State.library.find(c => c.id === id);
        if (!card) continue;
        try {
          const base64 = await window.ala.files.readImageBase64(card.fname);
          addRef({
            base64: base64,
            mime: card.mime || 'image/jpeg',
            label: card.metadata?.title || card.fname,
            thumb: card.url,
            cardId: card.id,
            origin: 'library',
            knownPrompt: card.prompt || null,
            promptLink: card.prompt ? 'card' : null
          });
        } catch (e) {
          toast(`Could not load ${card.fname}: ${e.message}`, 'err');
        }
      }
      close();
      renderRefStrip();
    });
  }
  function openDaRefPicker() {
    const I = window.Insights;
    if (!I || !I.perf || !I.perf.deviations.length) {
      return toast('No DeviantArt gallery synced yet — run Sync on the Statistics tab first.', 'err');
    }
    const root = $('#modal-root');
    const chosen = new Map;
    let sort = 'perDay';
    let query = '';
    const rowsFor = () => {
      const scored = I.scored();
      let rows = scored.map(({d: d, m: m}) => ({
        d: d,
        m: m,
        res: window.Origins ? Origins.resolve(d, {
          guess: false
        }) : {
          link: 'none',
          prompt: ''
        }
      }));
      if (query) {
        const q = query.toLowerCase();
        rows = rows.filter(({d: d, res: res}) => `${d.title} ${(d.tags || []).join(' ')} ${res.prompt || ''}`.toLowerCase().includes(q));
      }
      if (sort === 'recent') rows.sort((a, b) => (b.d.publishedAt || 0) - (a.d.publishedAt || 0)); else if (sort === 'views') rows.sort((a, b) => (b.m.views || 0) - (a.m.views || 0)); else if (sort === 'climbing') {
        rows.sort((a, b) => (I.velocity(b.d) || -1) - (I.velocity(a.d) || -1));
      }
      return rows.slice(0, 160);
    };
    const paint = () => {
      const rows = rowsFor();
      const known = rows.filter(r => r.res.prompt).length;
      root.querySelector('#da-ref-grid').innerHTML = rows.length ? rows.map(({d: d, m: m, res: res}) => {
        const tier = res.link === 'none' ? '' : res.link;
        const src = I.thumb(d);
        return `<div class="ref-pick ${chosen.has(d.deviationId) ? 'on' : ''}" data-dev="${esc(d.deviationId)}"\n             title="${esc(d.title)}\n${Math.round(m.perDay)}/day · ${m.views || '?'} views · ${m.favs} favs${res.prompt ? '\n\nPrompt on file (' + esc(tier) + '):\n' + esc(String(res.prompt).slice(0, 300)) : '\n\nNo prompt on file — the picture will be read by the vision model.'}">\n          ${src ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : '<div class="rp-noimg">no preview</div>'}\n          <div class="rp-meta">${Math.round(m.perDay)}/day${res.prompt ? ` · <b class="rp-known">✎ ${esc(tier)}</b>` : ''}</div>\n          <div class="rp-title">${esc(d.title)}</div>\n        </div>`;
      }).join('') : `<div class="hint">Nothing matches “${esc(query)}”.</div>`;
      root.querySelector('#da-ref-count').textContent = `${rows.length} shown · ${known} carry the prompt that made them`;
      root.querySelector('[data-add]').textContent = chosen.size ? `Add ${chosen.size} selected` : 'Add selected';
      root.querySelectorAll('[data-dev]').forEach(el => el.addEventListener('click', () => {
        const id = el.dataset.dev;
        if (chosen.has(id)) chosen.delete(id); else chosen.set(id, true);
        el.classList.toggle('on', chosen.has(id));
        root.querySelector('[data-add]').textContent = chosen.size ? `Add ${chosen.size} selected` : 'Add selected';
      }));
    };
    root.innerHTML = `<div class="modal-backdrop"><div class="panel" style="max-width:980px;max-height:86vh;overflow:auto;margin:0">\n      <div class="panel-head"><h2>Pick from DeviantArt</h2>\n        <div class="btn-row"><button class="btn primary small" data-add>Add selected</button>\n          <button class="btn ghost small" data-close>✕</button></div></div>\n      <div class="hint">Your published gallery, strongest first. Pick the one that took off — where the app\n        still knows the prompt that made it, that prompt is used directly; where it does not, the picture is\n        read by the vision model instead. Either way you get prompts aimed at the thing that worked.</div>\n      <div class="filter-row" style="margin:10px 0">\n        <input id="da-ref-search" type="search" placeholder="Search title, tag, prompt…" spellcheck="false" style="flex:1" />\n        <span class="sort-group"><label for="da-ref-sort">Sort</label>\n          <select id="da-ref-sort">\n            <option value="perDay">Engagement per day</option>\n            <option value="climbing">Climbing fastest right now</option>\n            <option value="views">Total views</option>\n            <option value="recent">Most recent</option>\n          </select></span>\n      </div>\n      <div class="hint" id="da-ref-count"></div>\n      <div class="ref-picker da-picker" id="da-ref-grid"></div>\n    </div></div>`;
    const close = () => {
      root.innerHTML = '';
    };
    root.querySelector('[data-close]').addEventListener('click', close);
    root.querySelector('.modal-backdrop').addEventListener('click', e => {
      if (e.target.classList.contains('modal-backdrop')) close();
    });
    root.querySelector('#da-ref-sort').addEventListener('change', e => {
      sort = e.target.value;
      paint();
    });
    root.querySelector('#da-ref-search').addEventListener('input', e => {
      query = e.target.value.trim();
      paint();
    });
    root.querySelector('[data-add]').addEventListener('click', async () => {
      const btn = root.querySelector('[data-add]');
      if (!chosen.size) return toast('Nothing selected.', 'err');
      btn.disabled = true;
      const ids = [ ...chosen.keys() ];
      let added = 0, blind = 0;
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        btn.textContent = `Loading ${i + 1}/${ids.length}…`;
        const dev = I.perf.deviations.find(x => String(x.deviationId) === String(id));
        if (!dev) continue;
        const res = window.Origins ? Origins.resolve(dev) : {
          prompt: '',
          link: 'none',
          fname: ''
        };
        const {m: m} = I.scored().find(s => s.d.deviationId === dev.deviationId) || {
          m: {
            perDay: 0
          }
        };
        const ref = {
          label: dev.title || `deviation ${id}`,
          thumb: I.thumb(dev),
          devId: String(id),
          cardId: res.card ? res.card.id : null,
          origin: 'deviantart',
          knownPrompt: res.prompt || null,
          promptLink: res.prompt ? res.link : null,
          perDay: Math.round(m.perDay || 0)
        };
        try {
          if (res.fname) {
            ref.base64 = await window.ala.files.readImageBase64(res.fname);
            ref.mime = 'image/jpeg';
            ref.thumb = ref.thumb || `ala://img/${res.fname}`;
          }
        } catch {}
        if (!ref.base64) {
          const user = (String(dev.url || '').match(/deviantart\.com\/([^/?#]+)\//i) || [])[1] || '';
          const got = await window.ala.dastats.image(id, user).catch(e => ({
            ok: false,
            error: e.message
          }));
          if (got && got.ok) {
            ref.base64 = got.base64;
            ref.mime = got.mime;
            ref.thumb = ref.thumb || `data:${got.mime};base64,${got.base64.slice(0, 8e4)}`;
          } else if (ref.knownPrompt) {
            blind++;
            State.addLog(`Could not load the image for "${ref.label}" (${got && got.error || 'unknown'})` + ' — using the prompt on file instead.', 'err');
          } else {
            toast(`Could not load "${ref.label}": ${got && got.error || 'no image'}`, 'err');
            continue;
          }
        }
        addRef(ref);
        added++;
      }
      close();
      renderRefStrip();
      if (added) {
        toast(`${added} reference(s) added${blind ? `, ${blind} from the prompt alone (image unavailable)` : ''}.`, 'ok');
      }
    });
    paint();
  }
  let statsSort = 'vsPeers';
  const STATS_PAGE = 100;
  let statsShown = STATS_PAGE;
  function wireStatsTab() {
    const limitEl = $('#stats-limit');
    limitEl.value = State.settings.learn?.syncLimit ?? 50;
    limitEl.addEventListener('change', e => {
      const v = Math.max(1, Number(e.target.value) || 50);
      e.target.value = v;
      window.ala.settings.patch({
        learn: {
          syncLimit: v
        }
      }).then(s => {
        State.settings = s;
      });
    });
    $('#btn-stats-sync').addEventListener('click', () => runSync(true, Math.max(1, Number(limitEl.value) || 50)));
    $('#btn-stats-sync-full').addEventListener('click', () => runSync(true, 0));
    $('#btn-stats-sync-fast').addEventListener('click', () => runSync(false, 0));
    $('#btn-stats-learn').addEventListener('click', async () => {
      const btn = $('#btn-stats-learn');
      btn.disabled = true;
      btn.textContent = 'Thinking…';
      try {
        const p = await Insights.buildPlaybook({
          log: (m, k) => State.addLog(m, k)
        });
        toast(p.source === 'none' ? 'Nothing measured yet — sync DeviantArt stats, or approve/reject some cards first.' : `Playbook rebuilt from ${p.sampleSize} item(s).`, p.source === 'none' ? 'err' : 'ok');
      } catch (e) {
        toast('Could not rebuild the playbook: ' + e.message, 'err');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Rebuild playbook';
      }
    });
    $('#stats-sort').addEventListener('change', e => {
      statsSort = e.target.value;
      statsShown = STATS_PAGE;
      renderPerfTable();
    });
    window.ala.dastats.onProgress(p => {
      const el = $('#stats-sync-status');
      if (!el) return;
      el.textContent = p.phase === 'views' ? `Reading view counts… ${p.done}/${p.total}` : `Reading your gallery… ${p.done} deviation(s) so far`;
      el.className = 'hint';
    });
  }
  async function runSync(withViews, limit = 0) {
    const btns = [ $('#btn-stats-sync'), $('#btn-stats-sync-full'), $('#btn-stats-sync-fast') ];
    const el = $('#stats-sync-status');
    btns.forEach(b => {
      b.disabled = true;
    });
    el.textContent = limit ? `Contacting DeviantArt — reading your ${limit} newest deviation(s)…` : 'Contacting DeviantArt — reading the whole gallery…';
    el.className = 'hint';
    try {
      const res = await Insights.sync({
        withViews: withViews,
        limit: limit
      });
      if (!res.ok) {
        el.innerHTML = `<b>Sync failed:</b> ${esc(res.error || 'unknown')}.\n          This reads your gallery through the DeviantArt tab's session — open that tab and make sure you are signed in.`;
        el.className = 'hint err';
        return;
      }
      renderStatsTab();
      await Insights.buildPlaybook({
        log: (m, k) => State.addLog(m, k)
      }).catch(() => {});
      renderStatsTab();
      toast(`Synced ${res.items.length} deviation(s)${res.added ? `, ${res.added} new` : ''}` + `${res.partial ? ' — newest only; use Full recap for the rest' : ''}.`, 'ok');
    } catch (e) {
      el.textContent = 'Sync failed: ' + e.message;
      el.className = 'hint err';
    } finally {
      btns.forEach(b => {
        b.disabled = false;
      });
      renderSyncStatus();
    }
  }
  function renderSyncStatus() {
    const el = $('#stats-sync-status');
    if (!el) return;
    const o = Insights.overview();
    if (!o.lastSyncAt) {
      el.textContent = 'Never synced. This reads your published gallery through the DeviantArt tab\'s session — read-only, nothing is posted or changed.';
      el.className = 'hint';
      return;
    }
    const mins = Math.round((Date.now() - o.lastSyncAt) / 6e4);
    const age = mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
    el.innerHTML = `Last synced <b>${age}</b>${o.username ? ` as @${esc(o.username)}` : ''} · ${o.count} deviation(s), ` + `${o.withViews} with view counts, <b>${o.linked}</b> matched back to a local card` + `${o.linked < o.count ? ` <span class="hint">(unmatched ones still count toward totals, but their prompt is unknown so they can't teach prompt lessons)</span>` : ''}.`;
    el.className = 'hint';
  }
  function renderStatsTab() {
    if (!$('#stats-cards')) return;
    renderSyncStatus();
    renderStatCards();
    renderTopPerformers();
    renderPlaybook();
    renderTeach();
    renderBreakdowns();
    renderPerfTable();
    renderGuidanceState();
    if (window.OriginsUI) OriginsUI.render();
  }
  function renderStatCards() {
    const o = Insights.overview();
    const fav = o.medianFavRate == null ? '—' : (o.medianFavRate * 100).toFixed(1) + '%';
    $('#stats-cards').innerHTML = `\n      <div class="stat-card"><div class="stat-label">Published</div><div class="stat-value">${o.count}</div>\n        <div class="stat-hint">${o.linked} linked to a card</div></div>\n      <div class="stat-card"><div class="stat-label">Total views</div><div class="stat-value">${fmtNum(o.views)}</div>\n        <div class="stat-hint">${fmtNum(o.avgViews)} avg</div></div>\n      <div class="stat-card"><div class="stat-label">Favourites</div><div class="stat-value">${fmtNum(o.favs)}</div>\n        <div class="stat-hint">${o.avgFavs == null ? '—' : o.avgFavs} avg</div></div>\n      <div class="stat-card"><div class="stat-label">Comments</div><div class="stat-value">${fmtNum(o.comments)}</div>\n        <div class="stat-hint">lifetime</div></div>\n      <div class="stat-card"><div class="stat-label">Median fav rate</div><div class="stat-value">${fav}</div>\n        <div class="stat-hint">of viewers who favourited</div></div>`;
  }
  function renderTopPerformers() {
    const root = $('#stats-top');
    const top = Insights.topPerformers(8);
    if (!top.length) {
      root.innerHTML = `<div class="hint">Nothing synced yet. Hit <b>Sync from DeviantArt</b> above —\n        it pages your published gallery through the browser session you already use to upload.</div>`;
      return;
    }
    root.innerHTML = top.map(({d: d, m: m}) => {
      const v = Insights.velocity(d);
      return `\n      <div class="perf-row">\n        ${Insights.thumb(d) ? `<img src="${esc(Insights.thumb(d))}" alt="" referrerpolicy="no-referrer" loading="lazy" />` : ''}\n        <div class="p-info">\n          <div class="p-title">${esc(d.title || 'Untitled')}</div>\n          <div class="p-sub">${m.views ? fmtNum(m.views) + ' views · ' : ''}${fmtNum(m.favs)} favs · ${fmtNum(m.comments)} comments · ${Math.round(m.ageDays)}d old · ${Math.round(m.perDay)}/day${d.theme ? ' · ' + esc(d.theme) : ''}${d.promptSource === 'evolved' ? ' · <b>grown from a winner</b>' : ''}${v != null && v >= 1 ? ` · <span class="trend up" title="Engagement gained per day between the last two syncs — this one is still climbing">▲ ${Math.round(v)}/day now</span>` : ''}</div>\n          ${d.note ? `<div class="p-note">${esc(d.note)}</div>` : ''}\n        </div>\n        <div class="p-metric" title="Its engagement against the median of the posts published closest to it in age — 1× is a typical post of its age. Ranked this way because per-day engagement mostly measures how new a post is.">\n          <b>${m.vsPeers != null ? `${m.vsPeers.toFixed(1)}×` : Math.round(m.perDay)}</b><span>${m.vsPeers != null ? 'vs same-age posts' : 'per day'}</span>\n          ${d.note ? '' : `<button class="btn ghost small" data-explain="${esc(d.deviationId)}" title="Ask the model why this one worked">why?</button>`}\n        </div>\n      </div>`;
    }).join('');
    root.querySelectorAll('[data-explain]').forEach(b => b.addEventListener('click', async () => {
      const dev = Insights.perf.deviations.find(x => x.deviationId === b.dataset.explain);
      if (!dev) return;
      b.disabled = true;
      b.textContent = '…';
      try {
        await Insights.explain(dev);
        renderTopPerformers();
      } catch (e) {
        toast('Could not analyse it: ' + e.message, 'err');
        b.disabled = false;
        b.textContent = 'why?';
      }
    }));
  }
  function renderPlaybook() {
    const root = $('#stats-playbook');
    if (!root) return;
    const p = Insights.playbook;
    const age = $('#stats-playbook-age');
    if (!p || p.source === 'none') {
      if (age) age.textContent = '';
      root.innerHTML = `<div class="hint">Nothing learned yet. The playbook builds from published performance —\n        or, before anything is published, from which cards you approve and reject. Approve a few cards or sync,\n        then hit <b>Rebuild playbook</b>.</div>`;
      return;
    }
    if (age) {
      age.innerHTML = `<span class="src-badge ${esc(p.source)}">${p.source === 'deviantart' ? 'DeviantArt data' : 'local workflow outcomes'}</span>\n        ${p.updatedAt ? ' · ' + fmtTime(p.updatedAt) : ''}`;
    }
    const lessons = (p.lessons || []).map(l => {
      const pinned = window.Teach && Teach.isPinned(l.lesson);
      return `\n      <div class="lesson ${l.confidence === 'low' ? 'low' : ''}${pinned ? ' pinned' : ''}" data-lesson="${esc(l.lesson)}">\n        <span class="l-dot">${pinned ? '★' : '◆'}</span>\n        <div style="flex:1;min-width:0"><div class="l-text">${esc(l.lesson)}</div>\n          ${l.why ? `<div class="l-why">${esc(l.why)}${l.confidence === 'low' ? ' · weak evidence' : ''}</div>` : ''}</div>\n        <div class="l-acts">\n          <button data-lact="${pinned ? 'unpin' : 'pin'}" title="${pinned ? 'Stop keeping this one through rebuilds' : 'Keep this lesson through every rebuild, even if the data that produced it ages out'}">${pinned ? 'unpin' : 'pin'}</button>\n          <button data-lact="mute" title="Delete it and never let a rebuild write it again">mute</button>\n        </div>\n      </div>`;
    }).join('');
    const rot = p.rotation || {};
    const modes = (rot.modes || []).slice(-12);
    const share = m => modes.length ? Math.round(modes.filter(x => x === m).length / modes.length * 100) : 0;
    const mix = modes.length ? `<div class="hint" style="margin-top:10px">Last ${modes.length} auto round(s):\n          ${share('exploit')}% exploit · ${share('explore')}% explore · ${share('wild')}% wildcard.</div>` : '';
    root.innerHTML = `\n      <div class="hint" style="margin-bottom:10px">${esc(p.summary || '')}</div>\n      ${lessons || `<div class="hint">No written lessons yet — hit <b>Rebuild playbook</b> to have the model read the winners.</div>`}\n      ${mix}\n      <div class="hint" style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px">\n        This is what gets injected into ideation, the Prompt Lab, and the metadata writer while\n        “use what works” is on. Auto mode rebuilds it every few rounds — anything you write in\n        <b>Teach it</b> below survives that rebuild, this list does not unless you pin it.</div>`;
    root.querySelectorAll('.l-acts button').forEach(b => b.addEventListener('click', () => {
      const text = b.closest('.lesson').dataset.lesson;
      const act = b.dataset.lact;
      if (!window.Teach) return;
      if (act === 'pin') {
        Teach.pin(text);
        toast('Pinned — this one now survives rebuilds.', 'ok');
      } else if (act === 'unpin') {
        Teach.unpin(text);
        toast('Unpinned.', 'ok');
      } else if (act === 'mute') {
        Teach.mute(text);
        toast('Muted — a rebuild will not bring it back.', 'ok');
      }
      renderPlaybook();
      renderTeach();
    }));
  }
  function renderTeach() {
    const root = $('#teach-lessons');
    if (!root || !window.Teach) return;
    const m = Teach.manual();
    const count = $('#teach-count');
    if (count) {
      const n = Teach.count();
      count.textContent = n ? `${n} hand-written entr${n === 1 ? 'y' : 'ies'} · outranks everything measured` : '';
    }
    root.innerHTML = (m.lessons || []).map((l, i) => `\n      <div class="t-row" data-id="${esc(l.id)}">\n        <div class="t-body">\n          <div class="t-text">\n            <span class="t-badge ${l.weight === 'always' ? 'always' : 'mine'}">${l.weight === 'always' ? 'always' : 'yours'}</span>\n            ${l.adopted ? '<span class="t-badge">adopted</span>' : ''}${esc(l.text)}</div>\n          ${l.why ? `<div class="t-why">${esc(l.why)}</div>` : ''}\n        </div>\n        <div class="t-acts">\n          ${i > 0 ? '<button data-tact="up" title="Higher priority in the guidance block">↑</button>' : ''}\n          ${i < m.lessons.length - 1 ? '<button data-tact="down" title="Lower priority">↓</button>' : ''}\n          <button data-tact="weight" title="Toggle between prefer and always. An 'always' lesson is kept even on a wildcard round.">${l.weight === 'always' ? 'prefer' : 'always'}</button>\n          <button data-tact="edit" title="Reword it">edit</button>\n          <button data-tact="del" title="Delete">×</button>\n        </div>\n      </div>`).join('');
    root.querySelectorAll('.t-acts button').forEach(b => b.addEventListener('click', async () => {
      const id = b.closest('.t-row').dataset.id;
      const act = b.dataset.tact;
      const lesson = Teach.manual().lessons.find(x => x.id === id);
      if (!lesson) return;
      if (act === 'up') Teach.moveLesson(id, -1); else if (act === 'down') Teach.moveLesson(id, 1); else if (act === 'weight') Teach.updateLesson(id, {
        weight: lesson.weight === 'always' ? 'prefer' : 'always'
      }); else if (act === 'del') Teach.removeLesson(id); else if (act === 'edit') {
        const next = await askText('Reword this lesson', lesson.text);
        if (next && next.trim()) Teach.updateLesson(id, {
          text: next
        });
      }
      renderTeach();
    }));
    const fill = (sel, val) => {
      const el = $(sel);
      if (el && document.activeElement !== el) el.value = val;
    };
    fill('#teach-always', (m.rules.always || []).join('\n'));
    fill('#teach-never', (m.rules.never || []).join('\n'));
    fill('#teach-banned', (m.banned || []).join(', '));
    fill('#teach-notes', m.notes || '');
  }
  function wireTeach() {
    if (!$('#btn-teach-add')) return;
    const add = () => {
      const input = $('#teach-new');
      const text = input.value.trim();
      if (!text) return;
      Teach.addLesson(text, {
        weight: $('#teach-new-weight').value
      });
      input.value = '';
      renderTeach();
      toast('Added. It is in the next prompt the app writes.', 'ok');
    };
    $('#btn-teach-add').addEventListener('click', add);
    $('#teach-new').addEventListener('keydown', e => {
      if (e.key === 'Enter') add();
    });
    $('#btn-teach-save').addEventListener('click', () => {
      Teach.setRules({
        always: $('#teach-always').value,
        never: $('#teach-never').value
      });
      Teach.setBanned($('#teach-banned').value);
      Teach.setNotes($('#teach-notes').value);
      renderTeach();
      const el = $('#teach-saved');
      if (el) {
        el.textContent = 'Saved.';
        setTimeout(() => {
          el.textContent = '';
        }, 2500);
      }
    });
    $('#btn-teach-freeform').addEventListener('click', async () => {
      const said = await askText('Tell it what you want, in your own words', '', {
        multiline: true,
        placeholder: 'e.g. stop putting everyone in tank tops, and I want more outdoor scenes with real weather'
      });
      if (!said || !said.trim()) return;
      const btn = $('#btn-teach-freeform');
      btn.disabled = true;
      btn.textContent = 'Reading…';
      try {
        const p = await Teach.propose(said);
        const n = p.lessons.length + p.always.length + p.never.length + p.banned.length;
        if (!n) {
          toast('Could not turn that into anything concrete — try phrasing it as an instruction.', 'err');
          return;
        }
        const preview = [ ...p.lessons.map(l => `· ${l.weight === 'always' ? '[ALWAYS] ' : ''}${l.text}`), ...p.always.map(r => `· ALWAYS: ${r}`), ...p.never.map(r => `· NEVER: ${r}`), ...p.banned.length ? [ `· BANNED: ${p.banned.join(', ')}` ] : [] ].join('\n');
        if (!confirm(`Add these to your playbook?\n\n${preview}`)) return;
        Teach.applyProposal(p);
        renderTeach();
        toast(`Added ${n} entr${n === 1 ? 'y' : 'ies'}.`, 'ok');
      } catch (e) {
        toast('Could not read that: ' + e.message, 'err');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Teach in your own words';
      }
    });
  }
  function renderBreakdowns() {
    const root = $('#stats-breakdowns');
    if (!root) return;
    const b = Insights.breakdowns();
    if (b.source === 'none') {
      root.innerHTML = `<div class="hint">No data yet.</div>`;
      return;
    }
    const cols = [ [ 'Themes', b.themes ], [ 'Tags', b.tags ], [ 'Prompt elements', b.promptTraits ], [ 'Title shapes', b.titleTraits ], [ 'QC score', b.qcBands ], [ 'Posting time', b.timing ] ].filter(([, rows]) => rows && rows.length);
    if (!cols.length) {
      root.innerHTML = `<div class="hint">Measured ${b.sampleSize} item(s), but no category yet has the\n        ${State.settings.learn?.minSamples || 3} samples needed to be worth reporting. Lower the threshold in\n        Settings → Learning if you want earlier (noisier) signal.</div>`;
      return;
    }
    root.innerHTML = cols.map(([title, rows]) => `\n      <div class="break-col">\n        <h4>${esc(title)}</h4>\n        ${rows.map(r => {
      const up = r.lift >= 1;
      const pct = Math.min(100, (up ? r.lift - 1 : 1 - r.lift) * 100);
      return `<div class="lift-row" title="${esc(r.key)} — median ${r.median} over ${r.n} item(s)${r.best ? `\nbest: ${r.best}` : ''}">\n            <span class="l-key">${esc(r.key)}</span>\n            <span class="l-n">${r.n}</span>\n            <span class="lift-bar ${up ? '' : 'down'}"><i style="width:${pct.toFixed(0)}%"></i></span>\n            <span class="lift-val ${up ? 'up' : 'down'}">${r.lift}×</span>\n          </div>`;
    }).join('')}\n      </div>`).join('') + (b.source === 'local' ? `<div class="hint" style="grid-column:1/-1">Based on local keep/reject outcomes, including automated QC discards.\n                   Published evidence is insufficient. These are not verified human preferences or audience demand.</div>` : '');
  }
  function renderPerfTable() {
    const root = $('#stats-table');
    if (!root) return;
    const rows = Insights.scored();
    $('#stats-all-count').textContent = rows.length ? `· ${rows.length}` : '';
    if (!rows.length) {
      root.innerHTML = `<div class="hint">Nothing synced yet.</div>`;
      return;
    }
    const peer = Insights.peerScores ? Insights.peerScores() : new Map;
    const vsOf = d => (peer.get(String(d.deviationId)) || {}).vsPeers ?? null;
    const key = {
      vsPeers: x => vsOf(x.d),
      perDay: x => x.m.perDay,
      views: x => x.m.views,
      favs: x => x.m.favs,
      comments: x => x.m.comments,
      favRate: x => x.m.favRate || 0,
      recent: x => x.d.publishedAt || 0,
      trend: x => Insights.velocity(x.d) ?? -1
    }[statsSort] || (x => x.m.perDay);
    const sorted = [ ...rows ].sort((a, b) => (key(b) ?? -Infinity) - (key(a) ?? -Infinity));
    const page = sorted.slice(0, statsShown);
    const left = sorted.length - page.length;
    root.innerHTML = `<div class="tbl-wrap"><table class="stat-table">\n      <thead><tr>\n        <th>Title</th><th>Theme</th><th class="num">Views</th><th class="num">Favs</th>\n        <th class="num">Comm.</th><th class="num">Fav rate</th>\n        <th class="num" title="Engagement against the posts published closest to it in age — 1× is a typical post of its age">vs age</th><th class="num">/day</th>\n        <th class="num" title="Engagement per day between the last two syncs — needs two syncs to show">Now</th>\n        <th class="num">Age</th><th>Source</th>\n      </tr></thead><tbody>\n      ${page.map(({d: d, m: m}) => {
      const v = Insights.velocity(d);
      return `<tr>\n        <td class="t-title" title="${esc(d.title)}">${d.url ? `<a href="#" data-devurl="${esc(d.url)}">${esc(d.title || 'Untitled')}</a>` : esc(d.title || 'Untitled')}</td>\n        <td>${esc(d.theme || '—')}</td>\n        <td class="num">${fmtNum(m.views)}</td>\n        <td class="num">${fmtNum(m.favs)}</td>\n        <td class="num">${fmtNum(m.comments)}</td>\n        <td class="num">${m.favRate == null ? '—' : (m.favRate * 100).toFixed(1) + '%'}</td>\n        <td class="num">${vsOf(d) == null ? '—' : vsOf(d).toFixed(1) + '×'}</td>\n        <td class="num">${m.perDay == null ? '—' : Math.round(m.perDay)}</td>\n        <td class="num">${v == null ? '—' : `<span class="trend ${v >= 1 ? 'up' : ''}">${v >= 1 ? '▲' : ''}${Math.round(v)}</span>`}</td>\n        <td class="num">${Math.round(m.ageDays)}d</td>\n        <td>${esc(d.promptSource || (d.cardId ? 'app' : 'manual'))}</td>\n      </tr>`;
    }).join('')}\n      </tbody></table></div>` + (left ? `<div class="tbl-more"><button class="btn ghost" data-statsmore>Show ${Math.min(STATS_PAGE, left)} more</button>\n          <span class="hint">${page.length} of ${sorted.length} shown</span></div>` : '');
    root.onclick = e => {
      const link = e.target.closest('[data-devurl]');
      if (link) {
        e.preventDefault();
        window.ala.app.openExternal(link.dataset.devurl);
        return;
      }
      if (e.target.closest('[data-statsmore]')) {
        statsShown += STATS_PAGE;
        renderPerfTable();
      }
    };
  }
  const fmtNum = n => n == null ? '—' : Number(n).toLocaleString();
  let reviewCursor = 0;
  const REVIEW_PAGE = 60;
  let reviewShown = REVIEW_PAGE;
  const resetReviewWindow = () => {
    reviewShown = REVIEW_PAGE;
  };
  function growReview(total) {
    if (reviewShown >= total) return false;
    reviewShown = Math.min(total, reviewShown + REVIEW_PAGE);
    return true;
  }
  function wireReview() {
    $('#btn-pick-keepers')?.addEventListener('click', () => TriageUI.open());
    $$('#review-filters .chip').forEach(chip => chip.addEventListener('click', () => {
      reviewFilter = chip.dataset.filter;
      $$('#review-filters .chip').forEach(c => c.classList.toggle('active', c === chip));
      reviewCursor = 0;
      resetReviewWindow();
      renderReview();
    }));
    const sortSel = $('#review-sort');
    sortSel.value = reviewSort;
    sortSel.addEventListener('change', e => {
      reviewSort = e.target.value;
      reviewDir = reviewSort === 'title' ? 'asc' : 'desc';
      persistReviewOrder();
      reviewCursor = 0;
      resetReviewWindow();
      paintSortDir();
      renderReview();
    });
    $('#btn-review-dir').addEventListener('click', () => {
      reviewDir = reviewDir === 'desc' ? 'asc' : 'desc';
      persistReviewOrder();
      reviewCursor = 0;
      resetReviewWindow();
      paintSortDir();
      renderReview();
    });
    paintSortDir();
    $('#btn-discard-all')?.addEventListener('click', () => {
      const hit = cardsForFilter().filter(c => ![ 'discarded', 'drafted' ].includes(c.status));
      if (!hit.length) return toast('Nothing listed can be discarded.', 'ok');
      const approved = hit.filter(c => c.status === 'approved').length;
      if (!confirm(`Discard all ${hit.length} listed card(s)?` + (approved ? `\n\n${approved} of them are already APPROVED and waiting to upload.` : '') + '\n\nThe image files stay in your library folder, and Discarded cards can be restored from the Discarded filter.')) return;
      hit.forEach(c => {
        c.status = 'discarded';
        c.updatedAt = Date.now();
      });
      State.persistLibrary();
      State.addLog(`Discarded ${hit.length} card(s) from the ${reviewFilter} view.`);
      toast(`Discarded ${hit.length} card(s). Restore them from the Discarded filter if that was a mistake.`, 'ok');
    });
    $('#btn-retry-qc-all')?.addEventListener('click', async () => {
      const btn = $('#btn-retry-qc-all');
      const cards = cardsForFilter().filter(c => c.status === 'qc_error');
      if (!cards.length) return toast('Nothing to retry.', 'ok');
      btn.disabled = true;
      let ok = 0, failed = 0, stillBroken = 0;
      for (const [i, card] of cards.entries()) {
        btn.textContent = `Inspecting ${i + 1}/${cards.length}…`;
        try {
          await Pipeline.retryQc(card);
          card.status === 'review' ? ok++ : failed++;
        } catch {
          stillBroken++;
          if (stillBroken >= 2) break;
        }
      }
      btn.disabled = false;
      btn.textContent = 'Retry QC on all listed';
      toast(stillBroken >= 2 ? `Stopped — the vision model is still unreachable. Check LM Studio (or Settings → Cloud QC).` : `Retried ${ok + failed}: ${ok} passed, ${failed} failed QC.`, stillBroken >= 2 ? 'err' : 'ok');
    });
    $('#btn-qcerr-to-review')?.addEventListener('click', () => {
      const cards = cardsForFilter().filter(c => c.status === 'qc_error');
      if (!cards.length) return toast('Nothing listed is waiting on QC.', 'ok');
      if (!confirm(`Send ${cards.length} card(s) to Review without an AI inspection?\n\n` + 'They arrive marked "not inspected", exactly like cards made with the AI check off. ' + 'Run QC on any of them later from the card itself.')) return;
      for (const c of cards) {
        c.status = 'review';
        c.qcSkipped = true;
        c.error = null;
        delete c.qcAttempt;
        c.updatedAt = Date.now();
      }
      State.persistLibrary();
      State.addLog(`Sent ${cards.length} uninspected card(s) from "QC failed to run" to Review.`, 'ok');
      toast(`${cards.length} card(s) moved to Review.`, 'ok');
    });
    $('#btn-write-meta-all')?.addEventListener('click', async () => {
      const btn = $('#btn-write-meta-all');
      const cards = cardsForFilter().filter(c => [ 'review', 'approved' ].includes(c.status) && !Pipeline.hasMetadata(c));
      if (!cards.length) return toast('Everything listed already has metadata.', 'ok');
      if (!confirm(`Write titles, descriptions and tags for ${cards.length} card(s)?` + `\n\nThat is one metadata call per generation turn they came from.`)) return;
      btn.disabled = true;
      const res = await Pipeline.writeMetadataForCards(cards, (done, total) => {
        btn.textContent = `Writing ${Math.min(done + 1, total)}/${total}…`;
      });
      btn.disabled = false;
      renderReview();
      toast(res.failed ? `Wrote ${res.done}, but ${res.failed} card(s) came back empty — check the metadata engine in Settings → Status.` : `Wrote metadata for ${res.done} card(s).`, res.failed ? 'err' : 'ok');
    });
    $('#btn-enhance-meta-all')?.addEventListener('click', async () => {
      const btn = $('#btn-enhance-meta-all');
      const cards = cardsForFilter().filter(c => [ 'review', 'approved' ].includes(c.status));
      if (!cards.length) return toast('Nothing listed to enhance.', 'ok');
      if (!confirm(`Rewrite the title, description and tags of ${cards.length} card(s) from the images themselves?` + `\n\nThat is ${cards.length} vision call(s) — one per card, not one per generation turn — and it replaces the text they have now.` + (cards.length > 25 ? `\n\nThat is a lot. The search box and the filter above narrow this list, and this button only ever works on what is listed.` : ''))) return;
      const label = btn.textContent;
      btn.disabled = true;
      const res = await Pipeline.enhanceMetadataForCards(cards, (done, total) => {
        btn.textContent = `Looking ${Math.min(done + 1, total)}/${total}…`;
      });
      btn.disabled = false;
      btn.textContent = label;
      renderReview();
      const seen = cards.filter(c => c.metaFromImage).length;
      toast(res.failed ? `Enhanced ${res.done}, ${res.failed} failed — check the vision engine in Settings → Status.` : `Enhanced ${res.done} card(s)${seen < res.done ? ` — ${res.done - seen} fell back to the prompt` : ''}.`, res.failed || seen < res.done ? 'err' : 'ok');
    });
    $('#btn-approve-all')?.addEventListener('click', async () => {
      const listed = cardsForFilter().filter(c => c.status === 'review');
      const cards = listed.filter(c => Pipeline.hasMetadata(c));
      const bare = listed.length - cards.length;
      if (!cards.length) {
        return toast(bare ? `${bare} listed card(s) have no metadata yet — write it first, or approve them one at a time.` : 'Nothing to approve.', 'err');
      }
      if (!confirm(`Approve all ${cards.length} card(s) currently listed?` + (bare ? `\n\n${bare} more have no metadata yet and are left alone — nothing can upload without a title.` : ''))) return;
      cards.forEach(c => {
        c.status = 'approved';
        c.updatedAt = Date.now();
      });
      State.persistLibrary();
      toast(`Approved ${cards.length} card(s).${bare ? ` ${bare} skipped for having no metadata.` : ''}`, 'ok');
    });
    $('#btn-discard-below')?.addEventListener('click', async () => {
      const min = await askNumber({
        title: 'Discard by score',
        label: 'Discard every listed card scoring below',
        value: State.settings.gen.passThreshold || 7,
        hint: 'Only cards in "Needs review" with a QC score are touched. Discarded cards can be restored.'
      });
      if (min == null) return;
      const hit = cardsForFilter().filter(c => c.status === 'review' && c.qc && c.qc.score < min);
      if (!hit.length) return toast(`Nothing listed scores below ${min}.`, 'ok');
      if (!confirm(`Discard ${hit.length} card(s) scoring below ${min}?`)) return;
      hit.forEach(c => {
        c.status = 'discarded';
        c.updatedAt = Date.now();
      });
      State.persistLibrary();
      toast(`Discarded ${hit.length} card(s).`, 'ok');
    });
    $('#discard-tail-n')?.addEventListener('change', () => paintDiscardTail());
    $('#btn-discard-tail')?.addEventListener('click', async () => {
      const eligible = cardsForFilter().filter(c => ![ 'discarded', 'drafted' ].includes(c.status));
      if (!eligible.length) return toast('Nothing listed can be discarded.', 'ok');
      const picked = $('#discard-tail-n').value;
      const n = picked === 'custom' ? await askNumber({
        title: 'Discard from the bottom',
        label: `How many, counting up from the bottom of the ${eligible.length} listed`,
        value: Math.min(50, eligible.length),
        hint: `The bottom is the far end of the order on screen right now (${sortDescription()}). ` + 'Image files stay in your library folder and discarded cards can be restored from the Discarded filter.'
      }) : Number(picked);
      if (n == null) return;
      const take = Math.min(Math.floor(n), eligible.length);
      if (take < 1) return toast('Nothing to discard.', 'ok');
      const hit = eligible.slice(-take);
      const approved = hit.filter(c => c.status === 'approved').length;
      const what = tailSummary(hit);
      if (!confirm(`Discard the bottom ${hit.length} of the ${eligible.length} listed?` + (what ? `\n\nThe ones going: ${what}.` : '') + `\n\n${eligible.length - hit.length} card(s) stay.` + (approved ? `\n\n${approved} of them are already APPROVED and waiting to upload.` : '') + '\n\nThe image files stay in your library folder, and discarded cards can be restored ' + 'from the Discarded filter.')) return;
      hit.forEach(c => {
        c.status = 'discarded';
        c.updatedAt = Date.now();
      });
      State.persistLibrary();
      State.addLog(`Discarded the bottom ${hit.length} of the ${reviewFilter} view, ${sortDescription()}.`);
      toast(`Discarded ${hit.length} card(s) from the bottom. Restore them from the Discarded filter if that was a mistake.`, 'ok');
    });
    $('#btn-purge-discarded')?.addEventListener('click', async () => {
      const hit = State.library.filter(c => c.status === 'discarded');
      if (!hit.length) return toast('No discarded cards.', 'ok');
      if (!confirm(`Permanently delete ${hit.length} discarded card(s) AND their image files from disk?` + '\n\nThis cannot be undone — it is the "empty the bin" step.')) return;
      for (const c of hit) {
        window.ala.files.deleteImage(c.fname).catch(() => {});
        if (c.upscaled && c.upscaled.backup) window.ala.files.deleteImage(c.upscaled.backup).catch(() => {});
      }
      State.library = State.library.filter(c => c.status !== 'discarded');
      State.persistLibrary();
      State.addLog(`Deleted ${hit.length} discarded card(s) and their files.`, 'ok');
      toast(`Deleted ${hit.length} card(s) and their files.`, 'ok');
      renderLibraryUsage();
    });
    document.addEventListener('keydown', onReviewKey);
    $('#review-grid').addEventListener('focusout', () => {
      setTimeout(() => {
        if (reviewRenderPending && !editingInReview()) renderReview();
      }, 0);
    });
    const searchBox = $('#review-search');
    const applySearch = U.debounce(() => {
      reviewQuery = searchBox.value;
      reviewCursor = 0;
      resetReviewWindow();
      renderReview();
    }, 180);
    searchBox.addEventListener('input', applySearch);
    searchBox.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        searchBox.value = '';
        reviewQuery = '';
        resetReviewWindow();
        renderReview();
        searchBox.blur();
      }
      if (e.key === 'Enter') searchBox.blur();
    });
  }
  const REVIEW_KEYS = {
    j: 'next',
    ArrowDown: 'next',
    k: 'prev',
    ArrowUp: 'prev',
    a: 'approve',
    r: 'reject',
    e: 'writemeta',
    u: 'upload',
    ' ': 'zoom',
    v: 'enhancemeta'
  };
  async function onReviewKey(ev) {
    if (!$('#pane-review').classList.contains('active')) return;
    if (window.TriageUI && TriageUI.isOpen()) return;
    if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
    const t = ev.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if ((ev.key === 'p' || ev.key === 'P') && !$('#modal-root').innerHTML) {
      ev.preventDefault();
      TriageUI.open();
      return;
    }
    if ($('#modal-root').innerHTML) {
      if (zoomState) {
        if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown' || ev.key === 'j') {
          ev.preventDefault();
          return navZoom(1);
        }
        if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' || ev.key === 'k') {
          ev.preventDefault();
          return navZoom(-1);
        }
      }
      if (ev.key === 'Escape' || ev.key === ' ') {
        ev.preventDefault();
        $('#modal-root').innerHTML = '';
        zoomState = null;
      }
      return;
    }
    if (ev.key === 'Escape') return;
    const action = REVIEW_KEYS[ev.key];
    if (!action) return;
    ev.preventDefault();
    const cards = cardsForFilter();
    if (!cards.length) return;
    reviewCursor = Math.max(0, Math.min(reviewCursor, cards.length - 1));
    if (action === 'next' || action === 'prev') {
      reviewCursor = Math.max(0, Math.min(cards.length - 1, reviewCursor + (action === 'next' ? 1 : -1)));
      return focusCursor(true);
    }
    const card = cards[reviewCursor];
    if (!card) return;
    if (action === 'zoom') {
      openReviewZoom(card.id);
      return;
    }
    const el = $(`.review-card[data-id="${card.id}"]`);
    const btn = el && el.querySelector(`[data-act="${action}"]`);
    if (!btn) return toast(`"${action}" not available for a ${card.status} card.`, 'err');
    btn.click();
    setTimeout(() => focusCursor(true), 60);
  }
  function focusCursor(scroll = false, cards = cardsForFilter()) {
    reviewCursor = Math.max(0, Math.min(reviewCursor, Math.max(0, cards.length - 1)));
    $$('.review-card.cursor').forEach(el => el.classList.remove('cursor'));
    const card = cards[reviewCursor];
    if (!card) return;
    if (reviewCursor >= reviewShown) {
      reviewShown = Math.min(cards.length, Math.ceil((reviewCursor + 1) / REVIEW_PAGE) * REVIEW_PAGE);
      renderReview();
    }
    const el = $(`.review-card[data-id="${card.id}"]`);
    if (el) {
      el.classList.add('cursor');
      if (scroll) el.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      });
    }
  }
  function showReviewCard(id) {
    const card = State.library.find(c => c.id === id);
    if (!card) return;
    switchTab('review');
    const alreadyListed = reviewFilter === 'all' || reviewFilter === card.status || reviewFilter === 'agent' && inAgentView(card);
    if (!alreadyListed) {
      reviewFilter = card.status;
      $$('#review-filters .chip').forEach(chip => chip.classList.toggle('active', chip.dataset.filter === reviewFilter));
    }
    renderReview();
    const idx = cardsForFilter().findIndex(c => c.id === id);
    if (idx >= 0) {
      reviewCursor = idx;
      focusCursor(true);
    }
  }
  const SORT_KEYS = {
    score: c => c.qc && typeof c.qc.score === 'number' ? c.qc.score : null,
    newest: c => c.createdAt || 0,
    updated: c => c.updatedAt || c.createdAt || 0,
    title: c => (c.metadata && c.metadata.title || c.fname || '').toLowerCase()
  };
  const inAgentView = c => c.promptSource === 'overseer' && ![ 'discarded', 'rejected' ].includes(c.status);
  function cardsForFilter() {
    let list = reviewFilter === 'all' ? [ ...State.library ] : reviewFilter === 'agent' ? State.library.filter(inAgentView) : reviewFilter === 'keepers' ? State.library.filter(c => c.status === 'review' && Triage.isKept(c)) : State.library.filter(c => c.status === reviewFilter);
    const q = reviewQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(c => {
        const hay = [ c.metadata && c.metadata.title, c.metadata && (c.metadata.tags || []).join(' '), c.prompt, c.theme, c.fname ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
    }
    const key = SORT_KEYS[reviewSort] || SORT_KEYS.score;
    const dir = reviewDir === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      const va = key(a), vb = key(b);
      if (va == null && vb == null) return (b.createdAt || 0) - (a.createdAt || 0);
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va === vb) return (b.createdAt || 0) - (a.createdAt || 0);
      const asc = typeof va === 'string' ? String(va).localeCompare(String(vb)) : va - vb;
      return asc * dir;
    });
  }
  function paintSortDir() {
    const btn = $('#btn-review-dir');
    if (!btn) return;
    const labels = {
      score: [ '↓ Best first', '↑ Worst first' ],
      newest: [ '↓ Newest first', '↑ Oldest first' ],
      updated: [ '↓ Latest touched', '↑ Longest untouched' ],
      title: [ '↓ Z–A', '↑ A–Z' ]
    }[reviewSort] || [ '↓ Descending', '↑ Ascending' ];
    btn.textContent = reviewDir === 'desc' ? labels[0] : labels[1];
  }
  function paintDiscardTail(discardable = cardsForFilter().filter(c => ![ 'discarded', 'drafted' ].includes(c.status)).length) {
    const sel = $('#discard-tail-n');
    const btn = $('#btn-discard-tail');
    if (!sel || !btn) return;
    const custom = sel.value === 'custom';
    const take = custom ? 0 : Math.min(Number(sel.value) || 0, discardable);
    btn.disabled = !discardable;
    btn.textContent = custom ? 'Discard…' : `Discard ${take}`;
    btn.title = !discardable ? 'Nothing listed can be discarded.' : `Discard the bottom ${custom ? 'N' : take} of the ${discardable} card(s) listed, ` + `in the order shown — ${sortDescription()}.`;
  }
  function sortDescription() {
    const sel = $('#review-sort');
    const label = sel && sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : reviewSort;
    const dir = $('#btn-review-dir');
    return `${label}, ${dir ? dir.textContent.replace(/^[↓↑]\s*/, '').toLowerCase() : reviewDir}`;
  }
  function tailSummary(hit) {
    const scores = hit.filter(c => c.qc && typeof c.qc.score === 'number').map(c => c.qc.score);
    if (reviewSort === 'score' && scores.length) {
      const lo = Math.min(...scores), hi = Math.max(...scores);
      const none = hit.length - scores.length;
      return (lo === hi ? `QC score ${lo}` : `QC scores ${lo} to ${hi}`) + (none ? `, plus ${none} never inspected` : '');
    }
    if (reviewSort === 'title') return '';
    const stamp = c => (reviewSort === 'updated' ? c.updatedAt || c.createdAt : c.createdAt) || 0;
    const ts = hit.map(stamp).filter(Boolean);
    if (!ts.length) return '';
    const day = t => new Date(t).toLocaleDateString();
    const lo = day(Math.min(...ts)), hi = day(Math.max(...ts));
    const when = lo === hi ? `all from ${lo}` : `${lo} to ${hi}`;
    return reviewSort === 'updated' ? `last touched ${when}` : `generated ${when}`;
  }
  const persistReviewOrder = U.debounce(() => window.ala.settings.patch({
    ui: {
      reviewSort: reviewSort,
      reviewDir: reviewDir
    }
  }).then(s => {
    State.settings = s;
  }), 400);
  let reviewRenderPending = false;
  function editingInReview() {
    const a = document.activeElement;
    return !!(a && a.closest && a.closest('#review-grid') && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable));
  }
  function renderReview() {
    if (editingInReview()) {
      reviewRenderPending = true;
      return;
    }
    reviewRenderPending = false;
    const root = $('#review-grid');
    const cards = cardsForFilter();
    const bare = cards.filter(c => [ 'review', 'approved' ].includes(c.status) && !Pipeline.hasMetadata(c));
    const btnRetry = $('#btn-retry-qc-all');
    const qcErrors = cards.filter(c => c.status === 'qc_error').length;
    if (btnRetry) btnRetry.hidden = !qcErrors;
    const btnQcErrToReview = $('#btn-qcerr-to-review');
    if (btnQcErrToReview) {
      btnQcErrToReview.hidden = !qcErrors;
      btnQcErrToReview.textContent = `Send to Review uninspected (${qcErrors})`;
    }
    const btnMeta = $('#btn-write-meta-all');
    if (btnMeta) {
      btnMeta.hidden = !bare.length;
      btnMeta.textContent = `Write metadata for all listed (${bare.length})`;
    }
    const editableListed = cards.filter(c => [ 'review', 'approved' ].includes(c.status));
    const btnEnhance = $('#btn-enhance-meta-all');
    if (btnEnhance) {
      btnEnhance.hidden = !editableListed.length;
      btnEnhance.textContent = `✨ Enhance all listed (${editableListed.length})`;
    }
    const btnPick = $('#btn-pick-keepers');
    if (btnPick) {
      const open = TriageUI.count('review');
      btnPick.textContent = open.batches ? `▦ Pick keepers (${open.batches} batch${open.batches === 1 ? '' : 'es'})` : '▦ Pick keepers';
      btnPick.disabled = !open.batches;
    }
    const countEl = $('#review-count');
    if (countEl) {
      const scored = cards.filter(c => c.qc && typeof c.qc.score === 'number').length;
      countEl.textContent = cards.length ? `${cards.length} card(s)` + (reviewQuery.trim() ? ` matching “${reviewQuery.trim()}”` : '') + (scored < cards.length ? ` · ${cards.length - scored} not inspected` : '') + (bare.length ? ` · ${bare.length} without metadata` : '') : reviewQuery.trim() ? `nothing matches “${reviewQuery.trim()}”` : '';
    }
    const discardable = cards.filter(c => ![ 'discarded', 'drafted' ].includes(c.status)).length;
    const btnDiscardAll = $('#btn-discard-all');
    if (btnDiscardAll) btnDiscardAll.disabled = !discardable;
    paintDiscardTail(discardable);
    const btnPurge = $('#btn-purge-discarded');
    if (btnPurge) btnPurge.hidden = !(reviewFilter === 'discarded' && cards.length);
    if (!cards.length) {
      root.innerHTML = `<div class="hint">${reviewQuery.trim() ? 'Nothing matches the search.' : 'Nothing here yet.'}</div>`;
      paintedCards = new Map;
      paintReviewTail(0, 0);
      return;
    }
    reviewShown = Math.max(reviewShown, Math.min(cards.length, reviewCursor + 1));
    const shown = cards.slice(0, reviewShown);
    reconcileReviewGrid(root, shown);
    paintReviewTail(cards.length, shown.length);
    focusCursor(false, cards);
  }
  let reviewTail = null;
  function paintReviewTail(total, built) {
    const root = $('#review-grid');
    if (!root) return;
    if (!reviewTail) {
      reviewTail = document.createElement('div');
      reviewTail.className = 'review-tail hint';
      root.after(reviewTail);
      if (window.IntersectionObserver) {
        new IntersectionObserver(entries => {
          if (!entries.some(e => e.isIntersecting)) return;
          if (growReview(cardsForFilter().length)) renderReview();
        }, {
          rootMargin: '800px 0px'
        }).observe(reviewTail);
      }
    }
    const left = total - built;
    reviewTail.hidden = left <= 0;
    reviewTail.textContent = left > 0 ? `${built} of ${total} shown — scroll for the rest` : '';
  }
  let paintedCards = new Map;
  const cardParser = document.createElement('template');
  const elementFrom = html => {
    cardParser.innerHTML = html;
    return cardParser.content.firstElementChild;
  };
  function reconcileReviewGrid(root, cards) {
    const existing = new Map;
    for (const el of [ ...root.children ]) {
      const id = el.dataset && el.dataset.id;
      if (id) existing.set(id, el); else el.remove();
    }
    const painted = new Map;
    const ordered = [];
    for (const c of cards) {
      const html = cardHtml(c);
      painted.set(c.id, html);
      let el = existing.get(c.id);
      if (!el) {
        el = elementFrom(html);
        wireCard(el, c);
      } else if (paintedCards.get(c.id) !== html) {
        const fresh = elementFrom(html);
        el.replaceWith(fresh);
        wireCard(fresh, c);
        el = fresh;
      }
      existing.set(c.id, el);
      ordered.push(el);
    }
    for (const [id, el] of existing) if (!painted.has(id)) el.remove();
    const BULK_REORDER_AT = 24;
    let node = root.firstElementChild;
    let moves = 0;
    for (const el of ordered) {
      if (node === el) {
        node = node.nextElementSibling;
        continue;
      }
      if (++moves > BULK_REORDER_AT) break;
      root.insertBefore(el, node);
    }
    if (moves > BULK_REORDER_AT) {
      const scroll = root.scrollTop;
      root.replaceChildren(...ordered);
      root.scrollTop = scroll;
    }
    paintedCards = painted;
  }
  const matureFor = c => false;
  const destFor = c => Pipeline.destinationOf(c);
  const destsFor = c => Pipeline.destinationsOf(c);
  const DESTS = [ {
    id: 'deviantart',
    ico: '✦',
    label: 'DeviantArt',
    note: 'Sta.sh draft · description carries the Patreon link'
  }, {
    id: 'pixiv',
    ico: '✿',
    label: 'Pixiv',
    note: 'posted straight from the Pixiv tab · caption carries the Patreon link'
  }, {
    id: 'patreon',
    ico: '◔',
    label: 'Patreon',
    note: 'post on Patreon · no link, no CTA'
  } ];
  function destDefaultValue(s) {
    const list = s.publish && s.publish.destinations || [ s.publish?.destination || 'deviantart' ];
    if (list.includes('patreon')) return 'patreon';
    const da = list.includes('deviantart');
    const px = list.includes('pixiv');
    if (da && px) return 'deviantart+pixiv';
    if (px) return 'pixiv';
    return 'deviantart';
  }
  function destNote(dests) {
    if (dests.includes('patreon')) return DESTS[2].note;
    if (dests.length > 1) return 'both sites · one description, carrying the Patreon link, on each';
    return (DESTS.find(d => d.id === dests[0]) || DESTS[0]).note;
  }
  function cardHtml(c) {
    const qc = c.qc;
    const qcRegions = qc && Array.isArray(qc.regions) ? qc.regions : [];
    const qcFingers = qc && Array.isArray(qc.fingers) ? qc.fingers : [];
    const qcCaps = qc && Array.isArray(qc.caps) ? qc.caps : [];
    const qcDetail = qc && (qcRegions.length || qc.fix || qcCaps.length || qcFingers.length || qc.gates?.structural) ? `<div class="qc-detail">\n          ${qcRegions.length ? `<span class="qc-regions" title="Inspected region by region. A region that came back clean is a result, not a gap.">${qcRegions.map(r => `<i class="rg ${r.verdict === 'CLEAN' ? 'ok' : r.verdict === 'DEFECT' ? 'bad' : ''}" title="${esc(r.verdict + (r.detail ? ': ' + r.detail : ''))}">${esc(r.region)}</i>`).join('')}</span>` : ''}\n          ${qcFingers.length ? `<span class="qc-fingers" title="What the inspector counted on each hand. A hand genuinely out of frame is not a defect, and 'unreadable' is left alone rather than guessed at.">${qcFingers.map(h => `<i class="rg ${h.status === 'clean' ? 'ok' : h.status === 'defect' ? 'bad' : ''}" title="${esc(h.said)}">${esc(h.side)}: ${esc(h.status === 'clean' ? '5' : h.status === 'defect' ? 'FAILED' : h.status)}</i>`).join('')}</span>` : ''}\n          ${qcCaps.length ? `<span class="qc-caps" title="The inspector's own number is kept beside this one as rawScore. These checks can only lower a score, never raise it.">${qcCaps.map(k => `<i class="qc-cap" title="${esc(k.why)}">${k.by === 'veto' ? k.disputed ? '⚖' : '⚠' : k.by === 'general' ? '👁' : '▤'} ${esc(k.disputed ? 'disputed veto' : k.by)} → ${k.to}/10${qc.rawScore != null && qc.rawScore !== qc.score ? ` (inspector said ${qc.rawScore})` : ''}</i>`).join('')}</span>` : ''}\n          ${qc.gates?.structural ? `<span class="qc-cap" title="A structural NO blocks a pass even below the numeric score threshold.">General check failed: ${esc((qc.gates.failed || []).filter(k => k !== 'detail').join(', '))}</span>` : ''}\n          ${qc.fix ? `<span class="qc-fix" title="The single change that would raise this score by one point">→ ${esc(qc.fix)}</span>` : ''}\n        </div>` : '';
    const meta = c.metadata || {
      title: '',
      description: '',
      tags: []
    };
    const editable = [ 'review', 'approved' ].includes(c.status);
    const dests = destsFor(c);
    const hasMeta = Pipeline.hasMetadata(c);
    return `\n    <div class="review-card" data-id="${c.id}">\n      <img class="card-img" src="${c.url}" alt="" loading="lazy" data-zoom="${c.url}" />\n      ${c.video ? shownVideos.has(c.id) ? `<video class="card-video" controls preload="metadata" src="${esc(c.video.url)}"></video><button class="btn ghost small card-video-toggle" data-act="togglevideo" title="Hide the MP4 player again">▾ Hide MP4</button>` : `<button class="btn ghost small card-video-toggle" data-act="togglevideo" title="Patreon takes the GIF, so the MP4 player is hidden until you ask for it">▸ Show MP4${c.video.check?.duration ? ` (${Math.round(c.video.check.duration)} s)` : ''}</button>` : ''}\n      ${c.video?.check?.checks ? `<div class="video-check" title="${esc(`The Overseer's self-check of this clip (${c.video.check.attempts || 1} render${(c.video.check.attempts || 1) > 1 ? 's' : ''}).${c.video.check.transcript?.text ? `\nWhisper heard [${c.video.check.transcript.language}]: ${c.video.check.transcript.text}` : ''}`)}"><span class="vc-sum">🔎 ${esc(c.video.check.summary)}</span>${c.video.check.checks.map(k => `<i class="rg ${k.met === true ? 'ok' : k.met === false ? 'bad' : ''}" title="${esc(k.ask + ' — ' + (k.evidence || ''))}">${k.met === true ? '✓' : k.met === false ? '✗' : '?'} ${esc(k.id)}</i>`).join('')}</div>` : ''}\n      ${c.gif ? `<img class="card-gif" src="${esc(c.gif.url)}" alt="Animated GIF version of this card" loading="lazy" />` : ''}\n      <div class="card-body">\n        <div class="qc-row">\n          <span class="pill ${c.status}">${c.status === 'qc_error' ? 'QC failed' : c.status}</span>\n          ${c.promptSource === 'evolved' ? `<span class="src-badge deviantart" title="This prompt was grown from a measured top performer${c.learnedFrom ? ' (' + esc(c.learnedFrom) + ')' : ''}">evolved</span>` : ''}\n          ${c.promptSource === 'lab' ? `<span class="src-badge" title="Written in the Prompt Lab">lab</span>` : ''}\n          ${c.promptSource === 'overseer' ? `<span class="src-badge wild" title="The Overseer chose this one — ask it on the Overseer tab why, the conversation is still there">☰ agent</span>` : ''}\n          ${c.promptSource === 'continuation' ? `<span class="src-badge deviantart" title="A sequel to a published deviation${c.continuationOf ? ' (' + esc(c.continuationOf) + ')' : ''} — someone asked for this one">continuation</span>` : ''}\n          ${c.promptSource === 'comic' ? `<span class="src-badge" title="A composed comic page. It was never QC'd — a page is judged by eye, not by the anatomy inspector.">comic page</span>` : ''}\n          ${c.promptSource === 'teaser' ? `<span class="src-badge" title="The blurred public copy. The full-resolution original is on the Patreon route.">◔ teaser</span>` : ''}\n          ${c.teaserId ? `<span class="src-badge deviantart" title="A blurred teaser of this image was made and is headed for DeviantArt. This card is the full-resolution original.">original · teased</span>` : ''}\n          ${qc ? `<span class="qc-score ${qc.verdict === 'PASS' ? 'good' : 'bad'}">${qc.score}/10</span>\n          <span class="qc-defects" title="${esc((qc.defects || []).join('\n'))}${qcCaps.length ? esc('\n\n' + qcCaps.map(k => `lowered by ${k.by}: ${k.why}`).join('\n')) : ''}${qc.gates && qc.gates.no ? esc(`\n\ngeneral pass: ${qc.gates.no}/${qc.gates.answered} gates NO (${qc.gates.failed.join(', ')})`) : ''}${qc.metrics ? esc(`\n\ndetail ${qc.metrics.detail} · sharp ${qc.metrics.sharp} · flat ${qc.metrics.flat}${qc.metrics.detailPercentile != null ? ` · ${qc.metrics.detailPercentile}th percentile of your library` : ''}`) : ''}${qc.engine ? esc(`\n\ninspected by ${qc.engine}${qc.model ? ' · ' + qc.model : ''}${qc.latencyMs ? ' · ' + Math.round(qc.latencyMs / 1e3) + 's' : ''}${qc.passes > 1 ? ' · ' + qc.passes + ' passes' : ''}${qc.promptTokens || qc.completionTokens ? `\n${qc.promptTokens} tokens in (prompt + image), ${qc.completionTokens} out` : ''}`) : ''}">${qc.defects && qc.defects.length ? esc(qc.defects[0]) : esc(qc.notes || '')}</span>` : ''}\n          ${!qc && c.qcSkipped ? `<span class="src-badge none" title="AI quality check was off when this was generated — your call">not inspected</span>` : ''}\n          ${Triage.isKept(c) && [ 'review', 'approved' ].includes(c.status) ? `<span class="src-badge keeper" title="You picked this one as the keeper of its batch in Pick keepers${c.triage.suggested ? ' — the AI had picked it too' : ''}">★ keeper</span>` : ''}\n          ${editable && !hasMeta ? `<span class="src-badge none" title="Auto metadata was off when this was generated. Press Write metadata to have it written from this image's own prompt.">no metadata</span>` : ''}\n          ${c.metaEngine && hasMeta ? `<span class="src-badge ${c.metaEngine.tier === 'cloud' ? 'deviantart' : 'none'}" title="Title, description and tags were written by ${esc(c.metaEngine.provider || '')}${c.metaEngine.model ? ' · ' + esc(c.metaEngine.model) : ''}${c.metaFromImage ? ' — looking at this image, not at its prompt' : ''}">${c.metaFromImage ? '✨' : '✎'} ${esc(c.metaEngine.provider || '')}</span>` : ''}\n        </div>\n        ${qcDetail}\n        <div class="card-field dest-field"><label>Publish to</label>\n          <div class="dest-row">\n            ${DESTS.map(d => `<button class="dest-btn ${dests.includes(d.id) ? 'on' : ''} ${d.id === 'pixiv' ? 'px-only' : ''}" data-dest="${d.id}"\n              ${editable ? '' : 'disabled'} title="${esc(d.note)}">${d.ico} ${d.label}</button>`).join('')}\n          </div>\n          <div class="dest-note hint">${esc(destNote(dests))}</div>\n          ${c.pixiv?.illustId ? `<div class="hint ok px-only">on pixiv since ${esc(fmtTime(c.pixiv.at))} —\n            <a href="#" data-open="${esc(c.pixiv.url || '')}">open ↗</a>\n            ${''}\n            <button class="btn ghost small" data-act="pixivforget"\n              title="Only if you deleted it on pixiv — this forgets the post so the card can go up again">forget</button></div>` : ''}\n          ${!c.pixiv?.illustId && c.pixivError ? `<div class="hint err px-only">pixiv: ${esc(c.pixivError.message)}</div>` : ''}\n        </div>\n        <div class="card-field"><label>Title</label>\n          <div class="title-row">\n            <input type="text" data-f="title" value="${esc(meta.title)}" ${editable ? '' : 'disabled'} />\n            ${editable && hasMeta ? `<button class="btn ghost small" data-act="retitle"\n              title="Write a different title for this image and leave the description and tags alone. It is told what the old one repeated, so it will not hand back the same idea.">🎲 New title</button>` : ''}\n          </div>\n          ${c.titleWarning ? `<div class="hint err" data-titlewarn>${esc(c.titleWarning)}</div>` : ''}\n        </div>\n        <div class="card-field"><label>Description</label>\n          <textarea rows="5" data-f="description" ${editable ? '' : 'disabled'}>${esc(meta.description)}</textarea>\n          ${''}\n          ${Pipeline.ageDisclaimer() && !Pipeline.hasAgeDisclaimer(meta.description) ? `<div class="hint age-line" title="Added to the bottom of this description on every site it goes to. Change the wording in Settings → Metadata.">+ ${esc(Pipeline.ageDisclaimer())}</div>` : ''}</div>\n        <div class="card-field"><label>Tags (comma separated)</label>\n          <input type="text" data-f="tags" value="${esc((meta.tags || []).join(', '))}" ${editable ? '' : 'disabled'} /></div>\n        \n        ${c.error ? `<div class="hint err">${esc(c.error)}</div>` : ''}\n        <div class="card-actions">\n          ${c.status === 'qc_error' ? `<button class="btn primary" data-act="retryqc">Retry QC</button>` : ''}\n          ${c.status === 'review' ? `\n            <button class="btn ${hasMeta ? 'primary' : ''}" data-act="approve">Approve</button>\n            <button class="btn danger" data-act="reject">Reject</button>` : ''}\n          ${editable ? `<button class="btn ${hasMeta ? '' : 'primary'}" data-act="writemeta"\n            title="${hasMeta ? 'Write a fresh title, description and tags from this image’s prompt' : 'No metadata yet — write a title, description and tags from this image’s prompt'}"\n            >✎ ${hasMeta ? 'Redo metadata' : 'Write metadata'}</button>` : ''}\n          ${''}\n          ${editable ? `<button class="btn" data-act="enhancemeta"\n            title="Show the finished image to the vision model and write the title, description and tags from what is actually in it — not from the prompt it was asked from. One vision call: slower, and about this picture rather than about the request."\n            >✨ Enhance</button>` : ''}\n          ${c.status === 'review' && !qc ? `<button class="btn" data-act="retryqc" title="Ask the vision model about just this one">Run QC</button>` : ''}\n          ${''}\n          ${c.status === 'approved' && dests.includes('patreon') ? `<button class="btn primary" data-act="sendpatreon">Open in Patreon</button>` : ''}\n          ${Pipeline.awaitingPublish(c) && hasMeta ? `<button class="btn primary" data-act="upload"\n             title="${esc(Pipeline.pendingSites(c).map(s => Pipeline.SITE_LABEL[s]).join(' and '))}">${esc(sendLabel(c))}</button>` : ''}\n          ${c.status === 'approved' ? `<button class="btn ghost" data-act="unapprove">Back to review</button>` : ''}\n          ${''}\n          ${editable ? c.promptSource === 'teaser' || c.teaserId ? `<button class="btn ghost" data-act="unteaser" title="${c.promptSource === 'teaser' ? 'Delete this blurred copy and put the original back on the DeviantArt route' : 'Delete the blurred copy and put this card back on the DeviantArt route'}">◔ Undo teaser</button>` : '' : ''}\n          ${editable ? `<button class="btn" data-act="upscale" title="Send to ImgUpscaler">⤢ ${c.upscaled ? 'Re-upscale' : 'Upscale'}</button>` : ''}\n          ${c.upscaled ? `<button class="btn ghost small" data-act="unupscale" title="Restore the original image">↩</button>` : ''}\n          <button class="btn ghost small" data-act="convertvideo"\n            title="Upload this image to the ComfyUI video workflow — the motion prompt can be written by the model, by you, or both. Takes a few minutes on the GPU.">🎬 ${c.video ? 'Re-make video' : 'Convert to video'}</button>\n          ${c.video ? `<button class="btn ghost small" data-act="makegif" ${gifConversions.has(c) ? 'disabled' : ''}\n            title="Convert this clip to an animated GIF with ffmpeg (12 fps, 480px wide, 256 colours) — for the sites that will not take an MP4. The tick in Settings → Generation does this automatically on every render.">🎞 ${gifConversions.has(c) ? 'Converting…' : c.gif ? 'Re-make GIF' : 'Save as GIF'}</button>` : ''}\n          ${[ 'discarded', 'rejected' ].includes(c.status) ? `<button class="btn ghost" data-act="restore">Restore to review</button>` : ''}\n          ${c.status === 'drafted' && !c.patreon ? `<a href="#" data-open="${esc(c.da && c.da.stashUrl || '')}">Open in Sta.sh ↗</a>` : ''}\n          ${c.status === 'drafted' && c.patreon ? `<span class="hint">posted on Patreon ${esc(fmtTime(c.patreon.at))}</span>` : ''}\n          <button class="btn ghost small" data-act="copyprompt" title="Copy this image's generation prompt to the clipboard">⧉ prompt</button>\n          <button class="btn ghost small" data-act="copyimage" title="Copy the picture itself — paste it anywhere with Ctrl+V">⧉ image</button>\n          <button class="btn ghost" data-act="delete" title="Delete card AND its image file">🗑</button>\n        </div>\n        <div class="card-prompt" title="${esc(c.prompt)}">“${esc(c.prompt)}”</div>\n      </div>\n    </div>`;
  }
  const persistCardField = U.debounce(() => State.persistLibrary({
    quiet: true
  }), 600);
  function wireCard(el, card = State.library.find(c => c.id === el.dataset.id)) {
    if (!card) return;
    const id = card.id;
    el.querySelectorAll('[data-f]').forEach(inp => inp.addEventListener('input', () => {
      card.metadata = card.metadata || {
        title: '',
        description: '',
        tags: []
      };
      if (inp.dataset.f === 'tags') {
        card.metadata.tags = inp.value.split(',').map(t => t.trim()).filter(Boolean);
      } else {
        card.metadata[inp.dataset.f] = inp.value;
      }
      card.updatedAt = Date.now();
      persistCardField();
    }));
    el.querySelector('[data-f="title"]')?.addEventListener('change', e => {
      const wrote = card.metadata && card.metadata.titleWritten;
      const now = String(e.target.value || '').trim();
      if (!wrote || !now || !window.Titles) return;
      if (!Titles.noteRename(wrote, now, card)) return;
      const p = Titles.style;
      State.addLog(`Learned from your rename: "${wrote}" → "${now}".` + (p ? ` The house style now reads ${p.renameCount} of your rewrites.` : ''), 'ok');
      card.metadata.titleWritten = now;
      persistCardField();
      if (typeof renderTitleLab === 'function') renderTitleLab();
    });
    el.querySelector('[data-mature]')?.addEventListener('change', e => {
      card.mature = e.target.checked;
      card.updatedAt = Date.now();
      persistCardField();
    });
    el.querySelector('[data-zoom]')?.addEventListener('click', () => openReviewZoom(card.id));
    el.querySelectorAll('[data-dest]').forEach(btn => btn.addEventListener('click', () => {
      const to = btn.dataset.dest;
      if (!Pipeline.toggleDestination(card, to)) {
        if (Pipeline.destinationsOf(card).length === 1 && Pipeline.goesTo(card, to)) {
          toast('A card has to publish somewhere — tick another site first.', 'err');
        }
        return;
      }
      State.persistLibrary();
      const names = {
        deviantart: 'DeviantArt',
        pixiv: 'pixiv',
        patreon: 'Patreon'
      };
      const now = Pipeline.destinationsOf(card).map(d => names[d]).join(' + ');
      State.addLog(`"${card.metadata?.title || card.fname}" now publishes to ${now}.`);
    }));
    el.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', async () => {
      const act = btn.dataset.act;
      if (act === 'approve') {
        const bare = !Pipeline.hasMetadata(card);
        card.status = 'approved';
        card.updatedAt = Date.now();
        State.persistLibrary();
        State.addLog(`Approved: ${card.metadata?.title || card.fname}`);
        if (bare) {
          toast('Approved — but it has no title yet. Press Write metadata before uploading.', 'err');
        } else if (State.settings.gen.autoUploadApproved && Pipeline.awaitingPublish(card)) {
          const res = await Pipeline.sendEverywhere(card);
          if (res.failed) reportSend(card, res);
        }
      } else if (act === 'reject') {
        card.status = 'rejected';
        card.updatedAt = Date.now();
        State.persistLibrary();
      } else if (act === 'restore') {
        card.status = 'review';
        card.updatedAt = Date.now();
        State.persistLibrary();
      } else if (act === 'unapprove') {
        card.status = 'review';
        card.updatedAt = Date.now();
        State.persistLibrary();
      } else if (act === 'retryqc') {
        btn.disabled = true;
        btn.textContent = 'Inspecting…';
        try {
          await Pipeline.retryQc(card);
          toast(card.status === 'review' ? `QC passed (${card.qc?.score}/10).` : `QC ran — verdict: ${card.qc?.verdict || 'FAIL'}.`, card.status === 'review' ? 'ok' : 'err');
        } catch (e) {
          toast('QC still failing: ' + e.message, 'err');
          btn.disabled = false;
          btn.textContent = 'Retry QC';
        }
      } else if (act === 'writemeta') {
        const label = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Writing…';
        try {
          const meta = await Pipeline.writeCardMetadata(card);
          toast(`Metadata written: “${meta.title}”`, 'ok');
        } catch (e) {
          toast('Could not write metadata: ' + e.message, 'err');
          btn.disabled = false;
          btn.textContent = label;
        }
      } else if (act === 'enhancemeta') {
        const label = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Looking…';
        try {
          const meta = await Pipeline.enhanceCardMetadata(card);
          toast(card.metaFromImage ? `Written from the image: “${meta.title}”` : `The vision model could not write this one — wrote it from the prompt instead: “${meta.title}”`, card.metaFromImage ? 'ok' : 'err');
        } catch (e) {
          toast('Could not write metadata: ' + e.message, 'err');
          btn.disabled = false;
          btn.textContent = label;
        }
      } else if (act === 'retitle') {
        const label = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Thinking…';
        try {
          const before = card.metadata.title;
          const next = await Pipeline.retitleCard(card);
          const input = el.querySelector('[data-f="title"]');
          if (input) input.value = next;
          el.querySelector('[data-titlewarn]')?.remove();
          toast(`“${before}” → “${next}”`, 'ok');
        } catch (e) {
          toast('Could not write a new title: ' + e.message, 'err');
        } finally {
          btn.disabled = false;
          btn.textContent = label;
        }
      } else if (act === 'teaser') {
        openTeaserModal(card);
      } else if (act === 'unteaser') {
        const {original: original} = Teaser.pair(card);
        if (!confirm('Delete the blurred teaser and its image file?\n\n' + (original ? 'The original goes back to the DeviantArt route and its Patreon link is restored.' : 'Its original is no longer in the library, so only the blurred copy is removed.'))) return;
        try {
          await Teaser.undo(card);
          toast(original ? 'Teaser removed — the original is back on DeviantArt.' : 'Teaser removed.', 'ok');
        } catch (e) {
          toast(e.message, 'err');
        }
      } else if (act === 'sendpatreon') {
        await sendToPatreon(card);
      } else if (act === 'pixivforget') {
        if (!confirm('Forget that this card was posted to pixiv?\n\n' + 'Only do this if you deleted the illustration on pixiv. Nothing is deleted here — ' + 'the card simply becomes postable again, and pressing Post would put the picture up.')) return;
        const was = card.pixiv?.url || card.pixiv?.illustId;
        card.pixiv = null;
        card.pixivError = null;
        card.pixivAttempts = 0;
        card.nextPixivRetryAt = null;
        if (card.status === 'drafted' && !card.da && !card.patreon) card.status = 'approved';
        card.updatedAt = Date.now();
        State.persistLibrary();
        State.addLog(`Forgot the pixiv post for "${card.metadata?.title || card.fname}" (${was}).`);
        toast('Card can be posted to pixiv again.', 'ok');
      } else if (act === 'upload') {
        if (Pipeline.pendingSites(card).includes('deviantart') && !await ensureUploadReady()) return;
        const label = btn.textContent;
        btn.disabled = true;
        const res = await Pipeline.sendEverywhere(card, {
          onSite: site => {
            btn.textContent = site === 'pixiv' ? 'Posting to pixiv…' : 'Uploading…';
          }
        });
        reportSend(card, res);
        btn.disabled = false;
        btn.textContent = label;
      } else if (act === 'upscale') {
        if (drive.timer || pendingUpscale && pendingUpscale !== card.id) {
          if (!upscaleQueue.includes(card.id)) upscaleQueue.push(card.id);
          renderUpscaleStrip();
          toast(`Queued for upscaling — ${upscaleQueue.length} waiting behind the one running.`, 'ok');
        } else {
          await sendToUpscaler(card);
        }
      } else if (act === 'unupscale') {
        if (!card.upscaled || !card.upscaled.backup) return toast('No original kept for this card.', 'err');
        const prev = card.fname;
        card.fname = card.upscaled.backup;
        card.path = card.path.replace(/[^\\/]+$/, card.upscaled.backup);
        card.url = `ala://img/${card.upscaled.backup}`;
        const [w, h] = String(card.upscaled.from || '').split('×');
        if (w && h) {
          card.width = Number(w);
          card.height = Number(h);
        }
        card.upscaled = null;
        card.updatedAt = Date.now();
        State.persistLibrary();
        window.ala.files.deleteImage(prev).catch(() => {});
        toast('Original image restored.', 'ok');
      } else if (act === 'copyprompt') {
        await window.ala.clip.text(card.prompt).catch(() => {});
        toast('Prompt copied.', 'ok');
      } else if (act === 'copyimage') {
        try {
          const r = await window.ala.clip.image(card.fname);
          toast(`Image on the clipboard (${r.width}×${r.height}).`, 'ok');
        } catch (e) {
          toast('Could not copy the image: ' + e.message, 'err');
        }
      } else if (act === 'convertvideo') {
        openConvertVideoModal(card);
      } else if (act === 'makegif') {
        await makeCardGif(card);
      } else if (act === 'togglevideo') {
        if (shownVideos.has(card.id)) shownVideos.delete(card.id); else shownVideos.add(card.id);
        renderReview();
      } else if (act === 'delete') {
        if (!confirm('Delete this card AND its image file from disk?\n\nThis cannot be undone. (Reject or Discard keeps the file.)')) return;
        State.library = State.library.filter(c => c.id !== id);
        State.persistLibrary();
        window.ala.files.deleteImage(card.fname).catch(() => {});
        if (card.upscaled && card.upscaled.backup) window.ala.files.deleteImage(card.upscaled.backup).catch(() => {});
        if (card.video) window.ala.comfy.deleteVideo(card.video.fname).catch(() => {});
        if (card.gif) window.ala.comfy.deleteGif(card.gif.fname).catch(() => {});
      }
    }));
    el.querySelectorAll('[data-open]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      if (a.dataset.open) window.ala.app.openExternal(a.dataset.open);
    }));
  }
  function openConvertVideoModal(card) {
    const root = $('#modal-root');
    const comfyCfg = State.settings.comfy || {};
    if (!comfyCfg.videoWorkflow) {
      toast('No video workflow set — pick one in Settings → Generation (Local image generation).', 'err');
      return;
    }
    const mime = /\.jpe?g$/i.test(card.fname) ? 'image/jpeg' : /\.webp$/i.test(card.fname) ? 'image/webp' : 'image/png';
    root.innerHTML = `<div class="modal-backdrop"><div class="panel teaser-panel">\n      <div class="panel-head">\n        <h2>Convert to video — “${esc(card.metadata && card.metadata.title || card.fname)}”</h2>\n        <button class="btn ghost small" data-close>✕</button>\n      </div>\n      <div class="teaser-body">\n        <div class="teaser-preview"><img src="${esc(card.url)}" style="max-height:100%;object-fit:contain" /></div>\n        <div class="teaser-controls">\n          <label class="teaser-field">Motion prompt mode\n            <select id="cv-mode">\n              <option value="auto" selected>Auto — the model looks at the image and writes it</option>\n              <option value="hybrid">Hybrid — my words, built around by the model</option>\n              <option value="custom">Custom — my prompt, sent as-is</option>\n            </select></label>\n          <label class="teaser-field" id="cv-user-wrap" style="display:none">Your prompt <em>(kept verbatim in Hybrid mode)</em>\n            <textarea rows="4" id="cv-user" placeholder="e.g. slow dolly in, her hair drifting, the lanterns flickering"></textarea></label>\n          <label class="teaser-field">Length <em>(seconds, default 10; the model snaps it to its frame grid)</em>\n            <input type="number" id="cv-seconds" min="1" step="1" value="10" /></label>\n          <label class="teaser-field">Final prompt <em>(editable — this is exactly what gets sent)</em>\n            <textarea rows="5" id="cv-final" placeholder="(the written prompt appears here before anything renders)"></textarea></label>\n          <div id="cv-status" class="hint"></div>\n          <div class="btn-row">\n            <button class="btn primary" id="cv-write">Write prompt</button>\n            <button class="btn" id="cv-render" disabled>Render video…</button>\n            <button class="btn ghost" data-close>Cancel</button>\n          </div>\n        </div>\n      </div>\n    </div></div>`;
    const backdrop = root.querySelector('.modal-backdrop');
    const close = () => {
      if (root.querySelector('.modal-backdrop') === backdrop) root.innerHTML = '';
    };
    root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    backdrop.addEventListener('click', e => {
      if (e.target.classList.contains('modal-backdrop')) close();
    });
    const modeSel = $('#cv-mode');
    const userWrap = $('#cv-user-wrap');
    const finalBox = $('#cv-final');
    const status = $('#cv-status');
    const renderBtn = $('#cv-render');
    const writeBtn = $('#cv-write');
    const userBox = $('#cv-user');
    const secondsBox = $('#cv-seconds');
    const seconds = () => {
      const n = Number(secondsBox && secondsBox.value);
      return n > 0 ? n : null;
    };
    let busy = false;
    const updateControls = () => {
      writeBtn.disabled = modeSel.disabled = userBox.disabled = finalBox.disabled = busy;
      renderBtn.disabled = busy || !finalBox.value.trim();
    };
    finalBox.addEventListener('input', updateControls);
    let base64 = null;
    modeSel.addEventListener('change', () => {
      userWrap.style.display = modeSel.value === 'auto' ? 'none' : '';
    });
    writeBtn.addEventListener('click', async () => {
      if (busy) return;
      const mode = modeSel.value;
      const userText = userBox.value.trim();
      busy = true;
      updateControls();
      status.textContent = mode === 'custom' ? '' : 'Asking the models…';
      status.className = 'hint';
      try {
        if (!base64) base64 = await window.ala.files.readImageBase64(card.fname);
        let prompt;
        if (mode === 'custom') {
          prompt = userText;
          if (!prompt) throw new Error('type a prompt first');
        } else {
          const r = await window.ComfyUI.writeVideoPrompt({
            base64: base64,
            mime: mime,
            userText: userText,
            mode: mode,
            seconds: seconds()
          });
          prompt = r.prompt;
        }
        finalBox.value = prompt;
        renderBtn.disabled = false;
        status.textContent = 'Prompt ready — review or edit it before rendering.';
      } catch (e) {
        status.textContent = 'Could not write the prompt: ' + e.message;
        status.className = 'hint err';
      } finally {
        busy = false;
        updateControls();
      }
    });
    renderBtn.addEventListener('click', async () => {
      if (busy) return;
      const prompt = finalBox.value.trim();
      if (!prompt) return toast('The prompt box is empty.', 'err');
      busy = true;
      updateControls();
      status.textContent = 'Rendering — this takes a few minutes on the GPU. The tab stays responsive; the card updates when it is done.';
      status.className = 'hint';
      try {
        if (!base64) base64 = await window.ala.files.readImageBase64(card.fname);
        const d = new window.ComfyDriver(State.settings);
        const res = await d.convertToVideo({
          base64: base64,
          mime: mime,
          prompt: prompt,
          seconds: seconds(),
          log: m => State.addLog(m, 'comfy')
        });
        if (card.video) window.ala.comfy.deleteVideo(card.video.fname).catch(() => {});
        if (card.gif) window.ala.comfy.deleteGif(card.gif.fname).catch(() => {});
        card.video = {
          url: res.url,
          fname: res.fname,
          prompt: prompt,
          at: Date.now()
        };
        card.gif = res.gif ? {
          url: res.gif.url,
          fname: res.gif.fname,
          size: res.gif.size,
          at: Date.now()
        } : null;
        card.updatedAt = Date.now();
        State.persistLibrary();
        close();
        renderReview();
        toast(`Video ready — ${(res.size / 1048576).toFixed(1)} MB on the card${res.gif ? ` + GIF (${(res.gif.size / 1048576).toFixed(1)} MB)` : ''}.`, 'ok');
      } catch (e) {
        status.textContent = 'Render failed: ' + e.message;
        status.className = 'hint err';
      } finally {
        busy = false;
        updateControls();
      }
    });
  }
  const gifConversions = new WeakSet;
  const shownVideos = new Set;
  async function makeCardGif(card, opts = {}) {
    if (gifConversions.has(card)) return;
    if (!card.video) return toast('This card has no video yet — render one first.', 'err');
    const sourceVideo = card.video;
    gifConversions.add(card);
    try {
      renderReview();
      const gif = await window.ala.comfy.videoToGif({
        ...opts,
        fname: sourceVideo.fname,
        nameHint: 'i2v'
      });
      if (card.video !== sourceVideo || !State.library.includes(card)) {
        if (gif.fname !== card.gif?.fname) window.ala.comfy.deleteGif(gif.fname).catch(() => {});
        return;
      }
      if (card.gif && card.gif.fname !== gif.fname) window.ala.comfy.deleteGif(card.gif.fname).catch(() => {});
      card.gif = {
        url: gif.url,
        fname: gif.fname,
        size: gif.size,
        at: Date.now()
      };
      card.updatedAt = Date.now();
      State.persistLibrary();
      toast(`GIF ready — ${(gif.size / 1048576).toFixed(1)} MB (${gif.fname}).`, 'ok');
    } catch (e) {
      toast('Could not make the GIF: ' + e.message, 'err');
    } finally {
      gifConversions.delete(card);
      renderReview();
    }
  }
  function openTeaserModal(card) {
    const root = $('#modal-root');
    const o = {
      ...Teaser.settings()
    };
    const link = String((State.settings.patreon || {}).link || '');
    root.innerHTML = `<div class="modal-backdrop"><div class="panel teaser-panel">\n      <div class="panel-head">\n        <h2>Teaser for “${esc(card.metadata && card.metadata.title || card.fname)}”</h2>\n        <button class="btn ghost small" data-close>✕</button>\n      </div>\n      <div class="teaser-body">\n        <div class="teaser-preview"><canvas id="teaser-canvas"></canvas></div>\n        <div class="teaser-controls">\n          <label class="teaser-row">Blur\n            <input type="range" id="ts-blur" min="4" max="80" step="1" value="${o.blur}" />\n            <output id="ts-blur-out">${o.blur}</output></label>\n          <label class="teaser-row">Darken\n            <input type="range" id="ts-dark" min="0" max="0.7" step="0.05" value="${o.darken}" />\n            <output id="ts-dark-out">${Math.round(o.darken * 100)}%</output></label>\n          <label class="teaser-field">Caption\n            <input type="text" id="ts-badge" value="${esc(o.badge)}" maxlength="60" /></label>\n          <label class="teaser-field">Caption position\n            <select id="ts-band">\n              <option value="middle" ${o.band === 'middle' ? 'selected' : ''}>Middle</option>\n              <option value="bottom" ${o.band === 'bottom' ? 'selected' : ''}>Bottom</option>\n              <option value="none" ${o.band === 'none' ? 'selected' : ''}>No caption</option>\n            </select></label>\n          <label class="checkbox-row"><input type="checkbox" id="ts-link" ${o.showLink ? 'checked' : ''} />\n            <span>Print the Patreon link${link ? '' : ' (none set in Settings)'}</span></label>\n          <p class="hint">The blurred copy becomes a new card headed for <b>DeviantArt</b>, with the\n            Patreon link and CTA already in its description. This original flips to <b>Patreon</b>,\n            where its description is stripped of both. Nothing is uploaded — both halves land in\n            Review for you to approve.</p>\n          <div class="btn-row">\n            <button class="btn primary" id="ts-make">Make the pair</button>\n            <button class="btn ghost" data-close>Cancel</button>\n          </div>\n        </div>\n      </div>\n    </div></div>`;
    const close = () => {
      root.innerHTML = '';
    };
    root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    root.querySelector('.modal-backdrop').addEventListener('click', e => {
      if (e.target.classList.contains('modal-backdrop')) close();
    });
    const canvas = $('#teaser-canvas');
    const read = () => ({
      blur: Number($('#ts-blur').value),
      darken: Number($('#ts-dark').value),
      badge: $('#ts-badge').value,
      band: $('#ts-band').value,
      showLink: $('#ts-link').checked,
      format: o.format
    });
    const previewScale = Math.min(1, 520 / Math.max(card.width || 1024, card.height || 1024));
    const draw = U.debounce(async () => {
      try {
        await Teaser.render(card, read(), {
          scale: previewScale,
          canvas: canvas
        });
      } catch (e) {
        toast('Preview failed: ' + e.message, 'err');
      }
    }, 90);
    $('#ts-blur').addEventListener('input', e => {
      $('#ts-blur-out').textContent = e.target.value;
      draw();
    });
    $('#ts-dark').addEventListener('input', e => {
      $('#ts-dark-out').textContent = `${Math.round(Number(e.target.value) * 100)}%`;
      draw();
    });
    $('#ts-badge').addEventListener('input', draw);
    $('#ts-band').addEventListener('change', draw);
    $('#ts-link').addEventListener('change', draw);
    draw();
    $('#ts-make').addEventListener('click', async ev => {
      const btn = ev.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Rendering…';
      try {
        const opts = read();
        await Teaser.saveSettings(opts);
        const {teaser: teaser} = await Teaser.make(card, opts);
        close();
        toast(`Teaser made — “${teaser.metadata.title || 'untitled'}” is in Review for DeviantArt, ` + 'and the original is queued for Patreon.', 'ok');
      } catch (e) {
        toast('Could not make the teaser: ' + e.message, 'err');
        btn.disabled = false;
        btn.textContent = 'Make the pair';
      }
    });
  }
  function wireDrafts() {
    $('#btn-da-connect').addEventListener('click', connectDa);
    $('#btn-da-open-login').addEventListener('click', () => {
      switchTab('deviantart');
      wvDa.loadURL('https://www.deviantart.com/users/login');
    });
    $('#btn-da-logout').addEventListener('click', async () => {
      await window.ala.da.logout();
      refreshDaStatus();
      toast('API tokens cleared. The browser session is untouched.', 'ok');
    });
    $('#btn-da-whoami').addEventListener('click', async () => {
      const method = State.settings.da.uploadMethod || 'session';
      if (method === 'session') {
        const st = await window.ala.daweb.status();
        toast(st.ok ? `Session OK — signed in as @${st.username}.` : 'Session not usable: ' + st.error, st.ok ? 'ok' : 'err');
        return refreshDaStatus();
      }
      try {
        const me = await window.ala.da.whoami();
        if (me && me.error === 'not_authenticated') {
          toast('API not connected — click “Connect API (OAuth)”. That needs a published DeviantArt app.', 'err');
        } else {
          toast(me.username ? `API authenticated as @${me.username}` : 'Token present but whoami failed: ' + JSON.stringify(me).slice(0, 120), me.username ? 'ok' : 'err');
        }
        refreshDaStatus();
      } catch (e) {
        toast('whoami failed: ' + e.message, 'err');
      }
    });
    $('#btn-upload-all').addEventListener('click', uploadAllApproved);
    $('#set-auto-publish').addEventListener('change', async e => {
      State.settings = await window.ala.settings.patch({
        da: {
          autoPublish: e.target.checked
        }
      });
      renderDrafts();
      toast(e.target.checked ? 'Uploads will be submitted to DeviantArt automatically.' : 'Uploads will stop at a Sta.sh draft — submit them yourself.', 'ok');
    });
    $('#btn-refresh-stash').addEventListener('click', refreshStashState);
    $('#btn-open-stash').addEventListener('click', () => window.ala.app.openExternal('https://www.deviantart.com/stash'));
    $('#btn-discard-rejected').addEventListener('click', () => {
      const rejected = State.library.filter(c => c.status === 'upload_failed');
      if (!rejected.length) return;
      if (!confirm(`Discard all ${rejected.length} card(s) DeviantArt rejected? The local images stay in your library folder.`)) return;
      rejected.forEach(c => {
        c.status = 'discarded';
        c.updatedAt = Date.now();
      });
      State.persistLibrary();
      toast(`Discarded ${rejected.length} rejected card(s).`, 'ok');
    });
    setInterval(() => {
      if (!$('#pane-drafts').classList.contains('active')) return;
      if (State.library.some(c => c.nextRetryAt || c.nextPixivRetryAt)) renderDrafts();
    }, 15e3);
    let retrySweepBusy = false;
    setInterval(async () => {
      if (retrySweepBusy) return;
      const now = Date.now();
      const ready = c => Pipeline.awaitingPublish(c) && Pipeline.hasMetadata(c);
      const signedInDa = daReady.method === 'api' ? daReady.api.authenticated : daReady.session.ok;
      const dueDa = signedInDa && State.library.find(c => ready(c) && Pipeline.pendingSites(c).includes('deviantart') && (c.uploadAttempts || 0) > 0 && c.nextRetryAt && c.nextRetryAt <= now);
      const duePixiv = !dueDa && State.library.find(c => ready(c) && Pipeline.pendingSites(c).includes('pixiv') && (c.pixivAttempts || 0) > 0 && c.nextPixivRetryAt && c.nextPixivRetryAt <= now);
      if (!dueDa && !duePixiv) return;
      retrySweepBusy = true;
      try {
        if (dueDa) {
          State.addLog(`Cooldown over — retrying upload (attempt ${(dueDa.uploadAttempts || 0) + 1}): ${dueDa.metadata?.title || dueDa.fname}`);
          await Pipeline.uploadCard(dueDa).catch(() => {});
        } else {
          State.addLog(`Cooldown over — retrying pixiv (attempt ${(duePixiv.pixivAttempts || 0) + 1}): ${duePixiv.metadata?.title || duePixiv.fname}`);
          await Pipeline.postCardToPixiv(duePixiv).catch(() => {});
        }
      } finally {
        retrySweepBusy = false;
      }
    }, 2e4);
    let harvestBusy = false;
    const bootedAt = Date.now();
    setInterval(async () => {
      if (harvestBusy) return;
      const staged = Pipeline.pixivStaged();
      if (!staged) return;
      const prep = staged.pixivPrep;
      const stale = (prep.at || 0) < bootedAt;
      if (!stale && Date.now() - (prep.at || 0) > 36e5) {
        Pipeline.clearPixivPrep(staged, 'not posted within the hour');
        return;
      }
      harvestBusy = true;
      try {
        const found = await checkStagedPixiv(staged);
        if (found) notifyIfAway('AiLabor — posted to pixiv', staged.metadata?.title || staged.fname); else if (stale) Pipeline.clearPixivPrep(staged, 'the app restarted, so the form is no longer filled in');
      } catch {} finally {
        harvestBusy = false;
      }
    }, 15e3);
  }
  async function ensureUploadReady() {
    await refreshDaStatus();
    const ok = daReady.method === 'api' ? daReady.api.authenticated : daReady.session.ok;
    if (!ok) {
      toast(daReady.method === 'api' ? 'API method selected but not connected. Switch to Session in Settings, or publish your DeviantArt app.' : 'Not signed in to DeviantArt — open the DeviantArt tab and log in.', 'err');
    }
    return ok;
  }
  const publishQueue = () => State.library.filter(c => Pipeline.awaitingPublish(c));
  function needsHumanPost(c) {
    return !!(c && Pipeline.pixivNeedsHuman(c) && Pipeline.pendingSites(c).includes('pixiv'));
  }
  function sendLabel(card) {
    const pending = Pipeline.pendingSites(card).filter(s => !(s === 'pixiv' && needsHumanPost(card)));
    if (!pending.length) return 'Done';
    if (pending.length > 1) return autoPublishOn() ? 'Publish to both' : 'Upload to both';
    if (pending[0] === 'pixiv') return 'Post to pixiv';
    return autoPublishOn() ? 'Upload + submit' : 'Upload draft';
  }
  async function preparePixiv(card, btn) {
    const label = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Opening pixiv…';
    }
    try {
      const res = await Pipeline.prepareCardOnPixiv(card);
      if (!res.ok) {
        toast('Could not stage it on pixiv: ' + res.error, 'err');
        return;
      }
      switchTab('pixiv');
      if (res.critical?.length) {
        toast(`Form filled, but set the ${res.critical.join(' and ')} yourself before posting — ` + 'the app could not.', 'err');
      } else if (res.missed?.length) {
        toast(`Ready on pixiv — check the ${res.missed.join(', ')}, then press Post.`, 'err');
      } else {
        toast('Ready on pixiv — check it over and press Post.', 'ok');
      }
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = label;
      }
    }
  }
  async function checkStagedPixiv(card, {loud: loud = false} = {}) {
    const res = await Pipeline.harvestPixiv(card).catch(e => ({
      ok: false,
      error: e.message
    }));
    if (res.found) {
      toast(`Found it on pixiv — "${card.metadata?.title || card.fname}" is posted.`, 'ok');
      return true;
    }
    if (loud) {
      toast(res.ok ? 'Nothing new on your pixiv account yet — press Post on the Pixiv tab, then check again.' : 'Could not read your pixiv works: ' + (res.error || 'unknown'), 'err');
    }
    return false;
  }
  async function uploadAllApproved() {
    const queue = publishQueue().filter(c => Pipeline.hasMetadata(c));
    const needsDa = queue.some(c => Pipeline.pendingSites(c).includes('deviantart'));
    if (needsDa && !await ensureUploadReady()) return;
    const now = Date.now();
    const bare = publishQueue().length - queue.length;
    const ready = queue.filter(c => Pipeline.pendingSites(c).some(s => !((s === 'deviantart' ? c.nextRetryAt : c.nextPixivRetryAt) > now)));
    const waiting = queue.length - ready.length;
    if (!ready.length) {
      return toast(waiting ? `${waiting} card(s) are on a retry cooldown — try again shortly.` : bare ? `${bare} approved card(s) have no title yet — write metadata for them in Review first.` : 'Nothing approved to upload.', 'err');
    }
    if (ready.length >= 10 && !confirm(`Upload ${ready.length} approved card(s) now?` + (autoPublishOn() && ready.some(c => Pipeline.pendingSites(c).includes('deviantart')) ? '\n\nSubmit after upload is ON — the DeviantArt ones go live, not just to Sta.sh.' : '') + '\n\nCancel to leave them in Approved.')) return;
    const tally = {
      da: 0,
      live: 0,
      notSubmitted: 0,
      pixiv: 0,
      rejected: 0,
      retrying: 0,
      needsYou: 0
    };
    let lostSite = null;
    let pixivWantsHuman = false;
    for (const card of ready) {
      if (pixivWantsHuman && Pipeline.pendingSites(card).includes('pixiv')) {
        Pipeline.applyPixivResult(card, {
          ok: false,
          kind: 'manual',
          error: window.Pixiv.HUMAN_CHECK_MSG
        });
        tally.needsYou++;
      }
      const res = await Pipeline.sendEverywhere(card, {
        skip: pixivWantsHuman ? [ 'pixiv' ] : []
      });
      const da = res.results.deviantart;
      const px = res.results.pixiv;
      if (da) {
        if (da.ok) {
          tally.da++;
          if (da.published) tally.live++; else if (da.publishError) tally.notSubmitted++;
        } else if (da.kind === 'auth') lostSite = 'deviantart'; else if (card.status === 'upload_failed') tally.rejected++; else tally.retrying++;
      }
      if (px) {
        if (card.pixiv && card.pixiv.illustId) tally.pixiv++; else if (card.pixivError?.kind === 'auth') lostSite = lostSite || 'pixiv'; else if (card.pixivError?.kind === 'manual') {
          tally.needsYou++;
          pixivWantsHuman = true;
        } else if (card.pixivError?.kind === 'transient') tally.retrying++; else if (card.pixivError?.kind !== 'pending') tally.rejected++;
      }
      if (lostSite) {
        const done = lostSite === 'deviantart' ? tally.da : tally.pixiv;
        toast(`Signed out of ${Pipeline.SITE_LABEL[lostSite]} — stopped after ${done}. ` + `Open the ${Pipeline.SITE_LABEL[lostSite]} tab and log in.`, 'err');
        if (lostSite === 'deviantart') refreshDaStatus(); else PixivUI.refreshStatus();
        return;
      }
      await U.sleep(res.sites.includes('pixiv') ? 5e3 : 1500);
    }
    const parts = [];
    if (tally.live) parts.push(`${tally.live} published on DeviantArt`);
    if (tally.da > tally.live) parts.push(`${tally.da - tally.live} DeviantArt draft(s)`);
    if (tally.pixiv) parts.push(`${tally.pixiv} posted to pixiv`);
    if (!parts.length) parts.push('nothing landed');
    if (tally.notSubmitted) parts.push(`${tally.notSubmitted} uploaded but not submitted`);
    if (tally.needsYou) parts.push(`${tally.needsYou} waiting for you on pixiv`);
    if (tally.rejected) parts.push(`${tally.rejected} rejected`);
    if (tally.retrying) parts.push(`${tally.retrying} will retry`);
    if (waiting) parts.push(`${waiting} on cooldown`);
    if (bare) parts.push(`${bare} skipped for having no metadata`);
    const bad = tally.rejected || tally.retrying || tally.notSubmitted;
    toast(`Publish pass complete — ${parts.join(', ')}.`, bad ? 'err' : 'ok');
    notifyIfAway('AiLabor — publish pass complete', parts.join(', ') + '.');
  }
  function reportSend(card, res) {
    const good = [];
    const bad = [];
    for (const site of res.sites) {
      const label = Pipeline.SITE_LABEL[site];
      if (site === 'deviantart') {
        const r = res.results.deviantart;
        if (r && r.ok) good.push(r.published ? `published on ${label}` : `${label} draft created`); else bad.push(`${label}: ${r && (r.error || r.publishError) || 'failed'}`);
        if (r && r.ok && r.publishError) bad.push(`${label} submit: ${r.publishError} (the draft is safe)`);
      } else {
        if (card.pixiv && card.pixiv.illustId) good.push(`posted to ${label}`); else if (card.pixivError?.kind === 'manual') bad.push(`${label} wants your click — press Prepare on pixiv`); else bad.push(`${label}: ${card.pixivError?.message || 'failed'}`);
      }
    }
    if (!bad.length) return toast(good.join(' · ') + '.', 'ok');
    toast((good.length ? good.join(' · ') + ' — but ' : '') + bad.join(' · '), 'err');
  }
  function notifyIfAway(title, body) {
    try {
      if (document.hasFocus()) return;
      window.ala.app.notify(title, body).catch(() => {});
    } catch {}
  }
  function cooldownText(c) {
    const left = Math.max((c.nextRetryAt || 0) - Date.now(), (c.nextPixivRetryAt || 0) - Date.now());
    if (left <= 0) return '';
    return left >= 6e4 ? `retry in ${Math.ceil(left / 6e4)}m` : `retry in ${Math.ceil(left / 1e3)}s`;
  }
  function siteChips(c) {
    return Pipeline.destinationsOf(c).filter(d => Pipeline.PUBLIC_SITES.includes(d)).map(site => {
      const label = Pipeline.SITE_LABEL[site];
      if (site === 'deviantart') {
        if (c.da && c.da.published) return `<span class="site-chip ok" title="live on DeviantArt">✦ ${label} · published</span>`;
        if (c.da && c.da.itemid) return `<span class="site-chip ok" title="draft in Sta.sh">✦ ${label} · draft</span>`;
        if (c.uploadError) return `<span class="site-chip bad" title="${esc(c.uploadError.message)}">✦ ${label} · failed</span>`;
        return `<span class="site-chip">✦ ${label} · waiting</span>`;
      }
      if (c.pixiv && c.pixiv.illustId) return `<span class="site-chip ok px-only" title="posted to pixiv">✿ ${label} · posted</span>`;
      if (c.pixivPrep) {
        return `<span class="site-chip px-only" title="the upload form is filled in on the Pixiv tab — press Post there">✿ ${label} · ready to post</span>`;
      }
      if (Pipeline.pixivNeedsHuman(c)) {
        return `<span class="site-chip px-only" title="${esc(c.pixivError?.message || 'pixiv wants a human check for this post')}">✿ ${label} · needs your click</span>`;
      }
      if (c.pixivError) {
        return `<span class="site-chip px-only ${c.pixivError.kind === 'pending' ? '' : 'bad'}" title="${esc(c.pixivError.message)}">✿ ${label} · ${c.pixivError.kind === 'pending' ? 'processing' : 'failed'}</span>`;
      }
      return `<span class="site-chip px-only">✿ ${label} · waiting</span>`;
    }).join('');
  }
  function autoPublishOn() {
    return (State.settings.da.uploadMethod || 'session') === 'session' && State.settings.da.autoPublish !== false;
  }
  function renderDrafts() {
    const auto = autoPublishOn();
    const chk = $('#set-auto-publish');
    if (chk) {
      chk.checked = State.settings.da.autoPublish !== false;
      chk.disabled = (State.settings.da.uploadMethod || 'session') !== 'session';
    }
    const upLabel = $('#auto-publish-note');
    if (upLabel) {
      upLabel.textContent = chk && chk.disabled ? 'The API upload method cannot publish — it only reaches Sta.sh.' : auto ? 'Uploads go live on DeviantArt straight away. Untick to leave them as drafts.' : 'Uploads stop at a Sta.sh draft — submit each one from the list below.';
      upLabel.className = 'hint' + (auto ? ' ok' : '');
    }
    const btnAll = $('#btn-upload-all');
    if (btnAll) btnAll.textContent = auto ? 'Publish all approved' : 'Upload all approved';
    const ready = publishQueue();
    const forPatreon = State.library.filter(c => c.status === 'approved' && destFor(c) === 'patreon');
    const done = State.library.filter(c => c.status === 'drafted' && !c.patreon && (c.da || c.pixiv) && !Pipeline.pendingSites(c).length);
    const rejected = State.library.filter(c => c.status === 'upload_failed');
    const patLine = $('#drafts-patreon-note');
    if (patLine) {
      patLine.hidden = !forPatreon.length;
      patLine.innerHTML = forPatreon.length ? `<b>${forPatreon.length}</b> approved card(s) are set to publish on <b>Patreon</b>, so they are not\n           in this queue and “Upload all approved” will not touch them.\n           <button class="btn small" id="btn-goto-patreon">Open the Patreon tab →</button>` : '';
      const go = $('#btn-goto-patreon');
      if (go) go.addEventListener('click', () => switchTab('patreon'));
    }
    $('#drafts-ready').innerHTML = ready.length ? ready.map(c => {
      const wait = cooldownText(c);
      const attempts = c.uploadAttempts || 0;
      const bare = !Pipeline.hasMetadata(c);
      const pxErr = c.pixivError && !(c.pixiv && c.pixiv.illustId) ? c.pixivError : null;
      const human = needsHumanPost(c);
      const prep = c.pixivPrep;
      const autoLeft = Pipeline.pendingSites(c).filter(s => !(s === 'pixiv' && human)).length;
      return `\n      <div class="draft-row" data-id="${c.id}">\n        <img src="${c.url}" alt="" />\n        <div class="d-info">\n          <div class="d-title">${esc(c.metadata?.title || 'Untitled')}</div>\n          <div class="d-sites">${siteChips(c)}</div>\n          <div class="d-sub">${esc((c.metadata?.tags || []).map(t => '#' + t).join(' '))}</div>\n          ${bare ? `<div class="hint err">No title, description or tags yet — neither site will take it.\n            Press <b>Write metadata</b> on this card in Review.</div>` : ''}\n          ${c.error ? `<div class="hint err">DeviantArt, last attempt${attempts ? ` (${attempts})` : ''}: ${esc(c.error)}${wait ? ` — ${esc(wait)}` : ''}</div>` : ''}\n          ${pxErr && !prep && !human ? `<div class="hint px-only ${pxErr.kind === 'pending' ? '' : 'err'}">pixiv${pxErr.kind === 'pending' ? '' : `, last attempt${c.pixivAttempts ? ` (${c.pixivAttempts})` : ''}`}: ${esc(pxErr.message)}</div>` : ''}\n          ${!prep && human ? `<div class="hint px-only">pixiv: ${esc(window.Pixiv.HUMAN_CHECK_MSG)}</div>` : ''}\n          ${prep ? `<div class="hint ok px-only">Filled in on the Pixiv tab${prep.filled?.length ? ` (${esc(prep.filled.join(', '))})` : ''} —\n            <b>press Post there</b>. This row updates itself once it is up.</div>` : ''}\n          ${prep?.missed?.length ? `<div class="hint px-only ${prep.critical?.length ? 'err' : ''}">Set ${esc(prep.missed.join(', '))} by hand\n            before posting${prep.critical?.length ? ' — this matters, pixiv requires it' : ''}.</div>` : ''}\n        </div>\n        <div class="d-actions">${bare ? `<button class="btn small" data-fixmeta="${c.id}">Write metadata →</button>` : `${autoLeft ? `<button class="btn primary small" data-up="${c.id}" ${wait ? 'disabled' : ''}>${wait ? esc(wait) : esc(sendLabel(c))}</button>` : ''}\n           ${prep ? `<span class="px-only"><button class="btn ${autoLeft ? '' : 'primary'} small" data-pxgo="${c.id}">Open the Pixiv tab →</button>\n               <button class="btn small" data-pxcheck="${c.id}">Posted it — check</button>\n               <button class="btn ghost small" data-pxcancel="${c.id}" title="Stop waiting for a manual post. Nothing is deleted on pixiv.">Cancel</button></span>` : human ? `<button class="btn ${autoLeft ? '' : 'primary'} small px-only" data-pxprep="${c.id}"\n                   title="Opens pixiv's upload page with this picture and all its metadata filled in. You press Post.">Prepare on pixiv</button>` : ''}`}</div>\n      </div>`;
    }).join('') : `<div class="hint">No approved art waiting. Approve cards in the Review tab.</div>`;
    $('#panel-rejected').hidden = !rejected.length;
    $('#rejected-count').textContent = rejected.length ? `· ${rejected.length}` : '';
    $('#drafts-rejected').innerHTML = rejected.map(c => `\n      <div class="draft-row" data-id="${c.id}">\n        <img src="${c.url}" alt="" />\n        <div class="d-info">\n          <div class="d-title">${esc(c.metadata?.title || 'Untitled')}</div>\n          <div class="d-sub">DeviantArt said: <b>${esc(c.uploadError?.message || c.error || 'rejected')}</b></div>\n          <div class="hint">${esc(c.uploadError?.stage ? `failed at the ${c.uploadError.stage} step` : '')}${c.uploadError?.at ? ` · ${fmtTime(c.uploadError.at)}` : ''}</div>\n        </div>\n        <div class="d-actions">\n          <button class="btn primary small" data-retryup="${c.id}">Retry upload</button>\n          <button class="btn small" data-backtoreview="${c.id}">Back to review</button>\n          <button class="btn danger small" data-rejdiscard="${c.id}">Discard</button>\n        </div>\n      </div>`).join('');
    $('#drafts-done').innerHTML = done.length ? done.map(c => {
      const live = !!c.da?.published;
      const perr = c.da?.publishError;
      const when = c.da ? live ? 'submitted ' + fmtTime(c.da.publishedAt || c.updatedAt) : 'uploaded ' + fmtTime(c.updatedAt) : c.pixiv ? 'posted ' + fmtTime(c.pixiv.at) : '';
      return `\n      <div class="draft-row" data-id="${c.id}">\n        <img src="${c.url}" alt="" />\n        <div class="d-info">\n          <div class="d-title">${live ? '<b class="ok">Published</b> · ' : ''}${esc(c.metadata?.title || 'Untitled')}</div>\n          <div class="d-sites">${siteChips(c)}</div>\n          <div class="d-sub">${c.da ? 'item ' + esc(c.da.itemid || '') + ' · ' : ''}${esc(when)}${c.da?.method ? ' · ' + esc(c.da.method) : ''}${c.da?.missing ? ' · not on DeviantArt' : ''}</div>\n          ${c.da?.partial ? `<div class="hint err">Image is in Sta.sh but metadata failed: ${esc(c.error || '')} — fix it on DeviantArt.</div>` : ''}\n          ${perr ? `<div class="hint err">Uploaded, but DeviantArt refused the submit: ${esc(perr.message)} — the draft is still in Sta.sh, so submit it again rather than re-uploading.</div>` : ''}\n          ${c.da?.missing ? `<div class="hint err">This draft is no longer in Sta.sh (deleted or submitted outside this app).</div>` : ''}\n        </div>\n        <div class="d-actions">\n          ${c.da ? `<button class="btn small" data-stash="${esc(live && c.da?.url || c.da?.stashUrl || 'https://www.deviantart.com/stash')}">${live ? 'Open deviation ↗' : 'Open ↗'}</button>` : ''}\n          ${c.pixiv?.url ? `<button class="btn small px-only" data-stash="${esc(c.pixiv.url)}">Open on pixiv ↗</button>` : ''}\n          ${c.da?.partial ? `<button class="btn primary small" data-retrymeta="${c.id}">Retry metadata</button>` : ''}\n          ${!live && c.da?.deviationId && !c.da?.missing ? `<button class="btn primary small" data-publish="${c.id}">${perr ? 'Submit again' : 'Submit to DeviantArt'}</button>` : ''}\n          ${!live && c.da?.deviationId && !c.da?.missing ? `<button class="btn danger small" data-deldraft="${c.id}">Delete draft</button>` : ''}\n          ${c.da?.missing ? `<button class="btn small" data-requeue="${c.id}">Back to approved</button>` : ''}\n        </div>\n      </div>`;
    }).join('') : `<div class="hint">Nothing published yet. Approve cards in Review, then upload.</div>`;
    $$('#drafts-ready [data-up]').forEach(b => b.addEventListener('click', async () => {
      const card = State.library.find(c => c.id === b.dataset.up);
      if (!card) return;
      if (Pipeline.pendingSites(card).includes('deviantart') && !await ensureUploadReady()) return;
      b.disabled = true;
      const label = b.textContent;
      const res = await Pipeline.sendEverywhere(card, {
        onSite: site => {
          b.textContent = site === 'pixiv' ? 'Posting to pixiv…' : 'Uploading…';
        }
      });
      reportSend(card, res);
      b.disabled = false;
      b.textContent = label;
    }));
    $$('#drafts-ready [data-pxprep]').forEach(b => b.addEventListener('click', async () => {
      const card = State.library.find(c => c.id === b.dataset.pxprep);
      if (card) await preparePixiv(card, b);
    }));
    $$('#drafts-ready [data-pxgo]').forEach(b => b.addEventListener('click', () => switchTab('pixiv')));
    $$('#drafts-ready [data-pxcheck]').forEach(b => b.addEventListener('click', async () => {
      const card = State.library.find(c => c.id === b.dataset.pxcheck);
      if (!card) return;
      b.disabled = true;
      const label = b.textContent;
      b.textContent = 'Checking…';
      await checkStagedPixiv(card, {
        loud: true
      });
      b.disabled = false;
      b.textContent = label;
    }));
    $$('#drafts-ready [data-pxcancel]').forEach(b => b.addEventListener('click', () => {
      const card = State.library.find(c => c.id === b.dataset.pxcancel);
      if (!card) return;
      Pipeline.clearPixivPrep(card, 'cancelled');
      toast('Stopped waiting. Nothing was changed on pixiv.', 'ok');
    }));
    $$('#drafts-ready [data-fixmeta]').forEach(b => b.addEventListener('click', () => {
      showReviewCard(b.dataset.fixmeta);
    }));
    $$('#drafts-done [data-publish]').forEach(b => b.addEventListener('click', async () => {
      const card = State.library.find(c => c.id === b.dataset.publish);
      if (!card) return;
      b.disabled = true;
      b.textContent = 'Submitting…';
      const res = await Pipeline.publishCard(card).catch(e => ({
        ok: false,
        error: e.message
      }));
      toast(res && res.ok ? 'Submitted — it is live on DeviantArt.' : 'Submit failed: ' + (res && res.error), res && res.ok ? 'ok' : 'err');
      if (!res || !res.ok) b.disabled = false;
    }));
    $$('#drafts-done [data-stash]').forEach(b => b.addEventListener('click', () => b.dataset.stash && window.ala.app.openExternal(b.dataset.stash)));
    $$('#drafts-done [data-deldraft]').forEach(b => b.addEventListener('click', async () => {
      const card = State.library.find(c => c.id === b.dataset.deldraft);
      if (!card) return;
      if (!confirm(`Delete "${card.metadata?.title || 'this draft'}" from DeviantArt Sta.sh? The local image stays in your library.`)) return;
      b.disabled = true;
      const res = await window.ala.daweb.deleteDraft(card.da.deviationId).catch(e => ({
        ok: false,
        error: e.message
      }));
      if (res.ok) {
        card.status = 'approved';
        card.da = null;
        card.error = null;
        card.updatedAt = Date.now();
        State.persistLibrary();
        toast('Draft deleted on DeviantArt — card is back in "Ready to upload".', 'ok');
      } else {
        toast('Delete failed: ' + res.error, 'err');
        b.disabled = false;
      }
    }));
    $$('#drafts-done [data-requeue]').forEach(b => b.addEventListener('click', () => {
      const card = State.library.find(c => c.id === b.dataset.requeue);
      if (!card) return;
      card.status = 'approved';
      card.da = null;
      card.error = null;
      card.uploadError = null;
      card.uploadAttempts = 0;
      card.nextRetryAt = null;
      card.updatedAt = Date.now();
      State.persistLibrary();
    }));
    $$('#drafts-done [data-retrymeta]').forEach(b => b.addEventListener('click', async () => {
      const card = State.library.find(c => c.id === b.dataset.retrymeta);
      if (!card) return;
      b.disabled = true;
      const res = await Pipeline.retryDraftMetadata(card).catch(e => ({
        ok: false,
        error: e.message
      }));
      toast(res && res.ok ? 'Metadata applied to the Sta.sh draft.' : 'Metadata retry failed: ' + (res && res.error), res && res.ok ? 'ok' : 'err');
      b.disabled = false;
    }));
    $$('#drafts-rejected [data-retryup]').forEach(b => b.addEventListener('click', async () => {
      const card = State.library.find(c => c.id === b.dataset.retryup);
      if (!card) return;
      if (Pipeline.pendingSites(card).includes('deviantart') && !await ensureUploadReady()) return;
      b.disabled = true;
      card.uploadAttempts = 0;
      card.uploadError = null;
      card.nextRetryAt = null;
      card.pixivAttempts = 0;
      card.pixivError = null;
      card.nextPixivRetryAt = null;
      card.error = null;
      card.status = 'approved';
      card.updatedAt = Date.now();
      State.persistLibrary();
      const res = await Pipeline.sendEverywhere(card);
      reportSend(card, res);
      b.disabled = false;
    }));
    $$('#drafts-rejected [data-backtoreview]').forEach(b => b.addEventListener('click', () => {
      const card = State.library.find(c => c.id === b.dataset.backtoreview);
      if (!card) return;
      card.status = 'review';
      card.uploadError = null;
      card.uploadAttempts = 0;
      card.nextRetryAt = null;
      card.error = null;
      card.updatedAt = Date.now();
      State.persistLibrary();
      toast('Card is back in Review — edit it, then approve again.', 'ok');
    }));
    $$('#drafts-rejected [data-rejdiscard]').forEach(b => b.addEventListener('click', () => {
      const card = State.library.find(c => c.id === b.dataset.rejdiscard);
      if (!card) return;
      card.status = 'discarded';
      card.updatedAt = Date.now();
      State.persistLibrary();
    }));
  }
  async function refreshStashState() {
    const countEl = $('#stash-count');
    if (countEl) countEl.textContent = '· checking…';
    const res = await window.ala.daweb.listDrafts().catch(e => ({
      ok: false,
      error: e.message
    }));
    if (!res.ok) {
      if (countEl) countEl.textContent = '· ' + res.error;
      return;
    }
    const live = new Set(res.items.map(i => String(i.deviationId)));
    let drift = 0;
    for (const c of State.library) {
      if (c.status !== 'drafted' || !c.da) continue;
      if (c.da.published) {
        if (c.da.missing) {
          c.da.missing = false;
          drift++;
        }
        continue;
      }
      const missing = !c.da.deviationId || !live.has(String(c.da.deviationId));
      if (missing !== !!c.da.missing) {
        c.da.missing = missing;
        drift++;
      }
    }
    if (drift) State.persistLibrary(); else renderDrafts();
    if (countEl) countEl.textContent = `· ${res.items.length} draft(s) on DeviantArt`;
  }
  async function connectDa() {
    if (!String(State.settings.da.clientId || '').trim()) {
      return toast('No API client ID set. Settings → DeviantArt → API credentials — and the app must be published on DeviantArt.', 'err');
    }
    switchTab('deviantart');
    const url = await window.ala.da.beginAuth();
    toast('Opening DeviantArt authorization…', 'ok');
    State.addLog('Opening DeviantArt OAuth page in the DeviantArt tab.');
    wvDa.loadURL(url);
  }
  function paintPerchanceBar() {
    const gens = window.PERCHANCE_GENERATORS || {};
    const id = State.settings.gen?.generator === 'advanced' ? 'advanced' : 'classic';
    const g = gens[id];
    if (!g) return;
    const t = $('#pch-title');
    if (t) t.textContent = `Perchance · ${g.label}`;
    const sel = $('#pch-generator');
    if (sel) sel.value = g.id;
    const read = $('#btn-pch-read-options');
    if (read) read.style.display = g.advanced ? '' : 'none';
  }
  function gotoPerchanceGenerator() {
    const gens = window.PERCHANCE_GENERATORS || {};
    const g = gens[State.settings.gen?.generator === 'advanced' ? 'advanced' : 'classic'];
    if (!g || !wvPerchance) return;
    const cur = wvPerchance.getURL() || '';
    if (cur.includes('/' + g.slug)) return;
    wvPerchance.loadURL(g.url).catch(() => {});
  }
  function wirePerchanceTab() {
    paintPerchanceBar();
    $('#pch-generator')?.addEventListener('change', async e => {
      State.settings = await window.ala.settings.patch({
        gen: {
          generator: e.target.value
        }
      });
      gotoPerchanceGenerator();
      syncGeneratorUi();
      State.addLog(`Generator set to ${e.target.value}. The next job will use it.`, 'ok');
    });
    $('#btn-pch-read-options')?.addEventListener('click', () => readPerchanceCatalog());
    $('#btn-pch-reload').addEventListener('click', () => wvPerchance.reload());
    $('#btn-pch-probe').addEventListener('click', async () => {
      try {
        State.addLog('Probing Perchance DOM…');
        const probe = await Pipeline.driver.probe();
        console.log('[perchance probe]', probe);
        window.__lastProbe = probe;
        State.addLog(`Probe (${probe.generator}): ${probe.textareas.length} textareas, ${probe.buttons.length} buttons, ${probe.selects.length} selects, ${probe.imgs.length} imgs. Details in console (window.__lastProbe).`, 'ok');
        toast('Probe complete — see activity log.', 'ok');
      } catch (e) {
        State.addLog('Probe failed: ' + e.message, 'err');
        toast('Probe failed: ' + e.message, 'err');
      }
    });
  }
  let pendingUpscale = null;
  function wireUpscalerTab() {
    $('#btn-up-reload').addEventListener('click', () => wvUpscale.reload());
    $('#btn-up-send').addEventListener('click', () => {
      const card = State.library.find(c => c.id === pendingUpscale);
      if (!card) return toast('Nothing pending — hit “Upscale” on a card in Review first.', 'err');
      sendToUpscaler(card);
    });
    $('#btn-up-clear').addEventListener('click', () => {
      stopDrive('cancelled');
      pendingUpscale = null;
      upscaleQueue = [];
      renderUpscaleStrip();
    });
    $('#btn-up-drive').addEventListener('click', () => {
      if (drive.timer) return stopDrive('stopped by you');
      startDrive();
    });
    $('#btn-up-probe').addEventListener('click', probeUpscaler);
    const fsel = $('#up-factor');
    fsel.value = String(State.settings.gen?.upscaleFactor ?? 4);
    fsel.addEventListener('change', async e => {
      State.settings = await window.ala.settings.patch({
        gen: {
          upscaleFactor: Number(e.target.value)
        }
      });
      renderUpscaleStrip();
    });
    window.ala.upscale.onDownloaded(async res => {
      drive.rescued = true;
      if (drive.imported) {
        return State.addLog('Upscaler: the browser download arrived after the result was already imported — ignored.');
      }
      stopDrive(res.ok ? 'downloaded' : 'download failed');
      if (!res.ok) return toast('Upscale download failed: ' + res.error, 'err');
      if (!State.library.some(c => c.id === pendingUpscale)) {
        State.addLog(`Upscaled file saved to tmp (no card pending): ${res.fname}`, 'ok');
        return toast('Downloaded, but no card was pending — file is in library/tmp.', 'err');
      }
      await importUpscaled({
        tmpPath: res.path
      });
    });
  }
  async function importUpscaled({tmpPath: tmpPath = null, base64: base64 = null, ext: ext = 'png'}) {
    const card = State.library.find(c => c.id === pendingUpscale);
    if (!card || drive.imported) return;
    drive.imported = true;
    try {
      const before = `${card.width}×${card.height}`;
      const adopted = tmpPath ? await window.ala.files.adoptUpscaled(tmpPath, card.fname) : await window.ala.files.adoptUpscaledData(base64, ext, card.fname);
      card.fname = adopted.fname;
      card.path = adopted.path;
      card.url = adopted.url;
      card.upscaled = {
        at: Date.now(),
        backup: adopted.backup,
        from: before
      };
      const dims = await measureImage(adopted.url);
      if (dims) {
        card.width = dims.w;
        card.height = dims.h;
      }
      card.updatedAt = Date.now();
      State.persistLibrary();
      pendingUpscale = null;
      renderUpscaleStrip();
      const after = dims ? `${dims.w}×${dims.h}` : '?';
      State.addLog(`Upscaled "${card.metadata?.title || card.fname}": ${before} → ${after}`, 'ok');
      toast(`Upscaled ${before} → ${after}. Card updated.`, 'ok');
      if (State.settings.gen?.upscaleAuto !== false) nextPendingUpscale();
    } catch (e) {
      toast('Could not import the upscaled file: ' + e.message, 'err');
    }
  }
  function nextPendingUpscale() {
    const next = upscaleQueue.shift();
    if (!next) return;
    const card = State.library.find(c => c.id === next);
    if (!card) return nextPendingUpscale();
    setTimeout(() => sendToUpscaler(card), 1500);
  }
  function measureImage(url) {
    return new Promise(resolve => {
      const img = new Image;
      img.onload = () => resolve({
        w: img.naturalWidth,
        h: img.naturalHeight
      });
      img.onerror = () => resolve(null);
      img.src = url + '?t=' + Date.now();
    });
  }
  let upscaleQueue = [];
  async function sendToUpscaler(card) {
    pendingUpscale = card.id;
    switchTab('upscaler');
    renderUpscaleStrip();
    try {
      const base64 = await window.ala.files.readImageBase64(card.fname);
      const mime = card.mime || 'image/jpeg';
      const res = await wvUpscale.executeJavaScript(`(() => {\n        // Clear whatever the last run left behind. The site keeps finished jobs on screen,\n        // and a second file dropped next to them means the driver has two "Download"\n        // buttons to choose between and picks the older picture.\n        const clear = [...document.querySelectorAll('button')]\n          .filter((e) => /^clear all$/i.test((e.innerText || '').trim()))[0];\n        if (clear) clear.click();\n        const b64 = ${JSON.stringify(base64)};\n        const bin = atob(b64); const arr = new Uint8Array(bin.length);\n        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);\n        const file = new File([arr], ${JSON.stringify(card.fname)}, { type: ${JSON.stringify(mime)} });\n        const inputs = [...document.querySelectorAll('input[type=file]')];\n        const inp = inputs.find(i => /image\\/(jpe?g|png|webp)/.test(i.accept || '')) || inputs[0];\n        if (!inp) return { ok: false, reason: 'no file input on this page — is it still loading?' };\n        const dt = new DataTransfer(); dt.items.add(file);\n        inp.files = dt.files;\n        inp.dispatchEvent(new Event('change', { bubbles: true }));\n        return { ok: true };\n      })()`, true);
      if (res && res.ok) {
        State.addLog(`Sent "${card.metadata?.title || card.fname}" to the upscaler.`, 'ok');
        if (State.settings.gen?.upscaleAuto !== false) {
          startDrive();
        } else {
          toast('Image loaded into ImgUpscaler. Pick the ratio and run it — the result imports automatically.', 'ok');
        }
      } else {
        toast('Could not load the image into the page: ' + (res && res.reason), 'err');
      }
    } catch (e) {
      toast('Upscaler injection failed: ' + e.message, 'err');
    }
  }
  const DRIVE_TICK_MS = 1200;
  const DRIVE_TIMEOUT_MS = 8 * 60 * 1e3;
  const DRIVE_BLOB_GRACE_MS = 6e3;
  const drive = {
    timer: null,
    phase: 'idle',
    startedAt: 0,
    steps: [],
    note: '',
    downloadedAt: 0,
    rescued: false,
    imported: false
  };
  function driveLog(note, phase) {
    if (phase) drive.phase = phase;
    if (note && drive.note !== note) {
      drive.note = note;
      drive.steps.push({
        at: Date.now(),
        note: note
      });
      State.addLog('Upscaler: ' + note);
    }
    renderUpscaleStrip();
  }
  function startDrive() {
    stopDrive();
    drive.phase = 'scale';
    drive.startedAt = Date.now();
    drive.steps = [];
    drive.note = '';
    drive.downloadedAt = 0;
    drive.rescued = false;
    drive.imported = false;
    driveLog(`driving the page at ${State.settings.gen?.upscaleFactor ?? 4}x`, 'scale');
    drive.timer = setInterval(driveTick, DRIVE_TICK_MS);
    driveTick();
  }
  function stopDrive(reason) {
    if (drive.timer) clearInterval(drive.timer);
    drive.timer = null;
    if (reason) driveLog(reason, 'done'); else {
      drive.phase = 'idle';
      drive.note = '';
    }
  }
  async function driveTick() {
    if (Date.now() - drive.startedAt > DRIVE_TIMEOUT_MS) {
      stopDrive('gave up after 8 minutes — finish it by hand, the download still imports');
      toast('Auto-drive timed out. Press the buttons yourself — the result still imports.', 'err');
      return;
    }
    if (drive.phase === 'settling' && drive.downloadedAt && Date.now() - drive.downloadedAt > DRIVE_BLOB_GRACE_MS && !drive.rescued) {
      drive.rescued = true;
      return rescueBlobResult();
    }
    let r;
    try {
      r = await wvUpscale.executeJavaScript(driveScript(drive.phase, State.settings.gen?.upscaleFactor ?? 4), true);
    } catch (e) {
      return driveLog('page not ready (' + e.message + ')');
    }
    if (!r) return;
    if (r.consent) {
      return driveLog('a cookie/consent dialog is covering the page — dismiss it once, the session remembers');
    }
    if (r.blocked) {
      stopDrive(r.blocked);
      toast('ImgUpscaler stopped the job: ' + r.blocked, 'err');
      return;
    }
    if (r.clicked) driveLog(r.did);
    if (r.phase) drive.phase = r.phase;
    if (r.waiting) driveLog(r.waiting);
    if (drive.phase === 'settling' && !drive.downloadedAt) drive.downloadedAt = Date.now();
    renderUpscaleStrip();
  }
  async function rescueBlobResult() {
    driveLog('no browser download arrived — reading the finished image out of the page');
    try {
      const got = await wvUpscale.executeJavaScript(`(async () => {\n        const cap = window.__alaUpscale;\n        const href = cap && cap.lastBlob;\n        if (!href) return { ok: false, reason: 'the page never handed over a file' };\n        // The retained Blob first. The URL is only a fallback for the case where the hook\n        // was installed after the object was minted — on that path it may already have\n        // been revoked, which is exactly why the Blob is held at all.\n        let blob = cap.held.get(href) || null;\n        if (!blob) {\n          try { blob = await (await fetch(href)).blob(); }\n          catch (e) { return { ok: false, reason: 'the page revoked the file before it could be read' }; }\n        }\n        // Chunked, because a 4x upscale is megabytes and String.fromCharCode.apply on the\n        // whole array overflows the argument limit and throws where a loop simply works.\n        const buf = new Uint8Array(await blob.arrayBuffer());\n        let s = '';\n        for (let i = 0; i < buf.length; i += 8192) {\n          s += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));\n        }\n        return { ok: true, base64: btoa(s), type: blob.type || 'image/png', name: cap.lastName || 'upscaled.png', bytes: buf.length };\n      })()`, true);
      if (!got || !got.ok) {
        stopDrive(`could not collect the result (${got && got.reason || 'unknown'}) — press Download yourself`);
        toast('The upscale finished but the file could not be collected automatically.', 'err');
        return;
      }
      const ext = (String(got.name).match(/\.(png|jpe?g|webp)$/i) || [ , got.type.split('/')[1] || 'png' ])[1];
      stopDrive(`collected ${Math.round(got.bytes / 1024)} KB from the page`);
      await importUpscaled({
        base64: got.base64,
        ext: ext
      });
    } catch (e) {
      stopDrive('could not read the result out of the page: ' + e.message);
      toast('Could not collect the upscaled file: ' + e.message, 'err');
    }
  }
  function driveScript(phase, factor) {
    return `(() => {\n      const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e);\n        return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };\n      const junk = (e) => !!e.closest('header, nav, footer, [class*="faq" i], [class*="footer" i], [class*="header" i]');\n      const txt = (e) => (e.innerText || e.textContent || '').replace(/\\s+/g, ' ').trim();\n      const phase = ${JSON.stringify(phase)};\n      const factor = ${Number(factor) || 4};\n\n      /**\n       * The blob hook. Installed once per page load, before anything is clicked, because\n       * the Download button revokes nothing but hands the URL to an anchor that is never\n       * added to the document — after the click there is nowhere else to find it.\n       */\n      if (!window.__alaUpscale) {\n        const cap = window.__alaUpscale = { lastBlob: null, lastName: null, held: new Map() };\n        // Hold the Blob, not just its URL. Measured: their Download button revokes the\n        // object URL immediately after clicking it, so a URL recorded here and fetched a\n        // few seconds later throws "Failed to fetch". The Blob itself cannot be revoked.\n        const mint = URL.createObjectURL.bind(URL);\n        URL.createObjectURL = function (obj) {\n          const url = mint(obj);\n          try {\n            if (obj instanceof Blob) {\n              cap.held.set(url, obj);\n              // Newest three only — a 4x upscale is megabytes, and this is someone\n              // else's page to be a guest in.\n              while (cap.held.size > 3) cap.held.delete(cap.held.keys().next().value);\n            }\n          } catch (e) { /* not a Blob; nothing to hold */ }\n          return url;\n        };\n        const orig = HTMLAnchorElement.prototype.click;\n        HTMLAnchorElement.prototype.click = function () {\n          try {\n            if (/^blob:/.test(this.href || '')) { cap.lastBlob = this.href; cap.lastName = this.getAttribute('download') || null; }\n          } catch (e) { /* a detached anchor; nothing to record */ }\n          return orig.apply(this, arguments);\n        };\n      }\n\n      const consent = [...document.querySelectorAll('.fc-dialog, .fc-consent-root, [class*="consent" i], [id*="cookie" i]')]\n        .some((e) => vis(e) && e.getBoundingClientRect().height > 120);\n      if (consent) return { consent: true };\n\n      // A quota or sign-in wall is a stop, not a wait. Six minutes of "waiting for the\n      // Upscale button" in front of a "you have used your free credits" banner is the\n      // single most confusing thing this driver can do.\n      const wall = [...document.querySelectorAll('div, p, span, h2, h3')].filter(vis).filter((e) => e.children.length <= 2)\n        .map(txt).find((s) => s.length < 140 && /(out of|no).{0,18}(credit|quota)|upgrade to continue|daily limit|please (log ?in|sign ?in) to/i.test(s));\n      if (wall) return { blocked: wall };\n\n      /**\n       * The job rows — one <article>/<li> per file, each holding its own state.\n       *\n       * A job row is a row about a FILE, and a row about a file says how big it is or\n       * shows it. Prose that merely talks about upscaling does neither, which is the\n       * distinction that matters: measured on the live page, matching on status words\n       * alone pulled in three marketing paragraphs alongside the one real row.\n       */\n      const SIZE_RE = /\\d+(\\.\\d+)?\\s?(bytes|kb|mb|gb)\\b/i;\n      const jobs = [...document.querySelectorAll('article, li, [class*="item" i], [class*="row" i]')]\n        .filter(vis).filter((e) => !junk(e))\n        .filter((e) => txt(e).length < 240)\n        .filter((e) => e.querySelector('img[src^="blob:"], img[src^="data:"]') || SIZE_RE.test(txt(e)))\n        .filter((e) => /\\b(processing|finished|complete|queued|uploading|failed|error|download)\\b/i.test(txt(e))\n          || e.querySelector('svg[class*="download" i], svg[class*="circle-check" i]'))\n        // Keep the outermost row per file; the inner fragments are the same job counted\n        // again, and a duplicate "finished" is a second Download press on one picture.\n        .filter((e, _i, all) => !all.some((o) => o !== e && o.contains(e)));\n      const jobState = jobs.map(txt).join(' | ');\n      const finished = jobs.find((e) => e.querySelector('svg[class*="circle-check" i]') || /\\bfinished\\b|\\bcompleted?\\b|\\bdone\\b/i.test(txt(e)));\n      const working = jobs.find((e) => /\\bprocessing|uploading|queued|in progress|\\d+\\s*%/i.test(txt(e)));\n\n      /**\n       * The download control INSIDE one finished job row.\n       *\n       * Scoped, always, and never falling back to a document-wide search. Measured on the\n       * live page, an unscoped search returned the "Microsoft Store" promo link — it\n       * carries an SVG whose class contains "download" and it sits in a promo band rather\n       * than in the footer, so neither the icon test nor the junk test excluded it. The\n       * consequence of getting this wrong is not a missed click; it is the wrong file\n       * being written over the user's original image.\n       *\n       * Within a job row, the icon is a better handle than the word: their label lives in\n       * a <span class="hidden sm:inline">, so under their 640px breakpoint the button\n       * reads as the empty string and a text match finds nothing at all.\n       */\n      const downloadIn = (row) => {\n        if (!row) return null;\n        const offsite = (e) => e.tagName === 'A' && /^https?:/i.test(e.getAttribute('href') || '')\n          && !(e.getAttribute('href') || '').includes(location.host);\n        const pick = [...row.querySelectorAll('button, a, [role="button"]')].filter(vis)\n          .filter((e) => !junk(e) && !e.disabled && !offsite(e));\n        return pick.find((e) => e.querySelector('svg[class*="download" i]'))\n          || pick.find((e) => e.hasAttribute('download'))\n          || pick.find((e) => /^download\\b/i.test(txt(e)) && txt(e).split(' ').length <= 2\n            && !/(app|extension|chrome|windows|mac|store)/i.test(txt(e)))\n          || null;\n      };\n\n      // Finishing can happen while the driver is still in an earlier phase — the free tier\n      // is sometimes instant. Checking first means a fast job is never missed because the\n      // state machine was one tick behind the page.\n      if (phase !== 'settling' && finished) {\n        const dl = downloadIn(finished);\n        if (dl) { dl.click(); return { clicked: true, did: 'finished — pressed Download', phase: 'settling' }; }\n      }\n\n      if (phase === 'scale') {\n        // Structure first: a radio named for the ratio, carrying the factor as its value.\n        // This is a contract; "400%" is a label, and a label can be translated.\n        let radio = [...document.querySelectorAll('input[type=radio], input[type=checkbox]')]\n          .filter((e) => /ratio|scale|factor|size|upscale/i.test(e.name || e.id || ''))\n          .find((e) => String(e.value) === String(factor) || String(e.value) === String(factor * 100) + '%'\n            || String(e.value) === String(factor) + 'x');\n        if (radio) {\n          if (radio.checked) return { clicked: false, did: '', phase: 'start', waiting: 'ratio already set to ' + factor + 'x' };\n          (radio.closest('label') || radio).click();\n          if (!radio.checked) radio.click();\n          return { clicked: true, did: 'selected ' + factor + 'x', phase: 'start' };\n        }\n        // A select is the other shape this control takes when a site redesigns.\n        const sel = [...document.querySelectorAll('select')].filter(vis).filter((e) => !junk(e))\n          .find((e) => [...e.options].some((o) => new RegExp('^\\\\s*(' + factor + '\\\\s*[xX]|[xX]\\\\s*' + factor + '|' + (factor * 100) + '\\\\s*%)\\\\s*$').test(o.text)));\n        if (sel) {\n          const opt = [...sel.options].find((o) => new RegExp('^\\\\s*(' + factor + '\\\\s*[xX]|[xX]\\\\s*' + factor + '|' + (factor * 100) + '\\\\s*%)\\\\s*$').test(o.text));\n          sel.value = opt.value;\n          sel.dispatchEvent(new Event('change', { bubbles: true }));\n          return { clicked: true, did: 'selected ' + factor + 'x', phase: 'start' };\n        }\n        // Text, last. EXACT text only — a fuzzy match that lands on 2x would silently\n        // halve every image and the only evidence would be a smaller file three steps on.\n        const want = new RegExp('^(' + factor + '\\\\s*[xX]|[xX]\\\\s*' + factor + '|' + (factor * 100) + '\\\\s*%)$');\n        const hit = [...document.querySelectorAll('button, [role="radio"], [role="tab"], label, li, span, div')]\n          .filter(vis).filter((e) => !junk(e)).filter((e) => want.test(txt(e)) && e.children.length <= 1)[0];\n        if (!hit) return { waiting: 'waiting for the ' + factor + 'x control to appear' };\n        (hit.closest('button, [role="button"], [role="radio"], label') || hit).click();\n        return { clicked: true, did: 'selected ' + factor + 'x', phase: 'start' };\n      }\n\n      if (phase === 'start') {\n        if (working) return { phase: 'work', waiting: 'already running — ' + jobState.slice(0, 80) };\n        /**\n         * The action button, identified by what it is NOT.\n         *\n         * Their button is called "Upload & Start" — it does not begin with any verb a\n         * list of upscaling words would contain, which is precisely how the old driver\n         * stalled here forever. So: the enabled primary button in the workspace that is\n         * not one of the controls with a known other job. That survives a rename; a list\n         * of expected verbs demonstrably did not.\n         */\n        const NOT = /^(clear|cancel|remove|delete|reset|download|sign|log ?in|log ?out|buy|upgrade|pricing|plans?|batch|explore|learn|english|contact|blog|home|next|previous|close)\\b/i;\n        // A control that DOES something is named; copy that describes it is a sentence,\n        // and sentences contain function words. "Upload & Start" has none of these;\n        // "Upscale an image online" — a live anchor on their landing page — has two.\n        const PROSE = /\\b(an?|the|of|for|with|your|my|our|to|at|in|on|from|about|multiple|online|free|without|into|and then)\\b/i;\n        const go = [...document.querySelectorAll('button, [role="button"]')].filter(vis).filter((e) => !junk(e))\n          .filter((e) => !e.disabled && !e.getAttribute('aria-disabled'))\n          .filter((e) => { const s = txt(e); return s && s.length <= 28 && s.split(' ').length <= 4\n            && !NOT.test(s) && !PROSE.test(s) && !/^\\d+\\./.test(s) && !/\\?$/.test(s); })\n          .filter((e) => /upload|upscale|enhance|start|process|generate|run|continue|submit|convert|go\\b/i.test(txt(e)))[0];\n        if (!go) return { waiting: 'waiting for the Upscale button' + (jobState ? ' — ' + jobState.slice(0, 60) : '') };\n        go.click();\n        return { clicked: true, did: 'pressed "' + txt(go) + '"', phase: 'work' };\n      }\n\n      if (phase === 'work') {\n        const dl = downloadIn(finished);\n        if (dl) { dl.click(); return { clicked: true, did: 'pressed Download', phase: 'settling' }; }\n        if (finished) return { waiting: 'finished — waiting for its download button to appear' };\n        if (working) return { waiting: 'upscaling — ' + txt(working).slice(0, 70) };\n        // Neither running nor finished: the click may not have taken (a validation error,\n        // a button that re-enabled). Going back to 'start' retries it rather than waiting\n        // out the whole timeout in a state nothing will ever leave.\n        const stillIdle = [...document.querySelectorAll('button')].filter(vis).filter((e) => !junk(e))\n          .some((e) => !e.disabled && /^upload\\b|start\\b/i.test(txt(e)));\n        if (stillIdle) return { phase: 'start', waiting: 'the job did not start — trying the button again' };\n        return { waiting: 'upscaling — waiting for the download button' };\n      }\n\n      if (phase === 'settling') {\n        return { waiting: 'downloading the result' + (window.__alaUpscale.lastBlob ? ' (the page handed over a file)' : '') };\n      }\n      return {};\n    })()`;
  }
  async function probeUpscaler() {
    try {
      const p = await wvUpscale.executeJavaScript(`(() => {\n        const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; };\n        const txt = (e) => (e.innerText || e.textContent || '').replace(/\\s+/g, ' ').trim();\n        return {\n          url: location.href,\n          buttons: [...document.querySelectorAll('button, [role="button"], a')].filter(vis)\n            .map((e) => ({ tag: e.tagName, text: txt(e).slice(0, 40), disabled: !!e.disabled })).filter((x) => x.text).slice(0, 60),\n          fileInputs: document.querySelectorAll('input[type=file]').length,\n          consent: !!document.querySelector('.fc-dialog, .fc-consent-root'),\n          // The four things the driver actually reaches for. When it stalls, which of\n          // these is missing is the entire diagnosis — the buttons dump above is 60 rows\n          // of marketing copy and answers nothing on its own.\n          ratioInputs: [...document.querySelectorAll('input[type=radio], input[type=checkbox]')]\n            .map((e) => ({ name: e.name, value: e.value, checked: e.checked })).filter((x) => x.name),\n          jobRows: [...document.querySelectorAll('article, li')].filter(vis)\n            .map(txt).filter((s) => s && s.length < 200 && /processing|finished|queued|uploading|kb|mb/i.test(s)).slice(0, 8),\n          downloadControls: [...document.querySelectorAll('button, a')].filter(vis)\n            .filter((e) => e.querySelector('svg[class*="download" i]') || e.hasAttribute('download') || /^download/i.test(txt(e)))\n            .map((e) => ({ tag: e.tagName, text: txt(e).slice(0, 30), disabled: !!e.disabled })),\n          blobCaptured: !!(window.__alaUpscale && window.__alaUpscale.lastBlob),\n        };\n      })()`, true);
      window.__lastUpscaleProbe = p;
      const ratio = (p.ratioInputs || []).filter(r => /ratio|scale|factor/i.test(r.name));
      State.addLog(`Upscaler probe: ${p.buttons.length} clickable control(s), ${p.fileInputs} file input(s), ` + `${ratio.length ? `ratio control offering ${ratio.map(r => r.value + (r.checked ? '✓' : '')).join('/')}` : 'NO ratio control found'}, ` + `${(p.downloadControls || []).length} download control(s)` + ((p.jobRows || []).length ? `. Job rows: ${p.jobRows.join(' | ').slice(0, 160)}` : '. No job rows on the page') + (p.consent ? '. Consent dialog present' : '') + '. Full dump in the console (window.__lastUpscaleProbe).', 'ok');
      toast(`${p.buttons.length} controls, ${ratio.length ? 'ratio found' : 'no ratio control'} — see the activity log.`, ratio.length ? 'ok' : 'err');
    } catch (e) {
      toast('Probe failed: ' + e.message, 'err');
    }
  }
  function renderUpscaleStrip() {
    const strip = $('#upscale-strip');
    const badge = $('#badge-upscale');
    const btn = $('#btn-up-drive');
    const card = State.library.find(c => c.id === pendingUpscale);
    const factor = State.settings.gen?.upscaleFactor ?? 4;
    if (badge) {
      badge.hidden = !card;
      badge.textContent = '1';
    }
    if (btn) btn.textContent = drive.timer ? 'Stop' : 'Run it now';
    const fsel = $('#up-factor');
    if (fsel && fsel.value !== String(factor)) fsel.value = String(factor);
    if (!strip) return;
    const running = !!drive.timer;
    const secs = running ? Math.round((Date.now() - drive.startedAt) / 1e3) : 0;
    const status = running ? `<div class="drive-line running"><span class="drive-dot"></span>${esc(drive.note || 'starting…')} · ${secs}s</div>` : drive.note ? `<div class="drive-line">${esc(drive.note)}</div>` : '';
    const queued = upscaleQueue.length ? `<div class="hint">${upscaleQueue.length} more card(s) queued — each one is sent, run and imported\n           automatically as the one before it finishes.</div>` : '';
    strip.innerHTML = card ? `<img src="${card.url}" alt="" /><div>\n           <div class="d-title">${esc(card.metadata?.title || card.fname)}</div>\n           <div class="hint">${card.width ? `${card.width}×${card.height} → ${card.width * factor}×${card.height * factor} at ${factor}x.` : `Upscaling at ${factor}x.`}\n             The result imports itself and replaces this card.</div>\n           ${status}${queued}\n         </div>` : `<div class="hint">Nothing pending. Hit <b>Upscale</b> on a card in Review to send it here —\n           it is sent, set to <b>${factor}x</b>, run, downloaded and swapped back into the card without you\n           touching the page.${status}${queued}</div>`;
  }
  const PAT_STEPS = [ {
    id: 'image',
    key: '1',
    label: 'Copy image',
    hint: 'then Ctrl+V into the composer'
  }, {
    id: 'title',
    key: '2',
    label: 'Copy title',
    hint: 'then Ctrl+V into the title field'
  }, {
    id: 'description',
    key: '3',
    label: 'Copy description',
    hint: 'then Ctrl+V into the body'
  } ];
  let patCurrent = null;
  let patStep = 0;
  let patDone = new Set;
  let patDeckRevision = 0;
  let patCopyBusy = false;
  let patAttachment = null;
  let patWait = null;
  const patQueue = () => State.library.filter(c => c.status === 'approved' && destFor(c) === 'patreon');
  function patreonMediaArmed(card) {
    if (card?.patreonMedia === 'video' && card.video?.fname) return 'video';
    return card && card.patreonMedia === 'gif' && card.gif && card.gif.fname ? 'gif' : 'image';
  }
  const patMediaName = (card, kind) => kind === 'image' ? card.fname : card[kind]?.fname;
  const patMediaLabel = kind => ({
    image: 'Photo',
    video: 'MP4',
    gif: 'GIF'
  }[kind]);
  const patPageShown = () => !$('#wv-patreon').hidden;
  const patMb = bytes => bytes ? (bytes / 1048576).toFixed(1) + ' MB' : '';
  const patSizes = new Map;
  function patMediaSize(url, known) {
    if (known || !url || typeof fetch !== 'function') return known || 0;
    if (!patSizes.has(url)) {
      patSizes.set(url, 0);
      fetch(url, {
        method: 'HEAD'
      }).then(r => {
        const n = Number(r.headers.get('content-length')) || 0;
        if (n) {
          patSizes.set(url, n);
          renderPatreonDeck();
        }
      }).catch(() => {});
    }
    return patSizes.get(url);
  }
  const patError = err => String(err?.message || err).replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '');
  async function startPatreonAttach() {
    if (patCopyBusy) return toast('A media or clipboard operation is still in progress.', 'err');
    const card = State.library.find(c => c.id === patCurrent);
    if (!card) return toast('Nothing loaded in the deck.', 'err');
    const kind = patreonMediaArmed(card);
    const revision = patDeckRevision;
    patCopyBusy = true;
    try {
      const r = await window.ala.patreon.armAttach({
        cardId: card.id,
        kind: kind,
        expectedName: patMediaName(card, kind),
        guestId: wvPatreon.getWebContentsId()
      });
      if (revision !== patDeckRevision || card.id !== patCurrent) {
        window.ala.patreon.disarmAttach({
          guestId: wvPatreon.getWebContentsId(),
          token: r.token
        }).catch(() => {});
        return;
      }
      patWait = {
        token: r.token,
        cardId: card.id,
        kind: kind,
        label: r.label,
        revision: revision
      };
      renderPatreonDeck();
    } catch (err) {
      toast('Attach: ' + patError(err) + ' — or use Drag / Show file.', 'err');
    } finally {
      patCopyBusy = false;
    }
  }
  function cancelPatreonAttach() {
    if (!patWait) return;
    const {token: token} = patWait;
    patWait = null;
    try {
      window.ala.patreon?.disarmAttach({
        guestId: wvPatreon.getWebContentsId(),
        token: token
      }).catch(() => {});
    } catch {}
  }
  function onPatreonAttachEvent(ev) {
    if (!patWait || !ev || ev.token !== patWait.token) return;
    if (ev.state === 'wrong-input') return toast(ev.message, 'err');
    const wait = patWait;
    patWait = null;
    if (ev.state === 'filled') {
      if (wait.cardId === patCurrent && wait.revision === patDeckRevision) {
        patDone.add('image');
        const next = PAT_STEPS.findIndex(s => !patDone.has(s.id));
        patStep = next === -1 ? PAT_STEPS.length : next;
      }
      patAttachment = {
        revision: patDeckRevision,
        text: `${ev.label} handed to Patreon (${patMb(ev.size)}). Wait for its preview to finish uploading before you publish.`
      };
      toast(`${ev.label} is in Patreon's uploader — wait for the preview before publishing.`, 'ok');
    } else {
      const why = {
        timeout: 'Stopped waiting for Patreon\'s upload button after 2 minutes. Press Attach again when you are ready.',
        navigated: 'Patreon changed page, so Attach stopped. Press it again once the post editor is open.',
        closed: 'The Patreon page closed, so Attach stopped.',
        detached: 'Attach stopped: something else took the Patreon page\'s debugger (close its DevTools).',
        error: 'Attach failed: ' + (ev.message || 'unknown error') + ' You can still drag the file.'
      }[ev.reason];
      if (why) toast(why, 'err');
    }
    renderPatreonDeck();
  }
  function mediaStep() {
    return patPageShown() ? startPatreonAttach() : copyStep('image');
  }
  function onPatreonDrag(ev) {
    const target = ev.target.closest?.('[data-pat-drag]');
    if (!target) return;
    ev.preventDefault();
    const card = State.library.find(c => c.id === patCurrent);
    if (!card) return;
    const kind = target.dataset.patDrag || patreonMediaArmed(card);
    const expectedName = patMediaName(card, kind);
    if (!expectedName) return toast('This media is no longer available.', 'err');
    window.ala.patreon.startDrag({
      cardId: card.id,
      kind: kind,
      expectedName: expectedName
    });
  }
  async function revealPatreonMedia() {
    const card = State.library.find(c => c.id === patCurrent);
    if (!card) return;
    const kind = patreonMediaArmed(card);
    try {
      await window.ala.patreon.revealMedia({
        cardId: card.id,
        kind: kind,
        expectedName: patMediaName(card, kind)
      });
    } catch (err) {
      toast('Show file: ' + patError(err), 'err');
    }
  }
  function wirePatreonTab() {
    $('#btn-pat-reload').addEventListener('click', () => {
      cancelPatreonAttach();
      wvPatreon.reload();
    });
    $('#btn-pat-new').addEventListener('click', () => {
      const url = State.settings.patreon?.composerUrl || 'https://www.patreon.com/posts/new';
      if (!confirm('Start a new Patreon post?\n\nThis creates an empty DRAFT on your Patreon account ' + '— that is how Patreon opens a composer. If you abandon it, delete it from your posts list.')) return;
      cancelPatreonAttach();
      showPatreonWebview(true, {
        remember: true
      });
      wvPatreon.loadURL(url);
      State.addLog('Opened a new Patreon draft composer.');
    });
    $('#btn-pat-browser').addEventListener('click', () => {
      if (!confirm('Open the Patreon composer in your browser?\n\nThis may create an empty draft on your account. Continue?')) return;
      window.ala.app.openExternal(State.settings.patreon?.composerUrl || 'https://www.patreon.com/posts/new').catch(err => toast('Could not open Patreon: ' + err.message, 'err'));
    });
    $('#btn-pat-toggle-wv').addEventListener('click', () => showPatreonWebview($('#wv-patreon').hidden, {
      remember: true
    }));
    $('#pat-deck').addEventListener('click', onDeckClick);
    $('#pat-deck').addEventListener('dragstart', onPatreonDrag);
    window.ala.patreon?.onDragError(message => toast('File drag failed: ' + message, 'err'));
    window.ala.patreon?.onAttachEvent(onPatreonAttachEvent);
    $('#pat-queue').addEventListener('click', e => {
      const row = e.target.closest('[data-pat-id]');
      if (!row) return;
      loadIntoDeck(row.dataset.patId);
    });
    document.addEventListener('keydown', onPatreonKey);
    showPatreonWebview(State.settings.ui?.patreonPage !== false);
  }
  function showPatreonWebview(show, {remember: remember = false} = {}) {
    if (!show) cancelPatreonAttach();
    $('#wv-patreon').hidden = !show;
    $('#btn-pat-reload').hidden = !show;
    $('#pane-patreon').classList.toggle('pat-split', !!show);
    $('#btn-pat-toggle-wv').textContent = show ? 'Hide Patreon page' : 'Show Patreon page';
    if (remember && window.ala.settings) {
      window.ala.settings.patch({
        ui: {
          patreonPage: !!show
        }
      }).then(s => {
        State.settings = s;
      });
    }
    renderPatreonDeck();
  }
  function onPatreonKey(ev) {
    if (!$('#pane-patreon').classList.contains('active')) return;
    if (ev.ctrlKey || ev.altKey || ev.metaKey || ev.shiftKey || ev.repeat || ev.isComposing) return;
    if (ev.key === 'Escape' && patWait) {
      ev.preventDefault();
      cancelPatreonAttach();
      renderPatreonDeck();
      return;
    }
    const t = ev.target;
    if (t && (t.closest?.('input, textarea, select, button, a, [role="dialog"]') || t.isContentEditable)) return;
    const step = PAT_STEPS.find(s => s.key === ev.key);
    if (step) {
      ev.preventDefault();
      return step.id === 'image' ? mediaStep() : copyStep(step.id);
    }
    if (ev.key === 'Enter') {
      ev.preventDefault();
      markPosted();
    }
  }
  async function sendToPatreon(card) {
    switchTab('patreon');
    loadIntoDeck(card.id);
  }
  function loadIntoDeck(id) {
    cancelPatreonAttach();
    patAttachment = null;
    patDeckRevision++;
    patCurrent = id;
    patStep = 0;
    patDone = new Set;
    renderPatreonDeck();
  }
  async function copyStep(stepId) {
    if (!PAT_STEPS.some(s => s.id === stepId)) return;
    if (patCopyBusy) return toast('A copy is still in progress. Paste it before copying the next field.', 'err');
    const revision = patDeckRevision;
    const card = State.library.find(c => c.id === patCurrent);
    if (!card) return toast('Nothing loaded in the deck.', 'err');
    const m = card.metadata || {};
    patCopyBusy = true;
    try {
      if (stepId === 'image') {
        if (patreonMediaArmed(card) === 'gif') {
          const g = await window.ala.clip.file(card.gif.fname, 'gif');
          toast(`Animated GIF file copied (${(g.size / 1048576).toFixed(1)} MB). Paste if supported, otherwise use Drag file.`, 'ok');
        } else if (patreonMediaArmed(card) === 'video') {
          await window.ala.patreon.copyFile({
            cardId: card.id,
            kind: 'video',
            expectedName: card.video.fname
          });
          toast('MP4 file copied — paste if supported, otherwise use Drag file.', 'ok');
        } else {
          const r = await window.ala.clip.image(card.fname);
          toast(`Image on the clipboard (${r.width}×${r.height}) — Ctrl+V into the composer.`, 'ok');
        }
      } else {
        const text = Pipeline.publishField(m, stepId);
        if (!text) return toast(`This card has no ${stepId}.`, 'err');
        await window.ala.clip.text(text);
        toast(`${stepId[0].toUpperCase() + stepId.slice(1)} copied — Ctrl+V.`, 'ok');
      }
      if (patCurrent !== card.id || revision !== patDeckRevision) {
        return toast('Copied the previous selection. Copy again from the current card before pasting.', 'err');
      }
      patDone.add(stepId);
      const next = PAT_STEPS.findIndex(s => !patDone.has(s.id));
      patStep = next === -1 ? PAT_STEPS.length : next;
      renderPatreonDeck();
    } catch (e) {
      toast('Copy failed: ' + patError(e), 'err');
    } finally {
      patCopyBusy = false;
    }
  }
  function markPosted() {
    const card = State.library.find(c => c.id === patCurrent);
    if (!card || card.status !== 'approved' || destFor(card) !== 'patreon') return;
    if (patCopyBusy) return toast('Wait for the clipboard copy to finish first.', 'err');
    const missing = PAT_STEPS.filter(s => !patDone.has(s.id)).map(s => s.id);
    const warning = missing.length ? '\n\nNot copied in this session: ' + missing.join(', ') + '. If you uploaded manually, you can still confirm.' : '';
    if (!confirm('Have you actually published or scheduled this post on Patreon?\n\nThis button only records completion locally; it does NOT publish anything.' + warning)) return;
    cancelPatreonAttach();
    patAttachment = null;
    patDeckRevision++;
    card.status = 'drafted';
    card.patreon = {
      at: Date.now(),
      url: $('#wv-patreon').hidden ? null : wvPatreon.getURL()
    };
    card.da = null;
    card.error = null;
    card.updatedAt = Date.now();
    State.persistLibrary();
    State.addLog(`Posted to Patreon: ${card.metadata?.title || card.fname}`, 'ok');
    const rest = patQueue();
    patCurrent = rest.length ? rest[0].id : null;
    patStep = 0;
    patDone = new Set;
    renderPatreonDeck();
    toast(rest.length ? `Marked posted. Next: ${rest[0].metadata?.title || 'untitled'}.` : 'Marked posted. Queue empty.', 'ok');
  }
  function onDeckClick(e) {
    const media = e.target.closest('[data-pat-media]');
    if (media) {
      const card = State.library.find(c => c.id === patCurrent);
      if (!card) return;
      if (![ 'image', 'gif', 'video' ].includes(media.dataset.patMedia)) return;
      if (media.dataset.patMedia === 'video' && !card.video?.fname) return toast('This card has no MP4 yet.', 'err');
      if (media.dataset.patMedia === 'gif' && !(card.gif && card.gif.fname)) {
        return toast('This card has no GIF yet — render a video on it, then press 🎞 Save as GIF in Review.', 'err');
      }
      card.patreonMedia = media.dataset.patMedia;
      card.updatedAt = Date.now();
      State.persistLibrary();
      cancelPatreonAttach();
      patAttachment = null;
      patDeckRevision++;
      patDone.delete('image');
      patStep = 0;
      renderPatreonDeck();
      return;
    }
    const btn = e.target.closest('[data-pat-act]');
    if (!btn) return;
    const act = btn.dataset.patAct;
    if (act === 'image') return mediaStep();
    if (act === 'copy-media') return copyStep('image');
    if (act === 'cancel-attach') {
      cancelPatreonAttach();
      renderPatreonDeck();
      return;
    }
    if (act === 'reveal') return revealPatreonMedia();
    if (act === 'posted') return markPosted();
    if (act === 'skip') {
      const q = patQueue();
      const i = q.findIndex(c => c.id === patCurrent);
      if (q.length > 1) loadIntoDeck(q[(i + 1) % q.length].id);
      return;
    }
    if (act === 'back') {
      const card = State.library.find(c => c.id === patCurrent);
      if (!card) return;
      card.status = 'review';
      card.updatedAt = Date.now();
      State.persistLibrary();
      toast('Sent back to Review.', 'ok');
      return;
    }
    copyStep(act);
  }
  function renderPatreonDeck() {
    const deck = $('#pat-deck');
    const badge = $('#badge-patreon');
    if (!deck) return;
    const queue = patQueue();
    if (badge) {
      badge.hidden = !queue.length;
      badge.textContent = String(queue.length);
    }
    if (patCurrent && !queue.some(c => c.id === patCurrent)) {
      cancelPatreonAttach();
      patAttachment = null;
      patCurrent = null;
      patDeckRevision++;
    }
    if (!patCurrent && queue.length) {
      patCurrent = queue[0].id;
      patStep = 0;
      patDone = new Set;
    }
    const card = State.library.find(c => c.id === patCurrent);
    if (!card) {
      deck.innerHTML = `<div class="pat-empty">\n        <div class="pat-empty-mark">◔</div>\n        <div>\n          <h2>Nothing waiting for Patreon</h2>\n          <p class="hint">Set a card to <b>Patreon</b> in Review and approve it. It lands here with its\n            description already stripped of the Patreon link and CTA — then it is attach, paste, paste and Publish.</p>\n        </div>\n      </div>`;
      renderPatreonQueue();
      return;
    }
    const m = card.metadata || {};
    const pos = queue.findIndex(c => c.id === card.id) + 1;
    const armed = patreonMediaArmed(card);
    const label = patMediaLabel(armed);
    const embedded = patPageShown();
    const hasGif = !!(card.gif && card.gif.fname);
    const hasVideo = !!(card.video && card.video.fname);
    const gifSize = hasGif ? patMediaSize(card.gif.url, card.gif.size) : 0;
    const videoSize = hasVideo ? patMediaSize(card.video.url, card.video.size) : 0;
    const gifTitle = hasGif ? `Send the animated GIF${gifSize ? ` (${patMb(gifSize)})` : ''} instead of the still — it goes over as the file itself, so the animation survives` : 'No GIF on this card yet: render a video on it, then press 🎞 Save as GIF in Review';
    const waitingHere = !!(patWait && patWait.cardId === card.id && patWait.revision === patDeckRevision);
    const copyWord = armed === 'image' ? 'Copy image' : `Copy ${label} file`;
    const stepText = s => {
      if (s.id !== 'image') return [ s.label, s.hint ];
      if (embedded) return [ `Attach ${label}`, waitingHere ? 'waiting… (Esc cancels)' : 'then click Patreon\'s upload button' ];
      return [ copyWord, armed === 'image' ? s.hint : 'then Ctrl+V if the composer takes it, or drag it' ];
    };
    const stepHtml = (s, i) => {
      const [text, hint] = stepText(s);
      return `\n          <button class="pat-step ${patDone.has(s.id) ? 'done' : ''} ${i === patStep ? 'now' : ''}" data-pat-act="${s.id}">\n            <span class="ps-key">${s.key}</span>\n            <span class="ps-text"><span class="ps-label">${patDone.has(s.id) ? '✓ ' : ''}${text}</span>\n              <span class="ps-hint">${hint}</span></span>\n          </button>`;
    };
    const mediaTools = `\n          ${waitingHere ? `<div class="pat-wait" role="status"><span class="pw-dot"></span>\n            <span class="pw-text">Click Patreon's upload or add-media button — the ${label} goes in instead of the file dialog.</span>\n            <button class="btn small" data-pat-act="cancel-attach">Cancel</button></div>` : ''}\n          <div class="pat-tools">\n            <button class="btn small" draggable="true" data-pat-drag="${armed}" title="Drag the ${label} file into the composer, or into any browser">↗ Drag ${label}</button>\n            ${embedded ? `<button class="btn small" data-pat-act="copy-media" title="Put it on the clipboard instead, to paste">${copyWord}</button>` : ''}\n            <button class="btn small" data-pat-act="reveal" title="Open the library folder with this file selected">Show file</button>\n          </div>\n          ${patAttachment?.revision === patDeckRevision ? `<div class="note">${esc(patAttachment.text)}</div>` : ''}`;
    deck.innerHTML = `\n      <div class="pat-card">\n        <img class="pat-thumb" src="${card.url}" alt="" data-zoom="${card.url}" draggable="true" data-pat-drag="${armed}" title="Click to zoom · drag to hand over the ${label} file" />\n        <div class="pat-head">\n          <div class="pat-crumb">${pos} of ${queue.length} waiting${card.upscaled ? ' · upscaled' : ''} · ${card.width}×${card.height}</div>\n          <div class="pat-title">${esc(m.title || '(no title)')}</div>\n        </div>\n        <div class="pat-main">\n          ${''}\n          <div class="pat-desc">${esc(Pipeline.publishField(m, 'description') || '(no description)')}</div>\n          ${/patreon/i.test(m.description || '') ? `<div class="note warn">This description still mentions Patreon — it was probably switched to\n            Patreon before the link-stripping existed. Flip it to DeviantArt and back in Review to clean it.</div>` : ''}\n          ${!String(m.description || '').trim() ? `<div class="note warn">This card has <b>no description</b> — either it was never written\n            (auto metadata off) or the call came back empty. Press <b>Write metadata</b> on it in Review before posting, or it goes up blank.</div>` : ''}\n        </div>\n        <div class="pat-actions">\n          ${''}\n          <div class="pat-media" role="group" aria-label="What to send to Patreon">\n            <button class="pm-opt ${armed === 'image' ? 'on' : ''}" data-pat-media="image"\n              title="The still image — the same picture Review shows"><span>🖼 Still</span><span class="pm-size">${card.width}×${card.height}</span></button>\n            <button class="pm-opt ${armed === 'gif' ? 'on' : ''} ${hasGif ? '' : 'off'}" data-pat-media="gif"\n              title="${gifTitle}"><span>🎞 GIF</span><span class="pm-size">${hasGif ? patMb(gifSize) || 'animated' : 'none yet'}</span></button>\n            ${hasVideo ? `<button class="pm-opt ${armed === 'video' ? 'on' : ''}" data-pat-media="video"\n              title="The MP4 clip itself"><span>▶ MP4</span><span class="pm-size">${patMb(videoSize) || 'clip'}</span></button>` : ''}\n          </div>\n          ${PAT_STEPS.map((s, i) => stepHtml(s, i) + (s.id === 'image' ? mediaTools : '')).join('')}\n          <button class="pat-step post ${patStep >= PAT_STEPS.length ? 'now' : ''}" data-pat-act="posted">\n            <span class="ps-key">⏎</span>\n            <span class="ps-text"><span class="ps-label">Posted — next card</span>\n              <span class="ps-hint">confirm published or scheduled · does not publish for you</span></span>\n          </button>\n          <div class="pat-minor">\n            <button class="btn ghost small" data-pat-act="skip">Skip</button>\n            <button class="btn ghost small" data-pat-act="back">Back to Review</button>\n          </div>\n        </div>\n      </div>`;
    deck.querySelector('[data-zoom]')?.addEventListener('click', e => openImageModal(e.target.dataset.zoom));
    renderPatreonQueue();
  }
  function renderPatreonQueue() {
    const wrap = $('#pat-queue');
    const count = $('#pat-queue-count');
    if (!wrap) return;
    const queue = patQueue();
    if (count) count.textContent = queue.length ? `· ${queue.length}` : '';
    wrap.innerHTML = queue.length ? queue.map(c => `\n        <button class="pat-q ${c.id === patCurrent ? 'on' : ''}" data-pat-id="${c.id}" title="${esc(c.metadata?.title || c.fname)}">\n          <img src="${c.url}" alt="" />\n          <span class="pq-title">${esc(c.metadata?.title || c.fname)}</span>\n        </button>`).join('') : `<div class="hint">Approve a Patreon-bound card in Review and it appears here.</div>`;
  }
  const renderPatreonStrip = renderPatreonDeck;
  function wireDaTab() {
    $('#btn-da-reload').addEventListener('click', () => wvDa.reload());
    $('#btn-da-goto-stash').addEventListener('click', () => wvDa.loadURL('https://www.deviantart.com/stash'));
    $('#btn-da-login-helper').addEventListener('click', tryAutoLogin);
    wvDa.addEventListener('dom-ready', async () => {
      const url = wvDa.getURL();
      if (/\/users\/login/.test(url)) await tryAutoLogin();
      await tryAutoAuthorize();
    });
  }
  async function tryAutoLogin() {
    const {loginUsername: loginUsername, loginPassword: loginPassword} = State.settings.da;
    if (!loginUsername || !loginPassword) {
      toast('Set your DeviantArt username/password in Settings → DeviantArt to enable auto-fill.', 'err');
      return;
    }
    try {
      const res = await wvDa.executeJavaScript(`(() => {\n        const user = document.querySelector('input[name="username"], #username, input[name="user"], input[autocomplete="username"]');\n        const pass = document.querySelector('input[type="password"]');\n        if (!user || !pass) return { ok: false, reason: 'login fields not found on this page' };\n        const captcha = document.querySelector('iframe[src*="captcha"], .h-captcha, .g-recaptcha');\n        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;\n        const fill = (el, val) => { el.focus(); setter.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };\n        fill(user, ${JSON.stringify(loginUsername)});\n        fill(pass, ${JSON.stringify(loginPassword)});\n        const btn = [...document.querySelectorAll('button, input[type=submit]')].find(b => /log ?in|sign ?in|continue/i.test(((b.innerText || b.value || '') + '').trim()));\n        if (btn) btn.click();\n        else { const f = pass.closest('form'); if (f) f.submit(); }\n        return { ok: true, clicked: !!btn, captcha: !!captcha };\n      })()`, true);
      if (res && res.ok) {
        State.addLog('DeviantArt login auto-filled' + (res.captcha ? ' — captcha present, may need a manual solve.' : ' and submitted.'));
        if (res.captcha) toast('Captcha detected — complete it in the DeviantArt tab.', 'err');
      } else {
        State.addLog('Auto-login skipped: ' + (res && res.reason), 'err');
      }
    } catch (e) {
      State.addLog('Auto-login failed: ' + e.message, 'err');
    }
  }
  async function tryAutoAuthorize() {
    await U.sleep(800);
    try {
      const res = await wvDa.executeJavaScript(`(() => {\n        const btn = [...document.querySelectorAll('button, input[type=submit], a')].find(b => {\n          const t = ((b.innerText || b.value || '') + '').trim();\n          return /^authorize\\b/i.test(t) || /^allow\\b/i.test(t);\n        });\n        if (btn) { btn.click(); return { ok: true }; }\n        return { ok: false };\n      })()`, true);
      if (res && res.ok) State.addLog('Clicked “Authorize” on DeviantArt.');
    } catch {}
  }
  const SET_SECTIONS = [ {
    id: 'status',
    ico: '◉',
    label: 'Status',
    blurb: 'is anything actually broken'
  }, {
    id: 'engines',
    ico: '⚙',
    label: 'Engines',
    blurb: 'which model does which job'
  }, {
    id: 'generation',
    ico: '✦',
    label: 'Generation',
    blurb: 'from prompt to finished image'
  }, {
    id: 'publishing',
    ico: '↥',
    label: 'Publishing',
    blurb: 'what ends up on the deviation'
  }, {
    id: 'learning',
    ico: '↗',
    label: 'Learning',
    blurb: 'how it improves over time'
  }, {
    id: 'overseer',
    ico: '☰',
    label: 'Overseer',
    blurb: 'what it may do while you are not looking'
  }, {
    id: 'app',
    ico: '▤',
    label: 'Library & app',
    blurb: 'where files live, how it looks, how it starts'
  } ];
  let setSection = 'status';
  function renderThemeCards() {
    const row = $('#theme-row');
    if (!row) return;
    const cur = Theme.current();
    row.innerHTML = Theme.LIST.map(t => `\n      <button class="theme-card ${t.id === cur ? 'on' : ''}" data-theme-pick="${esc(t.id)}">\n        <div class="tc-name"><span class="tc-tick">✓</span>${esc(t.name)}</div>\n        <div class="tc-blurb">${esc(t.blurb)}</div>\n        <div class="tc-swatch">${t.swatch.map(c => `<i style="background:${esc(c)}"></i>`).join('')}</div>\n      </button>`).join('');
  }
  function pickTheme(id) {
    if (!Theme.known(id) || id === Theme.current()) return;
    Theme.apply(id);
    renderThemeCards();
    window.ala.settings.patch({
      ui: {
        theme: id
      }
    }).then(s => {
      State.settings = s;
    });
  }
  const LM_EFFORT_OPTIONS = [ [ 'auto', 'provider default' ], [ 'none', 'off (cheapest)' ], [ 'minimal', 'minimal' ], [ 'low', 'low' ], [ 'medium', 'medium' ], [ 'high', 'high' ] ];
  const LM_EFFORT_DEFAULTS = {
    vision: 'auto',
    ideation: 'none',
    metadata: 'none',
    overseer: 'none'
  };
  const LM_THINK_LABEL = {
    vision: 'QC thinking',
    ideation: 'Prompt thinking',
    metadata: 'Metadata thinking',
    overseer: 'Overseer thinking'
  };
  function lmEffortOf(s, role) {
    const raw = s.lmStudio && s.lmStudio.reasoningEffort;
    const pick = v => {
      const t = String(v == null ? '' : v).trim().toLowerCase();
      return LM_EFFORT_OPTIONS.some(([o]) => o === t) ? t : null;
    };
    if (raw && typeof raw === 'object') return pick(raw[role]) || LM_EFFORT_DEFAULTS[role];
    if (typeof raw === 'string' && raw.trim()) return pick(raw) || LM_EFFORT_DEFAULTS[role];
    return LM_EFFORT_DEFAULTS[role];
  }
  function renderSettingsNav() {
    $('#settings-nav').innerHTML = SET_SECTIONS.map(s => `\n      <button class="set-nav-btn ${s.id === setSection ? 'active' : ''}" data-sec="${s.id}">\n        <span class="sn-ico">${s.ico}</span>\n        <span class="sn-text"><span class="sn-label">${esc(s.label)}</span><span class="sn-blurb">${esc(s.blurb)}</span></span>\n        <span class="sn-count"></span>\n      </button>`).join('');
  }
  function renderSettings() {
    const s = State.settings;
    const sec = (id, body) => {
      const d = SET_SECTIONS.find(x => x.id === id);
      return `<section class="set-sec ${id === setSection ? 'active' : ''}" data-sec="${id}">\n        <div class="set-sec-head"><h2>${esc(d.label)}</h2><p>${esc(d.blurb)}</p></div>\n        ${body}</section>`;
    };
    $('#settings-root').innerHTML = sec('status', `\n    <div class="panel wide" id="settings-glance" data-find="health broken working test engine offline reachable">\n      <div class="panel-head">\n        <h3>At a glance</h3>\n        <div class="btn-row">\n          <button class="btn small" id="btn-glance-testall">Test every engine</button>\n          <button class="btn ghost small" id="btn-glance-refresh">Re-check</button>\n        </div>\n      </div>\n      <div id="glance-rows" class="hz-list"></div>\n      <div class="note" style="margin-top:12px">Three different things, deliberately kept apart because they fail\n        separately: what you <b>configured</b>, what was <b>observed</b> the last time that job ran, and whether it is\n        <b>reachable</b> right now — which only a real Test proves.\n        <span class="c-idle">Blue</span> means configured but nothing has run through it since launch.\n        <span class="c-warn">Amber</span> means it works, but <em>not the way you configured it</em> — a fallback fired.\n        <span class="c-bad">Red</span> means the last attempt failed outright.</div>\n    </div>`) + sec('engines', `\n    <div class="panel" data-find="lm studio local gpu vram model temperature timeout thinking reasoning effort">\n      <h3>LM Studio <span class="p-tag">local</span></h3>\n      <p class="panel-sub">The engine on your own GPU. Always available as the last fallback unless you turn that off in Routing.</p>\n      <label class="fld"><span>Base URL</span><input data-set="lmStudio.baseUrl" value="${esc(s.lmStudio.baseUrl)}" /></label>\n      <label class="fld"><span>Default model <em>(used by any role left blank)</em></span>\n        <input data-set="lmStudio.model" list="lm-models" value="${esc(s.lmStudio.model)}" />\n        <datalist id="lm-models"></datalist></label>\n      <div class="note">The three jobs want different things: ideation needs a creative writer,\n        QC needs a strong <b>visual</b> discriminator, metadata is cheap.\n        Only one model fits in 8&nbsp;GB of VRAM at a time, so mixing roles across big models means\n        LM Studio reloads between calls — pick per role deliberately.</div>\n      <label class="fld"><span>Ideation model</span>\n        <input data-set="lmStudio.models.ideation" list="lm-models" placeholder="(default)" value="${esc((s.lmStudio.models || {}).ideation || '')}" /></label>\n      <label class="fld"><span>Vision / QC model</span>\n        <input data-set="lmStudio.models.vision" list="lm-models" placeholder="(default)" value="${esc((s.lmStudio.models || {}).vision || '')}" /></label>\n      <label class="fld"><span>Metadata model</span>\n        <input data-set="lmStudio.models.metadata" list="lm-models" placeholder="(default)" value="${esc((s.lmStudio.models || {}).metadata || '')}" /></label>\n      <div class="fld-row">\n        <label class="fld slim"><span>Temperature</span><input type="number" step="0.05" min="0" max="2" data-set="lmStudio.temperature" value="${s.lmStudio.temperature}" /></label>\n        <label class="fld slim"><span>Timeout (s)</span><input type="number" min="60" max="3600" data-set="lmStudio.requestTimeoutSec" value="${s.lmStudio.requestTimeoutSec}" /></label>\n        <button class="btn" id="btn-llm-test">Test connection</button>\n      </div>\n      <div class="fld-row" style="margin-top:12px">\n        ${[ 'vision', 'ideation', 'metadata', 'overseer' ].map(role => `\n        <label class="fld slim" style="margin-bottom:0"><span>${LM_THINK_LABEL[role]}</span>\n          <select data-set="lmStudio.reasoningEffort.${role}">\n            ${LM_EFFORT_OPTIONS.map(([v, t]) => `<option value="${v}" ${lmEffortOf(s, role) === v ? 'selected' : ''}>${t}</option>`).join('')}\n          </select></label>`).join('')}\n      </div>\n      <div class="note">How hard the local model may think before it answers, per job.\n        <b>Provider default</b> sends no parameter at all — LM Studio then uses whatever the loaded\n        model's runtime decides, which is what this engine has always done. The other choices ride on\n        <code>reasoning_effort</code>, and a build that does not understand it answers 400 once; the app\n        remembers that endpoint and quietly stops sending it — so picking one can never break an older\n        LM Studio, at most it is ignored. Local thinking costs wall clock on your card rather than money:\n        leave QC on its default (the inspector counts fingers out loud before it scores), keep the text\n        roles off unless a model you load actually thinks.</div>\n      <div id="llm-test-result" class="hint"></div>\n    </div>\n\n    \x3c!-- Providers + routing own their own markup and state — see providers.js. --\x3e\n    <div class="panel wide" id="panel-providers" data-find="cloud provider api key deepseek openai openrouter base url token subscription cli command claude code codex chatgpt gemini qwen opencode copilot ollama litellm no key free"></div>\n    <div class="panel wide" id="panel-routing" data-find="routing priority fallback order chain role"></div>`) + sec('generation', `\n    <div class="panel" data-find="engine perchance comfyui local generation which generator switch model server workflow show hide sidebar tab">\n      <h3>Generation engine</h3>\n      <p class="panel-sub">Where the pixels come from. Everything downstream — QC, metadata, Review, publishing — is the same either way.</p>\n      <label class="fld"><span>Engine</span>\n        <select data-set="gen.engine">\n          <option value="perchance" ${(s.gen.engine || 'perchance') === 'perchance' ? 'selected' : ''}>Perchance — the page, as always</option>\n          <option value="comfy" ${s.gen.engine === 'comfy' ? 'selected' : ''}>Local image generation — ComfyUI</option>\n        </select></label>\n      <div class="checkbox-row"><input type="checkbox" id="set-show-perchance" ${s.ui?.showPerchance === true ? 'checked' : ''} /><span>Show the <b>Perchance</b> tab while ComfyUI is the engine <em>— in Perchance mode it always shows</em></span></div>\n      <div class="note">The switch takes effect on the <b>next job</b> — the worker asks which engine is set every time it makes a picture, so no restart. Perchance keeps its whole setup (generator page, presets, catalog) exactly as it was; ComfyUI reads everything else from its workflow file.</div>\n    </div>\n\n    <div class="panel" id="comfy-panel" style="${s.gen.engine === 'comfy' ? '' : 'display:none'}" data-find="comfyui local generation server url workflow image video launch command 8188 illustrious wan images per prompt seeds count batch how many six">\n      <h3>Local image generation <span class="p-tag">ComfyUI</span></h3>\n      <p class="panel-sub">The workflow file is the config — fine-tune it in ComfyUI and the app picks it up, because every job re-reads the file from disk.</p>\n      <label class="fld"><span>Server URL</span><input data-set="comfy.serverUrl" value="${esc(s.comfy?.serverUrl || '')}" placeholder="http://127.0.0.1:8188" /></label>\n      <div class="fld-row">\n        <label class="fld"><span>Workflows folder</span><input data-set="comfy.workflowsDir" value="${esc(s.comfy?.workflowsDir || '')}" placeholder="(folder of ComfyUI workflow .json files)" /></label>\n        <button class="btn" id="btn-comfy-pickdir">Choose folder…</button>\n      </div>\n      <div class="fld-row">\n        <label class="fld slim"><span>Image workflow <em>(text-to-image)</em></span><select data-set="comfy.imageWorkflow" id="sel-comfy-imgwf"></select></label>\n        <label class="fld slim"><span>Video workflow <em>(image-to-video)</em></span><select data-set="comfy.videoWorkflow" id="sel-comfy-vidwf"></select></label>\n      </div>\n      <div class="note">Any ComfyUI workflow works — the app traces the prompt slot(s) back from the sampler, randomizes its seed, and collects whatever the save nodes report. Swap a file in for a different one and generation keeps working unchanged; both API-format and editor-format .json are accepted.</div>\n      <div class="fld-row">\n        <label class="fld slim"><span>Images per prompt <em>(one render each, its own random seed)</em></span><input type="number" min="1" max="12" data-set="comfy.imagesPerPrompt" value="${s.comfy?.imagesPerPrompt ?? 6}" /></label>\n        <label class="fld slim"><span>Max searched references <em>(per job; each one costs render time, 16 max)</em></span><input type="number" min="1" max="16" data-set="comfy.maxReferences" value="${s.comfy?.maxReferences ?? 4}" /></label>\n      </div>\n      <div class="note">The prompt is written <b>once</b> and the graph rendered this many times, each pass with its own random seed — the Perchance page's six, without asking the model for six prompts. So this buys GPU time and no extra language-model calls, which is what makes it affordable in ComfyUI mode where the prompt writer has to be a cloud model. Each picture still gets its own card, its own QC pass and its own metadata. <em>1</em> is the old one-picture-per-prompt behaviour; the driver caps it at 12.</div>\n      <div class="note">When Overseer found and verified picture references online, its queued prompts carry those image ids into the job: the app downloads them through the safe research bridge, uploads them to ComfyUI and wires them into the workflow's reference sockets — <b>one</b> reference or several, up to the number above. Text-only jobs upload nothing. A job that selected more than this still renders; the extra references are listed on the card as left out, not as an error. Cost is paid per picture and roughly proportional to the count: measured here at 1024² / 40 steps, no reference ≈ 1 min, one ≈ 1 min, four ≈ 5 min, eight ≈ 11 min — about +80 s per reference per render, before multiplying by <em>Images per prompt</em>.</div>\n      <label class="fld"><span>Launch command <em>(optional — started automatically if the server is not answering)</em></span><input data-set="comfy.launchCommand" value="${esc(s.comfy?.launchCommand || '')}" placeholder="(e.g. python C:\\ComfyUI\\main.py --port 8188)" /></label>\n      <div class="checkbox-row"><input type="checkbox" id="set-comfy-autogif" ${s.comfy?.autoGif ? 'checked' : ''} /><span><b>Also save a GIF</b> — every clip the video workflow renders is converted to an animated GIF beside it, for the places that will not take an MP4 <em>(needs ffmpeg on PATH; if the conversion fails the video is still saved and the reason lands in the log)</em></span></div>\n      <div class="btn-row"><button class="btn small" id="btn-comfy-test">Test server</button><span class="hint" id="comfy-status"></span></div>\n    </div>\n\n    <div class="panel" data-find="qc quality threshold retries cooldown skip manual inspect discard parallel lane speed background concurrent">\n      <h3>Quality check &amp; retries</h3>\n      <p class="panel-sub">What happens between "the image exists" and "it reaches Review".</p>\n      <div class="fld-row">\n        <label class="fld slim"><span>QC pass ≥</span><input type="number" min="1" max="10" data-set="gen.passThreshold" value="${s.gen.passThreshold}" /></label>\n        <label class="fld slim"><span>Retries</span><input type="number" min="0" max="6" data-set="gen.maxRetries" value="${s.gen.maxRetries}" /></label>\n        <label class="fld slim"><span>Cooldown (s)</span><input type="number" min="0" max="300" data-set="gen.delayBetweenGensSec" value="${s.gen.delayBetweenGensSec}" /></label>\n        <label class="fld slim"><span>Upload retries</span><input type="number" min="0" max="6" data-set="gen.maxUploadRetries" value="${s.gen.maxUploadRetries ?? 3}" /></label>\n      </div>\n      <div class="note">Upload retries apply only to <em>transient</em> DeviantArt failures\n        (rate limits, expired tokens, server wobbles). A content rejection never retries — it goes\n        straight to the “Rejected by DeviantArt” shelf on the Drafts tab.</div>\n      <div class="checkbox-row"><input type="checkbox" id="set-autoUpload" ${s.gen.autoUploadApproved ? 'checked' : ''} /><span>Publish as soon as I approve <em>— to every site the card is routed to; with “Submit after upload” on, approving puts it live</em></span></div>\n      <div class="checkbox-row"><input type="checkbox" id="set-skipqc" ${s.gen.skipQc ? 'checked' : ''} /><span><b>Manual QC</b> — skip the AI quality check entirely <em>(same switch as on the Dashboard)</em></span></div>\n      <div class="note">Generation still runs; only the inspection is skipped, so nothing\n        is auto-discarded and every image lands in Review for you to sort. On a 6-image turn the\n        inspection <em>is</em> the pipeline's cost — this is the difference between minutes and\n        seconds per turn. Individual cards still have a <b>Run QC</b> button if one is borderline.</div>\n      <label class="fld slim" style="margin-top:12px"><span>QC max edge (px)</span>\n        <input type="number" min="0" max="4096" step="128" data-set="gen.qcMaxEdge" value="${s.gen.qcMaxEdge ?? 1024}" /></label>\n      <div class="note">Downscales an image's longest edge before it goes to the vision model; 0 turns\n        it off. Perchance output is 512×768, so this normally changes nothing — it exists so that\n        re-inspecting an <em>upscaled</em> card doesn't ship a 2048×3072 image and pay minutes of\n        prefill for detail the inspection never uses.</div>\n      <div class="checkbox-row" style="margin-top:12px"><input type="checkbox" id="set-qc-veto" ${s.gen.qcVeto !== false ? 'checked' : ''} />\n        <span><b>Believe what the inspector describes, not the severity it chose</b> — a defect whose own words say fused, blobbed, melted, missing or extra limb is treated as the broken picture the rubric already calls it</span></div>\n      <div class="note">Measured 2026-09-14 on the 600 most recent inspected cards: of the 312 that passed,\n        <b>249</b> had a fused, blobbed, melted or merged anatomy defect written into their own defect list, and\n        <b>not one</b> of those was labelled “severe”. The inspector describes the flaw correctly and then scores it\n        7/10 — so the description is read and the label is not. Off, an image the inspector itself called broken can\n        pass again on the number alone.</div>\n      <div class="checkbox-row"><input type="checkbox" id="set-qc-confirm-veto" ${s.gen.qcConfirmVeto !== false ? 'checked' : ''} />\n        <span><b>Check a veto with a second look</b> — before those words throw away a picture the inspector itself passed, one independent yes/no look at hands, limbs, merges and face</span></div>\n      <div class="note">Measured 2026-09-23 on 1,613 inspected cards: the veto fired on <b>54%</b> of them, and how often\n        depended on the model rather than the art — 80% of frames under deepseek-v4-flash-vision, 42% under another\n        model on the same kind of pictures. If the second look agrees, the veto stands. If it finds every hand, limb and\n        face correct, the picture is <b>disputed</b>: capped at 6/10, marked on the card, and left to you — so your\n        <b>QC pass</b> bar decides. At a bar of 7 a 6 cannot pass, so the look is never spent and nothing changes; at\n        4–6 disputed pictures reach Review instead of the bin. If the look cannot run, the image waits under\n        “QC failed to run” for a retry — it is never discarded for that.</div>\n      <div class="checkbox-row"><input type="checkbox" id="set-qc-general" ${s.gen.qcGeneralPass !== false ? 'checked' : ''} />\n        <span><b>Second opinion on everything that would pass</b> — one general look at the picture as a whole, asked as five yes/no questions instead of as a score</span></div>\n      <div class="note">A 1-10 rubric with ten written anchors invites the middle of it: 30 of those passing cards scored a\n        clean 10/10 while carrying a blobbed hand. So a frame that is about to pass is looked at a second time by a pass\n        that never sees the first verdict, the prompt, or any scoring bands — five gates, each with its own “this is what\n        NO looks like”, and the ceiling is computed in the app from how many came back NO. <b>It costs one more view of\n        the image on roughly half the frames</b> (46% of the last 600 passed); frames that already failed are not looked\n        at twice. If the second pass cannot run, the first verdict stands and the reason goes to the log.</div>\n      <div class="checkbox-row"><input type="checkbox" id="set-qc-metrics" ${s.gen.qcMetrics !== false ? 'checked' : ''} />\n        <span><b>Measure the detail, don’t ask about it</b> — sharpness, high-frequency detail and flat-region share, taken from the pixels in the app</span></div>\n      <label class="fld slim"><span>Detail floor (%)</span>\n        <input type="number" min="0" max="50" data-set="gen.qcDetailFloor" value="${s.gen.qcDetailFloor ?? 8}" /></label>\n      <div class="note">No model can be asked this one: an image crushed to 300px and blown back to 1024 was measured\n        scoring the same as its source, under two different prompt versions. Three numbers are taken from the pixels\n        before any model sees them, normalised by the picture’s own contrast, and ranked against <b>your own library</b>\n        rather than against a fixed number. They land on every card, in the score’s tooltip: “detail 0.0523 · 31st\n        percentile” is how you find the flattest one in a shelf of twenty.\n        <br><br><b>The cap below ships OFF, and that was measured.</b> Over 400 of your own images the detail number\n        turned out to track how <i>busy</i> a picture is rather than how well it is rendered — the lowest 8 are soft\n        close-ups against plain backgrounds, the highest 8 are cluttered shop interiors full of shelf edges and\n        on-image text. Two content-independent alternatives (edge width, re-blur ratio) were tested against\n        crushed-and-upscaled copies of real frames and could not tell them apart either. Capping on that would have\n        thrown away good close-ups and passed cluttered junk, so nothing is capped until you set a number here. Set it\n        to <em>8</em> and the bottom 8% of your library for fine detail caps at 6 — under a default pass bar of 7, so\n        it fails; lower your pass bar below 6 and it passes. Nothing is capped at all until 40 scored cards carry\n        measurements.</div>\n      <div class="checkbox-row" style="margin-top:12px"><input type="checkbox" id="set-parallelqc" ${s.gen.parallelQc !== false ? 'checked' : ''} />\n        <span><b>Inspect while the next image generates</b> — run QC on its own lane</span></div>\n      <div class="note">A turn has two halves that share nothing: generating is the Perchance page,\n        inspecting is a call to the vision model. Run one after the other, a turn costs\n        <em>generate + QC</em>; run them side by side and it costs whichever is slower — and QC is\n        slower, by a lot. With this on, images are written to disk the moment they exist, the worker\n        goes straight back to Perchance, and the verdicts land a turn or so later. Cards still reach\n        Review exactly as before.\n        <br><br>Turn it off if the writer and the inspector are the <em>same local model</em>: making\n        LM Studio hold two sets of weights on one card is how it comes to answer\n        <code>400 {"error":"terminated"}</code>. Auto mode already checks that for itself and waits\n        when it applies — this switch is the manual override.</div>\n      <label class="fld slim" style="margin-top:12px"><span>QC lane depth (batches)</span>\n        <input type="number" min="1" max="8" data-set="gen.qcLaneDepth" value="${s.gen.qcLaneDepth ?? 2}" /></label>\n      <div class="note">How far generation may run ahead of the inspector before it waits. This is the\n        brake: Perchance is faster than a local vision pass, so without one the app would spend the\n        night generating into a backlog that never drains. 2 is a full turn of slack.</div>\n    </div>\n\n    <div class="panel" data-find="metadata title description tags automatic skip images only manual write on demand">\n      <h3>Automatic metadata</h3>\n      <p class="panel-sub">Whether the app names and tags an image before you have decided you want it.</p>\n      <div class="checkbox-row"><input type="checkbox" id="set-skipmeta" ${s.gen.skipMetadata ? 'checked' : ''} /><span><b>Images only</b> — do not write titles, descriptions or tags automatically <em>(same switch as on the Dashboard)</em></span></div>\n      <div class="checkbox-row"><input type="checkbox" id="set-meta-inspected" ${s.gen.metadataOnlyInspected ? 'checked' : ''} ${s.gen.skipMetadata ? 'disabled' : ''} /><span><b>Only for inspected images</b> — an image the quality check never looked at goes to Review bare instead of being named from its prompt</span></div>\n      <div class="note ${s.gen.metadataOnlyInspected && s.gen.skipQc ? 'warn' : ''}">${s.gen.metadataOnlyInspected && s.gen.skipQc ? 'The AI quality check is currently off, so <b>nothing</b> is being inspected and every card will land bare — the same result as "Images only". Turn the quality check on for this to do anything.' : 'When the quality check runs it also reports what each picture <i>shows</i>, and the title is written from that rather than from the prompt. The prompt is the same for every image in a turn, so titles written from it alone come out as one idea reworded; a title written from the image is about that image.'}</div>\n      <div class="note">With this on the worker is a pure image generator: it generates, optionally\n        inspects, and parks every card in Review with its metadata fields empty. Nothing else changes —\n        the prompt that made each image is still on the card, which is the only thing the writer needs.\n        <br><br>Metadata is then written <b>on demand</b>: press <b>Write metadata</b> under a card you like\n        and it is generated from that card's own prompt, or <b>Write metadata for all listed</b> to do a\n        whole filter in one pass — that route still groups cards by the turn they came from, so sibling\n        titles come out distinct exactly as they do in the automatic pass.\n        <br><br>It is worth turning on whenever most of a run is going to be discarded. Naming six images\n        so that one survives spends five metadata calls on pictures nobody will ever publish.</div>\n    </div>\n\n    <div class="panel" data-find="upscale upscaler imgupscaler 400% 4x ratio enlarge resolution automatic">\n      <h3>Upscaler</h3>\n      <p class="panel-sub">What happens after you press <b>Upscale</b> on a card.</p>\n      <div class="fld-row">\n        <label class="fld slim"><span>Ratio</span>\n          <select data-set="gen.upscaleFactor">\n            <option value="4" ${(s.gen.upscaleFactor ?? 4) === 4 ? 'selected' : ''}>4x — 400%</option>\n            <option value="2" ${s.gen.upscaleFactor === 2 ? 'selected' : ''}>2x — 200%</option>\n          </select></label>\n      </div>\n      <div class="checkbox-row"><input type="checkbox" id="set-upscale-auto" ${s.gen.upscaleAuto !== false ? 'checked' : ''} />\n        <span><b>Drive the page for me</b> — pick the ratio, press Upscale, press Download</span></div>\n      <div class="note">With this on, sending a card to the upscaler is the last button you press: the app\n        selects the ratio, starts the job, and clicks Download when the result appears — and the finished\n        file imports itself and replaces the card, as it always did.\n        <br><br>It is a switch and not a fixed behaviour because this is the one part of the app that depends\n        on <em>somebody else's</em> markup. If imgupscaler.com redesigns, the driver will sit there saying\n        “waiting for the 4x control” instead of guessing — turn this off, click the three buttons yourself,\n        and nothing else about the flow changes. <b>Probe DOM</b> on that tab dumps what the page is\n        currently offering.</div>\n      <div class="note warn">It will never dismiss a cookie or consent dialog for you — that is your\n        decision to make. If one is covering the page it says so and waits; dismissing it once is enough,\n        the session remembers.</div>\n    </div>\n\n    <div class="panel" data-find="perchance art style shape aspect ratio preset dropdown generator classic advanced filters controls advanced character">\n      <h3>Perchance generator</h3>\n      <p class="panel-sub">Which generator the worker drives, and how much of it the writer gets to set.</p>\n      <label class="fld"><span>Generator</span>\n        <select data-set="gen.generator">\n          <option value="classic" ${(s.gen.generator || 'classic') === 'classic' ? 'selected' : ''}>Classic — AI Character Generator</option>\n\n        </select></label>\n      <div class="note"><b>Classic</b> is the page this app has always driven: a description box and\n        three dropdowns. <b>Advanced</b> is a forty-dropdown Perchance generator\n        for filters, wardrobe, pose, lighting, location and camera, and an art style that is not a tag\n        but the prompt template itself: your description gets inserted <em>into</em> the style's own\n        wording, and the style brings its own negative prompt.\n        <br><br>Switching takes effect on the next job — the driver notices it is on the wrong page and\n        navigates. The Perchance tab follows.</div>\n\n      <div id="pch-advanced" style="${(s.gen.generator || 'classic') === 'advanced' ? '' : 'display:none'}">\n        <div class="checkbox-row" style="margin-top:14px"><input type="checkbox" id="set-adv-autofilters" ${s.gen.advAutoFilters !== false ? 'checked' : ''} />\n          <span><b>Let the writer pick the controls</b> — one set of dropdown choices per image, written with the prompt</span></div>\n        <div class="note">This is what Advanced mode is for. The writer is shown the page's controls and\n          their options, and answers with a prompt <em>and</em> the settings for it — art style, lighting,\n          pose, location, wardrobe. It names them in plain words when nothing on the list fits, and the\n          app matches each one to the closest real option before the job runs; anything it cannot match is\n          skipped and logged rather than guessed at. Costs a longer ideation call and buys a generator\n          that is actually aimed at the scene.\n          <br><br>Off, the page is driven with the presets below and nothing else.</div>\n        <div class="fld-row" style="margin-top:12px">\n          <label class="fld slim"><span>Max controls per image</span>\n            <input type="number" min="1" max="40" data-set="gen.advMaxFilters" value="${s.gen.advMaxFilters ?? 12}" /></label>\n          <label class="fld slim"><span>Options shown per control</span>\n            <input type="number" min="6" max="200" data-set="gen.advMenuCap" value="${s.gen.advMenuCap ?? 28}" /></label>\n        </div>\n        <div class="note">Two brakes on the same problem. A model handed forty dropdowns will fill in\n          thirty of them, and thirty appended sentences is a shopping list, not a picture — so only the\n          first <b>max controls</b> it names are used. <b>Options shown</b> trims the menu it reads: the full\n          catalogue is around 1,700 options, which is a few thousand tokens on every ideation call. Trimming\n          the menu does not close the list — the writer can still name anything, it just has to think of it.</div>\n        <div class="checkbox-row"><input type="checkbox" id="set-adv-reset" ${s.gen.advResetFilters !== false ? 'checked' : ''} />\n          <span><b>Reset the dropdowns between jobs</b> — every image starts from the page's defaults</span></div>\n        <div class="note">Perchance remembers dropdown selections. Without this, image 2 inherits image 1's\n          neon lighting and striped scarves even though nobody asked for them, and a night's run quietly\n          converges on one look. Turn it off to set some dropdowns by hand on the Perchance tab and let the\n          app vary only the rest.</div>\n        <div class="fld-row" style="margin-top:12px">\n          <label class="fld"><span>Guidance scale preset</span>\n            <input data-set="gen.advGuidance" placeholder="(whatever the page is set to)" value="${esc(s.gen.advGuidance || '')}" /></label>\n        </div>\n        <div class="btn-row" style="margin-top:12px">\n          <button class="btn small" id="btn-pch-catalog">Read the generator's options</button>\n          <span class="hint" id="pch-catalog-status">…</span>\n        </div>\n        <div class="note">The app learns the dropdowns by reading the live page, because those option\n          lists are community-edited Perchance generators in their own right and gain entries every few\n          weeks — a list baked into this app would start drifting the day it shipped. It reads them once\n          and remembers; press this after the generator has been updated, or if a control the writer keeps\n          naming is being skipped.</div>\n      </div>\n\n      <div class="note" style="margin-top:14px">Presets below apply to <b>both</b> generators. Type the\n        option's visible label — the driver matches it against the generator's own list when a job starts,\n        and quietly skips anything it cannot find. Leave blank to use whatever the page is already set to.\n        In Advanced mode an art style chosen by the writer normally wins over this one — tick <b>Always use\n        this art style</b> to reverse that. The number of images per click is set on the Perchance tab.</div>\n      <div class="fld-row" style="margin-top:12px">\n        <label class="fld"><span>Art style preset</span>\n          <input data-set="gen.artStyle" placeholder="(whatever the page is set to)" value="${esc(s.gen.artStyle || '')}" /></label>\n        <label class="fld"><span>Shape / aspect preset</span>\n          <input data-set="gen.shape" placeholder="(whatever the page is set to)" value="${esc(s.gen.shape || '')}" /></label>\n      </div>\n      <div class="checkbox-row"><input type="checkbox" id="set-artstyle-pin" ${s.gen.artStylePin ? 'checked' : ''} /><span><b>Always use this art style</b> — the writer is told not to pick one, and anything it picks anyway is overridden</span></div>\n      <div class="note ${s.gen.artStylePin && !String(s.gen.artStyle || '').trim() ? 'warn' : ''}">${s.gen.artStylePin && !String(s.gen.artStyle || '').trim() ? 'Nothing to pin to — the art style preset above is empty, so this is doing nothing. Type a style into it and this note will change.' : 'In Advanced mode the art style is a prompt template, not a filter — it decides whether the image is anime or a photograph. Left free, the writer rerolls it every image and reads "vary the images" as "vary the style", so a single round can come back as anime, cinematic and concept art. Pinning it also shortens the menu the writer is shown, since this is the one control listed in full.'}</div>\n      <div class="btn-row"><button class="btn small" id="btn-open-perchance">Open the Perchance tab →</button></div>\n    </div>`) + sec('publishing', `\n    <div class="panel" data-find="deviantart upload session api oauth gallery stash login password client secret show hide sidebar tab">\n      <h3>DeviantArt</h3>\n      <p class="panel-sub">How approved cards get to DeviantArt, and whether the app presses Submit for you.</p>\n      <div class="checkbox-row"><input type="checkbox" id="set-show-da" ${s.ui?.showDeviantArt !== false ? 'checked' : ''} /><span>Show the <b>DeviantArt</b> tab in the sidebar <em>— uploading works either way; the login buttons on Drafts still open it</em></span></div>\n      <div class="checkbox-row"><input type="checkbox" id="set-da-autopublish" ${s.da.autoPublish !== false ? 'checked' : ''} /><span>Submit after upload — <b>publish immediately</b> instead of leaving a Sta.sh draft</span></div>\n      <div class="note">This is the same switch as the one on the Drafts tab. Off is the old behaviour:\n        the upload creates the draft with its title, description, tags and gallery already set, and it\n        waits in <b>Saved Submissions</b> until you press Submit — on DeviantArt or from the Drafts tab.\n        It only applies to the Session method; the API route has no publish endpoint at all.</div>\n      <label class="fld"><span>Upload method</span>\n        <select data-set="da.uploadMethod">\n          <option value="session" ${(s.da.uploadMethod || 'session') === 'session' ? 'selected' : ''}>Session — use the logged-in DeviantArt tab (no API app needed)</option>\n          <option value="api" ${s.da.uploadMethod === 'api' ? 'selected' : ''}>API — OAuth + stash/submit (needs a published DeviantArt app)</option>\n        </select></label>\n      <div class="note">Session uploads do exactly what the DeviantArt Studio page does, with your own cookies.\n        The API route only works once an application you registered is <b>published and approved</b> by DeviantArt —\n        an unpublished one answers “Invalid client_id” on every authorize attempt.</div>\n      <label class="fld"><span>Gallery <em>(where the draft is filed — blank = Featured)</em></span>\n        <select data-set="da.galleryIds" id="sel-gallery"><option value="">Featured (default)</option></select></label>\n      <div class="fld-row">\n        <button class="btn" id="btn-da-galleries">Refresh galleries</button>\n        <button class="btn" id="btn-da-session-test">Test session</button>\n      </div>\n      <div id="da-session-result" class="hint"></div>\n\n      <details class="fold"><summary>API credentials <em>— only for the API method</em></summary>\n        <label class="fld"><span>Client ID</span><input data-set="da.clientId" value="${esc(s.da.clientId)}" /></label>\n        <label class="fld"><span>Client secret</span><input type="password" data-set="da.clientSecret" value="${esc(s.da.clientSecret)}" /></label>\n        <label class="fld"><span>Redirect URI <em>(must match the registered app exactly)</em></span><input data-set="da.redirectUri" value="${esc(s.da.redirectUri)}" /></label>\n        <div class="note">Register at <a href="#" data-ext="https://www.deviantart.com/developers/register">deviantart.com/developers/register</a>,\n          then <b>publish</b> it — check Studio → Applications. Unpublished apps never authorize.</div>\n      </details>\n\n      <details class="fold"><summary>Tab auto-fill login <em>— optional</em></summary>\n        <div class="note warn">Only needed if you get signed out often. Stored <b>in plain text</b> in settings.json —\n          leave blank and sign in manually if you'd rather not keep it on disk.</div>\n        <label class="fld"><span>Login username</span><input data-set="da.loginUsername" value="${esc(s.da.loginUsername || '')}" /></label>\n        <label class="fld"><span>Login password</span><input type="password" data-set="da.loginPassword" value="${esc(s.da.loginPassword || '')}" /></label>\n      </details>\n    </div>\n\n    <div class="panel" data-find="metadata title description tags ai generated noai example style">\n      <h3>Title, description &amp; tags</h3>\n      <p class="panel-sub">What the metadata writer produces for every card.</p>\n      <label class="fld"><span>Example style <em>(optional — paste your own title/description to mimic)</em></span>\n        <textarea rows="4" data-set="metadata.exampleStyle">${esc(s.metadata.exampleStyle)}</textarea></label>\n      <label class="fld"><span>Always-include tags (comma separated)</span><input data-set="metadata.defaultTags" value="${esc((s.metadata.defaultTags || []).join(', '))}" /></label>\n      <label class="fld slim"><span>Max tags</span><input type="number" min="3" max="30" data-set="metadata.maxTags" value="${s.metadata.maxTags}" /></label>\n      <label class="fld"><span>How long a description is</span>\n        <select data-set="metadata.descriptionStyle">\n          ${[ [ 'brief', 'Brief — 2-4 sentences, a caption' ], [ 'story', 'Story — 4-7 sentences, the moment from inside it' ], [ 'scene', 'Scene — 8-12 sentences, a short piece of writing' ] ].map(([v, label]) => `<option value="${v}" ${(s.metadata.descriptionStyle || 'story') === v ? 'selected' : ''}>${esc(label)}</option>`).join('')}\n        </select></label>\n      <div class="note">The image is already on the page, so a description that lists what is in it is the reader's\n        second look at the same thing. <b>Story</b> and <b>Scene</b> ask for the minute around the picture instead —\n        what is happening, what she is feeling, what she cannot quite admit — which is what earns the scroll.\n        Applies to every writer: the batch pass, the single card, and <b>✨ Enhance</b>.</div>\n      <div class="checkbox-row"><input type="checkbox" id="set-expandstory" ${s.metadata.expandedStorytelling ? 'checked' : ''} /><span><b>Expanded storytelling</b> — 300-450 words, a short story rather than a listing <em>(same switch as on the Dashboard)</em></span></div>\n      <div class="note ${s.metadata.expandedStorytelling ? 'warn' : ''}">${s.metadata.expandedStorytelling ? 'On — the dropdown above is <b>overridden</b> while this is ticked, and all three writers ask for the long form. Costs more tokens and more time per card.' : 'Off — descriptions are exactly the length chosen above, unchanged.'}</div>\n      <label class="fld"><span>Age disclaimer <em>(pinned under every description — leave empty for none)</em></span>\n        <input data-set="metadata.ageDisclaimer" value="${esc(s.metadata.ageDisclaimer || '')}" /></label>\n      <div class="note">Added at the bottom of the description on <b>every site</b> — DeviantArt, pixiv, and the text\n        the Patreon deck copies to your clipboard — at the moment it is sent, not when it is written. So it is on\n        every card you already have as well as every new one, it cannot be doubled by re-routing a card, and changing\n        the wording here changes it everywhere at once. Review shows it under the description box in the position it\n        will occupy. If you have typed your own age line into a description, that card is left alone.</div>\n      \n      <div class="checkbox-row"><input type="checkbox" id="set-isAi" ${s.metadata.isAiGenerated ? 'checked' : ''} /><span>Mark as <b>AI-generated</b> — required by DeviantArt policy</span></div>\n      <div class="checkbox-row"><input type="checkbox" id="set-noai" ${s.metadata.noai ? 'checked' : ''} /><span>Set <b>NoAI</b> (forbid others from training on your work)</span></div>\n      \n    </div>\n\n    <div class="panel wide" id="panel-titles" data-find="title variety repeat repetition duplicate creative creativity same names similar shapes devices banned words ledger history deviantart already used"></div>\n\n    <div class="panel" data-find="destination patreon deviantart pixiv both where publish route default target">\n      <h3>Where new cards publish</h3>\n      <p class="panel-sub">The default stamped on every card as it is created. Each card can be re-routed in Review.</p>\n      <label class="fld"><span>Default destination</span>\n        <select data-set="publish.destinations">\n          ${[ [ 'deviantart', 'DeviantArt — Sta.sh draft' ], [ 'pixiv', 'Pixiv — posted from the Pixiv tab' ], [ 'deviantart+pixiv', 'Both — DeviantArt and Pixiv' ], [ 'patreon', 'Patreon — staged on the Patreon tab' ] ].map(([v, label]) => `<option value="${v}" ${destDefaultValue(s) === v ? 'selected' : ''} ${v.includes('pixiv') && destDefaultValue(s) !== v ? 'class="px-only"' : ''}>${esc(label)}</option>`).join('')}\n        </select></label>\n      <div class="note">The public sites and Patreon get <b>different descriptions</b>. A DeviantArt deviation and a\n        pixiv illustration both carry the Patreon link and CTA above the body — that is what posting them is for.\n        A Patreon post gets the body alone: the people reading it are already on Patreon, so the link is dead and\n        the CTA reads as spam to your own patrons. Re-routing a card in Review rewrites its description either way,\n        including one you edited by hand.</div>\n      <div class="note">DeviantArt and Pixiv are <b>ticks, not a choice</b> — the same picture belongs on both, and\n        the two uploads are independent: either can fail, retry or be done by hand without touching the other.\n        Patreon stays exclusive, because a card cannot both carry the Patreon link and be the thing it sells.</div>\n      <div class="note warn">Changing this default never touches cards that already exist — their\n        destination was stamped when they were made, so a description you have already reviewed is\n        never rewritten behind you.</div>\n    </div>\n\n    <div class="panel" data-find="pixiv illust tags xrestrict ai declaration caption japanese post upload account login show hide enable disable sidebar tab">\n      <h3>Pixiv</h3>\n      <div class="checkbox-row"><input type="checkbox" id="set-show-pixiv" ${s.ui?.showPixiv === true ? 'checked' : ''} /><span>Show <b>Pixiv</b> in the app <em>— the sidebar tab and the pixiv buttons in Review and Drafts</em></span></div>\n      <div class="note">Hidden by default: every pixiv upload needed a hand-solved captcha. Hiding changes nothing about existing\n        cards — anything already posted stays recorded, and ticking this brings every control back.</div>\n      <div class="px-only">\n      <p class="panel-sub">What every pixiv post carries, and how much of it happens without you.</p>\n      <div class="note">Pixiv is posted from the <b>Pixiv tab</b>, using the account you are signed in to there —\n        there is no API key and nothing to register. The tab is not a preview: pixiv refuses any request that does\n        not come from a real signed-in page, so the upload is made <em>by</em> that page. Sign in once; the session\n        is kept like the DeviantArt one.</div>\n      <div class="note">Publishing happens on the <b>Drafts</b> tab, next to DeviantArt — one approval, one\n        button, both sites. There is nothing to do here per picture; the tab exists for the login, because\n        pixiv refuses any request that does not come from a real signed-in page.\n        <b>Auto-upload on approve</b> (Settings → Generation) covers pixiv too.</div>\n      <div class="fld-row">\n        <label class="fld slim"><span>Max title</span><input type="number" min="8" max="64" data-set="pixiv.maxTitle" value="${s.pixiv?.maxTitle ?? 32}" /></label>\n        <label class="fld slim"><span>Max tags</span><input type="number" min="1" max="10" data-set="pixiv.maxTags" value="${s.pixiv?.maxTags ?? 10}" /></label>\n        <button class="btn" id="btn-px-test">Check sign-in</button>\n      </div>\n      <div id="px-test-result" class="hint"></div>\n      <div class="note">Pixiv's own caps: 32 characters of title against DeviantArt's 50, and 10 tags.\n        A title is trimmed at a word boundary on the way across, never mid-word.</div>\n      <label class="fld"><span>Pixiv tags — added first, before the card's own (comma separated)</span>\n        <input data-set="pixiv.extraTags" value="${esc((s.pixiv?.extraTags || []).join(', '))}" /></label>\n      <div class="note"><b>AIイラスト</b> is the tag pixiv's audience browses AI work by. These go in ahead of the\n        card's own tags on purpose — with only ten slots, a list that overflows before reaching them makes the\n        post close to unfindable there.</div>\n      <div class="checkbox-row"><input type="checkbox" id="set-px-patreon" ${s.pixiv?.appendPatreon !== false ? 'checked' : ''} /><span>Guarantee the <b>Patreon link</b> is in every pixiv caption</span></div>\n      <div class="note">A pixiv-bound card already composes its description with the link in it, so this normally\n        changes nothing. It is the backstop for the caption that <em>doesn't</em> — one you edited by hand, or one\n        written while the card was still Patreon-bound. The check is made against the text actually about to be\n        posted, which is the only version of the promise that holds.</div>\n      <label class="fld"><span>Caption footer <em>(optional — added under every pixiv caption)</em></span>\n        <input data-set="pixiv.captionSuffix" value="${esc(s.pixiv?.captionSuffix || '')}" /></label>\n\n      <details class="fold"><summary>Form fields <em>— pixiv's own enum values</em></summary>\n        <div class="note warn">These are somebody else's contract, and the only part of this integration that can\n          change without warning. The Pixiv tab's <b>Probe form</b> button reads the live upload page's radio values,\n          and its <b>Diagnostics</b> fold prints exactly what was sent and what pixiv replied — so a rename is a line\n          in these boxes, not a new build.</div>\n        <div class="fld-row">\n          <label class="fld slim"><span>restrict</span><input data-set="pixiv.restrict" value="${esc(s.pixiv?.restrict ?? '0')}" /></label>\n          <label class="fld slim"><span>aiType</span><input data-set="pixiv.aiType" value="${esc(s.pixiv?.aiType ?? '2')}" /></label>\n          <label class="fld slim"><span>original</span><input data-set="pixiv.original" value="${esc(s.pixiv?.original ?? '0')}" /></label>\n\n        </div>\n        <div class="fld-row">\n\n          <label class="fld slim"><span>xRestrict · all ages</span><input data-set="pixiv.xRestrictClean" value="${esc(s.pixiv?.xRestrictClean ?? '0')}" /></label>\n          <label class="fld slim"><span>allowTagEdit</span><input data-set="pixiv.allowTagEdit" value="${esc(s.pixiv?.allowTagEdit ?? '0')}" /></label>\n        </div>\n        <div class="note">restrict: 0 public · 1 my pixiv · 2 private. xRestrict: always all ages.</div>\n        <div class="note warn"><b>aiType</b> is 1 for “not AI” and 2 for AI-generated, and it is pixiv's own setting\n          rather than a copy of the “Mark as AI-generated” tick above — that one is DeviantArt's disclosure and is\n          legitimately off here. pixiv <b>requires</b> the declaration for AI work, so the two mistakes are not\n          symmetric: under-declaring is a policy violation on your account, over-declaring is only inaccurate.\n          Leave this at <b>2</b> unless you are posting something you drew yourself.</div>\n        <label class="fld"><span>Extra fields <em>(JSON, merged last — overrides anything above)</em></span>\n          <input data-set="pixiv.extraFields" id="set-px-extrafields" value="${esc(JSON.stringify(s.pixiv?.extraFields || {}))}" /></label>\n        <div class="hint" id="px-extrafields-result"></div>\n      </details>\n      </div>\n    </div>\n\n    <div class="panel" data-find="patreon link cta description footer composer url post">\n      <h3>Patreon</h3>\n      <p class="panel-sub">Pinned to the top of every <em>DeviantArt</em> description. Never added to a Patreon post.</p>\n      <label class="fld"><span>Link</span><input data-set="patreon.link" value="${esc(s.patreon.link)}" /></label>\n      <label class="fld"><span>CTA line (second line)</span><input data-set="patreon.cta" value="${esc(s.patreon.cta)}" /></label>\n      <details class="fold"><summary>Post composer URL</summary>\n        <div class="note">Where the Patreon tab's <b>New post</b> button goes. It is a setting because the\n          route is Patreon's to change, not ours — if it ever 404s, navigate to the real one in the tab and\n          press <b>Use this page as “New post”</b>, which writes it back here.</div>\n        <label class="fld"><span>New post URL</span>\n          <input data-set="patreon.composerUrl" value="${esc(s.patreon?.composerUrl || '')}" /></label>\n      </details>\n    </div>`) + sec('learning', `\n    <div class="panel" data-find="learning statistics playbook lessons weights favourites views sync performance">\n      <h3>Learning &amp; statistics</h3>\n      <p class="panel-sub">Feeds measured performance back into ideation, the Prompt Lab, metadata and auto mode.</p>\n      <div class="note">Reads what your published deviations actually earned, works out what the\n        winners have in common, and steers generation with it. Before anything is published it falls\n        back to your own approve/reject record — which is a real signal too, just a different one.\n        Everything it reads is read-only; it never posts, edits, or deletes on DeviantArt.</div>\n      <div class="checkbox-row"><input type="checkbox" id="set-learn-enabled" ${s.learn?.enabled !== false ? 'checked' : ''} /><span>Use measured performance to steer generation</span></div>\n      <div class="checkbox-row"><input type="checkbox" id="set-learn-llm" ${s.learn?.useLlmLessons !== false ? 'checked' : ''} /><span>Have the model write down <b>why</b> the winners won <em>(one extra LLM call per rebuild)</em></span></div>\n      <div class="fld-row">\n        <label class="fld slim"><span>Min samples</span><input type="number" min="1" max="20" data-set="learn.minSamples" value="${s.learn?.minSamples ?? 3}" /></label>\n        <label class="fld slim"><span>Max lessons</span><input type="number" min="1" max="20" data-set="learn.maxLessons" value="${s.learn?.maxLessons ?? 8}" /></label>\n        <label class="fld slim"><span>Auto-sync (h)</span><input type="number" min="0" max="168" data-set="learn.autoSyncHours" value="${s.learn?.autoSyncHours ?? 12}" /></label>\n        <label class="fld slim"><span>View lookups</span><input type="number" min="0" max="2000" step="50" data-set="learn.maxViewFetches" value="${s.learn?.maxViewFetches ?? 400}" /></label>\n      </div>\n      <div class="note"><b>Min samples</b> is the honesty dial: a category needs this many examples before\n        its lift is reported at all. At 1 every fluke looks like a rule. <b>View lookups</b> costs one\n        request per deviation and is the only way a session client can see view counts — favourites and\n        comments come free with the gallery listing. <b>Auto-sync</b> refreshes the numbers in the\n        background when they are older than this many hours, whether or not auto mode is running.</div>\n      <h3 style="margin-top:22px">Variety &amp; exploration</h3>\n      <div class="note">The counterweight. Learning on its own is a ratchet: the winner seeds the\n        next round, the next round inherits its wording, and within a week every prompt is the same\n        scene in a different room — at which point the statistics are measuring the app's own echo\n        and reporting it as audience demand. These dials decide how much of the night is spent\n        somewhere the numbers did not send it. <b>Anything you write in Statistics → Teach it\n        outranks all of this.</b></div>\n      <div class="checkbox-row"><input type="checkbox" id="set-variety-enabled" ${s.variety?.enabled !== false ? 'checked' : ''} /><span>Keep the generator varied <em>— explore rounds, worn-out phrase retirement, seed rotation</em></span></div>\n      <div class="fld-row">\n        <label class="fld slim"><span>Explore rounds</span><input type="number" min="0" max="1" step="0.05" data-set="variety.exploreRatio" value="${s.variety?.exploreRatio ?? .35}" /></label>\n        <label class="fld slim"><span>Wildcard rounds</span><input type="number" min="0" max="1" step="0.02" data-set="variety.wildRatio" value="${s.variety?.wildRatio ?? .12}" /></label>\n        <label class="fld slim"><span>Worn-out at</span><input type="number" min="0.1" max="1" step="0.05" data-set="variety.saturationCeiling" value="${s.variety?.saturationCeiling ?? .45}" /></label>\n        <label class="fld slim"><span>Recent window</span><input type="number" min="8" max="200" step="5" data-set="variety.recentWindow" value="${s.variety?.recentWindow ?? 40}" /></label>\n      </div>\n      <div class="fld-row">\n        <label class="fld slim"><span>Seed cooldown</span><input type="number" min="0" max="20" data-set="variety.seedCooldown" value="${s.variety?.seedCooldown ?? 3}" /></label>\n        <label class="fld slim"><span>Axes per round</span><input type="number" min="1" max="6" data-set="variety.axesPerRound" value="${s.variety?.axesPerRound ?? 3}" /></label>\n        <label class="fld slim"><span>New-theme bonus</span><input type="number" min="0" max="2" step="0.1" data-set="variety.noveltyBonus" value="${s.variety?.noveltyBonus ?? .5}" /></label>\n        <label class="fld slim"><span>Max traits quoted</span><input type="number" min="1" max="12" data-set="variety.maxTraits" value="${s.variety?.maxTraits ?? 5}" /></label>\n      </div>\n      <div class="note"><b>Explore rounds</b> keep the written lessons but withhold the winning\n        prompt and its vocabulary — principles without the template. <b>Wildcard rounds</b> drop\n        everything measured and run on your hand-written rules alone; small, because it costs\n        something, but the only mechanism that can find an idea the playbook would never propose.\n        <b>Worn-out at</b> retires a phrase once it appears in that fraction of recent prompts —\n        at 0.45, anything in half of what you have made lately stops being advice and becomes a\n        ban for the round. <b>Seed cooldown</b> is how many rounds a winning prompt sits out before\n        it may seed again; at 0 the strongest one seeds every round forever, which is the setting\n        that caused this.</div>\n      <details class="fold"><summary>Honesty dials <em>— how much a thin result is allowed to shout</em></summary>\n        <div class="note">A lift is a ratio, and a ratio over four samples is mostly noise. <b>Shrink</b>\n          pulls every result toward "no effect" in proportion to how little evidence stands behind\n          it: a group of n samples keeps n/(n+shrink) of its measured lift. <b>Max lift</b> is the\n          hard ceiling nothing may exceed in either direction. <b>Min age</b> is the floor on a\n          deviation's age when computing its daily rate — below about three days a post is still on\n          its launch spike, and without a floor the newest work always wins, which means whatever\n          the app just decided to make becomes the evidence that it was right to make it.</div>\n        <div class="fld-row">\n          <label class="fld slim"><span>Shrink</span><input type="number" min="0" max="40" data-set="learn.shrink" value="${s.learn?.shrink ?? 6}" /></label>\n          <label class="fld slim"><span>Max lift</span><input type="number" min="1.5" max="20" step="0.5" data-set="learn.maxLift" value="${s.learn?.maxLift ?? 4}" /></label>\n          <label class="fld slim"><span>Min age (days)</span><input type="number" min="0.5" max="30" step="0.5" data-set="learn.minAgeDays" value="${s.learn?.minAgeDays ?? 3}" /></label>\n        </div>\n      </details>\n      <details class="fold"><summary>Engagement weights</summary>\n        <div class="note">What "doing well" means. A favourite is a deliberate act, a comment more so,\n          a view is mostly luck of the feed — so they are not worth the same. Change these and rebuild\n          the playbook to see the ranking shift.</div>\n        <div class="fld-row">\n          <label class="fld slim"><span>Per view</span><input type="number" step="0.1" min="0" data-set="learn.weights.views" value="${s.learn?.weights?.views ?? .2}" /></label>\n          <label class="fld slim"><span>Per fav</span><input type="number" step="1" min="0" data-set="learn.weights.favourites" value="${s.learn?.weights?.favourites ?? 10}" /></label>\n          <label class="fld slim"><span>Per comment</span><input type="number" step="1" min="0" data-set="learn.weights.comments" value="${s.learn?.weights?.comments ?? 25}" /></label>\n          <label class="fld slim"><span>Per download</span><input type="number" step="1" min="0" data-set="learn.weights.downloads" value="${s.learn?.weights?.downloads ?? 4}" /></label>\n        </div>\n      </details>\n    </div>`) + sec('overseer', `\n    <div class="panel" data-find="overseer agent chat schedule brief unattended autonomous">\n      <h3>Agent mode</h3>\n      <p class="panel-sub">When the Overseer wakes on its own, and what it works on.</p>\n      <div class="note">In <b>helper</b> mode it only ever acts when you type something. In <b>agent</b>\n        mode it wakes on the schedule below, reads what has changed, and works to the standing brief\n        until you switch it off. The switch itself lives on the Overseer tab; everything here is what\n        it does once it is on.</div>\n      <label class="fld"><span>Standing brief <em>— what to work on when nobody has asked</em></span>\n        <textarea rows="3" data-set="overseer.brief" placeholder="e.g. keep the fantasy-landscape gallery fed — 6 a day, lean into whatever the numbers liked this week">${esc(s.overseer?.brief || '')}</textarea></label>\n      <div class="note">Leaving this empty is a real setting, not an unfinished one: with no brief an\n        agent run still refreshes the numbers and reports, it just does not generate. That is the\n        difference between "I have not told it yet" and "make something, anything".</div>\n      <div class="fld-row">\n        <label class="fld slim"><span>Runs per day</span><input type="number" min="1" max="12" data-set="overseer.schedule.runsPerDay" value="${s.overseer?.schedule?.runsPerDay ?? 2}" /></label>\n        <label class="fld slim"><span>Not before (h)</span><input type="number" min="0" max="23" data-set="overseer.schedule.windowStart" value="${s.overseer?.schedule?.windowStart ?? 9}" /></label>\n        <label class="fld slim"><span>Not after (h)</span><input type="number" min="1" max="24" data-set="overseer.schedule.windowEnd" value="${s.overseer?.schedule?.windowEnd ?? 23}" /></label>\n        <label class="fld slim"><span>Images per run</span><input type="number" min="1" max="24" data-set="overseer.imagesPerRun" value="${s.overseer?.imagesPerRun ?? 6}" /></label>\n      </div>\n      <div class="checkbox-row"><input type="checkbox" id="set-ov-jitter" ${s.overseer?.schedule?.jitter !== false ? 'checked' : ''} /><span>Vary the times <em>— land each run at a random moment inside its slot instead of on the hour</em></span></div>\n      <div class="note">The runs are spread through the window rather than fired every N hours, because\n        a gallery is read in the daytime. <b>Vary the times</b> is not cosmetic: an account that posts\n        at 09:00:00 and 21:00:00 to the second reads as a machine. Missed runs are never caught up —\n        if the app was closed all day it does not fire four backed-up runs the moment it opens.</div>\n    </div>\n\n    <div class="panel" data-find="overseer publish approval gate quality score auto submit">\n      <h3>What it may finish without you</h3>\n      <div class="fld-row">\n        <label class="fld"><span>When an unattended run has work ready</span>\n          <select data-set="overseer.approval">\n            <option value="ask" ${s.overseer?.approval !== 'auto' ? 'selected' : ''}>Leave it in Review for me — never publish</option>\n            <option value="auto" ${s.overseer?.approval === 'auto' ? 'selected' : ''}>Publish it, but only through the gate below</option>\n          </select></label>\n      </div>\n      <div class="note ${s.overseer?.approval === 'auto' ? 'warn' : ''}">${s.overseer?.approval === 'auto' ? '<b>Unattended publishing is on.</b> Work that clears every clause below goes to your sites with nobody looking at it first.' : 'Unattended publishing is off. The Overseer produces, curates and approves; you press upload.'}\n        Either way it can never publish more than the caps allow, and a chat message can only trigger\n        an upload if that message actually asked for one.</div>\n      <div class="fld-row">\n        <label class="fld slim"><span>QC score at least</span><input type="number" min="1" max="10" data-set="overseer.autoSubmit.minScore" value="${s.overseer?.autoSubmit?.minScore ?? 8}" /></label>\n        <label class="fld slim"><span>Worst defect allowed</span>\n          <select data-set="overseer.autoSubmit.maxDefect">\n            <option value="none" ${s.overseer?.autoSubmit?.maxDefect === 'none' ? 'selected' : ''}>none at all</option>\n            <option value="minor" ${s.overseer?.autoSubmit?.maxDefect !== 'none' ? 'selected' : ''}>minor only</option>\n          </select></label>\n        <label class="fld slim"><span>Max per run</span><input type="number" min="0" max="20" data-set="overseer.autoSubmit.maxPerRun" value="${s.overseer?.autoSubmit?.maxPerRun ?? 3}" /></label>\n        <label class="fld slim"><span>Max per day</span><input type="number" min="0" max="50" data-set="overseer.autoSubmit.maxPerDay" value="${s.overseer?.autoSubmit?.maxPerDay ?? 6}" /></label>\n      </div>\n      <div class="note"><b>8</b> is the lowest score that claims a clean render — the inspector's own\n        rubric reads "8-9 = only minor defects, 6-7 = exactly one noticeable defect". The defect list is\n        then checked separately against that score, because the two are written by the same model in the\n        same breath and they do sometimes disagree; when they do, the list wins. A card that is held\n        back says which clause stopped it.</div>\n      <div class="checkbox-row"><input type="checkbox" id="set-ov-reqmeta" ${s.overseer?.autoSubmit?.requireMetadata !== false ? 'checked' : ''} /><span>Never publish a card whose title and description were never written</span></div>\n      <div class="checkbox-row"><input type="checkbox" id="set-ov-reqpass" ${s.overseer?.autoSubmit?.requireQcPass !== false ? 'checked' : ''} /><span>Require the inspector's own <b>PASS</b> verdict, not just the number</span></div>\n    </div>\n\n    <div class="panel" data-find="overseer sync hourly free tokens refresh statistics">\n      <h3>Background refresh</h3>\n      <div class="checkbox-row"><input type="checkbox" id="set-ov-autosync" ${s.overseer?.autoSync?.enabled !== false ? 'checked' : ''} /><span>Re-read the DeviantArt numbers on a timer</span></div>\n      <div class="fld-row">\n        <label class="fld slim"><span>Every (minutes)</span><input type="number" min="15" max="1440" step="15" data-set="overseer.autoSync.everyMinutes" value="${s.overseer?.autoSync?.everyMinutes ?? 60}" /></label>\n      </div>\n      <div class="note">This spends <b>no model tokens at all</b> — it is page reads, which is why it can\n        run hourly when the learning pass cannot. It is not free of <em>requests</em> though: view counts\n        cost one HTTP call per deviation, so it reads the recent slice set by\n        <b>Learning → Sync newest N</b> rather than the whole gallery. It never runs while images are\n        being made, and it deliberately does not rebuild the playbook — that step calls a model and\n        stays on the agent's schedule where it is counted.</div>\n    </div>\n\n    <div class="panel" data-find="overseer thinking steps memory model engine">\n      <h3>How it thinks</h3>\n      <div class="fld-row">\n        <label class="fld slim"><span>Max steps per turn</span><input type="number" min="1" max="12" data-set="overseer.maxSteps" value="${s.overseer?.maxSteps ?? 6}" /></label>\n        <label class="fld slim"><span>Chat turns remembered</span><input type="number" min="2" max="80" data-set="overseer.memoryTurns" value="${s.overseer?.memoryTurns ?? 20}" /></label>\n      </div>\n      <div class="note">A step is one call: it reads the state, picks one tool, and is shown the result.\n        <b>Max steps</b> is a ceiling, not a target — the turn ends the moment it says it is done, so this\n        only bounds how long a confused model may keep trying. Its engine, its model and how hard it may\n        think live in <b>Engines → Overseer</b>, where it is a role of its own alongside QC, prompt\n        writing and metadata.</div>\n    </div>`) + sec('app', `\n    <div class="panel" data-find="library folder disk files storage minimise tray startup hidden">\n      <h3>Library &amp; app</h3>\n      <p class="panel-sub">Every generated image lives here, including discarded ones — the app only ever removes a file when you delete the card.</p>\n      <div class="path-row" id="lib-dir">…</div>\n      <div class="hint" id="lib-usage" style="margin-top:6px">…</div>\n      <div class="btn-row" style="margin-top:10px">\n        <button class="btn" id="btn-open-lib">Open library folder</button>\n      </div>\n      <div class="note">Discarded cards keep their files — that is what makes Discard reversible.\n        When the folder grows too big, open Review → <b>Discarded</b> and use\n        <b>Delete discarded + files</b>; that is the empty-the-bin step.</div>\n      <div class="checkbox-row" style="margin-top:16px">\n        <input type="checkbox" id="set-start-hidden" ${s.ui?.startHidden ? 'checked' : ''} />\n        <span>Start minimised to the background <em>— for overnight runs launched at login</em></span>\n      </div>\n    </div>\n\n    <div class="panel" data-find="theme colour color appearance look palette dark green amber verdant stone midnight blue amethyst purple violet ocean cyan teal ember orange rose pink nord graphite grey gray mono">\n      <h3>Theme</h3>\n      <p class="panel-sub">Applies straight away — no restart. Saved with your settings, so it survives one.</p>\n      <div class="theme-row" id="theme-row"></div>\n    </div>`);
    renderSettingsNav();
    renderThemeCards();
    window.ala.files.libraryDir().then(d => {
      $('#lib-dir').textContent = d;
    });
    renderLibraryUsage();
    window.ala.llm.models().then(models => {
      $('#lm-models').innerHTML = models.map(m => `<option value="${esc(m)}">`).join('');
    }).catch(() => {});
    renderGalleryOptions();
    Providers.render();
    renderTitlesPanel();
    syncComfyUi();
    Health.refresh().then(() => Health.render($('#glance-rows')));
  }
  function renderTitlesPanel() {
    const root = $('#panel-titles');
    if (!root || !window.Titles) return;
    const cfg = Titles.cfg;
    const st = Titles.stats();
    const level = Titles.level;
    root.innerHTML = `\n      <h3>Title variety</h3>\n      <p class="panel-sub">Stops the writer handing you the same title, and the same six words, over and over.</p>\n      <div class="note">A model asked for a title has a favourite answer and gives you that answer every\n        time — every call is its first call. So the app keeps a ledger of every title it has ever used,\n        folds in everything scanned from your DeviantArt gallery, shows the writer the ones most at risk\n        of being repeated for <em>this</em> prompt, and checks what comes back. Anything too close to a\n        title already in use is sent back to be rewritten, and only that title — the description and tags\n        it came with are kept.</div>\n\n      <div class="title-stats">\n        <div class="ts-cell"><b>${st.total}</b><span>titles known</span></div>\n        <div class="ts-cell"><b>${st.fromCards}</b><span>from cards</span></div>\n        <div class="ts-cell"><b>${st.fromDa}</b><span>scanned from DeviantArt</span></div>\n        <div class="ts-cell ${st.collisions ? 'warn' : ''}"><b>${st.collisions}</b><span>near-duplicate pairs in the library</span></div>\n      </div>\n      ${st.fromDa === 0 ? `<div class="hint">Nothing scanned from DeviantArt yet — the Statistics tab's\n        <b>Sync</b> reads your published gallery, and every title it finds counts as used from then on.</div>` : ''}\n\n      <div class="fld-row" style="margin-top:14px">\n        <label class="fld" style="max-width:280px"><span>Creativity</span>\n          <select data-set="metadata.titles.creativity">\n            ${Titles.CREATIVITY.map(c => `<option value="${c.key}" ${c.key === level.key ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}\n          </select></label>\n        <label class="fld slim" style="max-width:150px"><span>Show past titles</span>\n          <input type="number" min="0" max="80" data-set="metadata.titles.avoidCount" value="${cfg.avoidCount}" /></label>\n        <label class="fld slim" style="max-width:160px"><span>Repeat threshold</span>\n          <input type="number" min="0.2" max="1" step="0.05" data-set="metadata.titles.similarityLimit" value="${cfg.similarityLimit}" /></label>\n        <label class="fld slim" style="max-width:140px"><span>Rewrite attempts</span>\n          <input type="number" min="0" max="3" data-set="metadata.titles.maxRepairs" value="${cfg.maxRepairs}" /></label>\n      </div>\n      <div class="note"><b>Creativity</b> raises the temperature a little and, at Bold and Wild, tells the\n        writer to stop reaching for the first phrase it thinks of. <b>Repeat threshold</b> is how close two\n        titles may be before one is sent back. <b>Lower is stricter.</b></div>\n      <div class="note">The comparison knows your own vocabulary. Measured across your ${Titles.voice().n}\n        published titles, the words you reach for constantly — “soo” in 44 of them, “why” in 31 — count for\n        almost nothing, and the rare word that says what the picture is <em>about</em> carries the weight.\n        Without that, two unrelated first-person questions about a new outfit looked like the same title,\n        and <b>0.5 flagged 70% of your gallery as repeats of itself</b>. 0.7 is the loosest setting that\n        still catches an exact repeat, a reorder, a typo and a one-word swap.</div>\n      <div class="note">A flagged title is <b>never overwritten</b>. The writer is asked for two spare titles\n        in the same call, so a genuine collision is answered from a response you already paid for; if those\n        are taken too, the title stays exactly as written and the card carries a note. <b>Rewrite attempts</b>\n        is the batch-only budget for asking again, and the spares usually mean it goes unspent.</div>\n\n      <div class="checkbox-row"><input type="checkbox" id="set-title-devices" ${cfg.devices ? 'checked' : ''} />\n        <span>Give each image a different <b>title shape</b> <em>— a question, a moment in time, an object standing in for the scene…</em></span></div>\n      <div class="note">This is the part that does the real work. “Make them distinct” is satisfied by\n        changing an adjective; “write this one as a question and that one as an overheard line” is not.\n        There are ${st.deviceCount} shapes and the rotation carries on between runs, so tomorrow's first\n        batch does not get the same three as today's.</div>\n\n      <div class="checkbox-row"><input type="checkbox" id="set-title-da" ${cfg.useDaHistory ? 'checked' : ''} />\n        <span>Count titles already published on <b>DeviantArt</b> as used <em>— those are the ones your audience has actually seen</em></span></div>\n\n      <label class="fld" style="margin-top:12px"><span>Never use these words (comma separated)</span>\n        <input data-set="metadata.titles.bannedWords" value="${esc((cfg.bannedWords || []).join(', '))}"\n          placeholder="e.g. serenity, whispers, allure" /></label>\n\n      ${st.overused.length ? `<div class="note" style="margin-top:12px"><b>Words you lean on:</b>\n        ${st.overused.map(o => `${esc(o.word)} <em>(${o.count}×)</em>`).join(' · ')}.\n        These are handed to the writer as words to avoid — no action needed, but a word you are surprised\n        to see here is worth adding to the ban list above.</div>` : ''}\n\n      <div class="btn-row" style="margin-top:12px">\n        <button class="btn small" id="btn-title-audit">Show the near-duplicates${st.collisions ? ` (${st.collisions})` : ''}</button>\n        <button class="btn ghost small" id="btn-title-rescan" title="Fold every title currently in the library and in the DeviantArt sync into the ledger. Safe to press at any time.">Re-scan for titles</button>\n      </div>\n      <div id="title-audit-out" class="hint"></div>\n\n      <div id="title-style-panel"></div>`;
    renderTitleLab();
    $('#set-title-devices')?.addEventListener('change', async e => {
      State.settings = await window.ala.settings.patch({
        metadata: {
          titles: {
            devices: e.target.checked
          }
        }
      });
    });
    $('#set-title-da')?.addEventListener('change', async e => {
      State.settings = await window.ala.settings.patch({
        metadata: {
          titles: {
            useDaHistory: e.target.checked
          }
        }
      });
      renderTitlesPanel();
    });
    $('#btn-title-rescan')?.addEventListener('click', () => {
      const added = Titles.absorbExisting();
      toast(added ? `${added} title(s) added to the ledger.` : 'Nothing new — every title was already recorded.', 'ok');
      renderTitlesPanel();
    });
    $('#btn-title-audit')?.addEventListener('click', () => {
      const out = $('#title-audit-out');
      const pairs = Titles.audit({
        limit: 25
      });
      if (!pairs.length) {
        out.textContent = 'No two cards in the library have titles that read as the same piece. ';
        out.className = 'hint ok';
        return;
      }
      out.innerHTML = `<div style="margin-bottom:6px">${pairs.length} pair(s) that read as the same piece —\n        open Review and use <b>🎲 New title</b> on whichever one you like less.</div>` + pairs.map(p => `<div class="dup-row"><span class="dup-score">${p.score}</span>\n            <span>${esc(p.a.metadata.title)}</span><span class="dup-vs">vs</span>\n            <span>${esc(p.b.metadata.title)}</span></div>`).join('');
      out.className = 'hint';
    });
  }
  function renderTitleLab() {
    const root = $('#title-style-panel');
    if (!root || !window.Titles) return;
    const cfg = Titles.cfg;
    const p = Titles.style;
    const renames = Titles.ledger.renames || [];
    const pct = x => Math.round((x || 0) * 100);
    const traitRows = p ? [ [ 'sentence case', 100 - pct(p.traits.titleCase), 'written as a sentence, not Title Case' ], [ 'first person', pct(p.traits.firstPerson), 'the character speaking from inside the picture' ], [ 'a question', pct(p.traits.question), '' ], [ 'closing punctuation', pct(p.traits.endsStopped), 'ends on . ? or !' ] ] : [];
    root.innerHTML = `\n      <h3 style="margin-top:26px">Your title voice <span class="hint">${renames.length ? `· learned from ${renames.length} of your rewrites` : '· not learned yet'}</span></h3>\n      <p class="panel-sub">The app reads how you title your own work, and writes in that voice.</p>\n      <div class="note">Every time you rewrite a title in Review, that rewrite is recorded as a pair —\n        what the machine wrote, and what you shipped instead. That is the most direct instruction this app\n        ever gets: approving a card says a <em>picture</em> was good, but a rename says exactly what a\n        <em>title</em> should have been, in your words, about an image whose prompt is still on file. Those\n        pairs, plus your published gallery weighted by how well each post did, become the house style below\n        — and the house style is put in front of the writer before it writes anything.</div>\n\n      <div class="checkbox-row"><input type="checkbox" id="set-title-learn" ${cfg.learnStyle !== false ? 'checked' : ''} />\n        <span>Write in my <b>learned title voice</b> <em>— off means the writer works from the prompt alone</em></span></div>\n\n      <label class="fld" style="max-width:340px;margin-top:10px"><span>Title shapes</span>\n        <select data-set="metadata.titles.deviceMode">\n          <option value="auto" ${(cfg.deviceMode || 'auto') === 'auto' ? 'selected' : ''}>Auto — stand down once my voice is learned</option>\n          <option value="always" ${cfg.deviceMode === 'always' ? 'selected' : ''}>Always rotate shapes</option>\n          <option value="never" ${cfg.deviceMode === 'never' ? 'selected' : ''}>Never — my voice only</option>\n        </select></label>\n      <div class="note">The shape rotation and the learned voice are both anti-repetition devices, and past a\n        point they fight: “write this one as the title of an imaginary song” is not a note you give a writer\n        whose brief is a sentence ending in a tag. <b>Auto</b> rotates shapes until there are\n        ${Titles.DEVICES_STAND_DOWN_AT} rewrites to learn from, then hands the job to your voice.\n        Right now shapes are <b>${Titles.devicesOn() ? 'on' : 'standing down'}</b>.</div>\n\n      ${p ? `\n        <div class="title-stats" style="margin-top:14px">\n          ${p.suffixes.length ? `<div class="ts-cell"><b>${esc(p.suffixes[0].suffix)}</b><span>your tag suffix · ${pct(p.suffixShare)}% of titles</span></div>` : ''}\n          <div class="ts-cell"><b>${p.words.median}</b><span>words, typically (${p.words.p20}–${p.words.p80})</span></div>\n          <div class="ts-cell"><b>${p.sampleSize}</b><span>titles measured</span></div>\n          <div class="ts-cell"><b>${renames.length}</b><span>rewrites of yours</span></div>\n        </div>\n        <div class="note" style="margin-top:10px">${traitRows.map(([k, v, why]) => `<b>${esc(k)}</b> ${v}%${why ? ` <em>(${esc(why)})</em>` : ''}`).join(' · ')}.</div>\n        <details style="margin-top:10px"><summary class="hint" style="cursor:pointer">Show the exact wording the writer is given</summary>\n          <pre class="style-preview">${esc(Titles.Style.describe(p))}</pre></details>\n      ` : `<div class="hint" style="margin-top:12px">Not enough evidence yet. The app needs about\n        ${Titles.MIN_STYLE_SAMPLE} titles that are unmistakably yours — rewrite a few titles in Review, or\n        run a DeviantArt sync so your published gallery can be read. Until then the writer works from the\n        prompt and the shape rotation alone, exactly as before.</div>`}\n\n      <div class="btn-row" style="margin-top:12px">\n        <button class="btn small" id="btn-style-rebuild">Re-learn from my titles</button>\n        ${renames.length ? `<button class="btn ghost small" id="btn-style-pairs">Show what it learned from (${renames.length})</button>` : ''}\n      </div>\n      <div id="style-pairs-out"></div>`;
    $('#set-title-learn')?.addEventListener('change', async e => {
      State.settings = await window.ala.settings.patch({
        metadata: {
          titles: {
            learnStyle: e.target.checked
          }
        }
      });
      renderTitleLab();
    });
    root.querySelector('[data-set="metadata.titles.deviceMode"]')?.addEventListener('change', async e => {
      State.settings = await window.ala.settings.patch({
        metadata: {
          titles: {
            deviceMode: e.target.value
          }
        }
      });
      renderTitleLab();
    });
    $('#btn-style-rebuild')?.addEventListener('click', () => {
      const found = Titles.backfillRenames();
      const next = Titles.rebuildStyle();
      toast(next ? `Re-learned from ${next.sampleSize} title(s)${found ? `, including ${found} rewrite(s) recovered from the ledger` : ''}.` : `Still not enough of your own titles to read a style from.`, next ? 'ok' : 'err');
      renderTitleLab();
    });
    $('#btn-style-pairs')?.addEventListener('click', () => {
      const out = $('#style-pairs-out');
      if (out.innerHTML) {
        out.innerHTML = '';
        return;
      }
      out.innerHTML = [ ...renames ].reverse().slice(0, 60).map((r, i) => `\n        <div class="dup-row">\n          <span class="dup-score" title="${esc(r.src === 'backfill' ? 'recovered from the title ledger' : 'recorded when you renamed it')}">${r.src === 'backfill' ? '↺' : '✎'}</span>\n          <span class="rename-was">${esc(r.ai)}</span><span class="dup-vs">→</span>\n          <span class="rename-is">${esc(r.human)}</span>\n          <button class="btn ghost small" data-drop-rename="${i}" title="Forget this pair — it stops teaching the writer">✕</button>\n        </div>`).join('');
      out.querySelectorAll('[data-drop-rename]').forEach(btn => btn.addEventListener('click', () => {
        const row = [ ...renames ].reverse()[Number(btn.dataset.dropRename)];
        Titles.forgetRename(row);
        toast('Forgotten. The style has been re-learned without it.', 'ok');
        renderTitlesPanel();
      }));
    });
  }
  function showSettingsSection(id) {
    if (!SET_SECTIONS.some(s => s.id === id)) return;
    setSection = id;
    $$('#settings-root .set-sec').forEach(el => el.classList.toggle('active', el.dataset.sec === id));
    $$('#settings-nav .set-nav-btn').forEach(el => el.classList.toggle('active', el.dataset.sec === id));
    $('#settings-root').scrollTop = 0;
    if (id === 'titles') renderTitlesPanel();
  }
  function applySettingsSearch(raw) {
    const q = (raw || '').trim().toLowerCase();
    const body = $('#settings-root');
    body.classList.toggle('searching', !!q);
    let total = 0;
    $$('#settings-root .set-sec').forEach(sc => {
      let hits = 0;
      sc.querySelectorAll(':scope > .panel').forEach(p => {
        const hay = `${p.dataset.find || ''} ${p.textContent}`.toLowerCase();
        const hit = !q || hay.includes(q);
        p.classList.toggle('nomatch', !hit);
        if (q && hit) hits++;
      });
      total += hits;
      sc.classList.toggle('nomatch', !!q && hits === 0);
      const btn = $(`#settings-nav .set-nav-btn[data-sec="${sc.dataset.sec}"] .sn-count`);
      if (btn) btn.textContent = q && hits ? String(hits) : '';
    });
    const out = $('#set-search-count');
    if (!q) {
      out.textContent = '';
      out.className = 'hint';
      return;
    }
    out.textContent = total ? `${total} panel${total === 1 ? '' : 's'}` : `nothing matches “${raw.trim()}”`;
    out.className = 'hint ' + (total ? 'ok' : 'err');
  }
  async function renderGalleryOptions(force = false) {
    const sel = $('#sel-gallery');
    if (!sel) return;
    const cached = State.settings.da.galleryCache || [];
    const list = force ? null : cached;
    const paint = galleries => {
      const current = (State.settings.da.galleryIds || [])[0] || '';
      sel.innerHTML = `<option value="">Featured (default)</option>` + galleries.filter(g => g.special !== 'featured').map(g => `<option value="${esc(g.id)}" ${g.id === current ? 'selected' : ''}>${esc(g.name)}</option>`).join('');
    };
    if (list && list.length) return paint(list);
    const res = await window.ala.daweb.galleries().catch(e => ({
      ok: false,
      error: e.message
    }));
    if (res.ok) {
      window.ala.settings.patch({
        da: {
          galleryCache: res.galleries
        }
      }).then(s => {
        State.settings = s;
      });
      paint(res.galleries);
    } else if (force) {
      toast('Could not read galleries: ' + res.error, 'err');
    }
  }
  function syncGeneratorUi() {
    const advanced = State.settings.gen?.generator === 'advanced';
    const box = $('#pch-advanced');
    if (box) box.style.display = advanced ? '' : 'none';
    const sel = $('#settings-root select[data-set="gen.generator"]');
    if (sel) sel.value = advanced ? 'advanced' : 'classic';
    renderCatalogStatus();
    paintPerchanceBar();
  }
  function renderCatalogStatus() {
    const out = $('#pch-catalog-status');
    if (!out) return;
    const d = Pipeline.driver;
    const cat = d && typeof d.catalog === 'function' ? d.catalog('advanced') : null;
    if (!cat) {
      out.textContent = 'Not read yet — the writer will not be offered any controls.';
      out.className = 'hint err';
      return;
    }
    const opts = cat.reduce((n, i) => n + (i.options && i.options.length || 0), 0);
    const at = d.catalogAt('advanced');
    out.textContent = `${cat.length} controls, ${opts} options${at ? ' — read ' + new Date(at).toLocaleDateString() : ''}.`;
    out.className = 'hint ok';
  }
  async function readPerchanceCatalog() {
    const out = $('#pch-catalog-status');
    if (out) {
      out.textContent = 'Reading the generator page…';
      out.className = 'hint';
    }
    try {
      await Pipeline.driver.refreshCatalog((m, k) => State.addLog(m, k));
      renderCatalogStatus();
      toast('Read the generator options.', 'ok');
    } catch (e) {
      if (out) {
        out.textContent = 'Could not read it: ' + e.message;
        out.className = 'hint err';
      }
      toast('Could not read the generator: ' + e.message, 'err');
    }
  }
  function syncComfyUi() {
    const s = State.settings;
    const box = $('#comfy-panel');
    if (box) box.style.display = (s.gen?.engine || 'perchance') === 'comfy' ? '' : 'none';
    populateComfyWorkflows();
  }
  async function populateComfyWorkflows() {
    const s = State.settings;
    const dir = String(s.comfy?.workflowsDir || '').trim();
    const files = dir ? await window.ala.comfy.listWorkflows(dir) : [];
    for (const [selId, current] of [ [ '#sel-comfy-imgwf', s.comfy?.imageWorkflow ], [ '#sel-comfy-vidwf', s.comfy?.videoWorkflow ] ]) {
      const sel = $(selId);
      if (!sel) continue;
      let opts = `<option value="">(none)</option>` + files.map(f => `<option value="${esc(f)}" ${f === current ? 'selected' : ''}>${esc(f)}</option>`).join('');
      if (current && !files.includes(current)) {
        opts += `<option value="${esc(current)}" selected>⚠ ${esc(current)} — not in folder</option>`;
      }
      sel.innerHTML = opts;
    }
  }
  async function testComfyServer() {
    const out = $('#comfy-status');
    if (!out) return;
    out.textContent = 'Asking…';
    out.className = 'hint';
    try {
      const d = new window.ComfyDriver(State.settings);
      const st = await d.status();
      out.textContent = st.up ? `Up — ${st.name}${st.version ? ' ' + st.version : ''} at ${esc(State.settings.comfy?.serverUrl || '')}.` : `Not answering: ${st.error}`;
      out.className = 'hint ' + (st.up ? 'ok' : 'err');
    } catch (e) {
      out.textContent = 'Could not reach it: ' + e.message;
      out.className = 'hint err';
    }
  }
  function wireSettings() {
    $('#settings-root').addEventListener('change', e => {
      const el = e.target;
      if (!el.dataset || !el.dataset.set) return;
      const path = el.dataset.set;
      let value = el.value;
      if (el.type === 'number') value = Number(value);
      if (path === 'gen.upscaleFactor') value = Number(value);
      if (path === 'metadata.defaultTags' || path === 'metadata.matureClassification') {
        value = value.split(',').map(t => t.trim()).filter(Boolean);
      }
      if (path === 'metadata.titles.creativity') value = Number(value);
      if (path === 'metadata.titles.bannedWords') {
        value = value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
      }
      if (path === 'da.galleryIds') value = value ? [ value ] : [];
      if (path === 'pixiv.extraTags') {
        value = value.split(',').map(t => t.trim().replace(/\s+/g, '')).filter(Boolean);
      }
      if (path === 'publish.destinations') {
        value = String(value).split('+').filter(Boolean);
      }
      if (path === 'pixiv.extraFields') {
        const out = $('#px-extrafields-result');
        try {
          const parsed = value.trim() ? JSON.parse(value) : {};
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('must be a JSON object');
          value = parsed;
          if (out) {
            out.textContent = Object.keys(parsed).length ? `${Object.keys(parsed).length} extra field(s) will be sent.` : 'No extra fields.';
            out.className = 'hint ok';
          }
        } catch (err) {
          if (out) {
            out.textContent = 'Not saved — ' + err.message;
            out.className = 'hint err';
          }
          return;
        }
      }
      window.ala.settings.patch(nestPatch(path, value)).then(s => {
        State.settings = s;
        if (path === 'da.uploadMethod') {
          refreshDaStatus();
          renderDrafts();
        }
        if (path === 'gen.upscaleFactor') renderUpscaleStrip();
        if (path === 'gen.generator') {
          syncGeneratorUi();
          gotoPerchanceGenerator();
        }
        if (path === 'gen.engine' || path.startsWith('comfy.')) syncComfyUi();
        if (path === 'gen.engine') applyTabVisibility();
        if (path.startsWith('metadata.titles.')) renderTitlesPanel();
        if (path === 'metadata.ageDisclaimer') renderReview();
        if (path === 'gen.artStyle') renderSettings();
        if (path.startsWith('overseer.')) {
          if (path.startsWith('overseer.schedule.')) {
            window.ala.settings.patch({
              overseer: {
                schedule: {
                  nextAt: null
                }
              }
            }).then(s2 => {
              State.settings = s2;
              window.Overseer?.ensureNext();
            });
          }
          if (path === 'overseer.approval') renderSettings();
          State.emit('overseer', window.Overseer);
        }
      });
    });
    const bindCheck = (id, patch) => {
      const el = $(id);
      if (el) el.addEventListener('change', e => window.ala.settings.patch(patch(e.target.checked)).then(s => {
        State.settings = s;
      }));
    };
    bindCheck('#set-autoUpload', v => ({
      gen: {
        autoUploadApproved: v
      }
    }));
    bindCheck('#set-comfy-autogif', v => ({
      comfy: {
        autoGif: v
      }
    }));
    bindCheck('#set-upscale-auto', v => ({
      gen: {
        upscaleAuto: v
      }
    }));
    bindCheck('#set-parallelqc', v => ({
      gen: {
        parallelQc: v
      }
    }));
    bindCheck('#set-qc-veto', v => ({
      gen: {
        qcVeto: v
      }
    }));
    bindCheck('#set-qc-confirm-veto', v => ({
      gen: {
        qcConfirmVeto: v
      }
    }));
    bindCheck('#set-qc-general', v => ({
      gen: {
        qcGeneralPass: v
      }
    }));
    bindCheck('#set-qc-metrics', v => ({
      gen: {
        qcMetrics: v
      }
    }));
    $('#set-artstyle-pin')?.addEventListener('change', async e => {
      State.settings = await window.ala.settings.patch({
        gen: {
          artStylePin: e.target.checked
        }
      });
      renderSettings();
    });
    $('#set-meta-inspected')?.addEventListener('change', async e => {
      State.settings = await window.ala.settings.patch({
        gen: {
          metadataOnlyInspected: e.target.checked
        }
      });
      renderSettings();
    });
    bindCheck('#set-adv-autofilters', v => ({
      gen: {
        advAutoFilters: v
      }
    }));
    bindCheck('#set-adv-reset', v => ({
      gen: {
        advResetFilters: v
      }
    }));
    renderCatalogStatus();
    wireModeToggles();
    bindCheck('#set-learn-enabled', v => ({
      learn: {
        enabled: v
      }
    }));
    bindCheck('#set-learn-llm', v => ({
      learn: {
        useLlmLessons: v
      }
    }));
    bindCheck('#set-variety-enabled', v => ({
      variety: {
        enabled: v
      }
    }));
    bindCheck('#set-ov-reqmeta', v => ({
      overseer: {
        autoSubmit: {
          requireMetadata: v
        }
      }
    }));
    bindCheck('#set-ov-reqpass', v => ({
      overseer: {
        autoSubmit: {
          requireQcPass: v
        }
      }
    }));
    bindCheck('#set-ov-autosync', v => ({
      overseer: {
        autoSync: {
          enabled: v
        }
      }
    }));
    $('#set-ov-jitter')?.addEventListener('change', async e => {
      State.settings = await window.ala.settings.patch({
        overseer: {
          schedule: {
            jitter: e.target.checked,
            nextAt: null
          }
        }
      });
      State.emit('overseer', window.Overseer);
    });
    $('#set-da-autopublish')?.addEventListener('change', async e => {
      State.settings = await window.ala.settings.patch({
        da: {
          autoPublish: e.target.checked
        }
      });
      renderDrafts();
    });
    bindCheck('#set-isAi', v => ({
      metadata: {
        isAiGenerated: v
      }
    }));
    bindCheck('#set-mature', v => ({
      metadata: {
        mature: v
      }
    }));
    bindCheck('#set-noai', v => ({
      metadata: {
        noai: v
      }
    }));
    bindCheck('#set-px-patreon', v => ({
      pixiv: {
        appendPatreon: v
      }
    }));
    $('#btn-px-test')?.addEventListener('click', async () => {
      const out = $('#px-test-result');
      out.textContent = 'Asking the Pixiv tab…';
      out.className = 'hint';
      const st = await PixivUI.refreshStatus({
        navigate: true
      });
      out.textContent = st.ok ? `Signed in as ${st.username || 'user ' + st.userId}. Posts will go to that account.` : `Not usable: ${st.error}`;
      out.className = 'hint ' + (st.ok ? 'ok' : 'err');
    });
    $('#btn-da-galleries')?.addEventListener('click', () => renderGalleryOptions(true));
    $('#btn-da-session-test')?.addEventListener('click', async () => {
      const out = $('#da-session-result');
      out.textContent = 'Checking DeviantArt session…';
      out.className = 'hint';
      const st = await window.ala.daweb.status();
      out.textContent = st.ok ? `Signed in as @${st.username}. ${st.drafts != null ? st.drafts + ' item(s) in Sta.sh.' : ''} Session uploads will work.` : `Not usable: ${st.error}. Open the DeviantArt tab and log in.`;
      out.className = 'hint ' + (st.ok ? 'ok' : 'err');
      refreshDaStatus();
    });
    $('#settings-root').addEventListener('click', e => {
      const a = e.target.closest('[data-ext]');
      if (a) {
        e.preventDefault();
        window.ala.app.openExternal(a.dataset.ext);
      }
      if (e.target.closest('#btn-pch-catalog')) readPerchanceCatalog();
      if (e.target.closest('#btn-comfy-test')) testComfyServer();
      if (e.target.closest('#btn-comfy-pickdir')) {
        window.ala.comfy.pickDir().then(async dir => {
          if (!dir) return;
          State.settings = await window.ala.settings.patch(nestPatch('comfy.workflowsDir', dir));
          const input = $('#settings-root input[data-set="comfy.workflowsDir"]');
          if (input) input.value = dir;
          populateComfyWorkflows();
        });
      }
      const th = e.target.closest('[data-theme-pick]');
      if (th) pickTheme(th.dataset.themePick);
    });
    $('#btn-llm-test').addEventListener('click', async () => {
      const out = $('#llm-test-result');
      out.textContent = 'Testing…';
      out.className = 'hint';
      const st = await window.ala.llm.status();
      if (st.ok) {
        out.textContent = `Connected. ${st.models.length} model(s) available` + (st.loaded ? ' — configured model is loaded.' : ' — configured model NOT loaded in LM Studio.');
        out.className = 'hint ' + (st.loaded ? 'ok' : 'err');
      } else {
        out.textContent = 'Unreachable: ' + st.error;
        out.className = 'hint err';
      }
    });
    $('#btn-open-lib').addEventListener('click', () => window.ala.files.openLibrary());
    $('#btn-open-perchance')?.addEventListener('click', () => switchTab('perchance'));
    bindCheck('#set-start-hidden', v => ({
      ui: {
        startHidden: v
      }
    }));
    for (const [id, key] of [ [ '#set-show-pixiv', 'showPixiv' ], [ '#set-show-perchance', 'showPerchance' ], [ '#set-show-da', 'showDeviantArt' ] ]) {
      $(id)?.addEventListener('change', async e => {
        State.settings.ui = {
          ...State.settings.ui || {},
          [key]: e.target.checked
        };
        applyTabVisibility();
        State.settings = await window.ala.settings.patch({
          ui: {
            [key]: e.target.checked
          }
        });
      });
    }
    $('#settings-nav').addEventListener('click', e => {
      const b = e.target.closest('.set-nav-btn');
      if (!b) return;
      const box = $('#set-search');
      if (box.value) {
        box.value = '';
        applySettingsSearch('');
      }
      showSettingsSection(b.dataset.sec);
    });
    const box = $('#set-search');
    box.addEventListener('input', () => applySettingsSearch(box.value));
    box.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        box.value = '';
        applySettingsSearch('');
        box.blur();
      }
    });
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && $('#pane-settings').classList.contains('active')) {
        e.preventDefault();
        box.focus();
        box.select();
      }
    });
    $('#btn-glance-refresh').addEventListener('click', async () => {
      await Health.refresh();
      Health.render($('#glance-rows'));
      renderHealth();
    });
    $('#btn-glance-testall').addEventListener('click', async e => {
      await testAllEngines(e.currentTarget);
      Health.render($('#glance-rows'));
    });
  }
  async function renderLibraryUsage() {
    const el = $('#lib-usage');
    if (!el || !window.ala.files.libraryStats) return;
    try {
      const {count: count, bytes: bytes} = await window.ala.files.libraryStats();
      const mb = bytes / 1048576;
      const size = mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : Math.round(mb) + ' MB';
      const discarded = State.library.filter(c => c.status === 'discarded').length;
      el.textContent = `${count} image file(s) · ${size} on disk` + (discarded ? ` · ${discarded} discarded card(s) still holding files` : '');
    } catch {
      el.textContent = '';
    }
  }
  function nestPatch(path, value) {
    const parts = path.split('.');
    const root = {};
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]] = {};
    cur[parts[parts.length - 1]] = value;
    return root;
  }
  function openImageModal(url) {
    const root = $('#modal-root');
    zoomState = null;
    root.innerHTML = `<div class="modal-backdrop"><img class="modal-img" src="${url}" /></div>`;
    root.querySelector('.modal-backdrop').addEventListener('click', () => {
      root.innerHTML = '';
    });
  }
  let zoomState = null;
  function openReviewZoom(cardId) {
    const ids = cardsForFilter().map(c => c.id);
    const idx = ids.indexOf(cardId);
    if (idx < 0) return openImageModal((State.library.find(c => c.id === cardId) || {}).url || '');
    zoomState = {
      ids: ids,
      idx: idx
    };
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-backdrop">\n      <button class="modal-nav prev" data-znav="-1" title="Previous (←)">‹</button>\n      <div class="modal-stage">\n        <img class="modal-img" src="" />\n        <div class="modal-caption"></div>\n      </div>\n      <button class="modal-nav next" data-znav="1" title="Next (→)">›</button>\n    </div>`;
    root.querySelector('.modal-backdrop').addEventListener('click', e => {
      if (e.target.classList.contains('modal-backdrop')) {
        root.innerHTML = '';
        zoomState = null;
      }
    });
    root.querySelectorAll('[data-znav]').forEach(b => b.addEventListener('click', () => navZoom(Number(b.dataset.znav))));
    paintZoom();
  }
  function navZoom(delta) {
    if (!zoomState) return;
    const n = zoomState.ids.length;
    zoomState.idx = ((zoomState.idx + delta) % n + n) % n;
    reviewCursor = zoomState.idx;
    paintZoom();
  }
  function paintZoom() {
    const root = $('#modal-root');
    if (!zoomState || !root.innerHTML) return;
    const card = State.library.find(c => c.id === zoomState.ids[zoomState.idx]);
    if (!card) {
      root.innerHTML = '';
      zoomState = null;
      return;
    }
    const img = root.querySelector('.modal-img');
    const cap = root.querySelector('.modal-caption');
    if (img) img.src = card.url;
    if (cap) {
      const qc = card.qc ? `QC ${card.qc.score}/10 ${card.qc.verdict === 'PASS' ? '✓' : '✕'}` : 'not inspected';
      cap.innerHTML = `<b>${zoomState.idx + 1}/${zoomState.ids.length}</b> · ${esc(card.metadata?.title || card.fname)}` + ` · <span class="${card.qc && card.qc.verdict === 'PASS' ? 'ok' : ''}">${esc(qc)}</span>` + ` · <span class="pill ${card.status}">${esc(card.status)}</span>`;
    }
    focusCursor();
  }
  function askNumber({title: title, label: label, value: value = '', hint: hint = ''}) {
    return new Promise(resolve => {
      const root = $('#modal-root');
      root.innerHTML = `<div class="modal-backdrop"><div class="panel ask-panel">\n        <div class="panel-head"><h2>${esc(title)}</h2><button class="btn ghost small" data-close>✕</button></div>\n        <label class="fld"><span>${esc(label)}</span>\n          <input type="number" id="ask-input" value="${esc(String(value))}" /></label>\n        ${hint ? `<div class="hint">${esc(hint)}</div>` : ''}\n        <div class="btn-row" style="margin-top:12px;justify-content:flex-end">\n          <button class="btn" data-close>Cancel</button>\n          <button class="btn primary" data-ok>OK</button>\n        </div>\n      </div></div>`;
      const done = val => {
        root.innerHTML = '';
        resolve(val);
      };
      const read = () => {
        const n = Number(root.querySelector('#ask-input').value);
        done(Number.isFinite(n) ? n : null);
      };
      root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => done(null)));
      root.querySelector('[data-ok]').addEventListener('click', read);
      root.querySelector('.modal-backdrop').addEventListener('click', e => {
        if (e.target.classList.contains('modal-backdrop')) done(null);
      });
      const input = root.querySelector('#ask-input');
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
  function askText(title, value = '', {multiline: multiline = false, placeholder: placeholder = '', label: label = ''} = {}) {
    return new Promise(resolve => {
      const root = $('#modal-root');
      const field = multiline ? `<textarea id="ask-input" rows="6" placeholder="${esc(placeholder)}">${esc(String(value))}</textarea>` : `<input type="text" id="ask-input" placeholder="${esc(placeholder)}" value="${esc(String(value))}" />`;
      root.innerHTML = `<div class="modal-backdrop"><div class="panel ask-panel" style="max-width:620px">\n        <div class="panel-head"><h2>${esc(title)}</h2><button class="btn ghost small" data-close>✕</button></div>\n        <label class="fld"><span>${esc(label)}</span>${field}</label>\n        <div class="btn-row" style="margin-top:12px;justify-content:flex-end">\n          <button class="btn" data-close>Cancel</button>\n          <button class="btn primary" data-ok>OK</button>\n        </div>\n      </div></div>`;
      const done = val => {
        root.innerHTML = '';
        resolve(val);
      };
      const read = () => done(root.querySelector('#ask-input').value);
      root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => done(null)));
      root.querySelector('[data-ok]').addEventListener('click', read);
      root.querySelector('.modal-backdrop').addEventListener('click', e => {
        if (e.target.classList.contains('modal-backdrop')) done(null);
      });
      const input = root.querySelector('#ask-input');
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          read();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          done(null);
        }
      });
      input.focus();
      if (!multiline) input.select();
    });
  }
  function toast(msg, kind = '') {
    const root = $('#toast-root');
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 300ms';
      setTimeout(() => el.remove(), 320);
    }, 4200);
  }
  window.toast = toast;
  window.askText = askText;
  window.switchTab = switchTab;
  window.openImageModal = openImageModal;
})();
