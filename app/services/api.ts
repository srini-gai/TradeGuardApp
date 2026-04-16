import axios from 'axios'
import { API_BASE } from '../constants'
import type {
  Signal, IntradaySignal, Trade, TradeCreate,
  BacktestSummary, Alert, RiskStatus, MonthlySummary,
  Nifty500Symbol, StockAnalysis, IntradayStatus,
} from '../types'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
})

// Health
export const checkHealth = () =>
  axios.get('https://tradegard.tech/health').then(r => r.data)

// Screener
export const runScreener = () =>
  api.post('/screener/run').then(r => r.data)

export const getTodaySignals = (): Promise<{ date: string; count: number; signals: Signal[] }> =>
  api.get('/screener/signals/today').then(r => r.data)

export const getAllSignals = (limit = 20, skip = 0) =>
  api.get(`/screener/signals?limit=${limit}&skip=${skip}`).then(r => r.data)

// Intraday
export const scanIntraday = () =>
  api.post('/intraday/scan').then(r => r.data)

export const getTodayIntradaySignals = (): Promise<{ date: string; count: number; signals: IntradaySignal[] }> =>
  api.get('/intraday/signals/today').then(r => r.data)

export const getIntradayStatus = (): Promise<IntradayStatus> =>
  api.get('/intraday/status').then(r => r.data)

// Nifty 500 Search
export const getNifty500 = (): Promise<{ symbols: Nifty500Symbol[]; count: number }> =>
  api.get('/screener/nifty500').then(r => r.data)

export const analyseSymbol = (symbol: string): Promise<StockAnalysis> =>
  api.get(`/screener/analyse/${symbol}`).then(r => r.data)

export const getStrikes = (symbol: string) =>
  api.get(`/data/strikes/${symbol}`).then(r => r.data)

// Journal
export const logTrade = (payload: TradeCreate): Promise<Trade> =>
  api.post('/journal/trades', payload).then(r => r.data)

export const getTrades = (): Promise<Trade[]> =>
  api.get('/journal/trades').then(r => r.data)

export const getTodayTrades = (): Promise<Trade[]> =>
  api.get('/journal/trades/today').then(r => r.data)

export const bookLevel = (id: number, level: string, exitPremium: number): Promise<Trade> =>
  api.post(`/journal/trades/${id}/book`, { level, exit_premium: exitPremium }).then(r => r.data)

export const getMonthlySummary = (): Promise<MonthlySummary> =>
  api.get('/journal/summary/monthly').then(r => r.data)

export const getRiskStatus = (): Promise<RiskStatus> =>
  api.get('/journal/risk/status').then(r => r.data)

// Backtest
export const runBacktest = (months: number) =>
  api.post(`/backtest/run?months=${months}`).then(r => r.data)

export const getBacktestSummary = (): Promise<{ has_results: boolean; summary: BacktestSummary | null }> =>
  api.get('/backtest/summary').then(r => r.data)

export const getBacktestRuns = () =>
  api.get('/backtest/results').then(r => r.data)

export const getBacktestRunDetail = (id: number) =>
  api.get(`/backtest/results/${id}`).then(r => r.data)

// Alerts
export const getTodayAlerts = (): Promise<{ alerts: Alert[] }> =>
  api.get('/alerts/today').then(r => r.data)

export const getAllAlerts = (symbol?: string): Promise<{ alerts: Alert[] }> =>
  api.get(`/alerts${symbol ? `?symbol=${symbol}` : ''}`).then(r => r.data)

export const sendTestWebhook = () =>
  axios.post('https://tradegard.tech/webhook/test', {
    symbol: 'TEST', action: 'ALERT', price: 1234.5,
  }).then(r => r.data)
