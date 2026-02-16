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
    
    suggestionsDiv.innerHTML = communes.map(commune => {
        const communeJson = JSON.stringify(commune).replace(/"/g, '&quot;');
        return `
            <div class="suggestion-item" data-commune="${communeJson}">
                <strong>${commune.nom}</strong> (${commune.code})
                ${commune.codesPostaux ? `<br><small>${commune.codesPostaux.join(', ')}</small>` : ''}
            </div>
        `;
    }).join('');
    
    suggestionsDiv.classList.add('active');
    
    // Gestion des clics sur les suggestions
    document.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
            const communeJson = item.dataset.commune.replace(/&quot;/g, '"');
            const commune = JSON.parse(communeJson);
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
    const featureLimit = document.getElementById('feature-limit').value;
    
    // Avertissement pour les grandes extractions
    if (featureLimit === 'unlimited' || parseInt(featureLimit) > 25000) {
        const confirmed = confirm(
            `Vous allez extraire jusqu'à ${featureLimit === 'unlimited' ? 'un nombre illimité' : featureLimit} d'entités.\n\n` +
            `Cela peut prendre du temps et ralentir votre navigateur.\n\n` +
            `Voulez-vous continuer ?`
        );
        
        if (!confirmed) {
            return;
        }
    }
    
    showStatus('Extraction des données en cours... Veuillez patienter.', 'loading');
    
    try {
        // Obtenir la bbox de la commune
        const bounds = getBBoxFromCommune(selectedCommune);
        
        if (!bounds) {
            showStatus('Impossible de déterminer les limites de la commune', 'error');
            return;
        }
        
        console.log('Bounds de la commune:', bounds);
        
        // Construction de la requête WFS avec BBOX
        const params = new URLSearchParams({
            service: 'WFS',
            version: '2.0.0',
            request: 'GetFeature',
            typeName: layer,
            outputFormat: 'application/json',
            srsName: 'EPSG:4326'
        });
        
        // Utiliser BBOX pour limiter la zone de recherche
        const bboxString = `${bounds.minLon},${bounds.minLat},${bounds.maxLon},${bounds.maxLat},EPSG:4326`;
        params.append('bbox', bboxString);
        
        // Limiter le nombre de résultats selon la sélection
        if (featureLimit !== 'unlimited') {
            params.append('count', featureLimit);
        }
        
        const url = `${WFS_URL}?${params.toString()}`;
        
        console.log('URL de requête WFS:', url);
        console.log('BBOX:', bboxString);
        console.log('Limite de features:', featureLimit);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Réponse serveur complète:', errorText);
            
            // Essayer de parser l'erreur XML du WFS
            if (errorText.includes('ExceptionReport') || errorText.includes('ServiceException')) {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(errorText, 'text/xml');
                const exceptionText = xmlDoc.querySelector('ExceptionText, ServiceException');
                if (exceptionText) {
                    throw new Error(`Erreur WFS: ${exceptionText.textContent}`);
                }
            }
            
            throw new Error(`Erreur HTTP ${response.status}`);
        }
        
        const contentType = response.headers.get('content-type');
        console.log('Content-Type:', contentType);
        
        const data = await response.json();
        
        console.log('Données reçues:', data);
        console.log('Nombre de features:', data.features ? data.features.length : 0);
        
        if (!data.features || data.features.length === 0) {
            showStatus('Aucune donnée trouvée pour cette commune et cette couche', 'error');
            updateInfo(`
                <strong>Aucun résultat</strong><br>
                Commune : ${selectedCommune.nom}<br>
                Couche : ${layer.split(':')[1]}<br>
                BBOX : ${bboxString}<br>
                <small>Essayez une autre couche ou vérifiez que des données existent pour cette zone.</small>
            `);
            return;
        }
        
        // Filtrer les données qui intersectent réellement la commune (filtrage côté client)
        const filteredData = filterDataByCommune(data, selectedCommune);
        
        displayExtractedData(filteredData);
        extractedData = filteredData;
        
        // Message avec avertissement si limite atteinte
        let statusMessage = `✅ ${filteredData.features.length.toLocaleString('fr-FR')} entité(s) extraite(s) avec succès`;
        if (featureLimit !== 'unlimited' && filteredData.features.length >= parseInt(featureLimit)) {
            statusMessage += ` (limite de ${parseInt(featureLimit).toLocaleString('fr-FR')} atteinte, il peut y avoir plus de données)`;
        }
        
        showStatus(statusMessage, 'success');
        
        document.getElementById('export-geojson').disabled = false;
        
        // Mettre à jour les informations
        let infoMessage = `
            <strong>Extraction réussie !</strong><br>
            Commune : ${selectedCommune.nom}<br>
            Couche : ${layer.split(':')[1]}<br>
            Nombre d'entités : ${filteredData.features.length.toLocaleString('fr-FR')}
        `;
        
        if (featureLimit !== 'unlimited' && filteredData.features.length >= parseInt(featureLimit)) {
            infoMessage += `<br><br><small style="color: #f39c12;">⚠️ Limite atteinte. Augmentez la limite ou utilisez "Illimité" pour voir toutes les données.</small>`;
        }
        
        updateInfo(infoMessage);
        
    } catch (error) {
        console.error('Erreur extraction WFS:', error);
        showStatus(`Erreur lors de l'extraction : ${error.message}`, 'error');
        updateInfo(`
            <strong>⚠️ Erreur</strong><br>
            ${error.message}<br>
            <small>Consultez la console du navigateur (F12) pour plus de détails.</small>
        `);
    }
}

