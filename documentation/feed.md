# Feed de suivi du projet

Ce fichier sert de journal de bord unique.
A chaque demande, je :

- consulte ce fichier pour garder le contexte,
- ajoute ce que je viens de faire,
- note les prochaines actions utiles.

## 2026-04-26 - Initialisation du projet

- Creation du projet avec Vite + React (JavaScript) a la racine.
- Installation des dependances du projet.
- Installation et configuration de Tailwind via `@tailwindcss/vite`.
- Mise a jour de `vite.config.js` avec le plugin Tailwind.
- Remplacement de `src/index.css` par `@import "tailwindcss";`.
- Remplacement du template de base dans `src/App.jsx` par une page d'accueil "Liste de naissance".
- Verification technique :
  - build OK avec `npm run build`,
  - aucun linter error sur les fichiers modifies.
- Serveur de dev lance (`npm run dev`).

## 2026-04-26 - Integration des elements CSV

- Lecture de `documentation/ldnbase.csv` (source de verite pour les elements).
- Mise en place dans `src/App.jsx` :
  - import brut du CSV (`?raw`),
  - parser CSV (gestion des guillemets),
  - transformation en categories + items.
- Affichage des elements sur le site par categories :
  - badges d'etat (`A offrir`, `Deja prevu`, `A confirmer`, `Lien disponible`),
  - lien cliquable quand une URL est presente.

## 2026-04-26 - Participation par personne

- Ajout d'une fonctionnalite de participation sur chaque cadeau dans `src/App.jsx`.
- Chaque visiteur peut remplir un formulaire :
  - nom,
  - mode de participation (`virement` ou `achat direct`),
  - montant (optionnel),
  - message (optionnel).
- Les participations sont affichees sous l'element concerne.
- Ajout d'un compteur global de participations en haut de page.
- Persistence locale via `localStorage` pour conserver les participations dans le navigateur.

## 2026-04-26 - Preparation Supabase (guidage)

- Demande recue: passer a Supabase avec authentification par `nom d'utilisateur` unique + mot de passe.
- Strategie retenue pour garder une connexion "username + password":
  - authentifier via email/password Supabase en interne,
  - mapper le username vers un email technique (`username@users.ldn.local`),
  - conserver le `username` en base avec contrainte d'unicite.
- Prochaine etape proposee: brancher Supabase dans le front et remplacer le stockage local des participations par la base distante.

## supabase

Project ID : uhddwskandlnlojecumg
