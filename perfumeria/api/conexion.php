<?php
/**
 * conexion.php
 * Conexión única (PDO) a la base de datos de la tienda y utilidades JSON.
 *
 * Configuración por defecto de XAMPP: MySQL/MariaDB en 127.0.0.1 y el usuario
 * root sin contraseña. Si tu instalación tiene contraseña, cámbiala en DB_PASS.
 */
declare(strict_types=1);

const DB_HOST    = '127.0.0.1';
const DB_PORT    = 3306;
const DB_NAME    = 'perfumeria_db';
const DB_USER    = 'root';
const DB_PASS    = '';
const DB_CHARSET = 'utf8mb4';

/** Devuelve la conexión PDO (reutiliza la misma durante la petición). */
function db(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s', DB_HOST, DB_PORT, DB_NAME, DB_CHARSET);

    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);

    return $pdo;
}

/** Responde en JSON y termina la ejecución. */
function json_salida(array $datos, int $codigo = 200): void
{
    http_response_code($codigo);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Responde con un error en JSON. */
function json_error(string $mensaje, int $codigo = 400, ?Throwable $excepcion = null): void
{
    $respuesta = ['ok' => false, 'error' => $mensaje];

    if ($excepcion !== null) {
        $respuesta['detalle'] = $excepcion->getMessage();
    }

    json_salida($respuesta, $codigo);
}

/** Lee la tabla `configuracion` como arreglo asociativo clave => valor. */
function configuracion_tienda(): array
{
    $config = [];

    foreach (db()->query('SELECT clave, valor FROM configuracion')->fetchAll() as $fila) {
        $config[$fila['clave']] = is_numeric($fila['valor']) ? (int) $fila['valor'] : $fila['valor'];
    }

    return $config;
}

/** Un valor suelto de la tabla `configuracion`. */
function config_valor(string $clave, $defecto = null)
{
    $st = db()->prepare('SELECT valor FROM configuracion WHERE clave = ? LIMIT 1');
    $st->execute([$clave]);
    $valor = $st->fetchColumn();

    return $valor === false ? $defecto : $valor;
}

/* =====================================================================
   CUERPO Y SESIONES
   ===================================================================== */

/** Cuerpo de la petición (acepta JSON o formulario). */
function cuerpo(): array
{
    $crudo = file_get_contents('php://input');

    if ($crudo === false || $crudo === '') {
        return $_POST;
    }

    $datos = json_decode($crudo, true);

    return is_array($datos) ? $datos : $_POST;
}

function iniciar_sesion(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    /* La cookie de sesión no es accesible desde JavaScript, no se manda en
       peticiones de otros sitios y solo viaja cifrada cuando hay HTTPS. */
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure'   => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
    ]);

    session_start();
}

/** Cuántos dispositivos/navegadores pueden tener la cuenta abierta a la vez. */
const MAX_SESIONES_USUARIO = 5;

/** Días que dura una sesión antes de pedir las credenciales otra vez. */
const DIAS_SESION = 30;

/** Borra de `sesiones_usuario` el token indicado (si existe). */
function cerrar_fila_sesion(string $token): void
{
    if ($token === '') {
        return;
    }

    $st = db()->prepare('DELETE FROM sesiones_usuario WHERE token_sesion = ?');
    $st->execute([$token]);
}

/**
 * Fila de `sesiones_usuario` de esta petición.
 * Devuelve null (y limpia $_SESSION) si el token ya no existe o venció, así
 * una sesión cerrada desde otro dispositivo deja de servir de inmediato.
 */
function sesion_bd_actual(): ?array
{
    iniciar_sesion();

    $token = (string) ($_SESSION['token'] ?? '');

    if ($token === '') {
        return null;
    }

    $st = db()->prepare(
        'SELECT * FROM sesiones_usuario WHERE token_sesion = ? AND expira_en > NOW() LIMIT 1'
    );
    $st->execute([$token]);
    $fila = $st->fetch();

    if (!$fila) {
        $_SESSION = [];

        return null;
    }

    return $fila;
}

