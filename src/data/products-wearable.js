// src/data/products-wearable.js
// SENTINEL: NB_SHOP_WEARABLE_V3
//
// ONE FOLDER IS ONE PRODUCT.
// public/images/shop/tshirts/<line>/ holds every variant of that line, and the
// record below points at the folder rather than at a chosen hero shot. Add a
// photograph and it becomes a variant. Add a folder and it becomes a line. The
// cover picks itself, see covers.js.
//
//   theburroship   8   the airship
//   neonburro      7   the mark
//   blanks         7   nothing printed at all
//   horizon        2   dip dyed, colour rising off the hem
//   editions      11   the illustrated ones
//   caps           6   two brands, three colours each
//
// TWO CLAIMS THAT ARE NOT MARKETING, AND BOTH ARE LOAD BEARING
//   1. Cotton to the thread. Organic dye, organic ink, nothing else on it. That
//      is checkable and it stays checkable, so nobody softens it into "premium
//      cotton" later.
//   2. Natural dye does not repeat, and we say so before the sale rather than in
//      a returns policy. A customer who is surprised feels cheated. A customer
//      who was told feels like they got the real thing.
//
// V2 wrote a paragraph of story per line. V3 does not. A shop that explains
// itself at length is a shop that does not trust the object, and these objects
// photograph better than they argue. Three sentences is the ceiling.
//
// No oxford commas, no em dashes.

import { DYE_NOTE, RETURNS_NOTE } from './taxonomy';

const COTTON = [
  '100% Organic Cotton, thread included',
  'Organic dyes, organic inks, nothing else',
  'Mid-weight, boxy cut',
  'Naturally dyed in small runs',
];

const CARE = 'Machine wash cold, inside out. Tumble dry low or hang. Natural dye keeps moving for the first few washes and then settles.';

const SIZES = ['Mens S', 'Mens M', 'Mens L', 'Mens XL', 'Womens S', 'Womens M', 'Womens L'];

// The nine colourway names are shared across every line on purpose. Sage is Sage
// on the airship and on a blank even though the two baths landed a shade apart,
// which is the point being made rather than an inconsistency to fix.
const SHADE = {
  milk: 'Undyed and unbleached. The closest we get to a white shirt.',
  salt: 'The brightest we can reach without bleach. Flat and clean.',
  oat: 'Warm grain. Cream indoors, sand in the sun.',
  wheat: 'Late August in a field nobody cut.',
  sage: 'Grey green off the high desert floor. The one you will wear most.',
  greengage: 'A green plum, and the only loud shirt we make.',
  persimmon: 'Rust with fruit still in it. Reads red in low light.',
  serviceberry: 'The blue on the berry before you rub it off.',
  pinyon: 'Pine so dark it reads black until you stand near a window.',
};

const shade = (line, id, name) => ({
  id,
  name: name || id[0].toUpperCase() + id.slice(1),
  image: `/images/shop/tshirts/${line}/${line}-${id}.webp`,
  description: SHADE[id],
});

const TEE = {
  subtitle: '100% Organic Cotton',
  category: 'Apparel',
  room: 'worn',
  materials: COTTON,
  dyeNote: DYE_NOTE,
  returnsNote: RETURNS_NOTE,
  sizes: SIZES,
  care: CARE,
  inStock: false,
  hasVariants: true,
  variantType: 'design',
};

