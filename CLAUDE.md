# Garaje Clásico

PWA sin frameworks ni compilación (HTML/CSS/JS) publicada en GitHub Pages: gestión de los vehículos clásicos del padre del usuario, su almacén de repuestos y despieces con códigos OEM. Interfaz y comentarios en español.

- Arquitectura, mapa de `app.js`, patrones y datos: `DESARROLLO.md`. Funciones de cara al usuario: `README.md`.
- Servir en local: `npm run serve` (http://localhost:4173). Pruebas: `npm test` (Playwright, deben pasar todas antes de subir).
- En cada cambio publicado, sube `CACHE` en `sw.js` (garaje-vNN).
- Este repositorio es público: nunca subas tokens, copias de seguridad ni enlaces `#sync=`.
