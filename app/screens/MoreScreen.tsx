import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '../constants'

interface MenuItemProps {
  title: string
  subtitle: string
  phase: string
  accent?: string
}

function MenuItem({ title, subtitle, phase, accent = colors.accent }: MenuItemProps) {
  return (
    <TouchableOpacity style={[styles.card, { borderLeftColor: accent }]} activeOpacity={0.7}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardSub}>{subtitle}</Text>
      <Text style={styles.phase}>{phase}</Text>
    </TouchableOpacity>
  )
}

export default function MoreScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>More</Text>
        <Text style={styles.sub}>Tools &amp; Settings</Text>

        <MenuItem
          title="Backtest"
          subtitle="Run historical backtests on the strategy"
          phase="Phase 6"
          accent={colors.warn}
        />
        <MenuItem
          title="Alerts"
          subtitle="TradingView webhook alerts feed"
          phase="Phase 7"
          accent={colors.intraday}
        />
        <MenuItem
          title="Simulation"
          subtitle="Paper trade — test without real money"
          phase="Phase 8"
          accent={colors.bull}
        />
        <MenuItem
          title="Notifications"
          subtitle="9:15 AM screener · 10:30 AM intraday · 2:55 PM exit"
          phase="Phase 9"
        />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: '600', color: colors.text, marginBottom: 4 },
  sub: { fontSize: 12, color: colors.subtext, marginBottom: 20 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 2 },
  cardSub: { fontSize: 12, color: colors.subtext },
  phase: { fontSize: 10, color: colors.muted, marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
})
