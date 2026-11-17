<?php
/**
 * perfil.php — panel "Mi perfil" de la tienda (pages/tienda.html).
 *
 *   GET  api/perfil.php                             -> usuario + tarjetas + direcciones
 *   POST api/perfil.php?accion=datos-guardar        { nombre, apellido, telefono? }
 *   POST api/perfil.php?accion=tarjeta-guardar      { id?, marca, ultimos4, mes, anio, titular, proveedor?, predeterminada? }
 *   POST api/perfil.php?accion=tarjeta-eliminar     { id }
 *   POST api/perfil.php?accion=direccion-guardar    { id?, destinatario, calle, colonia, ciudad, estado, cp, telefono, referencias?, predeterminada? }
 *   POST api/perfil.php?accion=direccion-eliminar   { id }
 *   POST api/perfil.php?accion=password             { actual, nueva }
 *
 * Tablas: `usuarios` (datos y contraseña), `metodos_pago_usuario` (tarjetas) y
 * `direcciones_envio` (direcciones de envío, las mismas del checkout).
 *
 * SEGURIDAD: de las tarjetas solo se guardan marca, últimos 4 dígitos y
 * vencimiento (+ un token/customer simulados de la pasarela); el número completo
 * y el CVV nunca salen del navegador. Las contraseñas van con password_hash().
 */
declare(strict_types=1);

require __DIR__ . '/conexion.php';

$usuario = exigir_usuario();
$usuarioId = (int) $usuario['id'];
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$accion = (string) ($_GET['accion'] ?? '');

/** Columna que marca "predeterminada" en cada tabla (lista blanca, nunca del cliente). */
const TABLAS_PERFIL = [
    'metodos_pago_usuario' => ['columna' => 'es_predeterminado', 'filtro' => ' AND activo = 1'],
    'direcciones_envio'    => ['columna' => 'es_predeterminada', 'filtro' => ''],
];

/** Tarjetas guardadas del usuario (tabla `metodos_pago_usuario`, sin datos sensibles). */
function leer_tarjetas(int $usuarioId): array
{
    $st = db()->prepare(
        'SELECT id, proveedor, marca_tarjeta, ultimos_cuatro, mes_expiracion, anio_expiracion,
                titular_nombre, es_predeterminado
           FROM metodos_pago_usuario
          WHERE usuario_id = ? AND activo = 1
          ORDER BY es_predeterminado DESC, id DESC'
    );
    $st->execute([$usuarioId]);

    return array_map(static function (array $t): array {
        return [
            'id'             => (int) $t['id'],
            'proveedor'      => $t['proveedor'],
            'marca'          => $t['marca_tarjeta'] ?? '',
            'ultimos4'       => $t['ultimos_cuatro'] ?? '',
            'mes'            => (int) $t['mes_expiracion'],
            'anio'           => (int) $t['anio_expiracion'],
            'titular'        => $t['titular_nombre'] ?? '',
            'predeterminada' => (bool) $t['es_predeterminado'],
        ];
    }, $st->fetchAll());
}

/** Direcciones de envío del usuario. */
function leer_direcciones(int $usuarioId): array
{
    $st = db()->prepare(
        'SELECT id, destinatario, calle_numero, colonia, ciudad, estado, codigo_postal,
                referencias, telefono_contacto, es_predeterminada
           FROM direcciones_envio
          WHERE usuario_id = ?
          ORDER BY es_predeterminada DESC, id DESC'
    );
    $st->execute([$usuarioId]);

    return array_map(static function (array $d): array {
        return [
            'id'             => (int) $d['id'],
            'destinatario'   => $d['destinatario'],
            'calle'          => $d['calle_numero'],
            'colonia'        => $d['colonia'],
            'ciudad'         => $d['ciudad'],
            'estado'         => $d['estado'],
            'cp'             => $d['codigo_postal'],
            'referencias'    => $d['referencias'] ?? '',
            'telefono'       => $d['telefono_contacto'],
            'predeterminada' => (bool) $d['es_predeterminada'],
        ];
    }, $st->fetchAll());
}

