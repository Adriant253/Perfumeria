/* Validación de datos de entrada (lado del navegador).
 *
 * Es el espejo de las reglas del servidor en api/conexion.php (CAMPOS_VALIDOS):
 * aquí se avisa al usuario al instante y en el servidor se vuelve a validar,
 * porque el cliente nunca es de fiar. Si cambias una regla, cámbiala en los dos.
 *
 * Cómo se usa desde cualquier vista:
 *   const revision = Validacion.validar('email', valor);          // { ok, valor, error }
 *   Validacion.marcar(input, revision.error);                     // mensaje nativo del navegador
 *   Validacion.validarFormulario(form, { nombre: 'nombre' });     // todos los campos de golpe
 *   Validacion.filtrarEntrada(input, 'cp');                       // limpia mientras se escribe
 *
 * Sin dependencias: no toca el DOM al cargarse ni necesita otras librerías.
 */
(function (global) {
  'use strict';

  /* ---------- Reglas por campo (idénticas a api/conexion.php) ----------
     patron: caracteres permitidos · min/max: largo · digitos: dígitos mínimos
     codigo: false solo donde los símbolos son legítimos (correo, contraseña)
     soloDigitos: al teclear se descarta todo lo que no sea número */
  const CAMPOS = {
    nombre: {
      etiqueta: 'nombre', min: 2, max: 100,
      patron: /^[\p{L}\p{M}](?:[\p{L}\p{M} .'-]){1,99}$/u
    },
    apellido: {
      etiqueta: 'apellido', min: 2, max: 100,
      patron: /^[\p{L}\p{M}](?:[\p{L}\p{M} .'-]){1,99}$/u
    },
    destinatario: {
      etiqueta: 'destinatario', min: 2, max: 100,
      patron: /^[\p{L}\p{M}](?:[\p{L}\p{M}\p{N} .'-]){1,99}$/u,
      ayuda: 'solo letras y, si hace falta, un número (por ejemplo: Ana López, Depto 402).'
    },
    titular: {
      etiqueta: 'nombre del titular', min: 3, max: 100,
      patron: /^[\p{L}\p{M}](?:[\p{L}\p{M} .'-]){2,99}$/u,
      ayuda: 'escríbelo como aparece en la tarjeta.'
    },
    email: {
      etiqueta: 'correo', min: 5, max: 150, codigo: false,
      patron: /^[^\s@<>"']+@[^\s@<>"']+\.[\p{L}]{2,}$/u,
      ayuda: 'debe verse como nombre@dominio.com.'
    },
    password: {
      etiqueta: 'contraseña', min: 8, max: 72, codigo: false,
      ayuda: 'debe tener entre 8 y 72 caracteres.'
    },
    telefono: {
      etiqueta: 'teléfono', min: 10, max: 20, digitos: 10,
      patron: /^[0-9+()\s.'-]{10,20}$/,
      ayuda: 'son al menos 10 dígitos; puedes separarlos con espacios o guiones.'
    },
    calle: {
      etiqueta: 'calle y número', min: 4, max: 120,
      patron: /^[\p{L}\p{N}](?:[\p{L}\p{N}\p{M} .,#\/°º()&+'-]){3,119}$/u,
      ayuda: 'incluye el número (por ejemplo: Av. Reforma 123).'
    },
    colonia: {
      etiqueta: 'colonia', min: 3, max: 120,
      patron: /^[\p{L}\p{N}](?:[\p{L}\p{N}\p{M} .,#\/°º()&+'-]){2,119}$/u
    },
    ciudad: {
      etiqueta: 'ciudad', min: 3, max: 60,
      patron: /^[\p{L}\p{N}](?:[\p{L}\p{N}\p{M} .,#\/°º()&+'-]){2,59}$/u
    },
    estado: {
      etiqueta: 'estado', min: 3, max: 60,
      patron: /^[\p{L}\p{N}](?:[\p{L}\p{N}\p{M} .,#\/°º()&+'-]){2,59}$/u
    },
    referencias: {
      etiqueta: 'referencias', min: 0, max: 160, obligatorio: false,
      patron: /^[\p{L}\p{N}](?:[\p{L}\p{N}\p{M} .,#\/°º()&+'-]){0,159}$/u
    },
    cp: {
      etiqueta: 'código postal', min: 4, max: 5, soloDigitos: true,
      patron: /^\d{4,5}$/,
      ayuda: 'son 4 o 5 números.'
    },
    buscar: {
      etiqueta: 'búsqueda', min: 2, max: 60,
      patron: /^[\p{L}\p{N}\p{M}\s.,'&@()_+\/-]{2,60}$/u,
      ayuda: 'usa letras, números y signos simples.'
    },
    marca: {
      etiqueta: 'marca de la tarjeta', min: 1, max: 30,
      patron: /^[\p{L}\p{N}][\p{L}\p{N}\p{M} .'-]{0,29}$/u
    },
    ultimos4: {
      etiqueta: 'tarjeta', min: 4, max: 4, soloDigitos: true,
      patron: /^\d{4}$/
    },
    mes: {
      etiqueta: 'mes de vencimiento', min: 1, max: 2, soloDigitos: true,
      patron: /^(?:[1-9]|1[0-2])$/
    },
    anio: {
      etiqueta: 'año de vencimiento', min: 4, max: 4, soloDigitos: true,
      patron: /^\d{4}$/
    },
    cantidad: {
      etiqueta: 'cantidad', min: 1, max: 3, soloDigitos: true, rango: [1, 999],
      patron: /^\d{1,3}$/,
      ayuda: 'escribe un número entre 1 y 999.'
    },
    numero: {
      etiqueta: 'número de la tarjeta', min: 13, max: 19, soloDigitos: true, codigo: false,
      patron: /^\d{13,19}$/,
      ayuda: 'son de 13 a 19 dígitos: escríbelos seguidos, sin espacios.'
    }
  };

  /* Patrones de tarjeta aceptados (mismos de api/conexion.php) */
  const MARCAS_TARJETA = ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER', 'TARJETA'];

  /* Nada que se pueda leer como etiqueta o pseudo-protocolo */
  const CODIGO = /(<\s*\/?\s*[a-z!]|javascript:|vbscript:|data:text|on[a-z]+\s*=)/i;

  /* Clase que marca visualmente un campo con error (ver styles.css) */
  const CLASE_ERROR = 'is-invalido';

  /* ---------- Utilidades ---------- */

  /* Quita controles y espacios sobrantes y recorta al máximo indicado */
  function limpiar(valor, max) {
    const texto = String(valor === null || valor === undefined ? '' : valor)
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return max > 0 ? texto.slice(0, max) : texto;
  }

  /* Texto listo para una plantilla HTML */
  function textoSeguro(valor) {
    return String(valor === null || valor === undefined ? '' : valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function soloDigitos(valor) {
    return String(valor === null || valor === undefined ? '' : valor).replace(/\D/g, '');
  }

  function miles(valor) {
    const numero = Number(valor);

    return Number.isFinite(numero) ? numero.toLocaleString('es-MX') : '';
  }

  /* ---------- Validación ---------- */

  /**
   * Revisa un valor con la regla de su campo.
   * Devuelve { ok, valor, error }: 'valor' viene ya limpio y recortado.
   * Con obligatorio=false, un valor vacío se acepta (campos opcionales).
   */
  function validar(clave, valor, obligatorio) {
    const regla = CAMPOS[clave];

    if (!regla) {
      return { ok: false, valor: '', error: 'Campo desconocido: ' + String(clave) };
    }

    const exigido = obligatorio === undefined ? regla.obligatorio !== false : obligatorio;
    const limpio = limpiar(valor, (regla.max || 200) + 1);   // +1 para detectar el exceso

    if (limpio === '') {
      return exigido
        ? { ok: false, valor: '', error: 'Falta el dato: ' + regla.etiqueta }
        : { ok: true, valor: '', error: '' };
    }
    if (limpio.length < regla.min) {
      return { ok: false, valor: limpio, error: 'Revisa «' + regla.etiqueta + '»: ' + (regla.ayuda || 'escribe al menos ' + regla.min + ' caracteres.') };
    }
    if (limpio.length > regla.max) {
      return { ok: false, valor: limpio.slice(0, regla.max), error: 'Revisa «' + regla.etiqueta + '»: máximo ' + regla.max + ' caracteres.' };
    }
    if (regla.patron && !regla.patron.test(limpio)) {
      return { ok: false, valor: limpio, error: 'Revisa «' + regla.etiqueta + '»: ' + (regla.ayuda || 'tiene caracteres que no se permiten.') };
    }
    if (regla.digitos && soloDigitos(limpio).length < regla.digitos) {
      return { ok: false, valor: limpio, error: 'Revisa «' + regla.etiqueta + '»: ' + (regla.ayuda || 'deben ser al menos ' + regla.digitos + ' dígitos.') };
    }
    if (regla.rango) {
      const numero = Number(soloDigitos(limpio));

      if (!Number.isFinite(numero) || numero < regla.rango[0] || numero > regla.rango[1]) {
        return { ok: false, valor: limpio, error: 'Revisa «' + regla.etiqueta + '»: ' + (regla.ayuda || 'debe estar entre ' + regla.rango[0] + ' y ' + regla.rango[1] + '.') };
      }
    }
    if (regla.codigo !== false && CODIGO.test(limpio)) {
      return { ok: false, valor: limpio, error: 'Revisa «' + regla.etiqueta + '»: quita los símbolos de programación.' };
    }

    return { ok: true, valor: limpio, error: '' };
  }

  /** Pinta (o quita) el error en un campo usando la validación del navegador. */
  function marcar(campo, error) {
    if (!campo || typeof campo.setCustomValidity !== 'function') return;

    campo.setCustomValidity(error || '');

    if (campo.classList) {
      campo.classList.toggle(CLASE_ERROR, !!error);
    }
  }

  /** Quita los mensajes de todos los campos de un formulario. */
  function limpiarMarcas(formulario) {
    if (!formulario || typeof formulario.querySelectorAll !== 'function') return;

    Array.from(formulario.querySelectorAll('[name]')).forEach((campo) => marcar(campo, ''));
  }

  /**
   * Valida varios campos de un formulario.
   * mapa: { campoDelFormulario: 'claveDeRegla' } o { campo: { clave, obligatorio } }
   * Devuelve { ok, errores, valores } (valores trae solo lo que pasó).
   */
  function validarFormulario(formulario, mapa) {
    const errores = [];
    const valores = {};

    if (!formulario || typeof formulario.querySelector !== 'function') {
      return { ok: false, errores: ['No se encontró el formulario'], valores: {} };
    }

    Object.keys(mapa).forEach((nombre) => {
      const campo = formulario.querySelector('[name="' + nombre + '"]');

      if (!campo) {
        errores.push('El formulario no trae el campo «' + nombre + '»');
        return;
      }

      const regla = typeof mapa[nombre] === 'string' ? { clave: mapa[nombre] } : mapa[nombre];
      const revision = validar(regla.clave, campo.value, regla.obligatorio);

      marcar(campo, revision.error);

      if (revision.ok) {
        valores[nombre] = revision.valor;
      } else {
        errores.push(revision.error);
      }
    });

    /* El navegador enseña el primer campo con problema */
    if (errores.length && typeof formulario.reportValidity === 'function') {
      formulario.reportValidity();
    }

    return { ok: errores.length === 0, errores: errores, valores: valores };
  }

  /* ---------- Ayudas para conectar los campos ---------- */

  /* Limpia lo que se teclea: sin controles ni etiquetas, solo dígitos en los
     campos numéricos y recortado al máximo del campo. */
  function filtrarEntrada(campo, clave) {
    if (!campo || typeof campo.value !== 'string') return;

    const regla = CAMPOS[clave] || {};
    const original = campo.value;
    let valor = original.replace(/[\u0000-\u001F\u007F<>]/g, '');

    if (regla.soloDigitos) valor = soloDigitos(valor);
    if (regla.max) valor = valor.slice(0, regla.max);

    if (valor !== original) campo.value = valor;
  }

  /* Deja el campo vigilado: filtra al teclear y quita el aviso al corregir */
  function vigilar(campo, clave) {
    if (!campo || typeof campo.addEventListener !== 'function') return;

    campo.addEventListener('input', () => {
      filtrarEntrada(campo, clave);
      marcar(campo, campo.value.trim() === '' ? '' : validar(clave, campo.value, false).error);
    });
  }

  /* ---------- Tarjeta (el número nunca sale del navegador) ---------- */

  /* Dígito de control ISO/IEC 7812 */
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

    return numero.length > 0 && suma % 10 === 0;
  }

  /** Del número se obtiene solo marca + últimos 4 dígitos, con validación. */
  function revisarTarjeta(numero) {
    const limpio = soloDigitos(numero);
    let marca = 'Tarjeta';

    if (/^4/.test(limpio)) marca = 'VISA';
    else if (/^(5[1-5]|2[2-7])/.test(limpio)) marca = 'Mastercard';
    else if (/^3[47]/.test(limpio)) marca = 'AMEX';
    else if (/^6(?:011|5)/.test(limpio)) marca = 'Discover';

    if (limpio.length < 13 || limpio.length > 19) {
      return { marca: marca, ultimos4: '', valido: false, error: 'Revisa «número de la tarjeta»: deben ser de 13 a 19 dígitos.' };
    }
    if (!luhnValido(limpio)) {
      return { marca: marca, ultimos4: limpio.slice(-4), valido: false, error: 'Revisa «número de la tarjeta»: ese número no parece válido.' };
    }
    if (MARCAS_TARJETA.indexOf(marca.toUpperCase()) === -1) {
      return { marca: marca, ultimos4: limpio.slice(-4), valido: false, error: 'Revisa «número de la tarjeta»: no reconocemos la marca.' };
    }

    return { marca: marca, ultimos4: limpio.slice(-4), valido: true, error: '' };
  }

  /** ¿El mes de vencimiento está entre 1 y 12? */
  function mesValido(valor) {
    return CAMPOS.mes.patron.test(soloDigitos(valor));
  }

  /** ¿El año es el actual (o hasta 20 años después)? */
  function anioValido(valor) {
    const digitos = soloDigitos(valor);
    const anio = Number(digitos);
    const actual = new Date().getFullYear();

    return /^\d{4}$/.test(digitos) && anio >= actual && anio <= actual + 20;
  }

  /** Cantidad pedida: número válido y dentro del stock disponible. */
  function cantidadValida(valor, stock) {
    const revision = validar('cantidad', valor);
    const tope = Number(stock);

    if (!revision.ok) {
      return { ok: false, valor: 1, error: revision.error };
    }
    if (Number.isFinite(tope) && tope > 0 && Number(revision.valor) > tope) {
      return { ok: false, valor: tope, error: 'Solo quedan ' + miles(tope) + ' piezas de esta presentación.' };
    }

    return { ok: true, valor: Number(revision.valor), error: '' };
  }

  /* ---------- API pública ---------- */
  global.Validacion = {
    CAMPOS: CAMPOS,
    MARCAS_TARJETA: MARCAS_TARJETA,
    limpiar: limpiar,
    textoSeguro: textoSeguro,
    soloDigitos: soloDigitos,
    validar: validar,
    marcar: marcar,
    limpiarMarcas: limpiarMarcas,
    validarFormulario: validarFormulario,
    filtrarEntrada: filtrarEntrada,
    vigilar: vigilar,
    revisarTarjeta: revisarTarjeta,
    luhnValido: luhnValido,
    mesValido: mesValido,
    anioValido: anioValido,
    cantidadValida: cantidadValida
  };
})(typeof window !== 'undefined' ? window : globalThis);
