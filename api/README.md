# Comprobación automática de apuestas NBA

Este Worker consulta API-Sports Basketball desde el servidor para no exponer la clave en el JavaScript público de BET4FUN. La primera versión admite mercados de puntos, rebotes y asistencias de jugadores NBA.

## Despliegue

1. Crea una cuenta de API-Sports y copia la clave de Basketball API.
2. Crea una cuenta gratuita de Cloudflare y abre una terminal con Node.js instalado.
3. Desde esta carpeta, inicia sesión y guarda la clave como secreto del Worker:

   ```powershell
   npx wrangler login
   npx wrangler secret put API_SPORTS_KEY
   npx wrangler deploy
   ```

   Al ejecutar `secret put`, Wrangler pedirá la clave de forma interactiva. No la pegues en el código ni en GitHub.

4. Wrangler mostrará una URL parecida a `https://bet4fun-auto-check.<tu-subdominio>.workers.dev`. Esa URL se configura en `api-config.js` como `window.BET4FUN_API_URL`.

El Worker solo permite solicitudes desde la página pública de BET4FUN y limita la consulta a NBA. La clave/API puede tener cuotas del proveedor; revisa su panel de uso.

