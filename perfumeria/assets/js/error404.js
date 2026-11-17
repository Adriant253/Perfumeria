/* Página de error 404 (pages/404.php).
 *
 * Qué hace:
 *  - Muestra la dirección pedida y el método, pero SOLO si pasan la validación
 *    (el servidor ya los escapó; aquí se validan otra vez antes de pintarlos).
 *  - Buscador con validación: longitud, caracteres permitidos y rechazo de
 *    textos que parezcan código. Sin JavaScript el formulario igual funciona
 *    porque hace GET a la tienda.
 *  - Repinta las categorías con las REALES de api/tienda.php y, si el visitante
 *    escribió algo, muestra hasta 4 sugerencias del catálogo.
 *  - Cambia el enlace "Volver" según ?ruta=, aceptando únicamente rutas
 *    internas del sitio (nada de http:, //host, javascript: ni ../).
 *
 * Regla de oro: ningún dato (URL, ?cat=, ?ruta=, respuesta de la API, nombre
 * del usuario) se pinta sin pasar antes por validar*() y por textoSeguro().
 *
 * No usa api.js a propósito: la base del sitio llega calculada por el servidor
 * en window.ERROR404_BASE, así funciona aunque la URL pedida tenga varios
 * niveles y aunque la base de datos esté caída.
 */
