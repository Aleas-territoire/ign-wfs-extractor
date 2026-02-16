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
    try {
        map = L.map('map').setView([46.603354, 1.888334], 6);
        
        L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(map);
        
        console.log('Carte initialisée avec succès');
    } catch (error) {
        console.error('Erreur lors de l\'initialisation de la carte:', error);
    }
}

// Recherche de communes avec autocomplétion
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM chargé');
    
    // Initialiser la carte
    initMap();
    updateInfo('<p>👋 Bienvenue ! Commencez par rechercher une commune ci-dessus.</p>');
    
    // Configurer la recherche de communes
    const communeSearch = document.getElementById('commune-search');
    const suggestionsDiv = document.getElementById('suggestions');
    
    if (!communeSearch) {
        console.error('Element commune-search non trouvé');
        return;
    }
    
    if (!suggestionsDiv) {
        console.error('Element suggestions non trouvé');
        return;
    }
    
    console.log('Éléments de recherche trouvés');
    
    let searchTimeout;
    
    communeSearch.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        
        if (query.length < 2) {
            suggestionsDiv.classList.remove('active');
            suggestionsDiv.innerHTML = '';
            return;
        }
        
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => searchCommunes(query), 300);
    });
    
    // Fermer les suggestions en cliquant ailleurs
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#commune-search') && !e.target.closest('#suggestions')) {
            suggestionsDiv.classList.remove('active');
        }
    });
    
    // Bouton d'extraction
    const extractBtn = document.getElementById('extract-btn');
    if (extractBtn) {
        extractBtn.addEventListener('click', extractWFSData);
        console.log('Bouton extraction configuré');
    }
    
    // Bouton d'export
    const exportBtn = document.getElementById('export-geojson');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportGeoJSON);
        console.log('Bouton export configuré');
    }
});

async function searchCommunes(query) {
    const suggestionsDiv = document.getElementById('suggestions');
    
    try {
        const response = await fetch(
            `${COMMUNE_API_URL}?nom=${encodeURIComponent(query)}&fields=nom,code,codesPostaux,centre,contour&format=json&geometry=contour&limit=10`
        );
        
        if (!response.ok) {
            throw new Error('Erreur de recherche');
        }
        
        const communes = await response.json();
        console.log('Communes trouvées:', communes.length);
        
        displaySuggestions(communes);
    } catch (error) {
        console.error('Erreur recherche communes:', error);
        showStatus('Erreur lors de la recherche de communes', 'error');
    }
}

function displaySuggestions(communes) {
    const suggestionsDiv = document.getElementById('suggestions');
    
    if (communes.length === 0) {
        suggestionsDiv.classList.remove('active');
        suggestionsDiv.innerHTML = '';
        return;
    }
    
    suggestionsDiv.innerHTML = '';
    
    communes.forEach(commune => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.innerHTML = `
            <strong>${commune.nom}</strong> (${commune.code})
            ${commune.codesPostaux ? `<br><small>${commune.codesPostaux.join(', ')}</small>` : ''}
        `;
        
        div.addEventListener('click', () => {
            selectCommune(commune);
        });
        
        suggestionsDiv.appendChild(div);
    });
    
    suggestionsDiv.classList.add('active');
}

function selectCommune(commune) {
    console.log('Commune sélectionnée:', commune.nom);
    
    selectedCommune = commune;
    
    const communeSearch = document.getElementById('commune-search');
    communeSearch.value = `${commune.nom} (${commune.code})`;
    
    const suggestionsDiv = document.getElementById('suggestions');
    suggestionsDiv.classList.remove('active');
    suggestionsDiv.innerHTML = '';
    
    // Afficher la commune sur la carte
    if (communeLayer) {
        map.removeLayer(communeLayer);
    }
    
    try {
        if (commune.contour) {
            communeLayer = L.geoJSON(commune.contour, {
                style: {
                    color: '#3388ff',
                    weight: 3,
                    fillOpacity: 0.1
                }
            }).addTo(map);
            
            map.fitBounds(communeLayer.getBounds());
            console.log('Contour de la commune affiché');
        } else if (commune.centre) {
            const coords = commune.centre.coordinates;
            map.setView([coords[1], coords[0]], 13);
            console.log('Centré sur la commune');
        }
    } catch (error) {
        console.error('Erreur affichage commune:', error);
    }
    
    updateInfo(`Commune sélectionnée : <strong>${commune.nom}</strong><br>Code INSEE : ${commune.code}`);
}

