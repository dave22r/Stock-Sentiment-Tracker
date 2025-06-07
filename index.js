const express = require('express');
const cors = require('cors');
const Snoowrap = require('snoowrap');
const Sentiment = require('sentiment');
const axios = require('axios');
const yahooFinance = require('yahoo-finance2').default;
const NodeCache = require('node-cache');
const puppeteer = require('puppeteer-extra');

const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const app = express();

app.use(cors());
app.use(express.json());

const cache = new NodeCache({ stdTTL: 300 }); // Cache for 5 minutes
const priceCache = new NodeCache({ stdTTL: 600 }); // Cache prices for 10 minutes


const r = new Snoowrap({
    userAgent: '[redacted]',
    clientId: '[redacted]',
    clientSecret: '[redacted]',
    username: '[redacted]',
    password: '[redacted]'
  });

const NEWS_API_KEY = '[redacted]'; // Get from newsapi.org
let stockMap = {
  '$TSLA': ['TSLA', 'Tesla'],
  '$GME': ['GME', 'GameStop'],
  '$AMC': ['AMC', 'AMC Entertainment'],
  '$NVDA': ['NVDA', 'Nvidia'],
  '$SPY': ['SPY', 'S&P 500'],
  '$BB': ['BB', 'BlackBerry']
};

const excludeKeywords = ['theater', 'movie', 'cinema', 'amc 10', 'amc 12', 'satellite', 'tv', 'aops', 'employee', 'ape', 'BBY', 'Best Buy'];
const financeSubreddits = 'wallstreetbets+stocks+investing+options+StockMarket+pennystocks+Superstonk+Trading';

const sourceWeights = {
  news: 0.6,
  reddit: 0.3,
  historical: 0.1
};

// Advanced Analytics Functions
function calculateMovingAverage(prices, period) {
  if (prices.length < period) return null;
  const sum = prices.slice(-period).reduce((acc, price) => acc + price.close, 0);
  return sum / period;
}

function calculateVolatility(prices, period = 20) {
  if (prices.length < period) return null;
  
  const recentPrices = prices.slice(-period);
  const returns = [];
  
  for (let i = 1; i < recentPrices.length; i++) {
    const returnRate = (recentPrices[i].close - recentPrices[i-1].close) / recentPrices[i-1].close;
    returns.push(returnRate);
  }
  
  const meanReturn = returns.reduce((acc, ret) => acc + ret, 0) / returns.length;
  const variance = returns.reduce((acc, ret) => acc + Math.pow(ret - meanReturn, 2), 0) / returns.length;
  
  return Math.sqrt(variance) * Math.sqrt(252); // Annualized volatility
}

function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const change = prices[prices.length - i].close - prices[prices.length - i - 1].close;
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateBollingerBands(prices, period = 20, stdDev = 2) {
  if (prices.length < period) return null;
  
  const ma = calculateMovingAverage(prices, period);
  const recentPrices = prices.slice(-period);
  
  const variance = recentPrices.reduce((acc, price) => {
    return acc + Math.pow(price.close - ma, 2);
  }, 0) / period;
  
  const standardDeviation = Math.sqrt(variance);
  
  return {
    upper: ma + (standardDeviation * stdDev),
    middle: ma,
    lower: ma - (standardDeviation * stdDev)
  };
}

async function calculateCorrelation(ticker1, ticker2, period = 30) {
  try {
    const endDate = new Date();
    const startDate = new Date(endDate - period * 24 * 60 * 60 * 1000);
    
    const [prices1, prices2] = await Promise.all([
      yahooFinance.historical(ticker1, { period1: startDate, period2: endDate, interval: '1d' }),
      yahooFinance.historical(ticker2, { period1: startDate, period2: endDate, interval: '1d' })
    ]);
    
    const minLength = Math.min(prices1.length, prices2.length);
    if (minLength < 10) return null;
    
    const returns1 = [];
    const returns2 = [];
    
    for (let i = 1; i < minLength; i++) {
      returns1.push((prices1[i].close - prices1[i-1].close) / prices1[i-1].close);
      returns2.push((prices2[i].close - prices2[i-1].close) / prices2[i-1].close);
    }
    
    const mean1 = returns1.reduce((acc, ret) => acc + ret, 0) / returns1.length;
    const mean2 = returns2.reduce((acc, ret) => acc + ret, 0) / returns2.length;
    
    let numerator = 0;
    let sumSq1 = 0;
    let sumSq2 = 0;
    
    for (let i = 0; i < returns1.length; i++) {
      const diff1 = returns1[i] - mean1;
      const diff2 = returns2[i] - mean2;
      numerator += diff1 * diff2;
      sumSq1 += diff1 * diff1;
      sumSq2 += diff2 * diff2;
    }
    
    const denominator = Math.sqrt(sumSq1 * sumSq2);
    return denominator === 0 ? 0 : numerator / denominator;
    
  } catch (error) {
    console.error(`Correlation calculation error for ${ticker1}-${ticker2}:`, error.message);
    return null;
  }
}

