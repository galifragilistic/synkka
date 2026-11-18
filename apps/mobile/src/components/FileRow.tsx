import { formatWhen, statusA11yLabel, statusColor, statusMeta, t, toPercent, tokens, type FileItem } from '@synkka/core';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { accent, colors, font } from '../lib/theme';
import { Icon } from './Icon';

export function fileMeta(f: FileItem): string {
  if (f.kind === 'folder' && f.state === 'synced') {
    return f.childCount !== undefined ? t('table.items', { count: f.childCount }) : t('status.modifiedAt', { when: formatWhen(f.modifiedAt) });
  }
  switch (f.state) {
    case 'syncing':
      return t('status.syncingShort', { pct: toPercent(f.progress ?? 0) });
    case 'pending':
      return t('status.pending');
    case 'conflict':
      return t('status.twoVersions');
    case 'offlineAvailable':
      return t('status.offlineAvailable');
    default:
      return t('status.modifiedAt', { when: formatWhen(f.modifiedAt) });
  }
}

/** List row (≥56 h): 40 px tile, name + meta, trailing status icon. Folders drill down, conflicts open resolution. */
export function FileRow({ file: f }: { file: FileItem }) {
  const meta = statusMeta(f.state);
  const isFolder = f.kind === 'folder';
  const onPress = isFolder
    ? () => router.push({ pathname: '/folder/[id]', params: { id: f.id, name: f.name } })
    : f.state === 'conflict' && f.conflictId
      ? () => router.push({ pathname: '/conflict/[id]', params: { id: f.conflictId! } })
      : () => router.push({ pathname: '/file/[id]', params: { id: f.id } });
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityHint={isFolder ? undefined : t('fileInfo.details', { name: f.name })}
      accessibilityLabel={`${f.name}, ${fileMeta(f)}, ${statusA11yLabel(f)}`}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
      onPress={onPress}
    >
      <View style={[styles.tile, isFolder && styles.folderTile]}>
        <Icon name={isFolder ? 'folder' : 'file'} size={tokens.size.iconMd} color={isFolder ? accent : colors.text.secondary} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={font(500)} numberOfLines={1}>{f.name}</Text>
        <Text style={[font(400, tokens.font.size.small), { color: colors.text.muted }]} numberOfLines={1}>{fileMeta(f)}</Text>
      </View>
      <View accessible={false} importantForAccessibility="no-hide-descendants">
        <Icon name={meta.icon} size={20} color={statusColor(meta.iconColor)} strokeWidth={2.2} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  tile: {
    width: 40, height: 40, borderRadius: tokens.radius.md, backgroundColor: colors.bg.surface,
    borderWidth: 1, borderColor: colors.border.default, alignItems: 'center', justifyContent: 'center',
  },
  folderTile: { backgroundColor: colors.bg.accentSoft, borderColor: colors.bg.accentSoft },
});
