import React, { useEffect, useRef } from 'react'
import { AppState, AppStateStatus } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import Navigation from './app/navigation'
import {
  registerForPushNotifications,
  scheduleMorningReminder,
  scheduleIntradayReminder,
  scheduleExitReminder,
  sendLocalNotification,
} from './app/services/notifications'
import { checkPaperTradeAlerts } from './app/services/paperTrading'
import { getTodaySignals } from './app/services/api'

export default function App() {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)

  useEffect(() => {
    registerForPushNotifications().catch(() => null)
    scheduleMorningReminder().catch(() => null)
    scheduleIntradayReminder().catch(() => null)
    scheduleExitReminder().catch(() => null)
  }, [])

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        try {
          const res = await getTodaySignals()
          const alerts = await checkPaperTradeAlerts(res.signals)
          for (const alert of alerts) {
            await sendLocalNotification(
              `Paper Trade Alert — ${alert.symbol}`,
              `${alert.level} target hit for your ${alert.symbol} paper trade`,
            )
          }
        } catch {
          // silent — foreground check is best-effort
        }
      }
      appStateRef.current = nextState
    })
    return () => sub.remove()
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" backgroundColor="#0a0e1a" />
      <Navigation />
    </GestureHandlerRootView>
  )
}
