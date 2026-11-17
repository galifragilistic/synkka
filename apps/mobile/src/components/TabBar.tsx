import { t, tokens, type IconName } from '@synkka/core';
import { router, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { accent, colors, font } from '../lib/theme';
import { Icon } from './Icon';

export type TabId = 'files' | 'photos' | 'sync' | 'account';

const TABS: { id: TabId; icon: IconName; labelKey: string; href: Href }[] = [
  { id: 'files', icon: 'folder', labelKey: 'nav.tabFiles', href: '/' },
  { id: 'photos', icon: 'upload', labelKey: 'nav.tabPhotos', href: '/photos' },
  { id: 'sync', icon: 'sync', labelKey: 'nav.tabSync', href: '/sync' },
  { id: 'account', icon: 'user', labelKey: 'nav.tabAccount', href: '/account' },
];

export function TabBar({ active }: { active: TabId }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t('nav.tabs')}
      style={{
        flexDirection: 'row', paddingTop: 8, paddingHorizontal: 8, paddingBottom: insets.bottom + 8,
        backgroundColor: colors.bg.surface, borderTopWidth: 1, borderTopColor: colors.border.default,
      }}
    >
      {TABS.map((tab) => {
        const selected = tab.id === active;
        const color = selected ? accent : colors.text.muted;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityLabel={t(tab.labelKey)}
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected) return;
              // Sync is a pushed screen with a back button; the other tabs replace the root.
              if (tab.id === 'sync') router.push(tab.href);
              else router.replace(tab.href);
            }}
            style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 4 }}
          >
            <Icon name={tab.icon} size={tokens.size.iconLg} color={color} />
            <Text style={[font(selected ? 600 : 500, tokens.font.size.caption), { color }]}>{t(tab.labelKey)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
