import React, { memo, useState, useCallback } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { colors } from '../constants'
import type { PaperTrade } from '../services/paperTrading'

interface Props {
  trade: PaperTrade
  onBook: (tradeId: string, level: string, exitPremium: number) => void
  onClose: (tradeId: string, exitPremium: number) => void
}

const STATUS_COLORS: Record<PaperTrade['status'], string> = {
  OPEN: '#3b82f6',
  PARTIAL: colors.warn,
  CLOSED: colors.bull,
  SL_HIT: colors.bear,
}

const STATUS_LABELS: Record<PaperTrade['status'], string> = {
  OPEN: 'Open',
  PARTIAL: 'Partial',
  CLOSED: 'Closed',
  SL_HIT: 'SL Hit',
}

function formatPnL(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}₹${Math.abs(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  } catch {
    return iso
  }
}

function PaperTradeRow({ trade, onBook, onClose }: Props) {
  const [expanded, setExpanded] = useState(false)
  const isCE = trade.direction === 'CE'
  const accentColor = isCE ? colors.bull : colors.bear
  const statusColor = STATUS_COLORS[trade.status]
  const isActive = trade.status === 'OPEN' || trade.status === 'PARTIAL'
  const bookedLevels = new Set(trade.bookings.map(b => b.level))

  const handleBook = useCallback(
    (level: string, price: number) => onBook(trade.id, level, price),
    [trade.id, onBook],
  )
  const handleClose = useCallback(
    (exitPremium: number) => onClose(trade.id, exitPremium),
    [trade.id, onClose],
  )

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => setExpanded(v => !v)}
      activeOpacity={0.85}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.symbol}>{trade.symbol}</Text>
          <View style={[styles.dirBadge, { backgroundColor: isCE ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)' }]}>
            <Text style={[styles.dirText, { color: accentColor }]}>{trade.direction}</Text>
          </View>
          <View style={styles.paperBadge}>
            <Text style={styles.paperText}>PAPER</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.statusPill, { backgroundColor: statusColor + '22' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {STATUS_LABELS[trade.status]}
            </Text>
          </View>
          {trade.totalPnl !== 0 && (
            <Text style={[styles.pnl, { color: trade.totalPnl >= 0 ? colors.bull : colors.bear }]}>
              {formatPnL(trade.totalPnl)}
            </Text>
          )}
        </View>
      </View>

      {/* Meta row */}
      <View style={styles.metaRow}>
        <Text style={styles.meta}>₹{trade.strike}</Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.meta}>{trade.expiry}</Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.meta}>Entry ₹{trade.entryPremium}</Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.metaMuted}>{formatDate(trade.openedAt)}</Text>
      </View>

      {/* Expanded section */}
      {expanded && (
        <View style={styles.expanded}>
          <View style={styles.divider} />

          {/* Price ladder */}
          <View style={styles.ladder}>
            {[
              { label: 'SL', value: trade.sl, color: colors.bear },
              { label: 'Entry', value: trade.entryPremium, color: colors.text },
              { label: 'T1', value: trade.t1, color: colors.accent },
              { label: 'T2', value: trade.t2, color: colors.accent },
              { label: 'T3', value: trade.t3, color: colors.bull },
            ].map((lvl, idx) => {
              const isBooked = lvl.label !== 'Entry' && lvl.label !== 'SL' && bookedLevels.has(lvl.label)
              return (
                <React.Fragment key={lvl.label}>
                  {idx > 0 && <Text style={styles.arrow}>›</Text>}
                  <View style={styles.ladderLevel}>
                    <Text style={[styles.ladderLabel, { color: isBooked ? colors.muted : lvl.color }]}>
                      {lvl.label}{isBooked ? ' ✓' : ''}
                    </Text>
                    <Text style={[styles.ladderValue, { color: isBooked ? colors.muted : lvl.color }]}>
                      ₹{lvl.value}
                    </Text>
                  </View>
                </React.Fragment>
              )
            })}
          </View>

          {/* Action buttons for active trades */}
          {isActive && (
            <View style={styles.actionRow}>
              {!bookedLevels.has('T1') && (
                <TouchableOpacity
                  style={styles.bookBtn}
                  onPress={() => handleBook('T1', trade.t1)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.bookBtnText}>Book T1 ₹{trade.t1}</Text>
                </TouchableOpacity>
              )}
              {!bookedLevels.has('T2') && (
                <TouchableOpacity
                  style={styles.bookBtn}
                  onPress={() => handleBook('T2', trade.t2)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.bookBtnText}>Book T2 ₹{trade.t2}</Text>
                </TouchableOpacity>
              )}
              {!bookedLevels.has('T3') && (
                <TouchableOpacity
                  style={styles.bookBtn}
                  onPress={() => handleBook('T3', trade.t3)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.bookBtnText}>Book T3 ₹{trade.t3}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.bookBtn, styles.exitBtn]}
                onPress={() => handleClose(trade.sl)}
                activeOpacity={0.8}
              >
                <Text style={[styles.bookBtnText, styles.exitBtnText]}>Exit @ SL</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Bookings history */}
          {trade.bookings.length > 0 && (
            <View style={styles.bookingsBox}>
              <Text style={styles.bookingsHeader}>Bookings</Text>
              {trade.bookings.map((b, i) => (
                <View key={i} style={styles.bookingRow}>
                  <Text style={styles.bookingLevel}>{b.level}</Text>
                  <Text style={styles.bookingDetail}>@ ₹{b.exitPremium}</Text>
                  <Text style={styles.bookingQty}>{b.qty} qty</Text>
                  <Text style={[styles.bookingPnl, { color: b.pnl >= 0 ? colors.bull : colors.bear }]}>
                    {formatPnL(b.pnl)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
    </TouchableOpacity>
  )
}

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
    gap: 6,
    flex: 1,
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
  paperBadge: {
    backgroundColor: 'rgba(234,88,12,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: colors.intraday,
  },
  paperText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.intraday,
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
  meta: {
    fontSize: 11,
    color: colors.subtext,
    fontWeight: '500',
  },
  metaMuted: {
    fontSize: 11,
    color: colors.muted,
  },
  dot: {
    fontSize: 10,
    color: colors.muted,
  },
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
    marginBottom: 10,
  },
  ladder: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  arrow: {
    fontSize: 12,
    color: colors.border,
    marginHorizontal: 1,
  },
  ladderLevel: {
    alignItems: 'center',
    flex: 1,
  },
  ladderLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  ladderValue: {
    fontSize: 11,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  bookBtn: {
    flex: 1,
    minWidth: '44%',
    backgroundColor: 'rgba(0,212,170,0.1)',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
  },
  bookBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 0.2,
  },
  exitBtn: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderColor: colors.bear,
  },
  exitBtnText: {
    color: colors.bear,
  },
  bookingsBox: {
    marginTop: 10,
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 10,
  },
  bookingsHeader: {
    fontSize: 9,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  bookingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 5,
  },
  bookingLevel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
    width: 24,
  },
  bookingDetail: {
    fontSize: 11,
    color: colors.text,
    flex: 1,
  },
  bookingQty: {
    fontSize: 10,
    color: colors.muted,
  },
  bookingPnl: {
    fontSize: 12,
    fontWeight: '700',
  },
})

export default memo(PaperTradeRow)
