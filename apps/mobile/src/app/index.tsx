import { ROOT_FOLDER, t, tokens } from '@synkka/core';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FileRow } from '../components/FileRow';
import { Icon } from '../components/Icon';
import { IconButton } from '../components/primitives';
import { TabBar } from '../components/TabBar';
import { useDebounced } from '../lib/hooks';
import { useObservable } from '../lib/service';
import { accent, colors, font, overline } from '../lib/theme';

export default function FilesScreen() {
  const insets = useSafeAreaInsets();
  const overview = useObservable((s) => s.overview());
  const folders = useObservable((s) => s.list(ROOT_FOLDER));
  const recent = useObservable((s) => s.recent(4));
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim().toLocaleLowerCase('fi'), 150);

  const match = (name: string) => !q || name.toLocaleLowerCase('fi').includes(q);
  const shownFolders = useMemo(() => folders.filter((f) => match(f.name)), [folders, q]);
  const shownRecent = useMemo(() => recent.filter((f) => match(f.name)), [recent, q]);

  const bannerTitle = overview.paused
    ? t('sync.paused')
    : overview.activeCount > 0
      ? t('sync.activeCount', { count: overview.activeCount })
      : t('sync.allSynced');
  const bannerSubtitle =
    overview.conflictCount > 0
      ? t('sync.conflictsWaiting', { count: overview.conflictCount })
      : overview.network !== 'unknown'
        ? t(`network.${overview.network}`)
        : '';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.canvas }}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={styles.h1}>{t('nav.tabFiles')}</Text>
          <IconButton icon="plus" label={t('folders.add')} round background={accent} color={colors.text.onAccent} onPress={() => router.push('/add-folder')} />
        </View>
        <View style={styles.search}>
          <Icon name="search" size={tokens.size.iconSm} color={colors.text.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('search.placeholderMobile')}
            placeholderTextColor={colors.text.muted}
            accessibilityLabel={t('search.label')}
            returnKeyType="search"
            style={[font(400), styles.searchInput]}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${bannerTitle}. ${bannerSubtitle}`}
          onPress={() => router.push('/sync')}
          style={({ pressed }) => [styles.banner, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.bannerIcon}>
            <Icon name={overview.paused ? 'pause' : 'sync'} size={tokens.size.iconMd} color={colors.text.onAccent} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={font(600)}>{bannerTitle}</Text>
            {bannerSubtitle ? <Text style={[font(400, tokens.font.size.small), { color: colors.text.secondary }]}>{bannerSubtitle}</Text> : null}
          </View>
          <Icon name="chevronRight" size={tokens.size.iconMd} color={colors.text.secondary} />
        </Pressable>

        {shownFolders.length > 0 ? (
          <View style={{ gap: 12 }}>
            <Text accessibilityRole="header" style={overline}>{t('files.folders')}</Text>
            <View style={styles.grid}>
              {shownFolders.map((f) => (
                <Pressable
                  key={f.id}
                  accessibilityRole="link"
                  accessibilityLabel={`${f.name}, ${t('table.items', { count: f.childCount ?? 0 })}`}
                  onPress={() => router.push({ pathname: '/folder/[id]', params: { id: f.id, name: f.name } })}
                  style={({ pressed }) => [styles.folderCard, pressed && { opacity: 0.85 }]}
                >
                  <Icon name="folder" size={tokens.size.iconLg} color={accent} />
                  <View style={{ gap: 2 }}>
                    <Text style={font(600)} numberOfLines={1}>{f.name}</Text>
                    <Text style={[font(400, tokens.font.size.label), { color: colors.text.muted }]}>
                      {t('table.items', { count: f.childCount ?? 0 })}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <Text style={[font(400, tokens.font.size.small), { color: colors.text.muted }]}>{t('folders.none')}</Text>
        )}

        <View style={{ gap: 4 }}>
          <Text accessibilityRole="header" style={[overline, { marginBottom: 8 }]}>{t('nav.recent')}</Text>
          {shownRecent.map((f) => <FileRow key={f.id} file={f} />)}
        </View>
      </ScrollView>

      <TabBar active="files" />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 12, gap: 16, backgroundColor: colors.bg.surface },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { ...font(700, tokens.font.size.h1Mobile), letterSpacing: -0.02 * tokens.font.size.h1Mobile },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: tokens.size.touchTarget, paddingHorizontal: 14,
    borderRadius: tokens.radius.lg, backgroundColor: colors.bg.subtle,
  },
  searchInput: { flex: 1, minWidth: 0, height: '100%', outlineWidth: 0 } as object,
  content: { paddingHorizontal: 20, paddingVertical: 16, gap: 20 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: tokens.radius.xl, backgroundColor: colors.bg.accentSoft,
  },
  bannerIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: accent, alignItems: 'center', justifyContent: 'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  folderCard: {
    flexBasis: '47%', flexGrow: 1, gap: 12, padding: 14, borderRadius: tokens.radius.xl,
    backgroundColor: colors.bg.surface, borderWidth: 1, borderColor: colors.border.default,
  },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  fileTile: {
    width: 40, height: 40, borderRadius: tokens.radius.md, backgroundColor: colors.bg.surface,
    borderWidth: 1, borderColor: colors.border.default, alignItems: 'center', justifyContent: 'center',
  },
});
