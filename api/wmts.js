const xml2js = require('xml2js');

// 🔑 KRITIKUS: A VÉGLEGES CSEMPE VÉGPONT (a /api/tiles-ra mutat)
const VERCEL_BASE_URL = 'https://mepar-proxy-cli.vercel.app/api/tiles'; 
// 🔑 VERCEL GYÖKÉR URL: A belső linkek (127.0.0.1) tisztításához
const VERCEL_ROOT_URL = 'https://mepar-proxy-cli.vercel.app'; 

const wmtsUrl = 'https://mepar.mvh.allamkincstar.gov.hu/api/proxy/iier-gs/gwc/service/wmts?service=WMTS&request=GetCapabilities';

module.exports = async (req, res) => {
    try {
        // Böngésző imitálása a fejlécekkel
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

        // 1. Általános URL tisztítás: 127.0.0.1 és belső GeoServer címek cseréje
        xmlText = xmlText.replace(/http:\/\/127\.0\.0\.1/g, VERCEL_ROOT_URL);
        xmlText = xmlText.replace(/http:\/\/geoserver\.org/g, VERCEL_ROOT_URL);
        xmlText = xmlText.replace(/http:\/\/([^\/]*)\/geoserver\/ows/g, VERCEL_ROOT_URL + '/geoserver/ows'); 

        const xmlClean = xmlText.startsWith('\ufeff') ? xmlText.substring(1) : xmlText;

        const parser = new xml2js.Parser({ 
            explicitArray: true, 
            explicitNamespaces: true, 
            attrkey: '$', 
            charkey: '_', 
        });
        
        const parserResult = await parser.parseStringPromise(xmlClean);

        // XML gyökérelem meghatározása
        let capabilities;
        if (parserResult.Capabilities) {
            capabilities = Array.isArray(parserResult.Capabilities) ? parserResult.Capabilities[0] : parserResult.Capabilities;
        } else if (parserResult['wmts:Capabilities']) {
            capabilities = Array.isArray(parserResult['wmts:Capabilities']) ? parserResult['wmts:Capabilities'][0] : parserResult['wmts:Capabilities'];
        }

        if (!capabilities) throw new Error("Érvényes WMTS Capabilities XML struktúra: Hiányzik a gyökér elem.");
        
        const contents = capabilities['Contents'] ? capabilities['Contents'][0] : null; 
        if (!contents) throw new Error("Érvénytelen WMTS Capabilities XML struktúra: Hiányzik a Contents elem.");
        
        let layerArray = contents['Layer'];
        if (!Array.isArray(layerArray)) {
            layerArray = [layerArray].filter(Boolean);
        }

        // 2. ResourceURL FELÜLÍRÁSA a Vercel API végponttal
        layerArray.forEach(layer => {
            const layerName = layer['ows:Identifier']?.[0]?.['_'];
            if (!layerName) return; 
            
            const cleanTitle = layerName.replace(/^iier:/, '');
            layer['ows:Title'] = [{ '_': cleanTitle, '$': {} }];

            const templateURL = `${VERCEL_BASE_URL}?LAYER=${layerName}&FORMAT={Format}&TileMatrixSet={TileMatrixSet}&TileMatrix={TileMatrix}&TileRow={TileRow}&TileCol={TileCol}`;

            layer['ResourceURL'] = [{
                '$': { 'format': 'image/png', 'resourceType': 'tile', 'template': templateURL }
            }];
            
            layer['TileMatrixSetLink'] = [{
                'TileMatrixSet': [{ 'ows:Identifier': [{ '_': 'EPSG:3857', '$': {} }] }],
                '$': {}
            }];
        });
        
        // 3. TileMatrixSet beállítás (EPSG:3857 biztosítása)
        let tileMatrixSets = contents['TileMatrixSet'];
        const existing900913 = tileMatrixSets.find(tms => 
            tms['ows:Identifier']?.[0]?.['_'] === 'EPSG:900913'
        );
        const has3857Definition = tileMatrixSets.some(tms => 
            tms['ows:Identifier']?.[0]?.['_'] === 'EPSG:3857'
        );

        if (existing900913 && !has3857Definition) {
            const new3857 = JSON.parse(JSON.stringify(existing900913));
            new3857['ows:Identifier'][0]['_'] = 'EPSG:3857';
            new3857['ows:SupportedCRS'][0]['_'] = 'urn:ogc:def:crs:EPSG::3857';
            tileMatrixSets.push(new3857);
        }

        // XML visszaépítése
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
        res.status(500).send(`<ErrorResponse><Message>KRITIKUS HIBA: ${error.message}</Message></ErrorResponse>`);
    }
};