/** Deja una sola fila como predeterminada (y ninguna más). */
function marcar_predeterminada(string $tabla, int $usuarioId, int $id): void
{
    $config = TABLAS_PERFIL[$tabla] ?? null;

    if ($config === null) {
        return;
    }

    $st = db()->prepare("UPDATE {$tabla} SET {$config['columna']} = FALSE WHERE usuario_id = ? AND id <> ?{$config['filtro']}");
    $st->execute([$usuarioId, $id]);

    $st = db()->prepare("UPDATE {$tabla} SET {$config['columna']} = TRUE WHERE id = ? AND usuario_id = ?");
    $st->execute([$id, $usuarioId]);
}

/** ¿Es la primera fila del usuario? (la primera siempre queda predeterminada) */
function es_la_primera(string $tabla, int $usuarioId): bool
{
    $config = TABLAS_PERFIL[$tabla] ?? null;

    if ($config === null) {
        return false;
    }

    $st = db()->prepare("SELECT COUNT(*) FROM {$tabla} WHERE usuario_id = ?{$config['filtro']}");
    $st->execute([$usuarioId]);

    return ((int) $st->fetchColumn()) === 1;
}

/** Si el usuario se quedó sin predeterminada, marca la más reciente. */
function asegurar_predeterminada(string $tabla, int $usuarioId): void
{
    $config = TABLAS_PERFIL[$tabla] ?? null;

    if ($config === null) {
        return;
    }

    $st = db()->prepare("SELECT COUNT(*) FROM {$tabla} WHERE usuario_id = ?{$config['filtro']} AND {$config['columna']} = TRUE");
    $st->execute([$usuarioId]);

    if (((int) $st->fetchColumn()) > 0) {
        return;
    }

    $st = db()->prepare("SELECT id FROM {$tabla} WHERE usuario_id = ?{$config['filtro']} ORDER BY id DESC LIMIT 1");
    $st->execute([$usuarioId]);
    $id = (int) $st->fetchColumn();

    if ($id > 0) {
        marcar_predeterminada($tabla, $usuarioId, $id);
    }
}

/* ------------------------------------------------------------------ GET */
if ($metodo === 'GET') {
    try {
        json_salida([
            'ok'          => true,
            'usuario'     => $usuario,
            'tarjetas'    => leer_tarjetas($usuarioId),
            'direcciones' => leer_direcciones($usuarioId),
        ]);
    } catch (Throwable $e) {
        json_error('No se pudo leer tu perfil', 500, $e);
    }
}

if ($metodo !== 'POST') {
    json_error('Método no permitido, usa GET o POST', 405);
}

/* ----------------------------------------------------------------- POST */
$datos = cuerpo();

