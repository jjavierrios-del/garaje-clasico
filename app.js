(() => {
  const CATEGORIES = ["Aceites y fluidos","Filtros","Encendido","Motor","Juntas y retenes","Refrigeración","Alimentación","Frenos","Embrague y transmisión","Suspensión y dirección","Eléctrico","Carrocería","Interior","Neumáticos y llantas","Herramientas","Otros"];
  const GROUPS = ["Motor","Distribución","Lubricación","Alimentación","Encendido","Refrigeración","Escape","Embrague","Caja de cambios","Transmisión","Frenos","Suspensión delantera","Suspensión trasera","Dirección","Eléctrico","Carrocería","Interior","Mantenimiento"];
  const UNITS = ["ud","L","kg","juego","m"];

  const S = { cars: [], parts: [], catalog: [], tab: "garage", carId: null, carTab: "parts", kind: "all", stockFilter: "all", stockCar: "all", catCar: null, q: "", ready: false, canWrite: true, canUpload: true };
  // Despieces publicados en el repositorio (catalog/*.json) y piezas propias guardadas en el móvil
  let libIndex = [], libItems = [], localCat = [], libDocs = {};
  const photoCache = new Map();

  const $ = (s, el = document) => el.querySelector(s);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const norm = (v) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const codeKey = (v) => norm(v).replace(/[^a-z0-9]/g, "");
  const carById = (id) => S.cars.find(c => c.id === id);
  const carName = (c) => c ? [c.make, c.model].filter(Boolean).join(" ") : "General";
  // Foto propia del móvil; si no hay, la foto principal del artículo de Wikipedia del modelo
  let wikiPhotos = {};
  try { wikiPhotos = JSON.parse(localStorage.getItem("wikiPhotos") || "{}"); } catch {}
  const ownPhoto = (c) => (c && c.photoId && photoCache.get(c.photoId)) || "";
  const photoUrl = (c) => ownPhoto(c) || (c && c.wiki && wikiPhotos[c.wiki]?.url) || "";
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
  const num = (v, d = 0) => { const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : d; };
  const qtyFmt = (n) => Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
  const stockState = (p) => { const q = num(p.qty), m = num(p.minQty); return q <= 0 ? "zero" : (m > 0 && q <= m ? "low" : "ok"); };

  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2200); }

  // ---------- Datos (IndexedDB, en el propio dispositivo) ----------
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  let idbP = null;
  function idb() {
    return idbP ||= new Promise((res, rej) => {
      const r = indexedDB.open("garaje-clasico", 1);
      r.onupgradeneeded = () => { const d = r.result; ["cars", "parts", "catalog"].forEach(n => d.objectStoreNames.contains(n) || d.createObjectStore(n, { keyPath: "id" })); d.objectStoreNames.contains("photos") || d.createObjectStore("photos"); };
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
    // Un despiece de la biblioteca se aplica a cada coche que lo tenga asignado
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
  async function loadAll() {
    const carsRaw = await idbAll("cars");
    S.cars = carsRaw.filter(c => !c.deleted);
    loadAll.removedCars = carsRaw.filter(c => c.deleted).map(c => c.id); S.parts = await idbAll("parts"); localCat = await idbAll("catalog");
    for (const c of S.cars) if (c.photoId && !photoCache.has(c.photoId)) {
      const blob = await tx("photos", "readonly", st => st.get(c.photoId));
      if (blob) photoCache.set(c.photoId, URL.createObjectURL(blob));
    }
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
      render();
      return id;
    } catch (e) { toast("No se pudo guardar. Revisa el espacio del móvil"); return null; }
  }
  async function remove(coll, id) {
    try {
      const item = coll === "catalog" ? S.catalog.find(i => i.id === id) : null;
      if (item?.libId) await idbPut("catalog", { id, libId: item.libId, carId: item.carId, deleted: true });
      else if (coll === "cars") await idbPut("cars", { id, deleted: true });
      else await idbDel(coll, id);
      if (coll === "catalog") localCat = await idbAll("catalog"); else S[coll] = S[coll].filter(x => x.id !== id);
      mergeCatalog(); render();
    } catch { toast("No se pudo borrar"); }
  }
  // Vehículos guardados en el repositorio (datos/garaje.json): se añaden los que falten, sin pisar cambios hechos en el móvil
  async function seedGarage() {
    try {
      const r = await fetch("datos/garaje.json", { cache: "no-cache" });
      if (!r.ok) return;
      const d = await r.json(), skip = new Set([...S.cars.map(c => c.id), ...(loadAll.removedCars || [])]);
      // Completa campos nuevos (foto, tipo) en los ya guardados sin tocar lo que se haya editado
      let changed = false;
      for (const seed of d.coches || []) {
        const cur = S.cars.find(c => c.id === seed.id);
        if (!cur) continue;
        const add = {};
        for (const k of ["wiki", "kind"]) if (seed[k] && !cur[k]) add[k] = seed[k];
        if (Object.keys(add).length) { await idbPut("cars", { ...cur, ...add }); changed = true; }
      }
      const nuevos = (d.coches || []).filter(c => c.id && !skip.has(c.id));
      if (!nuevos.length) { if (changed) { await loadAll(); render(); } return; }
      const now = new Date().toISOString();
      for (const c of nuevos) await idbPut("cars", { createdAt: now, updatedAt: now, ...c });
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
    $("#copyCode")?.addEventListener("click", () => {
      navigator.clipboard?.writeText(code).then(() => toast("Código copiado"), () => selectText($("#codeTxt")));
      if (!navigator.clipboard) selectText($("#codeTxt"));
    });
  }
  function selectText(el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Mantén pulsado para copiar"); }

  // ---------- Hojas ----------
  function openSheet(html) {
    const sh = $("#sheet"), sc = $("#scrim");
    $("#sheetBody").innerHTML = `<div class="grabber"></div>` + html;
    sh.hidden = false; sc.hidden = false;
    requestAnimationFrame(() => { sh.classList.add("on"); sc.classList.add("on"); });
    sh.scrollTop = 0;
  }
  function closeSheet() {
    const sh = $("#sheet"), sc = $("#scrim");
    sh.classList.remove("on"); sc.classList.remove("on");
    setTimeout(() => { sh.hidden = true; sc.hidden = true; $("#sheetBody").innerHTML = ""; }, 250);
  }
  $("#scrim").addEventListener("click", closeSheet);
  $("#sheet").addEventListener("click", e => { if (e.target.closest("[data-close]")) closeSheet(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); });

  const field = (id, label, val, opts = {}) => {
    const cls = opts.full ? "field full" : "field";
    if (opts.options) return `<div class="${cls}"><label for="${id}">${label}</label><select id="${id}">${opts.options.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}"${String(v) === String(val ?? "") ? " selected" : ""}>${esc(t)}</option>`; }).join("")}</select></div>`;
    if (opts.area) return `<div class="${cls}"><label for="${id}">${label}</label><textarea id="${id}">${esc(val)}</textarea></div>`;
    return `<div class="${cls}"><label for="${id}">${label}</label><input id="${id}" ${opts.mono ? 'class="mono"' : ""} type="${opts.type || "text"}" ${opts.inputmode ? `inputmode="${opts.inputmode}"` : ""} ${opts.ph ? `placeholder="${esc(opts.ph)}"` : ""} value="${esc(val)}" autocomplete="off"></div>`;
  };
  const val = (id) => ($("#" + id)?.value ?? "").trim();
  const carOptions = (withGeneral = true) => [...(withGeneral ? [["", "General (varios coches)"]] : []), ...S.cars.map(c => [c.id, carName(c) + (c.year ? " · " + c.year : "")])];

  function carForm(car = {}) {
    openSheet(`
      <h2>${car.id ? "Editar coche" : "Nuevo coche"}</h2>
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
        ${S.canUpload ? `<div class="field full"><label for="c_photo">Foto</label><input id="c_photo" type="file" accept="image/*"></div>` : ""}
      </form>
      <div class="actions">
        <button class="btn primary" type="button" id="saveCar">Guardar</button>
        ${car.id ? `<button class="btn danger" type="button" id="delCar">Borrar coche</button>` : `<button class="btn" type="button" data-close>Cancelar</button>`}
      </div>`);
    $("#saveCar").addEventListener("click", async () => {
      const data = { make: val("c_make"), model: val("c_model"), version: val("c_version"), year: val("c_year"), plate: val("c_plate").toUpperCase(), km: val("c_km"), vin: val("c_vin").toUpperCase(), engine: val("c_engine"), color: val("c_color"), notes: val("c_notes"), photoId: car.photoId || "", catalogKey: $("#c_lib") ? val("c_lib") : (car.catalogKey || ""), kind: val("c_kind") || "coche", wiki: car.wiki || "" };
      if (!data.make && !data.model) { toast("Escribe al menos la marca o el modelo"); return; }
      const file = $("#c_photo")?.files?.[0];
      $("#saveCar").disabled = true;
      if (file) { const id = await uploadPhoto(file); if (id) data.photoId = id; }
      const id = await save("cars", car.id, data);
      $("#saveCar") && ($("#saveCar").disabled = false);
      if (id) { closeSheet(); toast(car.id ? "Coche actualizado" : "Coche añadido"); if (!car.id) { S.tab = "car"; S.carId = id; S.carTab = "parts"; } render(); }
    });
    $("#delCar")?.addEventListener("click", () => confirmSheet(`¿Borrar ${esc(carName(car))}?`, "Se borra su despiece. Los repuestos del almacén se quedan como «General».", async () => {
      for (const p of S.parts.filter(p => p.carId === car.id)) await save("parts", p.id, { ...strip(p), carId: "" });
      for (const it of localCat.filter(i => i.carId === car.id)) await idbDel("catalog", it.id);
      localCat = await idbAll("catalog");
      if (car.photoId) await idbDel("photos", car.photoId);
      await remove("cars", car.id);
      S.tab = "garage"; S.carId = null; closeSheet(); toast("Coche borrado"); render();
    }));
  }
  const strip = (o) => { const { id, ...rest } = o; return rest; };

  async function uploadPhoto(file) {
    try {
      const blob = await shrink(file, 1600);
      const id = "ph-" + uid();
      await idbPut("photos", blob, id);
      photoCache.set(id, URL.createObjectURL(blob));
      return id;
    } catch { toast("No se pudo guardar la foto"); return null; }
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

  function partForm(part = {}) {
    const isNew = !part.id;
    openSheet(`
      <h2>${isNew ? "Nuevo repuesto" : "Editar repuesto"}</h2>
      <p class="lead">Lo que tienes guardado en el taller: bidones de aceite, filtros, bujías, juntas…</p>
      <form class="form" id="f">
        ${field("p_name", "Pieza", part.name, { full: true, ph: "Filtro de aceite" })}
        ${field("p_car", "Coche", part.carId ?? (S.carId || ""), { options: carOptions(), full: true })}
        ${field("p_cat", "Categoría", part.category || "Otros", { options: CATEGORIES })}
        ${field("p_brand", "Fabricante", part.brand, { ph: "Bosch, Mann…" })}
        ${field("p_oem", "Ref. OEM", part.oem, { mono: true, ph: "Código original" })}
        ${field("p_ref", "Ref. propia / equivalente", part.ref, { mono: true })}
        ${field("p_qty", "Cantidad", part.qty ?? 1, { inputmode: "decimal" })}
        ${field("p_unit", "Unidad", part.unit || "ud", { options: UNITS })}
        ${field("p_min", "Avisar si quedan", part.minQty ?? "", { inputmode: "decimal", ph: "0 = sin aviso" })}
        ${field("p_loc", "Ubicación", part.location, { ph: "Estantería 2, caja azul" })}
        ${field("p_price", "Precio (€)", part.price, { inputmode: "decimal" })}
        ${field("p_supplier", "Proveedor", part.supplier)}
        ${field("p_notes", "Notas", part.notes, { area: true, full: true })}
      </form>
      <div class="actions">
        <button class="btn primary" type="button" id="savePart">Guardar</button>
        ${isNew ? `<button class="btn" type="button" data-close>Cancelar</button>` : `<button class="btn" type="button" id="webPart"><svg><use href="#i-web"/></svg>Buscar en web</button><button class="btn danger" type="button" id="delPart">Borrar</button>`}
      </div>`);
    $("#savePart").addEventListener("click", async () => {
      const data = { name: val("p_name"), carId: val("p_car"), category: val("p_cat"), brand: val("p_brand"), oem: val("p_oem").toUpperCase(), ref: val("p_ref").toUpperCase(), qty: num(val("p_qty"), 0), unit: val("p_unit"), minQty: num(val("p_min"), 0), location: val("p_loc"), price: val("p_price"), supplier: val("p_supplier"), notes: val("p_notes"), catalogId: part.catalogId || "" };
      if (!data.name) { toast("Escribe el nombre de la pieza"); return; }
      const id = await save("parts", part.id, data);
      if (id) { closeSheet(); toast(isNew ? "Repuesto añadido" : "Repuesto actualizado"); }
    });
    $("#webPart")?.addEventListener("click", () => openWeb(part));
    $("#delPart")?.addEventListener("click", () => confirmSheet(`¿Borrar «${esc(part.name)}»?`, "Se quita del almacén.", async () => { await remove("parts", part.id); closeSheet(); toast("Repuesto borrado"); }));
  }

  function catalogForm(item = {}) {
    const isNew = !item.id;
    openSheet(`
      <h2>${isNew ? "Nueva pieza de despiece" : "Pieza de despiece"}</h2>
      <form class="form" id="f">
        ${field("k_name", "Pieza", item.name, { full: true })}
        ${field("k_car", "Coche", item.carId || S.catCar || S.carId || S.cars[0]?.id || "", { options: carOptions(false), full: true })}
        ${field("k_group", "Grupo", item.group || "Motor", { options: GROUPS })}
        ${field("k_qty", "Uds. en el coche", item.perCar, { inputmode: "numeric" })}
        ${field("k_oem", "Ref. OEM", item.oem, { mono: true })}
        ${field("k_alt", "Equivalentes", item.alt, { mono: true, ph: "Bosch W8DC, NGK BP6ES" })}
        ${field("k_notes", "Notas", item.notes, { area: true, full: true, })}
        ${field("k_src", "Fuente", item.source, { full: true, ph: "Catálogo EPC, manual de taller…" })}
      </form>
      ${item.verified === false ? `<p class="banner">Referencia pendiente de verificar con catálogo oficial o vendedor.</p>` : ""}
      <div class="actions">
        <button class="btn primary" type="button" id="saveCat">Guardar</button>
        ${isNew ? `<button class="btn" type="button" data-close>Cancelar</button>` : `<button class="btn danger" type="button" id="delCat">Borrar</button>`}
      </div>`);
    $("#saveCat").addEventListener("click", async () => {
      const data = { ...strip(item), lib: undefined, name: val("k_name"), carId: val("k_car"), group: val("k_group"), perCar: val("k_qty"), oem: val("k_oem").toUpperCase(), alt: val("k_alt"), notes: val("k_notes"), source: val("k_src") };
      if (!data.name || !data.carId) { toast(S.cars.length ? "Escribe el nombre de la pieza" : "Primero añade un coche"); return; }
      const id = await save("catalog", item.id, data);
      if (id) { closeSheet(); toast(isNew ? "Pieza añadida al despiece" : "Pieza actualizada"); }
    });
    $("#delCat")?.addEventListener("click", () => confirmSheet(`¿Borrar «${esc(item.name)}» del despiece?`, "No afecta a tu almacén.", async () => { await remove("catalog", item.id); closeSheet(); toast("Pieza borrada"); }));
  }

  function confirmSheet(title, body, onYes) {
    openSheet(`<h2>${title}</h2><p class="lead">${body}</p><div class="actions"><button class="btn danger" type="button" id="yes">Sí, continuar</button><button class="btn" type="button" data-close>Cancelar</button></div>`);
    $("#yes").addEventListener("click", async () => { $("#yes").disabled = true; await onYes(); });
  }

  function addMenu() {
    openSheet(`
      <h2>Añadir</h2>
      <div class="actions" style="flex-direction:column">
        <button class="btn primary" type="button" data-add="part"><svg><use href="#i-box"/></svg>Repuesto al almacén</button>
        <button class="btn" type="button" data-add="car"><svg><use href="#i-car"/></svg>Coche</button>
        <button class="btn" type="button" data-add="catalog"><svg><use href="#i-gear"/></svg>Pieza al despiece</button>
      </div>`);
    $("#sheetBody").onclick = e => {
      const b = e.target.closest("[data-add]"); if (!b) return;
      const k = b.dataset.add;
      if (k === "car") carForm(); else if (k === "part") partForm(); else S.cars.length ? catalogForm() : (toast("Primero añade un coche"), carForm());
    };
  }

  const blobToData = (b) => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
  async function exportBackup() {
    const photos = {};
    for (const c of S.cars) if (c.photoId) { const b = await tx("photos", "readonly", st => st.get(c.photoId)); if (b) photos[c.photoId] = await blobToData(b); }
    const json = JSON.stringify({ app: "garaje-clasico", version: 1, exportado: new Date().toISOString(), coches: S.cars, repuestos: S.parts, despiecePropio: localCat, fotos: photos });
    const name = "garaje-clasico-" + new Date().toISOString().slice(0, 10) + ".json";
    const file = new File([json], name, { type: "application/json" });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Copia de Garaje Clásico" }); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  async function importBackup(file) {
    try {
      const d = JSON.parse(await file.text());
      if (d.app !== "garaje-clasico") throw new Error("formato");
      for (const n of ["cars", "parts", "catalog", "photos"]) await idbClear(n);
      for (const c of d.coches || []) await idbPut("cars", c);
      for (const p of d.repuestos || []) await idbPut("parts", p);
      for (const k of d.despiecePropio || []) await idbPut("catalog", k);
      for (const [id, url] of Object.entries(d.fotos || {})) await idbPut("photos", await (await fetch(url)).blob(), id);
      photoCache.clear(); await loadAll(); closeSheet(); render();
      toast("Copia restaurada");
    } catch { toast("Ese archivo no es una copia de Garaje Clásico"); }
  }
  // Enlace de alta: #importar=<json en base64url>. El fragmento nunca llega al servidor.
  async function importFromLink(text = location.hash) {
    const m = String(text).match(/#importar=([A-Za-z0-9_-]+)/);
    if (!m) { if (text !== location.hash) toast("Ese texto no es un enlace de alta"); return; }
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

  function moreMenu() {
    openSheet(`
      <h2>Opciones</h2>
      <p class="lead">${S.cars.length} coches · ${S.parts.length} repuestos · ${S.catalog.length} piezas en despiece</p>
      <div class="banner">Los datos se guardan solo en este teléfono. Haz una copia de vez en cuando y guárdala en el correo o en Drive.</div>
      <div class="actions" style="flex-direction:column">
        <button class="btn primary" type="button" id="exportBtn"><svg><use href="#i-down"/></svg>Hacer copia de seguridad</button>
        <button class="btn" type="button" id="importBtn">Restaurar una copia</button>
        <button class="btn" type="button" id="pasteBtn">Pegar enlace de alta</button>
        <input type="file" id="importFile" hidden>
        <button class="btn" type="button" id="themeBtn">Cambiar tema claro / oscuro</button>
        <button class="btn" type="button" data-close>Cerrar</button>
      </div>
      <p class="note">Despieces disponibles: ${libIndex.length ? libIndex.map(l => esc(l.title)).join(", ") : "ninguno todavía"}.</p>`);
    $("#exportBtn").addEventListener("click", exportBackup);
    $("#importBtn").addEventListener("click", () => $("#importFile").click());
    $("#pasteBtn").addEventListener("click", () => {
      openSheet(`<h2>Pegar enlace de alta</h2><p class="lead">Mantén pulsado el recuadro, elige «Pegar» y pulsa «Añadir».</p>
        <div class="field"><label for="linkTxt">Enlace</label><textarea id="linkTxt" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea></div>
        <div class="actions"><button class="btn primary" type="button" id="linkGo">Añadir</button><button class="btn" type="button" data-close>Cancelar</button></div>`);
      $("#linkGo").addEventListener("click", () => importFromLink($("#linkTxt").value));
    });
    $("#importFile").addEventListener("change", e => { const f = e.target.files[0]; if (f) confirmSheet("¿Restaurar esta copia?", "Se sustituyen todos los datos actuales del teléfono por los de la copia.", () => importBackup(f)); });
    $("#themeBtn").addEventListener("click", () => {
      const r = document.documentElement, cur = r.dataset.theme || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
      r.dataset.theme = cur === "dark" ? "light" : "dark";
      try { localStorage.setItem("theme", r.dataset.theme); } catch {}
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
    const car = carById(p.carId);
    const st = stockState(p);
    return `<div class="row">
      <button class="row-main" type="button" data-part="${p.id}">
        <strong>${esc(p.name)}</strong>
        <span class="row-meta">
          ${p.oem ? `<span class="mono">${esc(p.oem)}</span>` : (p.ref ? `<span class="mono">${esc(p.ref)}</span>` : "")}
          ${p.brand ? `<span>${esc(p.brand)}</span>` : ""}
          ${showCar ? `<span>${esc(car ? carName(car) : "General")}</span>` : ""}
          ${p.location ? `<span>${esc(p.location)}</span>` : ""}
          ${st === "zero" ? `<span class="chip crit">Agotado</span>` : st === "low" ? `<span class="chip warn">Reponer</span>` : ""}
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
          ${it.perCar ? `<span>${esc(it.perCar)} en el coche</span>` : ""}
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
  const isMoto = (c) => c.kind === "moto";
  const carVisual = (c, big = false) => {
    const url = photoUrl(c), ref = url && !ownPhoto(c);
    return `<div class="car-photo${big ? " big" : ""}${url ? "" : " no-photo"}">
      ${url ? `<img src="${esc(url)}" alt="${esc(carName(c))}" loading="lazy" onerror="this.remove()">` : ""}
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

  function viewGarage() {
    const low = S.parts.filter(p => stockState(p) !== "ok").length;
    if (!S.cars.length) {
      return `${S.ready ? "" : `<p class="note">Cargando el garaje…</p>`}
        <div class="empty">
          <svg width="44" height="44" style="color:var(--brass)"><use href="#i-car"/></svg>
          <h3>El garaje está vacío</h3>
          <p>Añade el primer coche con su matrícula, bastidor y código de motor. Después podrás guardar sus repuestos y consultar su despiece.</p>
          <button class="btn primary" type="button" data-add-car>Añadir coche</button>
        </div>`;
    }
    return `
      <div class="gauges">
        <div class="gauge"><b>${S.cars.length}</b><span>Vehículos</span></div>
        <div class="gauge"><b>${S.parts.length}</b><span>Repuestos</span></div>
        <div class="gauge ${low ? "alert" : ""}"><b>${low}</b><span>Por reponer</span></div>
      </div>
      <div class="section-head"><h2>La colección</h2><span class="eyebrow">${S.cars.filter(c => !isMoto(c)).length} coches · ${S.cars.filter(isMoto).length} motos</span></div>
      ${S.cars.some(isMoto) ? `<div class="filters">${[["all", "Todos"], ["coche", "Coches"], ["moto", "Motos"]].map(([k, l]) => `<button class="filter" type="button" data-kind="${k}" aria-pressed="${S.kind === k}">${l}</button>`).join("")}</div>` : ""}
      <div class="cars">${[...S.cars].filter(c => S.kind === "all" || (S.kind === "moto") === isMoto(c)).sort((a, b) => num(a.year, 9999) - num(b.year, 9999)).map(c => {
        const parts = S.parts.filter(p => p.carId === c.id), cat = S.catalog.filter(i => i.carId === c.id);
        const lowC = parts.filter(p => stockState(p) !== "ok").length;
        return `<button class="car" type="button" data-car="${c.id}">
          ${carVisual(c)}
          <div class="car-body">
            <div class="chips">
              <span class="chip">${parts.length} ${parts.length === 1 ? "repuesto" : "repuestos"}</span>
              <span class="chip">${cat.length} ${cat.length === 1 ? "pieza" : "piezas"} de despiece</span>
              ${lowC ? `<span class="chip warn">${lowC} por reponer</span>` : ""}
            </div>
          </div>
        </button>`;
      }).join("")}</div>`;
  }

  function viewCar() {
    const c = carById(S.carId);
    if (!c) { S.tab = "garage"; return viewGarage(); }
    const parts = S.parts.filter(p => p.carId === c.id).sort((a, b) => a.name.localeCompare(b.name, "es"));
    const general = S.parts.filter(p => !p.carId);
    const cat = S.catalog.filter(i => i.carId === c.id);
    const spec = [["Matrícula", c.plate], ["Año", c.year], ["Bastidor", c.vin], ["Motor", c.engine], ["Color", c.color], ["Kilómetros", c.km ? Number(c.km).toLocaleString("es-ES") + " km" : ""]];
    let body = "";
    if (S.carTab === "parts") {
      body = parts.length ? `<div class="list">${parts.map(p => partRow(p, false)).join("")}</div>`
        : `<div class="empty"><h3>Sin repuestos todavía</h3><p>Guarda aquí el aceite, los filtros y las piezas que tienes para este coche.</p><button class="btn primary" type="button" data-new-part>Añadir repuesto</button></div>`;
      if (general.length) body += `<div class="section-head result-head"><span class="eyebrow">Compartidos con otros coches</span></div><div class="list">${general.map(p => partRow(p, false)).join("")}</div>`;
    } else if (S.carTab === "catalog") {
      body = catIntro(c, cat) + (cat.length ? catalogGroups(cat) : `<div class="empty"><h3>Despiece sin cargar</h3><p>Aquí aparecerán las piezas del coche con su referencia OEM, agrupadas por motor, frenos, encendido…</p><button class="btn" type="button" data-new-cat>Añadir pieza a mano</button></div>`);
    } else {
      body = `<div class="hero"><dl class="spec" style="border-top:0">${spec.map(([k, v]) => `<div><dt>${k}</dt><dd class="${["Matrícula","Bastidor","Motor"].includes(k) ? "mono" : ""}">${esc(v || "—")}</dd></div>`).join("")}</dl></div>
        ${c.notes ? `<div class="list"><div class="row" style="grid-template-columns:1fr"><span style="white-space:pre-wrap">${esc(c.notes)}</span></div></div>` : ""}
        <div class="eyebrow">Despiece oficial</div>${linksBlock(c)}
        <div class="actions"><button class="btn" type="button" data-edit-car>Editar ficha</button></div>`;
    }
    return `
      <button class="back" type="button" data-go="garage"><svg><use href="#i-back"/></svg>Garaje</button>
      <div class="hero">${carVisual(c, true)}</div>
      <div class="facts">
        <div><span>Año</span><b>${esc(c.year || "—")}</b></div>
        <div><span>Motor</span><b>${esc(c.engine || "—")}</b></div>
        <div><span>Repuestos</span><b>${parts.length}</b></div>
        <div><span>Despiece</span><b>${cat.length}</b></div>
      </div>
      <div class="seg" role="group" aria-label="Vista del coche">
        <button type="button" data-cartab="parts" aria-pressed="${S.carTab === "parts"}">Repuestos</button>
        <button type="button" data-cartab="catalog" aria-pressed="${S.carTab === "catalog"}">Despiece</button>
        <button type="button" data-cartab="info" aria-pressed="${S.carTab === "info"}">Ficha</button>
      </div>
      ${body}`;
  }

  function viewStock() {
    let items = [...S.parts];
    if (S.stockCar !== "all") items = items.filter(p => (p.carId || "") === S.stockCar);
    if (S.stockFilter === "low") items = items.filter(p => stockState(p) !== "ok");
    else if (S.stockFilter !== "all") items = items.filter(p => p.category === S.stockFilter);
    const usedCats = CATEGORIES.filter(c => S.parts.some(p => p.category === c));
    items.sort((a, b) => (a.category || "").localeCompare(b.category || "", "es") || a.name.localeCompare(b.name, "es"));
    const byCat = {};
    items.forEach(p => (byCat[p.category || "Otros"] ||= []).push(p));
    const f = (k, label) => `<button class="filter" type="button" data-sf="${esc(k)}" aria-pressed="${S.stockFilter === k}">${esc(label)}</button>`;
    const fc = (k, label) => `<button class="filter" type="button" data-sc="${esc(k)}" aria-pressed="${S.stockCar === k}">${esc(label)}</button>`;
    return `
      <div class="section-head"><h2>Almacén</h2><span class="eyebrow">${S.parts.length} referencias</span></div>
      ${S.parts.length ? `
        <div class="filters" aria-label="Filtrar por coche">${fc("all", "Todos los coches")}${S.cars.map(c => fc(c.id, carName(c))).join("")}${fc("", "General")}</div>
        <div class="filters" aria-label="Filtrar por categoría">${f("all", "Todo")}${f("low", "Por reponer")}${usedCats.map(c => f(c, c)).join("")}</div>
        ${items.length ? Object.keys(byCat).map(cat => `<div class="section-head result-head"><span class="eyebrow">${esc(cat)}</span></div><div class="list">${byCat[cat].map(p => partRow(p)).join("")}</div>`).join("") : `<p class="note">Nada con estos filtros.</p>`}`
      : `<div class="empty"><svg width="44" height="44" style="color:var(--brass)"><use href="#i-box"/></svg><h3>Almacén vacío</h3><p>Apunta lo que hay en el taller: bidones de aceite, filtros, bujías, pastillas… con su cantidad y dónde está guardado.</p><button class="btn primary" type="button" data-new-part>Añadir repuesto</button></div>`}`;
  }

  function viewCatalog() {
    if (!S.cars.length) return `<div class="empty"><h3>Sin coches</h3><p>Añade un coche para ver y gestionar su despiece.</p><button class="btn primary" type="button" data-add-car>Añadir coche</button></div>`;
    if (!S.catCar || !carById(S.catCar)) S.catCar = S.cars[0].id;
    const items = S.catalog.filter(i => i.carId === S.catCar);
    return `
      <div class="section-head"><h2>Despiece</h2><span class="eyebrow">${items.length} piezas</span></div>
      <div class="filters">${S.cars.map(c => `<button class="filter" type="button" data-cc="${c.id}" aria-pressed="${S.catCar === c.id}">${esc(carName(c))}</button>`).join("")}</div>
      ${catIntro(carById(S.catCar), items)}
      ${items.length ? catalogGroups(items) : `<div class="empty"><h3>Despiece sin cargar</h3><p>Las piezas de este coche con sus códigos OEM aparecerán aquí por grupos.</p><button class="btn" type="button" data-new-cat>Añadir pieza a mano</button></div>`}`;
  }

  function viewSearch() {
    const q = norm(S.q.trim()), qc = codeKey(S.q);
    let res = "";
    if (q.length >= 2) {
      const hit = (fields) => fields.some(v => norm(v).includes(q) || (qc.length > 2 && codeKey(v).includes(qc)));
      const parts = S.parts.filter(p => hit([p.name, p.oem, p.ref, p.brand, p.location, p.category, p.notes]));
      const cat = S.catalog.filter(i => hit([i.name, i.oem, i.alt, i.group, i.notes]));
      const cars = S.cars.filter(c => hit([c.make, c.model, c.version, c.plate, c.vin, c.engine]));
      res = `
        ${cars.length ? `<div class="section-head result-head"><span class="eyebrow">Coches</span></div><div class="list">${cars.map(c => `<div class="row"><button class="row-main" type="button" data-car="${c.id}"><strong>${esc(carName(c))}</strong><span class="row-meta"><span>${esc(c.year)}</span><span class="mono">${esc(c.plate)}</span></span></button></div>`).join("")}</div>` : ""}
        <div class="section-head result-head"><span class="eyebrow">En mi almacén · ${parts.length}</span></div>
        ${parts.length ? `<div class="list">${parts.map(p => partRow(p)).join("")}</div>` : `<p class="note">No tienes nada guardado que coincida.</p>`}
        <div class="section-head result-head"><span class="eyebrow">En el despiece · ${cat.length}</span></div>
        ${cat.length ? `<div class="list">${cat.slice(0, 80).map(i => catRow(i, true)).join("")}</div>` : `<p class="note">Ninguna pieza del despiece coincide.</p>`}
        <button class="btn" type="button" id="webFree"><svg><use href="#i-web"/></svg>Buscar «${esc(S.q.trim())}» en tiendas</button>`;
    } else {
      res = `<p class="note">Busca por nombre de pieza, código OEM, referencia equivalente, matrícula o ubicación. Los códigos se encuentran aunque escribas sin guiones ni espacios.</p>`;
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
    try { localStorage.setItem("ui", JSON.stringify({ tab: S.tab === "car" ? "garage" : S.tab, catCar: S.catCar })); } catch {}
  }

  // ---------- Eventos ----------
  document.querySelector(".tabbar").addEventListener("click", e => {
    const t = e.target.closest("[data-tab]"); if (!t) return;
    S.tab = t.dataset.tab; render(); scrollTo({ top: 0 });
    if (S.tab === "search") setTimeout(() => $("#q")?.focus(), 50);
  });
  $("#fab").addEventListener("click", () => {
    if (S.tab === "car") { S.carTab === "catalog" ? catalogForm() : partForm(); return; }
    if (S.tab === "stock") return partForm();
    if (S.tab === "catalog") return catalogForm();
    addMenu();
  });
  $("#menuBtn").addEventListener("click", moreMenu);

  $("#view").addEventListener("input", e => {
    if (e.target.id === "q") { S.q = e.target.value; const r = $("#results"); const tmp = document.createElement("div"); tmp.innerHTML = viewSearch(); r.innerHTML = tmp.querySelector("#results").innerHTML; }
  });

  let pending = {};
  $("#view").addEventListener("click", e => {
    const el = e.target.closest("button"); if (!el) return;
    const d = el.dataset;
    if (d.car) { S.tab = "car"; S.carId = d.car; S.carTab = "parts"; render(); scrollTo({ top: 0 }); }
    else if (d.go) { S.tab = d.go; render(); }
    else if ("addCar" in d) carForm();
    else if ("editCar" in d) carForm(carById(S.carId));
    else if ("newPart" in d) partForm();
    else if ("newCat" in d) catalogForm();
    else if (d.cartab) { S.carTab = d.cartab; render(); }
    else if (d.part) partForm(S.parts.find(p => p.id === d.part));
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
      const next = Math.max(0, num(p.qty) + Number(d.step));
      p.qty = next; render();
      clearTimeout(pending[p.id]);
      pending[p.id] = setTimeout(() => save("parts", p.id, strip(p)), 600);
    }
    else if (el.id === "webFree") openWeb({ name: S.q.trim() });
  });
  function groupToCat(g) {
    return ({ "Lubricación": "Aceites y fluidos", "Mantenimiento": "Filtros", "Encendido": "Encendido", "Refrigeración": "Refrigeración", "Alimentación": "Alimentación", "Frenos": "Frenos", "Embrague": "Embrague y transmisión", "Caja de cambios": "Embrague y transmisión", "Transmisión": "Embrague y transmisión", "Suspensión delantera": "Suspensión y dirección", "Suspensión trasera": "Suspensión y dirección", "Dirección": "Suspensión y dirección", "Eléctrico": "Eléctrico", "Carrocería": "Carrocería", "Interior": "Interior", "Motor": "Motor", "Distribución": "Motor", "Escape": "Motor" })[g] || "Otros";
  }

  // ---------- Arranque ----------
  try { const t = localStorage.getItem("theme"); if (t) document.documentElement.dataset.theme = t; } catch {}
  try { const ui = JSON.parse(localStorage.getItem("ui") || "{}"); if (ui.tab) S.tab = ui.tab; if (ui.catCar) S.catCar = ui.catCar; } catch {}
  render();

  (async () => {
    try { await loadAll(); S.ready = true; $("#syncState").textContent = "En este teléfono"; }
    catch { render.err = "Este navegador no permite guardar datos. Abre la app en Safari o Chrome, fuera del modo incógnito."; $("#syncState").textContent = "Sin almacenamiento"; }
    render();
    navigator.storage?.persist?.().catch(() => {});
    loadLibrary();
    await seedGarage();
    importFromLink();
    resolveWikiPhotos();
    if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  })();
})();
