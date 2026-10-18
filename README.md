# Garaje Clásico

App para el móvil para llevar una colección de coches clásicos: la ficha de cada coche, el almacén de repuestos (aceite, filtros, bujías, juntas…) y el despiece con códigos OEM, con enlaces directos para buscar cada pieza en tiendas.

- Funciona sin conexión y se instala en la pantalla de inicio como una app.
- Los datos (coches, repuestos, fotos) se guardan **solo en el teléfono**, nunca en este repositorio. Desde el menú «⋯» se hace una copia de seguridad y se restaura.
- Los despieces de referencia viven en `catalog/` y llegan a la app solos cuando se actualiza el repositorio.

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
