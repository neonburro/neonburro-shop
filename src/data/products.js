// src/data/products.js
// SENTINEL: NB_SHOP_PRODUCTS_V1_PRICED
//
// Every product the shop shows, merged once. Every record gets its cover
// picked from its own folder here, once, so no page has to remember to do it
// and no line ever carries a hand chosen hero shot. See covers.js for why that
// is a rule rather than a convenience.
//
// THE SERVER PRICES FROM THIS OBJECT. netlify/functions/_shop-catalog.js
// imports ALL_PRODUCTS and builds the payment catalog from it, so a record
// here is sellable at the price written here and nothing else is. Add a
// product to RAW and checkout can take it. Take one out and checkout refuses
// it, even from an old saved saddlebag. Two consequences:
//   · this file and everything it imports are bundled into the payment
//     functions. Keep them plain data. No JSX, no images, no window.
//   · after changing a price or a product here, run
//     `node scripts/price-check.mjs`. Its expected numbers are typed on
//     purpose and a moved price fails it until somebody signs the new one.
//
// No oxford commas, no em dashes.

import { DIGITAL_PRODUCTS } from './products-digital';
import { WEARABLE_PRODUCTS } from './products-wearable';
import { CRAFT_PRODUCTS } from './products-craft';
import { withCover } from './covers';

const RAW = {
  ...DIGITAL_PRODUCTS,
  ...WEARABLE_PRODUCTS,
  ...CRAFT_PRODUCTS
};

export const ALL_PRODUCTS = Object.fromEntries(
  Object.entries(RAW).map(([id, p]) => [id, withCover(p)])
);

// Get all products as an array
export const getAllProducts = () => {
  return Object.values(ALL_PRODUCTS);
};

// Get a single product by ID
export const getProduct = (productId) => {
  return ALL_PRODUCTS[productId] || null;
};

// Get featured products
export const getFeaturedProducts = () => {
  return Object.values(ALL_PRODUCTS).filter(product => product.featured);
};

// Get mystery products
export const getMysteryProducts = () => {
  return Object.values(ALL_PRODUCTS).filter(product => product.mysteryType);
};

// Get products by category
export const getProductsByCategory = (category) => {
  return Object.values(ALL_PRODUCTS).filter(product => product.category === category);
};

export default ALL_PRODUCTS;
