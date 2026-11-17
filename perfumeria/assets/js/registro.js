/* Crear cuenta (pages/registro.html).
 *
 * Vive en su propia página y con su propio botón: en login.html el botón
 * "Crear una cuenta" lleva aquí y aquí el de "Ya tengo cuenta" regresa.
 * Respeta ?volver= para terminar en la página en la que estaba el usuario.
 */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const destino = (window.TiendaAPI && window.TiendaAPI.volver)
    ? window.TiendaAPI.volver('tienda.html')
    : 'tienda.html';

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
        nombre: 'nombre',
        apellido: 'apellido',
        email: 'email',
        telefono: { clave: 'telefono', obligatorio: false },
        password: 'password'
      });

      if (!revision.ok) {
        aviso(revision.errores[0], true);
        return;
      }
    }

    const datos = Object.fromEntries(new FormData(formulario).entries());
    const boton = $('#registroCrear');
    boton.disabled = true;

    try {
      const respuesta = await window.TiendaAPI.registrar(datos);

      aviso('¡Bienvenida, ' + respuesta.usuario.nombre + '! Entrando…', false);
      window.location.href = (window.TiendaAPI && window.TiendaAPI.destinoPorRol)
        ? window.TiendaAPI.destinoPorRol(respuesta.usuario, destino)
        : destino;
    } catch (error) {
      aviso(error.message, true);
      boton.disabled = false;
    }
  }

  function iniciar() {
    $('#registroForm').addEventListener('submit', enviar);

    /* Los campos se vigilan: se limpian al teclear y avisan si algo no cuadra */
    if (window.Validacion) {
      const formulario = $('#registroForm');
      const reglas = { nombre: 'nombre', apellido: 'apellido', email: 'email', telefono: 'telefono', password: 'password' };

      Object.keys(reglas).forEach((nombre) => {
        window.Validacion.vigilar(formulario.querySelector('[name="' + nombre + '"]'), reglas[nombre]);
      });
    }

    $('#irLogin').href = 'login.html?volver=' + encodeURIComponent(destino);
    /* El botón de abajo vuelve siempre a la portada pública (landing) */
    $('#authVolver').href = '../index.html';

    pintarEnvio();
  }

  iniciar();
})();
