var map = L.map('mapdiv').setView([39, -98], 4);

// Define the tile layers as variables
var esriSatelliteLayerUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
var esriSatelliteLayerAttribution = '&copy; <a href="https://www.esri.com/en-us/legal/terms/data-attributions"> ESRI Satellite Imagery</a> contributors';
var openTopoMapLayerUrl = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
var openTopoMapLayerAttribution = '&copy; OpenTopoMap';

// Replace 'YOUR_API_KEY' with your actual Stadia Maps API key
var stadiaOutdoorsUrl = 'https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}{r}.png?api_key=YOUR_API_KEY';
var stadiaOutdoorsAttribution = '&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Add new tile layers
var CartoDB_Voyager = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
});

// Create the tile layers using the variables
var esriSatelliteLayer = L.tileLayer(esriSatelliteLayerUrl, {
    attribution: esriSatelliteLayerAttribution
});
var openTopoMapLayer = L.tileLayer(openTopoMapLayerUrl, {
    attribution: openTopoMapLayerAttribution
});
var stadiaOutdoorsLayer = L.tileLayer(stadiaOutdoorsUrl, {
    attribution: stadiaOutdoorsAttribution
});

// Create base layers object
var baseLayers = {
    "ESRI Satellite Imagery": esriSatelliteLayer,
    "OpenTopoMap": openTopoMapLayer,
    "Stadia Outdoor": stadiaOutdoorsLayer,
    "CartoDB Voyager": CartoDB_Voyager
};

// Add my default base layer to the map
map.addLayer(esriSatelliteLayer);

// Create a layer control and add it to the map
var layerControl = L.control.layers(baseLayers).addTo(map);

// FeatureGroup to hold drawn items
var drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

// Initialize the draw control and pass it the FeatureGroup of editable layers
var drawControl = new L.Control.Draw({
    edit: {
        featureGroup: drawnItems
    },
    draw: {
        polygon: true,
        polyline: false,
        circle: false,
        rectangle: false,
        marker: false,
        circlemarker: false
    }
});
map.addControl(drawControl);

let drawnPolygonLayer = null; // Make a spot for the polygon

map.on(L.Draw.Event.CREATED, function (event) {
    var layer = event.layer;
    drawnItems.clearLayers(); // Clear previous drawings
    drawnItems.addLayer(layer);
    drawnPolygonLayer = layer; // Store the drawn layer

    // Calculate the area using Turf.js
    var geojson = drawnPolygonLayer.toGeoJSON(); // Convert to GeoJSON
    var area = turf.area(geojson); // Calculate area in square meters
    
    // Convert square meters to hectares for display (just a fun flex of turf)
    var areaInHectares = (area / 10000).toFixed(2); 

    // Display the area in a popup or control
    var areaDisplay = L.control({ position: 'bottomleft' });
    areaDisplay.onAdd = function () {
        var div = L.DomUtil.create('div', 'info'); // Style the area display
        div.innerHTML = 'Area: ' + areaInHectares + ' hectares';
        return div;
    };
    areaDisplay.addTo(map);
});

var controlsDiv = L.control({ position: 'bottomleft' }); //here is a spot to upload user polygons
controlsDiv.onAdd = function (map) {
    var div = L.DomUtil.create('div', 'controls-div');
    div.innerHTML = '<input type="file" id="geojsonUpload" accept=".geojson,.json"><button id="downloadTiles" disabled>Download Tiles</button>';
    return div;
};
controlsDiv.addTo(map);

map.on(L.Draw.Event.CREATED, function (event) { //makes the geojson work like the polygon draw
    var layer = event.layer;
    drawnItems.clearLayers(); //clear previous drawings
    drawnItems.addLayer(layer);
    drawnPolygonLayer = layer; // Store the drawn layer

    // Enable the download button
    document.getElementById('downloadTiles').disabled = false;
});

// Event listener for the download button
document.getElementById('downloadTiles').addEventListener('click', function () {
    if (drawnPolygonLayer) {
        downloadTiles(drawnPolygonLayer);
    }
});

