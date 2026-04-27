# Configuration Firebase (LDN)

## 1) Creer le projet Firebase

1. Va sur [Firebase Console](https://console.firebase.google.com/).
2. Cree un projet.
3. Ajoute une application Web.
4. Recupere la configuration Web.

## 2) Remplir le `.env`

Ajoute/replace ces variables dans `.env`:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...

# Domaine interne pour mapper username -> email
VITE_AUTH_EMAIL_DOMAIN=example.com
```

Notes:

- L'utilisateur entre seulement `username + password`.
- En interne, l'app mappe vers `username@VITE_AUTH_EMAIL_DOMAIN`.

## 3) Activer Firebase Authentication

1. Firebase Console -> Authentication -> Get started.
2. Onglet Sign-in method -> active `Email/Password`.

## 4) Activer Firestore Database

1. Firebase Console -> Firestore Database -> Create database.
2. Choisir un mode (test ou production).
3. Choisir une region.

## 5) Regles Firestore (recommande)

Remplace tes regles par:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAuthenticated() {
      return request.auth != null;
    }

    function isAdminBagnorrez() {
      return isAuthenticated() &&
        request.auth.token.email.matches('^bagnorrez@.*$');
    }

    match /profiles/{userId} {
      allow read, write: if isAuthenticated() && request.auth.uid == userId;
    }

    match /productDetails/{docId} {
      allow read: if true;
      allow create, update, delete: if isAdminBagnorrez();
    }

    match /customProducts/{docId} {
      allow read: if true;
      allow create, update, delete: if isAdminBagnorrez();
    }

    match /participations/{docId} {
      allow read: if true;
      allow create: if isAuthenticated()
        && request.resource.data.userId == request.auth.uid;
      allow update, delete: if isAdminBagnorrez() || (
        isAuthenticated() && resource.data.userId == request.auth.uid
      );
    }
  }
}
```

## 6) Tester localement

```bash
npm run dev
```

Et pour tester auth dans le terminal:

```bash
npm run test:auth -- signup test monMotDePasse123
npm run test:auth -- login test monMotDePasse123
```
