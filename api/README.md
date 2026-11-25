# Análisis automático de resultados

Este Worker consulta API-Sports desde el servidor. La clave se guarda como secreto de Cloudflare y no se publica en el JavaScript de BET4FUN.

## Deportes y mercados conectados

La primera versión multi-deporte admite:

- **Fútbol:** marcador final, goles totales y mercados de estadísticas de partido disponibles en la competición (córneres, tarjetas amarillas, tiros a puerta, faltas y fueras de juego). En mercados por equipo identifica el primer o segundo equipo cuando la selección lo indica.
- **Baloncesto:** resultado/puntos y mercados de puntos, rebotes y asistencias de jugador.
- **Hockey:** resultado y totales de goles cuando la API devuelve el marcador.

Se comparan los nombres de los equipos y la fecha del evento antes de consultar estadísticas. Si API-Sports no encuentra el evento, no dispone de esa competición o no ofrece los datos necesarios para la selección, BET4FUN deja el resultado sin confirmar. La cobertura y las estadísticas dependen de cada competición; confirma siempre la liquidación en la casa de apuestas.

API-Sports publica actualmente un plan gratuito de 100 solicitudes diarias por API deportiva. Una consulta puede consumir varias solicitudes cuando se buscan fechas cercanas o estadísticas adicionales; revisa el contador del panel de API-Sports.

## Puesta en marcha

1. Crea una cuenta en [API-Sports](https://api-sports.io/) y activa las APIs de los deportes que quieras consultar (Football, Basketball, Hockey). Copia la clave desde su panel.
2. Crea una cuenta gratuita de Cloudflare e instala Node.js en el ordenador desde el que desplegarás el Worker.
3. Abre una terminal en esta carpeta y ejecuta:

   ```powershell
   npx wrangler login
   npx wrangler secret put API_SPORTS_KEY
   ```

   Wrangler pedirá la clave de forma interactiva. No la pegues en el código ni en GitHub.
4. Despliega el Worker:

   ```powershell
   npx wrangler deploy
   ```

5. Copia la URL que termina en `.workers.dev` y colócala en `api-config.js`:

   ```js
   window.BET4FUN_API_URL = 'https://tu-worker.tu-subdominio.workers.dev';
   ```

6. Publica el cambio de `api-config.js` en GitHub Pages. En la página, el botón **Buscar resultado** consultará el Worker automáticamente.

El Worker limita las solicitudes al dominio público de BET4FUN. No pongas la clave API en `api-config.js`: ese archivo sí se descarga en el navegador.