/**
 * Crea la sesión PHP y registra el token en `sesiones_usuario`.
 * Multisesiones: se permiten varios navegadores/dispositivos a la vez, con un
 * tope; al superarlo se cierra la sesión más antigua (nunca la actual).
 */
function abrir_sesion(array $usuario): void
{
    iniciar_sesion();
    session_regenerate_id(true);

    $usuarioId = (int) $usuario['id'];

    /* Si este navegador ya tenía sesión, su fila anterior deja de servir:
       cada inicio de sesión cuenta como un dispositivo nuevo. */
    cerrar_fila_sesion((string) ($_SESSION['token'] ?? ''));

    /* Limpieza de sesiones vencidas y respeto del tope de multisesiones */
    db()->exec('DELETE FROM sesiones_usuario WHERE expira_en <= NOW()');

    $st = db()->prepare('SELECT COUNT(*) FROM sesiones_usuario WHERE usuario_id = ?');
    $st->execute([$usuarioId]);
    $sobran = (int) $st->fetchColumn() - (MAX_SESIONES_USUARIO - 1);

    if ($sobran > 0) {
        /* El id es autoincremental: los más bajos son los inicios más viejos */
        $st = db()->prepare('DELETE FROM sesiones_usuario WHERE usuario_id = ? ORDER BY id ASC LIMIT ' . $sobran);
        $st->execute([$usuarioId]);
    }

    $token = bin2hex(random_bytes(32));

    $st = db()->prepare(
        'INSERT INTO sesiones_usuario (usuario_id, token_sesion, ip_origen, user_agent, expira_en)
         VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ' . DIAS_SESION . ' DAY))'
    );
    $st->execute([
        $usuarioId,
        $token,
        $_SERVER['REMOTE_ADDR'] ?? null,
        mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 400),
    ]);

    $_SESSION['usuario_id'] = $usuarioId;
    $_SESSION['token'] = $token;
    $_SESSION['sesion_id'] = (int) db()->lastInsertId();
}

function cerrar_sesion(): void
{
    iniciar_sesion();

    cerrar_fila_sesion((string) ($_SESSION['token'] ?? ''));
    $_SESSION = [];

    /* También se borra la cookie del navegador */
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();

        setcookie(session_name(), '', [
            'expires'  => time() - 42000,
            'path'     => $params['path'],
            'domain'   => $params['domain'],
            'secure'   => $params['secure'],
            'httponly' => $params['httponly'],
            'samesite' => 'Lax',
        ]);
    }

    if (session_status() === PHP_SESSION_ACTIVE) {
        session_destroy();
    }
}

/** Usuario de la sesión actual (o null). Incluye su tipo de usuario en `rol`. */
function usuario_actual(): ?array
{
    $filaSesion = sesion_bd_actual();

    if ($filaSesion === null) {
        return null;
    }

    $st = db()->prepare(
        'SELECT u.id, u.nombre, u.apellido, u.email, u.telefono,
                r.id AS rol_id, r.nombre AS rol
           FROM usuarios u
           JOIN roles r ON r.id = u.rol_id
          WHERE u.id = ? AND u.activo = TRUE'
    );
    $st->execute([(int) $filaSesion['usuario_id']]);
    $usuario = $st->fetch();

    if (!$usuario) {
        /* La cuenta se desactivó o perdió su rol mientras estaba dentro */
        cerrar_sesion();

        return null;
    }

    return $usuario;
}

/** Corta la ejecución con 401 si no hay sesión. */
function exigir_usuario(): array
{
    $usuario = usuario_actual();

    if ($usuario === null) {
        json_error('Necesitas iniciar sesión', 401);
    }

    return $usuario;
}

/**
 * Protección de rutas por tipo de usuario.
 * Exige sesión y uno de los roles indicados; si no, responde 401 o 403.
 *
 *   $admin = exigir_rol('admin');
 */
function exigir_rol(string ...$roles): array
{
    $usuario = exigir_usuario();

    if (!in_array((string) ($usuario['rol'] ?? ''), $roles, true)) {
        json_error('No tienes permiso para esta sección', 403);
    }

    return $usuario;
}

/* =====================================================================
   CARRITO
   ===================================================================== */

