import { SocksProxyAgent } from 'socks-proxy-agent';

export default async function handler(req, res) {
  const proxyUrl = 'socks5://89.132.170.211:4145';
  const agent = new SocksProxyAgent(proxyUrl);

  const testUrl = 'https://api.ipify.org?format=json';

  try {
    const startTime = Date.now();
    
    // Megpróbáljuk lekérni az IP-t a SOCKS5 proxin keresztül a Vercelbõl
    const response = await fetch(testUrl, {
      method: 'GET',
      // @ts-ignore
      agent: agent,
      signal: AbortSignal.timeout(8000) // 8 másodperc timeout
    });

    const data = await response.json();
    const duration = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      message: "A Vercel kimenő SOCKS5 kapcsolat SIKERES!",
      proxyIpUsed: data.ip,
      responseTimeMs: duration
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "A Vercel BLOKkolta vagy időtúllépésbe futott a SOCKS5 kapcsolat!",
      error: error.message,
      cause: error.cause ? error.cause.message : 'Ismeretlen ok'
    });
  }
}
