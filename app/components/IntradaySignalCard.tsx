import React, { memo } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { colors } from '../constants'
import type { IntradaySignal } from '../types'

interface Props {
  signal: IntradaySignal
  onLogTrade?: (signal: IntradaySignal) => void
  compact?: boolean
}

type IndicatorTag = { label: string; value: string }

function confidenceColor(score: number): string {
  if (score >= 80) return colors.bull
  if (score >= 60) return colors.warn
  return colors.bear
}

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString)
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  } catch {
    return isoString
  }
}

function IndicatorTag({ label, value }: IndicatorTag) {
  return (
    <View style={tagStyles.indicator}>
      <Text style={tagStyles.indicatorLabel}>{label}</Text>
      <Text style={tagStyles.indicatorValue}>{value}</Text>
    </View>
  )
}

function IntradayMetricBox({
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

function IntradaySignalCard({ signal, onLogTrade, compact = false }: Props) {
  const isCE = signal.direction === 'CE'
  const accentColor = isCE ? colors.bull : colors.bear
  const confColor = confidenceColor(signal.confidence_score)

  const indicators: IndicatorTag[] = []
  if (signal.vwap !== null) indicators.push({ label: 'VWAP', value: `₹${signal.vwap}` })
  if (signal.rsi !== null) indicators.push({ label: 'RSI', value: signal.rsi.toFixed(1) })
  if (signal.current_price !== null) indicators.push({ label: 'LTP', value: `₹${signal.current_price}` })

  const isWeekly = signal.expiry_type?.toLowerCase().includes('week')
  const visibleRationale = compact ? signal.rationale.slice(0, 2) : signal.rationale.slice(0, 4)
  const extraCount = compact && signal.rationale.length > 2 ? signal.rationale.length - 2 : 0

  return (
    <View style={[styles.card, { borderLeftColor: colors.intraday }]}>
      {/* Exit warning banner */}
      <View style={styles.exitBanner}>
        <Text style={styles.exitText}>⚠ Exit by {signal.exit_by || '3:00 PM IST'}</Text>
      </View>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.symbol}>{signal.symbol}</Text>
        <View style={styles.badges}>
          <View style={[styles.dirBadge, { backgroundColor: isCE ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)' }]}>
            <Text style={[styles.dirText, { color: accentColor }]}>{signal.direction}</Text>
          </View>
          <View style={styles.tfBadge}>
            <Text style={styles.tfText}>{signal.timeframe || '30min'}</Text>
          </View>
          {isWeekly && (
            <View style={styles.weeklyBadge}>
              <Text style={styles.weeklyText}>Weekly</Text>
            </View>
          )}
          <View style={[styles.confBadge, { backgroundColor: confColor + '22' }]}>
            <Text style={[styles.confText, { color: confColor }]}>{signal.confidence_score}%</Text>
          </View>
        </View>
      </View>

      {/* Strike / Expiry / Scan time */}
      <View style={styles.metaRow}>
        <Text style={styles.strike}>₹{signal.strike}</Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.expiry}>{signal.expiry}</Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.scanTime}>Scanned {formatTime(signal.scan_time)}</Text>
      </View>

      {/* Metrics 2×2 — T1, T2 only (no T3) */}
      <View style={metricStyles.grid}>
        <IntradayMetricBox label="Entry" value={`₹${signal.entry_premium}`} valueColor={colors.text} />
        <IntradayMetricBox label="Stop Loss" value={`₹${signal.sl_premium}`} valueColor={colors.bear} />
        <IntradayMetricBox label="Target T1" value={`₹${signal.t1_premium}`} valueColor={colors.intraday} />
        <IntradayMetricBox label="Target T2" value={`₹${signal.t2_premium}`} valueColor={colors.warn} />
      </View>

      {/* Indicator tags: VWAP, RSI, LTP */}
      {indicators.length > 0 && (
        <View style={tagStyles.row}>
          {indicators.map(ind => (
            <IndicatorTag key={ind.label} label={ind.label} value={ind.value} />
          ))}
        </View>
      )}

      {/* Rationale tags */}
      {visibleRationale.length > 0 && (
        <View style={styles.rationaleRow}>
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

      {/* Log Trade button */}
      {!compact && (
        <TouchableOpacity
          style={styles.logBtn}
          onPress={() => onLogTrade?.(signal)}
          activeOpacity={0.8}
        >
          <Text style={styles.logBtnText}>Log Trade</Text>
        </TouchableOpacity>
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
  exitBanner: {
    backgroundColor: 'rgba(234,88,12,0.15)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  exitText: {
    fontSize: 11,
    color: colors.intraday,
    fontWeight: '600',
    letterSpacing: 0.2,
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
    gap: 5,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    flex: 1,
    marginLeft: 8,
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
  tfBadge: {
    backgroundColor: 'rgba(234,88,12,0.15)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 20,
  },
  tfText: {
    fontSize: 10,
    color: colors.intraday,
    fontWeight: '600',
  },
  weeklyBadge: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 20,
  },
  weeklyText: {
    fontSize: 10,
    color: colors.warn,
    fontWeight: '600',
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
  scanTime: {
    fontSize: 11,
    color: colors.muted,
  },
  rationaleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
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
  logBtn: {
    marginTop: 12,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: colors.intraday,
  },
  logBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
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

const tagStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  indicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(234,88,12,0.1)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  indicatorLabel: {
    fontSize: 10,
    color: colors.intraday,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  indicatorValue: {
    fontSize: 11,
    color: colors.text,
    fontWeight: '600',
  },
})

export default memo(IntradaySignalCard)
