const proj4 = require('proj4');

// EOV (EPSG:23700) DEFINÍCIÓ (+towgs84 nélkül a stabil illeszkedésért)
proj4.defs("EPSG:23700", "+proj=somerc +lat_0=47.14439372222222 +lon_0=19.04857177777778 +k=0.99993 +x_0=650000 +y_0=200000 +ellps=GRS67 +units=m +no_defs");

// CÉL: OÉNY Helyi Kataszteri Geoserver WMS URL
const HRSZ_WMS_URL = 'https://www.oeny.hu/hk-geoserver/hrsz/wms';

const TARGET_CRS = 'EPSG:23700'; 
const TILE_SIZE = 256;
const MAX_EXTENT = 20037508.342789244; 
const FETCH_TIMEOUT_MS = 20000; 

// Függvény a BBOX számításához Web Mercator (EPSG:3857) csempeparaméterekből
function calculateBboxFromTile(matrixId, tileCol, tileRow) {
    const resolution = MAX_EXTENT * 2 / (TILE_SIZE * Math.pow(2, matrixId));
    
    const minX = -MAX_EXTENT + tileCol * TILE_SIZE * resolution;
    const maxY = MAX_EXTENT - tileRow * TILE_SIZE * resolution;
    
    const maxX = minX + TILE_SIZE * resolution;
    const minY = maxY - TILE_SIZE * resolution;
    
    // ✅ JAVÍTVA: A BBOX helyes sorrendben [minX, minY, maxX, maxY]
    return [minX, minY, maxX, maxY]; 
}

module.exports = async (req, res) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    
    try {
        const { z, y, x, FORMAT = 'image/png', LAYER } = req.query; 

        // ... validálás és BBOX számítás ...

        // 2. FÁZIS: BBOX számítása (Web Mercatorban)
        const bbox3857 = calculateBboxFromTile(parseInt(z), parseInt(x), parseInt(y));

        // 3. FÁZIS: Transzformálás EOV-ra (EPSG:23700)
        const [bbox3857_minX, bbox3857_minY, bbox3857_maxX, bbox3857_maxY] = bbox3857;
        
        const [eov_minX, eov_minY] = proj4('EPSG:3857', TARGET_CRS, [bbox3857_minX, bbox3857_minY]);
        const [eov_maxX, eov_maxY] = proj4('EPSG:3857', TARGET_CRS, [bbox3857_maxX, bbox3857_maxY]);

        // WMS 1.1.0 standard sorrend: [minX, minY, maxX, maxY]
        const final_bbox = `${eov_minX},${eov_minY},${eov_maxX},${eov_maxY}`;
        
        // 4. FÁZIS: WMS URL felépítése (WMS 1.1.0 verzióval és SRS-szel!)
        const targetUrl = `${HRSZ_WMS_URL}?service=WMS&request=GetMap&version=1.1.0&layers=${LAYER}&styles=&srs=${TARGET_CRS}&bbox=${final_bbox}&width=${TILE_SIZE}&height=${TILE_SIZE}&format=${FORMAT}&transparent=true`;
        
        // 5. FÁZIS: Kérés továbbítása megfelelő fejlécekkel
        const proxyResponse = await fetch(targetUrl, { 
            signal: controller.signal,
            headers: {
                // Egy böngészőt imitáló User-Agent gyakran szükséges a tiltás elkerüléséhez
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                // A Referer azt mutatja, honnan érkezik a kérés (érdemes az oeny.hu-t vagy a saját domainet megadni)
                'Referer': 'https://www.oeny.hu/',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Accept-Language': 'hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7',
            }
        });

        // ... 6. FÁZIS: Csempe visszaküldése ...
        res.setHeader('Content-Type', proxyResponse.headers.get('Content-Type') || 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=604800'); 
        
        const buffer = await proxyResponse.arrayBuffer();
        const imageBuffer = Buffer.from(buffer);
        
        res.status(200).send(imageBuffer);
        
    } catch (error) {
        // ... hiba kezelés ...
        if (error.name === 'AbortError') {
            return res.status(504).send(`KRITIKUS HIBA (504 Timeout): A szerver nem válaszolt a megadott ${FETCH_TIMEOUT_MS}ms időn belül.`);
        }
        console.error('API hiba a csempe feldolgozás során:', error);
        res.status(500).send(`KRITIKUS HIBA: Hiba történt a proxyzás során: ${error.message}`);
    } finally {
        clearTimeout(timeoutId); 
    }
};
