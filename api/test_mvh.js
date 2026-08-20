import { SocksProxyAgent } from 'socks-proxy-agent';
import math from 'node:math'; // vagy egyszerűen kiszámoljuk a koordinátát

// EPSG:4326 -> EPSG:23700 konverzió képlete (egyszerűsített csempe számítás)
function getTileBounds(z, x, y) {
  const n = Math.pow(2.0, z);
  const lonDeg = (x / n) * 360.0 - 180.0;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
  const latDeg = (latRad * 180.0) / Math.PI;
  return { lat: latDeg, lon: lonDeg };
}

// Egyszerűsített GPS -> EOV közelítés (vagy helyettesíthető a saját transzformációddal)
// Mivel JS-ben a pyproj-nak nincs közvetlen párja, itt a BBOX-hoz behelyettesítjük a fix teszt EOV koordinátákat.
async function testSocksProxy() {
  console.log("MEPAR teszt SOCKS5 proxy-n keresztül (JavaScript)...");
  console.log("Proxy: 89.132.170.211:4145");

  // Példa BBOX (Budapest környéke EOV-ban)
  const eovMinX = 645000;
  const eovMinY = 230000;
  const eovMaxX = 650000;
  const eovMaxY = 235000;
  const bboxReal = `${eovMinX},${eovMinY},${eovMaxX},${eovMaxY}`;

  const url = `https://mepar.mvh.allamkincstar.gov.hu/arcgis/services/mepar/mepar_f_2023/MapServer/WMSServer?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&BBOX=${bboxReal}&SRS=EPSG:23700&WIDTH=256&HEIGHT=256&LAYERS=0&STYLES=&FORMAT=image/png&TRANSPARENT=TRUE`;

  // SOCKS5 Proxy Agent létrehozása
  const proxyUrl = 'socks5://89.132.170.211:4145';
  const agent = new SocksProxyAgent(proxyUrl);

  const headers = {
    "Referer": "https://mepar.mvh.allamkincstar.gov.hu/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
  };

  try {
    console.log("Kapcsolódás a proxy-n keresztül...");
    
    // A fetch-nek átadjuk a dispatcher / agent paramétert (Node.js 18+ környezetben az agent dispatcher-ként is működhet, vagy socks-proxy-agent-hez passzoló módon)
    const response = await fetch(url, {
      method: 'GET',
      headers: headers,
      // @ts-ignore
      agent: agent, // Node.js fetch natív agent támogatásához (vagy undici dispatcher)
      signal: AbortSignal.timeout(15000)
    });

    console.log(`HTTP Státusz: ${response.status}`);
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log(`Válasz mérete: ${buffer.length} bájt`);

    if (response.status === 200 && buffer.length > 500) {
      const fs = await import('node:fs');
      fs.writeFileSync('mepar_js_proxy_siker.png', buffer);
      console.log("Siker! A csempe elmentve: mepar_js_proxy_siker.png");
    } else {
      console.log("A szerver válaszolt, de nem kép érkezett:", buffer.toString('utf8').substring(0, 200));
    }

  } catch (error) {
    console.error("Hiba történt a SOCKS5 proxy használata közben:", error.message);
  }
}

testSocksProxy();