app.post('/add-stock', (req, res) => {
  try {
    const { ticker, aliases = [] } = req.body;
    if (!ticker || !/^\$[A-Z]{1,5}$/.test(ticker)) {
      console.error('Invalid ticker:', ticker);
      return res.status(400).json({ error: 'Invalid ticker. Use $ followed by 1-5 uppercase letters (e.g., $BB).' });
    }
    if (stockMap[ticker]) {
      console.error('Ticker already exists:', ticker);
      return res.status(400).json({ error: `Ticker ${ticker} already exists.` });
    }
    const cleanAliases = aliases.filter(alias => typeof alias === 'string' && alias.trim() && !alias.match(/[^A-Za-z\s]/));
    stockMap[ticker] = [ticker.replace('$', ''), ...cleanAliases];
    console.log(`Added ${ticker}:`, stockMap[ticker]);
    cache.del('hype');
    priceCache.flushAll(); // Clear price cache when stocks change
    res.json({ message: `Added ${ticker} successfully.`, stockMap: stockMap[ticker] });
  } catch (error) {
    console.error('Error in /add-stock:', error.message);
    res.status(500).json({ error: 'Server error adding stock', details: error.message });
  }
});

async function getRedditSentiment(stock, aliases) {
  try {
    const posts = await r.getSubreddit(financeSubreddits).getNew({ limit: 500 });
    let stockPosts = posts.filter(p => {
      const text = (p.title + ' ' + (p.selftext || '')).toLowerCase();
      const title = p.title.toLowerCase();
      const hasStock = [stock, ...aliases].some(alias => {
        const aliasLower = alias.toLowerCase();
        return title.includes(aliasLower) || text.includes(aliasLower);
      });
      const hasExclude = stock === '$BB' ? false : excludeKeywords.some(keyword => text.includes(keyword.toLowerCase()));
      const isValidSub = !p.subreddit.display_name.startsWith('u_');
      return hasStock && !hasExclude && isValidSub;
    });

    console.log(`Reddit posts for ${stock}: ${stockPosts.length}`, stockPosts.map(p => p.title));

    if (stockPosts.length < 3 && ['$AMC', '$GME', '$BB'].includes(stock)) {
      const query = stock === '$BB' ? '$BB OR blackberry stock' : `${stock} stock`;
      const searchPosts = await r.search({
        query,
        sort: 'new',
        time: 'week',
        limit: 100,
        subreddit: financeSubreddits
      });
      stockPosts = [...stockPosts, ...searchPosts.filter(p => {
        const text = (p.title + ' ' + (p.selftext || '')).toLowerCase();
        const title = p.title.toLowerCase();
        const hasStock = [stock, ...aliases].some(alias => {
          const aliasLower = alias.toLowerCase();
          return title.includes(aliasLower) || text.includes(aliasLower);
        });
        const hasExclude = stock === '$BB' ? false : excludeKeywords.some(keyword => text.includes(keyword.toLowerCase()));
        const isValidSub = !p.subreddit.display_name.startsWith('u_');
        return hasStock && !hasExclude && isValidSub;
      })];
    }

    // Removed fake $BB posts - let it return empty if no posts found

    const sentiment = new Sentiment();
    const scores = stockPosts.map(p => {
      const score = sentiment.analyze(p.title + ' ' + (p.selftext || '')).score;
      return Math.max(-5, Math.min(5, score));
    });

    return {
      sentiment: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
      count: stockPosts.length,
      posts: stockPosts.slice(0, 3).map(p => ({
        title: p.title,
        subreddit: p.subreddit.display_name,
        sentiment: Math.max(-5, Math.min(5, sentiment.analyze(p.title + ' ' + (p.selftext || '')).score)),
        textPreview: (p.selftext || '').slice(0, 100) + (p.selftext && p.selftext.length > 100 ? '...' : '')
      }))
    };
  } catch (error) {
    console.error(`Reddit error for ${stock}:`, error.message);
    return { sentiment: 0, count: 0, posts: [] };
  }
}

