// src/pages/ProductDetail/components/ProductHero.jsx
// SENTINEL: NB_SHOP_PRODUCT_HERO_V2
//
// The top of a product page. Image on the left, everything you need to decide
// on the right, and the two buttons.
//
// ── what changed in V2 and why ──────────────────────────────────────────────
//   · Digital aware. A two dollar email used to promise "Free shipping in the
//     US" and a truck icon. delivery: 'digital' on the record now swaps the
//     kicker, the reassurance lines and the checkout expectations. Read
//     isDigital before you add a line of copy here.
//   · The giant faded initial behind the image is gone, the same call the grid
//     made in V3. A huge grey letter behind a photograph reads as a bug.
//   · Design variants with images (the four clue envelopes) render as a two up
//     grid of tiles that show the artwork, the name, who sealed it and what
//     kind of float it is. The main image follows the selection. Radios and
//     fifty pixel thumbnails could not carry a character.
//   · Reloadable products (the Pay Card) get a two way switch, New card or
//     Reload a card, and a code field in reload mode. The code rides on the
//     cart line as reloadCode and onto the PaymentIntent metadata. See
//     data/products-digital.js for where the ledger lives (not here yet).
//   · The cart line is built from a short list of fields rather than
//     spreading the whole record. The record carries stories, materials and
//     every variant, and all of that was landing in localStorage and in the
//     Stripe metadata JSON on every add.
//   · No toast on add. The saddlebag pill and the nav counter announce it now.
//     Toasts remain for the one thing a toast is for, telling somebody why
//     the button did nothing.
//
// The em dash that used to live in the final sale line is gone. House rule.
//
// No oxford commas, no em dashes.

import {
  Box,
  Container,
  Grid,
  GridItem,
  Heading,
  Text,
  VStack,
  HStack,
  Button,
  Image,
  Input,
  Select,
  SimpleGrid,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  useToast,
} from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiShoppingBag, FiTruck, FiMail, FiPackage, FiRefreshCw } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { primeInventory, subscribeInventory, stockState } from '../../../data/inventory';
import { colors } from '../../../theme/colors';
import { RAIL, SHEET, EASE } from '../../../theme/layout';

const MotionBox = motion(Box);
const LIME = colors.accent.signal;

const money = (n) => `$${Number(n || 0).toLocaleString('en-US')}`;

// The fields a cart line needs. Nothing else from the record travels. The
// price on the line is for display only. priceOrder in
// netlify/functions/_shop-catalog.js reprices every line from the record and
// reads size, design, tier and reload code the way this file does, with the
// same quantity ceiling of 10 as the stepper below. Change one, change both.
const LINE_FIELDS = ['id', 'name', 'subtitle', 'category', 'room', 'delivery', 'color', 'featuredImage', 'stripePriceId', 'floatWeight'];

