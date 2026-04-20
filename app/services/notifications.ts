import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'

// ─── Notification handler (shown while app is foregrounded) ──────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldPlayList: false,
    shouldShowList: true,
  }),
})

// ─── Identifiers ─────────────────────────────────────────────────────────────

export const NOTIF_IDS = {
  morning: 'tradeguard-morning',
  intraday: 'tradeguard-intraday',
  exit: 'tradeguard-exit',
} as const

export type NotifKey = keyof typeof NOTIF_IDS

// ─── Android channel ─────────────────────────────────────────────────────────

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync('tradeguard', {
    name: 'TradeGuard',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#00d4aa',
    enableVibrate: true,
  })
}

// ─── Permission + token ───────────────────────────────────────────────────────

export async function registerForPushNotifications(): Promise<string | null> {
  await ensureChannel()

  if (!Device.isDevice) return null

  const { status: existing } = await Notifications.getPermissionsAsync()
  const finalStatus = existing === 'granted'
    ? existing
    : (await Notifications.requestPermissionsAsync()).status

  if (finalStatus !== 'granted') return null

  try {
    const token = await Notifications.getExpoPushTokenAsync()
    return token.data
  } catch {
    return null
  }
}

// ─── Shared schedule helper ───────────────────────────────────────────────────

async function scheduleDaily(
  identifier: string,
  title: string,
  body: string,
  hour: number,
  minute: number,
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title,
      body,
      sound: true,
      ...(Platform.OS === 'android' ? { channelId: 'tradeguard' } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  })
}

// ─── Scheduled reminders ─────────────────────────────────────────────────────

export async function scheduleMorningReminder(): Promise<void> {
  // 9:15 AM device local time — user's device should be on IST
  await scheduleDaily(
    NOTIF_IDS.morning,
    '🔍 Screener Running',
    'Screener running — signals ready soon',
    9,
    15,
  )
}

export async function scheduleIntradayReminder(): Promise<void> {
  // 9:25 AM device local time
  await scheduleDaily(
    NOTIF_IDS.intraday,
    '⚡ Intraday Scan Available',
    'Intraday scan available — market open',
    9,
    25,
  )
}

export async function scheduleExitReminder(): Promise<void> {
  // 2:55 PM device local time
  await scheduleDaily(
    NOTIF_IDS.exit,
    '⏰ Exit Reminder',
    'Exit reminder — 5 mins to 2 PM cutoff. Check open trades.',
    14,
    55,
  )
}

// ─── Cancel helpers ───────────────────────────────────────────────────────────

export async function cancelNotification(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(id)
}

export async function cancelAllScheduled(): Promise<void> {
  await Promise.allSettled(
    Object.values(NOTIF_IDS).map(id =>
      Notifications.cancelScheduledNotificationAsync(id),
    ),
  )
}

// ─── Immediate local notification ────────────────────────────────────────────

export async function sendLocalNotification(title: string, body: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true,
      ...(Platform.OS === 'android' ? { channelId: 'tradeguard' } : {}),
    },
    trigger: null,
  })
}