async function extractWFSData() {
    console.log('Début extraction');
    
    if (!selectedCommune) {
        showStatus('Veuillez d\'abord sélectionner une commune', 'error');
        return;
    }
    
    const layer = document.getElementById('layer-select').value;
    const featureLimit = document.getElementById('feature-limit').value;
    const useSpatialFilter = document.getElementById('spatial-filter').checked;
    
    console.log('Couche:', layer);
    console.log('Limite:', featureLimit);
    console.log('Filtrage spatial:', useSpatialFilter);
    
    // Avertissement pour les grandes extractions
    if (featureLimit === 'unlimited' || parseInt(featureLimit) > 25000) {
        const confirmed = confirm(
            `Vous allez extraire jusqu'à ${featureLimit === 'unlimited' ? 'un nombre illimité' : featureLimit} d'entités.\n\nCela peut prendre du temps.\n\nVoulez-vous continuer ?`
        );
        
        if (!confirmed) {
            return;
        }
    }
    
    showStatus('Extraction des données en cours...', 'loading');
    
    try {
        // Obtenir la bbox de la commune
        const bounds = getBBoxFromCommune(selectedCommune);
        
        if (!bounds) {
            throw new Error('Impossible de déterminer les limites de la commune');
        }
        
        console.log('BBOX principale:', bounds);
        
        const maxLimit = featureLimit === 'unlimited' ? 1000000 : parseInt(featureLimit);
        
        // Stratégie de subdivision spatiale pour contourner les limites serveur
        const allFeatures = await extractWithSpatialSubdivision(layer, bounds, maxLimit);
        
        console.log(`Total récupéré: ${allFeatures.length} features`);
        
        if (allFeatures.length === 0) {
            showStatus('Aucune donnée trouvée pour cette commune et cette couche', 'error');
            updateInfo(`
                <strong>Aucun résultat</strong><br>
                Commune : ${selectedCommune.nom}<br>
                Couche : ${layer.split(':')[1]}<br>
                <small>Essayez une autre couche.</small>
            `);
            return;
        }
        
        // Supprimer les doublons (features avec même ID)
        const uniqueFeatures = removeDuplicateFeatures(allFeatures);
        console.log(`Après dédoublonnage: ${uniqueFeatures.length} features uniques`);
        
        const allData = {
            type: 'FeatureCollection',
            features: uniqueFeatures
        };
        
        // Filtrage spatial si activé
        let filteredData = allData;
        let removedCount = 0;
        
        if (useSpatialFilter && selectedCommune.contour) {
            showStatus('Filtrage spatial en cours...', 'loading');
            console.log('Application du filtrage spatial avec Turf.js');
            
            const result = filterByCommuneBoundary(allData, selectedCommune.contour);
            filteredData = result.filteredData;
            removedCount = result.removedCount;
            
            console.log(`Filtrage terminé: ${removedCount} entités hors commune supprimées`);
        }
        
        extractedData = filteredData;
        displayExtractedData(filteredData);
        
        const count = filteredData.features.length;
        let statusMessage = `✅ ${count.toLocaleString('fr-FR')} entité(s) extraite(s)`;
        
        if (useSpatialFilter && removedCount > 0) {
            statusMessage += ` (${removedCount} filtrée(s))`;
        }
        
        showStatus(statusMessage, 'success');
        
        document.getElementById('export-geojson').disabled = false;
        
        let infoMessage = `
            <strong>Extraction réussie !</strong><br>
            Commune : ${selectedCommune.nom}<br>
            Couche : ${layer.split(':')[1]}<br>
            Entités récupérées : ${uniqueFeatures.length.toLocaleString('fr-FR')}<br>
            Entités dans la commune : ${count.toLocaleString('fr-FR')}
        `;
        
        if (useSpatialFilter && removedCount > 0) {
            infoMessage += `<br><span style="color: #f39c12;">Entités filtrées (hors commune) : ${removedCount.toLocaleString('fr-FR')}</span>`;
        }
        
        updateInfo(infoMessage);
        
    } catch (error) {
        console.error('Erreur extraction:', error);
        showStatus(`Erreur : ${error.message}`, 'error');
    }
}

