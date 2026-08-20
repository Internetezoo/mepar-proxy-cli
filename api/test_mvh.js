import { SocksProxyAgent } from 'socks-proxy-agent';

export default async function handler(req, res) {
  const proxyUrl = 'socks5://89.132.170.211:4145';
  const agent = new SocksProxyAgent(proxyUrl);

  // Olyan címet hívunk, ami visszaadja, hogy milyennek látja a külvilág a proxy-t (IP és ország)
  const testUrl = 'https://ipinfo.io/json';

  try {
    const startTime = Date.now();
    
    const response = await fetch(testUrl, {
      method: 'GET',
      // @ts-ignore
      agent: agent,
      signal: AbortSignal.timeout(10000) // 10 mp timeout
    });

    const data = await response.json();
    const duration = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      message: "A proxy válaszolt!",
      proxyDetails: {
        ip: data.ip,
        city: data.city,
        region: data.region,
        country: data.country, // Itt látszik majd, hogy Magyarország-e (HU)
        org: data.org
      },
      responseTimeMs: duration
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Hiba a proxy hívás közben",
      error: error.message,
      cause: error.cause ? error.cause.message : 'Ismeretlen ok'
    });
  }
}
