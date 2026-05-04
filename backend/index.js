// server.js
const express = require("express");
const cors = require("cors");
const session = require("express-session");
const passport = require("passport");
const cookieParser = require("cookie-parser");
const path = require("path");
require("dotenv").config();
require("./config/passport");

const connectDB = require("./config/db");
const userRoutes = require("./routes/userRoutes");
const authRoutes = require("./routes/authRoutes");
const assessmentRoutes = require("./routes/assessmentRoutes");
const formSubmissionRoutes = require("./routes/formSubmissionRoutes");
const contactRoutes = require("./routes/contactRoutes");
const adminSettingsRoutes = require("./routes/adminSettingsRoutes");
const reuploadRoutes = require("./routes/reuploadRoutes");
const {
  apiLimiter,
  authLimiter,
  uploadLimiter,
} = require("./middleware/rateLimiter");
const sanitize = require("./middleware/sanitize");
const logger = require("./utils/logger");

connectDB();

const app = express();

// Middlewares
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(
        new Error(`CORS policy does not allow access from origin ${origin}`),
      );
    }
  },
  credentials: true,
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Input sanitization (must be after body parsing)
app.use(sanitize);

// Rate limiting
app.use("/api", apiLimiter);

// Session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    },
  }),
);

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// Serve static files from uploads directory
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// API Routes with rate limiting
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api", userRoutes);
app.use("/api", assessmentRoutes);
app.use("/api", formSubmissionRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/admin-settings", adminSettingsRoutes);
app.use("/api/reupload-document", reuploadRoutes);

app.get("/", (req, res) => {
  res.send("Welcome to the backend");
});

// Central Error Handler (must be last)
const { errorHandler } = require("./middleware/errorHandler");
app.use(errorHandler);

app.listen(process.env.PORT, () => {
  logger.info(`✅ Server running on port ${process.env.PORT}`);
});
