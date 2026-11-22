const repository = require("../repositories/universityRepository");
const { matchUniversities } = require("./universityMatching");
const { STARTER_UNIVERSITIES } = require("./universityStarterData");
const { getWorldRows } = require("./worldUniversitySource");
const { AppError } = require("../middleware/errorHandler");

class UniversityService {
  /**
   * `world` true gives one page of the world-list entries as { rows, total } (search by name and country, 50 a page by default);
   * otherwise it gives all the universities that have requirements, as an array.
   */
  async getAll({ world = false, country = "", q = "", page = 1, pageSize = 50 } = {}) {
    const options = { world, country: String(country).trim(), q: String(q).trim().slice(0, 100) };
    if (!world) return repository.findAll(options);
    const size = Math.min(Math.max(1, Number(pageSize) || 50), 100);
    const number = Math.max(1, Number(page) || 1);
    const [rows, total] = await Promise.all([repository.findAll({ ...options, limit: size, skip: (number - 1) * size }), repository.count(options)]);
    return { rows, total };
  }

  async countries() {
    const rows = await repository.countries();
    return rows.map((row) => ({ country: row._id, total: row.total, ready: row.ready }));
  }

  async getById(id) {
    const university = await repository.findById(id);
    if (!university) throw new AppError("University not found", 404);
    return university;
  }

  async create(data) {
    if (await repository.findByNameCountry(data.name, data.country)) {
      throw new AppError("This university is already in the list", 409);
    }
    return repository.create(data);
  }

  async update(id, data) {
    const updated = await repository.update(id, data);
    if (!updated) throw new AppError("University not found", 404);
    return updated;
  }

  async remove(id) {
    const removed = await repository.remove(id);
    if (!removed) throw new AppError("University not found", 404);
  }

  /** Rows from a spreadsheet: a university already in the list (same name and country) is updated, the rest are added. */
  async importRows(rows) {
    let added = 0;
    let updated = 0;
    for (const row of rows) {
      const existing = await repository.findByNameCountry(row.name, row.country);
      if (existing) {
        await repository.update(existing._id, row);
        updated += 1;
      } else {
        await repository.create(row);
        added += 1;
      }
    }
    return { added, updated };
  }

  /** The built-in starter list. Only the ones not already in the list are added; nothing existing is touched. */
  async loadStarter({ offset = 0, limit = 40 } = {}) {
    const total = STARTER_UNIVERSITIES.length;
    const start = Math.min(Math.max(0, Number(offset) || 0), total);
    const end = Math.min(total, start + Math.min(Math.max(1, Number(limit) || 40), 100));
    let added = 0;
    for (const row of STARTER_UNIVERSITIES.slice(start, end)) {
      if (await repository.findByNameCountry(row.name, row.country)) continue;
      await repository.create(row);
      added += 1;
    }
    // The list is loaded a part at a time so the page can show how far it has got.
    return { added, skipped: end - start - added, total, next: end, done: end >= total };
  }

  /** The world list, a part at a time (so the page can show progress). Only the ones not already stored are added. */
  async loadWorld({ offset = 0, limit = 500 } = {}) {
    const rows = await getWorldRows();
    const total = rows.length;
    const start = Math.min(Math.max(0, Number(offset) || 0), total);
    const end = Math.min(total, start + Math.min(Math.max(1, Number(limit) || 500), 1000));
    const part = rows.slice(start, end);
    const have = await repository.existingKeys(part.map((row) => row.name));
    const fresh = part.filter((row) => !have.has(`${row.name}|${row.country}`.toLowerCase()));
    if (fresh.length > 0) await repository.insertMany(fresh);
    return { added: fresh.length, skipped: part.length - fresh.length, total, next: end, done: end >= total };
  }

  async match({ includeNotEligible, includeUnknown, ...student }) {
    const universities = await repository.findActive({ includeUnknown: Boolean(includeUnknown), country: student.country });
    return matchUniversities(universities, student, { includeNotEligible, includeUnknown: Boolean(includeUnknown) });
  }
}

module.exports = new UniversityService();
