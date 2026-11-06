// Cámara de la app "Talento Humano".
// Desde 2026 Google ya no deja usar la cámara dentro de las páginas de Apps Script.
// Esta portada (th1807.github.io) sí puede: abre la cámara aquí y le pasa al sistema solo
// las fotos que se toman (o el texto del QR leído). No guarda nada: todo queda en memoria
// mientras la cámara está abierta y se borra al cerrarla.
(function () {
    'use strict';
    var GOOGLE = /(^|\.)googleusercontent\.com$|^script\.google\.com$/;
    var cliente = null, origenCliente = '', modo = 'documento', flujo = null, bucle = null, auto = true;
    var quad = null, estables = 0, esperarCambio = false, ultima = 0, tomadas = 0, maximo = 30, linterna = false, lectorQr = null;
    var $ = function (id) { return document.getElementById(id); };

        // ---- Detección de la hoja (la región clara más grande y sus 4 esquinas) ----
        var escMini = null;
        function escDetectarHoja(fuente, anchoFuente, altoFuente, resolucion) {
            var W = resolucion || 200, H = Math.max(40, Math.round(W * altoFuente / anchoFuente));
            escMini = escMini || document.createElement('canvas');
            escMini.width = W; escMini.height = H;
            var ctx = escMini.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(fuente, 0, 0, W, H);
            var d = ctx.getImageData(0, 0, W, H).data, n = W * H, gris = new Uint8Array(n), hist = new Array(256).fill(0);
            for (var i = 0; i < n; i++) { var g = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0; gris[i] = g; hist[g]++; }
            // Umbral de Otsu
            var suma = 0; for (var t = 0; t < 256; t++) suma += t * hist[t];
            var sB = 0, wB = 0, mejor = 0, umbral = 128;
            for (t = 0; t < 256; t++) {
                wB += hist[t]; if (!wB) continue; var wF = n - wB; if (!wF) break;
                sB += t * hist[t]; var mB = sB / wB, mF = (suma - sB) / wF, entre = wB * wF * (mB - mF) * (mB - mF);
                if (entre > mejor) { mejor = entre; umbral = t; }
            }
            if (mejor / (n * n) < 150) return null;   // sin contraste: no hay hoja clara sobre fondo oscuro
            // Región clara conectada más grande
            var marca = new Int32Array(n), pila = new Int32Array(n), mayor = 0, idMayor = 0, id = 0;
            for (i = 0; i < n; i++) {
                if (marca[i] || gris[i] <= umbral) continue;
                id++; var tam = 0, sp = 0; pila[sp++] = i; marca[i] = id;
                while (sp) {
                    var p = pila[--sp]; tam++;
                    var x = p % W, y = (p / W) | 0;
                    if (x > 0 && !marca[p - 1] && gris[p - 1] > umbral) { marca[p - 1] = id; pila[sp++] = p - 1; }
                    if (x < W - 1 && !marca[p + 1] && gris[p + 1] > umbral) { marca[p + 1] = id; pila[sp++] = p + 1; }
                    if (y > 0 && !marca[p - W] && gris[p - W] > umbral) { marca[p - W] = id; pila[sp++] = p - W; }
                    if (y < H - 1 && !marca[p + W] && gris[p + W] > umbral) { marca[p + W] = id; pila[sp++] = p + W; }
                }
                if (tam > mayor) { mayor = tam; idMayor = id; }
            }
            if (mayor < n * 0.12 || mayor > n * 0.97) return null;
            // Esquinas: extremos de x+y y de x−y
            var tl = null, tr = null, br = null, bl = null, minS = 1e9, maxS = -1e9, minD = 1e9, maxD = -1e9;
            for (i = 0; i < n; i++) {
                if (marca[i] !== idMayor) continue;
                x = i % W; y = (i / W) | 0;
                var s = x + y, df = x - y;
                if (s < minS) { minS = s; tl = [x, y]; } if (s > maxS) { maxS = s; br = [x, y]; }
                if (df > maxD) { maxD = df; tr = [x, y]; } if (df < minD) { minD = df; bl = [x, y]; }
            }
            var q = [tl, tr, br, bl];
            var area = Math.abs(escAreaQuad(q));
            if (area < mayor * 0.72 || area > mayor * 1.35) return null;   // la región no parece un rectángulo
            q = escAfinarEsquinas(q, marca, idMayor, W, H) || q;
            var fx = anchoFuente / W, fy = altoFuente / H;
            return q.map(function(c) { return [(c[0] + 0.5) * fx, (c[1] + 0.5) * fy]; });
        }
        // Cada lado de la hoja se ajusta a una recta con todos los puntos de su borde y las esquinas
        // salen de cruzar esas rectas: mucho más exacto que tomar un solo píxel por esquina.
        function escAfinarEsquinas(q, marca, id, W, H) {
            var grupos = [[], [], [], []], lados = [], i, k;
            for (k = 0; k < 4; k++) {
                var a = q[k], b = q[(k + 1) % 4], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
                if (L < 8) return null;
                lados.push({ a: a, ux: dx / L, uy: dy / L, L: L });
            }
            for (i = 0; i < W * H; i++) {
                if (marca[i] !== id) continue;
                var x = i % W, y = (i / W) | 0;
                if (x > 0 && x < W - 1 && y > 0 && y < H - 1 && marca[i - 1] === id && marca[i + 1] === id && marca[i - W] === id && marca[i + W] === id) continue;
                var px = x + 0.5, py = y + 0.5, mejor = -1, dmin = 1e9;
                for (k = 0; k < 4; k++) {
                    var s = lados[k], rx = px - s.a[0], ry = py - s.a[1], t = rx * s.ux + ry * s.uy;
                    if (t < s.L * 0.12 || t > s.L * 0.88) continue;    // lejos de las esquinas (ahí el borde se curva)
                    var d = Math.abs(rx * s.uy - ry * s.ux);
                    if (d < dmin) { dmin = d; mejor = k; }
                }
                if (mejor >= 0 && dmin < Math.max(3, lados[mejor].L * 0.04)) grupos[mejor].push([px, py]);
            }
            var rectas = [];
            for (k = 0; k < 4; k++) {
                var g = grupos[k]; if (g.length < 6) return null;
                var mx = 0, my = 0; g.forEach(function(p) { mx += p[0]; my += p[1]; }); mx /= g.length; my /= g.length;
                var sxx = 0, syy = 0, sxy = 0; g.forEach(function(p) { var ex = p[0] - mx, ey = p[1] - my; sxx += ex * ex; syy += ey * ey; sxy += ex * ey; });
                var ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);     // dirección principal de los puntos
                rectas.push({ x: mx, y: my, dx: Math.cos(ang), dy: Math.sin(ang) });
            }
            var nuevo = [];
            for (k = 0; k < 4; k++) {
                var r1 = rectas[(k + 3) % 4], r2 = rectas[k], det = r1.dx * r2.dy - r1.dy * r2.dx;
                if (Math.abs(det) < 0.2) return null;
                var tt = ((r2.x - r1.x) * r2.dy - (r2.y - r1.y) * r2.dx) / det, cx = r1.x + r1.dx * tt, cy = r1.y + r1.dy * tt;
                if (Math.hypot(cx - q[k][0], cy - q[k][1]) > Math.max(W, H) * 0.08) return null;   // algo salió raro: se queda la estimación simple
                nuevo.push([cx - 0.5, cy - 0.5]);
            }
            return nuevo;
        }
        function escAreaQuad(q) {
            var a = 0; for (var i = 0; i < 4; i++) { var j = (i + 1) % 4; a += q[i][0] * q[j][1] - q[j][0] * q[i][1]; } return a / 2;
        }

    function enviar(datos) { if (cliente) { datos.tipo = 'rrhh-camara'; try { cliente.postMessage(datos, origenCliente); } catch (e) {} } }
    // ¿El mensaje viene de adentro de NUESTRO marco del sistema? (Google lo muestra en varios marcos
    // anidados, a veces sin origen visible; por eso se revisa de qué marco viene y no solo el origen).
    function desdeElSistema(e) {
        var marco = document.getElementById('sistema'), w = e.source, pasos = 0;
        if (!marco || !w) return false;
        try { while (w && pasos++ < 8) { if (w === marco.contentWindow) return true; if (w === w.parent) break; w = w.parent; } } catch (err) {}
        return false;
    }
    function estado(texto, tipo) { var e = $('camEstado'); e.textContent = texto; e.className = 'cam-estado ' + (tipo || ''); }

    function abrir(d) {
        modo = d.modo === 'qr' ? 'qr' : 'documento';
        maximo = Math.max(1, Math.min(30, d.restantes || 30)); tomadas = 0; quad = null; estables = 0; esperarCambio = false;
        $('camTitulo').textContent = String(d.titulo || (modo === 'qr' ? 'Escanear carnet' : 'Escanear documento')).slice(0, 80);
        $('camSubtitulo').textContent = String(d.subtitulo || '').slice(0, 120);
        $('camara').className = 'abierta ' + (modo === 'qr' ? 'modo-qr' : 'modo-doc');
        pintarCuenta();
        estado('Abriendo la cámara…', '');
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { fallo({ name: 'NotSupportedError' }); return; }
        var pedir = function (v) { return navigator.mediaDevices.getUserMedia({ video: v, audio: false }); };
        pedir({ facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } })
            .catch(function (e) { if (e && e.name === 'NotAllowedError') throw e; return pedir({ facingMode: 'environment' }); })
            .catch(function (e) { if (e && e.name === 'NotAllowedError') throw e; return pedir(true); })
            .then(function (f) {
                if (!$('camara').classList.contains('abierta')) { f.getTracks().forEach(function (t) { t.stop(); }); return; }
                flujo = f; var v = $('camVideo'); v.srcObject = f; var p = v.play(); if (p && p.catch) p.catch(function () {});
                var pista = f.getVideoTracks()[0], cap = pista.getCapabilities ? pista.getCapabilities() : {};
                $('camLinterna').hidden = !cap.torch;
                if (modo === 'qr') { prepararQr(); bucle = setInterval(leerQr, 220); estado('Apunte la cámara al código QR del carnet', ''); }
                else bucle = setInterval(detectar, 260);
            }).catch(fallo);
    }
    function fallo(e) {
        var n = e && e.name;
        estado(n === 'NotAllowedError' ? 'La app no tiene permiso para la cámara. Actívelo en los ajustes del navegador y vuelva a intentar.'
             : n === 'NotReadableError' ? 'Otra aplicación está usando la cámara. Ciérrela y vuelva a intentar.'
             : 'No se pudo abrir la cámara de este equipo.', 'aviso');
        enviar({ evento: 'error', nombre: String(n || 'Error') });
        cerrar(false, false);   // el sistema muestra el aviso y la otra forma de tomar la foto
    }
    function apagar() {
        clearInterval(bucle); bucle = null; linterna = false;
        if (flujo) { flujo.getTracks().forEach(function (t) { t.stop(); }); flujo = null; }
        $('camVideo').srcObject = null;
        var c = $('camMarco'); c.getContext('2d').clearRect(0, 0, c.width, c.height);
    }
    function cerrar(listo, avisar) {
        apagar(); $('camara').className = '';
        $('camTira').innerHTML = '';
        if (avisar) enviar({ evento: 'cerrada', listo: !!listo, tomadas: tomadas });
    }

    // ---- Documento ----
    function detectar() {
        var v = $('camVideo'); if (!v.videoWidth) return;
        var q = escDetectarHoja(v, v.videoWidth, v.videoHeight), antes = quad, dim = Math.max(v.videoWidth, v.videoHeight);
        var quieta = q && antes && q.every(function (c, k) { return Math.hypot(c[0] - antes[k][0], c[1] - antes[k][1]) < dim * 0.025; });
        var movida = !q || !antes || q.some(function (c, k) { return Math.hypot(c[0] - antes[k][0], c[1] - antes[k][1]) > dim * 0.12; });
        if (esperarCambio && movida) esperarCambio = false;
        quad = q; estables = quieta ? estables + 1 : 0;
        marco(q);
        if (!q) { estado('Busque la hoja: póngala sobre una mesa oscura y que se vea completa', ''); return; }
        if (esperarCambio) { estado('Página tomada. Cambie la hoja para seguir', 'ok'); return; }
        if (!auto) { estado('Hoja encontrada. Toque el botón para tomarla', 'ok'); return; }
        estado('Hoja encontrada. Mantenga el teléfono quieto', 'ok');
        if (estables >= 4 && Date.now() - ultima > 1500) tomar();
    }
    function marco(q) {
        var v = $('camVideo'), c = $('camMarco'), r = v.getBoundingClientRect(); c.width = r.width; c.height = r.height;
        var ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height);
        if (!q || !v.videoWidth) return;
        var e = Math.min(r.width / v.videoWidth, r.height / v.videoHeight), ox = (r.width - v.videoWidth * e) / 2, oy = (r.height - v.videoHeight * e) / 2;
        var p = q.map(function (k) { return [ox + k[0] * e, oy + k[1] * e]; });
        ctx.beginPath(); p.forEach(function (k, i) { if (i) ctx.lineTo(k[0], k[1]); else ctx.moveTo(k[0], k[1]); }); ctx.closePath();
        ctx.fillStyle = 'rgba(56,182,255,0.14)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#38b6ff'; ctx.stroke();
        p.forEach(function (k) { ctx.beginPath(); ctx.arc(k[0], k[1], 8, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke(); });
    }
    function tomar() {
        var v = $('camVideo'); if (!v.videoWidth || modo !== 'documento') return;
        if (tomadas >= maximo) { estado('Llegó al máximo de páginas', 'aviso'); return; }
        var c = document.createElement('canvas'), esc = Math.min(1, 2400 / Math.max(v.videoWidth, v.videoHeight));
        c.width = Math.round(v.videoWidth * esc); c.height = Math.round(v.videoHeight * esc);
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        var jpeg = c.toDataURL('image/jpeg', 0.9);
        tomadas++; ultima = Date.now(); esperarCambio = true; estables = 0;
        enviar({ evento: 'foto', jpeg: jpeg, numero: tomadas });
        var m = document.createElement('canvas'), e2 = 120 / Math.max(c.width, c.height);
        m.width = Math.round(c.width * e2); m.height = Math.round(c.height * e2); m.getContext('2d').drawImage(c, 0, 0, m.width, m.height);
        var img = new Image(); img.alt = ''; img.src = m.toDataURL('image/jpeg', 0.7);
        var tira = $('camTira'); tira.appendChild(img); while (tira.children.length > 3) tira.removeChild(tira.firstChild);
        pintarCuenta();
        if (navigator.vibrate) navigator.vibrate(40);
        var f = $('camDestello'); f.classList.remove('activo'); void f.offsetWidth; f.classList.add('activo');
    }
    function pintarCuenta() {
        $('camCuenta').textContent = tomadas === 0 ? 'Aún no hay páginas' : tomadas === 1 ? '1 página tomada' : tomadas + ' páginas tomadas';
        $('camListo').disabled = tomadas === 0;
    }

    // ---- QR del carnet ----
    function prepararQr() {
        if ('BarcodeDetector' in window) { try { lectorQr = new window.BarcodeDetector({ formats: ['qr_code'] }); return; } catch (e) {} }
        lectorQr = null;
        if (!window.jsQR) { var s = document.createElement('script'); s.src = 'vendor/jsQR.js'; document.head.appendChild(s); }
    }
    var leyendo = false, lienzoQr = null;
    function leerQr() {
        var v = $('camVideo'); if (leyendo || v.readyState < 2) return;
        var listo = function (t) { leyendo = false; if (!t || modo !== 'qr') return; if (navigator.vibrate) navigator.vibrate(60); enviar({ evento: 'qr', texto: String(t).slice(0, 500) }); cerrar(true, false); };
        leyendo = true;
        if (lectorQr) { lectorQr.detect(v).then(function (c) { listo(c && c.length ? c[0].rawValue : null); }).catch(function () { leyendo = false; }); return; }
        if (!window.jsQR) { leyendo = false; return; }
        lienzoQr = lienzoQr || document.createElement('canvas');
        var e = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight)); lienzoQr.width = Math.round(v.videoWidth * e); lienzoQr.height = Math.round(v.videoHeight * e);
        var ctx = lienzoQr.getContext('2d', { willReadFrequently: true }); ctx.drawImage(v, 0, 0, lienzoQr.width, lienzoQr.height);
        var r = window.jsQR(ctx.getImageData(0, 0, lienzoQr.width, lienzoQr.height).data, lienzoQr.width, lienzoQr.height, { inversionAttempts: 'dontInvert' });
        listo(r && r.data);
    }

    // ---- Mensajes del sistema ----
    window.addEventListener('message', function (e) {
        var host = ''; try { host = new URL(e.origin).hostname; } catch (err) {}
        if (!e.data || typeof e.data !== 'object' || !e.source) return;
        if (!(GOOGLE.test(host) || (e.origin === 'null' && desdeElSistema(e))) || !desdeElSistema(e)) return;
        if (e.data.tipo === 'rrhh-listo' || (e.data.tipo === 'rrhh-camara' && e.data.accion === 'hola')) {
            cliente = e.source; origenCliente = (e.origin && e.origin !== 'null') ? e.origin : '*';
            enviar({ evento: 'disponible', version: 2 });
            return;
        }
        if (e.data.tipo !== 'rrhh-camara') return;
        if (e.source !== cliente) { cliente = e.source; origenCliente = (e.origin && e.origin !== 'null') ? e.origin : '*'; }
        if (e.data.accion === 'abrir') abrir(e.data);
        else if (e.data.accion === 'cerrar') cerrar(false, false);
    });

    document.addEventListener('DOMContentLoaded', function () {
        $('camCerrar').addEventListener('click', function () { cerrar(false, true); });
        $('camListo').addEventListener('click', function () { cerrar(true, true); });
        $('camObturador').addEventListener('click', tomar);
        $('camAuto').addEventListener('click', function () { auto = !auto; this.setAttribute('aria-pressed', auto ? 'true' : 'false'); this.textContent = auto ? 'Automático' : 'Manual'; estables = 0; });
        $('camLinterna').addEventListener('click', function () {
            if (!flujo) return; linterna = !linterna; this.setAttribute('aria-pressed', linterna ? 'true' : 'false');
            flujo.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: linterna }] }).catch(function () {});
        });
        document.addEventListener('visibilitychange', function () { if (document.hidden && flujo) cerrar(tomadas > 0, true); });
    });
})();
