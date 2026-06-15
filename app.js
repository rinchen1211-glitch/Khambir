import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, setDoc, getDoc, getDocs, query, where, orderBy, onSnapshot, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC9bWhSID3NszLkwgP2sgR5QBzzUlNrn5c",
  authDomain: "chamber-chat-c7d59.firebaseapp.com",
  projectId: "chamber-chat-c7d59",
  storageBucket: "chamber-chat-c7d59.firebasestorage.app",
  messagingSenderId: "740926589447",
  appId: "1:740926589447:web:3c613edeb82eeb47ae78a2",
  measurementId: "G-VCC6CBW5BF"
};

const app = initializeApp(firebaseConfig);
getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null, activeChat = null, unsubscribeChats = null, unsubscribeMessages = null;
const authScreen = document.getElementById("authScreen"), appScreen = document.getElementById("appScreen");
const nameInput = document.getElementById("nameInput"), emailInput = document.getElementById("emailInput"), passwordInput = document.getElementById("passwordInput"), authMsg = document.getElementById("authMsg");
const meName = document.getElementById("meName"), chatList = document.getElementById("chatList"), messagesEl = document.getElementById("messages"), chatTitle = document.getElementById("chatTitle"), chatSubtitle = document.getElementById("chatSubtitle"), messageInput = document.getElementById("messageInput"), searchInput = document.getElementById("searchInput");

function showError(err){ authMsg.textContent = err.message || String(err); }
async function saveUser(user, fallbackName="Khambir User"){
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const name = user.displayName || fallbackName || user.email;
  if(!snap.exists()) await setDoc(ref, { uid:user.uid, name, email:user.email, createdAt:serverTimestamp() });
}
document.getElementById("signupBtn").onclick = async () => {
  try{ authMsg.textContent=""; const name = nameInput.value.trim() || "Khambir User"; const cred = await createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value); await updateProfile(cred.user, {displayName:name}); await saveUser(cred.user, name); }catch(err){showError(err);}
};
document.getElementById("loginBtn").onclick = async () => {
  try{ authMsg.textContent=""; await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value); }catch(err){showError(err);}
};
document.getElementById("googleBtn").onclick = async () => {
  try{ authMsg.textContent=""; const cred = await signInWithPopup(auth, new GoogleAuthProvider()); await saveUser(cred.user); }catch(err){showError(err);}
};
document.getElementById("logoutBtn").onclick = () => signOut(auth);

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if(user){
    await saveUser(user);
    authScreen.classList.add("hidden"); appScreen.classList.remove("hidden");
    meName.textContent = user.displayName || user.email;
    listenToChats();
  } else {
    appScreen.classList.add("hidden"); authScreen.classList.remove("hidden");
    if(unsubscribeChats) unsubscribeChats();
    if(unsubscribeMessages) unsubscribeMessages();
  }
});

function listenToChats(){
  if(unsubscribeChats) unsubscribeChats();
  const q = query(collection(db, "chats"), where("members", "array-contains", currentUser.uid));
  unsubscribeChats = onSnapshot(q, snap => {
    const chats = []; snap.forEach(d => chats.push({id:d.id, ...d.data()}));
    renderChats(chats);
  });
}
function renderChats(chats){
  const filter = searchInput.value.toLowerCase(); chatList.innerHTML = "";
  chats.filter(c => (c.name || "Private Chat").toLowerCase().includes(filter)).sort((a,b)=>(b.updatedAt?.seconds||0)-(a.updatedAt?.seconds||0)).forEach(chat=>{
    const div = document.createElement("div");
    div.className = "chat-item" + (activeChat?.id === chat.id ? " active" : "");
    div.innerHTML = `<div class="avatar">${(chat.name || "C")[0].toUpperCase()}</div><div class="chat-meta"><h3>${escapeHtml(chat.name || "Private Chat")}</h3><p>${escapeHtml(chat.lastMessage || "No messages yet")}</p></div>`;
    div.onclick = () => openChat(chat);
    chatList.appendChild(div);
  });
}
searchInput.oninput = listenToChats;

async function createPrivateChat(){
  const email = prompt("Enter user's email:"); if(!email) return;
  const usersSnap = await getDocs(query(collection(db, "users"), where("email", "==", email.trim())));
  if(usersSnap.empty){ alert("No user found. Ask them to sign up first."); return; }
  const other = usersSnap.docs[0].data();
  await addDoc(collection(db, "chats"), {type:"private", name:other.name || other.email, members:[currentUser.uid, other.uid], memberEmails:[currentUser.email, other.email], createdAt:serverTimestamp(), updatedAt:serverTimestamp(), lastMessage:""});
}
async function createGroupChat(){
  const name = prompt("Group name:"); if(!name) return;
  const emails = prompt("Member emails separated by comma. They must sign up first:"); if(!emails) return;
  const members = [currentUser.uid], memberEmails = [currentUser.email];
  for(const email of emails.split(",").map(e=>e.trim()).filter(Boolean)){
    const usersSnap = await getDocs(query(collection(db, "users"), where("email", "==", email)));
    if(!usersSnap.empty){ const u = usersSnap.docs[0].data(); members.push(u.uid); memberEmails.push(u.email); }
  }
  await addDoc(collection(db, "chats"), {type:"group", name, members:[...new Set(members)], memberEmails:[...new Set(memberEmails)], createdAt:serverTimestamp(), updatedAt:serverTimestamp(), lastMessage:""});
}
document.getElementById("newPrivateBtn").onclick = createPrivateChat;
document.getElementById("newGroupBtn").onclick = createGroupChat;

function openChat(chat){
  activeChat = chat; chatTitle.textContent = chat.name || "Chat"; chatSubtitle.textContent = chat.type === "group" ? "Group chat" : "Private chat"; listenToMessages(chat.id);
}
function listenToMessages(chatId){
  if(unsubscribeMessages) unsubscribeMessages();
  const q = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "asc"));
  unsubscribeMessages = onSnapshot(q, snap => {
    messagesEl.innerHTML = "";
    if(snap.empty){ messagesEl.innerHTML = '<div class="empty">No messages yet</div>'; return; }
    snap.forEach(d => {
      const m = d.data(), mine = m.senderId === currentUser.uid;
      const div = document.createElement("div"); div.className = "msg " + (mine ? "me" : "them");
      div.innerHTML = `${!mine ? `<div class="sender">${escapeHtml(m.senderName || "User")}</div>` : ""}${escapeHtml(m.text || "")}<small>${formatTime(m.createdAt)}</small>`;
      messagesEl.appendChild(div);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}
document.getElementById("messageForm").onsubmit = async e => {
  e.preventDefault(); if(!activeChat || !messageInput.value.trim()) return;
  const text = messageInput.value.trim(); messageInput.value = "";
  await addDoc(collection(db, "chats", activeChat.id, "messages"), {text, senderId:currentUser.uid, senderName:currentUser.displayName || currentUser.email, createdAt:serverTimestamp()});
  await updateDoc(doc(db, "chats", activeChat.id), {lastMessage:text, updatedAt:serverTimestamp()});
};
function formatTime(ts){ return ts?.toDate ? ts.toDate().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}) : ""; }
function escapeHtml(text){ return String(text).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m])); }
