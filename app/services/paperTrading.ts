import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Signal, IntradaySignal } from '../types'

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

export async function checkPaperTradeAlerts(
  todaySignals: Signal[],
): Promise<Array<{ symbol: string; level: string; tradeId: string }>> {
  const p = await loadPortfolio()
  const open = p.trades.filter(t => t.status === 'OPEN' || t.status === 'PARTIAL')
  const result: Array<{ symbol: string; level: string; tradeId: string }> = []

  for (const trade of open) {
    const sig = todaySignals.find(
      s => s.symbol === trade.symbol && s.direction === trade.direction,
    )
    if (!sig) continue

    const currentPremium = sig.entry_premium
    const bookedLevels = new Set(trade.bookings.map(b => b.level))

    if (!bookedLevels.has('T1') && currentPremium >= trade.t1) {
      result.push({ symbol: trade.symbol, level: 'T1', tradeId: trade.id })
    } else if (!bookedLevels.has('T2') && currentPremium >= trade.t2) {
      result.push({ symbol: trade.symbol, level: 'T2', tradeId: trade.id })
    } else if (!bookedLevels.has('T3') && currentPremium >= trade.t3) {
      result.push({ symbol: trade.symbol, level: 'T3', tradeId: trade.id })
    }
  }

  return result
}
