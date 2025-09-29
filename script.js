console.log("script.js loaded");

// ---------- Firebase Imports ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { 
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, updateDoc, getDoc, getDocs, collection, addDoc,
  onSnapshot, increment, arrayUnion, query, where
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// ---------- Firebase Config ----------
const firebaseConfig = {
  apiKey: "AIzaSyBCEhZWsXu7Bwhfhv110kF1yCG_dfaMWQA",
  authDomain: "blutzs-economy.firebaseapp.com",
  projectId: "blutzs-economy",
  storageBucket: "blutzs-economy.firebasestorage.app",
  messagingSenderId: "179946460985",
  appId: "1:179946460985:web:9df04b226f78b02e2efae8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- Admin Username ----------
const ADMIN_USERNAME = "tennismaster29";

// ---------- Helpers ----------
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

// Updated balance display with flash effect
function updateBalanceDisplay(balance, elemId="user-balance", changeType=null) {
  const el = document.getElementById(elemId);
  el.textContent = `$${Number(balance).toFixed(2)}`;
  el.className = balance > 50 ? "balance-good" : (balance >= 20 ? "balance-warning" : "balance-bad");

  el.classList.remove("balance-flash-gain", "balance-flash-loss", "balance-flash-admin", "balance-flash-transfer");
  switch(changeType){
    case "gain": el.classList.add("balance-flash-gain"); break;
    case "loss": el.classList.add("balance-flash-loss"); break;
    case "admin": el.classList.add("balance-flash-admin"); break;
    case "transfer": el.classList.add("balance-flash-transfer"); break;
  }
  if(changeType) setTimeout(() => el.classList.remove(el.classList[1]), 1000);
}

// ---------- LOGIN / REGISTER ----------
document.getElementById("login-btn").addEventListener("click", async () => {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value.trim();
  if (!username || !password) return alert("Enter both fields");

  const email = username + "@demo.com";

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await createOrUpdateUserDoc(cred.user.uid, username);
    } else {
      alert("Login failed: " + error.message);
    }
  }
});

// ---------- CREATE OR FIX USER DOC ----------
async function createOrUpdateUserDoc(uid, username) {
  const now = new Date();
  const expiration = new Date(now);
  expiration.setFullYear(now.getFullYear() + 1);

  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    await setDoc(userRef, {
      username,
      balance: 0,
      history: [],
      renewalDate: now.toISOString(),
      expirationDate: expiration.toISOString(),
      renewalPending: false,
      isAdmin: username.toLowerCase() === ADMIN_USERNAME.toLowerCase()
    });
  } else {
    const data = snap.data();
    const updateData = {};
    if (!data.username) updateData.username = username;
    if (data.balance === undefined) updateData.balance = 0;
    if (!data.history) updateData.history = [];
    if (!data.renewalDate) updateData.renewalDate = now.toISOString();
    if (!data.expirationDate) updateData.expirationDate = expiration.toISOString();
    if (data.renewalPending === undefined) updateData.renewalPending = false;
    if (data.isAdmin === undefined) updateData.isAdmin = username.toLowerCase() === ADMIN_USERNAME.toLowerCase();
    if (Object.keys(updateData).length > 0) await updateDoc(userRef, updateData);
  }
}

// ---------- AUTH STATE ----------
onAuthStateChanged(auth, async user => {
  if (!user) {
    console.log("Logged out");
    showScreen("login-screen");
    document.getElementById("login-username").value = "";
    document.getElementById("login-password").value = "";
    document.getElementById("admin-panel").classList.add("hidden");
    document.getElementById("dashboard-navbar").classList.add("hidden");
    return;
  }

  console.log("Logged in:", user.uid);
  showScreen("dashboard");
  document.getElementById("dashboard-navbar").classList.remove("hidden");

  const username = user.email.split("@")[0];
  await createOrUpdateUserDoc(user.uid, username);

  const userRef = doc(db, "users", user.uid);
  onSnapshot(userRef, snap => {
    if (!snap.exists()) return;
    const data = snap.data();
    document.getElementById("user-name").textContent = data.username;
    updateBalanceDisplay(data.balance);

    document.getElementById("profile-username").textContent = data.username;
    document.getElementById("profile-uid").textContent = user.uid.slice(0, 8);
    document.getElementById("profile-renewal").textContent = new Date(data.renewalDate).toLocaleDateString();
    document.getElementById("profile-expiration").textContent = new Date(data.expirationDate).toLocaleDateString();
    document.getElementById("renewal-status").textContent = data.renewalPending ? "Pending Approval" : "Active";

    document.getElementById("history-table").innerHTML = (data.history || [])
      .map(h => `<tr><td class="history-${h.type}">${h.message}</td></tr>`).join("");

    if (data.isAdmin) {
      document.getElementById("open-admin").classList.remove("hidden");
      loadRenewalRequests();
    } else document.getElementById("open-admin").classList.add("hidden");
  });

  loadShop();
  loadJobs();
});

