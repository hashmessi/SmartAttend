// ═══════════════════════════════════════════════════════════════
// SmartAttend Enrollment Server & Database (server.js)
// Secure Server-side Dataset Storage + Cloudinary Support + Admin Passcode 2456
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const https = require('https');
const cloudinary = require('cloudinary').v2;

const app = express();
const PORT = process.env.PORT || 5173;
const ADMIN_PIN = process.env.ADMIN_PIN || '2456';

const DATASET_DIR = path.join(__dirname, 'dataset');
const DB_FILE = path.join(DATASET_DIR, 'database.json');

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname), {
  etag: false,
  maxAge: 0,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Ensure dataset folder and database.json exist
if (!fs.existsSync(DATASET_DIR)) {
  fs.mkdirSync(DATASET_DIR, { recursive: true });
}
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
}

// Cloudinary Configuration
const hasCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
if (hasCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  console.log('☁️ Cloudinary cloud storage verified.');
} else {
  console.log('📁 Local disk storage configured.');
}

// Helpers
function getDB() {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    return [];
  }
}

function saveDB(records) {
  fs.writeFileSync(DB_FILE, JSON.stringify(records, null, 2), 'utf8');
}

function verifyAdmin(req, res, next) {
  const pin = req.headers['x-admin-pin'] || req.query.pin;
  if (pin === ADMIN_PIN) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized: Invalid Admin PIN' });
  }
}

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ── PUBLIC ENDPOINT: Student Face Submission ──────────────────
app.post('/api/enroll', async (req, res) => {
  try {
    const { name, regNo, dept, section, year, semester, email, photos } = req.body;

    if (!name || !regNo || !dept || !section || !photos || !photos.length) {
      return res.status(400).json({ error: 'Missing required student details or photos.' });
    }

    const cleanReg = regNo.trim().toUpperCase();
    const cleanDept = dept.trim().toUpperCase();
    const cleanSec = section.trim().toUpperCase();
    const folderName = `${cleanDept}_${cleanSec}_${cleanReg}`;

    let photoPaths = [];

    if (hasCloudinary) {
      // Parallel upload to Cloudinary
      const uploadPromises = photos.map((base64Str, idx) => {
        return cloudinary.uploader.upload(base64Str, {
          folder: `smartattend/${folderName}`,
          public_id: `${idx + 1}`,
          resource_type: 'image'
        }).then(result => result.secure_url);
      });
      photoPaths = await Promise.all(uploadPromises);
    } else {
      // Local disk fallback
      const studentFolder = path.join(DATASET_DIR, folderName);
      if (!fs.existsSync(studentFolder)) {
        fs.mkdirSync(studentFolder, { recursive: true });
      }
      photos.forEach((base64Str, idx) => {
        const matches = base64Str.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
        if (matches) {
          const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
          const buffer = Buffer.from(matches[2], 'base64');
          const filename = `${String(idx + 1).padStart(2, '0')}.${ext}`;
          const filePath = path.join(studentFolder, filename);
          fs.writeFileSync(filePath, buffer);
          photoPaths.push(`${folderName}/${filename}`);
        }
      });
    }

    const db = getDB();
    const existingIdx = db.findIndex(s => s.regNo === cleanReg);
    const newStudent = {
      id: existingIdx >= 0 ? db[existingIdx].id : 'stu_' + Date.now(),
      name: name.trim(),
      regNo: cleanReg,
      dept: cleanDept,
      section: cleanSec,
      year: parseInt(year) || 1,
      semester: semester ? parseInt(semester) : null,
      email: email ? email.trim() : null,
      folderName,
      photos: photoPaths,
      photoCount: photoPaths.length,
      enrolledAt: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      db[existingIdx] = newStudent;
    } else {
      db.push(newStudent);
    }
    saveDB(db);

    console.log(`[ENROLLED] ${newStudent.name} (${newStudent.regNo}) -> Saved successfully.`);

    res.json({
      success: true,
      message: 'Face metrics successfully saved to database.',
      student: { name: newStudent.name, regNo: newStudent.regNo, dept: newStudent.dept, section: newStudent.section }
    });
  } catch (err) {
    console.error('Enrollment error:', err);
    res.status(500).json({ error: 'Server error saving student face dataset.' });
  }
});

