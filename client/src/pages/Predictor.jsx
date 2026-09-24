import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Search, TrendingUp, Brain, Star, Calendar } from 'lucide-react'
import StockChart from '../components/Charts/StockChart'
import toast from 'react-hot-toast'
import axios from 'axios'

// Colors "Buy" and "Strong Buy" green, "Sell" and "Strong Sell" red, everything else yellow
const getRecommendationColor = (recommendation) => {
  const value = String(recommendation ?? '').toLowerCase()
  if (value.includes('buy')) return 'text-green-400'
  if (value.includes('sell')) return 'text-red-400'
  return 'text-yellow-400'
}

const Predictor = () => {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedStock, setSelectedStock] = useState(null)
  const [predictionDays, setPredictionDays] = useState(1)
  const [prediction, setPrediction] = useState(null)
  const [loading, setLoading] = useState(false)
  const [historicalData, setHistoricalData] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [stocks, setStocks] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

  useEffect(() => {
    if (searchTerm.length >= 2) {
      const delaySearch = setTimeout(() => {
        searchStocks()
      }, 500)
      return () => clearTimeout(delaySearch)
    } else {
      setStocks([])
    }
  }, [searchTerm])

  const searchStocks = async () => {
    try {
      setSearchLoading(true)
      const token = localStorage.getItem('token')
      const response = await axios.get(`${API_URL}/api/stocks/search/${searchTerm}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setStocks(response.data)
    } catch (error) {
      console.error('Stock search error:', error)
      toast.error('Failed to search stocks')
    } finally {
      setSearchLoading(false)
    }
  }

  const fetchHistoricalData = async (symbol) => {
    try {
      setLoadingHistory(true)
      const token = localStorage.getItem('token')
      const response = await axios.get(`${API_URL}/api/stocks/${symbol}/history?period=1m`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setHistoricalData(response.data)
    } catch (error) {
      console.error('Historical data error:', error)
      toast.error('Failed to fetch historical data')
    } finally {
      setLoadingHistory(false)
    }
  }

  const handleStockSelect = (stock) => {
    setSelectedStock(stock)
    setSearchTerm('')
    setPrediction(null)
    fetchHistoricalData(stock.symbol)
  }

  const handlePredict = async () => {
    if (!selectedStock) {
      toast.error('Please select a stock first')
      return
    }

    setLoading(true)

    try {
      const token = localStorage.getItem('token')
      const response = await axios.post(
        `${API_URL}/api/stocks/predict`,
        {
          symbol: selectedStock.symbol,
          days: predictionDays
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      )

      setPrediction(response.data)
      toast.success('Prediction generated successfully!')
    } catch (error) {
      console.error('Prediction error:', error)
      toast.error(error.response?.data?.message || 'Failed to generate prediction')
    } finally {
      setLoading(false)
    }
  }

  const addToWatchlist = async () => {
    if (!selectedStock) {
      toast.error('Please select a stock first')
      return
    }

    try {
      const token = localStorage.getItem('token')
      await axios.post(
        `${API_URL}/api/users/watchlist`,
        {
          symbol: selectedStock.symbol,
          name: selectedStock.name
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      )
      toast.success(`${selectedStock.symbol} added to watchlist!`)
    } catch (error) {
      console.error('Add to watchlist error:', error)
      if (error.response?.status === 400) {
        toast.error('Stock already in watchlist')
      } else {
        toast.error('Failed to add stock to watchlist')
      }
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
              AI Stock Predictor
            </h1>
            <p className="text-gray-400">
              Get AI-powered predictions for your favorite stocks
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Search and Selection */}
            <div className="lg:col-span-1">
              <div className="card mb-6">
                <h3 className="text-lg font-semibold mb-4 text-white">Search Stocks</h3>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by symbol or name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                {searchTerm && (
                  <div className="space-y-2 mb-4">
                    {searchLoading ? (
                      <div className="text-center py-4">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto"></div>
                      </div>
                    ) : stocks.length > 0 ? (
                      stocks.map((stock) => (
                        <button
                          key={stock.symbol}
                          onClick={() => handleStockSelect(stock)}
                          className="w-full text-left p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                        >
                          <div className="font-semibold text-white">{stock.symbol}</div>
                          <div className="text-sm text-gray-400">{stock.name}</div>
                          <div className="text-sm text-primary-400">${stock.price?.toFixed(2)}</div>
                        </button>
                      ))
                    ) : (
                      <div className="text-center py-4 text-gray-400">
                        No stocks found
                      </div>
                    )}
                  </div>
                )}

                {selectedStock && (
                  <div className="p-4 bg-primary-900/20 border border-primary-500/30 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold text-white">{selectedStock.symbol}</div>
                      <button
                        onClick={addToWatchlist}
                        className="text-primary-400 hover:text-primary-300"
                      >
                        <Star className="h-5 w-5" />
                      </button>
                    </div>
                    <div className="text-sm text-gray-400 mb-1">{selectedStock.name}</div>
                    <div className="text-lg font-bold text-primary-400">${selectedStock.price}</div>
                  </div>
                )}
              </div>

              {/* Prediction Settings */}
              <div className="card">
                <h3 className="text-lg font-semibold mb-4 text-white">Prediction Settings</h3>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Prediction Period
                  </label>
                  <select
                    value={predictionDays}
                    onChange={(e) => setPredictionDays(Number(e.target.value))}
                    className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value={1}>1 Day</option>
                    <option value={3}>3 Days</option>
                    <option value={5}>5 Days</option>
                    <option value={7}>1 Week</option>
                    <option value={30}>1 Month</option>
                  </select>
                </div>

                <button
                  onClick={handlePredict}
                  disabled={!selectedStock || loading}
                  className="w-full btn-primary flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Analyzing...</span>
                    </>
                  ) : (
                    <>
                      <Brain className="h-5 w-5" />
                      <span>Generate Prediction</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Charts and Results */}
            <div className="lg:col-span-2">
              {selectedStock && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5 }}
                  className="mb-6"
                >
                  {loadingHistory ? (
                    <div className="card">
                      <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
                      </div>
                    </div>
                  ) : historicalData.length > 0 ? (
                    <StockChart
                      data={historicalData}
                      title={`${selectedStock.symbol} - Historical Price`}
                      color="#3b82f6"
                    />
                  ) : null}
                </motion.div>
              )}

              {prediction && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="card"
                >
                  <h3 className="text-lg font-semibold mb-4 text-white flex items-center">
                    <TrendingUp className="h-5 w-5 mr-2 text-primary-400" />
                    AI Prediction Results
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className="space-y-4">
                      <div className="p-4 bg-gray-700 rounded-lg">
                        <div className="text-sm text-gray-400 mb-1">Current Price</div>
                        <div className="text-2xl font-bold text-white">${prediction.currentPrice.toFixed(2)}</div>
                      </div>
                      <div className="p-4 bg-gray-700 rounded-lg">
                        <div className="text-sm text-gray-400 mb-1">Predicted Price ({predictionDays} day{predictionDays > 1 ? 's' : ''})</div>
                        <div className="text-2xl font-bold text-primary-400">${prediction.predictedPrice.toFixed(2)}</div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="p-4 bg-gray-700 rounded-lg">
                        <div className="text-sm text-gray-400 mb-1">Confidence Level</div>
                        <div className="text-2xl font-bold text-white">{prediction.confidence}%</div>
                        <div className="w-full bg-gray-600 rounded-full h-2 mt-2">
                          <div 
                            className="bg-primary-500 h-2 rounded-full" 
                            style={{ width: `${prediction.confidence}%` }}
                          ></div>
                        </div>
                      </div>
                      <div className="p-4 bg-gray-700 rounded-lg">
                        <div className="text-sm text-gray-400 mb-1">Recommendation</div>
                        <div className={`text-2xl font-bold ${getRecommendationColor(prediction.recommendation)}`}>
                          {prediction.recommendation}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-700 pt-6">
                    <h4 className="text-md font-semibold text-white mb-3">Key Factors</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {prediction.factors.map((factor, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <div className="w-2 h-2 bg-primary-400 rounded-full"></div>
                          <span className="text-gray-300 text-sm">{factor}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

export default Predictor
