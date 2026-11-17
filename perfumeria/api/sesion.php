<?php
/**
 * sesion.php
 *   GET  api/sesion.php                  -> ¿hay sesión activa? (usuario o null)
 *   GET  api/sesion.php?accion=token     -> ¿el enlace de recuperación sigue sirviendo?
 *   GET  api/sesion.php?accion=sesiones  -> sesiones abiertas (multisesiones)
 *   POST api/sesion.php?accion=login     { email, password }
 *   POST api/sesion.php?accion=registro  { nombre, apellido, email, password, telefono? }
 *   POST api/sesion.php?accion=logout
 *   POST api/sesion.php?accion=cerrar-sesion { id }  -> cierra otro dispositivo
 *   POST api/sesion.php?accion=cerrar-otras          -> cierra todas menos esta
 *   POST api/sesion.php?accion=recuperar   { email }            -> enlace para contraseña nueva
 *   POST api/sesion.php?accion=restablecer { token, password }  -> guarda la contraseña nueva
 *
 * El tipo de usuario (`rol`: cliente o admin) viaja en la respuesta de sesión:
 * el panel de administración se protege con exigir_rol('admin') en PHP y con
 * assets/js/guardia.js en el navegador.
 *
 * Las contraseñas se guardan con password_hash() y se validan con
 * password_verify(); cada sesión queda registrada en `sesiones_usuario`.
 * Los enlaces de "olvidé mi contraseña" viven en `recuperacion_contrasena`
 * (ver api/sql/recuperacion_contrasena.sql): token al azar del que solo se
 * guarda su sha256, caduca en 30 minutos y se usa una sola vez.
 */
declare(strict_types=1);

require __DIR__ . '/conexion.php';

/* =====================================================================
   RECUPERAR CONTRASEÑA
   ===================================================================== */

/** Minutos de vigencia del enlace que se manda por correo. */
const MINUTOS_ENLACE = 30;

/** Límite de enlaces que se pueden pedir por cuenta en la ventana indicada. */
const MAX_ENLACES_POR_VENTANA = 3;
const MINUTOS_VENTANA_ENLACES = 15;

/** Este proyecto no tiene servidor de correo (SMTP), así que la API devuelve
    el enlace en la respuesta para poder probar el flujo. Con correo real,
    ponlo en false y manda $enlace con mail() o SMTP. */
const MOSTRAR_ENLACE_DEMO = true;

