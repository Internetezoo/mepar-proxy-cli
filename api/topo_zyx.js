// api/topo_zyx.js
// Ez a fájl fix, statikus WMTS Capabilities XML-t szolgál ki, de a Z/Y/X végpontra mutat.

// KRITIKUS: A proxy szolgáltatásának saját címei
const VERCEL_BASE_URL_ZYX = 'https://mepar-proxy-cli.vercel.app/api/zyx'; // A Z/Y/X csempék endpointja
const VERCEL_CAPABILITIES_URL_ZYX = 'https://mepar-proxy-cli.vercel.app/api/topo_zyx'; // Ennek a Capabilities fájlnak a címe

// ÚJ: MEPAR specifikus fejlécek a kéréshez (konzisztencia miatt)
const MEPAR_HEADERS = {
    "Host": "mepar.mvh.allamkincstar.gov.hu",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "hu-HU,hu;q=0.9",
    "Referer": "https://mepar.mvh.allamkincstar.gov.hu/",
    "Origin": "https://mepar.mvh.allamkincstar.gov.hu",
    "Connection": "keep-alive",
    "Sec-Fetch-Dest": "image",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
};

// KRITIKUS JAVÍTÁS: XML fejléce egy sorban, minden szóköz ellenőrizve. Z0-Z18 hozzáadva.
const STATIC_WMTS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Capabilities xmlns="http://www.opengis.net/wmts/1.0" xmlns:ows="http://www.opengis.net/ows/1.1" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="1.0.0" xsi:schemaLocation="http://www.opengis.net/wmts/1.0 http://schemas.opengis.net/wmts/1.0/wmtsGetCapabilities_response.xsd">
    <ows:ServiceIdentification>
        <ows:Title>MEPAR Topo10 Proxy Service (ZYX)</ows:Title>
        <ows:Abstract>Optimized WMTS proxy for the iier:topo10 layer, pointing to Z/Y/X endpoint.</ows:Abstract>
        <ows:ServiceType>OGC WMTS</ows:ServiceType>
        <ows:ServiceTypeVersion>1.0.0</ows:ServiceTypeVersion>
    </ows:ServiceIdentification>
    
    <ows:OperationsMetadata>
        <ows:Operation name="GetCapabilities">
            <ows:DCP>
                <ows:HTTP>
                    <ows:Get xlink:href="${VERCEL_CAPABILITIES_URL_ZYX}" />
                </ows:HTTP>
            </ows:DCP>
        </ows:Operation>
        <ows:Operation name="GetTile">
            <ows:DCP>
                <ows:HTTP>
                    <ows:Get xlink:href="${VERCEL_BASE_URL_ZYX}" />
                </ows:HTTP>
            </ows:DCP>
        </ows:Operation>
    </ows:OperationsMetadata>
    
    <Contents>
        <Layer>
            <ows:Title>Topo 10 (ZYX)</ows:Title>
            <ows:Identifier>iier:topo10</ows:Identifier>
            <Style isDefault="true">
                <ows:Identifier>raster</ows:Identifier>
            </Style>
            <Format>image/png</Format>
            <TileMatrixSetLink>
                <TileMatrixSet>EPSG:3857</TileMatrixSet>
            </TileMatrixSetLink>
            
            <ResourceURL format="image/png" resourceType="tile" template="${VERCEL_BASE_URL_ZYX}?LAYER=iier:topo10&amp;FORMAT=image/png&amp;z={TileMatrix}&amp;y={TileRow}&amp;x={TileCol}"/>
        </Layer>
        
        <TileMatrixSet>
            <ows:Title>EPSG:3857 / Web Mercator</ows:Title>
            <ows:Abstract>Google Maps Compatible TileMatrixSet</ows:Abstract>
            <ows:Identifier>EPSG:3857</ows:Identifier>
            <ows:SupportedCRS>urn:ogc:def:crs:EPSG::3857</ows:SupportedCRS>
            ${Array.from({ length: 19 }, (_, i) => {
                const matrixSize = Math.pow(2, i);
                const scaleDenominator = 5.590822640280455E8 / matrixSize;
                
                return `
            <TileMatrix>
                <ows:Identifier>EPSG:3857:${i}</ows:Identifier>
                <ScaleDenominator>${scaleDenominator}</ScaleDenominator>
                <TopLeftCorner>-20037508.342789244 20037508.342789244</TopLeftCorner>
                <TileWidth>256</TileWidth>
                <TileHeight>256</TileHeight>
                <MatrixWidth>${matrixSize}</MatrixWidth>
                <MatrixHeight>${matrixSize}</MatrixHeight>
            </TileMatrix>`;
            }).join('\n')}
        </TileMatrixSet>
    </Contents>
</Capabilities>`;

module.exports = async (req, res) => {
    try {
        console.log('[DEBUG] topo_zyx.js Capabilities XML lekérés érkezett.');
        let finalXml = STATIC_WMTS_XML;

        // Töröljük a Vercel által esetlegesen injektált <script> tageket és a whitespace-t.
        finalXml = finalXml.replace(/<script[^>]*\/>/g, ''); 
        finalXml = finalXml.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
        finalXml = finalXml.trim();

        res.setHeader('Content-Type', 'application/xml');
        res.status(200).send(finalXml);
    } catch (error) {
        console.error('API hiba a topo XML generálása során:', error);
        res.status(500).send(`KRITIKUS HIBA: Hiba történt a topo XML generálása során: ${error.message}`);
    }
};