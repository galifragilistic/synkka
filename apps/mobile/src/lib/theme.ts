import { tokens } from '@synkka/core';
import type { TextStyle } from 'react-native';

export const colors = tokens.color;
export const accent = tokens.color.accent.default;

/** Android ignores fontWeight with custom fonts, so each weight is its own family. */
const families = {
  400: 'Inter_400Regular',
  500: 'Inter_500Medium',
  600: 'Inter_600SemiBold',
  700: 'Inter_700Bold',
} as const;

export function font(weight: 400 | 500 | 600 | 700, size: number = tokens.font.size.bodyMobile): TextStyle {
  return { fontFamily: families[weight], fontSize: size, color: tokens.color.text.primary };
}

export const overline: TextStyle = {
  ...font(tokens.font.overline.weight as 600, tokens.font.overline.size),
  color: tokens.color.text.muted,
  textTransform: 'uppercase',
  letterSpacing: tokens.font.overline.letterSpacing * tokens.font.overline.size,
};
