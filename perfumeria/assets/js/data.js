/* Catálogo de la tienda de perfumes.
 *
 * Estos son los datos LOCALES DE RESPALDO: al abrir la tienda, api.js pide el
 * catálogo real a MySQL (api/tienda.php) y sobreescribe estas constantes.
 * Si la base de datos no responde, la página sigue funcionando con esto.
 *
 * Se declaran con 'let' (no 'const') justamente para que api.js pueda
 * reasignarlas, y CONFIG guarda las reglas que también viven en la tabla
 * `configuracion` (envío gratis, meses sin intereses, moneda...).
 */
let CONFIG = {
  nombre_tienda: 'Lumière Perfumería',
  envio_gratis_desde: 599,
  costo_envio_base: 99,
  meses_sin_intereses: 12,
  moneda: 'MXN'
};

let CATEGORIES = [
  { id: 'hombre',   nombre: 'Hombre',   color: '#1f3c88' },
  { id: 'mujer',    nombre: 'Mujer',    color: '#c2185b' },
  { id: 'nino',     nombre: 'Niño',     color: '#0288d1' },
  { id: 'nina',     nombre: 'Niña',     color: '#ab47bc' },
  { id: 'mascotas', nombre: 'Mascotas', color: '#2e7d32' }
];

let BANNERS = [
  { titulo: 'Hasta 40% de descuento', sub: 'En perfumes importados para él y para ella', cta: 'Ver ofertas', cat: 'ofertas', bg: 'linear-gradient(120deg,#0b3aa8,#1e6fe0)', badge: 'Temporada de aromas' },
  { titulo: 'Fragancias para ella', sub: 'Florales, dulces y amaderadas desde $399', cta: 'Comprar mujer', cat: 'mujer', bg: 'linear-gradient(120deg,#8e1b4f,#e0559b)', badge: 'Nuevo' },
  { titulo: 'Colonias infantiles', sub: 'Suaves e hipoalergénicas para niño y niña', cta: 'Ver infantiles', cat: 'nino', bg: 'linear-gradient(120deg,#0f6f9c,#4bc6f0)', badge: 'Sin alcohol' },
  { titulo: 'Tu mascota también huele bien', sub: 'Colonias veterinarias con pH balanceado', cta: 'Ver mascotas', cat: 'mascotas', bg: 'linear-gradient(120deg,#1b5e20,#66bb6a)', badge: 'Pet friendly' }
];