/** URL absoluta de la carpeta del sitio (funciona con XAMPP y con php -S). */
function url_sitio(): string
{
    $esquema = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https://' : 'http://';
    $host = (string) ($_SERVER['HTTP_HOST'] ?? 'localhost');
    $carpeta = str_replace('\\', '/', dirname(dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/api/sesion.php'))));

    return rtrim($esquema . $host . $carpeta, '/');
}

/** Enlace vigente a partir del token en claro (en la tabla solo vive el sha256). */
function buscar_enlace(string $token): ?array
{
    if ($token === '') {
        return null;
    }

    $st = db()->prepare(
        'SELECT r.id, r.usuario_id, r.expira_en, u.email
           FROM recuperacion_contrasena r
           JOIN usuarios u ON u.id = r.usuario_id
          WHERE r.token_hash = ? AND r.usado_en IS NULL AND r.expira_en > NOW()
          LIMIT 1'
    );
    $st->execute([hash('sha256', $token)]);
    $fila = $st->fetch();

    return $fila ?: null;
}

/** c***@dominio.com: confirma la cuenta sin revelarla completa. */
function correo_cifrado(string $email): string
{
    $partes = array_pad(explode('@', $email, 2), 2, '');
    $usuario = $partes[0];
    $dominio = $partes[1];

    return mb_substr($usuario, 0, 1) . str_repeat('*', max(2, mb_strlen($usuario) - 1)) . '@' . $dominio;
}

/** Nombre legible del navegador y el sistema a partir del user_agent. */
function dispositivo(string $userAgent): string
{
    $navegadores = [
        'Edg'     => 'Edge',
        'OPR'     => 'Opera',
        'Chrome'  => 'Chrome',
        'Firefox' => 'Firefox',
        'Safari'  => 'Safari',
    ];
    $sistemas = [
        'Windows' => 'Windows',
        'Android' => 'Android',
        'iPhone'  => 'iPhone',
        'iPad'    => 'iPad',
        'Mac OS'  => 'macOS',
        'Linux'   => 'Linux',
    ];

    $navegador = null;
    foreach ($navegadores as $clave => $nombre) {
        if (stripos($userAgent, $clave) !== false) {
            $navegador = $nombre;
            break;
        }
    }

    $sistema = null;
    foreach ($sistemas as $clave => $nombre) {
        if (stripos($userAgent, $clave) !== false) {
            $sistema = $nombre;
            break;
        }
    }

    if ($navegador === null && $sistema === null) {
        return 'Dispositivo desconocido';
    }

    return trim(($navegador ?? 'Navegador') . ' · ' . ($sistema ?? 'sistema desconocido'));
}

/**
 * Sesiones abiertas de una cuenta (multisesiones).
 * Marca con `actual` la que corresponde a esta petición y nunca devuelve el
 * token completo: solo lo necesario para que el usuario reconozca el equipo.
 */
function listar_sesiones(int $usuarioId, string $tokenActual): array
{
    $st = db()->prepare(
        'SELECT * FROM sesiones_usuario
          WHERE usuario_id = ? AND expira_en > NOW()
          ORDER BY id DESC'
    );
    $st->execute([$usuarioId]);

    return array_map(static function (array $s) use ($tokenActual): array {
        $token = (string) ($s['token_sesion'] ?? '');

        return [
            'id'          => (int) $s['id'],
            'actual'      => $token !== '' && hash_equals($tokenActual, $token),
            'dispositivo' => dispositivo((string) ($s['user_agent'] ?? '')),
            'ip'          => (string) ($s['ip_origen'] ?? ''),
            'creada'      => $s['creado_en'] ?? null,
            'expira'      => $s['expira_en'] ?? null,
        ];
    }, $st->fetchAll());
}

iniciar_sesion();

$accion = (string) ($_GET['accion'] ?? '');
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';

/* ------------------------------------------------------------------ GET */
/* ¿El enlace de recuperación sigue vigente? Lo consulta pages/recuperar.html */
if ($metodo === 'GET' && $accion === 'token') {
    try {
        $enlace = buscar_enlace((string) ($_GET['token'] ?? ''));

        json_salida([
            'ok'     => true,
            'valido' => $enlace !== null,
            'correo' => $enlace === null ? null : correo_cifrado((string) $enlace['email']),
            'expira' => $enlace === null ? null : $enlace['expira_en'],
        ]);
    } catch (Throwable $e) {
        json_error('No se pudo revisar el enlace', 500, $e);
    }
}

/* ¿Qué dispositivos tienen la cuenta abierta? Lo consulta pages/tienda.html
   en la pestaña "Sesiones" de Mi perfil. */
if ($metodo === 'GET' && $accion === 'sesiones') {
    $usuario = exigir_usuario();

    try {
        json_salida([
            'ok'       => true,
            'sesiones' => listar_sesiones((int) $usuario['id'], (string) ($_SESSION['token'] ?? '')),
        ]);
    } catch (Throwable $e) {
        json_error('No se pudieron leer tus sesiones', 500, $e);
    }
}

if ($metodo === 'GET') {
    $usuario = usuario_actual();

    json_salida([
        'ok'          => true,
        'autenticado' => $usuario !== null,
        'usuario'     => $usuario,
    ]);
}

if ($metodo !== 'POST') {
    json_error('Método no permitido, usa GET o POST', 405);
}

$datos = cuerpo();

try {
    switch ($accion) {
        case 'login':
            /* Validación de entrada: correo con formato y contraseña 8-72
               (ver CAMPOS_VALIDOS en conexion.php) */
            $email = campo($datos, 'email');
            $password = (string) ($datos['password'] ?? '');

            $error = validar_campo($email, 'email') ?? validar_campo($password, 'password');

            if ($error !== null) {
                json_error($error);
            }

            $st = db()->prepare('SELECT id, nombre, apellido, email, password_hash, activo FROM usuarios WHERE email = ? LIMIT 1');
            $st->execute([$email]);
            $fila = $st->fetch();

            if (!$fila || !password_verify($password, (string) $fila['password_hash'])) {
                json_error('Correo o contraseña incorrectos', 401);
            }

            if ((int) $fila['activo'] !== 1) {
                json_error('Tu cuenta está desactivada', 403);
            }

            /* Si el algoritmo de hash mejoró desde que se registró, se actualiza */
            if (password_needs_rehash((string) $fila['password_hash'], PASSWORD_DEFAULT)) {
                $st = db()->prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?');
                $st->execute([password_hash($password, PASSWORD_DEFAULT), (int) $fila['id']]);
            }

            abrir_sesion($fila);
            json_salida(['ok' => true, 'usuario' => usuario_actual(), 'mensaje' => 'Bienvenido de nuevo']);

            // no break: json_salida() termina la ejecución

        case 'registro':
            $nombre = campo($datos, 'nombre');
            $apellido = campo($datos, 'apellido');
            $email = campo($datos, 'email');
            $telefono = campo($datos, 'telefono');
            $password = (string) ($datos['password'] ?? '');

            /* Obligatorios: nombre, apellido, correo y contraseña */
            $error = validar_campos([
                'nombre'   => $nombre,
                'apellido' => $apellido,
                'email'    => $email,
                'password' => $password,
            ]);

            /* El teléfono es opcional, pero si viene se revisa igual */
            if ($error === null) {
                $error = validar_campo($telefono, 'telefono', false);
            }

            if ($error !== null) {
                json_error($error);
            }

            $st = db()->prepare('SELECT id FROM usuarios WHERE email = ? LIMIT 1');
            $st->execute([$email]);

            if ($st->fetch()) {
                json_error('Ese correo ya tiene una cuenta', 409);
            }

            $rolId = (int) db()->query("SELECT id FROM roles WHERE nombre = 'cliente'")->fetchColumn();

            $st = db()->prepare(
                'INSERT INTO usuarios (rol_id, nombre, apellido, email, password_hash, telefono)
                 VALUES (?, ?, ?, ?, ?, ?)'
            );
            $st->execute([
                $rolId,
                $nombre,
                $apellido,
                $email,
                password_hash($password, PASSWORD_DEFAULT),
                $telefono !== '' ? $telefono : null,
            ]);

            $usuarioId = (int) db()->lastInsertId();
            asegurar_carrito($usuarioId);
            abrir_sesion(['id' => $usuarioId]);

            json_salida([
                'ok'      => true,
                'usuario' => usuario_actual(),
                'mensaje' => 'Tu cuenta fue creada',
            ], 201);

        /* ----- Olvidé mi contraseña: enlace de un solo uso ----- */
        case 'recuperar':
            $email = campo($datos, 'email');

            /* Se revisa el formato (mismo patrón que el navegador) */
            $error = validar_campo($email, 'email');

            if ($error !== null) {
                json_error($error);
            }

            /* La respuesta es siempre la misma: así nadie puede averiguar
               qué correos tienen cuenta en la tienda. */
            $enlaceCreado = null;

            $st = db()->prepare('SELECT id, activo FROM usuarios WHERE email = ? LIMIT 1');
            $st->execute([$email]);
            $fila = $st->fetch();

            if ($fila && (int) $fila['activo'] === 1) {
                $usuarioId = (int) $fila['id'];

                /* Límite de enlaces: evita saturar la tabla o el correo de una
                   persona con solicitudes repetidas. */
                $st = db()->prepare(
                    'SELECT COUNT(*) FROM recuperacion_contrasena
                      WHERE usuario_id = ? AND creado_en > DATE_SUB(NOW(), INTERVAL ? MINUTE)'
                );
                $st->execute([$usuarioId, MINUTOS_VENTANA_ENLACES]);

                if ((int) $st->fetchColumn() >= MAX_ENLACES_POR_VENTANA) {
                    json_error(
                        'Pediste varios enlaces seguidos. Espera ' . MINUTOS_VENTANA_ENLACES . ' minutos y vuelve a intentarlo.',
                        429
                    );
                }

                /* Limpieza de enlaces usados o vencidos de días anteriores */
                db()->exec(
                    'DELETE FROM recuperacion_contrasena
                      WHERE expira_en < DATE_SUB(NOW(), INTERVAL 1 DAY)
                         OR (usado_en IS NOT NULL AND usado_en < DATE_SUB(NOW(), INTERVAL 1 DAY))'
                );

                /* Un solo enlace vigente por cuenta: los anteriores dejan de servir */
                $st = db()->prepare('UPDATE recuperacion_contrasena SET usado_en = NOW() WHERE usuario_id = ? AND usado_en IS NULL');
                $st->execute([$usuarioId]);

                $token = bin2hex(random_bytes(32));

                $st = db()->prepare(
                    'INSERT INTO recuperacion_contrasena (usuario_id, token_hash, expira_en)
                     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))'
                );
                $st->execute([$usuarioId, hash('sha256', $token), MINUTOS_ENLACE]);

                $enlaceCreado = url_sitio() . '/pages/recuperar.html?token=' . $token;

                /* TODO: enviar $enlaceCreado por correo (mail() o SMTP). Sin servidor
                   de correo, en modo demo se devuelve en la respuesta. */
            }

            json_salida([
                'ok'      => true,
                'mensaje' => 'Si ese correo tiene una cuenta, te mandamos un enlace para crear una contraseña nueva.',
                'enlace'  => MOSTRAR_ENLACE_DEMO ? $enlaceCreado : null,
                'minutos' => MINUTOS_ENLACE,
            ]);

        case 'restablecer':
            $token = campo($datos, 'token');
            $password = (string) ($datos['password'] ?? '');
            $repetir = (string) ($datos['repetir'] ?? $password);

            $error = validar_campo($password, 'password');

            if ($error !== null) {
                json_error($error);
            }
            if ($password !== $repetir) {
                json_error('Las dos contraseñas deben ser iguales');
            }

            $enlace = buscar_enlace($token);

            if ($enlace === null) {
                json_error('El enlace no es válido o ya caducó. Pide uno nuevo.', 410);
            }

            $pdo = db();
            $pdo->beginTransaction();

            try {
                $st = $pdo->prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?');
                $st->execute([password_hash($password, PASSWORD_DEFAULT), (int) $enlace['usuario_id']]);

                $st = $pdo->prepare('UPDATE recuperacion_contrasena SET usado_en = NOW() WHERE id = ?');
                $st->execute([(int) $enlace['id']]);

                /* Quien tuviera la sesión abierta con la contraseña vieja sale */
                $st = $pdo->prepare('DELETE FROM sesiones_usuario WHERE usuario_id = ?');
                $st->execute([(int) $enlace['usuario_id']]);

                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }

                throw $e;
            }

            json_salida([
                'ok'      => true,
                'mensaje' => 'Tu contraseña quedó actualizada. Ya puedes entrar con ella.',
            ]);

        /* ----- Multisesiones: cerrar un dispositivo o los demás ----- */
        case 'cerrar-sesion':
            $usuario = exigir_usuario();
            $id = (int) ($datos['id'] ?? 0);

            if ($id < 1) {
                json_error('Falta la sesión que quieres cerrar');
            }

            $st = db()->prepare('SELECT token_sesion FROM sesiones_usuario WHERE id = ? AND usuario_id = ? LIMIT 1');
            $st->execute([$id, (int) $usuario['id']]);
            $tokenFila = $st->fetchColumn();

            if ($tokenFila === false) {
                json_error('Esa sesión ya no existe', 404);
            }

            $esActual = hash_equals((string) ($_SESSION['token'] ?? ''), (string) $tokenFila);

            $st = db()->prepare('DELETE FROM sesiones_usuario WHERE id = ?');
            $st->execute([$id]);

            /* Si cerró la sesión desde la que navega, se limpia también aquí */
            if ($esActual) {
                cerrar_sesion();

                json_salida(['ok' => true, 'mensaje' => 'Sesión cerrada', 'sesion_actual' => true]);
            }

            json_salida([
                'ok'            => true,
                'mensaje'       => 'Cerramos esa sesión',
                'sesion_actual' => false,
                'sesiones'      => listar_sesiones((int) $usuario['id'], (string) ($_SESSION['token'] ?? '')),
            ]);

        case 'cerrar-otras':
            $usuario = exigir_usuario();

            $st = db()->prepare('DELETE FROM sesiones_usuario WHERE usuario_id = ? AND token_sesion <> ?');
            $st->execute([(int) $usuario['id'], (string) ($_SESSION['token'] ?? '')]);

            json_salida([
                'ok'       => true,
                'mensaje'  => 'Cerramos las demás sesiones',
                'sesiones' => listar_sesiones((int) $usuario['id'], (string) ($_SESSION['token'] ?? '')),
            ]);

        case 'logout':
            cerrar_sesion();
            json_salida(['ok' => true, 'mensaje' => 'Sesión cerrada']);

        default:
            json_error('Acción no válida: usa login, registro, logout, cerrar-sesion, cerrar-otras, recuperar o restablecer');
    }
} catch (Throwable $e) {
    json_error('No se pudo procesar la sesión', 500, $e);
}