// ---------- SHOP ----------
function loadShop() {
  onSnapshot(collection(db, "shop"), snap => {
    const shopDiv = document.getElementById("shop-items");
    shopDiv.innerHTML = "";
    snap.forEach(docSnap => {
      const item = docSnap.data();
      const div = document.createElement("div");
      div.className = "item-card";
      const btn = document.createElement("button");
      btn.textContent = `${item.name} ($${item.cost})`;
      btn.onclick = () => buyItem(item.cost, item.name);
      div.appendChild(btn);
      shopDiv.appendChild(div);
    });
  });
}

async function buyItem(cost, name) {
  const userRef = doc(db, "users", auth.currentUser.uid);
  const snap = await getDoc(userRef);
  const data = snap.data();
  if (data.balance >= cost) {
    await updateDoc(userRef, {
      balance: increment(-cost),
      history: arrayUnion({ type: "purchase", message: `Bought ${name} for $${cost}` })
    });
    updateBalanceDisplay(data.balance - cost, "user-balance", "loss");
  } else alert("Not enough money!");
}

// ---------- JOBS ----------
function loadJobs() {
  onSnapshot(collection(db, "jobs"), snap => {
    const jobsDiv = document.getElementById("jobs");
    jobsDiv.innerHTML = "";
    snap.forEach(docSnap => {
      const job = docSnap.data();
      const btn = document.createElement("button");
      btn.textContent = `${job.name} (+$${job.pay})`;
      btn.onclick = () => doJob(job.pay, job.name);
      jobsDiv.appendChild(btn);
    });
  });
}

async function doJob(pay, jobName) {
  const userRef = doc(db, "users", auth.currentUser.uid);
  const snap = await getDoc(userRef);
  const data = snap.data();
  await updateDoc(userRef, {
    balance: increment(pay),
    history: arrayUnion({ type: "job", message: `Earned $${pay} from ${jobName}` })
  });
  updateBalanceDisplay(data.balance + pay, "user-balance", "gain");
}

// ---------- TRANSFER ----------
document.getElementById("transfer-btn").addEventListener("click", async () => {
  const toUserInput = document.getElementById("transfer-to").value.trim().toLowerCase();
  const amount = parseInt(document.getElementById("transfer-amount").value);
  if (!toUserInput || isNaN(amount) || amount <= 0) return alert("Enter valid username and amount");

  const senderRef = doc(db, "users", auth.currentUser.uid);
  const senderSnap = await getDoc(senderRef);
  const senderData = senderSnap.data();
  if (senderData.balance < amount) return alert("Not enough balance");

  // Case-insensitive username query
  const q = query(collection(db, "users"));
  const usersSnap = await getDocs(q);
  let receiverRef = null;
  let receiverData = null;
  usersSnap.forEach(u => {
    if (u.data().username.toLowerCase() === toUserInput) {
      receiverRef = u.ref;
      receiverData = u.data();
    }
  });
  if (!receiverRef) return alert("Recipient not found");

  // Update sender balance
  await updateDoc(senderRef, {
    balance: increment(-amount),
    history: arrayUnion({ type: "transfer", message: `Sent $${amount} to ${receiverData.username}` })
  });
  updateBalanceDisplay(senderData.balance - amount, "user-balance", "loss");

  // Update receiver balance
  await updateDoc(receiverRef, {
    balance: increment(amount),
    history: arrayUnion({ type: "transfer", message: `Received $${amount} from ${senderData.username}` })
  });

  document.getElementById("transfer-to").value = "";
  document.getElementById("transfer-amount").value = "";
});

// ---------- PROFILE RENEWAL ----------
document.getElementById("renew-btn").addEventListener("click", async () => {
  const userRef = doc(db, "users", auth.currentUser.uid);
  await updateDoc(userRef, { renewalPending: true });
  alert("Renewal request sent. Waiting for admin approval.");
});