let PRODUCTS = [
  // Hombre
  { id: 1,  nombre: 'Blue Intense Eau de Parfum 100 ml', marca: 'Lacroix', cat: 'hombre', precio: 1299, antes: 1899, rating: 4.7, reviews: 342, c1: '#0b3aa8', c2: '#5aa9ff', desc: 'Aroma amaderado acuático con notas de bergamota, cedro y ámbar. Larga duración para uso diario.' },
  { id: 2,  nombre: 'Noir Absolu Eau de Toilette 90 ml', marca: 'Verone', cat: 'hombre', precio: 899, antes: 1450, rating: 4.5, reviews: 210, c1: '#1c1c22', c2: '#6b6b7a', desc: 'Fragancia intensa oriental con pimienta negra, cuero y vainilla. Ideal para la noche.' },
  { id: 3,  nombre: 'Sport Fresh Colonia 150 ml', marca: 'Atlas', cat: 'hombre', precio: 449, antes: 699, rating: 4.3, reviews: 588, c1: '#0f6f9c', c2: '#7fe3ff', desc: 'Cítrico refrescante con menta y limón, perfecto después del entrenamiento.' },
  { id: 4,  nombre: 'Legado Oud Parfum 75 ml', marca: 'Casa Real', cat: 'hombre', precio: 2490, antes: 3200, rating: 4.9, reviews: 96, c1: '#5d3a1a', c2: '#d9a441', desc: 'Oud árabe premium con azafrán y sándalo. Estuche de lujo incluido.' },
  { id: 5,  nombre: 'Urban Code EDT 100 ml', marca: 'Nexo', cat: 'hombre', precio: 749, antes: 999, rating: 4.2, reviews: 431, c1: '#263238', c2: '#8aa4b1', desc: 'Aromático fougère con lavanda y vetiver para el día a día.' },
  { id: 6,  nombre: 'Set Blue Intense + Desodorante', marca: 'Lacroix', cat: 'hombre', precio: 1599, antes: 2399, rating: 4.6, reviews: 143, c1: '#123a7a', c2: '#79b8ff', desc: 'Estuche con eau de parfum 100 ml y desodorante en spray 150 ml.' },

  // Mujer
  { id: 7,  nombre: 'Rosé Éclat Eau de Parfum 100 ml', marca: 'Maison Lis', cat: 'mujer', precio: 1450, antes: 2100, rating: 4.8, reviews: 725, c1: '#c2185b', c2: '#ff9ec4', desc: 'Floral afrutado con rosa de Damasco, litchi y almizcle blanco.' },
  { id: 8,  nombre: 'Vainilla Dorada EDP 90 ml', marca: 'Solé', cat: 'mujer', precio: 899, antes: 1350, rating: 4.6, reviews: 512, c1: '#b26a00', c2: '#ffd591', desc: 'Gourmand dulce de vainilla bourbon, caramelo y sándalo.' },
  { id: 9,  nombre: 'Jardín Blanco Eau de Toilette 75 ml', marca: 'Verone', cat: 'mujer', precio: 599, antes: 890, rating: 4.4, reviews: 289, c1: '#7b1fa2', c2: '#e2b6f5', desc: 'Jazmín, peonía y pera: fresco y elegante para la oficina.' },
  { id: 10, nombre: 'Noche Púrpura Parfum 50 ml', marca: 'Casa Real', cat: 'mujer', precio: 2190, antes: 2890, rating: 4.9, reviews: 118, c1: '#3d0f5c', c2: '#b07cf5', desc: 'Oriental intenso con pachulí, ciruela y ámbar gris.' },
  { id: 11, nombre: 'Brisa Cítrica Body Mist 250 ml', marca: 'Atlas', cat: 'mujer', precio: 279, antes: 399, rating: 4.1, reviews: 964, c1: '#f57c00', c2: '#ffdd67', desc: 'Body mist ligero de naranja, mandarina y flor de azahar.' },
  { id: 12, nombre: 'Set Rosé Éclat + Crema corporal', marca: 'Maison Lis', cat: 'mujer', precio: 1799, antes: 2650, rating: 4.7, reviews: 201, c1: '#ad1457', c2: '#ffb3d1', desc: 'Estuche de regalo con EDP 100 ml y crema corporal 200 ml.' },

  // Niño
  { id: 13, nombre: 'Colonia Aventura Kids 200 ml', marca: 'Pequearomas', cat: 'nino', precio: 259, antes: 379, rating: 4.5, reviews: 640, c1: '#0288d1', c2: '#8fe3ff', desc: 'Sin alcohol, aroma a manzana verde y algodón. Dermatológicamente probada.' },
  { id: 14, nombre: 'Colonia Súper Héroe 150 ml', marca: 'Kiddo', cat: 'nino', precio: 199, antes: 289, rating: 4.4, reviews: 431, c1: '#1565c0', c2: '#ff5252', desc: 'Frasco coleccionable con aroma fresco a cítricos suaves.' },
  { id: 15, nombre: 'Set Escolar: colonia + shampoo', marca: 'Pequearomas', cat: 'nino', precio: 389, antes: 559, rating: 4.6, reviews: 186, c1: '#00695c', c2: '#7ee8d3', desc: 'Kit de cuidado diario con colonia 100 ml y shampoo sin lágrimas.' },
  { id: 16, nombre: 'Colonia Dino Splash 120 ml', marca: 'Kiddo', cat: 'nino', precio: 169, antes: 249, rating: 4.2, reviews: 322, c1: '#2e7d32', c2: '#a5f58b', desc: 'Aroma tropical con notas de piña y coco, hipoalergénica.' },

  // Niña
  { id: 17, nombre: 'Colonia Princesa Rosa 200 ml', marca: 'Pequearomas', cat: 'nina', precio: 259, antes: 379, rating: 4.7, reviews: 812, c1: '#ec407a', c2: '#ffd2e5', desc: 'Notas de fresa y vainilla, sin alcohol y con brillo suave.' },
  { id: 18, nombre: 'Colonia Unicornio Glitter 150 ml', marca: 'Kiddo', cat: 'nina', precio: 219, antes: 319, rating: 4.6, reviews: 553, c1: '#ab47bc', c2: '#ffe0f7', desc: 'Con diamantina comestible y aroma a algodón de azúcar.' },
  { id: 19, nombre: 'Set Hada: colonia + gel de baño', marca: 'Pequearomas', cat: 'nina', precio: 399, antes: 579, rating: 4.5, reviews: 164, c1: '#7e57c2', c2: '#d8c6ff', desc: 'Kit con colonia 100 ml y gel de baño 250 ml, pH neutro.' },
  { id: 20, nombre: 'Colonia Flor de Cerezo Kids 120 ml', marca: 'Kiddo', cat: 'nina', precio: 179, antes: 259, rating: 4.3, reviews: 287, c1: '#d81b60', c2: '#ffc1d6', desc: 'Floral delicado de cerezo y pera, ideal para uso escolar.' },

  // Mascotas
  { id: 21, nombre: 'Colonia Perruna Frescura 200 ml', marca: 'PetAroma', cat: 'mascotas', precio: 229, antes: 329, rating: 4.6, reviews: 498, c1: '#2e7d32', c2: '#b6f0a0', desc: 'Colonia para perro con pH balanceado, aroma a talco y manzanilla.' },
  { id: 22, nombre: 'Colonia Felina Suave 150 ml', marca: 'PetAroma', cat: 'mascotas', precio: 249, antes: 359, rating: 4.4, reviews: 213, c1: '#00838f', c2: '#9ae8ef', desc: 'Formulada para gatos, sin alcohol ni aceites esenciales tóxicos.' },
  { id: 23, nombre: 'Spray Desenredante y Aroma 250 ml', marca: 'CanBella', cat: 'mascotas', precio: 319, antes: 459, rating: 4.7, reviews: 342, c1: '#5d4037', c2: '#e0c3a0', desc: 'Desenreda el pelaje y deja aroma duradero a coco y vainilla.' },
  { id: 24, nombre: 'Set Spa Mascota: colonia + shampoo', marca: 'CanBella', cat: 'mascotas', precio: 549, antes: 799, rating: 4.8, reviews: 127, c1: '#1b5e20', c2: '#8ad98f', desc: 'Kit de baño completo con shampoo hipoalergénico y colonia 120 ml.' },
  { id: 25, nombre: 'Colonia Cachorro Delicada 120 ml', marca: 'PetAroma', cat: 'mascotas', precio: 189, antes: 269, rating: 4.3, reviews: 276, c1: '#827717', c2: '#e6ee9c', desc: 'Para cachorros desde 3 meses, aroma muy ligero a avena.' }
];
