/* Landing (index.html): portada pública de presentación de la casa.
 *
 * Muestra QUIÉNES SOMOS (historia, valores y cifras reales de la base de datos)
 * y la navegación por categoría hacia la tienda. No lista productos: para eso
 * están pages/tienda.html y pages/producto.html.
 * Es de un solo sentido: si el visitante YA tiene sesión, este script lo manda
 * directo a la TIENDA; la portada nunca se le vuelve a mostrar a quien entró.
 * Usa solo TiendaAPI de api.js (no necesita data.js ni app.js).
 */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  /* El landing vive en la raíz del proyecto y las vistas en /pages.
     Al iniciar sesión desde la portada el usuario aterriza en la TIENDA (el
     catálogo completo); si el acceso se lanza desde otra vista, esa vista
     manda su propio ?volver= (por ejemplo la tienda con un filtro puesto). */
  const PAGINAS = 'pages/';
  const TIENDA = PAGINAS + 'tienda.html';
  const VOLVER_LOGIN = encodeURIComponent('tienda.html');

  /* Frasco SVG decorativo (portada y panel de la casa) */
  function frascoSVG(p, alto) {
    const id = 'lg' + Math.random().toString(36).slice(2, 8);
    return `
<svg viewBox="0 0 120 200" height="${alto}" role="img" aria-label="${p.nombre || 'Frasco de perfume'}">
  <defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${p.c2}"/>
      <stop offset="100%" stop-color="${p.c1}"/>
    </linearGradient>
  </defs>
  <rect x="50" y="8" width="20" height="22" rx="3" fill="${p.c1}"/>
  <rect x="46" y="28" width="28" height="14" rx="3" fill="#d9c7a8"/>
  <rect x="52" y="40" width="16" height="14" fill="#b9a684"/>
  <rect x="22" y="52" width="76" height="132" rx="16" fill="url(#${id})"/>
  <rect x="22" y="52" width="76" height="132" rx="16" fill="none" stroke="rgba(0,0,0,.15)" stroke-width="2"/>
  <rect x="32" y="66" width="14" height="100" rx="7" fill="rgba(255,255,255,.35)"/>
  <rect x="34" y="112" width="52" height="42" rx="6" fill="rgba(255,255,255,.9)"/>
  <text x="60" y="132" text-anchor="middle" font-family="Georgia,serif" font-size="13" fill="${p.c1}">${(p.marca || 'Lumière').slice(0, 11)}</text>
  <text x="60" y="146" text-anchor="middle" font-family="Arial" font-size="8" fill="#5a6474" letter-spacing="1">PARFUM</text>
</svg>`;
  }

  /* Aclara un color para usarlo como fondo pastel */
  function pastel(hex, mezcla) {
    const n = parseInt(String(hex).replace('#', ''), 16);
    const m = (v) => Math.round(v + (255 - v) * (mezcla === undefined ? 0.86 : mezcla));
    const r = m((n >> 16) & 255);
    const g = m((n >> 8) & 255);
    const b = m(n & 255);

    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /* ---------- Configuración (tabla `configuracion`) ---------- */
  function pintarConfig(cfg) {
    const envio = Number(cfg.envio_gratis_desde);
    const meses = Number(cfg.meses_sin_intereses);
    const monto = envio > 0 ? '$' + envio.toLocaleString('es-MX') : null;

    if (monto) {
      const aviso = $('#envioGratisTopbar');
      const portada = $('#envioGratisHero');
      const beneficio = $('#envioGratisBenefit');

      if (aviso) aviso.textContent = 'Envío gratis en compras mayores a ' + monto;
      if (portada) portada.textContent = monto;
      if (beneficio) beneficio.textContent = 'Envío gratis desde ' + monto;
    }

    if (meses > 0 && $('#mesesHero')) $('#mesesHero').textContent = meses;
  }

  /* ---------- Cifras reales del catálogo ---------- */
  function pintarCifras(datos) {
    const destino = $('#lCifras');
    if (!destino) return;

    const fragancias = (datos.productos || []).length;
    const casas = (datos.marcas || []).length;
    const categorias = (datos.categorias || []).length;
    const familias = [...new Set((datos.productos || []).map((p) => p.familia).filter(Boolean))].length;

    const cifras = [
      { valor: fragancias, texto: fragancias === 1 ? 'fragancia en catálogo' : 'fragancias en catálogo' },
      { valor: casas, texto: casas === 1 ? 'casa perfumera' : 'casas perfumeras' },
      { valor: familias, texto: familias === 1 ? 'familia olfativa' : 'familias olfativas' },
      { valor: categorias, texto: categorias === 1 ? 'categoría' : 'categorías' }
    ];

    destino.innerHTML = cifras.map((c) => `
      <div class="lcifras__item">
        <b>${c.valor}</b>
        <span>${c.texto}</span>
      </div>`).join('');
  }

  /* ---------- Mosaico de categorías (navegación) ---------- */
  function pintarCategorias(categorias, productos) {
    const destino = $('#lCategorias');
    if (!destino) return;

    if (!categorias.length) {
      destino.innerHTML = '<p class="laviso">No se pudieron cargar las categorías.</p>';
      return;
    }

    destino.innerHTML = categorias.map((c) => {
      const cuantos = productos.filter((p) => p.cat === c.id).length;
      const texto = cuantos === 1 ? '1 fragancia' : cuantos + ' fragancias';

      return `
      <a class="lmosaico__tile" href="${PAGINAS}tienda.html?cat=${encodeURIComponent(c.id)}" style="background:${pastel(c.color)}">
        <span class="lmosaico__arte">${frascoSVG({ marca: c.nombre, c1: c.color, c2: pastel(c.color, 0.6) }, 96)}</span>
        <span class="lmosaico__nombre">${c.nombre}</span>
        <span class="lmosaico__cuenta">${texto}</span>
      </a>`;
    }).join('');
  }

  function pintarArte() {
    const arte = $('#lArteHero');
    const panel = $('#lArteHistoria');

    if (arte) arte.innerHTML = frascoSVG({ marca: 'Lumière', c1: '#f7ece0', c2: '#d8b26a' }, 400);
    if (panel) panel.innerHTML = frascoSVG({ marca: 'Lumière', c1: '#7a1533', c2: '#d8b26a' }, 230);
  }

  /* ---------- Sesión: la puerta pública y nada más ----------
     El landing es la entrada para todo el mundo, pero la TIENDA es la casa:
     en cuanto hay sesión abierta se salta la portada. No hay botón de "cerrar
     sesión" aquí porque un usuario con sesión nunca llega a esta página. */
  function pintarAcceso() {
    const zona = $('#zonaSesion');

    if (!zona) return;

    zona.innerHTML = '<a class="lhead__entrar" href="' + PAGINAS + 'login.html?volver=' + VOLVER_LOGIN + '">Iniciar sesión</a>';
  }

  /* Entra a la tienda sin dejar la portada en el historial: así el botón
     "atrás" del navegador tampoco regresa al landing. */
  function irALaTienda() {
    window.location.replace(TIENDA);
  }

  function aviso(mensaje) {
    const categorias = $('#lCategorias');
    const cifras = $('#lCifras');

    if (categorias) categorias.innerHTML = '<p class="laviso">Categorías no disponibles sin conexión.</p>';
    if (cifras) cifras.innerHTML = '<p class="laviso">' + mensaje + '</p>';
  }

  async function iniciar() {
    /* 1) ¿Ya hay sesión? Entonces la portada no aplica: derecho a la tienda. */
    try {
      const sesion = await window.TiendaAPI.verSesion();

      if (sesion.autenticado === true) {
        irALaTienda();
        return;
      }
    } catch (error) {
      /* sin conexión a MySQL se sigue mostrando la portada pública */
    }

    /* 2) Visita pública: marca, aviso y acceso a la cuenta */
    pintarArte();
    pintarAcceso();

    /* Buscador: la entrada se valida antes de salir hacia la tienda
       (reglas en assets/js/validacion.js, espejo de api/conexion.php) */
    const buscador = $('#lBuscador');
    const campoBuscar = $('#lBuscar');

    if (buscador && campoBuscar) {
      if (window.Validacion) window.Validacion.vigilar(campoBuscar, 'buscar');

      buscador.addEventListener('submit', (e) => {
        e.preventDefault();

        const revision = window.Validacion
          ? window.Validacion.validar('buscar', campoBuscar.value)
          : { ok: campoBuscar.value.trim() !== '', valor: campoBuscar.value.trim(), error: 'Escribe qué quieres buscar.' };

        if (!revision.ok) {
          if (window.Validacion) window.Validacion.marcar(campoBuscar, revision.error);
          buscador.reportValidity();     // el navegador muestra el aviso
          campoBuscar.focus();
          return;
        }

        window.location.href = PAGINAS + 'tienda.html?buscar=' + encodeURIComponent(revision.valor);
      });
    }

    try {
      const datos = await window.TiendaAPI.pedir();

      pintarConfig(datos.configuracion || {});
      pintarCifras(datos);
      pintarCategorias(datos.categorias || [], datos.productos || []);
    } catch (error) {
      console.warn('Landing sin conexión a MySQL:', error.message);
      aviso('Sin conexión con la base de datos: levanta el servidor (php -S o XAMPP) para ver el catálogo.');
    }
  }

  iniciar();
})();
