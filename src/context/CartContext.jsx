// src/context/CartContext.jsx
// SENTINEL: NB_SHOP_CART_CONTEXT_V3
//
// The cart. Held in React state, mirrored to localStorage under
// 'neonburro-cart' so it survives a reload and a trip to Stripe and back.
//
// ── why the initial state reads storage synchronously ───────────────────────
// This used to start as [] and load the saved cart in a useEffect, with a
// second useEffect saving the cart on every change. On a hard load the two
// effects ran in order on the same commit: load scheduled setCart(saved), then
// save ran with the still empty cart and wrote [] over the saved one. In
// production the re-render then wrote the real cart back, so it mostly worked
// with a brief window where storage was empty. Under React StrictMode in dev
// the effects run twice, the second load read the [] the first save had just
// written, and the cart was gone for good on every hard load of any page.
//
// It also meant any page whose first render checked "is the cart empty" saw
// an empty cart for one frame. Checkout does exactly that, and Stripe's
// stablecoin rail returns the shopper to /checkout/ with a HARD load. So the
// cart is now read once in the useState initialiser, before the first render,
// and there is only ever a save effect.
//
// ── lastAdded, the one piece of state that is not the cart ─────────────────
// Adding to the cart used to be silent. The nav counter ticked from 00 to 01
// and nothing else moved, and people reported that the cart did not work.
// lastAdded is { item, at } and is set on every add. The saddlebag pill and
// the nav read it to bump, flash the name and, on the first add, appear. It
// is not persisted, a reload should not replay a bump.
//
// Item identity is id plus the chosen size, tier, design and reload code,
// joined with '::'. The same product in two sizes is two lines. A card reload
// and a new card are two lines.
//
// ── digital ─────────────────────────────────────────────────────────────────
// isDigitalOnly() is what checkout asks to decide whether a shipping address
// is required. A product is digital when its record says category 'Digital'
// or room 'sent'. Both are set in data/products-digital.js, keep them in step.
// isDigitalRecord in netlify/functions/_shop-catalog.js reads the same three
// fields to decide delivery on the server. Change one, change both.
//
// No oxford commas, no em dashes.

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const CartContext = createContext();

const STORAGE_KEY = 'neonburro-cart';

const readSavedCart = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const isDigitalItem = (item) =>
  !!item && (item.category === 'Digital' || item.room === 'sent' || item.delivery === 'digital');

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within CartProvider');
  }
  return context;
};

export const CartProvider = ({ children }) => {
  const [cart, setCart] = useState(readSavedCart);
  const [isOpen, setIsOpen] = useState(false);
  const [lastAdded, setLastAdded] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // Storage full or unavailable. The in memory cart still works for the
      // session, it just will not survive a reload.
    }
  }, [cart]);

  const createCartItemId = (product) => {
    const parts = [product.id];
    if (product.selectedSize) parts.push(product.selectedSize);
    if (product.selectedTier) parts.push(product.selectedTier);
    if (product.selectedDesign) parts.push(product.selectedDesign);
    if (product.reloadCode) parts.push(`reload:${product.reloadCode}`);
    return parts.join('::');
  };

  const addToCart = useCallback((product, quantity = 1) => {
    const cartItemId = createCartItemId(product);
    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.cartItemId === cartItemId);
      if (existingItem) {
        return prevCart.map((item) =>
          item.cartItemId === cartItemId
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prevCart, { ...product, cartItemId, quantity }];
    });
    setLastAdded({ item: { ...product, cartItemId, quantity }, at: Date.now() });
  }, []);

  const removeFromCart = useCallback((cartItemId) => {
    setCart((prevCart) => prevCart.filter((item) => item.cartItemId !== cartItemId));
  }, []);

  const updateQuantity = useCallback((cartItemId, quantity) => {
    if (quantity <= 0) {
      setCart((prevCart) => prevCart.filter((item) => item.cartItemId !== cartItemId));
    } else {
      setCart((prevCart) =>
        prevCart.map((item) =>
          item.cartItemId === cartItemId ? { ...item, quantity } : item
        )
      );
    }
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const getCartTotal = useCallback(
    () => cart.reduce((total, item) => total + (item.price * item.quantity), 0),
    [cart]
  );

  const getCartItemsCount = useCallback(
    () => cart.reduce((total, item) => total + item.quantity, 0),
    [cart]
  );

  const isDigitalOnly = useCallback(
    () => cart.length > 0 && cart.every(isDigitalItem),
    [cart]
  );

  const value = useMemo(() => ({
    cart,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    getCartTotal,
    getCartItemsCount,
    isDigitalOnly,
    isOpen,
    setIsOpen,
    openCart,
    closeCart,
    lastAdded,
  }), [cart, addToCart, removeFromCart, updateQuantity, clearCart, getCartTotal, getCartItemsCount, isDigitalOnly, isOpen, openCart, closeCart, lastAdded]);

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
};
