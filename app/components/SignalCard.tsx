import React, { memo } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { colors } from '../constants'
import type { Signal } from '../types'

interface Props {
  signal: Signal
  onLogTrade?: (signal: Signal) => void
  onSimulate?: (signal: Signal) => void
  compact?: boolean
}

type LadderLevel = { label: string; value: number; color: string }

function daysToExpiry(expiry: string, precomputed?: number): number {
  if (precomputed !== undefined) return precomputed
  // Try YYYY-MM-DD format first, then fallback
  const d = new Date(expiry)
  if (!isNaN(d.getTime())) {
    return Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86400000))
  }
  return 0
}

function confidenceColor(score: number): string {
  if (score >= 80) return colors.bull
  if (score >= 60) return colors.warn
  return colors.bear
}

function MetricBox({
  label,
  value,
  valueColor,
}: {
  label: string
  value: string
  valueColor: string
}) {
  return (
    <View style={metricStyles.box}>
      <Text style={metricStyles.label}>{label}</Text>
      <Text style={[metricStyles.value, { color: valueColor }]}>{value}</Text>
    </View>
  )
}

function ProfitLadder({ signal }: { signal: Signal }) {
  const levels: LadderLevel[] = [
    { label: 'SL', value: signal.sl_premium, color: colors.bear },
    { label: 'Entry', value: signal.entry_premium, color: colors.text },
    { label: 'T1', value: signal.t1_premium, color: colors.accent },
    { label: 'T2', value: signal.t2_premium, color: colors.accent },
    { label: 'T3', value: signal.t3_premium, color: colors.bull },
  ]

  return (
    <View style={ladderStyles.container}>
      <Text style={ladderStyles.header}>Profit Ladder</Text>
      <View style={ladderStyles.row}>
        {levels.map((lvl, idx) => (
          <React.Fragment key={lvl.label}>
            {idx > 0 && <Text style={ladderStyles.arrow}>›</Text>}
            <View style={ladderStyles.level}>
              <Text style={[ladderStyles.levelLabel, { color: lvl.color }]}>{lvl.label}</Text>
              <Text style={[ladderStyles.levelValue, { color: lvl.color }]}>
                ₹{lvl.value}
              </Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    </View>
  )
}

function SignalCard({ signal, onLogTrade, onSimulate, compact = false }: Props) {
  const isCE = signal.direction === 'CE'
  const accentColor = isCE ? colors.bull : colors.bear
  const days = daysToExpiry(signal.expiry, signal.days_to_expiry)
  const confColor = confidenceColor(signal.confidence_score)
  const visibleRationale = compact ? signal.rationale.slice(0, 2) : signal.rationale.slice(0, 5)
  const extraCount = compact && signal.rationale.length > 2 ? signal.rationale.length - 2 : 0

  return (
    <View style={[styles.card, { borderLeftColor: accentColor }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.symbol}>{signal.symbol}</Text>
        <View style={styles.badges}>
          <View style={[styles.dirBadge, { backgroundColor: isCE ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)' }]}>
            <Text style={[styles.dirText, { color: accentColor }]}>{signal.direction}</Text>
          </View>
          <View style={[styles.confBadge, { backgroundColor: confColor + '22' }]}>
            <Text style={[styles.confText, { color: confColor }]}>{signal.confidence_score}%</Text>
          </View>
        </View>
      </View>

      {/* Strike / Expiry / Days */}
      <View style={styles.metaRow}>
        <Text style={styles.strike}>₹{signal.strike}</Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.expiry}>{signal.expiry}</Text>
        <Text style={styles.dot}>·</Text>
        <Text style={[styles.days, days <= 3 ? styles.daysWarn : null]}>
          {days}d left
        </Text>
      </View>

      {/* Metrics 2×2 */}
      <View style={metricStyles.grid}>
        <MetricBox label="Entry" value={`₹${signal.entry_premium}`} valueColor={colors.text} />
        <MetricBox label="Stop Loss" value={`₹${signal.sl_premium}`} valueColor={colors.bear} />
        <MetricBox label="T3 Target" value={`₹${signal.t3_premium}`} valueColor={colors.bull} />
        <MetricBox label="Days Left" value={`${days}d`} valueColor={days <= 3 ? colors.warn : colors.subtext} />
      </View>

      {/* Profit Ladder */}
      {!compact && <ProfitLadder signal={signal} />}

      {/* Rationale tags */}
      {visibleRationale.length > 0 && (
        <View style={styles.tags}>
          {visibleRationale.map((r, i) => (
            <View key={i} style={styles.tag}>
              <Text style={styles.tagText}>{r}</Text>
            </View>
          ))}
          {extraCount > 0 && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>+{extraCount} more</Text>
            </View>
          )}
        </View>
      )}

      {/* Action buttons */}
      {!compact && (
        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.logBtn, { backgroundColor: accentColor }]}
            onPress={() => onLogTrade?.(signal)}
            activeOpacity={0.8}
          >
            <Text style={styles.logBtnText}>Log Trade</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.simulateBtn}
            onPress={() => onSimulate?.(signal)}
            activeOpacity={0.8}
          >
            <Text style={styles.simulateBtnText}>Simulate</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  symbol: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.3,
  },
  badges: {
    flexDirection: 'row',
    gap: 6,
  },
  dirBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  dirText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  confBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  confText: {
    fontSize: 11,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 4,
  },
  strike: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '600',
  },
  dot: {
    fontSize: 12,
    color: colors.muted,
  },
  expiry: {
    fontSize: 12,
    color: colors.subtext,
  },
  days: {
    fontSize: 12,
    color: colors.subtext,
  },
  daysWarn: {
    color: colors.warn,
    fontWeight: '600',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
    marginBottom: 4,
  },
  tag: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  tagText: {
    fontSize: 10,
    color: colors.subtext,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  logBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  logBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    letterSpacing: 0.3,
  },
  simulateBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#ea580c',
    backgroundColor: 'rgba(234,88,12,0.1)',
  },
  simulateBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ea580c',
    letterSpacing: 0.3,
  },
})

const metricStyles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  box: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 10,
  },
  label: {
    fontSize: 10,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  value: {
    fontSize: 14,
    fontWeight: '700',
  },
})

const ladderStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 10,
    marginBottom: 4,
  },
  header: {
    fontSize: 9,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  arrow: {
    fontSize: 14,
    color: colors.border,
    marginHorizontal: 2,
  },
  level: {
    alignItems: 'center',
    flex: 1,
  },
  levelLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  levelValue: {
    fontSize: 11,
    fontWeight: '600',
  },
})

export default memo(SignalCard)
