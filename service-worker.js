// Service worker de la app "Talento Humano".
// Solo guarda la portada de la app (esta página, el logo y los íconos) para que abra rápido
// y muestre "Sin conexión" cuando no hay internet. Nunca guarda datos del sistema:
// todo lo del personal sigue viniendo en vivo de Google (Apps Script y la hoja de cálculo).
// Al cambiar cualquier archivo de la portada, suba el número de VERSION.
var VERSION = 'th-v6';
var PORTADA = [
  './',
  './index.html',
  './manifest.webmanifest',
  './camara.js',
  './iconos/logo.jpg',
  './iconos/icono-192.png',
  './iconos/icono-512.png',
  './iconos/icono-maskable-192.png',
  './iconos/icono-maskable-512.png',
  './iconos/apple-touch-icon.png',
  './iconos/favicon-48.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(PORTADA); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (claves) { return Promise.all(claves.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  // Solo archivos propios de la portada; lo de Google pasa directo, sin tocarlo.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // La página: primero de internet (por si hubo cambios), y si no hay conexión, la guardada.
    e.respondWith(
      fetch(req).then(function (r) {
        var copia = r.clone(); caches.open(VERSION).then(function (c) { c.put('./index.html', copia); });
        return r;
      }).catch(function () { return caches.match('./index.html'); })
    );
    return;
  }
  // Programas de la portada (cámara, lector QR): primero de internet para tener siempre el más nuevo.
  if (/\.js$/.test(new URL(req.url).pathname)) {
    e.respondWith(fetch(req).then(function (r) { var copia = r.clone(); caches.open(VERSION).then(function (c) { c.put(req, copia); }); return r; })
      .catch(function () { return caches.match(req); }));
    return;
  }
  // Logo e íconos: de la memoria y, si falta, de internet.
  e.respondWith(caches.match(req).then(function (r) { return r || fetch(req); }));
});
