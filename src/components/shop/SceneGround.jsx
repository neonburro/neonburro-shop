// src/components/shop/SceneGround.jsx
// SENTINEL: NB_SHOP_SCENE_GROUND_V1
//
// The ground a product stands in front of. Aster, 2026-10-07, the first item
// in docs/SHOP-DIRECTION.md: every product image here has a transparent
// background, so the tile can be a scene instead of a box. Tyler named the
// references and they are all weather: a woodblock sky in flat bands, a cloud
// with an edge, sunlight. This draws three of them and nothing else.
//
//   cloud  the carved cloud from the clouds. tees, in thin line, over a banded
//          night sky. The same silhouette as the shirt, on purpose.
//   mist   three bands of low cloud, low in the frame.
//   ridge  the Cimarron ridge from town, the spire standing out of it.
//
// ── why it is flat ──────────────────────────────────────────────────────────
// A woodblock has no gradient, so neither does this. The sky is four bands of
// near black, each a hair lighter toward the horizon, tinted by the product's
// own colour at a few percent. The linework is that same tint at about a
// third. Nothing here may compete with the shirt, and nothing here glows.
//
// ── the lime ────────────────────────────────────────────────────────────────
// The shop is licensed to spend lime as a main colour, but a grid of twenty
// tiles each with a lime dot reads as a rash. So a tile carries no lime of its
// own. Only `signal` turns on the one lime point, and only the hero and the
// new drop band ask for it.
//
// ── which scene a product gets ──────────────────────────────────────────────
// Picked by a hash of the product id, the same idea as data/covers.js, so a
// product keeps its sky forever and two neighbours rarely share one. Pass
// `variant` to choose by hand.
//
// The outlines live in data/scenes.js with the note on where they came from.
//
// No oxford commas, no em dashes.

import { Box } from '@chakra-ui/react';
import { CLOUD, MIST, RIDGE } from '../../data/scenes';
import { colors } from '../../theme/colors';

const VARIANTS = ['cloud', 'mist', 'ridge'];
const LIME = colors.accent.signal;

const pick = (id = '') => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return VARIANTS[h % VARIANTS.length];
};

// four flat bands, darkest at the top, the tint creeping in toward the horizon
const Bands = ({ tint }) => (
  <>
    <rect x="0" y="0" width="400" height="400" fill={colors.dark.gray} />
    {[0.0, 0.025, 0.05, 0.08].map((o, i) => (
      <rect key={i} x="0" y={i * 100} width="400" height="101" fill={tint} fillOpacity={o} />
    ))}
  </>
);

const SceneGround = ({ id, tint = LIME, variant, signal = false, line = 0.34, ...rest }) => {
  const v = variant || pick(id);
  return (
    <Box position="absolute" inset={0} pointerEvents="none" aria-hidden="true" {...rest}>
      <Box as="svg" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" w="100%" h="100%" display="block">
        <Bands tint={tint} />
        {v === 'cloud' && (
          <g transform="translate(14 20) scale(0.104)" opacity={line}>
            <path transform={CLOUD.transform} d={CLOUD.d} fill={tint} />
          </g>
        )}
        {v === 'mist' && (
          <g transform="translate(64 300) scale(0.124)" opacity={line * 0.8}>
            <path transform={MIST.transform} d={MIST.d} fill={tint} />
          </g>
        )}
        {v === 'ridge' && (
          <g transform="translate(0 214) scale(0.5)">
            <path d={RIDGE} fill={colors.dark.void} fillOpacity="0.5" />
            <path d={RIDGE} fill="none" stroke={tint} strokeOpacity={line} strokeWidth="3" strokeLinejoin="round" />
          </g>
        )}
        {signal && <circle cx="338" cy="62" r="5.5" fill={LIME} />}
      </Box>
    </Box>
  );
};

export default SceneGround;
