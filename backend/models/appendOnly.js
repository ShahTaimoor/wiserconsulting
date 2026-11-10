/**
 * Makes a schema append-only as far as the application can: every way the model has of changing or removing rows is
 * refused (updates, replaces, deletes, saving an existing row, and bulk writes that are not plain inserts).
 *
 * This is the application's own guarantee. Someone with direct access to the database can still change the
 * collection, so retention and database permissions are for the security review (see the handover, section 14.5).
 */

module.exports = function appendOnly(schema, message) {
    const refuse = function refuse() {
        throw new Error(message);
    };
    schema.pre(
        ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'],
        { document: true, query: true },
        refuse
    );
    schema.pre('save', function onSave() {
        if (!this.isNew) throw new Error(message);
    });
    schema.pre('bulkWrite', function onBulkWrite(next, ops) {
        if (Array.isArray(ops) && ops.some((op) => !op || !op.insertOne)) throw new Error(message);
        next();
    });
};
