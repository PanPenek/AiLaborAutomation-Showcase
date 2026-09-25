(function() {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [ ...root.querySelectorAll(sel) ];
  const esc = s => U.escapeHtml(s);
  const ROLES = [ [ 'vision', 'Vision / QC', 'Inspects generated images. Needs a vision-capable model that will not refuse on your content.' ], [ 'ideation', 'Prompt writing', 'The Prompt Lab, Auto mode and the Overseer. Text only — a fast hosted writer is a large speed win here.' ], [ 'metadata', 'Title / description / tags', 'DeviantArt submission metadata. Text only, cheap, and the highest-volume text call in the app.' ], [ 'overseer', 'Overseer', 'The chat that runs the app. Text only, very low volume — this is the one role where paying for a better model is cheap, because it decides what the other three are asked to do.' ] ];
  const EFFORT_OPTIONS = [ [ 'auto', 'provider default' ], [ 'none', 'off (cheapest)' ], [ 'minimal', 'minimal' ], [ 'low', 'low' ], [ 'medium', 'medium' ], [ 'high', 'high' ] ];
  const EFFORT_DEFAULTS = {
    vision: 'auto',
    ideation: 'none',
    metadata: 'none',
    overseer: 'none'
  };
  const THINK_LABEL = {
    vision: 'QC thinking',
    ideation: 'Prompt thinking',
    metadata: 'Metadata thinking',
    overseer: 'Overseer thinking'
  };
  const THINK_HINT = {
    vision: 'Leave on. The QC prompt asks the inspector to count fingers and limbs before it scores, and a model with no room to do that rubber-stamps everything.',
    ideation: 'Off is cheaper and measured no worse: 2,716 output tokens with thinking vs 305 without, for four prompts that landed closer to the requested length.',
    metadata: 'Off. Titles, descriptions and tags are a shape to fill in, not a problem to solve — measured 10,682 output tokens against 670 for the same six-image batch.',
    overseer: 'Off. Benchmarked over 187 live calls (tools/overseer_bench.mjs): off, low and medium all scored 12/12 on unambiguous tasks, and not one of them ever acted destructively on a vague request like "get rid of the bad ones" — every arm listed the cards first. Thinking bought nothing, for 10-17x the output tokens and 5-8x the wait. Choosing a tool here is reading, not reasoning.'
  };
  function effortOf(p, role) {
    const raw = p && p.reasoningEffort;
    const pick = v => {
      const s = String(v == null ? '' : v).trim().toLowerCase();
      return EFFORT_OPTIONS.some(([o]) => o === s) ? s : null;
    };
    if (raw && typeof raw === 'object') return pick(raw[role]) || EFFORT_DEFAULTS[role];
    if (typeof raw === 'string') return pick(raw) || EFFORT_DEFAULTS[role];
    return EFFORT_DEFAULTS[role];
  }
  const PRESETS = [ {
    g: 'Hosted — API key',
    kind: 'openai',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    vision: true,
    note: 'free tier, no card, fastest of the lot'
  }, {
    g: 'Hosted — API key',
    kind: 'openai',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    vision: true,
    note: 'one key, many models — roster churns'
  }, {
    g: 'Hosted — API key',
    kind: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    vision: true,
    note: 'paid'
  }, {
    g: 'Hosted — API key',
    kind: 'openai',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    vision: false,
    note: 'very cheap text'
  }, {
    g: 'Hosted — API key',
    kind: 'openai',
    name: 'DeepInfra',
    baseUrl: 'https://api.deepinfra.com/v1/openai',
    vision: true,
    note: 'cheap open-weight hosting'
  }, {
    g: 'Hosted — API key',
    kind: 'openai',
    name: 'Together',
    baseUrl: 'https://api.together.xyz/v1',
    vision: true,
    note: 'cheap open-weight hosting'
  }, {
    g: 'Hosted — API key',
    kind: 'openai',
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    vision: true,
    note: ''
  }, {
    g: 'Hosted — API key',
    kind: 'openai',
    name: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    vision: false,
    note: 'text only, extremely fast'
  }, {
    g: 'Subscription — a signed-in CLI on this PC',
    kind: 'cli',
    name: 'Claude Code',
    command: 'claude',
    args: [ '-p', '--output-format', 'json', '--model', '{{model}}' ],
    promptVia: 'stdin',
    vision: false,
    roles: {
      ideation: true,
      metadata: true,
      overseer: true
    },
    note: 'Claude Pro / Max — model box takes an alias like opus or sonnet'
  }, {
    g: 'Subscription — a signed-in CLI on this PC',
    kind: 'cli',
    name: 'Codex CLI',
    command: 'codex',
    args: [ 'exec', '--json', '-' ],
    promptVia: 'stdin',
    vision: false,
    roles: {
      ideation: true,
      metadata: true,
      overseer: true
    },
    note: 'ChatGPT Plus / Pro'
  }, {
    g: 'Subscription — a signed-in CLI on this PC',
    kind: 'cli',
    name: 'Gemini CLI',
    command: 'gemini',
    args: [ '-m', '{{model}}' ],
    promptVia: 'stdin',
    vision: false,
    roles: {
      ideation: true,
      metadata: true,
      overseer: true
    },
    note: 'free Google account tier or AI Pro'
  }, {
    g: 'Subscription — a signed-in CLI on this PC',
    kind: 'cli',
    name: 'Qwen Code',
    command: 'qwen',
    args: [ '-m', '{{model}}' ],
    promptVia: 'stdin',
    vision: false,
    roles: {
      ideation: true,
      metadata: true,
      overseer: true
    },
    note: 'generous free tier'
  }, {
    g: 'Subscription — a signed-in CLI on this PC',
    kind: 'cli',
    name: 'OpenCode',
    command: 'opencode',
    args: [ 'run', '-m', '{{model}}', '{{prompt}}' ],
    promptVia: 'arg',
    vision: false,
    roles: {
      ideation: true,
      metadata: true,
      overseer: true
    },
    note: 'whatever you signed OpenCode into — Zen, Copilot, a Claude plan'
  }, {
    g: 'Subscription — a signed-in CLI on this PC',
    kind: 'cli',
    name: 'Custom command',
    command: '',
    args: [ '{{prompt}}' ],
    promptVia: 'stdin',
    vision: false,
    roles: {
      metadata: true
    },
    note: 'any CLI that answers on stdout'
  }, {
    g: 'Local bridge — no key',
    kind: 'openai',
    name: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    vision: true,
    auth: 'none',
    note: 'whatever you have pulled'
  }, {
    g: 'Local bridge — no key',
    kind: 'openai',
    name: 'llama.cpp / second LM Studio',
    baseUrl: 'http://localhost:8080/v1',
    vision: true,
    auth: 'none',
    note: ''
  }, {
    g: 'Local bridge — no key',
    kind: 'openai',
    name: 'LiteLLM proxy',
    baseUrl: 'http://localhost:4000/v1',
    vision: true,
    auth: 'none',
    note: 'one endpoint in front of many'
  }, {
    g: 'Local bridge — no key',
    kind: 'openai',
    name: 'Custom endpoint',
    baseUrl: '',
    vision: true,
    note: 'any OpenAI-compatible URL'
  } ];
  let routes = {};
  let modelCache = {};
  let probeCache = {};
  const isCli = p => (p && p.kind) === 'cli';
  function tokenizeArgs(line) {
    const out = [];
    const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let m;
    while (m = re.exec(String(line || ''))) out.push(m[1] ?? m[2] ?? m[3]);
    return out;
  }
  const joinArgs = args => (args || []).map(a => /\s/.test(a) ? `"${a}"` : a).join(' ');
  function parseHeaders(text) {
    const out = {};
    for (const line of String(text || '').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf(':');
      if (i <= 0) continue;
      out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
    return out;
  }
  const formatHeaders = obj => Object.entries(obj || {}).map(([k, v]) => `${k}: ${v}`).join('\n');
  const Providers = {
    list() {
      return State.settings && State.settings.providers || [];
    },
    routing() {
      return State.settings && State.settings.routing || {};
    },
    async save(providers) {
      State.settings = await window.ala.settings.patch({
        providers: providers
      });
      await this.refreshRoutes();
    },
    async saveRouting(routing) {
      State.settings = await window.ala.settings.patch({
        routing: routing
      });
      await this.refreshRoutes();
    },
    async refreshRoutes() {
      routes = await window.ala.llm.routes().catch(() => ({}));
      renderRouting();
      paintRowStatus();
    },
    async render() {
      renderProviders();
      renderRouting();
      await this.refreshRoutes();
      probeAllCommands();
    }
  };
  function renderProviders() {
    const root = $('#panel-providers');
    if (!root) return;
    const providers = Providers.list();
    const groups = [ ...new Set(PRESETS.map(p => p.g)) ];
    root.innerHTML = `\n      <h3>Engines</h3>\n      <div class="hint">Three ways to get a model, mixed freely in the chains below.\n        <b>Hosted</b> endpoints bill per token against an API key.\n        <b>Subscription</b> engines are agent CLIs already installed and signed in on this PC —\n        Claude Code, Codex, Gemini, Qwen, OpenCode — so a call through one costs nothing beyond the\n        monthly fee you already pay. <b>Local bridges</b> are OpenAI-compatible servers on this\n        machine that need no key at all.\n        Keys live in <code>settings.json</code> in plain text unless you name an environment\n        variable instead, which is the better habit — a subscription CLI stores no key here at all,\n        which is the quiet second reason to prefer one.</div>\n      <div class="prov-list" id="prov-list">\n        ${providers.length ? providers.map(providerRow).join('') : `<div class="hint">No extra engines yet — everything runs on LM Studio. Add one below.</div>`}\n      </div>\n      <div class="fld-row" style="margin-top:12px">\n        <label class="fld" style="max-width:340px;margin:0"><span>Add an engine</span>\n          <select id="prov-preset">\n            ${groups.map(g => `<optgroup label="${esc(g)}">${PRESETS.map((p, i) => [ p, i ]).filter(([p]) => p.g === g).map(([p, i]) => `<option value="${i}">${esc(p.name)}${p.note ? ` — ${esc(p.note)}` : ''}</option>`).join('')}</optgroup>`).join('')}\n          </select>\n        </label>\n        <button class="btn primary" id="btn-prov-add">+ Add</button>\n      </div>`;
    wireProviders();
    paintRowStatus();
  }
  function providerRow(p, i) {
    return `\n    <div class="prov-row ${p.enabled === false ? 'off' : ''} ${isCli(p) ? 'cli' : ''}" data-pid="${esc(p.id)}" data-kind="${isCli(p) ? 'cli' : 'openai'}">\n      <div class="prov-head">\n        <input class="prov-name" type="text" data-f="name" value="${esc(p.name || '')}" placeholder="Name" />\n        <span class="p-tag">${isCli(p) ? 'subscription · command' : 'endpoint'}</span>\n        <span class="prov-state" data-state></span>\n        <label class="prov-flag"><input type="checkbox" data-f="enabled" ${p.enabled === false ? '' : 'checked'} /> on</label>\n        <label class="prov-flag" title="${isCli(p) ? 'Only tick this if the command can read an image file — put {{imagePath}} in the arguments so it is told where the image is.' : 'Untick for a text-only endpoint — it will never be offered the vision role.'}"><input type="checkbox" data-f="vision" ${p.vision ? 'checked' : ''} /> vision</label>\n        <button class="btn ghost small" data-move="up" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>\n        <button class="btn ghost small" data-move="down" title="Move down">↓</button>\n        <button class="btn ghost small" data-del title="Remove this engine">✕</button>\n      </div>\n      ${isCli(p) ? cliBody(p) : endpointBody(p)}\n      <div class="hint" data-result></div>\n    </div>`;
  }
  function endpointBody(p) {
    const models = p.models || {};
    const noAuth = p.auth === 'none';
    const short = Number(p.timeoutSec) < 90;
    return `\n      <div class="fld-row">\n        <label class="fld" style="flex:2;margin-bottom:8px"><span>Base URL</span>\n          <input type="text" data-f="baseUrl" value="${esc(p.baseUrl || '')}" placeholder="https://api.example.com/v1" /></label>\n        <label class="fld" style="flex:1;margin-bottom:8px"><span>API key</span>\n          <input type="password" data-f="apiKey" value="${esc(p.apiKey || '')}"\n            placeholder="${noAuth ? 'not needed' : p.apiKeyEnv ? 'using the env var →' : 'plain text on disk'}"\n            ${p.apiKeyEnv || noAuth ? 'disabled' : ''} /></label>\n        <label class="fld" style="flex:1;margin-bottom:8px"><span>…or env var <em>(wins)</em></span>\n          <input type="text" data-f="apiKeyEnv" value="${esc(p.apiKeyEnv || '')}" placeholder="e.g. GROQ_API_KEY" ${noAuth ? 'disabled' : ''} /></label>\n      </div>\n      <div class="checkbox-row" style="margin:-2px 0 10px">\n        <input type="checkbox" data-f="authNone" ${noAuth ? 'checked' : ''} />\n        <span>No key needed <em>— a bridge on this machine (Ollama, LiteLLM, a second LM Studio). The Authorization header is left off entirely, which some of them reject when it is empty.</em></span>\n      </div>\n      <div class="fld-row">\n        <label class="fld" style="margin-bottom:8px"><span>Vision / QC model</span>\n          <input type="text" data-f="models.vision" list="models-${esc(p.id)}" value="${esc(models.vision || '')}" placeholder="${p.vision ? 'e.g. a llama-4-scout / qwen-vl class model' : 'text-only provider'}" ${p.vision ? '' : 'disabled'} /></label>\n        <label class="fld" style="margin-bottom:8px"><span>Prompt-writing model</span>\n          <input type="text" data-f="models.ideation" list="models-${esc(p.id)}" value="${esc(models.ideation || '')}" placeholder="(leave blank to skip this role)" /></label>\n        <label class="fld" style="margin-bottom:8px"><span>Metadata model</span>\n          <input type="text" data-f="models.metadata" list="models-${esc(p.id)}" value="${esc(models.metadata || '')}" placeholder="(leave blank to skip this role)" /></label>\n        <label class="fld" style="margin-bottom:8px"><span>Overseer model</span>\n          <input type="text" data-f="models.overseer" list="models-${esc(p.id)}" value="${esc(models.overseer || '')}" placeholder="(leave blank to skip this role)" /></label>\n      </div>\n      <datalist id="models-${esc(p.id)}">${(modelCache[p.id] || []).map(m => `<option value="${esc(m)}">`).join('')}</datalist>\n      <div class="fld-row">\n        ${[ 'vision', 'ideation', 'metadata', 'overseer' ].map(role => `\n        <label class="fld slim" style="margin-bottom:0"><span>${THINK_LABEL[role]}</span>\n          <select data-f="effort.${role}" ${role === 'vision' && !p.vision ? 'disabled' : ''}\n            title="${esc(THINK_HINT[role])}">\n            ${EFFORT_OPTIONS.map(([v, t]) => `<option value="${v}" ${effortOf(p, role) === v ? 'selected' : ''}>${t}</option>`).join('')}\n          </select></label>`).join('')}\n      </div>\n      <div class="hint" style="margin-top:2px">Thinking tokens are billed as output. A six-image\n        metadata batch measured <b>10,682</b> output tokens with thinking on and <b>670</b> with it off —\n        same JSON, 14x faster. Leave it on for QC, where counting fingers out loud <em>is</em> the\n        inspection. A provider that does not understand the setting is detected on its first\n        400 and never sent it again.</div>\n      <details class="fold"><summary>Extra headers <em>— optional</em></summary>\n        <div class="note">One <code>Name: value</code> per line. "OpenAI-compatible" stops at the request\n          body: OpenRouter attributes traffic by <code>HTTP-Referer</code> and <code>X-Title</code>, and some\n          self-hosted gateways authenticate on a header of their own instead of Bearer.</div>\n        <label class="fld"><span>Headers</span>\n          <textarea rows="3" data-f="headersText" placeholder="HTTP-Referer: https://example.com">${esc(formatHeaders(p.headers))}</textarea></label>\n      </details>\n      <div class="fld-row">\n        <label class="fld slim" style="margin-bottom:0"><span>At once</span>\n          <input type="number" min="1" max="16" data-f="maxConcurrency" value="${Number(p.maxConcurrency) || 4}" /></label>\n        <label class="fld slim" style="margin-bottom:0"><span>Timeout (s)${short ? ' <em class="warn">low</em>' : ''}</span>\n          <input type="number" min="5" max="900" data-f="timeoutSec" value="${Number(p.timeoutSec) || 60}"\n            title="A 6-image batch-metadata call on a hosted reasoning model was measured at 49 s. Anything under ~90 s will abort mid-call and fall through to the next provider." /></label>\n        <label class="fld slim" style="margin-bottom:0;max-width:130px"><span>Max out tokens</span>\n          <input type="number" min="256" max="200000" step="256" data-f="maxOutputTokens" value="${Number(p.maxOutputTokens) || 8192}" /></label>\n        <button class="btn small" data-act="models">Fetch models</button>\n        ${p.vision ? `<button class="btn small" data-act="test-vision">Test on a real image</button>` : ''}\n        <button class="btn small" data-act="test-text">Test text</button>\n      </div>\n      ${short ? `<div class="hint err" style="margin-top:6px">A timeout this short will\n        abort long calls and silently hand them to the next provider — batch metadata for six images\n        measured <b>49 s</b> on a hosted reasoning model. 120 s is a safer floor.</div>` : ''}`;
  }
  function cliBody(p) {
    const roles = p.roles || {};
    const probe = probeCache[p.id];
    return `\n      <div class="fld-row">\n        <label class="fld" style="flex:1;margin-bottom:8px"><span>Command</span>\n          <input type="text" data-f="command" value="${esc(p.command || '')}" placeholder="claude" spellcheck="false" /></label>\n        <label class="fld" style="flex:3;margin-bottom:8px"><span>Arguments</span>\n          <input type="text" data-f="argsText" value="${esc(joinArgs(p.args))}" placeholder="-p --output-format json" spellcheck="false" /></label>\n        <label class="fld slim" style="margin-bottom:8px;max-width:150px"><span>Prompt goes</span>\n          <select data-f="promptVia">\n            <option value="stdin" ${(p.promptVia || 'stdin') === 'stdin' ? 'selected' : ''}>down stdin</option>\n            <option value="arg" ${p.promptVia === 'arg' ? 'selected' : ''}>as an argument</option>\n          </select></label>\n      </div>\n      <div class="hint ${probe ? probe.ok ? 'ok' : 'err' : ''}" data-probe>${probe ? probe.ok ? `Found: <code>${esc(probe.path)}</code>` : esc(probe.error) : 'Checking whether that command exists…'}</div>\n      <div class="note" style="margin-top:8px"><b>{{prompt}}</b> is where the prompt goes when it is an\n        argument, <b>{{model}}</b> is the model box below, <b>{{imagePath}}</b> is a temporary file holding\n        the image for a vision call. An unfilled placeholder takes its flag with it, so\n        <code>-m {{model}}</code> with no model set disappears rather than leaving a bare\n        <code>-m</code> to swallow the next argument.\n        <br>Down stdin is the default and the safer one: the prompt is a paragraph full of quotes and\n        braces, and sending it through a command line is how it gets mangled.</div>\n      <div class="fld-row" style="margin-top:10px">\n        <label class="fld" style="max-width:220px;margin-bottom:8px"><span>Model or alias <em>(optional)</em></span>\n          <input type="text" data-f="model" value="${esc(p.model || '')}" placeholder="(the CLI's own default)" /></label>\n        <label class="fld" style="flex:1;margin-bottom:8px"><span>Working directory <em>(optional)</em></span>\n          <input type="text" data-f="cwd" value="${esc(p.cwd || '')}" placeholder="(a temp folder — keeps the agent away from your projects)" spellcheck="false" /></label>\n      </div>\n      <div class="fld-row" style="align-items:center;gap:16px;margin-bottom:8px">\n        <span class="hint" style="margin:0">Use it for:</span>\n        ${ROLES.map(([role, label]) => `\n          <label class="prov-flag"><input type="checkbox" data-f="roles.${role}" ${roles[role] ? 'checked' : ''}\n            ${role === 'vision' && !p.vision ? 'disabled' : ''} /> ${esc(label)}</label>`).join('')}\n      </div>\n      <div class="note">A command has no per-role model list to switch it on and off with, so these ticks are\n        the switch. Without them an engine added to write titles would quietly end up in the QC chain too —\n        every configured engine gets tried for every role it has not been excluded from.</div>\n      <div class="fld-row" style="margin-top:10px">\n        <label class="fld slim" style="margin-bottom:0"><span>At once</span>\n          <input type="number" min="1" max="8" data-f="maxConcurrency" value="${Number(p.maxConcurrency) || 2}"\n            title="Each call is a whole agent process with its own memory. Two or three is plenty; six is a machine-load problem." /></label>\n        <label class="fld slim" style="margin-bottom:0"><span>Timeout (s)</span>\n          <input type="number" min="30" max="1800" data-f="timeoutSec" value="${Number(p.timeoutSec) || 300}"\n            title="These boot a runtime and an agent loop before the model is even called — measured at 2s for a trivial answer, but a cold start plus a long batch is minutes." /></label>\n        <button class="btn small" data-act="probe">Check command</button>\n        ${p.vision ? `<button class="btn small" data-act="test-vision">Test on a real image</button>` : ''}\n        <button class="btn small" data-act="test-text">Test text</button>\n      </div>`;
  }
  function readProviders() {
    return $$('#prov-list .prov-row').map(row => {
      const prev = Providers.list().find(p => p.id === row.dataset.pid) || {};
      const get = f => $(`[data-f="${f}"]`, row);
      const val = f => {
        const el = get(f);
        return el ? el.value : '';
      };
      const num = (f, d) => Number(val(f)) || d;
      const checked = f => {
        const el = get(f);
        return el ? el.checked : false;
      };
      const base = {
        ...prev,
        id: row.dataset.pid,
        name: val('name').trim() || 'Engine',
        enabled: checked('enabled'),
        vision: checked('vision'),
        maxConcurrency: num('maxConcurrency', row.dataset.kind === 'cli' ? 2 : 4),
        timeoutSec: num('timeoutSec', row.dataset.kind === 'cli' ? 300 : 60)
      };
      if (row.dataset.kind === 'cli') {
        return {
          ...base,
          kind: 'cli',
          command: val('command').trim(),
          args: tokenizeArgs(val('argsText')),
          promptVia: val('promptVia') === 'arg' ? 'arg' : 'stdin',
          model: val('model').trim(),
          cwd: val('cwd').trim(),
          roles: {
            vision: checked('roles.vision'),
            ideation: checked('roles.ideation'),
            metadata: checked('roles.metadata'),
            overseer: checked('roles.overseer')
          }
        };
      }
      const noAuth = checked('authNone');
      return {
        ...base,
        kind: 'openai',
        baseUrl: val('baseUrl').trim(),
        auth: noAuth ? 'none' : 'key',
        apiKey: get('apiKey') && !get('apiKey').disabled ? val('apiKey') : prev.apiKey || '',
        apiKeyEnv: val('apiKeyEnv').trim(),
        headers: parseHeaders(val('headersText')),
        models: {
          vision: val('models.vision').trim(),
          ideation: val('models.ideation').trim(),
          metadata: val('models.metadata').trim(),
          overseer: val('models.overseer').trim()
        },
        maxOutputTokens: num('maxOutputTokens', 8192),
        reasoningEffort: {
          vision: val('effort.vision') || 'auto',
          ideation: val('effort.ideation') || 'auto',
          metadata: val('effort.metadata') || 'auto',
          overseer: val('effort.overseer') || 'auto'
        }
      };
    });
  }
  function wireProviders() {
    const list = $('#prov-list');
    if (!list) return;
    list.addEventListener('change', async e => {
      const row = e.target.closest('.prov-row');
      if (!row || !e.target.dataset.f) return;
      const structural = [ 'enabled', 'vision', 'apiKeyEnv', 'authNone' ].includes(e.target.dataset.f);
      await Providers.save(readProviders());
      if (e.target.dataset.f === 'command') probeRow(row);
      if (structural) {
        renderProviders();
        probeAllCommands();
      }
    });
    list.addEventListener('click', async e => {
      const row = e.target.closest('.prov-row');
      if (!row) return;
      const id = row.dataset.pid;
      if (e.target.closest('[data-del]')) {
        const p = Providers.list().find(x => x.id === id);
        if (!confirm(`Remove "${p ? p.name : id}"? Any role routed to it falls through to the next engine.`)) return;
        const providers = readProviders().filter(x => x.id !== id);
        const routing = {
          ...Providers.routing()
        };
        for (const [role] of ROLES) routing[role] = (routing[role] || []).filter(x => x !== id);
        await Providers.save(providers);
        await Providers.saveRouting(routing);
        renderProviders();
        return;
      }
      const move = e.target.closest('[data-move]');
      if (move) {
        const providers = readProviders();
        const i = providers.findIndex(x => x.id === id);
        const j = move.dataset.move === 'up' ? i - 1 : i + 1;
        if (i < 0 || j < 0 || j >= providers.length) return;
        [providers[i], providers[j]] = [ providers[j], providers[i] ];
        await Providers.save(providers);
        renderProviders();
        probeAllCommands();
        return;
      }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'models') return fetchModels(row, act);
      if (act.dataset.act === 'probe') return probeRow(row, true);
      if (act.dataset.act === 'test-vision') return testProvider(row, act, 'vision');
      if (act.dataset.act === 'test-text') return testProvider(row, act, 'metadata');
    });
    $('#btn-prov-add')?.addEventListener('click', async () => {
      const preset = PRESETS[Number($('#prov-preset').value) || 0];
      const common = {
        id: `p-${U.uid()}`,
        name: preset.name.startsWith('Custom') ? 'New engine' : preset.name,
        kind: preset.kind,
        enabled: true,
        vision: !!preset.vision
      };
      const fresh = preset.kind === 'cli' ? {
        ...common,
        command: preset.command || '',
        args: [ ...preset.args || [] ],
        promptVia: preset.promptVia || 'stdin',
        model: '',
        cwd: '',
        roles: {
          ...preset.roles || {}
        },
        timeoutSec: 300,
        maxConcurrency: 2
      } : {
        ...common,
        baseUrl: preset.baseUrl || '',
        auth: preset.auth === 'none' ? 'none' : 'key',
        apiKey: '',
        apiKeyEnv: '',
        headers: {},
        models: {
          vision: '',
          ideation: '',
          metadata: ''
        },
        timeoutSec: 120,
        maxConcurrency: 4,
        maxOutputTokens: 8192,
        reasoningEffort: {
          ...EFFORT_DEFAULTS
        }
      };
      await Providers.save([ ...readProviders(), fresh ]);
      renderProviders();
      probeAllCommands();
      const last = $('#prov-list .prov-row:last-child');
      $(preset.kind === 'cli' ? '[data-f="command"]' : '[data-f="baseUrl"]', last)?.focus();
    });
  }
  async function probeRow(row, verbose = false) {
    const el = $('[data-probe]', row);
    const id = row.dataset.pid;
    if (!el || row.dataset.kind !== 'cli') return;
    const command = ($('[data-f="command"]', row) || {}).value || '';
    if (!command.trim()) {
      probeCache[id] = {
        ok: false,
        error: 'No command set yet.'
      };
    } else {
      el.textContent = 'Checking…';
      el.className = 'hint';
      probeCache[id] = await window.ala.llm.probeCommand(command).catch(e => ({
        ok: false,
        error: e.message
      }));
    }
    const probe = probeCache[id];
    el.innerHTML = probe.ok ? `Found: <code>${esc(probe.path)}</code>${probe.kind && probe.kind !== 'executable' ? ` <em>(${esc(probe.kind)})</em>` : ''}` : esc(probe.error);
    el.className = 'hint ' + (probe.ok ? 'ok' : 'err');
    if (verbose && probe.ok) {
      const out = $('[data-result]', row);
      if (out) {
        out.innerHTML = 'The command exists. That is all this checks — press <b>Test text</b> to find out whether it answers, and whether it is signed in.';
        out.className = 'hint';
      }
    }
  }
  function probeAllCommands() {
    for (const row of $$('#prov-list .prov-row[data-kind="cli"]')) probeRow(row);
  }
  async function fetchModels(row, btn) {
    const out = $('[data-result]', row);
    const id = row.dataset.pid;
    btn.disabled = true;
    out.textContent = 'Reading the model list…';
    out.className = 'hint';
    try {
      await Providers.save(readProviders());
      const models = await window.ala.llm.models(id);
      modelCache[id] = models;
      const dl = $(`#models-${CSS.escape(id)}`, row);
      if (dl) dl.innerHTML = models.map(m => `<option value="${esc(m)}">`).join('');
      out.textContent = `${models.length} model(s) available — the model fields autocomplete from this list now.`;
      out.className = 'hint ok';
    } catch (e) {
      out.textContent = 'Could not read the model list: ' + e.message;
      out.className = 'hint err';
    } finally {
      btn.disabled = false;
    }
  }
  async function testProvider(row, btn, role) {
    const out = $('[data-result]', row);
    const id = row.dataset.pid;
    const cli = row.dataset.kind === 'cli';
    btn.disabled = true;
    out.className = 'hint';
    try {
      await Providers.save(readProviders());
      let payload = {
        providerId: id,
        role: role
      };
      if (role === 'vision') {
        const sample = State.library.find(c => c.fname && c.status !== 'discarded') || State.library[0];
        if (!sample) {
          out.textContent = 'No images in the library yet — generate a turn first, then test the vision role.';
          out.className = 'hint err';
          return;
        }
        out.textContent = `Sending "${sample.fname}" to ${cli ? 'the command' : 'the endpoint'}…`;
        const base64 = await window.ala.files.readImageBase64(sample.fname);
        payload = {
          ...payload,
          base64: base64,
          mime: sample.mime || 'image/jpeg',
          prompt: PromptT.qc(sample.prompt)
        };
      } else {
        out.textContent = cli ? 'Running the command — a cold start takes a few seconds…' : 'Asking for one piece of metadata…';
        payload.prompt = PromptT.metadata({
          prompt: 'a fox spirit exploring a moonlit bamboo forest, steam, soft rim light, three-quarter view',
          exampleStyle: '',
          maxTags: 6
        });
      }
      const res = await window.ala.llm.testProvider(payload);
      const secs = res.latencyMs ? (res.latencyMs / 1e3).toFixed(1) + 's' : '—';
      if (res.ok) {
        out.innerHTML = role === 'vision' ? `<b>Works.</b> ${esc(res.model || res.command || '')} inspected the image in <b>${secs}</b> and scored it ${esc(String(res.score ?? '—'))}/10.\n             Local QC on this box takes 57–290 s.` : `<b>Works.</b> ${esc(res.model || res.command || '')} answered in <b>${secs}</b> with parseable JSON.\n             ${cli ? 'Route the text roles here and they stop costing tokens and stop waiting on the GPU.' : 'Route the text roles here and title/description/tags stop waiting on the GPU.'}`;
        out.className = 'hint ok';
      } else if (res.refused) {
        out.innerHTML = `<b>Refused.</b> ${esc(res.model || res.command || '')} declined (${esc(secs)}).\n          ${role === 'vision' ? 'Try another model or engine — or leave this role on local, which never refuses.' : ''}\n          Reply began: “${esc(res.sample || '')}”`;
        out.className = 'hint err';
      } else {
        out.innerHTML = `<b>Failed.</b> ${esc(res.error || 'unknown')}${res.sample ? ` — reply began: “${esc(res.sample)}”` : ''}` + (cli && (res.stdout || res.stderr) ? `<details class="fold" style="margin-top:6px"><summary>What the command printed</summary>\n                 <pre class="raw-out">${esc((res.stdout || '') + (res.stderr ? '\n--- stderr ---\n' + res.stderr : ''))}</pre></details>` : '') + (cli && /not logged in|login|not usable|authenticat/i.test(res.error || '') ? `<div class="note warn" style="margin-top:6px">That is a sign-in problem, not a wiring problem.\n                 Open a terminal, run the command on its own, sign in there, and test again — this app runs it\n                 as you and reuses the session it finds.</div>` : '');
        out.className = 'hint err';
      }
    } catch (e) {
      out.textContent = 'Test failed: ' + e.message;
      out.className = 'hint err';
    } finally {
      btn.disabled = false;
      Providers.refreshRoutes();
    }
  }
  function paintRowStatus() {
    for (const row of $$('#prov-list .prov-row')) {
      const id = row.dataset.pid;
      const el = $('[data-state]', row);
      if (!el) continue;
      const serves = [];
      const blocked = [];
      for (const [role, label] of ROLES) {
        const r = routes[role];
        if (!r) continue;
        const entry = (r.order || []).find(x => x.id === id);
        if (!entry) continue;
        if (entry.eligible) serves.push(`${label}${r.chain[0] && r.chain[0].id === id ? ' (first)' : ''}`); else blocked.push(`${label}: ${entry.reason}`);
      }
      el.textContent = serves.length ? serves.join(' · ') : blocked[0] || 'not routed';
      el.className = 'prov-state ' + (serves.length ? 'ok' : 'off');
      el.title = blocked.join('\n');
    }
  }
  function renderRouting() {
    const root = $('#panel-routing');
    if (!root) return;
    const fallbackLocal = Providers.routing().fallbackLocal !== false;
    root.innerHTML = `\n      <h3>Role routing &amp; fallback</h3>\n      <div class="hint">Each role is tried top to bottom. An engine that errors, rate-limits, or\n        <b>refuses</b> hands the call straight to the next one, and the card records which one\n        actually answered. Three consecutive refusals from the same engine on the same role open a\n        circuit for the rest of the session, so a model that will not touch your content stops\n        costing a round trip per image.\n        <br>A subscription command that has been signed out counts as an error, not an answer —\n        it falls through instead of writing “Please run /login” onto a card.</div>\n      <div class="checkbox-row" style="margin-top:10px">\n        <input type="checkbox" id="route-local-last" ${fallbackLocal ? 'checked' : ''} />\n        <span>Always keep <b>LM Studio</b> at the end of every chain <em>— slow, but it never refuses and never rate-limits</em></span>\n      </div>\n      ${ROLES.map(([role, label, note]) => routeBlock(role, label, note)).join('')}`;
    $('#route-local-last')?.addEventListener('change', e => Providers.saveRouting({
      ...Providers.routing(),
      fallbackLocal: e.target.checked
    }));
    if (root.dataset.wired) return;
    root.dataset.wired = '1';
    root.addEventListener('click', async e => {
      const btn = e.target.closest('[data-rmove]');
      if (!btn) return;
      const role = btn.dataset.role;
      const id = btn.dataset.rmove;
      const order = (routes[role]?.order || []).map(x => x.id);
      const i = order.indexOf(id);
      const j = btn.dataset.dir === 'up' ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= order.length) return;
      [order[i], order[j]] = [ order[j], order[i] ];
      await Providers.saveRouting({
        ...Providers.routing(),
        [role]: order
      });
    });
  }
  const TIER_BADGE = {
    cloud: '<span class="src-badge">cloud</span>',
    sub: '<span class="src-badge deviantart" title="A CLI on this PC, paid for by a subscription — no tokens billed">subscription</span>'
  };
  function routeBlock(role, label, note) {
    const r = routes[role];
    const rows = r && r.order || [];
    return `\n    <div class="route-block">\n      <h4>${esc(label)}</h4>\n      <div class="hint">${esc(note)}</div>\n      ${rows.length ? rows.map((x, i) => `\n        <div class="route-row ${x.eligible ? '' : 'dead'}">\n          <span class="route-pos">${x.eligible ? `${r.chain.findIndex(c => c.id === x.id) + 1}.` : '—'}</span>\n          <span class="route-name">${esc(x.name)} ${TIER_BADGE[x.tier] || ''}</span>\n          <span class="route-model">${x.eligible ? esc(x.model || x.command || '(its own default)') : esc(x.reason)}</span>\n          ${x.open ? `<span class="src-badge none" title="Refused ${x.refusals}× this session — skipped until settings change">circuit open</span>` : ''}\n          <button class="btn ghost small" data-rmove="${esc(x.id)}" data-role="${role}" data-dir="up" ${i === 0 ? 'disabled' : ''}>↑</button>\n          <button class="btn ghost small" data-rmove="${esc(x.id)}" data-role="${role}" data-dir="down" ${i === rows.length - 1 ? 'disabled' : ''}>↓</button>\n        </div>`).join('') : `<div class="hint">Nothing configured for this role.</div>`}\n      ${r && !r.chain.length ? `<div class="hint err">Nothing can serve this role right now — calls will fail until an engine is fixed or LM Studio is put back in the chain.</div>` : ''}\n    </div>`;
  }
  window.Providers = Providers;
})();
