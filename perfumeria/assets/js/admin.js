/* Panel de administración (pages/admin.html).
 *
 * Todo pasa por api/admin.php, que exige rol `admin` en el servidor.
 * guardia.js solo evita pintar la pantalla cuando la cuenta no tiene permiso.
 */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const money = (n) => '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function textoSeguro(valor) {
    return String(valor === null || valor === undefined ? '' : valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  let datos = { usuario: null, roles: {}, resumen: {}, usuarios: [] };
  let toastTimer = null;

  function toast(msg) {
    const t = $('#toast');
    if (!t) return;

    t.textContent = msg;
    t.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-show'), 2400);
  }

  function nombreCompleto(u) {
    return [u.nombre, u.apellido].filter(Boolean).join(' ') || 'Sin nombre';
  }

  /* ---------- Pintado ---------- */
  function pintarCifras() {
    const caja = $('#adminCifras');
    if (!caja) return;

    const r = datos.resumen || {};
    const cifras = [
      { valor: r.usuarios, etiqueta: 'Usuarios' },
      { valor: r.activos, etiqueta: 'Cuentas activas' },
      { valor: r.administradores, etiqueta: 'Administradores' },
      { valor: r.sesiones, etiqueta: 'Sesiones abiertas' },
      { valor: r.pedidos, etiqueta: 'Pedidos' },
      { valor: money(r.ventas), etiqueta: 'Ventas' }
    ];

    caja.innerHTML = cifras
      .map((c) => `<div class="admin__cifra"><b>${textoSeguro(c.valor)}</b><span>${textoSeguro(c.etiqueta)}</span></div>`)
      .join('');
  }

  function opcionesRol(u) {
    return Object.keys(datos.roles).map((id) => {
      const elegido = Number(id) === Number(u.rol_id) ? ' selected' : '';

      return `<option value="${textoSeguro(datos.roles[id])}"${elegido}>${textoSeguro(datos.roles[id])}</option>`;
    }).join('');
  }

  function filaUsuario(u) {
    const yo = datos.usuario && Number(datos.usuario.id) === Number(u.id);
    const estado = u.activo
      ? '<span class="admin__estado admin__estado--si">Activa</span>'
      : '<span class="admin__estado admin__estado--no">Inactiva</span>';

    const acciones = yo
      ? '<small>Tu cuenta</small>'
      : `<button class="btn btn--ghost" type="button" data-admin-activo="${Number(u.id)}" data-valor="${u.activo ? '0' : '1'}">${u.activo ? 'Desactivar' : 'Activar'}</button>
         <button class="btn btn--ghost" type="button" data-admin-sesiones="${Number(u.id)}"${u.sesiones ? '' : ' disabled'}>Cerrar sesiones (${Number(u.sesiones)})</button>`;

    const tipo = yo
      ? textoSeguro(u.rol)
      : `<select data-admin-rol="${Number(u.id)}" aria-label="Tipo de usuario">${opcionesRol(u)}</select>`;

    return `
      <tr>
        <td>${Number(u.id)}</td>
        <td>${textoSeguro(nombreCompleto(u))}${yo ? ' <em class="lperfil__etiqueta">Tú</em>' : ''}<br><small>${textoSeguro(u.email)}</small></td>
        <td>${textoSeguro(u.telefono || '—')}</td>
        <td>${estado}</td>
        <td>${Number(u.sesiones)}</td>
        <td>${Number(u.pedidos)}</td>
        <td>${tipo}</td>
        <td><div class="admin__acciones">${acciones}</div></td>
      </tr>`;
  }

  function pintarUsuarios() {
    const caja = $('#adminUsuarios');
    if (!caja) return;

    const lista = datos.usuarios || [];

    if (!lista.length) {
      caja.innerHTML = '<p class="admin__vacio">Todavía no hay usuarios registrados.</p>';
      return;
    }

    caja.innerHTML = `
      <div class="admin__tabla--scroll">
        <table class="admin__tabla">
          <thead>
            <tr><th>#</th><th>Usuario</th><th>Teléfono</th><th>Estado</th><th>Sesiones</th><th>Pedidos</th><th>Tipo</th><th>Acciones</th></tr>
          </thead>
          <tbody>${lista.map(filaUsuario).join('')}</tbody>
        </table>
      </div>`;
  }

  function pintar() {
    const nombre = $('#adminNombre');
    if (nombre && datos.usuario) nombre.textContent = nombreCompleto(datos.usuario);

    pintarCifras();
    pintarUsuarios();
  }

  /* ---------- Datos y acciones ---------- */
  async function cargar(silencioso) {
    try {
      const respuesta = await window.TiendaAPI.admin();

      datos = respuesta;
      pintar();

      if (!silencioso) toast('Datos actualizados');
    } catch (error) {
      const caja = $('#adminUsuarios');
      if (caja) caja.innerHTML = '<p class="admin__vacio">' + textoSeguro(error.message) + '</p>';

      if (/iniciar sesión/i.test(error.message)) {
        window.location.replace(window.Guardia.loginConVuelta());
      }
    }
  }

  async function accion(nombre, cuerpo, exito) {
    try {
      const respuesta = await window.TiendaAPI.adminAccion(nombre, cuerpo);

      /* admin.php devuelve el panel completo después de cada cambio */
      datos = respuesta;
      pintar();
      toast(respuesta.mensaje || exito || 'Listo');
    } catch (error) {
      toast(error.message);

      /* El estado pudo cambiar aunque la acción fallara: se relee */
      if (!/iniciar sesión/i.test(error.message)) cargar(true);
    }
  }

  function bind() {
    const tabla = $('#adminUsuarios');

    if (tabla) {
      tabla.addEventListener('change', (e) => {
        const selector = e.target.closest('[data-admin-rol]');
        if (!selector) return;

        accion('rol', { usuario_id: Number(selector.dataset.adminRol), rol: selector.value }, 'Tipo de usuario actualizado');
      });

      tabla.addEventListener('click', (e) => {
        const activar = e.target.closest('[data-admin-activo]');
        if (activar) {
          const activo = activar.dataset.valor === '1';

          if (!activo && !window.confirm('¿Desactivar esta cuenta? Se cerrarán sus sesiones.')) return;

          accion('activo', { usuario_id: Number(activar.dataset.adminActivo), activo: activo });
          return;
        }

        const sesiones = e.target.closest('[data-admin-sesiones]');
        if (sesiones) {
          if (!window.confirm('¿Cerrar todas las sesiones de este usuario?')) return;

          accion('sesiones-cerrar', { usuario_id: Number(sesiones.dataset.adminSesiones) });
        }
      });
    }

    const recargar = $('#adminRecargar');
    if (recargar) recargar.addEventListener('click', () => cargar(false));

    const salir = $('#adminSalir');
    if (salir) {
      salir.addEventListener('click', async () => {
        try {
          await window.TiendaAPI.salir();
        } catch (error) {
          /* la sesión local se cierra igual */
        }

        window.location.replace('login.html');
      });
    }
  }

  /* ---------- Arranque: primero el rol, después los datos ---------- */
  async function iniciar() {
    if (!window.Guardia || !window.TiendaAPI) return;

    const revision = await window.Guardia.exigir('admin');

    if (!revision.ok) {
      const aviso = $('#adminAviso');
      if (!aviso) return;

      aviso.hidden = false;
      aviso.textContent = revision.motivo === 'sin-permiso'
        ? 'Esta sección es solo para administradores. Te llevamos de vuelta a la tienda…'
        : 'Necesitas iniciar sesión con una cuenta de administrador. Te llevamos al acceso…';
      return;
    }

    bind();
    await cargar(true);
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})();
