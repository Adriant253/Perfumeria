<?php
/**
 * pedidos.php
 *   GET  api/pedidos.php  -> pedidos del usuario con sesión iniciada
 *   POST api/pedidos.php  { destinatario, calle, colonia, ciudad, estado, cp,
 *                           telefono, referencias?, metodo_pago?,
 *                           guardar_direccion? }
 *
 * Crea el pedido dentro de una transacción: valida y descuenta stock, guarda
 * `pedidos` + `pedido_items`, registra el pago (simulado) en
 * `transacciones_pago`, deja la bitácora en `pedido_estado_historial` y vacía
 * el carrito. El precio de cada partida se copia al pedido (histórico).
 */
declare(strict_types=1);

require __DIR__ . '/conexion.php';

$usuario = exigir_usuario();
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';

/* ------------------------------------------------------------------ GET */
if ($metodo === 'GET') {
    try {
        $st = db()->prepare(
            'SELECT p.id, p.codigo_rastreo, p.estado, p.subtotal, p.costo_envio, p.total,
                    p.metodo_pago, p.direccion_envio, p.creado_en,
                    COUNT(pi.id) AS partidas
               FROM pedidos p
               LEFT JOIN pedido_items pi ON pi.pedido_id = p.id
              WHERE p.usuario_id = ?
              GROUP BY p.id
              ORDER BY p.id DESC
              LIMIT 20'
        );
        $st->execute([(int) $usuario['id']]);

        json_salida(['ok' => true, 'pedidos' => $st->fetchAll()]);
    } catch (Throwable $e) {
        json_error('No se pudieron leer tus pedidos', 500, $e);
    }
}

if ($metodo !== 'POST') {
    json_error('Método no permitido, usa GET o POST', 405);
}

/* ----------------------------------------------------------------- POST */
$datos = cuerpo();

/* Datos de envío: limpieza + validación (reglas en api/conexion.php) */
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

/* Opcionales y de lista blanca */
$referencias = campo($datos, 'referencias');

if ($referencias !== '') {
    $error = validar_campo($referencias, 'referencias', false);

    if ($error !== null) {
        json_error($error);
    }
}

$metodoPago = metodo_pago_valido(campo($datos, 'metodo_pago'));
$guardarDireccion = booleano_entrada($datos['guardar_direccion'] ?? false);

// CONTINUA_PEDIDOS

$pdo = db();
$pdo->beginTransaction();

