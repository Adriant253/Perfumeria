<?php
/**
 * carrito.php — carrito persistente del usuario con sesión iniciada.
 *   GET  api/carrito.php                       -> items + subtotal, envío y total
 *   POST api/carrito.php?accion=agregar   { variante_id, cantidad? }
 *   POST api/carrito.php?accion=cantidad  { variante_id, cantidad }   (0 = quitar)
 *   POST api/carrito.php?accion=quitar    { variante_id }
 *   POST api/carrito.php?accion=vaciar
 *
 * Todo se guarda en `carritos` / `carrito_items` y los totales los calcula
 * el servidor con los precios de la base de datos (no confía en el navegador).
 */
declare(strict_types=1);

require __DIR__ . '/conexion.php';

$usuario = exigir_usuario();
$carritoId = asegurar_carrito((int) $usuario['id']);
$accion = (string) ($_GET['accion'] ?? '');
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';

/** Variante del catálogo (para validar existencia y stock). */
function leer_variante(int $varianteId): ?array
{
    $st = db()->prepare(
        'SELECT variante_id AS id, nombre, precio_actual, stock FROM v_catalogo WHERE variante_id = ? LIMIT 1'
    );
    $st->execute([$varianteId]);
    $variante = $st->fetch();

    return $variante ?: null;
}

/** Cantidad pedida por el cliente: entero válido o error 422. */
function cantidad_entrada(array $datos, int $defecto): int
{
    if (!isset($datos['cantidad']) || $datos['cantidad'] === '') {
        return $defecto;
    }
    if (!is_numeric($datos['cantidad'])) {
        json_error('La cantidad debe ser un número', 422);
    }

    return (int) $datos['cantidad'];
}

function quitar_item(int $carritoId, int $varianteId): void
{
    $st = db()->prepare('DELETE FROM carrito_items WHERE carrito_id = ? AND variante_id = ?');
    $st->execute([$carritoId, $varianteId]);
}

try {
    if ($metodo === 'GET') {
        json_salida(['ok' => true] + resumen_carrito($carritoId));
    }

    if ($metodo !== 'POST') {
        json_error('Método no permitido, usa GET o POST', 405);
    }

    $datos = cuerpo();
    $varianteId = (int) ($datos['variante_id'] ?? 0);

    /* Validación de entrada: hay que saber de qué producto se habla */
    if ($varianteId < 1) {
        json_error('Elige un producto del catálogo', 422);
    }

    switch ($accion) {
        case 'agregar':
            $cantidad = max(1, cantidad_entrada($datos, 1));
            $variante = leer_variante($varianteId);

            if ($variante === null) {
                json_error('Ese producto no existe', 404);
            }
            if ((int) $variante['stock'] < 1) {
                json_error('Ese producto está agotado', 409);
            }

            $st = db()->prepare(
                'INSERT INTO carrito_items (carrito_id, variante_id, cantidad) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE cantidad = LEAST(cantidad + VALUES(cantidad), ?)'
            );
            $st->execute([$carritoId, $varianteId, $cantidad, (int) $variante['stock']]);
            break;

        case 'cantidad':
            $cantidad = max(0, cantidad_entrada($datos, 0));

            if ($cantidad === 0) {
                quitar_item($carritoId, $varianteId);
                break;
            }

            $variante = leer_variante($varianteId);

            if ($variante === null) {
                json_error('Ese producto no existe', 404);
            }
            if ((int) $variante['stock'] < 1) {
                quitar_item($carritoId, $varianteId);
                break;
            }

            $cantidad = min($cantidad, (int) $variante['stock']);
            $st = db()->prepare('UPDATE carrito_items SET cantidad = ? WHERE carrito_id = ? AND variante_id = ?');
            $st->execute([$cantidad, $carritoId, $varianteId]);
            break;

        case 'quitar':
            quitar_item($carritoId, $varianteId);
            break;

        case 'vaciar':
            $st = db()->prepare('DELETE FROM carrito_items WHERE carrito_id = ?');
            $st->execute([$carritoId]);
            break;

        default:
            json_error('Acción no válida: usa agregar, cantidad, quitar o vaciar');
    }

    json_salida(['ok' => true] + resumen_carrito($carritoId));
} catch (Throwable $e) {
    json_error('No se pudo actualizar el carrito', 500, $e);
}
