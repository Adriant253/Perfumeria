<?php
/**
 * tienda.php
 * GET api/tienda.php
 *
 * Devuelve todo lo que necesita index.html en una sola petición:
 *  - categorias    : las 5 categorías del menú (slug, nombre, color)
 *  - marcas        : para los filtros de marca
 *  - banners       : los slides del hero
 *  - productos     : catálogo aplanado desde la vista v_catalogo
 *  - configuracion : envío gratis, meses sin intereses, moneda, etc.
 */
declare(strict_types=1);

require __DIR__ . '/conexion.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    json_error('Método no permitido, usa GET', 405);
}

try {
    $pdo = db();

    // Categorías del menú: las hijas de "Perfumes", en el orden configurado.
    $categorias = $pdo->query(
        "SELECT c.slug AS id, c.nombre, c.color
           FROM categorias c
           JOIN categorias p ON p.id = c.categoria_padre_id
          WHERE p.slug = 'perfumes' AND c.activo = TRUE
          ORDER BY c.orden_menu, c.nombre"
    )->fetchAll();

    $marcas = $pdo->query('SELECT nombre, slug FROM marcas ORDER BY nombre')->fetchAll();

    // Los banners sin categoría son los de promociones: la UI usa 'ofertas'.
    $banners = array_map(static function (array $b): array {
        return [
            'titulo' => $b['titulo'],
            'sub'    => $b['subtitulo'] ?? '',
            'cta'    => $b['texto_boton'] ?? 'Ver más',
            'cat'    => $b['categoria'] ?? 'ofertas',
            'bg'     => $b['fondo'],
            'badge'  => $b['etiqueta'] ?? '',
        ];
    }, $pdo->query(
        "SELECT b.titulo, b.subtitulo, b.texto_boton, b.etiqueta, b.fondo, c.slug AS categoria
           FROM banners b
           LEFT JOIN categorias c ON c.id = b.categoria_id
          WHERE b.activo = TRUE
          ORDER BY b.orden_menu, b.id"
    )->fetchAll());

    // Catálogo aplanado: producto + variante + marca + categoría (vista v_catalogo).
    // Las claves coinciden con las que ya usa app.js, así no hay que reescribir el render.
    $productos = array_map(static function (array $p): array {
        return [
            'id'            => (int) $p['variante_id'],
            'slug'          => $p['producto_slug'],
            'sku'           => $p['sku'],
            'nombre'        => $p['nombre'],
            'marca'         => $p['marca'],
            'cat'           => $p['categoria'],
            'precio'        => (float) $p['precio_actual'],
            'antes'         => (float) $p['precio_lista'],
            'descuento'     => (int) $p['descuento_pct'],
            'rating'        => (float) $p['rating'],
            'reviews'       => (int) $p['resenas'],
            'stock'         => (int) $p['stock'],
            'volumen_ml'    => (int) $p['volumen_ml'],
            'concentracion' => $p['concentracion'],
            'familia'       => $p['familia_olfativa'],
            'desc'          => $p['descripcion'],
            'c1'            => $p['c1'],
            'c2'            => $p['c2'],
        ];
    }, $pdo->query(
        'SELECT variante_id, producto_slug, sku, nombre, marca, categoria, volumen_ml, concentracion,
                stock, precio_lista, precio_actual, descuento_pct, rating, resenas,
                familia_olfativa, descripcion, c1, c2
           FROM v_catalogo
          ORDER BY categoria, nombre'
    )->fetchAll());

    json_salida([
        'ok'            => true,
        'conectado'     => true,
        'generado_en'   => date('c'),
        'categorias'    => $categorias,
        'marcas'        => $marcas,
        'banners'       => $banners,
        'configuracion' => configuracion_tienda(),
        'productos'     => $productos,
    ]);
} catch (Throwable $e) {
    json_error('No se pudo leer la base de datos perfumeria_db', 500, $e);
}
