const University = require("../models/University");

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

class UniversityRepository {
  create(data) {
    return University.create(data);
  }
  /** `world` true: only the world-list entries (no requirements); false: the rest. `limit` and `skip` give one page. */
  worldFilter({ world = false, country = "", q = "" } = {}) {
    const filter = { requirementsUnknown: world ? true : { $ne: true } };
    if (country) filter.country = new RegExp(`^${escapeRegex(country)}$`, "i");
    if (q) filter.name = new RegExp(escapeRegex(q), "i");
    return filter;
  }
  findAll({ world = false, country = "", q = "", limit = 0, skip = 0 } = {}) {
    const query = University.find(this.worldFilter({ world, country, q })).sort({ country: 1, name: 1 });
    if (skip > 0) query.skip(skip);
    return limit > 0 ? query.limit(limit) : query;
  }
  count(options) {
    return University.countDocuments(this.worldFilter(options));
  }
  findActive({ includeUnknown = false, country = "", unknownLimit = 300 } = {}) {
    const ready = University.find({ isActive: true, requirementsUnknown: { $ne: true } }).lean();
    if (!includeUnknown) return ready;
    const filter = { isActive: true, requirementsUnknown: true };
    if (country) filter.country = new RegExp(`^${escapeRegex(country)}$`, "i");
    return Promise.all([ready, University.find(filter).sort({ name: 1 }).limit(unknownLimit).lean()]).then(([a, b]) => [...a, ...b]);
  }
  /** [{ _id: country, total, ready }] for every country in the list. */
  countries() {
    return University.aggregate([
      { $group: { _id: "$country", total: { $sum: 1 }, ready: { $sum: { $cond: [{ $eq: ["$requirementsUnknown", true] }, 0, 1] } } } },
      { $sort: { _id: 1 } },
    ]);
  }
  /** Which of these names (with their countries) are already stored. Returns a Set of "name|country" in lower case. */
  async existingKeys(names) {
    const found = await University.find({ name: { $in: names } }, "name country").lean();
    return new Set(found.map((u) => `${u.name}|${u.country}`.toLowerCase()));
  }
  insertMany(rows) {
    return University.insertMany(rows, { ordered: false });
  }
  findById(id) {
    return University.findById(id);
  }
  /** Same name in the same country (letter case ignored). */
  findByNameCountry(name, country) {
    return University.findOne({
      name: new RegExp(`^${escapeRegex(name)}$`, "i"),
      country: new RegExp(`^${escapeRegex(country)}$`, "i"),
    });
  }
  update(id, data) {
    return University.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });
  }
  remove(id) {
    return University.findByIdAndDelete(id);
  }
}

module.exports = new UniversityRepository();
