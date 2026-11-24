# Activar la nube de BET4FUN

El proyecto ya incluye sincronización de apuestas, acceso con Google y subida opcional de capturas. Para activarlo hace falta crear un proyecto Supabase (la capa gratuita basta para empezar) y asociarlo a la aplicación.

## 1. Crear la base de datos

1. Crea un proyecto en [supabase.com](https://supabase.com/).
2. Abre **SQL Editor → New query**.
3. Copia y ejecuta el contenido de `supabase/schema.sql` una vez. Crea las tablas con acceso limitado por usuario y un espacio privado de archivos.

## 2. Configurar el acceso con Google

1. En Supabase abre **Authentication → Providers → Google** y habilita Google.
2. Crea credenciales OAuth de tipo aplicación web en Google Cloud Console. Añade como origen autorizado `https://neuville11-lab.github.io` y como URI de redirección autorizada el callback que muestra Supabase en la configuración del proveedor.
3. Copia el client ID y el client secret de Google Cloud en el proveedor Google de Supabase; no los pongas en este repositorio.
4. En **Authentication → URL Configuration**, configura como URL del sitio `https://neuville11-lab.github.io/bet4fun/` y añade `https://neuville11-lab.github.io/bet4fun/` a las URL de redirección permitidas.

## 3. Conectar BET4FUN

En Supabase, abre **Project Settings → API** y copia el Project URL y la clave pública `anon`/`publishable`. Pon esos dos valores en `supabase-config.js`:

```js
window.BET4FUN_SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
window.BET4FUN_SUPABASE_ANON_KEY = 'TU-CLAVE-PUBLICA';
```

La clave pública está pensada para usarse desde el navegador; la seguridad depende de las políticas RLS que instala `supabase/schema.sql`. **No copies nunca la `service_role` key a `supabase-config.js` ni a GitHub.**

Después, publica los cambios del repositorio. Al abrir la web, inicia sesión con Google. Si este navegador tiene apuestas guardadas, BET4FUN preguntará si quieres importarlas a esa cuenta. Solo se importan una vez a una cuenta vacía.

## Cómo se guardan los datos

- Las apuestas, las selecciones, los importes, las notas y el estado de las freebets se guardan en la tabla `bets`, asociadas al usuario autenticado.
- Cada usuario solo puede leer o cambiar filas propias; lo aplica PostgreSQL RLS.
- Las capturas permanecen en el navegador y el OCR se procesa ahí. Al incorporar una captura a una apuesta, se puede marcar **Guardar la captura adjunta en mi cuenta**. Entonces el archivo va al bucket privado `bet-captures`, y BET4FUN guarda su referencia en `captures`.
- Las imágenes privadas se abren con enlaces temporales; no se publican ni se incluyen en el repositorio.
- El servicio gratuito de Supabase puede pausar proyectos sin actividad durante una semana. Consulta el panel de Supabase para el límite vigente de almacenamiento y uso.

## Volver al modo solo local

Deja vacíos los dos valores de `supabase-config.js`. La aplicación vuelve a guardar en el navegador; los datos que ya estén en Supabase no se borran.

