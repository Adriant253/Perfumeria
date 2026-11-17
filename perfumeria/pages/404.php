<?php
declare(strict_types=1);
/**
 * Página 404 del sitio (.htaccess la sirve para cualquier ruta inexistente).
 *
 * Reglas de negocio que no son obvias en el código:
 *  - Siempre responde 404 + X-Robots-Tag: noindex; una página de error no debe
 *    heredar el 200 de Apache ni indexarse.
 *  - No consulta MySQL: tiene que verse aunque la base esté caída. Las categorías
 *    del HTML son el respaldo y error404.js las repinta solo si su API responde
 *    con datos que pasen validación.
 *  - La URL y el método pedidos se sanean aquí y el navegador los revalida antes
 *    de pintarlos: nunca se imprime el valor tal como llegó.
 */

// dirname() usa la barra del sistema (\pages en Windows); sin normalizar, las
// URLs salían con "\/" y el CSS no cargaba al servir el sitio desde XAMPP.
$script404 = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? '/pages/404.php'));
$carpetaWeb = rtrim(str_replace('\\', '/', dirname($script404)), '/');
$raizWeb = $carpetaWeb === '' ? '' : rtrim(str_replace('\\', '/', dirname($carpetaWeb)), '/');

/** URL de una vista de /pages (index.html vive en la raíz). */
$urlPagina = static function (string $archivo) use ($carpetaWeb, $raizWeb): string {
    $archivo = ltrim($archivo, '/');
    $carpeta = strtolower($archivo) === 'index.html' ? $raizWeb : $carpetaWeb;

    return $carpeta . '/' . $archivo;
};

/** URL de un recurso de /assets. */
$urlRecurso = static function (string $ruta) use ($raizWeb): string {
    return $raizWeb . '/' . ltrim($ruta, '/');
};

/** Base para error404.js; el script la valida antes de usarla. */
$baseJson = json_encode(
    ['raiz' => $raizWeb, 'pagina' => $carpetaWeb],
    JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
);

const MAX_RUTA = 120;

/** Quita caracteres de control y espacios de los extremos. */
function quitar_control(string $valor): string
{
    $limpio = preg_replace('/[\x00-\x1F\x7F]/u', '', $valor);

    return is_string($limpio) ? trim($limpio) : '';
}