/** Devuelve el id del carrito del usuario, creándolo si no existe. */
function asegurar_carrito(int $usuarioId): int
{
    $st = db()->prepare('SELECT id FROM carritos WHERE usuario_id = ? LIMIT 1');
    $st->execute([$usuarioId]);
    $id = $st->fetchColumn();

    if ($id !== false) {
        return (int) $id;
    }

    $st = db()->prepare('INSERT INTO carritos (usuario_id) VALUES (?)');
    $st->execute([$usuarioId]);

    return (int) db()->lastInsertId();
}

/** Items del carrito + subtotal, envío y total calculados en el servidor. */
function resumen_carrito(int $carritoId): array
{
    $st = db()->prepare(
        'SELECT ci.variante_id, ci.cantidad, vc.producto_slug AS slug, vc.nombre, vc.marca,
                vc.precio_actual, vc.stock, vc.volumen_ml, vc.concentracion, vc.c1, vc.c2
           FROM carrito_items ci
           JOIN v_catalogo vc ON vc.variante_id = ci.variante_id
          WHERE ci.carrito_id = ?
          ORDER BY ci.agregado_en, ci.id'
    );
    $st->execute([$carritoId]);

    $items = array_map(static function (array $i): array {
        $i['variante_id'] = (int) $i['variante_id'];
        $i['cantidad'] = (int) $i['cantidad'];
        $i['stock'] = (int) $i['stock'];
        $i['precio'] = (float) $i['precio_actual'];
        $i['subtotal'] = round($i['precio'] * $i['cantidad'], 2);
        unset($i['precio_actual']);
        return $i;
    }, $st->fetchAll());

    $subtotal = round((float) array_sum(array_column($items, 'subtotal')), 2);
    $minimo = (float) config_valor('envio_gratis_desde', 599);
    $base = (float) config_valor('costo_envio_base', 99);
    $envio = ($subtotal > 0 && $subtotal < $minimo) ? $base : 0.0;

    return [
        'items'               => $items,
        'subtotal'            => $subtotal,
        'costo_envio'         => $envio,
        'total'               => round($subtotal + $envio, 2),
        'envio_gratis_desde'  => $minimo,
        'costo_envio_base'    => $base,
        'meses_sin_intereses' => (int) config_valor('meses_sin_intereses', 12),
        'piezas'              => (int) array_sum(array_column($items, 'cantidad')),
    ];
}

/* =====================================================================
   VALIDACIÓN DE DATOS DE ENTRADA
   Reglas ÚNICAS del servidor para todo lo que escribe el usuario. Son el
   espejo de assets/js/validacion.js: el navegador valida para avisar al
   instante, pero aquí se vuelve a validar siempre, porque el cliente (o
   cualquiera con curl) no es de fiar.
   ===================================================================== */

/** Patrones permitidos por tipo de dato (PCRE con /u, iguales en el navegador) */
const PATRON_NOMBRE     = '/^[\p{L}\p{M}](?:[\p{L}\p{M} .\'-]){1,99}$/u';
const PATRON_PERSONA    = '/^[\p{L}\p{M}](?:[\p{L}\p{M}\p{N} .\'-]){1,99}$/u';   // nombres con número (Depto 402)
const PATRON_TEXTO      = '/^[\p{L}\p{N}](?:[\p{L}\p{N}\p{M} .,#\/°º()&+\'-]){2,119}$/u';
const PATRON_REFERENCIA = '/^[\p{L}\p{N}](?:[\p{L}\p{N}\p{M} .,#\/°º()&+\'-]){0,159}$/u';
const PATRON_EMAIL      = '/^[^\s@<>"\']+@[^\s@<>"\']+\.[\p{L}]{2,}$/u';
const PATRON_TELEFONO   = '/^[0-9+()\s.\'-]{10,20}$/';
const PATRON_CP         = '/^\d{4,5}$/';
const PATRON_BUSCAR     = '/^[\p{L}\p{N}\p{M}\s.,\'&@()_+\/-]{2,60}$/u';
const PATRON_CORTA      = '/^[\p{L}\p{N}][\p{L}\p{N}\p{M} .\'-]{0,39}$/u';

