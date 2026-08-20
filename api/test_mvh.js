import dns from 'dns/promises';
import net from 'net';

export default async function handler(req, res) {
  const targetHost = "mepar.mvh.allamkincstar.gov.hu";
  const targetPort = 443;
  const diagnostics = {};

  // 1. DNS Feloldás tesztje
  try {
    const dnsStart = Date.now();
    const lookupResult = await dns.lookup(targetHost);
    diagnostics.dns = {
      success: true,
      resolvedIp: lookupResult.address,
      family: lookupResult.family,
      timeMs: Date.now() - dnsStart
    };
  } catch (dnsError) {
    diagnostics.dns = {
      success: false,
      error: dnsError.message
    };
    return res.status(500).json(diagnostics);
  }

  // 2. TCP Kapcsolat teszt (TCP "Ping" a 443-as portra)
  const tcpStart = Date.now();
  const tcpTest = await new Promise((resolve) => {
    const socket = new net.Socket();
    let isFinished = false;

    // 8 másodperces timeout a TCP kézfogáshoz
    socket.setTimeout(8000);

    socket.on('connect', () => {
      if (isFinished) return;
      isFinished = true;
      const duration = Date.now() - tcpStart;
      socket.destroy();
      resolve({
        success: true,
        message: "A TCP kézfogás (SSL port 443) SIKERES volt!",
        timeMs: duration
      });
    });

    socket.on('timeout', () => {
      if (isFinished) return;
      isFinished = true;
      const duration = Date.now() - tcpStart;
      socket.destroy();
      resolve({
        success: false,
        error: "TCP Timeout (A kapcsolat kicsengett, de a tűzfal/szerver nem válaszolt)",
        code: "ETIMEDOUT",
        timeMs: duration
      });
    });

    socket.on('error', (err) => {
      if (isFinished) return;
      isFinished = true;
      const duration = Date.now() - tcpStart;
      socket.destroy();
      resolve({
        success: false,
        error: err.message,
        code: err.code || "UNKNOWN",
        timeMs: duration
      });
    });

    // Csatlakozás a DNS-ből kapott IP-hez
    socket.connect(targetPort, diagnostics.dns.resolvedIp);
  });

  diagnostics.tcpPing = tcpTest;

  return res.status(200).json(diagnostics);
}