async function getNewsSentiment(ticker) {
  try {
    const response = await axios.get(`https://newsapi.org/v2/everything`, {
      params: {
        q: `${ticker.replace('$', '')} stock`,
        apiKey: NEWS_API_KEY,
        language: 'en',
        sortBy: 'relevancy',
        from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        pageSize: 20
      }
    });
    const sentiment = new Sentiment();
    const scores = response.data.articles.map(article => {
      const text = (article.title || '') + ' ' + (article.description || '');
      return Math.max(-5, Math.min(5, sentiment.analyze(text).score));
    });
    return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  } catch (error) {
    console.error(`News API error for ${ticker}:`, error.message);
    return 0;
  }
}

async function getStockAnalytics(ticker) {
  const cacheKey = `analytics_${ticker}`;
  const cached = priceCache.get(cacheKey);
  if (cached) return cached;

  try {
    const cleanTicker = ticker.replace('$', '');
    const endDate = new Date();
    const startDate = new Date(endDate - 60 * 24 * 60 * 60 * 1000); // 60 days for better analytics
    
    const prices = await yahooFinance.historical(cleanTicker, {
      period1: startDate,
      period2: endDate,
      interval: '1d'
    });

    if (prices.length < 5) {
      return {
        currentPrice: null,
        priceChange: 0,
        priceData: [],
        analytics: {
          sma20: null,
          sma50: null,
          volatility: null,
          rsi: null,
          bollingerBands: null
        }
      };
    }

    const currentPrice = prices[prices.length - 1].close;
    const previousPrice = prices[prices.length - 2]?.close || prices[0].close;
    const priceChange = ((currentPrice - previousPrice) / previousPrice) * 100;

    // Prepare price data for charts (last 30 days)
    const priceData = prices.slice(-30).map(price => ({
      date: new Date(price.date).toLocaleDateString(),
      price: price.close,
      volume: price.volume
    }));

    const analytics = {
      sma20: calculateMovingAverage(prices, 20),
      sma50: calculateMovingAverage(prices, 50),
      volatility: calculateVolatility(prices),
      rsi: calculateRSI(prices),
      bollingerBands: calculateBollingerBands(prices)
    };

    const result = {
      currentPrice: currentPrice.toFixed(2),
      priceChange: priceChange.toFixed(2),
      priceData,
      analytics
    };

    priceCache.set(cacheKey, result);
    return result;

  } catch (error) {
    console.error(`Analytics error for ${ticker}:`, error.message);
    return {
      currentPrice: null,
      priceChange: 0,
      priceData: [],
      analytics: {
        sma20: null,
        sma50: null,
        volatility: null,
        rsi: null,
        bollingerBands: null
      }
    };
  }
}

async function getHistoricalTrend(ticker) {
  try {
    const endDate = new Date();
    const startDate = new Date(endDate - 7 * 24 * 60 * 60 * 1000);
    const prices = await yahooFinance.historical(ticker.replace('$', ''), {
      period1: startDate,
      period2: endDate,
      interval: '1d'
    });
    if (prices.length < 2) return 0;
    const priceChange = (prices[prices.length - 1].close - prices[0].close) / prices[0].close;
    return Math.max(-5, Math.min(5, priceChange * 100));
  } catch (error) {
    console.error(`Yahoo Finance error for ${ticker}:`, error.message);
    return 0;
  }
}

