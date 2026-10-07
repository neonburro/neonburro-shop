// src/pages/Home/components/NewDrop.jsx
// SENTINEL: NB_SHOP_NEW_DROP_V1
//
// The new drop, one strip under the hero. Aster, 2026-10-07. Tyler, of the
// clouds and the loose prints: "I freaking love those ... Just add them in
// there." Thirteen shirts are too many to bury in the grid a screen and a half
// down, and the grid shows a line by one cover, so twelve of the thirteen would
// never be seen from the home page at all.
//
// ── what it reads ───────────────────────────────────────────────────────────
// The designs come from the two product records, loose and clouds, in
// data/products-wearable.js, interleaved so a cloud never sits beside a cloud.
// Nothing about a shirt is restated here. Add a design to either record and it
// appears in the strip. Each tile links to /product/<line>/?design=<id>, which
// ProductHero reads, so the tap lands on that shirt and not the first one.
//
// ── the scenes ──────────────────────────────────────────────────────────────
// Every tile stands on a SceneGround. The clouds stand under a cloud and the
// loose prints alternate mist and ridge, so the strip reads as weather moving
// left to right. The band's one lime point is the dot in the kicker.
//
// ── no container on a phone ─────────────────────────────────────────────────
// The strip scrolls sideways at every width with snap points, and on a phone
// a tile is most of the screen so one shirt is the whole view. There is no
// card chrome around a tile, only the rounded scene, the name and the line.
//
// No oxford commas, no em dashes.

import { Box, Heading, HStack, Text } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import { FiArrowRight } from 'react-icons/fi';
import { getProduct } from '../../../data/products';
import { colors } from '../../../theme/colors';
import { RAIL, SHEET, EASE } from '../../../theme/layout';
import SceneGround from '../../../components/shop/SceneGround';

const LIME = colors.accent.signal;
const LINES = ['clouds', 'loose'];

const interleave = () => {
  const lines = LINES.map((id) => getProduct(id)).filter(Boolean);
  const out = [];
  const longest = Math.max(0, ...lines.map((p) => p.designs.length));
  for (let i = 0; i < longest; i += 1) {
    lines.forEach((p) => {
      const d = p.designs[i];
      if (d) out.push({ line: p, design: d });
    });
  }
  return out;
};

const sceneFor = (line, i) => (line.id === 'clouds' ? 'cloud' : (i % 4 === 1 ? 'mist' : 'ridge'));

const Tile = ({ line, design, i }) => {
  const [title, shade] = design.name.split(' · ');
  return (
    <Box as={RouterLink} to={`/product/${line.id}/?design=${design.id}`} role="group" display="block"
      flex={{ base: '0 0 74vw', sm: '0 0 300px', lg: '0 0 320px' }} scrollSnapAlign="start"
      textDecoration="none" _hover={{ textDecoration: 'none' }} aria-label={`${title}, ${line.name}`}>
      <Box position="relative" borderRadius="xl" overflow="hidden" bg={colors.dark.gray}
        h={{ base: '74vw', sm: '300px', lg: '320px' }} display="flex" alignItems="center" justifyContent="center"
        border="1px solid" borderColor={colors.ui.border}
        sx={{ transition: `border-color 0.35s ${EASE}` }} _groupHover={{ borderColor: LIME }}>
        <SceneGround id={design.id} tint={line.color} variant={sceneFor(line, i)} />
        <Box as="img" src={design.image} alt={`${title} on ${shade || 'the loose cut'}`} loading="lazy"
          w="88%" h="88%" objectFit="contain" position="relative" zIndex={1} draggable={false}
          sx={{ transition: `transform 0.6s ${EASE}` }} _groupHover={{ transform: 'scale(1.035)' }} />
      </Box>
      <HStack justify="space-between" align="baseline" pt={3} spacing={3} minW={0}>
        <Text fontSize="md" fontWeight="600" letterSpacing="-0.02em" color={colors.text.primary}
          noOfLines={1} sx={{ transition: 'color 0.3s ease' }} _groupHover={{ color: LIME }}>
          {title}
        </Text>
        <Text fontFamily="mono" fontSize="10px" letterSpacing="0.16em" textTransform="uppercase"
          color={colors.text.muted} flexShrink={0}>
          {line.name}
        </Text>
      </HStack>
      {shade && (
        <Text fontFamily="mono" fontSize="10px" letterSpacing="0.16em" textTransform="uppercase" color={colors.text.muted} mt={1}>
          on {shade.toLowerCase()}
        </Text>
      )}
    </Box>
  );
};

const NewDrop = () => {
  const tiles = interleave();
  if (!tiles.length) return null;
  return (
    <Box as="section" aria-labelledby="new-drop-t" py={{ base: 12, md: 20 }} borderTop="1px solid" borderColor={colors.ui.border}>
      <Box px={RAIL} maxW={SHEET}>
        <HStack spacing={2.5} mb={4}>
          <Box w="6px" h="6px" borderRadius="full" bg={LIME} flexShrink={0} />
          <Text fontFamily="mono" fontSize="10px" fontWeight="500" letterSpacing="0.2em" textTransform="uppercase" color={colors.text.muted}>
            new · loose. and clouds.
          </Text>
        </HStack>
        <HStack justify="space-between" align="end" flexWrap="wrap" rowGap={4} mb={{ base: 7, md: 10 }}>
          <Box maxW="720px">
            <Heading as="h2" id="new-drop-t" fontSize={{ base: '28px', md: '44px' }} fontWeight="600" letterSpacing="-0.035em"
              lineHeight="1.04" color={colors.text.primary} mb={3}>
              {tiles.length} new shirts, drawn from things we already made.
            </Heading>
            <Text fontSize={{ base: 'sm', md: 'md' }} color={colors.text.secondary} lineHeight="1.7" maxW="600px">
              The thin clouds are one ink, laid once, so they sink into the cotton and fade with it. The rest come
              off the burro, the signal and the ridge from town. Same loose cut as everything here.
            </Text>
          </Box>
          <HStack spacing={5}>
            {LINES.map((id) => {
              const p = getProduct(id);
              if (!p) return null;
              return (
                <HStack key={id} as={RouterLink} to={`/product/${id}/`} spacing={1.5} role="group"
                  color={colors.text.secondary} textDecoration="none" _hover={{ color: LIME, textDecoration: 'none' }}>
                  <Text fontSize="sm" fontWeight="600">{p.name}</Text>
                  <Box as={FiArrowRight} boxSize={3.5} transition={`transform 0.25s ${EASE}`} _groupHover={{ transform: 'translateX(3px)' }} />
                </HStack>
              );
            })}
          </HStack>
        </HStack>
      </Box>

      <Box as="ul" m={0} p={0} display="flex" gap={{ base: 4, md: 6 }} overflowX="auto"
        px={RAIL} pb={4} scrollSnapType="x mandatory" scrollPaddingLeft={RAIL}
        sx={{ scrollbarWidth: 'thin', listStyle: 'none' }} aria-label="The new shirts">
        {tiles.map((t, i) => (
          <Box as="li" key={`${t.line.id}-${t.design.id}`} display="block" flex={{ base: '0 0 74vw', sm: '0 0 300px', lg: '0 0 320px' }}>
            <Tile line={t.line} design={t.design} i={i} />
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default NewDrop;
