const pathMod = require('path');

const FRAME_POINTS = [ {
  at: .1
}, {
  frac: .25
}, {
  frac: .5
}, {
  frac: .75
}, {
  fromEnd: .3
} ];

const SILENT_MAX_DB = -50;

function createVideoInspector({spawn: spawn, fs: fs, os: os, path: path = pathMod, libraryDir: libraryDir, whisperScript: whisperScript, env: env = process.env}) {
  const libDir = () => typeof libraryDir === 'function' ? libraryDir() : libraryDir;
  function run(cmd, args, {timeoutMs: timeoutMs = 6e4} = {}) {
    return new Promise(resolve => {
      let child;
      try {
        child = spawn(cmd, args, {
          windowsHide: true,
          env: env
        });
      } catch (e) {
        resolve({
          code: -1,
          out: Buffer.alloc(0),
          err: '',
          spawnError: e
        });
        return;
      }
      const out = [];
      let err = '';
      let done = false;
      const finish = r => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(r);
        }
      };
      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {}
        finish({
          code: -1,
          out: Buffer.concat(out),
          err: err + `\n(timed out after ${Math.round(timeoutMs / 1e3)} s)`
        });
      }, timeoutMs);
      if (child.stdout) child.stdout.on('data', d => out.push(Buffer.from(d)));
      if (child.stderr) child.stderr.on('data', d => {
        err = (err + d.toString()).slice(-4e3);
      });
      child.on('error', e => finish({
        code: -1,
        out: Buffer.concat(out),
        err: err,
        spawnError: e
      }));
      child.on('close', code => finish({
        code: code,
        out: Buffer.concat(out),
        err: err
      }));
    });
  }
  function findUv() {
    const exe = process.platform === 'win32' ? 'uv.exe' : 'uv';
    const dirs = String(env.PATH || env.Path || '').split(path.delimiter).filter(Boolean);
    const home = env.USERPROFILE || env.HOME || '';
    if (env.LOCALAPPDATA) dirs.push(path.join(env.LOCALAPPDATA, 'hermes', 'bin'));
    if (home) dirs.push(path.join(home, '.local', 'bin'), path.join(home, '.cargo', 'bin'));
    for (const d of dirs) {
      const p = path.join(d, exe);
      try {
        if (fs.existsSync(p)) return p;
      } catch {}
    }
    return null;
  }
  function lastJsonLine(text) {
    const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(l => l.startsWith('{'));
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(lines[i]);
      } catch {}
    }
    return null;
  }
  async function probe(src) {
    const r = await run('ffprobe', [ '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,r_frame_rate', '-of', 'json', src ], {
      timeoutMs: 3e4
    });
    if (r.spawnError) {
      throw new Error(r.spawnError.code === 'ENOENT' ? 'ffprobe was not found on PATH — install ffmpeg (winget install Gyan.FFmpeg) to use the video self-check' : 'ffprobe could not start: ' + r.spawnError.message);
    }
    let j = null;
    try {
      j = JSON.parse(r.out.toString('utf8'));
    } catch {}
    if (!j || !j.format) throw new Error('ffprobe could not read the clip' + (r.err ? ': ' + r.err.trim().slice(0, 300) : ''));
    const streams = Array.isArray(j.streams) ? j.streams : [];
    const v = streams.find(s => s.codec_type === 'video') || {};
    const [n, d] = String(v.r_frame_rate || '0/1').split('/').map(Number);
    return {
      duration: Number(j.format.duration) || 0,
      width: v.width || null,
      height: v.height || null,
      fps: d ? Math.round(n / d * 100) / 100 : null,
      hasAudio: streams.some(s => s.codec_type === 'audio')
    };
  }
  function frameTimes(duration, count) {
    const n = Math.max(2, Math.min(FRAME_POINTS.length, Math.round(Number(count) || FRAME_POINTS.length)));
    const mids = FRAME_POINTS.slice(1, -1);
    const keep = [ FRAME_POINTS[0], ...mids.slice(Math.floor((mids.length - (n - 2)) / 2)).slice(0, n - 2), FRAME_POINTS[FRAME_POINTS.length - 1] ];
    const last = Math.max(0, duration - .05);
    return keep.map(p => {
      const t = p.at != null ? p.at : p.frac != null ? duration * p.frac : duration - p.fromEnd;
      return Math.round(Math.max(0, Math.min(last, t)) * 100) / 100;
    });
  }
  async function grabFrame(src, t, maxEdge) {
    const scale = `scale='if(gt(iw,ih),min(${maxEdge},iw),-2)':'if(gt(iw,ih),-2,min(${maxEdge},ih))'`;
    const r = await run('ffmpeg', [ '-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', src, '-frames:v', '1', '-vf', scale, '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '4', 'pipe:1' ], {
      timeoutMs: 3e4
    });
    return r.code === 0 && r.out.length ? r.out.toString('base64') : null;
  }
  async function loudness(src) {
    const r = await run('ffmpeg', [ '-hide_banner', '-nostats', '-i', src, '-vn', '-af', 'volumedetect', '-f', 'null', '-' ], {
      timeoutMs: 6e4
    });
    const mean = /mean_volume:\s*(-?[\d.]+|-inf)\s*dB/.exec(r.err);
    const max = /max_volume:\s*(-?[\d.]+|-inf)\s*dB/.exec(r.err);
    if (!max) return {
      ok: false,
      error: 'volumedetect gave no reading'
    };
    const num = m => m && m[1] !== '-inf' ? Number(m[1]) : -Infinity;
    const maxDb = num(max);
    return {
      ok: true,
      meanDb: num(mean),
      maxDb: maxDb,
      silent: maxDb < SILENT_MAX_DB
    };
  }
  async function transcribe(src, model) {
    const uv = findUv();
    if (!uv) return {
      ok: false,
      error: 'uv was not found, so Whisper could not run (install uv or add it to PATH)'
    };
    if (!whisperScript || !fs.existsSync(whisperScript)) return {
      ok: false,
      error: 'tools/whisper_transcribe.py is missing'
    };
    const wav = path.join(os.tmpdir(), `ala-vc-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.wav`);
    try {
      const a = await run('ffmpeg', [ '-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-vn', '-ac', '1', '-ar', '16000', wav ], {
        timeoutMs: 6e4
      });
      if (a.code !== 0 || !fs.existsSync(wav)) return {
        ok: false,
        error: 'could not extract the audio: ' + (a.err || '').trim().slice(0, 200)
      };
      const w = await run(uv, [ 'run', '--with', 'faster-whisper', 'python', whisperScript, wav, model || 'base' ], {
        timeoutMs: 18e4
      });
      const j = lastJsonLine(w.out.toString('utf8'));
      if (!j) return {
        ok: false,
        error: 'Whisper gave no answer' + (w.err ? ': ' + w.err.trim().slice(-300) : '')
      };
      return j;
    } finally {
      try {
        if (fs.existsSync(wav)) fs.unlinkSync(wav);
      } catch {}
    }
  }
  return {
    findUv: findUv,
    frameTimes: frameTimes,
    async inspect({fname: fname, frames: frames = 5, maxEdge: maxEdge = 512, transcribe: wantText = true, whisperModel: whisperModel = 'base'} = {}) {
      const base = path.basename(String(fname || ''));
      if (!base || !/\.(mp4|webm|mkv|mov)$/i.test(base)) throw new Error('not a video file: ' + (base || '(none)'));
      const src = path.join(libDir(), 'videos', base);
      if (!fs.existsSync(src)) throw new Error('video not found on disk: ' + base);
      const edge = Math.max(128, Math.min(1024, Number(maxEdge) || 512));
      const info = await probe(src);
      const times = frameTimes(info.duration, frames);
      const shots = [];
      for (const t of times) {
        const b64 = await grabFrame(src, t, edge);
        if (b64) shots.push({
          t: t,
          base64: b64,
          mime: 'image/jpeg'
        });
      }
      const audio = info.hasAudio ? await loudness(src) : {
        ok: true,
        meanDb: -Infinity,
        maxDb: -Infinity,
        silent: true,
        noStream: true
      };
      let transcript;
      if (!wantText) transcript = {
        ok: false,
        error: 'transcription was not requested'
      }; else if (!info.hasAudio) transcript = {
        ok: true,
        language: null,
        prob: 0,
        segments: [],
        noAudio: true
      }; else transcript = await transcribe(src, whisperModel);
      const db = x => Number.isFinite(x) ? x : null;
      return {
        fname: base,
        ...info,
        frames: shots,
        audio: {
          ...audio,
          meanDb: db(audio.meanDb),
          maxDb: db(audio.maxDb)
        },
        transcript: transcript
      };
    }
  };
}

module.exports = {
  createVideoInspector: createVideoInspector,
  FRAME_POINTS: FRAME_POINTS,
  SILENT_MAX_DB: SILENT_MAX_DB
};
