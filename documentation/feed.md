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

## 2026-04-26 - Integration Supabase (auth + participations)

- Installation du package `@supabase/supabase-js`.
- Creation du client Supabase dans `src/lib/supabase.js` (lecture via `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`).
- Refonte de `src/App.jsx` pour ajouter :
  - inscription/connexion avec `nom d utilisateur + mot de passe`,
  - mapping technique username -> email (`username@example.com`),
  - deconnexion et gestion de session.
- Remplacement du stockage local des participations par Supabase :
  - lecture des participations depuis la table `participations`,
  - insertion d'une participation liee a l'utilisateur connecte.
- Le formulaire de participation est maintenant reserve aux utilisateurs connectes.
- Verification technique:
  - build OK (`npm run build`),
  - aucun linter error.

## 2026-04-26 - Correction signup + script SQL

- Retour utilisateur: erreur Supabase `Email address "test@users.ldn.local" is invalid`.
- Correction appliquee dans `src/App.jsx`:
  - remplacement du mapping email technique par `username@example.com`.
- Ajout de `documentation/supabase.sql`:
  - tables `profiles` et `participations`,
  - contraintes d'unicite/format pour `username`,
  - policies RLS,
  - trigger de creation automatique de profil.

## 2026-04-26 - Clarification username/password Supabase

- Besoin utilisateur confirme: uniquement `username + password` dans l'interface.
- Precision technique:
  - le mot de passe n'est pas stocke en clair dans l'app (bonne pratique),
  - Supabase stocke un hash du mot de passe via `auth.users`.
- Ajustements appliques dans `src/App.jsx`:
  - validation stricte du `username` (`^[a-z0-9._-]{3,30}$`),
  - message d'erreur explicite en cas de format invalide,
  - mapping interne vers un email syntactiquement valide: `username@users.ldn-app.com`.

## 2026-04-26 - Gestion erreur rate limit

- Retour utilisateur: `email rate limit exceeded` lors de la creation de compte.
- Mise a jour de `src/App.jsx`:
  - ajout d'un mapping d'erreurs Supabase vers messages clairs en francais,
  - gestion specifique du `rate limit` avec action recommandee:
    attendre 1-2 minutes puis reessayer, ou se connecter si le compte existe deja.

## 2026-04-26 - Script de test auth dans Cursor

- Ajout d'un script CLI: `scripts/test-auth.mjs`.
- Ajout du script npm associe dans `package.json`:
  - `npm run test:auth -- signup <username> <password>`
  - `npm run test:auth -- login <username> <password>`
- Le script:
  - lit `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` depuis `.env`,
  - applique le meme mapping interne username -> email que l'app,
  - teste directement creation de compte et connexion depuis le terminal Cursor.

## 2026-04-26 - Diagnostic rate limit renforce

- Constat: apres attente, l'erreur `email rate limit exceeded` persiste lors du `signup`.
- Evolution de `scripts/test-auth.mjs`:
  - mapping des erreurs Supabase vers messages plus lisibles,
  - en cas de rate limit sur signup: tentative automatique de `login` pour verifier si le compte existe deja.

## 2026-04-26 - Rate limit persistant (constat)

- Retour utilisateur: le `signup` retourne encore `email rate limit exceeded` apres attente.
- Verification/diagnostic:
  - le script de test affiche bien l'action, username et email interne utilises,
  - interpretation: limitation anti-abus Supabase toujours active sur le flux d'inscription.
- Action recommandee: verifier dans le dashboard Supabase que la confirmation email est desactivee et utiliser `login` si le compte existe deja.

## 2026-04-27 - Correction email invalide (mapping interne)

- Retour utilisateur: `Email address "test@users.ldn-app.com" is invalid`.
- Correctif applique:
  - `src/App.jsx`: mapping `username -> username@example.com`.
  - `scripts/test-auth.mjs`: meme mapping pour garder la coherence tests/app.
- Objectif: garder une adresse interne syntaxiquement acceptee par Supabase tout en conservant une UX `username + password`.

## 2026-04-27 - Mapping email interne configurable

- Retour utilisateur: `Email address "test@example.com" is invalid`.
- Nouveau comportement applique:
  - mapping interne base sur `VITE_AUTH_EMAIL_BASE` (ex: `tonadresse@gmail.com`),
  - conversion en alias: `tonadresse+<username>@domaine`.
- Fallback si variable absente:
  - `username@gmail.com`.
- Fichiers modifies:
  - `src/App.jsx`
  - `scripts/test-auth.mjs`

## 2026-04-27 - Switch complet Supabase -> Firebase

- Demande utilisateur: abandonner Supabase et migrer vers Firebase.
- Nettoyage Supabase:
  - suppression du client `src/lib/supabase.js`,
  - suppression de `documentation/supabase.sql`,
  - retrait de la dependance `@supabase/supabase-js`.
