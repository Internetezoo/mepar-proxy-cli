// api/topo.js
// Ez a fájl fix, statikus WMTS Capabilities XML-t szolgál ki kizárólag a topo10 rétegre
// és az EPSG:3857 (Web Mercator) vetületre.

const VERCEL_BASE_URL = 'https://mepar-proxy-cli.vercel.app/api/tiles';
const VERCEL_CAPABILITIES_URL = 'https://mepar-proxy-cli.vercel.app/api/topo'; 
const MAX_ZOOM = 15; // WMTS TileMatrixSet max zoom szintje

// Függvény a TileMatrix-ek generálásához (0-tól MAX_ZOOM-ig)
function generateTileMatrices(maxZoom) {
    const TILE_SIZE = 256;
    const FULL_EXTENT = 20037508.342789244 * 2; // Teljes világkiterjedés

    let matrices = '';
    for (let z = 0; z <= maxZoom; z++) {
        // Csempe felbontásának számítása Web Mercatorban (standard formula)
        const resolution = FULL_EXTENT / (TILE_SIZE * Math.pow(2, z));
        const scaleDenominator = resolution / 0.00028; // Standard OGC formula

        const matrixWidth = Math.pow(2, z);
        const matrixHeight = Math.pow(2, z);

        matrices += `
            <TileMatrix>
                <ows:Identifier>EPSG:3857:${z}</ows:Identifier>
                <ScaleDenominator>${scaleDenominator}</ScaleDenominator>
                <TopLeftCorner>-20037508.342789244 20037508.342789244</TopLeftCorner>
                <TileWidth>${TILE_SIZE}</TileWidth>
                <TileHeight>${TILE_SIZE}</TileHeight>
                <MatrixWidth>${matrixWidth}</MatrixWidth>
                <MatrixHeight>${matrixHeight}</MatrixHeight>
            </TileMatrix>`;
    }
    return matrices;
}

const ALL_TILE_MATRICES = generateTileMatrices(MAX_ZOOM);

const STATIC_WMTS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Capabilities xmlns="http://www.opengis.net/wmts/1.0"
    xmlns:ows="http://www.opengis.net/ows/1.1"
    xmlns:xlink="http://www.w3.org/1999/xlink"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    version="1.0.0"
    xsi:schemaLocation="http://www.opengis.net/wmts/1.0 http://schemas.opengis.net/wmts/1.0/wmtsGetCapabilities_response.xsd">
    <ows:ServiceIdentification>
        <ows:Title>MEPAR Topo10 Proxy Service</ows:Title>
        <ows:Abstract>Optimized WMTS proxy for the iier:topo10 layer.</ows:Abstract>
        <ows:ServiceType>OGC WMTS</ows:ServiceType>
        <ows:ServiceTypeVersion>1.0.0</ows:ServiceTypeVersion>
    </ows:ServiceIdentification>
    
    <ows:OperationsMetadata>
        <ows:Operation name="GetCapabilities">
            <ows:DCP>
                <ows:HTTP>
                    <ows:Get xlink:href="${VERCEL_CAPABILITIES_URL}" />
                </ows:HTTP>
            </ows:DCP>
        </ows:Operation>
        <ows:Operation name="GetTile">
            <ows:DCP>
                <ows:HTTP>
                    <ows:Get xlink:href="${VERCEL_BASE_URL}" />
                </ows:HTTP>
            </ows:DCP>
        </ows:Operation>
    </ows:OperationsMetadata>
    
    <Contents>
        <Layer>
            <ows:Title>Topo 10</ows:Title>
            <ows:Identifier>iier:topo10</ows:Identifier>
            <Style isDefault="true">
                <ows:Identifier>raster</ows:Identifier>
            </Style>
            <Format>image/png</Format>
            <TileMatrixSetLink>
                <TileMatrixSet>EPSG:3857</TileMatrixSet>
            </TileMatrixSetLink>
            <ResourceURL format="image/png" resourceType="tile" template="${VERCEL_BASE_URL}?LAYER=iier:topo10&amp;FORMAT={Format}&amp;TileMatrixSet={TileMatrixSet}&amp;TileMatrix={TileMatrix}&amp;TileRow={TileRow}&amp;TileCol={TileCol}"/>
        </Layer>
        
        <TileMatrixSet>
            <ows:Title>EPSG:3857 / Web Mercator</ows:Title>
            <ows:Abstract>Google Maps Compatible TileMatrixSet</ows:Abstract>
            <ows:Identifier>EPSG:3857</ows:Identifier>
            <ows:SupportedCRS>urn:ogc:def:crs:EPSG::3857</ows:SupportedCRS>
            ${ALL_TILE_MATRICES}
        </TileMatrixSet>
    </Contents>
</Capabilities>
`;

module.exports = async (req, res) => {
    try {
        // Standard fejlécek a projekt egységessége végett
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

        let finalXml = STATIC_WMTS_XML;

        // Töröljük a Vercel által esetlegesen injektált szkripteket
        finalXml = finalXml.replace(/<script[^>]*\/>/g, ''); 
        finalXml = finalXml.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
        
        // Whitespace tisztítás a tag-ek között a szabályos XML érdekében
        finalXml = finalXml.replace(/<Capabilities[^>]*>([\s\S]*?)<ows:ServiceIdentification>/, (match, whitespace) => {
            return match.replace(whitespace, '');
        });

        // Válasz küldése
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('X-Proxy-Header-Context', 'applied'); // Jelzés, hogy a fejléc kontextus ismert
        res.status(200).send(finalXml);

    } catch (error) {
        console.error('API hiba a topo XML generálása során:', error);
        res.status(500).send(`KRITIKUS HIBA: ${error.message}`);
    }
};