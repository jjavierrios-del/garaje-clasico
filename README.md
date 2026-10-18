# Garaje Clásico

App para el móvil para llevar una colección de coches clásicos: la ficha de cada coche, el almacén de repuestos (aceite, filtros, bujías, juntas…) y el despiece con códigos OEM, con enlaces directos para buscar cada pieza en tiendas.

- Funciona sin conexión y se instala en la pantalla de inicio como una app.
- La lista de vehículos de la colección está en `datos/garaje.json` (incluye bastidores; el repositorio es público). La app añade sola los que falten y respeta los cambios hechos en el móvil.
- Repuestos, cantidades, fotos y ediciones se guardan **en el teléfono**. Desde el menú «⋯» se hace una copia de seguridad y se restaura.
- Los despieces de referencia viven en `catalog/` y llegan a la app solos cuando se actualiza el repositorio.
- **Mantenimiento:** historial de trabajos por vehículo y avisos por tiempo o kilómetros (aceite, filtros, frenos, batería…), con intervalos ajustables.
- **Papeles:** avisos de ITV, seguro e impuesto de circulación 30 días antes.
- **Usar repuestos:** al montar una pieza se descuenta del almacén y queda en el historial.
- **Lista de la compra:** lo que baja del mínimo y lo apuntado a mano, con búsqueda en tiendas y opción de compartirla.
- **Fotos:** galería por vehículo y foto de cada repuesto.
- **Códigos de barras:** con la cámara o con una foto (usa [ZXing](https://github.com/zxing-js/library), licencia Apache 2.0, en `vendor/`).
- **Documentos:** fotos o PDF de ficha técnica, seguro, ITV o facturas en cada vehículo.
- **Copia de seguridad:** aviso cada 30 días para guardar una copia.
- **Compartir entre móviles:** sincroniza datos, fotos y documentos a través de un repositorio **privado** de GitHub (Opciones → Compartir entre móviles).
- **Calendario:** exporta ITV, seguro, impuesto y mantenimientos al calendario del móvil, con aviso 7 días antes.
- **Datos rápidos:** aceite, capacidades, neumáticos, batería y bujías de cada vehículo.
- **Tamaño de letra:** normal, grande o muy grande (Opciones).
- **Fotos de los vehículos:** van en `fotos/` (ver `fotos/LEEME.md`).
- **Guía de bienvenida:** sale la primera vez que se abre la app y se puede volver a ver en «⋯» → «Cómo se usa la app».

## Pruebas

Pruebas automáticas con [Playwright](https://playwright.dev) que recorren la app como en un móvil (garaje, despiece, mantenimiento, compra, escáner, documentos, copia de seguridad, sincronización entre dos móviles y navegación):

```sh
npm install
npx playwright install chromium   # solo la primera vez
npm test
```

## Publicar con GitHub Pages

1. *Settings → Pages → Build and deployment*: origen **Deploy from a branch**, rama `main`, carpeta `/ (root)`.
2. A los pocos minutos la app queda en `https://<usuario>.github.io/garaje-clasico/`.

## Instalar en el móvil

- **iPhone (Safari):** abrir la dirección → botón Compartir → *Añadir a pantalla de inicio*.
- **Android (Chrome):** abrir la dirección → menú ⋮ → *Instalar aplicación*.

## Añadir un despiece

1. Crear `catalog/<clave>.json`:

```json
{
  "title": "Mercedes-Benz 280 SL (W113) 1968–1971",
  "source": "Catálogo EPC Mercedes-Benz",
  "items": [
    { "id": "bujia", "group": "Encendido", "name": "Bujía", "oem": "A 000 000 00 00", "alt": "Bosch …", "perCar": "6", "verified": true }
  ]
}
```

2. Añadirlo a `catalog/index.json`:

```json
[{ "key": "w113-280sl", "title": "Mercedes-Benz 280 SL (W113)", "file": "w113-280sl.json" }]
```

3. En la app, editar el coche y elegir el despiece en «Despiece de referencia».

Grupos: Motor, Distribución, Lubricación, Alimentación, Encendido, Refrigeración, Escape, Embrague, Caja de cambios, Transmisión, Frenos, Suspensión delantera, Suspensión trasera, Dirección, Eléctrico, Carrocería, Interior, Mantenimiento. Las piezas con `"verified": false` salen marcadas como «Verificar».
