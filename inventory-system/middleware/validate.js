const mongoose = require('mongoose');

const httpError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

// Reject malformed :id params before hitting the database
const validateObjectId = (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return next(httpError(400, `Invalid product id: ${req.params.id}`));
  }
  next();
};

// Body for PATCH /:id/stock must be { change: <non-zero integer> }
const validateStockChange = (req, res, next) => {
  const { change } = req.body;
  if (typeof change !== 'number' || !Number.isInteger(change) || change === 0) {
    return next(httpError(400, '"change" must be a non-zero integer (positive = restock, negative = sale)'));
  }
  next();
};

// Require a non-empty JSON body on create/update
const requireBody = (req, res, next) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    return next(httpError(400, 'Request body cannot be empty'));
  }
  next();
};

module.exports = { httpError, validateObjectId, validateStockChange, requireBody };
