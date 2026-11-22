// server.js
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
require("dotenv").config();

// Tourist Visa safe start-up (step 8j-3, A11): while TOURIST_VISA_ENABLED is "true" the server refuses to start (exit code 1, the variable
// names in the message, never a value) when the encryption key, the token secret or the AI settings are missing or invalid. While the
// feature is off nothing is checked and nothing is logged. This runs before anything else is loaded, so a bad setting stops it at once.
if (!require("./config/touristVisaStartup").checkTouristVisaStartup()) {
  process.exit(1);
}

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
const touristVisaNoStore = require("./middleware/touristVisaNoStore");
const touristVisaOriginGuard = require("./middleware/touristVisaOriginGuard");
const { getAllowedOrigins } = require("./config/allowedOrigins");
const logger = require("./utils/logger");

// After the database is connected, the administrator account from .env (ADMIN_USER_EMAIL / ADMIN_USER_PASSWORD) is created or kept up to date.
Promise.resolve(connectDB()).then(() => require("./services/adminBootstrap").ensureAdminFromEnv());

const app = express();

// The app runs behind one reverse proxy (nginx, or Vercel). With this the client's real address (X-Forwarded-For, set by
// that proxy) is used by the rate limiters and the logs; without it every visitor would look like 127.0.0.1 and share one
// limit. The number is how many proxies are in front: raise it only if another one (a load balancer, a CDN) is added.
app.set("trust proxy", 1);
// Security log (one JSON line per refused request, failed sign-in, rate limit or admin change; see utils/securityLog.js).
app.use(require("./utils/securityLog").securityAudit);

// Middlewares
const allowedOrigins = getAllowedOrigins();

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
  allowedHeaders: ["Content-Type", "Authorization"],
  // The browser may read the PDF file name the server chose (the applicant's name and the document) from Content-Disposition.
  exposedHeaders: ["Content-Disposition"],
};
// Two Tourist Visa protections that run BEFORE CORS and only while the feature is open (step 8j-3). While it is closed they do nothing, so a
// closed deployment behaves exactly as before (and the feature gate below marks its own fixed answer no-store).
//  - B6: every answer under /api/tourist-visa (an error, a refusal or a rate-limit answer too) is marked Cache-Control: no-store. The public
//    status answer is skipped here and keeps its own short caching.
//  - B3: a state-changing request from a foreign origin, or with no origin and no Authorization header but a cookie, is a clean 403 here,
//    before CORS would turn it into a generic error.
const whileTouristVisaIsOpen = (middleware) => (req, res, next) =>
  touristVisaFeatureGate.isTouristVisaEnabled() ? middleware(req, res, next) : next();
app.use("/api/tourist-visa", whileTouristVisaIsOpen(touristVisaNoStore));
app.use("/api/tourist-visa", whileTouristVisaIsOpen(touristVisaOriginGuard));

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

// Serve static files from uploads directory. Only pictures and PDFs are ever shown in the browser; anything else that
// might be in the folder is sent as a download with a neutral type, so an uploaded .html or .svg can never run as a page.
const INLINE_UPLOAD_TYPES = new Set([".jpg", ".jpeg", ".png", ".gif", ".pdf"]);
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    index: false,
    dotfiles: "deny",
    setHeaders: (res, filePath) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (!INLINE_UPLOAD_TYPES.has(path.extname(filePath).toLowerCase())) {
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", "attachment");
      }
    },
  }),
);

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
