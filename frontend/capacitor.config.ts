import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.abdullahschool.myapp',
  appName: 'مدرسة عبدالله بن عمر',
  webDir: 'dist',
  plugins: { PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] } },
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false },
};

export default config;