function predictPriceDirection(sentiment, historical) {
  const score = (
    sentiment.news * sourceWeights.news +
    sentiment.reddit * sourceWeights.reddit +
    historical * sourceWeights.historical
  );
  return score > 1 ? 'Uptick' : score < -1 ? 'Downtick' : 'Neutral';
}

// New endpoint for correlations
app.get('/correlations', async (req, res) => {
  try {
    const cached = cache.get('correlations');
    if (cached) return res.json(cached);

    const tickers = Object.keys(stockMap).map(t => t.replace('$', ''));
    const correlations = {};

    for (let i = 0; i < tickers.length; i++) {
      for (let j = i + 1; j < tickers.length; j++) {
        const correlation = await calculateCorrelation(tickers[i], tickers[j]);
        const key = `${tickers[i]}-${tickers[j]}`;
        correlations[key] = correlation;
      }
    }

    cache.set('correlations', correlations);
    res.json(correlations);
  } catch (error) {
    console.error('Correlations error:', error.message);
    res.status(500).json({ error: 'Failed to calculate correlations' });
  }
});

app.get('/hype', async (req, res) => {
  try {
    const cached = cache.get('hype');
    if (cached) {
      console.log('Serving from cache');
      return res.json(cached);
    }
    const results = {};
    for (const [stock, aliases] of Object.entries(stockMap)) {
      const [redditData, newsSentiment, historicalTrend, stockAnalytics] = await Promise.all([
        getRedditSentiment(stock, aliases),
        getNewsSentiment(stock),
        getHistoricalTrend(stock),
        getStockAnalytics(stock)
      ]);

      const prediction = predictPriceDirection(
        { reddit: redditData.sentiment, news: newsSentiment },
        historicalTrend
      );

      results[stock] = {
        prediction,
        postCount: redditData.count,
        currentPrice: stockAnalytics.currentPrice,
        priceChange: stockAnalytics.priceChange,
        priceData: stockAnalytics.priceData,
        analytics: stockAnalytics.analytics,
        sentiment: {
          reddit: Math.round(redditData.sentiment * 100) / 100,
          news: Math.round(newsSentiment * 100) / 100,
          historical: Math.round(historicalTrend * 100) / 100
        },
        sourceAvailable: {
          reddit: redditData.count > 0,
          news: newsSentiment !== 0,
          historical: historicalTrend !== 0
        },
        topPosts: redditData.posts
      };
    }
    cache.set('hype', results);
    res.json(results);
  } catch (error) {
    console.error(error.message, error.stack);
    res.status(500).json({ error: 'API failed', details: error.message });
  }
});

app.get('/hype/:ticker', async (req, res) => {
  const stock = `$${req.params.ticker.toUpperCase()}`;
  const aliases = stockMap[stock] || [stock.replace('$', '')];
  try {
    const [redditData, newsSentiment, historicalTrend, stockAnalytics] = await Promise.all([
      getRedditSentiment(stock, aliases),
      getNewsSentiment(stock),
      getHistoricalTrend(stock),
      getStockAnalytics(stock)
    ]);

    const prediction = predictPriceDirection(
      { reddit: redditData.sentiment, news: newsSentiment },
      historicalTrend
    );

    res.json({
      stock,
      prediction,
      postCount: redditData.count,
      currentPrice: stockAnalytics.currentPrice,
      priceChange: stockAnalytics.priceChange,
      priceData: stockAnalytics.priceData,
      analytics: stockAnalytics.analytics,
      sentiment: {
        reddit: Math.round(redditData.sentiment * 100) / 100,
        news: Math.round(newsSentiment * 100) / 100,
        historical: Math.round(historicalTrend * 100) / 100
      },
      sourceAvailable: {
        reddit: redditData.count > 0,
        news: newsSentiment !== 0,
        historical: historicalTrend !== 0
      },
      topPosts: redditData.posts
    });
  } catch (error) {
    console.error(error.message, error.stack);
    res.status(500).json({ error: 'API failed', details: error.message });
  }
});

app.get('/', (req, res) => res.send('Stock Sentiment Tracker live, G!'));

app.listen(3000, () => console.log('Running on 3000'));

app.get('/', (req, res) => res.send('Stock Sentiment Tracker live, G!'));

app.listen(3000, () => console.log('Running on 3000'));
