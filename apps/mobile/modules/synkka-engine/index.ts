// Native bridge to the Syncthing engine running in an Android foreground service.
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

export interface EngineInfo {
  port: number;
  apiKey: string;
}

interface SynkkaEngineNative {
  start(): Promise<EngineInfo>;
  stop(): Promise<void>;
  isRunning(): boolean;
  rename(from: string, to: string, overwrite: boolean): Promise<void>;
  diskUsage(): Promise<{ usedBytes: number; totalBytes: number }>;
  hasAllFilesAccess(): boolean;
  requestAllFilesAccess(): void;
  networkType(): 'wifi' | 'cellular' | 'offline';
  deviceModel(): string;
  setNotificationTexts(texts: Record<string, string>): void;
  /** false when no app can open the file. */
  openFile(path: string): boolean;
  /** false when no file manager could be opened. */
  openFolder(path: string): boolean;
  /** Opens the system settings of one notification channel (e.g. to hide the idle one). */
  openNotificationSettings(channelId: string): void;
}

/** null on platforms without the native module (web, Expo Go). */
export const SynkkaEngine: SynkkaEngineNative | null =
  Platform.OS === 'android' ? requireOptionalNativeModule<SynkkaEngineNative>('SynkkaEngine') : null;