- Mise en place Firebase:
  - ajout de la dependance `firebase`,
  - ajout de `src/lib/firebase.js`,
  - refonte de `src/App.jsx` pour utiliser:
    - Firebase Auth (signup/login/signout),
    - Firestore (stockage et lecture des participations en temps reel).
- Script de test mis a jour:
  - `scripts/test-auth.mjs` utilise maintenant Firebase.
- Documentation ajoutee:
  - `documentation/firebase-setup.md` avec les variables `.env`,
  - activation Auth/Firestore,
  - regles Firestore recommandees.

## 2026-04-27 - Guidage pas a pas Firestore

- Demande utilisateur: accompagnement detaille pour configurer Firestore/Firebase.
- Point de vigilance constate: `.env` contient encore des placeholders `...`.
- Plan de guidage fourni:
  - recuperer les vraies clefs Firebase,
  - activer Email/Password dans Firebase Auth,
  - configurer Firestore + Rules,
  - tester signup/login puis participation en temps reel.

## 2026-04-27 - Affichage des participations utilisateur

- Demande utilisateur: retrouver facilement les cadeaux sur lesquels il s'est positionne.
- Evolution appliquee dans `src/App.jsx`:
  - ajout d'un calcul des participations du user connecte (filtre `userId`),
  - ajout d'une section `Mes participations` avec compteur et details.
- Source de verite: Firestore (`participations`) via listener temps reel deja en place.

## 2026-04-27 - Suppression d'une participation

- Demande utilisateur: permettre la suppression d'une participation.
- Evolution appliquee dans `src/App.jsx`:
  - ajout d'une action `deleteParticipation`,
  - suppression du document dans Firestore (`participations/<id>`),
  - bouton `Supprimer` dans `Mes participations` avec etat `Suppression...`.
- Le rafraichissement est instantane via listener Firestore temps reel.

## 2026-04-27 - Optimisation UX (menu + page perso)

- Demande utilisateur:
  - auth via menu (type burger),
  - espace utilisateur sur page separee,
  - badge `Vous participez` sur les cadeaux choisis,
  - bouton de participation reduit a `+`.
- Evolution appliquee dans `src/App.jsx`:
  - ajout d'un menu burger pour connexion/inscription/deconnexion,
  - ajout de 2 vues: `Liste` et `Mon espace`,
  - deplacement des infos utilisateur + participations dans `Mon espace`,
  - remplacement du badge etat par `Vous participez` pour l'utilisateur connecte quand applicable,
  - remplacement du bouton `Je participe a cet achat` par un bouton `+`.

## 2026-04-27 - Focus automatique auth

- Demande utilisateur: ouvrir le menu et faciliter l'auth quand `Mon espace` est clique sans connexion.
- Evolution appliquee:
  - clic sur `Mon espace` (deconnecte) ouvre le menu auth en mode `login`,
  - focus automatique sur le champ `Nom d utilisateur` a l'ouverture du menu.

## 2026-04-27 - Ajustement bouton +

- Demande utilisateur: placer le bouton `+` a droite sans retour a la ligne.
- Evolution appliquee dans `src/App.jsx`:
  - deplacement du bouton `+` dans l'entete de la carte produit (a droite),
  - regroupement badge + bouton dans un conteneur `whitespace-nowrap`.

## 2026-04-27 - Page detail produit

- Demande utilisateur: clic sur produit => page detail, sans bouton participer dans la liste.
- Evolution appliquee dans `src/App.jsx`:
  - ajout d'une vue `product` avec detail d'un produit selectionne,
  - la liste devient uniquement navigable (clic carte => detail),
  - suppression du formulaire de participation dans la liste,
  - formulaire de participation directement accessible sur la page detail produit.
- Comportement:
  - badge `Vous participez` sur detail si l'utilisateur est deja positionne,
  - participants visibles sur la page detail,
  - bouton retour vers la liste.

## 2026-04-27 - Regle badge Reserve

- Demande utilisateur: afficher `Réservé` quand au moins une participation existe.
- Regle appliquee:
  - priorite `Vous participez` si l'utilisateur connecte participe,
  - sinon `Réservé` si le produit a au moins une participation,
  - sinon etat d'origine du produit.
- Applique sur:
  - la liste des produits,
  - la page detail produit.

## 2026-04-27 - Regle badge sans participation

- Demande utilisateur: si aucune participation, afficher toujours `A offrir`.
- Ajustement applique:
  - suppression du fallback sur les statuts CSV pour le badge de disponibilite,
  - regle finale:
    - `Vous participez` (si user connecte participe),
    - sinon `Réservé` (si au moins une participation existe),
    - sinon `A offrir`.

