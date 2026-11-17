<?php
/**
 * producto.php — ficha completa de un perfume para pages/producto.html
 *   GET api/producto.php?slug=lacroix-blue-intense-edp-100-ml
 *
 * Devuelve el producto, sus presentaciones (variantes: volumen, concentración,
 * precio y stock) y cuatro productos relacionados de la misma categoría.
 */
declare(strict_types=1);

require __DIR__ . '/conexion.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    json_error('Método no permitido, usa GET', 405);
}

$slug = trim((string) ($_GET['slug'] ?? ''));

if ($slug === '') {
    json_error('Falta el parámetro slug del producto');
}

try {
    $pdo = db();

    $st = $pdo->prepare('SELECT * FROM v_catalogo WHERE producto_slug = ? ORDER BY volumen_ml, precio_actual');
    $st->execute([$slug]);
    $variantes = $st->fetchAll();

    if (!$variantes) {
        json_error('Ese perfume no existe o ya no está disponible', 404);
    }

    $base = $variantes[0];

    $producto = [
        'id'          => (int) $base['producto_id'],
        'slug'        => $base['producto_slug'],
        'nombre'      => $base['nombre'],
        'marca'       => $base['marca'],
        'cat'         => $base['categoria'],
        'cat_nombre'  => $base['categoria_nombre'],
        'precio'      => (float) $base['precio_actual'],
        'antes'       => (float) $base['precio_lista'],
        'descuento'   => (int) $base['descuento_pct'],
        'rating'      => (float) $base['rating'],
        'resenas'     => (int) $base['resenas'],
        'stock'       => (int) $base['stock'],
        'familia'     => $base['familia_olfativa'],
        'desc'        => $base['descripcion'],
        'c1'          => $base['c1'],
        'c2'          => $base['c2'],
    ];

    $presentaciones = array_map(static function (array $v): array {
        return [
            'variante_id'   => (int) $v['variante_id'],
            'sku'           => $v['sku'],
            'volumen_ml'    => (int) $v['volumen_ml'],
            'concentracion' => $v['concentracion'],
            'precio'        => (float) $v['precio_actual'],
            'antes'         => (float) $v['precio_lista'],
            'descuento'     => (int) $v['descuento_pct'],
            'stock'         => (int) $v['stock'],
        ];
    }, $variantes);

    // Relacionados: otros perfumes de la misma categoría, del mayor descuento al menor
    $st = $pdo->prepare(
        'SELECT v.producto_slug AS slug, MIN(v.variante_id) AS variante_id, MAX(v.nombre) AS nombre,
                MAX(v.marca) AS marca, MIN(v.precio_actual) AS precio, MAX(v.descuento_pct) AS descuento,
                MAX(v.rating) AS rating, MAX(v.c1) AS c1, MAX(v.c2) AS c2
           FROM v_catalogo v
          WHERE v.categoria = ? AND v.producto_slug <> ?
          GROUP BY v.producto_slug
          ORDER BY descuento DESC, nombre
          LIMIT 4'
    );
    $st->execute([$base['categoria'], $slug]);

    $relacionados = array_map(static function (array $r): array {
        return [
            'slug'      => $r['slug'],
            'variante_id' => (int) $r['variante_id'],
            'nombre'    => $r['nombre'],
            'marca'     => $r['marca'],
            'precio'    => (float) $r['precio'],
            'descuento' => (int) $r['descuento'],
            'rating'    => (float) $r['rating'],
            'c1'        => $r['c1'],
            'c2'        => $r['c2'],
        ];
    }, $st->fetchAll());

    json_salida([
        'ok'            => true,
        'producto'      => $producto,
        'presentaciones' => $presentaciones,
        'relacionados'  => $relacionados,
        'configuracion' => configuracion_tienda(),
    ]);
} catch (Throwable $e) {
    json_error('No se pudo leer el producto', 500, $e);
}
