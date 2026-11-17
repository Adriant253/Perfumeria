/* Iniciar sesión (pages/login.html).
 *
 * Solo el formulario de acceso: para crear cuenta hay un botón aparte que lleva
 * a pages/registro.html. Respeta ?volver= para terminar en la página en la que
 * estaba el usuario (por ejemplo la tienda con un filtro puesto).
 */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  /* ?volver= solo se usa si viene; si no, cada tipo de usuario tiene su casa */
  const volverAqui = (window.TiendaAPI && window.TiendaAPI.volver)
    ? window.TiendaAPI.volver('')
    : '';
  const destino = volverAqui || 'tienda.html';

  function luegoDeEntrar(usuario) {
    const rol = String((usuario && usuario.rol) || '').toLowerCase();
    const api = window.TiendaAPI;

    /* Si venía de una pantalla de administración pero no es admin, no vuelve ahí */
    if (volverAqui && /^admin\.html/i.test(volverAqui) && rol !== 'admin') {
      return (api && api.destinoPorRol) ? api.destinoPorRol(usuario, 'tienda.html') : 'tienda.html';
    }

    if (volverAqui) return volverAqui;

    return (api && api.destinoPorRol) ? api.destinoPorRol(usuario, destino) : destino;
  }

  function aviso(mensaje, esError) {
    const caja = $('#authAviso');
    if (!caja) return;
    caja.textContent = mensaje;
    caja.className = 'auth__aviso ' + (esError ? 'auth__aviso--error' : 'auth__aviso--ok');
    caja.hidden = false;
  }

  /* El aviso de envío gratis de la barra del encabezado sale de `configuracion` */
  async function pintarEnvio() {
    try {
      const datos = await window.TiendaAPI.pedir();
      const envio = Number((datos.configuracion || {}).envio_gratis_desde);
      const barra = $('#envioGratisTopbar');

      if (barra && envio > 0) {
        barra.textContent = 'Envío gratis en compras mayores a $' + envio.toLocaleString('es-MX');
      }
    } catch (error) {
      /* sin conexión se queda el texto fijo del HTML */
    }
  }

  async function enviar(evento) {
    evento.preventDefault();

    const formulario = evento.target;

    /* Validación de entrada antes de llamar al API (espejo de api/conexion.php) */
    if (window.Validacion) {
      const revision = window.Validacion.validarFormulario(formulario, {
        email: 'email',
        password: 'password'
      });

      if (!revision.ok) {
        aviso(revision.errores[0], true);
        return;
      }
    }

    const datos = Object.fromEntries(new FormData(formulario).entries());
    const boton = $('#loginEntrar');
    boton.disabled = true;

    try {
      const respuesta = await window.TiendaAPI.entrar(datos.email, datos.password);

      aviso('Bienvenido, ' + respuesta.usuario.nombre + '. Entrando…', false);
      window.location.href = luegoDeEntrar(respuesta.usuario);
    } catch (error) {
      aviso(error.message, true);
      boton.disabled = false;
    }
  }

  /* ---------- Recuperar contraseña ----------
     El aviso es siempre el mismo aunque el correo no tenga cuenta: así nadie
     puede averiguar qué correos están registrados. */
  function abrirRecuperar(abrir) {
    const caja = $('#recuperarCaja');
    const formulario = $('#loginForm');
    const alterno = $('#irRegistro');
    const nota = $('#authNota');
    const volver = $('#authVolver');

    if (!caja) return;

    caja.hidden = !abrir;
    if (formulario) formulario.hidden = abrir;
    if (alterno) alterno.hidden = abrir;
    if (nota) nota.hidden = abrir;
    if (volver) volver.hidden = abrir;

    if (abrir) {
      const campo = $('#olvideForm input[name="email"]');
      const correo = formulario && formulario.email ? formulario.email.value : '';

      if (campo) {
        campo.value = correo || '';
        campo.focus();
      }
    }
  }

  async function pedirEnlace(evento) {
    evento.preventDefault();

    /* El correo se valida con la misma regla que en el servidor */
    if (window.Validacion) {
      const revision = window.Validacion.validarFormulario(evento.target, { email: 'email' });

      if (!revision.ok) {
        aviso(revision.errores[0], true);
        return;
      }
    }

    const datos = Object.fromEntries(new FormData(evento.target).entries());
    const boton = $('#olvideEnviar');

    boton.disabled = true;

    try {
      const respuesta = await window.TiendaAPI.recuperar(String(datos.email || '').trim());

      aviso(respuesta.mensaje, false);

      const caja = $('#olvideDemo');
      const enlace = $('#olvideEnlace');
      const caduca = $('#olvideCaduca');

      if (respuesta.enlace && caja && enlace) {
        enlace.href = respuesta.enlace;
        enlace.textContent = 'Crear mi contraseña nueva';
        if (caduca) {
          caduca.textContent = 'Caduca en ' + (respuesta.minutos || 30) + ' minutos y sirve una sola vez.';
        }
        caja.hidden = false;
      }
    } catch (error) {
      aviso(error.message, true);
    } finally {
      boton.disabled = false;
    }
  }

  async function iniciar() {
    $('#loginForm').addEventListener('submit', enviar);

    /* Los campos se vigilan: se limpian al teclear y avisan si algo no cuadra */
    if (window.Validacion) {
      window.Validacion.vigilar($('#loginForm').querySelector('[name="email"]'), 'email');
      window.Validacion.vigilar($('#loginForm').querySelector('[name="password"]'), 'password');
      window.Validacion.vigilar($('#olvideForm').querySelector('[name="email"]'), 'email');
    }

    $('#irRegistro').href = 'registro.html?volver=' + encodeURIComponent(destino);
    /* El botón de abajo vuelve siempre a la portada pública (landing) */
    $('#authVolver').href = '../index.html';

    const abrir = $('#olvideAbrir');
    if (abrir) abrir.addEventListener('click', () => abrirRecuperar(true));

    const cerrar = $('#olvideCerrar');
    if (cerrar) cerrar.addEventListener('click', () => abrirRecuperar(false));

    const olvide = $('#olvideForm');
    if (olvide) olvide.addEventListener('submit', pedirEnlace);

    pintarEnvio();

    try {
      const sesion = await window.TiendaAPI.verSesion();

      if (sesion.autenticado) {
        window.location.href = luegoDeEntrar(sesion.usuario);   // ya tiene sesión: no hace falta pedir credenciales
      }
    } catch (error) {
      aviso('No se pudo conectar con la base de datos: ' + error.message, true);
    }
  }

  iniciar();
})();
