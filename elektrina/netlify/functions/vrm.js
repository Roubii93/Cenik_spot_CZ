exports.handler = async (event) => {
  const VRM_TOKEN = '9bc3c843b6a71206c602a7dafff09cc2369625dde2250626fccfcf6c23b3f1e0';
  const path   = event.queryStringParameters?.path || '';
  const url    = `https://vrmapi.victronenergy.com/v2${path}`;
  const method = event.httpMethod || 'GET';

  try {
    const controller = new AbortController();
    // Netlify free tier timeout is ~10s — abort after 8s to return gracefully
    const timer = setTimeout(() => controller.abort(), 8000);

    const options = {
      method,
      signal: controller.signal,
      headers: {
        'X-Authorization': `Token ${VRM_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };
    if (method === 'POST' && event.body) options.body = event.body;

    const response = await fetch(url, options);
    clearTimeout(timer);
    const data = await response.json();

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (e) {
    // Timeout or network error — return empty success so app doesn't crash
    const isTimeout = e.name === 'AbortError';
    return {
      statusCode: isTimeout ? 504 : 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: isTimeout ? 'VRM API timeout' : e.message,
        records: [] // empty fallback so app handles it gracefully
      })
    };
  }
};