// Fonction pour subdiviser l'espace et extraire les données
async function extractWithSpatialSubdivision(layer, bounds, maxLimit) {
    const allFeatures = [];
    const MAX_FEATURES_PER_REQUEST = 10000; // Limite serveur estimée
    
    // Commencer par essayer avec la bbox complète
    console.log('Tentative d\'extraction avec bbox complète...');
    const initialFeatures = await extractFromBBox(layer, bounds, MAX_FEATURES_PER_REQUEST);
    
    // Si on a moins que la limite, on a tout récupéré
    if (initialFeatures.length < MAX_FEATURES_PER_REQUEST && initialFeatures.length < maxLimit) {
        console.log('Extraction complète avec une seule requête');
        return initialFeatures;
    }
    
    console.log(`${initialFeatures.length} features récupérées, subdivision nécessaire...`);
    
    // Sinon, subdiviser en grille 2x2
    const subBBoxes = subdivideBBox(bounds, 2, 2);
    console.log(`Subdivision en ${subBBoxes.length} sous-zones`);
    
    for (let i = 0; i < subBBoxes.length; i++) {
        if (allFeatures.length >= maxLimit) {
            console.log(`Limite de ${maxLimit} atteinte, arrêt de l'extraction`);
            break;
        }
        
        const subBBox = subBBoxes[i];
        showStatus(
            `Extraction zone ${i + 1}/${subBBoxes.length}... ${allFeatures.length.toLocaleString('fr-FR')} entité(s)`,
            'loading'
        );
        
        const features = await extractFromBBox(layer, subBBox, maxLimit - allFeatures.length);
        allFeatures.push(...features);
        
        console.log(`Zone ${i + 1}/${subBBoxes.length}: ${features.length} features (total: ${allFeatures.length})`);
        
        // Petite pause entre les requêtes
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return allFeatures;
}

// Subdiviser une bbox en grille
function subdivideBBox(bounds, cols, rows) {
    const subBBoxes = [];
    const width = (bounds.maxLon - bounds.minLon) / cols;
    const height = (bounds.maxLat - bounds.minLat) / rows;
    
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            subBBoxes.push({
                minLon: bounds.minLon + col * width,
                maxLon: bounds.minLon + (col + 1) * width,
                minLat: bounds.minLat + row * height,
                maxLat: bounds.minLat + (row + 1) * height
            });
        }
    }
    
    return subBBoxes;
}

