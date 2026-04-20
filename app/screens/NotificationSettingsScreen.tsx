import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { colors } from '../constants'
import {
  NOTIF_IDS,
  scheduleMorningReminder,
  scheduleIntradayReminder,
  scheduleExitReminder,
  cancelNotification,
  sendLocalNotification,
} from '../services/notifications'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface NotifPrefs {
  morning: boolean
  intraday: boolean
  exit: boolean
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const PREFS_KEY = '@tradeguard:notif_prefs'

const DEFAULT_PREFS: NotifPrefs = {
  morning: true,
  intraday: true,
  exit: true,
}

interface NotifRow {
  key: keyof NotifPrefs
  label: string
  time: string
  description: string
  notifId: string
  schedule: () => Promise<void>
}

const NOTIF_ROWS: NotifRow[] = [
  {
    key: 'morning',
    label: 'Morning Screener',
    time: '9:15 AM IST',
    description: 'Screener running — signals ready soon',
    notifId: NOTIF_IDS.morning,
    schedule: scheduleMorningReminder,
  },
  {
    key: 'intraday',
    label: 'Intraday Scan',
    time: '9:25 AM IST',
    description: 'Intraday scan available — market open',
    notifId: NOTIF_IDS.intraday,
    schedule: scheduleIntradayReminder,
  },
  {
    key: 'exit',
    label: 'Exit Reminder',
    time: '2:55 PM IST',
    description: 'Exit reminder — 5 mins to 2 PM cutoff',
    notifId: NOTIF_IDS.exit,
    schedule: scheduleExitReminder,
  },
]

// ─── Screen ────────────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void
}

export default function NotificationSettingsScreen({ onBack }: Props) {
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [toggling, setToggling] = useState<keyof NotifPrefs | null>(null)

  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY)
      .then(val => {
        if (val) {
          const parsed = JSON.parse(val) as Partial<NotifPrefs>
          setPrefs({ ...DEFAULT_PREFS, ...parsed })
        }
      })
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [])

  const handleToggle = useCallback(async (key: keyof NotifPrefs, value: boolean) => {
    setToggling(key)
    const newPrefs: NotifPrefs = { ...prefs, [key]: value }
    setPrefs(newPrefs)

    try {
      await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(newPrefs))
      const row = NOTIF_ROWS.find(r => r.key === key)
      if (!row) return
      if (value) {
        await row.schedule()
      } else {
        await cancelNotification(row.notifId)
      }
    } catch {
      // Revert on failure
      setPrefs(prefs)
      Alert.alert('Error', 'Failed to update notification setting')
    } finally {
      setToggling(null)
    }
  }, [prefs])

  const handleTest = useCallback(async () => {
    setTesting(true)
    try {
      const { status } = await Notifications.getPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Enable notifications in device settings to receive alerts.',
        )
        return
      }
      await sendLocalNotification(
        '🔔 TradeGuard Test',
        'Notifications are working correctly',
      )
    } catch {
      Alert.alert('Error', 'Failed to send test notification')
    } finally {
      setTesting(false)
    }
  }, [])

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>Daily Reminders</Text>
        <Text style={styles.sectionSub}>
          Notifications fire at the listed IST times. Requires device timezone set to IST.
        </Text>

        <View style={styles.card}>
          {NOTIF_ROWS.map((row, idx) => (
            <React.Fragment key={row.key}>
              {idx > 0 && <View style={styles.rowDivider} />}
              <View style={styles.row}>
                <View style={styles.rowLeft}>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  <Text style={styles.rowTime}>{row.time}</Text>
                  <Text style={styles.rowDesc}>{row.description}</Text>
                </View>
                {toggling === row.key ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Switch
                    value={prefs[row.key]}
                    onValueChange={v => handleToggle(row.key, v)}
                    trackColor={{
                      false: colors.border,
                      true: 'rgba(0,212,170,0.4)',
                    }}
                    thumbColor={prefs[row.key] ? colors.accent : colors.muted}
                  />
                )}
              </View>
            </React.Fragment>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Test</Text>
        <TouchableOpacity
          style={styles.testBtn}
          onPress={handleTest}
          activeOpacity={0.8}
          disabled={testing}
        >
          {testing ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Text style={styles.testBtnText}>Send Test Notification</Text>
          )}
        </TouchableOpacity>

        <View style={styles.noteBox}>
          <Text style={styles.noteText}>
            Push tokens are used to send notifications from the server when the screener
            runs. Local notifications fire even without a server connection.
          </Text>
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  backBtn: {
    minWidth: 60,
  },
  backText: {
    fontSize: 15,
    color: colors.accent,
    fontWeight: '600',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.2,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sectionLabel: {
    fontSize: 10,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
    marginTop: 16,
  },
  sectionSub: {
    fontSize: 11,
    color: colors.muted,
    lineHeight: 16,
    marginBottom: 10,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rowLeft: {
    flex: 1,
    marginRight: 12,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  rowTime: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '600',
    marginBottom: 2,
  },
  rowDesc: {
    fontSize: 11,
    color: colors.muted,
    lineHeight: 15,
  },
  rowDivider: {
    height: 0.5,
    backgroundColor: colors.border,
    marginLeft: 14,
  },
  testBtn: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
    minHeight: 44,
  },
  testBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 0.3,
  },
  noteBox: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 14,
    marginTop: 16,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  noteText: {
    fontSize: 11,
    color: colors.muted,
    lineHeight: 17,
  },
  bottomPad: {
    height: 32,
  },
})
