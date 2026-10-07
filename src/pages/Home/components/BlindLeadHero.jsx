// src/pages/Home/components/BlindLeadHero.jsx
// SENTINEL: NB_SHOP_HERO_V4
//
// The shop leads with the hunt, not the merchandise. That is still the whole
// decision. What changed in V3 is that the hunt is now something you can see.
//
// ── V2 was a wall of text with an empty right half ─────────────────────────
// A ninety six pixel headline, two paragraphs and two buttons in the left
// column, and nothing on the right but a soft glow. On a wide display that
// read as a page that had not finished loading. The headline is smaller now
// and the right column holds the four clue envelopes, fanned like a hand of
// cards, each sealed by a different burro. It is the two dollar door drawn as
// an object, it links straight to that product, and it fills the half of the
// screen that used to be empty with the actual thing being sold.
//
// ── the keeper ──────────────────────────────────────────────────────────────
// The shop has a burro who runs it. When the portrait lands at KEEPER_SRC it
// renders behind the fan (or on its own on very narrow screens). Until the
// file exists the <Image> fails to load, onError flips a flag and nothing is
// drawn, so the hero is complete with or without it. Deliver the portrait as
// a 4:5 webp, 2000x2500 with a 1200 wide variant, the same shape the studio
// used for the account login plate. It scales by width in a column, so a
// wide crop would arrive as a strip. See the note in the chat that shipped
// this file for the full sizing guidance.
//
// Nothing here animates for the sake of it. The float dot breathes, the
// envelopes arrive once and lift on hover. That is the whole motion budget.
//
// No oxford commas, no em dashes.

import { Box, Text, Heading, HStack, Grid, GridItem, Image } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { FiArrowRight, FiArrowDown } from 'react-icons/fi';
import { HUNT } from '../../../data/blindLead';
import { CLUE_FLOATS } from '../../../data/products-digital';
import { colors } from '../../../theme/colors';
import { RAIL, SHEET, EASE } from '../../../theme/layout';
import { CLOUD, MIST } from '../../../data/scenes';

const MotionBox = motion(Box);
const LIME = colors.accent.signal;

// Drop the shopkeeper here when it exists. Nothing renders until it does.
const KEEPER_SRC = '/images/shop/hero/keeper.webp';

// The spread. Four envelopes laid on a table, each fully visible because the
// four burros on them are the point. A fanned hand looked better and hid
// three of them behind the front card. Positions are percentages of the
// square, index order matches CLUE_FLOATS.
const FAN = [
  { rot: -7, left: 2, top: 4 },
  { rot: 5, left: 50, top: 0 },
  { rot: 4, left: 0, top: 50 },
  { rot: -5, left: 52, top: 47 },
];

const EnvelopeFan = () => (
  <Box as={RouterLink} to="/product/two-dollar-clue/" role="group" display="block"
    position="relative" w="100%" maxW="560px" mx="auto" aria-label="The $2 Clue, four floats"
    _hover={{ textDecoration: 'none' }}>
    <Box position="relative" w="100%" pt="96%">
      {CLUE_FLOATS.map((f, i) => {
        const g = FAN[i] || FAN[FAN.length - 1];
        return (
          <MotionBox key={f.id} position="absolute" left={`${g.left}%`} top={`${g.top}%`} w="47%"
            initial={{ opacity: 0, y: 30, rotate: 0 }}
            animate={{ opacity: 1, y: 0, rotate: g.rot }}
            transition={{ duration: 0.9, delay: 0.25 + i * 0.09, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: '50% 50%' }}
            zIndex={i + 1}>
            {/* The envelope art is transparent, so the shadow has to follow the
                paper, not a box around it. drop-shadow does that, box-shadow
                would draw a dark slab. */}
            <Box transition={`transform 480ms ${EASE}, filter 480ms ${EASE}`}
              filter="drop-shadow(0 22px 34px rgba(0,0,0,0.55))"
              _groupHover={{ transform: `translateY(${-8 - i * 3}px)`, filter: `drop-shadow(0 30px 44px rgba(0,0,0,0.6)) drop-shadow(0 0 18px ${LIME}33)` }}>
              <Image src={f.image} alt={`${f.name}, sealed by ${f.character}`} w="100%" h="auto" display="block"
                draggable={false} loading="eager" />
            </Box>
          </MotionBox>
        );
      })}
    </Box>

    <HStack justify="center" spacing={3} mt={{ base: 2, md: 4 }} opacity={0.9}
      transition={`opacity 300ms ${EASE}`} _groupHover={{ opacity: 1 }}>
      <Box w="5px" h="5px" borderRadius="full" bg={LIME} boxShadow={`0 0 10px ${LIME}`} />
      <Text fontFamily="mono" fontSize={{ base: '9px', md: '10px' }} letterSpacing="0.2em"
        textTransform="uppercase" color={colors.text.secondary} textAlign="center">
        The $2 Clue · four floats · four burros
      </Text>
      <Box as={FiArrowRight} boxSize={3} color={LIME} transition={`transform 300ms ${EASE}`}
        _groupHover={{ transform: 'translateX(3px)' }} />
    </HStack>
  </Box>
);

