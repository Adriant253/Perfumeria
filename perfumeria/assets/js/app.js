/* Tienda de perfumes - lógica de la aplicación */
(function () {
  'use strict';

  const state = {
    categoria: 'todos',
    busqueda: '',
    precio: 'all',
    marcas: new Set(),
    orden: 'relevancia',
    carrito: cargarCarrito()
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const money = (n) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* Texto que viene del usuario, listo para meterlo en una plantilla HTML */
  function textoSeguro(valor) {
    return String(valor === null || valor === undefined ? '' : valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------- Validación de entradas ----------
     Las reglas viven en assets/js/validacion.js (espejo de api/conexion.php).
     Aquí solo se usan, con un respaldo mínimo por si ese archivo no cargó. */
  function revisarBusqueda(valor) {
    if (window.Validacion) return window.Validacion.validar('buscar', valor);

    const limpio = String(valor === null || valor === undefined ? '' : valor).trim().slice(0, 60);

    return limpio.length >= 2
      ? { ok: true, valor: limpio, error: '' }
      : { ok: false, valor: limpio, error: 'Escribe al menos 2 caracteres para buscar.' };
  }

  function validarPanel(formulario, mapa) {
    if (window.Validacion) return window.Validacion.validarFormulario(formulario, mapa);

    const valores = {};

    Object.keys(mapa).forEach((nombre) => {
      const input = formulario.querySelector('[name="' + nombre + '"]');
      valores[nombre] = input ? input.value.trim() : '';
    });

    return { ok: true, errores: [], valores: valores };
  }

  /* Deja vigilados los campos del panel: se limpian al teclear y avisan */
  function vigilarPanel() {
    if (!window.Validacion) return;

    const mapa = {
      formDatos: { nombre: 'nombre', apellido: 'apellido', telefono: 'telefono' },
      formTarjeta: { titular: 'titular', numero: 'numero', mes: 'mes', anio: 'anio' },
      formDireccion: {
        destinatario: 'destinatario', telefono: 'telefono', calle: 'calle', colonia: 'colonia',
        ciudad: 'ciudad', estado: 'estado', cp: 'cp', referencias: 'referencias'
      },
      formSeguridad: { nueva: 'password', repetir: 'password' }
    };

    Object.keys(mapa).forEach((id) => {
      const formulario = $('#' + id);
      if (!formulario) return;

      Object.keys(mapa[id]).forEach((nombre) => {
        window.Validacion.vigilar(formulario.querySelector('[name="' + nombre + '"]'), mapa[id][nombre]);
      });
    });
  }

  /* Meses sin intereses: lo define la tabla `configuracion` de MySQL (ver aplicarConfiguracion) */
  let MESES_MSI = 12;

  /* La tienda vive en /pages: se calcula el prefijo para volver a la raíz,
     así los enlaces siguen funcionando aunque se mueva la carpeta. */
  const RAIZ = /\/pages\//.test(window.location.pathname) ? '../' : '';
  const PAGINA_TIENDA = RAIZ + 'pages/tienda.html';   // catálogo (vive dentro de /pages)
  const PAGINA_LOGIN = RAIZ + 'pages/login.html';
  const PAGINA_LANDING = RAIZ + 'index.html';         // portada pública: destino al cerrar sesión

  /* ---------- Ilustración del frasco (SVG) ---------- */
  function bottleSVG(p, height) {
    const h = height || 170;
    const id = 'g' + p.id + '_' + Math.random().toString(36).slice(2, 7);
    return `
<svg viewBox="0 0 120 200" height="${h}" role="img" aria-label="${p.nombre}">
  <defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${p.c2}"/>
      <stop offset="100%" stop-color="${p.c1}"/>
    </linearGradient>
  </defs>
  <rect x="50" y="8" width="20" height="22" rx="3" fill="${p.c1}"/>
  <rect x="46" y="28" width="28" height="14" rx="3" fill="#c9ced8"/>
  <rect x="52" y="40" width="16" height="14" fill="#aeb5c2"/>
  <rect x="22" y="52" width="76" height="132" rx="16" fill="url(#${id})"/>
  <rect x="22" y="52" width="76" height="132" rx="16" fill="none" stroke="rgba(0,0,0,.15)" stroke-width="2"/>
  <rect x="32" y="66" width="14" height="100" rx="7" fill="rgba(255,255,255,.35)"/>
  <rect x="34" y="112" width="52" height="42" rx="6" fill="rgba(255,255,255,.85)"/>
  <text x="60" y="132" text-anchor="middle" font-family="Georgia,serif" font-size="13" fill="${p.c1}">${p.marca.slice(0, 11)}</text>
  <text x="60" y="146" text-anchor="middle" font-family="Arial" font-size="8" fill="#5a6474" letter-spacing="1">PARFUM</text>
</svg>`;
  }

  function stars(rating) {
    const full = Math.round(rating);
    return '★'.repeat(full) + '☆'.repeat(5 - full);
  }

  /* ---------- Carrusel ---------- */
  let heroIndex = 0;
  let heroTimer = null;

  function renderHero() {
    $('#heroTrack').innerHTML = BANNERS.map((b) => `
      <div class="slide" style="background:${b.bg}">
        <div>
          <span class="slide__badge">${b.badge}</span>
          <h2>${b.titulo}</h2>
          <p>${b.sub}</p>
          <button class="btn btn--dorado" data-category="${b.cat}">${b.cta}</button>
        </div>
        <div class="slide__art">${bottleSVG({ id: 'b' + b.cat, marca: 'Lumière', c1: 'rgba(255,255,255,.85)', c2: 'rgba(255,255,255,.45)' }, 270)}</div>
      </div>`).join('');

    $('#heroDots').innerHTML = BANNERS.map((_, i) =>
      `<button data-slide="${i}" class="${i === 0 ? 'is-active' : ''}" aria-label="Ir al banner ${i + 1}"></button>`).join('');
    goHero(0);
  }

  function goHero(i) {
    heroIndex = (i + BANNERS.length) % BANNERS.length;
    $('#heroTrack').style.transform = `translateX(-${heroIndex * 100}%)`;
    $$('#heroDots button').forEach((d, k) => d.classList.toggle('is-active', k === heroIndex));
  }

  function autoHero() {
    clearInterval(heroTimer);
    heroTimer = setInterval(() => goHero(heroIndex + 1), 6000);
  }

  /* ---------- Categorías circulares ---------- */
  function renderCircles() {
    $('#circlesList').innerHTML = CATEGORIES.map((c) => `
      <button class="circle" data-category="${c.id}">
        <span class="circle__img" style="background:${c.color}1f;color:${c.color}">
          ${bottleSVG({ id: 'c_' + c.id, marca: c.nombre, c1: c.color, c2: aclarar(c.color) }, 62)}
        </span>
        <span>${c.nombre}</span>
      </button>`).join('');
  }

  function aclarar(hex) {
    const n = parseInt(hex.slice(1), 16);
    const mix = (v) => Math.round(v + (255 - v) * 0.55);
    const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /* ---------- Filtros de marca ---------- */
  function renderBrandFilters() {
    const marcas = [...new Set(PRODUCTS.map((p) => p.marca))].sort();
    $('#brandFilters').innerHTML = marcas.map((m) =>
      `<label><input type="checkbox" value="${m}" ${state.marcas.has(m) ? 'checked' : ''}> ${m}</label>`).join('');
  }

  /* ---------- Catálogo ---------- */
  function filtrar() {
    let lista = PRODUCTS.slice();

    if (state.categoria === 'ofertas') {
      lista = lista.filter((p) => p.antes > p.precio);
    } else if (state.categoria !== 'todos') {
      lista = lista.filter((p) => p.cat === state.categoria);
    }

    if (state.busqueda) {
      const q = state.busqueda.toLowerCase();
      lista = lista.filter((p) =>
        (p.nombre + ' ' + p.marca + ' ' + p.desc).toLowerCase().includes(q));
    }

    if (state.precio !== 'all') {
      const [min, max] = state.precio.split('-').map(Number);
      lista = lista.filter((p) => p.precio >= min && p.precio <= max);
    }

    if (state.marcas.size) lista = lista.filter((p) => state.marcas.has(p.marca));

    if (state.orden === 'menor') lista.sort((a, b) => a.precio - b.precio);
    if (state.orden === 'mayor') lista.sort((a, b) => b.precio - a.precio);
    if (state.orden === 'rating') lista.sort((a, b) => b.rating - a.rating);

    return lista;
  }

  function tituloCatalogo() {
    if (state.busqueda) return `Resultados para "${state.busqueda}"`;
    if (state.categoria === 'todos') return 'Todos los perfumes';
    if (state.categoria === 'ofertas') return 'Ofertas del día';
    const c = CATEGORIES.find((x) => x.id === state.categoria);
    return 'Perfumes para ' + (c ? c.nombre.toLowerCase() : '');
  }

  function renderGrid() {
    const lista = filtrar();
    $('#catalogTitle').textContent = tituloCatalogo();
    $('#resultCount').textContent = lista.length + (lista.length === 1 ? ' producto' : ' productos');
    $('#empty').hidden = lista.length > 0;

    $('#grid').innerHTML = lista.map((p) => {
      const off = Math.round((1 - p.precio / p.antes) * 100);
      const msi = Math.round(p.precio / MESES_MSI);
      return `
      <a class="card" href="producto.html?slug=${p.slug}">
        ${off > 0 ? `<span class="card__tag">-${off}%</span>` : ''}
        <div class="card__img">${bottleSVG(p)}</div>
        <span class="card__brand">${p.marca}</span>
        <h3 class="card__name">${p.nombre}</h3>
        <div class="card__rating"><span class="stars">${stars(p.rating)}</span> ${p.rating} (${p.reviews})</div>
        <span class="card__before">${money(p.antes)}</span>
        <div><span class="card__price">${money(p.precio)}</span><span class="card__off">${off}% desc.</span></div>
        <div class="card__msi">${MESES_MSI} pagos de ${money(msi)}</div>
        <button class="btn btn--primary btn--block js-add" data-id="${p.id}">Agregar al carrito</button>
      </a>`;
    }).join('');
  }

  /* ---------- Carrito ----------
     Sin sesión: se guarda en localStorage (como antes).
     Con sesión: se guarda en MySQL (carritos + carrito_items) vía api/carrito.php.
  ------------------------------------------------------------------------- */
  let sesion = { autenticado: false, usuario: null };
  let carritoRemoto = null;

  function cargarCarrito() {
    try { return JSON.parse(localStorage.getItem('carrito') || '[]'); } catch (e) { return []; }
  }

  function guardarCarrito() {
    try { localStorage.setItem('carrito', JSON.stringify(state.carrito)); } catch (e) { /* almacenamiento bloqueado */ }
  }

  function usarCarritoRemoto() {
    return sesion.autenticado && carritoRemoto !== null;
  }

  function setTexto(selector, valor) {
    const el = $(selector);
    if (el) el.textContent = valor;
  }

  function agregar(id) {
    if (sesion.autenticado) return accionCarrito('agregar', { variante_id: id, cantidad: 1 }, 'Producto agregado al carrito');

    const item = state.carrito.find((i) => i.id === id);
    if (item) item.qty += 1;
    else state.carrito.push({ id: id, qty: 1 });
    guardarCarrito();
    renderCarrito();
    toast('Producto agregado al carrito');
  }

  function cambiarQty(id, delta) {
    if (sesion.autenticado) {
      const nueva = carritoActual(id) + delta;
      return nueva <= 0
        ? accionCarrito('quitar', { variante_id: id }, 'Producto quitado del carrito')
        : accionCarrito('cantidad', { variante_id: id, cantidad: nueva });
    }

    const item = state.carrito.find((i) => i.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) state.carrito = state.carrito.filter((i) => i.id !== id);
    guardarCarrito();
    renderCarrito();
  }

  function quitar(id) {
    if (sesion.autenticado) return accionCarrito('quitar', { variante_id: id }, 'Producto quitado del carrito');

    state.carrito = state.carrito.filter((i) => i.id !== id);
    guardarCarrito();
    renderCarrito();
  }

  function carritoActual(varianteId) {
    if (!carritoRemoto) return 0;
    const item = carritoRemoto.items.find((i) => i.variante_id === varianteId);
    return item ? item.cantidad : 0;
  }

  async function accionCarrito(accion, datos, mensaje) {
    try {
      aplicarCarrito(await window.TiendaAPI.carrito(accion, datos));
      if (mensaje) toast(mensaje);
    } catch (error) {
      toast(error.message);
    }
  }

  function aplicarCarrito(respuesta) {
    carritoRemoto = respuesta;
    renderCarrito();
  }

  function filaCarrito(item) {
    return `
      <div class="citem">
        <div>${bottleSVG({ id: item.id, nombre: item.nombre, marca: item.marca, c1: item.c1, c2: item.c2 }, 64)}</div>
        <div>
          <div class="citem__name">${item.nombre}</div>
          <div class="citem__price">${money(item.subtotal)}</div>
          <div class="qty">
            <button class="js-minus" data-id="${item.id}">−</button>
            <span>${item.cantidad}</span>
            <button class="js-plus" data-id="${item.id}">+</button>
          </div>
        </div>
        <button class="citem__del js-del" data-id="${item.id}">Quitar</button>
      </div>`;
  }

  function renderCarrito() {
    const body = $('#cartBody');
    let items = [];
    let piezas = 0;
    let subtotal = 0;
    let envio = 0;
    let total = 0;

    if (usarCarritoRemoto()) {
      items = carritoRemoto.items.map((i) => ({
        id: i.variante_id, nombre: i.nombre, marca: i.marca, c1: i.c1, c2: i.c2,
        cantidad: i.cantidad, subtotal: i.subtotal
      }));
      piezas = carritoRemoto.piezas;
      subtotal = carritoRemoto.subtotal;
      envio = carritoRemoto.costo_envio;
      total = carritoRemoto.total;
    } else {
      items = state.carrito.map((i) => {
        const p = PRODUCTS.find((x) => x.id === i.id);
        if (!p) return null;
        return {
          id: p.id, nombre: p.nombre, marca: p.marca, c1: p.c1, c2: p.c2,
          cantidad: i.qty, subtotal: p.precio * i.qty
        };
      }).filter(Boolean);

      piezas = items.reduce((s, i) => s + i.cantidad, 0);
      subtotal = items.reduce((s, i) => s + i.subtotal, 0);

      const minimo = Number(CONFIG.envio_gratis_desde) || 0;
      const base = Number(CONFIG.costo_envio_base) || 0;
      envio = (subtotal > 0 && minimo > 0 && subtotal < minimo) ? base : 0;
      total = subtotal + envio;
    }

    setTexto('#cartCount', piezas);
    setTexto('#cartSubtotal', money(subtotal));
    setTexto('#cartEnvio', piezas === 0 ? '—' : (envio === 0 ? 'Gratis' : money(envio)));
    setTexto('#cartTotal', money(total));

    if (!items.length) {
      body.innerHTML = '<div class="cart__empty">Tu carrito está vacío.<br>¡Agrega tu fragancia favorita!</div>';
      return;
    }

    body.innerHTML = items.map(filaCarrito).join('');
  }

  function abrirCarrito(open) {
    $('#cart').classList.toggle('is-open', open);
    $('#overlay').hidden = !open;
  }

    /* La ficha del producto vive ahora en pages/producto.html */

  /* ---------- Cuenta: inicio de sesión y registro ---------- */
  /* Abre un modal y cierra los demás: así nunca se enciman */
  function abrirModal(selector, abierto) {
    if (abierto) {
      ['#modal', '#checkoutModal', '#pedidosModal', '#perfilModal'].forEach((otro) => {
        if (otro !== selector) {
          const otroModal = $(otro);
          if (otroModal) otroModal.hidden = true;
        }
      });
    }

    const modal = $(selector);
    if (modal) modal.hidden = !abierto;
  }

  function pintarCuenta() {
    const etiqueta = $('#loginBtn span');
    const boton = $('#loginBtn');

    if (etiqueta) {
      etiqueta.innerHTML = sesion.autenticado
        ? 'Hola<br><b>' + textoSeguro(sesion.usuario.nombre) + '</b>'
        : 'Hola<br><b>Inicia sesión</b>';
    }
    if (boton) {
      boton.title = sesion.autenticado ? 'Mi perfil y mis pedidos' : 'Inicia sesión o crea tu cuenta';
    }
    /* El botón "Cerrar sesión" vive en la barra superior del header (pages/tienda.html) */
    const salir = $('#logoutTop');
    if (salir) salir.hidden = !sesion.autenticado;

    /* El acceso al panel solo se muestra a las cuentas con rol admin;
       api/admin.php vuelve a comprobarlo en el servidor. */
    const panel = $('#adminPanelLink');
    if (panel) {
      const esAdmin = sesion.autenticado
        && String((sesion.usuario && sesion.usuario.rol) || '').toLowerCase() === 'admin';

      panel.hidden = !esAdmin;
    }
  }

  /* El formulario de inicio de sesión vive en login.html (login.js) */

  /* Al iniciar sesión, lo que el invitado tenía en el navegador se sube a MySQL */
  async function sincronizarCarrito() {
    try {
      for (const item of state.carrito) {
        await window.TiendaAPI.carrito('agregar', { variante_id: item.id, cantidad: item.qty });
      }

      if (state.carrito.length) {
        state.carrito = [];
        guardarCarrito();
      }

      aplicarCarrito(await window.TiendaAPI.verCarrito());
    } catch (error) {
      toast(error.message);
    }
  }

  async function cerrarSesion() {
    try {
      await window.TiendaAPI.salir();
    } catch (error) {
      /* aunque falle, la sesión local se cierra */
    }

    sesion = { autenticado: false, usuario: null };
    carritoRemoto = null;
    abrirModal('#pedidosModal', false);
    abrirModal('#perfilModal', false);
    toast('Cerraste sesión');
    /* Cerrar sesión devuelve a la portada pública (landing): se deja ver el
       aviso un momento antes de salir de la tienda. */
    window.setTimeout(() => { window.location.href = PAGINA_LANDING; }, 700);
  }

  /* =====================================================================
     MI PERFIL — datos, tarjetas, direcciones y seguridad
     Se abre pulsando el nombre de la cabecera (ver bindCuenta).
     ===================================================================== */
  const SECCIONES_PERFIL = [
    { id: 'datos', nombre: 'Mis datos' },
    { id: 'tarjetas', nombre: 'Tarjetas' },
    { id: 'direccion', nombre: 'Dirección' },
    { id: 'seguridad', nombre: 'Seguridad' },
    { id: 'sesiones', nombre: 'Sesiones' }
  ];

  let perfil = {
    usuario: null,
    tarjetas: [],
    direcciones: [],
    sesiones: [],
    tab: 'datos',
    edicion: null   // { tipo: 'datos' | 'tarjeta' | 'direccion', id: number | null }
  };

  /* Dígito de control de la tarjeta (ISO/IEC 7812) */
  function luhnValido(numero) {
    let suma = 0;
    let alterno = false;

    for (let i = numero.length - 1; i >= 0; i -= 1) {
      let digito = Number(numero.charAt(i));

      if (alterno) {
        digito *= 2;
        if (digito > 9) digito -= 9;
      }

      suma += digito;
      alterno = !alterno;
    }

    return suma % 10 === 0;
  }

  /* Marca y últimos 4 dígitos: el número completo NUNCA sale del navegador,
     solo se usa aquí para reconocer la marca y validar el número. */
  function resumenTarjeta(numero) {
    const limpio = String(numero).replace(/\D/g, '');
    let marca = 'Tarjeta';

    if (/^4/.test(limpio)) marca = 'VISA';
    else if (/^(5[1-5]|2[2-7])/.test(limpio)) marca = 'Mastercard';
    else if (/^3[47]/.test(limpio)) marca = 'AMEX';
    else if (/^6(?:011|5)/.test(limpio)) marca = 'Discover';

    return {
      marca: marca,
      ultimos4: limpio.slice(-4),
      valido: limpio.length >= 13 && limpio.length <= 19 && luhnValido(limpio)
    };
  }

  function venceEn(mes, anio) {
    return String(mes).padStart(2, '0') + '/' + String(anio).slice(-2);
  }

  async function verPerfil() {
    const cuerpo = $('#perfilBody');
    if (!cuerpo) return;

    abrirModal('#perfilModal', true);
    cuerpo.innerHTML = '<p class="lnota">Cargando tu perfil…</p>';

    try {
      const respuesta = await window.TiendaAPI.verPerfil();

      perfil.usuario = respuesta.usuario || sesion.usuario;
      perfil.tarjetas = respuesta.tarjetas || [];
      perfil.direcciones = respuesta.direcciones || [];
      perfil.edicion = null;

      /* Multisesiones: los dispositivos que tienen la cuenta abierta ahora */
      try {
        const lista = await window.TiendaAPI.verSesiones();
        perfil.sesiones = lista.sesiones || [];
      } catch (error) {
        perfil.sesiones = [];
      }

      if (respuesta.usuario) {
        sesion = { autenticado: true, usuario: respuesta.usuario };
        pintarCuenta();
      }

      pintarPerfil();
    } catch (error) {
      /* La sesión pudo vencer mientras el usuario estaba en la tienda */
      if (/iniciar sesión/i.test(error.message)) {
        sesion = { autenticado: false, usuario: null };
        carritoRemoto = null;
        pintarCuenta();
        abrirModal('#perfilModal', false);
        toast('Tu sesión terminó, vuelve a entrar');
        irALogin();
        return;
      }

      cuerpo.innerHTML = '<p class="laviso">' + textoSeguro(error.message) + '</p>';
    }
  }

  /* ---------- Pintado del panel ---------- */
  function pintarPerfil() {
    const cuerpo = $('#perfilBody');
    if (!cuerpo) return;

    const u = perfil.usuario || {};
    const nombreCompleto = [u.nombre, u.apellido].filter(Boolean).join(' ') || 'Sin nombre';
    const iniciales = ((String(u.nombre || '?').charAt(0)) + String(u.apellido || '').charAt(0)).toUpperCase();

    cuerpo.innerHTML = `
      <div class="lperfil__cab">
        <span class="lperfil__avatar">${textoSeguro(iniciales)}</span>
        <div>
          <b>${textoSeguro(nombreCompleto)}</b>
          <small>${textoSeguro(u.email || '')}</small>
        </div>
      </div>

      <div class="lperfil__tabs" role="tablist">
        ${SECCIONES_PERFIL.map((s) => `<button class="lperfil__tab${perfil.tab === s.id ? ' is-active' : ''}" type="button" role="tab" data-perfil-tab="${s.id}">${s.nombre}</button>`).join('')}
      </div>

      <div class="lperfil__seccion">${seccionPerfil()}</div>`;

    /* Los campos del formulario visible quedan vigilados */
    vigilarPanel();
  }

  function seccionPerfil() {
    if (perfil.tab === 'tarjetas') return seccionTarjetas();
    if (perfil.tab === 'direccion') return seccionDirecciones();
    if (perfil.tab === 'seguridad') return seccionSeguridad();
    if (perfil.tab === 'sesiones') return seccionSesiones();

    return seccionDatos();
  }

  function seccionDatos() {
    const u = perfil.usuario || {};
    const nombre = [u.nombre, u.apellido].filter(Boolean).join(' ') || 'Sin nombre';
    const telefono = (u.telefono === null || u.telefono === undefined || String(u.telefono).trim() === '')
      ? 'Sin registrar'
      : String(u.telefono);

    const boton = perfil.edicion && perfil.edicion.tipo === 'datos'
      ? ''
      : '<button class="btn btn--primary lperfil__anadir" id="datosEditar" type="button">Editar datos</button>';

    return `
      ${formularioDatos()}
      <div class="lperfil__fila"><span>Nombre</span><b>${textoSeguro(nombre)}</b></div>
      <div class="lperfil__fila"><span>Correo</span><b>${textoSeguro(u.email || '—')}</b></div>
      <div class="lperfil__fila"><span>Teléfono</span><b>${textoSeguro(telefono)}</b></div>
      ${boton}
      <p class="lperfil__nota">Con este correo entras a la tienda y recibes el seguimiento de tus pedidos.</p>`;
  }

  function formularioDatos() {
    if (!perfil.edicion || perfil.edicion.tipo !== 'datos') return '';

    const u = perfil.usuario || {};

    return `
      <form class="lperfil__form" id="formDatos" autocomplete="off">
        <h3 class="lperfil__subtitulo">Editar mis datos</h3>

        <div class="lperfil__dos">
          <label>Nombre<input type="text" name="nombre" value="${textoSeguro(u.nombre || '')}" maxlength="100" required /></label>
          <label>Apellido<input type="text" name="apellido" value="${textoSeguro(u.apellido || '')}" maxlength="100" required /></label>
        </div>

        <label>Teléfono<input type="tel" name="telefono" value="${textoSeguro(u.telefono || '')}" placeholder="10 dígitos" maxlength="20" /></label>
        <label>Correo (no se puede cambiar)<input type="email" value="${textoSeguro(u.email || '')}" disabled /></label>

        <div class="lperfil__acciones">
          <button class="btn btn--primary" type="submit">Guardar cambios</button>
          <button class="btn btn--ghost" type="button" data-perfil-cancelar="1">Cancelar</button>
        </div>
      </form>`;
  }

  function seccionTarjetas() {
    const lista = perfil.tarjetas.length
      ? perfil.tarjetas.map((t) => `
        <div class="lperfil__item">
          <div>
            <b>${textoSeguro(t.marca)} •••• ${textoSeguro(t.ultimos4)}${t.predeterminada ? ' <span class="lperfil__pin">Predeterminada</span>' : ''}</b>
            <small>${textoSeguro(t.titular)} · vence ${textoSeguro(venceEn(t.mes, t.anio))}</small>
          </div>
          <div class="lperfil__itemacciones">
            <button class="lperfil__mini" type="button" data-tarjeta-editar="${t.id}">Actualizar</button>
            <button class="lperfil__mini lperfil__mini--peligro" type="button" data-tarjeta-eliminar="${t.id}">Eliminar</button>
          </div>
        </div>`).join('')
      : '<p class="lperfil__vacio">Todavía no tienes tarjetas guardadas.</p>';

    const boton = perfil.edicion && perfil.edicion.tipo === 'tarjeta'
      ? ''
      : '<button class="btn btn--primary lperfil__anadir" id="tarjetaNueva" type="button">Agregar tarjeta</button>';

    return `
      ${formularioTarjeta()}
      <div class="lperfil__lista">${lista}</div>
      ${boton}
      <p class="lperfil__nota">Por seguridad solo guardamos la marca, los últimos 4 dígitos y el vencimiento. El número completo y el CVV nunca se envían al servidor.</p>`;
  }

  function formularioTarjeta() {
    if (!perfil.edicion || perfil.edicion.tipo !== 'tarjeta') return '';

    const id = perfil.edicion.id;
    const t = id ? (perfil.tarjetas.filter((x) => x.id === id)[0] || {}) : {};
    const anioActual = new Date().getFullYear();

    return `
      <form class="lperfil__form" id="formTarjeta" autocomplete="off">
        <h3 class="lperfil__subtitulo">${id ? 'Actualizar tarjeta' : 'Nueva tarjeta'}</h3>

        <label>Titular<input type="text" name="titular" value="${textoSeguro(t.titular || '')}" placeholder="Como aparece en la tarjeta" maxlength="100" required /></label>

        ${id
          ? `<input type="hidden" name="marca" value="${textoSeguro(t.marca || '')}" /><input type="hidden" name="ultimos4" value="${textoSeguro(t.ultimos4 || '')}" />`
          : '<label>Número de la tarjeta<input type="text" name="numero" inputmode="numeric" placeholder="0000 0000 0000 0000" maxlength="19" required /></label>'}

        <div class="lperfil__dos">
          <label>Mes<input type="number" name="mes" min="1" max="12" value="${t.mes || ''}" placeholder="MM" required /></label>
          <label>Año<input type="number" name="anio" min="${anioActual}" max="${anioActual + 20}" value="${t.anio || ''}" placeholder="AAAA" required /></label>
        </div>

        <label class="lperfil__check"><input type="checkbox" name="predeterminada"${t.predeterminada ? ' checked' : ''} /> Usar como predeterminada</label>

        <div class="lperfil__acciones">
          <button class="btn btn--primary" type="submit">${id ? 'Guardar cambios' : 'Agregar tarjeta'}</button>
          <button class="btn btn--ghost" type="button" data-perfil-cancelar="1">Cancelar</button>
        </div>
      </form>`;
  }

  function seccionDirecciones() {
    const lista = perfil.direcciones.length
      ? perfil.direcciones.map((d) => `
        <div class="lperfil__item">
          <div>
            <b>${textoSeguro(d.destinatario)}${d.predeterminada ? ' <span class="lperfil__pin">Predeterminada</span>' : ''}</b>
            <small>${textoSeguro(d.calle)}, ${textoSeguro(d.colonia)}, ${textoSeguro(d.ciudad)}, ${textoSeguro(d.estado)} · CP ${textoSeguro(d.cp)} · Tel. ${textoSeguro(d.telefono)}</small>
          </div>
          <div class="lperfil__itemacciones">
            <button class="lperfil__mini" type="button" data-direccion-editar="${d.id}">Actualizar</button>
            <button class="lperfil__mini lperfil__mini--peligro" type="button" data-direccion-eliminar="${d.id}">Eliminar</button>
          </div>
        </div>`).join('')
      : '<p class="lperfil__vacio">Todavía no tienes direcciones guardadas.</p>';

    const boton = perfil.edicion && perfil.edicion.tipo === 'direccion'
      ? ''
      : '<button class="btn btn--primary lperfil__anadir" id="direccionNueva" type="button">Agregar dirección</button>';

    return `
      ${formularioDireccion()}
      <div class="lperfil__lista">${lista}</div>
      ${boton}
      <p class="lperfil__nota">Con esta dirección se llena el pago. Puedes tener varias y marcar una como predeterminada.</p>`;
  }

  function formularioDireccion() {
    if (!perfil.edicion || perfil.edicion.tipo !== 'direccion') return '';

    const id = perfil.edicion.id;
    const d = id ? (perfil.direcciones.filter((x) => x.id === id)[0] || {}) : {};

    return `
      <form class="lperfil__form" id="formDireccion" autocomplete="off">
        <h3 class="lperfil__subtitulo">${id ? 'Actualizar dirección' : 'Nueva dirección'}</h3>

        <div class="lperfil__dos">
          <label>Destinatario<input type="text" name="destinatario" value="${textoSeguro(d.destinatario || '')}" maxlength="100" required /></label>
          <label>Teléfono<input type="tel" name="telefono" value="${textoSeguro(d.telefono || '')}" maxlength="20" required /></label>
        </div>

        <label>Calle y número<input type="text" name="calle" value="${textoSeguro(d.calle || '')}" maxlength="120" required /></label>

        <div class="lperfil__dos">
          <label>Colonia<input type="text" name="colonia" value="${textoSeguro(d.colonia || '')}" maxlength="120" required /></label>
          <label>Código postal<input type="text" name="cp" inputmode="numeric" value="${textoSeguro(d.cp || '')}" maxlength="5" required /></label>
        </div>

        <div class="lperfil__dos">
          <label>Ciudad<input type="text" name="ciudad" value="${textoSeguro(d.ciudad || '')}" maxlength="60" required /></label>
          <label>Estado<input type="text" name="estado" value="${textoSeguro(d.estado || '')}" maxlength="60" required /></label>
        </div>

        <label>Referencias (opcional)<input type="text" name="referencias" value="${textoSeguro(d.referencias || '')}" maxlength="160" /></label>
        <label class="lperfil__check"><input type="checkbox" name="predeterminada"${d.predeterminada ? ' checked' : ''} /> Usar como predeterminada</label>

        <div class="lperfil__acciones">
          <button class="btn btn--primary" type="submit">${id ? 'Guardar cambios' : 'Agregar dirección'}</button>
          <button class="btn btn--ghost" type="button" data-perfil-cancelar="1">Cancelar</button>
        </div>
      </form>`;
  }

  function seccionSeguridad() {
    const u = perfil.usuario || {};

    return `
      <form class="lperfil__form" id="formSeguridad" autocomplete="off">
        <h3 class="lperfil__subtitulo">Cambiar contraseña</h3>
        <label>Contraseña actual<input type="password" name="actual" autocomplete="current-password" maxlength="72" required /></label>
        <label>Contraseña nueva<input type="password" name="nueva" autocomplete="new-password" minlength="8" maxlength="72" placeholder="Mínimo 8 caracteres" required /></label>
        <label>Repite la nueva<input type="password" name="repetir" autocomplete="new-password" minlength="8" maxlength="72" required /></label>
        <div class="lperfil__acciones">
          <button class="btn btn--primary" type="submit">Actualizar contraseña</button>
        </div>
      </form>

      <div class="lperfil__fila"><span>Cuenta</span><b>${textoSeguro(u.email || '—')}</b></div>
      <p class="lperfil__nota">Tu contraseña se guarda cifrada (password_hash) en la tabla usuarios.</p>`;
  }

  /* ---------- Multisesiones: dispositivos con la cuenta abierta ---------- */
  function fechaSesion(valor) {
    if (!valor) return 'Sin fecha';

    const fecha = new Date(String(valor).replace(' ', 'T'));

    if (Number.isNaN(fecha.getTime())) return String(valor);

    return fecha.toLocaleString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  function seccionSesiones() {
    const lista = perfil.sesiones || [];

    const filas = lista.length
      ? lista.map((s) => `
          <div class="lperfil__fila lperfil__fila--sesion">
            <span>
              <b>${textoSeguro(s.dispositivo || 'Dispositivo')}</b>
              ${s.actual ? '<em class="lperfil__etiqueta">Esta sesión</em>' : ''}
              <small>${textoSeguro(s.ip || 'IP desconocida')} · Entró ${textoSeguro(fechaSesion(s.creada))} · Vence ${textoSeguro(fechaSesion(s.expira))}</small>
            </span>
            <button class="btn btn--ghost" type="button" data-sesion-cerrar="${Number(s.id)}">${s.actual ? 'Cerrar esta' : 'Cerrar'}</button>
          </div>`).join('')
      : '<p class="laviso">No hay sesiones abiertas ahora mismo.</p>';

    const otras = lista.filter((s) => !s.actual).length;

    return `
      <h3 class="lperfil__subtitulo">Dispositivos con tu cuenta</h3>
      ${filas}
      ${otras ? '<button class="btn btn--primary lperfil__anadir" type="button" id="cerrarOtras">Cerrar las demás sesiones</button>' : ''}
      <p class="lperfil__nota">Cada navegador donde entras cuenta como una sesión. Se guardan hasta 5; al abrir la sexta se cierra la más antigua.</p>`;
  }

  /* ---------- Acciones del panel ---------- */
  async function enviarPerfil(accion, datos, exito) {
    try {
      const respuesta = await window.TiendaAPI.perfil(accion, datos);

      if (respuesta.usuario) {
        perfil.usuario = respuesta.usuario;
        sesion = { autenticado: true, usuario: respuesta.usuario };
        pintarCuenta();
      }

      perfil.tarjetas = respuesta.tarjetas || [];
      perfil.direcciones = respuesta.direcciones || [];
      perfil.edicion = null;

      pintarPerfil();
      toast(respuesta.mensaje || exito || 'Listo');
      return true;
    } catch (error) {
      toast(error.message);
      return false;
    }
  }

  /* ---------- Eventos del panel (delegación: el contenido se repinta) ---------- */
  function bindPerfil() {
    const cuerpo = $('#perfilBody');
    if (!cuerpo) return;

    cuerpo.addEventListener('click', async (e) => {
      const tab = e.target.closest('[data-perfil-tab]');
      if (tab) {
        perfil.tab = tab.dataset.perfilTab;
        perfil.edicion = null;
        pintarPerfil();
        return;
      }

      if (e.target.closest('[data-perfil-cancelar]')) {
        perfil.edicion = null;
        pintarPerfil();
        return;
      }

      if (e.target.closest('#tarjetaNueva')) {
        perfil.edicion = { tipo: 'tarjeta', id: null };
        pintarPerfil();
        return;
      }

      if (e.target.closest('#datosEditar')) {
        perfil.edicion = { tipo: 'datos', id: null };
        pintarPerfil();
        return;
      }

      if (e.target.closest('#direccionNueva')) {
        perfil.edicion = { tipo: 'direccion', id: null };
        pintarPerfil();
        return;
      }

      const cerrarRemota = e.target.closest('[data-sesion-cerrar]');
      if (cerrarRemota) {
        const id = Number(cerrarRemota.dataset.sesionCerrar);
        const esActual = (perfil.sesiones || []).some((s) => s.actual && Number(s.id) === id);

        if (esActual && !window.confirm('¿Cerrar la sesión de este dispositivo? Tendrás que volver a entrar.')) {
          return;
        }

        try {
          const respuesta = await window.TiendaAPI.cerrarSesionRemota(id);

          /* Si cerró la sesión en la que navega, se sale de la tienda */
          if (respuesta.sesion_actual) {
            cerrarSesion();
            return;
          }

          perfil.sesiones = respuesta.sesiones || [];
          pintarPerfil();
          toast(respuesta.mensaje || 'Sesión cerrada');
        } catch (error) {
          toast(error.message);
        }

        return;
      }

      if (e.target.closest('#cerrarOtras')) {
        if (!window.confirm('¿Cerrar la sesión en los demás dispositivos?')) return;

        try {
          const respuesta = await window.TiendaAPI.cerrarOtrasSesiones();

          perfil.sesiones = respuesta.sesiones || [];
          pintarPerfil();
          toast(respuesta.mensaje || 'Cerramos las demás sesiones');
        } catch (error) {
          toast(error.message);
        }

        return;
      }

      const editarTarjeta = e.target.closest('[data-tarjeta-editar]');
      if (editarTarjeta) {
        perfil.edicion = { tipo: 'tarjeta', id: Number(editarTarjeta.dataset.tarjetaEditar) };
        pintarPerfil();
        return;
      }

      const borrarTarjeta = e.target.closest('[data-tarjeta-eliminar]');
      if (borrarTarjeta) {
        if (window.confirm('¿Eliminar esta tarjeta?')) {
          await enviarPerfil('tarjeta-eliminar', { id: Number(borrarTarjeta.dataset.tarjetaEliminar) }, 'Tarjeta eliminada');
        }
        return;
      }

      const editarDireccion = e.target.closest('[data-direccion-editar]');
      if (editarDireccion) {
        perfil.edicion = { tipo: 'direccion', id: Number(editarDireccion.dataset.direccionEditar) };
        pintarPerfil();
        return;
      }

      const borrarDireccion = e.target.closest('[data-direccion-eliminar]');
      if (borrarDireccion) {
        if (window.confirm('¿Eliminar esta dirección?')) {
          await enviarPerfil('direccion-eliminar', { id: Number(borrarDireccion.dataset.direccionEliminar) }, 'Dirección eliminada');
        }
      }
    });
    /* ---------- Formularios: tarjeta, dirección y contraseña ---------- */
    cuerpo.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formulario = e.target;
      const datos = Object.fromEntries(new FormData(formulario).entries());

      /* --- datos personales --- */
      if (formulario.id === 'formDatos') {
        const revision = validarPanel(formulario, {
          nombre: 'nombre',
          apellido: 'apellido',
          telefono: { clave: 'telefono', obligatorio: false }
        });

        if (!revision.ok) { toast(revision.errores[0]); return; }

        await enviarPerfil('datos-guardar', revision.valores, 'Datos actualizados');
        return;
      }

      /* --- tarjeta nueva o actualizada --- */
      if (formulario.id === 'formTarjeta') {
        const editando = (perfil.edicion && perfil.edicion.tipo === 'tarjeta' && perfil.edicion.id) ? perfil.edicion.id : 0;

        /* Al editar no hay campo de número (solo se cambian titular y vencimiento) */
        const mapaTarjeta = { titular: 'titular', mes: 'mes', anio: 'anio' };
        if (!editando) mapaTarjeta.numero = 'numero';

        const revision = validarPanel(formulario, mapaTarjeta);

        if (!revision.ok) { toast(revision.errores[0]); return; }

        let marca = String(datos.marca || '');
        let ultimos4 = String(datos.ultimos4 || '');

        /* Al agregar, el número se convierte AQUÍ en marca + últimos 4 dígitos */
        if (datos.numero) {
          const tarjeta = window.Validacion ? window.Validacion.revisarTarjeta(datos.numero) : resumenTarjeta(datos.numero);

          if (!tarjeta.valido) {
            if (window.Validacion) window.Validacion.marcar(formulario.querySelector('[name="numero"]'), tarjeta.error);
            toast(tarjeta.error || 'Revisa el número de la tarjeta');
            return;
          }

          marca = tarjeta.marca;
          ultimos4 = tarjeta.ultimos4;
        }

        if (marca === '' || ultimos4.length !== 4) { toast('Revisa el número de la tarjeta'); return; }

        /* El vencimiento no puede estar vencido (mismo tope que el servidor) */
        if (window.Validacion && !window.Validacion.anioValido(revision.valores.anio)) {
          window.Validacion.marcar(formulario.querySelector('[name="anio"]'), 'Revisa «año de vencimiento»: ya pasó.');
          toast('Revisa el año de vencimiento de la tarjeta');
          return;
        }

        await enviarPerfil('tarjeta-guardar', {
          id: editando,
          marca: marca,
          ultimos4: ultimos4,
          mes: Number(revision.valores.mes),
          anio: Number(revision.valores.anio),
          titular: revision.valores.titular,
          predeterminada: !!(formulario.predeterminada && formulario.predeterminada.checked)
        }, editando ? 'Tarjeta actualizada' : 'Tarjeta agregada');
        return;
      }

      /* --- dirección nueva o actualizada --- */
      if (formulario.id === 'formDireccion') {
        const editando = (perfil.edicion && perfil.edicion.tipo === 'direccion' && perfil.edicion.id) ? perfil.edicion.id : 0;
        const revision = validarPanel(formulario, {
          destinatario: 'destinatario',
          telefono: 'telefono',
          calle: 'calle',
          colonia: 'colonia',
          ciudad: 'ciudad',
          estado: 'estado',
          cp: 'cp',
          referencias: { clave: 'referencias', obligatorio: false }
        });

        if (!revision.ok) { toast(revision.errores[0]); return; }

        const envio = Object.assign({ id: editando }, revision.valores);
        envio.predeterminada = !!(formulario.predeterminada && formulario.predeterminada.checked);

        await enviarPerfil('direccion-guardar', envio, editando ? 'Dirección actualizada' : 'Dirección guardada');
        return;
      }

      /* --- seguridad: contraseña --- */
      if (formulario.id === 'formSeguridad') {
        const revision = validarPanel(formulario, {
          actual: 'password',
          nueva: 'password',
          repetir: 'password'
        });

        if (!revision.ok) { toast(revision.errores[0]); return; }
        if (revision.valores.nueva !== revision.valores.repetir) {
          if (window.Validacion) window.Validacion.marcar(formulario.querySelector('[name="repetir"]'), 'Las contraseñas nuevas no coinciden.');
          toast('Las contraseñas nuevas no coinciden');
          return;
        }

        const listo = await enviarPerfil('password', {
          actual: revision.valores.actual,
          nueva: revision.valores.nueva
        }, 'Contraseña actualizada');

        if (listo) formulario.reset();
      }
    });
  }

  /* ---------- Mis pedidos ---------- */
  async function verPedidos() {
    const cuerpo = $('#pedidosBody');
    if (!cuerpo) return;

    cuerpo.innerHTML = '<p class="lnota">Cargando tus pedidos…</p>';
    abrirModal('#pedidosModal', true);

    try {
      const respuesta = await window.TiendaAPI.misPedidos();
      const pedidos = respuesta.pedidos || [];

      if (!pedidos.length) {
        cuerpo.innerHTML = '<div class="cart__empty">Todavía no tienes pedidos.<br>¡Estrena tu primera fragancia!</div>';
        return;
      }

      cuerpo.innerHTML = pedidos.map((p) => `
        <div class="lpedido">
          <div>
            <b>${p.codigo_rastreo}</b>
            <small>${new Date(String(p.creado_en).replace(' ', 'T')).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })} · ${p.partidas} partida(s)</small>
          </div>
          <div class="lpedido__der">
            <span class="letiqueta">${p.estado}</span>
            <b>${money(Number(p.total))}</b>
          </div>
        </div>`).join('');
    } catch (error) {
      cuerpo.innerHTML = '<p class="laviso">' + error.message + '</p>';
    }
  }

  /* ---------- Pago: direcciones y tarjetas guardadas del perfil ----------
     Si el cliente ya las guardó en "Mi perfil", el pago las ofrece listas: un
     selector de direcciones que rellena el formulario y sus tarjetas dentro del
     selector de método de pago. */
  function llenarDireccionCheckout(d) {
    const formulario = $('#checkoutForm');
    if (!formulario) return;

    ['destinatario', 'calle', 'colonia', 'ciudad', 'estado', 'cp', 'telefono', 'referencias'].forEach((campo) => {
      const input = formulario.querySelector('[name="' + campo + '"]');
      if (input) input.value = d[campo] || '';
    });
  }

  async function cargarGuardadasCheckout() {
    const caja = $('#checkoutGuardadas');
    const formulario = $('#checkoutForm');
    const selectPago = formulario ? formulario.querySelector('select[name="metodo_pago"]') : null;

    if (caja) {
      caja.hidden = true;
      caja.innerHTML = '';
    }

    if (selectPago) selectPago.querySelectorAll('option[data-tarjeta]').forEach((o) => o.remove());

    let direcciones = [];
    let tarjetas = [];

    try {
      const respuesta = await window.TiendaAPI.verPerfil();
      direcciones = respuesta.direcciones || [];
      tarjetas = respuesta.tarjetas || [];
    } catch (error) {
      return;   // sin conexión se llena todo a mano
    }

    /* Las tarjetas guardadas se suman al selector de método de pago */
    if (selectPago) {
      tarjetas.forEach((t) => {
        const etiqueta = t.marca + ' •••• ' + t.ultimos4;

        const opcion = document.createElement('option');
        opcion.value = etiqueta;
        opcion.textContent = etiqueta + (t.predeterminada ? ' (predeterminada)' : '') + ' · guardada';
        opcion.dataset.tarjeta = String(t.id);
        selectPago.appendChild(opcion);
      });

      const preferida = tarjetas.filter((t) => t.predeterminada)[0];
      if (preferida) selectPago.value = preferida.marca + ' •••• ' + preferida.ultimos4;
    }

    if (!caja || !direcciones.length) return;

    caja.innerHTML = `
      <label>Usar una dirección guardada
        <select id="checkoutDireccion">
          <option value="">Escribir una dirección nueva</option>
          ${direcciones.map((d) => `<option value="${d.id}">${textoSeguro(d.destinatario)} · ${textoSeguro(d.calle)}, ${textoSeguro(d.colonia)}${d.predeterminada ? ' (predeterminada)' : ''}</option>`).join('')}
        </select>
      </label>`;
    caja.hidden = false;

    const select = $('#checkoutDireccion');
    const predeterminada = direcciones.filter((d) => d.predeterminada)[0] || direcciones[0];

    if (select) {
      select.value = String(predeterminada.id);
      llenarDireccionCheckout(predeterminada);

      select.addEventListener('change', () => {
        const elegida = direcciones.filter((d) => String(d.id) === select.value)[0];
        if (elegida) llenarDireccionCheckout(elegida);
      });
    }
  }

  /* ---------- Pago (crea el pedido en MySQL) ---------- */
  async function abrirCheckout() {
    if (!sesion.autenticado) {
      toast('Inicia sesión para completar tu compra');
      irALogin('pagar');   // al volver de login.html reabre el pago
      return;
    }

    if (!usarCarritoRemoto() || !carritoRemoto.items.length) {
      toast('Tu carrito está vacío');
      return;
    }

    const envio = carritoRemoto.costo_envio === 0 ? 'Gratis' : money(carritoRemoto.costo_envio);
    const resumen = $('#checkoutResumen');

    if (resumen) {
      resumen.innerHTML = `
        <div class="cart__linea"><span>Subtotal (${carritoRemoto.piezas} pza)</span><b>${money(carritoRemoto.subtotal)}</b></div>
        <div class="cart__linea"><span>Envío</span><b>${envio}</b></div>
        <div class="cart__linea cart__linea--total"><span>Total</span><b>${money(carritoRemoto.total)}</b></div>`;
    }

    await cargarGuardadasCheckout();   // direcciones y tarjetas guardadas del perfil

    abrirModal('#checkoutModal', true);
  }

  async function enviarPedido(evento) {
    evento.preventDefault();

    const formulario = evento.target;
    const boton = $('#checkoutEnviar');

    /* Validación de los datos de envío antes de mandar nada al servidor */
    const revision = validarPanel(formulario, {
      destinatario: 'destinatario',
      telefono: 'telefono',
      calle: 'calle',
      colonia: 'colonia',
      ciudad: 'ciudad',
      estado: 'estado',
      cp: 'cp',
      referencias: { clave: 'referencias', obligatorio: false }
    });

    if (!revision.ok) {
      toast(revision.errores[0]);
      return;
    }

    /* El método de pago tiene que ser una de las opciones del selector
       (las formas de pago o una tarjeta guardada del perfil) */
    const selectorPago = formulario.querySelector('select[name="metodo_pago"]');
    const opciones = selectorPago ? Array.from(selectorPago.options).map((o) => o.value) : [];

    if (opciones.length && opciones.indexOf(selectorPago.value) === -1) {
      toast('Elige un método de pago de la lista');
      return;
    }

    const datos = Object.fromEntries(new FormData(formulario).entries());
    datos.guardar_direccion = !!formulario.guardar_direccion.checked;

    if (boton) boton.disabled = true;

    try {
      const respuesta = await window.TiendaAPI.confirmarPedido(datos);

      abrirModal('#checkoutModal', false);
      formulario.reset();
      toast('¡Gracias por tu compra! Pedido ' + respuesta.pedido.codigo_rastreo);

      await sincronizarCarrito();
      abrirCarrito(false);

      $('#cartBody').innerHTML = `
        <div class="cart__empty">
          Pedido <b>${respuesta.pedido.codigo_rastreo}</b> confirmado.<br>
          Total pagado: <b>${money(respuesta.pedido.total)}</b><br>
          Recibirás tu paquete en 24-48 h.
        </div>`;
      abrirCarrito(true);
    } catch (error) {
      toast(error.message);
    } finally {
      if (boton) boton.disabled = false;
    }
  }

  /* ---------- Ir a la página de acceso recordando dónde estaba ---------- */
  function irALogin(continuar) {
    const aqui = (window.location.pathname.split('/').pop() || 'tienda.html') + window.location.search;
    const extra = continuar ? (window.location.search ? '&' : '?') + 'continuar=' + continuar : '';

    window.location.href = PAGINA_LOGIN + '?volver=' + encodeURIComponent(aqui + extra);
  }

  /* ---------- Botones de cuenta, pago y modales ---------- */
  function bindCuenta() {
    const abrirCuenta = () => {
      if (sesion.autenticado) {
        verPerfil();   // el nombre de la cabecera abre "Mi perfil"
      } else {
        irALogin();   // login.html te devuelve a esta misma página
      }
    };

    $('#loginBtn').addEventListener('click', abrirCuenta);
    /* "Cerrar sesión" del header: usa la misma función que el botón del modal */
    const salirTop = $('#logoutTop');
    if (salirTop) salirTop.addEventListener('click', cerrarSesion);
    /* Rastreo: con sesión abre "Mis pedidos"; sin sesión primero hay que entrar
       y login.html devuelve aquí con ?continuar=pedidos */
    const rastreo = $('#rastreoLink');
    if (rastreo) {
      rastreo.addEventListener('click', () => {
        if (sesion.autenticado) verPedidos();
        else irALogin('pedidos');
      });
    }

    $('#checkoutBtn').addEventListener('click', abrirCheckout);
    $('#checkoutClose').addEventListener('click', () => abrirModal('#checkoutModal', false));
    $('#checkoutForm').addEventListener('submit', enviarPedido);

    $('#pedidosClose').addEventListener('click', () => abrirModal('#pedidosModal', false));
    $('#logoutBtn').addEventListener('click', cerrarSesion);

    /* Mi perfil: cierre del panel, salto a pedidos y cerrar sesión desde ahí */
    const perfilClose = $('#perfilClose');
    if (perfilClose) perfilClose.addEventListener('click', () => abrirModal('#perfilModal', false));

    const perfilPedidos = $('#perfilPedidos');
    if (perfilPedidos) {
      perfilPedidos.addEventListener('click', () => { abrirModal('#perfilModal', false); verPedidos(); });
    }

    const perfilSalir = $('#perfilSalir');
    if (perfilSalir) perfilSalir.addEventListener('click', cerrarSesion);

    /* El contenido del panel (pestañas, tarjetas, direcciones y seguridad)
       se registra por delegación porque se repinta en cada acción */
    bindPerfil();

    ['#checkoutModal', '#pedidosModal', '#perfilModal'].forEach((selector) => {
      const modal = $(selector);
      if (modal) {
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
      }
    });
  }

  /* ---------- Toast ---------- */


  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-show'), 2200);
  }

  /* ---------- Navegación por categoría ---------- */
  function setCategoria(cat, desplazar) {
    state.categoria = cat;
    state.busqueda = '';
    $('#searchInput').value = '';
    $$('.catnav__item').forEach((b) => b.classList.toggle('is-active', b.dataset.category === cat));
    renderGrid();

    /* Sincroniza la URL con la categoría y limpia los parámetros de un solo uso */
    try {
      const params = new URLSearchParams(window.location.search);
      params.delete('continuar');
      params.delete('carrito');
      params.set('cat', cat);
      window.history.replaceState(null, '', window.location.pathname + '?' + params.toString());
    } catch (e) { /* navegador sin history */ }

    if (desplazar !== false) $('.catalog').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- Eventos ---------- */
  function bind() {
    document.addEventListener('click', (e) => {
      const catBtn = e.target.closest('[data-category]');
      const addBtn = e.target.closest('.js-add');
      const dot = e.target.closest('#heroDots button');

      if (addBtn) {
        e.stopPropagation();
        agregar(Number(addBtn.dataset.id));
        return;
      }
      if (catBtn) {
        setCategoria(catBtn.dataset.category);
        return;
      }
      if (dot) { goHero(Number(dot.dataset.slide)); autoHero(); return; }

      if (e.target.closest('.js-plus')) cambiarQty(Number(e.target.closest('.js-plus').dataset.id), 1);
      if (e.target.closest('.js-minus')) cambiarQty(Number(e.target.closest('.js-minus').dataset.id), -1);
      if (e.target.closest('.js-del')) quitar(Number(e.target.closest('.js-del').dataset.id));
    });

    $('#heroPrev').addEventListener('click', () => { goHero(heroIndex - 1); autoHero(); });
    $('#heroNext').addEventListener('click', () => { goHero(heroIndex + 1); autoHero(); });

    $('#searchForm').addEventListener('submit', (e) => {
      e.preventDefault();

      /* La búsqueda se valida antes de filtrar (largo y caracteres permitidos) */
      const revision = revisarBusqueda($('#searchInput').value);

      if (!revision.ok) {
        if (window.Validacion) window.Validacion.marcar($('#searchInput'), revision.error);
        toast(revision.error);
        $('#searchInput').focus();
        return;
      }

      if (window.Validacion) window.Validacion.marcar($('#searchInput'), '');
      $('#searchInput').value = revision.valor;
      state.busqueda = revision.valor;
      state.categoria = 'todos';
      $$('.catnav__item').forEach((b) => b.classList.toggle('is-active', b.dataset.category === 'todos'));
      renderGrid();
      $('.catalog').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('#searchInput').addEventListener('input', (e) => {
      if (window.Validacion) window.Validacion.marcar(e.target, '');

      if (e.target.value === '') { state.busqueda = ''; renderGrid(); }
    });

    $('#sortSelect').addEventListener('change', (e) => { state.orden = e.target.value; renderGrid(); });

    $('.filters').addEventListener('change', (e) => {
      if (e.target.name === 'price') state.precio = e.target.value;
      if (e.target.type === 'checkbox') {
        if (e.target.checked) state.marcas.add(e.target.value);
        else state.marcas.delete(e.target.value);
      }
      renderGrid();
    });

    $('#clearFilters').addEventListener('click', () => {
      state.precio = 'all';
      state.marcas.clear();
      $('input[name="price"][value="all"]').checked = true;
      renderBrandFilters();
      renderGrid();
    });

    $('#cartBtn').addEventListener('click', () => abrirCarrito(true));
    $('#cartClose').addEventListener('click', () => abrirCarrito(false));
    $('#overlay').addEventListener('click', () => abrirCarrito(false));
    $('#menuBtn').addEventListener('click', () => $('#catnav').scrollIntoView({ behavior: 'smooth' }));
    /* #loginBtn, #checkoutBtn y los modales de cuenta se registran en bindCuenta() */

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        abrirCarrito(false);
        ['#checkoutModal', '#pedidosModal', '#perfilModal'].forEach((sel) => abrirModal(sel, false));
      }
    });
  }

  /* ---------- Reglas que vienen de la tabla `configuracion` ---------- */
  function aplicarConfiguracion() {
    const cfg = (typeof CONFIG === 'object' && CONFIG) ? CONFIG : {};
    const meses = Number(cfg.meses_sin_intereses);
    const envio = Number(cfg.envio_gratis_desde);

    if (meses > 0) MESES_MSI = meses;

    if (envio > 0) {
      const monto = '$' + envio.toLocaleString('es-MX');
      const aviso = $('#envioGratisTopbar');
      const benefit = $('#envioGratisBenefit');

      if (aviso) aviso.textContent = 'Envío gratis en compras mayores a ' + monto;
      if (benefit) benefit.textContent = 'En compras mayores a ' + monto;
    }
  }

  /* ---------- Enlaces que llegan desde el landing (?cat=, ?buscar=, ?producto=) ---------- */
  function aplicarParametros() {
    const params = new URLSearchParams(window.location.search);
    const cat = params.get('cat');
    const buscar = params.get('buscar');
    const producto = params.get('producto');

    if (cat) setCategoria(cat, false);

    if (buscar) {
      /* El texto que llega por la URL también se valida antes de usarse */
      const revision = revisarBusqueda(buscar);

      if (revision.ok) {
        state.busqueda = revision.valor;
        $('#searchInput').value = revision.valor;
        renderGrid();
      } else {
        toast(revision.error);
      }
    }

    if (producto) {
      window.location.href = 'producto.html?slug=' + encodeURIComponent(producto);
      return;
    }

    /* El botón "Comprar ahora" de la ficha llega con ?carrito=1 */
    if (params.get('carrito') === '1') abrirCarrito(true);

    /* Si venimos de login.html con la intención de pagar, se reabre el pago */
    if (params.get('continuar') === 'pagar' && sesion.autenticado) abrirCheckout();

    /* Al volver de login.html por "Rastrea tu pedido" se abre el panel de pedidos */
    if (params.get('continuar') === 'pedidos' && sesion.autenticado) verPedidos();
  }

  /* ---------- Init ---------- */
  function pintar() {
    aplicarConfiguracion();
    renderHero();
    autoHero();
    renderCircles();
    renderBrandFilters();
    renderGrid();
    renderCarrito();
  }

  /* Catálogo y sesión desde MySQL (api/tienda.php y api/sesion.php);
     si no hay conexión, se queda con los datos locales de data.js */
  async function iniciar() {
    if (window.TiendaAPI) {
      try {
        await window.TiendaAPI.conectar();

        const respuesta = await window.TiendaAPI.verSesion();
        sesion.autenticado = respuesta.autenticado === true;
        sesion.usuario = respuesta.usuario;
      } catch (error) {
        console.warn('Sin conexión con la base de datos:', error.message);
        toast('Catálogo local: no se pudo conectar con la base de datos');
      }
    }

    pintar();
    pintarCuenta();

    if (sesion.autenticado) {
      await sincronizarCarrito();   // sube lo que había como invitado y lee el carrito de MySQL
    }

    aplicarParametros();
  }

  bind();
  bindCuenta();
  iniciar();
})();