## 2026-04-27 - Correction affichage apres deconnexion

- Retour utilisateur: certains produits restent `A offrir` apres deconnexion alors qu'une participation existe.
- Correctif applique dans `src/App.jsx`:
  - suppression du reset `participationsByItem` au logout,
  - ecoute Firestore des participations active en continu (plus dependante de `user`).
- Effet attendu:
  - les statuts `Réservé` restent visibles apres deconnexion dans la session.

## 2026-04-27 - Suppression depuis detail produit

- Demande utilisateur: pouvoir supprimer une participation facilement.
- Evolution appliquee dans `src/App.jsx`:
  - ajout d'un bouton `Supprimer ma participation` directement sur la page detail produit,
  - visible quand l'utilisateur connecte participe deja a ce produit,
  - reutilise la suppression Firestore existante.

## 2026-04-27 - Suppression bloc compteur global

- Demande utilisateur: retirer la partie `Participations enregistrees`.
- Evolution appliquee:
  - suppression du bloc d'information global en tete de la vue liste,
  - conservation des messages d'erreur de participation via une alerte dediee.

## 2026-04-27 - Masquage des erreurs UI

- Demande utilisateur: ne plus afficher les messages d'erreur.
- Evolution appliquee dans `src/App.jsx`:
  - suppression de l'affichage des erreurs auth et participation,
  - conservation de la logique interne (les actions restent traitees).

## 2026-04-27 - Auth dans Mon espace uniquement

- Demande utilisateur: retirer le menu burger et faire login/signup dans `Mon espace`.
- Evolution appliquee dans `src/App.jsx`:
  - suppression complete du menu burger et du panneau auth flottant,
  - `Mon espace` ouvre toujours la page dediee,
  - formulaire connexion/inscription deplace dans `Mon espace` quand deconnecte,
  - bouton `Se deconnecter` deplace dans `Mon espace` quand connecte.

## 2026-04-27 - Mise a jour immediate apres participation

- Demande utilisateur: afficher immediatement que l'utilisateur participe apres validation.
- Evolution appliquee dans `src/App.jsx`:
  - ajout d'une mise a jour optimiste de `participationsByItem` a la soumission,
  - rollback local si l'ecriture Firestore echoue.
- Effet: le badge `Vous participez` apparait sans attendre le retour reseau.

## 2026-04-27 - Suppression immediate participation

