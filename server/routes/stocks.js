const express = require('express')
const axios = require('axios')
const createYahooFinanceClient = require('../utils/yahooFinanceClient')
const Stock = require('../models/Stock')
const User = require('../models/User')
const { auth } = require('../middleware/auth')

const yahooFinance = createYahooFinanceClient({
  timeout: 5000,
  maxRetries: 3,
  retryDelay: 1000
})

const router = express.Router()

router.get('/:symbol', auth, async (req, res) => {
  try {
    const { symbol } = req.params

    const quote = await yahooFinance.quote(symbol.toUpperCase())

    if (!quote) {
      return res.status(404).json({ message: 'Stock not found' })
    }

    const stockData = {
      symbol: quote.symbol,
      name: quote.longName || quote.shortName || quote.symbol,
      currentPrice: quote.regularMarketPrice,
      change: quote.regularMarketChange,
      changePercent: quote.regularMarketChangePercent,
      volume: quote.regularMarketVolume,
      marketCap: quote.marketCap,
      sector: quote.sector || 'N/A',
      high: quote.regularMarketDayHigh,
      low: quote.regularMarketDayLow,
      open: quote.regularMarketOpen,
      previousClose: quote.regularMarketPreviousClose
    }

    res.json(stockData)
  } catch (error) {
    console.error('Get stock error:', error)
    res.status(500).json({
      message: 'Error fetching stock data',
      error: error.message
    })
  }
})

router.get('/search/:query', auth, async (req, res) => {
  try {
    const { query } = req.params

    const searchResults = await yahooFinance.search(query)

    const stocks = await Promise.all(
      searchResults.quotes
        .filter(result => result.quoteType === 'EQUITY')
        .slice(0, 10)
        .map(async (result) => {
          try {
            const quote = await yahooFinance.quote(result.symbol)
            return {
              symbol: result.symbol,
              name: result.longname || result.shortname || result.symbol,
              price: quote.regularMarketPrice,
              exchange: result.exchDisp
            }
          } catch (err) {
            console.error(`Error fetching quote for ${result.symbol}:`, err)
            return {
              symbol: result.symbol,
              name: result.longname || result.shortname || result.symbol,
              price: null,
              exchange: result.exchDisp
            }
          }
        })
    )

    res.json(stocks.filter(stock => stock.price !== null))
  } catch (error) {
    console.error('Search stocks error:', error)
    res.status(500).json({
      message: 'Error searching stocks',
      error: error.message
    })
  }
})

router.post('/predict', auth, async (req, res) => {
  try {
    const { symbol, days = 1 } = req.body

    try {
      const mlResponse = await axios.post(`${process.env.ML_SERVER_URL}/predict`, {
        symbol,
        days
      }, {
        timeout: 10000
      })

      const prediction = mlResponse.data

      const user = await User.findById(req.user._id)
      user.predictions.push({
        symbol,
        prediction: prediction.recommendation,
        confidence: prediction.confidence,
        targetPrice: prediction.predictedPrice
      })
      await user.save()

      res.json(prediction)
    } catch (mlError) {
      console.log('ML server error:', mlError.message)
      return res.status(503).json({
        message: 'ML prediction service is currently unavailable. Please ensure the ML server is running.',
        error: mlError.message
      })
    }
  } catch (error) {
    console.error('Prediction error:', error)
    res.status(500).json({
      message: 'Error generating prediction',
      error: error.message
    })
  }
})

router.get('/:symbol/history', auth, async (req, res) => {
  try {
    const { symbol } = req.params
    const { period = '1mo' } = req.query

    const periodMap = {
      '7d': 7,
      '1mo': 30,
      '3mo': 90,
      '1y': 365
    }

    const days = periodMap[period] || 30
    const period1 = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const chartData = await yahooFinance.chart(symbol, {
      period1,
      interval: '1d'
    })

    const historicalData = chartData.quotes.map(item => ({
      date: new Date(item.date).toISOString().split('T')[0],
      value: item.close,
      open: item.open,
      high: item.high,
      low: item.low,
      volume: item.volume
    }))

    res.json(historicalData)
  } catch (error) {
    console.error('Historical data error:', error)
    res.status(500).json({
      message: 'Error fetching historical data',
      error: error.message
    })
  }
})

