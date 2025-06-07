import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Bar, Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend } from 'chart.js';
import { ClipLoader } from 'react-spinners';
import './App.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend);

function App() {
  const [stocks, setStocks] = useState({});
  const [correlations, setCorrelations] = useState({});
  const [ticker, setTicker] = useState('');
  const [aliases, setAliases] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCorrelations, setShowCorrelations] = useState(false);

  const fetchHype = async (retries = 3, delay = 2000) => {
    setLoading(true);
    for (let i = 0; i < retries; i++) {
      try {
        const res = await axios.get('http://localhost:3000/hype', { timeout: 60000 });
        console.log('Hype response:', res.data);
        setStocks(res.data);
        setError('');
        setLoading(false);
        return;
      } catch (error) {
        console.error(`Hype fetch attempt ${i + 1} failed:`, error);
        if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    setError('Failed to load stocks after retries. Check server.');
    setLoading(false);
  };

  const fetchCorrelations = async () => {
    try {
      const res = await axios.get('http://localhost:3000/correlations', { timeout: 30000 });
      setCorrelations(res.data);
    } catch (error) {
      console.error('Failed to fetch correlations:', error);
    }
  };

  useEffect(() => {
    fetchHype();
    fetchCorrelations();
  }, []);

  const addStock = async () => {
    if (!ticker.match(/^\$[A-Z]{1,5}$/)) {
      setMessage('Invalid ticker. Use $ followed by 1-5 uppercase letters (e.g., $BB).');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post('http://localhost:3000/add-stock', {
        ticker,
        aliases: aliases.split(',').map(a => a.trim()).filter(a => a)
      }, { timeout: 60000 });
      setMessage(res.data.message);
      await fetchHype();
      await fetchCorrelations();
      setTicker('');
      setAliases('');
      setLoading(false);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Error adding stock');
      console.error('Add stock error:', error);
      setLoading(false);
    }
  };

  const getSentimentChartData = (sentiment) => ({
    labels: ['Reddit', 'News', 'Historical'],
    datasets: [{
      label: 'Sentiment Score',
      data: [sentiment.reddit, sentiment.news, sentiment.historical],
      backgroundColor: ['#FF6384', '#36A2EB', '#4BC0C0'],
      borderColor: ['#FF6384', '#36A2EB', '#4BC0C0'],
      borderWidth: 1
    }]
  });

  const getPriceChartData = (priceData, ticker) => {
    if (!priceData || priceData.length === 0) return null;
    
    return {
      labels: priceData.map(d => d.date),
      datasets: [{
        label: `${ticker} Price`,
        data: priceData.map(d => d.price),
        borderColor: '#FF6384',
        backgroundColor: 'rgba(255, 99, 132, 0.1)',
        fill: true,
        tension: 0.1
      }]
    };
  };

  const getAnalyticsChartData = (analytics, priceData) => {
    if (!analytics || !priceData || priceData.length === 0) return null;
    
    const datasets = [{
      label: 'Price',
      data: priceData.map(d => d.price),
      borderColor: '#FF6384',
      backgroundColor: 'rgba(255, 99, 132, 0.1)',
      yAxisID: 'y'
    }];

    if (analytics.sma20) {
      datasets.push({
        label: 'SMA 20',
        data: Array(priceData.length).fill(analytics.sma20),
        borderColor: '#36A2EB',
        backgroundColor: 'transparent',
        borderDash: [5, 5],
        yAxisID: 'y'
      });
    }

    if (analytics.sma50) {
      datasets.push({
        label: 'SMA 50',
        data: Array(priceData.length).fill(analytics.sma50),
        borderColor: '#4BC0C0',
        backgroundColor: 'transparent',
        borderDash: [10, 5],
        yAxisID: 'y'
      });
    }

    if (analytics.bollingerBands) {
      datasets.push(
        {
          label: 'Bollinger Upper',
          data: Array(priceData.length).fill(analytics.bollingerBands.upper),
          borderColor: '#FFCE56',
          backgroundColor: 'transparent',
          borderDash: [3, 3],
          yAxisID: 'y'
        },
        {
          label: 'Bollinger Lower',
          data: Array(priceData.length).fill(analytics.bollingerBands.lower),
          borderColor: '#FFCE56',
          backgroundColor: 'transparent',
          borderDash: [3, 3],
          yAxisID: 'y'
        }
      );
    }

    return {
      labels: priceData.map(d => d.date),
      datasets
    };
  };

  const formatAnalytics = (analytics) => {
    if (!analytics) return {};
    
    return {
      'SMA 20': analytics.sma20 ? `$${analytics.sma20.toFixed(2)}` : 'N/A',
      'SMA 50': analytics.sma50 ? `$${analytics.sma50.toFixed(2)}` : 'N/A',
      'Volatility': analytics.volatility ? `${(analytics.volatility * 100).toFixed(2)}%` : 'N/A',
      'RSI': analytics.rsi ? analytics.rsi.toFixed(2) : 'N/A',
      'Bollinger Bands': analytics.bollingerBands ? 
        `Upper: $${analytics.bollingerBands.upper.toFixed(2)}, Lower: $${analytics.bollingerBands.lower.toFixed(2)}` : 'N/A'
    };
  };

  const getCorrelationColor = (correlation) => {
    if (correlation === null) return '#ccc';
    if (correlation > 0.7) return '#28a745';
    if (correlation > 0.3) return '#ffc107';
    if (correlation > -0.3) return '#6c757d';
    if (correlation > -0.7) return '#fd7e14';
    return '#dc3545';
  };

  return (
    <div className="App">
      <h1>Stock Sentiment Tracker with Advanced Analytics</h1>
      
      <div className="add-stock">
        <h2>Add Stock</h2>
        <input
          type="text"
          placeholder="$AAPL"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
        />
        <input
          type="text"
          placeholder="Apple,AAPL Inc"
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
        />
        <button onClick={addStock} disabled={loading}>Add Stock</button>
        {message && <p className={message.includes('Error') ? 'error' : 'success'}>{message}</p>}
      </div>

      <div className="controls">
        <button 
          onClick={() => setShowCorrelations(!showCorrelations)}
          className="toggle-btn"
        >
          {showCorrelations ? 'Hide' : 'Show'} Correlations
        </button>
      </div>

      {showCorrelations && Object.keys(correlations).length > 0 && (
        <div className="correlations-section">
          <h2>Stock Correlations</h2>
          <div className="correlations-grid">
            {Object.entries(correlations).map(([pair, correlation]) => (
              <div 
                key={pair} 
                className="correlation-item"
                style={{ backgroundColor: getCorrelationColor(correlation) }}
              >
                <strong>{pair}</strong>
                <span>{correlation !== null ? correlation.toFixed(3) : 'N/A'}</span>
              </div>
            ))}
          </div>
          <div className="correlation-legend">
            <span><div className="legend-color" style={{backgroundColor: '#28a745'}}></div> Strong Positive (&gt;0.7)</span>
            <span><div className="legend-color" style={{backgroundColor: '#ffc107'}}></div> Moderate Positive (0.3-0.7)</span>
            <span><div className="legend-color" style={{backgroundColor: '#6c757d'}}></div> Weak (-0.3-0.3)</span>
            <span><div className="legend-color" style={{backgroundColor: '#fd7e14'}}></div> Moderate Negative (-0.7--0.3)</span>
            <span><div className="legend-color" style={{backgroundColor: '#dc3545'}}></div> Strong Negative (&lt;-0.7)</span>
          </div>
        </div>
      )}

      <div className="stocks">
        <h2>Stock Predictions & Analytics</h2>
        {loading && (
          <div className="loading">
            <ClipLoader color="#007bff" size={50} />
            <p>Loading stocks...</p>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        {!loading && !error && Object.keys(stocks).length === 0 ? (
          <p>No stocks added yet.</p>
        ) : (
          Object.entries(stocks).map(([ticker, data]) => (
            <div key={ticker} className="stock-card">
              <div className="stock-header">
                <h3>{ticker}</h3>
                <div className="price-info">
                  {data.currentPrice && (
                    <>
                      <span className="current-price">${data.currentPrice}</span>
                      <span className={`price-change ${parseFloat(data.priceChange) >= 0 ? 'positive' : 'negative'}`}>
                        {parseFloat(data.priceChange) >= 0 ? '+' : ''}{data.priceChange}%
                      </span>
                    </>
                  )}
                </div>
              </div>
              
              <div className="prediction-section">
                <p><strong>Prediction:</strong> 
                  <span className={`prediction ${data.prediction.toLowerCase()}`}>
                    {data.prediction}
                  </span>
                </p>
                <p><strong>Reddit Posts:</strong> {data.postCount}</p>
              </div>

              <div className="charts-container">
                <div className="chart-section">
                  <h4>Sentiment Analysis</h4>
                  <div className="chart-wrapper">
                    <Bar
                      data={getSentimentChartData(data.sentiment)}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { display: false },
                          title: { display: true, text: 'Sentiment Scores' }
                        },
                        scales: {
                          y: { beginAtZero: true, max: 5, min: -5, title: { display: true, text: 'Score' } }
                        }
                      }}
                    />
                  </div>
                </div>

                {data.priceData && data.priceData.length > 0 && (
                  <div className="chart-section">
                    <h4>Price Chart (30 Days)</h4>
                    <div className="chart-wrapper">
                      <Line
                        data={getPriceChartData(data.priceData, ticker)}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: {
                            legend: { display: true },
                            title: { display: true, text: `${ticker} Price Trend` }
                          },
                          scales: {
                            y: { 
                              beginAtZero: false, 
                              title: { display: true, text: 'Price ($)' } 
                            },
                            x: {
                              title: { display: true, text: 'Date' }
                            }
                          }
                        }}
                      />
                    </div>
                  </div>
                )}

                {data.analytics && getAnalyticsChartData(data.analytics, data.priceData) && (
                  <div className="chart-section">
                    <h4>Technical Analysis</h4>
                    <div className="chart-wrapper">
                      <Line
                        data={getAnalyticsChartData(data.analytics, data.priceData)}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: {
                            legend: { display: true },
                            title: { display: true, text: 'Price with Technical Indicators' }
                          },
                          scales: {
                            y: { 
                              beginAtZero: false, 
                              title: { display: true, text: 'Price ($)' } 
                            }
                          }
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="analytics-section">
                <h4>Advanced Analytics</h4>
                <div className="analytics-grid">
                  {Object.entries(formatAnalytics(data.analytics)).map(([key, value]) => (
                    <div key={key} className="analytics-item">
                      <strong>{key}:</strong> <span>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="sentiment-details">
                <h4>Sentiment Details</h4>
                <ul>
                  <li className={data.sourceAvailable.reddit ? '' : 'unavailable'}>
                    Reddit: {data.sentiment.reddit.toFixed(2)} {data.sourceAvailable.reddit ? '' : '(Unavailable)'}
                  </li>
                  <li className={data.sourceAvailable.news ? '' : 'unavailable'}>
                    News: {data.sentiment.news.toFixed(2)} {data.sourceAvailable.news ? '' : '(Unavailable)'}
                  </li>
                  <li className={data.sourceAvailable.historical ? '' : 'unavailable'}>
                    Historical: {data.sentiment.historical.toFixed(2)} {data.sourceAvailable.historical ? '' : '(Unavailable)'}
                  </li>
                </ul>
              </div>

              <div className="posts-section">
                <h4>Top Reddit Posts</h4>
                {data.topPosts.length ? (
                  <ul className="posts-list">
                    {data.topPosts.map((post, i) => (
                      <li key={i} className="post-item">
                        <strong>{post.title}</strong>
                        <div className="post-meta">
                          <span>r/{post.subreddit}</span>
                          <span className={`sentiment-score ${post.sentiment >= 0 ? 'positive' : 'negative'}`}>
                            Sentiment: {post.sentiment.toFixed(1)}
                          </span>
                        </div>
                        {post.textPreview && (
                          <p className="post-preview">{post.textPreview}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No posts found.</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default App;
