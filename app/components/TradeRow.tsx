import React, { memo, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native'
import { colors } from '../constants'
import type { Trade } from '../types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type BookLevel = 'T1' | 'T2' | 'T3' | 'SL'

interface Props {
  trade: Trade
  onBook: (tradeId: number, level: BookLevel, targetPrice: number) => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<Trade['status'], string> = {
  OPEN: '#3b82f6',
  PARTIAL: colors.warn,
  CLOSED: colors.bull,
  SL_HIT: colors.bear,
}

const STATUS_LABELS: Record<Trade['status'], string> = {
  OPEN: 'Open',
  PARTIAL: 'Partial',
  CLOSED: 'Closed',
  SL_HIT: 'SL Hit',
}

function tradePnL(trade: Trade): number | null {
  if (trade.total_pnl !== null) return trade.total_pnl
  if (trade.bookings.length > 0) {
    return trade.bookings.reduce((sum, b) => sum + b.pnl, 0)
  }
  return null
}

function formatPnL(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}₹${Math.abs(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function getBookableTargets(trade: Trade): BookLevel[] {
  if (trade.status === 'CLOSED' || trade.status === 'SL_HIT') return []
  const booked = new Set(trade.bookings.map(b => b.level))
  return (['T1', 'T2', 'T3', 'SL'] as BookLevel[]).filter(l => !booked.has(l))
}

function levelPrice(trade: Trade, level: BookLevel): number {
  switch (level) {
    case 'T1': return trade.t1_premium
    case 'T2': return trade.t2_premium
    case 'T3': return trade.t3_premium
    case 'SL': return trade.sl_premium
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return iso
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PriceLadder({ trade }: { trade: Trade }) {
  const levels: Array<{ label: string; value: number; color: string }> = [
    { label: 'SL', value: trade.sl_premium, color: colors.bear },
    { label: 'Entry', value: trade.entry_premium, color: colors.text },
    { label: 'T1', value: trade.t1_premium, color: colors.accent },
    { label: 'T2', value: trade.t2_premium, color: colors.accent },
    { label: 'T3', value: trade.t3_premium, color: colors.bull },
  ]

  const booked = new Set(trade.bookings.map(b => b.level))

  return (
    <View style={ladderStyles.container}>
      <View style={ladderStyles.row}>
        {levels.map((lvl, idx) => {
          const isBookedLevel = lvl.label !== 'Entry' && lvl.label !== 'SL'
            ? booked.has(lvl.label as BookLevel)
            : lvl.label === 'SL'
            ? booked.has('SL')
            : false
          return (
            <React.Fragment key={lvl.label}>
              {idx > 0 && <Text style={ladderStyles.arrow}>›</Text>}
              <View style={ladderStyles.level}>
                <Text style={[ladderStyles.label, { color: isBookedLevel ? colors.muted : lvl.color }]}>
                  {lvl.label}
                  {isBookedLevel ? ' ✓' : ''}
                </Text>
                <Text style={[ladderStyles.value, { color: isBookedLevel ? colors.muted : lvl.color }]}>
                  ₹{lvl.value}
                </Text>
              </View>
            </React.Fragment>
          )
        })}
      </View>
    </View>
  )
}

function BookingsHistory({ trade }: { trade: Trade }) {
  if (trade.bookings.length === 0) return null
  return (
    <View style={historyStyles.container}>
      <Text style={historyStyles.header}>Bookings</Text>
      {trade.bookings.map(b => (
        <View key={b.id} style={historyStyles.row}>
          <Text style={historyStyles.level}>{b.level}</Text>
          <Text style={historyStyles.detail}>@ ₹{b.exit_premium}</Text>
          <Text style={historyStyles.qty}>{b.qty_booked} lots</Text>
          <Text style={[historyStyles.pnl, { color: b.pnl >= 0 ? colors.bull : colors.bear }]}>
            {b.pnl >= 0 ? '+' : ''}₹{Math.abs(b.pnl).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </Text>
        </View>
      ))}
    </View>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

function TradeRow({ trade, onBook }: Props) {
  const [expanded, setExpanded] = useState(false)

  const isCE = trade.direction === 'CE'
  const accentColor = isCE ? colors.bull : colors.bear
  const statusColor = STATUS_COLORS[trade.status]
  const pnl = tradePnL(trade)
  const bookableTargets = getBookableTargets(trade)

  const handleBook = useCallback(
    (level: BookLevel) => onBook(trade.id, level, levelPrice(trade, level)),
    [trade, onBook],
  )

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => setExpanded(v => !v)}
      activeOpacity={0.85}
    >
      {/* ── Compact header (always visible) ─────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.symbol}>{trade.symbol}</Text>
          <View style={[styles.dirBadge, { backgroundColor: isCE ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)' }]}>
            <Text style={[styles.dirText, { color: accentColor }]}>{trade.direction}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.statusPill, { backgroundColor: statusColor + '22' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {STATUS_LABELS[trade.status]}
            </Text>
          </View>
          {pnl !== null && (
            <Text style={[styles.pnl, { color: pnl >= 0 ? colors.bull : colors.bear }]}>
              {formatPnL(pnl)}
            </Text>
          )}
        </View>
      </View>

      {/* ── Compact details row ──────────────────────────────────────── */}
      <View style={styles.metaRow}>
        <Text style={styles.strike}>₹{trade.strike}</Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.expiry}>{trade.expiry}</Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.entry}>Entry ₹{trade.entry_premium}</Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.lots}>{trade.lots}×{trade.lot_size}</Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.date}>{formatDate(trade.entry_date)}</Text>
      </View>

      {/* ── Expanded view ────────────────────────────────────────────── */}
      {expanded && (
        <View style={styles.expanded}>
          <View style={styles.divider} />

          {/* Price ladder */}
          <PriceLadder trade={trade} />

          {/* Booking buttons */}
          {bookableTargets.length > 0 && (
            <View style={styles.bookingRow}>
              {bookableTargets.map(level => (
                <TouchableOpacity
                  key={level}
                  style={[
                    styles.bookBtn,
                    level === 'SL'
                      ? styles.bookBtnSL
                      : styles.bookBtnTarget,
                  ]}
                  onPress={() => handleBook(level)}
                  activeOpacity={0.8}
                >
                  <Text style={[
                    styles.bookBtnText,
                    level === 'SL' ? styles.bookBtnTextSL : styles.bookBtnTextTarget,
                  ]}>
                    {level} ₹{levelPrice(trade, level)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Bookings history */}
          <BookingsHistory trade={trade} />

          {/* Notes */}
          {trade.notes && (
            <Text style={styles.notes}>{trade.notes}</Text>
          )}
        </View>
      )}

      {/* Expand chevron */}
      <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
    </TouchableOpacity>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  symbol: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.2,
  },
  dirBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 20,
  },
  dirText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  pnl: {
    fontSize: 13,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  strike: { fontSize: 12, color: colors.text, fontWeight: '600' },
  expiry: { fontSize: 11, color: colors.subtext },
  entry: { fontSize: 11, color: colors.subtext },
  lots: { fontSize: 11, color: colors.muted },
  date: { fontSize: 11, color: colors.muted },
  dot: { fontSize: 10, color: colors.muted },
  chevron: {
    position: 'absolute',
    right: 12,
    bottom: 10,
    fontSize: 9,
    color: colors.muted,
  },
  expanded: {
    marginTop: 10,
  },
  divider: {
    height: 0.5,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  bookingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
  },
  bookBtn: {
    flex: 1,
    minWidth: '40%',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 1,
  },
  bookBtnTarget: {
    backgroundColor: 'rgba(0,212,170,0.1)',
    borderColor: colors.accent,
  },
  bookBtnSL: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderColor: colors.bear,
  },
  bookBtnText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  bookBtnTextTarget: {
    color: colors.accent,
  },
  bookBtnTextSL: {
    color: colors.bear,
  },
  notes: {
    marginTop: 8,
    fontSize: 11,
    color: colors.subtext,
    fontStyle: 'italic',
  },
})

const ladderStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  arrow: {
    fontSize: 12,
    color: colors.border,
    marginHorizontal: 1,
  },
  level: {
    alignItems: 'center',
    flex: 1,
  },
  label: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  value: {
    fontSize: 11,
    fontWeight: '600',
  },
})

const historyStyles = StyleSheet.create({
  container: {
    marginTop: 10,
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 10,
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
    gap: 8,
    marginBottom: 5,
  },
  level: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
    width: 24,
  },
  detail: {
    fontSize: 11,
    color: colors.text,
    flex: 1,
  },
  qty: {
    fontSize: 10,
    color: colors.muted,
  },
  pnl: {
    fontSize: 12,
    fontWeight: '700',
  },
})

export default memo(TradeRow)
