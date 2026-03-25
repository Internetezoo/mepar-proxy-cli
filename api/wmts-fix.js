const xml2js = require('xml2js');

const VERCEL_BASE_URL = 'https://mepar-proxy-cli.vercel.app/api/tiles'; 
const VERCEL_ROOT_URL = 'https://mepar-proxy-cli.vercel.app'; 

const wmtsUrl = 'https://mepar.mvh.allamkincstar.gov.hu/api/proxy/iier-gs/gwc/service/wmts?service=WMTS&request=GetCapabilities';

module.exports = async (req, res) => {
    try {
        // 🔑 FEJLÉCEK: Böngésző imitálása a tiltások elkerülése végett
        const headers = {
            "Host": "mepar.mvh.allamkincstar.gov.hu",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
            "Referer": "https://mepar.mvh.allamkincstar.gov.hu/",
            "Origin": "https://mepar.mvh.allamkincstar.gov.hu",
            "Connection": "keep-alive",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "same-origin",
            "Upgrade-Insecure-Requests": "1",
        };

        const xmlResponse = await fetch(wmtsUrl, { headers });
        if (!xmlResponse.ok) {
            throw new Error(`WMTS API hiba: ${xmlResponse.status} a forrásból.`);
        }
        let xmlText = await xmlResponse.text();

        // 1. Általános URL tisztítás (szövegesen)
        xmlText = xmlText.replace(/http:\/\/127\.0\.0\.1/g, VERCEL_ROOT_URL);
        xmlText = xmlText.replace(/http:\/\/geoserver\.org/g, VERCEL_ROOT_URL);
        xmlText = xmlText.replace(/http:\/\/([^\/]*)\/geoserver\/ows/g, VERCEL_ROOT_URL + '/geoserver/ows'); 
        
        const xmlClean = xmlText.startsWith('\ufeff') ? xmlText.substring(1) : xmlText;

        // 2. XML -> JSON konverzió
        const parser = new xml2js.Parser({ explicitArray: true, explicitNamespaces: true, attrkey: '$', charkey: '_', });
        const parserResult = await parser.parseStringPromise(xmlClean);

        let capabilities;
        if (parserResult.Capabilities) {
            capabilities = ArrayOf(parserResult.Capabilities) ? parserResult.Capabilities[0] : parserResult.Capabilities;
        } else if (parserResult['wmts:Capabilities']) {
            capabilities = ArrayOf(parserResult['wmts:Capabilities']) ? parserResult['wmts:Capabilities'][0] : parserResult['wmts:Capabilities'];
        }

        if (!capabilities) throw new Error("Érvényes WMTS Capabilities XML struktúra: Hiányzik a gyökér elem.");
        
        const contents = capabilities['Contents'] ? capabilities['Contents'][0] : null; 
        if (!contents) throw new Error("Érvénytelen WMTS Capabilities XML struktúra: Hiányzik a Contents elem.");
        
        let layerArray = contents['Layer'];
        if (!ArrayOf(layerArray)) {
            layerArray = [layerArray].filter(Boolean);
        }

        // 3. Layer-enkénti agresszív tisztítás
        layerArray.forEach(layer => {
            
            const layerName = layer['ows:Identifier']?.[0]?.['_'];
            if (!layerName) {
                return; 
            }
            
            // 🔑 3.1. KRITIKUS: A TileMatrixSetLink beállítása (3857)
            layer['TileMatrixSetLink'] = [{
                'TileMatrixSet': [{ '_': 'EPSG:3857', '$': {} }],
            }];
            
            // 🔑 3.2. A ResourceURL-ek Törlése és Cseréje a /api/tiles végpontra
            delete layer['ResourceURL']; 
            
            const tileTemplateURL = `${VERCEL_BASE_URL}?LAYER=${layerName}&FORMAT=image/png&TileMatrixSet=EPSG:3857&TileMatrix={TileMatrix}&TileRow={TileRow}&TileCol={TileCol}`;
            const featureInfoURL = `${VERCEL_BASE_URL}?LAYER=${layerName}&FORMAT=text/xml&REQUEST=GetFeatureInfo&TileMatrixSet=EPSG:3857&TileMatrix={TileMatrix}&TileRow={TileRow}&TileCol={TileCol}&I={I}&J={J}`;

            layer['ResourceURL'] = [
                { '$': { 'format': 'image/png', 'resourceType': 'tile', 'template': tileTemplateURL } },
                { '$': { 'format': 'text/xml', 'resourceType': 'FeatureInfo', 'template': featureInfoURL } }
            ];
            
            // 3.3. Felesleges elemek törlése a minimalizálásért
            delete layer['InfoFormat'];
            delete layer['ows:Abstract'];
            delete layer['ows:Keywords'];
        });
        
        // 4. Globális TileMatrixSet definíciók tisztítása
        let tileMatrixSets = contents['TileMatrixSet'];

        // 🔑 4.1. EOV_teszt törlése
        contents['TileMatrixSet'] = tileMatrixSets.filter(tms => 
            tms['ows:Identifier'] && tms['ows:Identifier'][0] && tms['ows:Identifier'][0]['_'] !== 'EOV_teszt'
        );

        // 🔑 4.2. EPSG:3857 biztosítása
        tileMatrixSets = contents['TileMatrixSet'];
        const existing900913 = tileMatrixSets.find(tms => 
            tms['ows:Identifier'] && tms['ows:Identifier'][0] && tms['ows:Identifier'][0]['_'] === 'EPSG:900913'
        );
        const has3857Definition = tileMatrixSets.some(tms => 
            tms['ows:Identifier'] && tms['ows:Identifier'][0] && tms['ows:Identifier'][0]['_'] === 'EPSG:3857'
        );

        if (existing900913 && !has3857Definition) {
            const new3857 = JSON.parse(JSON.stringify(existing900913));
            new3857['ows:Identifier'][0]['_'] = 'EPSG:3857';
            new3857['ows:SupportedCRS'][0]['_'] = 'urn:ogc:def:crs:EPSG::3857';
            
            new3857['TileMatrix'].forEach(tm => {
                delete tm['TileMatrixSetLimits'];
            });
            
            contents['TileMatrixSet'].push(new3857);
        }

        // 5. XML visszaépítése
        const builder = new xml2js.Builder({ 
            renderOpts: { 'pretty': true, 'indent': '  ', 'newline': '\n' }, 
            headless: false, 
            cdata: true, 
            rootName: 'Capabilities', 
            attrkey: '$', 
            charkey: '_',
        });
        const xmlOutput = builder.buildObject(capabilities);

        res.setHeader('Content-Type', 'application/xml');
        res.status(200).send(xmlOutput);
        
    } catch (error) {
        console.error('API hiba a WMTS XML generálása során:', error);
        res.status(500).send(`KRITIKUS HIBA: ${error.message}`);
    }
};

function ArrayOf(data) {
    return Array.isArray(data);
}