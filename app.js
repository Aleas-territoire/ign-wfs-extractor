// Configuration
const WFS_URL = 'https://data.geopf.fr/wfs/ows';
const COMMUNE_API_URL = 'https://geo.api.gouv.fr/communes';

// Variables globales
let map;
let selectedCommune = null;
let communeLayer = null;
let extractedDataLayer = null;
let extractedData = null;

// Initialisation de la carte
function initMap() {
    map = L.map('map').setView([46.603354, 1.888334], 6);
    
    L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);
}

// Recherche de communes avec autocomplétion
const communeSearch = document.getElementById('commune-search');
const suggestionsDiv = document.getElementById('suggestions');
let searchTimeout;

communeSearch.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    
    if (query.length < 2) {
        suggestionsDiv.classList.remove('active');
        return;
    }
    
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => searchCommunes(query), 300);
});

async function searchCommunes(query) {
    try {
        const response = await fetch(
            `${COMMUNE_API_URL}?nom=${encodeURIComponent(query)}&fields=nom,code,codesPostaux,centre,contour&format=json&geometry=contour&limit=10`
        );
        
        if (!response.ok) throw new Error('Erreur de recherche');
        
        const communes = await response.json();
        displaySuggestions(communes);
    } catch (error) {
        console.error('Erreur recherche communes:', error);
        showStatus('Erreur lors de la recherche de communes', 'error');
    }
}

function displaySuggestions(communes) {
    if (communes.length === 0) {
        suggestionsDiv.classList.remove('active');
        return;
    }
    
    suggestionsDiv.innerHTML = communes.map(commune => `
        <div class="suggestion-item" data-commune='${JSON.stringify(commune)}'>
            <strong>${commune.nom}</strong> (${commune.code})
            ${commune.codesPostaux ? `<br><small>${commune.codesPostaux.join(', ')}</small>` : ''}
        </div>
    `).join('');
    
    suggestionsDiv.classList.add('active');
    
    // Gestion des clics sur les suggestions
    document.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
            const commune = JSON.parse(item.dataset.commune);
            selectCommune(commune);
        });
    });
}

function selectCommune(commune) {
    selectedCommune = commune;
    communeSearch.value = `${commune.nom} (${commune.code})`;
    suggestionsDiv.classList.remove('active');
    
    // Afficher la commune sur la carte
    if (communeLayer) {
        map.removeLayer(communeLayer);
    }
    
    if (commune.contour) {
        communeLayer = L.geoJSON(commune.contour, {
            style: {
                color: '#3388ff',
                weight: 3,
                fillOpacity: 0.1
            }
        }).addTo(map);
        
        map.fitBounds(communeLayer.getBounds());
    } else if (commune.centre) {
        map.setView([commune.centre.coordinates[1], commune.centre.coordinates[0]], 13);
    }
    
    updateInfo(`Commune sélectionnée : <strong>${commune.nom}</strong><br>Code INSEE : ${commune.code}`);
}

// Fermer les suggestions en cliquant ailleurs
document.addEventListener('click', (e) => {
    if (!e.target.closest('#commune-search') && !e.target.closest('#suggestions')) {
        suggestionsDiv.classList.remove('active');
    }
});

// Extraction des données WFS
document.getElementById('extract-btn').addEventListener('click', extractWFSData);

async function extractWFSData() {
    if (!selectedCommune) {
        showStatus('Veuillez d\'abord sélectionner une commune', 'error');
        return;
    }
    
    const layer = document.getElementById('layer-select').value;
    const limitFeatures = document.getElementById('limit-features').checked;
    
    showStatus('Extraction des données en cours...', 'loading');
    
    try {
        // Construire la requête WFS avec filtre géométrique
        const bbox = getBBoxFromCommune(selectedCommune);
        
        const params = new URLSearchParams({
            service: 'WFS',
            version: '2.0.0',
            request: 'GetFeature',
            typename: layer,
            outputFormat: 'application/json',
            srsName: 'EPSG:4326'
        });
        
        if (bbox) {
            params.append('bbox', bbox);
        }
        
        if (limitFeatures) {
            params.append('count', '1000');
        }
        
        const url = `${WFS_URL}?${params.toString()}`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.features || data.features.length === 0) {
            showStatus('Aucune donnée trouvée pour cette commune et cette couche', 'error');
            return;
        }
        
        // Filtrer les données qui intersectent réellement la commune
        const filteredData = filterDataByCommune(data, selectedCommune);
        
        displayExtractedData(filteredData);
        extractedData = filteredData;
        
        showStatus(
            `✅ ${filteredData.features.length} entité(s) extraite(s) avec succès`,
            'success'
        );
        
        document.getElementById('export-geojson').disabled = false;
        
        // Mettre à jour les informations
        updateInfo(`
            <strong>Extraction réussie !</strong><br>
            Commune : ${selectedCommune.nom}<br>
            Couche : ${layer.split(':')[1]}<br>
            Nombre d'entités : ${filteredData.features.length}
        `);
        
    } catch (error) {
        console.error('Erreur extraction WFS:', error);
        showStatus(`Erreur lors de l'extraction : ${error.message}`, 'error');
    }
}

