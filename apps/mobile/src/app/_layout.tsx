import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { tokens } from '@synkka/core';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '../components/Toast';
import { PermissionGate } from '../components/PermissionGate';
import { SyncServiceProvider } from '../lib/service';

export default function RootLayout() {
  const [loaded, error] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  if (!loaded && !error) return null;
  return (
    <SafeAreaProvider>
      <PermissionGate>
      <SyncServiceProvider>
        <ToastProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: tokens.color.bg.canvas },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="photos" options={{ animation: 'none' }} />
            <Stack.Screen name="account" options={{ animation: 'none' }} />
            <Stack.Screen name="sync" />
            <Stack.Screen name="conflict/[id]" />
            <Stack.Screen name="folder/[id]" />
            <Stack.Screen name="add-folder" />
          </Stack>
        </ToastProvider>
      </SyncServiceProvider>
      </PermissionGate>
    </SafeAreaProvider>
  );
}
