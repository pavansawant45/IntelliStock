import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp,
  DollarSign,
  BarChart3,
  Star,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react'
import axios from 'axios'
import StockChart from '../components/Charts/StockChart'
import { useAuth } from '../contexts/AuthContext'

// Returns Tailwind classes for a prediction badge. Safe for undefined/null and
// works whether the ML server sends "Buy", "BUY", "Strong Buy", "Sell", etc.
const getPredictionClasses = (prediction) => {
  const value = String(prediction ?? '').toLowerCase()
  if (value.includes('buy')) return 'bg-green-900 text-green-300'
  if (value.includes('sell')) return 'bg-red-900 text-red-300'
  return 'bg-yellow-900 text-yellow-300'
}

const formatMoney = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? `$${num.toFixed(2)}` : 'N/A'
}

const formatConfidence = (value) => {
  const num = Number(value)
  return value != null && Number.isFinite(num) ? `${num}% confidence` : 'Confidence N/A'
}

const Dashboard = () => {
  const { user } = useAuth()
  const [portfolioData, setPortfolioData] = useState([])
  const [watchlistData, setWatchlistData] = useState([])
  const [stats, setStats] = useState([])
  const [recentPredictions, setRecentPredictions] = useState([])
  const [loading, setLoading] = useState(true)

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      const headers = { Authorization: `Bearer ${token}` }

      const [profileResponse, watchlistResponse] = await Promise.all([
        axios.get(`${API_URL}/api/users/profile`, { headers }),
        axios.get(`${API_URL}/api/users/watchlist`, { headers })
      ])

      const userProfile = profileResponse.data || {}
      const watchlist = Array.isArray(watchlistResponse.data) ? watchlistResponse.data : []
      const predictions = Array.isArray(userProfile.predictions) ? userProfile.predictions : []

      const watchlistCount = watchlist.length
      const predictionsCount = predictions.length

      let portfolioValue = 0
      if (watchlist.length > 0) {
        portfolioValue = watchlist.reduce((sum, stock) => sum + (stock.price || 0), 0)
      }

      const previousPortfolioValue = watchlist.reduce((sum, stock) => {
        const previousPrice = (stock.price || 0) - (stock.change || 0)
        return sum + previousPrice
      }, 0)

      const portfolioChange = portfolioValue - previousPortfolioValue
      const portfolioChangePercent =
        previousPortfolioValue > 0
          ? Number(((portfolioChange / previousPortfolioValue) * 100).toFixed(1))
          : 0

      const last7Days = []
      for (let i = 6; i >= 0; i--) {
        const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const dayValue = portfolioValue * (0.95 + Math.random() * 0.1)
        last7Days.push({ date, value: Math.round(dayValue) })
      }
      last7Days[last7Days.length - 1].value = Math.round(portfolioValue)

      setPortfolioData(last7Days)
      setWatchlistData(watchlist)

      // Every field is normalised here so the render code never sees undefined
      const recentPreds = predictions
        .slice(-4)
        .reverse()
        .map((p) => ({
          stock: p?.symbol || 'N/A',
          prediction: p?.prediction || 'N/A',
          confidence: p?.confidence ?? null,
          target: formatMoney(p?.targetPrice)
        }))

      setRecentPredictions(recentPreds)

      setStats([
        {
          title: 'Portfolio Value',
          value: `$${portfolioValue.toFixed(2)}`,
          change: `${portfolioChangePercent >= 0 ? '+' : ''}${portfolioChangePercent}%`,
          changeType: portfolioChangePercent >= 0 ? 'positive' : 'negative',
          icon: DollarSign
        },
        {
          title: 'Total Gain/Loss',
          value: `${portfolioChange >= 0 ? '+' : '-'}$${Math.abs(portfolioChange).toFixed(2)}`,
          change: `${portfolioChangePercent >= 0 ? '+' : ''}${portfolioChangePercent}%`,
          changeType: portfolioChange >= 0 ? 'positive' : 'negative',
          icon: TrendingUp
        },
        {
          title: 'Active Predictions',
          value: predictionsCount.toString(),
          change: predictionsCount > 0 ? `+${predictionsCount}` : '0',
          changeType: 'positive',
          icon: BarChart3
        },
        {
          title: 'Watchlist Items',
          value: watchlistCount.toString(),
          change: watchlistCount > 0 ? `+${watchlistCount}` : '0',
          changeType: 'positive',
          icon: Star
        }
      ])
    } catch (error) {
      console.error('Dashboard data fetch error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">
              Welcome back, {user?.name}!
            </h1>
            <p className="text-gray-400">
              Here's your portfolio overview and market insights.
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {stats.map((stat, index) => {
              const Icon = stat.icon
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="card hover:border-primary-500 transition-colors duration-300"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-sm">{stat.title}</p>
                      <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
                      <div className="flex items-center mt-2">
                        {stat.changeType === 'positive' ? (
                          <ArrowUpRight className="h-4 w-4 text-green-400 mr-1" />
                        ) : (
                          <ArrowDownRight className="h-4 w-4 text-red-400 mr-1" />
                        )}
                        <span
                          className={`text-sm ${
                            stat.changeType === 'positive' ? 'text-green-400' : 'text-red-400'
                          }`}
                        >
                          {stat.change}
                        </span>
                      </div>
                    </div>
                    <div className="text-primary-400">
                      <Icon className="h-8 w-8" />
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              <StockChart
                data={portfolioData}
                title="Portfolio Performance"
                color="#10b981"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="card"
            >
              <h3 className="text-lg font-semibold mb-4 text-white">Recent Predictions</h3>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
                </div>
              ) : recentPredictions.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  No predictions yet. Try the Stock Predictor!
                </div>
              ) : (
                <div className="space-y-4">
                  {recentPredictions.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-gray-700 rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="font-semibold text-white">{item.stock}</div>
                        <div
                          className={`px-2 py-1 rounded text-xs font-medium ${getPredictionClasses(
                            item.prediction
                          )}`}
                        >
                          {item.prediction}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-white font-medium">{item.target}</div>
                        <div className="text-gray-400 text-sm">
                          {formatConfidence(item.confidence)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>

          {/* Watchlist */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="card"
          >
            <h3 className="text-lg font-semibold mb-4 text-white">Your Watchlist</h3>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
              </div>
            ) : watchlistData.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                Your watchlist is empty. Add stocks to track them here!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left py-3 text-gray-400 font-medium">Symbol</th>
                      <th className="text-left py-3 text-gray-400 font-medium">Name</th>
                      <th className="text-right py-3 text-gray-400 font-medium">Price</th>
                      <th className="text-right py-3 text-gray-400 font-medium">Change</th>
                      <th className="text-right py-3 text-gray-400 font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {watchlistData.map((stock, index) => (
                      <tr
                        key={stock.symbol || index}
                        className="border-b border-gray-700 hover:bg-gray-800 transition-colors"
                      >
                        <td className="py-3 font-semibold text-white">{stock.symbol}</td>
                        <td className="py-3 text-gray-300">{stock.name}</td>
                        <td className="py-3 text-right text-white">
                          ${stock.price?.toFixed(2) || '0.00'}
                        </td>
                        <td
                          className={`py-3 text-right ${
                            stock.change >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}
                        >
                          {stock.change >= 0 ? '+' : ''}
                          {stock.change?.toFixed(2) || '0.00'}
                        </td>
                        <td
                          className={`py-3 text-right ${
                            stock.changePercent >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}
                        >
                          {stock.changePercent >= 0 ? '+' : ''}
                          {stock.changePercent?.toFixed(2) || '0.00'}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}

export default Dashboard