try {
    switch ($accion) {
        /* ----- Datos personales (tabla usuarios) ----- */
        case 'datos-guardar':
            $nombre = campo($datos, 'nombre');
            $apellido = campo($datos, 'apellido');
            $telefono = campo($datos, 'telefono');

            $error = validar_campos(['nombre' => $nombre, 'apellido' => $apellido]);

            /* El teléfono es opcional, pero si viene se revisa igual */
            if ($error === null) {
                $error = validar_campo($telefono, 'telefono', false);
            }

            if ($error !== null) {
                json_error($error);
            }

            $st = db()->prepare('UPDATE usuarios SET nombre = ?, apellido = ?, telefono = ? WHERE id = ?');
            $st->execute([$nombre, $apellido, $telefono !== '' ? $telefono : null, $usuarioId]);
            $mensaje = 'Datos actualizados';
            break;

        /* ----- Tarjetas: solo marca, últimos 4 dígitos y vencimiento ----- */
        case 'tarjeta-guardar':
            $id = (int) ($datos['id'] ?? 0);
            $marca = campo($datos, 'marca');
            $ultimos4 = solo_digitos(campo($datos, 'ultimos4'));
            $mes = solo_digitos(campo($datos, 'mes'));
            $anio = solo_digitos(campo($datos, 'anio'));
            $titular = campo($datos, 'titular');
            $predeterminada = booleano_entrada($datos['predeterminada'] ?? false);

            /* La marca sale del número en el navegador: aquí se acepta solo si
               está en la lista blanca (MARCAS_TARJETA). */
            $marcaCanonica = marca_tarjeta_canonica($marca);

            if ($marcaCanonica === null) {
                json_error('No se reconoció la marca de la tarjeta');
            }
            if (strlen($ultimos4) !== 4) {
                json_error('El número de la tarjeta no es válido');
            }
            if ($mes === '' || (int) $mes < 1 || (int) $mes > 12) {
                json_error('El mes de vencimiento no es válido');
            }
            if (preg_match('/^\d{4}$/', $anio) !== 1 || (int) $anio < (int) date('Y') || (int) $anio > (int) date('Y') + 20) {
                json_error('El año de vencimiento no es válido');
            }

            $error = validar_campo($titular, 'titular');

            if ($error !== null) {
                json_error($error);
            }

            $marca = $marcaCanonica;
            $mes = (int) $mes;
            $anio = (int) $anio;
            $proveedor = lista_blanca(strtoupper(campo($datos, 'proveedor')), ['MERCADO_PAGO', 'PAYPAL', 'STRIPE'], 'MERCADO_PAGO');

            if ($id > 0) {
                $st = db()->prepare(
                    'UPDATE metodos_pago_usuario
                        SET proveedor = ?, marca_tarjeta = ?, ultimos_cuatro = ?, mes_expiracion = ?,
                            anio_expiracion = ?, titular_nombre = ?
                      WHERE id = ? AND usuario_id = ?'
                );
                $st->execute([$proveedor, $marca, $ultimos4, $mes, $anio, $titular, $id, $usuarioId]);
                $mensaje = 'Tarjeta actualizada';
            } else {
                /* Una pasarela real devolvería el customer y el token de la tarjeta;
                   aquí se simulan. El número completo nunca llega al servidor. */
                $st = db()->prepare(
                    'INSERT INTO metodos_pago_usuario (usuario_id, proveedor, customer_id_pasarela, token_metodo_pago,
                                                       tipo_medio, marca_tarjeta, ultimos_cuatro, mes_expiracion,
                                                       anio_expiracion, titular_nombre, es_predeterminado, activo)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)'
                );
                $st->execute([
                    $usuarioId,
                    $proveedor,
                    'CLI-' . $usuarioId,
                    'DEMO-' . bin2hex(random_bytes(8)),
                    'TARJETA',
                    $marca,
                    $ultimos4,
                    $mes,
                    $anio,
                    $titular,
                ]);
                $id = (int) db()->lastInsertId();
                $mensaje = 'Tarjeta agregada';
            }

            if ($predeterminada || es_la_primera('metodos_pago_usuario', $usuarioId)) {
                marcar_predeterminada('metodos_pago_usuario', $usuarioId, $id);
            }
            break;

        case 'tarjeta-eliminar':
            $id = (int) ($datos['id'] ?? 0);

            if ($id < 1) {
                json_error('Falta la tarjeta que quieres eliminar');
            }

            /* Se desactiva en lugar de borrarla: desaparece del panel pero se
               conserva el histórico de la pasarela (columna `activo`). */
            $st = db()->prepare('UPDATE metodos_pago_usuario SET activo = 0, es_predeterminado = 0 WHERE id = ? AND usuario_id = ?');
            $st->execute([$id, $usuarioId]);

            asegurar_predeterminada('metodos_pago_usuario', $usuarioId);
            $mensaje = 'Tarjeta eliminada';
            break;

        /* ----- Direcciones de envío (tabla direcciones_envio) ----- */
        case 'direccion-guardar':
            $id = (int) ($datos['id'] ?? 0);
            $direccion = [
                'destinatario' => campo($datos, 'destinatario'),
                'calle'        => campo($datos, 'calle'),
                'colonia'      => campo($datos, 'colonia'),
                'ciudad'       => campo($datos, 'ciudad'),
                'estado'       => campo($datos, 'estado'),
                'cp'           => campo($datos, 'cp'),
                'telefono'     => campo($datos, 'telefono'),
            ];

            $error = validar_campos($direccion);

            if ($error !== null) {
                json_error($error);
            }

            $referencias = campo($datos, 'referencias');

            if ($referencias !== '') {
                $error = validar_campo($referencias, 'referencias', false);

                if ($error !== null) {
                    json_error($error);
                }
            }

            $predeterminada = booleano_entrada($datos['predeterminada'] ?? false);

            if ($id > 0) {
                $st = db()->prepare(
                    'UPDATE direcciones_envio
                        SET destinatario = ?, calle_numero = ?, colonia = ?, ciudad = ?, estado = ?,
                            codigo_postal = ?, referencias = ?, telefono_contacto = ?
                      WHERE id = ? AND usuario_id = ?'
                );
                $st->execute([
                    $direccion['destinatario'], $direccion['calle'], $direccion['colonia'], $direccion['ciudad'],
                    $direccion['estado'], $direccion['cp'], $referencias !== '' ? $referencias : null,
                    $direccion['telefono'], $id, $usuarioId,
                ]);
                $mensaje = 'Dirección actualizada';
            } else {
                $st = db()->prepare(
                    'INSERT INTO direcciones_envio (usuario_id, destinatario, calle_numero, colonia, ciudad, estado,
                                                    codigo_postal, referencias, telefono_contacto, es_predeterminada)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $st->execute([
                    $usuarioId, $direccion['destinatario'], $direccion['calle'], $direccion['colonia'],
                    $direccion['ciudad'], $direccion['estado'], $direccion['cp'],
                    $referencias !== '' ? $referencias : null, $direccion['telefono'], 0,
                ]);
                $id = (int) db()->lastInsertId();
                $mensaje = 'Dirección guardada';
            }

            if ($predeterminada || es_la_primera('direcciones_envio', $usuarioId)) {
                marcar_predeterminada('direcciones_envio', $usuarioId, $id);
            }
            break;

        case 'direccion-eliminar':
            $id = (int) ($datos['id'] ?? 0);

            if ($id < 1) {
                json_error('Falta la dirección que quieres eliminar');
            }

            $st = db()->prepare('DELETE FROM direcciones_envio WHERE id = ? AND usuario_id = ?');
            $st->execute([$id, $usuarioId]);

            asegurar_predeterminada('direcciones_envio', $usuarioId);
            $mensaje = 'Dirección eliminada';
            break;

        /* ----- Seguridad: cambiar la contraseña ----- */
        case 'password':
            $actual = (string) ($datos['actual'] ?? '');
            $nueva = (string) ($datos['nueva'] ?? '');

            if ($actual === '') {
                json_error('Escribe tu contraseña actual');
            }

            /* La nueva se revisa con la regla común: 8 a 72 caracteres */
            $error = validar_campo($nueva, 'password');

            if ($error !== null) {
                json_error($error);
            }
            if ($nueva === $actual) {
                json_error('La contraseña nueva debe ser distinta a la actual');
            }

            $st = db()->prepare('SELECT password_hash FROM usuarios WHERE id = ? LIMIT 1');
            $st->execute([$usuarioId]);
            $hash = (string) $st->fetchColumn();

            if ($hash === '' || !password_verify($actual, $hash)) {
                json_error('Tu contraseña actual no es correcta', 403);
            }

            $st = db()->prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?');
            $st->execute([password_hash($nueva, PASSWORD_DEFAULT), $usuarioId]);
            $mensaje = 'Contraseña actualizada';
            break;

        default:
            json_error('Acción no válida: usa tarjeta-guardar, tarjeta-eliminar, direccion-guardar, direccion-eliminar o password');
    }

    json_salida([
        'ok'          => true,
        'mensaje'     => $mensaje,
        'usuario'     => usuario_actual(),
        'tarjetas'    => leer_tarjetas($usuarioId),
        'direcciones' => leer_direcciones($usuarioId),
    ]);
} catch (Throwable $e) {
    json_error('No se pudo actualizar tu perfil', 500, $e);
}
