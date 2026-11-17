import { t, tokens } from '@synkka/core';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NotDesigned } from '../components/primitives';
import { TabBar } from '../components/TabBar';
import { colors, font } from '../lib/theme';

// NOT DESIGNED YET (design-spec §7): placeholder only so the tab bar works.
export default function PhotosScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.canvas }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 12, backgroundColor: colors.bg.surface }}>
        <Text accessibilityRole="header" style={[font(700, tokens.font.size.h1Mobile), { letterSpacing: -0.02 * tokens.font.size.h1Mobile }]}>
          {t('nav.tabPhotos')}
        </Text>
      </View>
      <NotDesigned />
      <TabBar active="photos" />
    </View>
  );
}
