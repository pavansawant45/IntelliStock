const YahooFinance = require('yahoo-finance2').default
const yahooFinance = new YahooFinance()
const pRetry = require('p-retry')

const DEFAULT_OPTIONS = {
  timeout: 5000,
  maxRetries: 3,
  retryDelay: 1000
}

const createYahooFinanceClient = (options = {}) => {
  const config = { ...DEFAULT_OPTIONS, ...options }

  const withRetry = async (fn, context = 'Yahoo Finance API call') => {
    return pRetry(fn, {
      retries: config.maxRetries,
      minTimeout: config.retryDelay,
      maxTimeout: config.retryDelay * 4,
      onFailedAttempt: error => {
        console.warn(
          `${context} failed (attempt ${error.attemptNumber}/${config.maxRetries + 1}): ${error.message}`
        )
      }
    })
  }

  return {
    quote: async (symbol) => {
      try {
        return await withRetry(
          async () => {
            const result = await Promise.race([
              yahooFinance.quote(symbol.toUpperCase()),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Quote timeout')), config.timeout)
              )
            ])
            return result
          },
          `quote(${symbol})`
        )
      } catch (error) {
        console.error(`Quote error for ${symbol}:`, error.message)
        if (error.message.includes('<!doctype') || error.message.includes('HTML')) {
          throw new Error(`Yahoo Finance returned HTML instead of JSON. Service may be unavailable.`)
        }
        throw error
      }
    },

    search: async (query, options = {}) => {
      try {
        return await withRetry(
          async () => {
            const result = await Promise.race([
              yahooFinance.search(query, options),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Search timeout')), config.timeout)
              )
            ])
            return result
          },
          `search(${query})`
        )
      } catch (error) {
        console.error(`Search error for ${query}:`, error.message)
        if (error.message.includes('<!doctype') || error.message.includes('HTML')) {
          return { quotes: [], news: [] }
        }
        throw error
      }
    },

    chart: async (symbol, options = {}) => {
      try {
        const queryOptions = {
          period1: options.period1 || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          period2: options.period2 || new Date(),
          interval: options.interval || '1d'
        }

        return await withRetry(
          async () => {
            const result = await Promise.race([
              yahooFinance.chart(symbol.toUpperCase(), queryOptions),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Chart timeout')), config.timeout)
              )
            ])
            return result
          },
          `chart(${symbol})`
        )
      } catch (error) {
        console.error(`Chart error for ${symbol}:`, error.message)
        if (error.message.includes('<!doctype') || error.message.includes('HTML')) {
          return { quotes: [] }
        }
        throw error
      }
    },

    quoteSummary: async (symbol, options = {}) => {
      try {
        return await withRetry(
          async () => {
            const result = await Promise.race([
              yahooFinance.quoteSummary(symbol.toUpperCase(), options),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('QuoteSummary timeout')), config.timeout)
              )
            ])
            return result
          },
          `quoteSummary(${symbol})`
        )
      } catch (error) {
        console.error(`QuoteSummary error for ${symbol}:`, error.message)
        if (error.message.includes('<!doctype') || error.message.includes('HTML')) {
          return {}
        }
        throw error
      }
    }
  }
}

module.exports = createYahooFinanceClient