/** Nada que se pueda leer como etiqueta o pseudo-protocolo */
const PATRON_CODIGO = '/<\s*\/?\s*[a-z!]|javascript:|vbscript:|data:text|on[a-z]+\s*=/i';

/**
 * Reglas por campo: etiqueta para el mensaje, largo mínimo/máximo, patrón y
 * dígitos obligatorios. 'codigo' => false solo donde los símbolos son
 * legítimos (correo y contraseña).
 */
const CAMPOS_VALIDOS = [
    'nombre'          => ['etiqueta' => 'nombre',        'min' => 2, 'max' => 100, 'patron' => PATRON_NOMBRE],
    'apellido'        => ['etiqueta' => 'apellido',      'min' => 2, 'max' => 100, 'patron' => PATRON_NOMBRE],
    'destinatario'    => ['etiqueta' => 'destinatario',  'min' => 2, 'max' => 100, 'patron' => PATRON_PERSONA],
    'titular'         => ['etiqueta' => 'nombre del titular', 'min' => 3, 'max' => 100, 'patron' => PATRON_NOMBRE],
    'email'           => ['etiqueta' => 'correo',        'min' => 5, 'max' => 150, 'patron' => PATRON_EMAIL, 'codigo' => false],
    'password'        => ['etiqueta' => 'contraseña',    'min' => 8, 'max' => 72, 'codigo' => false],
    'telefono'        => ['etiqueta' => 'teléfono',      'min' => 10, 'max' => 20, 'patron' => PATRON_TELEFONO, 'digitos' => 10],
    'calle'           => ['etiqueta' => 'calle y número', 'min' => 4, 'max' => 120, 'patron' => PATRON_TEXTO],
    'colonia'         => ['etiqueta' => 'colonia',       'min' => 3, 'max' => 120, 'patron' => PATRON_TEXTO],
    'ciudad'          => ['etiqueta' => 'ciudad',        'min' => 3, 'max' => 60, 'patron' => PATRON_TEXTO],
    'estado'          => ['etiqueta' => 'estado',        'min' => 3, 'max' => 60, 'patron' => PATRON_TEXTO],
    'referencias'     => ['etiqueta' => 'referencias',   'min' => 0, 'max' => 160, 'patron' => PATRON_REFERENCIA, 'obligatorio' => false],
    'cp'              => ['etiqueta' => 'código postal', 'min' => 4, 'max' => 5, 'patron' => PATRON_CP],
    'buscar'          => ['etiqueta' => 'búsqueda',      'min' => 2, 'max' => 60, 'patron' => PATRON_BUSCAR],
    'marca'           => ['etiqueta' => 'marca de la tarjeta', 'min' => 1, 'max' => 30, 'patron' => PATRON_CORTA],
    'ultimos4'        => ['etiqueta' => 'tarjeta',       'min' => 4, 'max' => 4, 'patron' => '/^\d{4}$/'],
    'mes'             => ['etiqueta' => 'mes de vencimiento', 'min' => 1, 'max' => 2, 'patron' => '/^(?:[1-9]|1[0-2])$/'],
    'anio'            => ['etiqueta' => 'año de vencimiento', 'min' => 4, 'max' => 4, 'patron' => '/^\d{4}$/'],
];

/** Marcas de tarjeta aceptadas (el navegador las deduce del número) */
const MARCAS_TARJETA = ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER', 'TARJETA'];

/** Métodos de pago que acepta el checkout (lista blanca) */
const METODOS_PAGO = ['Tarjeta de crédito/débito', 'PayPal', 'OXXO'];

/** ¿El texto parece código (etiqueta, javascript:, onalgo=)? */
function contiene_codigo(string $valor): bool
{
    return preg_match(PATRON_CODIGO, $valor) === 1;
}

/** Texto de entrada limpio: sin controles ni bytes inválidos, recortado. */
function texto_entrada(string $valor): string
{
    $limpio = preg_replace('/[\x00-\x1F\x7F]/u', '', $valor);
    $limpio = is_string($limpio) ? trim($limpio) : '';

    return $limpio;
}

