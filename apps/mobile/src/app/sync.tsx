import { formatBytes, formatEta, t, toPercent, tokens, type QueueItem, type SyncSettings } from '@synkka/core';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { Button, ProgressBar, ProgressRing, ToggleRow, styles as ui } from '../components/primitives';
import { ScreenHeader } from '../components/ScreenHeader';
import { useObservable, useSyncService } from '../lib/service';
import { accent, colors, font, overline } from '../lib/theme';

const SETTINGS: { key: keyof SyncSettings; label: string; hint: string }[] = [
  { key: 'wifiOnly', label: 'settings.wifiOnly', hint: 'settings.wifiOnlyHint' },
  { key: 'photoBackup', label: 'settings.photoBackup', hint: 'settings.photoBackupHint' },
  { key: 'batterySaver', label: 'settings.batterySaver', hint: 'settings.batterySaverHint' },
];

function queueState(q: QueueItem): string {
  if (q.status === 'done') return t('status.done');
  if (q.status === 'queued') return t('status.queued');
  return t('status.syncing', { pct: toPercent(q.progress) });
}

export default function SyncScreen() {
  const service = useSyncService();
  const insets = useSafeAreaInsets();
  const overview = useObservable((s) => s.overview());
  const queue = useObservable((s) => s.queue());
  const conflicts = useObservable((s) => s.conflicts());
  const settings = useObservable((s) => s.settings());

  const idle = overview.activeCount === 0;
  const ratio = idle || overview.bytesTotal === 0 ? 1 : overview.bytesDone / overview.bytesTotal;
  const pct = toPercent(ratio);
  const running = !idle && !overview.paused;

  const title = overview.paused
    ? t('sync.paused')
    : idle
      ? t('sync.allSynced')
      : t('sync.activeCount', { count: overview.activeCount });
  const network = overview.network === 'unknown' ? '' : t(`network.${overview.network}`);
  const subtitle =
    overview.etaSeconds && !overview.paused
      ? t('sync.networkEta', { network, eta: formatEta(overview.etaSeconds) }).replace(/^ · /, '')
      : network;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.canvas }}>
      <ScreenHeader title={t('sync.title')} fallback="/" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.statusCard}>
          <ProgressRing value={ratio} label={`${title}, ${t('sync.percent', { pct })}`}>
            <Text style={[font(700, tokens.font.size.display), { letterSpacing: -0.02 * tokens.font.size.display }]}>
              {t('sync.percent', { pct })}
            </Text>
            {!idle ? (
              <Text style={[font(400, tokens.font.size.label), { color: colors.text.muted }]}>
                {t('sync.bytesProgress', { done: formatBytes(overview.bytesDone), total: formatBytes(overview.bytesTotal) })}
              </Text>
            ) : null}
          </ProgressRing>
          <View style={{ alignItems: 'center', gap: 4 }} accessibilityLiveRegion="polite">
            <Text style={[font(600, tokens.font.size.title), { textAlign: 'center' }]}>{title}</Text>
            <Text style={[font(400, tokens.font.size.small), { color: colors.text.muted, textAlign: 'center' }]}>{subtitle}</Text>
          </View>
          <View style={styles.buttons}>
            <Button
              variant="secondary"
              icon={overview.paused ? 'play' : 'pause'}
              label={overview.paused ? t('actions.resume') : t('actions.pause')}
              onPress={() => (overview.paused ? service.resume() : service.pause())}
              style={{ flex: 1 }}
            />
            <Button
              label={t('actions.syncNow')}
              disabled={running}
              onPress={() => service.syncNow()}
              style={{ flex: 1 }}
            />
          </View>
        </View>

        {queue.length > 0 || conflicts.length > 0 ? (
          <View style={{ gap: 10 }}>
            <Text accessibilityRole="header" style={overline}>{t('sync.queue')}</Text>
            <View style={[ui.card, { paddingVertical: 4, paddingHorizontal: 16 }]}>
              {queue.map((q) => (
                <View key={q.fileId} style={[styles.queueRow, ui.divider]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                    <Text style={[font(500), { flexShrink: 1 }]} numberOfLines={1}>{q.name}</Text>
                    <Text style={[font(400, tokens.font.size.small), { color: colors.text.muted }]}>{queueState(q)}</Text>
                  </View>
                  <ProgressBar value={q.progress} color={q.status === 'done' ? colors.status.synced : accent} />
                </View>
              ))}
              {conflicts.map((c) => (
                <Pressable
                  key={c.id}
                  accessibilityRole="link"
                  accessibilityLabel={t('sync.resolveConflictFor', { file: c.fileName })}
                  onPress={() => router.push({ pathname: '/conflict/[id]', params: { id: c.id } })}
                  style={({ pressed }) => [styles.conflictRow, pressed && { opacity: 0.7 }]}
                >
                  <Icon name="alertTriangle" size={tokens.size.iconMd} color={colors.status.conflict} strokeWidth={2.2} />
                  <Text style={[font(600, tokens.font.size.body), { color: colors.status.conflict, flex: 1 }]}>
                    {t('sync.resolveConflictFor', { file: c.fileName })}
                  </Text>
                  <Icon name="chevronRight" size={tokens.size.iconMd} color={colors.status.conflict} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <View style={{ gap: 10 }}>
          <Text accessibilityRole="header" style={overline}>{t('sync.settings')}</Text>
          <View style={[ui.card, { paddingHorizontal: 16 }]}>
            {SETTINGS.map((s, i) => (
              <ToggleRow
                key={s.key}
                label={t(s.label)}
                hint={t(s.hint)}
                value={settings[s.key]}
                onChange={(v) => service.updateSettings({ [s.key]: v })}
                last={i === SETTINGS.length - 1}
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 8, gap: 20 },
  statusCard: {
    backgroundColor: colors.bg.surface, borderWidth: 1, borderColor: colors.border.default,
    borderRadius: tokens.radius['2xl'], paddingVertical: 24, paddingHorizontal: 20, alignItems: 'center', gap: 16,
  },
  buttons: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  queueRow: { gap: 8, paddingVertical: 12 },
  conflictRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
});
