(function() {
  const ORIGIN = 'https://www.pixiv.net';
  const UPLOAD_PAGE = ORIGIN + '/illustration/create';
  const MAX_BYTES = 32 * 1024 * 1024;
  const NAV_TIMEOUT_MS = 45e3;
  const POLL_INTERVAL_MS = 1e3;
  const POLL_MAX_TRIES = 90;
  const HUMAN_CHECK_RE = /recaptcha|captcha|are ?you ?a ?human|bot ?check/i;
  const HUMAN_CHECK_MSG = 'pixiv now asks for a human check when a picture is uploaded, so it ' + 'will not accept an automatic post. Press “Prepare on pixiv” — the app fills the real ' + 'upload form for you and you press Post.';
  const FIELD_SELECTORS = {
    image: [ 'input[type=file]' ],
    title: [ 'input[name="title"]', 'input[placeholder*="タイトル"]', 'input[aria-label*="title" i]', 'input[placeholder*="title" i]' ],
    caption: [ 'textarea[name="caption"]', 'textarea[name="comment"]', 'textarea[placeholder*="キャプション"]', 'textarea[aria-label*="caption" i]', 'textarea[aria-label*="description" i]', 'div[contenteditable="true"]', 'textarea' ],
    tags: [ 'input[name="tag"]', 'input[placeholder*="タグ"]', 'input[aria-label*="tag" i]', 'input[placeholder*="tag" i]' ]
  };
  const RADIO_GROUPS = [ [ 'x_restrict', 'xRestrict', 'age rating', true ], [ 'ai_type', 'aiType', 'AI declaration', true ], [ 'restrict', 'restrict', 'who can see it', false ], [ 'original', 'original', 'original work', false ] ];
  let wv = null;
  const IDENTITY_JS = `(() => {\n    const out = { token: null, userId: null, username: null, url: location.href };\n    try {\n      const meta = document.querySelector('meta[name="global-data"]');\n      if (meta && meta.content) {\n        const g = JSON.parse(meta.content);\n        if (g.token) out.token = String(g.token);\n        if (g.userData && g.userData.id) {\n          out.userId = String(g.userData.id);\n          out.username = g.userData.pixivId || g.userData.name || null;\n        }\n      }\n    } catch (e) { out.parseError = e.message; }\n    const html = document.documentElement.innerHTML;\n    const grab = (patterns) => {\n      for (const re of patterns) { const m = html.match(re); if (m) return m[1]; }\n      return null;\n    };\n    if (!out.token) {\n      out.token = grab([\n        /\\\\?"token\\\\?"\\s*:\\s*\\\\?"([0-9a-zA-Z_-]{16,64})\\\\?"/,\n        /\\\\?"csrfToken\\\\?"\\s*:\\s*\\\\?"([0-9a-zA-Z_-]{16,64})\\\\?"/,\n      ]);\n    }\n    if (!out.userId) {\n      out.userId = grab([\n        /\\\\?"user_id\\\\?"\\s*:\\s*\\\\?"(\\d{2,})\\\\?"/,\n        /\\\\?"userId\\\\?"\\s*:\\s*\\\\?"(\\d{2,})\\\\?"/,\n      ]);\n    }\n    if (!out.username) {\n      out.username = grab([\n        /\\\\?"pixivId\\\\?"\\s*:\\s*\\\\?"([^"\\\\]{1,40})\\\\?"/,\n        /\\\\?"userName\\\\?"\\s*:\\s*\\\\?"([^"\\\\]{1,40})\\\\?"/,\n      ]);\n    }\n    out.loginPage = /accounts\\.pixiv\\.net|\\/login/.test(location.href);\n    return out;\n  })()`;
  const PROBE_JS = `(() => {\n    const radios = {};\n    for (const el of document.querySelectorAll('input[type=radio], input[type=checkbox]')) {\n      const name = el.name || '(unnamed)';\n      (radios[name] = radios[name] || []).push({ value: el.value, checked: !!el.checked });\n    }\n    const fields = [...document.querySelectorAll('input[name], select[name], textarea[name]')]\n      .map((el) => ({ name: el.name, tag: el.tagName.toLowerCase(), type: el.type || null }));\n\n    /**\n     * Would a Prepare find what it needs?\n     *\n     * The same selector lists the filler uses, resolved but not touched. This is the whole\n     * value of the Probe button now: the wire contract is settled and pinned by tests, but\n     * the *form* is markup that can be restyled underneath this app at any time, and the\n     * only cheap way to know is to look before there is a picture riding on it.\n     */\n    const SELS = ${JSON.stringify(FIELD_SELECTORS)};\n    const reach = {};\n    for (const key of Object.keys(SELS)) {\n      let hit = null;\n      for (const s of SELS[key]) {\n        let el = null;\n        try { el = document.querySelector(s); } catch (e) { continue; }\n        if (el) { hit = { selector: s, tag: el.tagName.toLowerCase(), name: el.name || null }; break; }\n      }\n      reach[key] = hit;\n    }\n    for (const [domName] of ${JSON.stringify(RADIO_GROUPS)}) {\n      const opts = radios[domName];\n      reach[domName] = opts ? { selector: 'input[name="' + domName + '"]', values: opts.map((o) => o.value) } : null;\n    }\n    return { url: location.href, title: document.title, radios, fields, reach,\n             hasFileInput: !!document.querySelector('input[type=file]') };\n  })()`;
  const Pixiv = {
    last: null,
    attach(webview) {
      wv = webview;
    },
    get attached() {
      return !!wv;
    },
    onPixiv() {
      try {
        return !!wv && /^https:\/\/(www\.)?pixiv\.net\//.test(wv.getURL() || '');
      } catch {
        return false;
      }
    },
    async ready() {
      if (!wv) throw new Error('the Pixiv tab has not loaded yet — open it once');
      if (this.onPixiv()) return true;
      await this.navigate(UPLOAD_PAGE);
      return true;
    },
    navigate(url) {
      if (!wv) return Promise.reject(new Error('no Pixiv tab'));
      return new Promise((resolve, reject) => {
        let done = false;
        const finish = (fn, arg) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          wv.removeEventListener('did-finish-load', ok);
          wv.removeEventListener('did-fail-load', fail);
          fn(arg);
        };
        const ok = () => finish(resolve, true);
        const fail = e => {
          if (e.errorCode === -3) return finish(resolve, true);
          finish(reject, new Error(`could not open ${url}: ${e.errorDescription || e.errorCode}`));
        };
        const timer = setTimeout(() => finish(reject, new Error('timed out loading ' + url)), NAV_TIMEOUT_MS);
        wv.addEventListener('did-finish-load', ok);
        wv.addEventListener('did-fail-load', fail);
        try {
          wv.loadURL(url);
        } catch (e) {
          finish(reject, e);
        }
      });
    },
    exec(js) {
      if (!wv) return Promise.reject(new Error('the Pixiv tab has not loaded yet'));
      return wv.executeJavaScript(js, true);
    },
    async status({navigate: navigate = false} = {}) {
      try {
        if (!wv) return {
          ok: false,
          error: 'the Pixiv tab has not loaded yet — open it once'
        };
        if (navigate && !this.onPixiv()) await this.ready();
        if (!this.onPixiv()) {
          return {
            ok: false,
            error: `the Pixiv tab is on ${short(safeUrl())} — press Reload, or sign in`
          };
        }
        const id = await this.exec(IDENTITY_JS);
        if (!id) return {
          ok: false,
          error: 'the Pixiv page did not answer — reload the tab'
        };
        if (id.loginPage || !id.userId) {
          return {
            ok: false,
            kind: 'auth',
            error: 'not signed in to pixiv — log in on the Pixiv tab'
          };
        }
        if (!id.token) {
          return {
            ok: false,
            kind: 'transient',
            error: 'signed in, but no CSRF token on this page — press Reload'
          };
        }
        return {
          ok: true,
          userId: id.userId,
          username: id.username || null,
          url: id.url
        };
      } catch (e) {
        return {
          ok: false,
          error: e.message
        };
      }
    },
    async probe() {
      await this.ready();
      if (!/\/illustration\/create|upload\.php/.test(safeUrl())) await this.navigate(UPLOAD_PAGE);
      return this.exec(PROBE_JS);
    },
    async post(payload) {
      const {fields: fields = {}, tags: tags = [], fname: fname = 'image.png', mime: mime = 'image/png', base64: base64 = ''} = payload || {};
      if (!base64) return {
        ok: false,
        kind: 'permanent',
        error: 'no image data to post'
      };
      const bytes = Math.floor(base64.length * .75);
      if (bytes > MAX_BYTES) {
        return {
          ok: false,
          kind: 'permanent',
          error: `image is ${(bytes / 1048576).toFixed(1)} MB — pixiv's limit is ${MAX_BYTES / 1048576} MB`
        };
      }
      try {
        await this.ready();
      } catch (e) {
        return {
          ok: false,
          kind: 'transient',
          error: e.message
        };
      }
      const st = await this.status();
      if (!st.ok) return {
        ok: false,
        kind: st.kind || 'auth',
        error: st.error
      };
      this.last = {
        at: Date.now(),
        endpoint: '/ajax/work/create/illustration',
        fields: fields,
        tags: tags,
        status: null,
        body: null
      };
      let res;
      try {
        res = await this.exec(uploadJs({
          fields: fields,
          tags: tags,
          fname: fname,
          mime: mime,
          base64: base64
        }));
      } catch (e) {
        return {
          ok: false,
          kind: 'transient',
          error: 'the Pixiv tab went away mid-upload: ' + e.message
        };
      }
      if (!res) return {
        ok: false,
        kind: 'transient',
        error: 'no answer from the Pixiv tab'
      };
      this.last.status = res.status ?? null;
      this.last.body = String(res.raw || '').slice(0, 2e3);
      if (res.ok && res.illustId) {
        return {
          ok: true,
          illustId: String(res.illustId),
          url: `${ORIGIN}/artworks/${res.illustId}`,
          raw: res.raw
        };
      }
      const error = res.error || `pixiv returned HTTP ${res.status} with nothing usable in it`;
      if (HUMAN_CHECK_RE.test(error)) {
        return {
          ok: false,
          kind: 'manual',
          error: HUMAN_CHECK_MSG,
          detail: error,
          status: res.status,
          raw: res.raw
        };
      }
      return {
        ok: false,
        kind: res.kind || classify(error, res.status),
        error: error,
        status: res.status,
        raw: res.raw
      };
    },
    async prepare(payload) {
      const {fields: fields = {}, tags: tags = [], fname: fname = 'image.png', mime: mime = 'image/png', base64: base64 = ''} = payload || {};
      if (!base64) return {
        ok: false,
        kind: 'permanent',
        error: 'no image data to stage'
      };
      const bytes = Math.floor(base64.length * .75);
      if (bytes > MAX_BYTES) {
        return {
          ok: false,
          kind: 'permanent',
          error: `image is ${(bytes / 1048576).toFixed(1)} MB — pixiv's limit is ${MAX_BYTES / 1048576} MB`
        };
      }
      if (!wv) return {
        ok: false,
        kind: 'transient',
        error: 'the Pixiv tab has not loaded yet — open it once'
      };
      try {
        await this.navigate(UPLOAD_PAGE);
      } catch (e) {
        return {
          ok: false,
          kind: 'transient',
          error: e.message
        };
      }
      const st = await this.status();
      if (!st.ok) return {
        ok: false,
        kind: st.kind || 'auth',
        error: st.error
      };
      const sinceId = await this.snapshotWorks(st.userId);
      let res;
      try {
        res = await this.exec(fillJs({
          fields: fields,
          tags: tags,
          fname: fname,
          mime: mime,
          base64: base64
        }));
      } catch (e) {
        return {
          ok: false,
          kind: 'transient',
          error: 'the Pixiv tab went away while filling the form: ' + e.message
        };
      }
      if (!res) return {
        ok: false,
        kind: 'transient',
        error: 'no answer from the Pixiv tab'
      };
      this.last = {
        at: Date.now(),
        endpoint: '(form staged for a manual post)',
        fields: fields,
        tags: tags,
        status: null,
        body: `filled: ${(res.filled || []).join(', ') || '(nothing)'}\nnot filled: ${(res.missed || []).join(', ') || '(nothing)'}`
      };
      return {
        ok: !!res.ok,
        filled: res.filled || [],
        missed: res.missed || [],
        critical: res.critical || [],
        userId: st.userId,
        sinceId: sinceId,
        error: res.ok ? null : res.error || 'could not fill the pixiv upload form'
      };
    },
    async snapshotWorks(userId) {
      try {
        const r = await this.exec(worksJs(userId));
        return r && r.ok && r.maxId ? String(r.maxId) : null;
      } catch {
        return null;
      }
    },
    async harvest(userId, sinceId) {
      try {
        const r = await this.exec(worksJs(userId));
        if (!r || !r.ok) return {
          ok: false,
          error: r && r.error || 'could not read your pixiv works'
        };
        const since = Number(sinceId || 0);
        const fresh = (r.ids || []).map(Number).filter(n => Number.isFinite(n) && n > since).sort((a, b) => a - b);
        return {
          ok: true,
          illustId: fresh.length ? String(fresh[fresh.length - 1]) : null,
          count: r.count
        };
      } catch (e) {
        return {
          ok: false,
          error: e.message
        };
      }
    },
    classify: classify,
    HUMAN_CHECK_RE: HUMAN_CHECK_RE,
    HUMAN_CHECK_MSG: HUMAN_CHECK_MSG
  };
  function safeUrl() {
    try {
      return wv && wv.getURL() || '';
    } catch {
      return '';
    }
  }
  function short(u) {
    return String(u || '(nothing)').replace(/^https?:\/\//, '').slice(0, 60);
  }
  function classify(message, status) {
    const m = String(message || '').toLowerCase();
    if (HUMAN_CHECK_RE.test(m)) return 'manual';
    if (/not signed in|log ?in|logged out|session|unauthor/.test(m)) return 'auth';
    if (status === 401 || status === 403) return 'auth';
    if (status === 429 || status >= 500 && status <= 599) return 'transient';
    if (/network|timed? ?out|timeout|abort|econnreset|rate ?limit|too many requests|try again|temporar/.test(m)) {
      return 'transient';
    }
    if (/csrf|token/.test(m)) return 'transient';
    return 'permanent';
  }
  function uploadJs({fields: fields, tags: tags, fname: fname, mime: mime, base64: base64}) {
    return `(async () => {\n  const FIELDS = ${JSON.stringify(fields)};\n  const TAGS = ${JSON.stringify(tags)};\n  const FNAME = ${JSON.stringify(fname)};\n  const MIME = ${JSON.stringify(mime)};\n  const B64 = ${JSON.stringify(base64)};\n  const POLL_MS = ${POLL_INTERVAL_MS};\n  const POLL_MAX = ${POLL_MAX_TRIES};\n\n  const ident = ${IDENTITY_JS};\n  if (!ident.token) return { ok: false, kind: 'auth', status: 0, error: 'no CSRF token on the page — sign in again' };\n\n  let file;\n  try {\n    const bin = atob(B64);\n    const arr = new Uint8Array(bin.length);\n    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);\n    file = new File([arr], FNAME, { type: MIME });\n  } catch (e) {\n    return { ok: false, kind: 'permanent', status: 0, error: 'could not rebuild the image in the page: ' + e.message };\n  }\n\n  // Mirrors pixiv's own serialiser: null/undefined/'' are dropped rather than sent, and a\n  // key ending in [] is a repeated field.\n  const fd = new FormData();\n  for (const k of Object.keys(FIELDS)) {\n    const v = FIELDS[k];\n    if (v === null || v === undefined || v === '') continue;\n    fd.append(k, String(v));\n  }\n  for (const t of TAGS) fd.append('tags[]', t);\n  fd.append('files[]', file, FNAME);\n  /**\n   * imageOrder is REQUIRED, and it is not a setting — it is derived from the file list.\n   *\n   * Leaving it out gets \`{"errors":{"imageOrder":"Invalid parameter."}}\` and nothing else,\n   * which is how this was found. pixiv's own builder maps each file to\n   * \`{ type, fileKey }\` — 'newFile' with a running index for a fresh upload, 'reupload' or\n   * 'linkedService' for files already on the account — and its serialiser flattens an\n   * array of objects to \`name[i][key]\`. This app posts exactly one fresh file per card,\n   * so that mapping has exactly one entry.\n   */\n  fd.append('imageOrder[0][type]', 'newFile');\n  fd.append('imageOrder[0][fileKey]', '0');\n\n  const headers = { 'x-csrf-token': ident.token, Accept: 'application/json' };\n  const readErr = (data, raw, status) => {\n    let msg = (data && typeof data.message === 'string' && data.message) || '';\n    const errs = data && data.body && data.body.errors;\n    if (errs) {\n      const parts = [];\n      for (const k of Object.keys(errs)) {\n        const v = errs[k];\n        parts.push(k + ': ' + (Array.isArray(v) ? v.join('; ') : (v && v.message) || String(v)));\n      }\n      if (parts.length) msg = parts.join(' · ');\n    }\n    if (!msg && data && typeof data.error === 'string') msg = data.error;\n    if (!msg) {\n      msg = String(raw || '')\n        .replace(/<script[\\s\\S]*?<\\/script>/gi, ' ')\n        .replace(/<style[\\s\\S]*?<\\/style>/gi, ' ')\n        .replace(/<[^>]+>/g, ' ')\n        .replace(/\\s+/g, ' ')\n        .trim()\n        .slice(0, 300) || ('HTTP ' + status);\n    }\n    return msg;\n  };\n\n  // ---- 1. hand over the picture and its metadata ----\n  let resp, raw;\n  try {\n    resp = await fetch('/ajax/work/create/illustration', {\n      method: 'POST', credentials: 'include', headers, body: fd,\n    });\n    raw = await resp.text();\n  } catch (e) {\n    return { ok: false, kind: 'transient', status: 0, error: 'network error posting to pixiv: ' + e.message };\n  }\n\n  let data = null;\n  try { data = JSON.parse(raw); } catch (e) { /* an HTML error page */ }\n  if (!data || data.error) {\n    return { ok: false, status: resp.status, error: readErr(data, raw, resp.status), raw: String(raw || '').slice(0, 2000) };\n  }\n\n  // ---- 2. wait for pixiv to finish making it ----\n  // The POST does not create the illustration; it queues the conversion and hands back a\n  // convertKey. The id only exists once /progress says COMPLETE, so a client that stops at\n  // the POST reports "accepted but named no id" for a post that is going to succeed.\n  const key = (data.body && (data.body.convertKey || data.body.convert_key)) || null;\n  const direct = data.body && (data.body.illustId || data.body.illust_id);\n  if (direct) return { ok: true, status: resp.status, illustId: String(direct), raw: String(raw).slice(0, 2000) };\n  if (!key) {\n    return { ok: false, status: resp.status, kind: 'permanent',\n             error: 'pixiv accepted the upload but returned neither an illustration id nor a convertKey',\n             raw: String(raw).slice(0, 2000) };\n  }\n\n  for (let i = 0; i < POLL_MAX; i++) {\n    await new Promise((r) => setTimeout(r, POLL_MS));\n    let pr, praw;\n    try {\n      pr = await fetch('/ajax/work/create/illustration/progress?convertKey=' + encodeURIComponent(key),\n        { credentials: 'include', headers });\n      praw = await pr.text();\n    } catch (e) {\n      continue; // a blip mid-poll is not a failed upload — the work is already queued\n    }\n    let pd = null;\n    try { pd = JSON.parse(praw); } catch (e) { continue; }\n    const b = (pd && pd.body) || {};\n    if (pd && pd.error) {\n      return { ok: false, status: pr.status, error: readErr(pd, praw, pr.status), raw: String(praw).slice(0, 2000) };\n    }\n    if (b.status === 'COMPLETE') {\n      const id = b.illustId || b.illust_id || null;\n      return id\n        ? { ok: true, status: pr.status, illustId: String(id), raw: String(praw).slice(0, 2000) }\n        : { ok: false, status: pr.status, kind: 'permanent',\n            error: 'pixiv finished the upload but named no illustration id', raw: String(praw).slice(0, 2000) };\n    }\n    if (b.status === 'FAILURE') {\n      return { ok: false, status: pr.status, kind: 'permanent',\n               error: 'pixiv could not process the image (' + (b.message || 'FAILURE') + ')',\n               raw: String(praw).slice(0, 2000) };\n    }\n  }\n  // Timed out watching, but the upload itself was accepted — so this must NOT read as a\n  // failure the caller retries, or the same picture goes up twice.\n  return { ok: false, status: resp.status, kind: 'pending',\n           error: 'pixiv accepted the upload but was still processing it after '\n             + Math.round((POLL_MS * POLL_MAX) / 1000) + 's — check your pixiv profile before posting it again',\n           raw: String(raw).slice(0, 2000) };\n})()`;
  }
  function worksJs(userId) {
    return `(async () => {\n  try {\n    const r = await fetch('/ajax/user/' + encodeURIComponent(${JSON.stringify(String(userId || ''))}) + '/profile/all',\n      { credentials: 'include', headers: { Accept: 'application/json' } });\n    const d = await r.json();\n    if (!d || d.error) return { ok: false, error: (d && d.message) || ('HTTP ' + r.status) };\n    const ill = (d.body && d.body.illusts) || {};\n    const ids = Object.keys(ill).filter((k) => /^\\d+$/.test(k));\n    let max = null;\n    for (const k of ids) { if (max === null || Number(k) > Number(max)) max = k; }\n    return { ok: true, ids, maxId: max, count: ids.length };\n  } catch (e) { return { ok: false, error: e.message }; }\n})()`;
  }
  function fillJs({fields: fields, tags: tags, fname: fname, mime: mime, base64: base64}) {
    return `(async () => {\n  const F = ${JSON.stringify(fields)};\n  const TAGS = ${JSON.stringify(tags)};\n  const FNAME = ${JSON.stringify(fname)};\n  const MIME = ${JSON.stringify(mime)};\n  const B64 = ${JSON.stringify(base64)};\n  const SELS = ${JSON.stringify(FIELD_SELECTORS)};\n  const GROUPS = ${JSON.stringify(RADIO_GROUPS)};\n\n  const filled = [];\n  const missed = [];\n  const critical = [];\n  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));\n\n  const setNative = (el, value) => {\n    const proto = (el.tagName === 'TEXTAREA') ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;\n    const d = Object.getOwnPropertyDescriptor(proto, 'value');\n    if (d && d.set) d.set.call(el, String(value)); else el.value = String(value);\n    el.dispatchEvent(new Event('input', { bubbles: true }));\n    el.dispatchEvent(new Event('change', { bubbles: true }));\n  };\n  const setText = (el, value) => {\n    if (!el) return false;\n    el.focus();\n    if (el.isContentEditable) {\n      // A rich-text description: there is no .value to set, so it is typed in.\n      document.execCommand('selectAll', false, null);\n      document.execCommand('insertText', false, String(value));\n      el.dispatchEvent(new Event('input', { bubbles: true }));\n      return true;\n    }\n    setNative(el, value);\n    return true;\n  };\n  const pick = (sels) => {\n    for (const s of sels) {\n      let el = null;\n      try { el = document.querySelector(s); } catch (e) { continue; }\n      if (el && el.offsetParent !== null) return el;\n      if (el && !el.offsetParent && s.indexOf('file') >= 0) return el; // file inputs are usually hidden\n    }\n    // Second pass ignoring visibility, rather than giving up on a field that is merely\n    // scrolled out of the layout.\n    for (const s of sels) {\n      try { const el = document.querySelector(s); if (el) return el; } catch (e) { /* bad selector */ }\n    }\n    return null;\n  };\n  const q = (s) => JSON.stringify(String(s));\n\n  // ---- the picture ----\n  const fileEl = pick(SELS.image);\n  if (!fileEl) {\n    missed.push('the image (no file input on this page)');\n  } else {\n    try {\n      const bin = atob(B64);\n      const arr = new Uint8Array(bin.length);\n      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);\n      const dt = new DataTransfer();\n      dt.items.add(new File([arr], FNAME, { type: MIME }));\n      fileEl.files = dt.files;\n      fileEl.dispatchEvent(new Event('change', { bubbles: true }));\n      filled.push('the image');\n    } catch (e) {\n      missed.push('the image (' + e.message + ')');\n    }\n  }\n  // The uploader re-renders around the thumbnail once it has a file, and the text fields\n  // below only exist after that.\n  await sleep(1500);\n\n  // ---- title ----\n  if (F.title) {\n    const el = pick(SELS.title);\n    if (setText(el, F.title)) filled.push('title'); else missed.push('title');\n  }\n\n  // ---- caption / description ----\n  if (F.caption) {\n    const el = pick(SELS.caption);\n    if (setText(el, F.caption)) filled.push('caption'); else missed.push('caption');\n  }\n\n  // ---- tags ----\n  if (TAGS.length) {\n    const el = pick(SELS.tags);\n    if (!el) {\n      missed.push(TAGS.length + ' tag(s)');\n    } else {\n      let n = 0;\n      for (const t of TAGS) {\n        setNative(el, t);\n        await sleep(150);\n        // pixiv's tag box commits on Enter; the three events are dispatched because\n        // different builds have listened on different ones.\n        for (const type of ['keydown', 'keypress', 'keyup']) {\n          el.dispatchEvent(new KeyboardEvent(type, {\n            key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true,\n          }));\n        }\n        await sleep(220);\n        n++;\n      }\n      filled.push(n + ' tag(s)');\n    }\n  }\n\n  /**\n   * The radio groups.\n   *\n   * The DOM names are snake_case while the wire fields are camelCase (the whole reason\n   * this integration reads the bundle rather than the markup), and the DOM *values* have\n   * historically been either the same strings the wire takes or the numeric codes behind\n   * them. Both are tried before a field is called missed.\n   */\n  const ALIASES = {\n    general: ['general', '0'],\n    aiGenerated: ['aiGenerated', '2'], notAiGenerated: ['notAiGenerated', '1'],\n    public: ['public', '0'], loginOnly: ['loginOnly', '1'], mypixiv: ['mypixiv', '2'], private: ['private', '3'],\n    true: ['true', '1'], false: ['false', '0'],\n  };\n  const setRadio = (name, value) => {\n    if (value === null || value === undefined || value === '') return true; // nothing asked for\n    const tries = ALIASES[String(value)] || [String(value)];\n    for (const v of tries) {\n      let el = null;\n      try { el = document.querySelector('input[name=' + q(name) + '][value=' + q(v) + ']'); } catch (e) { /* skip */ }\n      if (el) { if (!el.checked) el.click(); return true; }\n    }\n    return false;\n  };\n\n  for (const [name, wireKey, label, isCritical] of GROUPS) {\n    const value = F[wireKey];\n    if (value === null || value === undefined || value === '') continue;\n    if (setRadio(name, value)) {\n      filled.push(label);\n    } else {\n      missed.push(label + ' (wanted "' + value + '")');\n      if (isCritical) critical.push(label);\n    }\n  }\n\n  // Bring the form into view so the person lands on it rather than on the top of the page.\n  try { (fileEl && fileEl.closest('form') || document.body).scrollIntoView({ block: 'start' }); } catch (e) { /* cosmetic */ }\n\n  return { ok: filled.length > 0, filled, missed, critical, url: location.href };\n})()`;
  }
  window.Pixiv = Pixiv;
})();
