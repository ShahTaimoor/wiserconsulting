// server.js
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
require("dotenv").config();

const connectDB = require("./config/db");
const userRoutes = require("./routes/userRoutes");
const assessmentRoutes = require("./routes/assessmentRoutes");
const formSubmissionRoutes = require("./routes/formSubmissionRoutes");
const contactRoutes = require("./routes/contactRoutes");
const adminSettingsRoutes = require("./routes/adminSettingsRoutes");
const siteSettingsRoutes = require("./routes/siteSettingsRoutes");
const reuploadRoutes = require("./routes/reuploadRoutes");
const approvedVisaRoutes = require("./routes/approvedVisaRoutes");
const testimonialRoutes = require("./routes/testimonialRoutes");
const touristVisaRoutes = require("./routes/touristVisaRoutes");
const {
  apiLimiter,
  uploadLimiter,
} = require("./middleware/rateLimiter");
const sanitize = require("./middleware/sanitize");
const skipPaths = require("./middleware/skipPaths");
const touristVisaBodyParser = require("./middleware/touristVisaBodyParser");
const touristVisaFeatureGate = require("./middleware/touristVisaFeatureGate");
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
  "https://wiserconsulting.info",
  "https://www.wiserconsulting.info"
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
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};
app.use(cors(corsOptions));

// Tourist Visa feature switch (TOURIST_VISA_ENABLED, off unless exactly "true"). It comes right after
// CORS, so a browser can read the answer, and before everything else: while it is closed no
// header, body or token is read, nothing is logged and the database is never touched.
app.use("/api/tourist-visa", touristVisaFeatureGate.allowingStatus);

// Security headers
app.use(helmet());

// Tourist Visa requests are parsed first, with log-safe errors (see the middleware).
app.use("/api/tourist-visa", touristVisaBodyParser);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Input sanitization (must be after body parsing).
// Skipped for the Tourist Visa routes: it strips < and >, and free-text answers must stay as typed.
app.use(skipPaths(["/api/tourist-visa"], sanitize));

// Rate limiting
app.use("/api", apiLimiter);

// The one Tourist Visa URL that answers while the feature is closed (GET /api/tourist-visa/status, { open }). It sits right after
// the general rate limiter and before the router: no sign-in and no database.
app.get("/api/tourist-visa/status", touristVisaFeatureGate.touristVisaStatus);

// Serve static files from uploads directory
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// API Routes with rate limiting
app.use("/api/tourist-visa", touristVisaRoutes);
app.use("/api", userRoutes);
app.use("/api", assessmentRoutes);
app.use("/api", formSubmissionRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/admin-settings", adminSettingsRoutes);
app.use("/api/site-settings", siteSettingsRoutes);
app.use("/api/reupload-document", reuploadRoutes);
app.use("/api/approved-visas", approvedVisaRoutes);
app.use("/api/testimonials", testimonialRoutes);

app.get("/", (req, res) => {
  res.send("Welcome to the backend");
});

// Central Error Handler (must be last)
const { errorHandler } = require("./middleware/errorHandler");
app.use(errorHandler);

app.listen(process.env.PORT, () => {
  logger.info(`✅ Server running on port ${process.env.PORT}`);
});
