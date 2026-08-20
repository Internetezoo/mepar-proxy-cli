import { SocksProxyAgent } from 'socks-proxy-agent';

export default async function handler(req, res) {
  // 1. SOCKS5 Proxy beállítása (a korábban tesztelt adatokkal)
  const proxyUrl = 'socks5://89.132.170.211:4145';
  const agent = new SocksProxyAgent(proxyUrl);

  // 2. A WMTS URL és paraméterek összeállítása
  const baseUrl = "https://mepar.mvh.allamkincstar.gov.hu/api/proxy/iier-gs/gwc/service/wmts";
  const params = new URLSearchParams({
    "viewparams": "VONEV:null;IGDAT:null",
    "SRS": "EPSG:23700",
    "layer": "iier:topo10",
    "style": "raster",
    "tilematrixset": "EOV_teszt",
    "Service": "WMTS",
    "Request": "GetTile",
    "Version": "1.0.0",
    "Format": "image/png",
    "TileMatrix": "EOV_teszt:4",
    "TileCol": "4",
    "TileRow": "7",
  });

  const targetUrl = `${baseUrl}?${params.toString()}`;

  // 3. HTTP Fejlécek (headers)
  const headers = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "priority": "u=1, i",
    "referer": "https://mepar.mvh.allamkincstar.gov.hu/",
    "sec-ch-ua": '"Not=A?Brand";v="99", "Google Chrome";v="151", "Chromium";v="151"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
    "x-csrf-token": "q0Xe3BsWW9PkT8qMRqJxmpBor35L8gv0",
    // Cookie-k összefűzve stringként a Node.js fetch számára
    "cookie": [
      "ACCESS_TOKEN=eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJBQ0NFU1NfVE9LRU4iLCJ1c2VySWQiOjE1Njc3NTc5LCJlbWFpbCI6ImludGVybmV0ZXpvb0BnbWFpbC5jb20iLCJmYWNlYm9va0lkIjowLCJtdmhDb2RlIjoiIiwiZXhwIjoxNzg3MjM5MTE5fQ.S78VD4GtSRAGsQo-HCCXprkuWCpYu7cIFrjOXT9CKptfnFHTUF-2mkAz-XZ2TQA0n6DHup9z1XyF07Llul61rwx8zGWg5Q5xxYREl6J1iawbrORbOv91qHBl0DCjhW6FIJS5LWtsDu-BlggGk4VaXtVYmJaCanahPROWkYvT1Exmh4hl62zyKi0gfFnlb3lEIngDGYax4NMtr6IzdlaCt1GtXzruh4ValG2uim00ZdaxxIVgNspA6JwU9glxgwhusX3n18WQZuO4tDcmnaagFF56meG7fs9va0O1HbvVo-P13jz0w2S7mz_li-uWn1NxYGm_iiP9Ar-gFqwD2VZOWw",
      "REFRESH_TOKEN=eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJSRUZSRVNIX1RPS0VOIiwidXNlcklkIjoxNTY3NzU3OSwiZXhwIjoxODAyNzkxMTE5fQ.G7kumKDl4ctHcBCJcpnHN_Lt6c0OIpHvGfzwKywEtFciLSmsTwXJPgyj46jvUUqDMQOQ9M94q0rWTh1-qfasb_h6bjek_VVaXUnnM7sSeBNcZNPg6DejaWv9_RkoXnzBpOjsMoNhiOBHX2-N65PgOEqTOteVs_HZ0CJ5ziMi_vQJyZ31NhS2GGZgd8j_JZSk_2uPfBTGG_dud8tPrASw1bVZnyCryA3sW6Do1cdfmLBBCLujqsiGluWvGJ-RQbtq7Np1PvicOWizKLdePtliVbkfS4OsTtA0Lum2CF4erqbGQFlKLPjkCxlG33eLzq1nrj2x0ziaQH10eGNJyQLRLg",
      "CSRF_TOKEN=q0Xe3BsWW9PkT8qMRqJxmpBor35L8gv0"
    ].join('; ')
  };

  try {
    // 4. Kérés indítása a Vercelből a SOCKS5 proxyn keresztül
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: headers,
      // @ts-ignore
      agent: agent,
      signal: AbortSignal.timeout(15000) // 15 másodperc timeout
    });

    const contentType = response.headers.get('content-type') || '';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Ha képet kaptunk vissza (200 OK és png/image)
    if (response.status === 200 && contentType.includes('image')) {
      res.setHeader('Content-Type', contentType);
      return res.status(200).send(buffer);
    } else {
      // Ha hiba vagy JSON üzenet jött
      const text = buffer.toString('utf8');
      return res.status(response.status).json({
        success: false,
        status: response.status,
        contentType: contentType,
        responseSnippet: text.substring(0, 300)
      });
    }

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      cause: error.cause ? error.cause.message : 'Ismeretlen ok'
    });
  }
}
