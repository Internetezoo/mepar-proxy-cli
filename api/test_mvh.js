import dns from 'dns/promises';
import net from 'net';

export default async function handler(req, res) {
  const targetHost = "mepar.mvh.allamkincstar.gov.hu";
  const results = {};

  // 1. Teszt: Külső DNS (Google 8.8.8.8) használata
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
    const customDnsLookup = await dns.lookup(targetHost);
    results.customDns = {
      success: true,
      resolvedIp: customDnsLookup.address,
      family: customDnsLookup.family
    };
  } catch (e) {
    results.customDns = { success: false, error: e.message };
  }

  // 2. Teszt: IPv6 cím keresése és TCP teszt az IPv6 címen
  try {
    const addressesV6 = await dns.resolve6(targetHost);
    results.ipv6 = {
      found: true,
      addresses: addressesV6
    };

    if (addressesV6.length > 0) {
      const ipv6TcpTest = await new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(6000);

        socket.on('connect', () => {
          socket.destroy();
          resolve({ success: true, message: "IPv6 TCP kapcsolat SIKERES a 443-as porton!" });
        });

        socket.on('timeout', () => {
          socket.destroy();
          resolve({ success: false, error: "IPv6 TCP Timeout (ETIMEDOUT)" });
        });

        socket.on('error', (err) => {
          socket.destroy();
          resolve({ success: false, error: err.message, code: err.code });
        });

        // Kapcsolódás az első IPv6 címhez
        socket.connect({ port: 443, host: addressesV6[0], family: 6 });
      });

      results.ipv6TcpTest = ipv6TcpTest;
    }
  } catch (e) {
    results.ipv6 = {
      found: false,
      error: "A szervernek nincs IPv6 címe vagy nem érhető el: " + e.message
    };
  }

  // 3. Teszt: Közvetlen IP alapú fetch (ha a DNS feloldotta)
  if (results.customDns && results.customDns.success) {
    try {
      const startTime = Date.now();
      // Fontos: a Host fejlécet meg kell adni az SNI (SSL tanúsítvány) miatt
      const response = await fetch(`https://${results.customDns.resolvedIp}/`, {
        headers: { "host": targetHost },
        signal: AbortSignal.timeout(6000)
      });
      results.directIpFetch = {
        success: true,
        status: response.status,
        timeMs: Date.now() - startTime
      };
    } catch (e) {
      results.directIpFetch = {
        success: false,
        error: e.message,
        cause: e.cause ? e.cause.message : "Ismeretlen ok"
      };
    }
  }

  return res.status(200).json(results);
}