router.get('/news/watchlist', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query
    const user = await User.findById(req.user._id)
    const watchlist = user.watchlist

    if (!watchlist || watchlist.length === 0) {
      return res.json({ news: [], hasMore: false, total: 0 })
    }

    const allNews = []
    const newsIdMap = new Map()

    for (const stock of watchlist) {
      try {
        const newsResult = await yahooFinance.search(stock.symbol, {
          newsCount: 10
        })

        if (newsResult && newsResult.news && newsResult.news.length > 0) {
          const stockNews = newsResult.news
            .filter(article => article && article.title && article.link)
            .map(article => {
              const sentiment = analyzeSentiment(article.title)

              return {
                id: article.uuid || `${stock.symbol}-${article.providerPublishTime || Date.now()}`,
                title: article.title,
                summary: article.summary || article.title,
                impact: sentiment,
                stocks: [stock.symbol],
                timestamp: article.providerPublishTime
                  ? new Date(article.providerPublishTime * 1000).toISOString()
                  : new Date().toISOString(),
                source: article.publisher || 'Yahoo Finance',
                url: article.link
              }
            })

          stockNews.forEach(news => {
            if (!newsIdMap.has(news.id)) {
              newsIdMap.set(news.id, news)
              allNews.push(news)
            } else {
              const existing = newsIdMap.get(news.id)
              if (!existing.stocks.includes(stock.symbol)) {
                existing.stocks.push(stock.symbol)
              }
            }
          })
        }
      } catch (err) {
        console.error(`Error fetching news for ${stock.symbol}:`, err.message)
      }
    }

    allNews.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

    const startIndex = (page - 1) * limit
    const endIndex = startIndex + parseInt(limit)
    const paginatedNews = allNews.slice(startIndex, endIndex)
    const hasMore = endIndex < allNews.length

    res.json({
      news: paginatedNews,
      hasMore,
      total: allNews.length,
      page: parseInt(page),
      totalPages: Math.ceil(allNews.length / limit)
    })
  } catch (error) {
    console.error('Watchlist news error:', error)
    res.status(500).json({
      message: 'Error fetching watchlist news',
      error: error.message
    })
  }
})

function analyzeSentiment(title) {
  const lowerTitle = title.toLowerCase()

  const positiveWords = ['surge', 'gain', 'rise', 'jump', 'beat', 'exceed', 'growth', 'profit',
                        'success', 'record', 'high', 'boost', 'strong', 'positive', 'rally',
                        'upgrade', 'outperform', 'bullish', 'expand', 'breakthrough']
  const negativeWords = ['fall', 'drop', 'decline', 'loss', 'miss', 'weak', 'concern', 'risk',
                         'low', 'cut', 'negative', 'downgrade', 'bearish', 'challenge',
                         'struggle', 'plunge', 'crash', 'slump', 'warning']

  const positiveCount = positiveWords.filter(word => lowerTitle.includes(word)).length
  const negativeCount = negativeWords.filter(word => lowerTitle.includes(word)).length

  if (positiveCount > negativeCount) return 'positive'
  if (negativeCount > positiveCount) return 'negative'
  return 'neutral'
}

router.get('/news/:symbol?', auth, async (req, res) => {
  try {
    const { symbol } = req.params

    const mockNews = [
      {
        id: 1,
        title: "Market Analysis: Tech Stocks Show Strong Performance",
        summary: "Technology sector continues to outperform broader market indices as investors bet on AI and cloud computing growth.",
        impact: "positive",
        stocks: ["AAPL", "GOOGL", "MSFT", "META"],
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        source: "MarketWatch",
        url: "#"
      },
      {
        id: 2,
        title: "Federal Reserve Signals Potential Rate Changes",
        summary: "Economic indicators suggest possible monetary policy adjustments in upcoming quarters, impacting market sentiment.",
        impact: "neutral",
        stocks: ["SPY", "QQQ"],
        timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        source: "Reuters",
        url: "#"
      },
      {
        id: 3,
        title: "Energy Sector Faces Headwinds Amid Global Concerns",
        summary: "Oil and gas companies navigate challenging market conditions with volatility in commodity prices.",
        impact: "negative",
        stocks: ["XOM", "CVX"],
        timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        source: "Bloomberg",
        url: "#"
      }
    ]

    let filteredNews = mockNews
    if (symbol) {
      filteredNews = mockNews.filter(news =>
        news.stocks.includes(symbol.toUpperCase())
      )
    }

    res.json(filteredNews)
  } catch (error) {
    console.error('News error:', error)
    res.status(500).json({
      message: 'Error fetching news',
      error: error.message
    })
  }
})

module.exports = router
