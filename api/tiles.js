const proj4 = require('proj4');

// KRITIKUS: A HIVATALOS EOV (EPSG:23700) DEFINÍCIÓ
proj4.defs("EPSG:23700", "+proj=somerc +lat_0=47.14439372222222 +lon_0=19.04857177777778 +k=0.99993 +x_0=650000 +y_0=200000 +ellps=GRS67 +towgs84=52.17,-71.82,-14.9,0.0,0.0,0.0,0.0 +units=m +no_defs");

const MEPAR_WMS_URL = 'https://mepar.mvh.allamkincstar.gov.hu/api/proxy/iier-gs/wms';
const TARGET_CRS = 'EPSG:23700'; 
const TILE_SIZE = 256;
const MAX_EXTENT = 20037508.342789244; // Fél világkiterjedés
const FETCH_TIMEOUT_MS = 20000; // 20 másodpercre emelve az időtúllépést

// Függvény a BBOX számításához WMTS csempeparaméterekből (EPSG:3857-re)
function calculateBboxFromTile(matrixId, tileRow, tileCol) {
    
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
}


module.exports = async (req, res) => {
    // 🔑 KRITIKUS JAVÍTÁS: AbortController az időtúllépés kezelésére
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    
    try {
        let { LAYER, FORMAT, BBOX, WIDTH, HEIGHT, REQUEST, SERVICE, VERSION, CRS } = req.query;
        const { TileMatrix, TileRow, TileCol, TileMatrixSet } = req.query;
        let sourceCRS = CRS;

        // 🔑 KRITIKUS JAVÍTÁS: {Format} sablon cseréje image/png-re (Oruxmaps/Locus fix)
        if (FORMAT && FORMAT.includes('{') && FORMAT.includes('}')) {
            FORMAT = 'image/png'; 
        }

        // 1. FÁZIS: WMTS paraméterek konvertálása BBOX-szá
        if (TileMatrix && TileRow && TileCol) {
            const tileParams = calculateBboxFromTile(TileMatrix, TileRow, TileCol);
            
            if (!tileParams) {
                return res.status(400).send('Érvénytelen TileMatrix, TileRow, vagy TileCol paraméterek. Ellenőrizze a formátumot.');
            }
            
            BBOX = tileParams.BBOX;
            sourceCRS = tileParams.CRS; 
            WIDTH = tileParams.WIDTH;
            HEIGHT = tileParams.HEIGHT;
        }

        if (!BBOX || sourceCRS !== 'EPSG:3857') {
            return res.status(400).send(`Hiányzó BBOX koordináták vagy nem támogatott CRS: ${sourceCRS}. Csak az EPSG:3857 támogatott.`);
        }

        const bboxParts = BBOX.split(',').map(Number);
        const [minX, minY, maxX, maxY] = bboxParts;
        
        // 🔑 DEBUG: Kiírjuk az input WMTS BBOX-ot
        console.log(`[DEBUG] Input 3857 BBOX: ${BBOX}`);

        // 2. FÁZIS: Transzformáció: WGS84 (EPSG:3857) -> EOV (EPSG:23700)
        // A Proj4 EOV-re Y (Northing), X (Easting) sorrendet ad!
        const [yMin, xMin] = proj4(sourceCRS, TARGET_CRS, [minX, minY]);
        const [yMax, xMax] = proj4(sourceCRS, TARGET_CRS, [maxX, maxY]);
        
        // 3. FÁZIS: BBOX sorrend: Ymin, Xmin, Ymax, Xmax (Northing, Easting) - EOV natív sorrend
        // Koordináta kerekítés 4 tizedesjegyre (WMS kompatibilitás)
        const xMin_R = xMin.toFixed(4);
        const yMin_R = yMin.toFixed(4);
        const xMax_R = xMax.toFixed(4);
        const yMax_R = yMax.toFixed(4);

        // KRITIKUS JAVÍTÁS: Y, X, Y, X sorrend a stabilitásért, WMS 1.1.1-gyel
        const eovBBOX = `${yMin_R},${xMin_R},${yMax_R},${xMax_R}`;
        
        // 🔑 DEBUG: Kiírjuk az output EOV BBOX-ot
        console.log(`[DEBUG] Output EOV BBOX: ${eovBBOX}`);

        // 4. FÁZIS: WMS lekérdezés felépítése a GeoServer felé
        const wmsQueryParams = new URLSearchParams({
            LAYERS: LAYER,
            STYLES: 'raster', 
            FORMAT: FORMAT || 'image/png', // 🔑 HASZNÁLJUK A JAVÍTOTT FORMAT-OT
            TRANSPARENT: true,
            SERVICE: SERVICE || 'WMS',
            VERSION: '1.1.1', // WMS 1.1.1 a kompatibilitásért
            REQUEST: REQUEST || 'GetMap',
            SRS: TARGET_CRS, // SRS használata WMS 1.1.1-hez
            BBOX: eovBBOX, 
            WIDTH: WIDTH || 256,
            HEIGHT: HEIGHT || 256,
        });

        const targetUrl = `${MEPAR_WMS_URL}?${wmsQueryParams.toString()}`;
        
        // 🔑 DEBUG: Kiírjuk a teljes WMS kérés URL-t
        console.log(`[DEBUG] GeoServer URL: ${targetUrl}`);

        // 5. Lekérés a GeoServer-től
        // 🔑 KRITIKUS JAVÍTÁS: Timeout jel hozzáadva
        const proxyResponse = await fetch(targetUrl, { signal: controller.signal });

        if (!proxyResponse.ok) {
            const errorBody = await proxyResponse.text();
            console.error(`GeoServer WMS Hiba: ${proxyResponse.status} - URL: ${targetUrl} - Válasz: ${errorBody}`);

            return res.status(proxyResponse.status).send(`GeoServer Hiba (${proxyResponse.status}): ${proxyResponse.statusText}. Részletek: ${errorBody.substring(0, 500)}`);
        }

        // 6. FÁZIS: Csempe visszaküldése
        res.setHeader('Content-Type', proxyResponse.headers.get('Content-Type') || 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=604800'); 
        
        const buffer = await proxyResponse.arrayBuffer();
        const imageBuffer = Buffer.from(buffer);
        
        res.status(200).send(imageBuffer);
        
    } catch (error) {
        // 🔑 KRITIKUS JAVÍTÁS: Külön kezelés a timeout-ra (504 Gateway Timeout)
        if (error.name === 'AbortError') {
            console.error(`API hiba a csempe feldolgozás során: Időtúllépés (${FETCH_TIMEOUT_MS}ms) a GeoServer kérésnél.`);
            return res.status(504).send(`KRITIKUS HIBA (504 Timeout): A GeoServer nem válaszolt a megadott ${FETCH_TIMEOUT_MS}ms időn belül.`);
        }
        
        console.error('API hiba a csempe feldolgozás során:', error);
        res.status(500).send(`KRITIKUS HIBA: Hiba történt a csempe transzformáció során: ${error.message}`);
    } finally {
        clearTimeout(timeoutId); // Töröljük a timert, ha a kérés sikeres volt
    }
};