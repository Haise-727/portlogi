/**
 * Public identifiers for the portlogi Firebase project (free Spark plan). These are not secrets:
 * they only say which project to talk to. What protects the data is firebase/database.rules.json
 * (writes only from device accounts, reads only when signed in) and the fact that sign-up is off.
 *
 * If you restrict the API key to HTTP referrers in Google Cloud, allow this site's address.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyCVcyNWHcj8WDyHwQt6BiLP3msKa5FN9t0',
  authDomain: 'portlogi-2d2e7.firebaseapp.com',
  databaseURL: 'https://portlogi-2d2e7-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'portlogi-2d2e7',
  appId: '1:496779925096:web:3c033f69bf3d0c4b2f8ddd',
}
