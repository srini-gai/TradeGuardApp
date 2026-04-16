import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '../constants'

export default function JournalScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Journal</Text>
        <Text style={styles.sub}>Trade log + P&amp;L</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Phase 5</Text>
          <Text style={styles.value}>Trade journal coming soon</Text>
          <Text style={styles.note}>Log trades, book partial profits, track P&amp;L</Text>
        </View>
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
  label: {
    fontSize: 11,
    color: colors.subtext,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: { fontSize: 14, color: colors.text, fontWeight: '500' },
  note: { fontSize: 12, color: colors.subtext, marginTop: 4 },
})
