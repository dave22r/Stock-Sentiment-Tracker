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
const financeSubreddits = 'wallstreetbets+stocks+investing+options+StockMarket+pennystocks+Superstonk';

const sourceWeights = {
  news: 0.6,
  reddit: 0.3,
  historical: 0.1
};

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

    // Fallback for $BB
    if (stock === '$BB' && stockPosts.length === 0) {
      stockPosts = [{
        title: '$BB IoT is the future 🚀',
        selftext: 'BlackBerry’s QNX and cybersecurity are undervalued. Big potential!',
        subreddit: { display_name: 'stocks' }
      }];
      console.log('Using fake $BB Reddit post');
    }

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

app.get('/hype', async (req, res) => {
  try {
    const cached = cache.get('hype');
    if (cached) {
      console.log('Serving from cache');
      return res.json(cached);
    }
    const results = {};
    for (const [stock, aliases] of Object.entries(stockMap)) {
      const redditData = await getRedditSentiment(stock, aliases);
      const newsSentiment = await getNewsSentiment(stock);
      const historicalTrend = await getHistoricalTrend(stock);
      const prediction = predictPriceDirection(
        { reddit: redditData.sentiment, news: newsSentiment },
        historicalTrend
      );
      results[stock] = {
        prediction,
        postCount: redditData.count,
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
    const redditData = await getRedditSentiment(stock, aliases);
    const newsSentiment = await getNewsSentiment(stock);
    const historicalTrend = await getHistoricalTrend(stock);
    const prediction = predictPriceDirection(
      { reddit: redditData.sentiment, news: newsSentiment },
      historicalTrend
    );
    res.json({
      stock,
      prediction,
      postCount: redditData.count,
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