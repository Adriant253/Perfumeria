/* Ficha de producto (pages/producto.html).
 *
 * Lee ?slug=, pide api/producto.php y pinta la página: presentaciones,
 * cantidad, botones de compra, características, descripción y relacionados.
 * El carrito funciona igual que en la tienda: en localStorage si eres
 * invitado y en MySQL (api/carrito.php) si ya iniciaste sesión.
 */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const money = (n) => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const estrellas = (r) => {
    const llenas = Math.round(Number(r) || 0);
    return '★'.repeat(llenas) + '☆'.repeat(5 - llenas);
  };

  let ficha = null;                              // respuesta del API
  let variante = null;                           // presentación elegida
  let cantidad = 1;
  let sesion = { autenticado: false, usuario: null, piezas: 0 };

  /* ---------- Carrito del invitado (mismo formato que la tienda) ---------- */
  function carritoLocal() {
    try { return JSON.parse(localStorage.getItem('carrito') || '[]'); } catch (e) { return []; }
  }

  function guardarLocal(varianteId, cuantas) {
    const carrito = carritoLocal();
    const item = carrito.find((i) => i.id === varianteId);

    if (item) item.qty += cuantas;
    else carrito.push({ id: varianteId, qty: cuantas });

    try { localStorage.setItem('carrito', JSON.stringify(carrito)); } catch (e) { /* almacenamiento bloqueado */ }

    return carrito.reduce((suma, i) => suma + i.qty, 0);
  }

  function toast(mensaje) {
    const caja = $('#toast');
    if (!caja) return;

    caja.textContent = mensaje;
    caja.classList.add('is-show');
    clearTimeout(toast.temporizador);
    toast.temporizador = setTimeout(() => caja.classList.remove('is-show'), 2600);
  }

  /* ---------- Frasco SVG (mismo dibujo que en la tienda) ---------- */
  function frascoSVG(p, alto) {
    const id = 'fp' + Math.random().toString(36).slice(2, 8);
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

  /* ---------- Cabecera: sesión y carrito ---------- */
  function pintarCuenta() {
    const zona = $('#zonaSesion');
    if (!zona) return;

    const volver = encodeURIComponent('producto.html' + window.location.search);
    const cuenta = sesion.autenticado
      ? '<span class="ficha__usuario">Hola, ' + sesion.usuario.nombre + '</span><button type="button" id="salirFicha">Cerrar sesión</button>'
      : '<a href="login.html?volver=' + volver + '">Iniciar sesión</a>';

    zona.innerHTML = `
      <a class="haction ficha__carrito" href="tienda.html?carrito=1" title="Ver mi carrito">Carrito<b class="badge">${sesion.piezas}</b></a>
      <div class="ficha__cuenta">${cuenta}</div>`;

    const salir = $('#salirFicha');
    if (salir) {
      salir.addEventListener('click', async () => {
        try { await window.TiendaAPI.salir(); } catch (error) { /* igual se sale */ }
        toast('Cerraste sesión');
        /* Cerrar sesión vuelve a la portada pública (landing) */
        window.setTimeout(() => { window.location.href = '../index.html'; }, 700);
      });
    }
  }

  /* ---------- Ficha ---------- */
  function pintarFicha() {
    const p = ficha.producto;
    const meses = Number(ficha.configuracion.meses_sin_intereses) || 12;
    const msi = Math.round(p.precio / meses);

    document.title = p.nombre + ' · Lumière Perfumería';

    $('#ficha').innerHTML = `
      <nav class="migas">
        <a href="tienda.html">Tienda</a>
        <span>·</span>
        <a href="tienda.html?cat=${encodeURIComponent(p.cat)}">${p.cat_nombre}</a>
        <span>·</span>
        <b>${p.marca}</b>
      </nav>

      <div class="ficha__grid">
        <div class="ficha__foto">
          ${p.descuento > 0 ? `<span class="card__tag">-${p.descuento}%</span>` : ''}
          ${frascoSVG(p, 420)}
        </div>

        <div class="ficha__info">
          <span class="ficha__marca">${p.marca}</span>
          <h1 class="ficha__nombre">${p.nombre}</h1>
          <div class="ficha__rating">
            <span class="stars">${estrellas(p.rating)}</span> ${p.rating} · ${p.resenas} opiniones
          </div>

          <div class="ficha__precio">
            <b id="precioActual">${money(p.precio)}</b>
            ${p.antes > p.precio ? `<s>${money(p.antes)}</s>` : ''}
            ${p.descuento > 0 ? `<span class="ficha__dto">-${p.descuento}%</span>` : ''}
          </div>
          <p class="ficha__msi">${meses} pagos de ${money(msi)} sin intereses</p>
          <p class="ficha__stock" id="stockInfo"></p>

          <div class="ficha__bloque">
            <span class="ficha__etiqueta">Presentación</span>
            <div class="ficha__variantes" id="variantes"></div>
          </div>

          <div class="ficha__bloque">
            <span class="ficha__etiqueta">Cantidad</span>
            <div class="ficha__cantidad">
              <button type="button" id="menosCantidad" aria-label="Quitar una">−</button>
              <span id="cantidad">1</span>
              <button type="button" id="masCantidad" aria-label="Agregar una">+</button>
            </div>
          </div>

          <div class="ficha__acciones">
            <button class="boton boton--vino boton--bloque" id="agregarBtn">Agregar al carrito</button>
            <button class="boton boton--bloque" id="comprarBtn">Comprar ahora</button>
          </div>

          <ul class="ficha__bullets">
            <li>Envío gratis en pedidos desde $599 · llega en 24-48 h</li>
            <li>100 % original, con garantía de autenticidad</li>
            <li>Devolución sin costo dentro de 30 días</li>
          </ul>
        </div>
      </div>

      <section class="ficha__seccion">
        <h2 class="lbloque__titulo">Características</h2>
        <table class="ficha__tabla">
          <tr><th>Marca</th><td>${p.marca}</td></tr>
          <tr><th>Categoría</th><td>${p.cat_nombre}</td></tr>
          <tr><th>Familia olfativa</th><td>${p.familia || '—'}</td></tr>
          <tr><th>Concentración</th><td id="tablaConcentracion">—</td></tr>
          <tr><th>Contenido</th><td id="tablaVolumen">—</td></tr>
          <tr><th>SKU</th><td id="tablaSku">—</td></tr>
          <tr><th>Disponibilidad</th><td id="tablaStock">—</td></tr>
        </table>
      </section>

      <section class="ficha__seccion">
        <h2 class="lbloque__titulo">Descripción</h2>
        <p class="ficha__desc">${p.desc}</p>
      </section>

      <section class="ficha__seccion">
        <h2 class="lbloque__titulo">También te puede interesar</h2>
        <div class="ficha__relacionados" id="relacionados"></div>
      </section>`;

    pintarVariantes();
    pintarRelacionados();

    $('#agregarBtn').addEventListener('click', () => agregar(false));
    $('#comprarBtn').addEventListener('click', () => agregar(true));
    $('#menosCantidad').addEventListener('click', () => cambiarCantidad(-1));
    $('#masCantidad').addEventListener('click', () => cambiarCantidad(1));
  }

  function elegirVariante(indice) {
    variante = ficha.presentaciones[indice];
    cantidad = 1;
    pintarVariantes();
    pintarCantidad();
  }

  function pintarVariantes() {
    const caja = $('#variantes');

    caja.innerHTML = ficha.presentaciones.map((v, i) => `
      <button type="button" class="ficha__variante${v === variante ? ' is-activa' : ''}" data-i="${i}">
        <b>${v.volumen_ml} ml</b>
        <span>${v.concentracion || ''}</span>
        <small>${money(v.precio)}</small>
      </button>`).join('');

    caja.querySelectorAll('.ficha__variante').forEach((boton) => {
      boton.addEventListener('click', () => elegirVariante(Number(boton.dataset.i)));
    });

    $('#precioActual').textContent = money(variante.precio);
    $('#tablaConcentracion').textContent = variante.concentracion || '—';
    $('#tablaVolumen').textContent = variante.volumen_ml + ' ml';
    $('#tablaSku').textContent = variante.sku;
    $('#tablaStock').textContent = variante.stock > 0 ? variante.stock + ' piezas disponibles' : 'Sin existencias';
    $('#stockInfo').textContent = variante.stock > 0 ? 'Disponible · ' + variante.stock + ' piezas' : 'Agotado por ahora';
    $('#agregarBtn').disabled = variante.stock < 1;
    $('#comprarBtn').disabled = variante.stock < 1;
  }

  function pintarCantidad() {
    $('#cantidad').textContent = cantidad;
  }

  function pintarRelacionados() {
    const caja = $('#relacionados');
    if (!caja) return;

    if (!ficha.relacionados.length) {
      caja.innerHTML = '<p class="laviso">No hay más fragancias de esta categoría.</p>';
      return;
    }

    caja.innerHTML = ficha.relacionados.map((r) => `
      <a class="mini" href="producto.html?slug=${encodeURIComponent(r.slug)}">
        <div class="mini__foto">${frascoSVG(r, 150)}</div>
        <span class="mini__marca">${r.marca}</span>
        <span class="mini__nombre">${r.nombre}</span>
        <b class="mini__precio">${money(r.precio)}</b>
        ${r.descuento > 0 ? `<span class="mini__dto">-${r.descuento}%</span>` : ''}
      </a>`).join('');
  }

  /* ---------- Cantidad ----------
     La cantidad es un número entre 1 y el stock de la presentación elegida; se
     valida con assets/js/validacion.js (mismas reglas que api/carrito.php). */
  function revisarCantidad(valor) {
    const stock = variante ? Number(variante.stock) : 0;

    if (window.Validacion) return window.Validacion.cantidadValida(valor, stock);

    const numero = Math.floor(Number(valor));

    if (!Number.isFinite(numero) || numero < 1) {
      return { ok: false, valor: 1, error: 'La cantidad debe ser un número mayor a cero.' };
    }
    if (stock > 0 && numero > stock) {
      return { ok: false, valor: stock, error: 'Solo quedan ' + stock + ' piezas de esta presentación.' };
    }

    return { ok: true, valor: numero, error: '' };
  }

  function cambiarCantidad(delta) {
    const revision = revisarCantidad(cantidad + delta);

    if (!revision.ok) {
      if (revision.valor !== cantidad) {
        cantidad = revision.valor;
        pintarCantidad();
      }
      toast(revision.error);
      return;
    }

    cantidad = revision.valor;
    pintarCantidad();
  }

  /* ---------- Carrito ---------- */
  async function agregar(irAPagar) {
    if (!variante) return;

    /* La cantidad se valida antes de tocar el carrito */
    const revision = revisarCantidad(cantidad);

    if (!revision.ok || revision.valor < 1) {
      toast(revision.error);
      return;
    }

    cantidad = revision.valor;
    pintarCantidad();

    try {
      if (sesion.autenticado) {
        const respuesta = await window.TiendaAPI.carrito('agregar', {
          variante_id: variante.variante_id,
          cantidad: cantidad
        });
        sesion.piezas = respuesta.piezas;
      } else {
        sesion.piezas = guardarLocal(variante.variante_id, cantidad);
      }

      pintarCuenta();
      toast(cantidad + ' × ' + ficha.producto.nombre + ' se agregó al carrito');

      if (irAPagar) window.location.href = 'tienda.html?carrito=1&continuar=pagar';
    } catch (error) {
      toast(error.message);
    }
  }

  /* ---------- Arranque ---------- */
  async function iniciar() {
    const slug = new URLSearchParams(window.location.search).get('slug');

    if (!slug) {
      $('#ficha').innerHTML = '<p class="ficha__aviso">No elegiste ningún perfume. <a href="tienda.html">Ir a la tienda</a>.</p>';
      return;
    }

    try {
      ficha = await window.TiendaAPI.producto(slug);
    } catch (error) {
      $('#ficha').innerHTML = '<p class="ficha__aviso">' + error.message + '. <a href="tienda.html">Volver a la tienda</a>.</p>';
      return;
    }

    variante = ficha.presentaciones[0];

    try {
      const sesionApi = await window.TiendaAPI.verSesion();
      sesion.autenticado = sesionApi.autenticado === true;
      sesion.usuario = sesionApi.usuario;

      if (sesion.autenticado) {
        const carrito = await window.TiendaAPI.verCarrito();
        sesion.piezas = carrito.piezas;
      }
    } catch (error) {
      /* invitado o sin conexión: se usa el carrito local */
    }

    if (!sesion.piezas) sesion.piezas = carritoLocal().reduce((suma, i) => suma + i.qty, 0);

    pintarFicha();
    pintarCantidad();
    pintarCuenta();
  }

  iniciar();
})();