// ── ADMIN ENDPOINTS (PIN Protected) ───────────────────────────
app.post('/api/admin/verify', (req, res) => {
  const { pin } = req.body;
  if (pin === ADMIN_PIN) {
    res.json({ success: true, message: 'Admin authenticated successfully.' });
  } else {
    res.status(401).json({ success: false, error: 'Incorrect Admin PIN.' });
  }
});

app.get('/api/admin/students', verifyAdmin, (req, res) => {
  const db = getDB();
  res.json({ students: db });
});

app.delete('/api/admin/students/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    let db = getDB();
    const student = db.find(s => s.id === id);

    if (!student) {
      return res.status(404).json({ error: 'Student record not found.' });
    }

    if (hasCloudinary) {
      // Delete photos folder from Cloudinary
      try {
        await cloudinary.api.delete_resources_by_prefix(`smartattend/${student.folderName}`);
        await cloudinary.api.delete_folder(`smartattend/${student.folderName}`);
      } catch (cErr) {
        console.warn('Cloudinary delete warning:', cErr.message);
      }
    } else {
      const studentFolder = path.join(DATASET_DIR, student.folderName);
      if (fs.existsSync(studentFolder)) {
        fs.rmSync(studentFolder, { recursive: true, force: true });
      }
    }

    db = db.filter(s => s.id !== id);
    saveDB(db);

    res.json({ success: true, message: `Student ${student.name} deleted.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Delete failed.' });
  }
});

app.get('/api/admin/export', verifyAdmin, async (req, res) => {
  try {
    const zip = new JSZip();
    const datasetFolder = zip.folder('dataset');

    const db = getDB();
    datasetFolder.file('metadata.json', JSON.stringify(db, null, 2));

    const csvHeader = 'regNo,name,dept,section,year,semester,folderName,photoCount,enrolledAt\n';
    const csvRows = db.map(r =>
      `"${r.regNo}","${r.name}","${r.dept}","${r.section}","${r.year}","${r.semester || ''}","${r.folderName}","${r.photoCount}","${r.enrolledAt}"`
    ).join('\n');
    datasetFolder.file('students.csv', csvHeader + csvRows);

    // Bundle student photos to zip (parallel download if cloud, disk read if local)
    for (const student of db) {
      const zipSubFolder = datasetFolder.folder(student.dept).folder(student.section).folder(student.regNo);

      if (hasCloudinary && student.photos && student.photos.length) {
        const downloadPromises = student.photos.map(async (url, idx) => {
          try {
            const fileData = await downloadImage(url);
            const filename = `${String(idx + 1).padStart(2, '0')}.jpg`;
            zipSubFolder.file(filename, fileData);
          } catch (dErr) {
            console.error(`Error downloading Cloudinary file ${url}:`, dErr);
          }
        });
        await Promise.all(downloadPromises);
      } else {
        const sFolder = path.join(DATASET_DIR, student.folderName);
        if (fs.existsSync(sFolder)) {
          const files = fs.readdirSync(sFolder);
          for (const file of files) {
            const fileData = fs.readFileSync(path.join(sFolder, file));
            zipSubFolder.file(file, fileData);
          }
        }
      }
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const timestamp = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=SmartAttend_Dataset_${timestamp}.zip`);
    res.send(zipBuffer);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Failed to generate dataset ZIP.' });
  }
});

const os = require('os');

// Helper to get local network IP
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Start server on 0.0.0.0 for multi-device network access
app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log(`\n══════════════════════════════════════════════════════════`);
  console.log(`📱 SmartAttend Face Registration PWA — Ready for Deployment`);
  console.log(`──────────────────────────────────────────────────────────`);
  console.log(`💻 Local Access:        http://localhost:${PORT}`);
  console.log(`🌐 Campus / WiFi URL:   http://${localIP}:${PORT}`);
  console.log(`🔒 Staff Passcode:      ${ADMIN_PIN}`);
  console.log(`📁 Dataset Directory:   ${DATASET_DIR}`);
  console.log(`══════════════════════════════════════════════════════════\n`);
});
