import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Signal, IntradaySignal } from '../types'
import { getOptionsPrice } from './api'
import { sendLocalNotification } from './notifications'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type PaperBooking = {
  level: string
  exitPremium: number
  pnl: number
  qty: number
}

export type PaperTrade = {
  id: string
  symbol: string
  direction: 'CE' | 'PE'
  strike: number
  expiry: string
  entryPremium: number
  lots: number
  lotSize: number
  capitalUsed: number
  sl: number
  t1: number
  t2: number
  t3: number
  status: 'OPEN' | 'PARTIAL' | 'CLOSED' | 'SL_HIT'
  bookings: PaperBooking[]
  totalPnl: number
  openedAt: string
  closedAt?: string
}

interface PaperPortfolio {
  capital: number
  trades: PaperTrade[]
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'paper_portfolio'
const INITIAL_CAPITAL = 500000

// ─── Storage helpers ──────────────────────────────────────────────────────────

async function loadPortfolio(): Promise<PaperPortfolio> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY)
  if (!raw) return { capital: INITIAL_CAPITAL, trades: [] }
  return JSON.parse(raw) as PaperPortfolio
}

async function savePortfolio(p: PaperPortfolio): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(p))
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getPaperPortfolio(): Promise<{
  capital: number
  used: number
  available: number
  trades: PaperTrade[]
}> {
  const p = await loadPortfolio()
  const used = p.trades
    .filter(t => t.status === 'OPEN' || t.status === 'PARTIAL')
    .reduce((sum, t) => sum + t.capitalUsed, 0)
  return { capital: INITIAL_CAPITAL, used, available: p.capital, trades: p.trades }
}

