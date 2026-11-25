# Análisis automático de resultados

Este Worker consulta API-Sports desde el servidor. La clave se guarda como secreto de Cloudflare y no se publica en el JavaScript de BET4FUN.

## Cobertura inicial

- **Fútbol:** marcador y goles; córneres, tarjetas amarillas, tiros a puerta, faltas y fueras de juego cuando la competición ofrece estadísticas.
- **Baloncesto:** marcador y totales de puntos; puntos, rebotes y asistencias de jugador.
- **Hockey:** marcador y totales de goles.
- **Rugby, béisbol, balonmano y voleibol:** mercados basados en el marcador que devuelva la API.

No existe una regla única para todas las apuestas. Si un mercado no está reconocido, la competición no tiene cobertura o faltan estadísticas, BET4FUN deja el resultado sin confirmar. Los mercados de hándicap, ganador, sets y estadísticas especiales se irán añadiendo con reglas específicas; no se deben inferir solo a partir del marcador. Confirma siempre la liquidación en la casa de apuestas.

API-Sports publica un plan gratuito de 100 solicitudes diarias por API deportiva. Una consulta puede consumir varias solicitudes al buscar fechas cercanas y estadísticas; revisa el contador del panel. La disponibilidad de datos también varía por competición.

## Puesta en marcha

1. Crea una cuenta en [API-Sports](https://api-sports.io/) y activa los deportes que quieras usar. Copia la clave desde su panel.
2. Crea una cuenta gratuita de Cloudflare e instala Node.js en el ordenador desde el que desplegarás el Worker.
3. Abre una terminal en esta carpeta y ejecuta:

   ```powershell
   npx wrangler login
   npx wrangler secret put API_SPORTS_KEY
   ```

   Wrangler te pedirá la clave de forma interactiva. No la pegues en el código ni en GitHub.
4. Despliega el Worker:

   ```powershell
   npx wrangler deploy
   ```

5. Copia la URL que termina en `.workers.dev` y colócala en `api-config.js`:

   ```js
   window.BET4FUN_API_URL = 'https://tu-worker.tu-subdominio.workers.dev';
   ```

6. Publica `api-config.js` en GitHub Pages. El botón **Buscar resultado** consultará el Worker.

El Worker solo acepta solicitudes desde el dominio público de BET4FUN. No pongas la clave API en `api-config.js`: ese archivo se descarga en el navegador.
