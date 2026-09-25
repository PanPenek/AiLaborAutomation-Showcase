const {contextBridge: contextBridge, ipcRenderer: ipcRenderer} = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

const on = (channel, cb) => {
  const listener = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('ala', {
  patreon: {
    armAttach: payload => invoke('patreon:armAttach', payload),
    disarmAttach: payload => invoke('patreon:disarmAttach', payload),
    onAttachEvent: cb => on('patreon:attachEvent', cb),
    copyFile: payload => invoke('patreon:copyFile', payload),
    revealMedia: payload => invoke('patreon:revealMedia', payload),
    startDrag: payload => ipcRenderer.send('patreon:startDrag', payload),
    onDragError: cb => on('patreon:dragError', cb)
  },
  settings: {
    get: () => invoke('settings:get'),
    patch: p => invoke('settings:patch', p)
  },
  db: {
    getQueue: () => invoke('db:getQueue'),
    setQueue: d => invoke('db:setQueue', d),
    getLibrary: () => invoke('db:getLibrary'),
    setLibrary: d => invoke('db:setLibrary', d),
    getStats: () => invoke('db:getStats'),
    bumpStats: d => invoke('db:bumpStats', d),
    getPerf: () => invoke('db:getPerf'),
    setPerf: d => invoke('db:setPerf', d),
    getPlaybook: () => invoke('db:getPlaybook'),
    setPlaybook: d => invoke('db:setPlaybook', d),
    getTitles: () => invoke('db:getTitles'),
    setTitles: d => invoke('db:setTitles', d),
    getOrigins: () => invoke('db:getOrigins'),
    setOrigins: d => invoke('db:setOrigins', d),
    getComics: () => invoke('db:getComics'),
    setComics: d => invoke('db:setComics', d),
    getPchCatalog: () => invoke('db:getPchCatalog'),
    setPchCatalog: d => invoke('db:setPchCatalog', d),
    getRequests: () => invoke('db:getRequests'),
    setRequests: d => invoke('db:setRequests', d),
    getOverseer: () => invoke('db:getOverseer'),
    setOverseer: d => invoke('db:setOverseer', d)
  },
  dastats: {
    sync: opts => invoke('dastats:sync', opts),
    onProgress: cb => on('dastats:progress', cb),
    comments: (deviationId, limit, debug) => invoke('dastats:comments', {
      deviationId: deviationId,
      limit: limit,
      debug: debug
    }),
    image: (deviationId, username, preferFull) => invoke('dastats:image', {
      deviationId: deviationId,
      username: username,
      preferFull: preferFull
    })
  },
  llm: {
    status: () => invoke('llm:status'),
    models: providerId => invoke('llm:models', {
      providerId: providerId
    }),
    chat: (messages, opts) => invoke('llm:chat', {
      messages: messages,
      opts: opts
    }),
    vision: (base64, mime, prompt, opts) => invoke('llm:vision', {
      base64: base64,
      mime: mime,
      prompt: prompt,
      opts: opts
    }),
    testProvider: payload => invoke('llm:testProvider', payload),
    route: role => invoke('llm:route', {
      role: role
    }),
    routes: () => invoke('llm:routes'),
    resetCircuit: (providerId, role) => invoke('llm:resetCircuit', {
      providerId: providerId,
      role: role
    }),
    probeCommand: command => invoke('llm:probeCommand', {
      command: command
    })
  },
  research: {
    search: payload => invoke('research:search', payload),
    image: payload => invoke('research:image', payload),
    preview: payload => invoke('research:preview', payload)
  },
  files: {
    saveImage: (base64, ext, nameHint) => invoke('files:saveImage', {
      base64: base64,
      ext: ext,
      nameHint: nameHint
    }),
    readImageBase64: fname => invoke('files:readImageBase64', {
      fname: fname
    }),
    deleteImage: fname => invoke('files:deleteImage', {
      fname: fname
    }),
    adoptUpscaled: (tmpPath, currentFname) => invoke('files:adoptUpscaled', {
      tmpPath: tmpPath,
      currentFname: currentFname
    }),
    adoptUpscaledData: (base64, ext, currentFname) => invoke('files:adoptUpscaledData', {
      base64: base64,
      ext: ext,
      currentFname: currentFname
    }),
    libraryDir: () => invoke('files:libraryDir'),
    openLibrary: () => invoke('files:openLibrary'),
    libraryStats: () => invoke('files:libraryStats'),
    revealImage: fname => invoke('files:revealImage', {
      fname: fname
    }),
    saveAttachment: (base64, mime, name) => invoke('files:saveAttachment', {
      base64: base64,
      mime: mime,
      name: name
    }),
    readAttachment: fname => invoke('files:readAttachment', {
      fname: fname
    }),
    deleteAttachment: fname => invoke('files:deleteAttachment', {
      fname: fname
    })
  },
  clip: {
    image: fname => invoke('clip:writeImage', {
      fname: fname
    }),
    text: text => invoke('clip:writeText', {
      text: text
    }),
    file: (fname, kind) => invoke('clip:writeFile', {
      fname: fname,
      kind: kind
    })
  },
  upscale: {
    onDownloaded: cb => on('upscale:downloaded', cb)
  },
  da: {
    beginAuth: () => invoke('da:beginAuth'),
    status: () => invoke('da:status'),
    whoami: () => invoke('da:whoami'),
    logout: () => invoke('da:logout'),
    stashDraft: payload => invoke('da:stashDraft', payload),
    uploadReadiness: () => invoke('da:uploadReadiness'),
    onAuthChanged: cb => on('da:authChanged', cb),
    onIdentity: cb => on('da:identity', cb)
  },
  daweb: {
    status: () => invoke('daweb:status'),
    upload: payload => invoke('daweb:upload', payload),
    applyMetadata: payload => invoke('daweb:applyMetadata', payload),
    publish: deviationId => invoke('daweb:publish', {
      deviationId: deviationId
    }),
    deleteDraft: deviationId => invoke('daweb:deleteDraft', {
      deviationId: deviationId
    }),
    listDrafts: () => invoke('daweb:listDrafts'),
    galleries: () => invoke('daweb:galleries')
  },
  pch: {
    hasGenerator: wcId => invoke('pch:hasGenerator', {
      wcId: wcId
    }),
    execGenerator: (wcId, js) => invoke('pch:execGenerator', {
      wcId: wcId,
      js: js
    }),
    execServer: (wcId, frameId, js) => invoke('pch:execServer', {
      wcId: wcId,
      frameId: frameId,
      js: js
    })
  },
  comfy: {
    http: payload => invoke('comfy:http', payload),
    startServer: command => invoke('comfy:startServer', {
      command: command
    }),
    listWorkflows: dir => invoke('comfy:listWorkflows', dir),
    readWorkflow: payload => invoke('comfy:readWorkflow', payload),
    pickDir: () => invoke('comfy:pickDir'),
    downloadVideo: payload => invoke('comfy:downloadVideo', payload),
    deleteVideo: fname => invoke('comfy:deleteVideo', {
      fname: fname
    }),
    videoToGif: payload => invoke('comfy:videoToGif', payload),
    deleteGif: fname => invoke('comfy:deleteGif', {
      fname: fname
    }),
    inspectVideo: payload => invoke('comfy:inspectVideo', payload)
  },
  power: {
    keepAwake: on => invoke('power:keepAwake', on)
  },
  app: {
    openExternal: url => invoke('app:openExternal', url),
    version: () => invoke('app:version'),
    runtime: () => invoke('app:runtime'),
    show: () => invoke('app:show'),
    notify: (title, body) => invoke('app:notify', {
      title: title,
      body: body
    })
  }
});