export async function openPaperTrade(signal: Signal | IntradaySignal): Promise<PaperTrade> {
  const p = await loadPortfolio()
  const lots = 1
  const lotSize = 1
  const capitalUsed = signal.entry_premium * lots * lotSize

  if (p.capital < capitalUsed) throw new Error('Insufficient paper capital')

  const t3 = 't3_premium' in signal
    ? (signal as Signal).t3_premium
    : signal.t2_premium * 1.5

  const trade: PaperTrade = {
    id: `p${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    symbol: signal.symbol,
    direction: signal.direction,
    strike: signal.strike,
    expiry: signal.expiry,
    entryPremium: signal.entry_premium,
    lots,
    lotSize,
    capitalUsed,
    sl: signal.sl_premium,
    t1: signal.t1_premium,
    t2: signal.t2_premium,
    t3,
    status: 'OPEN',
    bookings: [],
    totalPnl: 0,
    openedAt: new Date().toISOString(),
  }

  p.trades = [trade, ...p.trades]
  p.capital -= capitalUsed
  await savePortfolio(p)
  return trade
}

export async function bookPaperLevel(
  tradeId: string,
  level: string,
  exitPremium: number,
): Promise<PaperTrade> {
  const p = await loadPortfolio()
  const idx = p.trades.findIndex(t => t.id === tradeId)
  if (idx === -1) throw new Error('Trade not found')

  const trade = { ...p.trades[idx] }
  // Book ~30% of the position per level
  const qty = Math.max(1, Math.floor(trade.lots * trade.lotSize * 0.3))
  const pnl = (exitPremium - trade.entryPremium) * qty

  trade.bookings = [...trade.bookings, { level, exitPremium, pnl, qty }]
  trade.totalPnl = trade.bookings.reduce((s, b) => s + b.pnl, 0)
  trade.status = 'PARTIAL'
  p.capital += pnl
  p.trades[idx] = trade
  await savePortfolio(p)
  return trade
}

export async function closePaperTrade(
  tradeId: string,
  exitPremium: number,
): Promise<PaperTrade> {
  const p = await loadPortfolio()
  const idx = p.trades.findIndex(t => t.id === tradeId)
  if (idx === -1) throw new Error('Trade not found')

  const trade = { ...p.trades[idx] }
  const bookedQty = trade.bookings.reduce((s, b) => s + b.qty, 0)
  const remainingQty = Math.max(0, trade.lots * trade.lotSize - bookedQty)
  const remainingPnl = (exitPremium - trade.entryPremium) * remainingQty
  const bookedPnl = trade.bookings.reduce((s, b) => s + b.pnl, 0)

  trade.totalPnl = bookedPnl + remainingPnl
  trade.status = exitPremium <= trade.sl ? 'SL_HIT' : 'CLOSED'
  trade.closedAt = new Date().toISOString()

  // Return remaining capital
  p.capital += trade.capitalUsed + trade.totalPnl - bookedPnl
  p.trades[idx] = trade
  await savePortfolio(p)
  return trade
}

export async function getPaperStats(): Promise<{
  totalTrades: number
  winRate: number
  totalPnl: number
  bestTrade: number
  worstTrade: number
  monthlyBreakdown: Record<string, { trades: number; pnl: number }>
}> {
  const p = await loadPortfolio()
  const closed = p.trades.filter(t => t.status === 'CLOSED' || t.status === 'SL_HIT')

  if (closed.length === 0) {
    return { totalTrades: 0, winRate: 0, totalPnl: 0, bestTrade: 0, worstTrade: 0, monthlyBreakdown: {} }
  }

  const pnls = closed.map(t => t.totalPnl)
  const wins = pnls.filter(p => p > 0).length
  const monthlyBreakdown: Record<string, { trades: number; pnl: number }> = {}

  for (const trade of closed) {
    const month = trade.openedAt.slice(0, 7)
    if (!monthlyBreakdown[month]) monthlyBreakdown[month] = { trades: 0, pnl: 0 }
    monthlyBreakdown[month].trades += 1
    monthlyBreakdown[month].pnl += trade.totalPnl
  }

  return {
    totalTrades: closed.length,
    winRate: (wins / closed.length) * 100,
    totalPnl: pnls.reduce((s, p) => s + p, 0),
    bestTrade: Math.max(...pnls),
    worstTrade: Math.min(...pnls),
    monthlyBreakdown,
  }
}

export async function resetPaperPortfolio(): Promise<void> {
  await savePortfolio({ capital: INITIAL_CAPITAL, trades: [] })
}

// ─── Alert check (called on app foreground) ──────────────────────────────────
// Fetches live LTP for each open trade and auto-books/closes at SL / T1 / T2 / T3.

export async function checkPaperTradeAlerts(): Promise<void> {
  const p = await loadPortfolio()
  const open = p.trades.filter(t => t.status === 'OPEN' || t.status === 'PARTIAL')

  for (const trade of open) {
    let ltp: number
    try {
      const priceData = await getOptionsPrice(trade.symbol, trade.strike, trade.direction, trade.expiry)
      ltp = priceData.ltp
    } catch {
      continue
    }

    const bookedLevels = new Set(trade.bookings.map(b => b.level))

    if (ltp <= trade.sl) {
      await closePaperTrade(trade.id, trade.sl)
      await sendLocalNotification('🔴 SL Hit', `${trade.symbol} paper trade stopped out`)
    } else if (!bookedLevels.has('T1') && ltp >= trade.t1) {
      await bookPaperLevel(trade.id, 'T1', trade.t1)
      await sendLocalNotification('✅ T1 Hit', `${trade.symbol} — 30% booked automatically`)
    } else if (bookedLevels.has('T1') && !bookedLevels.has('T2') && ltp >= trade.t2) {
      await bookPaperLevel(trade.id, 'T2', trade.t2)
      await sendLocalNotification('✅ T2 Hit', `${trade.symbol} — T2 booked automatically`)
    } else if (bookedLevels.has('T2') && !bookedLevels.has('T3') && ltp >= trade.t3) {
      await bookPaperLevel(trade.id, 'T3', trade.t3)
      await closePaperTrade(trade.id, trade.t3)
      await sendLocalNotification('✅ T3 Hit', `${trade.symbol} — T3 hit, trade closed`)
    }
  }
}
