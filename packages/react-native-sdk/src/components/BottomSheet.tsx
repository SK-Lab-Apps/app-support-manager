// Bottom sheet built on the built-in Modal + Animated APIs.
//
// Why no sheet library: the SDK needs exactly one detent, a drag handle, a
// backdrop fade, and a short ease-out slide — all achievable with core APIs.
// Skipping reanimated/gesture-handler keeps the package free of native
// dependencies and install friction for consumers.
//
// `visible` drives a single animation path: the sheet stays mounted until
// its exit finishes, so closing from the header button, the backdrop, the
// hardware back button, or a drag all animate identically — and a reopen
// always starts from off-screen instead of appearing already in place.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { SupportTheme } from '../theme';

const SLIDE_MS = 260;
const FADE_MS = 200;

export function BottomSheet({
  visible,
  onClose,
  theme,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  theme: SupportTheme;
  children: ReactNode;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = Math.min(windowHeight * 0.88, 720);

  const [rendered, setRendered] = useState(false);
  const translateY = useRef(new Animated.Value(sheetHeight)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  /** Whether the entrance has already played for the current open. */
  const shown = useRef(false);

  useEffect(() => {
    if (visible) setRendered(true);
  }, [visible]);

  useEffect(() => {
    if (!rendered) return;

    if (visible && !shown.current) {
      shown.current = true;
      translateY.setValue(sheetHeight);
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: SLIDE_MS,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          useNativeDriver: true,
        }),
        Animated.timing(backdrop, {
          toValue: 1,
          duration: FADE_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (!visible && shown.current) {
      shown.current = false;
      // Starts from wherever the sheet is now, so a drag that crosses the
      // dismiss threshold continues rather than jumping.
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: sheetHeight,
          duration: theme.motion.slow,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdrop, {
          toValue: 0,
          duration: theme.motion.slow,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setRendered(false);
      });
    }
  }, [rendered, visible, sheetHeight, translateY, backdrop, theme.motion.slow]);

  const requestClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Drag handle: follow the finger downward; past 25% (or a flick), dismiss.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4,
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > sheetHeight * 0.25 || g.vy > 1.2) {
          requestClose();
        } else {
          Animated.timing(translateY, {
            toValue: 0,
            duration: theme.motion.slow,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  if (!rendered) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={requestClose}
      statusBarTranslucent
    >
      <SafeAreaProvider>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Animated.View
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: 'rgba(0,0,0,0.55)',
              opacity: backdrop,
            }}
          >
            <Pressable
              style={{ flex: 1 }}
              onPress={requestClose}
              accessibilityLabel="Close support"
            />
          </Animated.View>

          <Animated.View
            style={{
              height: sheetHeight,
              backgroundColor: theme.colors.sheet,
              borderTopLeftRadius: theme.radii.sheet,
              borderTopRightRadius: theme.radii.sheet,
              borderWidth: 1,
              borderBottomWidth: 0,
              borderColor: theme.colors.border,
              overflow: 'hidden',
              transform: [{ translateY }],
              ...theme.shadows.sheet,
            }}
          >
            {/* Drag handle */}
            <View
              {...panResponder.panHandlers}
              style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}
            >
              <View
                style={{
                  width: 40,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: theme.colors.borderStrong,
                }}
              />
            </View>
            <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
              {children}
            </SafeAreaView>
          </Animated.View>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}
