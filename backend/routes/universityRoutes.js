/**
 * University Finder routes. Admin only: the list, the matching and the import are all part of the admin panel.
 */
const express = require("express");
const router = express.Router();
const controller = require("../controllers/universityController");
const { isAuthorized, isAdmin } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const { universityLimiter } = require("../middleware/rateLimiter");
const { createUniversitySchema, updateUniversitySchema, importUniversitiesSchema, matchSchema } = require("../validations/universityValidation");

router.use(universityLimiter, isAuthorized, isAdmin);

router.get("/", controller.getAll);
router.get("/countries", controller.countries);
router.post("/match", validate(matchSchema), controller.match);
router.post("/import", validate(importUniversitiesSchema), controller.importRows);
router.post("/starter", controller.loadStarter);
router.post("/world-list", controller.loadWorld);
router.post("/", validate(createUniversitySchema), controller.create);
router.put("/:id", validate(updateUniversitySchema), controller.update);
router.delete("/:id", controller.remove);

module.exports = router;