- Demande utilisateur: meme comportement immediat pour la suppression.
- Evolution appliquee dans `src/App.jsx`:
  - suppression optimiste locale de la participation (mise a jour instantanee de l'UI),
  - rollback local en cas d'echec Firestore.
- Effet: badge/statut mis a jour immediatement apres clic sur supprimer.

## 2026-04-27 - Mode admin bagnorrez

- Demande utilisateur: permettre au compte `bagnorrez` de gerer les produits et participations.
- Evolutions appliquees dans `src/App.jsx`:
  - detection admin (`bagnorrez`),
  - edition produit sur la page detail (lien + texte),
  - sauvegarde des infos produit dans `productDetails`,
  - edition des participations (mode, montant, note) depuis la page detail,
  - suppression des participations depuis la page detail en mode admin.
- Documentation mise a jour:
  - `documentation/firebase-setup.md` avec regles Firestore incluant droits admin `bagnorrez`.

## 2026-04-27 - Admin produits avances (titre/ajout/suppression)

- Demande utilisateur: permettre a `bagnorrez` de modifier le titre des produits, ajouter des produits, et supprimer des produits.
- Evolutions appliquees dans `src/App.jsx`:
  - ajout du champ admin `customName` pour modifier le titre produit sur la page detail,
  - ajout d'une section admin sur la liste pour creer de nouveaux produits (collection Firestore `customProducts`),
  - fusion des produits CSV + produits custom dans l'affichage (`displayCategories`),
  - ajout de la suppression produit:
    - produit custom: suppression du document `customProducts`,
    - produit existant CSV: masquage via `productDetails.isHidden=true`.
- Documentation mise a jour:
  - `documentation/firebase-setup.md` avec regle `customProducts` reservee a `bagnorrez`.

## 2026-04-27 - Ajout produit par categorie

- Demande utilisateur: declencher l'ajout via un bouton place en fin de liste pour chaque categorie, et lier automatiquement l'ajout a la categorie du bouton clique.
- Evolutions appliquees dans `src/App.jsx`:
  - suppression du formulaire admin global d'ajout produit,
  - ajout d'un bouton `+ Ajouter un produit dans <categorie>` en bas de chaque bloc categorie,
  - ouverture d'un mini-formulaire inline (nom, lien, description) uniquement pour la categorie active,
  - la fonction `createNewProduct` prend maintenant la categorie cible en parametre pour ecrire dans `customProducts`.

## 2026-04-27 - Correctif ajout produit categorie

- Retour utilisateur: "quand je valide l'ajout rien ne se passe".
- Correctifs appliques dans `src/App.jsx`:
  - simplification de l'ecoute Firestore `customProducts` (suppression du `orderBy` dans la requete),
  - bouton de validation d'ajout desactive tant que le nom produit est vide,
  - feedback bouton explicite (`Nom requis` / `Ajout...`) pour rendre l'etat visible.

## 2026-04-27 - Reskin visuel inspire One Stop Shop

- Demande utilisateur: s'inspirer du style de `https://www.deanira.co/onestopshop` tout en conservant les proportions actuelles.
- Evolutions appliquees dans `src/App.jsx`:
  - rework visuel global (fond creme, container avec bordure marquee, ombres plus graphiques),
  - header plus editorial (eyebrow + typo plus forte),
  - boutons de navigation et d'actions en style pill/bordure forte,
  - cartes categories et cartes produits restylees (bordures plus contrastees, ombres et hover subtil),
  - harmonisation visuelle des sections profil/produit sans modifier la structure ni le layout.

## 2026-04-27 - Bordure boutons produits harmonisee

- Demande utilisateur: faire en sorte que les boutons produits aient eux aussi une bordure similaire au reste du design.
- Evolution appliquee dans `src/App.jsx`:
  - bouton de chaque produit en liste passe en `border-slate-900` avec ombre marquee type "offset" pour matcher les autres blocs,
  - hover conserve mais accentue avec ombre plus forte.

## 2026-04-27 - Suppression emojis categories (affichage)

- Demande utilisateur: enlever les emojis des categories.
- Evolution appliquee dans `src/App.jsx`:
  - ajout d'un helper `getDisplayCategoryTitle` pour nettoyer les emojis uniquement a l'affichage,
  - application sur les titres de categories dans la liste,
  - application sur le libelle categorie de la page detail produit,
  - application sur le texte du bouton admin `Ajouter un produit dans ...`.
- Note: les titres bruts internes ne sont pas modifies pour ne pas casser les cles Firestore existantes.

## 2026-04-27 - Correctif affichage categories sans emoji

- Retour utilisateur: les emojis apparaissaient encore dans certains titres de categories.
- Correctif applique dans `src/App.jsx`:
  - remplacement du rendu restant `category.title` par `getDisplayCategoryTitle(category.title)` dans l'entete de chaque carte categorie.

## 2026-04-27 - Optimisation padding mobile

- Demande utilisateur: reduire le padding lateral des containers au format telephone.
- Evolution appliquee dans `src/App.jsx`:
  - reduction du padding horizontal global (`main`) en mobile (`px-3`),
  - reduction du padding du container principal (`p-4` en mobile, `sm:p-8`),
  - reduction des paddings des sections profil/produit et cartes categories en mobile (`p-3`), tout en conservant les valeurs desktop via `sm:*`.

## 2026-04-27 - Desactivation zoom mobile

- Demande utilisateur: empecher le zoom sur telephone.
- Evolution appliquee dans `index.html`:
  - mise a jour de la meta viewport avec `maximum-scale=1.0` et `user-scalable=no` pour bloquer le pinch-zoom.

## 2026-04-27 - Image produit dans le detail

- Demande utilisateur: ajouter la possibilite d'associer une image au produit et l'afficher dans les details.
- Evolutions appliquees dans `src/App.jsx`:
  - ajout du champ `imageUrl` dans le draft admin produit (`productDetails`) et dans la creation de produits custom,
  - sauvegarde `imageUrl` dans Firestore (`productDetails` et `customProducts`),
  - affichage de l'image sur la fiche produit quand une URL est renseignee,
  - ajout des champs `URL image` dans le formulaire admin detail produit et dans le formulaire d'ajout produit par categorie.

## 2026-04-27 - Bouton adresse postale + modale

- Demande utilisateur: ajouter un bouton dans le header, a cote de `BEBE CORROYEZ`, pour afficher l'adresse postale dans une petite modale centrale.
- Evolutions appliquees dans `src/App.jsx`:
  - ajout d'un bouton `Adresse postale` dans le bloc titre du header,
  - ajout d'une modale centree (overlay) avec bouton fermer,
  - ajout d'un tableau de lignes `postalAddressLines` pour afficher l'adresse.

## 2026-04-27 - Deplacement bouton adresse

- Demande utilisateur: placer le bouton adresse a cote de `Mon espace`.
- Evolution appliquee dans `src/App.jsx`:
  - bouton `Adresse postale` retire du bloc titre,
  - bouton ajoute dans le groupe d'actions de navigation a cote de `Mon espace`.

## supabase

Project ID : uhddwskandlnlojecumg