/** Texto apto para imprimir: saneado, recortado y escapado. */
function texto_pantalla(string $valor, int $max = MAX_RUTA): string
{
    return htmlspecialchars(mb_substr(quitar_control($valor), 0, $max), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/**
 * Dirección pedida apta para mostrarse, o '' si no pasa validación (demasiado
 * larga, con markup o con pseudo-protocolos): la vista dice "no disponible".
 */
function ruta_pantalla(string $uri): string
{
    $crudo = quitar_control($uri);

    if ($crudo === '' || mb_strlen($crudo) > MAX_RUTA) {
        return '';
    }
    if (preg_match('/[<>"\'`\\\\{}\[\]]/', $crudo) === 1) {
        return '';
    }
    if (preg_match('/\b(?:javascript|vbscript|data|onerror|onload|onclick|srcdoc)\s*[:=]/i', $crudo) === 1) {
        return '';
    }

    return htmlspecialchars($crudo, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function metodo_pantalla(string $metodo): string
{
    $metodo = strtoupper(trim($metodo));
    $validos = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

    return in_array($metodo, $validos, true) ? $metodo : 'GET';
}

$rutaPedida = ruta_pantalla((string) ($_SERVER['REQUEST_URI'] ?? ''));
$metodoPedido = metodo_pantalla((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

// Respaldo con los slugs de la tabla `categorias`; error404.js la repinta si la API responde.
$categoriasBase = [
    ['id' => 'hombre',   'nombre' => 'Hombre'],
    ['id' => 'mujer',    'nombre' => 'Mujer'],
    ['id' => 'nino',     'nombre' => 'Niño'],
    ['id' => 'nina',     'nombre' => 'Niña'],
    ['id' => 'mascotas', 'nombre' => 'Mascotas'],
];

if (!headers_sent()) {
    http_response_code(404);
    header('Content-Type: text/html; charset=utf-8');
    header('X-Robots-Tag: noindex, nofollow');
}

/* ---------- Vista HTML ---------- */
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex, nofollow" />
<title>Página no encontrada · Lumière Perfumería</title>
<link rel="icon" type="image/png" href="<?= texto_pantalla($urlRecurso('assets/img/favicon.png'), 200) ?>" />
<link rel="apple-touch-icon" href="<?= texto_pantalla($urlRecurso('assets/img/apple-touch-icon.png'), 200) ?>" />
<link rel="stylesheet" href="<?= texto_pantalla($urlRecurso('assets/css/styles.css'), 200) ?>" />
</head>
<body class="landing">

<header class="header">
  <div class="container lhead lhead--portada">
    <a class="logo" href="<?= texto_pantalla($urlPagina('index.html'), 200) ?>">
      <img class="logo__img logo__img--vino" src="<?= texto_pantalla($urlRecurso('assets/img/logo.jpg'), 200) ?>" alt="Lumière Perfumería" width="634" height="640" />
      <img class="logo__img logo__img--claro" src="<?= texto_pantalla($urlRecurso('assets/img/logo_blanco.png'), 200) ?>" alt="" aria-hidden="true" width="419" height="420" />
    </a>

    <div class="header__enlaces">
      <span class="header__aviso" id="envioGratisTopbar">Envío gratis en compras mayores a $599</span>
    </div>

    <!-- Respaldo sin JS: error404.js lo repinta con la sesión real. -->
    <div class="lhead__acciones" id="zonaSesion">
      <a class="lhead__entrar" href="<?= texto_pantalla($urlPagina('login.html'), 200) ?>">Iniciar sesión</a>
    </div>
  </div>
</header>

<main class="auth e404">
  <div class="auth__caja">
    <span class="e404__codigo" aria-hidden="true">404</span>
    <h1 class="auth__titulo">No encontramos esta página</h1>
    <p class="auth__sub">
      La dirección que abriste no existe o cambió de lugar. Puede ser un enlace
      viejo, un perfume que ya salió del catálogo o un error al escribirla.
    </p>

    <p class="e404__ruta" id="e404Ruta" data-ruta="<?= $rutaPedida ?>" data-metodo="<?= $metodoPedido ?>">
      Dirección solicitada (<?= $metodoPedido ?>)
      <b><?= $rutaPedida !== '' ? $rutaPedida : 'no disponible' ?></b>
    </p>

    <p class="auth__aviso" id="e404Aviso" role="alert" hidden></p>

    <!-- Sin JS el form hace GET a la tienda; con JS se valida antes de salir. -->
    <form class="auth__form" id="e404Buscador" method="get" role="search"
          action="<?= texto_pantalla($urlPagina('tienda.html'), 200) ?>">
      <label class="campo">
        <span>Buscar en la tienda</span>
        <input type="search" id="e404Buscar" name="buscar" maxlength="60" autocomplete="off"
               placeholder="Perfume, marca o nota olfativa" aria-describedby="e404Ayuda" />
      </label>
      <p class="auth__nota" id="e404Ayuda">De 2 a 60 caracteres: letras, números y signos simples.</p>
      <button class="boton boton--vino boton--bloque" type="submit">Buscar</button>
    </form>

    <div class="e404__acciones">
      <a class="boton boton--vino" href="<?= texto_pantalla($urlPagina('tienda.html'), 200) ?>">Ir a la tienda</a>
      <a class="boton" href="<?= texto_pantalla($urlPagina('index.html'), 200) ?>">Ver el inicio</a>
      <a class="boton boton--pastel" id="e404Volver" href="<?= texto_pantalla($urlPagina('tienda.html'), 200) ?>">Volver</a>
    </div>

    <section class="e404__bloque">
      <h2 class="lbloque__titulo">Compra por categoría</h2>
      <div class="e404__categorias" id="e404Categorias">
        <?php foreach ($categoriasBase as $categoria): ?>
          <a class="e404__cat"
             href="<?= texto_pantalla($urlPagina('tienda.html') . '?cat=' . urlencode((string) $categoria['id']), 200) ?>"><?= texto_pantalla((string) $categoria['nombre'], 20) ?></a>
        <?php endforeach; ?>
      </div>
    </section>

    <!-- Se llena desde api/tienda.php; si falla o los datos no validan, queda oculta. -->
    <section class="e404__bloque" id="e404SugerenciasCaja" hidden>
      <h2 class="lbloque__titulo">Quizá buscabas</h2>
      <div class="e404__rejilla" id="e404Sugerencias"></div>
    </section>
  </div>
</main>
<footer class="footer">
  <div class="container footer__grid">
    <div>
      <h4>Comprar</h4>
      <a href="<?= texto_pantalla($urlPagina('tienda.html') . '?cat=hombre', 200) ?>">Hombre</a>
      <a href="<?= texto_pantalla($urlPagina('tienda.html') . '?cat=mujer', 200) ?>">Mujer</a>
      <a href="<?= texto_pantalla($urlPagina('tienda.html') . '?cat=nino', 200) ?>">Niños</a>
      <a href="<?= texto_pantalla($urlPagina('tienda.html') . '?cat=mascotas', 200) ?>">Mascotas</a>
    </div>
    <div>
      <h4>La casa</h4>
      <a href="<?= texto_pantalla($urlPagina('index.html'), 200) ?>#lquienes">Quiénes somos</a>
      <a href="<?= texto_pantalla($urlPagina('index.html'), 200) ?>#lbeneficios">Cómo trabajamos</a>
      <a href="<?= texto_pantalla($urlPagina('tienda.html'), 200) ?>">Devoluciones</a>
    </div>
    <div>
      <h4>Cuenta</h4>
      <a href="<?= texto_pantalla($urlPagina('login.html'), 200) ?>">Iniciar sesión</a>
      <a href="<?= texto_pantalla($urlPagina('registro.html'), 200) ?>">Crear cuenta</a>
      <a href="<?= texto_pantalla($urlPagina('tienda.html') . '?continuar=pedidos', 200) ?>">Mis pedidos</a>
    </div>
    <div>
      <h4>Pago</h4>
      <div class="pays"><span>VISA</span><span>MC</span><span>AMEX</span><span>OXXO</span><span>PayPal</span></div>
    </div>
  </div>
  <div class="footer__bar">© 2026 Lumière Perfumería</div>
</footer>

<div class="toast" id="toast"></div>

<script>
  window.ERROR404_BASE = <?= $baseJson === false ? '{"raiz":"","pagina":"/pages"}' : $baseJson ?>;
</script>
<script src="<?= texto_pantalla($urlRecurso('assets/js/error404.js'), 200) ?>"></script>
</body>
</html>
