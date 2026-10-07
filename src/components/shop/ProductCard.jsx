// src/components/shop/ProductCard.jsx
// SENTINEL: NB_SHOP_PRODUCT_CARD_V1
//
// One product tile, used by the home grid and by the related row on a product
// page. One component so the two cannot drift, which they had: the related row
// still carried yellow "Featured" badges from the 2025 palette while the grid
// had been cleaned twice.
//
// ── what a card shows, and what it does not ─────────────────────────────────
// The picture, the name, one mono line. That is all. The line is the subtitle
// (100% organic cotton, washed cotton twill, four kinds of float) with the
// price on the end in the same voice, so a card reads as a label rather than a
// listing. Everything else the old card carried is one tap away on the product
// page and was clutter here:
//
//   · the stock badge     the product page says out of stock, at length, with
//                         a reason. A badge on the grid made every shirt in a
//                         store that has not shipped its first run shout it.
//   · heavy float         a hunt detail. It belongs next to the float band.
//   · the description     two lines of truncated prose under every tile on a
//                         phone is a wall.
//   · the dimmed image    an out of stock piece is still a photograph.
//
// ── mobile has no container ─────────────────────────────────────────────────
// On base the tile has no border and no background. The image sits in its own
// rounded well and the text hangs under it, the way a lookbook does. The
// hairline card returns at md where there is room for chrome. This is the
// same rule the content sections follow, no boxes on a phone.
//
// ── the scene behind the cutout ─────────────────────────────────────────────
// 2026-10-07. The image well used to be a soft radial glow in the product's
// tint. It is a SceneGround now, a flat woodblock sky with a cloud, low mist or
// the ridge, so the grid reads as a set of scenes and not a row of boxes. The
// tint still comes from product.color, and the cutout sits above it. See
// SceneGround.jsx for the why.
//
// No oxford commas, no em dashes.

import { Box, Heading, Text, VStack, HStack } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { colors } from '../../theme/colors';
import { EASE } from '../../theme/layout';
import SceneGround from './SceneGround';

const MotionBox = motion(Box);
const LIME = colors.accent.signal;

export const money = (n) => `$${Number(n || 0).toLocaleString('en-US')}`;

const ProductCard = ({ product, index = 0, animate = true }) => {
  const navigate = useNavigate();
  const tint = product.color || LIME;

  const motionProps = animate
    ? {
      initial: { opacity: 0, y: 14 },
      whileInView: { opacity: 1, y: 0 },
      viewport: { once: true, margin: '-40px' },
      transition: { duration: 0.5, delay: Math.min(index, 4) * 0.06 },
    }
    : {};

  return (
    <MotionBox
      {...motionProps}
      as="article"
      onClick={() => navigate(`/product/${product.id}/`)}
      cursor="pointer"
      role="group"
      borderRadius={{ base: 'none', md: 'xl' }}
      overflow="hidden"
      bg={{ base: 'transparent', md: colors.dark.gray }}
      border={{ base: 'none', md: '1px solid' }}
      borderColor={colors.ui.border}
      sx={{ transition: `border-color 0.35s ${EASE}, transform 0.35s ${EASE}` }}
      _hover={{ borderColor: LIME, transform: { md: 'translateY(-3px)' } }}
      aria-label={product.name}
    >
      <Box
        position="relative"
        height={{ base: '200px', sm: '240px', md: '300px', lg: '330px' }}
        display="flex"
        alignItems="center"
        justifyContent="center"
        borderRadius={{ base: 'xl', md: 'none' }}
        overflow="hidden"
        bg={colors.dark.gray}
      >
        <SceneGround id={product.id} tint={tint} />
        {product.featuredImage ? (
          <Box
            as="img"
            src={product.featuredImage}
            alt={product.name}
            loading="lazy"
            maxW="84%"
            maxH="84%"
            objectFit="contain"
            draggable={false}
            position="relative"
            zIndex={1}
            sx={{ transition: `transform 0.6s ${EASE}` }}
            _groupHover={{ transform: 'scale(1.03)' }}
          />
        ) : (
          <VStack spacing={2} px={6} textAlign="center">
            <Box w="46px" h="46px" borderRadius="sm" border="1px solid" borderColor={colors.ui.border} opacity={0.7} />
            <Text fontFamily="mono" fontSize="9px" letterSpacing="0.16em" textTransform="uppercase" color={colors.text.muted}>
              Not photographed yet
            </Text>
          </VStack>
        )}
      </Box>

      <VStack align="stretch" spacing={1.5} px={{ base: 1, md: 6 }} pt={{ base: 3, md: 5 }} pb={{ base: 1, md: 6 }}
        borderTop={{ base: 'none', md: '1px solid' }} borderColor={colors.ui.border}>
        <Heading as="h3" fontSize={{ base: 'md', md: 'lg' }} fontWeight="600" letterSpacing="-0.02em"
          color={colors.text.primary} noOfLines={1} lineHeight="1.2"
          sx={{ transition: 'color 0.3s ease' }} _groupHover={{ color: LIME }}>
          {product.name}
        </Heading>
        <HStack spacing={2} align="baseline" minW={0}>
          <Text fontFamily="mono" fontSize={{ base: '9px', md: '10px' }} letterSpacing="0.16em"
            textTransform="uppercase" color={colors.text.muted} noOfLines={1} minW={0}>
            {product.subtitle}
          </Text>
          <Text fontFamily="mono" fontSize={{ base: '9px', md: '10px' }} letterSpacing="0.16em"
            textTransform="uppercase" color={colors.text.muted} flexShrink={0}>
            · {money(product.price)}
          </Text>
        </HStack>
      </VStack>
    </MotionBox>
  );
};

export default ProductCard;
