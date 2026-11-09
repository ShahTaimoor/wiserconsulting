/**
 * Validation Middleware
 * Validates request using Zod schemas
 *
 * The CLEANED body replaces req.body (step 8j-2). Before, the result of schema.parse was thrown away, so the raw body went on to
 * the controller whatever the schema said: a field the schema does not name, a trim or a lower-casing, a number read from text, all
 * the schema's work was lost, and a controller that passed req.body to the database (a profile update, a settings update) accepted
 * any field a caller added. Now what reaches the controller is what the schema allowed, in the form the schema produced.
 * A schema that does not describe a body (only params or a query) leaves req.body as it was.
 */

const validate = (schema) => {
  return (req, res, next) => {
    try {
      const parsed = schema.parse({
        body: req.body,
        params: req.params,
        query: req.query
      });
      if (parsed && parsed.body !== undefined) req.body = parsed.body;
      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = validate;
