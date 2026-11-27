# BET4FUN

Panel web gratuito para registrar surebets, freebets y promociones.

## Publicación

El proyecto se puede publicar gratis con GitHub Pages desde un repositorio público. Para la cuenta `neuville11-lab`, el dominio de proyecto será `https://neuville11-lab.github.io/bet4fun/`.

## Datos y privacidad

- La web funciona localmente si `supabase-config.js` está vacío.
- Para sincronizar entre dispositivos, sigue `SUPABASE_SETUP.md`: apuestas privadas por cuenta con Supabase Auth + PostgreSQL RLS.
- Las capturas se guardan localmente por defecto. El usuario puede subir una captura vinculada a una apuesta a un bucket privado.
- No guardar datos personales o apuestas reales en los archivos fuente. No poner claves `service_role` en el repositorio.

## Funciones

- Resumen diario de beneficio potencial, usando el menor beneficio de cada surebet.
- Registro de eventos, selecciones, cuotas, importes, casas, deportes y resultados.
- Estado de apuesta realizada y seguimiento de bonos/freebets.
- Datos por casa y deporte, con control de errores humanos e impacto en euros.
- Apartado para cargar y consultar capturas guardadas en el dispositivo actual.
- Sincronización opcional de apuestas entre dispositivos y almacenamiento privado opcional de capturas.



## Módulo SureBet.com

La importación inicial es manual y local al navegador. No consulta SureBet.com, no actualiza los datos automáticamente y no envía el archivo a Supabase ni a Cloudflare. La importación más reciente se guarda en `localStorage` bajo una clave independiente de las apuestas registradas.

El JSON debe contener `opportunities` (o ser directamente una lista). Cada oportunidad debe incluir `event`, `startsAt`, `profitPct` y al menos dos `offers`. Cada cuota debe indicar `side` (`favor` o `contra`), `bookmaker`, `market` y `odds`. Los campos informativos `sport` y `competition` se muestran como “Sin especificar” y “Sin competición” si faltan. Se aceptan nombres de campos habituales en español e inglés; la página muestra las diez primeras en el orden del archivo.

La actualización automatizada se mantiene pendiente de revisar las condiciones de uso de SureBet.com y confirmar que permiten la recopilación periódica.
