import {
  formatAgo, formatWhen, normalizeDeviceId, t, tokens, type Device, type DeviceIdentity, type PendingDevice,
} from '@synkka/core';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { Icon } from '../components/Icon';
import { Button } from '../components/primitives';
import { TabBar } from '../components/TabBar';
import { useToast } from '../components/Toast';
import { tc } from '../lib/copy';
import { useObservable, useSyncService } from '../lib/service';
import { accent, colors, font, overline } from '../lib/theme';

function deviceState(d: Device): string {
  if (d.activity === 'syncing') return t('devices.syncingNow');
  if (d.online) return t('devices.upToDate', { ago: formatAgo(d.lastSyncAt) });
  if (!d.lastSyncAt) return t('devices.offline');
  return t('devices.lastSeen', { when: formatWhen(d.lastSyncAt) });
}

// Not designed: pairing (Syncthing device IDs) built from existing card/row/input patterns.
export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const sync = useSyncService();
  const toast = useToast();
  const devices = useObservable((s) => s.devices());
  const pending = useObservable((s) => s.pendingDevices());
  const [me, setMe] = useState<DeviceIdentity | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [otherId, setOtherId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    sync.myDevice().then(async (d) => {
      setMe(d);
      setQr(await QRCode.toString(d.deviceId, { type: 'svg', margin: 0, color: { dark: tokens.color.text.primary, light: '#0000' } }));
    }, () => undefined);
  }, [sync]);

  const add = async (id: string, deviceName: string) => {
    setError(null);
    const normalized = normalizeDeviceId(id);
    if (!normalized) {
      setError(t('pairing.invalidId'));
      return;
    }
    setBusy(true);
    try {
      await sync.addDevice(normalized, deviceName.trim() || normalized.slice(0, 7));
      setOtherId('');
      setName('');
      toast(t('pairing.added'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.canvas }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 12, backgroundColor: colors.bg.surface }}>
        <Text accessibilityRole="header" style={[font(700, tokens.font.size.h1Mobile), { letterSpacing: -0.02 * tokens.font.size.h1Mobile }]}>
          {t('devices.title')}
        </Text>
      </View>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {pending.map((p: PendingDevice) => (
            <View key={p.deviceId} style={[styles.card, { borderColor: accent, gap: 12 }]} accessibilityRole="alert">
              <View style={{ gap: 2 }}>
                <Text style={font(600)}>{t('pairing.pendingTitle')}</Text>
                <Text style={[font(400, tokens.font.size.small), { color: colors.text.muted }]}>
                  {t('pairing.pendingBody', { name: p.name, id: p.deviceId.slice(0, 7) })}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button label={t('pairing.dismiss')} variant="secondary" style={{ flex: 1 }} onPress={() => sync.dismissPendingDevice(p.deviceId)} />
                <Button label={t('pairing.accept')} style={{ flex: 1 }} onPress={() => add(p.deviceId, p.name)} disabled={busy} />
              </View>
            </View>
          ))}

          <View style={{ gap: 10 }}>
            <Text accessibilityRole="header" style={overline}>{t('pairing.myId')}</Text>
            <View style={[styles.card, { alignItems: 'center', gap: 16 }]}>
              {qr ? (
                <View accessible accessibilityRole="image" accessibilityLabel={t('pairing.myId')}>
                  <SvgXml xml={qr} width={180} height={180} />
                </View>
              ) : null}
              <Text selectable style={[font(500, tokens.font.size.small), { textAlign: 'center', lineHeight: 20 }]}>{me?.deviceId ?? ''}</Text>
              <Text style={[font(400, tokens.font.size.small), { color: colors.text.muted, textAlign: 'center' }]}>{t('pairing.myIdHint')}</Text>
              <Button
                label={t('pairing.copy')}
                variant="secondary"
                icon="copy"
                style={{ alignSelf: 'stretch' }}
                onPress={async () => {
                  if (!me) return;
                  await Clipboard.setStringAsync(me.deviceId);
                  toast(t('pairing.copied'));
                }}
              />
            </View>
          </View>

          <View style={{ gap: 10 }}>
            <Text accessibilityRole="header" style={overline}>{t('pairing.add')}</Text>
            <View style={[styles.card, { gap: 12 }]}>
              <TextInput
                value={otherId}
                onChangeText={setOtherId}
                placeholder={t('pairing.otherIdPlaceholder')}
                placeholderTextColor={colors.text.muted}
                accessibilityLabel={t('pairing.otherId')}
                autoCapitalize="characters"
                autoCorrect={false}
                multiline
                style={[font(400, tokens.font.size.small), styles.input, { minHeight: 64, paddingTop: 12, textAlignVertical: 'top' }]}
              />
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={t('pairing.namePlaceholder')}
                placeholderTextColor={colors.text.muted}
                accessibilityLabel={t('pairing.name')}
                style={[font(400), styles.input]}
              />
              {error ? <Text accessibilityRole="alert" style={[font(500, tokens.font.size.small), { color: colors.status.conflict }]}>{error}</Text> : null}
              <Button label={t('pairing.add')} icon="plus" onPress={() => add(otherId, name)} disabled={busy || !otherId.trim()} />
            </View>
          </View>

          <View style={{ gap: 10 }}>
            <Text accessibilityRole="header" style={overline}>{tc('pairing.myDevices')}</Text>
            <View style={[styles.card, { paddingVertical: 4 }]}>
              {devices.map((d, i) => (
                <View key={d.id} style={[styles.deviceRow, i < devices.length - 1 && styles.divider]}>
                  <View style={styles.deviceTile}>
                    <Icon name={d.type === 'phone' ? 'smartphone' : 'laptop'} size={tokens.size.iconMd} color={colors.text.secondary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={font(500)} numberOfLines={1}>
                      {d.name}
                      {d.isCurrent ? ` ${t('devices.thisDevice')}` : ''}
                    </Text>
                    <Text style={[font(400, tokens.font.size.label), { color: colors.text.muted }]}>{deviceState(d)}</Text>
                  </View>
                  <View
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel={t(d.online ? 'devices.online' : 'devices.offline')}
                    style={d.online ? styles.online : styles.offline}
                  />
                </View>
              ))}
              {devices.length <= 1 ? (
                <Text style={[font(400, tokens.font.size.small), { color: colors.text.muted, paddingVertical: 12 }]}>{t('pairing.noDevices')}</Text>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <TabBar active="account" />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 20 },
  card: {
    backgroundColor: colors.bg.surface, borderWidth: 1, borderColor: colors.border.default,
    borderRadius: tokens.radius.xl, padding: 16,
  },
  input: {
    minHeight: tokens.size.touchTarget, paddingHorizontal: 14, borderRadius: tokens.radius.lg,
    backgroundColor: colors.bg.subtle, color: colors.text.primary,
  },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border.divider },
  deviceTile: {
    width: 36, height: 36, borderRadius: tokens.radius.md, backgroundColor: colors.bg.subtle,
    alignItems: 'center', justifyContent: 'center',
  },
  online: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.status.synced },
  offline: { width: 8, height: 8, borderRadius: 4, borderWidth: 2, borderColor: colors.border.radioIdle },
});
