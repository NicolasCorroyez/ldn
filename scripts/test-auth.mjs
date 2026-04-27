import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'

function parseEnvFile() {
  const envPath = resolve(process.cwd(), '.env')
  if (!existsSync(envPath)) {
    return {}
  }

  const content = readFileSync(envPath, 'utf8')
  const lines = content.split(/\r?\n/)
  const entries = {}

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }
    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) {
      continue
    }
    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim()
    entries[key] = value
  }

  return entries
}

function normalizeUsername(value) {
  return value.trim().toLowerCase()
}

function buildInternalAuthEmail(username, domain) {
  const normalized = normalizeUsername(username)
  const trimmedDomain = (domain ?? '').trim()

  return `${normalized}@${trimmedDomain || 'example.com'}`
}

function usernameToEmail(username, domain) {
  return buildInternalAuthEmail(username, domain)
}

function readConfig() {
  const env = parseEnvFile()
  const config = {
    apiKey: process.env.VITE_FIREBASE_API_KEY ?? env.VITE_FIREBASE_API_KEY,
    authDomain:
      process.env.VITE_FIREBASE_AUTH_DOMAIN ?? env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID ?? env.VITE_FIREBASE_PROJECT_ID,
    storageBucket:
      process.env.VITE_FIREBASE_STORAGE_BUCKET ?? env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId:
      process.env.VITE_FIREBASE_MESSAGING_SENDER_ID ??
      env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID ?? env.VITE_FIREBASE_APP_ID,
  }

  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key)

  if (missing.length > 0) {
    throw new Error(`Variables Firebase manquantes: ${missing.join(', ')}`)
  }

  const authEmailDomain =
    process.env.VITE_AUTH_EMAIL_DOMAIN ?? env.VITE_AUTH_EMAIL_DOMAIN ?? 'example.com'

  return { firebaseConfig: config, authEmailDomain }
}

function usage() {
  console.log('Usage:')
  console.log('  npm run test:auth -- signup <username> <password>')
  console.log('  npm run test:auth -- login  <username> <password>')
}

function mapFirebaseError(error) {
  const code = error?.code ?? ''
  if (code === 'auth/email-already-in-use') {
    return "Ce nom d'utilisateur existe deja. Utilise l'action login."
  }
  if (code === 'auth/invalid-credential') {
    return 'Identifiants invalides (username ou mot de passe).'
  }
  if (code === 'auth/too-many-requests') {
    return 'Trop de tentatives, reessaie dans quelques minutes.'
  }
  return error?.message ?? 'Erreur inconnue'
}

async function main() {
  const [, , action, username, password] = process.argv

  if (!action || !username || !password) {
    usage()
    process.exit(1)
  }

  if (!['signup', 'login'].includes(action)) {
    console.error("Action invalide. Utilise 'signup' ou 'login'.")
    usage()
    process.exit(1)
  }

  const normalizedUsername = normalizeUsername(username)
  const { firebaseConfig, authEmailDomain } = readConfig()
  const email = usernameToEmail(normalizedUsername, authEmailDomain)
  const app = initializeApp(firebaseConfig, 'test-auth-script')
  const auth = getAuth(app)

  console.log(`Action: ${action}`)
  console.log(`Username: ${normalizedUsername}`)
  console.log(`Email interne: ${email}`)

  try {
    const credentials =
      action === 'signup'
        ? await createUserWithEmailAndPassword(auth, email, password)
        : await signInWithEmailAndPassword(auth, email, password)

    const user = credentials.user
    console.log('OK')
    console.log(`User ID: ${user.uid}`)
    console.log(`Email stocke: ${user.email}`)

    await signOut(auth)
  } catch (error) {
    console.error('Erreur Firebase:', mapFirebaseError(error))
    process.exit(2)
  }
}

main().catch((error) => {
  console.error('Erreur script:', error.message)
  process.exit(3)
})
