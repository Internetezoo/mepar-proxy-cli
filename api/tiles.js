const proj4 = require('proj4');
const { SocksProxyAgent } = require('socks-proxy-agent');
const fetch = require('node-fetch');

proj4.defs("EPSG:23700", "+proj=somerc +lat_0=47.14439372222222 +lon_0=19.04857177777778 +k=0.99993 +x_0=650000 +y_0=200000 +ellps=GRS67 +towgs84=52.17,-71.82,-14.9,0.0,0.0,0.0,0.0 +units=m +no_defs");

const MEPAR_WMS_URL = 'https://mepar.mvh.allamkincstar.gov.hu/api/proxy/iier-gs/wms';
const TARGET_CRS = 'EPSG:23700'; 
const TILE_SIZE = 256;
const MAX_EXTENT = 20037508.342789244; 

// Proxy lista (több proxy lehetőség)
const PROXIES = [
    'socks4://84.2.239.42:4153'
];

function calculateBboxFromTile(matrixId, tileRow, tileCol) {
    try {
        const parts = matrixId.split(':');
        const zoom = parseInt(parts[parts.length - 1]); 
        if (isNaN(zoom)) return null;

        const row = parseInt(tileRow);
        const col = parseInt(tileCol);
        if (isNaN(row) || isNaN(col)) return null;

        const resolution = (2 * MAX_EXTENT) / (TILE_SIZE * Math.pow(2, zoom));
        const minX = -MAX_EXTENT + (col * TILE_SIZE * resolution);
        const maxY = MAX_EXTENT - (row * TILE_SIZE * resolution);
        const maxX = minX + (TILE_SIZE * resolution);
        const minY = maxY - (TILE_SIZE * resolution);

        return {
            BBOX: `${minX},${minY},${maxX},${maxY}`,
            CRS: 'EPSG:3857',
            WIDTH: TILE_SIZE,
            HEIGHT: TILE_SIZE
        };
    } catch (e) {
        return null;
    }
}

// Robusztus Letöltő függvény ECONNRESET kezeléssel
async function fetchWithRetry(targetUrl, headers, proxyUrl = null, retries = 2) {
    const options = { 
        headers,
        timeout: 4000
    };

    if (proxyUrl) {
        options.agent = new SocksProxyAgent(proxyUrl);
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);
            options.signal = controller.signal;

            const res = await fetch(targetUrl, options);
            clearTimeout(timeoutId);

            if (res.ok) return res;
        } catch (err) {
            // Ha ECONNRESET vagy egyéb hálózati megszakadás volt, és van még újrapróbálkozási lehetőség
            if (attempt < retries && (err.code === 'ECONNRESET' || err.name === 'AbortError' || err.code === 'ETIMEDOUT')) {
                await new Promise(r => setTimeout(r, 200)); // 200ms szünet az újrázás előtt
                continue;
            }
            throw err;
        }
    }
    throw new Error('Minden próbálkozás elbukott.');
}

module.exports = async (req, res) => {
    try {
        let { LAYER, FORMAT, BBOX, WIDTH, HEIGHT, REQUEST, SERVICE, CRS, TileMatrix, TileRow, TileCol } = req.query;
        let sourceCRS = CRS;

        const headers = {
            "Host": "mepar.mvh.allamkincstar.gov.hu",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36",
            "Referer": "https://mepar.mvh.allamkincstar.gov.hu/",
            "Origin": "https://mepar.mvh.allamkincstar.gov.hu"
        };

        if (FORMAT && FORMAT.includes('{') && FORMAT.includes('}')) FORMAT = 'image/png';

        if (TileMatrix && TileRow && TileCol) {
            const tileParams = calculateBboxFromTile(TileMatrix, TileRow, TileCol);
            if (tileParams) {
                BBOX = tileParams.BBOX;
                sourceCRS = tileParams.CRS; 
                WIDTH = tileParams.WIDTH;
                HEIGHT = tileParams.HEIGHT;
            }
        }

        if (!BBOX) return res.status(400).send('Hiányzó BBOX koordináták.');

        const bboxParts = BBOX.split(',').map(Number);
        const [minX, minY, maxX, maxY] = bboxParts;
        
        const [yMin, xMin] = proj4(sourceCRS || 'EPSG:3857', TARGET_CRS, [minX, minY]);
        const [yMax, xMax] = proj4(sourceCRS || 'EPSG:3857', TARGET_CRS, [maxX, maxY]);
        
        const eovBBOX = `${yMin.toFixed(4)},${xMin.toFixed(4)},${yMax.toFixed(4)},${xMax.toFixed(4)}`;
        const layerName = LAYER || 'iier:topo10';

        const wmsQueryParams = new URLSearchParams({
            LAYERS: layerName,
            STYLES: 'raster', 
            FORMAT: FORMAT || 'image/png',
            TRANSPARENT: 'TRUE',
            SERVICE: SERVICE || 'WMS',
            VERSION: '1.1.1',
            REQUEST: REQUEST || 'GetMap',
            SRS: TARGET_CRS,
            BBOX: eovBBOX, 
            WIDTH: WIDTH || 256,
            HEIGHT: HEIGHT || 256,
        });

        const targetUrl = `${MEPAR_WMS_URL}?${wmsQueryParams.toString()}`;

        let proxyResponse = null;
        let lastError = null;

        // 1. Először megpróbáljuk a SOCKS4 Proxy-val (2x újrázással ECONNRESET esetén)
        for (const proxyUrl of PROXIES) {
            try {
                proxyResponse = await fetchWithRetry(targetUrl, headers, proxyUrl, 2);
                if (proxyResponse && proxyResponse.ok) break;
            } catch (err) {
                console.warn(`[PROXY FAIL] ${err.message}`);
                lastError = err;
            }
        }

        // 2. HA A PROXY MEGSZAKADT (ECONNRESET): Azonnal váltunk közvetlen kapcsolatra!
        if (!proxyResponse || !proxyResponse.ok) {
            try {
                proxyResponse = await fetchWithRetry(targetUrl, headers, null, 1);
            } catch (err) {
                lastError = err;
            }
        }

        if (!proxyResponse || !proxyResponse.ok) {
            return res.status(504).send(`Szerver hiba (${layerName}): ${lastError ? lastError.message : 'Timeout'}`);
        }

        const contentType = proxyResponse.headers.get('content-type');
        res.setHeader('Content-Type', contentType || 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=604800'); 
        
        const buffer = await proxyResponse.buffer();
        return res.status(200).send(buffer);
        
    } catch (error) {
        return res.status(500).send(`Fatal error: ${error.message}`);
    }
};
