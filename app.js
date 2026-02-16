async function extractWFSData() {
    if (!selectedCommune) {
        showStatus('Veuillez d\'abord sélectionner une commune', 'error');
        return;
    }
    
    const layer = document.getElementById('layer-select').value;
    const featureLimit = document.getElementById('feature-limit').value;
    
    showStatus('Extraction des données en cours...', 'loading');
    
    try {
        // Obtenir la bbox de la commune
        const bounds = getBBoxFromCommune(selectedCommune);
        
        if (!bounds) {
            showStatus('Impossible de déterminer les limites de la commune', 'error');
            return;
        }
        
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
        params.append('bbox', `${bounds.minLon},${bounds.minLat},${bounds.maxLon},${bounds.maxLat},EPSG:4326`);
        
        // Limiter le nombre de résultats selon la sélection
        if (featureLimit !== 'unlimited') {
            params.append('count', featureLimit);
        }
        
        const url = `${WFS_URL}?${params.toString()}`;
        
        console.log('URL de requête WFS:', url);
        console.log('Limite de features:', featureLimit);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Erreur serveur:', errorText);
            throw new Error(`Erreur HTTP ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        
        if (!data.features || data.features.length === 0) {
            showStatus('Aucune donnée trouvée pour cette commune et cette couche', 'error');
            updateInfo(`
                <strong>Aucun résultat</strong><br>
                Commune : ${selectedCommune.nom}<br>
                Couche : ${layer.split(':')[1]}<br>
                <small>Essayez une autre couche ou vérifiez que des données existent pour cette zone.</small>
            `);
            return;
        }
        
        // Filtrer les données qui intersectent réellement la commune (filtrage côté client)
        const filteredData = filterDataByCommune(data, selectedCommune);
        
        displayExtractedData(filteredData);
        extractedData = filteredData;
        
        // Message avec avertissement si limite atteinte
        let statusMessage = `✅ ${filteredData.features.length} entité(s) extraite(s) avec succès`;
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
            <small>Consultez la console du navigateur pour plus de détails.</small>
        `);
    }
}