// Extraire les features d'une bbox donnée avec pagination
async function extractFromBBox(layer, bounds, maxFeatures) {
    const allFeatures = [];
    let startIndex = 0;
    const batchSize = 1000;
    
    const bboxString = `${bounds.minLon},${bounds.minLat},${bounds.maxLon},${bounds.maxLat},EPSG:4326`;
    
    while (allFeatures.length < maxFeatures) {
        try {
            const params = new URLSearchParams({
                service: 'WFS',
                version: '2.0.0',
                request: 'GetFeature',
                typeName: layer,
                outputFormat: 'application/json',
                srsName: 'EPSG:4326',
                bbox: bboxString,
                startIndex: startIndex.toString(),
                count: Math.min(batchSize, maxFeatures - allFeatures.length).toString()
            });
            
            const url = `${WFS_URL}?${params.toString()}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                console.error(`Erreur HTTP ${response.status}`);
                break;
            }
            
            const data = await response.json();
            const featuresCount = data.features ? data.features.length : 0;
            
            if (featuresCount === 0) {
                break;
            }
            
            allFeatures.push(...data.features);
            
            // Si on a reçu moins que batchSize, c'est la dernière page
            if (featuresCount < batchSize) {
                break;
            }
            
            startIndex += batchSize;
            
            // Pause entre requêtes
            await new Promise(resolve => setTimeout(resolve, 100));
            
        } catch (error) {
            console.error('Erreur lors de l\'extraction:', error);
            break;
        }
    }
    
    return allFeatures;
}

// Supprimer les doublons basés sur l'ID
function removeDuplicateFeatures(features) {
    const seen = new Set();
    const unique = [];
    
    features.forEach(feature => {
        // Utiliser l'ID de la feature si disponible, sinon créer une clé unique
        const id = feature.id || feature.properties?.id || JSON.stringify(feature.geometry);
        
        if (!seen.has(id)) {
            seen.add(id);
            unique.push(feature);
        }
    });
    
    return unique;
}

function filterByCommuneBoundary(data, communeBoundary) {
    // Convertir le contour de la commune en polygon Turf
    let communePolygon;
    try {
        // Gérer les MultiPolygon et Polygon
        if (communeBoundary.type === 'MultiPolygon') {
            communePolygon = turf.multiPolygon(communeBoundary.coordinates);
        } else {
            communePolygon = turf.polygon(communeBoundary.coordinates);
        }
    } catch (error) {
        console.error('Erreur création polygone commune:', error);
        return { filteredData: data, removedCount: 0 };
    }
    
    const filteredFeatures = [];
    let removedCount = 0;
    
    data.features.forEach((feature, index) => {
        try {
            let isInside = false;
            
            if (!feature.geometry) {
                console.warn('Feature sans géométrie ignorée:', index);
                return;
            }
            
            // Gérer différents types de géométries
            if (feature.geometry.type === 'Point') {
                const point = turf.point(feature.geometry.coordinates);
                isInside = turf.booleanPointInPolygon(point, communePolygon);
            } else if (feature.geometry.type === 'MultiPoint') {
                isInside = feature.geometry.coordinates.some(coord => {
                    const point = turf.point(coord);
                    return turf.booleanPointInPolygon(point, communePolygon);
                });
            } else if (feature.geometry.type === 'LineString') {
                const line = turf.lineString(feature.geometry.coordinates);
                isInside = turf.booleanIntersects(line, communePolygon);
            } else if (feature.geometry.type === 'MultiLineString') {
                const multiLine = turf.multiLineString(feature.geometry.coordinates);
                isInside = turf.booleanIntersects(multiLine, communePolygon);
            } else if (feature.geometry.type === 'Polygon') {
                const polygon = turf.polygon(feature.geometry.coordinates);
                isInside = turf.booleanIntersects(polygon, communePolygon);
            } else if (feature.geometry.type === 'MultiPolygon') {
                const multiPolygon = turf.multiPolygon(feature.geometry.coordinates);
                isInside = turf.booleanIntersects(multiPolygon, communePolygon);
            } else {
                console.warn('Type de géométrie non supporté:', feature.geometry.type);
                isInside = true;
            }
            
            if (isInside) {
                filteredFeatures.push(feature);
            } else {
                removedCount++;
            }
        } catch (error) {
            console.warn('Erreur lors du filtrage spatial d\'une entité (index ' + index + '):', error);
            filteredFeatures.push(feature);
        }
    });
    
    console.log(`Filtrage: ${filteredFeatures.length} conservées, ${removedCount} supprimées`);
    
    return {
        filteredData: {
            type: 'FeatureCollection',
            features: filteredFeatures
        },
        removedCount: removedCount
    };
}

function getBBoxFromCommune(commune) {
    if (!commune.contour) {
        if (commune.centre) {
            const [lon, lat] = commune.centre.coordinates;
            const delta = 0.05;
            return {
                minLon: lon - delta,
                minLat: lat - delta,
                maxLon: lon + delta,
                maxLat: lat + delta
            };
        }
        return null;
    }
    
    let minLon = Infinity, minLat = Infinity;
    let maxLon = -Infinity, maxLat = -Infinity;
    
    const processCoords = (coords) => {
        coords.forEach(coord => {
            if (Array.isArray(coord[0])) {
                processCoords(coord);
            } else {
                const [lon, lat] = coord;
                minLon = Math.min(minLon, lon);
                minLat = Math.min(minLat, lat);
                maxLon = Math.max(maxLon, lon);
                maxLat = Math.max(maxLat, lat);
            }
        });
    };
    
    processCoords(commune.contour.coordinates);
    
    return { minLon, minLat, maxLon, maxLat };
}

function displayExtractedData(data) {
    console.log('Affichage des données');
    
    if (extractedDataLayer) {
        map.removeLayer(extractedDataLayer);
    }
    
    const layerType = document.getElementById('layer-select').value.split(':')[1];
    const style = getStyleForLayer(layerType);
    
    extractedDataLayer = L.geoJSON(data, {
        style: style.style,
        pointToLayer: (feature, latlng) => {
            return L.circleMarker(latlng, style.pointStyle);
        },
        onEachFeature: (feature, layer) => {
            const props = feature.properties;
            let content = `<div style="max-width: 300px;"><h4 style="color: #008B8B;">${layerType}</h4>`;
            
            let count = 0;
            for (const [key, value] of Object.entries(props)) {
                if (value && count < 10) {
                    content += `<div><strong>${key}:</strong> ${value}</div>`;
                    count++;
                }
            }
            
            content += '</div>';
            layer.bindPopup(content);
        }
    }).addTo(map);
    
    if (extractedDataLayer.getBounds().isValid()) {
        map.fitBounds(extractedDataLayer.getBounds(), { padding: [50, 50] });
    }
    
    updateLegend(layerType, style);
}

function getStyleForLayer(layerType) {
    const styles = {
        batiment: {
            style: { color: '#e74c3c', weight: 1, fillOpacity: 0.5, fillColor: '#e74c3c' },
            pointStyle: { radius: 5, fillColor: '#e74c3c', color: '#c0392b', weight: 1, fillOpacity: 0.7 }
        },
        commune: {
            style: { color: '#34495e', weight: 2, fillOpacity: 0.1, fillColor: '#34495e' },
            pointStyle: { radius: 5, fillColor: '#34495e', color: '#2c3e50', weight: 1, fillOpacity: 0.7 }
        },
        troncon_de_route: {
            style: { color: '#e67e22', weight: 2, fillOpacity: 0 },
            pointStyle: { radius: 4, fillColor: '#e67e22', color: '#d35400', weight: 1, fillOpacity: 0.7 }
        },
        troncon_hydrographique: {
            style: { color: '#3498db', weight: 2, fillOpacity: 0 },
            pointStyle: { radius: 4, fillColor: '#3498db', color: '#2980b9', weight: 1, fillOpacity: 0.7 }
        },
        plan_d_eau: {
            style: { color: '#3498db', weight: 1, fillOpacity: 0.4, fillColor: '#3498db' },
            pointStyle: { radius: 5, fillColor: '#3498db', color: '#2980b9', weight: 1, fillOpacity: 0.7 }
        },
        zone_de_vegetation: {
            style: { color: '#27ae60', weight: 1, fillOpacity: 0.4, fillColor: '#27ae60' },
            pointStyle: { radius: 5, fillColor: '#27ae60', color: '#229954', weight: 1, fillOpacity: 0.7 }
        },
        ligne_electrique: {
            style: { color: '#8e44ad', weight: 2, fillOpacity: 0, dashArray: '5, 5' },
            pointStyle: { radius: 4, fillColor: '#8e44ad', color: '#7d3c98', weight: 1, fillOpacity: 0.7 }
        },
        construction_lineaire: {
            style: { color: '#95a5a6', weight: 2, fillOpacity: 0 },
            pointStyle: { radius: 4, fillColor: '#95a5a6', color: '#7f8c8d', weight: 1, fillOpacity: 0.7 }
        },
        reservoir: {
            style: { color: '#16a085', weight: 1, fillOpacity: 0.5, fillColor: '#16a085' },
            pointStyle: { radius: 5, fillColor: '#16a085', color: '#138d75', weight: 1, fillOpacity: 0.7 }
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
            <span>${layerType.replace(/_/g, ' ')}</span>
        </div>
    `;
}

function exportGeoJSON() {
    if (!extractedData) return;
    
    const dataStr = JSON.stringify(extractedData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const layerName = document.getElementById('layer-select').value.split(':')[1];
    const fileName = `${selectedCommune.nom.replace(/[^a-z0-9]/gi, '_')}_${layerName}.geojson`;
    
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    
    URL.revokeObjectURL(url);
    showStatus('✅ Fichier téléchargé !', 'success');
}

function showStatus(message, type) {
    const status = document.getElementById('status');
    if (status) {
        status.textContent = message;
        status.className = `status active ${type}`;
        
        if (type === 'success') {
            setTimeout(() => {
                status.classList.remove('active');
            }, 5000);
        }
    }
}

function updateInfo(html) {
    const infoContent = document.getElementById('info-content');
    if (infoContent) {
        infoContent.innerHTML = html;
    }
}
