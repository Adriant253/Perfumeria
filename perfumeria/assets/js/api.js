/* Puente entre la tienda y la base de datos MySQL.
 *
 * Llama a api/tienda.php y vuelca la respuesta en las constantes globales que
 * usa app.js (CATEGORIES, BANNERS, PRODUCTS y CONFIG), con las mismas claves
 * que ya tenían en data.js: así el resto del código no cambia.
 *
 * No toca el DOM ni depende de ninguna librería.
 * Si la API no responde, app.js sigue funcionando con los datos de data.js.
 */
(function (global) {
  'use strict';

  /* Todas las páginas PHP viven en /api. Las vistas dentro de /pages necesitan
     "../" para llegar a la raíz del proyecto: así el mismo script funciona
     tanto desde index.html como desde pages/*.html. */
  const RAIZ = /\/pages\//.test(window.location.pathname) ? '../' : '';
  const rutaApi = (archivo) => RAIZ + 'api/' + archivo;
  const RUTA = rutaApi('tienda.php');

  const estado = { conectado: false, generadoEn: null, error: null };

  /* ---------- Petición ---------- */
  async function pedir() {
    const respuesta = await fetch(RUTA, { headers: { Accept: 'application/json' } });

    if (!respuesta.ok) {
      throw new Error('La API respondió con HTTP ' + respuesta.status);
    }

    const datos = await respuesta.json();

    if (!datos.ok) {
      throw new Error(datos.error || 'La API devolvió una respuesta inválida');
    }

    return datos;
  }

  /* ---------- Conversión de lo que devuelve MySQL ---------- */
  function categoriaDesdeAPI(c) {
    return { id: c.id, nombre: c.nombre, color: c.color };
  }

  function bannerDesdeAPI(b) {
    return { titulo: b.titulo, sub: b.sub, cta: b.cta, cat: b.cat, bg: b.bg, badge: b.badge };
  }

  function productoDesdeAPI(p) {
    return {
      id: Number(p.id),
      slug: p.slug,
      sku: p.sku,
      nombre: p.nombre,
      marca: p.marca,
      cat: p.cat,
      precio: Number(p.precio),
      antes: Number(p.antes),
      rating: Number(p.rating),
      reviews: Number(p.reviews),
      stock: Number(p.stock),
      volumen_ml: Number(p.volumen_ml),
      concentracion: p.concentracion,
      familia: p.familia,
      c1: p.c1,
      c2: p.c2,
      desc: p.desc
    };
  }

  /* ---------- Volcado en las constantes globales de data.js ---------- */
  function aplicar(datos) {
    if (Array.isArray(datos.categorias) && datos.categorias.length) {
      CATEGORIES = datos.categorias.map(categoriaDesdeAPI);
    }

    if (Array.isArray(datos.banners) && datos.banners.length) {
      BANNERS = datos.banners.map(bannerDesdeAPI);
    }

    if (Array.isArray(datos.productos) && datos.productos.length) {
      PRODUCTS = datos.productos.map(productoDesdeAPI);
    }

    if (datos.configuracion) {
      CONFIG = Object.assign({}, CONFIG, datos.configuracion);
    }

    estado.conectado = true;
    estado.generadoEn = datos.generado_en || null;
    estado.error = null;

    return datos;
  }

  /* ---------- Peticiones genéricas (JSON) ---------- */
  async function enviar(ruta, metodo, datos) {
    const opciones = { method: metodo, headers: { Accept: 'application/json' } };

    if (datos !== undefined) {
      opciones.headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify(datos);
    }

    const respuesta = await fetch(ruta, opciones);
    let cuerpo = null;

    try {
      cuerpo = await respuesta.json();
    } catch (e) {
      cuerpo = null;
    }

    if (!respuesta.ok || !cuerpo || cuerpo.ok !== true) {
      const mensaje = (cuerpo && cuerpo.error) ? cuerpo.error : 'Error de conexión (HTTP ' + respuesta.status + ')';
      throw new Error(mensaje);
    }

    return cuerpo;
  }

  const SESION = rutaApi('sesion.php');
  const CARRITO = rutaApi('carrito.php');
  const PEDIDOS = rutaApi('pedidos.php');
  const PERFIL = rutaApi('perfil.php');
  const ADMIN = rutaApi('admin.php');

  /* ---------- Cuenta (usuarios + sesiones_usuario) ---------- */
  const verSesion = () => enviar(SESION, 'GET');
  const entrar = (email, password) => enviar(SESION + '?accion=login', 'POST', { email, password });
  const registrar = (datos) => enviar(SESION + '?accion=registro', 'POST', datos);
  const salir = () => enviar(SESION + '?accion=logout', 'POST', {});

  /* ---------- Multisesiones: ver y cerrar dispositivos ---------- */
  const verSesiones = () => enviar(SESION + '?accion=sesiones', 'GET');
  const cerrarSesionRemota = (id) => enviar(SESION + '?accion=cerrar-sesion', 'POST', { id });
  const cerrarOtrasSesiones = () => enviar(SESION + '?accion=cerrar-otras', 'POST', {});

  /* ---------- Tipo de usuario: a dónde entra cada quien ---------- */
  function destinoPorRol(usuario, defecto) {
    const rol = String((usuario && usuario.rol) || '').toLowerCase();

    return rol === 'admin' ? RAIZ + 'pages/admin.html' : (defecto || '');
  }

  /* ---------- Panel de administración (solo rol admin) ---------- */
  const admin = () => enviar(ADMIN, 'GET');
  const adminAccion = (accion, datos) => enviar(ADMIN + '?accion=' + encodeURIComponent(accion), 'POST', datos || {});

  /* ---------- Olvidé mi contraseña (enlace con token de un solo uso) ---------- */
  const recuperar = (email) => enviar(SESION + '?accion=recuperar', 'POST', { email });
  const revisarEnlace = (token) => enviar(SESION + '?accion=token&token=' + encodeURIComponent(token), 'GET');
  const restablecer = (token, password, repetir) => enviar(SESION + '?accion=restablecer', 'POST', { token, password, repetir });

  /* ---------- Carrito en MySQL (carritos + carrito_items) ---------- */
  const verCarrito = () => enviar(CARRITO, 'GET');
  const carrito = (accion, datos) => enviar(CARRITO + '?accion=' + encodeURIComponent(accion), 'POST', datos || {});

  /* ---------- Perfil: datos, tarjetas, direcciones y contraseña ---------- */
  const verPerfil = () => enviar(PERFIL, 'GET');
  const perfil = (accion, datos) => enviar(PERFIL + '?accion=' + encodeURIComponent(accion), 'POST', datos || {});

  /* ---------- Ficha de producto (pages/producto.html) ---------- */
  const producto = (slug) => enviar(rutaApi('producto.php') + '?slug=' + encodeURIComponent(slug), 'GET');

  /* ---------- Pedidos ---------- */
  const confirmarPedido = (datos) => enviar(PEDIDOS, 'POST', datos);
  const misPedidos = () => enviar(PEDIDOS, 'GET');

  /* ---------- API pública ---------- */
  async function conectar() {
    try {
      return aplicar(await pedir());
    } catch (error) {
      estado.conectado = false;
      estado.error = error.message;
      throw error;
    }
  }

  /* Devuelve la ruta pedida en ?volver= (solo rutas del propio sitio) */
  function volverDestino(defecto) {
    let volver = '';

    try {
      volver = new URLSearchParams(window.location.search).get('volver') || '';
    } catch (e) {
      volver = '';
    }

    if (!volver || /^[a-z][a-z0-9+.-]*:/i.test(volver) || volver.indexOf('//') === 0) {
      return defecto || '';
    }

    return volver;
  }

  global.TiendaAPI = {
    RUTA: RUTA,
    raiz: RAIZ,
    ruta: rutaApi,
    volver: volverDestino,
    conectar: conectar,
    pedir: pedir,
    aplicar: aplicar,
    estado: function () {
      return Object.assign({}, estado);
    },
    enviar: enviar,
    verSesion: verSesion,
    entrar: entrar,
    registrar: registrar,
    salir: salir,
    verSesiones: verSesiones,
    cerrarSesionRemota: cerrarSesionRemota,
    cerrarOtrasSesiones: cerrarOtrasSesiones,
    destinoPorRol: destinoPorRol,
    admin: admin,
    adminAccion: adminAccion,
    recuperar: recuperar,
    revisarEnlace: revisarEnlace,
    restablecer: restablecer,
    verCarrito: verCarrito,
    carrito: carrito,
    verPerfil: verPerfil,
    perfil: perfil,
    confirmarPedido: confirmarPedido,
    misPedidos: misPedidos,
    producto: producto
  };
})(typeof window !== 'undefined' ? window : globalThis);
