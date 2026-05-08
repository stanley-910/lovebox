import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  updateDoc,
  deleteDoc,
  getDocs,
  writeBatch,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: "VITE_FIREBASE_API_KEY",
  authDomain: "lovebox-5716a.firebaseapp.com",
  projectId: "lovebox-5716a",
  storageBucket: "lovebox-5716a.firebasestorage.app",
  messagingSenderId: "VITE_FIREBASE_MESSAGING_SENDER_ID",
  appId: "VITE_FIREBASE_APP_ID",
};

const USERS = {
  'MQi5CK8RaGbgldD5FjEbRTbJsvE2': 'him',
  'gvc8NoVfbiVOyvPTgJd5SI6mn7b2': 'her',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export function signIn(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function onAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export function getIdentity() {
  const user = auth.currentUser;
  return user ? (USERS[user.uid] || null) : null;
}

const messagesRef = collection(db, 'messages');
const moodRef = collection(db, 'status');

export function subscribeMessages(callback) {
  const q = query(messagesRef, orderBy('timestamp', 'desc'), limit(20));
  return onSnapshot(q, (snapshot) => {
    const messages = [];
    snapshot.forEach((doc) => {
      messages.push({ id: doc.id, ...doc.data() });
    });
    callback(messages);
  });
}

export async function sendMessage(text, from) {
  await addDoc(messagesRef, {
    text,
    from,
    timestamp: serverTimestamp(),
    read: false,
    type: 'text',
    mood: '',
  });
}

export async function sendDrawing(dataUrl, from) {
  await addDoc(messagesRef, {
    text: '',
    imageUrl: dataUrl,
    from,
    timestamp: serverTimestamp(),
    read: false,
    type: 'drawing',
    mood: '',
  });
}

export async function markRead(messageId) {
  await updateDoc(doc(db, 'messages', messageId), { read: true });
}

export function subscribeMood(callback) {
  const q = query(moodRef, orderBy('timestamp', 'desc'), limit(1));
  return onSnapshot(q, (snapshot) => {
    snapshot.forEach((doc) => {
      callback({ id: doc.id, ...doc.data() });
    });
  });
}

export async function setMood(mood, from) {
  await addDoc(moodRef, {
    mood,
    from,
    timestamp: serverTimestamp(),
  });
}

const canvasStrokesRef = collection(db, 'canvas_strokes');

export function subscribeCanvas(callback) {
  const q = query(canvasStrokesRef, orderBy('timestamp', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const strokes = [];
    snapshot.forEach((doc) => {
      strokes.push({ id: doc.id, ...doc.data() });
    });
    callback(strokes);
  });
}

export async function addStroke(strokeData) {
  await addDoc(canvasStrokesRef, {
    ...strokeData,
    timestamp: serverTimestamp(),
  });
}

export async function deleteStroke(strokeId) {
  await deleteDoc(doc(db, 'canvas_strokes', strokeId));
}

export async function clearCanvas() {
  const snapshot = await getDocs(canvasStrokesRef);
  const batch = writeBatch(db);
  snapshot.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

const snapshotsRef = collection(db, 'canvas_snapshots');

export function subscribeSnapshots(callback) {
  const q = query(snapshotsRef, orderBy('timestamp', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const snaps = [];
    snapshot.forEach((doc) => {
      snaps.push({ id: doc.id, ...doc.data() });
    });
    callback(snaps);
  });
}

export async function saveSnapshot(dataUrl, from) {
  await addDoc(snapshotsRef, {
    imageUrl: dataUrl,
    from,
    timestamp: serverTimestamp(),
  });
}

export async function deleteSnapshot(snapshotId) {
  await deleteDoc(doc(db, 'canvas_snapshots', snapshotId));
}

// ── Spotify playback ──

export function subscribePlayback(identity, callback) {
  return onSnapshot(doc(db, 'playback', identity), (snap) => {
    callback(snap.exists() ? snap.data() : null);
  });
}

export async function sendSpotifyCommand(action, uri, target) {
  await addDoc(collection(db, 'spotify-commands'), {
    action,
    uri,
    target,
    executed: false,
    timestamp: serverTimestamp(),
  });
}
