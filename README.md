## 🗺️ Extracteur de données géographiques à la commune depuis le WFS de la BD TOPO IGN



Application web permettant d'extraire des données géographiques du service WFS de la BD TOPO de l'IGN, filtrées par commune française.



## 🌟 Fonctionnalités



\- ✅ Recherche intuitive de communes françaises avec autocomplétion

\- 🗺️ Visualisation interactive sur carte Leaflet

\- 📊 Extraction de différentes couches BD TOPO (bâtiments, routes, cours d'eau, etc.)

\- 🎯 Filtrage spatial par commune

\- 💾 Export des données au format GeoJSON

\- 📱 Interface responsive (desktop, tablette, mobile)

\- 🎓 Section didactique explicative



## 🚀 Démarrage rapide



### Utilisation en ligne



Accédez directement à l'application via GitHub Pages :

```

https://\[votre-username].github.io/ign-wfs-extractor/

```



\### Installation locale



1\. Clonez le dépôt :

```bash

git clone https://github.com/\[votre-username]/ign-wfs-extractor.git

cd ign-wfs-extractor

```



2\. Ouvrez `index.html` dans votre navigateur

&nbsp;  - Ou utilisez un serveur local :

```bash

python -m http.server 8000

\# Puis ouvrez http://localhost:8000

```



\## 📚 Utilisation



1\. \*\*Rechercher une commune\*\* : Tapez le nom d'une commune française

2\. \*\*Sélectionner une couche\*\* : Choisissez le type de données à extraire

3\. \*\*Extraire\*\* : Cliquez sur "Extraire les données"

4\. \*\*Visualiser\*\* : Les données s'affichent sur la carte

5\. \*\*Exporter\*\* : Téléchargez au format GeoJSON



\## 🛠️ Technologies



\- \*\*HTML5/CSS3\*\* : Structure et style responsive

\- \*\*JavaScript (Vanilla)\*\* : Logique applicative

\- \*\*Leaflet 1.9.4\*\* : Cartographie interactive

\- \*\*API Découpage Administratif\*\* : Recherche de communes

\- \*\*WFS BD TOPO v3\*\* : Données géographiques IGN



\## 📦 Couches disponibles



\- 🏢 Bâtiments

\- 🛣️ Routes et tronçons de route

\- 💧 Cours d'eau et surfaces hydrographiques

\- 🌳 Zones de végétation

\- ⚡ Lignes électriques

\- 🏛️ Limites communales



\## 🌐 APIs utilisées



\### API Découpage Administratif

```

https://geo.api.gouv.fr/communes

```



\### WFS BD TOPO IGN

```

https://data.geopf.fr/wfs/ows

```



\## 📝 Structure du projet

```

ign-wfs-extractor/

├── index.html       # Page principale

├── style.css        # Styles CSS

├── app.js          # Logique JavaScript

└── README.md       # Documentation

```



\## 🎨 Personnalisation



\### Modifier les couleurs



Éditez les variables CSS dans `style.css` :

```css

:root {

&nbsp;   --primary-color: #0066cc;

&nbsp;   --secondary-color: #00aa66;

&nbsp;   /\* ... \*/

}

```



\### Ajouter des couches



Ajoutez des options dans `index.html` :

```html

<option value="BDTOPO\_V3:nouvelle\_couche">Nouvelle couche</option>

```



\## 🤝 Contribution



Les contributions sont les bienvenues !



1\. Forkez le projet

2\. Créez une branche (`git checkout -b feature/amelioration`)

3\. Committez (`git commit -m 'Ajout fonctionnalité'`)

4\. Pushez (`git push origin feature/amelioration`)

5\. Ouvrez une Pull Request



\## 📄 Licence



Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.



\## 🙏 Crédits



\- Données : \[IGN - Institut national de l'information géographique et forestière](https://www.ign.fr)

\- Cartographie : \[Leaflet](https://leafletjs.com)

\- API Communes : \[API Découpage Administratif](https://geo.api.gouv.fr)



\## 📞 Contact



Pour toute question ou suggestion, ouvrez une issue sur GitHub.



---



Fait avec ❤️ pour la communauté SIG


