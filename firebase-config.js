/* ============================================================
   Sounding Things Out — Firebase config
   Paste your Firebase web-app config below to light up:
   live presence, spitball chat, shared session doors, profiles.
   (Firebase console → Project settings → Your apps → Web app)

   Leave the placeholder and the app runs as a fully working
   offline sketch with simulated lobby members.
   ============================================================ */
window.FIREBASE_CONFIG = {
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "PASTE_YOUR_AUTH_DOMAIN",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_STORAGE_BUCKET",
  messagingSenderId: "PASTE_YOUR_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID",
  databaseURL: "PASTE_YOUR_DATABASE_URL" // Realtime Database URL (for presence + chat)
};
/* Suggested security rules (Firestore):
   mm_sessions, mm_profiles, mm_projects: allow read/write if request.auth != null
   (Realtime Database) mm_presence, mm_chat: ".read": true, ".write": "auth != null" */
