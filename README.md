# Outils hospit

Un seul module Obsidian pour les notes d’hospitalisation. Il réunit ce qui était auparavant trois modules (Boutons Copier, Exam Emoji Picker, Outils de tableaux) et deux extraits CSS.

## Fonctions

- Boutons Copier (mode lecture) : à côté des titres Antécédents, Mode de vie, HDM, Traitement, Examen clinique d’entrée et de chaque jour d’hospitalisation.
- Examens complémentaires :
  - bouton émoji de catégorie (🧪, 🔊, ☣️, 🫙, 📡, 🧲, 🩻, 🫀, 🩸, 🧂) ;
  - bouton + qui ajoute un examen dans la colonne « Examen » (créée au premier ajout), précédé de l’émoji de la catégorie, une ligne par examen ;
  - listes d’examens modifiables dans les réglages du module.
- Tableaux :
  - lignes barrées remontées en haut (bouton dans l’en-tête du tableau, dans la barre de titre de la note, ou commande) ;
  - Fusionner / Défusionner les cellules au clic droit sur une sélection (syntaxe Sheets Extended `<` et `^`).
- Styles : cases fusionnées centrées, titres d’encadrés lisibles en thème sombre, détails d’examen masqués tant que la case n’est pas cochée, encadrés de l’observation psychiatrique.

## Développement

Le code est dans `src/` (un fichier par module, plus les styles). `node build.cjs` génère `main.js` et `styles.css`.

## Installation

Avec BRAT depuis ce dépôt GitHub (`lastseenat/exam-emoji-picker`).
