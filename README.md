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


