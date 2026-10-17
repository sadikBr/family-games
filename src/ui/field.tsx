/**
 * Text input that keeps itself visible above the on-screen keyboard.
 * Works inside <Screen> (which shrinks when the keyboard opens): when focused, the screen's scroll view
 * scrolls so the field sits comfortably above the keyboard. Plain React Native, so it works in Expo Go too.
 */
import { createContext, useContext, useRef, type RefObject } from 'react';
import { Keyboard, TextInput, type ScrollView, type TextInputProps, type View } from 'react-native';

interface ScrollCtx {
  scroll: RefObject<ScrollView | null>;
  content: RefObject<View | null>;
}
export const KeyboardScrollContext = createContext<ScrollCtx | null>(null);

/** Space kept above the field (room for its label / the card it sits in). */
const ABOVE = 110;

export function Field({ onFocus, style, ...props }: TextInputProps) {
  const ctx = useContext(KeyboardScrollContext);
  const ref = useRef<TextInput>(null);

  const reveal = () => {
    const input = ref.current;
    const content = ctx?.content.current;
    const scroll = ctx?.scroll.current;
    if (!input || !content || !scroll) return;
    input.measureLayout(
      content,
      (_x, y) => scroll.scrollTo({ y: Math.max(0, y - ABOVE), animated: true }),
      () => {},
    );
  };

  return (
    <TextInput
      ref={ref}
      {...props}
      maxFontSizeMultiplier={props.maxFontSizeMultiplier ?? 1.3}
      // minWidth 0 lets the field shrink next to a button on narrow phones
      style={[{ minWidth: 0 }, style]}
      onFocus={(e) => {
        onFocus?.(e);
        if (!ctx) return;
        // wait for the keyboard to open (the screen shrinks), then bring the field into view;
        // the timer also covers moving between fields while the keyboard is already open
        const sub = Keyboard.addListener('keyboardDidShow', () => {
          sub.remove();
          setTimeout(reveal, 60);
        });
        setTimeout(() => {
          sub.remove();
          reveal();
        }, 350);
      }}
    />
  );
}