document.getElementById('geojsonUpload').addEventListener('change', function (e) { //loading method for the user geojson
    var file = e.target.files[0];
    if (file) {
        var reader = new FileReader();
        reader.onload = function (event) {
            try {
                var geojson = JSON.parse(event.target.result);
                if (geojson.type === 'FeatureCollection' && geojson.features.length > 0) {
                    drawnItems.clearLayers();

                    let geojsonLayer = L.geoJSON(geojson); // Create a temporary GeoJSON layer

                    geojson.features.forEach(feature => {
                        if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
                            var layer = L.geoJSON(feature).getLayers()[0];
                            drawnItems.addLayer(layer);
                            drawnPolygonLayer = drawnItems;
                        }
                    });

                    if (drawnItems.getLayers().length > 0) {
                        map.fitBounds(geojsonLayer.getBounds()); // Set the map view to the GeoJSON bounds
                        document.getElementById('downloadTiles').disabled = false;
                    } else { //error checking help from ChatGPT/Gemini (used to have problems with this)
                        alert('Invalid GeoJSON file. Must contain at least one Polygon or MultiPolygon feature.');
                    }
                } else {
                    alert('Invalid GeoJSON file. Must be a FeatureCollection with at least one feature.');
                }
            } catch (error) {
                alert('Error parsing GeoJSON file: ' + error.message);
            }
        };
        reader.readAsText(file);
    }
});

async function downloadTiles(polygonLayer) { //tile downloading function
    var bounds = polygonLayer.getBounds();
    var zoom = prompt("Please Select a Zoom Level (1-19) **Note that higher zoom levels will decrease performance");

    // Convert zoom to a number
    zoom = parseInt(zoom);

    if (isNaN(zoom)) { //error proofing from ChatGPT/Gemini
        alert("Invalid zoom level. Please enter a number.");
        return; // Exit the function if zoom is not a number
    }

    if (zoom < 1 || zoom > 19) {
        alert("Zoom level must be between 1 and 19.");
        return;
    }

    // Get the currently active base layer
    var activeBaseLayer = null;
    for (var layerName in baseLayers) {
        if (map.hasLayer(baseLayers[layerName])) {
            activeBaseLayer = baseLayers[layerName];
            break;
        }
    }

    if (!activeBaseLayer) {
        console.error("No active base layer found.");
        return;
    }

    // Get the URL template of the active base layer
    var activeTileLayerUrl = activeBaseLayer._url;

    var tiles = calculateTileGrid(bounds, zoom);
    var tilePromises = tiles.map(async (tile) => {
        try {
            let url = activeTileLayerUrl;

            // Stadia Maps specific handling (needed Gemini to help proof for this case, but my stadia doesn't work anymore anyway - too many requests)
            if (activeTileLayerUrl.includes('stadiamaps.com')) {
                url = activeTileLayerUrl.replace('{z}', tile.z).replace('{x}', tile.x).replace('{y}', tile.y);
                //remove the {r} so that leaflet does not add @2x, because we are downloading directly.
                url = url.replace('{r}', '');
            } else {
                // Handle other tile layer URLs (OpenTopoMap, ESRI, etc.)
                if (activeTileLayerUrl.includes('{s}')) {
                    const subdomain = ['a', 'b', 'c'][Math.floor(Math.random() * 3)];
                    url = url.replace('{s}', subdomain);
                }
                url = url.replace('{z}', tile.z).replace('{y}', tile.y).replace('{x}', tile.x);
            }

            const response = await fetch(url); //more error proofing from Gemini (this gave issues at the beginning)
            if (response.status === 200) {
                return { tile, blob: await response.blob() };
            } else if (response.status === 404) {
                console.warn(`Tile not found: ${url}`);
                return null;
            } else {
                console.error(`Error fetching tile ${url}: ${response.status}`);
                return null;
            }
        } catch (error) {
            console.error('Network error fetching tile:', error);
            return null;
        }
    });

    Promise.all(tilePromises).then(async (results) => {
        const validResults = results.filter(result => result !== null);
        if (validResults.length === 0) {
            console.error("No valid tiles were downloaded.");
            return;
        }
        await mosaicTiles(validResults, polygonLayer, zoom);
        drawnItems.clearLayers();
        document.getElementById('downloadTiles').disabled = true;
        drawnPolygonLayer = null;
    });
}
async function mosaicTiles(tileDataArray, polygonLayer, zoom) { // This was debugged with Gemini, which also helped with the bounding logic
    const tileSize = 256;
    const minX = Math.min(...tileDataArray.map(item => item.tile.x));
    const minY = Math.min(...tileDataArray.map(item => item.tile.y));

    const maxX = Math.max(...tileDataArray.map(item => item.tile.x));
    const maxY = Math.max(...tileDataArray.map(item => item.tile.y));

    const canvasWidth = (maxX - minX + 1) * tileSize;
    const canvasHeight = (maxY - minY + 1) * tileSize;

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');

    const imagePromises = tileDataArray.map(async (tileData) => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const x = (tileData.tile.x - minX) * tileSize;
                const y = (tileData.tile.y - minY) * tileSize;
                ctx.drawImage(img, x, y);
                resolve();
            };
            img.onerror = () => reject(new Error(`Failed to load image for tile: ${tileData.tile.x}, ${tileData.tile.y}`));
            img.src = URL.createObjectURL(tileData.blob);
        });
    });

    Promise.all(imagePromises).then(() => { //downloads the chosen data
        clipCanvasToPolygon(canvas, ctx, polygonLayer, zoom); // Pass zoom here
        const dataURL = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataURL;
        link.download = 'clipped_image.png';
        link.click();
    }).catch(error => {
        console.error("Error mosaicing tiles:", error);
    });
}

