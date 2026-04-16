import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '../constants'

export default function SignalsScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Signals</Text>
        <Text style={styles.sub}>Swing + Intraday</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Phase 2</Text>
          <Text style={styles.value}>Swing signal cards coming soon</Text>
        </View>
        <View style={[styles.card, { borderLeftColor: colors.intraday }]}>
          <Text style={styles.label}>Phase 3</Text>
          <Text style={styles.value}>Intraday signal cards coming soon</Text>
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
})
