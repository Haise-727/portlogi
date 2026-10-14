import { firebaseConfig } from './firebaseConfig'

/**
 * The hardware feed. The ESP32 writes each RFID read to Firebase (see docs/hardware-firebase.md);
 * this listens for new ones and hands the card's UID to the app.
 *
 * It is loaded on demand with a dynamic import, so the Firebase SDK is not in the first download and
 * a standalone demo makes no network calls at all.
 */
export type FeedStatus = 'signin' | 'connecting' | 'online' | 'error'

export type FeedHandlers = {
  onScan: (uid: string) => void
  onStatus: (status: FeedStatus, detail?: string) => void
  onUser: (email: string | null) => void
}

/** RFID UIDs are 4, 7 or 10 bytes: 8-20 hex characters. Checked again here even though the rules check it. */
const UID = /^[0-9A-F]{8,20}$/

export type FeedApi = {
  stop: () => void
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export async function startFeed(h: FeedHandlers): Promise<FeedApi> {
  const [{ initializeApp, getApps, getApp }, auth, db] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/database'),
  ])
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
  const a = auth.getAuth(app)
  const database = db.getDatabase(app)

  let unsubscribeScans: (() => void) | null = null
  let unsubscribeConn: (() => void) | null = null

  const watchScans = async () => {
    unsubscribeScans?.()
    // Only scans that happen from now on: ask the server what time it is, and start there.
    const offset = await new Promise<number>((resolve) =>
      db.onValue(db.ref(database, '.info/serverTimeOffset'), (s) => resolve(Number(s.val()) || 0), { onlyOnce: true }),
    )
    const since = Date.now() + offset - 1000
    const q = db.query(db.ref(database, 'scans'), db.orderByChild('at'), db.startAt(since))
    unsubscribeScans = db.onChildAdded(
      q,
      (snap) => {
        const uid = String(snap.val()?.uid ?? '').toUpperCase()
        if (UID.test(uid)) h.onScan(uid)
      },
      (err) => h.onStatus('error', err.message),
    )
  }

  const stopAuth = auth.onAuthStateChanged(a, (user) => {
    h.onUser(user?.email ?? null)
    unsubscribeScans?.()
    unsubscribeScans = null
    if (!user) return h.onStatus('signin')
    h.onStatus('connecting')
    void watchScans()
  })

  unsubscribeConn = db.onValue(db.ref(database, '.info/connected'), (s) => {
    if (a.currentUser) h.onStatus(s.val() ? 'online' : 'connecting')
  })

  return {
    stop() {
      stopAuth()
      unsubscribeScans?.()
      unsubscribeConn?.()
    },
    async signIn(email, password) {
      try {
        await auth.signInWithEmailAndPassword(a, email.trim(), password)
      } catch (e) {
        // never echo anything about the password; just say what kind of failure it was
        const code = (e as { code?: string }).code ?? ''
        throw new Error(
          code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')
            ? 'That email and password do not match an account.'
            : code.includes('too-many-requests')
              ? 'Too many attempts. Wait a minute and try again.'
              : code.includes('operation-not-allowed')
                ? 'Email sign-in is not switched on for this project.'
                : code.includes('network')
                  ? 'Could not reach the sign-in service.'
                  : 'Sign-in failed.',
        )
      }
    },
    async signOut() {
      await auth.signOut(a)
    },
  }
}