function clipCanvasToPolygon(canvas, ctx, layerOrFeatureGroup, zoom) { //this whole chunck was itterated with help from ChatGPT. I will revise this later to better handle multipart clipping. 
    ctx.globalCompositeOperation = 'destination-in';

    let layers = [];
    if (layerOrFeatureGroup instanceof L.FeatureGroup) {
        layers = layerOrFeatureGroup.getLayers();
    } else if (layerOrFeatureGroup instanceof L.Polygon || layerOrFeatureGroup instanceof L.MultiPolygon) {
        layers = [layerOrFeatureGroup];
    } else {
        console.error("Invalid layer type in clipCanvasToPolygon:", layerOrFeatureGroup);
        return;
    }

    layers.forEach(polygonLayer => {
        if (polygonLayer instanceof L.Polygon || polygonLayer instanceof L.MultiPolygon) {
            ctx.beginPath();

            const bounds = polygonLayer.getBounds();
            const nw = bounds.getNorthWest();
            const se = bounds.getSouthEast();
            const tileSize = 256;

            const nwPoint = map.project(nw, zoom);
            const sePoint = map.project(se, zoom);

            const minX = Math.floor(nwPoint.x / tileSize);
            const minY = Math.floor(nwPoint.y / tileSize);

            polygonLayer.getLatLngs()[0].forEach(latlng => {
                const point = map.project(latlng, zoom);
                const x = point.x - (minX * tileSize);
                const y = point.y - (minY * tileSize);
                if (latlng === polygonLayer.getLatLngs()[0][0]) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            ctx.closePath();
            ctx.fill();
        }
    });
    ctx.globalCompositeOperation = 'source-over';
}

function calculateTileGrid(bounds, zoom) {
    var tiles = [];
    var tileSize = 256;

    var nw = bounds.getNorthWest();
    var se = bounds.getSouthEast();

    var nwPoint = map.project(nw, zoom);
    var sePoint = map.project(se, zoom);

    var minX = Math.floor(nwPoint.x / tileSize);
    var minY = Math.floor(nwPoint.y / tileSize);
    var maxX = Math.floor(sePoint.x / tileSize);
    var maxY = Math.floor(sePoint.y / tileSize);

    for (var x = minX; x <= maxX; x++) {
        for (var y = minY; y <= maxY; y++) {
            tiles.push({ x: x, y: y, z: zoom });
        }
    }
    return tiles;
}

var zoomDisplay = L.control({ position: 'bottomleft' }); //displays zoom for user's info
zoomDisplay.onAdd = function (map) {
    var div = L.DomUtil.create('div', 'zoom-display');
    div.innerHTML = 'Zoom: ' + map.getZoom();
    return div;
};
zoomDisplay.addTo(map);

// Update zoom display when zoom changes
map.on('zoomend', function () {
    document.querySelector('.zoom-display').innerHTML = 'Zoom: ' + map.getZoom();
});

document.getElementById('select-button').addEventListener('click', function() { //INDEV for data range selection
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    const timeframe = document.getElementById('timeframe').value;

    if (startDate && endDate) {
        alert(`Selected Range: ${startDate} to ${endDate} with Timeframe: ${timeframe}`);
        alert("This feature is still under development");
    } else {
        alert('Please select both a start and end date.');
    }
});
