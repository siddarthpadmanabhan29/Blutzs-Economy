console.log("script.js loaded");

// ---------- Firebase Imports ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { getFirestore, doc, setDoc, updateDoc, getDoc, getDocs, collection, addDoc, onSnapshot, increment, arrayUnion, query, where } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-analytics.js";

// ---------- Firebase Config ----------
const firebaseConfig = {
  apiKey: "AIzaSyBCEhZWsXu7Bwhfhv110kF1yCG_dfaMWQA",
  authDomain: "blutzs-economy.firebaseapp.com",
  projectId: "blutzs-economy",
  storageBucket: "blutzs-economy.appspot.com",
  messagingSenderId: "179946460985",
  appId: "1:179946460985:web:9df04b226f78b02e2efae8",
  measurementId: "G-H7VVLTN5GP"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app); // optional
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- Helpers ----------
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

function updateBalanceDisplay(balance) {
  const balanceElem = document.getElementById("user-balance");
  balanceElem.textContent = `$${balance}`;
  if (balance > 50) balanceElem.className = "balance-good";
  else if (balance >= 20) balanceElem.className = "balance-warning";
  else balanceElem.className = "balance-bad";
}

// ---------- Login / Register with Debugging ----------
document.getElementById("login-btn").addEventListener("click", async () => {
  console.log("Login button clicked");

  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value.trim();

  if (!username || !password) {
    console.warn("Both fields are required");
    alert("Enter both username and password");
    return;
  }

  const email = username + "@demo.com";
  console.log("Attempting login for:", email);

  try {
    await signInWithEmailAndPassword(auth, email, password);
    console.log("Login successful");
  } catch (loginErr) {
    console.warn("Login failed, trying to register:", loginErr.message);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      console.log("Registration successful for:", email);

      await setDoc(doc(db, "users", auth.currentUser.uid), {
        username: username,
        balance: 0,
        history: []
      });
      console.log("New user document created in Firestore");
    } catch (registerErr) {
      console.error("Registration failed:", registerErr);
      alert("Error: " + registerErr.message);
    }
  }
});

// ---------- Auth State ----------
onAuthStateChanged(auth, user => {
  if (user) {
    const userRef = doc(db, "users", user.uid);
    onSnapshot(userRef, snap => {
      if (snap.exists()) {
        const data = snap.data();
        document.getElementById("user-name").textContent = data.username;
        updateBalanceDisplay(data.balance);
        document.getElementById("history-table").innerHTML = data.history.map(h =>
          `<tr><td>${h.message}</td></tr>`).join("");
      }
    });
    loadShop();
    loadJobs();
    showScreen("dashboard");
  } else {
    showScreen("login-screen");
  }
});

// ---------- Shop ----------
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
  } else {
    alert("Not enough money!");
  }
}

// ---------- Jobs ----------
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
  await updateDoc(userRef, {
    balance: increment(pay),
    history: arrayUnion({ type: "job", message: `Earned $${pay} from ${jobName}` })
  });
}

// ---------- Transfer ----------
document.getElementById("transfer-btn").addEventListener("click", async () => {
  const toUser = document.getElementById("transfer-to").value.trim();
  const amount = parseInt(document.getElementById("transfer-amount").value);
  if (!toUser || isNaN(amount) || amount <= 0) return;

  const senderRef = doc(db, "users", auth.currentUser.uid);
  const senderSnap = await getDoc(senderRef);
  const senderData = senderSnap.data();
  if (senderData.balance < amount) return alert("Not enough balance");

  const q = query(collection(db, "users"), where("username", "==", toUser));
  const results = await getDocs(q);
  if (results.empty) return alert("Recipient not found");

  const receiverRef = results.docs[0].ref;

  await updateDoc(senderRef, {
    balance: increment(-amount),
    history: arrayUnion({ type: "transfer", message: `Sent $${amount} to ${toUser}` })
  });

  await updateDoc(receiverRef, {
    balance: increment(amount),
    history: arrayUnion({ type: "transfer", message: `Received $${amount} from ${senderData.username}` })
  });

  document.getElementById("transfer-message").textContent = "Transfer complete!";
});

// ---------- Admin ----------
document.getElementById("open-admin").addEventListener("click", () => showScreen("admin-panel"));
document.getElementById("back-to-dashboard").addEventListener("click", () => showScreen("dashboard"));

document.getElementById("add-item-btn").addEventListener("click", async () => {
  const name = document.getElementById("new-item-name").value;
  const cost = parseInt(document.getElementById("new-item-price").value);
  if (!name || isNaN(cost)) return;
  await addDoc(collection(db, "shop"), { name, cost });
});

document.getElementById("add-job-btn").addEventListener("click", async () => {
  const name = document.getElementById("new-job-name").value;
  const pay = parseInt(document.getElementById("new-job-pay").value);
  if (!name || isNaN(pay)) return;
  await addDoc(collection(db, "jobs"), { name, pay });
});

document.getElementById("admin-give-btn").addEventListener("click", async () => {
  const user = document.getElementById("admin-give-username").value.trim();
  const amount = parseInt(document.getElementById("admin-give-amount").value);
  if (!user || isNaN(amount)) return;

  const q = query(collection(db, "users"), where("username", "==", user));
  const results = await getDocs(q);
  if (results.empty) return alert("User not found");

  const userRef = results.docs[0].ref;
  await updateDoc(userRef, {
    balance: increment(amount),
    history: arrayUnion({ type: "admin", message: `Admin gave $${amount}` })
  });
});

// ---------- Logout ----------
document.getElementById("logout-btn").addEventListener("click", () => signOut(auth));