// ---------- ADMIN PANEL ----------
document.getElementById("open-admin").addEventListener("click", () => document.getElementById("admin-panel").classList.remove("hidden"));
document.getElementById("back-to-dashboard").addEventListener("click", () => document.getElementById("admin-panel").classList.add("hidden"));

document.getElementById("add-item-btn").addEventListener("click", async () => {
  const name = document.getElementById("new-item-name").value.trim();
  const cost = parseInt(document.getElementById("new-item-price").value);
  if (!name || isNaN(cost)) return alert("Enter valid item and cost");
  await addDoc(collection(db, "shop"), { name, cost });
  document.getElementById("new-item-name").value = "";
  document.getElementById("new-item-price").value = "";
});

document.getElementById("add-job-btn").addEventListener("click", async () => {
  const name = document.getElementById("new-job-name").value.trim();
  const pay = parseInt(document.getElementById("new-job-pay").value);
  if (!name || isNaN(pay)) return alert("Enter valid job and pay");
  await addDoc(collection(db, "jobs"), { name, pay });
  document.getElementById("new-job-name").value = "";
  document.getElementById("new-job-pay").value = "";
});

// ---------- ADMIN GIVE MONEY ----------
let currentAdminSnapUnsub = null;
const adminUsernameInput = document.getElementById("admin-give-username");
const adminUserBalanceElem = document.getElementById("admin-user-balance");

adminUsernameInput.addEventListener("input", async () => {
  const username = adminUsernameInput.value.trim();
  if (currentAdminSnapUnsub) currentAdminSnapUnsub();

  if (!username) {
    adminUserBalanceElem.textContent = "Balance: N/A";
    adminUserBalanceElem.className = "";
    return;
  }

  const q = query(collection(db,"users"));
  const usersSnap = await getDocs(q);
  let userRef = null;
  usersSnap.forEach(u => {
    if (u.data().username.toLowerCase() === username.toLowerCase()) userRef = u.ref;
  });

  if (!userRef) {
    adminUserBalanceElem.textContent = "User not found";
    adminUserBalanceElem.className = "";
    return;
  }

  currentAdminSnapUnsub = onSnapshot(userRef, snap => {
    if (!snap.exists()) return;
    const data = snap.data();
    updateBalanceDisplay(data.balance, "admin-user-balance");
  });
});

document.getElementById("admin-give-btn").addEventListener("click", async () => {
  const username = adminUsernameInput.value.trim();
  const amount = parseInt(document.getElementById("admin-give-amount").value);
  if (!username || isNaN(amount)) return;
  if (!confirm(`Are you sure you want to give $${amount} to ${username}?`)) return;

  const q = query(collection(db,"users"));
  const usersSnap = await getDocs(q);
  let userRef = null;
  let data = null;
  usersSnap.forEach(u => {
    if (u.data().username.toLowerCase() === username.toLowerCase()) {
      userRef = u.ref;
      data = u.data();
    }
  });

  if (!userRef) return alert("User not found");

  await updateDoc(userRef, {
    balance: increment(amount),
    history: arrayUnion({ type: "admin", message: `Admin gave $${amount}` })
  });
  updateBalanceDisplay(data.balance + amount, "admin-user-balance", "admin");

  alert(`$${amount} added to ${username}'s account.`);
});

// ---------- ADMIN: RENEWAL REQUESTS ----------
function loadRenewalRequests() {
  const renewDiv = document.getElementById("renewal-requests");
  onSnapshot(query(collection(db,"users"), where("renewalPending","==",true)), snap => {
    renewDiv.innerHTML = "";
    snap.forEach(docSnap => {
      const user = docSnap.data();
      const div = document.createElement("div");
      div.className = "renew-request";
      div.textContent = `${user.username} (${docSnap.id.slice(0,8)}) wants renewal`;
      const btn = document.createElement("button");
      btn.textContent = "Approve";
      btn.onclick = async () => {
        const now = new Date();
        const expiration = new Date(now);
        expiration.setFullYear(now.getFullYear() + 1);
        await updateDoc(docSnap.ref, {
          renewalDate: now.toISOString(),
          expirationDate: expiration.toISOString(),
          renewalPending: false
        });
      };
      div.appendChild(btn);
      renewDiv.appendChild(div);
    });
  });
}

// ---------- LOGOUT ----------
document.getElementById("logout-btn").addEventListener("click", async () => {
  await signOut(auth);
  document.getElementById("login-username").value = "";
  document.getElementById("login-password").value = "";
  document.getElementById("admin-panel").classList.add("hidden");
  document.getElementById("dashboard-navbar").classList.add("hidden");
});