export const WEARABLE_PRODUCTS = {
  theburroship: {
    ...TEE,
    id: 'theburroship',
    name: 'theburroship.',
    floatWeight: 2,
    price: 85,
    stripePriceId: 'price_1SFJylGWJVsbrWy8UhyrPlai',
    color: '#C5D957',
    layout: 'plate',
    description: 'The airship, printed once, on eight naturally dyed bodies.',
    story: 'Drawn from underneath, which is the only angle anybody has ever seen it from. The ink is organic so it sinks into the weave instead of sitting on top of it, which means it fades with the shirt rather than cracking off it. Look at the part of the drawing you did not notice first.',
    featured: true,
    designs: [
      shade('theburroship', 'milk'),
      shade('theburroship', 'oat'),
      shade('theburroship', 'wheat'),
      shade('theburroship', 'sage'),
      shade('theburroship', 'greengage'),
      shade('theburroship', 'persimmon'),
      shade('theburroship', 'serviceberry'),
      shade('theburroship', 'pinyon'),
    ],
  },

  'neonburro-tee': {
    ...TEE,
    id: 'neonburro-tee',
    name: 'neonburro.',
    floatWeight: 1,
    price: 85,
    stripePriceId: 'price_1SFJ5tGWJVsbrWy86ZQRdLdV',
    color: '#C8893B',
    layout: 'plate',
    description: 'The mark, printed a half step off the body colour.',
    story: 'From six feet away it is a shirt. From two feet away it is ours. A logo you have to walk toward is harder to make than one that shouts, and better company.',
    featured: true,
    designs: [
      shade('neonburro', 'milk'),
      shade('neonburro', 'salt'),
      shade('neonburro', 'sage'),
      shade('neonburro', 'greengage'),
      shade('neonburro', 'serviceberry'),
      shade('neonburro', 'persimmon'),
      shade('neonburro', 'pinyon'),
    ],
  },

  blanks: {
    ...TEE,
    id: 'blanks',
    name: 'blanks.',
    floatWeight: 1,
    price: 65,
    stripePriceId: 'price_1U8xh5GWJVsbrWy8SpK8X3Yc',
    color: '#CEC0A7',
    layout: 'swatch',
    description: 'The same shirt with nothing on it. Twenty dollars less, for the ink we did not use.',
    story: 'Every graphic shirt starts as this shirt, and the body is the part we are actually proud of. Charging you for a print you did not want seemed like a strange way to run a store. The clue on this one is not printed, so look at the packaging.',
    featured: false,
    designs: [
      shade('blanks', 'milk'),
      shade('blanks', 'salt'),
      shade('blanks', 'sage'),
      shade('blanks', 'greengage'),
      shade('blanks', 'serviceberry'),
      shade('blanks', 'persimmon'),
      shade('blanks', 'pinyon'),
    ],
  },

  horizon: {
    ...TEE,
    id: 'horizon',
    name: 'horizon.',
    floatWeight: 2,
    price: 95,
    stripePriceId: 'price_1U8xjNGWJVsbrWy8tr3twdGM',
    color: '#6C6F97',
    layout: 'gradient',
    description: 'Dipped from the hem up, so the colour arrives the way light does.',
    story: 'The shirt goes into the bath upside down and comes out with a line across it that nobody drew. Two of them are never in the same place. This is the one line where the thing we cannot control is the thing you are buying.',
    featured: true,
    designs: [
      { id: 'greengage', name: 'Greengage', image: '/images/shop/tshirts/horizon/horizon-greengage.webp', description: 'Sand into green plum. The line lands about the ribs.' },
      { id: 'indigo', name: 'Indigo', image: '/images/shop/tshirts/horizon/horizon-indigo.webp', description: 'Sand into deep water. The darkest thing we dye.' },
    ],
  },

  editions: {
    ...TEE,
    id: 'editions',
    name: 'editions.',
    floatWeight: 3,
    price: 95,
    stripePriceId: 'price_1U8xl4GWJVsbrWy8AvypXCVT',
    color: '#C8893B',
    layout: 'gallery',
    // Overridden. The auto pick landed on a pocket print, which is a photograph
    // of a mostly empty shirt. Any variant may be the cover, but the cover still
    // has to show something. This is the field the Tack Room writes.
    cover: '/images/shop/tshirts/editions/crab.webp',
    description: 'Eleven drawings. Four of them come loud on the front or quiet on the pocket.',
    story: 'Every character in the yard eventually gets drawn properly, and this is where they end up. Pick who you want and then pick how much of them you want other people to see.',
    featured: true,
    designs: [
      { id: 'prairie-dog', name: 'The Prairie Dog', image: '/images/shop/tshirts/editions/prairie-dog.webp', description: 'Vested, mid sentence, entirely sure of himself.' },
      { id: 'prairie-dog-pocket', name: 'Prairie Dog, pocket', image: '/images/shop/tshirts/editions/prairie-dog-pocket.webp', description: 'The same animal, at a volume you can wear to dinner.' },
      { id: 'diver', name: 'The Diver', image: '/images/shop/tshirts/editions/diver.webp', description: 'A helmet, a sun and a great deal of water.' },
      { id: 'diver-pocket', name: 'Diver, pocket', image: '/images/shop/tshirts/editions/diver-pocket.webp', description: 'Surfacing out of a chest pocket, which is where he lives now.' },
      { id: 'warbleur', name: 'The Hooded Warbleur', image: '/images/shop/tshirts/editions/warbleur.webp', description: 'Hood up against the rock. He is not going to explain himself.' },
      { id: 'warbleur-pocket', name: 'Warbleur, pocket', image: '/images/shop/tshirts/editions/warbleur-pocket.webp', description: 'Watching from a pocket. Somehow worse.' },
      { id: 'crab', name: 'The Crab', image: '/images/shop/tshirts/editions/crab.webp', description: 'Crowned, lit and about four times life size.' },
      { id: 'crab-pocket', name: 'Crab, pocket', image: '/images/shop/tshirts/editions/crab-pocket.webp', description: 'Climbing out. Nobody has told him where he is going.' },
      { id: 'airship-over-the-rocks', name: 'Airship Over the Rocks', image: '/images/shop/tshirts/editions/airship-over-the-rocks.webp', description: 'Moored under the formations at the end of a long day.' },
      { id: 'airship-night', name: 'Airship at Night', image: '/images/shop/tshirts/editions/airship-night.webp', description: 'On deep blue, and almost gone.' },
      { id: 'canyon-doorway', name: 'The Canyon Doorway', image: '/images/shop/tshirts/editions/canyon-doorway.webp', description: 'A door carved into a wall, and a burro who has clearly been here before.' },
    ],
  },

  // loose. and clouds., Aster, 2026-10-07. Tyler: "Let Aster make some better
  // shirts based on Neonburro main graphics" and, of the cloud, "can you add
  // those to shop.neonburro ... Just add them in there." The art and its print
  // masters are in docs/drops/2026-10-loose/. The photographs are the shop's
  // own blanks with each print laid on and shaded by the fabric, and a real
  // photograph replaces each one when its first sample comes back. They are
  // listed the way every shirt here is listed: this record says the shirt
  // exists, data/inventory.js says whether it can be bought, and nothing can
  // be bought until an inventory row says so.
  //
  // No stripePriceId on purpose. Checkout prices by amount and the id only
  // rides along as metadata, and a price object on the live Stripe account is
  // Tyler's to make, not a session's.
  loose: {
    ...TEE,
    id: 'loose',
    name: 'loose.',
    floatWeight: 2,
    price: 95,
    color: '#C5D957',
    layout: 'gallery',
    cover: '/images/shop/tshirts/loose/glasses.webp',
    description: 'Six prints from things the studio already drew, on the loose cut.',
    story: 'The burro\'s glasses, the signal in every plate, the ridge from town, the line we sign off with, three lit tubes and the burro himself, waiting at the hem. Nothing here was drawn for a shirt first. It was drawn because it was ours, and then it fit.',
    featured: true,
    designs: [
      { id: 'glasses', name: 'Glasses · Sage', image: '/images/shop/tshirts/loose/glasses.webp', description: 'Everybody knows whose glasses these are.' },
      { id: 'signal', name: 'Signal · Pinyon', image: '/images/shop/tshirts/loose/signal.webp', description: 'The lime star from every plate, drawn as the spiral it is. Only the middle glows.' },
      { id: 'cimarrons', name: 'Cimarrons · Milk', image: '/images/shop/tshirts/loose/cimarrons.webp', description: 'The ridge from town at the end of the day. Four bands of our own dye and one ink.' },
      { id: 'embrace', name: 'Embrace what\'s new · Pinyon', image: '/images/shop/tshirts/loose/embrace.webp', description: 'The line we sign off with, with the period lit.' },
      { id: 'know-the-number', name: 'Know the number · Pinyon', image: '/images/shop/tshirts/loose/know-the-number.webp', description: 'Three tubes, the middle one lit. Worn small, on the chest.' },
      { id: 'peek', name: 'Peek · Pinyon', image: '/images/shop/tshirts/loose/peek.webp', description: 'He has been there the whole time.' },
    ],
  },

  clouds: {
    ...TEE,
    id: 'clouds',
    name: 'clouds.',
    floatWeight: 2,
    price: 95,
    color: '#9EAFBE',
    layout: 'gallery',
    cover: '/images/shop/tshirts/clouds/carved.webp',
    description: 'The carved cloud, and six thinner ones in a single ink.',
    story: 'A white cloud needs a thick base under it, and a thick base sits on a shirt like a sticker. So the thin ones are one ink, laid once. They sink into the cotton and fade with it. The carved cloud is the exception, and it earns it.',
    featured: true,
    designs: [
      { id: 'carved', name: 'Carved · Serviceberry', image: '/images/shop/tshirts/clouds/carved.webp', description: 'The cloud off the twelfth stone, cut flat the way a woodblock would cut it, over the mesa.' },
      { id: 'contour', name: 'Contour · Serviceberry', image: '/images/shop/tshirts/clouds/contour.webp', description: 'The same cloud as line only, a shade darker than the shirt.' },
      { id: 'scroll', name: 'Scroll · Salt', image: '/images/shop/tshirts/clouds/scroll.webp', description: 'Persimmon ink, the stone\'s three scrolls and the mesa under it.' },
      { id: 'lime-line', name: 'Lime line · Pinyon', image: '/images/shop/tshirts/clouds/lime-line.webp', description: 'One thin lime line on the dark body. The loudest quiet shirt here.' },
      { id: 'topo', name: 'Topo · Sage', image: '/images/shop/tshirts/clouds/topo.webp', description: 'The cloud filled with its own contours, a map of weather.' },
      { id: 'mist', name: 'Mist · Milk', image: '/images/shop/tshirts/clouds/mist.webp', description: 'Three bands of low cloud, the way a woodblock draws a morning.' },
      { id: 'drift', name: 'Drift · Persimmon', image: '/images/shop/tshirts/clouds/drift.webp', description: 'Three clouds going somewhere, a shade darker than the shirt.' },
    ],
  },

  caps: {
    ...TEE,
    id: 'caps',
    name: 'caps.',
    subtitle: 'Washed Cotton Twill',
    floatWeight: 1,
    price: 45,
    stripePriceId: 'price_1U8xmKGWJVsbrWy8CrEUhLXO',
    color: '#CEC0A7',
    layout: 'pair',
    // Overridden for the same reason. Tonal black on black reads as a black
    // rectangle at grid size.
    cover: '/images/shop/caps/cap-theburroship-serviceberry.webp',
    sizes: ['One size, adjustable'],
    care: 'Spot clean. Do not put it in a machine and then write to us about it.',
    description: 'Two brands, three colours each. The wordmark is embroidered tonal and the dot is the only colour on it.',
    story: 'Unstructured, washed soft before it ships, and low enough at the front that it does not sit on your head like a billboard. The dot tells you which one you are wearing. Lime is neonburro. Blue is theburroship.',
    featured: false,
    designs: [
      { id: 'neonburro-greengage', name: 'neonburro · Greengage', image: '/images/shop/caps/cap-neonburro-greengage.webp', description: 'The loud one. Yellow dot.' },
      { id: 'neonburro-khaki', name: 'neonburro · Khaki', image: '/images/shop/caps/cap-neonburro-khaki.webp', description: 'Field tan. Disappears everywhere.' },
      { id: 'neonburro-black', name: 'neonburro · Black', image: '/images/shop/caps/cap-neonburro-black.webp', description: 'Tonal on tonal. You have to be close.' },
      { id: 'theburroship-serviceberry', name: 'theburroship · Serviceberry', image: '/images/shop/caps/cap-theburroship-serviceberry.webp', description: 'Sky, with a blue dot to match.' },
      { id: 'theburroship-khaki', name: 'theburroship · Khaki', image: '/images/shop/caps/cap-theburroship-khaki.webp', description: 'The same tan, the other airline.' },
      { id: 'theburroship-black', name: 'theburroship · Black', image: '/images/shop/caps/cap-theburroship-black.webp', description: 'Tonal on tonal. Blue dot.' },
    ],
  },
};

export default WEARABLE_PRODUCTS;
