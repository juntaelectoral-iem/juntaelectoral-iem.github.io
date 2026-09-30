# Junta Electoral · IEM "Dr. Arturo Oñativia"

Sitio estático (HTML + CSS + JS, sin compilación) para GitHub Pages sobre las elecciones 2026
de representantes de Padres o Tutores y del Estamento de Alumnos ante el Consejo Asesor.

## Publicar

1. Subir el contenido de esta carpeta a la raíz de un repositorio de GitHub, **menos los PDF
   de los padrones** (`PADRON*.pdf`): tienen nombre y DNI de alumnos menores de edad.
   `.gitignore` los excluye al usar git; si se sube arrastrando archivos a la web de GitHub,
   hay que dejarlos afuera a mano.
2. En *Settings → Pages*, elegir *Deploy from a branch*, rama `main`, carpeta `/ (root)`.

## Actualizar

- **Cronograma:** cada etapa es un `<li>` en `index.html` con `data-start` / `data-end`
  (hora de Salta). `assets/js/main.js` marca automáticamente las etapas cumplidas y la actual.
- **Probar otra fecha:** abrir `index.html?hoy=2026-10-26T10:00`.
- **Padrones:** la sección *Padrones definitivos* lee `assets/data/padrones.js`, que se genera
  desde los PDF (hace falta `pdftotext`, del paquete `poppler-utils`; tarda un par de minutos):

  ```
  node herramientas/generar-padrones.mjs "PADRON DEFINITIVOS DE ALUMNOS 2026.pdf" "PADRON DEFINITIVOS DE PADRES 2026.pdf"
  ```

  El archivo generado no tiene nombres ni DNI de alumnos: cada alumno consulta con su DNI y
  sólo ve curso, número de orden e iniciales. Del padrón de padres o tutores se publican los
  nombres, no los DNI. El script frena si una fila no tiene el formato esperado, si la
  numeración salta o si un DNI se repite.
- **Documentos:** van en `documentos/` y se enlazan desde la sección *Documentos oficiales*.
- **Video:** `assets/video/je-elecciones-iem.mp4` (H.264, con el índice al principio para que
  empiece a reproducirse antes de terminar de bajar). Arranca solo, sin sonido y en bucle.