try {
    $carritoId = asegurar_carrito((int) $usuario['id']);

    // Bloquea las filas del carrito y sus variantes para validar stock
    $st = $pdo->prepare(
        'SELECT ci.variante_id, ci.cantidad, v.stock, v.precio, v.precio_oferta,
                v.activo, p.nombre, p.activo AS producto_activo
           FROM carrito_items ci
           JOIN producto_variantes v ON v.id = ci.variante_id
           JOIN productos p ON p.id = v.producto_id
          WHERE ci.carrito_id = ?
          ORDER BY ci.id
            FOR UPDATE'
    );
    $st->execute([$carritoId]);
    $filas = $st->fetchAll();

    if (!$filas) {
        $pdo->rollBack();
        json_error('Tu carrito está vacío', 400);
    }

    $subtotal = 0.0;
    $items = [];

    foreach ($filas as $fila) {
        $cantidad = (int) $fila['cantidad'];

        if ((int) $fila['activo'] !== 1 || (int) $fila['producto_activo'] !== 1) {
            $pdo->rollBack();
            json_error('"' . $fila['nombre'] . '" ya no está disponible', 409);
        }
        if ($cantidad > (int) $fila['stock']) {
            $pdo->rollBack();
            json_error('Sin stock suficiente de "' . $fila['nombre'] . '" (quedan ' . (int) $fila['stock'] . ')', 409);
        }

        $precio = (float) ($fila['precio_oferta'] !== null ? $fila['precio_oferta'] : $fila['precio']);
        $subtotal += $precio * $cantidad;

        $items[] = [
            'variante_id' => (int) $fila['variante_id'],
            'cantidad'    => $cantidad,
            'precio'      => $precio,
        ];
    }

    $subtotal = round($subtotal, 2);
    $minimo = (float) config_valor('envio_gratis_desde', 599);
    $base = (float) config_valor('costo_envio_base', 99);
    $costoEnvio = ($subtotal > 0 && $subtotal < $minimo) ? $base : 0.0;
    $total = round($subtotal + $costoEnvio, 2);
    $codigo = 'ARO-' . strtoupper(bin2hex(random_bytes(4)));

    $direccionTexto = $direccion['destinatario'] . "\n" . $direccion['calle'] . "\nCol. " . $direccion['colonia']
        . "\n" . $direccion['ciudad'] . ', ' . $direccion['estado'] . "\nCP " . $direccion['cp']
        . "\nTel. " . $direccion['telefono']
        . ($referencias !== '' ? "\nRef: " . $referencias : '');

    $st = $pdo->prepare(
        'INSERT INTO pedidos (usuario_id, codigo_rastreo, estado, subtotal, costo_envio, total, direccion_envio, metodo_pago)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $st->execute([(int) $usuario['id'], $codigo, 'PAGADO', $subtotal, $costoEnvio, $total, $direccionTexto, $metodoPago]);
    $pedidoId = (int) $pdo->lastInsertId();

    $stItem = $pdo->prepare('INSERT INTO pedido_items (pedido_id, variante_id, cantidad, precio_unitario) VALUES (?, ?, ?, ?)');
    $stStock = $pdo->prepare('UPDATE producto_variantes SET stock = stock - ? WHERE id = ?');

    foreach ($items as $item) {
        $stItem->execute([$pedidoId, $item['variante_id'], $item['cantidad'], $item['precio']]);
        $stStock->execute([$item['cantidad'], $item['variante_id']]);
    }

    // Pago simulado: en un caso real aquí se llama a la pasarela y su webhook
    $st = $pdo->prepare(
        'INSERT INTO transacciones_pago (pedido_id, usuario_id, proveedor, id_transaccion_pasarela, monto, moneda,
                                         estado, codigo_respuesta_pasarela, payload_webhook, fecha_pago)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())'
    );
    $st->execute([
        $pedidoId,
        (int) $usuario['id'],
        'MERCADO_PAGO',
        'DEMO-' . $codigo,
        $total,
        'MXN',
        'APROBADO',
        '00',
        json_encode(['demo' => true, 'metodo_pago' => $metodoPago, 'codigo_rastreo' => $codigo], JSON_UNESCAPED_UNICODE),
    ]);

    $st = $pdo->prepare('INSERT INTO pedido_estado_historial (pedido_id, estado, comentario) VALUES (?, ?, ?)');
    $st->execute([$pedidoId, 'PAGADO', 'Pago simulado del entorno demo']);

    if ($guardarDireccion) {
        $st = $pdo->prepare('SELECT COUNT(*) FROM direcciones_envio WHERE usuario_id = ?');
        $st->execute([(int) $usuario['id']]);
        $esPrimera = ((int) $st->fetchColumn()) === 0;

        $st = $pdo->prepare(
            'INSERT INTO direcciones_envio (usuario_id, destinatario, calle_numero, colonia, ciudad, estado,
                                            codigo_postal, referencias, telefono_contacto, es_predeterminada)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $st->execute([
            (int) $usuario['id'], $direccion['destinatario'], $direccion['calle'], $direccion['colonia'],
            $direccion['ciudad'], $direccion['estado'], $direccion['cp'],
            $referencias !== '' ? $referencias : null, $direccion['telefono'], $esPrimera ? 1 : 0,
        ]);
    }

    $st = $pdo->prepare('DELETE FROM carrito_items WHERE carrito_id = ?');
    $st->execute([$carritoId]);

    $pdo->commit();

    json_salida([
        'ok'      => true,
        'mensaje' => 'Pedido confirmado',
        'pedido'  => [
            'id'             => $pedidoId,
            'codigo_rastreo' => $codigo,
            'estado'         => 'PAGADO',
            'subtotal'       => $subtotal,
            'costo_envio'    => $costoEnvio,
            'total'          => $total,
            'partidas'       => count($items),
            'piezas'         => (int) array_sum(array_column($items, 'cantidad')),
        ],
    ], 201);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    json_error('No se pudo completar el pedido', 500, $e);
}

