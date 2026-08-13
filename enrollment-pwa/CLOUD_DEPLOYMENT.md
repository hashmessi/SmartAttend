# ☁️ SmartAttend — Step-by-Step 24/7 Cloud Deployment Guide

This guide details how to host your SmartAttend Face Registration PWA **live 24/7** for free, without keeping your laptop turned on, by deploying the server to **Render** and storing image datasets on **Cloudinary**.

---

## 🛠️ Step 1: Get Free Cloudinary API Credentials
Cloudinary is a free media hosting service. It will store all student face photos securely.

1. Go to **[Cloudinary Sign Up](https://cloudinary.com/users/register_free)** and create a free account.
2. Log in to your Cloudinary Dashboard.
3. Locate your **Product Environment Credentials**:
   - **Cloud Name** (e.g. `dpxxxxxxx`)
   - **API Key** (e.g. `123456789012345`)
   - **API Secret** (e.g. `abcde-fgh-ijkl-mnopqrstuvwx`)

---

## 🚀 Step 2: Push Project Code to GitHub
Render links directly to a GitHub repository to build and deploy your app.

1. Create a new **Private** or **Public** repository on GitHub named `smartattend-registration`.
2. Push your `enrollment-pwa` directory code to this repository:
   ```bash
   cd "smart - attendance system/enrollment-pwa"
   git init
   git add .
   git commit -m "Initial commit with Cloudinary integration"
   git branch -M main
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/smartattend-registration.git
   git push -u origin main
   ```

---

## 🌐 Step 3: Deploy to Render (Node.js Web Service)
Render is a free cloud hosting service for Node.js backends.

1. Go to **[Render Dashboard](https://dashboard.render.com/)** and log in.
2. Click **New +** → **Web Service**.
3. Connect your GitHub account and select your `smartattend-registration` repository.
4. Configure the Web Service settings:
   - **Name**: `smartattend-registration`
   - **Region**: Any (e.g. Oregon or Singapore)
   - **Branch**: `main`
   - **Root Directory**: `enrollment-pwa` (or leave empty with root package.json)
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: **Free**

---

## 🔑 Step 4: Configure Environment Variables on Render
This links your Render server to your Cloudinary storage and sets your staff passcode.

1. In your Render Web Service dashboard, go to the **Environment** tab.
2. Add the following **Key/Value** variables:

| Key | Value | Description |
|---|---|---|
| `CLOUDINARY_CLOUD_NAME` | *Your Cloudinary Cloud Name* | From Step 1 |
| `CLOUDINARY_API_KEY` | *Your Cloudinary API Key* | From Step 1 |
| `CLOUDINARY_API_SECRET` | *Your Cloudinary API Secret* | From Step 1 |
| `ADMIN_PIN` | `2456` | Your secure Staff Passcode |

3. Click **Save Changes**. Render will automatically restart and deploy your live app!

---

## 💬 Step 5: Send Link to Students on WhatsApp
Once Render finishes deploying, it will provide your permanent HTTPS link (e.g., `https://smartattend-registration.onrender.com`).

Copy and paste this message into WhatsApp:

```text
📢 SmartAttend — Student Face Registration Notice

Dear Students,
Please register your facial metrics for the upcoming Automated Smart Attendance System.

👉 Registration Link: https://smartattend-registration.onrender.com

📋 Instructions:
1. Open the link in Chrome / Safari on your mobile phone.
2. Enter your Name, Register Number, Department, Section, and Year.
3. Allow camera access and follow the 4 pose prompts (Straight, Left, Right, Tilt).
4. Tap "Submit Face Metrics".

🔒 Notice: Biometric data is encrypted and saved securely to the department database.
```

---

## 📦 How to Download Dataset (Admin)
1. Open your live Render link on your computer: `https://smartattend-registration.onrender.com`.
2. Click **"Staff"** in the top-right corner.
3. Enter Passcode: **`2456`**.
4. Click **"Export ZIP"**. The server will dynamically download all images from Cloudinary, bundle them, and stream a single ZIP file (`SmartAttend_Dataset.zip`) directly to your Downloads folder!
