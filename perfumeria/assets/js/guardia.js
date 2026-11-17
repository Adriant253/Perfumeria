/* Protección de rutas del lado del navegador (assets/js/guardia.js).
 *
 * Se apoya en api/sesion.php para saber quién está dentro y con qué tipo de
 * usuario (`rol`). Si la ruta exige sesión, manda a login.html recordando la
 * página (?volver=...); si exige un rol concreto (por ejemplo admin) y la
 * cuenta no lo tiene, no deja ver el contenido y devuelve a la tienda.
 *
 * La seguridad real vive en PHP (exigir_usuario() y exigir_rol() en
 * api/conexion.php): este guardia solo evita que se pinte una pantalla que la
 * API va a rechazar igualmente con 401 o 403.
 *
 * Uso en una página protegida:
 *   const revision = await window.Guardia.exigir('admin');
 *   if (revision.ok) { ...pintar la página... }
 */
(function (global) {
  'use strict';

  /* Página actual con su query string, para volver después del login */
  function rutaActual() {
    return (window.location.pathname.split('/').pop() || 'index.html') + window.location.search;
  }

  function loginConVuelta() {
    return 'login.html?volver=' + encodeURIComponent(rutaActual());
  }

  function normalizar(roles) {
    if (!roles) return [];

    return (Array.isArray(roles) ? roles : [roles])
      .map(function (rol) { return String(rol).toLowerCase(); });
  }

  /* Consulta la sesión y compara el rol. No redirige: solo informa. */
  async function verificar(roles) {
    const api = global.TiendaAPI;
    const permitidos = normalizar(roles);

    if (!api) return { ok: false, motivo: 'sin-api' };

    let datos;

    try {
      datos = await api.verSesion();
    } catch (error) {
      return { ok: false, motivo: 'sin-conexion', error: error };
    }

    if (datos.autenticado !== true) {
      return { ok: false, motivo: 'sin-sesion' };
    }

    const usuario = datos.usuario || {};
    const rol = String(usuario.rol || '').toLowerCase();

    if (permitidos.length && permitidos.indexOf(rol) === -1) {
      return { ok: false, motivo: 'sin-permiso', usuario: usuario, sesion: datos };
    }

    return { ok: true, usuario: usuario, sesion: datos };
  }

  /* Redirige cuando la ruta no está permitida y devuelve la revisión. */
  async function exigir(roles) {
    const revision = await verificar(roles);

    if (revision.ok) return revision;

    if (revision.motivo === 'sin-permiso') {
      const api = global.TiendaAPI;
      const raiz = api && api.raiz ? api.raiz : '../';

      /* Se deja ver el aviso un momento y se sale de la página protegida */
      window.setTimeout(function () {
        window.location.replace(raiz + 'pages/tienda.html');
      }, 2200);

      return revision;
    }

    window.location.replace(loginConVuelta());

    return revision;
  }

  global.Guardia = {
    verificar: verificar,
    exigir: exigir,
    rutaActual: rutaActual,
    loginConVuelta: loginConVuelta
  };
})(typeof window !== 'undefined' ? window : globalThis);
