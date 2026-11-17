/* Nueva contraseña (pages/recuperar.html).
 *
 * Se llega desde el enlace que genera api/sesion.php?accion=recuperar:
 *   recuperar.html?token=<64 caracteres>
 * Primero se comprueba el token (accion=token); si caducó o ya se usó, se avisa
 * y se manda al usuario de vuelta al acceso. Al guardar se llama a
 * accion=restablecer, que cifra la contraseña con password_hash().
 */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  const token = (() => {
    try {
      return (new URLSearchParams(window.location.search).get('token') || '').trim();
    } catch (e) {
      return '';
    }
  })();

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

  async function guardar(evento) {
    evento.preventDefault();

    const formulario = evento.target;
    const boton = $('#nuevaGuardar');

    /* Validación: contraseña de 8 a 72 caracteres y confirmación idéntica
       (las mismas reglas que aplica api/sesion.php) */
    if (window.Validacion) {
      const revision = window.Validacion.validarFormulario(formulario, {
        password: 'password',
        repetir: 'password'
      });

      if (!revision.ok) {
        aviso(revision.errores[0], true);
        return;
      }
      if (revision.valores.password !== revision.valores.repetir) {
        window.Validacion.marcar(formulario.querySelector('[name="repetir"]'), 'Las dos contraseñas deben ser iguales.');
        aviso('Las dos contraseñas deben ser iguales', true);
        return;
      }
    }

    const datos = Object.fromEntries(new FormData(formulario).entries());

    if (datos.password !== datos.repetir) {
      aviso('Las dos contraseñas deben ser iguales', true);
      return;
    }

    boton.disabled = true;

    try {
      const respuesta = await window.TiendaAPI.restablecer(token, datos.password, datos.repetir);

      aviso(respuesta.mensaje, false);
      formulario.hidden = true;

      const nota = $('#recuperarNota');
      if (nota) nota.textContent = 'Ya puedes entrar con tu contraseña nueva.';
    } catch (error) {
      aviso(error.message, true);
      boton.disabled = false;
    }
  }

  async function iniciar() {
    $('#irLogin').href = 'login.html';
    $('#authVolver').href = '../index.html';

    pintarEnvio();

    if (token === '') {
      aviso('Este enlace no trae el código de recuperación. Pide uno nuevo desde "¿Olvidaste tu contraseña?".', true);
      return;
    }

    try {
      const revision = await window.TiendaAPI.revisarEnlace(token);

      if (!revision.valido) {
        aviso('El enlace ya caducó o fue usado. Pide uno nuevo desde el inicio de sesión.', true);
        return;
      }

      const sub = $('#recuperarSub');
      if (sub) sub.textContent = 'Estás cambiando la contraseña de ' + (revision.correo || 'tu cuenta') + '.';

      const formulario = $('#nuevaForm');
      formulario.hidden = false;
      formulario.addEventListener('submit', guardar);
      formulario.password.focus();
    } catch (error) {
      aviso('No se pudo revisar el enlace: ' + error.message, true);
    }
  }

  iniciar();
})();
