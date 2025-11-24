import admin from 'firebase-admin';

// Initialize Firebase Admin safely
function initFirebase() {
  if (!admin.apps.length && 
      process.env.FIREBASE_PROJECT_ID && 
      process.env.FIREBASE_CLIENT_EMAIL && 
      process.env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  }
}

// Export a function to get the push client safely
export function getPushClient() {
  initFirebase();
  if (!admin.apps.length) {
    throw new Error('Firebase Admin is not initialized. Please check your environment variables.');
  }
  return admin.messaging();
}

export { admin }; 