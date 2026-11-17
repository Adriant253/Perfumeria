<?php
/**
 * admin.php — panel de administración (pages/admin.html).
 *
 *   GET  api/admin.php                          -> resumen + usuarios + roles
 *   POST api/admin.php?accion=rol               { usuario_id, rol }
 *   POST api/admin.php?accion=activo            { usuario_id, activo }
 *   POST api/admin.php?accion=sesiones-cerrar   { usuario_id }
 *
 * PROTECCIÓN DE RUTAS: todo el archivo exige una sesión con rol `admin`
 * (ver exigir_rol() en conexion.php). Un cliente que escriba la URL a mano
 * recibe 403, aunque conozca el endpoint: el guardia del navegador
 * (assets/js/guardia.js) solo mejora la experiencia, no es la seguridad.
 *
 * Reglas para no quedarse fuera del propio panel:
 *  - Nadie puede cambiar su propio rol ni desactivar su propia cuenta.
 *  - Los roles válidos salen de la tabla `roles` (nunca de la petición libre).
 */
declare(strict_types=1);

require __DIR__ . '/conexion.php';

$usuario = exigir_rol('admin');
$usuarioId = (int) $usuario['id'];
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$accion = (string) ($_GET['accion'] ?? '');

/** Roles disponibles para asignar (id => nombre). */
function roles_disponibles(): array
{
    $roles = [];

    foreach (db()->query('SELECT id, nombre FROM roles ORDER BY id')->fetchAll() as $fila) {
        $roles[(int) $fila['id']] = (string) $fila['nombre'];
    }

    return $roles;
}

/** Usuarios con su tipo de cuenta, sesiones abiertas y pedidos. */
function listar_usuarios(): array
{
    $st = db()->query(
        'SELECT u.id, u.rol_id, r.nombre AS rol, u.nombre, u.apellido, u.email,
                u.telefono, u.activo,
                (SELECT COUNT(*) FROM sesiones_usuario s
                  WHERE s.usuario_id = u.id AND s.expira_en > NOW()) AS sesiones,
                (SELECT COUNT(*) FROM pedidos p WHERE p.usuario_id = u.id) AS pedidos
           FROM usuarios u
           JOIN roles r ON r.id = u.rol_id
          ORDER BY u.id DESC'
    );

    return array_map(static function (array $u): array {
        return [
            'id'       => (int) $u['id'],
            'rol_id'   => (int) $u['rol_id'],
            'rol'      => (string) $u['rol'],
            'nombre'   => (string) $u['nombre'],
            'apellido' => (string) $u['apellido'],
            'email'    => (string) $u['email'],
            'telefono' => $u['telefono'],
            'activo'   => (int) $u['activo'] === 1,
            'sesiones' => (int) $u['sesiones'],
            'pedidos'  => (int) $u['pedidos'],
        ];
    }, $st->fetchAll());
}

/** Todo lo que pinta pages/admin.html en una sola respuesta. */
function datos_panel(int $usuarioId): array
{
    $pdo = db();

    $totalUsuarios = (int) $pdo->query('SELECT COUNT(*) FROM usuarios')->fetchColumn();
    $usuariosActivos = (int) $pdo->query('SELECT COUNT(*) FROM usuarios WHERE activo = TRUE')->fetchColumn();
    $administradores = (int) $pdo->query(
        "SELECT COUNT(*) FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE r.nombre = 'admin'"
    )->fetchColumn();
    $sesiones = (int) $pdo->query('SELECT COUNT(*) FROM sesiones_usuario WHERE expira_en > NOW()')->fetchColumn();
    $pedidos = (int) $pdo->query('SELECT COUNT(*) FROM pedidos')->fetchColumn();
    $ventas = (float) $pdo->query('SELECT COALESCE(SUM(total), 0) FROM pedidos')->fetchColumn();

    return [
        'ok'      => true,
        'usuario' => usuario_actual(),
        'roles'   => roles_disponibles(),
        'resumen' => [
            'usuarios'        => $totalUsuarios,
            'activos'         => $usuariosActivos,
            'administradores' => $administradores,
            'sesiones'        => $sesiones,
            'pedidos'         => $pedidos,
            'ventas'          => $ventas,
        ],
        'usuarios' => listar_usuarios(),
    ];
}

try {
    if ($metodo === 'GET') {
        json_salida(datos_panel($usuarioId));
    }

    if ($metodo !== 'POST') {
        json_error('Método no permitido, usa GET o POST', 405);
    }

    $datos = cuerpo();
    $objetivoId = (int) ($datos['usuario_id'] ?? 0);

    if ($objetivoId < 1) {
        json_error('Falta el usuario sobre el que quieres actuar');
    }

    /* El usuario objetivo tiene que existir antes de tocar nada */
    $st = db()->prepare('SELECT id FROM usuarios WHERE id = ? LIMIT 1');
    $st->execute([$objetivoId]);

    if ($st->fetchColumn() === false) {
        json_error('Ese usuario no existe', 404);
    }

    $mensaje = '';

    switch ($accion) {
        /* ----- Cambiar el tipo de usuario (cliente / admin) ----- */
        case 'rol':
            if ($objetivoId === $usuarioId) {
                json_error('No puedes cambiar tu propio rol');
            }

            $rol = campo($datos, 'rol');
            $roles = roles_disponibles();

            if (!in_array($rol, $roles, true)) {
                json_error('Ese tipo de usuario no existe');
            }

            $st = db()->prepare('UPDATE usuarios SET rol_id = ? WHERE id = ?');
            $st->execute([array_search($rol, $roles, true), $objetivoId]);

            $mensaje = 'Tipo de usuario actualizado';
            break;

        /* ----- Activar o desactivar una cuenta ----- */
        case 'activo':
            if ($objetivoId === $usuarioId) {
                json_error('No puedes desactivar tu propia cuenta');
            }

            $activo = booleano_entrada($datos['activo'] ?? false);

            $st = db()->prepare('UPDATE usuarios SET activo = ? WHERE id = ?');
            $st->execute([$activo ? 1 : 0, $objetivoId]);

            /* Una cuenta desactivada pierde sus sesiones de inmediato */
            if (!$activo) {
                $st = db()->prepare('DELETE FROM sesiones_usuario WHERE usuario_id = ?');
                $st->execute([$objetivoId]);
            }

            $mensaje = $activo ? 'Cuenta activada' : 'Cuenta desactivada y sesiones cerradas';
            break;

        /* ----- Cerrar todas las sesiones de un usuario (multisesiones) ----- */
        case 'sesiones-cerrar':
            $st = db()->prepare('DELETE FROM sesiones_usuario WHERE usuario_id = ?');
            $st->execute([$objetivoId]);

            $mensaje = 'Cerramos las sesiones de ese usuario';
            break;

        default:
            json_error('Acción no válida: usa rol, activo o sesiones-cerrar');
    }

    json_salida(array_merge(datos_panel($usuarioId), ['mensaje' => $mensaje]));
} catch (Throwable $e) {
    json_error('No se pudo completar la acción del panel', 500, $e);
}