const BlindLeadHero = ({ onScrollToProducts }) => {
  const [keeper, setKeeper] = useState(true);

  return (
    <Box as="section" position="relative" overflow="hidden"
      minH={{ base: 'auto', md: '84vh' }} display="flex" alignItems="center"
      pt={{ base: 28, md: 24 }} pb={{ base: 14, md: 12 }}
      sx={{ background: `linear-gradient(118deg, ${colors.dark.void} 0%, ${LIME}0C 44%, ${colors.dark.black} 100%)` }}>

      {/* THE SKY, 2026-10-07. The soft lime glow that sat here is a woodblock
          night now: the carved cloud from the clouds. tees drawn large and
          faint behind the envelopes, low mist along the bottom and the one
          lime signal above the cloud, desktop only, because on a phone it lands
          beside the bag and reads as a notification. Flat, no blur, nothing moves. The
          outlines are data/scenes.js. docs/SHOP-DIRECTION.md asks for weather
          behind the goods and this is the hero's share of it. */}
      <Box position="absolute" aria-hidden="true" pointerEvents="none"
        top={{ base: '2%', md: '12%' }} right={{ base: '-30%', md: '-9%' }}
        w={{ base: '520px', md: '900px' }} opacity={{ base: 0.5, md: 1 }}
        sx={{ '& circle': { display: { base: 'none', md: 'inline' } } }}>
        <Box as="svg" viewBox="0 0 2080 1520" w="100%" h="auto" display="block">
          <path transform={CLOUD.transform} d={CLOUD.d} fill={LIME} fillOpacity="0.13" />
          <circle cx="1560" cy="150" r="22" fill={LIME} />
        </Box>
      </Box>
      <Box position="absolute" aria-hidden="true" pointerEvents="none"
        bottom={{ base: '-4%', md: '-7%' }} left={{ base: '-20%', md: '-6%' }} w={{ base: '420px', md: '640px' }}>
        <Box as="svg" viewBox="0 0 2200 1280" w="100%" h="auto" display="block">
          <path transform={MIST.transform} d={MIST.d} fill={LIME} fillOpacity="0.07" />
        </Box>
      </Box>

      <Box px={RAIL} maxW={SHEET} w="100%" position="relative" zIndex={1}>
        <Grid templateColumns={{ base: '1fr', md: '1.05fr 0.95fr' }} gap={{ base: 12, md: 10, lg: 16 }} alignItems="center">
          <GridItem>
            <MotionBox initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}>

              <HStack spacing={3} mb={{ base: 5, md: 6 }}>
                <Box w="7px" h="7px" borderRadius="full" bg={LIME} flexShrink={0}
                  sx={{ boxShadow: `0 0 12px ${LIME}`,
                        animation: 'nbFloat 3.4s ease-in-out infinite',
                        '@keyframes nbFloat': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.35 } } }} />
                <Text fontFamily="mono" fontSize={{ base: '9px', md: '10px' }} fontWeight="500"
                  letterSpacing="0.24em" textTransform="uppercase" color={LIME}>
                  {HUNT.region}
                </Text>
              </HStack>

              <Heading as="h1" fontWeight="600" letterSpacing="-0.04em" lineHeight="0.94"
                color={colors.text.primary} fontSize={{ base: '40px', md: '56px', lg: '68px' }}
                maxW="720px" mb={{ base: 5, md: 6 }}>
                Every piece we make
                <Box as="span" display="block" color={LIME}>carries a clue.</Box>
              </Heading>

              {/* One paragraph, one voice. V2 stacked a bright lede over a
                  smaller grey paragraph and the two read as two typefaces. */}
              <Text fontSize={{ base: 'md', md: 'lg' }} color={colors.text.secondary} lineHeight="1.7"
                maxW="560px" mb={{ base: 8, md: 9 }}>
                There is real treasure on public land in western Colorado. The cups, the shirts, the
                two dollar envelope, each one carries a fragment pointing at it. Prospectors call that
                float, loose ore found downstream that proves a vein exists somewhere above you.
                Follow enough of it and you are standing on {HUNT.name}.
              </Text>

              <HStack spacing={4} flexWrap="wrap" rowGap={3}>
                <Box as={RouterLink} to="/the-blind-lead/" display="inline-flex" alignItems="center"
                  gap="9px" px={7} py={4} borderRadius="full" bg={LIME} color={colors.dark.black}
                  fontWeight="700" fontSize={{ base: 'sm', md: 'md' }} textDecoration="none"
                  transition="transform 0.25s ease, filter 0.25s ease"
                  _hover={{ transform: 'translateY(-2px)', filter: 'brightness(1.08)', textDecoration: 'none' }}>
                  How the hunt works <FiArrowRight />
                </Box>
                <Box as="button" onClick={onScrollToProducts} display="inline-flex" alignItems="center"
                  gap="9px" px={7} py={4} borderRadius="full" border="1px solid"
                  borderColor={colors.ui.border} color={colors.text.secondary} fontWeight="600"
                  fontSize={{ base: 'sm', md: 'md' }}
                  transition="border-color 0.25s ease, color 0.25s ease"
                  _hover={{ borderColor: LIME, color: colors.text.primary }}>
                  See what carries it <FiArrowDown />
                </Box>
              </HStack>
            </MotionBox>
          </GridItem>

          <GridItem>
            <Box position="relative">
              {keeper && (
                <Image src={KEEPER_SRC} alt="" aria-hidden="true" onError={() => setKeeper(false)}
                  position="absolute" inset={0} m="auto" w="78%" h="auto" maxH="100%" objectFit="contain"
                  opacity={0.9} pointerEvents="none" zIndex={0}
                  filter="drop-shadow(0 30px 60px rgba(0,0,0,0.5))" />
              )}
              <Box position="relative" zIndex={1}>
                <EnvelopeFan />
              </Box>
            </Box>
          </GridItem>
        </Grid>
      </Box>
    </Box>
  );
};

export default BlindLeadHero;