const ProductHero = ({ product, onAddToCart, onBuyNow }) => {
  const navigate = useNavigate();
  const toast = useToast();

  const isDigital = product.delivery === 'digital' || product.category === 'Digital';
  const hasDesigns = product.hasVariants && product.variantType === 'design' && Array.isArray(product.designs);
  const hasTiers = product.hasVariants && product.variantType === 'tier' && Array.isArray(product.priceOptions);
  const reloadable = !!product.reloadable;

  const [selectedSize, setSelectedSize] = useState(product.sizes ? product.sizes[0] : '');
  const [selectedTier, setSelectedTier] = useState(hasTiers ? (product.priceOptions.find((t) => t.featured) || product.priceOptions[0]) : null);
  const [selectedDesign, setSelectedDesign] = useState(hasDesigns ? product.designs[0] : null);
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [mode, setMode] = useState('new');
  const [reloadCode, setReloadCode] = useState('');
  const [, setStockTick] = useState(0);

  // Live stock from Pulse. Until it answers, stockState falls back to the
  // static inStock flag on the product. See data/inventory.js.
  useEffect(() => {
    const off = subscribeInventory(() => setStockTick((n) => n + 1));
    primeInventory();
    return off;
  }, []);

  const price = hasTiers && selectedTier ? selectedTier.price : product.price;
  const heroImage = selectedDesign?.image || product.featuredImage;
  const tint = product.color || LIME;
  const state = stockState(product, selectedDesign?.id || null);
  const buyable = state === 'in' || state === 'low';

  const validate = () => {
    if (product.sizes && !selectedSize) {
      toast({ title: 'Pick a size', status: 'warning', duration: 2000, isClosable: true });
      return false;
    }
    if (hasDesigns && !selectedDesign) {
      toast({ title: 'Pick a float', status: 'warning', duration: 2000, isClosable: true });
      return false;
    }
    if (hasTiers && !selectedTier) {
      toast({ title: 'Pick a balance', status: 'warning', duration: 2000, isClosable: true });
      return false;
    }
    if (reloadable && mode === 'reload' && reloadCode.trim().length < 6) {
      toast({
        title: 'Enter the card code',
        description: product.reload?.codeHint,
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return false;
    }
    return true;
  };

  const buildLine = () => {
    const line = {};
    LINE_FIELDS.forEach((k) => { if (product[k] !== undefined) line[k] = product[k]; });
    return {
      ...line,
      price,
      selectedSize: selectedSize || undefined,
      selectedTier: selectedTier?.label,
      selectedDesign: selectedDesign?.name,
      selectedDesignImage: selectedDesign?.image,
      featuredImage: heroImage,
      stripePriceId: selectedTier?.stripePriceId || product.stripePriceId,
      reloadCode: reloadable && mode === 'reload' ? reloadCode.trim().toUpperCase() : undefined,
      quantity,
    };
  };

  const handleAddToCart = () => {
    if (!validate()) return;
    setIsAdding(true);
    setTimeout(() => {
      onAddToCart(buildLine());
      setIsAdding(false);
    }, 220);
  };

  const handleBuyNow = () => {
    if (!validate()) return;
    onBuyNow(buildLine());
  };

  const tileBorder = (active) => (active ? tint : colors.ui.border);
  const tileBg = (active) => (active ? `${tint}12` : 'rgba(255,255,255,0.02)');

  const reassurance = useMemo(() => (isDigital
    ? [
      { icon: FiMail, title: 'Delivered by email', body: 'Usually within the hour. Check the address before you pay.' },
      { icon: null, title: 'Carries float', body: 'A fragment of The Blind Lead. The board publishes it free in thirty days.' },
      { icon: FiPackage, title: 'Digital, no returns', body: 'Once it is opened it is read. What you find is yours.' },
    ]
    : [
      { icon: FiTruck, title: 'Free US shipping', body: 'Small runs, packed by hand in Ridgway.' },
      { icon: null, title: 'Carries float', body: 'A fragment of The Blind Lead. The board publishes it free in thirty days.' },
      { icon: FiPackage, title: 'Final sale', body: 'Naturally dyed, made in small runs. What you find is yours.' },
    ]), [isDigital]);

  return (
    <Box position="relative" width="100%" pt={{ base: 20, md: 24 }}>
      <Container maxW={SHEET} px={RAIL} mx={0}>
        <MotionBox initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }} mb={{ base: 6, md: 8 }}>
          <Button variant="ghost" leftIcon={<FiArrowLeft />} onClick={() => navigate('/')}
            color={colors.text.muted} fontWeight="500" fontSize="sm" px={2}
            _hover={{ color: colors.text.primary, bg: 'rgba(255,255,255,0.04)' }}>
            Back to the shop
          </Button>
        </MotionBox>

        <Grid templateColumns={{ base: '1fr', lg: '1.05fr 1fr' }} gap={{ base: 8, lg: 16 }} alignItems="start">
          {/* ── the object ─────────────────────────────────────────────── */}
          <GridItem>
            <MotionBox initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
              <Box position="relative" borderRadius="20px" overflow="hidden" aspectRatio={1}
                border="1px solid" borderColor={colors.ui.border}
                background={`radial-gradient(circle at 50% 42%, ${tint}16 0%, ${colors.dark.gray} 58%, ${colors.dark.black} 100%)`}
                display="flex" alignItems="center" justifyContent="center">
                {heroImage ? (
                  <MotionBox key={heroImage} initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                    w="100%" h="100%" display="flex" alignItems="center" justifyContent="center">
                    <Image src={heroImage} alt={selectedDesign ? `${product.name}, ${selectedDesign.name}` : product.name}
                      maxW="82%" maxH="82%" objectFit="contain" draggable={false}
                      filter={`drop-shadow(0 24px 44px ${tint}26)`} />
                  </MotionBox>
                ) : (
                  <VStack spacing={2}>
                    <Box w="56px" h="56px" borderRadius="sm" border="1px solid" borderColor={colors.ui.border} opacity={0.7} />
                    <Text fontFamily="mono" fontSize="9px" letterSpacing="0.16em" textTransform="uppercase" color={colors.text.muted}>
                      Not photographed yet
                    </Text>
                  </VStack>
                )}

                {selectedDesign?.character && (
                  <HStack position="absolute" left={{ base: 4, md: 5 }} bottom={{ base: 4, md: 5 }} spacing={2}
                    px={3} py={1.5} borderRadius="full" bg="rgba(11,11,12,0.72)" border="1px solid" borderColor={colors.ui.border}
                    sx={{ backdropFilter: 'blur(8px)' }}>
                    <Box w="5px" h="5px" borderRadius="full" bg={LIME} />
                    <Text fontFamily="mono" fontSize="9px" letterSpacing="0.16em" textTransform="uppercase" color={colors.text.secondary}>
                      Sealed by {selectedDesign.character}
                    </Text>
                  </HStack>
                )}
              </Box>
            </MotionBox>
          </GridItem>

          {/* ── the decision ───────────────────────────────────────────── */}
          <GridItem>
            <MotionBox initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}>
              <VStack align="stretch" spacing={{ base: 6, md: 7 }}>
                <VStack align="start" spacing={3}>
                  <HStack spacing={2}>
                    <Box w="5px" h="5px" borderRadius="full" bg={LIME} />
                    <Text fontFamily="mono" fontSize="9px" letterSpacing="0.2em" textTransform="uppercase" color={colors.text.muted}>
                      {product.category}{isDigital ? ' · delivered by email' : ' · free US shipping'}
                    </Text>
                  </HStack>
                  <Heading as="h1" fontSize={{ base: '32px', md: '44px' }} fontWeight="600" letterSpacing="-0.035em"
                    lineHeight="1" color={colors.text.primary}>
                    {product.name}
                  </Heading>
                  <Text fontFamily="mono" fontSize="10px" letterSpacing="0.18em" textTransform="uppercase" color={tint}>
                    {product.subtitle}
                  </Text>
                  <Text fontFamily="mono" fontSize={{ base: '26px', md: '30px' }} fontWeight="500" color={colors.text.primary} pt={1}>
                    {money(price)}
                  </Text>
                </VStack>

                <Text fontSize={{ base: 'md', md: 'lg' }} color={colors.text.secondary} lineHeight="1.7">
                  {product.description}
                </Text>

                {/* design variants with artwork, the envelopes */}
                {hasDesigns && (
                  <VStack align="stretch" spacing={3}>
                    <Text fontFamily="mono" fontSize="10px" letterSpacing="0.18em" textTransform="uppercase" color={colors.text.muted}>
                      {product.designLabel || 'Choose a design'}
                    </Text>
                    <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3}>
                      {product.designs.map((d) => {
                        const active = selectedDesign?.id === d.id;
                        return (
                          <Box key={d.id} as="button" type="button" textAlign="left" onClick={() => setSelectedDesign(d)}
                            p={3} borderRadius="14px" border="1px solid" borderColor={tileBorder(active)} bg={tileBg(active)}
                            transition={`border-color 220ms ${EASE}, background-color 220ms ${EASE}, transform 220ms ${EASE}`}
                            _hover={{ borderColor: active ? tint : colors.ui.borderHover, transform: 'translateY(-1px)' }}
                            aria-pressed={active}>
                            <HStack align="start" spacing={3}>
                              <Box flexShrink={0} w="58px" h="58px" borderRadius="10px" overflow="hidden"
                                border="1px solid" borderColor={colors.ui.border}
                                background={`radial-gradient(circle at 50% 45%, ${tint}18 0%, ${colors.dark.gray} 72%)`}
                                display="flex" alignItems="center" justifyContent="center">
                                {d.image && <Image src={d.image} alt="" maxW="86%" maxH="86%" objectFit="contain" draggable={false} />}
                              </Box>
                              <VStack align="start" spacing={0.5} minW={0}>
                                <Text color={colors.text.primary} fontWeight="600" fontSize="sm" letterSpacing="-0.01em">
                                  {d.name}
                                </Text>
                                {d.character && (
                                  <Text fontFamily="mono" fontSize="9px" letterSpacing="0.14em" textTransform="uppercase"
                                    color={active ? tint : colors.text.muted} noOfLines={1}>
                                    {d.character}{d.characterTitle ? ` · ${d.characterTitle}` : ''}
                                  </Text>
                                )}
                                {d.description && (
                                  <Text fontSize="xs" color={colors.text.secondary} lineHeight="1.55" noOfLines={3} pt={1}>
                                    {d.description}
                                  </Text>
                                )}
                              </VStack>
                            </HStack>
                          </Box>
                        );
                      })}
                    </SimpleGrid>
                  </VStack>
                )}

                {/* new or reload */}
                {reloadable && (
                  <VStack align="stretch" spacing={3}>
                    <HStack spacing={0} p="3px" borderRadius="full" border="1px solid" borderColor={colors.ui.border}
                      bg="rgba(255,255,255,0.02)" w="fit-content">
                      {[
                        { id: 'new', label: product.reload?.newLabel || 'New card' },
                        { id: 'reload', label: product.reload?.reloadLabel || 'Reload a card', icon: FiRefreshCw },
                      ].map((m) => {
                        const active = mode === m.id;
                        return (
                          <Button key={m.id} type="button" onClick={() => setMode(m.id)} size="sm" h="34px" px={4}
                            borderRadius="full" fontWeight="600" fontSize="sm"
                            leftIcon={m.icon ? <Box as={m.icon} boxSize="13px" /> : undefined}
                            bg={active ? tint : 'transparent'} color={active ? colors.dark.black : colors.text.secondary}
                            _hover={{ bg: active ? tint : 'rgba(255,255,255,0.05)', color: active ? colors.dark.black : colors.text.primary }}
                            aria-pressed={active}>
                            {m.label}
                          </Button>
                        );
                      })}
                    </HStack>
                    {mode === 'reload' && (
                      <MotionBox initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                        <VStack align="stretch" spacing={2}>
                          <Text fontFamily="mono" fontSize="10px" letterSpacing="0.18em" textTransform="uppercase" color={colors.text.muted}>
                            {product.reload?.codeLabel || 'Card code'}
                          </Text>
                          <Input value={reloadCode} onChange={(e) => setReloadCode(e.target.value)}
                            placeholder={product.reload?.codePlaceholder || 'Card code'} size="lg" fontFamily="mono"
                            letterSpacing="0.08em" textTransform="uppercase" bg="rgba(255,255,255,0.02)" border="1px solid"
                            borderColor={colors.ui.border} color={colors.text.primary} maxW="360px"
                            _placeholder={{ color: colors.text.muted, textTransform: 'none', letterSpacing: 'normal' }}
                            _hover={{ borderColor: colors.ui.borderHover }}
                            _focus={{ borderColor: tint, boxShadow: `0 0 0 1px ${tint}` }} />
                          <Text fontSize="xs" color={colors.text.muted} lineHeight="1.6" maxW="420px">
                            {product.reload?.codeHint}
                          </Text>
                        </VStack>
                      </MotionBox>
                    )}
                  </VStack>
                )}

                {/* tiers, the balances */}
                {hasTiers && (
                  <VStack align="stretch" spacing={3}>
                    <Text fontFamily="mono" fontSize="10px" letterSpacing="0.18em" textTransform="uppercase" color={colors.text.muted}>
                      {mode === 'reload' ? 'Add to the balance' : (product.tierLabel || 'Choose an option')}
                    </Text>
                    <VStack align="stretch" spacing={2}>
                      {product.priceOptions.map((t) => {
                        const active = selectedTier?.id === t.id;
                        return (
                          <Box key={t.id} as="button" type="button" textAlign="left" onClick={() => setSelectedTier(t)}
                            px={4} py={3.5} borderRadius="14px" border="1px solid" borderColor={tileBorder(active)} bg={tileBg(active)}
                            transition={`border-color 220ms ${EASE}, background-color 220ms ${EASE}`}
                            _hover={{ borderColor: active ? tint : colors.ui.borderHover }} aria-pressed={active}>
                            <HStack justify="space-between" align="start" spacing={4}>
                              <VStack align="start" spacing={0.5} minW={0}>
                                <HStack spacing={2}>
                                  <Text color={colors.text.primary} fontWeight="600" fontSize="sm">{t.label}</Text>
                                  {t.featured && (
                                    <Text fontFamily="mono" fontSize="9px" letterSpacing="0.14em" textTransform="uppercase" color={LIME}>
                                      most chosen
                                    </Text>
                                  )}
                                </HStack>
                                <Text fontSize="xs" color={colors.text.secondary} lineHeight="1.55">{t.description}</Text>
                              </VStack>
                              <Text fontFamily="mono" fontSize="md" fontWeight="500" color={active ? tint : colors.text.primary} flexShrink={0}>
                                {money(t.price)}
                              </Text>
                            </HStack>
                          </Box>
                        );
                      })}
                    </VStack>
                  </VStack>
                )}

                {/* size */}
                {product.sizes && (
                  <VStack align="start" spacing={3} width="100%">
                    <Text fontFamily="mono" fontSize="10px" letterSpacing="0.18em" textTransform="uppercase" color={colors.text.muted}>
                      Size
                    </Text>
                    <Select value={selectedSize} onChange={(e) => setSelectedSize(e.target.value)} size="lg" maxW="240px"
                      bg="rgba(255,255,255,0.02)" border="1px solid" borderColor={colors.ui.border} color={colors.text.primary}
                      _hover={{ borderColor: colors.ui.borderHover }} _focus={{ borderColor: tint, boxShadow: `0 0 0 1px ${tint}` }}>
                      {product.sizes.map((size) => (
                        <option key={size} value={size} style={{ background: '#141416' }}>{size}</option>
                      ))}
                    </Select>
                  </VStack>
                )}

                {/* quantity, only when there is nothing else to choose */}
                {!product.hasVariants && (
                  <VStack align="start" spacing={3}>
                    <Text fontFamily="mono" fontSize="10px" letterSpacing="0.18em" textTransform="uppercase" color={colors.text.muted}>
                      Quantity
                    </Text>
                    <NumberInput value={quantity} onChange={(v) => setQuantity(parseInt(v, 10) || 1)} min={1} max={10} size="lg" maxW="120px">
                      <NumberInputField bg="rgba(255,255,255,0.02)" border="1px solid" borderColor={colors.ui.border}
                        color={colors.text.primary} fontFamily="mono" _hover={{ borderColor: colors.ui.borderHover }}
                        _focus={{ borderColor: tint, boxShadow: `0 0 0 1px ${tint}` }} />
                      <NumberInputStepper>
                        <NumberIncrementStepper color={colors.text.muted} _hover={{ color: tint }} />
                        <NumberDecrementStepper color={colors.text.muted} _hover={{ color: tint }} />
                      </NumberInputStepper>
                    </NumberInput>
                  </VStack>
                )}

                {/* stock, then the buttons */}
                <VStack spacing={3} width="100%">
                  {!buyable && (
                    <Box width="100%" px={5} py={4} borderRadius="14px" bg="rgba(255,255,255,0.03)" border="1px solid" borderColor={colors.ui.border}>
                      <Text color={colors.text.primary} fontWeight="600" fontSize="sm" mb={1}>
                        {state === 'soon' ? 'Not made yet' : 'Out of stock'}
                        {selectedDesign ? ` in ${selectedDesign.name}` : ''}
                      </Text>
                      <Text color={colors.text.secondary} fontSize="sm" lineHeight="1.6">
                        {state === 'soon'
                          ? 'This one is still in the sample stage. It goes up the day the first run lands.'
                          : 'Small runs sell through and we do not backorder. The next run gets announced before it goes up.'}
                      </Text>
                    </Box>
                  )}

                  <Button size="lg" width="100%" h="56px" bg={tint} color={colors.dark.black} fontWeight="700" borderRadius="full"
                    leftIcon={<FiShoppingBag />} onClick={handleAddToCart} isLoading={isAdding} isDisabled={!buyable}
                    transition={`transform 260ms ${EASE}, box-shadow 260ms ${EASE}, filter 260ms ${EASE}`}
                    _hover={{ transform: 'translateY(-2px)', boxShadow: `0 14px 36px ${tint}40`, filter: 'brightness(1.04)' }}
                    _active={{ transform: 'translateY(0)' }}>
                    {mode === 'reload' && reloadable ? 'Add the reload to the saddlebag' : 'Add to the saddlebag'}
                  </Button>

                  <Button size="lg" width="100%" h="56px" variant="outline" borderColor={colors.ui.border} color={colors.text.primary}
                    fontWeight="600" borderRadius="full" onClick={handleBuyNow} isDisabled={!buyable}
                    _hover={{ borderColor: tint, bg: `${tint}0E` }}>
                    Buy now
                  </Button>
                </VStack>

                {/* the three lines */}
                <VStack spacing={3} width="100%" pt={2} align="stretch">
                  {reassurance.map((r) => (
                    <HStack key={r.title} spacing={3} align="start">
                      <Box color={tint} mt="3px" w="18px" display="flex" justifyContent="center" flexShrink={0}>
                        {r.icon ? <Box as={r.icon} boxSize="16px" /> : <Box w="6px" h="6px" mt="4px" borderRadius="full" bg={LIME} boxShadow={`0 0 10px ${LIME}`} />}
                      </Box>
                      <VStack align="start" spacing={0}>
                        <Text color={colors.text.primary} fontWeight="600" fontSize="sm">{r.title}</Text>
                        <Text color={colors.text.secondary} fontSize="xs" lineHeight="1.6">{r.body}</Text>
                      </VStack>
                    </HStack>
                  ))}
                </VStack>
              </VStack>
            </MotionBox>
          </GridItem>
        </Grid>
      </Container>
    </Box>
  );
};

export default ProductHero;
