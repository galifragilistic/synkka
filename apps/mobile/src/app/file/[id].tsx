import {
  formatBytes, formatWhen, statusA11yLabel, statusColor, statusLabel, statusMeta, t, tokens, type FileDetails,
} from '@synkka/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SynkkaEngine } from '../../../modules/synkka-engine';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/primitives';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useToast } from '../../components/Toast';
import { useObservable, useSyncService } from '../../lib/service';
import { accent, colors, font } from '../../lib/theme';

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.divider]} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[font(400, tokens.font.size.small), { color: colors.text.muted }]}>{label}</Text>
      <Text style={[font(500), styles.value]} selectable>
        {value}
      </Text>
    </View>
  );
}

/** File details (not designed yet: uses the card + row patterns of the Sync screen). */
export default function FileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const service = useSyncService();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [info, setInfo] = useState<FileDetails>();
  const [error, setError] = useState('');
  // Re-read when the file's sync state changes (list() updates on Syncthing events).
  const listId = id.slice(0, id.lastIndexOf('/') > id.indexOf(':') ? id.lastIndexOf('/') : id.indexOf(':') + 1);
  const siblings = useObservable((s) => s.list(listId), [listId]);
  const live = siblings.find((f) => f.id === id);

  useEffect(() => {
    service.fileInfo(id).then(setInfo, (e) => setError(String(e?.message ?? e)));
  }, [service, id, live?.state, live?.modifiedAt]);

  const meta = info ? statusMeta(info.state) : undefined;
  const isFile = info?.kind === 'file';

  const openFile = () => {
    if (!info?.absolutePath || !SynkkaEngine) return;
    try {
      if (!SynkkaEngine.openFile(info.absolutePath)) toast(t('fileInfo.openFailed'));
    } catch {
      toast(t('fileInfo.openFailed'));
    }
  };
  const openFolder = () => {
    const dir = isFile ? info?.parentAbsolutePath : info?.absolutePath;
    if (!dir || !SynkkaEngine) return;
    try {
      if (!SynkkaEngine.openFolder(dir)) toast(t('fileInfo.openFolderFailed'));
    } catch {
      toast(t('fileInfo.openFolderFailed'));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.canvas }}>
      <ScreenHeader title={t(isFile || !info ? 'fileInfo.title' : 'fileInfo.folderTitle')} fallback="/" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 24, gap: 20 }}>
        {!info && !error && <ActivityIndicator color={accent} style={{ marginTop: 40 }} />}
        {error ? <Text style={[font(500), { color: colors.status.conflict }]}>{error}</Text> : null}
        {info && meta && (
          <>
            <View style={styles.hero}>
              <View style={[styles.tile, !isFile && { backgroundColor: colors.bg.accentSoft }]}>
                <Icon name={isFile ? 'file' : 'folder'} size={28} color={isFile ? colors.text.secondary : accent} />
              </View>
              <Text style={[font(600, tokens.font.size.title), { textAlign: 'center' }]} selectable>
                {info.name}
              </Text>
              <View style={styles.status} accessible accessibilityLabel={statusA11yLabel(info)}>
                <Icon name={meta.icon} size={16} color={statusColor(meta.iconColor)} strokeWidth={2.2} />
                <Text style={[font(meta.weight, tokens.font.size.small), { color: statusColor(meta.textColor) }]}>
                  {statusLabel(info)}
                </Text>
              </View>
            </View>

            {info.syncError ? (
              <View style={styles.errorBox} accessibilityRole="alert">
                <Icon name="alertTriangle" size={20} color={colors.status.conflict} strokeWidth={2.2} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[font(600), { color: colors.text.dangerStrong }]}>{t('errors.title')}</Text>
                  <Text style={[font(400, tokens.font.size.small), { color: colors.text.dangerStrong, lineHeight: 19 }]}>{info.syncError}</Text>
                </View>
              </View>
            ) : null}

            <View style={{ gap: 10 }}>
              {isFile && info.absolutePath && (
                <Button label={t('fileInfo.open')} icon="file" onPress={openFile} />
              )}
              <Button label={t('fileInfo.openFolder')} icon="folder" variant="secondary" onPress={openFolder} />
              {info.relativePath ? (
                <Button
                  label={t('ignore.ignoreItem')}
                  icon="close"
                  variant="secondary"
                  onPress={() =>
                    service.ignoreItem(info.id).then(
                      () => {
                        toast(t('ignore.ignored', { name: info.name }));
                        router.back();
                      },
                      (e) => toast(String(e?.message ?? e)),
                    )
                  }
                />
              ) : null}
              {info.state === 'conflict' && info.conflictId && (
                <Button
                  label={t('fileInfo.resolve')}
                  icon="alertTriangle"
                  variant="secondary"
                  onPress={() => router.push({ pathname: '/conflict/[id]', params: { id: info.conflictId! } })}
                />
              )}
            </View>

            <View style={styles.card}>
              {info.sizeBytes !== undefined && <Row label={t('fileInfo.size')} value={formatBytes(info.sizeBytes)} />}
              {isFile && <Row label={t('fileInfo.modified')} value={formatWhen(info.modifiedAt)} />}
              {info.modifiedBy && <Row label={t('fileInfo.modifiedBy')} value={info.modifiedBy} />}
              <Row label={t('fileInfo.folder')} value={info.folderLabel} />
              <Row
                label={t('fileInfo.location')}
                value={info.absolutePath ?? info.parentAbsolutePath ?? t('fileInfo.notHere')}
                last={info.availableOn.length === 0}
              />
              {info.availableOn.length > 0 && (
                <View style={styles.row}>
                  <Text style={[font(400, tokens.font.size.small), { color: colors.text.muted }]}>{t('fileInfo.availableOn')}</Text>
                  {info.availableOn.map((d) => (
                    <View key={d} style={styles.device}>
                      <Icon name="checkCircle" size={16} color={colors.status.synced} strokeWidth={2.2} />
                      <Text style={font(500)}>{d}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 10, paddingTop: 8 },
  tile: {
    width: 64, height: 64, borderRadius: tokens.radius.xl, backgroundColor: colors.bg.surface,
    borderWidth: 1, borderColor: colors.border.default, alignItems: 'center', justifyContent: 'center',
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorBox: {
    flexDirection: 'row', gap: 12, padding: 14, borderRadius: tokens.radius.xl, backgroundColor: colors.bg.dangerSoft,
  },
  card: {
    backgroundColor: colors.bg.surface, borderWidth: 1, borderColor: colors.border.default,
    borderRadius: tokens.radius.xl, paddingHorizontal: 16,
  },
  row: { paddingVertical: 12, gap: 4 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border.divider },
  value: { color: colors.text.primary },
  device: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
});
