# Garaje Clásico · Guía para desarrollar

Todo lo necesario para seguir trabajando la app desde Visual Studio Code (u otro editor). Lo que hace la app de cara al usuario está en el `README.md`.

## Puesta en marcha

Requisitos: [Git](https://git-scm.com), [Node.js](https://nodejs.org) 18 o superior y Visual Studio Code.

```sh
git clone https://github.com/jjavierrios-del/garaje-clasico.git
cd garaje-clasico
code .
npm install                       # solo para las pruebas
npx playwright install chromium   # solo la primera vez
```

- **Ver la app en el ordenador:** `npm run serve` y abrir <http://localhost:4173>. En VS Code también: *Terminal → Run Task… → Abrir la app*.
- **Verla en el móvil mientras desarrollas:** con el ordenador y el móvil en la misma wifi, abre `http://<ip-del-ordenador>:4173`. La cámara (escáner) y la instalación solo funcionan con HTTPS, así que eso se prueba en GitHub Pages.
- **Pruebas:** `npm test` (o la tarea *Pruebas*). Para ver el navegador mientras corren: `npx playwright test --headed`; para una sola: `npx playwright test tests/taller.spec.js`.
- **Publicar:** `git push` a `main`. GitHub Pages la publica en 1–2 minutos y GitHub Actions pasa las pruebas.

> **Importante al publicar:** sube el número de `CACHE` en `sw.js` (`garaje-v18` → `garaje-v19`…) en cada cambio. Si no, los móviles pueden seguir con la versión guardada en caché.

## Cómo está hecha

Sin frameworks ni compilación: HTML, CSS y JavaScript tal cual, servidos por GitHub Pages como PWA (se instala en la pantalla de inicio y funciona sin conexión).

| Archivo | Qué es |
|---|---|
| `index.html` | Esqueleto: iconos SVG (`<symbol id="i-…">`), cabecera, `#view`, barra de pestañas, hoja inferior (`#sheet`), escáner y `#toast`. |
| `app.js` | Toda la lógica (≈2000 líneas, una sola función autoejecutable). |
| `styles.css` | Estilos. Variables de color en `:root` con tema oscuro por defecto y claro; tamaños en `rem` (letra grande = `data-text` en `<html>`); bloque `@media print` para la ficha PDF y las etiquetas QR. |
| `sw.js` | Service worker: red primero, caché si no hay conexión. |
| `manifest.webmanifest`, `icons/` | Instalación como app. |
| `datos/garaje.json` | Los 9 vehículos de la colección (repositorio **público**: incluye bastidores y matrículas, decidido así). La app añade los que falten sin pisar cambios del móvil. |
| `catalog/` | Despieces de referencia por modelo (`index.json` + un JSON por modelo). |
| `fotos/` | Fotos propias de los vehículos (ver `fotos/LEEME.md`). |
| `vendor/` | ZXing 0.21.3 (lector de códigos de barras y generador de QR), licencia Apache 2.0. |
| `tests/` | Pruebas Playwright, servidor local (`server.js`), utilidades (`helpers.js`) y ficheros de ejemplo (`fixtures/`). |
| `.github/workflows/pruebas.yml` | Pasa las pruebas en cada push. |

### Mapa de `app.js`

El archivo está dividido en secciones con comentarios `// ---------- Nombre ----------` (en VS Code: `Ctrl+Shift+O` para saltar entre funciones):

| Sección | Funciones principales |
|---|---|
| Constantes y estado | `CATEGORIES`, `GROUPS`, `TASKS` (intervalos de mantenimiento), `DOC_TYPES`, objeto de estado `S` |
| Fotos y archivos | `blobUrl`, `storeImage` (reduce la foto), `dropBlob` |
| Datos (IndexedDB) | `idb`, `loadAll`, `save`, `remove`, `seedGarage`, `loadLibrary`, `mergeCatalog` |
| Mantenimiento y avisos | `taskList`, `taskStatus`, `alertsFor`, `allAlerts`, vehículo parado (`idleStatus`, `markRun`), `tripStats` |
| Copia de seguridad | `fileIds`, `backupData`, `exportBackup`, `importBackup` (con sincronización, lo restaurado gana: se marca con la hora y lo que falta se borra), `backupNeeded` |
| Sincronización | `gh`, `getRemote`, `mergeSets`, `syncNow`, `syncFiles`, `connectSync`, `syncSheet`, copia semanal (`weeklyCopy`, `serverCopies`, `copiesSheet`), caducidad del token (`tokenStatus`, `renewSheet`, `linkSheet`) |
| Calendario | `calendarEvents`, `buildICS`, `calendarSheet` |
| Datos rápidos | `QUICK`, `quickCard`, `quickForm` |
| Lector de códigos | `scanCode`, `decodeImage`, `scanToStock` |
| Búsqueda web | `SHOPS`, `openWeb` |
| Hojas y formularios | `openSheet`/`closeSheet`, `field`, `carForm`, `partForm`, `catalogForm`, `logForm`, `intervalsForm`, `datesForm`, `kmForm` |
| Dictado | `dictate` (Web Speech API; si no hay, abre el teclado) |
| Salidas | `tripForm` |
| Ficha en PDF | `carReport`, `printHtml`, `printCar` |
| Mapa del taller | `mapSheet`, `pinFor`, `partsAt`, `showOnMap` |
| Etiquetas QR | `places`, `placeSheet`, `qrSvg`, `printLabels`, `labelsSheet` |
| Lista de la compra | `shopForm`, `boughtPart`, `shareShop` |
| Fotos y documentos | `addCarPhotos`, `photoSheet`, `docForm`, `docViewer` |
| Menús y enlaces | `addMenu`, `importFromLink` (`#sync=`, `#importar=`, `#sitio=`), `GUIDE`/`showGuide`, `moreMenu` |
| Vistas | `viewGarage`, `viewCar` (+ `viewMaint`, `viewTrips`, `viewDocs`, `viewInfo`), `viewStock`, `viewShop`, `viewWorkshop`, `viewCatalog`, `viewSearch`, `render` |
| Eventos | un único `click` delegado en `#view` que mira los `data-…` del botón; `popstate` para el botón atrás |
| Arranque | carga de datos, despieces, vehículos, enlaces, guía, sincronización y service worker |

### Patrones a respetar

- **Pintado:** las vistas devuelven HTML como texto y `render()` lo vuelca en `#view`. Todo texto del usuario pasa por `esc()`.
- **Botones:** se marcan con `data-algo` y se atienden en el `click` delegado de la sección *Eventos* (`d.algo` o `"algo" in d`).
- **Hojas inferiores:** `openSheet(html)` y después se enganchan los botones con `$("#id").onclick`. Empujan una entrada al historial para que «atrás» las cierre.
- **Guardar:** siempre con `save(colección, id, datos)` (pone `updatedAt`, repinta y programa la sincronización). Para borrar, `remove()`: deja una marca `{id, deleted:true}` para que el borrado llegue al otro móvil.
- **Colecciones** (IndexedDB `garaje-clasico`, versión 4): `cars`, `parts`, `catalog`, `logs`, `docs`, `shop`, `trips`, `maps` y `photos` (archivos). Si añades una nueva: súmala a `STORES`, `SYNC_STORES`, sube la versión en `idb()`, cárgala en `loadAll()` y añádela a `exportBackup`/`importBackup`.
- **Fechas:** texto `AAAA-MM-DD`; usar `today()`, `daysUntil()`, `addMonths()`, `fmtDate()`.
- **Textos de la interfaz** en español, para una persona mayor: frases cortas y claras.

## Datos y sincronización

- Los datos viven **en el móvil** (IndexedDB). En iPhone, Safari y la app instalada tienen almacenes distintos.
- **Sincronización:** repositorio privado `jjavierrios-del/garaje-datos` mediante la API de contenidos de GitHub, con un token *fine-grained* (Contents: Read and write) guardado en `localStorage` (`syncCfg`). Datos en `garaje.json`, fotos y documentos en `archivos/<id>`. Se mezcla registro a registro por `updatedAt`.
- El **token caduca** (un año). La app avisa 30 días antes y tiene «Renovar el token».
- **Nunca** subas a este repositorio (público) tokens, copias de seguridad ni el enlace `#sync=`: llevan la llave de acceso. `privado/` está en `.gitignore` para eso.

## Añadir un despiece

1. Crear `catalog/<clave>.json` con `title`, `vehicle`, `source`, `links`, `quick` e `items` (`id`, `group`, `name`, `oem`, `alt`, `perCar`, `verified`, `notes`, `source`, `url`). Mira uno existente como modelo.
2. Añadirlo a `catalog/index.json`.
3. Asignarlo al vehículo con `catalogKey` en `datos/garaje.json` o desde la app (Editar vehículo → Despiece de referencia).

Las piezas con `"verified": false` salen como «Verificar».

## Pruebas

27 pruebas de extremo a extremo en `tests/*.spec.js`, en un móvil simulado de 390×844. Wikipedia y GitHub están simulados (`helpers.js`: `openApp`, `fakeGitHub`), así que no hace falta conexión ni token.

Al cambiar algo, añade o ajusta su prueba. Un detalle de Playwright: `setInputFiles` con una ruta con tildes o «ñ» no dispara el evento; pasa el archivo como `{ name, mimeType, buffer }`.

## Ideas pendientes (comentadas, no hechas)

Gastos por vehículo, lista antes de salir, guardar para el invierno, caducidades del almacén, contactos, valor y seguro, quién hizo cada cambio, exportar a Excel, el libro de cada coche (historia y anécdotas), antes/después, atajos en el icono, modo taller, conversor de medidas. Faltan las fotos del W204, la CBF600, el E36 y el SEAT 124.
