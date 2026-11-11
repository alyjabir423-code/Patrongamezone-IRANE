/* GameZone: apply Firebase SSE deltas locally; REST is a recovery path only. */
(function (w) {
  'use strict';
  const copy = x => x == null ? x : JSON.parse(JSON.stringify(x));
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  // GZ-CF-READ-1: fixed origin per room; failed streams fall back to Firebase.
  const gateways = {
    'https://gamezone-bah-nouveau-default-rtdb.europe-west1.firebasedatabase.app': 'https://gamezone-cp1-lectures.bahmamadou4234.workers.dev',
    'https://gamzone-youssef-7e8ae-default-rtdb.firebaseio.com': 'https://gamezone-youssef-lectures.bahmamadou4234.workers.dev',
    'https://game-zone-bah-default-rtdb.europe-west1.firebasedatabase.app': 'https://gamezone-imranne-lectures.bahmamadou4234.workers.dev'
  };
  let directUntil = 0;
  function streamUrl(value) {
    const url = new URL(value);
    const gateway = gateways[url.origin];
    if (!gateway || Date.now() < directUntil) return { url, gateway: false };
    return { url: new URL('/db' + url.pathname + url.search, gateway), gateway: true };
  }

  function segments(path) {
    if (typeof path !== 'string' || !path.startsWith('/')) throw Error('Chemin du flux invalide');
    const parts = path.split('/').filter(Boolean);
    if (parts.some(k => ['__proto__', 'constructor', 'prototype'].includes(k))) throw Error('Chemin du flux interdit');
    return parts;
  }
  function put(root, path, value) {
    const parts = segments(path);
    if (!parts.length) return copy(value);
    if (!root || typeof root !== 'object') root = {};
    let at = root;
    for (const key of parts.slice(0, -1)) {
      if (!own(at, key) || !at[key] || typeof at[key] !== 'object') at[key] = {};
      at = at[key];
    }
    const key = parts[parts.length - 1];
    if (value === null) { if (Array.isArray(at)) at[key] = null; else delete at[key]; }
    else at[key] = copy(value);
    return root;
  }
  function apply(root, kind, payload) {
    if (!payload || !own(payload, 'data')) throw Error('Données du flux absentes');
    segments(payload.path);
    if (kind === 'put') return put(root, payload.path, payload.data);
    if (kind !== 'patch' || !payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) throw Error('Mise à jour du flux invalide');
    // Validate the complete patch before touching the working snapshot.
    const paths = Object.keys(payload.data).map(k => (payload.path === '/' ? '' : payload.path) + '/' + k);
    paths.forEach(segments);
    paths.forEach((p, i) => { root = put(root, p, payload.data[Object.keys(payload.data)[i]]); });
    return root;
  }
  function subscribe(c) {
    let stopped = false, source = null, generation = 0, version = 0;
    let value = null, ready = false, live = false, lastEvent = 0, readPromise = null;
    let retry = null, fallback = null, opening = false, failures = 0, readFailures = 0, renewAuth = false;
    const stats = { streamEvents: 0, restReads: 0, receivedChars: 0, gatewayStarts: 0, directStarts: 0 };
    const visible = () => !w.document || w.document.visibilityState !== 'hidden';
    const enabled = () => !c.enabled || c.enabled();
    function report(e) { if (!stopped && c.error) c.error(e); }
    function emit() { if (!stopped) c.next(copy(value == null ? {} : value)); }
    function scheduleRead(ms) {
      clearTimeout(fallback);
      if (!stopped) fallback = setTimeout(() => {
        fallback = null;
        if (!visible()) return scheduleRead(15000);
        if (!live) refresh().catch(() => {});
      }, ms);
    }
    async function refresh() {
      if (stopped || !enabled()) return;
      if (readPromise) return readPromise;
      const before = version;
      readPromise = (async () => {
        try {
          stats.restReads++;
          const data = await c.read();
          if (stopped) return;
          // A late GET must never overwrite a more recent stream event.
          if (before === version) { value = copy(data); ready = true; emit(); }
          readFailures = 0;
          return copy(value);
        } catch (e) { readFailures++; report(e); throw e; }
        finally {
          readPromise = null;
          if (!live && !stopped) scheduleRead(Math.min(30000, 2000 * Math.pow(2, Math.min(readFailures, 4))));
        }
      })();
      return readPromise;
    }
    function disconnect() {
      live = false; generation++;
      if (source) source.close();
      source = null;
    }
    function reconnect() {
      disconnect();
      scheduleRead(0);
      if (!retry && !stopped && typeof w.EventSource === 'function') {
        retry = setTimeout(() => { retry = null; open(); }, Math.min(30000, 2000 * Math.pow(2, Math.min(failures++, 4))));
      }
    }
    async function open() {
      if (stopped || !enabled() || opening || source || typeof w.EventSource !== 'function') return;
      opening = true;
      const current = generation;
      try {
        const token = await c.token(renewAuth);
        renewAuth = false;
        if (stopped || current !== generation) return;
        if (!token) throw Error('Connexion Firebase requise');
        const transport = streamUrl(c.url);
        const url = transport.url;
        url.searchParams.set('auth', token);
        stats[transport.gateway ? 'gatewayStarts' : 'directStarts']++;
        const s = source = new w.EventSource(url.toString());
        let initialized = false;
        function receive(kind, event) {
          if (stopped || s !== source) return;
          try {
            const data = JSON.parse(event.data);
            if (!initialized && (kind !== 'put' || data.path !== '/')) throw Error('État initial du flux absent');
            value = apply(initialized ? value : null, kind, data);
            initialized = ready = live = true; lastEvent = Date.now(); version++;
            failures = readFailures = 0;
            stats.streamEvents++; stats.receivedChars += event.data.length;
            clearTimeout(fallback); emit();
          } catch (e) { report(e); reconnect(); }
        }
        s.addEventListener('put', e => receive('put', e));
        s.addEventListener('patch', e => receive('patch', e));
        s.addEventListener('keep-alive', () => { if (source === s) lastEvent = Date.now(); });
        s.addEventListener('cancel', () => { if (source === s) { report(Error('Accès au flux Firebase refusé')); reconnect(); } });
        s.addEventListener('auth_revoked', () => { if (source === s) { renewAuth = true; reconnect(); } });
        s.onerror = () => { if (source === s) { if (transport.gateway) directUntil = Date.now() + 60000; reconnect(); } };
        scheduleRead(2500);
      } catch (e) { report(e); reconnect(); }
      finally { opening = false; }
    }
    const watchdog = setInterval(() => {
      if (stopped) return;
      if (!enabled()) { disconnect(); clearTimeout(retry); retry = null; clearTimeout(fallback); fallback = null; return; }
      if (!source && !opening && !retry) {
        if (typeof w.EventSource === 'function') open();
        else if (!fallback && visible()) scheduleRead(0);
      }
      if (!visible()) return;
      if (live && Date.now() - lastEvent > 90000) reconnect();
    }, 1000);
    function wake() {
      if (stopped || !enabled() || !visible()) return;
      if (!source) open();
      if (!live || Date.now() - lastEvent > 90000) refresh().catch(() => {});
    }
    const hooks = ['focus', 'online', 'pageshow'];
    hooks.forEach(name => w.addEventListener(name, wake));
    if (w.document) w.document.addEventListener('visibilitychange', wake);
    function close() {
      stopped = true; disconnect(); clearTimeout(retry); clearTimeout(fallback); clearInterval(watchdog);
      hooks.forEach(name => w.removeEventListener(name, wake));
      if (w.document) w.document.removeEventListener('visibilitychange', wake);
    }
    if (typeof w.EventSource === 'function') open(); else scheduleRead(0);
    return { close, refresh, stats, snapshot: () => ready ? copy(value) : null, healthy: () => live };
  }
  // REST managers cannot read the owner-only room root. Keep four scoped
  // business streams, leaving a browser connection slot for commands even
  // when a separate physical-state stream is running on the same origin.
  function manager(c) {
    let closed = false, loaded = false, value = {}, version = 0, busy = null, queued = null;
    let pendingBusy = false, metadataAt = 0, probing = false;
    let day = c.dayStart ? c.dayStart() : null;
    const revisions = {};
    const children = [], paths = ['active_by_poste', 'saved_time', 'sessions', 'auto_pauses'];
    const emit = () => { if (!closed && loaded) c.next(copy(value)); };
    async function refresh() {
      if (closed) return;
      if (busy) return busy;
      const before = Object.assign({}, revisions);
      busy = (async () => {
        try {
          const data = await c.read();
          if (closed) return;
          // A GET can update metadata but cannot roll back streamed children.
          const streamed = {};
          for (const p of paths) if (before[p] !== revisions[p] && own(value, p)) streamed[p] = value[p];
          value = Object.assign({}, copy(data || {}), streamed);
          loaded = true; metadataAt = Date.now(); emit(); return copy(value);
        } catch (e) { if (!closed && c.error) c.error(e); throw e; }
        finally { busy = null; }
      })();
      return busy;
    }
    const rootUrl = c.url.replace(/\.json$/, '');
    for (const path of paths) {
      children.push(subscribe({ url: rootUrl + '/' + path + '.json', token: c.token,
        read: () => c.readChild(path), error: c.error,
        next: data => {
          if (closed) return;
          value[path] = copy(data); revisions[path] = ++version; emit();
          // Closure markers, journal and day metadata travel only on changes,
          // not on the local one-second clock. Coalesce atomic multipath writes.
          clearTimeout(queued);
          queued = setTimeout(() => refresh().catch(() => {}), 100);
        }
      }));
    }
    refresh().catch(() => {});
    const timer = setInterval(async () => {
      if (closed || (w.document && w.document.visibilityState === 'hidden')) return;
      if (c.dayStart && c.dayStart() !== day) {
        day = c.dayStart(); refresh().catch(() => {});
      }
      // Do not repeatedly download today's entire growing journal. Probe only
      // small configuration/clock fields; activity-triggered reads stay immediate.
      if (loaded && !probing && Date.now() - metadataAt > 60000) {
        probing = true; metadataAt = Date.now();
        try {
          const keys = ['businessRevision', 'current_day', 'gym', 'postes', 'tarifs', 'config/businessName'];
          const data = await Promise.all(keys.map(async key => [key, await c.readChild(key)]));
          if (!closed && data.some(([key, fresh]) => {
            let old = value; for (const bit of key.split('/')) old = old && old[bit];
            return JSON.stringify(old == null ? null : old) !== JSON.stringify(fresh == null ? null : fresh);
          })) refresh().catch(() => {});
        } catch (e) { if (!closed && c.error) c.error(e); }
        finally { probing = false; }
      }
      // Pause acknowledgements stay fast without an extra permanent stream.
      if (!pendingBusy && Object.values(value.active_by_poste || {}).some(s => s && s.pendingPauseId)) {
        pendingBusy = true;
        try {
          const data = await c.readChild('pause_results');
          if (!closed) { value.pause_results = copy(data || {}); emit(); }
        } catch (e) { if (!closed && c.error) c.error(e); }
        finally { pendingBusy = false; }
      }
    }, 1000);
    return { refresh, close() { closed = true; clearInterval(timer); clearTimeout(queued); children.forEach(s => s.close()); },
      healthy: () => children.every(s => s.healthy()) };
  }
  w.GZQuotaSync = { subscribe, manager, apply };
})(window);