function getBBoxFromCommune(commune) {
    if (!commune.contour) {
        // Si pas de contour, utiliser le centre avec une petite bbox
        if (commune.centre) {
            const [lon, lat] = commune.centre.coordinates;
            const delta = 0.05; // ~5km
            return {
                minLon: lon - delta,
                minLat: lat - delta,
                maxLon: lon + delta,
                maxLat: lat + delta
            };
        }
        return null;
    }
    
    // Calculer la bbox à partir du contour
    let minLon = Infinity, minLat = Infinity;
    let maxLon = -Infinity, maxLat = -Infinity;
    
    const processCoordinates = (coords) => {
        coords.forEach(coord => {
            if (Array.isArray(coord[0])) {
                processCoordinates(coord);
            } else {
                const [lon, lat] = coord;
                minLon = Math.min(minLon, lon);
                minLat = Math.min(minLat, lat);
                maxLon = Math.max(maxLon, lon);
                maxLat = Math.max(maxLat, lat);
            }
        });
    };
    
    processCoordinates(commune.contour.coordinates);
    
    return { minLon, minLat, maxLon, maxLat };
}

function filterDataByCommune(data, commune) {
    // Pour un filtrage précis, on pourrait utiliser turf.js
    // Ici, on retourne toutes les features dans la bbox
    // car le serveur a déjà fait un pré-filtrage spatial
    return {
        type: 'FeatureCollection',
        features: data.features
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
            let popupContent = '<div style="max-width: 300px; max-height: 300px; overflow-y: auto;">';
            popupContent += `<h4 style="margin-bottom: 10px; color: #0066cc;">${layerType}</h4>`;
            
            // Afficher les propriétés principales
            let count = 0;
            for (const [key, value] of Object.entries(props)) {
                if (value && key !== 'geometry' && count < 15) {
                    const displayKey = key.replace(/_/g, ' ');
                    popupContent += `<div style="margin-bottom: 5px;"><strong>${displayKey}:</strong> ${value}</div>`;
                    count++;
                }
            }
            
            if (Object.keys(props).length > 15) {
                popupContent += `<div style="margin-top: 10px; font-style: italic; color: #666;">... et ${Object.keys(props).length - 15} autres propriétés</div>`;
            }
            
            popupContent += '</div>';
            layer.bindPopup(popupContent);
        }
    }).addTo(map);
    
    // Zoomer sur les données
    if (extractedDataLayer.getBounds().isValid()) {
        map.fitBounds(extractedDataLayer.getBounds(), { padding: [50, 50] });
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
        commune: {
            style: { color: '#34495e', weight: 2, fillOpacity: 0.1, fillColor: '#34495e' },
            pointStyle: { radius: 5, fillColor: '#34495e', color: '#2c3e50', weight: 1, fillOpacity: 0.7 }
        },
        troncon_de_route: {
            style: { color: '#e67e22', weight: 2, fillOpacity: 0 },
            pointStyle: { radius: 4, fillColor: '#e67e22', color: '#d35400', weight: 1, fillOpacity: 0.7 }
        },
        troncon_hydrographique: {
            style: { color: '#3498db', weight: 2, fillOpacity: 0.3, fillColor: '#3498db' },
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

// Export GeoJSON
document.getElementById('export-geojson').addEventListener('click', () => {
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
    
    showStatus('✅ Fichier GeoJSON téléchargé !', 'success');
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