function getBBoxFromCommune(commune) {
    if (!commune.contour) return null;
    
    const coordinates = commune.contour.coordinates[0];
    let minLon = Infinity, minLat = Infinity;
    let maxLon = -Infinity, maxLat = -Infinity;
    
    coordinates.forEach(coord => {
        const [lon, lat] = coord;
        minLon = Math.min(minLon, lon);
        minLat = Math.min(minLat, lat);
        maxLon = Math.max(maxLon, lon);
        maxLat = Math.max(maxLat, lat);
    });
    
    return `${minLon},${minLat},${maxLon},${maxLat}`;
}

function filterDataByCommune(data, commune) {
    if (!commune.contour) return data;
    
    // Filtrage simple basé sur l'intersection des bbox
    // Pour un filtrage plus précis, utiliser une bibliothèque comme Turf.js
    const filteredFeatures = data.features;
    
    return {
        type: 'FeatureCollection',
        features: filteredFeatures
    };
}

function displayExtractedData(data) {
    // Supprimer la couche précédente
    if (extractedDataLayer) {
        map.removeLayer(extractedDataLayer);
    }
    
    // Déterminer le style selon le type de géométrie
    const layerType = document.getElementById('layer-select').value.split(':')[1];
    const style = getStyleForLayer(layerType);
    
    extractedDataLayer = L.geoJSON(data, {
        style: style.style,
        pointToLayer: (feature, latlng) => {
            return L.circleMarker(latlng, style.pointStyle);
        },
        onEachFeature: (feature, layer) => {
            // Popup avec les propriétés
            const props = feature.properties;
            let popupContent = '<div style="max-width: 300px;">';
            
            for (const [key, value] of Object.entries(props)) {
                if (value && key !== 'geometry') {
                    popupContent += `<strong>${key}:</strong> ${value}<br>`;
                }
            }
            
            popupContent += '</div>';
            layer.bindPopup(popupContent);
        }
    }).addTo(map);
    
    // Zoomer sur les données
    if (extractedDataLayer.getBounds().isValid()) {
        map.fitBounds(extractedDataLayer.getBounds());
    }
    
    // Mettre à jour la légende
    updateLegend(layerType, style);
}

function getStyleForLayer(layerType) {
    const styles = {
        batiment: {
            style: { color: '#e74c3c', weight: 1, fillOpacity: 0.5, fillColor: '#e74c3c' },
            pointStyle: { radius: 5, fillColor: '#e74c3c', color: '#c0392b', weight: 1, fillOpacity: 0.7 }
        },
        route: {
            style: { color: '#f39c12', weight: 3, fillOpacity: 0 },
            pointStyle: { radius: 4, fillColor: '#f39c12', color: '#e67e22', weight: 1, fillOpacity: 0.7 }
        },
        cours_d_eau: {
            style: { color: '#3498db', weight: 2, fillOpacity: 0.3, fillColor: '#3498db' },
            pointStyle: { radius: 4, fillColor: '#3498db', color: '#2980b9', weight: 1, fillOpacity: 0.7 }
        },
        surface_hydrographique: {
            style: { color: '#3498db', weight: 1, fillOpacity: 0.4, fillColor: '#3498db' },
            pointStyle: { radius: 5, fillColor: '#3498db', color: '#2980b9', weight: 1, fillOpacity: 0.7 }
        },
        zone_de_vegetation: {
            style: { color: '#27ae60', weight: 1, fillOpacity: 0.4, fillColor: '#27ae60' },
            pointStyle: { radius: 5, fillColor: '#27ae60', color: '#229954', weight: 1, fillOpacity: 0.7 }
        },
        default: {
            style: { color: '#9b59b6', weight: 2, fillOpacity: 0.3, fillColor: '#9b59b6' },
            pointStyle: { radius: 5, fillColor: '#9b59b6', color: '#8e44ad', weight: 1, fillOpacity: 0.7 }
        }
    };
    
    return styles[layerType] || styles.default;
}

function updateLegend(layerType, style) {
    const legendContent = document.getElementById('legend-content');
    const color = style.style.color || style.pointStyle.fillColor;
    
    legendContent.innerHTML = `
        <div class="legend-item">
            <span class="legend-color" style="background: #3388ff;"></span>
            <span>Commune</span>
        </div>
        <div class="legend-item">
            <span class="legend-color" style="background: ${color};"></span>
            <span>${layerType}</span>
        </div>
    `;
}

// Export GeoJSON
document.getElementById('export-geojson').addEventListener('click', () => {
    if (!extractedData) return;
    
    const dataStr = JSON.stringify(extractedData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedCommune.nom}_${document.getElementById('layer-select').value.split(':')[1]}.geojson`;
    a.click();
    
    URL.revokeObjectURL(url);
    
    showStatus('Fichier GeoJSON téléchargé !', 'success');
});

// Fonctions utilitaires
function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status active ${type}`;
    
    if (type === 'success') {
        setTimeout(() => {
            status.classList.remove('active');
        }, 5000);
    }
}

function updateInfo(html) {
    document.getElementById('info-content').innerHTML = html;
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    updateInfo('<p>👋 Bienvenue ! Commencez par rechercher une commune ci-dessus.</p>');
});