(function (global) {
  'use strict';

  /* =====================================================================
     1) REGLAS DE VALIDACIÓN (única fuente de verdad)
     ===================================================================== */

  const REGLAS = {
    /* Búsqueda del visitante: de 2 a 60 caracteres, letras (con acentos),
       números, espacios y signos simples. Se rechaza todo lo demás. */
    buscar: {
      min: 2,
      max: 60,
      patron: /^[\p{L}\p{N}\p{M}\s.,'&@()_+\/-]+$/u,
      /* Cinturón extra: nada que se pueda leer como etiqueta o pseudo-protocolo */
      codigo: /(<[a-z!/]|javascript:|vbscript:|data:text|\bon[a-z]+\s*=)/i
    },
    ruta: { max: 120 },
    query: { max: 120, maxPares: 6, patron: /^[A-Za-z0-9._~%&=+@,:\/-]*$/ },
    texto: { corto: 20, medio: 40, nombre: 120 }
  };

  /* Páginas internas a las que se permite volver desde ?ruta= (lista blanca) */
  const PAGINAS_INTERNAS = [
    'index.html', 'tienda.html', 'producto.html',
    'login.html', 'registro.html', 'recuperar.html', '404.php'
  ];

  /* Parámetros aceptados en la ruta de regreso (lista blanca de claves) */
  const CLAVES_QUERY = ['cat', 'buscar', 'slug', 'volver', 'continuar', 'carrito', 'producto'];

  /* Categorías de respaldo: los mismos slugs de la tabla `categorias` */
  const CATEGORIAS_BASE = ['hombre', 'mujer', 'nino', 'nina', 'mascotas'];

  const METODOS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

  const COLOR_VINO = '#7a1533';
  const COLOR_DORADO = '#d8b26a';

  const PATRON = {
    id: /^[a-z0-9-]{1,20}$/,
    slug: /^[a-z0-9-]{1,80}$/,
    color: /^#[0-9a-f]{6}$/i,
    base: /^[A-Za-z0-9/_.-]{0,200}$/,
    texto: /^[\s\S]{1,80}$/
  };

  /* =====================================================================
     2) UTILIDADES (limpieza, escapado y normalización)
     ===================================================================== */

  /* Quita caracteres de control, colapsa espacios y recorta al máximo pedido */
  function limpiar(valor, max) {
    const texto = String(valor === null || valor === undefined ? '' : valor)
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return texto.slice(0, max > 0 ? max : texto.length);
  }

  /* Texto listo para meter en una plantilla HTML */
  function textoSeguro(valor) {
    return String(valor === null || valor === undefined ? '' : valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* Minúsculas y sin acentos: para comparar "Vainilla" con "vainilla" */
  function normalizar(texto) {
    return String(texto === null || texto === undefined ? '' : texto)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function colorSeguro(valor, porDefecto) {
    const color = String(valor || '').trim();

    return PATRON.color.test(color) ? color.toLowerCase() : porDefecto;
  }

  /* =====================================================================
     3) BASE DEL SITIO Y ACCESO AL API
     ===================================================================== */

  const estado = {
    catalogo: { ok: false, categorias: [], productos: [], envioGratis: 0 },
    categoriasValidas: new Set(CATEGORIAS_BASE)
  };

  /* Base calculada por el servidor, validada antes de usarse */
  function base() {
    const datos = global.ERROR404_BASE;
    const raiz = (datos && typeof datos.raiz === 'string' && PATRON.base.test(datos.raiz)) ? datos.raiz : '';
    const pagina = (datos && typeof datos.pagina === 'string' && PATRON.base.test(datos.pagina)) ? datos.pagina : '/pages';

    return { raiz: raiz, pagina: pagina };
  }

  /* URL absoluta de un archivo de /api (la base la puso el servidor) */
  function urlApi(archivo) {
    return base().raiz + '/api/' + String(archivo).replace(/[^a-z0-9._-]/gi, '');
  }

  /* GET JSON con validación de la respuesta (si no es JSON, se trata como error) */
  async function pedirJson(url) {
    if (!PATRON.base.test(url)) {
      throw new Error('La ruta del API no es válida');
    }

    const respuesta = await fetch(url, { headers: { Accept: 'application/json' } });

    if (!respuesta.ok) {
      throw new Error('El servidor respondió con HTTP ' + respuesta.status);
    }

    const datos = await respuesta.json();

    if (!datos || typeof datos !== 'object') {
      throw new Error('La respuesta del servidor no es válida');
    }

    return datos;
  }

  /* =====================================================================
     4) VALIDACIÓN DE DATOS
     ===================================================================== */
  /* --- Búsqueda del visitante: pasa o no pasa, con el motivo --- */
  function validarBusqueda(valor) {
    const limpio = limpiar(valor, REGLAS.buscar.max + 1);   // +1 para detectar el exceso

    if (limpio === '') {
      return { ok: false, valor: '', error: 'Escribe qué buscas: un perfume, una marca o una nota olfativa.' };
    }
    if (limpio.length < REGLAS.buscar.min) {
      return { ok: false, valor: limpio, error: 'Escribe al menos 2 caracteres para buscar.' };
    }
    if (limpio.length > REGLAS.buscar.max) {
      return { ok: false, valor: limpio.slice(0, REGLAS.buscar.max), error: 'La búsqueda es muy larga: el máximo son 60 caracteres.' };
    }
    if (!REGLAS.buscar.patron.test(limpio)) {
      return { ok: false, valor: limpio, error: "Usa solo letras, números, espacios y signos simples ( . , ' & @ ( ) _ + - / )." };
    }
    if (REGLAS.buscar.codigo.test(limpio)) {
      return { ok: false, valor: limpio, error: 'Ese texto no se puede buscar: quita los símbolos de programación.' };
    }

    return { ok: true, valor: limpio, error: '' };
  }

  /* --- Categorías: ¿el slug existe de verdad? --- */
  function categoriaValida(valor) {
    const id = limpiar(valor, REGLAS.texto.corto).toLowerCase();

    return PATRON.id.test(id) && estado.categoriasValidas.has(id);
  }

  function nombreCategoria(valor) {
    const id = limpiar(valor, REGLAS.texto.corto).toLowerCase();
    const encontrada = estado.catalogo.categorias.filter((c) => c.id === id)[0];

    return encontrada ? encontrada.nombre : id;
  }

  /* --- Query de ?ruta=: claves en lista blanca y valores coherentes --- */
  function validarQuery(query) {
    const texto = limpiar(query, REGLAS.query.max + 1);

    if (texto === '' || texto.length > REGLAS.query.max || !REGLAS.query.patron.test(texto)) {
      return { ok: false };
    }

    const pares = texto.split('&').filter(Boolean);

    if (pares.length === 0 || pares.length > REGLAS.query.maxPares) {
      return { ok: false };
    }

    try {
      for (const par of pares) {
        const partes = par.split('=');
        const clave = decodeURIComponent(partes[0] || '').toLowerCase();
        const valor = decodeURIComponent(partes[1] || '');

        if (CLAVES_QUERY.indexOf(clave) === -1 || valor.length > 80) {
          return { ok: false };
        }
        if (clave === 'cat' && !categoriaValida(valor)) {
          return { ok: false };
        }
        if ((clave === 'slug' || clave === 'producto') && !PATRON.slug.test(valor.toLowerCase())) {
          return { ok: false };
        }
      }
    } catch (error) {
      return { ok: false };   // percent-encoding roto
    }

    return { ok: true };
  }

  /* --- Ruta de regreso (?ruta=): solo páginas internas del sitio --- */
  function validarRutaOrigen(valor) {
    const crudo = limpiar(valor, REGLAS.ruta.max);

    if (crudo === '') return { ok: false, valor: '' };
    if (/^[a-z][a-z0-9+.-]*:/i.test(crudo)) return { ok: false, valor: '' };   // http:, javascript:, mailto:…
    if (/^\/\//.test(crudo) || crudo.indexOf('\\') !== -1) return { ok: false, valor: '' };
    if (/[<>"'`\s]/.test(crudo)) return { ok: false, valor: '' };

    const partes = crudo.split('?');
    const archivo = partes[0]
      .replace(/^\.\//, '')
      .replace(/^\.\.\//, '')
      .replace(/^pages\//i, '')
      .toLowerCase();

    if (PAGINAS_INTERNAS.indexOf(archivo) === -1) return { ok: false, valor: '' };

    const query = (partes[1] || '').split('#')[0];

    if (query !== '' && !validarQuery(query).ok) return { ok: false, valor: '' };

    const destino = (archivo === 'index.html' ? base().raiz : base().pagina) + '/' + archivo;

    return { ok: true, valor: query === '' ? destino : destino + '?' + query };
  }

  /* --- Respuesta de api/tienda.php: se valida campo por campo --- */
  function validarCatalogo(datos) {
    const salida = { ok: false, categorias: [], productos: [], envioGratis: 0 };

    if (!datos || typeof datos !== 'object' || datos.ok !== true) {
      return salida;
    }

    /* Categorías: id, nombre y color comprobados uno por uno. Los datos
       inválidos se descartan en silencio en vez de romper la página. */
    const vistas = new Set();

    if (Array.isArray(datos.categorias)) {
      datos.categorias.slice(0, 24).forEach((c) => {
        if (!c || typeof c !== 'object') return;

        const id = limpiar(c.id, REGLAS.texto.corto).toLowerCase();
        const nombre = limpiar(c.nombre, REGLAS.texto.medio);

        if (!PATRON.id.test(id) || nombre === '' || vistas.has(id)) return;

        vistas.add(id);
        salida.categorias.push({
          id: id,
          nombre: nombre,
          nombreSeguro: textoSeguro(nombre),
          color: colorSeguro(c.color, COLOR_VINO)
        });
      });
    }

    /* Catálogo: solo partidas completas y con precio utilizable */
    if (Array.isArray(datos.productos)) {
      datos.productos.slice(0, 400).forEach((p) => {
        if (!p || typeof p !== 'object') return;

        const slug = limpiar(p.slug, 80).toLowerCase();
        const nombre = limpiar(p.nombre, REGLAS.texto.nombre);
        const marca = limpiar(p.marca, REGLAS.texto.medio);
        const precio = Number(p.precio);

        if (!PATRON.slug.test(slug) || nombre === '' || !Number.isFinite(precio) || precio <= 0) return;

        salida.productos.push({
          slug: slug,
          /* En crudo (para el buscador y el SVG) y escapo aparte (para el HTML) */
          nombre: nombre,
          nombreSeguro: textoSeguro(nombre),
          marca: marca,
          marcaSeguro: textoSeguro(marca),
          precio: precio,
          c1: colorSeguro(p.c1, COLOR_VINO),
          c2: colorSeguro(p.c2, COLOR_DORADO),
          /* Texto de búsqueda: en crudo, en minúsculas y sin acentos */
          texto: normalizar(nombre + ' ' + marca + ' ' + limpiar(p.desc, 200))
        });
      });
    }

    /* Configuración: interesa el mínimo de envío gratis */
    const config = (datos.configuracion && typeof datos.configuracion === 'object') ? datos.configuracion : {};
    const envio = Number(config.envio_gratis_desde);

    salida.envioGratis = Number.isFinite(envio) && envio > 0 ? envio : 0;
    salida.ok = salida.categorias.length > 0 || salida.productos.length > 0;

    /* Lo validado manda: las categorías reales sustituyen al respaldo */
    if (salida.categorias.length) {
      estado.categoriasValidas = new Set(salida.categorias.map((c) => c.id));
    }

    return salida;
  }

  /* --- Sugerencias: hasta 4 productos del catálogo ya validado --- */
  function sugerencias(productos, texto) {
    const revision = validarBusqueda(texto);

    if (!revision.ok || !Array.isArray(productos)) {
      return [];
    }

    const buscado = normalizar(revision.valor);
    const palabras = buscado.split(' ').filter((p) => p.length > 1);

    return productos.filter((p) => {
      if (String(p.texto).indexOf(buscado) !== -1) return true;

      return palabras.length > 0 && palabras.every((palabra) => String(p.texto).indexOf(palabra) !== -1);
    }).slice(0, 4);
  }

  /* =====================================================================
     5) PINTADO (ningún dato se pinta sin validar y escapar antes)
     ===================================================================== */

  /* Frasco decorativo en SVG, igual que en landing.js y producto.js.
     Recibe valores en crudo y los limpia aquí dentro. */
  function frascoSVG(p, alto) {
    const id = 'e404' + Math.random().toString(36).slice(2, 8);
    const marca = textoSeguro(limpiar(p.marca, REGLAS.texto.medio)).slice(0, 11);
    const c1 = colorSeguro(p.c1, COLOR_VINO);
    const c2 = colorSeguro(p.c2, COLOR_DORADO);
    const altura = Number(alto);

    return `
<svg viewBox="0 0 120 200" height="${Number.isFinite(altura) && altura > 0 ? altura : 150}" role="img" aria-label="${marca}">
  <defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c2}"/>
      <stop offset="100%" stop-color="${c1}"/>
    </linearGradient>
  </defs>
  <rect x="50" y="8" width="20" height="22" rx="3" fill="${c1}"/>
  <rect x="46" y="28" width="28" height="14" rx="3" fill="#d9c7a8"/>
  <rect x="52" y="40" width="16" height="14" fill="#b9a684"/>
  <rect x="22" y="52" width="76" height="132" rx="16" fill="url(#${id})"/>
  <rect x="22" y="52" width="76" height="132" rx="16" fill="none" stroke="rgba(0,0,0,.15)" stroke-width="2"/>
  <rect x="32" y="66" width="14" height="100" rx="7" fill="rgba(255,255,255,.35)"/>
  <rect x="34" y="112" width="52" height="42" rx="6" fill="rgba(255,255,255,.9)"/>
  <text x="60" y="132" text-anchor="middle" font-family="Georgia,serif" font-size="13" fill="${c1}">${marca}</text>
  <text x="60" y="146" text-anchor="middle" font-family="Arial" font-size="8" fill="#5a6474" letter-spacing="1">PARFUM</text>
</svg>`;
  }

  /* Aviso de la página: siempre con textContent, nunca como HTML */
  function aviso(mensaje, esError) {
    const caja = document.getElementById('e404Aviso');
    if (!caja) return;

    caja.textContent = limpiar(mensaje, 240);
    caja.className = 'auth__aviso ' + (esError ? 'auth__aviso--error' : 'auth__aviso--ok');
    caja.hidden = false;
  }

  function ocultarAviso() {
    const caja = document.getElementById('e404Aviso');
    if (!caja) return;

    caja.hidden = true;
    caja.textContent = '';
  }

  /* Aviso flotante, con el mismo comportamiento que en el resto del sitio */
  let toastTimer = null;
  function toast(mensaje) {
    const caja = document.getElementById('toast');
    if (!caja) return;

    caja.textContent = limpiar(mensaje, 160);
    caja.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => caja.classList.remove('is-show'), 2600);
  }

  /* Parámetros de la URL: se leen limpios y acotados, nunca en crudo */
  function leerParams() {
    const busqueda = global.location ? String(global.location.search || '') : '';

    try {
      return new URLSearchParams(busqueda);
    } catch (error) {
      return new URLSearchParams('');
    }
  }

  function parametro(params, nombre, max) {
    if (!params || typeof params.get !== 'function') return null;

    const valor = params.get(nombre);

    return valor === null ? null : limpiar(valor, max > 0 ? max : REGLAS.ruta.max);
  }

  /* 5.1 Dirección pedida + qué traía la URL rota (?cat=, ?buscar=) */
  function pintarRutaPedida(params) {
    const caja = document.getElementById('e404Ruta');
    if (!caja) return;

    const metodoCrudo = limpiar(caja.dataset.metodo || '', 10).toUpperCase();
    const metodo = METODOS.indexOf(metodoCrudo) !== -1 ? metodoCrudo : 'GET';
    const pedida = limpiar(caja.dataset.ruta || '', REGLAS.ruta.max);

    /* El valor que dejó el servidor se valida otra vez y se escribe como texto */
    const etiqueta = document.createElement('b');
    etiqueta.textContent = pedida !== '' ? pedida : 'no disponible';

    caja.textContent = 'Dirección solicitada (' + metodo + ') ';
    caja.appendChild(etiqueta);

    const cat = parametro(params, 'cat', REGLAS.texto.corto);
    const buscar = parametro(params, 'buscar', REGLAS.buscar.max);

    if (cat !== null && cat !== '') {
      if (categoriaValida(cat)) {
        aviso('La categoría «' + nombreCategoria(cat) + '» sí existe: esa dirección no. Prueba con el mosaico de abajo.', false);
      } else {
        aviso('La categoría «' + cat + '» no existe en la tienda.', true);
      }
      return;
    }

    if (buscar !== null && buscar !== '') {
      const revision = validarBusqueda(buscar);

      if (revision.ok) {
        aviso('Buscabas «' + revision.valor + '». Vuelve a intentarlo en el buscador de abajo.', false);
      } else {
        aviso(revision.error, true);
      }
      return;
    }

    /* ?ruta= solo se acepta si es una página interna (ver validarRutaOrigen) */
    const ruta = parametro(params, 'ruta', REGLAS.ruta.max);

    if (ruta !== null && ruta !== '' && !validarRutaOrigen(ruta).ok) {
      aviso('El enlace de regreso no apuntaba a una página del sitio: te dejamos en la tienda.', true);
    }
  }

  /* 5.2 Botón "Volver": solo acepta rutas internas del sitio */
  function pintarOrigen(params) {
    const boton = document.getElementById('e404Volver');
    if (!boton) return;

    const ruta = parametro(params, 'ruta', REGLAS.ruta.max);
    if (ruta === null || ruta === '') return;

    const revision = validarRutaOrigen(ruta);
    if (!revision.ok) return;   // el aviso lo dio pintarRutaPedida

    boton.href = revision.valor;
    boton.textContent = 'Volver a donde estaba';
  }

  /* 5.3 Aviso de envío gratis con el valor validado de `configuracion` */
  function pintarEnvio(monto) {
    const caja = document.getElementById('envioGratisTopbar');
    const cantidad = Number(monto);

    if (!caja || !Number.isFinite(cantidad) || cantidad <= 0) return;

    caja.textContent = 'Envío gratis en compras mayores a $' + cantidad.toLocaleString('es-MX');
  }

  /* 5.4 Mosaico de categorías con las reales (sustituye al respaldo del HTML) */
  function pintarCategorias(categorias) {
    const caja = document.getElementById('e404Categorias');
    if (!caja || !Array.isArray(categorias) || !categorias.length) return;

    const sitio = base();

    caja.innerHTML = categorias.map((c) => {
      if (!PATRON.id.test(c.id)) return '';   // por si el dato cambió de forma

      return '<a class="e404__cat" href="' + sitio.pagina + '/tienda.html?cat=' + encodeURIComponent(c.id) + '">'
        + c.nombreSeguro + '</a>';
    }).join('');
  }

  /* 5.5 Sugerencias: solo productos que ya pasaron la validación */
  function pintarSugerencias(lista) {
    const caja = document.getElementById('e404Sugerencias');
    const seccion = document.getElementById('e404SugerenciasCaja');

    if (!caja || !seccion) return;

    if (!Array.isArray(lista) || !lista.length) {
      caja.innerHTML = '';
      seccion.hidden = true;
      return;
    }

    const sitio = base();

    caja.innerHTML = lista.map((p) => {
      if (!PATRON.slug.test(p.slug)) return '';   // último filtro antes del enlace

      return `
      <a class="mini" href="${sitio.pagina}/producto.html?slug=${encodeURIComponent(p.slug)}">
        <div class="mini__foto">${frascoSVG({ marca: p.marca, c1: p.c1, c2: p.c2 }, 150)}</div>
        <span class="mini__marca">${p.marcaSeguro}</span>
        <span class="mini__nombre">${p.nombreSeguro}</span>
        <b class="mini__precio">${'$' + p.precio.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
      </a>`;
    }).join('');

    seccion.hidden = false;
  }

  /* 5.6 Cabecera: el nombre solo se pinta si la respuesta es válida */
  function pintarSesion(datos) {
    const zona = document.getElementById('zonaSesion');
    if (!zona) return;
    if (!datos || datos.ok !== true || datos.autenticado !== true) return;

    const usuario = (datos.usuario && typeof datos.usuario === 'object') ? datos.usuario : null;
    const nombre = usuario ? limpiar(usuario.nombre, 60) : '';

    if (nombre === '') return;   // sin nombre válido se queda el enlace de acceso

    const enlace = document.createElement('a');
    enlace.className = 'lhead__entrar';
    enlace.href = base().pagina + '/tienda.html';
    enlace.textContent = 'Hola, ' + nombre;   // textContent: nunca se interpreta HTML

    zona.innerHTML = '';
    zona.appendChild(enlace);
  }

  /* =====================================================================
     6) EVENTOS Y ARRANQUE
     ===================================================================== */
  function bind() {
    const formulario = document.getElementById('e404Buscador');
    const campo = document.getElementById('e404Buscar');

    if (formulario && campo) {
      let temporizador = null;

      formulario.addEventListener('submit', (evento) => {
        evento.preventDefault();

        const revision = validarBusqueda(campo.value);

        if (!revision.ok) {
          aviso(revision.error, true);
          campo.value = revision.valor;
          campo.focus();
          return;
        }

        /* La tienda espera ?buscar=: se manda el valor ya validado */
        global.location.href = base().pagina + '/tienda.html?buscar=' + encodeURIComponent(revision.valor);
      });

      campo.addEventListener('input', () => {
        ocultarAviso();
        clearTimeout(temporizador);

        temporizador = setTimeout(() => {
          pintarSugerencias(sugerencias(estado.catalogo.productos, campo.value));
        }, 220);
      });
    }

    document.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape') ocultarAviso();
    });
  }

  async function iniciar() {
    const params = leerParams();

    bind();
    pintarRutaPedida(params);
    pintarOrigen(params);

    /* Catálogo real: si la API falla, la página se queda con el respaldo HTML */
    try {
      estado.catalogo = validarCatalogo(await pedirJson(urlApi('tienda.php')));

      pintarCategorias(estado.catalogo.categorias);
      pintarEnvio(estado.catalogo.envioGratis);

      const buscado = parametro(params, 'buscar', REGLAS.buscar.max);
      const revision = buscado === null ? { ok: false } : validarBusqueda(buscado);

      if (revision.ok) {
        const campo = document.getElementById('e404Buscar');
        if (campo) campo.value = revision.valor;

        pintarSugerencias(sugerencias(estado.catalogo.productos, revision.valor));
      }
    } catch (error) {
      toast('Catálogo no disponible en este momento');
    }

    /* Sesión: solo se pinta si la respuesta pasa la validación */
    try {
      pintarSesion(await pedirJson(urlApi('sesion.php')));
    } catch (error) {
      /* sin sesión (o sin conexión) se queda el enlace "Iniciar sesión" */
    }
  }

  /* API pública: permite probar la validación y reutilizarla en otras vistas */
  global.Error404 = {
    reglas: REGLAS,
    limpiar: limpiar,
    textoSeguro: textoSeguro,
    normalizar: normalizar,
    validarBusqueda: validarBusqueda,
    validarCategoria: categoriaValida,
    validarQuery: validarQuery,
    validarRutaOrigen: validarRutaOrigen,
    validarCatalogo: validarCatalogo,
    sugerencias: sugerencias,
    base: base,
    estado: function () { return estado; },
    iniciar: iniciar
  };

  /* Arranca solo si hay DOM: así el archivo se puede cargar para pruebas */
  if (typeof document !== 'undefined' && typeof document.getElementById === 'function') {
    iniciar();
  }
})(typeof window !== 'undefined' ? window : globalThis);
