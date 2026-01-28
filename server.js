const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static("public"));

const PORT = process.env.PORT || 8080;
const MONGODB_URI = process.env.MONGODB_URI;

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Could not connect to MongoDB", err));

app.get("/", (req, res) => {
  res.send("Online Examination Management System API is running...");
});

// Routes
app.use("/auth", require("./routes/auth"));
app.use("/exams", require("./routes/exams"));
// Submission/Results routes can be part of exams or separate
app.use("/submit", require("./routes/submissions"));

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
