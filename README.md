# 📊 Stock Sentiment Tracker

A full-stack sentiment analytics dashboard for retail traders and finance nerds. Pulls real-time sentiment from Reddit, financial news sources, and price history to predict short-term price movement — with added market indicators like SMA, RSI, Bollinger Bands, and volatility.

Built with React, Node.js, and Chart.js — designed for clarity, performance, and a bit of flair.

---

##  Overview

The Stock Sentiment Tracker helps users:

- Analyze Reddit and News sentiment around any stock
- View simplified bullish/bearish predictions
- Visualize sentiment-driving Reddit posts
- Track price charts and trend shifts
- See technical indicators like RSI, volatility, and Bollinger Bands

It blends social data with price analytics to decode how markets "feel" — and where they might go next.

---

##  Key Features

###  Custom Stock Support
- Add tickers like `$NVDA`, `$TSLA`, or `$GME` with optional aliases
- Smart validation and deduplication

### Live Sentiment Scraping
- Pulls Reddit posts from top finance subs (`wallstreetbets`, `stocks`, etc.)
- Uses NewsAPI for headline sentiment
- Filters noise (e.g. “AMC theatre” ≠ $AMC stock)
- Sentiment scored with AFINN-based NLP (from -5 to +5)

### Predictive Model
- Combines sentiment + 7-day price trend:
  - Reddit (30%)
  - News (60%)
  - Historical movement (10%)
- Outputs simple prediction: `Uptick`, `Neutral`, or `Downtick`

### Technical Indicators
Each stock comes with:
- **SMA 20 & SMA 50** (Simple Moving Averages)
- **RSI** (Relative Strength Index)
- **Bollinger Bands**
- **Annualized Volatility** based on daily return variance

### Visual Dashboards
- **Sentiment breakdown** with bar charts
- **30-day price trends** with smoothing
- **Overlayed indicators** on price graphs
- Top Reddit posts with subreddit, preview, and sentiment

---
## Watch a demonstration here:

https://youtu.be/Dkybpi6WYDc

## Tech Stack

| Layer        | Tech                                             |
|--------------|--------------------------------------------------|
| Frontend     | React, Chart.js, Axios, custom CSS               |
| Backend      | Node.js, Express, Snoowrap, Puppeteer            |
| Data Sources | Reddit API, NewsAPI, Yahoo Finance               |
| NLP          | `sentiment` (AFINN-based scoring)                |
| Caching      | `node-cache` (5–10 min TTL)                      |

---


## Local Setup

1. **Clone the repo**
```bash
git clone https://github.com/yourusername/stock-sentiment-tracker
cd stock-sentiment-tracker
