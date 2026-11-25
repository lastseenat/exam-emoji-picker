# Outils hospit

Un seul module Obsidian pour les notes d’hospitalisation. Il réunit ce qui était auparavant trois modules (Boutons Copier, Exam Emoji Picker, Outils de tableaux) et deux extraits CSS.

## Fonctions

- Boutons Copier (mode lecture) : à côté des titres Antécédents, Mode de vie, HDM, Traitement, Examen clinique d’entrée et de chaque jour d’hospitalisation. Les sous-puces de l’HDM sont copiées en phrases à la suite de leur puce, celles de l’Autonomie en retrait ; les antécédents sans émoji ni parenthèses doublées.
- Examen clinique d’entrée : bouton Valider (les cases cochées deviennent le texte à copier, la version à cocher est gardée cachée dans la note) et Retour (les cases reviennent, avec confirmation si le texte validé a été corrigé).
- Examens complémentaires :
  - bouton émoji de catégorie (🧪, 🔊, ☣️, 🫙, 📡, 🧲, 🩻, 🫀, 🩸, 🧂) ;
  - bouton + (mode modification) qui ajoute un examen dans la colonne « Examen », et + dans l’en-tête pour ajouter la colonne du jour ;
  - listes d’examens modifiables dans les réglages du module ;
  - valeurs basses en bleu, hautes en rouge, d’après la note « Générateur/Normes biologiques » (modifiable, homme ou femme lu dans la Synthèse) ; résultats positifs de microbiologie (☣️) et de prélèvements (🫙) en rouge.
- Tableaux :
  - lignes barrées remontées en haut (bouton dans l’en-tête du tableau, dans la barre de titre de la note, ou commande) ; tableau de traitement trié par émoji de classe, barrées en tête dans chaque classe ;
  - Fusionner / Défusionner les cellules au clic droit sur une sélection (syntaxe Sheets Extended `<` et `^`) ;
  - tableau des examens : un bouton par catégorie au-dessus, qui n’affiche que cette catégorie ; dates et colonne Examen figées ; un bouton Copier par date, qui copie la biologie du jour avec ses unités, une ligne par catégorie ;
  - tableau des jours (première colonne « Date ») : en-tête, dates et CAT figés, jour de la semaine sous chaque date, calé sur les derniers jours à l’ouverture, position gardée pendant l’édition ; un bouton Copier par jour ;
  - tout tableau long : ligne d’en-tête figée pendant le défilement de la note ;
  - antécédents en parties (🦀 Oncologiques, 🫀 Cardiaques, 🧠 Neurologiques, 💩 Digestifs…) avec un bouton + qui ajoute une partie à sa place ;
  - bouton Copier sur le tableau « Traitement ».
- Pastilles : une pastille grise au survol à gauche de chaque puce et ligne de tableau ; un clic la met en rouge pour signaler une ligne importante (`- [!]` pour une puce, `<span class="pastille"></span>` dans un tableau), ignorée par les copies et le tri.
- Bouton Replier tout (titres seulement) en haut à droite des notes ; position gardée au passage lecture ↔ modification.
- Commande Diagnostic : version chargée, versions d’Obsidian et de Chrome, état de chaque module, tableaux trouvés dans la note ouverte.
- Styles : cases fusionnées centrées, titres d’encadrés lisibles en thème sombre, détails d’examen masqués tant que la case n’est pas cochée, encadrés de l’observation psychiatrique.

## Développement

Le code est dans `src/` (un fichier par module, plus les styles). `node build.cjs` génère `main.js` et `styles.css`.

## Installation

Avec BRAT depuis ce dépôt GitHub (`lastseenat/exam-emoji-picker`).
