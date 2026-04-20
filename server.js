const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const os = require("os");

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static("public"));
app.use('/storage', express.static('storage'));

const PORT = process.env.PORT || 8080;
const MONGODB_URI = process.env.MONGODB_URI;

const User = require("./models/User");

mongoose
  .connect(MONGODB_URI)
  .then(async () => {
    console.log("Connected to MongoDB");

    // Ensure default admin credentials always work:
    // admin@gmail.com / admin@123
    const adminEmail = "admin@gmail.com";
    const adminPassword = "admin@123";
    const hashed = await bcrypt.hash(adminPassword, 10);

    await User.updateOne(
      { email: adminEmail },
      {
        $set: {
          name: "Admin",
          role: "Admin",
          password: hashed,
          isExpertApproved: false
        }
      },
      { upsert: true }
    );
  })
  .catch((err) => console.error("Could not connect to MongoDB", err));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "online-exam", time: new Date().toISOString() });
});

app.get("/api/public-base-url", (req, res) => {
  const configured = process.env.PUBLIC_BASE_URL;
  if (configured) {
    return res.json({ baseUrl: configured });
  }

  const interfaces = os.networkInterfaces();
  const ipv4Candidates = [];
  Object.values(interfaces).forEach((entries) => {
    (entries || []).forEach((entry) => {
      if (entry && entry.family === "IPv4" && !entry.internal) {
        ipv4Candidates.push(entry.address);
      }
    });
  });

  const privateIpv4 = ipv4Candidates.find((ip) =>
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  );
  const lanIp = privateIpv4 || ipv4Candidates.find((ip) => !/^169\.254\./.test(ip)) || null;

  const protocol = req.protocol || "http";
  const host = req.get("host") || `localhost:${PORT}`;
  const port = host.includes(":") ? host.split(":")[1] : String(PORT);
  const baseUrl = lanIp ? `${protocol}://${lanIp}:${port}` : null;

  res.json({ baseUrl, warning: baseUrl ? null : "No LAN IPv4 detected. Set PUBLIC_BASE_URL in .env" });
});

// Serve the frontend landing/app
app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "public" });
});

// Routes
app.use("/auth", require("./routes/auth"));
app.use("/exams", require("./routes/exams"));
// Submission/Results routes can be part of exams or separate
app.use("/submit", require("./routes/submissions"));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
});
