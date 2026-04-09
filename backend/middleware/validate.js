/**
 * Validation Middleware
 * Validates request using Zod schemas
 */

const validate = (schema) => {
  return (req, res, next) => {
    try {
      schema.parse({
        body: req.body,
        params: req.params,
        query: req.query
      });
      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = validate;