/** Atajo: un campo del cuerpo de la petición, ya limpio. */
function campo(array $datos, string $clave): string
{
    return texto_entrada((string) ($datos[$clave] ?? ''));
}

/** Solo los dígitos de un valor ('55 12-34' -> '551234'). */
function solo_digitos(string $valor): string
{
    return (string) preg_replace('/\D/', '', $valor);
}

/**
 * Valida un campo contra CAMPOS_VALIDOS.
 * Devuelve el mensaje de error o null si todo está bien. Con $obligatorio en
 * null manda lo que diga la regla del campo (por ejemplo las referencias son
 * opcionales); con false, un valor vacío siempre se acepta.
 */
function validar_campo(string $valor, string $clave, ?bool $obligatorio = null): ?string
{
    $regla = CAMPOS_VALIDOS[$clave] ?? null;

    if ($regla === null) {
        return 'El campo ' . $clave . ' no está permitido';
    }

    $exigido = $obligatorio === null ? ($regla['obligatorio'] ?? true) : $obligatorio;
    $largo = mb_strlen($valor);

    if ($largo === 0) {
        return $exigido ? 'Falta el dato: ' . $regla['etiqueta'] : null;
    }
    if ($largo < $regla['min']) {
        return 'Revisa «' . $regla['etiqueta'] . '»: escribe al menos ' . $regla['min'] . ' caracteres';
    }
    if ($largo > $regla['max']) {
        return 'Revisa «' . $regla['etiqueta'] . '»: máximo ' . $regla['max'] . ' caracteres';
    }
    if (isset($regla['patron']) && preg_match($regla['patron'], $valor) !== 1) {
        return 'Revisa «' . $regla['etiqueta'] . '»: tiene caracteres que no se permiten';
    }
    if (isset($regla['digitos']) && strlen(solo_digitos($valor)) < $regla['digitos']) {
        return 'Revisa «' . $regla['etiqueta'] . '»: deben ser al menos ' . $regla['digitos'] . ' dígitos';
    }
    if (($regla['codigo'] ?? true) && contiene_codigo($valor)) {
        return 'Revisa «' . $regla['etiqueta'] . '»: quita los símbolos de programación';
    }

    return null;
}

/** Revisa varios campos de golpe: devuelve el primer mensaje de error o null. */
function validar_campos(array $valores, ?bool $obligatorio = null): ?string
{
    foreach ($valores as $clave => $valor) {
        $error = validar_campo((string) $valor, (string) $clave, $obligatorio);

        if ($error !== null) {
            return $error;
        }
    }

    return null;
}

/** Un valor que debe venir de una lista blanca (si no, se usa el de respaldo). */
function lista_blanca(string $valor, array $permitidos, string $respaldo): string
{
    return in_array($valor, $permitidos, true) ? $valor : $respaldo;
}

/**
 * Método de pago: tiene que ser una de las formas de pago de la tienda o una
 * tarjeta guardada ("Mastercard •••• 1234"). Cualquier otro texto no pasa.
 */
function metodo_pago_valido(string $metodo): string
{
    if (in_array($metodo, METODOS_PAGO, true)) {
        return $metodo;
    }

    return preg_match('/^[\p{L}\p{N} ]{1,30}\s(?:•|\*)+\s?\d{4}$/u', $metodo) === 1
        ? $metodo
        : METODOS_PAGO[0];
}

/** ¿El cuerpo traía marcado un booleano (checkbox)? */
function booleano_entrada($valor): bool
{
    if (is_bool($valor)) {
        return $valor;
    }

    return in_array($valor, ['1', 1, 'true', 'on', 'si', 'sí'], true);
}

/**
 * Marca de tarjeta en su forma "bonita" o null si no está en la lista blanca.
 * El navegador deduce la marca del número; aquí solo se acepta lo conocido.
 */
function marca_tarjeta_canonica(string $marca): ?string
{
    $canonicas = [
        'VISA'       => 'VISA',
        'MASTERCARD' => 'Mastercard',
        'AMEX'       => 'AMEX',
        'DISCOVER'   => 'Discover',
        'TARJETA'    => 'Tarjeta',
    ];

    return $canonicas[strtoupper($marca)] ?? null;
}

