import { t, tokens } from '@synkka/core';
import { router, type Href } from 'expo-router';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font } from '../lib/theme';
import { IconButton } from './primitives';

/** Back button + 20/700 title. Falls back to `fallback` when there is no history (deep link / reload). */
export function ScreenHeader({ title, fallback }: { title: string; fallback: Href }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingTop: insets.top + 8, paddingHorizontal: 12, paddingBottom: 8,
        flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.bg.canvas,
      }}
    >
      <IconButton
        icon="chevronLeft"
        label={t('nav.back')}
        onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback))}
      />
      <Text accessibilityRole="header" style={font(700, tokens.font.size.screenTitle)}>{title}</Text>
    </View>
  );
}
