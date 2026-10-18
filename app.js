(() => {
  const CATEGORIES = ["Aceites y fluidos","Filtros","Encendido","Motor","Juntas y retenes","Refrigeración","Alimentación","Frenos","Embrague y transmisión","Suspensión y dirección","Eléctrico","Carrocería","Interior","Neumáticos y llantas","Herramientas","Otros"];
  const GROUPS = ["Mantenimiento","Lubricación","Motor","Distribución","Alimentación","Encendido","Refrigeración","Escape","Embrague","Caja de cambios","Transmisión","Frenos","Suspensión delantera","Suspensión trasera","Dirección","Ruedas","Eléctrico","Carrocería","Interior"];
  const UNITS = ["ud","L","kg","juego","m"];
  // Mantenimiento: cada cuánto toca cada trabajo (meses / km). Cada vehículo puede ajustarlo.
  const TASKS = [
    { k: "aceite", name: "Aceite y filtro de aceite", months: 12, km: 10000, moto: { km: 6000 } },
    { k: "filtro-aire", name: "Filtro de aire", months: 24, km: 30000, moto: { km: 12000 } },
    { k: "filtro-comb", name: "Filtro de combustible", months: 24, km: 30000, notMoto: true },
    { k: "encendido", name: "Bujías o calentadores", months: 36, km: 30000, moto: { months: 24, km: 12000 } },
    { k: "liq-frenos", name: "Líquido de frenos", months: 24, km: 0 },
    { k: "refrigerante", name: "Anticongelante", months: 36, km: 0 },
    { k: "distribucion", name: "Distribución (correa o cadena)", months: 60, km: 60000, notMoto: true },
    { k: "transmision", name: "Cadena o correa de transmisión", months: 0, km: 20000, onlyMoto: true },
    { k: "bateria", name: "Revisar y cargar la batería", months: 6, km: 0 },
    { k: "neumaticos", name: "Revisar neumáticos", months: 12, km: 0 },
  ];
  const DOC_TYPES = ["Permiso de circulación", "Ficha técnica", "Seguro", "ITV", "Impuesto de circulación", "Factura", "Manual", "Otro"];
  const DATE_FIELDS = [["itvDate", "ITV"], ["insuranceDate", "Seguro"], ["taxDate", "Impuesto de circulación"]];
  const DOC_DATE_FIELD = { "ITV": "itvDate", "Seguro": "insuranceDate", "Impuesto de circulación": "taxDate" };
  const BACKUP_DAYS = 30;

  const S = { cars: [], parts: [], catalog: [], logs: [], docs: [], shop: [], trips: [], tab: "garage", carId: null, carTab: "maint", kind: "all", stockView: "inv", stockGroup: "cat", stockFilter: "all", stockCar: "all", catCar: null, q: "", allAlerts: false, ready: false, canUpload: true };
  // Despieces publicados en el repositorio (catalog/*.json) y piezas propias guardadas en el móvil
  let libIndex = [], libItems = [], localCat = [], libDocs = {};

  const $ = (s, el = document) => el.querySelector(s);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const norm = (v) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const codeKey = (v) => norm(v).replace(/[^a-z0-9]/g, "");
  const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;
  const carById = (id) => S.cars.find(c => c.id === id);
  const carName = (c) => c ? [c.make, c.model].filter(Boolean).join(" ") : "General";
  const isMoto = (c) => c?.kind === "moto";
  const num = (v, d = 0) => { const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : d; };
  const qtyFmt = (n) => Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
  const kmFmt = (n) => Math.round(num(n)).toLocaleString("es-ES") + " km";
  const stockState = (p) => { const q = num(p.qty), m = num(p.minQty); return q <= 0 ? "zero" : (m > 0 && q <= m ? "low" : "ok"); };
  const strip = (o) => { const { id, ...rest } = o; return rest; };

  // Fechas en formato AAAA-MM-DD, calculadas a mediodía para no tropezar con los cambios de hora
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const atNoon = (d) => new Date(d + "T12:00:00");
  const fmtDate = (d) => d ? atNoon(d).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "—";
  const daysUntil = (d) => Math.round((atNoon(d) - atNoon(today())) / 86400000);
  const addMonths = (d, m) => { const x = atNoon(d); x.setMonth(x.getMonth() + m); return x.toISOString().slice(0, 10); };
  const relDays = (n) => { const a = Math.abs(n); const t = a >= 60 ? Math.round(a / 30.4) + " meses" : a === 1 ? "1 día" : a + " días"; return n === 0 ? "hoy" : n > 0 ? "en " + t : "hace " + t; };

  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2400); }

  // ---------- Fotos y archivos (se guardan en el móvil) ----------
  const photoCache = new Map(), photoPending = new Set();
  function blobUrl(id) {
    if (!id) return "";
    if (photoCache.has(id)) return photoCache.get(id);
    if (!photoPending.has(id)) {
      photoPending.add(id);
      tx("photos", "readonly", st => st.get(id)).then(b => { if (b) { photoCache.set(id, URL.createObjectURL(b)); render(); } }).catch(() => {});
    }
    return "";
  }
  async function blobUrlAsync(id) {
    if (!id) return "";
    if (photoCache.has(id)) return photoCache.get(id);
    const b = await tx("photos", "readonly", st => st.get(id));
    if (!b) return "";
    const u = URL.createObjectURL(b); photoCache.set(id, u); return u;
  }
  const getBlob = (id) => tx("photos", "readonly", st => st.get(id));
  async function storeBlob(blob, prefix = "file-") { const id = prefix + uid(); await idbPut("photos", blob, id); photoCache.set(id, URL.createObjectURL(blob)); return id; }
  async function storeImage(file, max = 1600, prefix = "ph-") {
    try { return await storeBlob(await shrink(file, max), prefix); } catch { toast("No se pudo guardar la foto"); return null; }
  }
  async function dropBlob(id) {
    if (!id) return;
    try { await idbDel("photos", id); } catch {}
    const u = photoCache.get(id); if (u) URL.revokeObjectURL(u);
    photoCache.delete(id); photoPending.delete(id);
  }
  function shrink(file, max) {
    return new Promise((res) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(b => res(b || file), "image/jpeg", .84);
      };
      img.onerror = () => { URL.revokeObjectURL(url); res(file); };
      img.src = url;
    });
  }
  // Foto propia del móvil; si no hay, la foto principal del artículo de Wikipedia del modelo
  let wikiPhotos = {};
  try { wikiPhotos = JSON.parse(localStorage.getItem("wikiPhotos") || "{}"); } catch {}
  const ownPhoto = (c) => blobUrl(c?.photoId);
  // Orden: foto hecha en el móvil, foto del vehículo subida al repositorio (fotos/), foto de Wikipedia
  const wikiUrl = (c) => (c && c.wiki && wikiPhotos[c.wiki]?.url) || "";
  const photoUrl = (c) => ownPhoto(c) || c?.photo || wikiUrl(c);
  async function resolveWikiPhotos() {
    const todo = [...new Set(S.cars.filter(c => c.wiki && !wikiPhotos[c.wiki]).map(c => c.wiki))];
    if (!todo.length || !navigator.onLine) return;
    await Promise.all(todo.map(async key => {
      const [lang, title] = key.includes(":") ? key.split(/:(.+)/) : ["es", key];
      try {
        const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
        if (!r.ok) return;
        const j = await r.json();
        let url = j.thumbnail?.source || j.originalimage?.source;
        if (!url) return;
        if ((j.originalimage?.width || 0) >= 960) url = url.replace(/\/\d+px-/, "/960px-");
        wikiPhotos[key] = { url, page: j.content_urls?.mobile?.page || "" };
      } catch {}
    }));
    try { localStorage.setItem("wikiPhotos", JSON.stringify(wikiPhotos)); } catch {}
    render();
  }

  // ---------- Datos (IndexedDB, en el propio dispositivo) ----------
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const STORES = ["cars", "parts", "catalog", "logs", "docs", "shop", "trips"];
  let idbP = null;
  function idb() {
    return idbP ||= new Promise((res, rej) => {
      const r = indexedDB.open("garaje-clasico", 3);
      r.onupgradeneeded = () => { const d = r.result; STORES.forEach(n => d.objectStoreNames.contains(n) || d.createObjectStore(n, { keyPath: "id" })); d.objectStoreNames.contains("photos") || d.createObjectStore("photos"); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function tx(store, mode, fn) {
    const d = await idb();
    return new Promise((res, rej) => { const t = d.transaction(store, mode), st = t.objectStore(store); const out = fn(st); t.oncomplete = () => res(out && "result" in out ? out.result : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  }
  const idbAll = (store) => tx(store, "readonly", st => st.getAll());
  const idbPut = (store, obj, key) => tx(store, "readwrite", st => key === undefined ? st.put(obj) : st.put(obj, key));
  const idbDel = (store, key) => tx(store, "readwrite", st => st.delete(key));
  const idbClear = (store) => tx(store, "readwrite", st => st.clear());

  function mergeCatalog() {
    // Un despiece de la biblioteca se aplica a cada vehículo que lo tenga asignado
    const out = [];
    for (const car of S.cars) {
      if (!car.catalogKey) continue;
      libItems.filter(i => i.lib === car.catalogKey).forEach(base => {
        const id = car.id + "~" + base.id;
        const ov = localCat.find(l => l.id === id);
        if (ov?.deleted) return;
        out.push({ ...base, ...ov, id, carId: car.id, libId: base.id });
      });
    }
    localCat.filter(i => !i.deleted && !i.libId).forEach(i => out.push(i));
    S.catalog = out;
  }
  const alive = (list) => list.filter(x => !x.deleted);
  async function loadAll() {
    const carsRaw = await idbAll("cars");
    S.cars = alive(carsRaw);
    loadAll.removedCars = carsRaw.filter(c => c.deleted).map(c => c.id);
    S.parts = alive(await idbAll("parts")); localCat = await idbAll("catalog");
    S.logs = alive(await idbAll("logs")); S.docs = alive(await idbAll("docs")); S.shop = alive(await idbAll("shop")); S.trips = alive(await idbAll("trips"));
    await Promise.all(S.cars.map(c => blobUrlAsync(c.photoId).catch(() => "")));
    mergeCatalog();
  }
  async function save(coll, id, data) {
    try {
      data.updatedAt = new Date().toISOString();
      if (!id) { id = uid(); data.createdAt = data.updatedAt; }
      const obj = { ...data, id };
      await idbPut(coll, obj);
      if (coll === "catalog") { const i = localCat.findIndex(x => x.id === id); i >= 0 ? localCat[i] = obj : localCat.push(obj); mergeCatalog(); }
      else { const i = S[coll].findIndex(x => x.id === id); i >= 0 ? S[coll][i] = obj : S[coll].push(obj); if (coll === "cars") mergeCatalog(); }
      render(); scheduleSync();
      return id;
    } catch (e) { toast("No se pudo guardar. Revisa el espacio del móvil"); return null; }
  }
  async function remove(coll, id) {
    try {
      // Se guarda una marca de borrado (no se elimina) para que el otro móvil también lo borre al sincronizar
      const item = coll === "catalog" ? S.catalog.find(i => i.id === id) : null, now = new Date().toISOString();
      if (item?.libId) await idbPut("catalog", { id, libId: item.libId, carId: item.carId, deleted: true, updatedAt: now });
      else await idbPut(coll, { id, deleted: true, updatedAt: now });
      if (coll === "catalog") localCat = await idbAll("catalog"); else S[coll] = S[coll].filter(x => x.id !== id);
      mergeCatalog(); render(); scheduleSync();
    } catch { toast("No se pudo borrar"); }
  }
  // Vehículos guardados en el repositorio (datos/garaje.json): se añaden los que falten, sin pisar cambios hechos en el móvil
  async function seedGarage() {
    try {
      const r = await fetch("datos/garaje.json", { cache: "no-cache" });
      if (!r.ok) return;
      const d = await r.json(), skip = new Set([...S.cars.map(c => c.id), ...(loadAll.removedCars || [])]);
      let changed = false;
      for (const seed of d.coches || []) {
        const cur = S.cars.find(c => c.id === seed.id);
        if (!cur) continue;
        const add = {};
        for (const k of ["wiki", "kind", "photo", "plate"]) if (seed[k] && !cur[k]) add[k] = seed[k];
        if (Object.keys(add).length) { await idbPut("cars", { ...cur, ...add }); changed = true; }
      }
      const nuevos = (d.coches || []).filter(c => c.id && !skip.has(c.id));
      if (!nuevos.length) { if (changed) { await loadAll(); render(); } return; }
      const old = "2000-01-01T00:00:00.000Z";
      for (const c of nuevos) await idbPut("cars", { createdAt: old, updatedAt: old, ...c });
      await loadAll(); render();
      toast(nuevos.length === 1 ? "1 vehículo añadido" : nuevos.length + " vehículos añadidos");
    } catch {}
  }
  async function loadLibrary() {
    try {
      const r = await fetch("catalog/index.json", { cache: "no-cache" });
      libIndex = r.ok ? await r.json() : [];
      const all = [];
      for (const entry of libIndex) {
        try {
          const f = await fetch("catalog/" + entry.file, { cache: "no-cache" });
          if (!f.ok) continue;
          const doc = await f.json();
          libDocs[entry.key] = doc;
          (doc.items || []).forEach((it, n) => all.push({ verified: true, ...it, id: it.id || entry.key + "-" + n, lib: entry.key, source: it.source || doc.source || "" }));
        } catch {}
      }
      libItems = all; mergeCatalog(); render();
    } catch {}
  }

  // ---------- Mantenimiento y avisos ----------
  function taskList(car) {
    const moto = isMoto(car), ov = car.intervals || {};
    return TASKS.filter(t => moto ? !t.notMoto : !t.onlyMoto).map(t => {
      const base = { ...t, ...(moto ? t.moto : {}) }, o = ov[t.k] || {};
      return { k: t.k, name: t.name, months: o.months ?? base.months, km: o.km ?? base.km, off: !!o.off };
    });
  }
  const taskName = (k) => k === "otro" ? "Otro trabajo" : (TASKS.find(t => t.k === k)?.name || "");
  const taskNames = (ks = []) => ks.map(taskName).filter(Boolean).join(", ");
  const carLogs = (carId) => S.logs.filter(l => l.carId === carId).sort((a, b) => (b.date || "").localeCompare(a.date || "") || num(b.km) - num(a.km));
  function taskStatus(car, t) {
    const last = carLogs(car.id).find(l => (l.tasks || []).includes(t.k));
    if (!last) return { state: "none", t };
    const curKm = num(car.km);
    const dueDate = t.months > 0 && last.date ? addMonths(last.date, t.months) : "";
    const dueKm = t.km > 0 && num(last.km) > 0 ? num(last.km) + t.km : 0;
    const days = dueDate ? daysUntil(dueDate) : null;
    const kmLeft = dueKm && curKm ? dueKm - curKm : null;
    const state = (days !== null && days < 0) || (kmLeft !== null && kmLeft < 0) ? "overdue"
      : (days !== null && days <= 30) || (kmLeft !== null && kmLeft <= 1000) ? "soon" : "ok";
    return { state, t, last, dueDate, dueKm, days, kmLeft };
  }
  function dueText(s) {
    const out = [];
    if (s.dueDate) out.push((s.days < 0 ? "tocaba " : "toca ") + relDays(s.days));
    if (s.kmLeft !== null && s.kmLeft !== undefined) out.push(s.kmLeft < 0 ? "pasado " + kmFmt(-s.kmLeft) : "quedan " + kmFmt(s.kmLeft));
    else if (s.dueKm) out.push("a los " + kmFmt(s.dueKm));
    return out.join(" · ") || "al día";
  }
  const intervalText = (t) => [t.months ? "cada " + (t.months % 12 === 0 ? (t.months / 12 === 1 ? "año" : t.months / 12 + " años") : t.months + " meses") : "", t.km ? "cada " + kmFmt(t.km) : ""].filter(Boolean).join(" o ");
  function dateStatus(car, field) {
    const d = car[field]; if (!d) return null;
    const days = daysUntil(d);
    return { state: days < 0 ? "overdue" : days <= 30 ? "soon" : "ok", days, date: d };
  }
  // Un clásico parado sufre: batería, neumáticos, juntas, gasolina vieja. Se avisa si lleva demasiado sin arrancar.
  const IDLE_DAYS = 30;
  const idleDays = (car) => car.idleOff ? 0 : num(car.idleDays, IDLE_DAYS);
  const carTrips = (carId) => S.trips.filter(t => t.carId === carId).sort((a, b) => (b.date || "").localeCompare(a.date || "") || num(b.odo) - num(a.odo));
  const lastRun = (car) => [car.lastRun || "", carTrips(car.id)[0]?.date || ""].sort().pop();
  function idleStatus(car) {
    const limit = idleDays(car), last = lastRun(car);
    if (!last) return { state: "none", limit };
    const since = -daysUntil(last);
    return { state: !limit || since < limit ? "ok" : since >= limit * 2 ? "overdue" : "soon", since, last, limit };
  }
  const idleText = (s) => s.since === 0 ? "Arrancado hoy" : s.since === 1 ? "Arrancado ayer" : `Sin arrancar desde hace ${relDays(-s.since).replace("hace ", "")}`;
  async function markRun(car, date = today()) {
    const fresh = carById(car.id) || car;
    if ((fresh.lastRun || "") >= date) { toast("Ya estaba apuntado"); return; }
    await save("cars", fresh.id, { ...strip(fresh), lastRun: date });
    toast(`${carName(fresh)}: arrancado hoy`);
  }
  // Uso del año: salidas, kilómetros, combustible y consumo aproximado
  function tripStats(carId, year = today().slice(0, 4)) {
    const list = carTrips(carId).filter(t => !year || (t.date || "").startsWith(year));
    const km = list.reduce((n, t) => n + num(t.dist), 0);
    const fuelled = list.filter(t => num(t.liters) > 0 && num(t.dist) > 0);
    const liters = list.reduce((n, t) => n + num(t.liters), 0), cost = list.reduce((n, t) => n + num(t.fuelCost), 0);
    const fk = fuelled.reduce((n, t) => n + num(t.dist), 0), fl = fuelled.reduce((n, t) => n + num(t.liters), 0);
    return { count: list.length, km, liters, cost, consumo: fk > 0 ? fl / fk * 100 : 0 };
  }
  const euro = (n) => num(n).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  function alertsFor(car) {
    const out = [];
    const idle = idleStatus(car);
    if (idle.state === "soon" || idle.state === "overdue") out.push({ car, label: "Arrancarlo", state: idle.state, days: -idle.since, text: idleText(idle) + " · " + fmtDate(idle.last), run: true });
    DATE_FIELDS.forEach(([f, label]) => {
      const s = dateStatus(car, f);
      if (s && s.state !== "ok") out.push({ car, label, state: s.state, days: s.days, text: (s.days < 0 ? "venció " : "vence ") + relDays(s.days) + " · " + fmtDate(s.date) });
    });
    taskList(car).filter(t => !t.off).forEach(t => {
      const s = taskStatus(car, t);
      if (s.state === "overdue" || s.state === "soon") out.push({ car, label: t.name, state: s.state, days: s.days ?? (s.kmLeft < 0 ? -1 : 15), text: dueText(s) });
    });
    return out;
  }
  const allAlerts = () => S.cars.flatMap(alertsFor).sort((a, b) => (a.state === "overdue" ? 0 : 1) - (b.state === "overdue" ? 0 : 1) || a.days - b.days);
  const PILL = { overdue: ["crit", "Vencido"], soon: ["warn", "Pronto"], ok: ["ok", "Al día"], none: ["", "Sin registrar"] };
  const pill = (state, label) => { const [cls, txt] = PILL[state] || PILL.none; return `<span class="chip ${cls}">${label || txt}</span>`; };
  // Al montar un repuesto se adivina qué trabajo de mantenimiento es
  function guessTasks(p) {
    const t = norm(p.name + " " + (p.category || ""));
    if (/aceite/.test(t) && /filtro|aceite/.test(t)) return ["aceite"];
    if (/filtro/.test(t) && /aire/.test(t) && !/habitaculo|polen/.test(t)) return ["filtro-aire"];
    if (/filtro/.test(t) && /gasoil|gasolina|combustible/.test(t)) return ["filtro-comb"];
    if (/bujia|calentador|precalentamiento/.test(t)) return ["encendido"];
    if (/liquido/.test(t) && /freno/.test(t)) return ["liq-frenos"];
    if (/anticongelante|refrigerante/.test(t)) return ["refrigerante"];
    if (/bateria/.test(t)) return ["bateria"];
    if (/distribucion/.test(t)) return ["distribucion"];
    if (/neumatico|rueda/.test(t)) return ["neumaticos"];
    return [];
  }
  async function applyStock(list, sign) {
    for (const u of list || []) {
      const p = S.parts.find(x => x.id === u.partId); if (!p) continue;
      p.qty = Math.max(0, num(p.qty) + sign * num(u.qty, 1));
      await save("parts", p.id, strip(p));
    }
  }

  // ---------- Copia de seguridad ----------
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  function backupNeeded() {
    const has = S.parts.length + S.logs.length + S.docs.length + S.shop.length + S.trips.length > 0 || S.cars.some(c => c.photoId || c.gallery?.length || c.itvDate || c.insuranceDate);
    if (!has) return null;
    const ls = lsGet("lastSync");
    if (syncCfg() && ls && Date.now() - new Date(ls) < BACKUP_DAYS * 86400000) return null;
    const last = lsGet("lastBackup"), snooze = lsGet("backupSnooze");
    if (snooze && new Date(snooze) > new Date()) return null;
    if (!last) return "Todavía no has guardado ninguna copia de tus datos.";
    const d = Math.floor((Date.now() - new Date(last)) / 86400000);
    return d >= BACKUP_DAYS ? `Hace ${d} días que no guardas una copia de tus datos.` : null;
  }
  const blobToData = (b) => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
  async function exportBackup() {
    toast("Preparando la copia…");
    const ids = new Set();
    S.cars.forEach(c => { if (c.photoId) ids.add(c.photoId); (c.gallery || []).forEach(i => ids.add(i)); });
    S.parts.forEach(p => p.photoId && ids.add(p.photoId));
    S.docs.forEach(d => d.fileId && ids.add(d.fileId));
    const files = {};
    for (const id of ids) { const b = await getBlob(id); if (b) files[id] = await blobToData(b); }
    const json = JSON.stringify({ app: "garaje-clasico", version: 2, exportado: new Date().toISOString(), coches: await idbAll("cars"), repuestos: S.parts, despiecePropio: localCat, registros: S.logs, documentos: S.docs, compra: S.shop, salidas: S.trips, fotos: files });
    const name = "garaje-clasico-" + today() + ".json";
    const file = new File([json], name, { type: "application/json" });
    const done = () => { lsSet("lastBackup", new Date().toISOString()); lsSet("backupSnooze", ""); render(); toast("Copia guardada"); };
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Copia de Garaje Clásico" }); done(); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    done();
  }
  async function importBackup(file) {
    try {
      const d = JSON.parse(await file.text());
      if (d.app !== "garaje-clasico") throw new Error("formato");
      for (const n of [...STORES, "photos"]) await idbClear(n);
      for (const c of d.coches || []) await idbPut("cars", c);
      for (const p of d.repuestos || []) await idbPut("parts", p);
      for (const k of d.despiecePropio || []) await idbPut("catalog", k);
      for (const l of d.registros || []) await idbPut("logs", l);
      for (const x of d.documentos || []) await idbPut("docs", x);
      for (const x of d.compra || []) await idbPut("shop", x);
      for (const x of d.salidas || []) await idbPut("trips", x);
      for (const [id, url] of Object.entries(d.fotos || {})) await idbPut("photos", await (await fetch(url)).blob(), id);
      photoCache.clear(); photoPending.clear(); await loadAll(); closeSheet(); render();
      toast("Copia restaurada");
    } catch { toast("Ese archivo no es una copia de Garaje Clásico"); }
  }

  // ---------- Sincronización entre móviles (repositorio privado de GitHub) ----------
  const SYNC_STORES = ["cars", "parts", "catalog", "logs", "docs", "shop", "trips"];
  const syncCfg = () => { try { return JSON.parse(lsGet("syncCfg") || "null"); } catch { return null; } };
  const b64encode = (str) => { const bytes = new TextEncoder().encode(str); let out = ""; for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(out); };
  const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), c => c.charCodeAt(0)));
  const b64url = (str) => b64encode(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unb64url = (s) => { const b = s.replace(/-/g, "+").replace(/_/g, "/"); return b64decode(b + "===".slice((b.length + 3) % 4)); };
  const setSyncState = (t) => { const el = $("#syncState"); if (el) el.textContent = t; };
  async function gh(path, { raw, cfg = syncCfg(), ...opts } = {}) {
    const headers = { Authorization: "Bearer " + cfg.token, Accept: raw ? "application/vnd.github.raw" : "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (opts.body) headers["Content-Type"] = "application/json";
    return fetch(`https://api.github.com/repos/${cfg.repo}${path ? "/" + path : ""}`, { ...opts, headers, cache: "no-store" });
  }
  const ghError = (r) => r.status === 401 ? "El token no es válido o ha caducado." : r.status === 403 ? "El token no tiene permiso para ese repositorio." : r.status === 404 ? "No encuentro el repositorio o el token no tiene acceso a él." : "GitHub respondió con un error (" + r.status + ").";
  async function getRemote() {
    const r = await gh("contents/garaje.json");
    if (r.status === 404) return { sha: null, data: null };
    if (!r.ok) throw new Error(ghError(r));
    const j = await r.json();
    let text = j.encoding === "base64" && j.content ? b64decode(j.content) : null;
    if (text === null) { const rr = await gh("contents/garaje.json", { raw: true }); if (!rr.ok) throw new Error(ghError(rr)); text = await rr.text(); }
    return { sha: j.sha, data: JSON.parse(text) };
  }
  const newer = (a, b) => (a.updatedAt || "") >= (b.updatedAt || "") ? a : b;
  function mergeSets(local, remote) {
    const m = new Map((remote || []).map(x => [x.id, x]));
    for (const x of local || []) { const o = m.get(x.id); m.set(x.id, o ? newer(x, o) : x); }
    return [...m.values()];
  }
  let syncing = false, syncAgain = false, syncTimer = null;
  function scheduleSync() { if (!syncCfg()) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(), 3000); }
  async function syncNow(manual = false) {
    if (!syncCfg()) return;
    if (!navigator.onLine) { setSyncState("Sin conexión"); if (manual) toast("No hay conexión a internet"); return; }
    if (syncing) { syncAgain = true; return; }
    syncing = true; setSyncState("Sincronizando…");
    try {
      let done = false;
      for (let attempt = 0; attempt < 3 && !done; attempt++) {
        const { sha, data } = await getRemote();
        const remote = data?.stores || {}, merged = {};
        let localChanged = false, remoteChanged = !data;
        for (const st of SYNC_STORES) {
          const loc = await idbAll(st);
          merged[st] = mergeSets(loc, remote[st]);
          const locMap = new Map(loc.map(x => [x.id, JSON.stringify(x)])), remMap = new Map((remote[st] || []).map(x => [x.id, JSON.stringify(x)]));
          for (const x of merged[st]) {
            const j = JSON.stringify(x);
            if (locMap.get(x.id) !== j) { await idbPut(st, x); localChanged = true; }
            if (remMap.get(x.id) !== j) remoteChanged = true;
          }
        }
        if (remoteChanged) {
          const body = { message: "Garaje Clásico: sincronización", content: b64encode(JSON.stringify({ app: "garaje-clasico", version: 1, updated: new Date().toISOString(), stores: merged })) };
          if (sha) body.sha = sha;
          const r = await gh("contents/garaje.json", { method: "PUT", body: JSON.stringify(body) });
          if (r.status === 409 || r.status === 422) continue; // el otro móvil acaba de guardar: se vuelve a mezclar
          if (!r.ok) throw new Error(ghError(r));
        }
        if (localChanged) { await loadAll(); render(); }
        done = true;
      }
      if (!done) throw new Error("El otro móvil está guardando a la vez. Se reintentará.");
      await syncFiles();
      lsSet("lastSync", new Date().toISOString());
      setSyncState("Sincronizado"); render();
      if (manual) toast("Sincronizado");
    } catch (e) {
      setSyncState("Sin sincronizar");
      if (manual) toast(e.message || "No se pudo sincronizar");
    } finally {
      syncing = false;
      if (syncAgain) { syncAgain = false; scheduleSync(); }
    }
  }
  // Fotos y documentos: cada archivo se guarda una vez en la carpeta «archivos» del repositorio
  async function syncFiles() {
    const ids = new Set();
    S.cars.forEach(c => { if (c.photoId) ids.add(c.photoId); (c.gallery || []).forEach(i => ids.add(i)); });
    S.parts.forEach(p => p.photoId && ids.add(p.photoId));
    S.docs.forEach(d => d.fileId && ids.add(d.fileId));
    if (!ids.size) return;
    const r = await gh("contents/archivos");
    const remote = r.ok ? new Set((await r.json()).map(f => f.name)) : new Set();
    for (const id of ids) {
      const local = await getBlob(id);
      if (local && !remote.has(id)) {
        const put = await gh("contents/archivos/" + encodeURIComponent(id), { method: "PUT", body: JSON.stringify({ message: "Archivo " + id, content: (await blobToData(local)).split(",")[1] }) });
        if (!put.ok && put.status !== 422) throw new Error(ghError(put));
      } else if (!local && remote.has(id)) {
        const g = await gh("contents/archivos/" + encodeURIComponent(id), { raw: true });
        if (!g.ok) continue;
        const doc = S.docs.find(d => d.fileId === id);
        await idbPut("photos", new Blob([await g.arrayBuffer()], { type: doc?.mime || "image/jpeg" }), id);
        photoPending.delete(id); render();
      }
    }
  }
  async function connectSync(cfg) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(cfg.repo || "")) { toast("Escribe el repositorio como usuario/nombre"); return false; }
    if (!cfg.token) { toast("Pega el token"); return false; }
    let r;
    try { r = await gh("", { cfg }); } catch { toast("No hay conexión con GitHub"); return false; }
    if (!r.ok) { toast(ghError(r)); return false; }
    const j = await r.json();
    if (!j.private) { toast("Ese repositorio es público: hazlo privado antes de guardar ahí tus datos"); return false; }
    if (j.permissions && !j.permissions.push) { toast("El token no tiene permiso de escritura (Contents: Read and write)"); return false; }
    lsSet("syncCfg", JSON.stringify({ repo: cfg.repo, token: cfg.token }));
    await syncNow(true);
    return true;
  }
  function syncSheet() {
    const cfg = syncCfg(), last = lsGet("lastSync");
    if (!cfg) {
      openSheet(`<h2>Compartir entre móviles</h2>
        <p class="lead">Guarda los datos en un repositorio privado de GitHub para veros lo mismo en los dos móviles. Solo podéis verlo vosotros.</p>
        <ol class="steps">
          <li>En GitHub crea un repositorio <b>privado</b>, por ejemplo <span class="mono">garaje-datos</span>.</li>
          <li>Crea un token en <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens</a> con acceso solo a ese repositorio y el permiso <b>Contents: Read and write</b>.</li>
          <li>Pega aquí el repositorio y el token.</li>
        </ol>
        <form class="form">${field("y_repo", "Repositorio", "", { full: true, mono: true, ph: "usuario/garaje-datos" })}${field("y_token", "Token", "", { full: true, mono: true, ph: "github_pat_…" })}</form>
        <div class="actions"><button class="btn primary" type="button" id="syncGo">Conectar</button><button class="btn" type="button" data-close>Cancelar</button></div>
        <p class="note">¿Te han mandado un enlace? Ciérralo y usa «Pegar enlace» en Opciones.</p>`);
      $("#syncGo").onclick = async () => { $("#syncGo").disabled = true; const ok = await connectSync({ repo: val("y_repo"), token: val("y_token") }); if (ok) closeSheet(); else if ($("#syncGo")) $("#syncGo").disabled = false; };
      return;
    }
    openSheet(`<h2>Compartir entre móviles</h2>
      <p class="lead">Conectado a <span class="mono">${esc(cfg.repo)}</span>. ${last ? "Última sincronización: " + new Date(last).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + "." : "Todavía no se ha sincronizado."}</p>
      <div class="actions" style="flex-direction:column">
        <button class="btn primary" type="button" id="syncNowBtn">Sincronizar ahora</button>
        <button class="btn" type="button" id="syncLink">Enlace para el otro móvil</button>
        <button class="btn danger" type="button" id="syncOff">Desconectar este móvil</button>
      </div>
      <p class="note">Los cambios se sincronizan solos al abrir la app y unos segundos después de cada cambio, si hay conexión.</p>`);
    $("#syncNowBtn").onclick = () => syncNow(true);
    $("#syncLink").onclick = () => {
      const link = location.origin + location.pathname + "#sync=" + b64url(JSON.stringify(cfg));
      openSheet(`<h2>Enlace para el otro móvil</h2><p class="lead">Mándalo por WhatsApp. En el otro móvil: Opciones → «Pegar enlace».</p><pre class="share-text" id="syncTxt">${esc(link)}</pre>
        <p class="banner">El enlace lleva la llave de acceso a vuestros datos: mándalo solo a tu padre.</p>
        <div class="actions"><button class="btn primary" type="button" id="copySync">Copiar el enlace</button>${navigator.share ? `<button class="btn" type="button" id="shareSync">Compartir</button>` : ""}</div>`);
      $("#copySync").onclick = () => copyText(link, $("#syncTxt"), "Enlace copiado");
      $("#shareSync")?.addEventListener("click", () => navigator.share({ text: link }).catch(() => {}));
    };
    $("#syncOff").onclick = () => confirmSheet("¿Desconectar este móvil?", "Los datos se quedan en este teléfono y en GitHub, pero dejan de sincronizarse.", async () => { lsSet("syncCfg", ""); setSyncState("En este teléfono"); closeSheet(); toast("Desconectado"); });
  }

  // ---------- Avisos en el calendario del móvil ----------
  function calendarEvents(cars) {
    const ev = [];
    for (const c of cars) {
      const name = carName(c);
      DATE_FIELDS.forEach(([f, label]) => { if (c[f]) ev.push({ uid: `${c.id}-${f}`, date: c[f], title: `${label} · ${name}`, desc: f === "itvDate" ? "Pasar la ITV" : f === "insuranceDate" ? "Renovar el seguro" + (c.insurer ? " (" + c.insurer + ")" : "") : "Pagar el impuesto de circulación" }); });
      taskList(c).filter(t => !t.off).forEach(t => {
        const st = taskStatus(c, t);
        if (st.dueDate) ev.push({ uid: `${c.id}-tarea-${t.k}`, date: st.days < 0 ? today() : st.dueDate, title: `${t.name} · ${name}`, desc: `Mantenimiento. Último: ${fmtDate(st.last.date)}${st.last.km ? " a los " + kmFmt(st.last.km) : ""}.` });
      });
      S.docs.filter(d => d.carId === c.id && d.expiry && !DOC_DATE_FIELD[d.type]).forEach(d => ev.push({ uid: `${c.id}-doc-${d.id}`, date: d.expiry, title: `Caduca: ${d.title || d.type} · ${name}`, desc: d.type }));
    }
    return ev.sort((a, b) => a.date.localeCompare(b.date));
  }
  function buildICS(events) {
    const ie = (t) => String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
    const d8 = (d) => d.replace(/-/g, ""), nextDay = (d) => { const x = atNoon(d); x.setDate(x.getDate() + 1); return x.toISOString().slice(0, 10).replace(/-/g, ""); };
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Garaje Clasico//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Garaje Clásico"];
    // Aviso 7 días antes y el mismo día, a las 9:00
    for (const e of events) L.push("BEGIN:VEVENT", `UID:${e.uid}@garaje-clasico`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d8(e.date)}`, `DTEND;VALUE=DATE:${nextDay(e.date)}`, `SUMMARY:${ie(e.title)}`, `DESCRIPTION:${ie(e.desc)}`, "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${ie(e.title)}`, "TRIGGER:-P6DT15H", "END:VALARM", "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${ie(e.title)}`, "TRIGGER:PT9H", "END:VALARM", "END:VEVENT");
    L.push("END:VCALENDAR");
    return L.join("\r\n") + "\r\n";
  }
  function calendarSheet(cars) {
    const ev = calendarEvents(cars);
    if (!ev.length) { toast("No hay fechas: pon la ITV y el seguro o registra un mantenimiento"); return; }
    const ics = buildICS(ev), file = new File([ics], "garaje-clasico.ics", { type: "text/calendar" });
    const url = URL.createObjectURL(file), ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    openSheet(`<h2>Añadir al calendario</h2>
      <p class="lead">${ev.length} ${ev.length === 1 ? "fecha" : "fechas"} con aviso 7 días antes y el mismo día a las 9:00.</p>
      <div class="list">${ev.slice(0, 8).map(e => `<div class="due-row"><span class="due-main"><span class="due-name">${esc(e.title)}</span><span class="due-when">${fmtDate(e.date)}</span></span></div>`).join("")}</div>
      ${ev.length > 8 ? `<p class="note">Y ${ev.length - 8} más.</p>` : ""}
      <div class="actions" style="flex-direction:column">
        <a class="btn primary" href="${url}" ${ios ? 'target="_blank" rel="noopener"' : 'download="garaje-clasico.ics"'}><svg><use href="#i-cal"/></svg>Abrir en el calendario</a>
        ${navigator.canShare?.({ files: [file] }) ? `<button class="btn" type="button" id="shareIcs">Compartir el archivo</button>` : ""}
      </div>
      <p class="note">${ios ? "Se abre el Calendario: pulsa «Añadir todo»." : "Ábrelo con Google Calendar o con el calendario del móvil."} Si cambias fechas, vuelve a añadirlo: se actualizan las mismas citas.</p>`);
    $("#shareIcs")?.addEventListener("click", () => navigator.share({ files: [file], title: "Avisos de Garaje Clásico" }).catch(() => {}));
  }

  // ---------- Datos rápidos ----------
  const QUICK = [["aceite", "Aceite de motor"], ["capacidad", "Capacidad de aceite"], ["refrigerante", "Anticongelante"], ["frenos", "Líquido de frenos"], ["neumaticos", "Neumáticos"], ["presion", "Presión de neumáticos"], ["bateria", "Batería"], ["bujias", "Bujías o calentadores"], ["otros", "Otros datos"]];
  const quickRef = (c) => libDocs[c.catalogKey]?.quick || {};
  function quickCard(c) {
    const own = c.quick || {}, ref = quickRef(c);
    const rows = QUICK.filter(([k]) => own[k] || ref[k]).map(([k, label]) => `<div class="q-item${k === "otros" ? " wide" : ""}"><span>${label}</span><b>${esc(own[k] || ref[k])}</b>${!own[k] ? `<small>Dato de referencia</small>` : ""}</div>`).join("");
    return `<div class="section-head result-head"><span class="eyebrow">Datos rápidos</span><button class="link" type="button" data-quick>Editar</button></div>
      ${rows ? `<div class="quick">${rows}</div>` : `<button class="due-row quick-empty" type="button" data-quick><span class="due-main"><span class="due-name">Apunta los datos que más consultas</span><span class="due-when">Aceite y cuánto lleva, presión de neumáticos, batería, bujías…</span></span><svg class="chev" aria-hidden="true"><use href="#i-back"/></svg></button>`}`;
  }
  function quickForm(c) {
    const own = c.quick || {}, ref = quickRef(c);
    openSheet(`<h2>Datos rápidos</h2><p class="lead">Lo que se mira con el capó abierto en el ${esc(carName(c))}. Si dejas un campo vacío se muestra el dato de referencia, cuando lo hay.</p>
      <form class="form">${QUICK.map(([k, label]) => field("q_" + k, label, own[k] || "", { full: true, ph: ref[k] || "", area: k === "otros" })).join("")}</form>
      <div class="actions"><button class="btn primary" type="button" id="saveQuick">Guardar</button><button class="btn" type="button" data-close>Cancelar</button></div>`);
    $("#saveQuick").onclick = async () => {
      const q = {}; QUICK.forEach(([k]) => { const v = val("q_" + k); if (v) q[k] = v; });
      await save("cars", c.id, { ...strip(c), quick: q }); closeSheet(); toast("Datos guardados");
    };
  }

  // ---------- Lector de códigos de barras ----------
  let zxingP = null;
  const loadZXing = () => zxingP ||= new Promise((res, rej) => {
    if (window.ZXing) return res(window.ZXing);
    const s = document.createElement("script"); s.src = "vendor/zxing-0.21.3.min.js";
    s.onload = () => res(window.ZXing); s.onerror = () => { zxingP = null; rej(new Error("zxing")); };
    document.head.appendChild(s);
  });
  const zxHints = (ZX) => {
    const h = new Map(), F = ZX.BarcodeFormat;
    h.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF, F.QR_CODE, F.DATA_MATRIX]);
    h.set(ZX.DecodeHintType.TRY_HARDER, true);
    return h;
  };
  async function nativeDetector() {
    if (!("BarcodeDetector" in window)) return null;
    try {
      const have = await BarcodeDetector.getSupportedFormats();
      const want = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code", "data_matrix"].filter(f => have.includes(f));
      return want.length ? new BarcodeDetector({ formats: want }) : null;
    } catch { return null; }
  }
  async function decodeImage(file) {
    const small = await shrink(file, 1600);
    const det = await nativeDetector();
    if (det) { try { const r = await det.detect(await createImageBitmap(small)); if (r[0]?.rawValue) return r[0].rawValue; } catch {} }
    try {
      const ZX = await loadZXing(), url = URL.createObjectURL(small);
      try { return (await new ZX.BrowserMultiFormatReader(zxHints(ZX)).decodeFromImageUrl(url)).getText(); }
      finally { URL.revokeObjectURL(url); }
    } catch { return null; }
  }
  function scanCode() {
    return new Promise(async (resolve) => {
      const box = $("#scanner"), video = $("#scanVideo"), msg = $("#scanMsg");
      let stream = null, timer = null, reader = null, done = false;
      const finish = (code) => {
        if (done) return; done = true;
        clearInterval(timer);
        try { reader?.reset(); } catch {}
        stream?.getTracks().forEach(t => t.stop());
        video.srcObject = null; box.hidden = true;
        if (code) navigator.vibrate?.(60);
        resolve(code ? String(code).trim() : null);
      };
      box.hidden = false; msg.textContent = "Apunta al código de barras de la caja";
      $("#scanClose").onclick = () => finish(null);
      $("#scanFile").onchange = async (e) => {
        const f = e.target.files[0]; e.target.value = ""; if (!f) return;
        msg.textContent = "Leyendo la foto…";
        const code = await decodeImage(f);
        if (code) finish(code); else msg.textContent = "No encuentro ningún código en la foto. Hazla más cerca y con buena luz.";
      };
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("sin cámara");
        const det = await nativeDetector();
        if (det) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
          if (done) { stream.getTracks().forEach(t => t.stop()); return; }
          video.srcObject = stream; await video.play();
          timer = setInterval(async () => { try { const r = await det.detect(video); if (r[0]?.rawValue) finish(r[0].rawValue); } catch {} }, 300);
        } else {
          const ZX = await loadZXing();
          if (done) return;
          reader = new ZX.BrowserMultiFormatReader(zxHints(ZX), 300);
          await reader.decodeFromConstraints({ video: { facingMode: "environment" }, audio: false }, video, (res) => { if (res) finish(res.getText()); });
          if (done) try { reader.reset(); } catch {}
        }
      } catch { if (!done) msg.textContent = "No puedo abrir la cámara. Pulsa «Hacer foto del código»."; }
    });
  }
  async function scanToStock() {
    const code = await scanCode(); if (!code) return;
    const found = S.parts.find(p => p.barcode && codeKey(p.barcode) === codeKey(code));
    if (found) {
      openSheet(`<h2>${esc(found.name)}</h2>
        <p class="lead">Ya lo tienes en el almacén: quedan ${qtyFmt(num(found.qty))} ${esc(found.unit || "ud")}.</p>
        ${found.location ? `<p class="where"><svg><use href="#i-pin"/></svg><span>Está en <b>${esc(found.location)}</b></span></p>` : ""}
        <div class="codebox"><span class="eyebrow">Código de barras</span><span class="mono">${esc(code)}</span></div>
        <div class="actions" style="flex-direction:column">
          <button class="btn primary" type="button" id="scPlus">Sumar 1 al almacén</button>
          <button class="btn" type="button" id="scUse"><svg><use href="#i-wrench"/></svg>Usar en un vehículo</button>
          <button class="btn" type="button" id="scOpen">Ver el repuesto</button>
          <button class="btn" type="button" data-close>Cerrar</button>
        </div>`);
      $("#scPlus").onclick = async () => { found.qty = num(found.qty) + 1; await save("parts", found.id, strip(found)); closeSheet(); toast(`${found.name}: ahora tienes ${qtyFmt(num(found.qty))}`); };
      $("#scUse").onclick = () => useInVehicle(found);
      $("#scOpen").onclick = () => partForm(found);
    } else {
      openSheet(`<h2>Código nuevo</h2>
        <div class="codebox"><span class="eyebrow">Código de barras</span><span class="mono">${esc(code)}</span></div>
        <p class="lead">No tienes ningún repuesto con este código.</p>
        <div class="actions" style="flex-direction:column">
          <button class="btn primary" type="button" id="scNew">Dar de alta en el almacén</button>
          <a class="btn" href="https://www.google.com/search?q=${encodeURIComponent(code)}" target="_blank" rel="noopener"><svg><use href="#i-web"/></svg>Buscar qué producto es</a>
          <button class="btn" type="button" data-close>Cerrar</button>
        </div>`);
      $("#scNew").onclick = () => partForm({ barcode: code, qty: 1 });
    }
  }

  // ---------- Búsqueda web ----------
  const SHOPS = [
    { name: "Google", hint: "Búsqueda general", url: q => "https://www.google.com/search?q=" + encodeURIComponent(q) },
    { name: "eBay", hint: "Nuevo y usado, Europa", url: q => "https://www.ebay.es/sch/i.html?_nkw=" + encodeURIComponent(q) },
    { name: "Autodoc", hint: "Recambio nuevo", url: q => "https://www.autodoc.es/search?keyword=" + encodeURIComponent(q) },
    { name: "Wallapop", hint: "Segunda mano", url: q => "https://es.wallapop.com/app/search?keywords=" + encodeURIComponent(q) },
    { name: "Todocolección", hint: "Piezas de época", url: q => "https://www.todocoleccion.net/buscador?bu=" + encodeURIComponent(q) },
    { name: "Amazon", hint: "Consumibles", url: q => "https://www.amazon.es/s?k=" + encodeURIComponent(q) },
    { name: "Imágenes", hint: "Identificar la pieza", url: q => "https://www.google.com/search?tbm=isch&q=" + encodeURIComponent(q) },
    { name: "Milanuncios", hint: "Desguaces y particulares", url: q => "https://www.milanuncios.com/anuncios/?s=" + encodeURIComponent(q) },
  ];
  function openWeb(item) {
    const car = carById(item.carId);
    const code = item.oem || item.ref || "";
    const desc = [car ? carName(car) : "", car?.year || "", item.name].filter(Boolean).join(" ");
    const block = (title, q) => `<div class="eyebrow">${title}</div><div class="shops">${SHOPS.map(s => `<a class="shop" href="${esc(s.url(q))}" target="_blank" rel="noopener"><strong>${s.name}</strong><span>${s.hint}</span></a>`).join("")}</div>`;
    openSheet(`
      <h2>${esc(item.name || "Buscar pieza")}</h2>
      ${code ? `<div class="codebox"><span class="eyebrow">Referencia OEM</span><span class="mono" id="codeTxt">${esc(code)}</span>${item.ref && item.oem ? `<span class="note">Otras refs: <span class="mono">${esc(item.ref)}</span></span>` : ""}<div><button class="mini" type="button" id="copyCode">Copiar código</button></div></div>` : ""}
      ${code ? block("Buscar por código", code) : ""}
      ${block("Buscar por descripción", desc || item.name)}
      <p class="note">Antes de comprar, comprueba el código con el vendedor: en clásicos cambian piezas según año y número de bastidor.</p>
      <div class="actions"><button class="btn" type="button" data-close>Cerrar</button></div>`);
    $("#copyCode")?.addEventListener("click", () => copyText(code, $("#codeTxt"), "Código copiado"));
  }
  function copyText(text, el, okMsg) {
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast(okMsg), () => el && selectText(el));
    else if (el) selectText(el);
  }
  function selectText(el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Mantén pulsado para copiar"); }

  // ---------- Hojas ----------
  // Las hojas y la ficha del vehículo entran en el historial: el gesto o botón «atrás» del móvil las cierra
  let sheetOpen = false;
  function openSheet(html) {
    const sh = $("#sheet"), sc = $("#scrim");
    if (!sheetOpen) { history.pushState({ ...(history.state || {}), sheet: true }, ""); sheetOpen = true; }
    $("#sheetBody").innerHTML = `<div class="sheet-head"><span class="grabber"></span><button class="sheet-x" type="button" data-close aria-label="Cerrar"><svg><use href="#i-x"/></svg></button></div>` + html;
    $("#sheetBody").onclick = null;
    sh.hidden = false; sc.hidden = false;
    requestAnimationFrame(() => { if (sheetOpen) { sh.classList.add("on"); sc.classList.add("on"); } });
    sh.scrollTop = 0;
  }
  function closeSheet() {
    if (!sheetOpen) return;
    if (history.state?.sheet) history.back(); else hideSheet();
  }
  function hideSheet() {
    sheetOpen = false; stopDictation();
    const sh = $("#sheet"), sc = $("#scrim");
    sh.classList.remove("on"); sc.classList.remove("on");
    setTimeout(() => { if (sh.classList.contains("on")) return; sh.hidden = true; sc.hidden = true; $("#sheetBody").innerHTML = ""; }, 250);
  }
  $("#scrim").addEventListener("click", closeSheet);
  $("#sheet").addEventListener("click", e => { if (e.target.closest("[data-close]")) closeSheet(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); });

  const field = (id, label, val, opts = {}) => {
    const cls = opts.full ? "field full" : "field";
    if (opts.options) return `<div class="${cls}"><label for="${id}">${label}</label><select id="${id}">${opts.options.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}"${String(v) === String(val ?? "") ? " selected" : ""}>${esc(t)}</option>`; }).join("")}</select></div>`;
    if (opts.area) return `<div class="${cls}"><label for="${id}">${label}</label><div class="dictate"><textarea id="${id}"${opts.ph ? ` placeholder="${esc(opts.ph)}"` : ""}>${esc(val)}</textarea>${micBtn(id)}</div></div>`;
    const input = `<input id="${id}" ${opts.mono ? 'class="mono"' : ""} type="${opts.type || "text"}" ${opts.inputmode ? `inputmode="${opts.inputmode}"` : ""} ${opts.ph ? `placeholder="${esc(opts.ph)}"` : ""} value="${esc(val)}" autocomplete="off"${opts.list ? ` list="${id}_list"` : ""}>`;
    const list = opts.list?.length ? `<datalist id="${id}_list">${opts.list.map(o => `<option value="${esc(o)}"></option>`).join("")}</datalist>` : "";
    return `<div class="${cls}"><label for="${id}">${label}</label>${opts.mic ? `<div class="with-btn">${input}${micBtn(id)}</div>` : input}${list}</div>`;
  };
  const micBtn = (id) => `<button class="mic" type="button" data-mic="${id}" aria-label="Dictar"><svg><use href="#i-mic"/></svg></button>`;
  const locations = () => [...new Set(S.parts.map(p => (p.location || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  const val = (id) => ($("#" + id)?.value ?? "").trim();
  const carOptions = (withGeneral = true) => [...(withGeneral ? [["", "General (varios vehículos)"]] : []), ...S.cars.map(c => [c.id, carName(c) + (c.year ? " · " + c.year : "")])];

  function carForm(car = {}) {
    openSheet(`
      <h2>${car.id ? "Editar vehículo" : "Nuevo vehículo"}</h2>
      <form class="form" id="f">
        ${field("c_make", "Marca", car.make, { ph: "Mercedes-Benz" })}
        ${field("c_model", "Modelo", car.model, { ph: "280 SL" })}
        ${field("c_version", "Versión / serie", car.version, { ph: "W113 Pagoda" })}
        ${field("c_year", "Año", car.year, { inputmode: "numeric", ph: "1969" })}
        ${field("c_kind", "Tipo", car.kind || "coche", { options: [["coche", "Coche"], ["moto", "Moto"]] })}
        ${field("c_plate", "Matrícula", car.plate, { mono: true, ph: "M-1234-AB" })}
        ${field("c_km", "Kilómetros", car.km, { inputmode: "numeric" })}
        ${field("c_vin", "Nº de bastidor", car.vin, { mono: true, full: true })}
        ${field("c_engine", "Código de motor", car.engine, { mono: true, ph: "M130" })}
        ${field("c_color", "Color", car.color, { ph: "Blanco papiro" })}
        ${libIndex.length ? field("c_lib", "Despiece de referencia", car.catalogKey || "", { full: true, options: [["", "Ninguno"], ...libIndex.map(l => [l.key, l.title])] }) : ""}
        ${field("c_notes", "Notas", car.notes, { area: true, full: true })}
        ${S.canUpload ? `<div class="field full"><label for="c_photo">Foto principal</label><input id="c_photo" type="file" accept="image/*"></div>` : ""}
      </form>
      <div class="actions">
        <button class="btn primary" type="button" id="saveCar">Guardar</button>
        ${car.id ? `<button class="btn danger" type="button" id="delCar">Borrar vehículo</button>` : `<button class="btn" type="button" data-close>Cancelar</button>`}
      </div>`);
    $("#saveCar").addEventListener("click", async () => {
      const data = { ...strip(car), make: val("c_make"), model: val("c_model"), version: val("c_version"), year: val("c_year"), plate: val("c_plate").toUpperCase(), km: val("c_km"), vin: val("c_vin").toUpperCase(), engine: val("c_engine"), color: val("c_color"), notes: val("c_notes"), photoId: car.photoId || "", catalogKey: $("#c_lib") ? val("c_lib") : (car.catalogKey || ""), kind: val("c_kind") || "coche", wiki: car.wiki || "" };
      if (!data.make && !data.model) { toast("Escribe al menos la marca o el modelo"); return; }
      const file = $("#c_photo")?.files?.[0];
      $("#saveCar").disabled = true;
      if (file) {
        const id = await storeImage(file);
        if (id) { if (data.photoId) data.gallery = [data.photoId, ...(data.gallery || []).filter(x => x !== data.photoId)]; data.photoId = id; }
      }
      const id = await save("cars", car.id, data);
      $("#saveCar") && ($("#saveCar").disabled = false);
      if (id) { closeSheet(); toast(car.id ? "Vehículo actualizado" : "Vehículo añadido"); if (!car.id) { S.tab = "car"; S.carId = id; S.carTab = "maint"; } render(); }
    });
    $("#delCar")?.addEventListener("click", () => confirmSheet(`¿Borrar ${esc(carName(car))}?`, "Se borran su despiece, su historial, sus fotos y sus documentos. Los repuestos del almacén se quedan como «General».", async () => {
      for (const p of S.parts.filter(p => p.carId === car.id)) await save("parts", p.id, { ...strip(p), carId: "" });
      for (const it of localCat.filter(i => i.carId === car.id && !i.deleted)) await idbPut("catalog", { ...it, deleted: true, updatedAt: new Date().toISOString() });
      localCat = await idbAll("catalog");
      for (const l of S.logs.filter(l => l.carId === car.id)) await remove("logs", l.id);
      for (const d of S.docs.filter(d => d.carId === car.id)) { await dropBlob(d.fileId); await remove("docs", d.id); }
      for (const x of S.shop.filter(x => x.carId === car.id)) await remove("shop", x.id);
      for (const x of S.trips.filter(x => x.carId === car.id)) await remove("trips", x.id);
      for (const ph of [car.photoId, ...(car.gallery || [])]) await dropBlob(ph);
      await remove("cars", car.id);
      S.tab = "garage"; S.carId = null; closeSheet(); toast("Vehículo borrado"); render();
    }));
  }

  function partForm(part = {}, opts = {}) {
    const isNew = !part.id;
    const thumb = blobUrl(part.photoId);
    openSheet(`
      <h2>${isNew ? "Nuevo repuesto" : "Editar repuesto"}</h2>
      ${thumb ? `<img class="part-photo" src="${esc(thumb)}" alt="">` : `<p class="lead">Lo que tienes guardado en el taller: bidones de aceite, filtros, bujías, juntas…</p>`}
      <form class="form" id="f">
        ${field("p_name", "Pieza", part.name, { full: true, ph: "Filtro de aceite" })}
        ${field("p_car", "Vehículo", part.carId ?? (S.carId || ""), { options: carOptions(), full: true })}
        ${field("p_cat", "Categoría", part.category || "Otros", { options: CATEGORIES })}
        ${field("p_brand", "Fabricante", part.brand, { ph: "Bosch, Mann…" })}
        ${field("p_oem", "Ref. OEM", part.oem, { mono: true, ph: "Código original" })}
        ${field("p_ref", "Ref. propia / equivalente", part.ref, { mono: true })}
        <div class="field full"><label for="p_barcode">Código de barras</label><div class="with-btn"><input id="p_barcode" class="mono" inputmode="numeric" value="${esc(part.barcode)}" autocomplete="off" placeholder="Escanéalo de la caja"><button class="mini" type="button" id="scanBarcode"><svg><use href="#i-scan"/></svg>Escanear</button></div></div>
        ${field("p_qty", "Cantidad", part.qty ?? 1, { inputmode: "decimal" })}
        ${field("p_unit", "Unidad", part.unit || "ud", { options: UNITS })}
        ${field("p_min", "Avisar si quedan", part.minQty ?? "", { inputmode: "decimal", ph: "0 = sin aviso" })}
        ${field("p_loc", "Dónde está guardado", part.location, { ph: "Estantería 2, caja azul", list: locations() })}
        ${field("p_price", "Precio (€)", part.price, { inputmode: "decimal" })}
        ${field("p_supplier", "Proveedor", part.supplier)}
        ${field("p_notes", "Notas", part.notes, { area: true, full: true })}
        <div class="field full"><label for="p_photo">${part.photoId ? "Cambiar la foto" : "Foto del repuesto"}</label><input id="p_photo" type="file" accept="image/*"></div>
      </form>
      <div class="actions">
        <button class="btn primary" type="button" id="savePart">Guardar</button>
        ${isNew ? `<button class="btn" type="button" data-close>Cancelar</button>` : `<button class="btn" type="button" id="usePart"><svg><use href="#i-wrench"/></svg>Usar en un vehículo</button><button class="btn" type="button" id="webPart"><svg><use href="#i-web"/></svg>Buscar en web</button><button class="btn danger" type="button" id="delPart">Borrar</button>`}
      </div>`);
    $("#scanBarcode").addEventListener("click", async () => { const code = await scanCode(); if (code) { $("#p_barcode").value = code; toast("Código leído"); } });
    $("#savePart").addEventListener("click", async () => {
      const data = { ...strip(part), name: val("p_name"), carId: val("p_car"), category: val("p_cat"), brand: val("p_brand"), oem: val("p_oem").toUpperCase(), ref: val("p_ref").toUpperCase(), barcode: val("p_barcode"), qty: num(val("p_qty"), 0), unit: val("p_unit"), minQty: num(val("p_min"), 0), location: val("p_loc"), price: val("p_price"), supplier: val("p_supplier"), notes: val("p_notes"), catalogId: part.catalogId || "" };
      if (!data.name) { toast("Escribe el nombre de la pieza"); return; }
      const twin = data.barcode && S.parts.find(p => p.id !== part.id && codeKey(p.barcode) === codeKey(data.barcode));
      if (twin) { toast(`Ese código ya es de «${twin.name}»`); return; }
      const file = $("#p_photo")?.files?.[0];
      $("#savePart").disabled = true;
      if (file) { const ph = await storeImage(file, 1200); if (ph) { await dropBlob(part.photoId); data.photoId = ph; } }
      const id = await save("parts", part.id, data);
      $("#savePart") && ($("#savePart").disabled = false);
      if (id) {
        if (opts.fromShop) await remove("shop", opts.fromShop);
        closeSheet(); toast(isNew ? "Repuesto añadido" : "Repuesto actualizado");
      }
    });
    $("#usePart")?.addEventListener("click", () => useInVehicle(part));
    $("#webPart")?.addEventListener("click", () => openWeb(part));
    $("#delPart")?.addEventListener("click", () => confirmSheet(`¿Borrar «${esc(part.name)}»?`, "Se quita del almacén.", async () => { await dropBlob(part.photoId); await remove("parts", part.id); closeSheet(); toast("Repuesto borrado"); }));
  }
  // Montar un repuesto: se apunta en el historial del vehículo y se descuenta del almacén
  function useInVehicle(part) {
    if (!S.cars.length) { toast("Primero añade un vehículo"); return; }
    logForm({}, { carId: part.carId || S.carId || S.cars[0].id, tasks: guessTasks(part), title: "Montaje: " + part.name, parts: [{ partId: part.id, name: part.name, qty: 1 }] });
  }

  function catalogForm(item = {}) {
    const isNew = !item.id;
    openSheet(`
      <h2>${isNew ? "Nueva pieza de despiece" : "Pieza de despiece"}</h2>
      <form class="form" id="f">
        ${field("k_name", "Pieza", item.name, { full: true })}
        ${field("k_car", "Vehículo", item.carId || S.catCar || S.carId || S.cars[0]?.id || "", { options: carOptions(false), full: true })}
        ${field("k_group", "Grupo", item.group || "Motor", { options: GROUPS })}
        ${field("k_qty", "Uds. en el vehículo", item.perCar, { inputmode: "numeric" })}
        ${field("k_oem", "Ref. OEM", item.oem, { mono: true })}
        ${field("k_alt", "Equivalentes", item.alt, { mono: true, ph: "Bosch W8DC, NGK BP6ES" })}
        ${field("k_notes", "Notas", item.notes, { area: true, full: true })}
        ${field("k_src", "Fuente", item.source, { full: true, ph: "Catálogo EPC, manual de taller…" })}
      </form>
      ${item.verified === false ? `<p class="banner">Referencia pendiente de verificar con catálogo oficial o vendedor.</p>` : ""}
      ${item.url ? `<a class="shop" href="${esc(item.url)}" target="_blank" rel="noopener"><strong>Ver dónde se encontró</strong><span>${esc((() => { try { return new URL(item.url).hostname.replace("www.", ""); } catch { return item.url; } })())}</span></a>` : ""}
      <div class="actions">
        <button class="btn primary" type="button" id="saveCat">Guardar</button>
        ${isNew ? `<button class="btn" type="button" data-close>Cancelar</button>` : `<button class="btn" type="button" id="toShop"><svg><use href="#i-cart"/></svg>Añadir a la lista de la compra</button><button class="btn danger" type="button" id="delCat">Borrar</button>`}
      </div>`);
    $("#saveCat").addEventListener("click", async () => {
      const data = { ...strip(item), lib: undefined, name: val("k_name"), carId: val("k_car"), group: val("k_group"), perCar: val("k_qty"), oem: val("k_oem").toUpperCase(), alt: val("k_alt"), notes: val("k_notes"), source: val("k_src") };
      if (!data.name || !data.carId) { toast(S.cars.length ? "Escribe el nombre de la pieza" : "Primero añade un vehículo"); return; }
      const id = await save("catalog", item.id, data);
      if (id) { closeSheet(); toast(isNew ? "Pieza añadida al despiece" : "Pieza actualizada"); }
    });
    $("#toShop")?.addEventListener("click", () => addToShop(item));
    $("#delCat")?.addEventListener("click", () => confirmSheet(`¿Borrar «${esc(item.name)}» del despiece?`, "No afecta a tu almacén.", async () => { await remove("catalog", item.id); closeSheet(); toast("Pieza borrada"); }));
  }

  function confirmSheet(title, body, onYes) {
    openSheet(`<h2>${title}</h2><p class="lead">${body}</p><div class="actions"><button class="btn danger" type="button" id="yes">Sí, continuar</button><button class="btn" type="button" data-close>Cancelar</button></div>`);
    $("#yes").addEventListener("click", async () => { $("#yes").disabled = true; await onYes(); });
  }

  // ---------- Formularios de mantenimiento ----------
  function partOptions(carId) {
    const sorted = [...S.parts].sort((a, b) => a.name.localeCompare(b.name, "es"));
    const opt = (p) => `<option value="${p.id}">${esc(p.name)} (quedan ${qtyFmt(num(p.qty))})</option>`;
    const mine = sorted.filter(p => p.carId === carId), gen = sorted.filter(p => !p.carId), other = sorted.filter(p => p.carId && p.carId !== carId);
    if (!sorted.length) return `<option value="">El almacén está vacío</option>`;
    return `<option value="">Elige una pieza…</option>${mine.length ? `<optgroup label="De este vehículo">${mine.map(opt).join("")}</optgroup>` : ""}${gen.length ? `<optgroup label="Generales">${gen.map(opt).join("")}</optgroup>` : ""}${other.length ? `<optgroup label="De otros vehículos">${other.map(opt).join("")}</optgroup>` : ""}`;
  }
  const taskChecks = (car, checked) => `<div class="check-grid">${[...taskList(car).filter(t => !t.off), { k: "otro", name: "Otro trabajo" }].map(t => `<label class="check"><input type="checkbox" value="${t.k}" ${checked.includes(t.k) ? "checked" : ""}>${esc(t.name)}</label>`).join("")}</div>`;
  function logForm(log = {}, opts = {}) {
    const isNew = !log.id;
    const carId = log.carId || opts.carId || S.carId || S.cars[0]?.id || "";
    const car = carById(carId) || {};
    let used = (log.parts || opts.parts || []).map(p => ({ ...p }));
    openSheet(`
      <h2>${isNew ? "Registrar trabajo" : "Editar trabajo"}</h2>
      <form class="form" id="f">
        ${field("l_car", "Vehículo", carId, { options: carOptions(false), full: true })}
        ${field("l_date", "Fecha", log.date || today(), { type: "date" })}
        ${field("l_km", "Kilómetros", log.km ?? car.km ?? "", { inputmode: "numeric" })}
        <fieldset class="field full checks"><legend>Qué se ha hecho</legend><div id="l_tasks">${taskChecks(car, log.tasks || opts.tasks || [])}</div></fieldset>
        ${field("l_title", "Descripción", log.title ?? opts.title ?? "", { full: true, ph: "Cambio de aceite en el taller de Paco", mic: true })}
        <div class="field full"><label for="l_part">Piezas del almacén usadas</label>
          <div class="add-part"><select id="l_part">${partOptions(carId)}</select><input id="l_qty" inputmode="decimal" value="1" aria-label="Cantidad"><button class="mini brass" type="button" id="l_add">Añadir</button></div>
          <div id="l_used" class="used"></div>
        </div>
        ${field("l_cost", "Coste (€)", log.cost, { inputmode: "decimal" })}
        ${field("l_notes", "Notas", log.notes, { area: true, full: true })}
      </form>
      <p class="note">Las piezas que añadas aquí se descuentan del almacén.</p>
      <div class="actions"><button class="btn primary" type="button" id="saveLog">Guardar</button>${isNew ? `<button class="btn" type="button" data-close>Cancelar</button>` : `<button class="btn danger" type="button" id="delLog">Borrar</button>`}</div>`);
    const drawUsed = () => { $("#l_used").innerHTML = used.map((u, i) => `<span class="chip">${esc(u.name)} ×${qtyFmt(num(u.qty, 1))}<button type="button" data-rm="${i}" aria-label="Quitar ${esc(u.name)}">×</button></span>`).join(""); };
    drawUsed();
    $("#l_used").onclick = (e) => { const b = e.target.closest("[data-rm]"); if (b) { used.splice(Number(b.dataset.rm), 1); drawUsed(); } };
    $("#l_add").onclick = () => {
      const p = S.parts.find(x => x.id === val("l_part")); if (!p) { toast("Elige una pieza del almacén"); return; }
      const q = num(val("l_qty"), 1) || 1, prev = used.find(u => u.partId === p.id);
      if (prev) prev.qty = num(prev.qty, 1) + q; else used.push({ partId: p.id, name: p.name, qty: q });
      drawUsed();
      const extra = guessTasks(p).filter(k => !$(`#l_tasks input[value="${k}"]`)?.checked);
      extra.forEach(k => { const cb = $(`#l_tasks input[value="${k}"]`); if (cb) cb.checked = true; });
    };
    $("#l_car").onchange = () => {
      const c = carById(val("l_car")) || {}, checked = [...document.querySelectorAll("#l_tasks input:checked")].map(i => i.value);
      $("#l_tasks").innerHTML = taskChecks(c, checked); $("#l_part").innerHTML = partOptions(c.id);
      if (!val("l_km") && c.km) $("#l_km").value = c.km;
    };
    $("#saveLog").onclick = async () => {
      const data = { carId: val("l_car"), date: val("l_date") || today(), km: val("l_km") ? Math.round(num(val("l_km"))) : "", tasks: [...document.querySelectorAll("#l_tasks input:checked")].map(i => i.value), title: val("l_title"), parts: used, cost: val("l_cost"), notes: val("l_notes"), createdAt: log.createdAt };
      if (!data.carId) { toast("Elige un vehículo"); return; }
      if (!data.tasks.length && !data.title && !used.length) { toast("Marca qué se ha hecho o escribe una descripción"); return; }
      $("#saveLog").disabled = true;
      await applyStock(log.parts, +1); await applyStock(used, -1);
      const id = await save("logs", log.id, data);
      const c = carById(data.carId);
      if (c && data.km && data.km > num(c.km)) await save("cars", c.id, { ...strip(c), km: String(data.km) });
      if (id) { closeSheet(); toast(isNew ? "Trabajo registrado" : "Trabajo actualizado"); }
    };
    $("#delLog")?.addEventListener("click", () => confirmSheet("¿Borrar este trabajo?", used.length ? "Las piezas que usaste vuelven al almacén." : "Se quita del historial.", async () => { await applyStock(log.parts, +1); await remove("logs", log.id); closeSheet(); toast("Trabajo borrado"); }));
  }
  function intervalsForm(car) {
    const list = taskList(car);
    openSheet(`<h2>Intervalos</h2><p class="lead">Cada cuánto toca cada trabajo en el ${esc(carName(car))}. Pon 0 si no quieres aviso por tiempo o por kilómetros.</p>
      <div class="intervals"><div class="iv-row"><label class="iv-on"><input type="checkbox" id="idleOn" ${car.idleOff ? "" : "checked"}>Avisar si lleva parado</label><div class="iv-in"><input inputmode="numeric" id="idleDays" value="${num(car.idleDays, IDLE_DAYS)}" aria-label="Días sin arrancar"><span>días</span></div></div>${list.map(t => `<div class="iv-row"><label class="iv-on"><input type="checkbox" data-iv-on="${t.k}" ${t.off ? "" : "checked"}>${esc(t.name)}</label><div class="iv-in"><input inputmode="numeric" data-iv-m="${t.k}" value="${t.months}" aria-label="Meses"><span>meses</span><input inputmode="numeric" data-iv-km="${t.k}" value="${t.km}" aria-label="Kilómetros"><span>km</span></div></div>`).join("")}</div>
      <div class="actions"><button class="btn primary" type="button" id="saveIv">Guardar</button><button class="btn" type="button" id="resetIv">Valores de fábrica</button></div>`);
    $("#saveIv").onclick = async () => {
      const iv = {};
      list.forEach(t => { iv[t.k] = { months: Math.max(0, Math.round(num($(`[data-iv-m="${t.k}"]`).value))), km: Math.max(0, Math.round(num($(`[data-iv-km="${t.k}"]`).value))), off: !$(`[data-iv-on="${t.k}"]`).checked }; });
      await save("cars", car.id, { ...strip(car), intervals: iv, idleDays: Math.max(1, Math.round(num($("#idleDays").value, IDLE_DAYS))), idleOff: !$("#idleOn").checked }); closeSheet(); toast("Intervalos guardados");
    };
    $("#resetIv").onclick = async () => { const { intervals, idleDays, idleOff, ...rest } = strip(car); await save("cars", car.id, rest); closeSheet(); toast("Intervalos de fábrica"); };
  }
  function datesForm(car) {
    openSheet(`<h2>Papeles</h2><p class="lead">La app te avisa 30 días antes de cada fecha del ${esc(carName(car))}.</p>
      <form class="form">
        ${field("d_itv", "Próxima ITV", car.itvDate, { type: "date" })}
        ${field("d_ins", "Vence el seguro", car.insuranceDate, { type: "date" })}
        ${field("d_tax", "Impuesto de circulación", car.taxDate, { type: "date" })}
        ${field("d_insurer", "Compañía de seguros", car.insurer)}
      </form>
      <p class="note">Los vehículos históricos pasan la ITV con otra frecuencia: pon la fecha que figura en la tarjeta de ITV.</p>
      <div class="actions"><button class="btn primary" type="button" id="saveDates">Guardar</button><button class="btn" type="button" data-close>Cancelar</button></div>`);
    $("#saveDates").onclick = async () => { await save("cars", car.id, { ...strip(car), itvDate: val("d_itv"), insuranceDate: val("d_ins"), taxDate: val("d_tax"), insurer: val("d_insurer") }); closeSheet(); toast("Fechas guardadas"); };
  }
  function kmForm(car) {
    openSheet(`<h2>Kilómetros</h2><p class="lead">Lo que marca ahora el cuentakilómetros del ${esc(carName(car))}.</p>
      <form class="form">${field("km_now", "Kilómetros", car.km, { inputmode: "numeric", full: true })}</form>
      <div class="actions"><button class="btn primary" type="button" id="saveKm">Guardar</button><button class="btn" type="button" data-close>Cancelar</button></div>`);
    $("#saveKm").onclick = async () => { await save("cars", car.id, { ...strip(car), km: val("km_now") ? String(Math.round(num(val("km_now")))) : "" }); closeSheet(); toast("Kilómetros actualizados"); };
  }

  // ---------- Dictado ----------
  // Usa el reconocimiento de voz del navegador; si no lo hay, se abre el teclado para usar su micrófono
  let rec = null;
  function stopDictation() { if (rec) { try { rec.stop(); } catch {} rec = null; } document.querySelectorAll(".mic.on").forEach(b => b.classList.remove("on")); }
  function dictate(btn) {
    const el = $("#" + btn.dataset.mic); if (!el) return;
    if (btn.classList.contains("on")) { stopDictation(); return; }
    stopDictation();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const keyboard = () => { el.focus(); toast("Pulsa el micrófono del teclado para dictar"); };
    if (!SR) { keyboard(); return; }
    const base = el.value.trim(), r = new SR();
    r.lang = "es-ES"; r.interimResults = true; r.continuous = true;
    r.onresult = (e) => {
      const said = [...e.results].map(x => x[0].transcript.trim()).filter(Boolean).join(" ");
      el.value = [base, base && /[.!?]$/.test(base) || !base ? cap(said) : said].filter(Boolean).join(" ");
    };
    r.onerror = (e) => { stopDictation(); if (e.error === "not-allowed" || e.error === "service-not-allowed") keyboard(); else if (e.error !== "aborted" && e.error !== "no-speech") toast("No te he entendido. Prueba otra vez"); };
    r.onend = () => { if (rec === r) { rec = null; btn.classList.remove("on"); } };
    try { r.start(); rec = r; btn.classList.add("on"); toast("Habla ahora. Toca otra vez para terminar"); } catch { keyboard(); }
  }
  document.addEventListener("click", (e) => { const b = e.target.closest("[data-mic]"); if (b) { e.preventDefault(); dictate(b); } });

  // ---------- Salidas ----------
  function tripForm(trip = {}, carId) {
    const isNew = !trip.id, car = carById(trip.carId || carId) || S.cars[0] || {};
    const startKm = isNew ? num(car.km) : num(trip.odo) - num(trip.dist);
    openSheet(`
      <h2>${isNew ? "Registrar salida" : "Editar salida"}</h2>
      <p class="lead">Al volver, apunta lo que marca el cuentakilómetros: la app calcula lo recorrido y se da por arrancado.</p>
      <form class="form" id="f">
        ${field("t_car", "Vehículo", car.id, { options: carOptions(false), full: true })}
        ${field("t_date", "Fecha", trip.date || today(), { type: "date" })}
        ${field("t_odo", "Km al volver", trip.odo ?? "", { inputmode: "numeric", ph: startKm ? "Antes: " + Math.round(startKm).toLocaleString("es-ES") : "Cuentakilómetros" })}
        ${field("t_dist", "Km recorridos", trip.dist ?? "", { inputmode: "numeric" })}
        ${field("t_liters", "Litros repostados", trip.liters ?? "", { inputmode: "decimal", ph: "Si has echado" })}
        ${field("t_cost", "Gasolina (€)", trip.fuelCost ?? "", { inputmode: "decimal" })}
        ${field("t_notes", "Notas", trip.notes, { area: true, full: true, ph: "Concentración de clásicos, ruta por la sierra…" })}
      </form>
      <p class="note">Para el consumo, apunta los litros cuando llenes el depósito: la media es aproximada.</p>
      <div class="actions"><button class="btn primary" type="button" id="saveTrip">Guardar</button>${isNew ? `<button class="btn" type="button" data-close>Cancelar</button>` : `<button class="btn danger" type="button" id="delTrip">Borrar</button>`}</div>`);
    const base = () => isNew ? num(carById(val("t_car"))?.km) : startKm;
    $("#t_odo").addEventListener("input", () => { const d = num(val("t_odo")) - base(); if (base() > 0 && d > 0) $("#t_dist").value = Math.round(d); });
    $("#t_car").onchange = () => { const c = carById(val("t_car")); $("#t_odo").placeholder = c?.km ? "Antes: " + Math.round(num(c.km)).toLocaleString("es-ES") : "Cuentakilómetros"; };
    $("#saveTrip").onclick = async () => {
      const data = { carId: val("t_car"), date: val("t_date") || today(), odo: val("t_odo") ? Math.round(num(val("t_odo"))) : "", dist: val("t_dist") ? Math.round(num(val("t_dist"))) : "", liters: val("t_liters") ? num(val("t_liters")) : "", fuelCost: val("t_cost") ? num(val("t_cost")) : "", notes: val("t_notes"), createdAt: trip.createdAt };
      if (!data.carId) { toast("Elige un vehículo"); return; }
      $("#saveTrip").disabled = true;
      const id = await save("trips", trip.id, data);
      const c = carById(data.carId);
      if (c && data.odo && data.odo > num(c.km)) await save("cars", c.id, { ...strip(c), km: String(data.odo) });
      if (id) { closeSheet(); toast(isNew ? "Salida registrada" : "Salida actualizada"); }
    };
    $("#delTrip")?.addEventListener("click", () => confirmSheet("¿Borrar esta salida?", "Se quita del historial de uso.", async () => { await remove("trips", trip.id); closeSheet(); toast("Salida borrada"); }));
  }

  // ---------- Ficha en PDF ----------
  // Se monta una página limpia y se abre la ventana de imprimir, que permite guardarla como PDF
  function carReport(c) {
    const q = { ...quickRef(c), ...(c.quick || {}) };
    const logs = carLogs(c.id), trips = tripStats(c.id, ""), year = tripStats(c.id);
    const docs = S.docs.filter(d => d.carId === c.id);
    const spent = logs.reduce((n, l) => n + num(l.cost), 0);
    const row = (k, v) => v ? `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>` : "";
    const photo = photoUrl(c);
    return `<article class="report">
      <header><div><p class="r-kicker">${esc(c.make)}</p><h1>${esc(c.model)}</h1>${c.version ? `<p class="r-sub">${esc(c.version)}</p>` : ""}</div>${c.plate ? `<span class="r-plate">${esc(c.plate)}</span>` : ""}</header>
      ${photo ? `<img class="r-photo" src="${esc(photo)}" alt="">` : ""}
      <h2>Datos del vehículo</h2>
      <table>${row("Año", c.year)}${row("Matrícula", c.plate)}${row("Bastidor", c.vin)}${row("Motor", c.engine)}${row("Color", c.color)}${row("Kilómetros", c.km ? kmFmt(c.km) : "")}</table>
      ${DATE_FIELDS.some(([f]) => c[f]) || c.insurer ? `<h2>Papeles</h2><table>${DATE_FIELDS.map(([f, l]) => row(l, c[f] ? fmtDate(c[f]) : "")).join("")}${row("Compañía de seguros", c.insurer)}</table>` : ""}
      ${QUICK.some(([k]) => q[k]) ? `<h2>Datos de mantenimiento</h2><table>${QUICK.map(([k, l]) => row(l, q[k])).join("")}</table>` : ""}
      <h2>Estado del mantenimiento</h2>
      <table class="r-grid"><thead><tr><th>Trabajo</th><th>Último</th><th>Próximo</th></tr></thead><tbody>${taskList(c).filter(t => !t.off).map(t => { const st = taskStatus(c, t); return `<tr><td>${esc(t.name)}</td><td>${st.last ? fmtDate(st.last.date) + (st.last.km ? "<br>" + kmFmt(st.last.km) : "") : "—"}</td><td>${st.last ? esc(cap(dueText(st))) : esc(intervalText(t))}</td></tr>`; }).join("")}</tbody></table>
      <h2>Historial de trabajos${logs.length ? " · " + logs.length : ""}</h2>
      ${logs.length ? `<table class="r-grid"><thead><tr><th>Fecha</th><th>Trabajo</th><th>Coste</th></tr></thead><tbody>${logs.map(l => `<tr><td>${fmtDate(l.date)}${l.km ? "<br>" + kmFmt(l.km) : ""}</td><td><b>${esc(l.title || taskNames(l.tasks) || "Trabajo")}</b>${l.title && l.tasks?.length ? "<br>" + esc(taskNames(l.tasks)) : ""}${l.parts?.length ? "<br>Piezas: " + esc(l.parts.map(p => p.name + (num(p.qty, 1) !== 1 ? " ×" + qtyFmt(num(p.qty)) : "")).join(", ")) : ""}${l.notes ? "<br><i>" + esc(l.notes) + "</i>" : ""}</td><td>${l.cost ? euro(l.cost) : ""}</td></tr>`).join("")}</tbody>${spent ? `<tfoot><tr><td></td><th>Total</th><th>${euro(spent)}</th></tr></tfoot>` : ""}</table>` : `<p>Sin trabajos registrados.</p>`}
      ${trips.count ? `<h2>Uso</h2><table>${row("Salidas registradas", String(trips.count))}${row("Kilómetros recorridos", kmFmt(trips.km))}${row("Este año", year.count + (year.count === 1 ? " salida · " : " salidas · ") + kmFmt(year.km))}${row("Consumo medio aproximado", trips.consumo ? trips.consumo.toFixed(1).replace(".", ",") + " L/100 km" : "")}${row("Gasolina", trips.cost ? euro(trips.cost) : "")}</table>` : ""}
      ${docs.length ? `<h2>Documentación</h2><table class="r-grid"><tbody>${docs.map(d => `<tr><td>${esc(d.title || d.type)}</td><td>${esc(d.type)}</td><td>${d.date ? fmtDate(d.date) : ""}${d.expiry ? "<br>Caduca " + fmtDate(d.expiry) : ""}</td></tr>`).join("")}</tbody></table>` : ""}
      ${c.notes ? `<h2>Notas</h2><p class="r-notes">${esc(c.notes)}</p>` : ""}
      <footer>Ficha generada con Garaje Clásico el ${fmtDate(today())}</footer>
    </article>`;
  }
  async function printCar(c) {
    if (!c) return;
    let box = $("#print");
    if (!box) { box = document.createElement("div"); box.id = "print"; document.body.appendChild(box); }
    box.innerHTML = carReport(c);
    await Promise.all([...box.querySelectorAll("img")].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; setTimeout(r, 4000); })));
    const old = document.title;
    document.title = "Ficha " + carName(c) + (c.plate ? " " + c.plate : "");
    toast("Elige «Guardar como PDF» o compártelo");
    setTimeout(() => { window.print(); document.title = old; }, 300);
  }

  // ---------- Lista de la compra ----------
  async function addToShop(item) {
    if (S.shop.some(x => x.catalogId && x.catalogId === item.id)) { toast("Ya está en la lista de la compra"); return; }
    await save("shop", null, { name: item.name, carId: item.carId || "", oem: item.oem || "", alt: item.alt || "", catalogId: item.id || "", qty: 1, note: "" });
    closeSheet(); toast("Añadido a la lista de la compra");
  }
  function shopForm(x = {}) {
    const isNew = !x.id;
    openSheet(`<h2>${isNew ? "Añadir a la lista" : "En la lista"}</h2>
      <form class="form">
        ${field("s_name", "Qué hay que comprar", x.name, { full: true, ph: "Bidón de aceite 10W-40" })}
        ${field("s_car", "Vehículo", x.carId ?? (S.carId || ""), { options: carOptions(), full: true })}
        ${field("s_oem", "Ref. OEM", x.oem, { mono: true })}
        ${field("s_qty", "Cantidad", x.qty ?? 1, { inputmode: "decimal" })}
        ${field("s_alt", "Equivalentes", x.alt, { mono: true, full: true })}
        ${field("s_note", "Nota", x.note, { full: true, ph: "Preguntar en el desguace de la carretera" })}
      </form>
      <div class="actions"><button class="btn primary" type="button" id="saveShop">Guardar</button>${isNew ? `<button class="btn" type="button" data-close>Cancelar</button>` : `<button class="btn" type="button" id="webShop"><svg><use href="#i-web"/></svg>Buscar en tiendas</button><button class="btn danger" type="button" id="delShop">Quitar de la lista</button>`}</div>`);
    $("#saveShop").onclick = async () => {
      const data = { ...strip(x), name: val("s_name"), carId: val("s_car"), oem: val("s_oem").toUpperCase(), qty: num(val("s_qty"), 1) || 1, alt: val("s_alt"), note: val("s_note") };
      if (!data.name) { toast("Escribe qué hay que comprar"); return; }
      if (await save("shop", x.id, data)) { closeSheet(); toast(isNew ? "Añadido a la lista" : "Lista actualizada"); }
    };
    $("#webShop")?.addEventListener("click", () => openWeb({ name: x.name, carId: x.carId, oem: x.oem, ref: x.alt }));
    $("#delShop")?.addEventListener("click", async () => { await remove("shop", x.id); closeSheet(); toast("Quitado de la lista"); });
  }
  function boughtPart(p) {
    const suggest = Math.max(1, num(p.minQty) - num(p.qty) + 1);
    openSheet(`<h2>${esc(p.name)}</h2><p class="lead">¿Cuántas has comprado? Se suman a las ${qtyFmt(num(p.qty))} que tienes.</p>
      <form class="form">${field("b_qty", "Cantidad comprada", suggest, { inputmode: "decimal", full: true })}</form>
      <div class="actions"><button class="btn primary" type="button" id="saveBought">Sumar al almacén</button><button class="btn" type="button" data-close>Cancelar</button></div>`);
    $("#saveBought").onclick = async () => { p.qty = num(p.qty) + (num(val("b_qty"), 1) || 1); await save("parts", p.id, strip(p)); closeSheet(); toast(`${p.name}: ahora tienes ${qtyFmt(num(p.qty))}`); };
  }
  function boughtShop(x) {
    const p = x.catalogId ? S.parts.find(pp => pp.catalogId === x.catalogId) : null;
    if (p) { p.qty = num(p.qty) + num(x.qty, 1); save("parts", p.id, strip(p)).then(() => remove("shop", x.id)); toast(`${p.name}: ahora tienes ${qtyFmt(num(p.qty))}`); return; }
    const cat = x.catalogId ? S.catalog.find(i => i.id === x.catalogId) : null;
    partForm({ name: x.name, carId: x.carId, oem: x.oem, ref: (x.alt || "").split(/[,;]/)[0]?.trim() || "", qty: num(x.qty, 1), category: cat ? groupToCat(cat.group) : "Otros", catalogId: x.catalogId || "", notes: x.note || "" }, { fromShop: x.id });
  }
  const shopLines = () => [
    ...S.parts.filter(p => stockState(p) !== "ok").map(p => `• ${p.name}${p.oem ? ` (${p.oem})` : ""} · ${carName(carById(p.carId))}`),
    ...S.shop.map(x => `• ${x.name}${x.oem ? ` (${x.oem})` : ""}${num(x.qty, 1) > 1 ? ` ×${qtyFmt(num(x.qty))}` : ""} · ${carName(carById(x.carId))}`),
  ];
  async function shareShop() {
    const lines = shopLines(); if (!lines.length) { toast("La lista está vacía"); return; }
    const text = "Lista de la compra · Garaje Clásico\n" + lines.join("\n");
    if (navigator.share) { try { await navigator.share({ text }); return; } catch (e) { if (e.name === "AbortError") return; } }
    openSheet(`<h2>Lista de la compra</h2><p class="lead">Cópiala y mándala por WhatsApp o por correo.</p><pre class="share-text" id="shopTxt">${esc(text)}</pre>
      <div class="actions"><button class="btn primary" type="button" id="copyShop">Copiar la lista</button><button class="btn" type="button" data-close>Cerrar</button></div>`);
    $("#copyShop").onclick = () => copyText(text, $("#shopTxt"), "Lista copiada");
  }

  // ---------- Fotos del vehículo y documentos ----------
  const carPhotos = (c) => [...new Set([c.photoId, ...(c.gallery || [])].filter(Boolean))];
  async function addCarPhotos(car, files) {
    let ids = [];
    for (const f of files) { const id = await storeImage(f); if (id) ids.push(id); }
    if (!ids.length) return;
    const fresh = carById(car.id) || car;
    const data = { ...strip(fresh), gallery: [...(fresh.gallery || []), ...ids.filter((_, i) => fresh.photoId || i > 0)] };
    if (!fresh.photoId) data.photoId = ids[0];
    await save("cars", car.id, data);
    toast(ids.length === 1 ? "Foto añadida" : ids.length + " fotos añadidas");
  }
  async function photoSheet(car, id) {
    const url = await blobUrlAsync(id), isMain = car.photoId === id;
    openSheet(`<img class="lightbox" src="${esc(url)}" alt="Foto del ${esc(carName(car))}">
      <div class="actions">${isMain ? `<span class="chip ok">Foto principal</span>` : `<button class="btn primary" type="button" id="mainPh">Usar como foto principal</button>`}<button class="btn danger" type="button" id="delPh">Borrar foto</button><button class="btn" type="button" data-close>Cerrar</button></div>`);
    $("#mainPh")?.addEventListener("click", async () => {
      const gallery = carPhotos(car).filter(x => x !== id);
      await save("cars", car.id, { ...strip(car), photoId: id, gallery }); closeSheet(); toast("Foto principal cambiada");
    });
    $("#delPh").onclick = () => confirmSheet("¿Borrar esta foto?", "Se borra del teléfono.", async () => {
      const rest = carPhotos(car).filter(x => x !== id);
      await dropBlob(id);
      await save("cars", car.id, { ...strip(car), photoId: isMain ? (rest[0] || "") : car.photoId, gallery: isMain ? rest.slice(1) : rest.filter(x => x !== car.photoId) });
      closeSheet(); toast("Foto borrada");
    });
  }
  function docForm(doc = {}, carId) {
    const isNew = !doc.id;
    openSheet(`<h2>${isNew ? "Añadir documento" : "Editar documento"}</h2>
      <form class="form">
        ${field("o_type", "Tipo", doc.type || "Factura", { options: DOC_TYPES })}
        ${field("o_date", "Fecha del documento", doc.date || today(), { type: "date" })}
        ${field("o_title", "Título", doc.title, { full: true, ph: "Póliza 2026, factura del taller…" })}
        ${field("o_exp", "Caduca el (si aplica)", doc.expiry, { type: "date", full: true })}
        ${isNew ? `<div class="field full"><label for="o_file">Archivo (foto o PDF)</label><input id="o_file" type="file" accept="image/*,application/pdf"></div>` : ""}
        ${field("o_notes", "Notas", doc.notes, { area: true, full: true })}
      </form>
      <p class="note">Si es el seguro, la ITV o el impuesto, la fecha de caducidad se usa también para los avisos.</p>
      <div class="actions"><button class="btn primary" type="button" id="saveDoc">Guardar</button><button class="btn" type="button" data-close>Cancelar</button></div>`);
    $("#saveDoc").onclick = async () => {
      const data = { ...strip(doc), carId: doc.carId || carId, type: val("o_type"), date: val("o_date"), title: val("o_title"), expiry: val("o_exp"), notes: val("o_notes") };
      if (isNew) {
        const f = $("#o_file").files[0]; if (!f) { toast("Elige la foto o el PDF del documento"); return; }
        if (f.size > 25 * 1024 * 1024) { toast("El archivo pasa de 25 MB. Prueba con una foto."); return; }
        $("#saveDoc").disabled = true; toast("Guardando el documento…");
        const isImg = f.type.startsWith("image/");
        data.fileId = isImg ? await storeImage(f, 2200, "doc-") : await storeBlob(f, "doc-");
        if (!data.fileId) { $("#saveDoc").disabled = false; return; }
        data.mime = isImg ? "image/jpeg" : (f.type || "application/octet-stream"); data.fileName = f.name;
      }
      const id = await save("docs", doc.id, data);
      const dateField = DOC_DATE_FIELD[data.type], car = carById(data.carId);
      if (dateField && data.expiry && car && car[dateField] !== data.expiry) await save("cars", car.id, { ...strip(car), [dateField]: data.expiry });
      if (id) { closeSheet(); toast(isNew ? "Documento guardado" : "Documento actualizado"); }
    };
  }
  async function docViewer(doc) {
    const url = await blobUrlAsync(doc.fileId), isImg = (doc.mime || "").startsWith("image/");
    openSheet(`<h2>${esc(doc.title || doc.type)}</h2><p class="lead">${esc(doc.type)}${doc.date ? " · " + fmtDate(doc.date) : ""}${doc.expiry ? " · caduca el " + fmtDate(doc.expiry) : ""}</p>
      ${!url ? `<p class="banner">No encuentro el archivo en este teléfono.</p>` : isImg ? `<img class="lightbox" src="${esc(url)}" alt="${esc(doc.title || doc.type)}">` : `<a class="btn primary" href="${esc(url)}" target="_blank" rel="noopener"><svg><use href="#i-doc"/></svg>Abrir ${esc(doc.fileName || "el documento")}</a>`}
      ${doc.notes ? `<p class="note" style="white-space:pre-wrap">${esc(doc.notes)}</p>` : ""}
      <div class="actions">${url ? `<button class="btn" type="button" id="shareDoc">Compartir</button>` : ""}<button class="btn" type="button" id="editDoc">Editar</button><button class="btn danger" type="button" id="delDoc">Borrar</button></div>`);
    $("#shareDoc")?.addEventListener("click", async () => {
      const b = await getBlob(doc.fileId); if (!b) return;
      const name = doc.fileName || ((doc.title || doc.type) + (isImg ? ".jpg" : ".pdf"));
      const file = new File([b], name, { type: doc.mime || b.type });
      if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: doc.title || doc.type }); } catch {} }
      else { const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
    });
    $("#editDoc").onclick = () => docForm(doc);
    $("#delDoc").onclick = () => confirmSheet("¿Borrar este documento?", "Se borra del teléfono.", async () => { await dropBlob(doc.fileId); await remove("docs", doc.id); closeSheet(); toast("Documento borrado"); });
  }

  function addMenu() {
    openSheet(`
      <h2>Añadir</h2>
      <div class="actions" style="flex-direction:column">
        <button class="btn primary" type="button" data-add="log"><svg><use href="#i-wrench"/></svg>Registrar un trabajo</button>
        <button class="btn" type="button" data-add="trip"><svg><use href="#i-car"/></svg>Registrar una salida</button>
        <button class="btn" type="button" data-add="part"><svg><use href="#i-box"/></svg>Repuesto al almacén</button>
        <button class="btn" type="button" data-add="scan"><svg><use href="#i-scan"/></svg>Escanear un código de barras</button>
        <button class="btn" type="button" data-add="shop"><svg><use href="#i-cart"/></svg>Algo a la lista de la compra</button>
        <button class="btn" type="button" data-add="car"><svg><use href="#i-car"/></svg>Vehículo</button>
      </div>`);
    $("#sheetBody").onclick = e => {
      const b = e.target.closest("[data-add]"); if (!b) return;
      const k = b.dataset.add;
      if (k === "car") carForm(); else if (k === "part") partForm(); else if (k === "trip" && S.cars.length) tripForm({}, S.carId); else if (k === "shop") shopForm();
      else if (k === "scan") { closeSheet(); scanToStock(); }
      else S.cars.length ? logForm() : (toast("Primero añade un vehículo"), carForm());
    };
  }

  // Enlace de alta: #importar=<json en base64url>. El fragmento nunca llega al servidor.
  async function importFromLink(text = location.hash) {
    const sm = String(text).match(/#sync=([A-Za-z0-9_-]+)/);
    if (sm) {
      if (location.hash) history.replaceState(history.state, "", location.pathname + location.search);
      let cfg; try { cfg = JSON.parse(unb64url(sm[1])); } catch { toast("El enlace está incompleto"); return; }
      openSheet(`<h2>Compartir entre móviles</h2><p class="lead">Este móvil se conectará a <span class="mono">${esc(cfg.repo)}</span> y se juntarán sus datos con los del otro móvil. No se borra nada.</p>
        <div class="actions"><button class="btn primary" type="button" id="syncYes">Conectar</button><button class="btn" type="button" data-close>Ahora no</button></div>`);
      $("#syncYes").onclick = async () => { $("#syncYes").disabled = true; if (await connectSync(cfg)) closeSheet(); else if ($("#syncYes")) $("#syncYes").disabled = false; };
      return;
    }
    const m = String(text).match(/#importar=([A-Za-z0-9_-]+)/);
    if (!m) { if (text !== location.hash) toast("Ese texto no es un enlace de la app"); return; }
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    let d;
    try {
      const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
      const bytes = Uint8Array.from(atob(b64 + "===".slice((b64.length + 3) % 4)), c => c.charCodeAt(0));
      d = JSON.parse(new TextDecoder().decode(bytes));
    } catch { toast("El enlace de alta está incompleto"); return; }
    const nuevos = (d.coches || []).filter(c => c.id && !S.cars.some(x => x.id === c.id));
    if (!nuevos.length) { toast("Esos vehículos ya están en el garaje"); return; }
    openSheet(`<h2>Añadir ${nuevos.length} vehículos</h2>
      <p class="lead">${nuevos.map(c => esc(carName(c))).join(", ")}.</p>
      <p class="note">Se añaden a lo que ya tienes; no se borra nada.</p>
      <div class="actions"><button class="btn primary" type="button" id="addLink">Añadir al garaje</button><button class="btn" type="button" data-close>Ahora no</button></div>`);
    $("#addLink").addEventListener("click", async () => {
      for (const c of nuevos) await idbPut("cars", c);
      for (const p of d.repuestos || []) if (!S.parts.some(x => x.id === p.id)) await idbPut("parts", p);
      await loadAll(); closeSheet(); S.tab = "garage"; render(); toast(nuevos.length + " vehículos añadidos");
    });
  }

  // ---------- Guía de bienvenida ----------
  const GUIDE = [
    ["i-car", "Bienvenido al garaje", "Aquí tienes tus coches y motos, sus repuestos, su mantenimiento y sus papeles. Todo funciona también sin cobertura."],
    ["i-cal", "Avisos", "Arriba del garaje salen los avisos: ITV, seguro, impuesto y mantenimientos que tocan. Tócalo para ir al vehículo."],
    ["i-wrench", "Mantenimiento", "Entra en un vehículo y pulsa «Registrar» junto a cada trabajo. Apunta el último cambio de aceite que recuerdes y la app empezará a contar."],
    ["i-moto", "Salidas", "Cuando saques uno, pulsa «Registrar salida» y apunta los km al volver. Si un vehículo lleva un mes parado te avisa para arrancarlo."],
    ["i-box", "Almacén", "Guarda lo que tienes en el taller con su cantidad. Con − y + la cambias de un toque. Apunta dónde está guardado cada repuesto y lo encontrarás al momento. Si la caja tiene código de barras, pulsa «Escanear»."],
    ["i-cart", "Usar y comprar", "Al montar una pieza, ábrela y pulsa «Usar en un vehículo»: se descuenta y queda en el historial. Lo que baja del mínimo pasa solo a la lista de la compra."],
    ["i-gear", "Despiece y búsqueda", "Cada vehículo tiene sus piezas con referencia OEM. El botón del mundo busca la pieza en tiendas y desguaces."],
    ["i-doc", "Papeles y fotos", "En cada vehículo puedes guardar fotos, la ficha técnica, el seguro y las facturas, y sacar una ficha en PDF con todo su historial. En las notas, el micrófono te deja dictar en vez de escribir."],
    ["i-dots", "Opciones", "En el botón ⋯ de arriba están la copia de seguridad, compartir entre móviles y la letra más grande. Esta guía también está ahí."],
  ];
  function showGuide(step = 0) {
    const [icon, title, text] = GUIDE[step], last = step === GUIDE.length - 1;
    openSheet(`<div class="guide">
        <div class="guide-icon"><svg><use href="#${icon}"/></svg></div>
        <span class="eyebrow">${step + 1} de ${GUIDE.length}</span>
        <h2>${title}</h2>
        <p class="lead">${text}</p>
        <div class="dots" aria-hidden="true">${GUIDE.map((_, i) => `<span class="${i === step ? "on" : ""}"></span>`).join("")}</div>
      </div>
      <div class="actions">${step ? `<button class="btn" type="button" id="gPrev">Anterior</button>` : `<button class="btn" type="button" id="gSkip">Saltar</button>`}<button class="btn primary" type="button" id="gNext">${last ? "Empezar" : "Siguiente"}</button></div>`);
    lsSet("guideSeen", "1");
    $("#gNext").onclick = () => last ? closeSheet() : showGuide(step + 1);
    $("#gPrev")?.addEventListener("click", () => showGuide(step - 1));
    $("#gSkip")?.addEventListener("click", closeSheet);
  }

  function moreMenu() {
    const last = lsGet("lastBackup");
    openSheet(`
      <h2>Opciones</h2>
      <p class="lead">${S.cars.length} vehículos · ${S.parts.length} repuestos · ${S.logs.length} trabajos · ${S.trips.length} salidas · ${S.docs.length} documentos</p>
      <div class="banner">Los datos se guardan solo en este teléfono. ${last ? "Última copia: " + fmtDate(last.slice(0, 10)) + "." : "Todavía no has hecho ninguna copia."} La app te lo recuerda cada ${BACKUP_DAYS} días.</div>
      <div class="actions" style="flex-direction:column">
        <button class="btn primary" type="button" id="exportBtn"><svg><use href="#i-down"/></svg>Hacer copia de seguridad</button>
        <button class="btn" type="button" id="importBtn">Restaurar una copia</button>
        <button class="btn" type="button" id="syncBtn">Compartir entre móviles${syncCfg() ? " · conectado" : ""}</button>
        <button class="btn" type="button" id="pasteBtn">Pegar enlace</button>
        <input type="file" id="importFile" hidden>
        <button class="btn" type="button" id="guideBtn">Cómo se usa la app</button>
        <button class="btn" type="button" id="themeBtn">Cambiar tema claro / oscuro</button>
        <div class="field"><span class="eyebrow">Tamaño de la letra</span><div class="seg" role="group" aria-label="Tamaño de la letra">${[["", "Normal"], ["grande", "Grande"], ["muy-grande", "Muy grande"]].map(([k, l]) => `<button type="button" data-text-size="${k}" aria-pressed="${(lsGet("textSize") || "") === k}">${l}</button>`).join("")}</div></div>
        <button class="btn" type="button" data-close>Cerrar</button>
      </div>
      <p class="note">Despieces disponibles: ${libIndex.length ? libIndex.map(l => esc(l.title)).join(", ") : "ninguno todavía"}.</p>`);
    $("#exportBtn").addEventListener("click", exportBackup);
    $("#syncBtn").addEventListener("click", syncSheet);
    $("#guideBtn").addEventListener("click", () => showGuide(0));
    document.querySelectorAll("[data-text-size]").forEach(b => b.addEventListener("click", () => {
      setTextSize(b.dataset.textSize);
      document.querySelectorAll("[data-text-size]").forEach(x => x.setAttribute("aria-pressed", x === b));
    }));
    $("#importBtn").addEventListener("click", () => $("#importFile").click());
    $("#pasteBtn").addEventListener("click", () => {
      openSheet(`<h2>Pegar enlace</h2><p class="lead">Mantén pulsado el recuadro, elige «Pegar» y pulsa «Añadir».</p>
        <div class="field"><label for="linkTxt">Enlace</label><textarea id="linkTxt" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea></div>
        <div class="actions"><button class="btn primary" type="button" id="linkGo">Añadir</button><button class="btn" type="button" data-close>Cancelar</button></div>`);
      $("#linkGo").addEventListener("click", () => importFromLink($("#linkTxt").value));
    });
    $("#importFile").addEventListener("change", e => { const f = e.target.files[0]; if (f) confirmSheet("¿Restaurar esta copia?", "Se sustituyen todos los datos actuales del teléfono por los de la copia.", () => importBackup(f)); });
    $("#themeBtn").addEventListener("click", () => {
      const r = document.documentElement, cur = r.dataset.theme || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
      r.dataset.theme = cur === "dark" ? "light" : "dark";
      lsSet("theme", r.dataset.theme);
    });
  }

  // Catálogos oficiales con despiece completo: se montan con el bastidor guardado en el teléfono
  function officialLinks(c) {
    const out = [], vin = String(c.vin || "").replace(/[\s-]/g, ""), mk = norm(c.make);
    const add = (label, url) => out.push({ label, url });
    if (vin && /mercedes|bmw|mitsubishi|honda|renault/.test(mk)) add("Despiece por bastidor (Partsouq)", "https://partsouq.com/en/search/all?q=" + encodeURIComponent(vin));
    if (/bmw/.test(mk) && vin.length >= 7) add("Despiece por bastidor (RealOEM)", "https://www.realoem.com/bmw/enUS/select?vin=" + encodeURIComponent(vin.slice(-7)));
    (libDocs[c.catalogKey]?.links || []).forEach(l => add(l.label, l.url));
    add("Buscar despiece en Google", "https://www.google.com/search?q=" + encodeURIComponent(["despiece", c.make, c.model, c.version, c.year].filter(Boolean).join(" ")));
    return out;
  }
  const linksBlock = (c) => `<div class="shops">${officialLinks(c).map(l => `<a class="shop" href="${esc(l.url)}" target="_blank" rel="noopener"><strong>${esc(l.label)}</strong><span>${esc(new URL(l.url).hostname.replace("www.", ""))}</span></a>`).join("")}</div>`;
  function catIntro(c, items) {
    const doc = libDocs[c.catalogKey];
    const ok = items.filter(i => i.verified !== false).length;
    return `${doc?.vehicle ? `<p class="note" style="margin:0">${esc(doc.vehicle)}</p>` : ""}
      ${items.length ? `<div class="chips"><span class="chip ok">${ok} con fuente fiable</span>${items.length - ok ? `<span class="chip warn">${items.length - ok} por verificar</span>` : ""}</div>` : ""}
      <div class="eyebrow">Despiece oficial completo</div>${linksBlock(c)}`;
  }

  // ---------- Vistas ----------
  const stepper = (p) => `<div class="stepper ${stockState(p)}" aria-label="Cantidad"><button type="button" data-step="-1" data-id="${p.id}" aria-label="Quitar uno">−</button><output>${qtyFmt(num(p.qty))}</output><button type="button" data-step="1" data-id="${p.id}" aria-label="Añadir uno">+</button></div>`;
  function partRow(p, showCar = true) {
    const car = carById(p.carId), st = stockState(p), th = blobUrl(p.photoId);
    return `<div class="row">
      <button class="row-main${p.photoId ? " has-thumb" : ""}" type="button" data-part="${p.id}">
        ${p.photoId ? `<img class="thumb" src="${esc(th)}" alt="">` : ""}
        <span class="row-text">
          <strong>${esc(p.name)}</strong>
          <span class="row-meta">
            ${p.oem ? `<span class="mono">${esc(p.oem)}</span>` : (p.ref ? `<span class="mono">${esc(p.ref)}</span>` : "")}
            ${p.brand ? `<span>${esc(p.brand)}</span>` : ""}
            ${showCar ? `<span>${esc(car ? carName(car) : "General")}</span>` : ""}
            ${p.location && S.stockGroup !== "loc" ? `<span class="loc"><svg><use href="#i-pin"/></svg>${esc(p.location)}</span>` : ""}
            ${st === "zero" ? `<span class="chip crit">Agotado</span>` : st === "low" ? `<span class="chip warn">Reponer</span>` : ""}
          </span>
        </span>
      </button>
      ${stepper(p)}
    </div>`;
  }
  function inStockFor(item) {
    const keys = [item.oem, ...(String(item.alt || "").split(/[,;]/))].map(codeKey).filter(k => k.length > 2);
    return S.parts.filter(p => (p.catalogId && p.catalogId === item.id) || keys.includes(codeKey(p.oem)) || keys.includes(codeKey(p.ref)));
  }
  function catRow(it, showCar = false) {
    const have = inStockFor(it);
    const qty = have.reduce((a, p) => a + num(p.qty), 0);
    const car = carById(it.carId);
    return `<div class="row">
      <button class="row-main" type="button" data-cat="${it.id}">
        <strong>${esc(it.name)}</strong>
        <span class="row-meta">
          ${it.oem ? `<span class="mono">${esc(it.oem)}</span>` : `<span>Sin código</span>`}
          ${it.perCar ? `<span>${esc(it.perCar)} en el vehículo</span>` : ""}
          ${showCar && car ? `<span>${esc(carName(car))}</span>` : ""}
          ${have.length ? `<span class="chip ok">Tienes ${qtyFmt(qty)}</span>` : ""}
          ${it.verified === false ? `<span class="chip warn">Verificar</span>` : ""}
        </span>
      </button>
      <div class="row-actions">
        <button class="mini" type="button" data-web-cat="${it.id}" aria-label="Buscar en web"><svg><use href="#i-web"/></svg></button>
        <button class="mini brass" type="button" data-stock-cat="${it.id}" aria-label="Añadir al almacén"><svg><use href="#i-plus"/></svg></button>
      </div>
    </div>`;
  }
  function catalogGroups(items, showCar = false) {
    if (!items.length) return "";
    const by = {};
    items.forEach(i => (by[i.group || "Otros"] ||= []).push(i));
    const order = [...GROUPS, ...Object.keys(by).filter(g => !GROUPS.includes(g))];
    return `<div class="groups">${order.filter(g => by[g]).map((g, idx) => `<details class="group"${idx === 0 || S.q ? " open" : ""}><summary>${esc(g)}<span class="count">${by[g].length} ${by[g].length === 1 ? "pieza" : "piezas"}</span></summary>${by[g].sort((a, b) => a.name.localeCompare(b.name, "es")).map(i => catRow(i, showCar)).join("")}</details>`).join("")}</div>`;
  }
  const carVisual = (c, big = false) => {
    const url = photoUrl(c), ref = url && !ownPhoto(c) && !c.photo, alt = !ownPhoto(c) && c.photo ? wikiUrl(c) : "";
    return `<div class="car-photo${big ? " big" : ""}${url ? "" : " no-photo"}">
      ${url ? `<img src="${esc(url)}" alt="${esc(carName(c))}" loading="lazy" data-alt="${esc(alt)}" onerror="if(this.dataset.alt){this.src=this.dataset.alt;this.dataset.alt=''}else{this.remove()}">` : ""}
      <span class="monogram" aria-hidden="true">${esc(c.make || c.model || "?")}</span>
      <div class="shade"></div>
      <div class="badges">${c.plate ? `<span class="plate">${esc(c.plate)}</span>` : `<span class="kind"><svg><use href="#${isMoto(c) ? "i-moto" : "i-car"}"/></svg>${isMoto(c) ? "Moto" : "Coche"}</span>`}${c.year ? `<span class="year-badge">${esc(c.year)}</span>` : ""}</div>
      <div class="overlay">
        <span class="make">${esc(c.make)}</span>
        <h3>${esc(c.model)}</h3>
        ${c.version ? `<span class="ver">${esc(c.version)}</span>` : ""}
      </div>
      ${ref ? `<span class="credit">Foto de referencia · Wikipedia</span>` : ""}
    </div>`;
  };
  const alertRow = (a) => a.run
    ? `<div class="due-row"><button class="due-main due-btn" type="button" data-alert-car="${a.car.id}" data-to-tab="trips"><span class="due-name">${esc(a.label)} ${pill(a.state)}</span><span class="due-when">${esc(carName(a.car))} · ${esc(cap(a.text))}</span></button><button class="mini brass" type="button" data-run-car="${a.car.id}">Arrancado hoy</button></div>`
    : `<button class="due-row" type="button" data-alert-car="${a.car.id}"><span class="due-main"><span class="due-name">${esc(a.label)} ${pill(a.state)}</span><span class="due-when">${esc(carName(a.car))} · ${esc(cap(a.text))}</span></span><svg class="chev" aria-hidden="true"><use href="#i-back"/></svg></button>`;

  function viewGarage() {
    const low = S.parts.filter(p => stockState(p) !== "ok").length + S.shop.length;
    if (!S.cars.length) {
      return `${S.ready ? "" : `<p class="note">Cargando el garaje…</p>`}
        <div class="empty">
          <svg width="44" height="44" style="color:var(--brass)"><use href="#i-car"/></svg>
          <h3>El garaje está vacío</h3>
          <p>Añade el primer vehículo con su matrícula, bastidor y código de motor. Después podrás guardar sus repuestos, su mantenimiento y sus papeles.</p>
          <button class="btn primary" type="button" data-add-car>Añadir vehículo</button>
        </div>`;
    }
    const alerts = allAlerts(), shown = S.allAlerts ? alerts : alerts.slice(0, 5);
    const backup = backupNeeded();
    const anyTracking = S.logs.length || S.cars.some(c => c.itvDate || c.insuranceDate || c.taxDate);
    return `
      ${backup ? `<div class="backup"><div><strong>Copia de seguridad</strong><span>${esc(backup)} Los datos solo están en este teléfono: guárdala en Drive, en el correo o en WhatsApp.</span></div><div class="actions"><button class="btn primary" type="button" data-backup><svg><use href="#i-down"/></svg>Hacer copia ahora</button><button class="btn" type="button" data-snooze>Dentro de una semana</button></div></div>` : ""}
      <div class="gauges">
        <button class="gauge" type="button" data-goto="garage"><b>${S.cars.length}</b><span>Vehículos</span></button>
        <button class="gauge ${alerts.length ? "alert" : ""}" type="button" data-goto-alerts><b>${alerts.length}</b><span>Avisos</span></button>
        <button class="gauge ${low ? "alert" : ""}" type="button" data-goto-shop><b>${low}</b><span>Por comprar</span></button>
      </div>
      ${alerts.length ? `<div class="section-head" id="avisos"><h2>Avisos</h2><button class="link" type="button" data-cal-all><svg class="ico"><use href="#i-cal"/></svg>Al calendario</button></div>
        <div class="list">${shown.map(alertRow).join("")}</div>
        ${alerts.length > shown.length ? `<button class="btn" type="button" data-all-alerts>Ver los ${alerts.length} avisos</button>` : ""}`
      : anyTracking ? `<p class="ok-line">${pill("ok", "Todo al día")} Ningún papel ni mantenimiento pendiente en los próximos 30 días.</p>`
      : `<p class="note">Registra el último mantenimiento y las fechas de ITV y seguro de cada vehículo, y aquí verás lo que toca.</p>`}
      <div class="section-head"><h2>La colección</h2><span class="eyebrow">${S.cars.filter(c => !isMoto(c)).length} coches · ${S.cars.filter(isMoto).length} motos</span></div>
      ${S.cars.some(isMoto) ? `<div class="filters">${[["all", "Todos"], ["coche", "Coches"], ["moto", "Motos"]].map(([k, l]) => `<button class="filter" type="button" data-kind="${k}" aria-pressed="${S.kind === k}">${l}</button>`).join("")}</div>` : ""}
      <div class="cars">${[...S.cars].filter(c => S.kind === "all" || (S.kind === "moto") === isMoto(c)).sort((a, b) => num(a.year, 9999) - num(b.year, 9999)).map(c => {
        const parts = S.parts.filter(p => p.carId === c.id), al = alertsFor(c);
        const over = al.filter(a => a.state === "overdue").length;
        return `<button class="car" type="button" data-car="${c.id}">
          ${carVisual(c)}
          <div class="car-body">
            <div class="chips">
              ${al.length ? `<span class="chip ${over ? "crit" : "warn"}">${al.length} ${al.length === 1 ? "aviso" : "avisos"}</span>` : ""}
              <span class="chip">${parts.length} ${parts.length === 1 ? "repuesto" : "repuestos"}</span>
              ${c.km ? `<span class="chip">${kmFmt(c.km)}</span>` : ""}
              ${carPhotos(c).length > 1 ? `<span class="chip">${carPhotos(c).length} fotos</span>` : ""}
            </div>
          </div>
        </button>`;
      }).join("")}</div>`;
  }

  function viewMaint(c) {
    const dates = DATE_FIELDS.map(([f, label]) => {
      const s = dateStatus(c, f);
      return `<button class="due-row" type="button" data-dates><span class="due-main"><span class="due-name">${label} ${s ? pill(s.state) : pill("none", "Sin fecha")}</span><span class="due-when">${s ? cap((s.days < 0 ? "venció " : "vence ") + relDays(s.days)) + " · " + fmtDate(s.date) : "Toca para poner la fecha"}${f === "insuranceDate" && c.insurer ? " · " + esc(c.insurer) : ""}</span></span><svg class="chev" aria-hidden="true"><use href="#i-back"/></svg></button>`;
    }).join("");
    const tasks = taskList(c).filter(t => !t.off).map(t => {
      const s = taskStatus(c, t);
      return `<div class="due-row"><span class="due-main"><span class="due-name">${esc(t.name)} ${pill(s.state)}</span>
        <span class="due-when">${s.last ? "Último: " + fmtDate(s.last.date) + (s.last.km ? " · " + kmFmt(s.last.km) : "") : "Nunca registrado · " + esc(intervalText(t))}</span>
        ${s.last ? `<span class="due-when">${esc(cap(dueText(s)))}</span>` : ""}</span>
        <button class="mini" type="button" data-log-task="${t.k}">Registrar</button></div>`;
    }).join("");
    const logs = carLogs(c.id);
    return `
      ${quickCard(c)}
      <div class="section-head result-head"><span class="eyebrow">Papeles</span><button class="link" type="button" data-cal-car>Al calendario</button></div>
      <div class="list">${dates}</div>
      <div class="section-head result-head"><span class="eyebrow">Mantenimiento${c.km ? " · " + kmFmt(c.km) : ""}</span><button class="link" type="button" data-km>${c.km ? "Actualizar km" : "Poner los km"}</button></div>
      <div class="list">${tasks}</div>
      <div class="actions"><button class="btn primary" type="button" data-new-log><svg><use href="#i-wrench"/></svg>Registrar trabajo</button><button class="btn" type="button" data-intervals>Ajustar intervalos</button></div>
      <div class="section-head result-head"><span class="eyebrow">Historial · ${logs.length}</span>${logs.length ? `<button class="link" type="button" data-print-car>Ficha en PDF</button>` : ""}</div>
      ${logs.length ? `<div class="timeline">${logs.map(l => `<button class="log" type="button" data-log="${l.id}">
          <span class="log-date">${fmtDate(l.date)}${l.km ? " · " + kmFmt(l.km) : ""}</span>
          <strong>${esc(l.title || taskNames(l.tasks) || "Trabajo")}</strong>
          ${l.title && l.tasks?.length ? `<span class="log-meta">${esc(taskNames(l.tasks))}</span>` : ""}
          ${l.parts?.length ? `<span class="log-meta">Piezas: ${esc(l.parts.map(p => p.name + (num(p.qty, 1) !== 1 ? " ×" + qtyFmt(num(p.qty)) : "")).join(", "))}</span>` : ""}
          ${l.cost ? `<span class="log-meta">${esc(l.cost)} €</span>` : ""}
        </button>`).join("")}</div>`
      : `<p class="note">Todavía no hay trabajos registrados. Apunta el último cambio de aceite que recuerdes y la app empezará a contar desde ahí.</p>`}`;
  }
  function viewTrips(c) {
    const idle = idleStatus(c), trips = carTrips(c.id), st = tripStats(c.id), all = tripStats(c.id, "");
    const year = today().slice(0, 4);
    return `
      <div class="list"><div class="due-row"><span class="due-main"><span class="due-name">Arrancarlo ${idle.state === "none" ? pill("none", "Sin registrar") : pill(idle.state)}</span>
        <span class="due-when">${idle.state === "none" ? "Apunta cuándo lo arrancas y te aviso si lleva parado" : esc(idleText(idle)) + " · " + fmtDate(idle.last)}</span>
        <span class="due-when">${idle.limit ? `Aviso a los ${idle.limit} días parado` : "Sin aviso"} · <button class="link" type="button" data-idle-cfg>Cambiar</button></span></span>
        <button class="mini brass" type="button" data-run-car="${c.id}">Arrancado hoy</button></div></div>
      <div class="section-head result-head"><span class="eyebrow">Este año · ${year}</span></div>
      <div class="facts">
        <div><span>Salidas</span><b>${st.count}</b></div>
        <div><span>Km</span><b>${Math.round(st.km).toLocaleString("es-ES")}</b></div>
        <div><span>Litros</span><b>${st.liters ? qtyFmt(Math.round(st.liters * 10) / 10) : "—"}</b></div>
        <div><span>L/100</span><b>${st.consumo ? st.consumo.toFixed(1).replace(".", ",") : "—"}</b></div>
      </div>
      ${st.cost ? `<p class="note">Gasolina este año: ${euro(st.cost)}${all.count > st.count ? ` · En total: ${all.count} salidas y ${kmFmt(all.km)}` : ""}</p>` : all.count > st.count ? `<p class="note">En total: ${all.count} salidas y ${kmFmt(all.km)}</p>` : ""}
      <div class="actions"><button class="btn primary" type="button" data-new-trip><svg><use href="#i-car"/></svg>Registrar salida</button></div>
      <div class="section-head result-head"><span class="eyebrow">Historial · ${trips.length}</span></div>
      ${trips.length ? `<div class="timeline">${trips.map(t => `<button class="log" type="button" data-trip="${t.id}">
          <span class="log-date">${fmtDate(t.date)}${t.odo ? " · " + kmFmt(t.odo) : ""}</span>
          <strong>${t.dist ? kmFmt(t.dist) + " recorridos" : "Salida"}</strong>
          ${t.liters || t.fuelCost ? `<span class="log-meta">${[t.liters ? qtyFmt(num(t.liters)) + " L" : "", t.fuelCost ? euro(t.fuelCost) : ""].filter(Boolean).join(" · ")}</span>` : ""}
          ${t.notes ? `<span class="log-meta">${esc(t.notes)}</span>` : ""}
        </button>`).join("")}</div>`
      : `<p class="note">Cada vez que lo saques, apunta los kilómetros al volver. Así sabrás cuánto rueda cada uno y cuánto gasta.</p>`}`;
  }
  function viewDocs(c) {
    const docs = S.docs.filter(d => d.carId === c.id).sort((a, b) => DOC_TYPES.indexOf(a.type) - DOC_TYPES.indexOf(b.type) || (b.date || "").localeCompare(a.date || ""));
    if (!docs.length) return `<div class="empty"><svg width="40" height="40" style="color:var(--brass)"><use href="#i-doc"/></svg><h3>Sin documentos</h3><p>Guarda aquí la ficha técnica, el permiso de circulación, el seguro, la ITV y las facturas: con una foto o un PDF.</p><button class="btn primary" type="button" data-new-doc>Añadir documento</button></div>`;
    return `<div class="docs">${docs.map(d => {
      const img = (d.mime || "").startsWith("image/"), exp = d.expiry ? daysUntil(d.expiry) : null;
      return `<button class="doc" type="button" data-doc="${d.id}">${img ? `<img src="${esc(blobUrl(d.fileId))}" alt="">` : `<span class="doc-icon">${d.mime === "application/pdf" ? "PDF" : "DOC"}</span>`}
        <span class="doc-text"><strong>${esc(d.title || d.type)}</strong><span>${esc(d.type)}${d.date ? " · " + fmtDate(d.date) : ""}</span>${exp !== null ? `<span>${pill(exp < 0 ? "overdue" : exp <= 30 ? "soon" : "ok", exp < 0 ? "Caducado" : "Caduca " + relDays(exp))}</span>` : ""}</span></button>`;
    }).join("")}</div>
    <div class="actions"><button class="btn primary" type="button" data-new-doc>Añadir documento</button></div>`;
  }
  function viewInfo(c) {
    const spec = [["Matrícula", c.plate], ["Año", c.year], ["Bastidor", c.vin], ["Motor", c.engine], ["Color", c.color], ["Kilómetros", c.km ? kmFmt(c.km) : ""]];
    const photos = carPhotos(c);
    return `
      <div class="section-head result-head"><span class="eyebrow">Fotos · ${photos.length}</span></div>
      <div class="gallery">${photos.map(id => `<button class="g-item" type="button" data-photo="${id}"><img src="${esc(blobUrl(id))}" alt="">${id === c.photoId ? `<span class="main-tag">Principal</span>` : ""}</button>`).join("")}
        <label class="g-add"><input type="file" accept="image/*" multiple id="galleryInput" hidden><svg><use href="#i-cam"/></svg>Añadir fotos</label></div>
      <div class="hero"><dl class="spec" style="border-top:0">${spec.map(([k, v]) => `<div><dt>${k}</dt><dd class="${["Matrícula","Bastidor","Motor"].includes(k) ? "mono" : ""}">${esc(v || "—")}</dd></div>`).join("")}</dl></div>
      ${c.notes ? `<div class="list"><div class="row" style="grid-template-columns:1fr"><span style="white-space:pre-wrap">${esc(c.notes)}</span></div></div>` : ""}
      <div class="eyebrow">Despiece oficial</div>${linksBlock(c)}
      <div class="actions"><button class="btn primary" type="button" data-print-car><svg><use href="#i-doc"/></svg>Ficha en PDF</button><button class="btn" type="button" data-edit-car>Editar ficha</button></div>
      <p class="note">La ficha en PDF reúne los datos, los papeles, el mantenimiento, el historial con lo gastado y el uso. Sirve para la ITV, el seguro o si algún día lo vendes.</p>`;
  }
  const SUBTABS = [["maint", "Mantenimiento"], ["trips", "Salidas"], ["parts", "Repuestos"], ["catalog", "Despiece"], ["docs", "Documentos"], ["info", "Ficha y fotos"]];
  function viewCar() {
    const c = carById(S.carId);
    if (!c) { S.tab = "garage"; return viewGarage(); }
    const parts = S.parts.filter(p => p.carId === c.id).sort((a, b) => a.name.localeCompare(b.name, "es"));
    const general = S.parts.filter(p => !p.carId);
    const cat = S.catalog.filter(i => i.carId === c.id);
    const al = alertsFor(c);
    let body = "";
    if (S.carTab === "maint") body = viewMaint(c);
    else if (S.carTab === "trips") body = viewTrips(c);
    else if (S.carTab === "parts") {
      body = parts.length ? `<div class="list">${parts.map(p => partRow(p, false)).join("")}</div>`
        : `<div class="empty"><h3>Sin repuestos todavía</h3><p>Guarda aquí el aceite, los filtros y las piezas que tienes para este vehículo.</p><button class="btn primary" type="button" data-new-part>Añadir repuesto</button></div>`;
      if (general.length) body += `<div class="section-head result-head"><span class="eyebrow">Compartidos con otros vehículos</span></div><div class="list">${general.map(p => partRow(p, false)).join("")}</div>`;
    } else if (S.carTab === "catalog") {
      body = catIntro(c, cat) + (cat.length ? catalogGroups(cat) : `<div class="empty"><h3>Despiece sin cargar</h3><p>Aquí aparecerán las piezas del vehículo con su referencia OEM, agrupadas por motor, frenos, encendido…</p><button class="btn" type="button" data-new-cat>Añadir pieza a mano</button></div>`);
    } else if (S.carTab === "docs") body = viewDocs(c);
    else body = viewInfo(c);
    return `
      <button class="back" type="button" data-go="garage"><svg><use href="#i-back"/></svg>Garaje</button>
      <div class="hero">${carVisual(c, true)}</div>
      <div class="facts">
        <div><span>Año</span><b>${esc(c.year || "—")}</b></div>
        <div><span>Km</span><b>${c.km ? Math.round(num(c.km)).toLocaleString("es-ES") : "—"}</b></div>
        <div><span>Repuestos</span><b>${parts.length}</b></div>
        <div class="${al.length ? "warn" : ""}"><span>Avisos</span><b>${al.length}</b></div>
      </div>
      <div class="subtabs" role="tablist" aria-label="Secciones del vehículo">${SUBTABS.map(([k, l]) => `<button type="button" role="tab" data-cartab="${k}" aria-pressed="${S.carTab === k}" aria-selected="${S.carTab === k}">${l}</button>`).join("")}</div>
      ${body}`;
  }

  function viewShop() {
    const auto = S.parts.filter(p => stockState(p) !== "ok").sort((a, b) => a.name.localeCompare(b.name, "es"));
    const manual = [...S.shop].sort((a, b) => a.name.localeCompare(b.name, "es"));
    const autoRows = auto.map(p => `<div class="row"><button class="row-main" type="button" data-part="${p.id}"><strong>${esc(p.name)}</strong><span class="row-meta">${p.oem ? `<span class="mono">${esc(p.oem)}</span>` : ""}<span>${esc(carName(carById(p.carId)))}</span><span class="chip ${stockState(p) === "zero" ? "crit" : "warn"}">${stockState(p) === "zero" ? "Agotado" : "Quedan " + qtyFmt(num(p.qty))}</span>${p.minQty ? `<span>mínimo ${qtyFmt(num(p.minQty))}</span>` : ""}</span></button>
      <div class="row-actions"><button class="mini" type="button" data-web-part="${p.id}" aria-label="Buscar en tiendas"><svg><use href="#i-web"/></svg></button><button class="mini brass" type="button" data-bought-part="${p.id}">Comprado</button></div></div>`).join("");
    const manRows = manual.map(x => `<div class="row"><button class="row-main" type="button" data-shop="${x.id}"><strong>${esc(x.name)}${num(x.qty, 1) > 1 ? ` ×${qtyFmt(num(x.qty))}` : ""}</strong><span class="row-meta">${x.oem ? `<span class="mono">${esc(x.oem)}</span>` : ""}<span>${esc(carName(carById(x.carId)))}</span>${x.note ? `<span>${esc(x.note)}</span>` : ""}</span></button>
      <div class="row-actions"><button class="mini" type="button" data-web-shop="${x.id}" aria-label="Buscar en tiendas"><svg><use href="#i-web"/></svg></button><button class="mini brass" type="button" data-bought-shop="${x.id}">Comprado</button></div></div>`).join("");
    return `
      ${auto.length ? `<div class="section-head result-head"><span class="eyebrow">Por debajo del mínimo · ${auto.length}</span></div><div class="list">${autoRows}</div>` : ""}
      ${manual.length ? `<div class="section-head result-head"><span class="eyebrow">Apuntado · ${manual.length}</span></div><div class="list">${manRows}</div>` : ""}
      ${!auto.length && !manual.length ? `<div class="empty"><svg width="40" height="40" style="color:var(--brass)"><use href="#i-cart"/></svg><h3>No falta nada</h3><p>Los repuestos que bajen del mínimo aparecerán aquí solos. También puedes apuntar cosas a mano o desde el despiece.</p></div>` : ""}
      <div class="actions"><button class="btn primary" type="button" data-new-shop><svg><use href="#i-plus"/></svg>Apuntar algo</button>${auto.length || manual.length ? `<button class="btn" type="button" data-share-shop>Compartir la lista</button>` : ""}</div>`;
  }
  function viewStock() {
    const toBuy = S.parts.filter(p => stockState(p) !== "ok").length + S.shop.length;
    const head = `
      <div class="section-head"><h2>Almacén</h2><button class="mini" type="button" data-scan><svg><use href="#i-scan"/></svg>Escanear</button></div>
      <div class="seg two" role="group" aria-label="Vista del almacén">
        <button type="button" data-sv="inv" aria-pressed="${S.stockView === "inv"}">Inventario · ${S.parts.length}</button>
        <button type="button" data-sv="shop" aria-pressed="${S.stockView === "shop"}">Lista de la compra${toBuy ? " · " + toBuy : ""}</button>
      </div>`;
    if (S.stockView === "shop") return head + viewShop();
    let items = [...S.parts];
    if (S.stockCar !== "all") items = items.filter(p => (p.carId || "") === S.stockCar);
    if (S.stockFilter === "low") items = items.filter(p => stockState(p) !== "ok");
    else if (S.stockFilter !== "all") items = items.filter(p => p.category === S.stockFilter);
    const usedCats = CATEGORIES.filter(c => S.parts.some(p => p.category === c));
    items.sort((a, b) => (a.category || "").localeCompare(b.category || "", "es") || a.name.localeCompare(b.name, "es"));
    const byLoc = S.stockGroup === "loc", NOLOC = "Sin ubicación";
    if (byLoc) items.sort((a, b) => (a.location ? 0 : 1) - (b.location ? 0 : 1) || (a.location || "").localeCompare(b.location || "", "es") || a.name.localeCompare(b.name, "es"));
    const byCat = {};
    items.forEach(p => (byCat[byLoc ? (p.location || "").trim() || NOLOC : p.category || "Otros"] ||= []).push(p));
    const f = (k, label) => `<button class="filter" type="button" data-sf="${esc(k)}" aria-pressed="${S.stockFilter === k}">${esc(label)}</button>`;
    const fc = (k, label) => `<button class="filter" type="button" data-sc="${esc(k)}" aria-pressed="${S.stockCar === k}">${esc(label)}</button>`;
    return head + (S.parts.length ? `
        <div class="filters" aria-label="Filtrar por vehículo">${fc("all", "Todos los vehículos")}${S.cars.map(c => fc(c.id, carName(c))).join("")}${fc("", "General")}</div>
        <div class="filters" aria-label="Filtrar por categoría">${f("all", "Todo")}${f("low", "Por reponer")}${usedCats.map(c => f(c, c)).join("")}</div>
        <div class="seg two" role="group" aria-label="Ordenar el almacén"><button type="button" data-sg="cat" aria-pressed="${!byLoc}">Por categoría</button><button type="button" data-sg="loc" aria-pressed="${byLoc}">Por ubicación</button></div>
        ${items.length ? Object.keys(byCat).map(cat => `<div class="section-head result-head"><span class="eyebrow">${byLoc && cat !== NOLOC ? `<svg class="ico"><use href="#i-pin"/></svg>` : ""}${esc(cat)}</span></div><div class="list">${byCat[cat].map(p => partRow(p)).join("")}</div>`).join("") : `<p class="note">Nada con estos filtros.</p>`}`
      : `<div class="empty"><svg width="44" height="44" style="color:var(--brass)"><use href="#i-box"/></svg><h3>Almacén vacío</h3><p>Apunta lo que hay en el taller: bidones de aceite, filtros, bujías, pastillas… con su cantidad y dónde está guardado. Si la caja tiene código de barras, escanéalo.</p><div class="actions"><button class="btn primary" type="button" data-new-part>Añadir repuesto</button><button class="btn" type="button" data-scan><svg><use href="#i-scan"/></svg>Escanear</button></div></div>`);
  }

  function viewCatalog() {
    if (!S.cars.length) return `<div class="empty"><h3>Sin vehículos</h3><p>Añade un vehículo para ver y gestionar su despiece.</p><button class="btn primary" type="button" data-add-car>Añadir vehículo</button></div>`;
    if (!S.catCar || !carById(S.catCar)) S.catCar = S.cars[0].id;
    const items = S.catalog.filter(i => i.carId === S.catCar);
    return `
      <div class="section-head"><h2>Despiece</h2><span class="eyebrow">${items.length} piezas</span></div>
      <div class="filters">${S.cars.map(c => `<button class="filter" type="button" data-cc="${c.id}" aria-pressed="${S.catCar === c.id}">${esc(carName(c))}</button>`).join("")}</div>
      ${catIntro(carById(S.catCar), items)}
      ${items.length ? catalogGroups(items) : `<div class="empty"><h3>Despiece sin cargar</h3><p>Las piezas de este vehículo con sus códigos OEM aparecerán aquí por grupos.</p><button class="btn" type="button" data-new-cat>Añadir pieza a mano</button></div>`}`;
  }

  function viewSearch() {
    const q = norm(S.q.trim()), qc = codeKey(S.q);
    let res = "";
    if (q.length >= 2) {
      const hit = (fields) => fields.some(v => norm(v).includes(q) || (qc.length > 2 && codeKey(v).includes(qc)));
      const parts = S.parts.filter(p => hit([p.name, p.oem, p.ref, p.barcode, p.brand, p.location, p.category, p.notes]));
      const cat = S.catalog.filter(i => hit([i.name, i.oem, i.alt, i.group, i.notes]));
      const cars = S.cars.filter(c => hit([c.make, c.model, c.version, c.plate, c.vin, c.engine]));
      const logs = S.logs.filter(l => hit([l.title, l.notes, taskNames(l.tasks), ...(l.parts || []).map(p => p.name)]));
      res = `
        ${cars.length ? `<div class="section-head result-head"><span class="eyebrow">Vehículos</span></div><div class="list">${cars.map(c => `<div class="row"><button class="row-main" type="button" data-car="${c.id}"><strong>${esc(carName(c))}</strong><span class="row-meta"><span>${esc(c.year)}</span><span class="mono">${esc(c.plate)}</span></span></button></div>`).join("")}</div>` : ""}
        <div class="section-head result-head"><span class="eyebrow">En mi almacén · ${parts.length}</span></div>
        ${parts.length ? `<div class="list">${parts.map(p => partRow(p)).join("")}</div>` : `<p class="note">No tienes nada guardado que coincida.</p>`}
        <div class="section-head result-head"><span class="eyebrow">En el despiece · ${cat.length}</span></div>
        ${cat.length ? `<div class="list">${cat.slice(0, 80).map(i => catRow(i, true)).join("")}</div>` : `<p class="note">Ninguna pieza del despiece coincide.</p>`}
        ${logs.length ? `<div class="section-head result-head"><span class="eyebrow">En el historial · ${logs.length}</span></div><div class="list">${logs.slice(0, 30).map(l => `<div class="row"><button class="row-main" type="button" data-open-log="${l.id}"><strong>${esc(l.title || taskNames(l.tasks))}</strong><span class="row-meta"><span>${fmtDate(l.date)}</span><span>${esc(carName(carById(l.carId)))}</span></span></button></div>`).join("")}</div>` : ""}
        <button class="btn" type="button" id="webFree"><svg><use href="#i-web"/></svg>Buscar «${esc(S.q.trim())}» en tiendas</button>`;
    } else {
      res = `<p class="note">Busca por nombre de pieza, código OEM, referencia equivalente, código de barras, matrícula o ubicación. Los códigos se encuentran aunque escribas sin guiones ni espacios.</p>`;
    }
    return `
      <div class="section-head"><h2>Buscar</h2></div>
      <div class="search"><svg><use href="#i-search"/></svg><input id="q" type="search" placeholder="Bujía, 1234567, filtro…" value="${esc(S.q)}" autocomplete="off" enterkeyhint="search"></div>
      <div id="results" style="display:flex;flex-direction:column;gap:18px">${res}</div>`;
  }

  function render() {
    const v = $("#view");
    const focusQ = document.activeElement?.id === "q";
    const caret = focusQ ? document.activeElement.selectionStart : null;
    const banner = render.err ? `<p class="banner">${render.err}</p>` : "";
    const html = { garage: viewGarage, car: viewCar, stock: viewStock, catalog: viewCatalog, search: viewSearch }[S.tab]();
    v.innerHTML = banner + html;
    document.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-current", (t.dataset.tab === S.tab || (S.tab === "car" && t.dataset.tab === "garage")) ? "page" : "false"));
    if (focusQ) { const q = $("#q"); q.focus(); try { q.setSelectionRange(caret, caret); } catch {} }
    lsSet("ui", JSON.stringify({ tab: S.tab === "car" ? "garage" : S.tab, catCar: S.catCar, stockView: S.stockView, stockGroup: S.stockGroup }));
  }

  // ---------- Eventos ----------
  const goCar = (id, tab = "maint") => {
    if (S.tab !== "car") history.pushState({ car: id }, "");
    S.tab = "car"; S.carId = id; S.carTab = tab; render(); scrollTo({ top: 0 });
  };
  const leaveCar = () => { if (history.state?.car) history.back(); else { S.tab = "garage"; render(); } };
  window.addEventListener("popstate", () => {
    if (sheetOpen) { hideSheet(); return; }
    if (!$("#scanner").hidden) { $("#scanClose").click(); return; }
    if (S.tab === "car" && !history.state?.car) { S.tab = "garage"; render(); }
  });
  document.querySelector(".tabbar").addEventListener("click", e => {
    const t = e.target.closest("[data-tab]"); if (!t) return;
    if (S.tab === "car" && history.state?.car) history.replaceState(null, "");
    S.tab = t.dataset.tab; render(); scrollTo({ top: 0 });
    if (S.tab === "search") setTimeout(() => $("#q")?.focus(), 50);
  });
  $("#fab").addEventListener("click", () => {
    if (S.tab === "car") {
      const c = carById(S.carId);
      return ({ maint: () => logForm({}, { carId: S.carId }), trips: () => tripForm({}, S.carId), parts: () => partForm(), catalog: () => catalogForm(), docs: () => docForm({}, S.carId), info: () => carForm(c) })[S.carTab]?.();
    }
    if (S.tab === "stock") return S.stockView === "shop" ? shopForm() : partForm();
    if (S.tab === "catalog") return catalogForm();
    addMenu();
  });
  $("#menuBtn").addEventListener("click", moreMenu);

  $("#view").addEventListener("input", e => {
    if (e.target.id === "q") { S.q = e.target.value; const r = $("#results"); const tmp = document.createElement("div"); tmp.innerHTML = viewSearch(); r.innerHTML = tmp.querySelector("#results").innerHTML; }
  });
  $("#view").addEventListener("change", async e => {
    if (e.target.id === "galleryInput") { const files = [...e.target.files]; e.target.value = ""; const c = carById(S.carId); if (c && files.length) { toast("Guardando fotos…"); await addCarPhotos(c, files); } }
  });

  let pending = {};
  $("#view").addEventListener("click", e => {
    const el = e.target.closest("button"); if (!el) return;
    const d = el.dataset, car = carById(S.carId);
    if (d.car) goCar(d.car);
    else if (d.alertCar) goCar(d.alertCar, d.toTab || "maint");
    else if (d.runCar) { const c = carById(d.runCar); if (c) markRun(c); }
    else if (d.trip) tripForm(S.trips.find(t => t.id === d.trip));
    else if ("newTrip" in d) tripForm({}, S.carId);
    else if ("idleCfg" in d) intervalsForm(car);
    else if ("printCar" in d) printCar(car);
    else if (d.sg) { S.stockGroup = d.sg; render(); }
    else if (d.go) { if (S.tab === "car" && d.go === "garage") leaveCar(); else { S.tab = d.go; render(); } }
    else if (d.goto) { S.tab = d.goto; render(); }
    else if ("gotoShop" in d) { S.tab = "stock"; S.stockView = "shop"; render(); scrollTo({ top: 0 }); }
    else if ("gotoAlerts" in d) { const a = $("#avisos"); if (a) a.scrollIntoView({ behavior: "smooth", block: "start" }); else toast("No hay avisos"); }
    else if ("allAlerts" in d) { S.allAlerts = true; render(); }
    else if ("backup" in d) exportBackup();
    else if ("snooze" in d) { lsSet("backupSnooze", new Date(Date.now() + 7 * 86400000).toISOString()); render(); toast("Te lo recuerdo dentro de una semana"); }
    else if ("addCar" in d) carForm();
    else if ("editCar" in d) carForm(car);
    else if ("newPart" in d) partForm();
    else if ("newCat" in d) catalogForm();
    else if ("newLog" in d) logForm({}, { carId: S.carId });
    else if (d.logTask) logForm({}, { carId: S.carId, tasks: [d.logTask], title: "" });
    else if (d.log) logForm(S.logs.find(l => l.id === d.log));
    else if (d.openLog) { const l = S.logs.find(x => x.id === d.openLog); if (l) logForm(l); }
    else if ("intervals" in d) intervalsForm(car);
    else if ("quick" in d) quickForm(car);
    else if ("calCar" in d) calendarSheet([car]);
    else if ("calAll" in d) calendarSheet(S.cars);
    else if ("dates" in d) datesForm(car);
    else if ("km" in d) kmForm(car);
    else if ("newDoc" in d) docForm({}, S.carId);
    else if (d.doc) { const x = S.docs.find(o => o.id === d.doc); if (x) docViewer(x); }
    else if (d.photo) photoSheet(car, d.photo);
    else if (d.cartab) { S.carTab = d.cartab; render(); }
    else if (d.sv) { S.stockView = d.sv; render(); }
    else if ("scan" in d) scanToStock();
    else if (d.part) partForm(S.parts.find(p => p.id === d.part));
    else if (d.webPart) openWeb(S.parts.find(p => p.id === d.webPart));
    else if (d.boughtPart) boughtPart(S.parts.find(p => p.id === d.boughtPart));
    else if (d.shop) shopForm(S.shop.find(x => x.id === d.shop));
    else if (d.webShop) { const x = S.shop.find(o => o.id === d.webShop); if (x) openWeb({ name: x.name, carId: x.carId, oem: x.oem, ref: x.alt }); }
    else if (d.boughtShop) { const x = S.shop.find(o => o.id === d.boughtShop); if (x) boughtShop(x); }
    else if ("newShop" in d) shopForm();
    else if ("shareShop" in d) shareShop();
    else if (d.cat) catalogForm(S.catalog.find(i => i.id === d.cat));
    else if (d.webCat) openWeb(S.catalog.find(i => i.id === d.webCat));
    else if (d.stockCat) {
      const it = S.catalog.find(i => i.id === d.stockCat);
      const existing = inStockFor(it)[0];
      if (existing) return partForm(existing);
      partForm({ name: it.name, carId: it.carId, oem: it.oem, ref: (it.alt || "").split(/[,;]/)[0]?.trim() || "", category: groupToCat(it.group), qty: 1, catalogId: it.id });
    }
    else if (d.sf !== undefined) { S.stockFilter = d.sf; render(); }
    else if (d.sc !== undefined) { S.stockCar = d.sc; render(); }
    else if (d.cc) { S.catCar = d.cc; render(); }
    else if (d.kind) { S.kind = d.kind; render(); }
    else if (d.step) {
      const p = S.parts.find(x => x.id === d.id); if (!p) return;
      p.qty = Math.max(0, num(p.qty) + Number(d.step)); render();
      clearTimeout(pending[p.id]);
      pending[p.id] = setTimeout(() => save("parts", p.id, strip(p)), 600);
    }
    else if (el.id === "webFree") openWeb({ name: S.q.trim() });
  });
  function groupToCat(g) {
    return ({ "Lubricación": "Aceites y fluidos", "Mantenimiento": "Filtros", "Encendido": "Encendido", "Refrigeración": "Refrigeración", "Alimentación": "Alimentación", "Frenos": "Frenos", "Embrague": "Embrague y transmisión", "Caja de cambios": "Embrague y transmisión", "Transmisión": "Embrague y transmisión", "Suspensión delantera": "Suspensión y dirección", "Suspensión trasera": "Suspensión y dirección", "Dirección": "Suspensión y dirección", "Eléctrico": "Eléctrico", "Carrocería": "Carrocería", "Interior": "Interior", "Ruedas": "Neumáticos y llantas", "Motor": "Motor", "Distribución": "Motor", "Escape": "Motor" })[g] || "Otros";
  }

  // ---------- Arranque ----------
  { const t = lsGet("theme"); if (t) document.documentElement.dataset.theme = t; }
  function setTextSize(k) { lsSet("textSize", k || ""); if (k) document.documentElement.dataset.text = k; else delete document.documentElement.dataset.text; }
  setTextSize(lsGet("textSize"));
  try { const ui = JSON.parse(lsGet("ui") || "{}"); if (ui.tab) S.tab = ui.tab; if (ui.catCar) S.catCar = ui.catCar; if (ui.stockView) S.stockView = ui.stockView; if (ui.stockGroup) S.stockGroup = ui.stockGroup; } catch {}
  render();

  (async () => {
    try { await loadAll(); S.ready = true; setSyncState(syncCfg() ? "Sincronizando…" : "En este teléfono"); }
    catch { render.err = "Este navegador no permite guardar datos. Abre la app en Safari o Chrome, fuera del modo incógnito."; $("#syncState").textContent = "Sin almacenamiento"; }
    render();
    navigator.storage?.persist?.().catch(() => {});
    loadLibrary();
    await seedGarage();
    importFromLink();
    if (!lsGet("guideSeen") && !location.hash && $("#sheet").hidden) showGuide(0);
    resolveWikiPhotos();
    syncNow();
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && Date.now() - new Date(lsGet("lastSync") || 0) > 60000) syncNow(); });
    window.addEventListener("online", () => syncNow());
    window.addEventListener("hashchange", () => importFromLink());
    if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  })();
})();
