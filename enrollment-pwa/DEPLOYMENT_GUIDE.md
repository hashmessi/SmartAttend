# 📱 SmartAttend Face Dataset Collection — WhatsApp Sharing & Deployment Guide

## 📲 Option B: Deploy & Share Link via WhatsApp (Anywhere Access)

Students across the entire campus (hostels, home, mobile data) can register their face metrics by opening an HTTPS link sent directly in your WhatsApp group.

---

### Step 1: Start the Local Server
Open the folder `enrollment-pwa/` and double click:
👉 **`1_start_server.bat`** (or run `node server.js`)

---

### Step 2: Generate the Public WhatsApp Link
In the same folder, double click:
👉 **`2_start_whatsapp_link.bat`** (or run `npx localtunnel --port 5173`)

This gives you an instant public HTTPS link, for example:
```
your url is: https://xxxx-xxxx-xxxx.loca.lt
```

---

### Step 3: Send this Message to Students on WhatsApp

Copy and paste this message into your college / class WhatsApp group:

```text
📢 SmartAttend — Student Face Registration Notice

Dear Students,
Please register your facial metrics for the upcoming Automated Smart Attendance System.

👉 Registration Link: <PASTE_YOUR_TUNNEL_LINK_HERE>

📋 Steps:
1. Open the link on your mobile phone (Chrome / Safari).
2. Enter your Name, Register Number, Department, Section, and Year.
3. Allow camera access and follow the 4 quick pose prompts (Straight, Left, Right, Tilt).
4. Tap "Submit Face Metrics".

🔒 Notice: Your data is securely encrypted in the departmental database.
```

---

### Step 4: What Students Experience (100% Privacy)
1. Students open the clean iOS light-themed form.
2. They allow camera access and capture 8 face angles in ~5 seconds.
3. Upon tapping **Submit**, their metrics are transmitted directly to your laptop's `./dataset` folder.
4. Students immediately see the **"Registration Complete! Thank you!"** card.
5. **Privacy Guarantee**: Students cannot view other students' photos, access the dataset directory, or see any backend controls.

---

### Step 5: Exporting the Dataset for ML Training (Passcode: `2456`)

Once students have registered:
1. Open **`http://localhost:5173`** on your laptop.
2. Click **"Staff"** in the top-right corner.
3. Enter Passcode: **`2456`**.
4. Click **"Export ZIP"**.

Your complete training dataset is downloaded as `SmartAttend_Dataset_YYYY-MM-DD.zip` containing:
- Organized student image folders: `dataset/{DEPT}_{SEC}_{REGNO}/01.jpg...`
- `metadata.json`
- `students.csv`
