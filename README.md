# Talento Humano — Municipalidad de Olanchito

App para teléfono del sistema de Talento Humano. Abre el sistema (Google Apps Script) a pantalla completa, con ícono propio y sin barra de dirección.

- Dirección de la app: https://th1807.github.io/
- No guarda datos del personal: todo sigue en la hoja de cálculo y en Google Drive, protegido por el inicio de sesión del sistema.

## Archivos

| Archivo | Para qué |
| --- | --- |
| `index.html` | Muestra el sistema. La línea `var URL_SISTEMA = '...'` tiene el enlace /exec de la implementación. |
| `manifest.webmanifest` | Nombre, íconos y colores de la app. |
| `service-worker.js` | Guarda solo la portada para abrir rápido y avisar «Sin conexión». Al cambiar algo de la portada, suba `VERSION`. |
| `iconos/` | Íconos y logo. |

## Si cambia el enlace /exec

1. Edite `index.html` y cambie `URL_SISTEMA`.
2. En `service-worker.js` suba `VERSION` (por ejemplo `th-v3` → `th-v4`).
